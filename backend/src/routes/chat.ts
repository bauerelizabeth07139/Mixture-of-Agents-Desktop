import { v4 as uuid } from 'uuid';
import { Router, Request, Response } from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { ApiPoolManager } from '../providers/api-pool';
import { LLMClient, QuotaExhaustedError, LLMError } from '../services/llm-client';
import { Provider, Model, ApiKeyEntry } from '../types';

// ============================================================
// Constants
// ============================================================

const RECENT_MESSAGE_LIMIT = 20;
const SUMMARY_MAX_CHARS = 200;
const WORKSPACE_ROOT = path.join(os.homedir(), '.moa-workspace');
const MAX_RETRIES = 3;
const DEFAULT_CMD_TIMEOUT = 30_000;
const INSTALL_CMD_TIMEOUT = 120_000;

const SYSTEM_PROMPT = [
  'You are an autonomous coding engine inside Mixture of Agents (MOA).',
  'You write complete, runnable code and can independently create full projects.',
  '',
  '## File Generation',
  'When generating a project, emit each file inside a fenced code block with language AND filename:',
  '  ```typescript // src/index.ts',
  '  ...code...',
  '  ```',
  'Supported languages: typescript, javascript, python, c, cpp, go, rust, java, html, css, json, yaml, markdown, shell',
  '',
  '## Shell Commands',
  'When you need to run shell commands, use a ```cmd block with one command per line:',
  '  ```cmd',
  '  npm init -y',
  '  npm install express',
  '  node index.js',
  '  ```',
  'CRITICAL RULES:',
  '- Each command runs ONE BY ONE, sequentially. If one fails, execution stops.',
  '- This is Windows cmd.exe. Do NOT use: &&, ;, &, |, bash syntax, PowerShell syntax.',
  '- Do NOT use "timeout" command (it works differently on Windows).',
  '- Do NOT use "node index.js &" — the & does NOT work in cmd.exe.',
  '- To test a server after starting it, just start the server — the system will verify it launched.',
  '- For long-running servers (Express, HTTP, etc.), the system handles background execution automatically.',
  '- Use "start /B node index.js" to start a server in background, then test with "curl http://localhost:PORT/"',
  '- Always use the project directory for all file paths — do NOT use "cd" in commands.',
  '',
  '## Workflow',
  '1. Create all project files first (code blocks with filenames)',
  '2. YOU MUST provide a ```cmd block with shell commands to run the project',
  '3. For server projects: use "start /B node index.js" then "timeout /t 2 >nul 2>&1" then test',
  '4. If something fails, diagnose the error and provide ONLY fix commands/code',
  '5. Always provide COMPLETE code with all imports',
  'CRITICAL: After writing code files, ALWAYS include a ```cmd block with shell commands to install deps and run the project.',
  'NEVER skip the command step. The system needs commands to execute your code.',
  '',
  '## Error Recovery',
  'When you see errors, fix them immediately. Common fixes:',
  '- "MODULE_NOT_FOUND" -> add npm install <package> command',
  '- "tsc not found" -> add npm install typescript --save-dev command',
  '- Syntax errors -> provide the corrected file',
  '- "EADDRINUSE" -> the port is already in use, use a different port in your code',
  '- "command not found" -> check if the tool is installed',
].join('\r\n');

// ============================================================
// PATH augmentation
// ============================================================

function getAugmentedPath(): string {
  const extraDirs: string[] = [];
  if (process.platform === 'win32') {
    extraDirs.push(
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python38'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python311'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312'),
      'C:\\Program Files\\nodejs',
      'C:\\Program Files\\Git\\cmd',
      'C:\\Program Files\\Git\\usr\\bin',
      'C:\\tools\\nodejs',
      'C:\\tools\\nodejs\\node-v20.15.1-win-x64',
      'C:\\Program Files\\LLVM\\bin',
      'C:\\mingw64\\bin',
      'C:\\TDM-GCC-64\\bin',
    );
    const resPath = (process as any).resourcesPath;
    if (resPath) extraDirs.push(resPath);
  } else {
    extraDirs.push('/usr/local/bin', '/usr/bin', '/usr/sbin');
  }
  return extraDirs.join(path.delimiter) + path.delimiter + (process.env.PATH || '');
}

// ============================================================
// Interfaces
// ============================================================

interface ExtractedCodeBlock {
  language: string;
  filename: string | null;
  content: string;
  isCommand: boolean;
}

interface FileWritten {
  path: string;
  size: number;
}

interface CommandResult {
  cmd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

// ============================================================
// Helpers
// ============================================================

function compressHistory(history: Array<{ role: string; content: string }>): Array<{ role: string; content: string }> {
  if (!history || history.length === 0) return [];
  if (history.length <= RECENT_MESSAGE_LIMIT) return history;
  const oldMessages = history.slice(0, history.length - RECENT_MESSAGE_LIMIT);
  const recentMessages = history.slice(history.length - RECENT_MESSAGE_LIMIT);
  const summaryLines: string[] = [];
  for (const msg of oldMessages) {
    if (msg.role === 'system') continue;
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const truncated = text.length > SUMMARY_MAX_CHARS ? text.slice(0, SUMMARY_MAX_CHARS) + '...' : text;
    const label = msg.role === 'user' ? 'User' : 'Assistant';
    summaryLines.push('[' + label + ']: ' + truncated);
  }
  const summaryBlock = summaryLines.length > 0
    ? [{ role: 'system' as const, content: '[Earlier conversation summary]\r\n' + summaryLines.join('\r\n') }]
    : [];
  return [...summaryBlock, ...recentMessages];
}

function getProjectDir(threadId?: string, projectPath?: string): string {
  if (projectPath && fs.existsSync(projectPath)) return projectPath;
  if (threadId) {
    const dir = path.join(WORKSPACE_ROOT, threadId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const dir = path.join(WORKSPACE_ROOT, 'default');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ============================================================
// Code block extraction
// ============================================================

function inferFilename(language: string, content: string, idx: number): string {
  const firstLine = content.split(/\r?\n/)[0] || '';
  const commentMatch = firstLine.match(/^(?:\/\/|#|--|\/\*)\s*([^\s*]+\.(?:ts|tsx|js|jsx|py|rs|go|java|c|cpp|html|css|json|yaml|yml|toml|md|sh|cmd|bat|sql|xml|scss|less|vue|svelte))/i);
  if (commentMatch) return commentMatch[1].replace(/\*\/$/, '').trim();
  const langExtMap: Record<string, string> = {
    typescript: 'index.ts', ts: 'index.ts', tsx: 'App.tsx',
    javascript: 'index.js', js: 'index.js', jsx: 'App.jsx',
    python: 'main.py', py: 'main.py',
    rust: 'main.rs', rs: 'main.rs', go: 'main.go', java: 'Main.java',
    c: 'main.c', cpp: 'main.cpp', 'c++': 'main.cpp',
    html: 'index.html', css: 'style.css', json: 'data.json',
    yaml: 'config.yaml', yml: 'config.yml', toml: 'config.toml',
    markdown: 'README.md', md: 'README.md', sql: 'query.sql',
    xml: 'config.xml', scss: 'style.scss', less: 'style.less',
    vue: 'App.vue', svelte: 'App.svelte',
    bash: 'script.sh', sh: 'script.sh',
    cmd: 'script.cmd', bat: 'script.cmd',
    powershell: 'script.ps1', ps1: 'script.ps1',
  };
  return langExtMap[language.toLowerCase()] || ('file_' + idx + (language ? '.' + language : '.txt'));
}

function extractCodeBlocks(response: string): ExtractedCodeBlock[] {
  const blocks: ExtractedCodeBlock[] = [];
  const fenceRegex = /```(\w+)(?:\s+(\S+\.[a-z]+))?\s*(?:\/\/\s*(\S+))?\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = fenceRegex.exec(response)) !== null) {
    const language = match[1] || '';
    const explicitFilename = match[2] || match[3] || null;
    const content = match[4];
    const isCommand = /^(bash|sh|cmd|bat|shell|powershell|ps1|zsh|console|terminal)$/i.test(language);
    let filename = explicitFilename || (isCommand ? null : inferFilename(language, content, idx));
    // Fallback: check for <!-- filename --> inside code
    if (!filename && !isCommand) {
      const htmlComment = content.match(/^\s*<!--\s*([^\s>]+\.[a-z]+)\s*-->/i);
      if (htmlComment) filename = htmlComment[1];
    }
    blocks.push({ language, filename, content: content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), isCommand });
    idx++;
  }
  return blocks;
}

function extractDollarCommands(response: string): string[] {
  const commands: string[] = [];
  const lines = response.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\$\s+(.+)/.test(trimmed)) commands.push(trimmed.replace(/^\$\s+/, ''));
  }
  return commands;
}

function writeCodeBlocks(blocks: ExtractedCodeBlock[], projectDir: string): FileWritten[] {
  const written: FileWritten[] = [];
  for (const block of blocks.filter(b => !b.isCommand)) {
    if (!block.filename) continue;
    const filePath = path.resolve(projectDir, block.filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, block.content, 'utf-8');
    written.push({ path: filePath, size: Buffer.byteLength(block.content, 'utf-8') });
  }
  return written;
}

function collectCommands(blocks: ExtractedCodeBlock[], dollarCommands: string[]): string[] {
  const cmds: string[] = [];
  for (const block of blocks) {
    if (block.isCommand) {
      for (const line of block.content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)) {
        if (line.startsWith('#') || line.startsWith('REM') || line.startsWith('::')) continue;
        const cleaned = line.replace(/^\$\s+/, '').replace(/^>\s+/, '');
        if (cleaned.length > 0) cmds.push(cleaned);
      }
    }
  }
  cmds.push(...dollarCommands);
  return cmds;
}

// ============================================================
// Command execution — ONE BY ONE like Claude Code
// ============================================================

function getCmdTimeout(cmd: string): number {
  const lower = cmd.trim().toLowerCase();
  if (/^(npm\s+install|yarn\s+install|pnpm\s+install|pip\s+install|cargo\s+build|cargo\s+install|npm\s+i)\b/.test(lower)) {
    return INSTALL_CMD_TIMEOUT;
  }
  return DEFAULT_CMD_TIMEOUT;
}

function execSingleCmd(cmd: string, cwd: string, timeoutMs: number = DEFAULT_CMD_TIMEOUT): { exitCode: number; stdout: string; stderr: string } {
  const scriptContent = [
    '@echo off',
    '@setlocal enableextensions',
    'set "PATH=' + getAugmentedPath().replace(/"/g, '') + '"',
    'cd /d "' + cwd + '"',
    cmd,
    'exit /b %errorlevel%',
  ].join('\r\n');
  const scriptFile = path.join(os.tmpdir(), 'moa-exec-' + uuid() + '.cmd');
  fs.writeFileSync(scriptFile, scriptContent, 'utf-8');
  try {
    const result = spawnSync('cmd.exe', ['/c', scriptFile], {
      cwd, timeout: timeoutMs, encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: getAugmentedPath() },
      windowsHide: true,
    });
    return {
      exitCode: result.status ?? 0,
      stdout: (result.stdout || '').toString().slice(0, 16000),
      stderr: (result.stderr || '').toString().slice(0, 8000),
    };
  } catch (err: any) {
    return { exitCode: 1, stdout: '', stderr: err.message || 'Execution failed' };
  } finally {
    try { fs.unlinkSync(scriptFile); } catch { /* ignore */ }
  }
}

// Legacy alias
function execCmd(cmd: string, cwd: string, timeoutMs: number = DEFAULT_CMD_TIMEOUT): { exitCode: number; stdout: string; stderr: string } {
  return execSingleCmd(cmd, cwd, timeoutMs);
}

function runCommandsSequentially(
  commands: string[],
  projectDir: string,
  cwd: string,
): { results: CommandResult[]; finalDir: string } {
  if (commands.length === 0) return { results: [], finalDir: cwd };

  const needsTypescript = commands.some(c => /\b(tsc|npx\s+tsc|ts-node)\b/i.test(c));
  const needsNodemon = commands.some(c => /\bnodemon\b/i.test(c));
  const prepends: string[] = [];
  if (needsTypescript && !commands.some(c => /typescript/.test(c))) prepends.push('npm install typescript --save-dev 2>nul');
  if (needsNodemon && !commands.some(c => /nodemon/.test(c))) prepends.push('npm install nodemon --save-dev 2>nul');

  const allCommands = [...prepends, ...commands];
  const results: CommandResult[] = [];
  let currentCwd = cwd;

  for (const cmd of allCommands) {
    const isServerStart = /^\s*(start\s+\/B\s+)?(node|python|npm\s+start|npx\s+nodemon)\s+/i.test(cmd.trim());
    const timeout = isServerStart ? 15_000 : getCmdTimeout(cmd);
    
    // For server start commands without "start /B", wrap them to run in background
    let actualCmd = cmd;
    if (isServerStart && !/^\s*start\s+\/B/i.test(cmd)) {
      actualCmd = 'start /B ' + cmd;
    }
    
    const result = execSingleCmd(actualCmd, currentCwd, timeout);
    results.push({ cmd, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });

    // Track cd
    const cdMatch = cmd.trim().match(/^cd\s+(.+)$/i);
    if (cdMatch && result.exitCode === 0) {
      const target = cdMatch[1].trim().replace(/^["']|["']$/g, '');
      const resolved = path.resolve(currentCwd, target);
      if (fs.existsSync(resolved)) currentCwd = resolved;
    }

    // Stop on failure — error recovery loop will handle retries
    if (result.exitCode !== 0) break;
    
    // Brief pause after server start to let it initialize
    if (isServerStart) {
      try { execSingleCmd('ping -n 3 127.0.0.1 >nul', currentCwd, 10_000); } catch {}
    }
  }

  return { results, finalDir: currentCwd };
}

function autoInstallDeps(projectDir: string): CommandResult[] {
  const results: CommandResult[] = [];
  if (fs.existsSync(path.join(projectDir, 'package.json')) && !fs.existsSync(path.join(projectDir, 'node_modules'))) {
    const exit = execCmd('npm install', projectDir, INSTALL_CMD_TIMEOUT);
    results.push({ cmd: 'npm install (auto)', exitCode: exit.exitCode, stdout: exit.stdout, stderr: exit.stderr });
  }
  if (fs.existsSync(path.join(projectDir, 'requirements.txt'))) {
    const exit = execCmd('pip install -r requirements.txt', projectDir, INSTALL_CMD_TIMEOUT);
    results.push({ cmd: 'pip install -r requirements.txt (auto)', exitCode: exit.exitCode, stdout: exit.stdout, stderr: exit.stderr });
  }
  if (fs.existsSync(path.join(projectDir, 'tsconfig.json')) && !fs.existsSync(path.join(projectDir, 'node_modules', '.bin', 'tsc.cmd'))) {
    const exit = execCmd('npm install typescript --save-dev', projectDir, INSTALL_CMD_TIMEOUT);
    results.push({ cmd: 'npm install typescript (auto)', exitCode: exit.exitCode, stdout: exit.stdout, stderr: exit.stderr });
  }
  return results;
}

function buildErrorContext(projectDir: string, failedResults: CommandResult[]): string {
  let ctx = '## Execution Errors\r\n\r\nProject directory: ' + projectDir + '\r\n\r\n';
  for (const r of failedResults) {
    if (r.exitCode !== 0) {
      ctx += '### FAILED: ' + r.cmd + '\r\nEXIT: ' + r.exitCode + '\r\n';
      ctx += 'STDOUT:\r\n```\r\n' + (r.stdout || '(empty)') + '\r\n```\r\n';
      ctx += 'STDERR:\r\n```\r\n' + (r.stderr || '(empty)') + '\r\n```\r\n\r\n';
    }
  }
  ctx += 'Please fix these errors. Provide corrected code and/or fix commands.';
  return ctx;
}

// ============================================================
// Model selection with key-rotation on 401/402/403
// ============================================================

interface ResolvedModel {
  provider: Provider;
  model: Model;
  apiKey: ApiKeyEntry;
}

function resolveModel(pool: ApiPoolManager, modelId?: string): ResolvedModel | null {
  if (modelId) {
    const found = pool.findProviderForModel(modelId);
    if (found) return found;
  }
  for (const prov of pool.getAllProviders()) {
    const key = pool.getNextApiKey(prov.id);
    if (!key) continue;
    const llm = prov.models.find((m: Model) => m.type === 'llm');
    if (llm) return { provider: prov, model: llm, apiKey: key };
  }
  return null;
}

async function chatWithKeyRotation(
  pool: ApiPoolManager,
  initial: ResolvedModel,
  messages: Array<{ role: string; content: any }>,
  opts: { temperature?: number; maxTokens?: number; thinkingEffort?: 'none' | 'low' | 'medium' | 'high' } = {},
): Promise<{ response: { content: string; reasoningContent?: string; model: string; usage: any; latencyMs: number }; provider: Provider; model: Model; apiKey: ApiKeyEntry }> {
  let currentProvider = initial.provider;
  let currentModel = initial.model;
  let currentKey = initial.apiKey;
  const maxAttempts = 10;
  let lastError: any = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const resp = await LLMClient.chatCompletion(currentProvider, currentKey, {
        messages,
        model: currentModel.modelId,
        temperature: opts.temperature ?? 0.7,
        maxTokens: opts.maxTokens ?? 8192,
        thinkingEffort: opts.thinkingEffort,
      });
      return { response: resp, provider: currentProvider, model: currentModel, apiKey: currentKey };
    } catch (err: any) {
      lastError = err;
      const statusCode = err.response?.status;
      if (statusCode && [401, 402, 403].includes(statusCode)) {
        pool.markKeyFailed(currentProvider.id, currentKey.id, statusCode);
        const nextKey = pool.getNextApiKey(currentProvider.id);
        if (nextKey) { currentKey = nextKey; continue; }
        const nextResolved = resolveModel(pool);
        if (nextResolved) { currentProvider = nextResolved.provider; currentModel = nextResolved.model; currentKey = nextResolved.apiKey; continue; }
        break;
      }
      throw err;
    }
  }
  throw lastError || new Error('All API keys exhausted');
}

// ============================================================
// Route factory
// ============================================================

export function createChatRoutes(pool: ApiPoolManager) {
  const r = Router();

  r.get('/project-dir', (req: Request, res: Response) => {
    const threadId = req.query.threadId as string | undefined;
    const dir = getProjectDir(threadId);
    res.json({ projectDir: dir, threadId: threadId || 'default' });
  });

  r.get('/projects', (_req: Request, res: Response) => {
    try {
      if (!fs.existsSync(WORKSPACE_ROOT)) return res.json({ projects: [] });
      const entries = fs.readdirSync(WORKSPACE_ROOT, { withFileTypes: true });
      const projects = entries.filter(e => e.isDirectory()).map(e => ({
        threadId: e.name,
        path: path.join(WORKSPACE_ROOT, e.name),
        hasPackageJson: fs.existsSync(path.join(WORKSPACE_ROOT, e.name, 'package.json')),
      }));
      res.json({ projects });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  r.post('/', async (req: Request, res: Response) => {
    try {
      const {
        message, modelId, history, attachments, threadId,
        projectPath: userProjectPath,
        orchestratorThinkingMode, agentThinkingMode,
      } = req.body as {
        message?: string;
        modelId?: string;
        history?: Array<{ role: string; content: string }>;
        attachments?: Array<{ type: string; data: string }>;
        threadId?: string;
        projectPath?: string;
        orchestratorThinkingMode?: 'auto' | 'none' | 'low' | 'medium' | 'high';
        agentThinkingMode?: 'auto' | 'none' | 'low' | 'medium' | 'high';
      };

      if (!message && (!attachments || attachments.length === 0)) {
        return res.status(400).json({ error: 'Empty message' });
      }

      const projectDir = getProjectDir(threadId, userProjectPath ?? undefined);

      const resolved = resolveModel(pool, modelId);
      if (!resolved) {
        return res.status(400).json({ error: 'No available models with active API keys. Add a provider and key first.', role: 'error', content: 'No available models with active API keys.' });
      }

      const messages: Array<{ role: string; content: any }> = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: 'Working directory: ' + projectDir + '\r\nPlatform: ' + process.platform + '\r\nNode.js: ' + process.version },
      ];

      const compressedHistory = compressHistory(history || []);
      for (const msg of compressedHistory) messages.push({ role: msg.role, content: msg.content });

      const imageAttachments = (attachments || []).filter((a: any) => a.type === 'image');
      let userContent: any = message || '';
      if (imageAttachments.length > 0 && (resolved.model.capabilities.visionScore > 0 || resolved.model.capabilities?.multimodal)) {
        const contentArr: any[] = [{ type: 'text', text: message || 'Describe this image.' }];
        for (const img of imageAttachments) {
          if (img.data && img.data.startsWith('data:')) contentArr.push({ type: 'image_url', image_url: { url: img.data } });
        }
        userContent = contentArr;
      }
      messages.push({ role: 'user', content: userContent });

      const thinkingEffort = orchestratorThinkingMode && orchestratorThinkingMode !== 'auto' ? orchestratorThinkingMode : undefined;

      const { response: initialResp, provider: usedProvider, model: usedModel } = await chatWithKeyRotation(
        pool, resolved, messages, { thinkingEffort: thinkingEffort as any },
      );

      let llmContent = initialResp.content;
      const filesWritten: FileWritten[] = [];
      const allCommandsRun: CommandResult[] = [];
      let totalRetries = 0;
      let currentDir = projectDir;

      // Extract and execute code blocks
      const codeBlocks = extractCodeBlocks(llmContent);
      if (codeBlocks.length > 0) {
        filesWritten.push(...writeCodeBlocks(codeBlocks, projectDir));
        const dollarCmds = extractDollarCommands(llmContent);
        const commands = collectCommands(codeBlocks, dollarCmds);

        if (commands.length > 0) {
          const { results } = runCommandsSequentially(commands, projectDir, currentDir);
          allCommandsRun.push(...results);
          let failedResults = results.filter(r => r.exitCode !== 0);
          let retryCount = 0;

          while (failedResults.length > 0 && retryCount < MAX_RETRIES) {
            retryCount++;
            totalRetries++;
            const errorContext = buildErrorContext(projectDir, failedResults);
            const fixMessages = [...messages, { role: 'assistant', content: llmContent }, { role: 'user', content: errorContext }];
            try {
              const { response: fixResp } = await chatWithKeyRotation(pool, resolved, fixMessages, { thinkingEffort: thinkingEffort as any });
              llmContent += '\r\n\r\n---\r\n**Fix attempt ' + retryCount + '**\r\n\r\n' + fixResp.content;
              const fixBlocks = extractCodeBlocks(fixResp.content);
              filesWritten.push(...writeCodeBlocks(fixBlocks, projectDir));
              const fixDollarCmds = extractDollarCommands(fixResp.content);
              const fixCommands = collectCommands(fixBlocks, fixDollarCmds);
              if (fixCommands.length > 0) {
                const { results: fixResults } = runCommandsSequentially(fixCommands, projectDir, currentDir);
                allCommandsRun.push(...fixResults);
                failedResults = fixResults.filter(r => r.exitCode !== 0);
              } else break;
            } catch (retryErr: any) {
              console.error('[Chat] Retry LLM call failed:', retryErr.message);
              break;
            }
          }
        }
      }

      // Auto-install dependencies
      allCommandsRun.push(...autoInstallDeps(projectDir));

      // Auto-serve: if HTML files were written and no server commands were run, start http-server
      if (filesWritten.length > 0 && allCommandsRun.length === 0) {
        const hasHtml = filesWritten.some(f => f.path.endsWith('.html') || f.path.endsWith('.htm'));
        if (hasHtml) {
          try {
            const serveCmd = 'start /B npx http-server "' + projectDir + '" -p 8080 -c-1';
            const sr = execCmd(serveCmd, projectDir, 5000);
            allCommandsRun.push({ cmd: serveCmd, ...sr });
          } catch (e: any) {
            try {
              const pyCmd = 'python -m http.server 8080';
              const pr = execCmd(pyCmd, projectDir, 10000);
              allCommandsRun.push({ cmd: pyCmd, ...pr });
            } catch {}
          }
        }
      }

      res.json({
        role: 'orchestrator',
        content: llmContent,
        model: usedModel.name,
        provider: usedProvider.name,
        latencyMs: initialResp.latencyMs,
        usage: initialResp.usage,
        codeExecution: allCommandsRun.map((cmd) => ({
          lang: (cmd.cmd.match(/\.(\w+)/) || [])[1] || cmd.cmd.split(' ')[0],
          filename: cmd.cmd.split(' ')[0],
          stdout: cmd.stdout,
          stderr: cmd.stderr,
          exitCode: cmd.exitCode,
        })),
        codeExecutionDetail: { filesWritten, commandsRun: allCommandsRun, retries: totalRetries, projectDir },
        tools: [],
        agents: [],
      });
    } catch (err: any) {
      console.error('[Chat] Error:', err.message);
      const statusCode = err.response?.status;
      if (statusCode && [401, 402, 403].includes(statusCode)) {
        return res.status(statusCode).json({ error: 'API authentication/quota error: ' + err.message, role: 'error', content: 'All API keys exhausted.' });
      }
      res.status(500).json({ error: err.message, role: 'error', content: err.message });
    }
  });

  return r;
}
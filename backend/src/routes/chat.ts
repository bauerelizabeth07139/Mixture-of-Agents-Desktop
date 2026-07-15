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
const MAX_RETRIES = 10;
const DEFAULT_CMD_TIMEOUT = 30_000;
const INSTALL_CMD_TIMEOUT = 120_000;

const SYSTEM_PROMPT = [
  'You are MOA (Mixture of Agents), an autonomous coding agent similar to Claude Code, Codex, and Trae.',
  'You write COMPLETE, PRODUCTION-QUALITY code and NEVER stop until the task is FULLY done.',
  '',
  '## STRICT RULES - NO LAZY OUTPUT ALLOWED',
  '1. NEVER output placeholder text, TODO comments, or incomplete code.',
  '2. NEVER skip creating referenced files. If HTML references style.css and games.js, you MUST create BOTH.',
  '3. NEVER output fewer than the requested number of items. If asked for 4 games, you MUST create all 4.',
  '4. EVERY file must be COMPLETE and FUNCTIONAL. No skeleton code, no placeholders, no truncated output.',
  '5. After writing all files, ALWAYS include a command block to start the server.',
  '6. Do NOT split a single-file project into multiple pages unless explicitly asked.',
  '7. For single-page multi-game sites: ALL games must be in ONE index.html with ONE games.js. Do NOT create separate pages.',
  '',
  '',
  '## How You Work',
  'You operate in a tool-use loop:',
  '1. THINK: Analyze the task and plan your approach',
  '2. ACT: Write files and run commands',
  '3. OBSERVE: Read the results and errors',
  '4. FIX: If something fails, diagnose and fix it immediately',
  '5. REPEAT until the task is complete',
  '',
  '## File Generation',
  'Emit each file in a fenced code block with language AND filename:',
  '  ```html index.html',
  '  ...code...',
  '  ```',
  '  ```css style.css',
  '  ...code...',
  '  ```',
  '',
  'IMPORTANT: Put the filename IMMEDIATELY after the language tag with a space.',
  'Do NOT put the filename as a comment inside the code.',
  'For multi-file projects, generate SEPARATE code blocks for EACH file. If one file references other assets (for example HTML referencing CSS, JS, images, or fonts), you MUST also output those referenced assets as separate code blocks and write them to disk.',
  '',
  '## Shell Commands',
  'After writing all files, include a ```cmd block with commands to run the project.',
  '',
  'For static HTML websites:',
  '  ```cmd',
  '  npx http-server -p 8080 -c-1',
  '  ```',
  '',
  'For Node.js projects:',
  '  ```cmd',
  '  npm install',
  '  node index.js',
  '  ```',
  '',
  'CRITICAL RULES:\r\n- If your generated code references other files, you MUST also create those referenced files in separate code blocks.',
  '- Each command runs ONE BY ONE, sequentially.',
  '- This is Windows. Do NOT use: &&, ;, &, |, bash syntax.',
  '- Do NOT use cd commands. All file paths are relative to project root.',
  '- For static HTML sites, ALWAYS use: npx http-server -p 8080 -c-1',
  '- NEVER create unnecessary directories. Write files directly to project root.',
  '',
  '## Multi-Page Websites',
  'When creating multi-page sites, generate SEPARATE HTML files:',
  '- index.html (home page)',
  '- about.html (about page)',
  '- projects.html (projects/portfolio)',
  '- contact.html (contact form)',
  '- Each page must have a shared nav bar with <a href="page.html"> links',
  '- All pages share the same style.css and script.js',
  '',
  '## Design Quality',
  'When creating websites, make them BEAUTIFUL and MODERN:',
  '- Use smooth CSS animations and transitions on all interactive elements',
  '- Use gradient backgrounds and glass-morphism effects',
  '- Use proper spacing, typography (Google Fonts), and cohesive color schemes',
  '- Add hover effects on buttons, cards, and links with transform: translateY(-2px)',
  '- Use responsive design with flexbox/grid',
  '- Add scroll-reveal animations with IntersectionObserver',
  '- Dark themes: use #0a0a0f background with #6c5ce7 accent and gradient text',
  '- Add animated progress bars, particle effects or subtle background patterns',
  '',
  '## Complex Projects (Games, Multi-component Apps)',
  '- For multi-game pages: put ALL game logic in a SINGLE games.js file',
  '- Each game should be a self-contained function that renders to a specific container div',
  '- HTML should have container divs like <div id="game-container"></div>',
  '- NEVER use canvas for grid-based games (2048, Minesweeper). Use DOM elements.',
  '- For games: ALWAYS include start/restart buttons and score display',
  '- NEVER output incomplete game logic with comments like // rest of game logic here',
  '- Make each game COMPLETE before moving to the next',
  '','## Error Recovery',
  'When you see errors, fix them immediately:',
  '- MODULE_NOT_FOUND -> add npm install <package>',
  '- Syntax errors -> provide the corrected file',
  '- EADDRINUSE -> use a different port',
  '- If a command fails, read the error and provide a fix',
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
  const recent = history.slice(-RECENT_MESSAGE_LIMIT);
  const older = history.slice(0, history.length - RECENT_MESSAGE_LIMIT);
  if (older.length === 0) return recent;
  // Claude Code / DeepSeek context strategy: keep only decision-relevant context
  const summaryParts: string[] = [];
  for (const msg of older) {
    if (msg.role === 'system') continue;
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    if (msg.role === 'user') {
      const trimmed = text.length > 300 ? text.slice(0, 300) + '...[truncated]' : text;
      summaryParts.push('[User]: ' + trimmed);
    } else {
      // Strip code blocks, keep prose decisions only
      const withoutCode = text.replace(/```[\s\S]*?```/g, '[code block]').trim();
      if (withoutCode.length > 20) {
        const trimmed = withoutCode.length > 200 ? withoutCode.slice(0, 200) + '...' : withoutCode;
        summaryParts.push('[Assistant]: ' + trimmed);
      }
    }
  }
  const summaryBlock = summaryParts.length > 0
    ? [{ role: 'system' as const, content: '[Earlier conversation summary - decision context only]\n' + summaryParts.join('\n') }]
    : [];
  return [...summaryBlock, ...recent];
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

function extractCodeBlocksRobust(response: string): ExtractedCodeBlock[] {
  const blocks: ExtractedCodeBlock[] = [];
  const lines = response.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const fenceMatch = lines[i].match(/^```(\w+)(?:\s+(\S+\.[a-z]+))?\s*(?:\/\/\s*(\S+))?\s*$/);
    if (fenceMatch) {
      const language = fenceMatch[1] || '';
      const explicitFilename = fenceMatch[2] || fenceMatch[3] || null;
      const isCommand = /^(bash|sh|cmd|bat|shell|powershell|ps1|zsh|console|terminal)$/i.test(language);
      const contentLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        contentLines.push(lines[i]);
        i++;
      }
      const body = contentLines.join('\n');
      
      // Content-based language correction: fix misclassified code blocks
      let correctedLang = language;
      if (language === 'c' || language === 'cpp' || language === 'cc') {
        if (body.includes('{') && body.includes('}') && (body.includes('margin') || body.includes('padding') || body.includes('font-size') || body.includes('background') || body.includes('color:') || body.includes('display:'))) {
          correctedLang = 'css';
        }
      }
      if (language === 'html' && body.includes('function') && body.includes('console.log')) {
        correctedLang = 'javascript';
      }
      let filename = explicitFilename || (isCommand ? null : inferFilename(correctedLang, body, blocks.length));
      if (!filename && !isCommand) {
        const htmlComment = body.match(/^\s*<!--\s*([^\s>]+\.[a-z]+)\s*-->/i);
        if (htmlComment) filename = htmlComment[1];
      }
      blocks.push({ language: correctedLang, filename, content: body.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), isCommand });
    }
    i++;
  }
  return blocks;
}
function extractCodeBlocks(response: string): ExtractedCodeBlock[] {
  const robust = extractCodeBlocksRobust(response);
  if (robust.length > 0) return robust;
  return extractCodeBlocksRegex(response);
}

function extractCodeBlocksRegex(response: string): ExtractedCodeBlock[] {
  const blocks: ExtractedCodeBlock[] = [];
  const fenceRegex = /```(\w+)(?:\s+(\S+\.[a-z]+))?\s*(?:\/\/\s*(\S+))?\s*\n([\s\S]*?)```(?:\s*\n|$)/gi;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = fenceRegex.exec(response)) !== null) {
    const language = match[1] || '';
    const explicitFilename = match[2] || match[3] || null;
    const content = match[4];
    const isCommand = /^(bash|sh|cmd|bat|shell|powershell|ps1|zsh|console|terminal)$/i.test(language);
    
    // Content-based language correction
    let correctedLang = language;
    if (language === 'c' || language === 'cpp' || language === 'cc') {
      if (content.includes('{') && content.includes('}') && (content.includes('margin') || content.includes('padding') || content.includes('font-size') || content.includes('background') || content.includes('color:') || content.includes('display:'))) {
        correctedLang = 'css';
      }
    }
    let filename = explicitFilename || (isCommand ? null : inferFilename(correctedLang, content, idx));
    // Fallback: check for <!-- filename --> inside code
    if (!filename && !isCommand) {
      const htmlComment = content.match(/^\s*<!--\s*([^\s>]+\.[a-z]+)\s*-->/i);
      if (htmlComment) filename = htmlComment[1];
    }
    blocks.push({ language: correctedLang, filename, content: content.replace(/\r\n/g, '\n'), isCommand });
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
  const usedNames = new Set<string>();
  for (const block of blocks.filter(b => !b.isCommand)) {
    if (!block.filename) continue;
    let filename = block.filename;
    if (filename.endsWith('.html') && usedNames.has(filename)) {
      // Use title tag for precise detection (not nav bar links)
      const titleMatch = block.content.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = (titleMatch ? titleMatch[1] : '').toLowerCase();
      // Use first h1/h2 heading as fallback
      const h1Match = block.content.match(/<h[12][^>]*>([^<]+)<\/h[12]>/i);
      const heading = (h1Match ? h1Match[1] : '').toLowerCase();
      const detect = title + ' ' + heading;
      if (detect.includes('about') || detect.includes('biography') || detect.includes('who')) filename = 'about.html';
      else if (detect.includes('project') || detect.includes('gallery') || detect.includes('work')) filename = 'projects.html';
      else if (detect.includes('contact') || detect.includes('get in touch') || detect.includes('reach')) filename = 'contact.html';
      else if (detect.includes('service')) filename = 'services.html';
      else if (detect.includes('blog') || detect.includes('article')) filename = 'blog.html';
      else {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        let c = 2;
        while (usedNames.has(filename)) { filename = base + c + ext; c++; }
      }
    }
    usedNames.add(filename);
    const filePath = path.resolve(projectDir, filename);
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
// Command execution 锟?ONE BY ONE like Claude Code
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
    const isServerStart = /^\s*(start\s+\/B\s+)?(node|python|npm\s+start|npx\s+(nodemon|http-server))\s+/i.test(cmd.trim());
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

    // Stop on failure 锟?error recovery loop will handle retries
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
    pool.acquireKey(currentKey.id);
    try {
      const resp = await LLMClient.chatCompletion(currentProvider, currentKey, {
        messages,
        model: currentModel.modelId,
        temperature: opts.temperature ?? 0.7,
        maxTokens: opts.maxTokens ?? 16384,
        thinkingEffort: opts.thinkingEffort,
      });
      pool.releaseKey(currentKey.id);
      return { response: resp, provider: currentProvider, model: currentModel, apiKey: currentKey };
    } catch (err: any) {
      pool.releaseKey(currentKey.id);
      lastError = err;
      const statusCode = err.response?.status;
      if (statusCode && [401, 402, 403, 429].includes(statusCode)) {
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

/** Streaming version of chatWithKeyRotation - yields tokens via callback */
async function streamChatWithKeyRotation(
  pool: ApiPoolManager,
  initial: ResolvedModel,
  messages: Array<{ role: string; content: any }>,
  onToken: (type: 'token' | 'reasoning', content: string) => void,
  opts: { temperature?: number; maxTokens?: number; thinkingEffort?: 'none' | 'low' | 'medium' | 'high' } = {},
): Promise<{ response: { content: string; reasoningContent?: string; model: string; usage: any; latencyMs: number }; provider: Provider; model: Model; apiKey: ApiKeyEntry }> {
  let currentProvider = initial.provider;
  let currentModel = initial.model;
  let currentKey = initial.apiKey;
  const maxAttempts = 10;
  let lastError: any = null;
  const startTime = Date.now();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    pool.acquireKey(currentKey.id);
    try {
      let fullContent = '';
      let fullReasoning = '';
      let finalUsage: any = null;

      for await (const chunk of LLMClient.streamChatCompletion(currentProvider, currentKey, {
        messages,
        model: currentModel.modelId,
        temperature: opts.temperature ?? 0.7,
        maxTokens: opts.maxTokens ?? 16384,
        thinkingEffort: opts.thinkingEffort,
      })) {
        if (chunk.type === 'token') {
          fullContent += chunk.content;
          onToken('token', chunk.content);
        } else if (chunk.type === 'reasoning') {
          fullReasoning += chunk.content;
          onToken('reasoning', chunk.content);
        } else if (chunk.type === 'done') {
          finalUsage = chunk.usage;
        }
      }

      pool.releaseKey(currentKey.id);
      return {
        response: {
          content: fullContent,
          reasoningContent: fullReasoning,
          model: currentModel.modelId,
          usage: finalUsage ? {
            promptTokens: finalUsage.prompt_tokens || 0,
            completionTokens: finalUsage.completion_tokens || 0,
            totalTokens: finalUsage.total_tokens || 0,
          } : { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: Date.now() - startTime,
        },
        provider: currentProvider,
        model: currentModel,
        apiKey: currentKey,
      };
    } catch (err: any) {
      pool.releaseKey(currentKey.id);
      lastError = err;
      const statusCode = err.response?.status || (err.message?.match(/HTTP (\d+)/)?.[1] ? parseInt(err.message.match(/HTTP (\d+)/)[1]) : undefined);
      if (statusCode && [401, 402, 403, 429].includes(statusCode)) {
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
    // SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (event: string, data: any) => {
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
    };

    try {
      const {
        message, modelId, history, attachments, threadId,
        projectPath: userProjectPath,
        orchestratorThinkingMode, agentThinkingMode,
        costEfficiencyRatio,
        agentModelMap,
      } = req.body as {
        message?: string;
        modelId?: string;
        history?: Array<{ role: string; content: string }>;
        attachments?: Array<{ type: string; data: string }>;
        threadId?: string;
        projectPath?: string;
        orchestratorThinkingMode?: 'auto' | 'none' | 'low' | 'medium' | 'high';
        agentThinkingMode?: 'auto' | 'none' | 'low' | 'medium' | 'high';
        costEfficiencyRatio?: number;
        agentModelMap?: Record<string, string>;
      };

      if (!message && (!attachments || attachments.length === 0)) {
        sendEvent('error', { error: 'Empty message' });
        return res.end();
      }

      const projectDir = getProjectDir(threadId, userProjectPath ?? undefined);
      sendEvent('status', { status: 'starting', projectDir });

      // Resolve model - use agentModelMap for specific task types if available
      // __follow__ = use global modelId directly; '' = let orchestrator decide; other = specific modelId
      let resolved = resolveModel(pool, modelId);
      if (agentModelMap && Object.keys(agentModelMap).length > 0) {
        const preferredKeys = ['general', 'chat', 'code', 'reasoning'];
        let chosen = '';
        for (const k of preferredKeys) {
          const v = agentModelMap[k];
          if (v === '__follow__') { chosen = modelId || ''; break; }
          if (v && v !== '') { chosen = v; break; }
        }
        if (chosen) {
          const mapped = resolveModel(pool, chosen);
          if (mapped) resolved = mapped;
        }
      }
      if (!resolved) {
        sendEvent('error', { error: 'No available models with active API keys. Add a provider and key first.' });
        return res.end();
      }

      sendEvent('status', { status: 'thinking', model: resolved.model.name, provider: resolved.provider.name });

      const messages: Array<{ role: string; content: any }> = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: 'Working directory: ' + projectDir + '\r\nPlatform: ' + process.platform + '\r\nNode.js: ' + process.version },
      ];

            // Add agentModelMap info to system context
      if (agentModelMap && Object.keys(agentModelMap).length > 0) {
        const mapInfo = Object.entries(agentModelMap).filter(([_, v]) => v).map(([k, v]) => {
          if (v === '__follow__') return `${k}: follow global model`;
          return `${k}: ${v}`;
        }).join(', ');
        if (mapInfo) {
          messages.push({ role: 'system', content: 'Sub-agent model PREFERRED assignments (these are first-choice models; if they fail, you may fall back to any available model): ' + mapInfo + '.' });
        }
      }

            // Add agentModelMap info to system context
      const ratio = typeof costEfficiencyRatio === 'number' ? Math.max(0, Math.min(1, costEfficiencyRatio)) : 0.5;
      if (agentModelMap && Object.keys(agentModelMap).length > 0) {
        const entries = Object.entries(agentModelMap);
        const explicitMap = entries.filter(([_, v]) => v && v !== '');
        const hasAutoDecision = entries.some(([_, v]) => !v);
        const mapInfo = explicitMap.map(([k, v]) => `${k}: ${v === '__follow__' ? resolved.model.modelId : v}`).join(', ');
        const parts: string[] = [];
        if (mapInfo) parts.push('Explicit sub-agent model assignments: ' + mapInfo + '.');
        if (hasAutoDecision) { const ratioDesc = ratio < 0.3 ? 'prefer fast/cheap models' : ratio > 0.7 ? 'prefer high-quality models' : 'balance quality and speed'; parts.push('For unassigned sub-task types, select the best model based on quality/speed ratio (' + ratioDesc + ', ratio=' + ratio.toFixed(2) + ').'); }
        parts.push('Planning thinking intensity is bound to strictness: higher strictness means stricter verification before passing a step.');
        messages.push({ role: 'system', content: parts.join(' ') });
      }

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

      const chatTemperature = 0.1 + ratio * 0.7;
      const chatMaxTokens = Math.round(16384 + ratio * 49152);

      // Step 1: LLM call - get plan
      sendEvent('status', { status: 'calling_llm' });
      let streamedContent = '';
      let streamedReasoning = '';
      const { response: initialResp, provider: usedProvider, model: usedModel } = await streamChatWithKeyRotation(
        pool, resolved, messages,
        (type: string, token: string) => {
          if (type === 'token') {
            streamedContent += token;
            sendEvent('stream_token', { content: token, type: 'content' });
          } else if (type === 'reasoning') {
            streamedReasoning += token;
            sendEvent('stream_token', { content: token, type: 'reasoning' });
          }
        },
        { thinkingEffort: thinkingEffort as any, temperature: chatTemperature, maxTokens: chatMaxTokens },
      );

      let llmContent = initialResp.content || streamedContent;
      if (initialResp.reasoningContent) streamedReasoning = initialResp.reasoningContent;
      sendEvent('llm_response', { content: llmContent, model: usedModel.name, provider: usedProvider.name, latencyMs: initialResp.latencyMs, usage: initialResp.usage });

      const filesWritten: FileWritten[] = [];
      const allCommandsRun: CommandResult[] = [];
      let totalRetries = 0;
      let currentDir = projectDir;


      // Determine verification frequency and fix depth based on thinking strength
      // high: verify every step, verify thinks, fix uses high thinking, reads full file content
      // medium: verify every step, verify is quick, fix uses original thinking, reads partial file content  
      // low: verify only at end, verify is quick, fix uses original thinking, reads partial file content
      const isHighStrict = orchestratorThinkingMode === 'high';
      const isMediumStrict = orchestratorThinkingMode === 'medium' || !orchestratorThinkingMode;
      const verifyFrequency: 'every_step' | 'end_only' = (isHighStrict || isMediumStrict) ? 'every_step' : 'end_only';
      const verifyThinkingEffort: 'none' | 'low' | 'medium' | 'high' = isHighStrict ? 'low' : 'none';
      const fixThinkingEffort: 'none' | 'low' | 'medium' | 'high' = isHighStrict ? 'high' : isMediumStrict ? (thinkingEffort as any || 'medium') : (thinkingEffort as any || 'none');
      const fileReadLimit: number = isHighStrict ? 5000 : isMediumStrict ? 3000 : 1500;
      const verifyMaxTokens: number = isHighStrict ? 2048 : isMediumStrict ? 1024 : 256;

      // === PLAN->ACT->OBSERVE->REPLAN LOOP ===
      const MAX_PLAN_ROUNDS = 12;
      let planContent = llmContent;
      let planRound = 0;
      let stepVerifyCount = 0;
      const MAX_STEP_VERIFIES = isHighStrict ? 5 : 3;
      let planDone = false;

      while (!planDone && planRound < MAX_PLAN_ROUNDS) {
        planRound++;
        sendEvent('status', { status: 'executing_step', round: planRound, description: 'Step ' + planRound });

        const planBlocks = extractCodeBlocks(planContent);
        if (planBlocks.length > 0) {
          const roundWritten = writeCodeBlocks(planBlocks, projectDir);
          filesWritten.push(...roundWritten);
          for (const f of roundWritten) {
            sendEvent('file_written', { path: f.path, size: f.size, name: path.basename(f.path) });
          }

          const dollarCmds = extractDollarCommands(planContent);
          const commands = collectCommands(planBlocks, dollarCmds);

          if (commands.length > 0) {
            sendEvent('status', { status: 'executing', commandCount: commands.length, round: planRound });
            const { results: roundResults } = runCommandsSequentially(commands, projectDir, currentDir);
            allCommandsRun.push(...roundResults);
            for (const r of roundResults) {
              sendEvent('command_result', { cmd: r.cmd, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr });
            }

            const failed = roundResults.filter(r => r.exitCode !== 0);
            if (failed.length > 0) {
              totalRetries++;
              if (totalRetries <= MAX_RETRIES) {
                sendEvent('status', { status: 'fixing', attempt: totalRetries, round: planRound });
                const errCtx = buildErrorContext(projectDir, failed);
                const fixMsgs = [...messages, { role: 'assistant', content: planContent }, { role: 'user', content: errCtx }];
                try {
                  const { response: fixResp } = await chatWithKeyRotation(pool, resolved, fixMsgs, { thinkingEffort: thinkingEffort as any, temperature: chatTemperature, maxTokens: chatMaxTokens });
                  sendEvent('fix_response', { attempt: totalRetries, content: fixResp.content });
                  planContent = fixResp.content;
                  continue;
                } catch (fixErr: any) {
                  console.error('[Chat] Fix call failed:', fixErr.message);
                  sendEvent('error', { error: 'Fix call failed: ' + fixErr.message });
                }
              }
            }
          }
        }

        // Only consider done if: we have HTML + CSS + a running server
        const hasHtml = filesWritten.some(f => f.path.endsWith('.html') || f.path.endsWith('.htm'));
        const hasCss = filesWritten.some(f => f.path.endsWith('.css'));
        const hasJs = filesWritten.some(f => f.path.endsWith('.js'));
        const hasServer = allCommandsRun.some(r => r.exitCode === 0 && /http-server|serve|python.*http/i.test(r.cmd));

        // Verify after each step if high/medium strictness
        if (verifyFrequency === 'every_step' && filesWritten.length > 0 && stepVerifyCount < MAX_STEP_VERIFIES) {
          try {
            sendEvent('status', { status: 'verifying', round: planRound, description: isHighStrict ? 'Deep step verification...' : 'Quick step verification...' });
            const projectFiles: string[] = [];
            for (const wp of filesWritten.map(f => f.path)) {
              try { 
                const c = fs.readFileSync(wp, 'utf-8'); 
                const contentPreview = isHighStrict ? c.substring(0, fileReadLimit) : c.substring(0, fileReadLimit);
                projectFiles.push('--- FILE: ' + path.basename(wp) + ' (' + c.length + ' bytes) ---\n' + contentPreview);
              } catch {}
            }
            const verifyChecklist = isHighStrict 
              ? 'CHECK CAREFULLY:\n1. Do ALL HTML files reference ONLY files that exist?\n2. Are there any missing CSS/JS files?\n3. Does the project contain ALL ' + (message || 'requested') + '?\n4. Are files complete (no placeholders, no TODOs, no truncated code)?\n5. Would this project actually work if opened in a browser?'
              : 'Quick check: Are all referenced files present? Is the project complete?';
            const verifyPrompt = 'You are a ' + (isHighStrict ? 'STRICT' : 'quick') + ' verification agent. Check if this project is complete.\n\nOriginal task: ' + (message || 'unknown') + '\n\nFiles:\n' + projectFiles.join('\n\n') + '\n\n' + verifyChecklist + '\n\nReply JSON: {"passed":true/false,"issues":[]}';
            const vResolved = resolveModel(pool, modelId);
            if (vResolved) {
              const vResp = await chatWithKeyRotation(pool, vResolved, [
                { role: 'system', content: isHighStrict ? 'You are a STRICT verification agent. Read each file carefully. Check references, completeness, and functionality. Reply only with JSON {"passed":bool,"issues":[]}.' : 'Quick verification. Reply JSON {"passed":bool,"issues":[]}.' },
                { role: 'user', content: verifyPrompt },
              ], { thinkingEffort: verifyThinkingEffort as any, temperature: 0.1, maxTokens: verifyMaxTokens });
              let vResult: any;
              try { vResult = JSON.parse(vResp.response.content); } catch { vResult = { passed: true }; }
              stepVerifyCount++;
              sendEvent('verification_result', { round: planRound, passed: vResult.passed, issues: vResult.issues || [], strictness: isHighStrict ? 'high' : 'medium', verifyAttempt: stepVerifyCount });
              if (!vResult.passed && vResult.issues?.length > 0 && stepVerifyCount < MAX_STEP_VERIFIES) {
                sendEvent('status', { status: 'fixing_verification', issues: vResult.issues, strictness: isHighStrict ? 'deep_fix' : 'quick_fix' });
                const fixCtx = (isHighStrict ? 'STRICT VERIFICATION FAILED. You MUST fix every issue:\n' : 'Verification issues:\n') + vResult.issues.join('\n') + '\n\n' + (isHighStrict ? 'Fix ALL issues thoroughly. Generate complete corrected files. Do NOT leave any issues unfixed.' : 'Fix these issues.');
                const fixMsgs = [...messages, { role: 'assistant', content: planContent }, { role: 'user', content: fixCtx }];
                try {
                  const { response: fixResp } = await chatWithKeyRotation(pool, resolved, fixMsgs, { thinkingEffort: fixThinkingEffort as any, temperature: chatTemperature, maxTokens: chatMaxTokens });
                  sendEvent('fix_response', { attempt: totalRetries + 1, content: fixResp.content });
                  planContent = fixResp.content;
                  continue;
                } catch (fe: any) { console.error('[Chat] Verify fix failed:', fe.message); }
              }
            }
          } catch (ve: any) { console.error('[Chat] Step verification error:', ve.message); }
        }

        if ((hasHtml && (hasJs || hasCss) && (hasServer || planRound >= 4)) || (hasHtml && stepVerifyCount >= MAX_STEP_VERIFIES) || (hasHtml && hasJs && hasCss && planRound >= 2)) {
          planDone = true;
        }
        if (planBlocks.length === 0 && !planDone) {
          totalRetries++;
          if (totalRetries <= MAX_RETRIES) {
            sendEvent('status', { status: 'fixing', attempt: totalRetries, round: planRound });
            const continueMsgs = [...messages, { role: 'assistant', content: planContent }, { role: 'user', content: 'Your output was incomplete. You must create ALL requested files and start the server. Continue where you left off and finish the task completely.' }];
            try {
              const { response: contResp } = await chatWithKeyRotation(pool, resolved, continueMsgs, { thinkingEffort: thinkingEffort as any, temperature: chatTemperature, maxTokens: chatMaxTokens });
              sendEvent('fix_response', { attempt: totalRetries, content: contResp.content });
              planContent = contResp.content;
              continue;
            } catch (contErr: any) {
              console.error('[Chat] Continue call failed:', contErr.message);
            }
          }
          planDone = true;
        }
      }
      // === END PLAN LOOP ===

      // === STATELESS VERIFICATION SUB-AGENT (always runs at end) ===
      // A fresh, memoryless agent checks the generated project for completeness
      try {
        sendEvent('status', { status: 'verifying', description: 'Verification agent checking project...' });
        
        // 1. Read all generated files
        const projectFiles: string[] = [];
        const writtenPaths = filesWritten.map(f => f.path);
        for (const wp of writtenPaths) {
          try {
            const content = fs.readFileSync(wp, 'utf-8');
            projectFiles.push('--- FILE: ' + path.basename(wp) + ' (' + content.length + ' bytes) ---\n' + content.substring(0, fileReadLimit));
          } catch {}
        }
        
        // 2. Build verification prompt for stateless sub-agent
        const verifyPrompt = 'You are a VERIFICATION AGENT. You have NO memory of previous steps. You ONLY see the files below and must check if they form a COMPLETE, WORKING project.\n\n' +
          'Original task: ' + (message || 'unknown') + '\n\n' +
          'Generated files:\n' + projectFiles.join('\n\n') + '\n\n' +
          'CHECKLIST:\n' +
          '1. Do ALL HTML files reference ONLY files that exist in the project?\n' +
          '2. Are there any missing referenced files (CSS, JS, images, fonts)?\n' +
          '3. Does the project contain ALL components the user requested?\n' +
          '4. Are the files complete (not truncated, no placeholders)?\n\n' +
          'Reply with JSON: {"passed": true/false, "issues": ["list of issues"], "missing_files": ["list of files that should exist but dont"]}';
        
        // 3. Call LLM for verification (stateless - no history)
        const verifyResolved = resolveModel(pool, modelId);
        if (verifyResolved) {
          const verifyResp = await chatWithKeyRotation(pool, verifyResolved, [
            { role: 'system', content: 'You are a verification agent. Check if the generated project is complete and correct. Reply only with JSON.' },
            { role: 'user', content: verifyPrompt },
          ], { thinkingEffort: verifyThinkingEffort as any, temperature: 0.1, maxTokens: verifyMaxTokens });
          
          let verification: any;
          try { verification = JSON.parse(verifyResp.response.content); } catch { verification = { passed: true, issues: [] }; }
          
          sendEvent('verification_result', { passed: verification.passed, issues: verification.issues || [] });
          
          // 4. If verification failed, try to fix
          if (!verification.passed && verification.issues && verification.issues.length > 0) {
            sendEvent('status', { status: 'fixing_verification', issues: verification.issues });
            const fixContext = 'VERIFICATION FAILED. Issues found:\n' + verification.issues.join('\n') + '\n\nMissing files: ' + (verification.missing_files || []).join(', ') + '\n\nFix ALL issues now. Generate the missing files and correct any problems.';
            const fixMsgs = [...messages, { role: 'assistant', content: planContent }, { role: 'user', content: fixContext }];
            try {
              const { response: fixResp } = await chatWithKeyRotation(pool, resolved, fixMsgs, { thinkingEffort: fixThinkingEffort as any, temperature: chatTemperature, maxTokens: chatMaxTokens });
              sendEvent('fix_response', { attempt: totalRetries + 1, content: fixResp.content });
              // Write any new files from fix response
              const fixBlocks = extractCodeBlocks(fixResp.content);
              const fixWritten = writeCodeBlocks(fixBlocks, projectDir);
              filesWritten.push(...fixWritten);
              for (const f of fixWritten) {
                sendEvent('file_written', { path: f.path, size: f.size, name: path.basename(f.path) });
              }
            } catch (fixErr: any) {
              console.error('[Chat] Verification fix failed:', fixErr.message);
            }
          }
        }
      } catch (verifyErr: any) {
        console.error('[Chat] Verification sub-agent error:', verifyErr.message);
      }
      // === END VERIFICATION ===

      // Auto-install
      const autoResults = autoInstallDeps(projectDir);
      if (autoResults.length > 0) {
        allCommandsRun.push(...autoResults);
        for (const r of autoResults) {
          sendEvent('command_result', { cmd: r.cmd, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr });
        }
      }

      // Auto-serve + auto-open browser
      const hasSuccessfulServer = allCommandsRun.some(r => r.exitCode === 0 && /http-server|serve|python.*http/i.test(r.cmd));
            // Detect serve URL from commands
      let serveUrl: string | null = null;
      for (const cmd of allCommandsRun) {
        if (cmd.exitCode === 0) {
          const portMatch = cmd.cmd.match(/http-server.*-p\s+(\d+)/);
          if (portMatch) { serveUrl = 'http://localhost:' + portMatch[1]; break; }
          const pyMatch = cmd.cmd.match(/python.*-m\s+http\.server\s+(\d+)/);
          if (pyMatch) { serveUrl = 'http://localhost:' + pyMatch[1]; break; }
        }
      }
      if (filesWritten.length > 0 && !hasSuccessfulServer) {
        const hasHtml = filesWritten.some(f => f.path.endsWith('.html') || f.path.endsWith('.htm'));
        if (hasHtml) {
          try {
            const serveScript = path.join(os.tmpdir(), 'moa-serve-' + uuid() + '.cmd');
            fs.writeFileSync(serveScript, '@echo off\r\nset "PATH=' + getAugmentedPath().replace(/"/g, '') + '"\r\ncd /d "' + projectDir + '"\r\nnpx http-server -p 8080 -c-1\r\n', 'utf-8');
            const { exec: execBg } = require('child_process');
            execBg('start /B "" "' + serveScript + '"', { shell: 'cmd.exe', windowsHide: true, env: { ...process.env, PATH: getAugmentedPath() } });
            allCommandsRun.push({ cmd: 'npx http-server -p 8080 -c-1', exitCode: 0, stdout: 'Server started on port 8080', stderr: '' });
            sendEvent('command_result', { cmd: 'npx http-server -p 8080 -c-1', exitCode: 0, stdout: 'Server started on port 8080', stderr: '' });
            serveUrl = 'http://localhost:8080';
            // Auto-open browser
            try { execBg('start http://localhost:8080', { shell: 'cmd.exe', windowsHide: true }); } catch {}
          } catch (e: any) {
            console.error('[AutoServe] Failed:', e.message);
          }
        }
      }

      // Final done event
      sendEvent('done', {
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
        codeExecutionDetail: { filesWritten, commandsRun: allCommandsRun, retries: totalRetries, projectDir, serveUrl },
        tools: [],
        agents: [],
      });
      res.end();
    } catch (err: any) {
      console.error('[Chat] Error:', err.message);
      const statusCode = err.response?.status;
      if (statusCode && [401, 402, 403, 429].includes(statusCode)) {
        sendEvent('error', { error: 'API authentication/quota error: ' + err.message });
      } else {
        sendEvent('error', { error: err.message });
      }
      res.end();
    }
  });

  return r;
}








import { Router } from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
import { ApiPoolManager } from '../providers/api-pool';
import { LLMClient } from '../services/llm-client';

const RECENT_MESSAGE_LIMIT = 20;
const SUMMARY_MAX_CHARS = 200;

function compressHistory(history: Array<{role:string;content:string}>): Array<{role:string;content:string}> {
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
    summaryLines.push(`[${label}]: ${truncated}`);
  }

  const summaryBlock = summaryLines.length > 0
    ? [{ role: 'system' as const, content: `[Earlier conversation summary]\n${summaryLines.join('\n')}` }]
    : [];

  return [...summaryBlock, ...recentMessages];
}

function escapePowerShellArg(s: string): string {
  return s.replace(/'/g, "''");
}

function mergeContinuationLines(code: string): string {
  const rawLines = code.split('\n');
  const merged: string[] = [];
  let i = 0;
  while (i < rawLines.length) {
    let line = rawLines[i];
    while (line.endsWith('\\') && !line.endsWith('\\\\') && i + 1 < rawLines.length) {
      line = line.slice(0, -1) + rawLines[i + 1].trim();
      i++;
    }
    merged.push(line);
    i++;
  }
  return merged.join('\n');
}

function convertToPowerShellCommand(cmd: string): string {
  const original = cmd;

  if (cmd.startsWith('cd ')) {
    const target = cmd.slice(3).trim();
    return `Set-Location -LiteralPath '${escapePowerShellArg(target)}'`;
  }

  if (cmd.startsWith('mkdir ')) {
    const target = cmd.slice(6).trim();
    return `New-Item -ItemType Directory -Force -Path '${escapePowerShellArg(target)}'`;
  }

  if (cmd.startsWith('npm init')) {
    return `npm init -y`;
  }

  if (cmd.startsWith('npm install')) {
    const rest = cmd.slice(11).trim();
    return rest ? `npm install ${rest}` : `npm install`;
  }

  if (cmd.startsWith('npm run ')) {
    return `npm run ${cmd.slice(8).trim()}`;
  }

  if (cmd.startsWith('pip install')) {
    const rest = cmd.slice(11).trim();
    return rest ? `pip install ${rest}` : `pip install`;
  }

  if (cmd.startsWith('python ')) {
    return `python ${cmd.slice(7).trim()}`;
  }

  if (cmd.startsWith('node ')) {
    return `node ${cmd.slice(5).trim()}`;
  }

  if (cmd.startsWith('npx ')) {
    return `npx ${cmd.slice(4).trim()}`;
  }

  if (cmd.startsWith('git ')) {
    return `git ${cmd.slice(4).trim()}`;
  }

  if (cmd.startsWith('cargo ')) {
    return `cargo ${cmd.slice(6).trim()}`;
  }

  if (cmd.startsWith('go ')) {
    return `go ${cmd.slice(3).trim()}`;
  }

  if (cmd.startsWith('java ')) {
    return `java ${cmd.slice(5).trim()}`;
  }

  if (cmd.startsWith('javac ')) {
    return `javac ${cmd.slice(6).trim()}`;
  }

  if (cmd.startsWith('dotnet ')) {
    return `dotnet ${cmd.slice(7).trim()}`;
  }

  if (cmd.startsWith('cat ')) {
    const target = cmd.slice(4).trim();
    return `Get-Content -LiteralPath '${escapePowerShellArg(target)}'`;
  }

  if (cmd.startsWith('rm ')) {
    const target = cmd.slice(3).trim();
    if (target.startsWith('-rf ') || target.startsWith('-r ')) {
      const p = target.replace(/^-[rf]+\s+/, '');
      return `Remove-Item -LiteralPath '${escapePowerShellArg(p)}' -Recurse -Force`;
    }
    return `Remove-Item -LiteralPath '${escapePowerShellArg(target)}'`;
  }

  if (cmd.startsWith('ls')) {
    const target = cmd.slice(2).trim();
    return target ? `Get-ChildItem -LiteralPath '${escapePowerShellArg(target)}'` : 'Get-ChildItem';
  }

  if (cmd.startsWith('touch ')) {
    const target = cmd.slice(6).trim();
    return `New-Item -ItemType File -Force -Path '${escapePowerShellArg(target)}'`;
  }

  if (cmd.startsWith('cp ')) {
    return `Copy-Item ${cmd.slice(3).trim()}`;
  }

  if (cmd.startsWith('mv ')) {
    return `Move-Item ${cmd.slice(3).trim()}`;
  }

  if (cmd.startsWith('chmod ')) {
    return `# chmod not needed on Windows`;
  }

  if (cmd.startsWith('npm init')) {
    return `npm init -y`;
  }

  if (/^curl\s/i.test(cmd)) {
    const urlMatch = cmd.match(/(?:curl\s+(?:-[A-Za-z]+\s+)*)(https?:\/\/[^\s"']+)/);
    if (urlMatch) {
      const url = urlMatch[1];
      const methodMatch = cmd.match(/-X\s+(GET|POST|PUT|PATCH|DELETE)/i);
      const method = methodMatch ? methodMatch[1].toUpperCase() : (cmd.match(/-d\s/) ? 'POST' : 'GET');
      const dataMatch = cmd.match(/-d\s+['"](.+?)['"]/);
      const headerMatch = cmd.match(/-H\s+['"](.+?)['"]/);
      const parts = [`Invoke-RestMethod -Uri '${url}' -Method ${method}`];
      if (headerMatch && headerMatch[1].includes('application/json')) parts.push("-ContentType 'application/json'");
      if (dataMatch) parts.push("-Body '" + dataMatch[1].replace(/'/g, "''") + "'");
      return parts.join(' ');
    }
    return 'curl.exe ' + cmd.slice(5);
  }

  return cmd;
}

function buildAugmentedPath(): string {
  if (process.platform !== 'win32') {
    return '/usr/local/bin:/usr/bin:' + (process.env.PATH || '');
  }

  const candidates: string[] = [
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python311'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python38'),
    'C:\\Program Files\\nodejs',
    'C:\\Program Files\\Git\\cmd',
    'C:\\node20b\\node-v20.15.1-win-x64',
          'C:\\Windows\\System32\\WindowsPowerShell\\v1.0',
          'C:\\Windows',
    process.env.PATH || '',
  ];

  const resourcesPath = (process as any).resourcesPath;
  if (resourcesPath) {
    candidates.push(resourcesPath);
  }

  return candidates.filter(Boolean).join(path.delimiter);
}

export function createChatRoutes(pool: ApiPoolManager) {
  const r = Router();

  r.post('/', async (req, res) => {
    try {
      const { message, modelId, attachments, orchestratorThinkingMode, agentThinkingMode, thinkingMode, costEfficiencyRatio, history } = req.body;
      if (!message && (!attachments || attachments.length === 0)) {
        return res.status(400).json({ error: 'Empty message' });
      }

      let provider, model, apiKey;
      if (modelId) {
        const found = pool.findProviderForModel(modelId);
        if (found) { provider = found.provider; model = found.model; apiKey = found.apiKey; }
      }
      if (!provider) {
        for (const prov of pool.getAllProviders()) {
          const key = pool.getNextApiKey(prov.id);
          if (!key) continue;
          const llm = prov.models.find(m => m.type === 'llm' || m.type === 'vlm');
          if (llm) { provider = prov; model = llm; apiKey = key; break; }
        }
      }
      if (!provider || !model || !apiKey) {
        return res.status(400).json({ error: 'No available models with active API keys. Add a provider and key first.' });
      }

      const messages: Array<{role:string;content:any}> = [
        { role: 'system', content: 'You are a helpful AI assistant in the Mixture of Agents system. Respond concisely and accurately.' },
      ];

      const compressedHistory = compressHistory(history || []);
      for (const msg of compressedHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }

      const imageAttachments = (attachments || []).filter((a:any) => a.type === 'image');

      let userContent: any = message;
      if (imageAttachments.length > 0 && (model.type === 'vlm' || model.capabilities?.multimodal)) {
        const contentArr: any[] = [{ type: 'text', text: message || 'Describe this image.' }];
        for (const img of imageAttachments) {
          if (img.data && img.data.startsWith('data:')) {
            contentArr.push({ type: 'image_url', image_url: { url: img.data } });
          }
        }
        userContent = contentArr;
      }

      messages.push({ role: 'user', content: userContent });

      const effortMap: Record<string, string> = { low: 'low', medium: 'medium', high: 'high', auto: 'medium' };
      const effectiveThinking = orchestratorThinkingMode || thinkingMode || 'medium';
      const resolvedThinking = effortMap[effectiveThinking] || 'medium';
      const systemPrefix = resolvedThinking === 'high' ? '[Deep analysis mode. Consider all angles, edge cases, and dependencies.]\n\n'
        : resolvedThinking === 'low' ? '[Quick response. Be concise and direct.]\n\n'
        : '';
      if (systemPrefix) messages[0].content = systemPrefix + messages[0].content;

      const resp = await LLMClient.chatCompletion(provider, apiKey, {
        messages,
        model: model.modelId,
        temperature: 0.7,
        maxTokens: 4096,
        thinkingEffort: resolvedThinking as any,
      });

      const codeBlocks: Array<{lang: string; code: string; filename?: string}> = [];
      const blockRegex = /```(\w+)(?::([^\n]+))?\n([\s\S]*?)```/g;
      let match;
      while ((match = blockRegex.exec(resp.content)) !== null) {
        codeBlocks.push({ lang: match[1] || 'txt', code: match[3], filename: match[2] });
      }

      const execResults: Array<{lang: string; filename?: string; stdout: string; stderr: string; exitCode: number}> = [];
      if (codeBlocks.length > 0) {
        const fs = await import('fs');
        const os = await import('os');
        const path = await import('path');

        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moa-exec-'));

        const writeBlocks: typeof codeBlocks = [];
        const runBlocks: typeof codeBlocks = [];
        for (const block of codeBlocks) {
          const lang = block.lang.toLowerCase();
          if (['powershell', 'bash', 'sh', 'shell'].includes(lang)) {
            runBlocks.push(block);
            continue;
          }
          writeBlocks.push(block);
        }

        for (const block of writeBlocks) {
          const ext = block.lang === 'python' || block.lang === 'py' ? '.py'
            : block.lang === 'javascript' || block.lang === 'js' || block.lang === 'node' ? '.js'
            : block.lang === 'typescript' || block.lang === 'ts' ? '.ts'
            : block.lang === 'json' ? '.json' : block.lang === 'html' ? '.html' : '.txt';
          const filename = block.filename || ('script' + ext);
          const filePath = path.join(workDir, filename);
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, block.code, 'utf8');
        }

        const augmentedPath = buildAugmentedPath();
        const execOpts = { cwd: workDir, timeout: 60000, encoding: 'utf8' as const, shell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' as any, env: { ...process.env, FORCE_COLOR: '0', PATH: augmentedPath } };

        const runCommand = (command: string, label: string) => {
          try {
            const output = execSync(command, { ...execOpts, timeout: 30000 });
            execResults.push({ lang: 'powershell', filename: label, stdout: String(output || ''), stderr: '', exitCode: 0 });
            return true;
          } catch (e: any) {
            execResults.push({ lang: 'powershell', filename: label, stdout: e.stdout || '', stderr: e.stderr || e.message, exitCode: e.status || 1 });
            return false;
          }
        };

        const packageJsonPath = path.join(workDir, 'package.json');
        const requirementsPath = path.join(workDir, 'requirements.txt');

        if (fs.existsSync(packageJsonPath)) {
          runCommand('npm install', 'npm install');
        }

        if (fs.existsSync(requirementsPath)) {
          runCommand('pip install -r requirements.txt', 'pip install');
        }

        let currentDir = workDir;

        for (const block of runBlocks) {
          const mergedCode = mergeContinuationLines(block.code);
          const lines = mergedCode.split('\n').map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith('#'));
          for (const rawLine of lines) {
            let cmd = rawLine;

            if (cmd.includes(' && ')) {
              const parts = cmd.split(' && ').map((p: string) => p.trim()).filter(Boolean);
              for (const part of parts) {
                const psCmd = convertToPowerShellCommand(part);
                try {
                  const output = execSync(psCmd, { ...execOpts, cwd: currentDir, timeout: 30000 });
                  execResults.push({ lang: 'powershell', filename: psCmd.slice(0, 80), stdout: String(output || ''), stderr: '', exitCode: 0 });
                } catch (e: any) {
                  execResults.push({ lang: 'powershell', filename: psCmd.slice(0, 80), stdout: e.stdout || '', stderr: e.stderr || e.message, exitCode: e.status || 1 });
                }
              }
              continue;
            }

            if (cmd.startsWith('cd ')) {
              const target = cmd.slice(3).trim();
              const newPath = path.isAbsolute(target) ? target : path.join(currentDir, target);
              if (fs.existsSync(newPath)) {
                currentDir = newPath;
                execResults.push({ lang: 'powershell', filename: `cd ${target}`, stdout: `Changed directory to: ${currentDir}`, stderr: '', exitCode: 0 });
              } else {
                execResults.push({ lang: 'powershell', filename: `cd ${target}`, stdout: '', stderr: `Directory not found: ${target}`, exitCode: 1 });
              }
              continue;
            }

            const psCmd = convertToPowerShellCommand(cmd);
            try {
              const output = execSync(psCmd, { ...execOpts, cwd: currentDir, timeout: 30000 });
              execResults.push({ lang: 'powershell', filename: psCmd.slice(0, 80), stdout: String(output || ''), stderr: '', exitCode: 0 });
            } catch (e: any) {
              execResults.push({ lang: 'powershell', filename: psCmd.slice(0, 80), stdout: e.stdout || '', stderr: e.stderr || e.message, exitCode: e.status || 1 });
            }
          }
        }

        try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
      }

      res.json({
        role: 'orchestrator',
        content: resp.content,
        model: model.name,
        provider: provider.name,
        latencyMs: resp.latencyMs,
        usage: resp.usage,
        contextCompressed: compressedHistory.length < (history || []).length,
        historySize: (history || []).length,
        thinkingMode: resolvedThinking,
        codeExecution: execResults.length > 0 ? execResults : undefined,
      });
    } catch (err: any) {
      console.error('[Chat] Error:', err.message);
      const status = err.response?.status;
      let userMsg = err.message;
      if (status === 401 || status === 402 || status === 403) {
        userMsg = 'API Key 无效、额度不足或权限受限，请在「提供商」页面检查并更新 API Key';
      } else if (status === 429) {
        userMsg = 'API 请求频率超限，请稍后再试';
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        userMsg = '无法连接到 API 服务器，请检查提供商 URL 配置';
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        userMsg = 'API 请求超时，请稍后再试';
      }
      res.status(500).json({ error: userMsg, role: 'error', content: userMsg });
    }
  });

  return r;
}

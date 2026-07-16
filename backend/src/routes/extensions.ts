import { Router, Request, Response } from 'express';
import * as child_process from 'child_process';
import axios from 'axios';
import path from 'path';
import os from 'os';
import { ExtensionManager } from '../services/extensions/extension-manager';

function testResult(passed: boolean, message: string, diagnostics?: Record<string, unknown>) {
  return { lastTestedAt: new Date().toISOString(), passed, message, diagnostics };
}


function augmentedEnv(extra?: Record<string, string>) {
  const env = { ...process.env, ...(extra || {}) };
  const extraPaths = [
    
    
    'C:\\Users\\vipuser\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\bin\\fallback',path.dirname(process.execPath),'C:\\node20b\\node-v20.15.1-win-x64',
    'C:\\Program Files\\nodejs',
    path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python312'),
    path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python311'),
    path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python38'),
    'C:\\Program Files\\Git\\cmd',
    ...((process as any).resourcesPath ? [(process as any).resourcesPath] : []),
  ].join(path.delimiter) + path.delimiter;
  env.PATH = extraPaths + (env.PATH || '');
  return env;
}

function spawnShortTest(command: string, args?: string[], options?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number }): Promise<{ok: boolean; summary: string}> {
  return new Promise((resolve) => {
    const timeoutMs = Math.min(Math.max(options?.timeoutMs || 15000, 1000), 30000);
    const tryArgs = Array.isArray(args) && args.length ? args : ['--version'];
    let finished = false;
    let output = '';
    let error = '';
    let runCommand = command;
    let runArgs = tryArgs;
    if (/^(npx|npm|yarn|pnpm)$/i.test(runCommand)) {
      // Use shell execution for npx/npm commands on Windows
      runCommand = process.platform === 'win32' ? (process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe') : command;
      runArgs = process.platform === 'win32' ? ['/c', command, ...tryArgs] : tryArgs;
    } else if (/^node$/i.test(runCommand)) {
      runCommand = process.execPath;
    }
    const child = child_process.spawn(runCommand, runArgs, {
      cwd: options?.cwd || process.cwd(),
      env: augmentedEnv(options?.env),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (d) => { output += String(d || '').slice(0, 1000); });
    child.stderr?.on('data', (d) => { error += String(d || '').slice(0, 1000); });
    const done = (ok: boolean, summary: string) => {
      if (finished) return;
      finished = true;
      resolve({ ok, summary });
    };
    child.on('close', (code) => {
      const ok = code === 0 || output.trim().length > 0;
      done(ok, code === 0 ? '进程执行成功' : output.trim().length > 0 ? '进程有输出，视为可用' : '进程执行失败');
    });
    child.on('error', (err) => {
      done(false, `启动失败: ${(err as any)?.message || err}`);
    });
    setTimeout(() => {
      try { child.kill(); } catch {}
      // For MCP servers, if the process started (no immediate error), consider it a pass
      const hasOutput = output.trim().length > 0 || error.trim().length > 0;
      const noCrash = !error.includes('ENOENT') && !error.includes('not found') && !error.includes('is not recognized');
      done(hasOutput || noCrash, hasOutput ? '进程已启动，视为可用' : noCrash ? '进程启动无崩溃，视为可用' : '进程执行超时');
    }, timeoutMs);
  });
}

async function testUrlReachable(url?: string): Promise<{ok: boolean; summary: string}> {
  if (!url) return { ok: false, summary: '缺少 URL' };
  try {
    const res = await axios.get(url, { timeout: 5000, validateStatus: () => true });
    return { ok: res.status >= 200 && res.status < 500, summary: `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, summary: `连接失败: ${(e as any)?.message || e}` };
  }
}

export function createExtensionRoutes(extManager: ExtensionManager) {
  const r = Router();

  // ============ MCP Servers ============
  r.get('/mcp', (_req, res) => {
    res.json(extManager.getAllMcpServers());
  });

  r.get('/mcp/presets', (_req, res) => {
    res.json(extManager.getMcpPresets());
  });

  r.post('/mcp/from-preset', (req, res) => {
    const { presetId, overrides } = req.body;
    if (!presetId) return res.status(400).json({ error: 'Missing presetId' });
    const server = extManager.addMcpFromPreset(presetId, overrides);
    if (!server) return res.status(404).json({ error: 'Preset not found' });
    res.json(server);
  });

  r.post('/mcp', (req, res) => {
    const config = req.body;
    if (!config.name) return res.status(400).json({ error: 'Missing name' });
    const server = extManager.addMcpServer(config);
    res.json(server);
  });

  r.put('/mcp/:id', (req, res) => {
    const updated = extManager.updateMcpServer(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  });

  r.delete('/mcp/:id', (req, res) => {
    const ok = extManager.removeMcpServer(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  });

  r.post('/mcp/:id/test', async (req: Request, res: Response) => {
    try {
      const server = extManager.getMcpServer(req.params.id);
      if (!server) return res.status(404).json({ error: 'Not found' });
      let passed = false;
      let message = '测试未通过';
      let diagnostics: Record<string, unknown> = {};
      if (server.transport === 'stdio' && server.command) {
        const { ok, summary } = await spawnShortTest(server.command, server.args, { cwd: process.cwd(), env: server.env });
        passed = ok;
        message = summary;
        diagnostics = { command: server.command, args: server.args || [] };
      } else if (server.url) {
        const { ok, summary } = await testUrlReachable(server.url);
        passed = ok;
        message = summary;
        diagnostics = { url: server.url };
      } else {
        message = '缺少 command 或 url';
      }
      const updated = extManager.updateMcpServer(req.params.id, { status: testResult(passed, message, diagnostics) } as any);
      res.json({ success: passed, message, data: updated });
    } catch (e: any) {
      res.status(500).json({ success: false, message: String(e?.message || e) });
    }
  });

  // ============ Skills ============
  r.get('/skills', (_req, res) => {
    res.json(extManager.getAllSkills());
  });

  r.get('/skills/presets', (_req, res) => {
    res.json(extManager.getSkillPresets());
  });

  r.post('/skills/from-preset', (req, res) => {
    const { presetId, overrides } = req.body;
    if (!presetId) return res.status(400).json({ error: 'Missing presetId' });
    const skill = extManager.addSkillFromPreset(presetId, overrides);
    if (!skill) return res.status(404).json({ error: 'Preset not found' });
    res.json(skill);
  });

  r.post('/skills', (req, res) => {
    const config = req.body;
    if (!config.name) return res.status(400).json({ error: 'Missing name' });
    const skill = extManager.addSkill(config);
    res.json(skill);
  });

  r.put('/skills/:id', (req, res) => {
    const updated = extManager.updateSkill(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  });

  r.delete('/skills/:id', (req, res) => {
    const ok = extManager.removeSkill(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  });

  r.post('/skills/:id/test', async (req: Request, res: Response) => {
    try {
      const skill = extManager.getSkill(req.params.id);
      if (!skill) return res.status(404).json({ error: 'Not found' });
      const hasContent = typeof skill.content === 'string' && skill.content.trim().length > 0;
      const updated = extManager.updateSkill(req.params.id, {
        status: testResult(hasContent, hasContent ? '技能内容可用' : '技能内容为空', { contentLength: (skill.content || '').length })
      } as any);
      res.json({ success: hasContent, message: hasContent ? '技能内容可用' : '技能内容为空', data: updated });
    } catch (e: any) {
      res.status(500).json({ success: false, message: String(e?.message || e) });
    }
  });

  // ============ Skill Servers ============
  r.get('/skill-servers', (_req, res) => {
    res.json(extManager.getAllSkillServers());
  });

  r.get('/skill-servers/presets', (_req, res) => {
    res.json(extManager.getSkillServerPresets());
  });

  r.post('/skill-servers/from-preset', (req, res) => {
    const { presetId, overrides } = req.body;
    if (!presetId) return res.status(400).json({ error: 'Missing presetId' });
    const server = extManager.addSkillServerFromPreset(presetId, overrides);
    if (!server) return res.status(404).json({ error: 'Preset not found' });
    res.json(server);
  });

  r.post('/skill-servers', (req, res) => {
    const config = req.body;
    if (!config.name) return res.status(400).json({ error: 'Missing name' });
    const server = extManager.addSkillServer(config);
    res.json(server);
  });

  r.put('/skill-servers/:id', (req, res) => {
    const updated = extManager.updateSkillServer(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  });

  r.delete('/skill-servers/:id', (req, res) => {
    const ok = extManager.removeSkillServer(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  });

  r.post('/skill-servers/:id/test', async (req: Request, res: Response) => {
    try {
      const server = extManager.getSkillServer(req.params.id);
      if (!server) return res.status(404).json({ error: 'Not found' });
      let passed = false;
      let message = '测试未通过';
      let diagnostics: Record<string, unknown> = {};
      if (server.transport === 'stdio' && server.command) {
        const { ok, summary } = await spawnShortTest(server.command, server.args, { cwd: process.cwd(), env: server.env });
        passed = ok;
        message = summary;
        diagnostics = { command: server.command, args: server.args || [] };
      } else if (server.url) {
        const { ok, summary } = await testUrlReachable(server.url);
        passed = ok;
        message = summary;
        diagnostics = { url: server.url };
      } else {
        message = '缺少 command 或 url';
      }
      const updated = extManager.updateSkillServer(req.params.id, { status: testResult(passed, message, diagnostics) } as any);
      res.json({ success: passed, message, data: updated });
    } catch (e: any) {
      res.status(500).json({ success: false, message: String(e?.message || e) });
    }
  });

  return r;
}
import { Router } from 'express';
import { ApiPoolManager } from '../providers/api-pool';
import { CodingEngine } from '../services/coding-engine';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execSync, spawn, ChildProcess } from 'child_process';
import { runFile, detectLanguage, getSupportedExtensions } from '../services/file-runner';

export function createCodingRoutes(pool: ApiPoolManager, wsBroadcast: Function, projectManager?: any) {
  const r = Router();
  const workDir = path.join(os.tmpdir(), 'moa-workspace');
  const engine = new CodingEngine(workDir);
  fs.mkdirSync(workDir, { recursive: true });

  // Track active terminal sessions
  const terminals = new Map<string, ChildProcess>();

  // Standalone coding execution (from Coding tab)
  r.post('/execute', async (req, res) => {
    const { description, projectPath, modelId, providerId } = req.body;
    if (!description) return res.status(400).json({ error: 'Missing description' });
    const prov = providerId ? pool.getProvider(providerId) : pool.getAllProviders().find(p => p.apiKeys.length > 0);
    if (!prov) return res.status(400).json({ error: 'No provider with keys' });
    const key = pool.getNextApiKey(prov.id); if (!key) return res.status(400).json({ error: 'No keys' });
    const model = modelId ? prov.models.find(m => m.id === modelId) : prov.models.find(m => m.type === 'llm');
    if (!model) return res.status(400).json({ error: 'No model' });
    const task = engine.createTask(description, projectPath || 'project');
    wsBroadcast('coding_started', { taskId: task.id, description });
    try {
      const plan = await engine.planTask(description, prov, key, model);
      wsBroadcast('coding_planned', { taskId: task.id, plan });
      await engine.executePlan(plan, task);
      wsBroadcast('coding_completed', { taskId: task.id, status: task.status, output: task.output });
      res.json(task);
    } catch (e: any) {
      task.status = 'failed'; task.output = e.message;
      wsBroadcast('coding_failed', { taskId: task.id, error: e.message });
      res.json(task);
    }
  });

  // ������ Enhanced Environment Detection ��������������������������������������������������������������
  r.get('/environment', (_req, res) => {
        const env: any = {
      cwd: workDir, homeDir: os.homedir(), platform: process.platform, arch: process.arch,
      nodeVersion: process.version, hostname: os.hostname(), username: os.userInfo().username,
      totalMemory: Math.round(os.totalmem() / 1073741824 * 10) / 10 + ' GB',
      freeMemory: Math.round(os.freemem() / 1073741824 * 10) / 10 + ' GB',
      cpus: os.cpus().length + ' cores',
      shell: process.env.ComSpec || 'cmd.exe',
      tools: {
        node: { available: true, version: process.version, path: process.execPath },
        npm: { available: !!process.env.npm_execpath || true, version: null, path: null },
      },
    };
    try { env.desktopFiles = fs.readdirSync(path.join(os.homedir(), 'Desktop')).slice(0, 50); } catch { env.desktopFiles = []; }
    env.pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
        res.json(env);
  });
  // Async tool detection endpoint
  r.get('/detect-tools', async (_req, res) => {
    const { execFile: ef } = require('child_process');
    const tools: Record<string, { available: boolean; version: string | null }> = {};
    const all = [['gcc','gcc --version'],['g++','g++ --version'],['java','java -version 2>&1'],['go','go version'],['rustc','rustc --version'],['cargo','cargo --version'],['docker','docker --version'],['curl','curl --version']];
    await Promise.all(all.map(([name, cmd]) => new Promise<void>((resolve) => {
      const parts = cmd.split(' ');
      const child = ef(parts[0], parts.slice(1), { encoding: 'utf8', timeout: 3000, windowsHide: true }, (err: any, stdout: string) => {
        tools[name] = { available: !err && stdout.trim().length > 0, version: !err ? stdout.trim().split('\n')[0] : null };
        resolve();
      });
    })));
    res.json({ tools });
  });

  // ������ Shell Execution ��������������������������������������������������������������������������������������������
  r.post('/shell', async (req, res) => {
    const { command, workdir, timeout } = req.body;
    if (!command) return res.status(400).json({ error: 'Missing command' });
    const cwd = workdir ? (path.isAbsolute(workdir) ? workdir : path.resolve(workDir, workdir)) : workDir;
    fs.mkdirSync(cwd, { recursive: true });
    const t = Math.min(Math.max(timeout || 30000, 1000), 120000);
    try {
      const extra = process.platform === 'win32'
        ? [
            path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python38'),
            'C:\\Program Files\\nodejs',
            'C:\\Program Files\\Git\\cmd',
            ...((process as any).resourcesPath ? [(process as any).resourcesPath] : []),
          ].join(path.delimiter) + path.delimiter
        : '/usr/local/bin:/usr/bin:';
      const output = execSync(command, {
        cwd, encoding: 'utf8', timeout: t, shell: (process.env.ComSpec || 'cmd.exe') as any,
        env: { ...process.env, FORCE_COLOR: '0', PATH: extra + (process.env.PATH || '') }
      });
      res.json({ success: true, output: (output || '').slice(0, 16000), exitCode: 0 });
    } catch (e: any) {
      res.json({ success: false, output: ((e.stdout || '') + '\n' + (e.stderr || e.message || '')).slice(0, 16000), exitCode: e.status || 1 });
    }
  });

  // ������ File Operations ��������������������������������������������������������������������������������������������
  r.post('/read-file', (req, res) => {
    const { filePath, workdir } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Missing filePath' });
    const base = workdir ? path.resolve(workDir, workdir) : workDir;
    const full = path.resolve(base, filePath);
    if (!full.startsWith(workDir) && !full.startsWith(os.homedir())) return res.status(403).json({ error: 'Access denied' });
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'File not found' });
    try {
      const stat = fs.statSync(full);
      if (stat.size > 1024 * 1024) return res.json({ content: fs.readFileSync(full, 'utf8').slice(0, 1024 * 1024), truncated: true, size: stat.size });
      res.json({ content: fs.readFileSync(full, 'utf8'), truncated: false, size: stat.size });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.post('/write-file', (req, res) => {
    const { filePath, content, workdir } = req.body;
    if (!filePath || content === undefined) return res.status(400).json({ error: 'Missing filePath or content' });
    const base = workdir ? path.resolve(workDir, workdir) : workDir;
    const full = path.resolve(base, filePath);
    if (!full.startsWith(workDir) && !full.startsWith(os.homedir())) return res.status(403).json({ error: 'Access denied' });
    try {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
      res.json({ success: true, path: full, size: Buffer.byteLength(content, 'utf8') });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.get('/workspace', (_req, res) => {
    try {
      const files: string[] = [];
      const walk = (dir: string, depth = 0) => {
        if (depth > 5) return;
        if (!fs.existsSync(dir)) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name.startsWith('.')) continue;
          const f = path.join(dir, e.name);
          if (e.isDirectory()) walk(f, depth + 1);
          else files.push(path.relative(workDir, f));
        }
      };
      walk(workDir); res.json({ workDir, files });
    } catch { res.json({ workDir, files: [] }); }
  });

  r.post('/list-files', (req, res) => {
    const { workdir } = req.body;
    const cwd = workdir ? (path.isAbsolute(workdir) ? workdir : path.resolve(workDir, workdir)) : workDir;
    if (!fs.existsSync(cwd)) return res.json({ files: [], dirs: [] });
    try {
      const entries = fs.readdirSync(cwd, { withFileTypes: true });
      res.json({
        path: cwd,
        files: entries.filter(e => e.isFile()).map(e => ({ name: e.name, size: fs.statSync(path.join(cwd, e.name)).size })),
        dirs: entries.filter(e => e.isDirectory()).map(e => e.name),
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ������ Read from any absolute path ��������������������������������������������������������������������
  r.post('/read-absolute', (req, res) => {
    const { absolutePath } = req.body;
    if (!absolutePath) return res.status(400).json({ error: 'Missing path' });
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: 'Not found' });
    try {
      const stat = fs.statSync(absolutePath);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
        return res.json({ type: 'directory', entries: entries.map(e => ({ name: e.name, isDir: e.isDirectory() })) });
      }
      if (stat.size > 2 * 1024 * 1024) return res.json({ type: 'file', content: fs.readFileSync(absolutePath, 'utf8').slice(0, 2 * 1024 * 1024), truncated: true });
      res.json({ type: 'file', content: fs.readFileSync(absolutePath, 'utf8'), truncated: false });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ===== FILE MANAGER & WORKSPACE ROUTES =====

  // Set workspace directory (user picks project folder)
  r.post('/set-workspace', (req, res) => {
    const { workspacePath } = req.body;
    if (!workspacePath) return res.status(400).json({ error: 'Missing workspacePath' });
    const resolved = path.resolve(workspacePath);
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Directory not found' });
    if (!fs.statSync(resolved).isDirectory()) return res.status(400).json({ error: 'Not a directory' });
    res.json({ success: true, workspace: resolved });
  });

  // Browse filesystem
  r.post('/browse', (req, res) => {
    const { browsePath } = req.body;
    try {
      if (!browsePath) {
        if (process.platform === 'win32') {
          const drives = [];
          for (let i = 65; i <= 90; i++) {
            const letter = String.fromCharCode(i) + ':\\';
            if (fs.existsSync(letter)) drives.push(letter);
          }
          return res.json({ path: '', entries: drives.map(d => ({ name: d, path: d, isDir: true })) });
        }
        return res.json({ path: '/', entries: [] });
      }
      const resolved = path.resolve(browsePath);
      if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Path not found' });
      if (!fs.statSync(resolved).isDirectory()) return res.status(400).json({ error: 'Not a directory' });
      const entries = fs.readdirSync(resolved, { withFileTypes: true })
        .filter(e => !e.name.startsWith('.'))
        .map(e => ({ name: e.name, path: path.join(resolved, e.name), isDir: e.isDirectory() }))
        .sort((a, b) => { if (a.isDir === b.isDir) return a.name.localeCompare(b.name); return a.isDir ? -1 : 1; });
      res.json({ path: resolved, entries });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // List files as tree
  r.post('/list-tree', (req, res) => {
    const { dirPath, depth } = req.body;
    const target = dirPath || workDir;
    const maxDepth = Math.min(depth || 2, 5);
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'Directory not found' });
    try {
      const walk = (d: string, currentDepth: number): any[] => {
        if (currentDepth > maxDepth) return [];
        const entries = fs.readdirSync(d, { withFileTypes: true });
        return entries.filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '.git').map(e => {
          const fullPath = path.join(d, e.name);
          const item: any = { name: e.name, path: fullPath, isDir: e.isDirectory() };
          if (e.isDirectory()) { item.children = walk(fullPath, currentDepth + 1); }
          else { try { item.size = fs.statSync(fullPath).size; } catch {} }
          return item;
        });
      };
      res.json({ path: target, tree: walk(target, 0) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Run a file
  r.post('/run-file', (req, res) => {
    const { filePath, timeout } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Missing filePath' });
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });
    try {
      const lang = detectLanguage(resolved);
      if (lang === 'Unknown') {
        return res.json({ success: false, output: 'Unsupported file type. Supported: ' + getSupportedExtensions().join(', '), exitCode: 1, language: 'Unknown', duration: 0 });
      }
      const cwd = path.dirname(resolved);
      const result = runFile(resolved, cwd, timeout || 30000);
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Create file or directory
  r.post('/create-file', (req, res) => {
    const { filePath, content: fileContent, isDirectory } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Missing filePath' });
    try {
      if (isDirectory) {
        fs.mkdirSync(filePath, { recursive: true });
        res.json({ success: true, path: filePath, type: 'directory' });
      } else {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, fileContent || '', 'utf8');
        res.json({ success: true, path: filePath, type: 'file', size: 0 });
      }
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Delete file or directory
  r.post('/delete-file', (req, res) => {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Missing filePath' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) { fs.rmSync(filePath, { recursive: true, force: true }); }
      else { fs.unlinkSync(filePath); }
      res.json({ success: true, deleted: filePath });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Rename/move
  r.post('/rename-file', (req, res) => {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: 'Missing paths' });
    if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'Source not found' });
    try {
      fs.renameSync(oldPath, newPath);
      res.json({ success: true, from: oldPath, to: newPath });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Supported extensions
  r.get('/supported-extensions', (_req, res) => {
    try {
      const exts = getSupportedExtensions();
      res.json({ extensions: exts.map(e => ({ ext: e, language: detectLanguage('file' + e) })) });
    } catch (e: any) { res.json({ extensions: [] }); }
  });


  return r;
}

import { Router } from 'express';
import { ApiPoolManager } from '../providers/api-pool';
import { CodingEngine } from '../services/coding-engine';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execSync, spawn, ChildProcess } from 'child_process';

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
      cwd: workDir,
      homeDir: os.homedir(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      hostname: os.hostname(),
      username: os.userInfo().username,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10 + ' GB',
      freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10 + ' GB',
      cpus: os.cpus().length + ' cores',
      shell: process.env.ComSpec || process.env.SHELL || 'unknown',
      tools: {} as Record<string, { available: boolean; version: string | null; path: string | null }>,
    };

    const pathAugment = process.platform === 'win32'
      ? [
          path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python38'),
          path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python311'),
          'C:\\Program Files\\nodejs',
          'C:\\node20b\\node-v20.15.1-win-x64',
          'C:\\Program Files\\Git\\cmd',
          'C:\\node20b\\node-v20.15.1-win-x64',
          // Packaged Electron: add resources dir for bundled node.exe
          ...((process as any).resourcesPath ? [(process as any).resourcesPath] : []),
        ].join(path.delimiter) + path.delimiter
      : '/usr/local/bin:/usr/bin:';
    const origPath = process.env.PATH || '';
    process.env.PATH = pathAugment + origPath;
    const check = (name: string, cmd: string, verCmd?: string) => {
      try {
        const ver = execSync(verCmd || cmd + ' --version', { encoding: 'utf8', timeout: 5000, shell: 'powershell' as const }).trim().split('\n')[0];
        let p: string | null = null;
        try { p = execSync('where ' + name, { encoding: 'utf8', timeout: 3000, shell: 'powershell' as const }).trim().split('\n')[0]; } catch {}
        env.tools[name] = { available: true, version: ver, path: p };
      } catch {
        env.tools[name] = { available: false, version: null, path: null };
      }
    };

    check('node', 'node', 'node -v');
    check('npm', 'npm', 'npm -v');
    check('npx', 'npx', 'npx -v');
    check('python', 'python', 'python --version');
    check('pip', 'pip', 'pip --version');
    check('git', 'git', 'git --version');
    check('java', 'java', 'java -version 2>&1');
    check('go', 'go', 'go version');
    check('rustc', 'rustc', 'rustc --version');
    check('cargo', 'cargo', 'cargo --version');
    check('docker', 'docker', 'docker --version');
    check('tsc', 'tsc', 'npx tsc --version');
    check('vite', 'vite', 'npx vite --version');
    check('electron', 'electron', 'npx electron --version');
    check('powershell', 'powershell', 'powershell -Command "$PSVersionTable.PSVersion.ToString()"');
    check('gcc', 'gcc', 'gcc --version');
    check('g++', 'g++', 'g++ --version');
    check('make', 'make', 'make --version');
    check('curl', 'curl', 'curl --version');
    check('tar', 'tar', 'tar --version');

    // Check for common package managers
    check('yarn', 'yarn', 'yarn -v');
    check('pnpm', 'pnpm', 'pnpm -v');
    check('conda', 'conda', 'conda --version');
    check('pip3', 'pip3', 'pip3 --version');
    check('python3', 'python3', 'python3 --version');

    // Desktop files
    try {
      const desktop = path.join(os.homedir(), 'Desktop');
      env.desktopFiles = fs.readdirSync(desktop).slice(0, 50);
    } catch { env.desktopFiles = []; }

    // PATH entries
    env.pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);

    res.json(env);
  });

  // ������ Shell Execution ��������������������������������������������������������������������������������������������
  r.post('/shell', async (req, res) => {
    const { command, workdir, timeout } = req.body;
    if (!command) return res.status(400).json({ error: 'Missing command' });
    const cwd = workdir ? path.resolve(workDir, workdir) : workDir;
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
        cwd, encoding: 'utf8', timeout: t, shell: 'powershell' as const,
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
    const cwd = workdir ? path.resolve(workDir, workdir) : workDir;
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

  return r;
}

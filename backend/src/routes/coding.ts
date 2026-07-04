import { Router } from 'express';
import { ApiPoolManager } from '../providers/api-pool';
import { CodingEngine } from '../services/coding-engine';
import os from 'os';
import path from 'path';
import fs from 'fs';

export function createCodingRoutes(pool: ApiPoolManager, wsBroadcast: Function) {
  const r = Router();
  const workDir = path.join(os.tmpdir(), 'moa-workspace');
  const engine = new CodingEngine(workDir);

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

  r.get('/workspace', (_req, res) => {
    try {
      const files: string[] = [];
      const walk = (dir: string) => { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else files.push(path.relative(workDir, f)); } };
      walk(workDir); res.json({ workDir, files });
    } catch { res.json({ workDir, files: [] }); }
  });

  return r;
}

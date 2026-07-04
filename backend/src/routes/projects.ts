import { Router } from 'express';
import { ProjectManager } from '../services/project-manager';
import { ApiPoolManager } from '../providers/api-pool';
import { Orchestrator } from '../orchestrator/orchestrator';
import { UserPreferences } from '../types';

import { ExtensionManager } from '../services/extensions/extension-manager';

export function createProjectRoutes(pm: ProjectManager, pool: ApiPoolManager, wsBroadcast: Function, extManager?: ExtensionManager) {
  const r = Router();
  r.get('/', (_, res) => res.json(pm.getAllProjects()));
  r.get('/:id', (req, res) => { const p = pm.getProject(req.params.id); if (!p) return res.status(404).json({ error: 'Not found' }); res.json(p); });
  r.post('/', (req, res) => { const { name, description, task, modelId } = req.body; res.json(pm.createProject(name || 'Project', description || '', task || '', modelId || '')); });
  r.post('/:id/execute', async (req, res) => {
    const proj = pm.getProject(req.params.id); if (!proj) return res.status(404).json({ error: 'Not found' });
    const prefs: UserPreferences = { costEfficiencyRatio: req.body.costEfficiencyRatio ?? 0.5, defaultOrchestratorModel: req.body.orchestratorModel, thinkingMode: req.body.thinkingMode ?? 'medium', maxConcurrentAgents: 5, autoRetryOnFailure: true };
    const orch = new Orchestrator(proj, pool, prefs, extManager);
    orch.onEvent((evt, data) => wsBroadcast(evt, data));
    orch.execute().catch((err: Error) => wsBroadcast('error', { message: err.message }));
    res.json({ message: 'Started', projectId: proj.id });
  });
  r.post('/:id/abort', (req, res) => { const p = pm.getProject(req.params.id); if (!p) return res.status(404).json({ error: 'Not found' }); p.orchestratorState.status = 'failed'; res.json({ message: 'Aborted' }); });
  r.put('/:id/preferences', (req, res) => { const p = pm.getProject(req.params.id); if (!p) return res.status(404).json({ error: 'Not found' }); if (req.body.costEfficiencyRatio !== undefined) p.orchestratorState.costEfficiencyRatio = req.body.costEfficiencyRatio; res.json(p); });
  r.get('/:id/issues', (req, res) => { const p = pm.getProject(req.params.id); if (!p) return res.status(404).json({ error: 'Not found' }); res.json(p.issueLibrary); });
  r.get('/:id/agents', (req, res) => { const p = pm.getProject(req.params.id); if (!p) return res.status(404).json({ error: 'Not found' }); res.json({ completed: p.completedAgents, pending: p.pendingAgents }); });
  r.delete('/:id', (req, res) => { pm.deleteProject(req.params.id); res.json({ success: true }); });
  return r;
}

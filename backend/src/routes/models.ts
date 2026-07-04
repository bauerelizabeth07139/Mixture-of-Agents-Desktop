import { Router, Request, Response } from 'express';
import { ApiPoolManager } from '../providers/api-pool';
import { ModelCapabilityScorer } from '../models/capability-scorer';

export function createModelRoutes(poolManager: ApiPoolManager): Router {
  const router = Router();

  // Get all available models
  router.get('/', (req: Request, res: Response) => {
    const type = req.query.type as string | undefined;
    const models = poolManager.getAvailableModels(type as any);
    res.json(models);
  });

  // Update model capabilities
  router.put('/:modelId/capabilities', (req: Request, res: Response) => {
    const { modelId } = req.params;
    const caps = req.body;
    for (const provider of poolManager.getAllProviders()) {
      const model = provider.models.find(m => m.id === modelId);
      if (model) {
        Object.assign(model.capabilities, caps);
        return res.json(model);
      }
    }
    res.status(404).json({ error: 'Model not found' });
  });

  // Get selection score for model
  router.post('/:modelId/score', (req: Request, res: Response) => {
    const { modelId } = req.params;
    const { costEfficiencyRatio, taskType } = req.body;
    for (const provider of poolManager.getAllProviders()) {
      const model = provider.models.find(m => m.id === modelId);
      if (model) {
        const score = ModelCapabilityScorer.computeSelectionScore(model.capabilities, costEfficiencyRatio ?? 0.5, taskType ?? 'general');
        return res.json({ modelId, score, capabilities: model.capabilities });
      }
    }
    res.status(404).json({ error: 'Model not found' });
  });

  return router;
}

import { Router } from 'express';
import { ApiPoolManager } from '../providers/api-pool';
import { CapabilityTestEngine } from '../services/capability-test';

export function createTestingRoutes(pool: ApiPoolManager, wsBroadcast: Function) {
  const r = Router();

  // ©¤©¤©¤ Get test cases ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

  r.get('/test-cases', (_req, res) => {
    res.json(CapabilityTestEngine.getTestCases());
  });

  // ©¤©¤©¤ Quick test (single model) ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

  r.post('/:pid/models/:mid/test-quick', async (req, res) => {
    const prov = pool.getProvider(req.params.pid);
    if (!prov) return res.status(404).json({ error: 'Provider not found' });

    const model = prov.models.find(m => m.id === req.params.mid);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    const key = pool.getNextApiKey(prov.id);
    if (!key) return res.status(400).json({ error: 'No available API keys' });

    wsBroadcast('test_started', { modelId: model.modelId, providerName: prov.name, scope: 'quick' });

    try {
      const report = await CapabilityTestEngine.runQuickTest(prov, key, model);
      model.capabilities = report.capabilities;
      wsBroadcast('test_completed', { modelId: model.modelId, report });
      res.json({ scope: 'single', testSuite: 'quick', reports: [report] });
    } catch (err: any) {
      handleTestError(pool, prov.id, key.id, err);
      res.status(500).json({ error: 'Test failed: ' + err.message });
    }
  });

  // ©¤©¤©¤ Full/Standard test (single model) ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

  r.post('/:pid/models/:mid/test-full', async (req, res) => {
    const prov = pool.getProvider(req.params.pid);
    if (!prov) return res.status(404).json({ error: 'Provider not found' });

    const model = prov.models.find(m => m.id === req.params.mid);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    const key = pool.getNextApiKey(prov.id);
    if (!key) return res.status(400).json({ error: 'No available API keys' });

    wsBroadcast('test_started', { modelId: model.modelId, providerName: prov.name, scope: 'standard' });

    try {
      const report = await CapabilityTestEngine.runFullTest(prov, key, model);
      model.capabilities = report.capabilities;
      wsBroadcast('test_completed', { modelId: model.modelId, report });
      res.json({ scope: 'single', testSuite: 'standard', reports: [report] });
    } catch (err: any) {
      handleTestError(pool, prov.id, key.id, err);
      res.status(500).json({ error: 'Test failed: ' + err.message });
    }
  });

  // ©¤©¤©¤ Test all models in a provider (parallel) ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

  r.post('/:pid/test-all', async (req, res) => {
    const prov = pool.getProvider(req.params.pid);
    if (!prov) return res.status(404).json({ error: 'Provider not found' });

    const useQuick = req.body.quick !== false;
    const llmModels = prov.models.filter(m => m.type === 'llm' || m.type === 'vlm');
    if (!llmModels.length) return res.status(400).json({ error: 'No LLM/VLM models found' });

    wsBroadcast('test_started', { providerName: prov.name, scope: 'provider', modelCount: llmModels.length });

    // Run all model tests in parallel
    const settled = await Promise.allSettled(
      llmModels.map(async (model, i) => {
        const key = pool.getNextApiKey(prov.id);
        if (!key) {
          return {
            modelId: model.id,
            modelName: model.modelId,
            providerName: prov.name,
            timestamp: new Date().toISOString(),
            results: [],
            overallScore: 0,
            capabilities: model.capabilities,
            isMultimodal: model.capabilities.multimodal,
            testSuite: useQuick ? 'quick' as const : 'standard' as const,
            error: 'No available API keys',
          };
        }

        wsBroadcast('test_progress', { modelId: model.modelId, current: i + 1, total: llmModels.length });

        try {
          const report = useQuick
            ? await CapabilityTestEngine.runQuickTest(prov, key, model)
            : await CapabilityTestEngine.runFullTest(prov, key, model);
          model.capabilities = report.capabilities;
          return report;
        } catch (err: any) {
          handleTestError(pool, prov.id, key.id, err);
          return {
            modelId: model.id,
            modelName: model.modelId,
            providerName: prov.name,
            timestamp: new Date().toISOString(),
            results: [],
            overallScore: 0,
            capabilities: model.capabilities,
            isMultimodal: model.capabilities.multimodal,
            testSuite: useQuick ? 'quick' as const : 'standard' as const,
            error: err.message,
          };
        }
      }),
    );

    const reports = settled.map(s => s.status === 'fulfilled' ? s.value : null).filter(Boolean);
    wsBroadcast('test_completed', { providerName: prov.name, scope: 'provider', count: reports.length });
    res.json({ scope: 'provider', providerName: prov.name, reports });
  });

  // ©¤©¤©¤ Test all models across all providers (parallel) ©¤©¤©¤©¤

  r.post('/test-all-models', async (req, res) => {
    const providers = pool.getAllProviders().filter(p => p.apiKeys.length > 0);
    if (!providers.length) return res.status(400).json({ error: 'No providers with keys' });

    const useQuick = req.body.quick !== false;

    // Collect all model/provider pairs
    const tasks: { prov: typeof providers[0]; model: typeof providers[0]['models'][0] }[] = [];
    for (const prov of providers) {
      for (const model of prov.models) {
        if (model.type === 'llm' || model.type === 'vlm') {
          tasks.push({ prov, model });
        }
      }
    }

    if (!tasks.length) return res.status(400).json({ error: 'No LLM/VLM models found' });

    wsBroadcast('test_started', { scope: 'all', providerCount: providers.length, modelCount: tasks.length });

    // Run all tests in parallel
    const settled = await Promise.allSettled(
      tasks.map(async ({ prov, model }, i) => {
        const key = pool.getNextApiKey(prov.id);
        if (!key) {
          return {
            modelId: model.id,
            modelName: model.modelId,
            providerName: prov.name,
            timestamp: new Date().toISOString(),
            results: [],
            overallScore: 0,
            capabilities: model.capabilities,
            isMultimodal: model.capabilities.multimodal,
            testSuite: useQuick ? 'quick' as const : 'standard' as const,
            error: 'No available API keys',
          };
        }

        wsBroadcast('test_progress', {
          modelId: model.modelId,
          providerName: prov.name,
          current: i + 1,
          total: tasks.length,
        });

        try {
          const report = useQuick
            ? await CapabilityTestEngine.runQuickTest(prov, key, model)
            : await CapabilityTestEngine.runFullTest(prov, key, model);
          model.capabilities = report.capabilities;
          return report;
        } catch (err: any) {
          handleTestError(pool, prov.id, key.id, err);
          return {
            modelId: model.id,
            modelName: model.modelId,
            providerName: prov.name,
            timestamp: new Date().toISOString(),
            results: [],
            overallScore: 0,
            capabilities: model.capabilities,
            isMultimodal: model.capabilities.multimodal,
            testSuite: useQuick ? 'quick' as const : 'standard' as const,
            error: err.message,
          };
        }
      }),
    );

    const reports = settled.map(s => s.status === 'fulfilled' ? s.value : null).filter(Boolean);
    wsBroadcast('test_completed', { scope: 'all', count: reports.length });
    res.json({ scope: 'all', reports });
  });

  // ©¤©¤©¤ Multimodal test (single model) ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

  r.post('/:pid/models/:mid/test-multimodal', async (req, res) => {
    const prov = pool.getProvider(req.params.pid);
    if (!prov) return res.status(404).json({ error: 'Provider not found' });

    const model = prov.models.find(m => m.id === req.params.mid);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    const key = pool.getNextApiKey(prov.id);
    if (!key) return res.status(400).json({ error: 'No available API keys' });

    const imageUrl = req.body.imageUrl || 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg';

    try {
      const result = await CapabilityTestEngine.testMultimodal(prov, key, model, imageUrl);
      res.json(result);
    } catch (err: any) {
      handleTestError(pool, prov.id, key.id, err);
      res.status(500).json({ error: 'Multimodal test failed: ' + err.message });
    }
  });

  // ©¤©¤©¤ Pool stats ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

  r.get('/pool-stats', (_req, res) => {
    res.json({
      poolCount: pool.getPoolCount(),
      pools: pool.getPoolStats(),
    });
  });

  return r;
}

// ©¤©¤©¤ Helper: evict key on auth/quota failure ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

function handleTestError(pool: ApiPoolManager, providerId: string, keyId: string, error: any): void {
  const status = error?.status || error?.statusCode || error?.response?.status;
  if (status === 401 || status === 403) {
    pool.removeExhaustedKey(providerId, keyId);
  }
}
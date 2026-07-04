import { Router } from 'express';
import { ApiPoolManager } from '../providers/api-pool';
import { CapabilityTestEngine } from '../services/capability-test';

export function createTestingRoutes(pool: ApiPoolManager, wsBroadcast: Function) {
  const r = Router();

  r.get('/test-cases', (_req, res) => { res.json(CapabilityTestEngine.getTestCases()); });

  // Test a single model
  r.post('/:pid/models/:mid/test-full', async (req, res) => {
    const prov = pool.getProvider(req.params.pid);
    if (!prov) return res.status(404).json({ error: 'Provider not found' });
    const model = prov.models.find(m => m.id === req.params.mid);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    const key = pool.getNextApiKey(prov.id);
    if (!key) return res.status(400).json({ error: 'No keys' });
    wsBroadcast('test_started', { modelId: model.modelId, providerName: prov.name, scope: 'single' });
    const report = await CapabilityTestEngine.runFullTest(prov, key, model);
    model.capabilities = report.capabilities;
    wsBroadcast('test_completed', { modelId: model.modelId, report });
    res.json({ scope: 'single', reports: [report] });
  });

  r.post('/:pid/models/:mid/test-quick', async (req, res) => {
    const prov = pool.getProvider(req.params.pid);
    if (!prov) return res.status(404).json({ error: 'Provider not found' });
    const model = prov.models.find(m => m.id === req.params.mid);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    const key = pool.getNextApiKey(prov.id);
    if (!key) return res.status(400).json({ error: 'No keys' });
    const report = await CapabilityTestEngine.runQuickTest(prov, key, model);
    model.capabilities = report.capabilities;
    res.json({ scope: 'single', reports: [report] });
  });

  // Test all models under a provider (URL)
  r.post('/:pid/test-all', async (req, res) => {
    const prov = pool.getProvider(req.params.pid);
    if (!prov) return res.status(404).json({ error: 'Provider not found' });
    const key = pool.getNextApiKey(prov.id);
    if (!key) return res.status(400).json({ error: 'No keys' });

    const llmModels = prov.models.filter(m => m.type === 'llm');
    if (!llmModels.length) return res.status(400).json({ error: 'No LLM models' });

    const useQuick = req.body.quick !== false;
    wsBroadcast('test_started', { providerName: prov.name, scope: 'provider', modelCount: llmModels.length });

    const reports = [];
    for (const model of llmModels) {
      wsBroadcast('test_progress', { modelId: model.modelId, current: reports.length + 1, total: llmModels.length });
      try {
        const report = useQuick
          ? await CapabilityTestEngine.runQuickTest(prov, key, model)
          : await CapabilityTestEngine.runFullTest(prov, key, model);
        model.capabilities = report.capabilities;
        reports.push(report);
      } catch (err: any) {
        reports.push({ modelId: model.id, modelName: model.modelId, providerName: prov.name, timestamp: new Date().toISOString(), results: [], overallScore: 0, capabilities: model.capabilities, error: err.message });
      }
    }

    wsBroadcast('test_completed', { providerName: prov.name, scope: 'provider', count: reports.length });
    res.json({ scope: 'provider', providerName: prov.name, reports });
  });

  // Test ALL available models across all providers
  r.post('/test-all-models', async (req, res) => {
    const providers = pool.getAllProviders().filter(p => p.apiKeys.length > 0);
    if (!providers.length) return res.status(400).json({ error: 'No providers with keys' });

    const useQuick = req.body.quick !== false;
    let totalCount = 0;
    for (const p of providers) totalCount += p.models.filter(m => m.type === 'llm').length;

    wsBroadcast('test_started', { scope: 'all', providerCount: providers.length, modelCount: totalCount });

    const allReports = [];
    let done = 0;

    for (const prov of providers) {
      const key = pool.getNextApiKey(prov.id);
      if (!key) continue;
      const llmModels = prov.models.filter(m => m.type === 'llm');

      for (const model of llmModels) {
        done++;
        wsBroadcast('test_progress', { modelId: model.modelId, providerName: prov.name, current: done, total: totalCount });
        try {
          const report = useQuick
            ? await CapabilityTestEngine.runQuickTest(prov, key, model)
            : await CapabilityTestEngine.runFullTest(prov, key, model);
          model.capabilities = report.capabilities;
          allReports.push(report);
        } catch (err: any) {
          allReports.push({ modelId: model.id, modelName: model.modelId, providerName: prov.name, timestamp: new Date().toISOString(), results: [], overallScore: 0, capabilities: model.capabilities, error: err.message });
        }
      }
    }

    wsBroadcast('test_completed', { scope: 'all', count: allReports.length });
    res.json({ scope: 'all', reports: allReports });
  });

  // Test multimodal
  r.post('/:pid/models/:mid/test-multimodal', async (req, res) => {
    const prov = pool.getProvider(req.params.pid);
    if (!prov) return res.status(404).json({ error: 'Not found' });
    const model = prov.models.find(m => m.id === req.params.mid);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    const key = pool.getNextApiKey(prov.id);
    if (!key) return res.status(400).json({ error: 'No keys' });
    const imageUrl = req.body.imageUrl || 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg';
    res.json(await CapabilityTestEngine.testMultimodal(prov, key, model, imageUrl));
  });

  return r;
}

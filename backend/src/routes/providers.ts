import { Router, Request, Response } from 'express';
import { ApiPoolManager } from '../providers/api-pool';
import { PROVIDER_PRESETS } from '../providers/presets';
import { ModelCapabilityScorer } from '../models/capability-scorer';
import { LLMClient } from '../services/llm-client';
import { v4 as uuid } from 'uuid';
import { Provider, Model, ModelType } from '../types';
import axios from 'axios';

export function createProviderRoutes(pool: ApiPoolManager) {
  const r = Router();

  r.get('/presets', (_req, res) => res.json(PROVIDER_PRESETS));
  r.get('/', (_req, res) => res.json(pool.getAllProviders()));

  // Add provider from preset
  r.post('/from-preset', (req: Request, res: Response) => {
    const preset = PROVIDER_PRESETS.find(p => p.id === req.body.presetId);
    if (!preset) return res.status(404).json({ error: 'Preset not found' });
    const prov: Provider = {
      id: uuid(), name: preset.name, baseUrl: preset.baseUrl, type: preset.type,
      icon: preset.icon, apiKeys: [], models: [], isLocal: preset.id === 'local',
      createdAt: new Date().toISOString(), modelsEndpoint: preset.modelsEndpoint ?? null,
    };
    for (const mid of preset.defaultModels) {
      const caps = ModelCapabilityScorer.getDefaultProfile(mid);
      prov.models.push({ id: uuid(), name: mid, providerId: prov.id, modelId: mid, type: 'llm', capabilities: caps });
    }
    pool.addProvider(prov);
    res.json(prov);
  });

  // Add custom provider
  r.post('/custom', (req: Request, res: Response) => {
    const prov: Provider = {
      id: uuid(), name: req.body.name, baseUrl: req.body.baseUrl,
      type: req.body.type || 'openai-compatible', apiKeys: [], models: [],
      isLocal: false, createdAt: new Date().toISOString(),
      modelsEndpoint: req.body.modelsEndpoint ?? '/models',
    };
    pool.addProvider(prov);
    res.json(prov);
  });

  // Add API key to provider
  r.post('/:pid/keys', (req: Request, res: Response) => {
    const entry = pool.addApiKey(req.params.pid, req.body.key);
    if (!entry) return res.status(400).json({ error: 'Max 50 keys or provider not found' });
    res.json(entry);
  });

  // Remove API key
  r.delete('/:pid/keys/:kid', (req: Request, res: Response) => {
    res.json({ success: pool.removeApiKey(req.params.pid, req.params.kid) });
  });

  // Fetch models from provider API using the key
  r.post('/:pid/fetch-models', async (req: Request, res: Response) => {
    const prov = pool.getProvider(req.params.pid);
    if (!prov) return res.status(404).json({ error: 'Provider not found' });
    const key = pool.getNextApiKey(prov.id);
    if (!key) return res.status(400).json({ error: 'No API keys available. Add a key first.' });

    const endpoint = prov.modelsEndpoint || '/models';
    const url = prov.baseUrl + endpoint;

    try {
      let modelsData: any[] = [];

      if (prov.type === 'anthropic') {
        // Anthropic doesn't have a models endpoint, return defaults
        return res.json({ models: prov.models, source: 'default' });
      }

      const response = await axios.get(url, {
        headers: { 'Authorization': 'Bearer ' + key.key },
        timeout: 15000,
      });

      const data = response.data;
      if (data.data && Array.isArray(data.data)) {
        // OpenRouter/SiliconFlow style with detailed info
        for (const m of data.data) {
          const modelId = m.id || m.model || '';
          if (!modelId) continue;

          // Determine type from context
          let mtype: ModelType = 'llm';
          const idLower = modelId.toLowerCase();
          if (idLower.includes('tts') || idLower.includes('speech')) mtype = 'tts';
          else if (idLower.includes('dall-e') || idLower.includes('image') || idLower.includes('stable-diffusion') || idLower.includes('flux') || idLower.includes('wanx') || idLower.includes('cogview')) mtype = 'image';
          else if (idLower.includes('whisper') || idLower.includes('asr') || idLower.includes('stt')) mtype = 'stt';

          // Extract pricing if available
          let inputPrice = 1, outputPrice = 2;
          if (m.pricing) {
            inputPrice = parseFloat(m.pricing.prompt || m.pricing.input || '1') * 1000000;
            outputPrice = parseFloat(m.pricing.completion || m.pricing.output || '2') * 1000000;
          }

          const existingModel = prov.models.find(em => em.modelId === modelId);
          if (!existingModel) {
            const caps = ModelCapabilityScorer.getDefaultProfile(modelId);
            caps.pricing.inputPer1M = inputPrice;
            caps.pricing.outputPer1M = outputPrice;
            if (m.context_length) caps.context = Math.min(10, Math.log2(m.context_length / 1000));

            prov.models.push({
              id: uuid(),
              name: m.name || m.id,
              providerId: prov.id,
              modelId: modelId,
              type: mtype,
              capabilities: caps,
              contextLength: m.context_length,
              maxOutputLength: m.max_output_length,
              description: m.description,
            });
          }
        }
      } else if (Array.isArray(data)) {
        // Simple array of model IDs
        for (const m of data) {
          const modelId = typeof m === 'string' ? m : m.id;
          if (!modelId) continue;
          if (!prov.models.find(em => em.modelId === modelId)) {
            const caps = ModelCapabilityScorer.getDefaultProfile(modelId);
            prov.models.push({
              id: uuid(), name: modelId, providerId: prov.id,
              modelId, type: 'llm', capabilities: caps,
            });
          }
        }
      }

      res.json({ models: prov.models, source: 'api', count: prov.models.length });
    } catch (err: any) {
      const status = err.response?.status;
      const errMsg = err.response?.data?.error?.message || err.message;
      res.status(status || 500).json({ error: 'Failed to fetch models: ' + errMsg });
    }
  });

  // Add model to provider manually
  r.post('/:pid/models', (req: Request, res: Response) => {
    const prov = pool.getProvider(req.params.pid);
    if (!prov) return res.status(404).json({ error: 'Provider not found' });
    const caps = ModelCapabilityScorer.getDefaultProfile(req.body.modelId);
    const m = { id: uuid(), name: req.body.name || req.body.modelId, providerId: prov.id, modelId: req.body.modelId, type: req.body.type || 'llm', capabilities: caps };
    prov.models.push(m);
    res.json(m);
  });

  // Test a model
  r.post('/:pid/models/:mid/test', async (req: Request, res: Response) => {
    const prov = pool.getProvider(req.params.pid);
    if (!prov) return res.status(404).json({ error: 'Provider not found' });
    const m = prov.models.find(x => x.id === req.params.mid);
    if (!m) return res.status(404).json({ error: 'Model not found' });
    const k = pool.getNextApiKey(prov.id);
    if (!k) return res.status(400).json({ error: 'No keys' });
    res.json(await LLMClient.testModel(prov, k, m.modelId));
  });

  // Remove provider
  r.delete('/:pid', (req: Request, res: Response) => {
    pool.removeProvider(req.params.pid);
    res.json({ success: true });
  });

  return r;
}

import { Router, Request, Response } from 'express';
import { ApiPoolManager } from '../providers/api-pool';
import { PROVIDER_PRESETS } from '../providers/presets';
import { ModelCapabilityScorer } from '../models/capability-scorer';
import { LLMClient } from '../services/llm-client';
import { v4 as uuid } from 'uuid';
import { Provider, Model, ModelType } from '../types';

function classifyModelType(modelId: string, raw?: any): ModelType {
  const id = modelId.toLowerCase();
  if (/\b(video|cogvideo|sora|kling|pika|runway|minimax-video|hailuo|wan-video)\b/.test(id)) return 'video';
  if (raw?.model_type === 'video' || raw?.task === 'video-generation') return 'video';
  if (/\b(dall-?e|stable-?diffusion|sd[123x]|sdxl|flux|midjourney|imagen|wanx|wan\b|cogview|cogview-?4|playground|kandinsky|firefly|ideogram|recraft)\b/.test(id)) return 'image';
  if (/\b(txt2img|img2img|text-to-image|image-generation)\b/.test(id)) return 'image';
  if (raw?.model_type === 'image' || raw?.task === 'text-to-image' || raw?.task === 'image-generation') return 'image';
  if (/\b(tts|text.to.speech|speech.synthesis|voice.synth|bark|coqui|xtts|fish.audio|cosyvoice|chat-tts|f5-tts)\b/.test(id)) return 'tts';
  if (raw?.model_type === 'tts' || raw?.task === 'text-to-speech' || raw?.task === 'tts') return 'tts';
  if (/\b(whisper|asr|stt|speech.to.text|transcri|paraformer|sense.voice|funasr)\b/.test(id)) return 'stt';
  if (raw?.model_type === 'stt' || raw?.task === 'speech-recognition' || raw?.task === 'asr') return 'stt';
  if (/\b(gpt-4o(?!-mini)|gpt-4-turbo|gpt-4-vision|claude-3|claude-sonnet-4|claude-opus|gemini-pro-vision|gemini-1\.5|gemini-2|qwen-vl|qwen2-vl|qwen2\.5-vl|internvl|minicpm-v|llava|cogvlm|glm-4v|deepseek-vl|mimo-v2-omni|mimo-v2\.5|mimo-v2\.5-pro|omni)\b/.test(id)) return 'vlm';
  if (/\b(vision|vl|vlm|multimodal|omni)\b/.test(id)) return 'vlm';
  if (raw?.model_type === 'vlm' || raw?.model_type === 'multimodal') return 'vlm';
  return 'llm';
}

import axios from 'axios';

export function createProviderRoutes(pool: ApiPoolManager) {
  const r = Router();

  r.get('/presets', (_req, res) => res.json(PROVIDER_PRESETS));
  r.get('/', (_req, res) => res.json(pool.getAllProviders()));

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
      prov.models.push({ id: uuid(), name: mid, providerId: prov.id, modelId: mid, type: classifyModelType(mid), capabilities: caps });
    }
    pool.addProvider(prov);
    res.json(prov);
  });

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

  r.post('/:pid/keys', (req: Request, res: Response) => {
    const entry = pool.addApiKey(req.params.pid, req.body.key);
    if (!entry) return res.status(400).json({ error: 'Max 50 keys or provider not found' });
    res.json(entry);
  });

  r.delete('/:pid/keys/:kid', (req: Request, res: Response) => {
    res.json({ success: pool.removeApiKey(req.params.pid, req.params.kid) });
  });

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
        return res.json({ models: prov.models, source: 'default' });
      }
      const response = await axios.get(url, {
        headers: { 'Authorization': 'Bearer ' + key.key },
        timeout: 15000,
      });
      const data = response.data;
      if (data.data && Array.isArray(data.data)) {
        for (const m of data.data) {
          const modelId = m.id || m.model || '';
          if (!modelId) continue;
          const mtype = classifyModelType(modelId, m);
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
        for (const m of data) {
          const modelId = typeof m === 'string' ? m : m.id;
          if (!modelId) continue;
          if (!prov.models.find(em => em.modelId === modelId)) {
            const caps = ModelCapabilityScorer.getDefaultProfile(modelId);
            prov.models.push({
              id: uuid(), name: modelId, providerId: prov.id,
              modelId, type: classifyModelType(modelId), capabilities: caps,
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

  r.post('/:pid/models', (req: Request, res: Response) => {
    const prov = pool.getProvider(req.params.pid);
    if (!prov) return res.status(404).json({ error: 'Provider not found' });
    const caps = ModelCapabilityScorer.getDefaultProfile(req.body.modelId);
    const m = { id: uuid(), name: req.body.name || req.body.modelId, providerId: prov.id, modelId: req.body.modelId, type: req.body.type || 'llm', capabilities: caps };
    prov.models.push(m);
    res.json(m);
  });

  r.post('/:pid/models/:mid/test', async (req: Request, res: Response) => {
    const prov = pool.getProvider(req.params.pid);
    if (!prov) return res.status(404).json({ error: 'Provider not found' });
    const m = prov.models.find(x => x.id === req.params.mid);
    if (!m) return res.status(404).json({ error: 'Model not found' });
    const k = pool.getNextApiKey(prov.id);
    if (!k) return res.status(400).json({ error: 'No keys' });
    res.json(await LLMClient.testModel(prov, k, m.modelId));
  });

  r.delete('/:pid', (req: Request, res: Response) => {
    pool.removeProvider(req.params.pid);
    res.json({ success: true });
  });

  return r;
}

import { Router, Request, Response } from 'express';
import { ApiPoolManager } from '../providers/api-pool';
import { PROVIDER_PRESETS } from '../providers/presets';
import { ModelCapabilityScorer } from '../models/capability-scorer';
import { CapabilityTestEngine } from '../services/capability-test';
import { LLMClient } from '../services/llm-client';
import { v4 as uuid } from 'uuid';
import { Provider, Model, ModelType } from '../types';

// ============================================================
// Comprehensive Image/Video model dictionaries (100+ each)
// ============================================================

const IMAGE_MODEL_NAMES: Set<string> = new Set([
  // OpenAI DALL-E series
  'dall-e-1', 'dall-e-2', 'dall-e-3', 'dall-e-3-hd',
  // Stability AI - Stable Diffusion
  'stable-diffusion-v1', 'stable-diffusion-v1-4', 'stable-diffusion-v1-5',
  'stable-diffusion-v2', 'stable-diffusion-v2-1', 'stable-diffusion-xl',
  'stable-diffusion-xl-1024', 'stable-diffusion-xl-turbo',
  'sd-v1-4', 'sd-v1-5', 'sd-v2-0', 'sd-v2-1', 'sd-xl', 'sdxl', 'sdxl-turbo',
  'sd3', 'sd3-medium', 'sd3-large', 'sd3-large-turbo', 'sd3-5-large',
  'stable-cascade', 'stable-image-core', 'stable-image-ultra',
  'stability-sdxl', 'stability-sd3',
  // Midjourney
  'midjourney', 'midjourney-v4', 'midjourney-v5', 'midjourney-v5a',
  'midjourney-v5b', 'midjourney-v6', 'midjourney-v6a', 'midjourney-v7',
  // Flux (Black Forest Labs)
  'flux', 'flux-schnell', 'flux-dev', 'flux-pro', 'flux-pro-v1.1',
  'flux-1-schnell', 'flux-1-dev', 'flux-1-pro',
  // Adobe Firefly
  'firefly', 'firefly-v1', 'firefly-v2', 'firefly-v3',
  // Google Imagen
  'imagen', 'imagen-1', 'imagen-2', 'imagen-3', 'imagen-3-fast',
  'imagen-4', 'imagen-4-fast',
  // Alibaba Wanx
  'wanx', 'wanx-v1', 'wanx-v1-plus', 'wanx2', 'wanx2-1',
  // Alibaba Tongyi Wanxiang
  'wan', 'wan-v1',
  // Baidu Wenxin
  'wenxin-yige', 'ernie-vilg', 'ernie-vilg-2',
  // Tencent Hunyuan
  'hunyuan-image', 'hunyuan-dit',
  // Zhipu CogView
  'cogview', 'cogview-2', 'cogview-3', 'cogview-3-plus', 'cogview-4',
  'cogview-3-flash', 'cogview-4-250304',
  // Playground AI
  'playground', 'playground-v1', 'playground-v2', 'playground-v2.5',
  // Kandinsky
  'kandinsky', 'kandinsky-2', 'kandinsky-2-1', 'kandinsky-2-2',
  'kandinsky-3', 'kandinsky-3-1',
  // Ideogram
  'ideogram', 'ideogram-v1', 'ideogram-v1-turbo', 'ideogram-v2',
  // Recraft
  'recraft', 'recraft-v1', 'recraft-v2',
  // DeepAI
  'deepai-text2img', 'deepai-image',
  // Artbreeder
  'artbreeder', 'artbreeder-collage',
  // Leonardo AI
  'leonardo', 'leonardo-diffusion', 'leonardo-phoenix',
  // Canva
  'canva-text-to-image',
  // Getty Images
  'getty-generative-ai',
  // Shutterstock
  'shutterstock-generative',
  // Lexica
  'lexica-aperture',
  // Craiyon
  'craiyon', 'craiyon-v3',
  // DreamStudio
  'dreamstudio',
  // NightCafe
  'nightcafe',
  // Jasper Art
  'jasper-art',
  // StarryAI
  'starryai',
  // WOMBO Dream
  'wombo-dream',
  // Picsart
  'picsart-ai',
  // Fotor
  'fotor-ai',
  // Hotpot AI
  'hotpot-ai',
  // Patterned AI
  'patterned-ai',
  // Rosebud AI
  'rosebud-ai',
  // PixelVibe
  'pixelvibe',
  // Freepik
  'freepik-ai',
  // Flair AI
  'flair-ai',
  // Clipdrop
  'clipdrop',
  // Visual Electric
  'visual-electric',
  // Scenario
  'scenario-gg',
  // Astria
  'astria',
  // OctoBase
  'octoai-sdxl',
  // Replicate SDXL
  'replicate-sdxl',
  // ByteDance
  'skymaster-volcengine', 'seedream', 'seedream-3',
  // Kuaishou
  'kolors', 'kolors-v1',
  // Minimax (image)
  'minimax-image', 'abab-image',
  // Bria AI
  'bria-text-to-image',
  // Together AI
  'together-sdxl',
  // Segmind
  'segmind-vega',
  // etc.
]);

const VIDEO_MODEL_NAMES: Set<string> = new Set([
  // OpenAI Sora
  'sora', 'sora-turbo',
  // Runway
  'runway', 'runway-gen-1', 'runway-gen-2', 'runway-gen-3', 'runway-gen-3-alpha',
  'runway-gen-3-alpha-turbo',
  // Pika Labs
  'pika', 'pika-v1', 'pika-v1-5', 'pika-v2',
  // Kling (Kuaishou)
  'kling', 'kling-v1', 'kling-v1-5', 'kling-v1-6',
  // Hailuo AI (MiniMax)
  'hailuo', 'hailuo-video', 'hailuo-01', 'hailuo-video-01',
  // MiniMax
  'minimax-video', 'abab-video', 'video-01',
  // Wan Video (Alibaba)
  'wan-video', 'wan2.1-t2v', 'wan2.1-i2v', 'wan-video-v1',
  // CogVideo (Zhipu/THUDM)
  'cogvideo', 'cogvideox', 'cogvideox-2', 'cogvideox-5b',
  'cogvideox-2b', 'cogvideox-5b-i2v',
  // ByteDance
  'dreamina', 'jimeng', 'magic-video', 'seed-video',
  // Tencent
  'hunyuan-video', 'hunyuan-video-v1',
  // Luma AI
  'luma', 'luma-dream-machine', 'luma-video',
  // Stability AI
  'stable-video-diffusion', 'svd', 'svd-xt',
  // Synthesia
  'synthesia', 'synthesia-v14',
  // HeyGen
  'heygen', 'heygen-v2',
  // D-ID
  'd-id',
  // Colossyan
  'colossyan',
  // Elai
  'elai',
  // Pictory
  'pictory',
  // InVideo
  'invideo-ai',
  // Fliki
  'fliki',
  // Kapwing
  'kapwing',
  // Peech
  'peech',
  // Opus Clip
  'opus-clip',
  // Deepbrain AI
  'deepbrain-ai',
  // Hour One
  'hour-one',
  // Rephrase AI
  'rephrase-ai',
  // Deepshot
  'deepshot',
  // Wondercraft
  'wondercraft',
  // Ssemble
  'ssemble',
  // Nova AI
  'nova-ai',
  // Predis AI
  'predis-ai',
  // Visla
  'visla',
  // Simplified
  'simplified-video',
  // Lumen5
  'lumen5',
  // Animoto
  'animoto',
  // FlexClip
  'flexclip',
  // Veed
  'veed',
  // ClipChamp
  'clipchamp',
  // Descript
  'descript',
  // WeVideo
  'wevideo',
  // Biteable
  'biteable',
  // Powtoon
  'powtoon',
  // Vyond
  'vyond',
  // Raw Shorts
  'rawshorts',
  // Moovly
  'moovly',
  // Renderforest
  'renderforest',
  // Wideo
  'wideo',
  // Magisto
  'magisto',
  // Kizoa
  'kizoa',
  // Hippo Video
  'hippo-video',
  // Covideo
  'covideo',
  // BombBomb
  'bombbomb',
  // Dubverse
  'dubverse',
  // Narakeet
  'narakeet',
  // Steve AI
  'steve-ai',
  // Tavus
  'tavus',
  // Gan AI
  'gan-ai',
  // Argil
  'argil',
  // Kling-V
  'kling-v',
  // Genmo
  'genmo', 'genmo-mochi',
  // PixVerse
  'pixverse', 'pixverse-v3',
  // Haiper
  'haiper', 'haiper-video',
  // Viggle
  'viggle',
  // X AI Grok
  'grok-video',
  // Meta
  'meta-video', 'meta-movie-gen', 'movie-gen',
  // Google Veo
  'veo', 'veo-2', 'veo-3',
  // etc.
]);

// Substring patterns for fuzzy matching (lowercase)
const IMAGE_SUBSTRINGS: string[] = [
  'txt2img', 'img2img', 'text-to-image', 'image-generation', 'image-gen',
  'text2img', 'img2photo', 'txt2photo', 'image-synthesis',
];

const VIDEO_SUBSTRINGS: string[] = [
  'video-generation', 'video-gen', 'text-to-video', 'txt2video', 'txt2vid',
  'img2video', 'image-to-video', 'i2v', 't2v',
];

function classifyModelType(modelId: string, raw?: any): ModelType {
  const id = modelId.toLowerCase();

  // Check API metadata first (most reliable) - any field that identifies model type
  const metaType = (raw?.model_type || raw?.type || raw?.task_type || raw?.category || '').toLowerCase();
  const metaTask = (raw?.task || raw?.task_name || raw?.endpoint_type || '').toLowerCase();
  const metaCaps = JSON.stringify(raw?.capabilities || raw?.features || raw?.supported_tasks || '').toLowerCase();
  if (metaType === 'video' || metaTask.includes('video') || metaCaps.includes('video')) return 'video';
  if (metaType === 'image' || metaTask.includes('image') || metaTask.includes('text-to-image') || metaCaps.includes('image')) return 'image';
  if (metaType === 'tts' || metaTask.includes('tts') || metaTask.includes('text-to-speech') || metaCaps.includes('tts')) return 'tts';
  if (metaType === 'stt' || metaTask.includes('stt') || metaTask.includes('speech-recognition') || metaCaps.includes('stt') || metaTask.includes('asr')) return 'stt';
  // Also check raw.task for video-generation variants
  if (raw?.task === 'video-generation' || raw?.task === 'text-to-video' || raw?.task === 'video-gen') return 'video';
  if (raw?.task === 'text-to-image' || raw?.task === 'image-generation' || raw?.task === 'image-gen') return 'image';

  // Exact match against video model dictionary
  if (VIDEO_MODEL_NAMES.has(id)) return 'video';
  // Exact match against image model dictionary
  if (IMAGE_MODEL_NAMES.has(id)) return 'image';

  // Substring pattern matching for video
  for (const substr of VIDEO_SUBSTRINGS) {
    if (id.includes(substr)) return 'video';
  }
  // Substring pattern matching for image
  for (const substr of IMAGE_SUBSTRINGS) {
    if (id.includes(substr)) return 'image';
  }

  // Regex fallback for video models
  if (/\b(video|cogvideo|sora|kling|pika|runway|minimax-video|hailuo|wan-video|luma|svd|stable-video|dreammachine|movie-gen|veo|mochi|pixverse|haiper|genmo)\b/.test(id)) return 'video';
  // Regex fallback for image models
  if (/\b(dall-?e|stable-?diffusion|sd[123x]|sdxl|flux|midjourney|imagen|wanx|wan\b|cogview|cogview-?4|playground|kandinsky|firefly|ideogram|recraft|seedream|kolors|hunyuan-image|wenxin-yige|deepai-text2img|craiyon)\b/.test(id)) return 'image';

  // TTS models
  if (/\b(tts|text.to.speech|speech.synthesis|voice.synth|bark|coqui|xtts|fish.audio|cosyvoice|chat-tts|f5-tts)\b/.test(id)) return 'tts';
  // STT/ASR models
  if (/\b(whisper|asr|stt|speech.to.text|transcri|paraformer|sense.voice|funasr)\b/.test(id)) return 'stt';

  // All other text models are LLM
  return 'llm';
}

import axios from 'axios';

export function createProviderRoutes(pool: ApiPoolManager) {
  const r = Router();

  r.get('/presets', (_req, res) => res.json(PROVIDER_PRESETS));
  r.get('/', (_req, res) => {
    for (const p of pool.getAllProviders()) {
      for (const k of p.apiKeys) {
        (k as any).concurrentRequests = pool.getKeyConcurrency(k.id);
      }
    }
    res.json(pool.getAllProviders());
  });

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
          const existingModel = prov.models.find(em => em.modelId === modelId);
          if (!existingModel) {
            const caps = ModelCapabilityScorer.getDefaultProfile(modelId);
            if (m.context_length) caps.context = Math.min(10, Math.log2(m.context_length / 1000));
            prov.models.push({
              id: uuid(), name: m.name || m.id, providerId: prov.id,
              modelId, type: mtype, capabilities: caps,
              contextLength: m.context_length, maxOutputLength: m.max_output_length, description: m.description,
            });
          }
        }
      } else if (Array.isArray(data)) {
        for (const m of data) {
          const modelId = typeof m === 'string' ? m : m.id;
          if (!modelId) continue;
          if (!prov.models.find(em => em.modelId === modelId)) {
            const caps = ModelCapabilityScorer.getDefaultProfile(modelId);
            prov.models.push({ id: uuid(), name: modelId, providerId: prov.id, modelId, type: classifyModelType(modelId), capabilities: caps });
          }
        }
      }
      const llmModels = prov.models.filter(m => m.type === 'llm' && (m.capabilities.visionScore === 0 || m.capabilities.audioScore === 0));
      if (llmModels.length > 0 && key) {
        for (const m of llmModels.slice(0, 10)) {
          try {
            const probe = await CapabilityTestEngine.probeCapabilities(prov, key, m);
            if (probe.visionScore > 0) { m.capabilities.visionScore = probe.visionScore; m.capabilities.multimodal = true; }
            if (probe.audioScore > 0) { m.capabilities.audioScore = probe.audioScore; }
          } catch (e: any) { console.log('[Probe] ' + m.modelId + ' error:', e.message); }
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


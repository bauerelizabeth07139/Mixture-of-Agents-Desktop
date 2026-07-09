import { Router } from 'express';
import { ApiPoolManager } from '../providers/api-pool';
import { LLMClient } from '../services/llm-client';

export function createChatRoutes(pool: ApiPoolManager) {
  const r = Router();

  r.post('/', async (req, res) => {
    try {
      const { message, modelId, attachments, thinkingMode, costEfficiencyRatio } = req.body;
      if (!message && (!attachments || attachments.length === 0)) {
        return res.status(400).json({ error: 'Empty message' });
      }

      // Resolve target model/provider
      let provider, model, apiKey;
      if (modelId) {
        const found = pool.findProviderForModel(modelId);
        if (found) { provider = found.provider; model = found.model; apiKey = found.apiKey; }
      }
      if (!provider) {
        // Auto-select: pick first provider+model with active keys
        for (const prov of pool.getAllProviders()) {
          const key = pool.getNextApiKey(prov.id);
          if (!key) continue;
          const llm = prov.models.find(m => m.type === 'llm' || m.type === 'vlm');
          if (llm) { provider = prov; model = llm; apiKey = key; break; }
        }
      }
      if (!provider || !model || !apiKey) {
        return res.status(400).json({ error: 'No available models with active API keys. Add a provider and key first.' });
      }

      // Build messages array
      const messages: Array<{role:string;content:any}> = [
        { role: 'system', content: 'You are a helpful AI assistant in the Mixture of Agents system. Respond concisely and accurately.' },
      ];

      // Check if we should send image content
      const imageAttachments = (attachments || []).filter((a:any) => a.type === 'image');
      const textAttachments = (attachments || []).filter((a:any) => a.type === 'text');

      let userContent: any = message;
      if (imageAttachments.length > 0 && (model.type === 'vlm' || model.capabilities?.multimodal)) {
        // Build multimodal content array
        const contentArr: any[] = [{ type: 'text', text: message || 'Describe this image.' }];
        for (const img of imageAttachments) {
          if (img.data && img.data.startsWith('data:')) {
            contentArr.push({ type: 'image_url', image_url: { url: img.data } });
          }
        }
        userContent = contentArr;
      }

      messages.push({ role: 'user', content: userContent });

      const resp = await LLMClient.chatCompletion(provider, apiKey, {
        messages,
        model: model.modelId,
        temperature: 0.7,
        maxTokens: 4096,
      });

      res.json({
        role: 'orchestrator',
        content: resp.content,
        model: model.name,
        provider: provider.name,
        latencyMs: resp.latencyMs,
        usage: resp.usage,
      });
    } catch (err: any) {
      console.error('[Chat] Error:', err.message);
      res.status(500).json({ error: err.message, role: 'error', content: 'Error: ' + err.message });
    }
  });

  return r;
}

import { Router } from 'express';
import { ApiPoolManager } from '../providers/api-pool';
import { LLMClient } from '../services/llm-client';

// Context compression: sliding window config
const RECENT_MESSAGE_LIMIT = 20; // Keep last N messages in full
const SUMMARY_MAX_CHARS = 200;   // Max chars per old message in summary

/**
 * Compress old messages into a compact summary block.
 * Keeps recent messages intact, summarizes older ones.
 */
function compressHistory(history: Array<{role:string;content:string}>): Array<{role:string;content:string}> {
  if (!history || history.length === 0) return [];
  if (history.length <= RECENT_MESSAGE_LIMIT) return history;

  const oldMessages = history.slice(0, history.length - RECENT_MESSAGE_LIMIT);
  const recentMessages = history.slice(history.length - RECENT_MESSAGE_LIMIT);

  // Build a compact summary of old messages
  const summaryLines: string[] = [];
  for (const msg of oldMessages) {
    if (msg.role === 'system') continue; // skip system msgs in summary
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const truncated = text.length > SUMMARY_MAX_CHARS ? text.slice(0, SUMMARY_MAX_CHARS) + '...' : text;
    const label = msg.role === 'user' ? 'User' : 'Assistant';
    summaryLines.push(`[${label}]: ${truncated}`);
  }

  const summaryBlock = summaryLines.length > 0
    ? [{ role: 'system' as const, content: `[Earlier conversation summary]\n${summaryLines.join('\n')}` }]
    : [];

  return [...summaryBlock, ...recentMessages];
}

export function createChatRoutes(pool: ApiPoolManager) {
  const r = Router();

  r.post('/', async (req, res) => {
    try {
      const { message, modelId, attachments, thinkingMode, costEfficiencyRatio, history } = req.body;
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

      // Build messages array with context compression
      const messages: Array<{role:string;content:any}> = [
        { role: 'system', content: 'You are a helpful AI assistant in the Mixture of Agents system. Respond concisely and accurately.' },
      ];

      // Inject compressed conversation history
      const compressedHistory = compressHistory(history || []);
      for (const msg of compressedHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }

      // Check if we should send image content
      const imageAttachments = (attachments || []).filter((a:any) => a.type === 'image');

      let userContent: any = message;
      if (imageAttachments.length > 0 && (model.type === 'vlm' || model.capabilities?.multimodal)) {
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
        contextCompressed: compressedHistory.length < (history || []).length,
        historySize: (history || []).length,
      });
    } catch (err: any) {
      console.error('[Chat] Error:', err.message);
      const status = err.response?.status;
      let userMsg = err.message;
      if (status === 401 || status === 402 || status === 403) {
        userMsg = 'API Key 无效、额度不足或权限受限，请在「提供商」页面检查并更新 API Key';
      } else if (status === 429) {
        userMsg = 'API 请求频率超限，请稍后再试';
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        userMsg = '无法连接到 API 服务器，请检查提供商 URL 配置';
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        userMsg = 'API 请求超时，请稍后再试';
      }
      res.status(500).json({ error: userMsg, role: 'error', content: userMsg });
    }
  });

  return r;
}
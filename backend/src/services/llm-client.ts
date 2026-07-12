// ============================================================
// LLM Client - Unified API client for all providers
// ============================================================

import axios, { AxiosInstance } from 'axios';
import { Provider, ApiKeyEntry, Model, ModelCapabilityProfile } from '../types';

export interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: any[];
  thinkingEffort?: 'none' | 'low' | 'medium' | 'high';
  timeout?: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: string;
  latencyMs: number;
}

export interface TTSRequest {
  text: string;
  voice?: string;
  speed?: number;
  model: string;
}

export interface ImageGenRequest {
  prompt: string;
  model: string;
  size?: string;
  quality?: string;
  n?: number;
}

export class LLMClient {
  /** Send chat completion to an OpenAI-compatible endpoint */
  static async chatCompletion(
    provider: Provider,
    apiKey: ApiKeyEntry,
    request: ChatRequest
  ): Promise<ChatResponse> {
    const startTime = Date.now();
    const url = `${provider.baseUrl}/chat/completions`;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.key}`,
      };

      // Anthropic uses different header
      if (provider.type === 'anthropic') {
        return await this.anthropicCompletion(provider, apiKey, request);
      }

      const response = await axios.post(url, {
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
        stream: false,
        ...(request.tools ? { tools: request.tools } : {}),
        ...(request.thinkingEffort && request.thinkingEffort !== 'none' ? { reasoning_effort: request.thinkingEffort } : {}),
      }, { headers, timeout: request.timeout || 120000 });

      const data = response.data;
      const latencyMs = Date.now() - startTime;

      return {
        content: data.choices?.[0]?.message?.content || '',
        model: data.model,
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        finishReason: data.choices?.[0]?.finish_reason || 'stop',
        latencyMs,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      if (error.response?.status === 429 || error.response?.status === 402) {
        throw new QuotaExhaustedError(apiKey.id, provider.id, latencyMs);
      }
      throw new LLMError(error.message, provider.id, apiKey.id, latencyMs);
    }
  }

  /** Anthropic-specific completion */
  private static async anthropicCompletion(
    provider: Provider,
    apiKey: ApiKeyEntry,
    request: ChatRequest
  ): Promise<ChatResponse> {
    const startTime = Date.now();
    const url = `${provider.baseUrl}/messages`;

    const systemMsg = request.messages.find(m => m.role === 'system');
    const nonSystemMsgs = request.messages.filter(m => m.role !== 'system');

    try {
      const response = await axios.post(url, {
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        system: systemMsg?.content || '',
        messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content })),
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.key,
          'anthropic-version': '2023-06-01',
        },
        timeout: 120000,
      });

      const data = response.data;
      return {
        content: data.content?.[0]?.text || '',
        model: data.model,
        usage: {
          promptTokens: data.usage?.input_tokens || 0,
          completionTokens: data.usage?.output_tokens || 0,
          totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        },
        finishReason: data.stop_reason || 'end_turn',
        latencyMs: Date.now() - startTime,
      };
    } catch (error: any) {
      if (error.response?.status === 429 || error.response?.status === 402) {
        throw new QuotaExhaustedError(apiKey.id, provider.id, Date.now() - startTime);
      }
      throw new LLMError(error.message, provider.id, apiKey.id, Date.now() - startTime);
    }
  }

  /** Generate image via OpenAI-compatible endpoint */
  static async generateImage(
    provider: Provider,
    apiKey: ApiKeyEntry,
    request: ImageGenRequest
  ): Promise<{ url: string; revisedPrompt?: string }> {
    const url = `${provider.baseUrl}/images/generations`;

    try {
      const response = await axios.post(url, {
        model: request.model,
        prompt: request.prompt,
        size: request.size || '1024x1024',
        quality: request.quality || 'standard',
        n: request.n || 1,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.key}`,
        },
        timeout: 60000,
      });

      return {
        url: response.data.data?.[0]?.url || '',
        revisedPrompt: response.data.data?.[0]?.revised_prompt,
      };
    } catch (error: any) {
      if (error.response?.status === 429) throw new QuotaExhaustedError(apiKey.id, provider.id, 0);
      throw new LLMError(error.message, provider.id, apiKey.id, 0);
    }
  }

  /** Text-to-speech via OpenAI-compatible endpoint */
  static async textToSpeech(
    provider: Provider,
    apiKey: ApiKeyEntry,
    request: TTSRequest
  ): Promise<Buffer> {
    const url = `${provider.baseUrl}/audio/speech`;

    try {
      const response = await axios.post(url, {
        model: request.model,
        input: request.text,
        voice: request.voice || 'alloy',
        speed: request.speed || 1.0,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.key}`,
        },
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      return Buffer.from(response.data);
    } catch (error: any) {
      if (error.response?.status === 429) throw new QuotaExhaustedError(apiKey.id, provider.id, 0);
      throw new LLMError(error.message, provider.id, apiKey.id, 0);
    }
  }

  /** Quick capability test for a model */
  static async testModel(
    provider: Provider,
    apiKey: ApiKeyEntry,
    modelId: string
  ): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      await this.chatCompletion(provider, apiKey, {
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        model: modelId,
        maxTokens: 10,
        temperature: 0,
      });
      return { success: true, latencyMs: Date.now() - startTime };
    } catch (error: any) {
      return { success: false, latencyMs: Date.now() - startTime, error: error.message };
    }
  }
}

export class QuotaExhaustedError extends Error {
  constructor(
    public keyId: string,
    public providerId: string,
    public latencyMs: number
  ) {
    super(`API key quota exhausted for provider ${providerId}`);
    this.name = 'QuotaExhaustedError';
  }
}

export class LLMError extends Error {
  constructor(
    message: string,
    public providerId: string,
    public keyId: string,
    public latencyMs: number
  ) {
    super(message);
    this.name = 'LLMError';
  }
}


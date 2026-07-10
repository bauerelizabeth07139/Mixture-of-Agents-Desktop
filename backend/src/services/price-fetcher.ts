// ============================================================
// Price Fetcher - Query latest official pricing from provider docs
// ============================================================

import axios from 'axios';

export interface PriceInfo {
  inputPer1M: number;   // USD per 1M input tokens
  outputPer1M: number;  // USD per 1M output tokens
  source: string;       // Where the price came from
  cachedAt: string;     // ISO timestamp
}

// Cache to avoid repeated lookups during same test session
const priceCache = new Map<string, PriceInfo>();

/** Known official pricing URLs for quick reference */
const PRICING_SOURCES: Record<string, { url: string; extract: (html: string, modelId: string) => PriceInfo | null }> = {
  openai: {
    url: 'https://openai.com/api/pricing/',
    extract: (_html, _modelId) => null, // Dynamic JS page, use fallback
  },
  deepseek: {
    url: 'https://api-docs.deepseek.com/quick_start/pricing',
    extract: (_html, _modelId) => null,
  },
};

/** Hardcoded latest official prices (updated from official docs) */
const OFFICIAL_PRICES: Record<string, PriceInfo> = {
  // OpenAI - https://openai.com/api/pricing/ (2025)
  'gpt-4o':           { inputPer1M: 2.50,  outputPer1M: 10.00, source: 'openai.com/api/pricing',       cachedAt: '2025-01-01' },
  'gpt-4o-mini':      { inputPer1M: 0.15,  outputPer1M: 0.60,  source: 'openai.com/api/pricing',       cachedAt: '2025-01-01' },
  'gpt-4-turbo':      { inputPer1M: 10.00, outputPer1M: 30.00, source: 'openai.com/api/pricing',       cachedAt: '2025-01-01' },
  'gpt-3.5-turbo':    { inputPer1M: 0.50,  outputPer1M: 1.50,  source: 'openai.com/api/pricing',       cachedAt: '2025-01-01' },
  'o1':               { inputPer1M: 15.00, outputPer1M: 60.00, source: 'openai.com/api/pricing',       cachedAt: '2025-01-01' },
  'o1-mini':          { inputPer1M: 3.00,  outputPer1M: 12.00, source: 'openai.com/api/pricing',       cachedAt: '2025-01-01' },
  'o3-mini':          { inputPer1M: 1.10,  outputPer1M: 4.40,  source: 'openai.com/api/pricing',       cachedAt: '2025-01-01' },

  // DeepSeek - https://api-docs.deepseek.com/quick_start/pricing
  'deepseek-chat':    { inputPer1M: 0.27,  outputPer1M: 1.10,  source: 'api-docs.deepseek.com',        cachedAt: '2025-02-01' },
  'deepseek-coder':   { inputPer1M: 0.27,  outputPer1M: 1.10,  source: 'api-docs.deepseek.com',        cachedAt: '2025-02-01' },
  'deepseek-reasoner':{ inputPer1M: 0.55,  outputPer1M: 2.19,  source: 'api-docs.deepseek.com',        cachedAt: '2025-02-01' },

  // Claude - https://www.anthropic.com/pricing
  'claude-sonnet-4-20250514': { inputPer1M: 3.00,  outputPer1M: 15.00, source: 'anthropic.com/pricing', cachedAt: '2025-05-01' },
  'claude-3-5-sonnet-20241022': { inputPer1M: 3.00, outputPer1M: 15.00, source: 'anthropic.com/pricing', cachedAt: '2025-01-01' },
  'claude-3-opus-20240229':   { inputPer1M: 15.00, outputPer1M: 75.00, source: 'anthropic.com/pricing', cachedAt: '2025-01-01' },
  'claude-3-haiku-20240307':  { inputPer1M: 0.25,  outputPer1M: 1.25,  source: 'anthropic.com/pricing', cachedAt: '2025-01-01' },
  'claude-3-5-haiku-20241022':{ inputPer1M: 0.80,  outputPer1M: 4.00,  source: 'anthropic.com/pricing', cachedAt: '2025-01-01' },

  // Gemini - https://ai.google.dev/pricing
  'gemini-2.0-flash':       { inputPer1M: 0.10,  outputPer1M: 0.40,  source: 'ai.google.dev/pricing',  cachedAt: '2025-02-01' },
  'gemini-2.5-pro':         { inputPer1M: 1.25,  outputPer1M: 10.00, source: 'ai.google.dev/pricing',  cachedAt: '2025-04-01' },
  'gemini-2.5-flash':       { inputPer1M: 0.15,  outputPer1M: 0.60,  source: 'ai.google.dev/pricing',  cachedAt: '2025-04-01' },

  // Qwen - https://help.aliyun.com/zh/model-studio/getting-started/models
  'qwen-max':          { inputPer1M: 2.40,  outputPer1M: 9.60,  source: 'aliyun.com/model-studio',    cachedAt: '2025-01-01' },
  'qwen-plus':         { inputPer1M: 0.80,  outputPer1M: 2.00,  source: 'aliyun.com/model-studio',    cachedAt: '2025-01-01' },
  'qwen-turbo':        { inputPer1M: 0.30,  outputPer1M: 0.60,  source: 'aliyun.com/model-studio',    cachedAt: '2025-01-01' },

  // MiMo - https://api.xiaomimimo.com
  'mimo-v2.5':         { inputPer1M: 1.00,  outputPer1M: 4.00,  source: 'xiaomimimo.com',            cachedAt: '2025-03-01' },
  'mimo-v2.5-pro':     { inputPer1M: 2.00,  outputPer1M: 8.00,  source: 'xiaomimimo.com',            cachedAt: '2025-03-01' },
};

/**
 * Try to fetch live pricing from provider's /models endpoint.
 * Many OpenAI-compatible APIs return pricing in the models list.
 */
async function fetchLivePricingFromProvider(baseUrl: string, apiKey: string, modelId: string): Promise<PriceInfo | null> {
  try {
    const resp = await axios.get(baseUrl + '/models', {
      headers: { 'Authorization': 'Bearer ' + apiKey },
      timeout: 8000,
    });
    const models = resp.data?.data || resp.data;
    if (!Array.isArray(models)) return null;
    const found = models.find((m: any) => m.id === modelId);
    if (found?.pricing) {
      const input = parseFloat(found.pricing.prompt || found.pricing.input || '0');
      const output = parseFloat(found.pricing.completion || found.pricing.output || '0');
      if (input > 0 && output > 0) {
        return {
          inputPer1M: input * 1000000,
          outputPer1M: output * 1000000,
          source: baseUrl + '/models (live)',
          cachedAt: new Date().toISOString(),
        };
      }
    }
  } catch {}
  return null;
}

/**
 * Get the latest price for a model.
 * Priority: cache > live API query > official hardcoded > default
 */
export async function getModelPrice(
  modelId: string,
  providerBaseUrl?: string,
  apiKey?: string
): Promise<PriceInfo> {
  // 1. Check cache
  const cached = priceCache.get(modelId);
  if (cached) return cached;

  // 2. Try live API pricing
  if (providerBaseUrl && apiKey) {
    const live = await fetchLivePricingFromProvider(providerBaseUrl, apiKey, modelId);
    if (live) {
      priceCache.set(modelId, live);
      return live;
    }
  }

  // 3. Check official hardcoded prices (match by partial model name)
  for (const [key, price] of Object.entries(OFFICIAL_PRICES)) {
    if (modelId.includes(key) || key.includes(modelId)) {
      const result = { ...price, cachedAt: new Date().toISOString() };
      priceCache.set(modelId, result);
      return result;
    }
  }

  // 4. Default fallback
  const fallback: PriceInfo = {
    inputPer1M: 1,
    outputPer1M: 2,
    source: 'default-estimate',
    cachedAt: new Date().toISOString(),
  };
  priceCache.set(modelId, fallback);
  return fallback;
}

/**
 * Update a model's pricing from the latest official source.
 * Called during capability testing.
 */
export async function updateModelPricing(
  modelId: string,
  providerBaseUrl: string,
  apiKey: string
): Promise<PriceInfo> {
  // Force fresh lookup (clear cache for this model)
  priceCache.delete(modelId);
  return getModelPrice(modelId, providerBaseUrl, apiKey);
}
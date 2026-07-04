// ============================================================
// Model Capability Scorer - Tests & scores model capabilities
// ============================================================

import { Model, ModelCapabilityProfile, Provider, ApiKeyEntry } from '../types';
import { LLMClient } from '../services/llm-client';

/** Score thresholds for capability testing */
const TEST_PROMPTS = {
  code: 'Write a TypeScript function that implements binary search on a sorted array. Include type annotations and handle edge cases. Return only the code, no explanation.',
  agent: 'You have access to tools. Plan a 3-step approach to: Find all .ts files in a directory, read each one, and count total lines of code. Describe each step with the tool you would use.',
  chat: 'Explain quantum computing to a 10-year-old in 3 sentences.',
  reasoning: 'A farmer has 17 sheep. All but 9 die. How many are left? Think step by step.',
};

/** Known model defaults (pre-populated for common models) */
const KNOWN_MODEL_SCORES: Record<string, Partial<ModelCapabilityProfile>> = {
  'gpt-4o': { code: 9, agent: 9, chat: 9, context: 8, speed: 8, multimodal: true, pricing: { inputPer1M: 2.5, outputPer1M: 10, userEditable: true } },
  'gpt-4o-mini': { code: 7, agent: 7, chat: 8, context: 8, speed: 9, multimodal: true, pricing: { inputPer1M: 0.15, outputPer1M: 0.6, userEditable: true } },
  'gpt-4-turbo': { code: 9, agent: 9, chat: 9, context: 8, speed: 7, multimodal: true, pricing: { inputPer1M: 10, outputPer1M: 30, userEditable: true } },
  'gpt-3.5-turbo': { code: 6, agent: 5, chat: 7, context: 6, speed: 10, multimodal: false, pricing: { inputPer1M: 0.5, outputPer1M: 1.5, userEditable: true } },
  'claude-3-5-sonnet-20241022': { code: 10, agent: 10, chat: 9, context: 8, speed: 7, multimodal: true, pricing: { inputPer1M: 3, outputPer1M: 15, userEditable: true } },
  'claude-3-opus-20240229': { code: 9, agent: 9, chat: 9, context: 8, speed: 5, multimodal: true, pricing: { inputPer1M: 15, outputPer1M: 75, userEditable: true } },
  'deepseek-chat': { code: 8, agent: 7, chat: 8, context: 7, speed: 8, multimodal: false, pricing: { inputPer1M: 0.14, outputPer1M: 0.28, userEditable: true } },
  'deepseek-coder': { code: 9, agent: 7, chat: 6, context: 7, speed: 8, multimodal: false, pricing: { inputPer1M: 0.14, outputPer1M: 0.28, userEditable: true } },
  'deepseek-reasoner': { code: 8, agent: 9, chat: 7, context: 7, speed: 5, multimodal: false, pricing: { inputPer1M: 0.55, outputPer1M: 2.19, userEditable: true } },
  'qwen-max': { code: 8, agent: 8, chat: 9, context: 9, speed: 7, multimodal: false, pricing: { inputPer1M: 2.4, outputPer1M: 9.6, userEditable: true } },
  'glm-4': { code: 7, agent: 7, chat: 8, context: 7, speed: 7, multimodal: false, pricing: { inputPer1M: 1.0, outputPer1M: 1.0, userEditable: true } },
  'glm-4v': { code: 6, agent: 6, chat: 8, context: 7, speed: 7, multimodal: true, pricing: { inputPer1M: 1.0, outputPer1M: 1.0, userEditable: true } },
  'moonshot-v1-128k': { code: 7, agent: 7, chat: 8, context: 9, speed: 7, multimodal: false, pricing: { inputPer1M: 1.26, outputPer1M: 1.26, userEditable: true } },
  'Baichuan4': { code: 7, agent: 6, chat: 8, context: 7, speed: 7, multimodal: false, pricing: { inputPer1M: 1.0, outputPer1M: 1.0, userEditable: true } },
  'abab6.5-chat': { code: 7, agent: 6, chat: 8, context: 7, speed: 7, multimodal: false, pricing: { inputPer1M: 1.0, outputPer1M: 1.0, userEditable: true } },
  'dall-e-3': { code: 0, agent: 0, chat: 0, context: 0, speed: 5, multimodal: false, pricing: { inputPer1M: 0, outputPer1M: 40, userEditable: true } },
  'tts-1': { code: 0, agent: 0, chat: 0, context: 0, speed: 9, multimodal: false, pricing: { inputPer1M: 0, outputPer1M: 15, userEditable: true } },
  'whisper-1': { code: 0, agent: 0, chat: 0, context: 0, speed: 8, multimodal: false, pricing: { inputPer1M: 0, outputPer1M: 6, userEditable: true } },
};

export class ModelCapabilityScorer {
  /** Get default capability profile for known models */
  static getDefaultProfile(modelId: string): ModelCapabilityProfile {
    const known = KNOWN_MODEL_SCORES[modelId];
    if (known) {
      return {
        code: known.code ?? 5,
        agent: known.agent ?? 5,
        chat: known.chat ?? 5,
        context: known.context ?? 5,
        speed: known.speed ?? 5,
        multimodal: known.multimodal ?? false,
        pricing: known.pricing ?? { inputPer1M: 1, outputPer1M: 2, userEditable: true },
      };
    }

    // Default for unknown models
    return {
      code: 5,
      agent: 5,
      chat: 5,
      context: 5,
      speed: 5,
      multimodal: false,
      pricing: { inputPer1M: 1, outputPer1M: 2, userEditable: true },
    };
  }

  /** Run quick capability test on a model */
  static async testAndScore(
    provider: Provider,
    apiKey: ApiKeyEntry,
    modelId: string
  ): Promise<ModelCapabilityProfile> {
    const results: Record<string, { success: boolean; latencyMs: number; score: number }> = {};

    // Test each capability
    for (const [cap, prompt] of Object.entries(TEST_PROMPTS)) {
      try {
        const start = Date.now();
        const response = await LLMClient.chatCompletion(provider, apiKey, {
          messages: [{ role: 'user', content: prompt }],
          model: modelId,
          maxTokens: 500,
          temperature: 0.1,
        });
        const latencyMs = Date.now() - start;

        // Score based on response quality heuristics
        let score = 5;
        if (response.content.length > 50) score += 1;
        if (response.content.length > 200) score += 1;
        if (response.finishReason === 'stop') score += 1;
        if (cap === 'code' && (response.content.includes('function') || response.content.includes('=>'))) score += 2;
        if (cap === 'agent' && (response.content.includes('step') || response.content.includes('tool'))) score += 2;
        if (cap === 'reasoning' && response.content.includes('9')) score += 2;

        score = Math.min(10, score);
        results[cap] = { success: true, latencyMs, score };
      } catch {
        results[cap] = { success: false, latencyMs: 0, score: 3 };
      }
    }

    // Speed score based on average latency
    const avgLatency = Object.values(results).reduce((sum, r) => sum + r.latencyMs, 0) / 4;
    const speedScore = avgLatency < 1000 ? 10 : avgLatency < 3000 ? 8 : avgLatency < 5000 ? 6 : avgLatency < 10000 ? 4 : 2;

    return {
      code: results.code?.score ?? 5,
      agent: results.agent?.score ?? 5,
      chat: results.chat?.score ?? 5,
      context: 5, // Would need longer test
      speed: speedScore,
      multimodal: false, // Would need image test
      pricing: this.getDefaultProfile(modelId).pricing,
    };
  }

  /** Normalize cost-efficiency ratio to a score for model selection */
  static computeSelectionScore(
    capabilities: ModelCapabilityProfile,
    costEfficiencyRatio: number, // 0=efficiency, 1=cost
    taskType: 'code' | 'agent' | 'chat' | 'general'
  ): number {
    // Task-relevant capability score (0-10)
    let capabilityScore: number;
    switch (taskType) {
      case 'code': capabilityScore = capabilities.code; break;
      case 'agent': capabilityScore = capabilities.agent; break;
      case 'chat': capabilityScore = capabilities.chat; break;
      default: capabilityScore = (capabilities.code + capabilities.agent + capabilities.chat) / 3;
    }

    // Speed score (0-10)
    const speedScore = capabilities.speed;

    // Combined efficiency score (higher = more efficient/better)
    const efficiencyScore = (capabilityScore * 0.6 + speedScore * 0.2 + capabilities.context * 0.2);

    // Cost score (lower cost = higher score, 0-10)
    const totalCost = capabilities.pricing.inputPer1M + capabilities.pricing.outputPer1M;
    const maxCost = 100; // $100/1M tokens as ceiling
    const costScore = Math.max(0, 10 - (totalCost / maxCost) * 10);

    // Blend based on ratio: ratio=0 means efficiency, ratio=1 means cost
    const ratio = costEfficiencyRatio;
    const finalScore = efficiencyScore * (1 - ratio) + costScore * ratio;

    return finalScore;
  }
}

import { Provider, Model, ModelCapabilityProfile, ApiKeyEntry } from '../types';
import { LLMClient } from './llm-client';
import { updateModelPricing } from './price-fetcher';

export interface TestCase {
  id: string; name: string; category: 'code' | 'reasoning' | 'instruction' | 'chat';
  description: string; prompt: string; maxTokens: number;
  evaluate: (response: string) => { pass: boolean; correctness: number; details: string };
  difficulty: 'quick' | 'standard';
}

export interface TestResult {
  testId: string; testName: string; category: string;
  score: number; details: string; latencyMs: number; tokensUsed: number;
}

export interface ModelTestReport {
  modelId: string; modelName: string; providerName: string; timestamp: string;
  results: TestResult[]; overallScore: number;
  capabilities: ModelCapabilityProfile;
  testSuite: 'quick' | 'standard'; totalTimeMs: number;
}

const QUICK_TIMEOUT_MS = 180000;
const STANDARD_TIMEOUT_MS = 720000;

function timeScore(latencyMs: number, timeLimitMs: number, passed: boolean, correctness: number = 1): number {
  if (!passed) return 0;
  const half = timeLimitMs * 0.5;
  let base: number;
  if (latencyMs <= half) { base = 5; } else { base = 2 + 3 * (1 - (latencyMs - half) / half); }
  return Math.round(base * correctness * 1000) / 1000;
}
﻿const QUICK_TESTS: TestCase[] = [
  // ===== CODE: Kadane + Binary Search =====
  { id: 'q-code-1', name: 'Kadane Max Subarray', category: 'code', difficulty: 'quick',
    description: 'LeetCode #53 / HumanEval', prompt: 'Write Python function max_subarray(nums: list[int]) -> int returning max sum of contiguous subarray. O(n) Kadane. Return ONLY the function.', maxTokens: 800,
    evaluate: (r) => {
      const checks = [/def\s+max_subarray/i, /for|while/i, /max_sum|current|best|max_ending/i, /return.*max|return/i, r.length > 50 ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/'+checks.length+' checks' };
    }
  },
  { id: 'q-code-2', name: 'Binary Search', category: 'code', difficulty: 'quick',
    description: 'LeetCode #704 / HumanEval', prompt: 'Write Python function binary_search(nums: list[int], target: int) -> int returning index or -1. Iterative. Return ONLY the function.', maxTokens: 600,
    evaluate: (r) => {
      const checks = [/def\s+binary_search/i, /while.*left.*right|while.*low.*high|while.*lo.*hi/i, /mid|middle/i, /left|right|low|high|lo|hi/i, /return.*-1|return.*not\s*found/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/'+checks.length+' checks' };
    }
  },
  // ===== REASONING: GSM8K + ARC Logic =====
  { id: 'q-reason-1', name: 'Multi-step Arithmetic', category: 'reasoning', difficulty: 'quick',
    description: 'GSM8K word problem', prompt: 'A store has 45 apples. They sell 2/3 in the morning, receive 30 more in the afternoon, then sell 12. How many remain? Show each step and the final number.', maxTokens: 500,
    evaluate: (r) => {
      const checks = [/\b30\b/, /\b15\b/, /\b45\b/, /\b33\b/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/4 steps' };
    }
  },
  { id: 'q-reason-2', name: 'Modus Tollens', category: 'reasoning', difficulty: 'quick',
    description: 'ARC-Challenge logic', prompt: 'If it rains, ground is wet. If ground is wet, game is cancelled. Game was NOT cancelled. Did it rain? Explain using modus tollens.', maxTokens: 500,
    evaluate: (r) => {
      const checks = [/not\s*rain|did\s*not\s*rain|no\s*rain|it\s*did\s*not/i, /modus\s*tollens|contrapositive|inverse/i, /ground.*not\s*wet|not.*wet/i, /deduction|conclude|valid/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 2, correctness: m/checks.length, details: m+'/4 logic' };
    }
  },
  // ===== INSTRUCTION: Format + Bullets =====
  { id: 'q-inst-1', name: 'Exact Format', category: 'instruction', difficulty: 'quick',
    description: 'IFEval strict format', prompt: 'Respond with EXACTLY this format, nothing else:\nName: Python\nYear: 1991\nCreator: Guido van Rossum\nParadigm: Multi-paradigm', maxTokens: 150,
    evaluate: (r) => {
      const checks = [/Name:\s*Python/i, /Year:\s*1991/i, /Creator:\s*Guido/i, /Paradigm:\s*Multi/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/4 format' };
    }
  },
  { id: 'q-inst-2', name: 'Bullet Constraints', category: 'instruction', difficulty: 'quick',
    description: 'IFEval bullet format', prompt: 'List exactly 3 benefits of exercise. Each bullet: "- " prefix, one sentence, 10-20 words. No numbering, no extra text.', maxTokens: 400,
    evaluate: (r) => {
      const bullets = r.match(/^-\s+.+$/gm) || [];
      const checks = [bullets.length === 3 ? /./ : /(?!)/, bullets.every((b: string) => /^-\s/.test(b)) ? /./ : /(?!)/, r.length > 50 ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 2, correctness: m/checks.length, details: bullets.length+' bullets, '+m+'/3' };
    }
  },
  // ===== CHAT: Analogy + Translation =====
  { id: 'q-chat-1', name: 'Recursion Analogy', category: 'chat', difficulty: 'quick',
    description: 'MT-Bench analogy', prompt: 'Explain recursion using an analogy a 10-year-old understands. Exactly 3 sentences, no code.', maxTokens: 400,
    evaluate: (r) => {
      const s = r.trim().split(/[.!?]+/).filter((x: string) => x.trim().length > 10);
      const checks = [/recurs|repeat|itself|nested|mirror|doll|loop/i, /base\s*case|stop|end|terminat/i, s.length >= 3 && s.length <= 5 ? /./ : /(?!)/, !/def\s|function\s|return\s/.test(r) ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: s.length+' sent, '+m+'/4' };
    }
  },
  { id: 'q-chat-2', name: 'Multi-translate', category: 'chat', difficulty: 'quick',
    description: 'MT-Bench translation', prompt: 'Translate "Knowledge is power" into Chinese, German, and Arabic. One per line, labeled.', maxTokens: 400,
    evaluate: (r) => {
      const checks = [/chinese|[\u4e00-\u9fff]/i, /german|wissen|[\u00c4-\u00fc]/i, /arabic|[\u0600-\u06ff]/i, r.trim().split('\n').length >= 3 ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/4 langs' };
    }
  },
];

const STANDARD_TESTS: TestCase[] = [
  // ===== CODE: LRU Cache + BFS Shortest Path =====
  { id: 's-code-1', name: 'LRU Cache', category: 'code', difficulty: 'standard',
    description: 'LeetCode #146', prompt: 'Implement class LRUCache with O(1) get/put. OrderedDict or doubly-linked list + dict. Return ONLY Python class.', maxTokens: 1500,
    evaluate: (r) => {
      const checks = [/class\s+LRUCache/i, /def\s+__init__/i, /def\s+get/i, /def\s+put/i, /OrderedDict|DLinkedNode|move_to_end|double.*link/i, /dict|\{|:\s/i, /popitem|remove|evict|delete/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/7 impl' };
    }
  },
  { id: 's-code-2', name: 'Graph BFS Path', category: 'code', difficulty: 'standard',
    description: 'LeetCode #127 variant', prompt: 'Write Python shortest_path(graph: dict[int,list[int]], start: int, end: int) -> list[int] using BFS. Empty list if no path. Return ONLY function.', maxTokens: 1200,
    evaluate: (r) => {
      const checks = [/def\s+shortest_path/i, /deque|queue|BFS|popleft/i, /visited|seen/i, /path|parent|prev/i, /neighbor|adjacent|graph/i, /return\s*\[\]|return\s*path/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/6 BFS' };
    }
  },
  // ===== REASONING: Modular Arithmetic + Induction =====
  { id: 's-reason-1', name: 'Modular Arithmetic', category: 'reasoning', difficulty: 'standard',
    description: 'AIME number theory', prompt: 'Find remainder when 2^100 is divided by 7. Show the power cycle pattern and modular arithmetic. Give final answer.', maxTokens: 800,
    evaluate: (r) => {
      const checks = [/[24].*[24].*[12]|2\^1.*2\^2.*2\^3|cycle/i, /\b3\b.*cycle|cycle.*\b3\b|repeats?\s*(every|every\s*)?\b3\b/i, /100\s*(mod|%)|mod.*3.*1|remainder.*1|100.*3.*1/i, /\b2\b.*answer|answer.*\b2\b|remainder.*2/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/4 modular' };
    }
  },
  { id: 's-reason-2', name: 'Induction Proof', category: 'reasoning', difficulty: 'standard',
    description: 'MATH competition proof', prompt: 'Prove by induction: 1+3+5+...+(2n-1) = n² for all n>=1. Complete proof with base case and inductive step.', maxTokens: 1500,
    evaluate: (r) => {
      const checks = [/base\s*case|n\s*=\s*1|n=1/i, /1\s*=\s*1|1\^?2\s*=\s*1/i, /inductive.*hypothes|assum.*k|suppose.*k/i, /k\s*\+\s*1|k\+1/i, /k\^?2.*2k.*1|\(k\+1\)|k\^2\s*\+/i, /QED|conclusion|proved|thus|therefore/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/6 proof' };
    }
  },
  // ===== INSTRUCTION: Multi-constraint + JSON =====
  { id: 's-inst-1', name: 'Letter-constraint Essay', category: 'instruction', difficulty: 'standard',
    description: 'IFEval multi-constraint', prompt: 'Write exactly 4 sentences about AI. Rules: 1) Each starts with different letter (A,B,C,D) 2) Sentence 3 mentions "learning" 3) Last ends with "future." 4) Max 20 words per sentence.', maxTokens: 500,
    evaluate: (r) => {
      const lines = r.split(/[.!?]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 3);
      const starts = lines.slice(0, 4).map((s: string) => s.charAt(0).toUpperCase());
      const uniqueStarts = new Set(starts);
      const checks = [
        lines.length >= 3 && lines.length <= 5 ? /./ : /(?!)/,
        uniqueStarts.size >= 3 ? /./ : /(?!)/,
        /learning/i.test(r) ? /./ : /(?!)/,
        /future\.?\s*$/mi.test(r.trim()) ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: lines.length+' sent, starts='+starts.join('')+', '+m+'/4' };
    }
  },
  { id: 's-inst-2', name: 'JSON Schema', category: 'instruction', difficulty: 'standard',
    description: 'IFEval JSON compliance', prompt: 'Generate JSON: {"name":string,"age":0-150,"skills":exactly 3 strings,"address":{"city":string,"zip":5-digit string}}. ONLY JSON.', maxTokens: 800,
    evaluate: (r) => {
      try {
        const clean = r.replace(/`json?\s*/g,'').replace(/`\s*/g,'').trim();
        const obj = JSON.parse(clean);
        const checks = [
          typeof obj.name==='string'&&obj.name.length>0,
          typeof obj.age==='number'&&obj.age>=0&&obj.age<=150,
          Array.isArray(obj.skills)&&obj.skills.length===3&&obj.skills.every((s:string)=>typeof s==='string'),
          obj.address&&typeof obj.address==='object',
          typeof obj.address?.city==='string'&&obj.address.city.length>0,
          typeof obj.address?.zip==='string'&&/^\d{5}$/.test(obj.address.zip),
        ];
        const m = checks.filter(Boolean).length;
        return { pass: m>=5, correctness: m/checks.length, details: m+'/6 JSON' };
      } catch { return { pass: false, correctness: 0, details: 'Invalid JSON' }; }
    }
  },
  // ===== CHAT: Code Review + Constrained Story =====
  { id: 's-chat-1', name: 'Code Review', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench expert review', prompt: 'Senior dev review. 3 numbered suggestions, 1-2 sentences each:\n\npython\ndef process(data):\n  result = []\n  for d in data:\n    if d != None:\n      result.append(d * 2)\n  return result', maxTokens: 800,
    evaluate: (r) => {
      const sug = r.match(/\d+[\.\)]\s*.+/g) || [];
      const checks = [sug.length >= 3 ? /./ : /(?!)/, /is\s+not\s*None|is\s+None/i, /type.*hint|annotation|->|:.*list|:.*int/i, /error|edge|empty|exception|comprehension/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: sug.length+' sug, '+m+'/4' };
    }
  },
  { id: 's-chat-2', name: 'Constrained Story', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench creative constraints', prompt: '5-sentence sci-fi story. Rules: 1) First word "The" 2) Last word "stars" 3) One dialogue in quotes 4) 3+ space-related words 5) Each sentence starts with different letter.', maxTokens: 800,
    evaluate: (r) => {
      const sent = r.trim().split(/[.!?]+/).filter((s:string)=>s.trim().length>5);
      const space = (r.match(/\b(star|planet|galaxy|nebula|void|cosmic|orbit|black\s*hole|light.year|space|ship|vessel|crew|warp|galactic|universe|asteroid|moon)\b/gi)||[]);
      const uniqSpace = [...new Set(space.map((s:string)=>s.toLowerCase()))];
      const starts = sent.slice(0,5).map((s:string)=>s.trim().charAt(0).toUpperCase());
      const uniqStarts = new Set(starts);
      const checks = [/\bThe\b/i.test(r)?/./:/(?!)/, /stars\.?\s*$/i.test(r.trim())?/./:/(?!)/, /"[^"]+"|'[^']+'/.test(r)?/./:/(?!)/, uniqSpace.length>=3?/./:/(?!)/, uniqStarts.size>=4?/./:/(?!)/];
      const m = checks.filter(c=>c.test(r)).length;
      return { pass: m>=4, correctness: m/checks.length, details: sent.length+' sent, '+uniqSpace.length+' space, '+m+'/5' };
    }
  },
];

// Test Engine
// ============================================================

export class CapabilityTestEngine {
  private static async runWithConcurrency(tasks: Array<() => Promise<any>>, limit: number): Promise<any[]> {
    const results = new Array(tasks.length);
    let idx = 0;
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (idx < tasks.length) {
        const current = idx++;
        try {
          results[current] = await tasks[current]();
        } catch (err) {
          results[current] = err;
        }
      }
    });
    await Promise.all(workers);
    return results;
  }

  private static estimateSuiteMs(suite: 'quick' | 'standard', testCount: number): number {
    const limit = suite === 'quick' ? 180000 : 720000;
    return Math.min(limit * testCount, suite === 'quick' ? 540000 : 1800000);
  }

  static async runTest(
    provider: Provider,
    apiKey: ApiKeyEntry,
    model: Model,
    tests: TestCase[],
    suite: 'quick' | 'standard',
    onProgress?: (current: number, total: number, testName: string) => void,
    opts?: { perKeyConcurrency?: number; maxTotalConcurrency?: number; activeKeyCount?: number },
  ): Promise<ModelTestReport> {
    const timeLimit = suite === 'quick' ? QUICK_TIMEOUT_MS : STANDARD_TIMEOUT_MS;
    const thinkingEffort = suite === 'quick' ? 'none' : 'high';
    const results: TestResult[] = [];
    const totalStart = Date.now();

    const activeKeys = opts?.activeKeyCount ?? 1;
    const perKey = opts?.perKeyConcurrency ?? (suite === 'quick' ? 20 : 10);
    const maxTotal = opts?.maxTotalConcurrency ?? 80;
    const concurrency = Math.min(perKey, maxTotal, activeKeys, Math.max(1, tests.length));
    let completed = 0;

    const tasks = tests.map((test, i) => async () => {
      try {
        const start = Date.now();
        const resp = await LLMClient.chatCompletion(provider, apiKey, {
          messages: [
            { role: 'system', content: 'You are a precise, helpful assistant. Follow instructions exactly. Output only what is requested.' },
            { role: 'user', content: test.prompt },
          ],
          model: model.modelId,
          maxTokens: test.maxTokens,
          temperature: suite === 'quick' ? 0.1 : 0.2,
          thinkingEffort: thinkingEffort as any,
        });
        const latencyMs = Date.now() - start;
        const evalResult = test.evaluate(resp.content);
        const score = timeScore(latencyMs, timeLimit, evalResult.pass, evalResult.correctness);

        return {
          testId: test.id,
          testName: test.name,
          category: test.category,
          score: Math.round(score * 1000) / 1000,
          details: evalResult.details,
          latencyMs,
          tokensUsed: resp.usage.totalTokens,
        } as TestResult;
      } catch (error: any) {
        return {
          testId: test.id,
          testName: test.name,
          category: test.category,
          score: 0,
          details: 'Error: ' + (error.message || '').slice(0, 120),
          latencyMs: 0,
          tokensUsed: 0,
        } as TestResult;
      }
    });

    const executed = await this.runWithConcurrency(tasks, concurrency);
    for (const item of executed) {
      if (item && typeof item === 'object' && 'testId' in item) {
        results.push(item as TestResult);
      }
    }

    for (const result of results) {
      completed++;
      onProgress?.(completed, tests.length, result.testName);
    }

    const totalTimeMs = Date.now() - totalStart;

    const avg = (cat: string) => {
      const r = results.filter(x => x.category === cat);
      return r.length ? Math.round(r.reduce((s, x) => s + x.score, 0) / r.length * 100) / 100 : 0;
    };
    const avgLatency = results.filter(r => r.latencyMs > 0).reduce((s, r) => s + r.latencyMs, 0) / (results.filter(r => r.latencyMs > 0).length || 1);

    // speed: map avgLatency to 0-5 scale (same as test scores)
    const speedScore = avgLatency < 500 ? 5 : avgLatency < 1000 ? 4.5 : avgLatency < 2000 ? 4 : avgLatency < 4000 ? 3 : avgLatency < 8000 ? 2 : avgLatency < 15000 ? 1 : 0.5;
    // visionScore: map from 0-10 to 0-5
    const visionScaled = Math.min(5, (model.capabilities.visionScore || 0) / 2);
    // context: keep original 0-10 scale, cap at 5 for bar display
    const contextScaled = Math.min(5, model.capabilities.context || 0);

    const capabilities: ModelCapabilityProfile = {
      code: avg('code'),
      agent: avg('reasoning'),
      chat: (avg('chat') + avg('instruction')) / 2,
      context: contextScaled,
      speed: speedScore,
      multimodal: model.capabilities.multimodal,
      visionScore: visionScaled,
      audioScore: Math.min(5, (model.capabilities.audioScore || 0) / 2),
      pricing: model.capabilities.pricing,
    };

    try {
      const price = await updateModelPricing(model.modelId, provider.baseUrl, apiKey.key);
      capabilities.pricing = { inputPer1M: price.inputPer1M, outputPer1M: price.outputPer1M, userEditable: true };
    } catch {}

    const overallScore = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length * 1000) / 1000 : 0;

    return {
      modelId: model.id,
      modelName: model.modelId,
      providerName: provider.name,
      timestamp: new Date().toISOString(),
      results,
      overallScore,
      capabilities,
      testSuite: suite,
      totalTimeMs,
    };
  }

  static async runQuickTest(provider: Provider, apiKey: ApiKeyEntry, model: Model,
    onProgress?: (current: number, total: number, testName: string) => void, opts?: { activeKeyCount?: number }): Promise<ModelTestReport> {
    return this.runTest(provider, apiKey, model, QUICK_TESTS, 'quick', onProgress, { perKeyConcurrency: 20, maxTotalConcurrency: 80, activeKeyCount: opts?.activeKeyCount ?? 1 });
  }

  static async runFullTest(provider: Provider, apiKey: ApiKeyEntry, model: Model,
    onProgress?: (current: number, total: number, testName: string) => void, opts?: { activeKeyCount?: number }): Promise<ModelTestReport> {
    return this.runTest(provider, apiKey, model, STANDARD_TESTS, 'standard', onProgress, { perKeyConcurrency: 10, maxTotalConcurrency: 80, activeKeyCount: opts?.activeKeyCount ?? 1 });
  }

  static async testMultimodal(provider: Provider, apiKey: ApiKeyEntry, model: Model, imageUrl: string): Promise<{ score: number; details: string; latencyMs: number }> {
    const start = Date.now();
    try {
      const resp = await LLMClient.chatCompletion(provider, apiKey, {
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'Describe this image. State: 1) main object, 2) dominant color, 3) approximate count of distinct objects.' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ] as any }],
        model: model.modelId, maxTokens: 2000, temperature: 0.1,
      });
      const latencyMs = Date.now() - start;
      const r = resp.content.toLowerCase();
      let score = 0;
      if (r.length > 30) score += 2;
      if (r.length > 100) score += 1;
      if (/\b(cat|dog|person|tree|car|building|flower|bird)\b/i.test(r)) score += 3;
      if (/\b(red|blue|green|white|black|yellow|brown|gray|grey)\b/i.test(r)) score += 2;
      if (/\b\d+\b/.test(r)) score += 1;
      if (latencyMs < 5000) score += 1;
      score = Math.min(10, score);
      return { score, details: resp.content.slice(0, 200), latencyMs };
    } catch (error: any) {
      return { score: 0, details: 'Error: ' + error.message.slice(0, 100), latencyMs: Date.now() - start };
    }
  }

  static getTestCases(): TestCase[] { return [...QUICK_TESTS, ...STANDARD_TESTS]; }
}
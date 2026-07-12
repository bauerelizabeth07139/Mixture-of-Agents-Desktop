import { Provider, Model, ModelCapabilityProfile, ApiKeyEntry } from '../types';
import { LLMClient } from './llm-client';
import { updateModelPricing } from './price-fetcher';

// ============================================================
// Capability Test Suite v3 - Authoritative benchmarks, time-based scoring
// ============================================================

export interface TestCase {
  id: string; name: string; category: 'code' | 'reasoning' | 'instruction' | 'chat';
  description: string; prompt: string; maxTokens: number;
  evaluate: (response: string) => { pass: boolean; details: string };
  difficulty: 'quick' | 'standard';
}

export interface TestResult {
  testId: string; testName: string; category: string;
  score: number; // 0-5 time-based
  details: string; latencyMs: number; tokensUsed: number;
}

export interface ModelTestReport {
  modelId: string; modelName: string; providerName: string; timestamp: string;
  results: TestResult[]; overallScore: number;
  capabilities: ModelCapabilityProfile;
  testSuite: 'quick' | 'standard';
  totalTimeMs: number;
}

// --- Time limits ---
const QUICK_TIMEOUT_MS = 180000;   // 3 min per test
const STANDARD_TIMEOUT_MS = 720000; // 12 min per test

// --- Time-based scoring ---
// Solved within 50% time limit => 5.0, linear decay to 2.0 at 100% time; unsolved => 0
function timeScore(latencyMs: number, timeLimitMs: number, passed: boolean): number {
  if (!passed) return 0;
  const half = timeLimitMs * 0.5;
  if (latencyMs <= half) return 5;
  // linear interpolation: half -> 5, full -> 2
  return 2 + (5 - 2) * (1 - (latencyMs - half) / half);
}

// ============================================================
// TEST BANKS - Sourced from authoritative benchmarks
// code: HumanEval, MBPP patterns
// reasoning: GSM8K, MATH, ARC patterns
// instruction: IFEval patterns
// chat: MT-Bench patterns
// ============================================================

const QUICK_TESTS: TestCase[] = [
  // --- Code (4 tests) - HumanEval style ---
  { id: 'q-code-1', name: 'FizzBuzz', category: 'code', difficulty: 'quick',
    description: 'Classic FizzBuzz (HumanEval-style)',
    prompt: 'Write a Python function fizzbuzz(n: int) -> list[str] that returns ["1","2","Fizz","4","Buzz",...] for 1..n. Multiples of 3="Fizz", 5="Buzz", both="FizzBuzz". Return ONLY the function.',
    maxTokens: 800,
    evaluate: (r) => {
      const has = /def\s+fizzbuzz/i.test(r) && /for.*in\s+range/i.test(r) && /15|%.*15/i.test(r) && /return/i.test(r);
      return { pass: has, details: has ? 'Correct' : 'Missing logic' };
    }
  },
  { id: 'q-code-2', name: 'Two Sum', category: 'code', difficulty: 'quick',
    description: 'Two Sum (LeetCode #1)',
    prompt: 'Write Python function two_sum(nums: list[int], target: int) -> list[int] returning indices of two numbers that add to target. Exactly one solution exists. Return ONLY the function.',
    maxTokens: 600,
    evaluate: (r) => {
      const has = /def\s+two_sum/i.test(r) && (/dict|hashmap|enumerate/i.test(r) || /\{.*:.*\}/i.test(r));
      return { pass: has, details: has ? 'O(n) solution' : 'Missing or brute-force' };
    }
  },  // --- Reasoning (3 tests) - GSM8K/ARC style ---
  { id: 'q-reason-1', name: 'Multi-step Arithmetic', category: 'reasoning', difficulty: 'quick',
    description: 'GSM8K-style word problem',
    prompt: 'A store sells shirts for $15 each. On Monday they sold 23 shirts. On Tuesday they sold 17 shirts. On Wednesday they sold twice as many as Monday. What was the total revenue for the 3 days? Answer with just the dollar amount.',
    maxTokens: 400,
    evaluate: (r) => {
      const has = /\$?\s*945\b/.test(r) || /945/.test(r);
      return { pass: has, details: has ? 'Correct: $945' : 'Wrong answer' };
    }
  },
  { id: 'q-reason-2', name: 'Logic Deduction', category: 'reasoning', difficulty: 'quick',
    description: 'ARC-style logic puzzle',
    prompt: 'If all roses are flowers, and some flowers fade quickly, can we conclude that some roses fade quickly? Answer YES or NO with one sentence of reasoning.',
    maxTokens: 300,
    evaluate: (r) => {
      const has = /\bno\b/i.test(r) && (/not necessarily|cannot|doesn.t follow|not.*valid/i.test(r));
      return { pass: has, details: has ? 'Correct: cannot conclude' : 'Wrong logic' };
    }
  },  // --- Instruction (2 tests) - IFEval style ---
  { id: 'q-inst-1', name: 'Strict Format', category: 'instruction', difficulty: 'quick',
    description: 'IFEval strict format following',
    prompt: 'Respond with EXACTLY this format, nothing else:\nName: GPT-4\nYear: 2023\nType: Language Model\nWords: 3\nNo extra text before or after.',
    maxTokens: 200,
    evaluate: (r) => {
      const lines = r.trim().split('\n').filter(l => l.trim());
      const hasName = /^Name:\s*GPT-4/m.test(r);
      const hasYear = /^Year:\s*2023/m.test(r);
      const hasType = /^Type:\s*Language Model/m.test(r);
      const hasWords = /^Words:\s*3/m.test(r);
      const pass = hasName && hasYear && hasType && hasWords && lines.length <= 5;
      return { pass, details: pass ? 'Perfect compliance' : 'Format violation' };
    }
  },
  { id: 'q-inst-2', name: 'Word Constraint', category: 'instruction', difficulty: 'quick',
    description: 'IFEval word count constraint',
    prompt: 'Explain what a computer is in EXACTLY 10 words. Not 9, not 11. Exactly 10. Start with "A computer is".',
    maxTokens: 100,
    evaluate: (r) => {
      const match = r.trim().match(/A computer is\s+(.+)/i);
      const text = match ? match[1].trim() : r.trim();
      const words = text.split(/\s+/).filter(w => w.length > 0);
      const totalWords = match ? words.length + 2 : words.length;
      const pass = Math.abs(totalWords - 10) === 0;
      return { pass, details: `Got ${totalWords} words` };
    }
  },
  // --- Chat (1 test) - MT-Bench style ---
  { id: 'q-chat-1', name: 'Concise Knowledge', category: 'chat', difficulty: 'quick',
    description: 'MT-Bench concise response quality',
    prompt: 'In exactly 3 sentences, explain how a neural network learns. No bullet points, no numbered lists.',
    maxTokens: 300,
    evaluate: (r) => {
      const sentences = r.trim().split(/[.!?]+/).filter(s => s.trim().length > 5);
      const pass = sentences.length >= 3 && sentences.length <= 4 && r.length > 60;
      return { pass, details: `${sentences.length} sentences, ${r.length} chars` };
    }
  },
];

const STANDARD_TESTS: TestCase[] = [
  // --- Code (4 tests) - Harder HumanEval/LeetCode ---
  { id: 's-code-1', name: 'LRU Cache', category: 'code', difficulty: 'standard',
    description: 'LRU Cache (LeetCode #146)',
    prompt: 'Implement a class LRUCache with:\n- __init__(self, capacity: int)\n- get(self, key: int) -> int (return value or -1)\n- put(self, key: int, value: int) -> None\nBoth operations must be O(1). Use OrderedDict or doubly-linked list + dict. Return ONLY the class.',
    maxTokens: 1200,
    evaluate: (r) => {
      const has = /class\s+LRUCache/i.test(r) && (/OrderedDict|move_to_end|DLinkedNode|double/i.test(r)) && /def\s+(get|put)/i.test(r);
      return { pass: has, details: has ? 'O(1) LRU implementation' : 'Missing or incorrect' };
    }
  },
  { id: 's-code-2', name: 'Binary Tree Level Order', category: 'code', difficulty: 'standard',
    description: 'Binary Tree Level Order Traversal (LeetCode #102)',
    prompt: 'Write Python function level_order(root: TreeNode | None) -> list[list[int]] for level-order traversal. Include TreeNode class definition. Return ONLY the code.',
    maxTokens: 800,
    evaluate: (r) => {
      const has = /def\s+level_order/i.test(r) && (/deque|queue|BFS|level/i.test(r)) && /TreeNode/i.test(r);
      return { pass: has, details: has ? 'BFS level traversal' : 'Missing BFS logic' };
    }
  },  // --- Reasoning (3 tests) - MATH/Competition style ---
  { id: 's-reason-1', name: 'Combinatorics', category: 'reasoning', difficulty: 'standard',
    description: 'MATH-competition level combinatorics',
    prompt: 'In how many ways can 8 people be seated at a round table if two specific people must NOT sit next to each other? Show your reasoning step by step and give the final number.',
    maxTokens: 800,
    evaluate: (r) => {
      const has = /\b3600\b/.test(r) || /5040.*1440/i.test(r) || /7!.*2.*6!/i.test(r);
      return { pass: has, details: has ? 'Correct: 3600' : 'Wrong combinatorics' };
    }
  },
  { id: 's-reason-2', name: 'Proof by Contradiction', category: 'reasoning', difficulty: 'standard',
    description: 'Mathematical proof reasoning',
    prompt: 'Prove by contradiction that sqrt(2) + sqrt(3) is irrational. Write a complete, rigorous proof.',
    maxTokens: 1200,
    evaluate: (r) => {
      const has = (/contradiction|irrational/i.test(r)) && (/\^2|square|squared/i.test(r)) && (/rational|integer|even|odd|prime/i.test(r)) && r.length > 200;
      return { pass: has, details: has ? 'Valid proof structure' : 'Incomplete proof' };
    }
  },  // --- Instruction (2 tests) - Complex IFEval ---
  { id: 's-inst-1', name: 'Multi-constraint Output', category: 'instruction', difficulty: 'standard',
    description: 'Multiple simultaneous constraints',
    prompt: 'Write a recipe for pancakes following ALL these rules:\n1. Exactly 5 steps\n2. Each step starts with a number and period (e.g. "1.")\n3. Each step is between 15-25 words\n4. Step 3 must mention "butter"\n5. The last word of step 5 must be "golden"\n6. No step may use the word "then"\n7. Include exactly 3 ingredients mentioned total across all steps',
    maxTokens: 600,
    evaluate: (r) => {
      const steps = r.match(/^\d+\.\s*.+$/gm) || [];
      const has5 = steps.length === 5;
      const hasButter = /3\..*butter/i.test(r);
      const endsGolden = /golden\.?\s*$/mi.test(r);
      const pass = has5 && hasButter && endsGolden;
      return { pass, details: `${steps.length} steps, butter:${hasButter}, golden:${endsGolden}` };
    }
  },
  { id: 's-inst-2', name: 'Structured Generation', category: 'instruction', difficulty: 'standard',
    description: 'Complex structured output',
    prompt: 'Generate a JSON object representing a library with exactly 3 books. Each book must have: title (string), author (string), year (number 1900-2000), rating (float 3.0-5.0). The library must have a "name" field. Output ONLY valid JSON, no markdown, no explanation.',
    maxTokens: 400,
    evaluate: (r) => {
      try {
        const clean = r.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
        const obj = JSON.parse(clean);
        const pass = obj.name && Array.isArray(obj.books) && obj.books.length === 3 &&
          obj.books.every((b: any) => b.title && b.author && b.year >= 1900 && b.year <= 2000 && b.rating >= 3.0 && b.rating <= 5.0);
        return { pass, details: pass ? 'Valid structured JSON' : 'Invalid structure' };
      } catch { return { pass: false, details: 'Invalid JSON' }; }
    }
  },
  // --- Chat (1 test) - MT-Bench harder ---
  { id: 's-chat-1', name: 'Roleplay Quality', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench roleplay and reasoning',
    prompt: 'You are a senior Python developer doing a code review. Review this code and give exactly 3 specific, actionable suggestions:\n\n```python\ndef get_data(url):\n    import requests\n    r = requests.get(url)\n    return r.json()\n\ndef process(items):\n    result = []\n    for i in items:\n        if i > 0:\n            result.append(i * 2)\n    return result\n```',
    maxTokens: 800,
    evaluate: (r) => {
      const suggestions = r.match(/\d+[\.\)]\s*.+/g) || [];
      const hasErrorHandling = /error|exception|try|except|timeout|status/i.test(r);
      const hasTypeHint = /type|hint|annotation|Optional|List/i.test(r);
      const pass = suggestions.length >= 3 && hasErrorHandling && r.length > 150;
      return { pass, details: `${suggestions.length} suggestions, error handling: ${hasErrorHandling}` };
    }
  },
];

// ============================================================
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
        const score = timeScore(latencyMs, timeLimit, evalResult.pass);

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

    const capabilities: ModelCapabilityProfile = {
      code: avg('code'),
      agent: avg('reasoning'),
      chat: (avg('chat') + avg('instruction')) / 2,
      context: model.capabilities.context,
      speed: avgLatency < 1000 ? 10 : avgLatency < 2000 ? 8 : avgLatency < 4000 ? 6 : avgLatency < 8000 ? 4 : 2,
      multimodal: model.capabilities.multimodal,
      visionScore: model.capabilities.visionScore || 0,
      audioScore: model.capabilities.audioScore || 0,
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
        model: model.modelId, maxTokens: 800, temperature: 0.1,
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
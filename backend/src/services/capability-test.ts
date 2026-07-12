import { Provider, Model, ModelCapabilityProfile, ApiKeyEntry } from '../types';
import { LLMClient } from './llm-client';
import { updateModelPricing } from './price-fetcher';

export interface TestCase {
  id: string; name: string; category: 'code' | 'reasoning' | 'instruction' | 'chat';
  description: string; prompt: string; maxTokens: number;
  evaluate: (response: string) => { pass: boolean; correctness: number; details: string };
  difficulty: 'quick' | 'standard';
}
export interface TestResult { testId: string; testName: string; category: string; score: number; details: string; latencyMs: number; tokensUsed: number; }
export interface ModelTestReport { modelId: string; modelName: string; providerName: string; timestamp: string; results: TestResult[]; overallScore: number; capabilities: ModelCapabilityProfile; testSuite: 'quick' | 'standard'; totalTimeMs: number; }

const QUICK_TIMEOUT_MS = 180000;
const STANDARD_TIMEOUT_MS = 720000;

function timeScore(latencyMs: number, timeLimitMs: number, passed: boolean, correctness: number = 1): number {
  if (!passed) return 0;
  const half = timeLimitMs * 0.5;
  let base: number;
  if (latencyMs <= half) { base = 5; } else { base = 2 + 3 * (1 - (latencyMs - half) / half); }
  return Math.round(base * correctness * 1000) / 1000;
}

const QUICK_TESTS: TestCase[] = [
  { id: 'q-code-1', name: 'Rotate Array', category: 'code', difficulty: 'quick',
    description: 'LeetCode #56', prompt: 'Write Python function merge(intervals: list[list[int]]) -> list[list[int]] that merges all overlapping intervals. Return ONLY the function.', maxTokens: 800,
    evaluate: (r) => {
      const checks = [/def\s+rotate/i, /k\s*%|k\s*mod|reverse|n\s*-\s*k/i, /nums|len|length/i, /return|None/i, r.length > 50 ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/'+checks.length+' checks' };
    }
  },
  { id: 'q-code-2', name: 'Valid BST', category: 'code', difficulty: 'quick',
    description: 'LeetCode #208', prompt: 'Implement a Trie (prefix tree) with insert(word), search(word)->bool, startsWith(prefix)->bool. Return ONLY the Python class.', maxTokens: 800,
    evaluate: (r) => {
      const checks = [/def\s+is_valid_bst|def\s+isValidBST/i, /class\s+TreeNode/i, /left|right/i, /float|inf|None|NoneType|less|greater/i, /inorder|recurs|helper|range/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/'+checks.length+' checks' };
    }
  },
  { id: 'q-reason-1', name: 'Factory Widgets', category: 'reasoning', difficulty: 'quick',
    description: 'GSM8K harder', prompt: 'A train travels 120km at 60km/h, stops for 15min, then travels 180km at 90km/h. What is the average speed for the entire journey (including stop time)? Show each step with exact values.', maxTokens: 600,
    evaluate: (r) => {
      const checks = [/[12].*defect|5.*%|240.*0\.05|240.*5/, /228|good|remaining|non.?defect/, /37|leftover|total|265/, /33.*box|full.*box|box.*33/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/4 steps' };
    }
  },
  { id: 'q-reason-2', name: 'Logic Puzzle', category: 'reasoning', difficulty: 'quick',
    description: 'ARC harder', prompt: 'Five houses in a row are painted red, blue, green, yellow, white. 1) Red is left of blue. 2) Green is immediately right of yellow. 3) White is not adjacent to green. 4) Yellow is not at either end. What is the order? Show deduction.', maxTokens: 600,
    evaluate: (r) => {
      const checks = [/yellow|green/i, /red|blue/i, /white/i, /order|position|left|right|adjacent/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 2, correctness: m/checks.length, details: m+'/4 logic' };
    }
  },
  { id: 'q-inst-1', name: 'YAML Format', category: 'instruction', difficulty: 'quick',
    description: 'IFEval strict YAML', prompt: 'Respond with EXACTLY this YAML format, nothing else:\nlanguage: Python\nversion: 3.12\nfeatures:\n  - dynamic typing\n  - garbage collection\n  - list comprehensions', maxTokens: 200,
    evaluate: (r) => {
      const checks = [/language:\s*Python/i, /version:\s*3\.12/i, /features:/i, /dynamic\s*typing|garbage|list\s*comprehension/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/4 format' };
    }
  },
  { id: 'q-inst-2', name: 'Bullet Constraints', category: 'instruction', difficulty: 'quick',
    description: 'IFEval bullets', prompt: 'List exactly 3 benefits of exercise. Each bullet: "- " prefix, one sentence, 10-20 words. No numbering, no extra text.', maxTokens: 400,
    evaluate: (r) => {
      const bullets = r.match(/^-.+$/gm) || [];
      const checks = [bullets.length === 3 ? /./ : /(?!)/, bullets.every((b: string) => /^-\s/.test(b)) ? /./ : /(?!)/, r.length > 50 ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 2, correctness: m/checks.length, details: bullets.length+' bullets, '+m+'/3' };
    }
  },
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
  { id: 's-code-1', name: 'LRU Cache', category: 'code', difficulty: 'standard',
    description: 'LeetCode #146', prompt: 'Implement class LRUCache with O(1) get/put. OrderedDict or doubly-linked list + dict. Return ONLY Python class.', maxTokens: 1500,
    evaluate: (r) => {
      const checks = [/class\s+LRUCache/i, /def\s+__init__/i, /def\s+get/i, /def\s+put/i, /OrderedDict|DLinkedNode|move_to_end|double.*link/i, /dict|\{|:\s/i, /popitem|remove|evict|delete/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/7 impl' };
    }
  },
  { id: 's-code-2', name: 'Topological Sort', category: 'code', difficulty: 'standard',
    description: 'LeetCode #200', prompt: 'Write Python function num_islands(grid: list[list[str]]) -> int counting connected 1s (land) in a 2D grid of 0s and 1s. Return ONLY the function.', maxTokens: 1200,
    evaluate: (r) => {
      const checks = [/def\s+find_order/i, /deque|queue|BFS|popleft|topological/i, /prerequisite|graph|adjacen/i, /indegree|in_degree|degree/i, /append|result|order/i, /return\s*\[\]|return\s*result/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/6 topo' };
    }
  },
  { id: 's-reason-1', name: 'Modular Arithmetic', category: 'reasoning', difficulty: 'standard',
    description: 'AIME number theory', prompt: 'Find the last two digits of 7^2024. Show the cycle pattern of last two digits and modular arithmetic. Give the final two-digit answer.', maxTokens: 800,
    evaluate: (r) => {
      const checks = [/07|49|43|01|cycle|pattern|last.*two/i, /\b4\b.*cycle|cycle.*\b4\b|repeats?.*\b4\b|period/i, /2024\s*(mod|%)|mod.*4|remainder.*0/i, /\b01\b|answer.*01|last.*two.*01/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/4 modular' };
    }
  },
  { id: 's-reason-2', name: 'Sum of Squares Proof', category: 'reasoning', difficulty: 'standard',
    description: 'MATH competition', prompt: 'Prove by induction: 1^2+2^2+...+n^2 = n(n+1)(2n+1)/6 for all n>=1. Complete proof with base case and inductive step. Show all algebra.', maxTokens: 2000,
    evaluate: (r) => {
      const checks = [/base\s*case|n\s*=\s*1|n=1/i, /1\s*=\s*1|1\s*\*\s*2\s*\*\s*3|1\^2.*=.*1/i, /inductive.*hypothes|assum.*k|suppose.*k/i, /k\s*\+\s*1|k\+1/i, /k\s*\(k\s*\+\s*1\)\s*\(2k\s*\+\s*1\)|sigma|summation/i, /\(k\s*\+\s*1\)\s*\(k\s*\+\s*2\)\s*\(2k\s*\+\s*3\)|2k\s*\+\s*3/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/6 proof' };
    }
  },
  { id: 's-inst-1', name: 'Quantum Essay', category: 'instruction', difficulty: 'standard',
    description: 'IFEval expert', prompt: 'Write exactly 5 sentences about machine learning. Rules: 1) Each starts with different letter (M,A,C,I,N) 2) Sentence 2 contains "gradient" 3) Sentence 4 is a question 4) Last ends with "intelligence." 5) No sentence may contain the word "is" 6) Each sentence 10-18 words.', maxTokens: 600,
    evaluate: (r) => {
      const lines = r.split(/[.!?]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 3);
      const starts = lines.slice(0, 5).map((s: string) => s.charAt(0).toUpperCase());
      const uniqStarts = new Set(starts);
      const checks = [
        lines.length >= 4 && lines.length <= 6 ? /./ : /(?!)/,
        uniqStarts.size >= 4 ? /./ : /(?!)/,
        /entanglement/i.test(r) ? /./ : /(?!)/,
        /computing\.?\s*$/mi.test(r.trim()) ? /./ : /(?!)/,
        !/\bthe\b/i.test(r) ? /./ : /(?!)/, !/\bis\b/i.test(r) ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: lines.length+' sent, starts='+starts.join('')+', '+m+'/5' };
    }
  },
  { id: 's-inst-2', name: 'Complex JSON', category: 'instruction', difficulty: 'standard',
    description: 'IFEval complex JSON', prompt: 'Generate JSON company: {"name":string,"founded":1900-2024,"employees":[{"name":string,"role":string,"salary":number>30000}],"active":boolean,"website":https URL,"rating":float 1.00-5.00 2 decimals}. 3 employees, ONLY JSON.', maxTokens: 1000,
    evaluate: (r) => {
      try {
        const clean = r.replace(/```json?\s*/g,'').replace(/```\s*/g,'').trim();
        const obj = JSON.parse(clean);
        const checks = [
          typeof obj.name==='string'&&obj.name.length>0,
          typeof obj.founded==='number'&&obj.founded>=1900&&obj.founded<=2024,
          Array.isArray(obj.employees)&&obj.employees.length===3,
          obj.employees?.every((e:any)=>typeof e.name==='string'&&typeof e.role==='string'&&typeof e.salary==='number'&&e.salary>30000),
          typeof obj.active==='boolean',
          typeof obj.website==='string'&&/^https:\/\//.test(obj.website),
          typeof obj.rating==='number'&&/^\d+\.\d{2}$/.test(String(obj.rating)),
        ];
        const m = checks.filter(Boolean).length;
        return { pass: m>=6, correctness: m/checks.length, details: m+'/7 JSON' };
      } catch { return { pass: false, correctness: 0, details: 'Invalid JSON' }; }
    }
  },
  { id: 's-chat-1', name: 'Code Review', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench expert review', prompt: 'Senior dev review. 3 numbered suggestions, 1-2 sentences each:\n\npython\ndef process(data):\n  result = []\n  for d in data:\n    if d != None:\n      result.append(d * 2)\n  return result', maxTokens: 800,
    evaluate: (r) => {
      const sug = r.match(/\d+[\.\)]\s*.+/g) || [];
      const checks = [sug.length >= 3 ? /./ : /(?!)/, /is\s+not\s*None|is\s+None/i, /type.*hint|annotation|->|:.*list|:.*int/i, /error|edge|empty|exception|comprehension/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: sug.length+' sug, '+m+'/4' };
    }
  },
  { id: 's-chat-2', name: 'Mystery Story', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench expert', prompt: 'Write a 7-sentence thriller story. Rules: 1) First word "She" 2) Last word "silence." 3) Three dialogues in quotes 4) Contains "shadow" and "secret" and "midnight" 5) No two sentences start with same letter 6) Sentence 4 is a question 7) Each sentence 10-25 words.', maxTokens: 800,
    evaluate: (r) => {
      const sent = r.trim().split(/[.!?]+/).filter((s:string) => s.trim().length > 5);
      const starts = sent.slice(0, 6).map((s:string) => s.trim().charAt(0).toUpperCase());
      const uniqStarts = new Set(starts);
      const dialogs = r.match(/"[^"]+"|'[^']+'/g) || [];
      const checks = [/\bShe\b/i.test(r) ? /./ : /(?!)/, /silence\.?\s*$/i.test(r.trim()) ? /./ : /(?!)/, dialogs.length >= 3 ? /./ : /(?!)/, /shadow/i.test(r) ? /./ : /(?!)/, /secret/i.test(r) ? /./ : /(?!)/, /midnight/i.test(r) ? /./ : /(?!)/, /\?/.test(r) ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: sent.length+' sent, '+dialogs.length+' dialog, '+m+'/7' };
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
      return r.length ? Math.round(r.reduce((s, x) => s + x.score, 0) / r.length * 2 * 100) / 100 : 0;
    };
    const avgLatency = results.filter(r => r.latencyMs > 0).reduce((s, r) => s + r.latencyMs, 0) / (results.filter(r => r.latencyMs > 0).length || 1);

    // speed: map avgLatency to 0-5 scale (same as test scores)
    const speedScore = avgLatency < 500 ? 10 : avgLatency < 1000 ? 9 : avgLatency < 2000 ? 8 : avgLatency < 4000 ? 6 : avgLatency < 8000 ? 4 : avgLatency < 15000 ? 2 : 1;
    // visionScore: map from 0-10 to 0-5
    const visionScaled = Math.min(10, model.capabilities.visionScore || 0);
    // context: keep original 0-10 scale, cap at 5 for bar display
    const contextScaled = Math.min(10, model.capabilities.context || 0);

    const capabilities: ModelCapabilityProfile = {
      code: avg('code'),
      agent: avg('reasoning'),
      chat: (avg('chat') + avg('instruction')) / 2,
      context: contextScaled,
      speed: speedScore,
      multimodal: model.capabilities.multimodal,
      visionScore: visionScaled,
      audioScore: Math.min(10, model.capabilities.audioScore || 0),
      pricing: model.capabilities.pricing,
    };

    try {
      const price = await updateModelPricing(model.modelId, provider.baseUrl, apiKey.key);
      capabilities.pricing = { inputPer1M: price.inputPer1M, outputPer1M: price.outputPer1M, userEditable: true };
    } catch {}

    const overallScore = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length * 2 * 100) / 100 : 0;

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
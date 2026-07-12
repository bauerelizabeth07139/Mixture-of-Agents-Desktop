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
  { id: 'q-code-1', name: 'Merge Intervals', category: 'code', difficulty: 'quick',
    description: 'LeetCode #56', prompt: 'Write Python function merge(intervals: list[list[int]]) -> list[list[int]] that merges all overlapping intervals. Intervals overlap if start <= previous end. Return sorted merged list. Return ONLY the function, no explanation.', maxTokens: 800,
    evaluate: (r) => {
      const checks = [/def\s+merge/i, /sort|sorted/i, /append|push|\bresult\b/i, /for|while/i, /return/i, r.length > 60 ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/'+checks.length+' checks' };
    }
  },
  { id: 'q-code-2', name: 'Trie Implementation', category: 'code', difficulty: 'quick',
    description: 'LeetCode #208', prompt: 'Implement class Trie with methods insert(word), search(word)->bool, startsWith(prefix)->bool. Use a dict-based trie. Return ONLY the Python class, no explanation.', maxTokens: 800,
    evaluate: (r) => {
      const checks = [/class\s+Trie/i, /def\s+insert/i, /def\s+search/i, /def\s+startsWith/i, /children|next|\{|\}/i, /return\s+(True|False|bool)/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/'+checks.length+' checks' };
    }
  },
  { id: 'q-reason-1', name: 'Train Speed', category: 'reasoning', difficulty: 'quick',
    description: 'GSM8K applied math', prompt: 'A train travels 120km at 60km/h, stops for 15min, then travels 180km at 90km/h. What is the average speed for the entire journey including stop time? Show each step with exact values and final answer as a decimal.', maxTokens: 600,
    evaluate: (r) => {
      const checks = [/120.*60|60.*120|2\s*h/i, /180.*90|90.*180|2\s*h/i, /15\s*min|0\.25\s*h|1\/4/i, /300|total.*dist|dist.*total/i, /4\.25|4\s*h\s*15|4\.\d+.*h/i, /70\.\d|average.*speed|speed.*aver/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/'+checks.length+' steps' };
    }
  },
  { id: 'q-reason-2', name: 'House Colors', category: 'reasoning', difficulty: 'quick',
    description: 'Logic puzzle', prompt: 'Five houses in a row painted red, blue, green, yellow, white. 1) Red is left of blue. 2) Green is immediately right of yellow. 3) White is not adjacent to green. 4) Yellow is not at either end. What is the order from left to right? Show deduction steps.', maxTokens: 600,
    evaluate: (r) => {
      const checks = [/yellow/i, /green/i, /red.*blue|blue.*red/i, /white/i, /position|left|right|adjacent|constraint/i, /order|row|排列|顺序/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/'+checks.length+' logic' };
    }
  },
  { id: 'q-inst-1', name: 'YAML Format', category: 'instruction', difficulty: 'quick',
    description: 'IFEval strict YAML', prompt: 'Output EXACTLY this YAML, nothing else, no code block:\nframework: Django\nversion: 5.0\nfeatures:\n  - ORM\n  - migrations\n  - middleware', maxTokens: 200,
    evaluate: (r) => {
      const clean = r.replace(/```yaml?\s*/g,'').replace(/```\s*/g,'').trim();
      const checks = [/framework:\s*Django/i, /version:\s*5\.0/i, /features:/i, /ORM/i, /migrations/i, /middleware/i];
      const m = checks.filter(c => c.test(clean)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/'+checks.length+' format' };
    }
  },
  { id: 'q-inst-2', name: 'Bullet Constraints', category: 'instruction', difficulty: 'quick',
    description: 'IFEval bullets', prompt: 'List exactly 4 benefits of exercise. Rules: Each bullet starts with "- ", one sentence, 12-20 words. No numbering. No extra text before or after.', maxTokens: 400,
    evaluate: (r) => {
      const bullets = r.trim().split('\n').filter((l: string) => /^-\s/.test(l.trim()));
      const wordCounts = bullets.map((b: string) => b.replace(/^-\s*/, '').split(/\s+/).length);
      const checks = [
        bullets.length === 4 ? /./ : /(?!)/,
        bullets.every((b: string) => /^-\s/.test(b.trim())) ? /./ : /(?!)/,
        wordCounts.every((w: number) => w >= 10 && w <= 22) ? /./ : /(?!)/,
        r.trim().split('\n').filter((l: string) => l.trim().length > 0).length === 4 ? /./ : /(?!)/,
      ];
      const m = checks.filter(Boolean).length;
      return { pass: m >= 3, correctness: m/checks.length, details: bullets.length+' bullets, '+m+'/4' };
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
    description: 'MT-Bench translation', prompt: 'Translate "Knowledge is power" into Chinese, Japanese, and Arabic. One per line, labeled with language name.', maxTokens: 400,
    evaluate: (r) => {
      const checks = [/[\u4e00-\u9fff]/i, /[\u3040-\u30ff]/i, /[\u0600-\u06ff]/i, r.trim().split('\n').filter((l:string)=>l.trim().length>3).length >= 3 ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/4 langs' };
    }
  },
];

const STANDARD_TESTS: TestCase[] = [
  { id: 's-code-1', name: 'LRU Cache', category: 'code', difficulty: 'standard',
    description: 'LeetCode #146', prompt: 'Implement class LRUCache with O(1) get(key) and put(key,value). Use OrderedDict or doubly-linked list + dict. Return ONLY the Python class, no explanation.', maxTokens: 1500,
    evaluate: (r) => {
      const checks = [/class\s+LRUCache/i, /def\s+__init__/i, /def\s+get/i, /def\s+put/i, /OrderedDict|DLinkedNode|move_to_end|double.*link|node/i, /capacity/i, /popitem|remove|evict|delete|tail/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/7 impl' };
    }
  },
  { id: 's-code-2', name: 'Number of Islands', category: 'code', difficulty: 'standard',
    description: 'LeetCode #200', prompt: 'Write Python function numIslands(grid: list[list[str]]) -> int counting connected groups of "1" (land) in a 2D grid of "0"s and "1"s using BFS or DFS. Return ONLY the function.', maxTokens: 1200,
    evaluate: (r) => {
      const checks = [/def\s*numIslands|def\s*num_islands/i, /visited|seen|marked|grid\[|grid\[/i, /BFS|DFS|deque|stack|queue|bfs|dfs/i, /for|while|directions|neighbor|adjacent|dx|dy/i, /return\s+\w/i, /len\(grid|len\(grid\[0\]|rows|cols|m\s*,\s*n/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/6 island' };
    }
  },
  { id: 's-reason-1', name: 'Last Two Digits', category: 'reasoning', difficulty: 'standard',
    description: 'AIME number theory', prompt: 'Find the last two digits of 7^2024. Show the cycle pattern of last two digits of powers of 7, use modular arithmetic, and give the final two-digit answer.', maxTokens: 800,
    evaluate: (r) => {
      const checks = [/07|49|43|01/i, /cycle|period|repeat|pattern/i, /mod\s*100|%\s*100|modular/i, /2024.*mod|mod.*2024|remainder/i, /\b01\b/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/'+checks.length+' mod' };
    }
  },
  { id: 's-reason-2', name: 'Sum of Squares', category: 'reasoning', difficulty: 'standard',
    description: 'MATH competition', prompt: 'Prove by mathematical induction: 1^2 + 2^2 + ... + n^2 = n(n+1)(2n+1)/6 for all n>=1. Show base case and inductive step with all algebra.', maxTokens: 2000,
    evaluate: (r) => {
      const checks = [/base\s*case|n\s*=\s*1|n=1/i, /1\s*=\s*1|1\^2.*=.*1|1\s*\*\s*2/i, /inductive.*hypothes|assum.*k|suppose.*k/i, /k\s*\+\s*1|k\+1/i, /k\s*\(k\s*\+\s*1\)\s*\(2k|k.*k.*1.*2k/i, /\(k\s*\+\s*1\)\s*\(k\s*\+\s*2\)|2k\s*\+\s*3|2\(k\+1\)\+1/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/6 proof' };
    }
  },
  { id: 's-inst-1', name: 'ML Essay', category: 'instruction', difficulty: 'standard',
    description: 'IFEval expert', prompt: 'Write exactly 5 sentences about machine learning. Rules: 1) Each sentence starts with a different letter from M,A,C,I,N 2) Sentence 2 must contain "gradient" 3) Sentence 4 must be a question 4) Last sentence must end with the word "intelligence." 5) No sentence may contain the word "is" 6) Each sentence must be 10-18 words.', maxTokens: 600,
    evaluate: (r) => {
      const lines = r.split(/[.!?]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 5);
      const starts = lines.slice(0, 5).map((s: string) => s.charAt(0).toUpperCase());
      const uniqStarts = new Set(starts);
      const checks = [
        lines.length >= 4 && lines.length <= 6 ? /./ : /(?!)/,
        uniqStarts.size >= 4 ? /./ : /(?!)/,
        /gradient/i.test(r) ? /./ : /(?!)/,
        /\?/.test(r) ? /./ : /(?!)/,
        /intelligence\.?\s*$/i.test(r.trim()) ? /./ : /(?!)/,
        !/\bis\b/i.test(r) ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: lines.length+' sent, starts='+starts.join('')+', '+m+'/6' };
    }
  },
  { id: 's-inst-2', name: 'Complex JSON', category: 'instruction', difficulty: 'standard',
    description: 'IFEval complex JSON', prompt: 'Generate a JSON object for a company with: name (string), founded (number 1900-2024), employees (array of exactly 3 objects each with name:string, role:string, salary:number>30000), active (boolean), website (string starting with https://), rating (number between 1.00-5.00 with exactly 2 decimal places). Output ONLY valid JSON, no markdown.', maxTokens: 1000,
    evaluate: (r) => {
      try {
        const clean = r.replace(/```json?\s*/g,'').replace(/```\s*/g,'').trim();
        const obj = JSON.parse(clean);
        const ratingStr = String(obj.rating || '');
        const ratingOk = /^\d+\.\d{2}$/.test(ratingStr) && obj.rating >= 1 && obj.rating <= 5;
        const checks = [
          typeof obj.name==='string'&&obj.name.length>0,
          typeof obj.founded==='number'&&obj.founded>=1900&&obj.founded<=2024,
          Array.isArray(obj.employees)&&obj.employees.length===3,
          obj.employees?.every((e:any)=>typeof e.name==='string'&&typeof e.role==='string'&&typeof e.salary==='number'&&e.salary>30000),
          typeof obj.active==='boolean',
          typeof obj.website==='string'&&/^https:\/\//.test(obj.website),
          ratingOk,
        ];
        const m = checks.filter(Boolean).length;
        return { pass: m>=6, correctness: m/checks.length, details: m+'/7 JSON' };
      } catch { return { pass: false, correctness: 0, details: 'Invalid JSON' }; }
    }
  },
  { id: 's-chat-1', name: 'Code Review', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench expert review', prompt: 'Act as a senior developer. Provide exactly 3 numbered suggestions (1-2 sentences each) to improve this code:\n\npython\ndef process(data):\n  result = []\n  for d in data:\n    if d != None:\n      result.append(d * 2)\n  return result', maxTokens: 800,
    evaluate: (r) => {
      const sug = r.match(/\d+[\.\)]\s*.+/g) || [];
      const checks = [sug.length >= 3 ? /./ : /(?!)/, /is\s+not\s*None|is\s+None|!=\s*None/i, /type.*hint|annotation|->|:.*list|:.*int/i, /edge|empty|exception|comprehension|filter|list\s*comp/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: sug.length+' sug, '+m+'/4' };
    }
  },
  { id: 's-chat-2', name: 'Thriller Story', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench creative', prompt: 'Write a 7-sentence thriller story. Rules: 1) First word must be "She" 2) Last word must be "silence." 3) Must contain exactly 3 dialogues in double quotes 4) Must contain words "shadow", "secret", and "midnight" 5) No two sentences may start with the same letter 6) Sentence 4 must be a question 7) Each sentence must be 10-25 words.', maxTokens: 800,
    evaluate: (r) => {
      const sent = r.trim().split(/[.!?]+/).filter((s:string) => s.trim().length > 5);
      const starts = sent.slice(0, 7).map((s:string) => s.trim().charAt(0).toUpperCase());
      const uniqStarts = new Set(starts);
      const dialogs = r.match(/"[^"]{5,}"/g) || [];
      const checks = [/\bShe\b/.test(r) ? /./ : /(?!)/, /silence\.?\s*$/i.test(r.trim()) ? /./ : /(?!)/, dialogs.length >= 3 ? /./ : /(?!)/, /shadow/i.test(r) ? /./ : /(?!)/, /secret/i.test(r) ? /./ : /(?!)/, /midnight/i.test(r) ? /./ : /(?!)/, /\?/.test(r) ? /./ : /(?!)/, uniqStarts.size >= 5 ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: sent.length+' sent, '+dialogs.length+' dialog, '+m+'/8' };
    }
  },
];


// Test Engine
export class CapabilityTestEngine {
  private static async runWithConcurrency(tasks: Array<() => Promise<any>>, limit: number): Promise<any[]> {
    const results = new Array(tasks.length);
    let idx = 0;
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (idx < tasks.length) {
        const current = idx++;
        try { results[current] = await tasks[current](); } catch (err) { results[current] = err; }
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
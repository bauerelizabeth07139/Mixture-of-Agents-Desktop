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
  { id: 'q-code-1', name: 'Palindrome Check', category: 'code', difficulty: 'quick',
    description: 'HumanEval-23 style', prompt: 'Write Python function is_palindrome(s: str) -> bool ignoring case and non-alphanumeric. Return ONLY the function.', maxTokens: 600,
    evaluate: (r) => {
      const checks = [/def\s+is_palindrome/i, /lower|casefold/i, /isalnum|re\.sub|filter/i, /return|True|\[::-1\]/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/'+checks.length+' checks' };
    }
  },
  { id: 'q-code-2', name: 'Merge Sorted', category: 'code', difficulty: 'quick',
    description: 'LeetCode #88', prompt: 'Write Python function merge(nums1, m, nums2, n) -> None merging nums2 into nums1 in-place. Return ONLY the function.', maxTokens: 600,
    evaluate: (r) => {
      const checks = [/def\s+merge/i, /while|for/i, /nums1|nums2/i, /m.*-.*1|n.*-.*1|p.*m/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/'+checks.length+' checks' };
    }
  },
  { id: 'q-reason-1', name: 'Arithmetic', category: 'reasoning', difficulty: 'quick',
    description: 'GSM8K word problem', prompt: 'A bakery made 95 cupcakes. They sold 3/5 before lunch, made 40 more, sold 28. How many left? Show work.', maxTokens: 400,
    evaluate: (r) => {
      const checks = [/\b57\b/, /\b38\b/, /\b78\b/, /\b50\b/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/4 steps' };
    }
  },
  { id: 'q-reason-2', name: 'Syllogism', category: 'reasoning', difficulty: 'quick',
    description: 'ARC-Challenge logic', prompt: 'P1: All mammals warm-blooded. P2: All whales mammals. P3: Some warm-blooded animals live in ocean. Conclusion: All whales live in ocean. VALID or INVALID? Explain.', maxTokens: 400,
    evaluate: (r) => {
      const checks = [/invalid/i, /premise.?3|third|some/i, /not.*follow|cannot|not.*necessarily/i, /whales.*ocean|ocean.*not/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 2, correctness: m/checks.length, details: m+'/4 reasoning' };
    }
  },
  { id: 'q-inst-1', name: 'Haiku Format', category: 'instruction', difficulty: 'quick',
    description: 'IFEval format', prompt: 'Write a haiku about programming. 3 lines, 5/7/5 syllables. Label each line with syllable count in parentheses (5)/(7)/(5). ONLY the haiku.', maxTokens: 200,
    evaluate: (r) => {
      const checks = [/\(5\)/, /\(7\)/, /\(5\)/];
      const lines = r.trim().split('\n').filter((l: string) => l.trim());
      checks.push(lines.length === 3 ? /./ : /(?!)/);
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/4 format' };
    }
  },
  { id: 'q-inst-2', name: '10 Words', category: 'instruction', difficulty: 'quick',
    description: 'IFEval word count', prompt: 'Explain what a CPU does in EXACTLY 10 words. Start with A. End with period.', maxTokens: 100,
    evaluate: (r) => {
      const words = r.trim().split(/\s+/).filter((w: string) => w.length > 0);
      const checks = [/^A\b/i, /\.$/, Math.abs(words.length-10)<=2?/./:/(?!)/];
      const m = checks.filter(c => c.test(r.trim())).length;
      return { pass: m >= 2, correctness: m/checks.length, details: words.length+' words, '+m+'/3' };
    }
  },
  { id: 'q-chat-1', name: 'TCP vs UDP', category: 'chat', difficulty: 'quick',
    description: 'MT-Bench technical', prompt: 'Explain TCP vs UDP in exactly 3 sentences. Precise and technical.', maxTokens: 300,
    evaluate: (r) => {
      const s = r.trim().split(/[.!?]+/).filter((x: string) => x.trim().length > 5);
      const checks = [/tcp/i, /udp/i, /reliable|connection|ordered/i, s.length>=3&&s.length<=5?/./:/(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: s.length+' sent, '+m+'/4' };
    }
  },
  { id: 'q-chat-2', name: 'Translation', category: 'chat', difficulty: 'quick',
    description: 'MT-Bench multi-lang', prompt: 'Translate "The early bird catches the worm" into French, Japanese, Spanish. One per line, labeled.', maxTokens: 300,
    evaluate: (r) => {
      const checks = [/french/i, /japanese/i, /spanish/i, r.trim().split('\n').length>=3?/./:/(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/4 langs' };
    }
  },
];

const STANDARD_TESTS: TestCase[] = [
  { id: 's-code-1', name: 'LRU Cache', category: 'code', difficulty: 'standard',
    description: 'LeetCode #146', prompt: 'Implement class LRUCache: __init__(capacity), get(key)->int, put(key,value). Both O(1). Return ONLY Python class.', maxTokens: 1200,
    evaluate: (r) => {
      const checks = [/class\s+LRUCache/i, /def\s+__init__/i, /def\s+get/i, /def\s+put/i, /OrderedDict|DLinkedNode|move_to_end|double.*link/i, /dict|\{|:\s/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/6 impl' };
    }
  },
  { id: 's-code-2', name: 'Word Ladder', category: 'code', difficulty: 'standard',
    description: 'LeetCode #127 BFS', prompt: 'Write Python ladderLength(beginWord, endWord, wordList)->int shortest transformation, one letter at a time. 0 if none. Return ONLY function.', maxTokens: 1000,
    evaluate: (r) => {
      const checks = [/def\s+ladderLength/i, /deque|queue|BFS/i, /set|wordList/i, /for.*char|enumerate/i, /neighbor|adjacent|differ/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/5 BFS' };
    }
  },
  { id: 's-reason-1', name: 'Number Theory', category: 'reasoning', difficulty: 'standard',
    description: 'AIME number theory', prompt: 'Find all positive integers n where n²+2n+2 divides n³+4n²+4n-14. Show polynomial division. Give sum of solutions.', maxTokens: 800,
    evaluate: (r) => {
      const checks = [/factor|division|divid|remainder/i, /\b18\b/, /n\+2|quotient/i, /\b1\b.*\b4\b|sum.*5|answer.*5/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 2, correctness: m/checks.length, details: m+'/4 steps' };
    }
  },
  { id: 's-reason-2', name: 'Induction Proof', category: 'reasoning', difficulty: 'standard',
    description: 'MATH induction proof', prompt: 'Prove by induction: 1²+2²+...+n² = n(n+1)(2n+1)/6 for all positive integers n. Complete proof with base case and inductive step.', maxTokens: 1200,
    evaluate: (r) => {
      const checks = [/base.*case|n.*=.*1/i, /1.*=.*1/i, /inductive.*step|assume.*k/i, /k\+1|n\+1/i, /k.*k\+1.*2k\+1|sigma/i, /k\+1.*k\+2.*2k\+3|2k\+3/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/6 proof' };
    }
  },
  { id: 's-inst-1', name: 'Multi-constraint', category: 'instruction', difficulty: 'standard',
    description: 'IFEval 7 constraints', prompt: 'Pancake recipe rules: 5 numbered steps, 15-25 words each, step 3 has butter, step 5 ends golden, no word then, exactly 3 ingredients.', maxTokens: 600,
    evaluate: (r) => {
      const steps = r.match(/^\d+\..+$/gm) || [];
      const checks = [steps.length===5?/./:/(?!)/, steps.every((s:string)=>/^\d+\./.test(s))?/./:/(?!)/, /3\..*butter/i, /golden\.?\s*$/mi, !/\bthen\b/i.test(r)?/./:/(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: steps.length+' steps, '+m+'/5' };
    }
  },
  { id: 's-inst-2', name: 'JSON Schema', category: 'instruction', difficulty: 'standard',
    description: 'IFEval JSON', prompt: 'JSON school: name(string), founded(1800-2024), departments(3 items: name/head/budget>100000), rating(1.0-5.0), website(https://). ONLY JSON.', maxTokens: 500,
    evaluate: (r) => {
      try {
        const clean = r.replace(/`json?\s*/g,'').replace(/`\s*/g,'').trim();
        const obj = JSON.parse(clean);
        const checks = [
          typeof obj.name==='string'&&obj.name.length>0,
          typeof obj.founded==='number'&&obj.founded>=1800&&obj.founded<=2024,
          Array.isArray(obj.departments)&&obj.departments.length===3,
          obj.departments?.every((d:any)=>d.name&&d.head&&d.budget>100000),
          typeof obj.rating==='number'&&obj.rating>=1&&obj.rating<=5,
          typeof obj.website==='string'&&/^https:\/\//.test(obj.website),
        ];
        const m = checks.filter(Boolean).length;
        return { pass: m>=5, correctness: m/checks.length, details: m+'/6 JSON' };
      } catch { return { pass: false, correctness: 0, details: 'Invalid JSON' }; }
    }
  },
  { id: 's-chat-1', name: 'Code Review', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench expert review', prompt: 'Senior Python dev review. 3 actionable suggestions referencing functions:\n\n`python\ndef get_data(url):\n    import requests\n    r = requests.get(url)\n    return r.json()\n\ndef process(items):\n    result = []\n    for i in items:\n        if i > 0:\n            result.append(i * 2)\n    return result\n`', maxTokens: 800,
    evaluate: (r) => {
      const sug = r.match(/\d+[\.\)]\s*.+/g) || [];
      const checks = [sug.length>=3?/./:/(?!)/, /error|exception|try|except/i, /type|hint|annotation/i, /get_data|process|requests/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: sug.length+' sug, '+m+'/4' };
    }
  },
  { id: 's-chat-2', name: 'Creative Writing', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench constrained', prompt: '5-sentence story about robot painting. Rules: 1)First starts The 2)Last ends color. 3)One dialogue in quotes 4)2+ color words 5)No sentence same first word.', maxTokens: 500,
    evaluate: (r) => {
      const sent = r.trim().split(/[.!?]+/).filter((s:string) => s.trim().length>3);
      const colors = (r.match(/\b(red|blue|green|yellow|orange|purple|pink|white|black|gold|silver)\b/gi)||[]);
      const uniq = [...new Set(colors.map((c:string)=>c.toLowerCase()))];
      const checks = [/^The\b/i.test(r.trim())?/./:/(?!)/, /color\.?\s*$/mi.test(r.trim())?/./:/(?!)/, /"[^"]+"|'[^']+'/.test(r)?/./:/(?!)/, uniq.length>=2?/./:/(?!)/, sent.length>=4&&sent.length<=6?/./:/(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: sent.length+' sent, '+uniq.length+' colors, '+m+'/5' };
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
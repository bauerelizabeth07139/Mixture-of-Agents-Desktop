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

// ============================================================
// QUICK TESTS — moderate difficulty, 2 per category
// ============================================================
const QUICK_TESTS: TestCase[] = [
  // CODE
  { id: 'q-code-1', name: '3Sum', category: 'code', difficulty: 'quick',
    description: 'LeetCode #15', prompt: 'Write Python function threeSum(nums: list[int]) -> list[list[int]] that finds all unique triplets that sum to 0. Must handle duplicates without using set on the result. O(n^2) time. Return ONLY the function.', maxTokens: 1000,
    evaluate: (r) => {
      const checks = [/def\s+threeSum/i, /sort/i, /for.*range|enumerate|while|left|right|l\s*[<>=]|r\s*[<>=]/i, /skip|duplicate|continue|!=\s*prev|!=\s*last|nums\[i\]\s*==/i, /append|result|triplet|\[\s*i|\+|\+/i, /return/i, r.length > 80 ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/'+checks.length+' checks' };
    }
  },
  { id: 'q-code-2', name: 'Binary Tree Level Order', category: 'code', difficulty: 'quick',
    description: 'LeetCode #102', prompt: 'Write Python function levelOrder(root) -> list[list[int]] returning level-order traversal of a binary tree. Use BFS with deque. Handle None root. Define TreeNode class. Return ONLY the code.', maxTokens: 800,
    evaluate: (r) => {
      const checks = [/def\s+levelOrder/i, /deque|queue|popleft|BFS/i, /level|current|cur.*len|size/i, /append|left|right/i, /class\s+TreeNode/i, /return\s*\[|result/i, /if\s+not\s+root|if\s+root\s+is\s+None|root\s*==\s*None/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/'+checks.length+' checks' };
    }
  },

  // REASONING
  { id: 'q-reason-1', name: 'Work Rate', category: 'reasoning', difficulty: 'quick',
    description: 'GSM8K harder', prompt: 'Machine A fills a tank in 6 hours, Machine B in 8 hours, Machine C empties it in 12 hours. All three run together. How long to fill the tank? Show rates, combined rate, and exact answer as a fraction.', maxTokens: 600,
    evaluate: (r) => {
      const checks = [/1\/6|0\.166|rate.*a/i, /1\/8|0\.125|rate.*b/i, /1\/12|0\.083|rate.*c/i, /1\/6.*1\/8.*1\/12|combined|total.*rate/i, /24\/7|3\.42|3\s*3\/7|3.*hour/i, /4\/24|3\/24|2\/24|8\/24/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/'+checks.length+' steps' };
    }
  },
  { id: 'q-reason-2', name: 'Knights and Knaves', category: 'reasoning', difficulty: 'quick',
    description: 'Logic puzzle', prompt: 'On an island, knights always tell truth, knaves always lie. A says "We are both knaves." What are A and B? Show complete truth-table analysis with all 4 combinations (AA, AK, KA, KK) and eliminate contradictions.', maxTokens: 600,
    evaluate: (r) => {
      const checks = [/knight|knave/i, /both.*knave|we.*knave/i, /truth|lie|lying/i, /contradict|impossib|eliminat/i, /knight.*knave|a.*knight.*b.*knave/i, /4|four|combination|case/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/'+checks.length+' logic' };
    }
  },

  // INSTRUCTION
  { id: 'q-inst-1', name: 'Strict JSON', category: 'instruction', difficulty: 'quick',
    description: 'IFEval JSON', prompt: 'Generate valid JSON: {"planet":"Mars","moons":2,"atmosphere":{"main":"CO2","pressure_kPa":0.6},"hasRings":false,"distance_au":1.52}. Output ONLY valid JSON matching this exact schema. No markdown, no explanation.', maxTokens: 300,
    evaluate: (r) => {
      try {
        const clean = r.replace(/```json?\s*/g,'').replace(/```\s*/g,'').trim();
        const obj = JSON.parse(clean);
        const checks = [
          obj.planet === 'Mars',
          obj.moons === 2,
          typeof obj.atmosphere === 'object' && obj.atmosphere !== null,
          obj.atmosphere?.main === 'CO2',
          typeof obj.atmosphere?.pressure_kPa === 'number',
          obj.hasRings === false,
          Math.abs(obj.distance_au - 1.52) < 0.01,
        ];
        const m = checks.filter(Boolean).length;
        return { pass: m >= 6, correctness: m/checks.length, details: m+'/7 fields' };
      } catch { return { pass: false, correctness: 0, details: 'Invalid JSON' }; }
    }
  },
  { id: 'q-inst-2', name: 'Structured Essay', category: 'instruction', difficulty: 'quick',
    description: 'IFEval constraints', prompt: 'Write about quantum computing in exactly 4 paragraphs. Rules: 1) Paragraph 1: exactly 2 sentences, starts with "Quantum" 2) Paragraph 2: exactly 3 sentences, contains "qubit" 3) Paragraph 3: exactly 2 sentences, contains "superposition" 4) Paragraph 4: exactly 1 sentence starting with "In" and ending with "revolutionary." 5) No paragraph may use the word "very" 6) Total word count 120-160.', maxTokens: 600,
    evaluate: (r) => {
      const paras = r.split(/\n\s*\n|\n\n/).filter((p: string) => p.trim().length > 10);
      const sentCounts = paras.map((p: string) => p.trim().split(/[.!?]+/).filter((s: string) => s.trim().length > 3).length);
      const checks = [
        paras.length >= 3 && paras.length <= 5 ? /./ : /(?!)/,
        sentCounts[0] === 2 ? /./ : /(?!)/,
        /qubit/i.test(r) ? /./ : /(?!)/,
        /superposition/i.test(r) ? /./ : /(?!)/,
        /revolutionary\.?\s*$/i.test(r.trim()) ? /./ : /(?!)/,
        !/\bvery\b/i.test(r) ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: paras.length+' paras, sent=['+sentCounts.join(',')+'], '+m+'/6' };
    }
  },

  // CHAT
  { id: 'q-chat-1', name: 'Analogy Chain', category: 'chat', difficulty: 'quick',
    description: 'MT-Bench analogy', prompt: 'Explain how a neural network learns using a cooking analogy. Must include: 1) ingredients = data 2) recipe = model architecture 3) taste-test = loss function 4) adjusting seasoning = backpropagation. Exactly 4-6 sentences, no code, no technical jargon.', maxTokens: 500,
    evaluate: (r) => {
      const s = r.trim().split(/[.!?]+/).filter((x: string) => x.trim().length > 10);
      const checks = [/ingredient|data/i, /recipe|architect|layer/i, /taste|loss|error|mistake/i, /season|adjust|backprop|grad|learn|improve/i, !/def\s|function\s|import\s|class\s/.test(r) ? /./ : /(?!)/, s.length >= 4 && s.length <= 7 ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: s.length+' sent, '+m+'/6' };
    }
  },
  { id: 'q-chat-2', name: 'Multi-lang Poem', category: 'chat', difficulty: 'quick',
    description: 'MT-Bench creative', prompt: 'Write a haiku (5-7-5 syllable structure) about the moon, then translate it into Japanese with the same meaning. Label each version. Include syllable counts in parentheses.', maxTokens: 400,
    evaluate: (r) => {
      const checks = [
        /haiku|moon|月/i,
        /[\u3040-\u30ff]|japanese|日本/i,
        /\(\s*5\s*\)|\b5\s*syllable/i,
        /\(\s*7\s*\)|\b7\s*syllable/i,
        r.trim().split('\n').filter((l: string) => l.trim().length > 3).length >= 3 ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/'+checks.length+' checks' };
    }
  },
];

// ============================================================
// STANDARD TESTS — hard difficulty, 2 per category
// ============================================================
const STANDARD_TESTS: TestCase[] = [
  // CODE
  { id: 's-code-1', name: 'Median of Two Sorted', category: 'code', difficulty: 'standard',
    description: 'LeetCode #4', prompt: 'Write Python function findMedianSortedArrays(nums1, nums2) -> float that finds median of two sorted arrays in O(log(min(m,n))) time. Must use binary search on the shorter array. Return ONLY the function, no explanation.', maxTokens: 1500,
    evaluate: (r) => {
      const checks = [/def\s+findMedianSortedArrays/i, /binary|bisect|lo|hi|mid/i, /partition|half|left.*right|cut/i, /len\(nums|len\(num1|len\(num2|m\s*=|n\s*=/i, /float|0\.5|\*\s*0\.5|median/i, /max\(|min\(|inf|float\(.*inf/i, /if\s+len|if\s+m\s*>|if\s+n\s*>|ensure|shorter/i, /return/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 6, correctness: m/checks.length, details: m+'/'+checks.length+' impl' };
    }
  },
  { id: 's-code-2', name: 'Word Ladder II', category: 'code', difficulty: 'standard',
    description: 'LeetCode #126', prompt: 'Write Python function findLadders(beginWord: str, endWord: str, wordList: list[str]) -> list[list[str]] returning all shortest transformation sequences. Use BFS+backtracking. Each step changes one letter, each intermediate word must be in wordList. Return ONLY the function.', maxTokens: 1500,
    evaluate: (r) => {
      const checks = [/def\s+findLadders/i, /deque|queue|BFS|bfs|level|layer/i, /backtrack|dfs|path|sequence|trace/i, /set|wordList|word_set|visited|neighbor/i, /for.*range|for.*char|for.*word|alpha|abcdefghijklmnopqrstuvwxyz/i, /append|result|res.*append|shortest|min.*len/i, /return\s/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/'+checks.length+' impl' };
    }
  },

  // REASONING
  { id: 's-reason-1', name: 'Combinatorial Counting', category: 'reasoning', difficulty: 'standard',
    description: 'AIME competition', prompt: 'How many 4-digit numbers (1000-9999) have digits that sum to exactly 12? Use stars and bars with inclusion-exclusion. Show: 1) unrestricted count 2) subtract cases where a digit > 9 3) final answer. Must get exact integer.', maxTokens: 1000,
    evaluate: (r) => {
      const checks = [
        /stars.*bar|combination|C\(|choose|binomial/i,
        /9|digit|leading|first/i,
        /inclusion.*exclusion|subtract|overcount|remove/i,
        /\bC\(15,\s*3\)|C\(15,3\)|15.*3|choose.*15/i,
        /\bC\(4,\s*1\)|C\(4,1\)|4.*1/i,
        /\b325\b|answer.*325|result.*325/i,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/'+checks.length+' steps' };
    }
  },
  { id: 's-reason-2', name: 'Formal Proof', category: 'reasoning', difficulty: 'standard',
    description: 'MATH proof', prompt: 'Prove: for all n >= 1, the sum 1*1! + 2*2! + 3*3! + ... + n*n! = (n+1)! - 1. Use induction. Show: 1) base case n=1 2) inductive hypothesis 3) algebraic manipulation showing (k+1)! - 1 + (k+1)*(k+1)! = (k+2)! - 1 4) conclusion. Show all factorial expansions.', maxTokens: 2000,
    evaluate: (r) => {
      const checks = [
        /base\s*case|n\s*=\s*1|n=1/i,
        /1\s*\*\s*1!|1!.*=.*1|1.*factorial/i,
        /inductive.*hypothes|assume.*k|suppose.*P\(k\)/i,
        /\(k\s*\+\s*1\)!|k\+1.*!/i,
        /\(k\s*\+\s*1\)\s*\*\s*\(k\s*\+\s*1\)!|\(k\+1\)\s*\(k\+1\)!/i,
        /\(k\s*\+\s*2\)!|k\+2.*!/i,
        /factor|factorial.*expand|expand.*factorial|=\s*\(k\+2\)\s*\*\s*\(k\+1\)!/i,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/'+checks.length+' proof' };
    }
  },

  // INSTRUCTION
  { id: 's-inst-1', name: 'Constraint Essay', category: 'instruction', difficulty: 'standard',
    description: 'IFEval extreme', prompt: 'Write exactly 6 sentences about cryptography. ALL rules must be met: 1) Each sentence starts with letters C,R,Y,P,T,O in order 2) Sentence 3 contains "prime" and "factor" 3) Sentence 5 is a question 4) Last sentence ends with "unbreakable." 5) No sentence may contain "is" or "are" or "was" 6) Each sentence 12-20 words 7) Total uses the word "key" at least twice 8) No word may be repeated more than twice across all sentences.', maxTokens: 800,
    evaluate: (r) => {
      const lines = r.split(/[.!?]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 5);
      const starts = lines.slice(0, 6).map((s: string) => s.charAt(0).toUpperCase());
      const uniqStarts = new Set(starts);
      const words = r.toLowerCase().split(/\s+/);
      const wordFreq: Record<string, number> = {};
      words.forEach((w: string) => { const nw = w.replace(/[^a-z]/g, ''); if (nw.length > 2) wordFreq[nw] = (wordFreq[nw] || 0) + 1; });
      const overUsed = Object.values(wordFreq).some((c: number) => c > 2);
      const checks = [
        lines.length >= 5 && lines.length <= 7 ? /./ : /(?!)/,
        uniqStarts.size >= 5 ? /./ : /(?!)/,
        /prime/i.test(r) && /factor/i.test(r) ? /./ : /(?!)/,
        /\?/.test(r) ? /./ : /(?!)/,
        /unbreakable\.?\s*$/i.test(r.trim()) ? /./ : /(?!)/,
        !/\b(is|are|was)\b/i.test(r) ? /./ : /(?!)/,
        (r.match(/\bkey\b/gi) || []).length >= 2 ? /./ : /(?!)/,
        !overUsed ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: lines.length+' sent, starts='+starts.join('')+', '+m+'/8' };
    }
  },
  { id: 's-inst-2', name: 'Nested Schema', category: 'instruction', difficulty: 'standard',
    description: 'IFEval complex', prompt: 'Generate valid JSON for a university with: name (string), founded (1500-2024), departments (array of exactly 3 objects each with: name(string), head(string with Dr. prefix), courses(array of exactly 2 objects with code:string matching [A-Z]{3}\\d{3}, credits:integer 1-4, lab:boolean)), accreditation: {body:string, year:2000-2024, valid:boolean}. ONLY valid JSON, no markdown.', maxTokens: 1200,
    evaluate: (r) => {
      try {
        const clean = r.replace(/```json?\s*/g,'').replace(/```\s*/g,'').trim();
        const obj = JSON.parse(clean);
        const deptOk = Array.isArray(obj.departments) && obj.departments.length === 3;
        const coursesOk = deptOk && obj.departments.every((d: any) =>
          Array.isArray(d.courses) && d.courses.length === 2 &&
          d.courses.every((c: any) => /^[A-Z]{3}\d{3}$/.test(c.code) && c.credits >= 1 && c.credits <= 4 && typeof c.lab === 'boolean')
        );
        const headOk = deptOk && obj.departments.every((d: any) => /^Dr\./.test(d.head));
        const accOk = typeof obj.accreditation === 'object' && obj.accreditation.body && obj.accreditation.year >= 2000 && obj.accreditation.year <= 2024 && typeof obj.accreditation.valid === 'boolean';
        const checks = [
          typeof obj.name === 'string' && obj.name.length > 0,
          typeof obj.founded === 'number' && obj.founded >= 1500 && obj.founded <= 2024,
          deptOk, coursesOk, headOk, accOk,
        ];
        const m = checks.filter(Boolean).length;
        return { pass: m >= 5, correctness: m/checks.length, details: m+'/6 schema' };
      } catch { return { pass: false, correctness: 0, details: 'Invalid JSON' }; }
    }
  },

  // CHAT
  { id: 's-chat-1', name: 'Debate Both Sides', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench expert', prompt: 'Debate AI regulation. Write exactly 3 arguments FOR regulation (prefixed "PRO:") and 3 AGAINST (prefixed "CON:"). Each argument 1-2 sentences, 15-30 words. Must reference specific risks (job loss, bias, autonomy) and benefits (innovation, freedom, competition). End with a 2-sentence synthesis.', maxTokens: 1000,
    evaluate: (r) => {
      const pros = (r.match(/PRO:/gi) || []).length;
      const cons = (r.match(/CON:/gi) || []).length;
      const checks = [
        pros >= 3 ? /./ : /(?!)/,
        cons >= 3 ? /./ : /(?!)/,
        /job|employ|unemploy|work.*loss/i.test(r) ? /./ : /(?!)/,
        /bias|discriminat|fair/i.test(r) ? /./ : /(?!)/,
        /autonom|control|independ/i.test(r) ? /./ : /(?!)/,
        /innovat|freedom|competit/i.test(r) ? /./ : /(?!)/,
        r.trim().split(/[.!?]+/).filter((s: string) => s.trim().length > 5).length >= 7 ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: pros+' PRO, '+cons+' CON, '+m+'/7' };
    }
  },
  { id: 's-chat-2', name: 'Constrained Narrative', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench creative', prompt: 'Write an 8-sentence mystery story. ALL rules: 1) First word "Detective" 2) Last word "vanished." 3) Exactly 4 dialogues in double quotes 4) Contains "cryptic", "labyrinth", "suspect" 5) No two consecutive sentences start with same letter 6) Sentences 2 and 6 must be questions 7) Each sentence 12-25 words 8) The story must have a twist ending revealed in sentence 7.', maxTokens: 1000,
    evaluate: (r) => {
      const sent = r.trim().split(/[.!?]+/).filter((s:string) => s.trim().length > 5);
      const starts = sent.map((s:string) => s.trim().charAt(0).toUpperCase());
      let consecSame = 0;
      for (let i = 1; i < starts.length; i++) { if (starts[i] === starts[i-1]) consecSame++; }
      const dialogs = r.match(/"[^"]{5,}"/g) || [];
      const checks = [
        /\bDetective\b/.test(r) ? /./ : /(?!)/,
        /vanished\.?\s*$/i.test(r.trim()) ? /./ : /(?!)/,
        dialogs.length >= 4 ? /./ : /(?!)/,
        /cryptic/i.test(r) ? /./ : /(?!)/,
        /labyrinth/i.test(r) ? /./ : /(?!)/,
        /suspect/i.test(r) ? /./ : /(?!)/,
        consecSame === 0 ? /./ : /(?!)/,
        /\?/.test(r) ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: sent.length+' sent, '+dialogs.length+' dialog, consec='+consecSame+', '+m+'/8' };
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

    const tasks = tests.map((test) => async () => {
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
          testId: test.id, testName: test.name, category: test.category,
          score: Math.round(score * 1000) / 1000, details: evalResult.details,
          latencyMs, tokensUsed: resp.usage.totalTokens,
        } as TestResult;
      } catch (error: any) {
        return {
          testId: test.id, testName: test.name, category: test.category,
          score: 0, details: 'Error: ' + (error.message || '').slice(0, 120),
          latencyMs: 0, tokensUsed: 0,
        } as TestResult;
      }
    });

    const executed = await this.runWithConcurrency(tasks, concurrency);
    for (const item of executed) {
      if (item && typeof item === 'object' && 'testId' in item) results.push(item as TestResult);
    }
    for (const result of results) { completed++; onProgress?.(completed, tests.length, result.testName); }

    const totalTimeMs = Date.now() - totalStart;
    const avg = (cat: string) => {
      const r = results.filter(x => x.category === cat);
      return r.length ? Math.round(r.reduce((s, x) => s + x.score, 0) / r.length * 2 * 100) / 100 : 0;
    };
    const avgLatency = results.filter(r => r.latencyMs > 0).reduce((s, r) => s + r.latencyMs, 0) / (results.filter(r => r.latencyMs > 0).length || 1);
    const speedScore = avgLatency < 500 ? 10 : avgLatency < 1000 ? 9 : avgLatency < 2000 ? 8 : avgLatency < 4000 ? 6 : avgLatency < 8000 ? 4 : avgLatency < 15000 ? 2 : 1;
    const visionScaled = Math.min(10, model.capabilities.visionScore || 0);
    const contextScaled = Math.min(10, model.capabilities.context || 0);

    const capabilities: ModelCapabilityProfile = {
      code: avg('code'), agent: avg('reasoning'), chat: (avg('chat') + avg('instruction')) / 2,
      context: contextScaled, speed: speedScore, multimodal: model.capabilities.multimodal,
      visionScore: visionScaled, audioScore: Math.min(10, model.capabilities.audioScore || 0),
      pricing: model.capabilities.pricing,
    };

    try {
      const price = await updateModelPricing(model.modelId, provider.baseUrl, apiKey.key);
      capabilities.pricing = { inputPer1M: price.inputPer1M, outputPer1M: price.outputPer1M, userEditable: true };
    } catch {}

    const overallScore = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length * 2 * 100) / 100 : 0;

    return {
      modelId: model.id, modelName: model.modelId, providerName: provider.name,
      timestamp: new Date().toISOString(), results, overallScore, capabilities,
      testSuite: suite, totalTimeMs,
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
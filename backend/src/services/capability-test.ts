import { Provider, Model, ModelCapabilityProfile, ApiKeyEntry } from '../types';
import { LLMClient } from './llm-client';


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
  if (!passed && correctness === 0) return 0;
  const half = timeLimitMs * 0.5;
  let base: number;
  if (latencyMs <= half) { base = 5; } else { base = 2 + 3 * (1 - (latencyMs - half) / half); }
  if (!passed) base = Math.min(base, 2.5);
  return Math.round(base * correctness * 1000) / 1000;
}

// ============================================================
// QUICK TESTS — hard, 2 per category, 8 total
// ============================================================
const QUICK_TESTS: TestCase[] = [
  // CODE - Hard LeetCode (LC #23, #312)
  { id: 'q-code-1', name: 'Merge K Sorted Lists', category: 'code', difficulty: 'quick',
    description: 'LeetCode #23 Hard', prompt: 'Write Python function mergeKLists(lists: list[Optional[ListNode]]) -> Optional[ListNode] merging k sorted linked lists using a min-heap. O(N log k) time. Define ListNode class. Return ONLY the function/class.', maxTokens: 1500,
    evaluate: (r) => {
      const checks = [/def\s+mergeKLists/i, /heap|heapq|priority/i, /ListNode/i, /heappush|heappop|push|pop/i, /while|for.*lists|for.*range/i, /next|val|head/i, /return/i, r.length > 100 ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/'+checks.length+' checks' };
    }
  },
  { id: 'q-code-2', name: 'Burst Balloons', category: 'code', difficulty: 'quick',
    description: 'LeetCode #312 Hard', prompt: 'Write Python function maxCoins(nums: list[int]) -> int. Burst balloons to maximize coins. When balloon i burst, get nums[left]*nums[i]*nums[right]. Use interval DP. Return ONLY the function.', maxTokens: 1500,
    evaluate: (r) => {
      const checks = [/def\s+maxCoins/i, /dp|memo|table|matrix/i, /for.*range.*len|for.*i.*j|for.*k/i, /max\(|max\s*\(/i, /nums\[|num\[|n\[|left|right|k/i, /return/i, r.length > 80 ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/'+checks.length+' impl' };
    }
  },

  // REASONING - Hard competition math
  { id: 'q-reason-1', name: 'Euler Totient', category: 'reasoning', difficulty: 'quick',
    description: 'Number theory', prompt: 'Compute phi(360) where phi is Euler totient function. Show: 1) prime factorization of 360 2) apply phi formula phi(n) = n * product(1-1/p) 3) step-by-step arithmetic 4) final answer as integer.', maxTokens: 600,
    evaluate: (r) => {
      const checks = [/2\^?3|2.*2.*2.*3.*3|8.*9.*5|2.*3|3.*3|3\^?2/i, /5/i, /360.*2.*3.*5|360.*8.*9|360.*2\^3/i, /1\s*-\s*1\/2|1-1\/2|\(1-1/i, /1\s*-\s*1\/3|1-1\/3/i, /1\s*-\s*1\/5|1-1\/5/i, /\b96\b|phi.*96|answer.*96|result.*96/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/'+checks.length+' steps' };
    }
  },
  { id: 'q-reason-2', name: 'Derangement', category: 'reasoning', difficulty: 'quick',
    description: 'Combinatorics', prompt: 'A derangement of n elements is a permutation with no fixed point. Compute D(5) using inclusion-exclusion. Show: 1) formula D(n) = n! * sum((-1)^k / k!, k=0..n) 2) compute each term 3) sum them 4) multiply by 5! 5) final integer answer.', maxTokens: 800,
    evaluate: (r) => {
      const checks = [/inclusion.*exclusion|derangement|fixed.*point/i, /5\s*!|factorial.*5|120/i, /1\s*-\s*1|1\/1|1\/1!/i, /1\/2|1\/2!|0\.5/i, /1\/6|1\/3!|1\/3/i, /1\/24|1\/4!/i, /1\/120|1\/5!/i, /\b44\b|derangement.*44|D\(5\).*44|answer.*44/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/'+checks.length+' terms' };
    }
  },

  // INSTRUCTION - Complex constraints
  { id: 'q-inst-1', name: 'Anagram JSON', category: 'instruction', difficulty: 'quick',
    description: 'IFEval strict', prompt: 'Generate JSON: {"word1":"listen","word2":"silent","areAnagram":true,"sharedLetters":"eilnst","length":6}. Then below the JSON, write a Python one-liner (single line) that checks if two strings are anagrams using sorted(). Output ONLY the JSON then the one-liner.', maxTokens: 400,
    evaluate: (r) => {
      try {
        const jsonPart = r.match(/\{[^}]+\}/)?.[0] || '';
        const obj = JSON.parse(jsonPart);
        const hasOneLiner = /sorted|lambda|==.*sorted/i.test(r);
        const checks = [
          obj.word1 === 'listen',
          obj.word2 === 'silent',
          obj.areAnagram === true,
          typeof obj.sharedLetters === 'string' && obj.sharedLetters.length >= 5,
          obj.length === 6,
          hasOneLiner,
        ];
        const m = checks.filter(Boolean).length;
        return { pass: m >= 5, correctness: m/checks.length, details: m+'/6 fields' };
      } catch { return { pass: false, correctness: 0, details: 'Invalid JSON' }; }
    }
  },
  { id: 'q-inst-2', name: 'Fibonacci Haiku', category: 'instruction', difficulty: 'quick',
    description: 'Oulipo math+poetry', prompt: 'Write a haiku about the Fibonacci sequence where the number of words in each line follows Fibonacci: line 1 = 1 word, line 2 = 1 word, line 3 = 2 words. The haiku must reference "golden ratio" or "spiral". Then write a second haiku with: line 1 = 3 words, line 2 = 5 words, line 3 = 8 words, also about Fibonacci.', maxTokens: 400,
    evaluate: (r) => {
      const lines = r.trim().split('\n').filter((l: string) => l.trim().length > 0);
      const wordCounts = lines.map((l: string) => l.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/).filter((w: string) => w.length > 0).length);
      const checks = [
        /fibonacci|golden.*ratio|spiral/i.test(r) ? /./ : /(?!)/,
        lines.length >= 4 ? /./ : /(?!)/,
        wordCounts[0] === 1 ? /./ : /(?!)/,
        wordCounts[1] === 1 ? /./ : /(?!)/,
        wordCounts[2] === 2 ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: 'words=['+wordCounts.join(',')+'], '+m+'/5' };
    }
  },

  // CHAT - Advanced creative
  { id: 'q-chat-1', name: 'Perspective Shift', category: 'chat', difficulty: 'quick',
    description: 'MT-Bench expert', prompt: 'Explain quantum entanglement from 3 perspectives in exactly 1 paragraph each: 1) A 5-year-old child 2) A physics professor 3) A poet. Each paragraph 3-5 sentences. The child must use a toy analogy. The professor must use "Bell inequality". The poet must use a metaphor about mirrors.', maxTokens: 800,
    evaluate: (r) => {
      const paras = r.split(/\n\s*\n|\n\n/).filter((p: string) => p.trim().length > 30);
      const checks = [
        paras.length >= 2 ? /./ : /(?!)/,
        /toy|doll|ball|teddy|play|kid/i.test(r) ? /./ : /(?!)/,
        /bell|inequality|correlat|measur/i.test(r) ? /./ : /(?!)/,
        /mirror|reflect|shadow|echo|glass/i.test(r) ? /./ : /(?!)/,
        /entangl|quantum|particle|pair/i.test(r) ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: paras.length+' paras, '+m+'/5' };
    }
  },
  { id: 'q-chat-2', name: 'Constraint Narrative', category: 'chat', difficulty: 'quick',
    description: 'Oulipo prose', prompt: 'Write a 6-sentence sci-fi story. Constraints: 1) First sentence exactly 5 words 2) Last sentence exactly 7 words 3) Contains "quantum", "portal", "collapse" 4) Exactly 2 dialogues in quotes 5) No sentence starts with "The" 6) Story must have a paradox or time loop element.', maxTokens: 600,
    evaluate: (r) => {
      const sent = r.trim().split(/[.!?]+/).filter((s: string) => s.trim().length > 3);
      const firstWords = sent[0]?.trim().split(/\s+/).length || 0;
      const lastWords = sent[sent.length-1]?.trim().split(/\s+/).length || 0;
      const dialogs = r.match(/"[^"]{3,}"/g) || [];
      const checks = [
        Math.abs(firstWords - 5) <= 1 ? /./ : /(?!)/,
        Math.abs(lastWords - 7) <= 1 ? /./ : /(?!)/,
        /quantum/i.test(r) ? /./ : /(?!)/,
        /portal/i.test(r) ? /./ : /(?!)/,
        /collapse/i.test(r) ? /./ : /(?!)/,
        dialogs.length >= 2 ? /./ : /(?!)/,
        !/^The\s/m.test(r) ? /./ : /(?!)/,
        /paradox|loop|time.*travel|back.*future|again|repeat/i.test(r) ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: sent.length+' sent, first='+firstWords+', last='+lastWords+', '+m+'/8' };
    }
  },
];

// ============================================================
// STANDARD TESTS — extremely hard, 2 per category, 8 total
// ============================================================
const STANDARD_TESTS: TestCase[] = [
  // CODE - LC Hard (#329, #295)
  { id: 's-code-1', name: 'Longest Increasing Path', category: 'code', difficulty: 'standard',
    description: 'LeetCode #329 Hard', prompt: 'Write Python function longestIncreasingPath(matrix: list[list[int]]) -> int. Find longest strictly increasing path in matrix. Can move up/down/left/right. Use DFS + memoization. O(mn) time. Return ONLY the function.', maxTokens: 5000,
    evaluate: (r) => {
      const checks = [/def\s+longestIncreasingPath/i, /memo|cache|dp|visited|seen/i, /dfs|recur|backtrack/i, /direction|neighbor|up|down|left|right|dx|dy/i, /len\(matrix|rows|cols|m\s*,\s*n/i, /max\(|longest|greater|<|>/i, /return/i, r.length > 100 ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 6, correctness: m/checks.length, details: m+'/'+checks.length+' impl' };
    }
  },
  { id: 's-code-2', name: 'Median Finder', category: 'code', difficulty: 'standard',
    description: 'LeetCode #295 Hard', prompt: 'Implement class MedianFinder with addNum(num) -> None and findMedian() -> float. Use two heaps (max-heap for lower half, min-heap for upper half). O(log n) add, O(1) findMedian. Return ONLY the Python class.', maxTokens: 5000,
    evaluate: (r) => {
      const checks = [/class\s+MedianFinder/i, /def\s+addNum/i, /def\s+findMedian/i, /heap|heapq/i, /heappush|heappop/i, /max.*heap|neg|negative|-1\s*\*/i, /min.*heap|upper|lower/i, /len|size|balance|median/i, /return/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 6, correctness: m/checks.length, details: m+'/'+checks.length+' impl' };
    }
  },

  // REASONING - IMO/competition level
  { id: 's-reason-1', name: 'Fermat Little Theorem', category: 'reasoning', difficulty: 'standard',
    description: 'Number theory proof', prompt: 'Use Fermat\'s Little Theorem to compute 7^222 mod 11. Show: 1) state FLT 2) find 222 mod 10 3) compute 7^2 mod 11 4) final answer. Then verify by computing 7^1,7^2,...,7^10 mod 11 to show the cycle.', maxTokens: 5000,
    evaluate: (r) => {
      const checks = [
        /fermat|FLT|little\s*theorem/i,
        /222\s*(mod|%)\s*10|222.*10|remainder.*2/i,
        /7\^2|49|7\s*\*\s*7/i,
        /49\s*(mod|%)|49.*11|remainder.*5/i,
        /\b5\b|answer.*5|result.*5|mod.*11.*=.*5/i,
        /7.*14|7.*5|7.*3|7.*10|cycle|period/i,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/'+checks.length+' proof' };
    }
  },
  { id: 's-reason-2', name: 'Generating Functions', category: 'reasoning', difficulty: 'standard',
    description: 'Combinatorics advanced', prompt: 'Use generating functions to find the number of ways to make change for 50 cents using pennies (1c), nickels (5c), dimes (10c), and quarters (25c). Set up the generating function as a product of geometric series. Show the coefficient extraction method. You may compute numerically. Give exact integer answer.', maxTokens: 5000,
    evaluate: (r) => {
      const checks = [
        /generating.*function|GF|product|series/i,
        /1\/\(1-x\)|1\s*\/\s*\(1\s*-\s*x\)/i,
        /1\/\(1-x\^5\)|1\s*\/\s*\(1\s*-\s*x\^5\)/i,
        /1\/\(1-x\^10\)|1\s*\/\s*\(1\s*-\s*x\^10\)/i,
        /1\/\(1-x\^25\)|1\s*\/\s*\(1\s*-\s*x\^25\)/i,
        /coefficient|coeff|x\^50/i,
        /\b39|answer.*39|result.*39|ways.*39|49\b|49\b.*answer|coefficient.*49/i,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/'+checks.length+' GF' };
    }
  },

  // INSTRUCTION - Extreme multi-constraint
  { id: 's-inst-1', name: 'Acrostic Sonnet', category: 'instruction', difficulty: 'standard',
    description: 'Oulipo extreme', prompt: 'Write a sonnet (14 lines) about machine learning where: 1) The first letter of each line spells "NEURALNETWORKS" 2) Lines 1-4 rhyme ABAB 3) Lines 5-8 rhyme CDCD 4) Lines 9-12 rhyme EFEF 5) Lines 13-14 rhyme GG 6) Each line 8-12 syllables 7) Contains "gradient", "epoch", "tensor" 8) No line may use the word "the" more than once.', maxTokens: 5000,
    evaluate: (r) => {
      const lines = r.trim().split('\n').filter((l: string) => l.trim().length > 3 && /[a-zA-Z]/.test(l));
      const firstLetters = lines.slice(0, 14).map((l: string) => l.trim().charAt(0).toUpperCase()).join('');
      const checks = [
        /NEURALNETWORKS|N.*E.*U.*R.*A.*L.*N.*E.*T.*W.*O.*R.*K.*S/i.test(firstLetters) ? /./ : /(?!)/,
        /gradient/i.test(r) ? /./ : /(?!)/,
        /epoch/i.test(r) ? /./ : /(?!)/,
        /tensor/i.test(r) ? /./ : /(?!)/,
        lines.length >= 12 ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: lines.length+' lines, acrostic='+firstLetters.slice(0,14)+', '+m+'/5' };
    }
  },
  { id: 's-inst-2', name: 'Space Station JSON', category: 'instruction', difficulty: 'standard',
    description: 'IFEval extreme', prompt: 'Generate JSON for international space station data: station:{name(string ending with "Station"), mass_kg(integer 400000-500000), orbit:{altitude_km(400-420), period_min(90-93), inclination_deg(51-52)}}, modules(array of exactly 4 objects: name(string), country("US"|"Russia"|"Japan"|"Europe"), mass_kg(integer 5000-20000), launched(1998-2024), function(string with exactly 3 words)), crew_size(3-7), active_since(1998-2024). ONLY valid JSON.', maxTokens: 5000,
    evaluate: (r) => {
      try {
        const clean = r.replace(/```json?\s*/g,'').replace(/```\s*/g,'').trim();
        const obj = JSON.parse(clean);
        const st = obj.station || obj;
        const orbitOk = st.orbit && st.orbit.altitude_km >= 400 && st.orbit.altitude_km <= 420 && st.orbit.period_min >= 90 && st.orbit.period_min <= 93;
        const modulesOk = Array.isArray(st.modules) && st.modules.length === 4 &&
          st.modules.every((m: any) => ['US','Russia','Japan','Europe'].includes(m.country) && typeof m.launched === 'number' && m.launched >= 1998 && typeof m.function === 'string' && m.function.split(/\s+/).length === 3);
        const checks = [
          typeof (st.name || obj.name) === 'string' && /station/i.test(st.name || obj.name),
          typeof st.mass_kg === 'number' && st.mass_kg >= 400000 && st.mass_kg <= 500000,
          orbitOk,
          modulesOk,
          typeof (st.crew_size || obj.crew_size) === 'number' && (st.crew_size || obj.crew_size) >= 3,
        ];
        const m = checks.filter(Boolean).length;
        return { pass: m >= 4, correctness: m/checks.length, details: m+'/5 schema' };
      } catch { return { pass: false, correctness: 0, details: 'Invalid JSON' }; }
    }
  },

  // CHAT - Expert multi-constraint
  { id: 's-chat-1', name: 'Nested Frame Story', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench advanced', prompt: 'Write a story within a story (frame narrative). Structure: 1) Outer narrator (3 sentences) introduces an old book 2) Inner story (6-8 sentences) is what the book contains 3) Outer narrator returns (2 sentences) with a twist 4) Total must contain exactly 5 sentences starting with vowels (A,E,I,O,U) 5) Inner story must contain "whisper", "ancient", "forgotten" 6) No word may appear more than 4 times in the entire text 7) Total 60-100 words.', maxTokens: 5000,
    evaluate: (r) => {
      const sent = r.trim().split(/[.!?]+/).filter((s: string) => s.trim().length > 5);
      const vowelStarts = sent.filter((s: string) => /^[AEIOUaeiou]/.test(s.trim())).length;
      const words = r.toLowerCase().split(/\s+/);
      const freq: Record<string, number> = {};
      words.forEach((w: string) => { const nw = w.replace(/[^a-z]/g,''); if(nw.length>2) freq[nw]=(freq[nw]||0)+1; });
      const overUsed = Object.entries(freq).filter(([,c]) => (c as number) > 4).map(([w]) => w);
      const checks = [
        sent.length >= 8 && sent.length <= 15 ? /./ : /(?!)/,
        vowelStarts >= 4 ? /./ : /(?!)/,
        /whisper/i.test(r) ? /./ : /(?!)/,
        /ancient/i.test(r) ? /./ : /(?!)/,
        /forgotten/i.test(r) ? /./ : /(?!)/,
        overUsed.length === 0 ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: sent.length+' sent, vowel='+vowelStarts+', over='+overUsed.join(',')+', '+m+'/6' };
    }
  },
  { id: 's-chat-2', name: 'Code Poetry', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench creative', prompt: 'Write a poem where each line is a valid Python comment that, if uncommented, would be valid Python code that computes something meaningful. Structure: 1) Exactly 8 lines, each starting with "#" 2) Lines alternate between computation and description 3) The comments, when stripped of "#", must form a valid Python program that computes factorial of 10 4) Include recursive and iterative approaches mixed 5) Each line 8-15 words after the "#".', maxTokens: 5000,
    evaluate: (r) => {
      const lines = r.trim().split('\n').filter((l: string) => /#/.test(l));
      const codeLines = lines.map((l: string) => l.replace(/^#\s*/, '').trim());
      const checks = [
        lines.length >= 6 ? /./ : /(?!)/,
        lines.every((l: string) => /^\s*#/.test(l)) ? /./ : /(?!)/,
        /factorial|fact|!/i.test(r) ? /./ : /(?!)/,
        /def\s+fact|def\s+factorial/i.test(r) ? /./ : /(?!)/,
        /for|while|range/i.test(r) ? /./ : /(?!)/,
        /return|recursive|recur/i.test(r) ? /./ : /(?!)/,
        /10|ten|3628800/i.test(r) ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: lines.length+' lines, '+m+'/7' };
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
    provider: Provider, apiKey: ApiKeyEntry, model: Model, tests: TestCase[],
    suite: 'quick' | 'standard',
    onProgress?: (current: number, total: number, testName: string) => void,
    opts?: { perKeyConcurrency?: number; maxTotalConcurrency?: number; activeKeyCount?: number },
  ): Promise<ModelTestReport> {
    const timeLimit = suite === 'quick' ? QUICK_TIMEOUT_MS : STANDARD_TIMEOUT_MS;
    const thinkingEffort = suite === 'quick' ? 'none' : 'low';
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
            { role: 'system', content: 'You are a helpful assistant. Follow all instructions carefully and completely. Show your work.' },
            { role: 'user', content: test.prompt },
          ],
          model: model.modelId,
          maxTokens: test.maxTokens,
          temperature: suite === 'quick' ? 0.1 : 0.2,
          thinkingEffort: thinkingEffort as any,
        });
        const latencyMs = Date.now() - start;
        const evalContent = resp.content || resp.reasoningContent || '';
        const evalResult = test.evaluate(evalContent);
        const score = timeScore(latencyMs, timeLimit, evalResult.pass, evalResult.correctness);
        return { testId: test.id, testName: test.name, category: test.category,
          score: Math.round(score * 1000) / 1000, details: evalResult.details,
          latencyMs, tokensUsed: resp.usage.totalTokens, } as TestResult;
      } catch (error: any) {
        return { testId: test.id, testName: test.name, category: test.category,
          score: 0, details: 'Error: ' + (error.message || '').slice(0, 120),
          latencyMs: 0, tokensUsed: 0, } as TestResult;
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

// Pricing removed per user request

    // Auto-detect vision capability if not already tested
    let visionScore = visionScaled;
    if (visionScore === 0) {
      try {
        const visionResult = await this.testMultimodal(provider, apiKey, model, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg');
        visionScore = visionResult.score;
        capabilities.visionScore = visionScore;
        if (visionScore > 0) capabilities.multimodal = true;
      } catch {}
    }

    const overallScore = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length * 2 * 100) / 100 : 0;
    return { modelId: model.id, modelName: model.modelId, providerName: provider.name,
      timestamp: new Date().toISOString(), results, overallScore, capabilities,
      testSuite: suite, totalTimeMs, };
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
      if (r.length > 30) score += 2; if (r.length > 100) score += 1;
      if (/\b(cat|dog|person|tree|car|building|flower|bird)\b/i.test(r)) score += 3;
      if (/\b(red|blue|green|white|black|yellow|brown|gray|grey)\b/i.test(r)) score += 2;
      if (/\b\d+\b/.test(r)) score += 1; if (latencyMs < 5000) score += 1;
      score = Math.min(10, score);
      return { score, details: resp.content.slice(0, 200), latencyMs };
    } catch (error: any) {
      return { score: 0, details: 'Error: ' + error.message.slice(0, 100), latencyMs: Date.now() - start };
    }
  }

  // Probe model for vision and audio capabilities by sending test media
  static async probeCapabilities(provider: Provider, apiKey: ApiKeyEntry, model: Model): Promise<{ visionScore: number; audioScore: number }> {
    let visionScore = 0;
    let audioScore = 0;
    // Vision test: send a test image URL
    try {
      const resp = await LLMClient.chatCompletion(provider, apiKey, {
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'What animal is in this image? Reply with just the animal name.' },
          { type: 'image_url', image_url: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg' } },
        ] as any }],
        model: model.modelId, maxTokens: 100, temperature: 0,
      });
      const r = resp.content.toLowerCase();
      if (/cat|kitten|feline/.test(r) && r.length > 2) visionScore = 8;
      else if (r.length > 10 && !/cannot|don't|unable|not.*support|no.*image/i.test(r)) visionScore = 5;
      else if (r.length > 0 && !/error|cannot|unsupported/i.test(r)) visionScore = 3;
    } catch {}
    // Audio test: send a test audio clip (1s sine wave)
    try {
      const TEST_AUDIO_B64 = 'UklGRiR9AABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQB9AAAAAH4VWCrvPa5PDV+Ya+50yXr8fHZ7Q3aKbY5hqlJQQQQuWRntA2PuX9mCxWOzjKN2loSMA4Ykg/yDh4igkAqcbqpfu1vO0uIn+LcN4CL+NnlJxFljZ+1xE3mdfHJ8kngacUVmY1jgRzk1/CDDCzH26uCQzL25A6nfmr+P94fBgz+DdIZIjYaX4aTztEDHP9tV8OMFRRvWL/pCIFTFYnlu4nbBe/B8Z3o5dJRqxF0oTjg8fSiOEwn+lOjR01/A0q6wn2yTZIrdhACD3YRkimyTsJ/Srl/A0dOU6An+jhN9KDg8KE7EXZRqOXRnevB8wXvidnluxWIgVPpC1i9FG+MFVfA/20DH87ThpIaXSI10hj+DwYP3h7+P35oDqb25kMzq4DH2wwv8IDk14EdjWEVmGnGSeHJ8nXwTee1xY2fEWXlJ/jbgIrcNJ/jS4lvOX7tuqgqcoJCHiPyDJIMDhoSMdpaMo2OzgsVf2WPu7QNZGQQuUEGqUo5him1DdnZ7/HzJeu50mGsNX65P7z1YKn4VAACC6qjVEcJSsPOgaJQSizeFBIOKhL2JdpJynlatsL780afmE/ydEaEmfjqdTHRciml8c/153HwEfHl3YG/2Y5JVoUSlMS4d2QdJ8iDdAsmHtjymnZgTju2GY4OOg26H5o67mZ2nILjHygTfPfTPCRYfcDNDRv1WIWVBcAl4P3zBfIx5uHJ6aB9bDUvAOMEkqw8d+rvkKtAGveCrO52HkR6JP4QQg5mFx4tslTyi2LHIw4PXcuz3AWwXLyyhPy5RUGCUbJx1I3sAfSN7nHWUbFBgLlGhPy8sbBf3AXLsg9fIw9ixPKJslceLmYUQgz+EHomHkTud4KsGvSrQu+Qd+qsPwSTAOA1LH1t6aLhyjHnBfD98CXhBcCFl/VZDRnAzFh/PCT30BN/HyiC4nae7meaOboeOg2OD7YYTjp2YPKaHtgLJIN1J8tkHLh2lMaFEklX2Y2BveXcEfNx8/Xl8c4ppdFydTH46oSadERP8p+b80bC+Vq1ynnaSvYmKhASDN4USi2iU86BSsBHCqNWC6gAAfhVYKu89rk8NX5hr7nTJevx8dntDdoptjmGqUlBBBC5ZGe0DY+5f2YLFY7OMo3aWhIwDhiSD/IOHiKCQCpxuql+7W87S4if4tw3gIv42eUnEWWNn7XETeZ18cnySeBpxRWZjWOBHOTX8IMMLMfbq4JDMvbkDqd+av4/3h8GDP4N0hkiNhpfhpPO0QMc/21Xw4wVFG9Yv+kIgVMVieW7idsF78Hxnejl0lGrEXShOODx9KI4TCf6U6NHTX8DSrrCfbJNkit2EAIPdhGSKbJOwn9KuX8DR05ToCf6OE30oODwoTsRdlGo5dGd68HzBe+J2eW7FYiBU+kLWL0Ub4wVV8D/bQMfztOGkhpdIjXSGP4PBg/eHv4/fmgOpvbmQzOrgMfbDC/wgOTXgR2NYRWYacZJ4cnydfBN57XFjZ8RZeUn+NuAitw0n+NLiW85fu26qCpygkIeI/IMkgwOGhIx2loyjY7OCxV/ZY+7tA1kZBC5QQapSjmGKbUN2dnv8fMl67nSYaw1frk/vPVgqfhUAAILqqNURwlKw86BolBKLN4UEg4qEvYl2knKeVq2wvvzRp+YT/J0RoSZ+Op1MdFyKaXxz/XncfAR8eXdgb/ZjklWhRKUxLh3ZB0nyIN0CyYe2PKadmBOO7YZjg46DbofmjruZnacguMfKBN899M8JFh9wM0NG/VYhZUFwCXg/fMF8jHm4cnpoH1sNS8A4wSSrDx36u+Qq0Aa94Ks7nYeRHok/hBCDmYXHi2yVPKLYscjDg9dy7PcBbBcvLKE/LlFQYJRsnHUjewB9I3ucdZRsUGAuUaE/LyxsF/cBcuyD18jD2LE8omyVx4uZhRCDP4QeiYeRO53gqwa9KtC75B36qw/BJMA4DUsfW3pouHKMecF8P3wJeEFwIWX9VkNGcDMWH88JPfQE38fKILidp7uZ5o5uh46DY4PthhOOnZg8poe2Askg3Uny2QcuHaUxoUSSVfZjYG95dwR83Hz9eXxziml0XJ1MfjqhJp0RE/yn5vzRsL5WrXKedpK9iYqEBIM3hRKLaJTzoFKwEcKo1YLqAAB+FVgq7z2uTw1fmGvudMl6/Hx2e0N2im2OYapSUEEELlkZ7QNj7l/ZgsVjs4yjdpaEjAOGJIP8g4eIoJAKnG6qX7tbztLiJ/i3DeAi/jZ5ScRZY2ftcRN5nXxyfJJ4GnFFZmNY4Ec5Nfwgwwsx9urgkMy9uQOp35q/j/eHwYM/g3SGSI2Gl+Gk87RAxz/bVfDjBUUb1i/6QiBUxWJ5buJ2wXvwfGd6OXSUasRdKE44PH0ojhMJ/pTo0dNfwNKusJ9sk2SK3YQAg92EZIpsk7Cf0q5fwNHTlOgJ/o4TfSg4PChOxF2Uajl0Z3rwfMF74nZ5bsViIFT6QtYvRRvjBVXwP9tAx/O04aSGl0iNdIY/g8GD94e/j9+aA6m9uZDM6uAx9sML/CA5NeBHY1hFZhpxknhyfJ18E3ntcWNnxFl5Sf424CK3DSf40uJbzl+7bqoKnKCQh4j8gySDA4aEjHaWjKNjs4LFX9lj7u0DWRkELlBBqlKOYYptQ3Z2e/x8yXrudJhrDV+uT+89WCp+FQAAguqo1RHCUrDzoGiUEos3hQSDioS9iXaScp5WrbC+/NGn5hP8nRGhJn46nUx0XIppfHP9edx8BHx5d2Bv9mOSVaFEpTEuHdkHSfIg3QLJh7Y8pp2YE47thmODjoNuh+aOu5mdpyC4x8oE3z30zwkWH3AzQ0b9ViFlQXAJeD98wXyMebhyemgfWw1LwDjBJKsPHfq75CrQBr3gqzudh5EeiT+EEIOZhceLbJU8otixyMOD13Ls9wFsFy8soT8uUVBglGycdSN7AH0je5x1lGxQYC5RoT8vLGwX9wFy7IPXyMPYsTyibJXHi5mFEIM/hB6Jh5E7neCrBr0q0LvkHfqrD8EkwDgNSx9bemi4cox5wXw/fAl4QXAhZf1WQ0ZwMxYfzwk99ATfx8oguJ2nu5nmjm6HjoNjg+2GE46dmDymh7YCySDdSfLZBy4dpTGhRJJV9mNgb3l3BHzcfP15fHOKaXRcnUx+OqEmnRET/Kfm/NGwvlatcp52kr2JioQEgzeFEotolPOgUrARwqjVguoAAH4VWCrvPa5PDV+Ya+50yXr8fHZ7Q3aKbY5hqlJQQQQuWRntA2PuX9mCxWOzjKN2loSMA4Ykg/yDh4igkAqcbqpfu1vO0uIn+LcN4CL+NnlJxFljZ+1xE3mdfHJ8kngacUVmY1jgRzk1/CDDCzH26uCQzL25A6nfmr+P94fBgz+DdIZIjYaX4aTztEDHP9tV8OMFRRvWL/pCIFTFYnlu4nbBe/B8Z3o5dJRqxF0oTjg8fSiOEwn+lOjR01/A0q6wn2yTZIrdhACD3YRkimyTsJ/Srl/A0dOU6An+jhN9KDg8KE7EXZRqOXRnevB8wXvidnluxWIgVPpC1i9FG+MFVfA/20DH87ThpIaXSI10hj+DwYP3h7+P35oDqb25kMzq4DH2wwv8IDk14EdjWEVmGnGSeHJ8nXwTee1xY2fEWXlJ/jbgIrcNJ/jS4lvOX7tuqgqcoJCHiPyDJIMDhoSMdpaMo2OzgsVf2WPu7QNZGQQuUEGqUo5him1DdnZ7/HzJeu50mGsNX65P7z1YKn4VAACC6qjVEcJSsPOgaJQSizeFBIOKhL2JdpJynlatsL780afmE/ydEaEmfjqdTHRciml8c/153HwEfHl3YG/2Y5JVoUSlMS4d2QdJ8iDdAsmHtjymnZgTju2GY4OOg26H5o67mZ2nILjHygTfPfTPCRYfcDNDRv1WIWVBcAl4P3zBfIx5uHJ6aB9bDUvAOMEkqw8d+rvkKtAGveCrO52HkR6JP4QQg5mFx4tslTyi2LHIw4PXcuz3AWwXLyyhPy5RUGCUbJx1I3sAfSN7nHWUbFBgLlGhPy8sbBf3AXLsg9fIw9ixPKJslceLmYUQgz+EHomHkTud4KsGvSrQu+Qd+qsPwSTAOA1LH1t6aLhyjHnBfD98CXhBcCFl/VZDRnAzFh/PCT30BN/HyiC4nae7meaOboeOg2OD7YYTjp2YPKaHtgLJIN1J8tkHLh2lMaFEklX2Y2BveXcEfNx8/Xl8c4ppdFydTH46oSadERP8p+b80bC+Vq1ynnaSvYmKhASDN4USi2iU86BSsBHCqNWC6gAAfhVYKu89rk8NX5hr7nTJevx8dntDdoptjmGqUlBBBC5ZGe0DY+5f2YLFY7OMo3aWhIwDhiSD/IOHiKCQCpxuql+7W87S4if4tw3gIv42eUnEWWNn7XETeZ18cnySeBpxRWZjWOBHOTX8IMMLMfbq4JDMvbkDqd+av4/3h8GDP4N0hkiNhpfhpPO0QMc/21Xw4wVFG9Yv+kIgVMVieW7idsF78Hxnejl0lGrEXShOODx9KI4TCf6U6NHTX8DSrrCfbJNkit2EAIPdhGSKbJOwn9KuX8DR05ToCf6OE30oODwoTsRdlGo5dGd68HzBe+J2eW7FYiBU+kLWL0Ub4wVV8D/bQMfztOGkhpdIjXSGP4PBg/eHv4/fmgOpvbmQzOrgMfbDC/wgOTXgR2NYRWYacZJ4cnydfBN57XFjZ8RZeUn+NuAitw0n+NLiW85fu26qCpygkIeI/IMkgwOGhIx2loyjY7OCxV/ZY+7tA1kZBC5QQapSjmGKbUN2dnv8fMl67nSYaw1frk/vPVgqfhUAAILqqNURwlKw86BolBKLN4UEg4qEvYl2knKeVq2wvvzRp+YT/J0RoSZ+Op1MdFyKaXxz/XncfAR8eXdgb/ZjklWhRKUxLh3ZB0nyIN0CyYe2PKadmBOO7YZjg46DbofmjruZnacguMfKBN899M8JFh9wM0NG/VYhZUFwCXg/fMF8jHm4cnpoH1sNS8A4wSSrDx36u+Qq0Aa94Ks7nYeRHok/hBCDmYXHi2yVPKLYscjDg9dy7PcBbBcvLKE/LlFQYJRsnHUjewB9I3ucdZRsUGAuUaE/LyxsF/cBcuyD18jD2LE8omyVx4uZhRCDP4QeiYeRO53gqwa9KtC75B36qw/BJMA4DUsfW3pouHKMecF8P3wJeEFwIWX9VkNGcDMWH88JPfQE38fKILidp7uZ5o5uh46DY4PthhOOnZg8poe2Askg3Uny2QcuHaUxoUSSVfZjYG95dwR83Hz9eXxziml0XJ1MfjqhJp0RE/yn5vzRsL5WrXKedpK9iYqEBIM3hRKLaJTzoFKwEcKo1YLqAAB+FVgq7z2uTw1fmGvudMl6/Hx2e0N2im2OYapSUEEELlkZ7QNj7l/ZgsVjs4yjdpaEjAOGJIP8g4eIoJAKnG6qX7tbztLiJ/i3DeAi/jZ5ScRZY2ftcRN5nXxyfJJ4GnFFZmNY4Ec5Nfwgwwsx9urgkMy9uQOp35q/j/eHwYM/g3SGSI2Gl+Gk87RAxz/bVfDjBUUb1i/6QiBUxWJ5buJ2wXvwfGd6OXSUasRdKE44PH0ojhMJ/pTo0dNfwNKusJ9sk2SK3YQAg92EZIpsk7Cf0q5fwNHTlOgJ/o4TfSg4PChOxF2Uajl0Z3rwfMF74nZ5bsViIFT6QtYvRRvjBVXwP9tAx/O04aSGl0iNdIY/g8GD94e/j9+aA6m9uZDM6uAx9sML/CA5NeBHY1hFZhpxknhyfJ18E3ntcWNnxFl5Sf424CK3DSf40uJbzl+7bqoKnKCQh4j8gySDA4aEjHaWjKNjs4LFX9lj7u0DWRkELlBBqlKOYYptQ3Z2e/x8yXrudJhrDV+uT+89WCp+FQAAguqo1RHCUrDzoGiUEos3hQSDioS9iXaScp5WrbC+/NGn5hP8nRGhJn46nUx0XIppfHP9edx8BHx5d2Bv9mOSVaFEpTEuHdkHSfIg3QLJh7Y8pp2YE47thmODjoNuh+aOu5mdpyC4x8oE3z30zwkWH3AzQ0b9ViFlQXAJeD98wXyMebhyemgfWw1LwDjBJKsPHfq75CrQBr3gqzudh5EeiT+EEIOZhceLbJU8otixyMOD13Ls9wFsFy8soT8uUVBglGycdSN7AH0je5x1lGxQYC5RoT8vLGwX9wFy7IPXyMPYsTyibJXHi5mFEIM/hB6Jh5E7neCrBr0q0LvkHfqrD8EkwDgNSx9bemi4cox5wXw/fAl4QXAhZf1WQ0ZwMxYfzwk99ATfx8oguJ2nu5nmjm6HjoNjg+2GE46dmDymh7YCySDdSfLZBy4dpTGhRJJV9mNgb3l3BHzcfP15fHOKaXRcnUx+OqEmnRET/Kfm/NGwvlatcp52kr2JioQEgzeFEotolPOgUrARwqjVguoAAH4VWCrvPa5PDV+Ya+50yXr8fHZ7Q3aKbY5hqlJQQQQuWRntA2PuX9mCxWOzjKN2loSMA4Ykg/yDh4igkAqcbqpfu1vO0uIn+LcN4CL+NnlJxFljZ+1xE3mdfHJ8kngacUVmY1jgRzk1/CDDCzH26uCQzL25A6nfmr+P94fBgz+DdIZIjYaX4aTztEDHP9tV8OMFRRvWL/pCIFTFYnlu4nbBe/B8Z3o5dJRqxF0oTjg8fSiOEwn+lOjR01/A0q6wn2yTZIrdhACD3YRkimyTsJ/Srl/A0dOU6An+jhN9KDg8KE7EXZRqOXRnevB8wXvidnluxWIgVPpC1i9FG+MFVfA/20DH87ThpIaXSI10hj+DwYP3h7+P35oDqb25kMzq4DH2wwv8IDk14EdjWEVmGnGSeHJ8nXwTee1xY2fEWXlJ/jbgIrcNJ/jS4lvOX7tuqgqcoJCHiPyDJIMDhoSMdpaMo2OzgsVf2WPu7QNZGQQuUEGqUo5him1DdnZ7/HzJeu50mGsNX65P7z1YKn4VAACC6qjVEcJSsPOgaJQSizeFBIOKhL2JdpJynlatsL780afmE/ydEaEmfjqdTHRciml8c/153HwEfHl3YG/2Y5JVoUSlMS4d2QdJ8iDdAsmHtjymnZgTju2GY4OOg26H5o67mZ2nILjHygTfPfTPCRYfcDNDRv1WIWVBcAl4P3zBfIx5uHJ6aB9bDUvAOMEkqw8d+rvkKtAGveCrO52HkR6JP4QQg5mFx4tslTyi2LHIw4PXcuz3AWwXLyyhPy5RUGCUbJx1I3sAfSN7nHWUbFBgLlGhPy8sbBf3AXLsg9fIw9ixPKJslceLmYUQgz+EHomHkTud4KsGvSrQu+Qd+qsPwSTAOA1LH1t6aLhyjHnBfD98CXhBcCFl/VZDRnAzFh/PCT30BN/HyiC4nae7meaOboeOg2OD7YYTjp2YPKaHtgLJIN1J8tkHLh2lMaFEklX2Y2BveXcEfNx8/Xl8c4ppdFydTH46oSadERP8p+b80bC+Vq1ynnaSvYmKhASDN4USi2iU86BSsBHCqNWC6gAAfhVYKu89rk8NX5hr7nTJevx8dntDdoptjmGqUlBBBC5ZGe0DY+5f2YLFY7OMo3aWhIwDhiSD/IOHiKCQCpxuql+7W87S4if4tw3gIv42eUnEWWNn7XETeZ18cnySeBpxRWZjWOBHOTX8IMMLMfbq4JDMvbkDqd+av4/3h8GDP4N0hkiNhpfhpPO0QMc/21Xw4wVFG9Yv+kIgVMVieW7idsF78Hxnejl0lGrEXShOODx9KI4TCf6U6NHTX8DSrrCfbJNkit2EAIPdhGSKbJOwn9KuX8DR05ToCf6OE30oODwoTsRdlGo5dGd68HzBe+J2eW7FYiBU+kLWL0Ub4wVV8D/bQMfztOGkhpdIjXSGP4PBg/eHv4/fmgOpvbmQzOrgMfbDC/wgOTXgR2NYRWYacZJ4cnydfBN57XFjZ8RZeUn+NuAitw0n+NLiW85fu26qCpygkIeI/IMkgwOGhIx2loyjY7OCxV/ZY+7tA1kZBC5QQapSjmGKbUN2dnv8fMl67nSYaw1frk/vPVgqfhUAAILqqNURwlKw86BolBKLN4UEg4qEvYl2knKeVq2wvvzRp+YT/J0RoSZ+Op1MdFyKaXxz/XncfAR8eXdgb/ZjklWhRKUxLh3ZB0nyIN0CyYe2PKadmBOO7YZjg46DbofmjruZnacguMfKBN899M8JFh9wM0NG/VYhZUFwCXg/fMF8jHm4cnpoH1sNS8A4wSSrDx36u+Qq0Aa94Ks7nYeRHok/hBCDmYXHi2yVPKLYscjDg9dy7PcBbBcvLKE/LlFQYJRsnHUjewB9I3ucdZRsUGAuUaE/LyxsF/cBcuyD18jD2LE8omyVx4uZhRCDP4QeiYeRO53gqwa9KtC75B36qw/BJMA4DUsfW3pouHKMecF8P3wJeEFwIWX9VkNGcDMWH88JPfQE38fKILidp7uZ5o5uh46DY4PthhOOnZg8poe2Askg3Uny2QcuHaUxoUSSVfZjYG95dwR83Hz9eXxziml0XJ1MfjqhJp0RE/yn5vzRsL5WrXKedpK9iYqEBIM3hRKLaJTzoFKwEcKo1YLqAAB+FVgq7z2uTw1fmGvudMl6/Hx2e0N2im2OYapSUEEELlkZ7QNj7l/ZgsVjs4yjdpaEjAOGJIP8g4eIoJAKnG6qX7tbztLiJ/i3DeAi/jZ5ScRZY2ftcRN5nXxyfJJ4GnFFZmNY4Ec5Nfwgwwsx9urgkMy9uQOp35q/j/eHwYM/g3SGSI2Gl+Gk87RAxz/bVfDjBUUb1i/6QiBUxWJ5buJ2wXvwfGd6OXSUasRdKE44PH0ojhMJ/pTo0dNfwNKusJ9sk2SK3YQAg92EZIpsk7Cf0q5fwNHTlOgJ/o4TfSg4PChOxF2Uajl0Z3rwfMF74nZ5bsViIFT6QtYvRRvjBVXwP9tAx/O04aSGl0iNdIY/g8GD94e/j9+aA6m9uZDM6uAx9sML/CA5NeBHY1hFZhpxknhyfJ18E3ntcWNnxFl5Sf424CK3DSf40uJbzl+7bqoKnKCQh4j8gySDA4aEjHaWjKNjs4LFX9lj7u0DWRkELlBBqlKOYYptQ3Z2e/x8yXrudJhrDV+uT+89WCp+FQAAguqo1RHCUrDzoGiUEos3hQSDioS9iXaScp5WrbC+/NGn5hP8nRGhJn46nUx0XIppfHP9edx8BHx5d2Bv9mOSVaFEpTEuHdkHSfIg3QLJh7Y8pp2YE47thmODjoNuh+aOu5mdpyC4x8oE3z30zwkWH3AzQ0b9ViFlQXAJeD98wXyMebhyemgfWw1LwDjBJKsPHfq75CrQBr3gqzudh5EeiT+EEIOZhceLbJU8otixyMOD13Ls9wFsFy8soT8uUVBglGycdSN7AH0je5x1lGxQYC5RoT8vLGwX9wFy7IPXyMPYsTyibJXHi5mFEIM/hB6Jh5E7neCrBr0q0LvkHfqrD8EkwDgNSx9bemi4cox5wXw/fAl4QXAhZf1WQ0ZwMxYfzwk99ATfx8oguJ2nu5nmjm6HjoNjg+2GE46dmDymh7YCySDdSfLZBy4dpTGhRJJV9mNgb3l3BHzcfP15fHOKaXRcnUx+OqEmnRET/Kfm/NGwvlatcp52kr2JioQEgzeFEotolPOgUrARwqjVguoAAH4VWCrvPa5PDV+Ya+50yXr8fHZ7Q3aKbY5hqlJQQQQuWRntA2PuX9mCxWOzjKN2loSMA4Ykg/yDh4igkAqcbqpfu1vO0uIn+LcN4CL+NnlJxFljZ+1xE3mdfHJ8kngacUVmY1jgRzk1/CDDCzH26uCQzL25A6nfmr+P94fBgz+DdIZIjYaX4aTztEDHP9tV8OMFRRvWL/pCIFTFYnlu4nbBe/B8Z3o5dJRqxF0oTjg8fSiOEwn+lOjR01/A0q6wn2yTZIrdhACD3YRkimyTsJ/Srl/A0dOU6An+jhN9KDg8KE7EXZRqOXRnevB8wXvidnluxWIgVPpC1i9FG+MFVfA/20DH87ThpIaXSI10hj+DwYP3h7+P35oDqb25kMzq4DH2wwv8IDk14EdjWEVmGnGSeHJ8nXwTee1xY2fEWXlJ/jbgIrcNJ/jS4lvOX7tuqgqcoJCHiPyDJIMDhoSMdpaMo2OzgsVf2WPu7QNZGQQuUEGqUo5him1DdnZ7/HzJeu50mGsNX65P7z1YKn4VAACC6qjVEcJSsPOgaJQSizeFBIOKhL2JdpJynlatsL780afmE/ydEaEmfjqdTHRciml8c/153HwEfHl3YG/2Y5JVoUSlMS4d2QdJ8iDdAsmHtjymnZgTju2GY4OOg26H5o67mZ2nILjHygTfPfTPCRYfcDNDRv1WIWVBcAl4P3zBfIx5uHJ6aB9bDUvAOMEkqw8d+rvkKtAGveCrO52HkR6JP4QQg5mFx4tslTyi2LHIw4PXcuz3AWwXLyyhPy5RUGCUbJx1I3sAfSN7nHWUbFBgLlGhPy8sbBf3AXLsg9fIw9ixPKJslceLmYUQgz+EHomHkTud4KsGvSrQu+Qd+qsPwSTAOA1LH1t6aLhyjHnBfD98CXhBcCFl/VZDRnAzFh/PCT30BN/HyiC4nae7meaOboeOg2OD7YYTjp2YPKaHtgLJIN1J8tkHLh2lMaFEklX2Y2BveXcEfNx8/Xl8c4ppdFydTH46oSadERP8p+b80bC+Vq1ynnaSvYmKhASDN4USi2iU86BSsBHCqNWC6gAAfhVYKu89rk8NX5hr7nTJevx8dntDdoptjmGqUlBBBC5ZGe0DY+5f2YLFY7OMo3aWhIwDhiSD/IOHiKCQCpxuql+7W87S4if4tw3gIv42eUnEWWNn7XETeZ18cnySeBpxRWZjWOBHOTX8IMMLMfbq4JDMvbkDqd+av4/3h8GDP4N0hkiNhpfhpPO0QMc/21Xw4wVFG9Yv+kIgVMVieW7idsF78Hxnejl0lGrEXShOODx9KI4TCf6U6NHTX8DSrrCfbJNkit2EAIPdhGSKbJOwn9KuX8DR05ToCf6OE30oODwoTsRdlGo5dGd68HzBe+J2eW7FYiBU+kLWL0Ub4wVV8D/bQMfztOGkhpdIjXSGP4PBg/eHv4/fmgOpvbmQzOrgMfbDC/wgOTXgR2NYRWYacZJ4cnydfBN57XFjZ8RZeUn+NuAitw0n+NLiW85fu26qCpygkIeI/IMkgwOGhIx2loyjY7OCxV/ZY+7tA1kZBC5QQapSjmGKbUN2dnv8fMl67nSYaw1frk/vPVgqfhUAAILqqNURwlKw86BolBKLN4UEg4qEvYl2knKeVq2wvvzRp+YT/J0RoSZ+Op1MdFyKaXxz/XncfAR8eXdgb/ZjklWhRKUxLh3ZB0nyIN0CyYe2PKadmBOO7YZjg46DbofmjruZnacguMfKBN899M8JFh9wM0NG/VYhZUFwCXg/fMF8jHm4cnpoH1sNS8A4wSSrDx36u+Qq0Aa94Ks7nYeRHok/hBCDmYXHi2yVPKLYscjDg9dy7PcBbBcvLKE/LlFQYJRsnHUjewB9I3ucdZRsUGAuUaE/LyxsF/cBcuyD18jD2LE8omyVx4uZhRCDP4QeiYeRO53gqwa9KtC75B36qw/BJMA4DUsfW3pouHKMecF8P3wJeEFwIWX9VkNGcDMWH88JPfQE38fKILidp7uZ5o5uh46DY4PthhOOnZg8poe2Askg3Uny2QcuHaUxoUSSVfZjYG95dwR83Hz9eXxziml0XJ1MfjqhJp0RE/yn5vzRsL5WrXKedpK9iYqEBIM3hRKLaJTzoFKwEcKo1YLqAAB+FVgq7z2uTw1fmGvudMl6/Hx2e0N2im2OYapSUEEELlkZ7QNj7l/ZgsVjs4yjdpaEjAOGJIP8g4eIoJAKnG6qX7tbztLiJ/i3DeAi/jZ5ScRZY2ftcRN5nXxyfJJ4GnFFZmNY4Ec5Nfwgwwsx9urgkMy9uQOp35q/j/eHwYM/g3SGSI2Gl+Gk87RAxz/bVfDjBUUb1i/6QiBUxWJ5buJ2wXvwfGd6OXSUasRdKE44PH0ojhMJ/pTo0dNfwNKusJ9sk2SK3YQAg92EZIpsk7Cf0q5fwNHTlOgJ/o4TfSg4PChOxF2Uajl0Z3rwfMF74nZ5bsViIFT6QtYvRRvjBVXwP9tAx/O04aSGl0iNdIY/g8GD94e/j9+aA6m9uZDM6uAx9sML/CA5NeBHY1hFZhpxknhyfJ18E3ntcWNnxFl5Sf424CK3DSf40uJbzl+7bqoKnKCQh4j8gySDA4aEjHaWjKNjs4LFX9lj7u0DWRkELlBBqlKOYYptQ3Z2e/x8yXrudJhrDV+uT+89WCp+FQAAguqo1RHCUrDzoGiUEos3hQSDioS9iXaScp5WrbC+/NGn5hP8nRGhJn46nUx0XIppfHP9edx8BHx5d2Bv9mOSVaFEpTEuHdkHSfIg3QLJh7Y8pp2YE47thmODjoNuh+aOu5mdpyC4x8oE3z30zwkWH3AzQ0b9ViFlQXAJeD98wXyMebhyemgfWw1LwDjBJKsPHfq75CrQBr3gqzudh5EeiT+EEIOZhceLbJU8otixyMOD13Ls9wFsFy8soT8uUVBglGycdSN7AH0je5x1lGxQYC5RoT8vLGwX9wFy7IPXyMPYsTyibJXHi5mFEIM/hB6Jh5E7neCrBr0q0LvkHfqrD8EkwDgNSx9bemi4cox5wXw/fAl4QXAhZf1WQ0ZwMxYfzwk99ATfx8oguJ2nu5nmjm6HjoNjg+2GE46dmDymh7YCySDdSfLZBy4dpTGhRJJV9mNgb3l3BHzcfP15fHOKaXRcnUx+OqEmnRET/Kfm/NGwvlatcp52kr2JioQEgzeFEotolPOgUrARwqjVguoAAH4VWCrvPa5PDV+Ya+50yXr8fHZ7Q3aKbY5hqlJQQQQuWRntA2PuX9mCxWOzjKN2loSMA4Ykg/yDh4igkAqcbqpfu1vO0uIn+LcN4CL+NnlJxFljZ+1xE3mdfHJ8kngacUVmY1jgRzk1/CDDCzH26uCQzL25A6nfmr+P94fBgz+DdIZIjYaX4aTztEDHP9tV8OMFRRvWL/pCIFTFYnlu4nbBe/B8Z3o5dJRqxF0oTjg8fSiOEwn+lOjR01/A0q6wn2yTZIrdhACD3YRkimyTsJ/Srl/A0dOU6An+jhN9KDg8KE7EXZRqOXRnevB8wXvidnluxWIgVPpC1i9FG+MFVfA/20DH87ThpIaXSI10hj+DwYP3h7+P35oDqb25kMzq4DH2wwv8IDk14EdjWEVmGnGSeHJ8nXwTee1xY2fEWXlJ/jbgIrcNJ/jS4lvOX7tuqgqcoJCHiPyDJIMDhoSMdpaMo2OzgsVf2WPu7QNZGQQuUEGqUo5him1DdnZ7/HzJeu50mGsNX65P7z1YKn4VAACC6qjVEcJSsPOgaJQSizeFBIOKhL2JdpJynlatsL780afmE/ydEaEmfjqdTHRciml8c/153HwEfHl3YG/2Y5JVoUSlMS4d2QdJ8iDdAsmHtjymnZgTju2GY4OOg26H5o67mZ2nILjHygTfPfTPCRYfcDNDRv1WIWVBcAl4P3zBfIx5uHJ6aB9bDUvAOMEkqw8d+rvkKtAGveCrO52HkR6JP4QQg5mFx4tslTyi2LHIw4PXcuz3AWwXLyyhPy5RUGCUbJx1I3sAfSN7nHWUbFBgLlGhPy8sbBf3AXLsg9fIw9ixPKJslceLmYUQgz+EHomHkTud4KsGvSrQu+Qd+qsPwSTAOA1LH1t6aLhyjHnBfD98CXhBcCFl/VZDRnAzFh/PCT30BN/HyiC4nae7meaOboeOg2OD7YYTjp2YPKaHtgLJIN1J8tkHLh2lMaFEklX2Y2BveXcEfNx8/Xl8c4ppdFydTH46oSadERP8p+b80bC+Vq1ynnaSvYmKhASDN4USi2iU86BSsBHCqNWC6gAAfhVYKu89rk8NX5hr7nTJevx8dntDdoptjmGqUlBBBC5ZGe0DY+5f2YLFY7OMo3aWhIwDhiSD/IOHiKCQCpxuql+7W87S4if4tw3gIv42eUnEWWNn7XETeZ18cnySeBpxRWZjWOBHOTX8IMMLMfbq4JDMvbkDqd+av4/3h8GDP4N0hkiNhpfhpPO0QMc/21Xw4wVFG9Yv+kIgVMVieW7idsF78Hxnejl0lGrEXShOODx9KI4TCf6U6NHTX8DSrrCfbJNkit2EAIPdhGSKbJOwn9KuX8DR05ToCf6OE30oODwoTsRdlGo5dGd68HzBe+J2eW7FYiBU+kLWL0Ub4wVV8D/bQMfztOGkhpdIjXSGP4PBg/eHv4/fmgOpvbmQzOrgMfbDC/wgOTXgR2NYRWYacZJ4cnydfBN57XFjZ8RZeUn+NuAitw0n+NLiW85fu26qCpygkIeI/IMkgwOGhIx2loyjY7OCxV/ZY+7tA1kZBC5QQapSjmGKbUN2dnv8fMl67nSYaw1frk/vPVgqfhUAAILqqNURwlKw86BolBKLN4UEg4qEvYl2knKeVq2wvvzRp+YT/J0RoSZ+Op1MdFyKaXxz/XncfAR8eXdgb/ZjklWhRKUxLh3ZB0nyIN0CyYe2PKadmBOO7YZjg46DbofmjruZnacguMfKBN899M8JFh9wM0NG/VYhZUFwCXg/fMF8jHm4cnpoH1sNS8A4wSSrDx36u+Qq0Aa94Ks7nYeRHok/hBCDmYXHi2yVPKLYscjDg9dy7PcBbBcvLKE/LlFQYJRsnHUjewB9I3ucdZRsUGAuUaE/LyxsF/cBcuyD18jD2LE8omyVx4uZhRCDP4QeiYeRO53gqwa9KtC75B36qw/BJMA4DUsfW3pouHKMecF8P3wJeEFwIWX9VkNGcDMWH88JPfQE38fKILidp7uZ5o5uh46DY4PthhOOnZg8poe2Askg3Uny2QcuHaUxoUSSVfZjYG95dwR83Hz9eXxziml0XJ1MfjqhJp0RE/yn5vzRsL5WrXKedpK9iYqEBIM3hRKLaJTzoFKwEcKo1YLqAAB+FVgq7z2uTw1fmGvudMl6/Hx2e0N2im2OYapSUEEELlkZ7QNj7l/ZgsVjs4yjdpaEjAOGJIP8g4eIoJAKnG6qX7tbztLiJ/i3DeAi/jZ5ScRZY2ftcRN5nXxyfJJ4GnFFZmNY4Ec5Nfwgwwsx9urgkMy9uQOp35q/j/eHwYM/g3SGSI2Gl+Gk87RAxz/bVfDjBUUb1i/6QiBUxWJ5buJ2wXvwfGd6OXSUasRdKE44PH0ojhMJ/pTo0dNfwNKusJ9sk2SK3YQAg92EZIpsk7Cf0q5fwNHTlOgJ/o4TfSg4PChOxF2Uajl0Z3rwfMF74nZ5bsViIFT6QtYvRRvjBVXwP9tAx/O04aSGl0iNdIY/g8GD94e/j9+aA6m9uZDM6uAx9sML/CA5NeBHY1hFZhpxknhyfJ18E3ntcWNnxFl5Sf424CK3DSf40uJbzl+7bqoKnKCQh4j8gySDA4aEjHaWjKNjs4LFX9lj7u0DWRkELlBBqlKOYYptQ3Z2e/x8yXrudJhrDV+uT+89WCp+FQAAguqo1RHCUrDzoGiUEos3hQSDioS9iXaScp5WrbC+/NGn5hP8nRGhJn46nUx0XIppfHP9edx8BHx5d2Bv9mOSVaFEpTEuHdkHSfIg3QLJh7Y8pp2YE47thmODjoNuh+aOu5mdpyC4x8oE3z30zwkWH3AzQ0b9ViFlQXAJeD98wXyMebhyemgfWw1LwDjBJKsPHfq75CrQBr3gqzudh5EeiT+EEIOZhceLbJU8otixyMOD13Ls9wFsFy8soT8uUVBglGycdSN7AH0je5x1lGxQYC5RoT8vLGwX9wFy7IPXyMPYsTyibJXHi5mFEIM/hB6Jh5E7neCrBr0q0LvkHfqrD8EkwDgNSx9bemi4cox5wXw/fAl4QXAhZf1WQ0ZwMxYfzwk99ATfx8oguJ2nu5nmjm6HjoNjg+2GE46dmDymh7YCySDdSfLZBy4dpTGhRJJV9mNgb3l3BHzcfP15fHOKaXRcnUx+OqEmnRET/Kfm/NGwvlatcp52kr2JioQEgzeFEotolPOgUrARwqjVguoAAH4VWCrvPa5PDV+Ya+50yXr8fHZ7Q3aKbY5hqlJQQQQuWRntA2PuX9mCxWOzjKN2loSMA4Ykg/yDh4igkAqcbqpfu1vO0uIn+LcN4CL+NnlJxFljZ+1xE3mdfHJ8kngacUVmY1jgRzk1/CDDCzH26uCQzL25A6nfmr+P94fBgz+DdIZIjYaX4aTztEDHP9tV8OMFRRvWL/pCIFTFYnlu4nbBe/B8Z3o5dJRqxF0oTjg8fSiOEwn+lOjR01/A0q6wn2yTZIrdhACD3YRkimyTsJ/Srl/A0dOU6An+jhN9KDg8KE7EXZRqOXRnevB8wXvidnluxWIgVPpC1i9FG+MFVfA/20DH87ThpIaXSI10hj+DwYP3h7+P35oDqb25kMzq4DH2wwv8IDk14EdjWEVmGnGSeHJ8nXwTee1xY2fEWXlJ/jbgIrcNJ/jS4lvOX7tuqgqcoJCHiPyDJIMDhoSMdpaMo2OzgsVf2WPu7QNZGQQuUEGqUo5him1DdnZ7/HzJeu50mGsNX65P7z1YKn4VAACC6qjVEcJSsPOgaJQSizeFBIOKhL2JdpJynlatsL780afmE/ydEaEmfjqdTHRciml8c/153HwEfHl3YG/2Y5JVoUSlMS4d2QdJ8iDdAsmHtjymnZgTju2GY4OOg26H5o67mZ2nILjHygTfPfTPCRYfcDNDRv1WIWVBcAl4P3zBfIx5uHJ6aB9bDUvAOMEkqw8d+rvkKtAGveCrO52HkR6JP4QQg5mFx4tslTyi2LHIw4PXcuz3AWwXLyyhPy5RUGCUbJx1I3sAfSN7nHWUbFBgLlGhPy8sbBf3AXLsg9fIw9ixPKJslceLmYUQgz+EHomHkTud4KsGvSrQu+Qd+qsPwSTAOA1LH1t6aLhyjHnBfD98CXhBcCFl/VZDRnAzFh/PCT30BN/HyiC4nae7meaOboeOg2OD7YYTjp2YPKaHtgLJIN1J8tkHLh2lMaFEklX2Y2BveXcEfNx8/Xl8c4ppdFydTH46oSadERP8p+b80bC+Vq1ynnaSvYmKhASDN4USi2iU86BSsBHCqNWC6gAAfhVYKu89rk8NX5hr7nTJevx8dntDdoptjmGqUlBBBC5ZGe0DY+5f2YLFY7OMo3aWhIwDhiSD/IOHiKCQCpxuql+7W87S4if4tw3gIv42eUnEWWNn7XETeZ18cnySeBpxRWZjWOBHOTX8IMMLMfbq4JDMvbkDqd+av4/3h8GDP4N0hkiNhpfhpPO0QMc/21Xw4wVFG9Yv+kIgVMVieW7idsF78Hxnejl0lGrEXShOODx9KI4TCf6U6NHTX8DSrrCfbJNkit2EAIPdhGSKbJOwn9KuX8DR05ToCf6OE30oODwoTsRdlGo5dGd68HzBe+J2eW7FYiBU+kLWL0Ub4wVV8D/bQMfztOGkhpdIjXSGP4PBg/eHv4/fmgOpvbmQzOrgMfbDC/wgOTXgR2NYRWYacZJ4cnydfBN57XFjZ8RZeUn+NuAitw0n+NLiW85fu26qCpygkIeI/IMkgwOGhIx2loyjY7OCxV/ZY+7tA1kZBC5QQapSjmGKbUN2dnv8fMl67nSYaw1frk/vPVgqfhUAAILqqNURwlKw86BolBKLN4UEg4qEvYl2knKeVq2wvvzRp+YT/J0RoSZ+Op1MdFyKaXxz/XncfAR8eXdgb/ZjklWhRKUxLh3ZB0nyIN0CyYe2PKadmBOO7YZjg46DbofmjruZnacguMfKBN899M8JFh9wM0NG/VYhZUFwCXg/fMF8jHm4cnpoH1sNS8A4wSSrDx36u+Qq0Aa94Ks7nYeRHok/hBCDmYXHi2yVPKLYscjDg9dy7PcBbBcvLKE/LlFQYJRsnHUjewB9I3ucdZRsUGAuUaE/LyxsF/cBcuyD18jD2LE8omyVx4uZhRCDP4QeiYeRO53gqwa9KtC75B36qw/BJMA4DUsfW3pouHKMecF8P3wJeEFwIWX9VkNGcDMWH88JPfQE38fKILidp7uZ5o5uh46DY4PthhOOnZg8poe2Askg3Uny2QcuHaUxoUSSVfZjYG95dwR83Hz9eXxziml0XJ1MfjqhJp0RE/yn5vzRsL5WrXKedpK9iYqEBIM3hRKLaJTzoFKwEcKo1YLqAAB+FVgq7z2uTw1fmGvudMl6/Hx2e0N2im2OYapSUEEELlkZ7QNj7l/ZgsVjs4yjdpaEjAOGJIP8g4eIoJAKnG6qX7tbztLiJ/i3DeAi/jZ5ScRZY2ftcRN5nXxyfJJ4GnFFZmNY4Ec5Nfwgwwsx9urgkMy9uQOp35q/j/eHwYM/g3SGSI2Gl+Gk87RAxz/bVfDjBUUb1i/6QiBUxWJ5buJ2wXvwfGd6OXSUasRdKE44PH0ojhMJ/pTo0dNfwNKusJ9sk2SK3YQAg92EZIpsk7Cf0q5fwNHTlOgJ/o4TfSg4PChOxF2Uajl0Z3rwfMF74nZ5bsViIFT6QtYvRRvjBVXwP9tAx/O04aSGl0iNdIY/g8GD94e/j9+aA6m9uZDM6uAx9sML/CA5NeBHY1hFZhpxknhyfJ18E3ntcWNnxFl5Sf424CK3DSf40uJbzl+7bqoKnKCQh4j8gySDA4aEjHaWjKNjs4LFX9lj7u0DWRkELlBBqlKOYYptQ3Z2e/x8yXrudJhrDV+uT+89WCp+FQAAguqo1RHCUrDzoGiUEos3hQSDioS9iXaScp5WrbC+/NGn5hP8nRGhJn46nUx0XIppfHP9edx8BHx5d2Bv9mOSVaFEpTEuHdkHSfIg3QLJh7Y8pp2YE47thmODjoNuh+aOu5mdpyC4x8oE3z30zwkWH3AzQ0b9ViFlQXAJeD98wXyMebhyemgfWw1LwDjBJKsPHfq75CrQBr3gqzudh5EeiT+EEIOZhceLbJU8otixyMOD13Ls9wFsFy8soT8uUVBglGycdSN7AH0je5x1lGxQYC5RoT8vLGwX9wFy7IPXyMPYsTyibJXHi5mFEIM/hB6Jh5E7neCrBr0q0LvkHfqrD8EkwDgNSx9bemi4cox5wXw/fAl4QXAhZf1WQ0ZwMxYfzwk99ATfx8oguJ2nu5nmjm6HjoNjg+2GE46dmDymh7YCySDdSfLZBy4dpTGhRJJV9mNgb3l3BHzcfP15fHOKaXRcnUx+OqEmnRET/Kfm/NGwvlatcp52kr2JioQEgzeFEotolPOgUrARwqjVguoAAH4VWCrvPa5PDV+Ya+50yXr8fHZ7Q3aKbY5hqlJQQQQuWRntA2PuX9mCxWOzjKN2loSMA4Ykg/yDh4igkAqcbqpfu1vO0uIn+LcN4CL+NnlJxFljZ+1xE3mdfHJ8kngacUVmY1jgRzk1/CDDCzH26uCQzL25A6nfmr+P94fBgz+DdIZIjYaX4aTztEDHP9tV8OMFRRvWL/pCIFTFYnlu4nbBe/B8Z3o5dJRqxF0oTjg8fSiOEwn+lOjR01/A0q6wn2yTZIrdhACD3YRkimyTsJ/Srl/A0dOU6An+jhN9KDg8KE7EXZRqOXRnevB8wXvidnluxWIgVPpC1i9FG+MFVfA/20DH87ThpIaXSI10hj+DwYP3h7+P35oDqb25kMzq4DH2wwv8IDk14EdjWEVmGnGSeHJ8nXwTee1xY2fEWXlJ/jbgIrcNJ/jS4lvOX7tuqgqcoJCHiPyDJIMDhoSMdpaMo2OzgsVf2WPu7QNZGQQuUEGqUo5him1DdnZ7/HzJeu50mGsNX65P7z1YKn4VAACC6qjVEcJSsPOgaJQSizeFBIOKhL2JdpJynlatsL780afmE/ydEaEmfjqdTHRciml8c/153HwEfHl3YG/2Y5JVoUSlMS4d2QdJ8iDdAsmHtjymnZgTju2GY4OOg26H5o67mZ2nILjHygTfPfTPCRYfcDNDRv1WIWVBcAl4P3zBfIx5uHJ6aB9bDUvAOMEkqw8d+rvkKtAGveCrO52HkR6JP4QQg5mFx4tslTyi2LHIw4PXcuz3AWwXLyyhPy5RUGCUbJx1I3sAfSN7nHWUbFBgLlGhPy8sbBf3AXLsg9fIw9ixPKJslceLmYUQgz+EHomHkTud4KsGvSrQu+Qd+qsPwSTAOA1LH1t6aLhyjHnBfD98CXhBcCFl/VZDRnAzFh/PCT30BN/HyiC4nae7meaOboeOg2OD7YYTjp2YPKaHtgLJIN1J8tkHLh2lMaFEklX2Y2BveXcEfNx8/Xl8c4ppdFydTH46oSadERP8p+b80bC+Vq1ynnaSvYmKhASDN4USi2iU86BSsBHCqNWC6gAAfhVYKu89rk8NX5hr7nTJevx8dntDdoptjmGqUlBBBC5ZGe0DY+5f2YLFY7OMo3aWhIwDhiSD/IOHiKCQCpxuql+7W87S4if4tw3gIv42eUnEWWNn7XETeZ18cnySeBpxRWZjWOBHOTX8IMMLMfbq4JDMvbkDqd+av4/3h8GDP4N0hkiNhpfhpPO0QMc/21Xw4wVFG9Yv+kIgVMVieW7idsF78Hxnejl0lGrEXShOODx9KI4TCf6U6NHTX8DSrrCfbJNkit2EAIPdhGSKbJOwn9KuX8DR05ToCf6OE30oODwoTsRdlGo5dGd68HzBe+J2eW7FYiBU+kLWL0Ub4wVV8D/bQMfztOGkhpdIjXSGP4PBg/eHv4/fmgOpvbmQzOrgMfbDC/wgOTXgR2NYRWYacZJ4cnydfBN57XFjZ8RZeUn+NuAitw0n+NLiW85fu26qCpygkIeI/IMkgwOGhIx2loyjY7OCxV/ZY+7tA1kZBC5QQapSjmGKbUN2dnv8fMl67nSYaw1frk/vPVgqfhUAAILqqNURwlKw86BolBKLN4UEg4qEvYl2knKeVq2wvvzRp+YT/J0RoSZ+Op1MdFyKaXxz/XncfAR8eXdgb/ZjklWhRKUxLh3ZB0nyIN0CyYe2PKadmBOO7YZjg46DbofmjruZnacguMfKBN899M8JFh9wM0NG/VYhZUFwCXg/fMF8jHm4cnpoH1sNS8A4wSSrDx36u+Qq0Aa94Ks7nYeRHok/hBCDmYXHi2yVPKLYscjDg9dy7PcBbBcvLKE/LlFQYJRsnHUjewB9I3ucdZRsUGAuUaE/LyxsF/cBcuyD18jD2LE8omyVx4uZhRCDP4QeiYeRO53gqwa9KtC75B36qw/BJMA4DUsfW3pouHKMecF8P3wJeEFwIWX9VkNGcDMWH88JPfQE38fKILidp7uZ5o5uh46DY4PthhOOnZg8poe2Askg3Uny2QcuHaUxoUSSVfZjYG95dwR83Hz9eXxziml0XJ1MfjqhJp0RE/yn5vzRsL5WrXKedpK9iYqEBIM3hRKLaJTzoFKwEcKo1YLqAAB+FVgq7z2uTw1fmGvudMl6/Hx2e0N2im2OYapSUEEELlkZ7QNj7l/ZgsVjs4yjdpaEjAOGJIP8g4eIoJAKnG6qX7tbztLiJ/i3DeAi/jZ5ScRZY2ftcRN5nXxyfJJ4GnFFZmNY4Ec5Nfwgwwsx9urgkMy9uQOp35q/j/eHwYM/g3SGSI2Gl+Gk87RAxz/bVfDjBUUb1i/6QiBUxWJ5buJ2wXvwfGd6OXSUasRdKE44PH0ojhMJ/pTo0dNfwNKusJ9sk2SK3YQAg92EZIpsk7Cf0q5fwNHTlOgJ/o4TfSg4PChOxF2Uajl0Z3rwfMF74nZ5bsViIFT6QtYvRRvjBVXwP9tAx/O04aSGl0iNdIY/g8GD94e/j9+aA6m9uZDM6uAx9sML/CA5NeBHY1hFZhpxknhyfJ18E3ntcWNnxFl5Sf424CK3DSf40uJbzl+7bqoKnKCQh4j8gySDA4aEjHaWjKNjs4LFX9lj7u0DWRkELlBBqlKOYYptQ3Z2e/x8yXrudJhrDV+uT+89WCp+FQAAguqo1RHCUrDzoGiUEos3hQSDioS9iXaScp5WrbC+/NGn5hP8nRGhJn46nUx0XIppfHP9edx8BHx5d2Bv9mOSVaFEpTEuHdkHSfIg3QLJh7Y8pp2YE47thmODjoNuh+aOu5mdpyC4x8oE3z30zwkWH3AzQ0b9ViFlQXAJeD98wXyMebhyemgfWw1LwDjBJKsPHfq75CrQBr3gqzudh5EeiT+EEIOZhceLbJU8otixyMOD13Ls9wFsFy8soT8uUVBglGycdSN7AH0je5x1lGxQYC5RoT8vLGwX9wFy7IPXyMPYsTyibJXHi5mFEIM/hB6Jh5E7neCrBr0q0LvkHfqrD8EkwDgNSx9bemi4cox5wXw/fAl4QXAhZf1WQ0ZwMxYfzwk99ATfx8oguJ2nu5nmjm6HjoNjg+2GE46dmDymh7YCySDdSfLZBy4dpTGhRJJV9mNgb3l3BHzcfP15fHOKaXRcnUx+OqEmnRET/Kfm/NGwvlatcp52kr2JioQEgzeFEotolPOgUrARwqjVguoAAH4VWCrvPa5PDV+Ya+50yXr8fHZ7Q3aKbY5hqlJQQQQuWRntA2PuX9mCxWOzjKN2loSMA4Ykg/yDh4igkAqcbqpfu1vO0uIn+LcN4CL+NnlJxFljZ+1xE3mdfHJ8kngacUVmY1jgRzk1/CDDCzH26uCQzL25A6nfmr+P94fBgz+DdIZIjYaX4aTztEDHP9tV8OMFRRvWL/pCIFTFYnlu4nbBe/B8Z3o5dJRqxF0oTjg8fSiOEwn+lOjR01/A0q6wn2yTZIrdhACD3YRkimyTsJ/Srl/A0dOU6An+jhN9KDg8KE7EXZRqOXRnevB8wXvidnluxWIgVPpC1i9FG+MFVfA/20DH87ThpIaXSI10hj+DwYP3h7+P35oDqb25kMzq4DH2wwv8IDk14EdjWEVmGnGSeHJ8nXwTee1xY2fEWXlJ/jbgIrcNJ/jS4lvOX7tuqgqcoJCHiPyDJIMDhoSMdpaMo2OzgsVf2WPu7QNZGQQuUEGqUo5him1DdnZ7/HzJeu50mGsNX65P7z1YKn4VAACC6qjVEcJSsPOgaJQSizeFBIOKhL2JdpJynlatsL780afmE/ydEaEmfjqdTHRciml8c/153HwEfHl3YG/2Y5JVoUSlMS4d2QdJ8iDdAsmHtjymnZgTju2GY4OOg26H5o67mZ2nILjHygTfPfTPCRYfcDNDRv1WIWVBcAl4P3zBfIx5uHJ6aB9bDUvAOMEkqw8d+rvkKtAGveCrO52HkR6JP4QQg5mFx4tslTyi2LHIw4PXcuz3AWwXLyyhPy5RUGCUbJx1I3sAfSN7nHWUbFBgLlGhPy8sbBf3AXLsg9fIw9ixPKJslceLmYUQgz+EHomHkTud4KsGvSrQu+Qd+qsPwSTAOA1LH1t6aLhyjHnBfD98CXhBcCFl/VZDRnAzFh/PCT30BN/HyiC4nae7meaOboeOg2OD7YYTjp2YPKaHtgLJIN1J8tkHLh2lMaFEklX2Y2BveXcEfNx8/Xl8c4ppdFydTH46oSadERP8p+b80bC+Vq1ynnaSvYmKhASDN4USi2iU86BSsBHCqNWC6gAAfhVYKu89rk8NX5hr7nTJevx8dntDdoptjmGqUlBBBC5ZGe0DY+5f2YLFY7OMo3aWhIwDhiSD/IOHiKCQCpxuql+7W87S4if4tw3gIv42eUnEWWNn7XETeZ18cnySeBpxRWZjWOBHOTX8IMMLMfbq4JDMvbkDqd+av4/3h8GDP4N0hkiNhpfhpPO0QMc/21Xw4wVFG9Yv+kIgVMVieW7idsF78Hxnejl0lGrEXShOODx9KI4TCf6U6NHTX8DSrrCfbJNkit2EAIPdhGSKbJOwn9KuX8DR05ToCf6OE30oODwoTsRdlGo5dGd68HzBe+J2eW7FYiBU+kLWL0Ub4wVV8D/bQMfztOGkhpdIjXSGP4PBg/eHv4/fmgOpvbmQzOrgMfbDC/wgOTXgR2NYRWYacZJ4cnydfBN57XFjZ8RZeUn+NuAitw0n+NLiW85fu26qCpygkIeI/IMkgwOGhIx2loyjY7OCxV/ZY+7tA1kZBC5QQapSjmGKbUN2dnv8fMl67nSYaw1frk/vPVgqfhUAAILqqNURwlKw86BolBKLN4UEg4qEvYl2knKeVq2wvvzRp+YT/J0RoSZ+Op1MdFyKaXxz/XncfAR8eXdgb/ZjklWhRKUxLh3ZB0nyIN0CyYe2PKadmBOO7YZjg46DbofmjruZnacguMfKBN899M8JFh9wM0NG/VYhZUFwCXg/fMF8jHm4cnpoH1sNS8A4wSSrDx36u+Qq0Aa94Ks7nYeRHok/hBCDmYXHi2yVPKLYscjDg9dy7PcBbBcvLKE/LlFQYJRsnHUjewB9I3ucdZRsUGAuUaE/LyxsF/cBcuyD18jD2LE8omyVx4uZhRCDP4QeiYeRO53gqwa9KtC75B36qw/BJMA4DUsfW3pouHKMecF8P3wJeEFwIWX9VkNGcDMWH88JPfQE38fKILidp7uZ5o5uh46DY4PthhOOnZg8poe2Askg3Uny2QcuHaUxoUSSVfZjYG95dwR83Hz9eXxziml0XJ1MfjqhJp0RE/yn5vzRsL5WrXKedpK9iYqEBIM3hRKLaJTzoFKwEcKo1YLqAAB+FVgq7z2uTw1fmGvudMl6/Hx2e0N2im2OYapSUEEELlkZ7QNj7l/ZgsVjs4yjdpaEjAOGJIP8g4eIoJAKnG6qX7tbztLiJ/i3DeAi/jZ5ScRZY2ftcRN5nXxyfJJ4GnFFZmNY4Ec5Nfwgwwsx9urgkMy9uQOp35q/j/eHwYM/g3SGSI2Gl+Gk87RAxz/bVfDjBUUb1i/6QiBUxWJ5buJ2wXvwfGd6OXSUasRdKE44PH0ojhMJ/pTo0dNfwNKusJ9sk2SK3YQAg92EZIpsk7Cf0q5fwNHTlOgJ/o4TfSg4PChOxF2Uajl0Z3rwfMF74nZ5bsViIFT6QtYvRRvjBVXwP9tAx/O04aSGl0iNdIY/g8GD94e/j9+aA6m9uZDM6uAx9sML/CA5NeBHY1hFZhpxknhyfJ18E3ntcWNnxFl5Sf424CK3DSf40uJbzl+7bqoKnKCQh4j8gySDA4aEjHaWjKNjs4LFX9lj7u0DWRkELlBBqlKOYYptQ3Z2e/x8yXrudJhrDV+uT+89WCp+FQAAguqo1RHCUrDzoGiUEos3hQSDioS9iXaScp5WrbC+/NGn5hP8nRGhJn46nUx0XIppfHP9edx8BHx5d2Bv9mOSVaFEpTEuHdkHSfIg3QLJh7Y8pp2YE47thmODjoNuh+aOu5mdpyC4x8oE3z30zwkWH3AzQ0b9ViFlQXAJeD98wXyMebhyemgfWw1LwDjBJKsPHfq75CrQBr3gqzudh5EeiT+EEIOZhceLbJU8otixyMOD13Ls9wFsFy8soT8uUVBglGycdSN7AH0je5x1lGxQYC5RoT8vLGwX9wFy7IPXyMPYsTyibJXHi5mFEIM/hB6Jh5E7neCrBr0q0LvkHfqrD8EkwDgNSx9bemi4cox5wXw/fAl4QXAhZf1WQ0ZwMxYfzwk99ATfx8oguJ2nu5nmjm6HjoNjg+2GE46dmDymh7YCySDdSfLZBy4dpTGhRJJV9mNgb3l3BHzcfP15fHOKaXRcnUx+OqEmnRET/Kfm/NGwvlatcp52kr2JioQEgzeFEotolPOgUrARwqjVguoAAH4VWCrvPa5PDV+Ya+50yXr8fHZ7Q3aKbY5hqlJQQQQuWRntA2PuX9mCxWOzjKN2loSMA4Ykg/yDh4igkAqcbqpfu1vO0uIn+LcN4CL+NnlJxFljZ+1xE3mdfHJ8kngacUVmY1jgRzk1/CDDCzH26uCQzL25A6nfmr+P94fBgz+DdIZIjYaX4aTztEDHP9tV8OMFRRvWL/pCIFTFYnlu4nbBe/B8Z3o5dJRqxF0oTjg8fSiOEwn+lOjR01/A0q6wn2yTZIrdhACD3YRkimyTsJ/Srl/A0dOU6An+jhN9KDg8KE7EXZRqOXRnevB8wXvidnluxWIgVPpC1i9FG+MFVfA/20DH87ThpIaXSI10hj+DwYP3h7+P35oDqb25kMzq4DH2wwv8IDk14EdjWEVmGnGSeHJ8nXwTee1xY2fEWXlJ/jbgIrcNJ/jS4lvOX7tuqgqcoJCHiPyDJIMDhoSMdpaMo2OzgsVf2WPu7QNZGQQuUEGqUo5him1DdnZ7/HzJeu50mGsNX65P7z1YKn4VAACC6qjVEcJSsPOgaJQSizeFBIOKhL2JdpJynlatsL780afmE/ydEaEmfjqdTHRciml8c/153HwEfHl3YG/2Y5JVoUSlMS4d2QdJ8iDdAsmHtjymnZgTju2GY4OOg26H5o67mZ2nILjHygTfPfTPCRYfcDNDRv1WIWVBcAl4P3zBfIx5uHJ6aB9bDUvAOMEkqw8d+rvkKtAGveCrO52HkR6JP4QQg5mFx4tslTyi2LHIw4PXcuz3AWwXLyyhPy5RUGCUbJx1I3sAfSN7nHWUbFBgLlGhPy8sbBf3AXLsg9fIw9ixPKJslceLmYUQgz+EHomHkTud4KsGvSrQu+Qd+qsPwSTAOA1LH1t6aLhyjHnBfD98CXhBcCFl/VZDRnAzFh/PCT30BN/HyiC4nae7meaOboeOg2OD7YYTjp2YPKaHtgLJIN1J8tkHLh2lMaFEklX2Y2BveXcEfNx8/Xl8c4ppdFydTH46oSadERP8p+b80bC+Vq1ynnaSvYmKhASDN4USi2iU86BSsBHCqNWC6gAAfhVYKu89rk8NX5hr7nTJevx8dntDdoptjmGqUlBBBC5ZGe0DY+5f2YLFY7OMo3aWhIwDhiSD/IOHiKCQCpxuql+7W87S4if4tw3gIv42eUnEWWNn7XETeZ18cnySeBpxRWZjWOBHOTX8IMMLMfbq4JDMvbkDqd+av4/3h8GDP4N0hkiNhpfhpPO0QMc/21Xw4wVFG9Yv+kIgVMVieW7idsF78Hxnejl0lGrEXShOODx9KI4TCf6U6NHTX8DSrrCfbJNkit2EAIPdhGSKbJOwn9KuX8DR05ToCf6OE30oODwoTsRdlGo5dGd68HzBe+J2eW7FYiBU+kLWL0Ub4wVV8D/bQMfztOGkhpdIjXSGP4PBg/eHv4/fmgOpvbmQzOrgMfbDC/wgOTXgR2NYRWYacZJ4cnydfBN57XFjZ8RZeUn+NuAitw0n+NLiW85fu26qCpygkIeI/IMkgwOGhIx2loyjY7OCxV/ZY+7tA1kZBC5QQapSjmGKbUN2dnv8fMl67nSYaw1frk/vPVgqfhUAAILqqNURwlKw86BolBKLN4UEg4qEvYl2knKeVq2wvvzRp+YT/J0RoSZ+Op1MdFyKaXxz/XncfAR8eXdgb/ZjklWhRKUxLh3ZB0nyIN0CyYe2PKadmBOO7YZjg46DbofmjruZnacguMfKBN899M8JFh9wM0NG/VYhZUFwCXg/fMF8jHm4cnpoH1sNS8A4wSSrDx36u+Qq0Aa94Ks7nYeRHok/hBCDmYXHi2yVPKLYscjDg9dy7PcBbBcvLKE/LlFQYJRsnHUjewB9I3ucdZRsUGAuUaE/LyxsF/cBcuyD18jD2LE8omyVx4uZhRCDP4QeiYeRO53gqwa9KtC75B36qw/BJMA4DUsfW3pouHKMecF8P3wJeEFwIWX9VkNGcDMWH88JPfQE38fKILidp7uZ5o5uh46DY4PthhOOnZg8poe2Askg3Uny2QcuHaUxoUSSVfZjYG95dwR83Hz9eXxziml0XJ1MfjqhJp0RE/yn5vzRsL5WrXKedpK9iYqEBIM3hRKLaJTzoFKwEcKo1YLqAAB+FVgq7z2uTw1fmGvudMl6/Hx2e0N2im2OYapSUEEELlkZ7QNj7l/ZgsVjs4yjdpaEjAOGJIP8g4eIoJAKnG6qX7tbztLiJ/i3DeAi/jZ5ScRZY2ftcRN5nXxyfJJ4GnFFZmNY4Ec5Nfwgwwsx9urgkMy9uQOp35q/j/eHwYM/g3SGSI2Gl+Gk87RAxz/bVfDjBUUb1i/6QiBUxWJ5buJ2wXvwfGd6OXSUasRdKE44PH0ojhMJ/pTo0dNfwNKusJ9sk2SK3YQAg92EZIpsk7Cf0q5fwNHTlOgJ/o4TfSg4PChOxF2Uajl0Z3rwfMF74nZ5bsViIFT6QtYvRRvjBVXwP9tAx/O04aSGl0iNdIY/g8GD94e/j9+aA6m9uZDM6uAx9sML/CA5NeBHY1hFZhpxknhyfJ18E3ntcWNnxFl5Sf424CK3DSf40uJbzl+7bqoKnKCQh4j8gySDA4aEjHaWjKNjs4LFX9lj7u0DWRkELlBBqlKOYYptQ3Z2e/x8yXrudJhrDV+uT+89WCp+FQAAguqo1RHCUrDzoGiUEos3hQSDioS9iXaScp5WrbC+/NGn5hP8nRGhJn46nUx0XIppfHP9edx8BHx5d2Bv9mOSVaFEpTEuHdkHSfIg3QLJh7Y8pp2YE47thmODjoNuh+aOu5mdpyC4x8oE3z30zwkWH3AzQ0b9ViFlQXAJeD98wXyMebhyemgfWw1LwDjBJKsPHfq75CrQBr3gqzudh5EeiT+EEIOZhceLbJU8otixyMOD13Ls9wFsFy8soT8uUVBglGycdSN7AH0je5x1lGxQYC5RoT8vLGwX9wFy7IPXyMPYsTyibJXHi5mFEIM/hB6Jh5E7neCrBr0q0LvkHfqrD8EkwDgNSx9bemi4cox5wXw/fAl4QXAhZf1WQ0ZwMxYfzwk99ATfx8oguJ2nu5nmjm6HjoNjg+2GE46dmDymh7YCySDdSfLZBy4dpTGhRJJV9mNgb3l3BHzcfP15fHOKaXRcnUx+OqEmnRET/Kfm/NGwvlatcp52kr2JioQEgzeFEotolPOgUrARwqjVguoAAH4VWCrvPa5PDV+Ya+50yXr8fHZ7Q3aKbY5hqlJQQQQuWRntA2PuX9mCxWOzjKN2loSMA4Ykg/yDh4igkAqcbqpfu1vO0uIn+LcN4CL+NnlJxFljZ+1xE3mdfHJ8kngacUVmY1jgRzk1/CDDCzH26uCQzL25A6nfmr+P94fBgz+DdIZIjYaX4aTztEDHP9tV8OMFRRvWL/pCIFTFYnlu4nbBe/B8Z3o5dJRqxF0oTjg8fSiOEwn+lOjR01/A0q6wn2yTZIrdhACD3YRkimyTsJ/Srl/A0dOU6An+jhN9KDg8KE7EXZRqOXRnevB8wXvidnluxWIgVPpC1i9FG+MFVfA/20DH87ThpIaXSI10hj+DwYP3h7+P35oDqb25kMzq4DH2wwv8IDk14EdjWEVmGnGSeHJ8nXwTee1xY2fEWXlJ/jbgIrcNJ/jS4lvOX7tuqgqcoJCHiPyDJIMDhoSMdpaMo2OzgsVf2WPu7QNZGQQuUEGqUo5him1DdnZ7/HzJeu50mGsNX65P7z1YKn4VAACC6qjVEcJSsPOgaJQSizeFBIOKhL2JdpJynlatsL780afmE/ydEaEmfjqdTHRciml8c/153HwEfHl3YG/2Y5JVoUSlMS4d2QdJ8iDdAsmHtjymnZgTju2GY4OOg26H5o67mZ2nILjHygTfPfTPCRYfcDNDRv1WIWVBcAl4P3zBfIx5uHJ6aB9bDUvAOMEkqw8d+rvkKtAGveCrO52HkR6JP4QQg5mFx4tslTyi2LHIw4PXcuz3AWwXLyyhPy5RUGCUbJx1I3sAfSN7nHWUbFBgLlGhPy8sbBf3AXLsg9fIw9ixPKJslceLmYUQgz+EHomHkTud4KsGvSrQu+Qd+qsPwSTAOA1LH1t6aLhyjHnBfD98CXhBcCFl/VZDRnAzFh/PCT30BN/HyiC4nae7meaOboeOg2OD7YYTjp2YPKaHtgLJIN1J8tkHLh2lMaFEklX2Y2BveXcEfNx8/Xl8c4ppdFydTH46oSadERP8p+b80bC+Vq1ynnaSvYmKhASDN4USi2iU86BSsBHCqNWC6gAAfhVYKu89rk8NX5hr7nTJevx8dntDdoptjmGqUlBBBC5ZGe0DY+5f2YLFY7OMo3aWhIwDhiSD/IOHiKCQCpxuql+7W87S4if4tw3gIv42eUnEWWNn7XETeZ18cnySeBpxRWZjWOBHOTX8IMMLMfbq4JDMvbkDqd+av4/3h8GDP4N0hkiNhpfhpPO0QMc/21Xw4wVFG9Yv+kIgVMVieW7idsF78Hxnejl0lGrEXShOODx9KI4TCf6U6NHTX8DSrrCfbJNkit2EAIPdhGSKbJOwn9KuX8DR05ToCf6OE30oODwoTsRdlGo5dGd68HzBe+J2eW7FYiBU+kLWL0Ub4wVV8D/bQMfztOGkhpdIjXSGP4PBg/eHv4/fmgOpvbmQzOrgMfbDC/wgOTXgR2NYRWYacZJ4cnydfBN57XFjZ8RZeUn+NuAitw0n+NLiW85fu26qCpygkIeI/IMkgwOGhIx2loyjY7OCxV/ZY+7tA1kZBC5QQapSjmGKbUN2dnv8fMl67nSYaw1frk/vPVgqfhUAAILqqNURwlKw86BolBKLN4UEg4qEvYl2knKeVq2wvvzRp+YT/J0RoSZ+Op1MdFyKaXxz/XncfAR8eXdgb/ZjklWhRKUxLh3ZB0nyIN0CyYe2PKadmBOO7YZjg46DbofmjruZnacguMfKBN899M8JFh9wM0NG/VYhZUFwCXg/fMF8jHm4cnpoH1sNS8A4wSSrDx36u+Qq0Aa94Ks7nYeRHok/hBCDmYXHi2yVPKLYscjDg9dy7PcBbBcvLKE/LlFQYJRsnHUjewB9I3ucdZRsUGAuUaE/LyxsF/cBcuyD18jD2LE8omyVx4uZhRCDP4QeiYeRO53gqwa9KtC75B36qw/BJMA4DUsfW3pouHKMecF8P3wJeEFwIWX9VkNGcDMWH88JPfQE38fKILidp7uZ5o5uh46DY4PthhOOnZg8poe2Askg3Uny2QcuHaUxoUSSVfZjYG95dwR83Hz9eXxziml0XJ1MfjqhJp0RE/yn5vzRsL5WrXKedpK9iYqEBIM3hRKLaJTzoFKwEcKo1YLqAAB+FVgq7z2uTw1fmGvudMl6/Hx2e0N2im2OYapSUEEELlkZ7QNj7l/ZgsVjs4yjdpaEjAOGJIP8g4eIoJAKnG6qX7tbztLiJ/i3DeAi/jZ5ScRZY2ftcRN5nXxyfJJ4GnFFZmNY4Ec5Nfwgwwsx9urgkMy9uQOp35q/j/eHwYM/g3SGSI2Gl+Gk87RAxz/bVfDjBUUb1i/6QiBUxWJ5buJ2wXvwfGd6OXSUasRdKE44PH0ojhMJ/pTo0dNfwNKusJ9sk2SK3YQAg92EZIpsk7Cf0q5fwNHTlOgJ/o4TfSg4PChOxF2Uajl0Z3rwfMF74nZ5bsViIFT6QtYvRRvjBVXwP9tAx/O04aSGl0iNdIY/g8GD94e/j9+aA6m9uZDM6uAx9sML/CA5NeBHY1hFZhpxknhyfJ18E3ntcWNnxFl5Sf424CK3DSf40uJbzl+7bqoKnKCQh4j8gySDA4aEjHaWjKNjs4LFX9lj7u0DWRkELlBBqlKOYYptQ3Z2e/x8yXrudJhrDV+uT+89WCp+FQAAguqo1RHCUrDzoGiUEos3hQSDioS9iXaScp5WrbC+/NGn5hP8nRGhJn46nUx0XIppfHP9edx8BHx5d2Bv9mOSVaFEpTEuHdkHSfIg3QLJh7Y8pp2YE47thmODjoNuh+aOu5mdpyC4x8oE3z30zwkWH3AzQ0b9ViFlQXAJeD98wXyMebhyemgfWw1LwDjBJKsPHfq75CrQBr3gqzudh5EeiT+EEIOZhceLbJU8otixyMOD13Ls9wFsFy8soT8uUVBglGycdSN7AH0je5x1lGxQYC5RoT8vLGwX9wFy7IPXyMPYsTyibJXHi5mFEIM/hB6Jh5E7neCrBr0q0LvkHfqrD8EkwDgNSx9bemi4cox5wXw/fAl4QXAhZf1WQ0ZwMxYfzwk99ATfx8oguJ2nu5nmjm6HjoNjg+2GE46dmDymh7YCySDdSfLZBy4dpTGhRJJV9mNgb3l3BHzcfP15fHOKaXRcnUx+OqEmnRET/Kfm/NGwvlatcp52kr2JioQEgzeFEotolPOgUrARwqjVguoAAH4VWCrvPa5PDV+Ya+50yXr8fHZ7Q3aKbY5hqlJQQQQuWRntA2PuX9mCxWOzjKN2loSMA4Ykg/yDh4igkAqcbqpfu1vO0uIn+LcN4CL+NnlJxFljZ+1xE3mdfHJ8kngacUVmY1jgRzk1/CDDCzH26uCQzL25A6nfmr+P94fBgz+DdIZIjYaX4aTztEDHP9tV8OMFRRvWL/pCIFTFYnlu4nbBe/B8Z3o5dJRqxF0oTjg8fSiOEwn+lOjR01/A0q6wn2yTZIrdhACD3YRkimyTsJ/Srl/A0dOU6An+jhN9KDg8KE7EXZRqOXRnevB8wXvidnluxWIgVPpC1i9FG+MFVfA/20DH87ThpIaXSI10hj+DwYP3h7+P35oDqb25kMzq4DH2wwv8IDk14EdjWEVmGnGSeHJ8nXwTee1xY2fEWXlJ/jbgIrcNJ/jS4lvOX7tuqgqcoJCHiPyDJIMDhoSMdpaMo2OzgsVf2WPu7QNZGQQuUEGqUo5him1DdnZ7/HzJeu50mGsNX65P7z1YKn4VAACC6qjVEcJSsPOgaJQSizeFBIOKhL2JdpJynlatsL780afmE/ydEaEmfjqdTHRciml8c/153HwEfHl3YG/2Y5JVoUSlMS4d2QdJ8iDdAsmHtjymnZgTju2GY4OOg26H5o67mZ2nILjHygTfPfTPCRYfcDNDRv1WIWVBcAl4P3zBfIx5uHJ6aB9bDUvAOMEkqw8d+rvkKtAGveCrO52HkR6JP4QQg5mFx4tslTyi2LHIw4PXcuz3AWwXLyyhPy5RUGCUbJx1I3sAfSN7nHWUbFBgLlGhPy8sbBf3AXLsg9fIw9ixPKJslceLmYUQgz+EHomHkTud4KsGvSrQu+Qd+qsPwSTAOA1LH1t6aLhyjHnBfD98CXhBcCFl/VZDRnAzFh/PCT30BN/HyiC4nae7meaOboeOg2OD7YYTjp2YPKaHtgLJIN1J8tkHLh2lMaFEklX2Y2BveXcEfNx8/Xl8c4ppdFydTH46oSadERP8p+b80bC+Vq1ynnaSvYmKhASDN4USi2iU86BSsBHCqNWC6gAAfhVYKu89rk8NX5hr7nTJevx8dntDdoptjmGqUlBBBC5ZGe0DY+5f2YLFY7OMo3aWhIwDhiSD/IOHiKCQCpxuql+7W87S4if4tw3gIv42eUnEWWNn7XETeZ18cnySeBpxRWZjWOBHOTX8IMMLMfbq4JDMvbkDqd+av4/3h8GDP4N0hkiNhpfhpPO0QMc/21Xw4wVFG9Yv+kIgVMVieW7idsF78Hxnejl0lGrEXShOODx9KI4TCf6U6NHTX8DSrrCfbJNkit2EAIPdhGSKbJOwn9KuX8DR05ToCf6OE30oODwoTsRdlGo5dGd68HzBe+J2eW7FYiBU+kLWL0Ub4wVV8D/bQMfztOGkhpdIjXSGP4PBg/eHv4/fmgOpvbmQzOrgMfbDC/wgOTXgR2NYRWYacZJ4cnydfBN57XFjZ8RZeUn+NuAitw0n+NLiW85fu26qCpygkIeI/IMkgwOGhIx2loyjY7OCxV/ZY+7tA1kZBC5QQapSjmGKbUN2dnv8fMl67nSYaw1frk/vPVgqfhUAAILqqNURwlKw86BolBKLN4UEg4qEvYl2knKeVq2wvvzRp+YT/J0RoSZ+Op1MdFyKaXxz/XncfAR8eXdgb/ZjklWhRKUxLh3ZB0nyIN0CyYe2PKadmBOO7YZjg46DbofmjruZnacguMfKBN899M8JFh9wM0NG/VYhZUFwCXg/fMF8jHm4cnpoH1sNS8A4wSSrDx36u+Qq0Aa94Ks7nYeRHok/hBCDmYXHi2yVPKLYscjDg9dy7PcBbBcvLKE/LlFQYJRsnHUjewB9I3ucdZRsUGAuUaE/LyxsF/cBcuyD18jD2LE8omyVx4uZhRCDP4QeiYeRO53gqwa9KtC75B36qw/BJMA4DUsfW3pouHKMecF8P3wJeEFwIWX9VkNGcDMWH88JPfQE38fKILidp7uZ5o5uh46DY4PthhOOnZg8poe2Askg3Uny2QcuHaUxoUSSVfZjYG95dwR83Hz9eXxziml0XJ1MfjqhJp0RE/yn5vzRsL5WrXKedpK9iYqEBIM3hRKLaJTzoFKwEcKo1YLqAAB+FVgq7z2uTw1fmGvudMl6/Hx2e0N2im2OYapSUEEELlkZ7QNj7l/ZgsVjs4yjdpaEjAOGJIP8g4eIoJAKnG6qX7tbztLiJ/i3DeAi/jZ5ScRZY2ftcRN5nXxyfJJ4GnFFZmNY4Ec5Nfwgwwsx9urgkMy9uQOp35q/j/eHwYM/g3SGSI2Gl+Gk87RAxz/bVfDjBUUb1i/6QiBUxWJ5buJ2wXvwfGd6OXSUasRdKE44PH0ojhMJ/pTo0dNfwNKusJ9sk2SK3YQAg92EZIpsk7Cf0q5fwNHTlOgJ/o4TfSg4PChOxF2Uajl0Z3rwfMF74nZ5bsViIFT6QtYvRRvjBVXwP9tAx/O04aSGl0iNdIY/g8GD94e/j9+aA6m9uZDM6uAx9sML/CA5NeBHY1hFZhpxknhyfJ18E3ntcWNnxFl5Sf424CK3DSf40uJbzl+7bqoKnKCQh4j8gySDA4aEjHaWjKNjs4LFX9lj7u0DWRkELlBBqlKOYYptQ3Z2e/x8yXrudJhrDV+uT+89WCp+FQAAguqo1RHCUrDzoGiUEos3hQSDioS9iXaScp5WrbC+/NGn5hP8nRGhJn46nUx0XIppfHP9edx8BHx5d2Bv9mOSVaFEpTEuHdkHSfIg3QLJh7Y8pp2YE47thmODjoNuh+aOu5mdpyC4x8oE3z30zwkWH3AzQ0b9ViFlQXAJeD98wXyMebhyemgfWw1LwDjBJKsPHfq75CrQBr3gqzudh5EeiT+EEIOZhceLbJU8otixyMOD13Ls9wFsFy8soT8uUVBglGycdSN7AH0je5x1lGxQYC5RoT8vLGwX9wFy7IPXyMPYsTyibJXHi5mFEIM/hB6Jh5E7neCrBr0q0LvkHfqrD8EkwDgNSx9bemi4cox5wXw/fAl4QXAhZf1WQ0ZwMxYfzwk99ATfx8oguJ2nu5nmjm6HjoNjg+2GE46dmDymh7YCySDdSfLZBy4dpTGhRJJV9mNgb3l3BHzcfP15fHOKaXRcnUx+OqEmnRET/Kfm/NGwvlatcp52kr2JioQEgzeFEotolPOgUrARwqjVguoAAH4VWCrvPa5PDV+Ya+50yXr8fHZ7Q3aKbY5hqlJQQQQuWRntA2PuX9mCxWOzjKN2loSMA4Ykg/yDh4igkAqcbqpfu1vO0uIn+LcN4CL+NnlJxFljZ+1xE3mdfHJ8kngacUVmY1jgRzk1/CDDCzH26uCQzL25A6nfmr+P94fBgz+DdIZIjYaX4aTztEDHP9tV8OMFRRvWL/pCIFTFYnlu4nbBe/B8Z3o5dJRqxF0oTjg8fSiOEwn+lOjR01/A0q6wn2yTZIrdhACD3YRkimyTsJ/Srl/A0dOU6An+jhN9KDg8KE7EXZRqOXRnevB8wXvidnluxWIgVPpC1i9FG+MFVfA/20DH87ThpIaXSI10hj+DwYP3h7+P35oDqb25kMzq4DH2wwv8IDk14EdjWEVmGnGSeHJ8nXwTee1xY2fEWXlJ/jbgIrcNJ/jS4lvOX7tuqgqcoJCHiPyDJIMDhoSMdpaMo2OzgsVf2WPu7QNZGQQuUEGqUo5him1DdnZ7/HzJeu50mGsNX65P7z1YKn4VAACC6qjVEcJSsPOgaJQSizeFBIOKhL2JdpJynlatsL780afmE/ydEaEmfjqdTHRciml8c/153HwEfHl3YG/2Y5JVoUSlMS4d2QdJ8iDdAsmHtjymnZgTju2GY4OOg26H5o67mZ2nILjHygTfPfTPCRYfcDNDRv1WIWVBcAl4P3zBfIx5uHJ6aB9bDUvAOMEkqw8d+rvkKtAGveCrO52HkR6JP4QQg5mFx4tslTyi2LHIw4PXcuz3AWwXLyyhPy5RUGCUbJx1I3sAfSN7nHWUbFBgLlGhPy8sbBf3AXLsg9fIw9ixPKJslceLmYUQgz+EHomHkTud4KsGvSrQu+Qd+qsPwSTAOA1LH1t6aLhyjHnBfD98CXhBcCFl/VZDRnAzFh/PCT30BN/HyiC4nae7meaOboeOg2OD7YYTjp2YPKaHtgLJIN1J8tkHLh2lMaFEklX2Y2BveXcEfNx8/Xl8c4ppdFydTH46oSadERP8p+b80bC+Vq1ynnaSvYmKhASDN4USi2iU86BSsBHCqNWC6gAAfhVYKu89rk8NX5hr7nTJevx8dntDdoptjmGqUlBBBC5ZGe0DY+5f2YLFY7OMo3aWhIwDhiSD/IOHiKCQCpxuql+7W87S4if4tw3gIv42eUnEWWNn7XETeZ18cnySeBpxRWZjWOBHOTX8IMMLMfbq4JDMvbkDqd+av4/3h8GDP4N0hkiNhpfhpPO0QMc/21Xw4wVFG9Yv+kIgVMVieW7idsF78Hxnejl0lGrEXShOODx9KI4TCf6U6NHTX8DSrrCfbJNkit2EAIPdhGSKbJOwn9KuX8DR05ToCf6OE30oODwoTsRdlGo5dGd68HzBe+J2eW7FYiBU+kLWL0Ub4wVV8D/bQMfztOGkhpdIjXSGP4PBg/eHv4/fmgOpvbmQzOrgMfbDC/wgOTXgR2NYRWYacZJ4cnydfBN57XFjZ8RZeUn+NuAitw0n+NLiW85fu26qCpygkIeI/IMkgwOGhIx2loyjY7OCxV/ZY+7tA1kZBC5QQapSjmGKbUN2dnv8fMl67nSYaw1frk/vPVgqfhUAAILqqNURwlKw86BolBKLN4UEg4qEvYl2knKeVq2wvvzRp+YT/J0RoSZ+Op1MdFyKaXxz/XncfAR8eXdgb/ZjklWhRKUxLh3ZB0nyIN0CyYe2PKadmBOO7YZjg46DbofmjruZnacguMfKBN899M8JFh9wM0NG/VYhZUFwCXg/fMF8jHm4cnpoH1sNS8A4wSSrDx36u+Qq0Aa94Ks7nYeRHok/hBCDmYXHi2yVPKLYscjDg9dy7PcBbBcvLKE/LlFQYJRsnHUjewB9I3ucdZRsUGAuUaE/LyxsF/cBcuyD18jD2LE8omyVx4uZhRCDP4QeiYeRO53gqwa9KtC75B36qw/BJMA4DUsfW3pouHKMecF8P3wJeEFwIWX9VkNGcDMWH88JPfQE38fKILidp7uZ5o5uh46DY4PthhOOnZg8poe2Askg3Uny2QcuHaUxoUSSVfZjYG95dwR83Hz9eXxziml0XJ1MfjqhJp0RE/yn5vzRsL5WrXKedpK9iYqEBIM3hRKLaJTzoFKwEcKo1YLqAAB+FVgq7z2uTw1fmGvudMl6/Hx2e0N2im2OYapSUEEELlkZ7QNj7l/ZgsVjs4yjdpaEjAOGJIP8g4eIoJAKnG6qX7tbztLiJ/i3DeAi/jZ5ScRZY2ftcRN5nXxyfJJ4GnFFZmNY4Ec5Nfwgwwsx9urgkMy9uQOp35q/j/eHwYM/g3SGSI2Gl+Gk87RAxz/bVfDjBUUb1i/6QiBUxWJ5buJ2wXvwfGd6OXSUasRdKE44PH0ojhMJ/pTo0dNfwNKusJ9sk2SK3YQAg92EZIpsk7Cf0q5fwNHTlOgJ/o4TfSg4PChOxF2Uajl0Z3rwfMF74nZ5bsViIFT6QtYvRRvjBVXwP9tAx/O04aSGl0iNdIY/g8GD94e/j9+aA6m9uZDM6uAx9sML/CA5NeBHY1hFZhpxknhyfJ18E3ntcWNnxFl5Sf424CK3DSf40uJbzl+7bqoKnKCQh4j8gySDA4aEjHaWjKNjs4LFX9lj7u0DWRkELlBBqlKOYYptQ3Z2e/x8yXrudJhrDV+uT+89WCp+FQAAguqo1RHCUrDzoGiUEos3hQSDioS9iXaScp5WrbC+/NGn5hP8nRGhJn46nUx0XIppfHP9edx8BHx5d2Bv9mOSVaFEpTEuHdkHSfIg3QLJh7Y8pp2YE47thmODjoNuh+aOu5mdpyC4x8oE3z30zwkWH3AzQ0b9ViFlQXAJeD98wXyMebhyemgfWw1LwDjBJKsPHfq75CrQBr3gqzudh5EeiT+EEIOZhceLbJU8otixyMOD13Ls9wFsFy8soT8uUVBglGycdSN7AH0je5x1lGxQYC5RoT8vLGwX9wFy7IPXyMPYsTyibJXHi5mFEIM/hB6Jh5E7neCrBr0q0LvkHfqrD8EkwDgNSx9bemi4cox5wXw/fAl4QXAhZf1WQ0ZwMxYfzwk99ATfx8oguJ2nu5nmjm6HjoNjg+2GE46dmDymh7YCySDdSfLZBy4dpTGhRJJV9mNgb3l3BHzcfP15fHOKaXRcnUx+OqEmnRET/Kfm/NGwvlatcp52kr2JioQEgzeFEotolPOgUrARwqjVguoAAH4VWCrvPa5PDV+Ya+50yXr8fHZ7Q3aKbY5hqlJQQQQuWRntA2PuX9mCxWOzjKN2loSMA4Ykg/yDh4igkAqcbqpfu1vO0uIn+LcN4CL+NnlJxFljZ+1xE3mdfHJ8kngacUVmY1jgRzk1/CDDCzH26uCQzL25A6nfmr+P94fBgz+DdIZIjYaX4aTztEDHP9tV8OMFRRvWL/pCIFTFYnlu4nbBe/B8Z3o5dJRqxF0oTjg8fSiOEwn+lOjR01/A0q6wn2yTZIrdhACD3YRkimyTsJ/Srl/A0dOU6An+jhN9KDg8KE7EXZRqOXRnevB8wXvidnluxWIgVPpC1i9FG+MFVfA/20DH87ThpIaXSI10hj+DwYP3h7+P35oDqb25kMzq4DH2wwv8IDk14EdjWEVmGnGSeHJ8nXwTee1xY2fEWXlJ/jbgIrcNJ/jS4lvOX7tuqgqcoJCHiPyDJIMDhoSMdpaMo2OzgsVf2WPu7QNZGQQuUEGqUo5him1DdnZ7/HzJeu50mGsNX65P7z1YKn4VAACC6qjVEcJSsPOgaJQSizeFBIOKhL2JdpJynlatsL780afmE/ydEaEmfjqdTHRciml8c/153HwEfHl3YG/2Y5JVoUSlMS4d2QdJ8iDdAsmHtjymnZgTju2GY4OOg26H5o67mZ2nILjHygTfPfTPCRYfcDNDRv1WIWVBcAl4P3zBfIx5uHJ6aB9bDUvAOMEkqw8d+rvkKtAGveCrO52HkR6JP4QQg5mFx4tslTyi2LHIw4PXcuz3AWwXLyyhPy5RUGCUbJx1I3sAfSN7nHWUbFBgLlGhPy8sbBf3AXLsg9fIw9ixPKJslceLmYUQgz+EHomHkTud4KsGvSrQu+Qd+qsPwSTAOA1LH1t6aLhyjHnBfD98CXhBcCFl/VZDRnAzFh/PCT30BN/HyiC4nae7meaOboeOg2OD7YYTjp2YPKaHtgLJIN1J8tkHLh2lMaFEklX2Y2BveXcEfNx8/Xl8c4ppdFydTH46oSadERP8p+b80bC+Vq1ynnaSvYmKhASDN4USi2iU86BSsBHCqNWC6gAAfhVYKu89rk8NX5hr7nTJevx8dntDdoptjmGqUlBBBC5ZGe0DY+5f2YLFY7OMo3aWhIwDhiSD/IOHiKCQCpxuql+7W87S4if4tw3gIv42eUnEWWNn7XETeZ18cnySeBpxRWZjWOBHOTX8IMMLMfbq4JDMvbkDqd+av4/3h8GDP4N0hkiNhpfhpPO0QMc/21Xw4wVFG9Yv+kIgVMVieW7idsF78Hxnejl0lGrEXShOODx9KI4TCf6U6NHTX8DSrrCfbJNkit2EAIPdhGSKbJOwn9KuX8DR05ToCf6OE30oODwoTsRdlGo5dGd68HzBe+J2eW7FYiBU+kLWL0Ub4wVV8D/bQMfztOGkhpdIjXSGP4PBg/eHv4/fmgOpvbmQzOrgMfbDC/wgOTXgR2NYRWYacZJ4cnydfBN57XFjZ8RZeUn+NuAitw0n+NLiW85fu26qCpygkIeI/IMkgwOGhIx2loyjY7OCxV/ZY+7tA1kZBC5QQapSjmGKbUN2dnv8fMl67nSYaw1frk/vPVgqfhUAAILqqNURwlKw86BolBKLN4UEg4qEvYl2knKeVq2wvvzRp+YT/J0RoSZ+Op1MdFyKaXxz/XncfAR8eXdgb/ZjklWhRKUxLh3ZB0nyIN0CyYe2PKadmBOO7YZjg46DbofmjruZnacguMfKBN899M8JFh9wM0NG/VYhZUFwCXg/fMF8jHm4cnpoH1sNS8A4wSSrDx36u+Qq0Aa94Ks7nYeRHok/hBCDmYXHi2yVPKLYscjDg9dy7PcBbBcvLKE/LlFQYJRsnHUjewB9I3ucdZRsUGAuUaE/LyxsF/cBcuyD18jD2LE8omyVx4uZhRCDP4QeiYeRO53gqwa9KtC75B36qw/BJMA4DUsfW3pouHKMecF8P3wJeEFwIWX9VkNGcDMWH88JPfQE38fKILidp7uZ5o5uh46DY4PthhOOnZg8poe2Askg3Uny2QcuHaUxoUSSVfZjYG95dwR83Hz9eXxziml0XJ1MfjqhJp0RE/yn5vzRsL5WrXKedpK9iYqEBIM3hRKLaJTzoFKwEcKo1YLqAAB+FVgq7z2uTw1fmGvudMl6/Hx2e0N2im2OYapSUEEELlkZ7QNj7l/ZgsVjs4yjdpaEjAOGJIP8g4eIoJAKnG6qX7tbztLiJ/i3DeAi/jZ5ScRZY2ftcRN5nXxyfJJ4GnFFZmNY4Ec5Nfwgwwsx9urgkMy9uQOp35q/j/eHwYM/g3SGSI2Gl+Gk87RAxz/bVfDjBUUb1i/6QiBUxWJ5buJ2wXvwfGd6OXSUasRdKE44PH0ojhMJ/pTo0dNfwNKusJ9sk2SK3YQAg92EZIpsk7Cf0q5fwNHTlOgJ/o4TfSg4PChOxF2Uajl0Z3rwfMF74nZ5bsViIFT6QtYvRRvjBVXwP9tAx/O04aSGl0iNdIY/g8GD94e/j9+aA6m9uZDM6uAx9sML/CA5NeBHY1hFZhpxknhyfJ18E3ntcWNnxFl5Sf424CK3DSf40uJbzl+7bqoKnKCQh4j8gySDA4aEjHaWjKNjs4LFX9lj7u0DWRkELlBBqlKOYYptQ3Z2e/x8yXrudJhrDV+uT+89WCp+FQAAguqo1RHCUrDzoGiUEos3hQSDioS9iXaScp5WrbC+/NGn5hP8nRGhJn46nUx0XIppfHP9edx8BHx5d2Bv9mOSVaFEpTEuHdkHSfIg3QLJh7Y8pp2YE47thmODjoNuh+aOu5mdpyC4x8oE3z30zwkWH3AzQ0b9ViFlQXAJeD98wXyMebhyemgfWw1LwDjBJKsPHfq75CrQBr3gqzudh5EeiT+EEIOZhceLbJU8otixyMOD13Ls9wFsFy8soT8uUVBglGycdSN7AH0je5x1lGxQYC5RoT8vLGwX9wFy7IPXyMPYsTyibJXHi5mFEIM/hB6Jh5E7neCrBr0q0LvkHfqrD8EkwDgNSx9bemi4cox5wXw/fAl4QXAhZf1WQ0ZwMxYfzwk99ATfx8oguJ2nu5nmjm6HjoNjg+2GE46dmDymh7YCySDdSfLZBy4dpTGhRJJV9mNgb3l3BHzcfP15fHOKaXRcnUx+OqEmnRET/Kfm/NGwvlatcp52kr2JioQEgzeFEotolPOgUrARwqjVguoAAH4VWCrvPa5PDV+Ya+50yXr8fHZ7Q3aKbY5hqlJQQQQuWRntA2PuX9mCxWOzjKN2loSMA4Ykg/yDh4igkAqcbqpfu1vO0uIn+LcN4CL+NnlJxFljZ+1xE3mdfHJ8kngacUVmY1jgRzk1/CDDCzH26uCQzL25A6nfmr+P94fBgz+DdIZIjYaX4aTztEDHP9tV8OMFRRvWL/pCIFTFYnlu4nbBe/B8Z3o5dJRqxF0oTjg8fSiOEwn+lOjR01/A0q6wn2yTZIrdhACD3YRkimyTsJ/Srl/A0dOU6An+jhN9KDg8KE7EXZRqOXRnevB8wXvidnluxWIgVPpC1i9FG+MFVfA/20DH87ThpIaXSI10hj+DwYP3h7+P35oDqb25kMzq4DH2wwv8IDk14EdjWEVmGnGSeHJ8nXwTee1xY2fEWXlJ/jbgIrcNJ/jS4lvOX7tuqgqcoJCHiPyDJIMDhoSMdpaMo2OzgsVf2WPu7QNZGQQuUEGqUo5him1DdnZ7/HzJeu50mGsNX65P7z1YKn4VAACC6qjVEcJSsPOgaJQSizeFBIOKhL2JdpJynlatsL780afmE/ydEaEmfjqdTHRciml8c/153HwEfHl3YG/2Y5JVoUSlMS4d2QdJ8iDdAsmHtjymnZgTju2GY4OOg26H5o67mZ2nILjHygTfPfTPCRYfcDNDRv1WIWVBcAl4P3zBfIx5uHJ6aB9bDUvAOMEkqw8d+rvkKtAGveCrO52HkR6JP4QQg5mFx4tslTyi2LHIw4PXcuz3AWwXLyyhPy5RUGCUbJx1I3sAfSN7nHWUbFBgLlGhPy8sbBf3AXLsg9fIw9ixPKJslceLmYUQgz+EHomHkTud4KsGvSrQu+Qd+qsPwSTAOA1LH1t6aLhyjHnBfD98CXhBcCFl/VZDRnAzFh/PCT30BN/HyiC4nae7meaOboeOg2OD7YYTjp2YPKaHtgLJIN1J8tkHLh2lMaFEklX2Y2BveXcEfNx8/Xl8c4ppdFydTH46oSadERP8p+b80bC+Vq1ynnaSvYmKhASDN4USi2iU86BSsBHCqNWC6g==';
      const resp = await LLMClient.chatCompletion(provider, apiKey, {
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'Describe what you hear in this audio clip.' },
          { type: 'input_audio', input_audio: { data: TEST_AUDIO_B64, format: 'wav' } },
        ] as any }],
        model: model.modelId, maxTokens: 100, temperature: 0,
      });
      const r = resp.content.toLowerCase();
      if (r.length > 5 && !/cannot|don't|unable|not.*support|no.*audio|unsupported/i.test(r)) audioScore = 6;
    } catch {}
    return { visionScore, audioScore };
  }

  static getTestCases(): TestCase[] { return [...QUICK_TESTS, ...STANDARD_TESTS]; }
}

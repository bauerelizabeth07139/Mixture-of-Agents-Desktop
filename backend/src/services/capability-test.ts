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
// QUICK TESTS — hard, 2 per category, 8 total
// ============================================================
const QUICK_TESTS: TestCase[] = [
  // CODE - Hard LeetCode
  { id: 'q-code-1', name: 'Trapping Rain Water', category: 'code', difficulty: 'quick',
    description: 'LeetCode #42 Hard', prompt: 'Write Python function trap(height: list[int]) -> int computing water trapped after rain. O(n) time, O(1) space using two-pointer. Return ONLY the function, no explanation.', maxTokens: 1500,
    evaluate: (r) => {
      const checks = [/def\s+trap/i, /left|right|l\s*=|r\s*=/i, /max.*left|max.*right|left_max|right_max|l_max|r_max/i, /while.*<.*len|while.*left.*right/i, /water|trapped|\+.*min|-\s*height/i, /return.*sum|return.*total|return.*water/i, r.length > 80 ? /./ : /(?!)/];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/'+checks.length+' checks' };
    }
  },
  { id: 'q-code-2', name: 'Serialize Binary Tree', category: 'code', difficulty: 'quick',
    description: 'LeetCode #297 Hard', prompt: 'Write Python class Codec with serialize(root) -> str and deserialize(data) -> TreeNode. Use BFS with "null" markers. Must handle empty tree. Define TreeNode class. Return ONLY the class.', maxTokens: 1500,
    evaluate: (r) => {
      const checks = [/class\s+Codec/i, /def\s+serialize/i, /def\s+deserialize/i, /null|None|#/i, /deque|queue|BFS|split|join/i, /class\s+TreeNode/i, /val|left|right/i, /return/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 6, correctness: m/checks.length, details: m+'/'+checks.length+' impl' };
    }
  },

  // REASONING - Competition math
  { id: 'q-reason-1', name: 'Fibonacci Last Digit', category: 'reasoning', difficulty: 'quick',
    description: 'Project Euler #25 variant', prompt: 'What is the last digit of 2^100? Show the cycle pattern of last digits of powers of 2, find the period, compute 100 mod period, and give the exact single digit answer. Show all work.', maxTokens: 1500,
    evaluate: (r) => {
      const checks = [/2.*4.*8.*6|2,4,8,6|cycle|period|pattern/i, /4|four|period.*4|repeats.*4/i, /100\s*(mod|%)|100.*4|remainder.*0/i, /\b6\b|last.*digit.*6|answer.*6|6\s*$/m, /32|64|128|256|512|1024/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: m+'/'+checks.length+' steps' };
    }
  },
  { id: 'q-reason-2', name: 'River Crossing', category: 'reasoning', difficulty: 'quick',
    description: 'Constraint satisfaction', prompt: 'A farmer must cross a river with a wolf, a goat, and a cabbage. Boat carries farmer + 1 item. Wolf eats goat if alone. Goat eats cabbage if alone. Find the minimum number of crossings and list each state (left bank, right bank). Show the complete solution.', maxTokens: 1500,
    evaluate: (r) => {
      const checks = [/7|seven|minimum.*cross/i, /wolf|goat|cabbage/i, /farmer|boat/i, /left.*bank|right.*bank|side/i, /state|step|crossing/i, /goat.*first|take.*goat/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: m+'/'+checks.length+' logic' };
    }
  },

  // INSTRUCTION - Multi-constraint
  { id: 'q-inst-1', name: 'Palindromic JSON', category: 'instruction', difficulty: 'quick',
    description: 'IFEval strict', prompt: 'Generate a JSON object where every string value is a palindrome (reads same forwards/backwards). Must have exactly 4 keys: "name" (palindrome, 4+ chars), "code" (palindrome, 3+ chars), "word" (palindrome, 5+ chars), "id" (palindrome number as string, 4+ digits). ONLY valid JSON, no markdown.', maxTokens: 1500,
    evaluate: (r) => {
      try {
        const clean = r.replace(/```json?\s*/g,'').replace(/```\s*/g,'').trim();
        const obj = JSON.parse(clean);
        const isPal = (s: string) => { const t = String(s); return t === t.split('').reverse().join(''); };
        const checks = [
          typeof obj.name === 'string' && obj.name.length >= 4 && isPal(obj.name),
          typeof obj.code === 'string' && obj.code.length >= 3 && isPal(obj.code),
          typeof obj.word === 'string' && obj.word.length >= 5 && isPal(obj.word),
          typeof obj.id === 'string' && obj.id.length >= 4 && /^\d+$/.test(obj.id) && isPal(obj.id),
          Object.keys(obj).length === 4,
        ];
        const m = checks.filter(Boolean).length;
        return { pass: m >= 4, correctness: m/checks.length, details: m+'/5 palindrome' };
      } catch { return { pass: false, correctness: 0, details: 'Invalid JSON' }; }
    }
  },
  { id: 'q-inst-2', name: 'Lipogram Essay', category: 'instruction', difficulty: 'quick',
    description: 'Oulipo constraint', prompt: 'Write a 5-sentence paragraph about space exploration that does NOT contain the letter "e" (the most common English letter). Each sentence must be 10-18 words. Must mention "Mars" and "moon" and "star". No sentence may start with the same letter as another. Count your words and verify no "e" appears.', maxTokens: 1500,
    evaluate: (r) => {
      const lines = r.trim().split(/[.!?]+/).filter((s: string) => s.trim().length > 10);
      const starts = lines.slice(0, 5).map((s: string) => s.trim().charAt(0).toUpperCase());
      const uniqStarts = new Set(starts);
      // Check no 'e' in actual content (skip metadata/count lines)
      const mainText = lines.slice(0, 5).join(' ');
      const hasE = /\be\b/i.test(mainText.replace(/Mars|star|space/gi, ''));
      const checks = [
        lines.length >= 4 && lines.length <= 6 ? /./ : /(?!)/,
        !hasE ? /./ : /(?!)/,
        /mars/i.test(r) ? /./ : /(?!)/,
        /moon/i.test(r) ? /./ : /(?!)/,
        /star/i.test(r) ? /./ : /(?!)/,
        uniqStarts.size >= 4 ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: lines.length+' sent, noE='+!hasE+', '+m+'/6' };
    }
  },

  // CHAT - Complex creative
  { id: 'q-chat-1', name: 'Nested Dialogue', category: 'chat', difficulty: 'quick',
    description: 'MT-Bench expert', prompt: 'Write a dialogue between a time traveler and a medieval blacksmith. Rules: 1) Exactly 6 exchanges (12 lines, alternating speakers) 2) Each line prefixed with "Traveler:" or "Smith:" 3) Traveler must explain electricity without using "electric", "power", "energy", or "current" 4) Smith must use at least 3 medieval terms (forge, anvil, bellows, quench, etc.) 5) The conversation must have a logical conclusion.', maxTokens: 1500,
    evaluate: (r) => {
      const traveler = (r.match(/Traveler:/gi) || []).length;
      const smith = (r.match(/Smith:/gi) || []).length;
      const medieval = (r.match(/forge|anvil|bellows|quench|tongs|hammer|iron|steel|coal|smelt|hammering/gi) || []);
      const forbidden = (r.match(/electric|power|energy|current/gi) || []).length;
      const checks = [
        traveler >= 5 ? /./ : /(?!)/,
        smith >= 5 ? /./ : /(?!)/,
        medieval.length >= 3 ? /./ : /(?!)/,
        forbidden === 0 ? /./ : /(?!)/,
        r.trim().split('\n').filter((l: string) => l.trim().length > 5).length >= 10 ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: traveler+'T/'+smith+'S, medieval='+medieval.length+', forbidden='+forbidden+', '+m+'/5' };
    }
  },
  { id: 'q-chat-2', name: 'Constraint Poem', category: 'chat', difficulty: 'quick',
    description: 'OuLiPo poetry', prompt: 'Write a poem about AI with exactly 4 stanzas of 3 lines each (12 lines total). Rules: 1) Each line 6-10 words 2) Rhyme scheme ABC ABC ABC ABC (lines 1,4,7,10 rhyme; 2,5,8,11 rhyme; 3,6,9,12 rhyme) 3) Contains "neural", "learn", "dream" 4) No line starts with "The" 5) Last line ends with "beyond."', maxTokens: 1500,
    evaluate: (r) => {
      const lines = r.trim().split('\n').filter((l: string) => l.trim().length > 3);
      const checks = [
        lines.length >= 10 && lines.length <= 14 ? /./ : /(?!)/,
        /neural/i.test(r) ? /./ : /(?!)/,
        /learn/i.test(r) ? /./ : /(?!)/,
        /dream/i.test(r) ? /./ : /(?!)/,
        !/^The\s/m.test(r) ? /./ : /(?!)/,
        /beyond\.?\s*$/i.test(r.trim()) ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: lines.length+' lines, '+m+'/6' };
    }
  },
];

// ============================================================
// STANDARD TESTS — very hard, 2 per category, 8 total
// ============================================================
const STANDARD_TESTS: TestCase[] = [
  // CODE - Expert LeetCode
  { id: 's-code-1', name: 'N-Queens', category: 'code', difficulty: 'standard',
    description: 'LeetCode #51 Hard', prompt: 'Write Python function solveNQueens(n: int) -> list[list[str]] returning all distinct solutions to the n-queens puzzle. Each solution is a list of strings where "Q" marks queen position and "." is empty. Use backtracking with column/diagonal sets. Return ONLY the function.', maxTokens: 5000,
    evaluate: (r) => {
      const checks = [/def\s+solveNQueens/i, /backtrack|recur|dfs/i, /col|diagonal|diag|hill|dale|slash/i, /set|\{|\}/i, /Q|queen|place/i, /\.|\./i, /for.*range|for.*col/i, /append|result|solution|board/i, /return/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 6, correctness: m/checks.length, details: m+'/'+checks.length+' impl' };
    }
  },
  { id: 's-code-2', name: 'Alien Dictionary', category: 'code', difficulty: 'standard',
    description: 'LeetCode #269 Hard', prompt: 'Write Python function alienOrder(words: list[str]) -> str returning character order in alien language. Build graph from word pairs, topological sort with cycle detection. Return "" if invalid. Return ONLY the function.', maxTokens: 5000,
    evaluate: (r) => {
      const checks = [/def\s+alienOrder/i, /graph|adj|neighbor|edge/i, /topological|indegree|in_degree|BFS|DFS|deque|queue/i, /for.*range.*len.*words|for.*pair|for.*i.*j/i, /char|first.*diff|different|compare/i, /cycle|invalid|return\s*""/i, /set|visited|result|order/i, /return/i];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 6, correctness: m/checks.length, details: m+'/'+checks.length+' impl' };
    }
  },

  // REASONING - Competition level
  { id: 's-reason-1', name: 'Inclusion-Exclusion', category: 'reasoning', difficulty: 'standard',
    description: 'AIME #12 2020', prompt: 'How many positive integers less than 1000 are divisible by at least one of 3, 5, or 7? Use inclusion-exclusion principle. Show: |A|, |B|, |C|, |A∩B|, |A∩C|, |B∩C|, |A∩B∩C|, and final answer. Must get exact integer.', maxTokens: 5000,
    evaluate: (r) => {
      const checks = [
        /\b333\b|floor.*3|999.*3|divisible.*3/i,
        /\b199\b|floor.*5|999.*5|divisible.*5/i,
        /\b142\b|floor.*7|999.*7|divisible.*7/i,
        /\b66\b|floor.*15|999.*15/i,
        /\b42\b|floor.*21|999.*21/i,
        /\b28\b|floor.*35|999.*35/i,
        /\b9\b|floor.*105|999.*105/i,
        /\b471\b|answer.*471|result.*471/i,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/'+checks.length+' steps' };
    }
  },
  { id: 's-reason-2', name: 'Graph Theory Proof', category: 'reasoning', difficulty: 'standard',
    description: 'Discrete math', prompt: 'Prove: In any graph with n vertices where every vertex has degree >= n/2, the graph is connected. Use proof by contradiction. Assume disconnected, show each component has at most n/2-1 vertices, derive contradiction with degree condition. Complete formal proof.', maxTokens: 5000,
    evaluate: (r) => {
      const checks = [
        /contradiction|suppose.*disconnected|assume.*not.*connect/i,
        /component|partition|subset|part/i,
        /degree.*n\/2|n\/2.*degree|degree.*≥.*n\/2/i,
        /at most|≤|<=.*n\/2|less.*n\/2/i,
        /contradict|impossible|cannot/i,
        /vertex|vertices|edge|adjacent/i,
        /connect/i,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 5, correctness: m/checks.length, details: m+'/'+checks.length+' proof' };
    }
  },

  // INSTRUCTION - Extreme constraints
  { id: 's-inst-1', name: 'Pangram Dialogue', category: 'instruction', difficulty: 'standard',
    description: 'Oulipo + IFEval', prompt: 'Write a dialogue between two people about cooking that is also a perfect pangram (uses every letter of the alphabet at least once). Rules: 1) Exactly 8 lines, alternating "A:" and "B:" 2) Each line is a grammatically correct sentence 3) The complete text must contain every letter a-z at least once 4) Each line 8-15 words 5) No line may use the letter "z" more than once.', maxTokens: 5000,
    evaluate: (r) => {
      const lines = r.trim().split('\n').filter((l: string) => l.trim().length > 5);
      const text = lines.join(' ').toLowerCase();
      const alphabet = 'abcdefghijklmnopqrstuvwxyz';
      const missing = alphabet.split('').filter((c: string) => !text.includes(c));
      const zCount = (text.match(/z/g) || []).length;
      const checks = [
        lines.length >= 6 && lines.length <= 10 ? /./ : /(?!)/,
        /^A:|^B:/m.test(r) ? /./ : /(?!)/,
        missing.length <= 2 ? /./ : /(?!)/,
        missing.length === 0 ? /./ : /(?!)/,
        /cook|recipe|food|bake|fry|boil|stir|heat/i.test(r) ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 3, correctness: m/checks.length, details: lines.length+' lines, missing='+missing.join('')+', z='+zCount+', '+m+'/5' };
    }
  },
  { id: 's-inst-2', name: 'Triple Nested JSON', category: 'instruction', difficulty: 'standard',
    description: 'IFEval expert', prompt: 'Generate JSON for a space mission: mission(string with "Apollo" prefix), year(1960-2024), crew(array of exactly 3: name(string, 2+ words), role("commander"|"pilot"|"engineer"), age(25-60), skills(array of exactly 3 unique strings)), launch:{site:string, thrust_kN:integer>1000, fuel:"RP-1"|"LH2"|"CH4"}, orbit:{type:"LEO"|"GEO"|"HEO"|"LLO", altitude_km:integer 100-50000, period_min:float>0}. ONLY valid JSON, no markdown.', maxTokens: 5000,
    evaluate: (r) => {
      try {
        const clean = r.replace(/```json?\s*/g,'').replace(/```\s*/g,'').trim();
        const obj = JSON.parse(clean);
        const crewOk = Array.isArray(obj.crew) && obj.crew.length === 3 &&
          obj.crew.every((c: any) => typeof c.name === 'string' && c.name.split(/\s+/).length >= 2 &&
            ['commander','pilot','engineer'].includes(c.role) && c.age >= 25 && c.age <= 60 &&
            Array.isArray(c.skills) && c.skills.length === 3 && new Set(c.skills).size === 3);
        const launchOk = typeof obj.launch === 'object' &&
          typeof obj.launch.site === 'string' && typeof obj.launch.thrust_kN === 'number' && obj.launch.thrust_kN > 1000 &&
          ['RP-1','LH2','CH4'].includes(obj.launch.fuel);
        const orbitOk = typeof obj.orbit === 'object' &&
          ['LEO','GEO','HEO','LLO'].includes(obj.orbit.type) &&
          typeof obj.orbit.altitude_km === 'number' && obj.orbit.altitude_km >= 100 && obj.orbit.altitude_km <= 50000 &&
          typeof obj.orbit.period_min === 'number' && obj.orbit.period_min > 0;
        const checks = [
          typeof obj.mission === 'string' && /Apollo/i.test(obj.mission),
          typeof obj.year === 'number' && obj.year >= 1960 && obj.year <= 2024,
          crewOk, launchOk, orbitOk,
        ];
        const m = checks.filter(Boolean).length;
        return { pass: m >= 4, correctness: m/checks.length, details: m+'/5 schema' };
      } catch { return { pass: false, correctness: 0, details: 'Invalid JSON' }; }
    }
  },

  // CHAT - Expert creative
  { id: 's-chat-1', name: 'Unreliable Narrator', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench advanced', prompt: 'Write a first-person narrative (8-10 sentences) where the narrator describes a robbery they witnessed, but plant exactly 3 subtle contradictions that hint the narrator is lying. After the story, add "---" then list the 3 contradictions in numbered format. Each sentence 12-20 words. Must include specific details (time, color, number) that contradict each other.', maxTokens: 5000,
    evaluate: (r) => {
      const sent = r.split(/[.!?]+/).filter((s: string) => s.trim().length > 10);
      const parts = r.split('---');
      const hasList = parts.length >= 2;
      const numbered = (parts[1] || '').match(/\d+[\.\)]/g) || [];
      const checks = [
        sent.length >= 7 && sent.length <= 12 ? /./ : /(?!)/,
        /robber|thief|stole|robbery|mask|gun|cash/i.test(r) ? /./ : /(?!)/,
        hasList ? /./ : /(?!)/,
        numbered.length >= 3 ? /./ : /(?!)/,
        /\d+.*\d+|time|color|blue|red|green|black|white/i.test(parts[0] || '') ? /./ : /(?!)/,
        /contradict|different|inconsist|discrepanc|mismatch|but.*said|however/i.test(parts[1] || r) ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: sent.length+' sent, list='+hasList+', '+numbered.length+' items, '+m+'/6' };
    }
  },
  { id: 's-chat-2', name: 'Meta Fiction', category: 'chat', difficulty: 'standard',
    description: 'MT-Bench expert', prompt: 'Write a 4th-wall-breaking story (6-8 sentences) where the character realizes they are in an AI conversation. Rules: 1) Character addresses "the reader" or "the AI" directly at least twice 2) References specific AI concepts (tokens, context window, temperature) metaphorically 3) Contains exactly 2 questions directed at the reader 4) Ends with the character asking to be remembered 5) Each sentence 15-25 words 6) No sentence may start with "I".', maxTokens: 5000,
    evaluate: (r) => {
      const sent = r.trim().split(/[.!?]+/).filter((s: string) => s.trim().length > 10);
      const checks = [
        sent.length >= 5 && sent.length <= 10 ? /./ : /(?!)/,
        /reader|you.*reading|audience|human/i.test(r) ? /./ : /(?!)/,
        /token|context|temperature|parameter|model|prompt|generate/i.test(r) ? /./ : /(?!)/,
        (r.match(/\?/g) || []).length >= 2 ? /./ : /(?!)/,
        /remember|memory|forget/i.test(r) ? /./ : /(?!)/,
        !/^I\s/m.test(r) ? /./ : /(?!)/,
      ];
      const m = checks.filter(c => c.test(r)).length;
      return { pass: m >= 4, correctness: m/checks.length, details: sent.length+' sent, '+m+'/6' };
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
            { role: 'system', content: 'You are a helpful assistant. Follow all instructions carefully and completely. Show your work.' },
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

    try {
      const price = await updateModelPricing(model.modelId, provider.baseUrl, apiKey.key);
      capabilities.pricing = { inputPer1M: price.inputPer1M, outputPer1M: price.outputPer1M, userEditable: true };
    } catch {}

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
        model: model.modelId, maxTokens: 1500, temperature: 0.1,
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

  static getTestCases(): TestCase[] { return [...QUICK_TESTS, ...STANDARD_TESTS]; }
}
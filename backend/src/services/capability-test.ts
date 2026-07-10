import { Provider, Model, ModelCapabilityProfile, ApiKeyEntry } from '../types';
import { LLMClient } from './llm-client';
import { updateModelPricing } from './price-fetcher';

// Capability Test Suite v2 - Real discrimination scoring

export interface TestCase {
  id: string; name: string; category: 'code' | 'reasoning' | 'chat' | 'instruction' | 'speed';
  description: string; prompt: string; maxTokens: number;
  evaluate: (response: string, latencyMs: number) => { score: number; details: string };
}

export interface TestResult {
  testId: string; testName: string; category: string; score: number; details: string; latencyMs: number; tokensUsed: number;
}

export interface ModelTestReport {
  modelId: string; modelName: string; providerName: string; timestamp: string;
  results: TestResult[]; overallScore: number; capabilities: ModelCapabilityProfile;
}

const TEST_CASES: TestCase[] = [
  {
    id: 'code-1', name: 'Python Function', category: 'code',
    description: 'Write a correct Python function with exact logic',
    prompt: 'Write a Python function called "fizzbuzz" that takes an integer n and returns a list of strings from 1 to n where multiples of 3 become "Fizz", multiples of 5 become "Buzz", multiples of both become "FizzBuzz", others become the number as string. Return ONLY the function code.',
    maxTokens: 1200,
    evaluate: (r) => {
      let score = 0;
      if (/def\s+fizzbuzz/i.test(r)) score += 1;
      if (/for\s+\w+\s+in\s+range/i.test(r)) score += 1;
      const bothPos = r.indexOf('FizzBuzz');
      const fizzPos = r.indexOf('Fizz');
      if (bothPos >= 0 && fizzPos >= 0 && bothPos <= fizzPos) score += 2;
      if (/15|\%\s*15/.test(r)) score += 2;
      if (/return|append|yield/i.test(r)) score += 1;
      if (/str\(|f['"]|append|\[.*\]/i.test(r)) score += 1;
      if (score >= 5 && !/error|undefined/.test(r)) score += 2;
      score = Math.min(10, score);
      return { score, details: score >= 7 ? 'Correct FizzBuzz' : score >= 4 ? 'Partial' : 'Incorrect' };
    },
  },
  {
    id: 'code-2', name: 'Bug Detection', category: 'code',
    description: 'Find the exact bug in code',
    prompt: 'This Python function returns the second largest number. It has a bug. Find it:\n\ndef second_largest(nums):\n    unique = list(set(nums))\n    unique.sort()\n    return unique[-2]\n\nWhen does it fail? Give a one-sentence fix.',
    maxTokens: 800,
    evaluate: (r) => {
      let score = 0;
      if (/less than 2|fewer than 2|only one|single element|IndexError/i.test(r)) score += 4;
      if (/check.*len|len.*check|if.*len.*<.*2/i.test(r)) score += 3;
      if (/set|duplicate|unique/i.test(r)) score += 1;
      if (/if.*len.*unique.*<.*2|return.*None|raise.*ValueError/i.test(r)) score += 2;
      score = Math.min(10, score);
      return { score, details: score >= 6 ? 'Found the edge case bug' : 'Did not find the real bug' };
    },
  },
  {
    id: 'reason-1', name: 'Math Calculation', category: 'reasoning',
    description: 'Multi-step arithmetic with exact answers',
    prompt: 'A rectangle has length 17.5 cm and width 8.4 cm. Calculate: 1) Area in sq cm, 2) Perimeter in cm, 3) Diagonal in cm (2 decimal places). Give answers as: Area=X, Perimeter=Y, Diagonal=Z',
    maxTokens: 1000,
    evaluate: (r) => {
      let score = 0;
      if (/147/.test(r)) score += 3;
      if (/51\.?8/.test(r)) score += 3;
      if (/19\.?4[0-2]/.test(r)) score += 4;
      score = Math.min(10, score);
      return { score, details: score >= 8 ? 'All correct' : score >= 5 ? 'Partial' : 'Incorrect' };
    },
  },
  {
    id: 'reason-2', name: 'Logic Puzzle', category: 'reasoning',
    description: 'Solve a logic deduction problem',
    prompt: 'Three boxes labeled "Apples", "Oranges", "Mixed" ALL have wrong labels. You pick one fruit from the "Mixed" box and it is an apple. What fruit is in each box? Give answers as: Apples box=X, Oranges box=Y, Mixed box=Z',
    maxTokens: 1000,
    evaluate: (r) => {
      let score = 0;
      if (/mixed.*apple|mixed.*contain.*apple/i.test(r)) score += 3;
      if (/apples.*orange|apple.*label.*orange/i.test(r)) score += 3;
      if (/oranges.*mixed|orange.*label.*mixed/i.test(r)) score += 3;
      if (score >= 6 && /wrong|since|because|therefore/i.test(r)) score += 1;
      score = Math.min(10, score);
      return { score, details: score >= 8 ? 'Correct deduction' : score >= 4 ? 'Partial' : 'Incorrect' };
    },
  },
  {
    id: 'chat-1', name: 'Format Following', category: 'instruction',
    description: 'Follow specific output format',
    prompt: 'Respond with EXACTLY this format, no extra text:\nName: [your model name]\nDate: [today YYYY-MM-DD]\nCapability: [one word]\nCount: [sum of 7+8+9+10+11+12]\nNothing else.',
    maxTokens: 600,
    evaluate: (r) => {
      let score = 0;
      if (/^Name:\s*\S/m.test(r)) score += 2;
      if (/Date:\s*\d{4}-\d{2}-\d{2}/.test(r)) score += 2;
      if (/Capability:\s*\w+$/m.test(r)) score += 2;
      if (/Count:\s*57/.test(r)) score += 4;
      score = Math.min(10, score);
      return { score, details: score >= 8 ? 'Perfect compliance' : score >= 4 ? 'Partial' : 'Did not follow format' };
    },
  },
  {
    id: 'chat-2', name: 'Word Count', category: 'chat',
    description: 'Summarize in exactly N words',
    prompt: 'Summarize gravity in EXACTLY 20 words. Not 19, not 21, exactly 20. Start with [20]: followed by your summary.',
    maxTokens: 600,
    evaluate: (r) => {
      let score = 0;
      const match = r.match(/\[\d+\]:\s*(.+)/s);
      const summary = match ? match[1].trim() : r.trim();
      const words = summary.split(/\s+/).filter(w => w.length > 0);
      if (words.length === 20) score += 5;
      else if (Math.abs(words.length - 20) <= 2) score += 3;
      else if (Math.abs(words.length - 20) <= 5) score += 1;
      if (/gravity|gravitational|mass|attract|force|fall|weight/i.test(summary)) score += 3;
      if (/^\[\d+\]:/.test(r.trim())) score += 2;
      score = Math.min(10, score);
      return { score, details: 'Words: ' + words.length + '/20. ' + (score >= 7 ? 'Excellent' : score >= 4 ? 'Close' : 'Off target') };
    },
  },
  {
    id: 'speed-1', name: 'Simple Q&A Speed', category: 'speed',
    description: 'Response speed on trivial question',
    prompt: 'What is the capital of France? Answer in one word.',
    maxTokens: 600,
    evaluate: (_r, latencyMs) => {
      let score = 0;
      if (latencyMs < 500) score += 6;
      else if (latencyMs < 1000) score += 5;
      else if (latencyMs < 2000) score += 4;
      else if (latencyMs < 3000) score += 3;
      else if (latencyMs < 5000) score += 2;
      else score += 1;
      if (/paris/i.test(_r)) score += 4;
      score = Math.min(10, score);
      return { score, details: latencyMs + 'ms - ' + (score >= 4 ? 'Fast' : 'Slow') };
    },
  },
];

export class CapabilityTestEngine {

  static async runFullTest(provider: Provider, apiKey: ApiKeyEntry, model: Model): Promise<ModelTestReport> {
    const results: TestResult[] = [];
    for (const test of TEST_CASES) {
      try {
        const start = Date.now();
        const resp = await LLMClient.chatCompletion(provider, apiKey, {
          messages: [
            { role: 'system', content: 'You are a helpful assistant. Follow instructions precisely. Output only what is asked, nothing else.' },
            { role: 'user', content: test.prompt },
          ],
          model: model.modelId, maxTokens: test.maxTokens, temperature: 0.1,
        });
        const latencyMs = Date.now() - start;
        const evalResult = test.evaluate(resp.content, latencyMs);
        results.push({ testId: test.id, testName: test.name, category: test.category, score: evalResult.score, details: evalResult.details, latencyMs, tokensUsed: resp.usage.totalTokens });
      } catch (error: any) {
        results.push({ testId: test.id, testName: test.name, category: test.category, score: 0, details: 'Error: ' + error.message.slice(0, 150), latencyMs: 0, tokensUsed: 0 });
      }
    }
    const codeResults = results.filter(r => r.category === 'code');
    const reasonResults = results.filter(r => r.category === 'reasoning');
    const chatResults = results.filter(r => r.category === 'chat' || r.category === 'instruction');
    const avg = (arr: TestResult[]) => arr.length ? Math.round(arr.reduce((s, r) => s + r.score, 0) / arr.length * 10) / 10 : 0;
    const avgLatency = results.filter(r => r.latencyMs > 0).reduce((s, r) => s + r.latencyMs, 0) / (results.filter(r => r.latencyMs > 0).length || 1);
    const capabilities: ModelCapabilityProfile = {
      code: avg(codeResults), agent: avg(reasonResults), chat: avg(chatResults),
      context: model.capabilities.context,
      speed: avgLatency < 800 ? 10 : avgLatency < 1500 ? 8 : avgLatency < 3000 ? 6 : avgLatency < 6000 ? 4 : 2,
      multimodal: model.capabilities.multimodal, visionScore: 0, audioScore: 0, pricing: model.capabilities.pricing,
    };
    const overallScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length * 10) / 10;

    // Fetch latest official pricing
    try {
      const price = await updateModelPricing(model.modelId, provider.baseUrl, apiKey.key);
      capabilities.pricing = { inputPer1M: price.inputPer1M, outputPer1M: price.outputPer1M, userEditable: true };
    } catch {}
    return { modelId: model.id, modelName: model.modelId, providerName: provider.name, timestamp: new Date().toISOString(), results, overallScore, capabilities };
  }

  static async runQuickTest(provider: Provider, apiKey: ApiKeyEntry, model: Model): Promise<ModelTestReport> {
    const quickIds = ['code-1', 'reason-1', 'chat-1', 'speed-1'];
    const quickTests = TEST_CASES.filter(t => quickIds.includes(t.id));
    const results: TestResult[] = [];
    for (const test of quickTests) {
      try {
        const start = Date.now();
        const resp = await LLMClient.chatCompletion(provider, apiKey, {
          messages: [
            { role: 'system', content: 'You are a helpful assistant. Follow instructions precisely.' },
            { role: 'user', content: test.prompt },
          ],
          model: model.modelId, maxTokens: test.maxTokens, temperature: 0.1,
        });
        const latencyMs = Date.now() - start;
        const evalResult = test.evaluate(resp.content, latencyMs);
        results.push({ testId: test.id, testName: test.name, category: test.category, score: evalResult.score, details: evalResult.details, latencyMs, tokensUsed: resp.usage.totalTokens });
      } catch (error: any) {
        results.push({ testId: test.id, testName: test.name, category: test.category, score: 0, details: error.message.slice(0, 150), latencyMs: 0, tokensUsed: 0 });
      }
    }
    const avgLatency = results.filter(r => r.latencyMs > 0).reduce((s, r) => s + r.latencyMs, 0) / (results.filter(r => r.latencyMs > 0).length || 1);
    const overallScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length * 10) / 10;
    // Fetch latest official pricing
    let latestPricing = model.capabilities.pricing;
    try {
      const price = await updateModelPricing(model.modelId, provider.baseUrl, apiKey.key);
      latestPricing = { inputPer1M: price.inputPer1M, outputPer1M: price.outputPer1M, userEditable: true };
    } catch {}

    return {
      modelId: model.id, modelName: model.modelId, providerName: provider.name,
      timestamp: new Date().toISOString(), results, overallScore,
      capabilities: {
        code: results.find(r => r.category === 'code')?.score ?? 0,
        agent: results.find(r => r.category === 'reasoning')?.score ?? 0,
        chat: results.find(r => r.category === 'chat' || r.category === 'instruction')?.score ?? 0,
        context: model.capabilities.context,
        speed: avgLatency < 800 ? 10 : avgLatency < 1500 ? 8 : avgLatency < 3000 ? 6 : avgLatency < 6000 ? 4 : 2,
        multimodal: model.capabilities.multimodal, visionScore: 0, audioScore: 0, pricing: latestPricing,
      },
    };
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

  static getTestCases(): TestCase[] { return TEST_CASES; }
}

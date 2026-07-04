import { Provider, Model, ModelCapabilityProfile, ApiKeyEntry } from '../types';
import { LLMClient } from './llm-client';

// ============================================================
// Capability Test Suite - Real test cases for model evaluation
// ============================================================

export interface TestCase {
  id: string;
  name: string;
  category: 'code' | 'reasoning' | 'chat' | 'instruction' | 'multimodal';
  description: string;
  prompt: string;
  maxTokens: number;
  evaluate: (response: string) => { score: number; details: string };
}

export interface TestResult {
  testId: string;
  testName: string;
  category: string;
  score: number;      // 0-10
  details: string;
  latencyMs: number;
  tokensUsed: number;
}

export interface ModelTestReport {
  modelId: string;
  modelName: string;
  providerName: string;
  timestamp: string;
  results: TestResult[];
  overallScore: number;
  capabilities: ModelCapabilityProfile;
}

// ── Test Cases ──

const TEST_CASES: TestCase[] = [
  // Code Generation
  {
    id: 'code-1',
    name: 'Binary Search',
    category: 'code',
    description: 'Implement binary search in TypeScript',
    prompt: 'Write a TypeScript function binarySearch(arr: number[], target: number): number that returns the index of target in sorted arr, or -1 if not found. Include type annotations. Return ONLY the function code, no explanation.',
    maxTokens: 500,
    evaluate: (r) => {
      let score = 3;
      if (r.includes('function binarySearch')) score += 2;
      if (r.includes('number')) score += 1;
      if (r.includes('while') || r.includes('mid')) score += 2;
      if (r.includes('-1')) score += 1;
      if (r.includes('left') || r.includes('right') || r.includes('low') || r.includes('high')) score += 1;
      return { score: Math.min(10, score), details: score >= 7 ? 'Correct implementation' : 'Partial implementation' };
    },
  },
  {
    id: 'code-2',
    name: 'Bug Fix',
    category: 'code',
    description: 'Find and fix a bug in given code',
    prompt: 'This function has a bug. Find and fix it, return ONLY the corrected function:\n\nfunction removeDuplicates(arr: number[]): number[] {\n  const result = [];\n  for (let i = 0; i < arr.length; i++) {\n    if (arr[i] !== arr[i+1]) {\n      result.push(arr[i]);\n    }\n  }\n  return result;\n}',
    maxTokens: 500,
    evaluate: (r) => {
      let score = 3;
      if (r.includes('indexOf') || r.includes('includes') || r.includes('Set') || r.includes('i === 0') || r.includes('arr[i-1]')) score += 3;
      if (r.includes('function removeDuplicates')) score += 2;
      if (r.includes('result.push')) score += 2;
      return { score: Math.min(10, score), details: score >= 7 ? 'Bug correctly identified and fixed' : 'Partial fix' };
    },
  },
  {
    id: 'code-3',
    name: 'API Endpoint',
    category: 'code',
    description: 'Write Express API endpoint',
    prompt: 'Write an Express.js GET endpoint /api/users/:id that: 1) validates id is a number, 2) returns user JSON with 404 if not found, 3) includes error handling. Return ONLY the route handler code.',
    maxTokens: 600,
    evaluate: (r) => {
      let score = 2;
      if (r.includes('req.params') || r.includes('req.param')) score += 2;
      if (r.includes('404')) score += 2;
      if (r.includes('try') || r.includes('catch') || r.includes('error')) score += 2;
      if (r.includes('isNaN') || r.includes('parseInt') || r.includes('Number(')) score += 1;
      if (r.includes('res.json') || r.includes('res.status')) score += 1;
      return { score: Math.min(10, score), details: score >= 7 ? 'Complete endpoint with validation' : 'Partial implementation' };
    },
  },

  // Reasoning
  {
    id: 'reason-1',
    name: 'Math Word Problem',
    category: 'reasoning',
    description: 'Solve a multi-step math problem',
    prompt: 'A store sells notebooks for $3 each and pens for $1.50 each. Sarah bought 4 notebooks and some pens. She spent $18 in total. How many pens did she buy? Show your reasoning step by step, then give the final answer.',
    maxTokens: 300,
    evaluate: (r) => {
      let score = 2;
      if (r.includes('12') || r.includes('4 * 3') || r.includes('4×3')) score += 2; // 4*3=12
      if (r.includes('6') && (r.includes('18 - 12') || r.includes('18-12'))) score += 2; // 18-12=6
      if (r.includes('4') && (r.includes('6 / 1.5') || r.includes('6÷1.5') || r.includes('6/1.5'))) score += 3; // 6/1.5=4
      if (r.includes('4 pens') || r.includes('4  pens') || r.includes('four pens') || r.includes('4 pen')) score += 1;
      return { score: Math.min(10, score), details: score >= 8 ? 'Correct: 4 pens' : 'Incorrect or incomplete reasoning' };
    },
  },
  {
    id: 'reason-2',
    name: 'Logic Puzzle',
    category: 'reasoning',
    description: 'Solve a logic deduction problem',
    prompt: 'Three friends (Alice, Bob, Carol) each have a different pet (cat, dog, fish). Alice does not have the cat. Bob has the dog. Who has the cat and who has the fish? Answer directly with the assignments.',
    maxTokens: 200,
    evaluate: (r) => {
      let score = 3;
      var lower = r.toLowerCase();
      if ((lower.includes('carol') && lower.includes('cat')) || lower.includes('carol has the cat')) score += 3;
      if ((lower.includes('alice') && lower.includes('fish')) || lower.includes('alice has the fish')) score += 3;
      if (lower.includes('bob') && lower.includes('dog')) score += 1;
      return { score: Math.min(10, score), details: score >= 8 ? 'Correct: Carol=cat, Alice=fish' : 'Incorrect deduction' };
    },
  },

  // Chat / Instruction Following
  {
    id: 'chat-1',
    name: 'Format Following',
    category: 'instruction',
    description: 'Follow specific output format instructions',
    prompt: 'List exactly 3 programming languages in this exact JSON format (no other text):\n{"languages": ["...", "...", "..."]}',
    maxTokens: 100,
    evaluate: (r) => {
      let score = 2;
      var trimmed = r.trim();
      if (trimmed.includes('"languages"')) score += 3;
      if (trimmed.includes('[') && trimmed.includes(']')) score += 2;
      try {
        var match = trimmed.match(/\{[^}]+\}/);
        if (match) {
          var parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed.languages) && parsed.languages.length === 3) score += 3;
        }
      } catch {}
      return { score: Math.min(10, score), details: score >= 8 ? 'Perfect format compliance' : 'Format issues' };
    },
  },
  {
    id: 'chat-2',
    name: 'Concise Summary',
    category: 'chat',
    description: 'Summarize text concisely',
    prompt: 'Summarize in exactly one sentence: "Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed. It focuses on developing computer programs that can access data and use it to learn for themselves. The process begins with observations or data, such as examples, direct experience, or instruction, to look for patterns in data and make better decisions in the future."',
    maxTokens: 100,
    evaluate: (r) => {
      let score = 3;
      if (r.length < 200) score += 2;
      if (r.includes('learn') || r.includes('data') || r.includes('pattern')) score += 2;
      if (r.includes('machine learning') || r.includes('AI') || r.includes('artificial intelligence')) score += 2;
      if (r.endsWith('.') || r.endsWith('."')) score += 1;
      return { score: Math.min(10, score), details: score >= 7 ? 'Concise and accurate' : 'Too verbose or inaccurate' };
    },
  },
  {
    id: 'chat-3',
    name: 'Speed Test',
    category: 'chat',
    description: 'Simple response speed',
    prompt: 'What is 2+2? Reply with just the number.',
    maxTokens: 10,
    evaluate: (r) => {
      var score = r.trim().includes('4') ? 10 : 0;
      return { score, details: score === 10 ? 'Correct' : 'Incorrect' };
    },
  },
];

export class CapabilityTestEngine {
  // Run all tests on a model
  static async runFullTest(
    provider: Provider, apiKey: ApiKeyEntry, model: Model
  ): Promise<ModelTestReport> {
    const results: TestResult[] = [];

    for (const test of TEST_CASES) {
      try {
        const start = Date.now();
        const resp = await LLMClient.chatCompletion(provider, apiKey, {
          messages: [{ role: 'user', content: test.prompt }],
          model: model.modelId,
          maxTokens: test.maxTokens,
          temperature: 0.1,
        });
        const latencyMs = Date.now() - start;
        const evalResult = test.evaluate(resp.content);

        results.push({
          testId: test.id, testName: test.name, category: test.category,
          score: evalResult.score, details: evalResult.details,
          latencyMs, tokensUsed: resp.usage.totalTokens,
        });
      } catch (error: any) {
        results.push({
          testId: test.id, testName: test.name, category: test.category,
          score: 0, details: 'Error: ' + error.message.slice(0, 100),
          latencyMs: 0, tokensUsed: 0,
        });
      }
    }

    // Compute capability scores from test results
    const codeResults = results.filter(r => r.category === 'code');
    const reasonResults = results.filter(r => r.category === 'reasoning');
    const chatResults = results.filter(r => r.category === 'chat' || r.category === 'instruction');

    const avg = (arr: TestResult[]) => arr.length ? arr.reduce((s, r) => s + r.score, 0) / arr.length : 5;
    const avgLatency = results.filter(r => r.latencyMs > 0).reduce((s, r) => s + r.latencyMs, 0) / results.filter(r => r.latencyMs > 0).length || 5000;

    const capabilities: ModelCapabilityProfile = {
      code: Math.round(avg(codeResults) * 10) / 10,
      agent: Math.round(avg(reasonResults) * 10) / 10,
      chat: Math.round(avg(chatResults) * 10) / 10,
      context: model.capabilities.context,
      speed: avgLatency < 1000 ? 10 : avgLatency < 2000 ? 8 : avgLatency < 4000 ? 6 : avgLatency < 8000 ? 4 : 2,
      multimodal: model.capabilities.multimodal,
      pricing: model.capabilities.pricing,
    };

    const overallScore = results.reduce((s, r) => s + r.score, 0) / results.length;

    return {
      modelId: model.id, modelName: model.modelId, providerName: provider.name,
      timestamp: new Date().toISOString(), results, overallScore: Math.round(overallScore * 10) / 10,
      capabilities,
    };
  }

  // Quick test (3 tests only)
  static async runQuickTest(
    provider: Provider, apiKey: ApiKeyEntry, model: Model
  ): Promise<ModelTestReport> {
    const quickTests = TEST_CASES.filter(t => ['code-1', 'reason-1', 'chat-3'].includes(t.id));
    const results: TestResult[] = [];

    for (const test of quickTests) {
      try {
        const start = Date.now();
        const resp = await LLMClient.chatCompletion(provider, apiKey, {
          messages: [{ role: 'user', content: test.prompt }],
          model: model.modelId, maxTokens: test.maxTokens, temperature: 0.1,
        });
        const latencyMs = Date.now() - start;
        const evalResult = test.evaluate(resp.content);
        results.push({ testId: test.id, testName: test.name, category: test.category, score: evalResult.score, details: evalResult.details, latencyMs, tokensUsed: resp.usage.totalTokens });
      } catch (error: any) {
        results.push({ testId: test.id, testName: test.name, category: test.category, score: 0, details: error.message.slice(0, 100), latencyMs: 0, tokensUsed: 0 });
      }
    }

    const overallScore = results.reduce((s, r) => s + r.score, 0) / results.length;
    const avgLatency = results.filter(r => r.latencyMs > 0).reduce((s, r) => s + r.latencyMs, 0) / results.filter(r => r.latencyMs > 0).length || 5000;

    return {
      modelId: model.id, modelName: model.modelId, providerName: provider.name,
      timestamp: new Date().toISOString(), results, overallScore: Math.round(overallScore * 10) / 10,
      capabilities: {
        code: results.find(r => r.category === 'code')?.score || 5,
        agent: results.find(r => r.category === 'reasoning')?.score || 5,
        chat: results.find(r => r.category === 'chat')?.score || 5,
        context: model.capabilities.context, speed: avgLatency < 2000 ? 8 : avgLatency < 5000 ? 5 : 3,
        multimodal: model.capabilities.multimodal, pricing: model.capabilities.pricing,
      },
    };
  }

  // Multimodal test with image
  static async testMultimodal(
    provider: Provider, apiKey: ApiKeyEntry, model: Model, imageUrl: string
  ): Promise<{ score: number; details: string; latencyMs: number }> {
    const start = Date.now();
    try {
      const resp = await LLMClient.chatCompletion(provider, apiKey, {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image in detail. What objects do you see? What colors are dominant?' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ] as any,
        }],
        model: model.modelId, maxTokens: 300, temperature: 0.2,
      });
      const latencyMs = Date.now() - start;
      const r = resp.content.toLowerCase();
      let score = 3;
      if (r.length > 50) score += 2;
      if (r.includes('color') || r.includes('image') || r.includes('see') || r.includes('show')) score += 2;
      if (r.length > 150) score += 2;
      if (latencyMs < 5000) score += 1;
      return { score: Math.min(10, score), details: resp.content.slice(0, 200), latencyMs };
    } catch (error: any) {
      return { score: 0, details: 'Error: ' + error.message.slice(0, 100), latencyMs: Date.now() - start };
    }
  }

  // Get test cases
  static getTestCases(): TestCase[] {
    return TEST_CASES;
  }
}

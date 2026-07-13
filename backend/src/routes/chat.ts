import { v4 as uuid } from 'uuid';
import { Router } from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { ApiPoolManager } from '../providers/api-pool';
import { LLMClient } from '../services/llm-client';

const RECENT_MESSAGE_LIMIT = 20;
const SUMMARY_MAX_CHARS = 200;
const WORKSPACE_ROOT = path.join(os.homedir(), '.moa-workspace');

function compressHistory(history: Array<{role: string; content: string}>): Array<{role: string; content: string}> {
  if (!history || history.length === 0) return [];
  if (history.length <= RECENT_MESSAGE_LIMIT) return history;
  const oldMessages = history.slice(0, history.length - RECENT_MESSAGE_LIMIT);
  const recentMessages = history.slice(history.length - RECENT_MESSAGE_LIMIT);
  const summaryLines: string[] = [];
  for (const msg of oldMessages) {
    if (msg.role === 'system') continue;
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const truncated = text.length > SUMMARY_MAX_CHARS ? text.slice(0, SUMMARY_MAX_CHARS) + '...' : text;
    const label = msg.role === 'user' ? 'User' : 'Assistant';
    summaryLines.push('[' + label + ']: ' + truncated);
  }
  const summaryBlock = summaryLines.length > 0
    ? [{ role: 'system' as const, content: '[Earlier conversation summary]\r\n' + summaryLines.join('\r\n') }]
    : [];
  return [...summaryBlock, ...recentMessages];
}

function getProjectDir(threadId?: string, projectPath?: string): string {
  if (projectPath && fs.existsSync(projectPath)) return projectPath;
  if (threadId) {
    const dir = path.join(WORKSPACE_ROOT, threadId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const dir = path.join(WORKSPACE_ROOT, 'default');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function execCmd(cmd: string, cwd: string, timeoutMs = 30000): { exitCode: number; stdout: string; stderr: string } {
  const scriptFile = path.join(os.tmpdir(), `moa-exec-${uuid()}.cmd`);
  fs.writeFileSync(scriptFile, `@echo off\n${cmd}`, 'utf-8');
  try {
    const result = spawnSync('cmd.exe', ['/c', scriptFile], {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    return { exitCode: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
  } finally {
    try { fs.unlinkSync(scriptFile); } catch {}
  }
}

export function createChatRoutes(pool: ApiPoolManager) {
  const r = Router();
  r.get('/project-dir', (req, res) => {
    const threadId = req.query.threadId as string | undefined;
    const dir = getProjectDir(threadId);
    res.json({ projectDir: dir, threadId: threadId || 'default' });
  });
  r.get('/projects', (_req, res) => {
    try {
      if (!fs.existsSync(WORKSPACE_ROOT)) {
        return res.json({ projects: [] });
      }
      const entries = fs.readdirSync(WORKSPACE_ROOT, { withFileTypes: true });
      const projects = entries
        .filter(e => e.isDirectory())
        .map(e => ({
          threadId: e.name,
          path: path.join(WORKSPACE_ROOT, e.name),
          hasPackageJson: fs.existsSync(path.join(WORKSPACE_ROOT, e.name, 'package.json')),
        }));
      res.json({ projects });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  r.post('/', async (req, res) => {
    try {
      const { message, modelId, history, attachments, threadId, projectPath: userProjectPath } = req.body;
      const projectDir = getProjectDir(threadId, userProjectPath ?? undefined);
      if (!message && (!attachments || attachments.length === 0)) {
        return res.status(400).json({ error: 'Empty message' });
      }
      let provider: any;
      let model: any;
      let apiKey: any;
      if (modelId) {
        const found = pool.findProviderForModel(modelId);
        if (found) { provider = found.provider; model = found.model; apiKey = found.apiKey; }
      }
      if (!provider) {
        for (const prov of pool.getAllProviders()) {
          const key = pool.getNextApiKey(prov.id);
          if (!key) continue;
          const llm = prov.models.find((m: any) => m.type === 'llm' || m.capabilities.visionScore > 0);
          if (llm) { provider = prov; model = llm; apiKey = key; break; }
        }
      }
      if (!provider || !model || !apiKey) {
        return res.status(400).json({ error: 'No available models with active API keys. Add a provider and key first.' });
      }
      const messages: Array<{role: string; content: any}> = [
        { role: 'system', content: 'You are a helpful AI assistant in the Mixture of Agents system. Respond concisely and accurately.' },
      ];
      const compressedHistory = compressHistory(history || []);
      for (const msg of compressedHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
      const imageAttachments = (attachments || []).filter((a: any) => a.type === 'image');
      let userContent: any = message;
      if (imageAttachments.length > 0 && (model.capabilities.visionScore > 0 || model.capabilities?.multimodal)) {
        const contentArr: any[] = [{ type: 'text', text: message || 'Describe this image.' }];
        for (const img of imageAttachments) {
          if (img.data && img.data.startsWith('data:')) {
            contentArr.push({ type: 'image_url', image_url: { url: img.data } });
          }
        }
        userContent = contentArr;
      }
      messages.push({ role: 'user', content: userContent });
      const resp = await LLMClient.chatCompletion(provider, apiKey, {
        messages,
        model: model.modelId,
        temperature: 0.7,
        maxTokens: 4096,
      });
      const execResults: { cmd: string; exitCode: number; stdout: string; stderr: string }[] = [];
      res.json({
        role: 'orchestrator',
        content: resp.content,
        model: model.name,
        provider: provider.name,
        latencyMs: resp.latencyMs,
        usage: resp.usage,
        projectDir,
      });
    } catch (err: any) {
      console.error('[Chat] Error:', err.message);
      res.status(500).json({ error: err.message, role: 'error', content: err.message });
    }
  });
  return r;
}

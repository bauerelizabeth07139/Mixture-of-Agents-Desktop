import { v4 as uuid } from 'uuid';
import { Project, SubAgent, SubAgentTask, Model, Provider, UserPreferences } from '../types';
import { ApiPoolManager } from '../providers/api-pool';
import { LLMClient, QuotaExhaustedError } from '../services/llm-client';
import { ModelCapabilityScorer } from '../models/capability-scorer';
import { CodingEngine } from '../services/coding-engine';
import { ORCHESTRATOR_SYSTEM_PROMPT, SUBAGENT_SYSTEM_PROMPT, CODING_SUBAGENT_PROMPT, buildThinkingPrefix, buildDecompositionPrompt, buildFailureEvalPrompt, buildAggregationPrompt } from './prompts';
import os from 'os';
import { ExtensionManager } from '../services/extensions/extension-manager';
import path from 'path';

export type OrchestratorEventCallback = (event: string, data: any) => void;

export class Orchestrator {
  private project: Project;
  private poolManager: ApiPoolManager;
  private preferences: UserPreferences;
  private eventCallback: OrchestratorEventCallback | null = null;
  private abortController: AbortController | null = null;
  private codingEngine: CodingEngine;
  private extensionManager: ExtensionManager | null;

  constructor(project: Project, poolManager: ApiPoolManager, preferences: UserPreferences, extensionManager?: ExtensionManager) {
    this.project = project;
    this.poolManager = poolManager;
    this.preferences = preferences;
    this.codingEngine = new CodingEngine(path.join(os.tmpdir(), 'moa-workspace'));
    this.extensionManager = extensionManager || null;
  }

  onEvent(cb: OrchestratorEventCallback) { this.eventCallback = cb; }
  private emit(event: string, data: any) { this.eventCallback?.(event, data); }

  async execute(): Promise<void> {
    this.abortController = new AbortController();
    this.project.orchestratorState.status = 'planning';
    this.emit('orchestrator_update', { status: 'planning', projectId: this.project.id });
    try {
      const subtasks = await this.decomposeTask();
      this.emit('orchestrator_update', { status: 'executing', subtasks: subtasks.length });
      for (const st of subtasks) {
        if (this.abortController.signal.aborted) break;
        await this.executeSubtask(st);
      }
      const result = await this.aggregateResults();
      this.project.orchestratorState.finalResult = result;
      this.project.orchestratorState.status = 'completed';
      this.emit('orchestrator_update', { status: 'completed', result, projectId: this.project.id });
    } catch (e: any) {
      this.project.orchestratorState.status = 'failed';
      this.emit('error', { message: e.message, projectId: this.project.id });
    }
  }

  private async decomposeTask(): Promise<Array<{description: string; taskType: string; priority: number}>> {
    const m = this.getOrchestratorModel();
    if (!m) throw new Error('No orchestrator model available');
    try {
      const resp = await this.callOrchestrator(buildDecompositionPrompt(this.project.initialTask, this.preferences.costEfficiencyRatio));
      const jm = resp.match(/\[[\s\S]*\]/);
      if (jm) {
        const arr = JSON.parse(jm[0]);
        if (Array.isArray(arr) && arr.length > 0) {
          return arr.map((x: any) => ({
            description: String(x.description || x.task || this.project.initialTask),
            taskType: String(x.taskType || x.type || 'general'),
            priority: Number(x.priority || 1),
          }));
        }
      }
    } catch (e: any) {
      console.error('[Orchestrator] Decomposition failed, using single task:', e.message);
    }
    // Fallback: single task
    return [{ description: this.project.initialTask, taskType: 'general', priority: 1 }];
  }

  private async executeSubtask(st: {description: string; taskType: string; priority: number}): Promise<void> {
    const taskId = uuid();
    const task: SubAgentTask = {
      id: taskId, agentId: '', description: st.description, assignedModel: '',
      status: 'pending', attempts: 0, maxAttempts: 3,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    this.project.orchestratorState.tasks.push(task);
    this.emit('task_update', { task, pid: this.project.id });

    const sel = this.selectBestModel(st.taskType);
    if (!sel) {
      task.status = 'failed'; task.error = 'No model available';
      this.addIssue('system', 'system', task.error, 'critical');
      return;
    }

    const agent = this.createSubAgent(sel.model.id, sel.provider.id);
    task.agentId = agent.id; task.assignedModel = sel.model.id; task.status = 'running';
    agent.status = 'working'; agent.currentTask = taskId;
    this.emit('agent_update', { agent, pid: this.project.id });
    this.emit('task_update', { task, pid: this.project.id });

    if (st.taskType === 'code') {
      await this.executeCodingSubtask(task, agent, sel.provider, sel.apiKey, sel.model, st.description);
    } else {
      await this.runWithRetry(task, agent, sel.provider, sel.apiKey, st.description);
    }
  }

  private async executeCodingSubtask(task: SubAgentTask, agent: SubAgent, initialProv: Provider, initialKey: any, initialModel: Model, desc: string): Promise<void> {
    let provider = initialProv, apiKey = initialKey, model = initialModel;

    while (task.attempts < task.maxAttempts) {
      task.attempts++;
      task.updatedAt = new Date().toISOString();
      this.emit('task_update', { task, pid: this.project.id });

      try {
        const ctx = this.buildContext();
        const resp = await LLMClient.chatCompletion(provider, apiKey, {
          messages: [
            { role: 'system', content: CODING_SUBAGENT_PROMPT + (ctx ? '\n\nContext:\n' + ctx : '') },
            { role: 'user', content: 'Task: ' + desc + '\nProject base: ' + this.codingEngine.getBasePath() },
          ],
          model: model.modelId, temperature: 0.2, maxTokens: 4096,
        });

        if (!resp.content || resp.content.trim().length < 10) {
          throw new Error('Empty or too short model response');
        }

        // Extract code blocks from response
        const codeBlocks: Array<{lang: string; filename: string; content: string}> = [];
        const blockRegex = /```(\w+)(?::([^\n]+))?\n([\s\S]*?)```/g;
        let match;
        while ((match = blockRegex.exec(resp.content)) !== null) {
          const lang = match[1] || 'txt';
          const filename = match[2] || ('file_' + lang + '.' + (lang === 'python' ? 'py' : lang === 'bash' || lang === 'sh' || lang === 'powershell' ? 'sh' : lang === 'javascript' || lang === 'js' ? 'js' : lang === 'typescript' || lang === 'ts' ? 'ts' : lang));
          codeBlocks.push({ lang, filename, content: match[3] });
        }

        let plan;
        // Try JSON plan first
        try {
          const jm = resp.content.match(/\{[\s\S]*"steps"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
          if (jm) plan = JSON.parse(jm[0]);
        } catch {}

        // If no JSON plan, build from code blocks
        if (!plan) {
          if (codeBlocks.length > 0) {
            const steps = [];
            for (const block of codeBlocks) {
              if (block.lang === 'bash' || block.lang === 'sh' || block.lang === 'powershell' || block.lang === 'shell') {
                // Split multi-line commands, filter comments and empty lines
                const cmdLines = block.content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
                for (const cmd of cmdLines) {
                  steps.push({ action: 'run_command', description: 'Run: ' + cmd.slice(0, 60), params: { command: cmd } });
                }
              } else {
                steps.push({ action: 'write_file', description: 'Write ' + block.filename, params: { path: block.filename, content: block.content } });
              }
            }
            // Auto-add run step for detected scripts
            const pyFile = codeBlocks.find(b => b.lang === 'python');
            if (pyFile) steps.push({ action: 'run_command', description: 'Run ' + pyFile.filename, params: { command: 'python ' + pyFile.filename } });
            const jsFile = codeBlocks.find(b => b.lang === 'javascript' || b.lang === 'js');
            if (jsFile) steps.push({ action: 'run_command', description: 'Run ' + jsFile.filename, params: { command: 'node ' + jsFile.filename } });
            plan = { reasoning: 'Extracted from markdown', steps };
          } else {
            // No code blocks at all - write response as output file
            plan = { reasoning: 'Direct output', steps: [{ action: 'write_file', description: 'Write output', params: { path: 'output.md', content: resp.content } }] };
          }
        }

        const codingTask = this.codingEngine.createTask(desc, 'project-' + task.id.slice(0, 8));
        await this.codingEngine.executePlan(plan, codingTask);

        const failedSteps = codingTask.results.filter(r => !r.success);
        const wroteFiles = codingTask.results.some(r => r.success && r.action === 'write_file');
        task.result = codingTask.output;
        // If we wrote files successfully, task is essentially done (run might fail due to env issues)
        if (wroteFiles && failedSteps.length < codingTask.results.length) {
          task.status = 'completed';
          if (failedSteps.length > 0) task.result += '\n[Warning: some run steps failed but code was written successfully]';
        } else {
          task.status = 'failed';
          task.error = 'Coding steps failed: ' + failedSteps.map(r => r.output.slice(0, 100)).join('; ');
        }
        task.completedAt = new Date().toISOString();
        agent.status = task.status === 'completed' ? 'completed' : 'failed';
        this.addSummary(agent, task, task.status === 'completed' ? 'completed' : 'failed');
        this.emit('task_update', { task, pid: this.project.id });
        this.emit('coding_completed', { taskId: task.id, codingTask });
        if (task.status === 'completed') return;
        throw new Error(task.error);

      } catch (error: any) {
        if (error instanceof QuotaExhaustedError) {
          const failRes = this.poolManager.markKeyFailed(provider.id, error.keyId);
          if (failRes === 'provider_exhausted') {
            const nm = this.selectBestModel('code', provider.id);
            if (nm) { provider = nm.provider; apiKey = nm.apiKey; model = nm.model; task.assignedModel = nm.model.id; agent.modelId = nm.model.id; agent.providerId = nm.provider.id; continue; }
          }
          const nk = this.poolManager.getNextApiKey(provider.id);
          if (nk) { apiKey = nk; continue; }
          // Try different provider
          const nm = this.selectBestModel('code', provider.id);
          if (nm) { provider = nm.provider; apiKey = nm.apiKey; model = nm.model; task.assignedModel = nm.model.id; agent.modelId = nm.model.id; continue; }
        }

        // Non-quota error: ask orchestrator what to do
        const ev = await this.evaluateFailure(task, error.message);
        if (ev === 'switch_model') {
          const nm = this.selectBestModel('code', provider.id);
          if (nm) { provider = nm.provider; apiKey = nm.apiKey; model = nm.model; task.assignedModel = nm.model.id; agent.modelId = nm.model.id; agent.providerId = nm.provider.id; task.status = 'retrying'; continue; }
        }
        if (ev === 'retry') { task.status = 'retrying'; continue; }
        // abort
        task.status = 'failed'; task.error = error.message; agent.status = 'failed';
        this.addIssue(agent.id, agent.name, error.message, 'high');
        this.addSummary(agent, task, 'failed');
        this.emit('task_update', { task, pid: this.project.id });
        return;
      }
    }
    // Exhausted attempts
    task.status = 'failed'; task.error = task.error || 'Max attempts exhausted'; agent.status = 'failed';
    this.addSummary(agent, task, 'failed');
    this.emit('task_update', { task, pid: this.project.id });
  }

  private async runWithRetry(task: SubAgentTask, agent: SubAgent, initialProv: Provider, initialKey: any, desc: string): Promise<void> {
    let provider = initialProv, apiKey = initialKey;

    while (task.attempts < task.maxAttempts) {
      task.attempts++;
      task.updatedAt = new Date().toISOString();
      this.emit('task_update', { task, pid: this.project.id });

      try {
        const ctx = this.buildContext();
        const resp = await LLMClient.chatCompletion(provider, apiKey, {
          messages: [
            { role: 'system', content: SUBAGENT_SYSTEM_PROMPT + (ctx ? '\n\nContext:\n' + ctx : '') },
            { role: 'user', content: desc },
          ],
          model: this.getModelIdForAgent(task.assignedModel),
          temperature: 0.3, maxTokens: 4096,
        });

        if (!resp.content || resp.content.trim().length < 10) {
          throw new Error('Empty or too short response (length=' + (resp.content?.length || 0) + ')');
        }

        task.result = resp.content;
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        agent.status = 'completed';
        this.addSummary(agent, task, 'completed');
        this.emit('task_update', { task, pid: this.project.id });
        return;

      } catch (error: any) {
        console.error('[Orchestrator] Subtask attempt', task.attempts, 'failed:', error.message);

        if (error instanceof QuotaExhaustedError) {
          const failRes = this.poolManager.markKeyFailed(provider.id, error.keyId);
          if (failRes === 'provider_exhausted') {
            const nm = this.selectBestModel('general', provider.id);
            if (nm) { provider = nm.provider; apiKey = nm.apiKey; task.assignedModel = nm.model.id; agent.modelId = nm.model.id; agent.providerId = nm.provider.id; continue; }
          }
          const nk = this.poolManager.getNextApiKey(provider.id);
          if (nk) { apiKey = nk; continue; }
          const nm = this.selectBestModel('general', provider.id);
          if (nm) { provider = nm.provider; apiKey = nm.apiKey; task.assignedModel = nm.model.id; agent.modelId = nm.model.id; continue; }
        }

        // Non-quota error: evaluate via orchestrator
        const ev = await this.evaluateFailure(task, error.message);
        if (ev === 'switch_model') {
          const nm = this.selectBestModel('general', provider.id);
          if (nm) {
            provider = nm.provider; apiKey = nm.apiKey;
            task.assignedModel = nm.model.id;
            agent.modelId = nm.model.id; agent.providerId = nm.provider.id;
            task.status = 'retrying';
            continue;
          }
        }
        if (ev === 'retry') { task.status = 'retrying'; continue; }

        // abort
        task.status = 'failed'; task.error = error.message; agent.status = 'failed';
        this.addIssue(agent.id, agent.name, error.message, 'high');
        this.addSummary(agent, task, 'failed');
        this.emit('task_update', { task, pid: this.project.id });
        return;
      }
    }

    // Exhausted all attempts
    task.status = 'failed';
    task.error = task.error || 'Max attempts (' + task.maxAttempts + ') exhausted';
    agent.status = 'failed';
    this.addSummary(agent, task, 'failed');
    this.emit('task_update', { task, pid: this.project.id });
  }

  private async evaluateFailure(task: SubAgentTask, errorMsg: string): Promise<string> {
    try {
      const resp = await this.callOrchestrator(buildFailureEvalPrompt(task.description, this.getModelIdForAgent(task.assignedModel), errorMsg, task.attempts));
      const d = resp.trim().toLowerCase();
      if (d.includes('switch')) return 'switch_model';
      if (d.includes('abort')) return 'abort';
      return 'retry';
    } catch {
      return task.attempts < task.maxAttempts ? 'retry' : 'abort';
    }
  }

  private selectBestModel(taskType: string, excludeProv?: string): {model: Model; provider: Provider; apiKey: any} | null {
    let ms = this.poolManager.getAvailableModels('llm');
    if (!ms.length) return null;
    if (excludeProv) ms = ms.filter(m => m.providerId !== excludeProv);
    if (!ms.length) return null;
    const scored = ms.map(m => ({
      model: m,
      score: ModelCapabilityScorer.computeSelectionScore(m.capabilities, this.preferences.costEfficiencyRatio, taskType as any),
    }));
    scored.sort((a, b) => b.score - a.score);
    for (const { model } of scored) {
      const f = this.poolManager.findProviderForModel(model.id);
      if (f) return f;
    }
    return null;
  }

  private createSubAgent(modelId: string, providerId: string): SubAgent {
    const a: SubAgent = {
      id: uuid(), name: 'Agent-' + (this.project.orchestratorState.subAgents.length + 1),
      modelId, providerId, status: 'idle', tasks: [], createdAt: new Date().toISOString(),
    };
    this.project.orchestratorState.subAgents.push(a);
    return a;
  }

  private buildContext(): string {
    const issues = this.project.issueLibrary.filter(i => !i.resolved).slice(-10);
    const done = this.project.completedAgents.slice(-5);
    let ctx = '';
    if (this.extensionManager) {
      const mcpCtx = this.extensionManager.buildMcpContext();
      if (mcpCtx) ctx += mcpCtx;
      const skillCtx = this.extensionManager.buildSkillContext();
      if (skillCtx) ctx += skillCtx;
    }
    if (issues.length) {
      ctx += 'Known issues:\n';
      issues.forEach(i => { ctx += '- [' + i.severity + '] ' + i.description + '\n'; });
    }
    if (done.length) {
      ctx += 'Recent completed work:\n';
      done.forEach(a => { ctx += '- ' + a.name + ': ' + a.summary.slice(0, 200) + '\n'; });
    }
    return ctx;
  }

  private async callOrchestrator(prompt: string): Promise<string> {
    const m = this.getOrchestratorModel();
    if (!m) throw new Error('No orchestrator model available');
    const tp = buildThinkingPrefix(this.preferences.thinkingMode);
    const resp = await LLMClient.chatCompletion(m.provider, m.apiKey, {
      messages: [
        { role: 'system', content: tp + ORCHESTRATOR_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      model: this.getModelIdForAgent(m.model.id),
      temperature: 0.2, maxTokens: 4096,
    });
    return resp.content;
  }

  private getOrchestratorModel(): {provider: Provider; model: Model; apiKey: any} | null {
    const id = this.preferences.defaultOrchestratorModel || this.project.orchestratorState.defaultModelId;
    if (id) {
      const f = this.poolManager.findProviderForModel(id);
      if (f) return f;
    }
    const ms = this.poolManager.getAvailableModels('llm');
    if (ms.length) return this.poolManager.findProviderForModel(ms[0].id);
    return null;
  }

  private getModelIdForAgent(assignedModel: string): string {
    const found = this.poolManager.findModel(assignedModel);
    return found ? found.model.modelId : assignedModel;
  }

  private addIssue(agentId: string, agentName: string, desc: string, sev: string): void {
    this.project.issueLibrary.push({
      id: uuid(), agentId, agentName, description: desc,
      severity: sev as any, resolved: false, timestamp: new Date().toISOString(),
    });
    if (this.project.issueLibrary.length > 50) {
      this.project.issueLibrary = this.project.issueLibrary.slice(-50);
    }
    this.emit('issue_created', { pid: this.project.id });
  }

  private addSummary(a: SubAgent, t: SubAgentTask, o: 'completed' | 'failed'): void {
    const s = {
      id: uuid(), agentId: a.id, name: a.name, modelId: a.modelId,
      taskDescription: t.description, outcome: o,
      summary: t.result || t.error || '', issues: [] as string[],
      duration: t.completedAt ? new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime() : 0,
      timestamp: new Date().toISOString(),
    };
    if (o === 'completed') {
      this.project.completedAgents.push(s);
      if (this.project.completedAgents.length > 20) this.project.completedAgents = this.project.completedAgents.slice(-20);
    } else {
      this.project.pendingAgents.push(s);
    }
  }

  private async aggregateResults(): Promise<string> {
    const done = this.project.orchestratorState.tasks.filter(t => t.status === 'completed');
    if (!done.length) return 'All tasks failed. Please review the issue library for details.';
    try {
      return await this.callOrchestrator(buildAggregationPrompt(
        this.project.initialTask,
        done.map(t => ({ description: t.description, result: t.result || '' }))
      ));
    } catch {
      return done.map(t => '## ' + t.description + '\n' + (t.result || '')).join('\n\n---\n\n');
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.project.orchestratorState.status = 'failed';
  }

  getProject(): Project { return this.project; }
}


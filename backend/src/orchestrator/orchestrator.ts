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
      this.project.orchestratorState.status = 'completed';
      this.emit('orchestrator_update', { status: 'completed', result });
    } catch (e: any) {
      this.project.orchestratorState.status = 'failed';
      this.emit('error', { message: e.message });
    }
  }

  private async decomposeTask(): Promise<Array<{description: string; taskType: string; priority: number}>> {
    const m = this.getOrchestratorModel();
    if (!m) throw new Error('No orchestrator model available');
    const resp = await this.callOrchestrator(buildDecompositionPrompt(this.project.initialTask, this.preferences.costEfficiencyRatio));
    try { const jm = resp.match(/\[[\s\S]*\]/); if (!jm) throw new Error(); return JSON.parse(jm[0]); }
    catch { return [{ description: this.project.initialTask, taskType: 'general', priority: 1 }]; }
  }

  private async executeSubtask(st: {description: string; taskType: string; priority: number}): Promise<void> {
    const taskId = uuid();
    const task: SubAgentTask = { id: taskId, agentId: '', description: st.description, assignedModel: '', status: 'pending', attempts: 0, maxAttempts: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.project.orchestratorState.tasks.push(task);
    this.emit('task_update', { task, pid: this.project.id });

    const sel = this.selectBestModel(st.taskType);
    if (!sel) { task.status = 'failed'; task.error = 'No model available'; this.addIssue('system', 'system', task.error, 'critical'); return; }

    const agent = this.createSubAgent(sel.model.id, sel.provider.id);
    task.agentId = agent.id; task.assignedModel = sel.model.id; task.status = 'running';
    agent.status = 'working'; agent.currentTask = taskId;
    this.emit('agent_update', { agent, pid: this.project.id });
    this.emit('task_update', { task, pid: this.project.id });

    // Code tasks use the coding engine (file ops + shell)
    if (st.taskType === 'code') {
      await this.executeCodingSubtask(task, agent, sel.provider, sel.apiKey, sel.model, st.description);
    } else {
      await this.runWithRetry(task, agent, sel.provider, sel.apiKey, st.description);
    }
  }

  // Execute a coding subtask using the coding engine
  private async executeCodingSubtask(task: SubAgentTask, agent: SubAgent, provider: Provider, apiKey: any, model: Model, desc: string): Promise<void> {
    task.attempts++;
    this.emit('task_update', { task, pid: this.project.id });

    try {
      // Use coding sub-agent to generate plan
      const ctx = this.buildContext();
      const resp = await LLMClient.chatCompletion(provider, apiKey, {
        messages: [
          { role: 'system', content: CODING_SUBAGENT_PROMPT + (ctx ? '\n\nContext:\n' + ctx : '') },
          { role: 'user', content: 'Task: ' + desc + '\nProject base: ' + this.codingEngine.getBasePath() },
        ],
        model: model.modelId, temperature: 0.2, maxTokens: 4096,
      });

      // Parse the plan from response
      let plan;
      try {
        const jm = resp.content.match(/\{[\s\S]*"steps"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
        if (!jm) throw new Error('No JSON plan');
        plan = JSON.parse(jm[0]);
      } catch {
        plan = { reasoning: 'Direct output', steps: [{ action: 'write_file', description: 'Write output', params: { path: 'output.md', content: resp.content } }] };
      }

      // Execute the plan using coding engine
      const codingTask = this.codingEngine.createTask(desc, 'project-' + task.id.slice(0, 8));
      await this.codingEngine.executePlan(plan, codingTask);

      // Report results
      task.result = codingTask.output;
      task.status = codingTask.status === 'completed' ? 'completed' : 'failed';
      if (task.status === 'failed') task.error = 'Some coding steps failed';
      task.completedAt = new Date().toISOString();
      agent.status = task.status === 'completed' ? 'completed' : 'failed';

      this.addSummary(agent, task, task.status === 'completed' ? 'completed' : 'failed');
      this.emit('task_update', { task, pid: this.project.id });
      this.emit('coding_completed', { taskId: task.id, codingTask });
    } catch (error: any) {
      task.status = 'failed'; task.error = error.message; agent.status = 'failed';
      this.addIssue(agent.id, agent.name, error.message, 'high');
      this.addSummary(agent, task, 'failed');
      this.emit('task_update', { task, pid: this.project.id });
    }
  }

  private async runWithRetry(task: SubAgentTask, agent: SubAgent, prov: Provider, key: any, desc: string): Promise<void> {
    let provider = prov, apiKey = key;
    while (task.attempts < task.maxAttempts) {
      task.attempts++; task.updatedAt = new Date().toISOString();
      this.emit('task_update', { task, pid: this.project.id });
      try {
        const ctx = this.buildContext();
        const resp = await LLMClient.chatCompletion(provider, apiKey, {
          messages: [{ role: 'system', content: SUBAGENT_SYSTEM_PROMPT + (ctx ? '\n\nContext:\n' + ctx : '') }, { role: 'user', content: desc }],
          model: task.assignedModel, temperature: 0.3, maxTokens: 4096,
        });
        task.result = resp.content; task.status = 'completed'; task.completedAt = new Date().toISOString();
        agent.status = 'completed'; this.addSummary(agent, task, 'completed');
        this.emit('task_update', { task, pid: this.project.id });
        return;
      } catch (error: any) {
        if (error instanceof QuotaExhaustedError) {
          const res = this.poolManager.markKeyFailed(provider.id, error.keyId);
          if (res === 'provider_exhausted') {
            const nm = this.selectBestModel('general', provider.id);
            if (nm) { provider = nm.provider; apiKey = nm.apiKey; task.assignedModel = nm.model.id; agent.modelId = nm.model.id; agent.providerId = nm.provider.id; continue; }
          }
          const nk = this.poolManager.getNextApiKey(provider.id);
          if (nk) { apiKey = nk; continue; }
        }
        const ev = await this.evaluateFailure(task, error.message);
        if (ev === 'switch_model') {
          const nm = this.selectBestModel('general', provider.id);
          if (nm) { provider = nm.provider; apiKey = nm.apiKey; task.assignedModel = nm.model.id; agent.modelId = nm.model.id; agent.providerId = nm.provider.id; task.status = 'retrying'; continue; }
        }
        if (ev === 'retry') { task.status = 'retrying'; continue; }
        task.status = 'failed'; task.error = error.message; agent.status = 'failed';
        this.addIssue(agent.id, agent.name, error.message, 'high');
        this.addSummary(agent, task, 'failed');
        this.emit('task_update', { task, pid: this.project.id });
        return;
      }
    }
  }

  private async evaluateFailure(task: SubAgentTask, errorMsg: string): Promise<string> {
    try {
      const resp = await this.callOrchestrator(buildFailureEvalPrompt(task.description, task.assignedModel, errorMsg, task.attempts));
      const d = resp.trim().toLowerCase();
      if (d.includes('switch')) return 'switch_model';
      if (d.includes('abort')) return 'abort';
      return 'retry';
    } catch { return task.attempts < task.maxAttempts ? 'retry' : 'abort'; }
  }

  private selectBestModel(taskType: string, excludeProv?: string): {model: Model; provider: Provider; apiKey: any} | null {
    let ms = this.poolManager.getAvailableModels('llm');
    if (!ms.length) return null;
    if (excludeProv) ms = ms.filter(m => m.providerId !== excludeProv);
    if (!ms.length) return null;
    const scored = ms.map(m => ({ model: m, score: ModelCapabilityScorer.computeSelectionScore(m.capabilities, this.preferences.costEfficiencyRatio, taskType as any) }));
    scored.sort((a, b) => b.score - a.score);
    for (const { model } of scored) { const f = this.poolManager.findProviderForModel(model.id); if (f) return f; }
    return null;
  }

  private createSubAgent(modelId: string, providerId: string): SubAgent {
    const a: SubAgent = { id: uuid(), name: 'Agent-' + (this.project.orchestratorState.subAgents.length + 1), modelId, providerId, status: 'idle', tasks: [], createdAt: new Date().toISOString() };
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
    if (issues.length) { ctx += 'Known issues:\n'; issues.forEach(i => ctx += '- [' + i.severity + '] ' + i.description + '\n'); }
    if (done.length) { ctx += 'Recent work:\n'; done.forEach(a => ctx += '- ' + a.name + ': ' + a.summary + '\n'); }
    return ctx;
  }

  private async callOrchestrator(prompt: string): Promise<string> {
    const m = this.getOrchestratorModel();
    if (!m) throw new Error('No orchestrator model available');
    const tp = buildThinkingPrefix(this.preferences.thinkingMode);
    const resp = await LLMClient.chatCompletion(m.provider, m.apiKey, {
      messages: [{ role: 'system', content: tp + ORCHESTRATOR_SYSTEM_PROMPT }, { role: 'user', content: prompt }],
      model: m.model.modelId, temperature: 0.2, maxTokens: 4096,
    });
    return resp.content;
  }

  private getOrchestratorModel(): {provider: Provider; model: Model; apiKey: any} | null {
    const id = this.preferences.defaultOrchestratorModel || this.project.orchestratorState.defaultModelId;
    if (id) { const f = this.poolManager.findProviderForModel(id); if (f) return f; }
    const ms = this.poolManager.getAvailableModels('llm');
    return ms.length ? this.poolManager.findProviderForModel(ms[0].id) : null;
  }

  private addIssue(agentId: string, agentName: string, desc: string, sev: string): void {
    this.project.issueLibrary.push({ id: uuid(), agentId, agentName, description: desc, severity: sev as any, resolved: false, timestamp: new Date().toISOString() });
    if (this.project.issueLibrary.length > 50) this.project.issueLibrary = this.project.issueLibrary.slice(-50);
    this.emit('issue_created', { pid: this.project.id });
  }

  private addSummary(a: SubAgent, t: SubAgentTask, o: 'completed' | 'failed'): void {
    const s = { id: uuid(), agentId: a.id, name: a.name, modelId: a.modelId, taskDescription: t.description, outcome: o, summary: t.result || t.error || '', issues: [] as string[], duration: t.completedAt ? new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime() : 0, timestamp: new Date().toISOString() };
    if (o === 'completed') { this.project.completedAgents.push(s); if (this.project.completedAgents.length > 20) this.project.completedAgents = this.project.completedAgents.slice(-20); }
    else { this.project.pendingAgents.push(s); }
  }

  private async aggregateResults(): Promise<string> {
    const done = this.project.orchestratorState.tasks.filter(t => t.status === 'completed');
    if (!done.length) return 'All tasks failed.';
    try {
      return await this.callOrchestrator(buildAggregationPrompt(this.project.initialTask, done.map(t => ({ description: t.description, result: t.result || '' }))));
    } catch { return done.map(t => t.result).join('\n\n'); }
  }

  abort(): void { this.abortController?.abort(); this.project.orchestratorState.status = 'failed'; }
  getProject(): Project { return this.project; }
}

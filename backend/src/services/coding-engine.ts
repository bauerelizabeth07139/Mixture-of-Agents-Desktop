import { v4 as uuid } from 'uuid';
import { Provider, Model, ApiKeyEntry } from '../types';
import { LLMClient } from './llm-client';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface CodingTask {
  id: string; description: string; projectPath: string;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  plan: CodingStep[]; currentStep: number; results: CodingStepResult[];
  output: string; createdAt: string;
}

export interface CodingStep {
  id: string; action: 'read_file' | 'write_file' | 'edit_file' | 'run_command' | 'create_project' | 'install_deps';
  description: string; params: Record<string, any>; status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

export interface CodingStepResult {
  stepId: string; action: string; success: boolean; output: string; duration: number;
}

export interface CodingPlan {
  steps: Array<{ action: string; description: string; params: Record<string, any> }>; reasoning: string;
}

const CODING_PROMPT = `You are an automated coding agent. Given a task, respond with a JSON plan:
{"reasoning":"brief explanation","steps":[{"action":"create_project|write_file|edit_file|run_command|install_deps|read_file","description":"what this does","params":{"path":"file/path","content":"full content","command":"cmd","old":"find","new":"replace","manager":"npm|pip","packages":["pkg"]}}]}
Rules: complete working code, error handling, best practices, test at the end.`;

export class CodingEngine {
  private basePath: string;
  constructor(basePath: string) { this.basePath = basePath; }

  getBasePath(): string { return this.basePath; }

  async planTask(description: string, provider: Provider, apiKey: ApiKeyEntry, model: Model): Promise<CodingPlan> {
    const resp = await LLMClient.chatCompletion(provider, apiKey, {
      messages: [{ role: 'system', content: CODING_PROMPT }, { role: 'user', content: 'Task: ' + description + '\nBase: ' + this.basePath }],
      model: model.modelId, temperature: 0.2, maxTokens: 4096,
    });
    try {
      const jm = resp.content.match(/\{[\s\S]*"steps"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
      if (!jm) throw new Error('No JSON');
      return JSON.parse(jm[0]);
    } catch {
      return { reasoning: 'Direct write', steps: [{ action: 'write_file', description: 'Write code', params: { path: 'output.txt', content: resp.content } }] };
    }
  }

  async executePlan(plan: CodingPlan, task: CodingTask): Promise<CodingTask> {
    task.status = 'executing';
    task.plan = plan.steps.map(s => ({ id: uuid(), action: s.action as any, description: s.description, params: s.params, status: 'pending' as const }));
    for (let i = 0; i < task.plan.length; i++) {
      const step = task.plan[i]; task.currentStep = i; step.status = 'running';
      const start = Date.now();
      try {
        const r = await this.execStep(step, task.projectPath);
        step.status = r.success ? 'completed' : 'failed';
        task.results.push({ stepId: step.id, action: step.action, success: r.success, output: r.output, duration: Date.now() - start });
      } catch (e: any) {
        step.status = 'failed';
        task.results.push({ stepId: step.id, action: step.action, success: false, output: e.message, duration: Date.now() - start });
      }
    }
    task.status = task.results.every(r => r.success) ? 'completed' : 'failed';
    task.output = task.results.map(r => (r.success ? 'OK' : 'FAIL') + ' ' + r.action + ': ' + r.output.slice(0, 200)).join('\n');
    return task;
  }

  private async execStep(step: CodingStep, projectPath: string): Promise<{success: boolean; output: string}> {
    const p = step.params;
    switch (step.action) {
      case 'create_project': { const d = path.resolve(this.basePath, p.path||''); fs.mkdirSync(d,{recursive:true}); return {success:true,output:'Created: '+d}; }
      case 'write_file': { const f = path.resolve(this.basePath, p.path); fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f, p.content||'', 'utf8'); return {success:true,output:'Written: '+p.path+' ('+((p.content||'').length)+' bytes)'}; }
      case 'edit_file': { const f = path.resolve(this.basePath, p.path); if(!fs.existsSync(f)) return {success:false,output:'Not found: '+p.path}; let c = fs.readFileSync(f,'utf8'); if(!c.includes(p.old)) return {success:false,output:'Pattern not found'}; c = c.replace(p.old, p.new); fs.writeFileSync(f,c,'utf8'); return {success:true,output:'Edited: '+p.path}; }
      case 'run_command': { const wd = p.workdir ? path.resolve(this.basePath, p.workdir) : projectPath; try { const o = execSync(p.command, {cwd:wd,timeout:30000,encoding:'utf8',stdio:['pipe','pipe','pipe'],shell:'powershell.exe'}); return {success:true,output:(o||'').slice(0,1000)}; } catch(e:any) { return {success:false,output:(e.stderr||e.message||'').slice(0,500)}; } }
      case 'install_deps': { const wd = p.workdir ? path.resolve(this.basePath, p.workdir) : projectPath; const m = p.manager||'npm'; const pkgs = Array.isArray(p.packages)?p.packages.join(' '):''; try { execSync(m+' install '+pkgs,{cwd:wd,timeout:60000,encoding:'utf8',shell:'powershell.exe'}); return {success:true,output:'Installed: '+pkgs}; } catch(e:any) { return {success:false,output:(e.stderr||e.message||'').slice(0,500)}; } }
      case 'read_file': { const f = path.resolve(this.basePath, p.path); if(!fs.existsSync(f)) return {success:false,output:'Not found: '+p.path}; return {success:true,output:fs.readFileSync(f,'utf8').slice(0,1000)}; }
      default: return {success:false,output:'Unknown: '+step.action};
    }
  }

  createTask(description: string, projectPath: string): CodingTask {
    return { id: uuid(), description, projectPath: path.resolve(this.basePath, projectPath), status: 'planning', plan: [], currentStep: 0, results: [], output: '', createdAt: new Date().toISOString() };
  }
}

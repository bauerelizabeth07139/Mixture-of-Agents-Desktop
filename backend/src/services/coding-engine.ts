import { v4 as uuid } from 'uuid';
import { Provider, Model, ApiKeyEntry } from '../types';
import { LLMClient } from './llm-client';
import fs from 'fs';
import path from 'path';
import { execSync, exec as execCb } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(execCb);

export interface CodingTask {
  id: string; description: string; projectPath: string;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  plan: CodingStep[]; currentStep: number; results: CodingStepResult[];
  output: string; createdAt: string;
}
export interface CodingStep {
  id: string; action: 'read_file' | 'write_file' | 'edit_file' | 'run_command' | 'create_project' | 'install_deps' | 'list_dir' | 'append_file' | 'delete_file' | 'move_file' | 'check_exists';
  description: string; params: Record<string, any>; status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

export interface CodingStepResult {
  stepId: string; action: string; success: boolean; output: string; duration: number;
}

export interface CodingPlan {
  steps: Array<{ action: string; description: string; params: Record<string, any> }>; reasoning: string;
}

const CODING_PROMPT = `You are an automated coding agent with FULL access to the local machine. Given a task, respond with a JSON plan:
{"reasoning":"brief explanation","steps":[{"action":"create_project|write_file|edit_file|run_command|install_deps|read_file|list_dir|append_file|delete_file|move_file|check_exists","description":"what this does","params":{"path":"file/path","content":"full content","command":"cmd","old":"find","new":"replace","newPath":"dest","manager":"npm|pip|cargo","packages":["pkg"],"workdir":"subdir","timeout":60000}}]}
Rules:
- Write COMPLETE code that runs without modification
- Include all imports and setup
- For multi-file projects, create each file separately
- You have FULL access: shell, filesystem, npm, python, git, docker, etc.
- Use run_command to install deps, compile, test, run servers
- Use write_file to create any file in the workspace
- Use read_file to inspect existing code before editing
- After writing code, ALWAYS add a run_command step to verify it works
- If a step fails, read the error and fix it in the next step
- Use install_deps for package managers (npm, pip, cargo)
- Complete working code, error handling, best practices`;

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
      case 'write_file': { const wf = path.resolve(this.basePath, p.path); fs.mkdirSync(path.dirname(wf),{recursive:true}); fs.writeFileSync(wf, p.content||'', 'utf8'); return {success:true,output:'Written: '+p.path+' ('+((p.content||'').length)+' bytes)'}; }
      case 'edit_file': { const ef = path.resolve(this.basePath, p.path); if(!fs.existsSync(ef)) return {success:false,output:'Not found: '+p.path}; let c = fs.readFileSync(ef,'utf8'); if(!c.includes(p.old)) return {success:false,output:'Pattern not found in '+p.path}; c = c.replace(p.old, p.new); fs.writeFileSync(ef,c,'utf8'); return {success:true,output:'Edited: '+p.path}; }
      case 'run_command': { const wd = p.workdir ? path.resolve(this.basePath, p.workdir) : projectPath; fs.mkdirSync(wd, {recursive:true}); try { const o = execSync(p.command, {cwd:wd,timeout:Math.min(p.timeout||60000,120000),encoding:'utf8',stdio:['pipe','pipe','pipe'],shell:'powershell.exe',env:{...process.env,FORCE_COLOR:'0'}}); return {success:true,output:(o||'').slice(0,4000)}; } catch(e:any) { return {success:false,output:((e.stdout||'')+'\\n'+(e.stderr||e.message||'')).slice(0,4000)}; } }
      case 'install_deps': { const wd = p.workdir ? path.resolve(this.basePath, p.workdir) : projectPath; fs.mkdirSync(wd, {recursive:true}); const m = p.manager||'npm'; const pkgs = Array.isArray(p.packages)?p.packages.join(' '):''; try { execSync(m+' install '+pkgs,{cwd:wd,timeout:120000,encoding:'utf8',shell:'powershell.exe',env:{...process.env,FORCE_COLOR:'0'}}); return {success:true,output:'Installed: '+pkgs}; } catch(e:any) { return {success:false,output:((e.stdout||'')+'\\n'+(e.stderr||e.message||'')).slice(0,4000)}; } }
      case 'read_file': { const rf = path.resolve(this.basePath, p.path); if(!fs.existsSync(rf)) return {success:false,output:'Not found: '+p.path}; const content=fs.readFileSync(rf,'utf8'); return {success:true,output:content.slice(0,8000)+(content.length>8000?'\\n... [truncated '+content.length+' total chars]':'')}; }
      case 'list_dir': { const d = p.path ? path.resolve(this.basePath, p.path) : projectPath; if(!fs.existsSync(d)) return {success:false,output:'Not found: '+d}; const entries=fs.readdirSync(d,{withFileTypes:true}); const listing=entries.map(e=>(e.isDirectory()?'[DIR] ':'     ')+e.name).join('\\n'); return {success:true,output:listing.slice(0,4000)}; }
      case 'append_file': { const f = path.resolve(this.basePath, p.path); fs.mkdirSync(path.dirname(f),{recursive:true}); fs.appendFileSync(f, p.content||'', 'utf8'); return {success:true,output:'Appended to: '+p.path}; }
      case 'delete_file': { const f = path.resolve(this.basePath, p.path); if(!fs.existsSync(f)) return {success:false,output:'Not found: '+p.path}; fs.unlinkSync(f); return {success:true,output:'Deleted: '+p.path}; }
      case 'move_file': { const src = path.resolve(this.basePath, p.path); const dst = path.resolve(this.basePath, p.newPath||p.new); if(!fs.existsSync(src)) return {success:false,output:'Source not found: '+p.path}; fs.renameSync(src, dst); return {success:true,output:'Moved: '+p.path+' -> '+(p.newPath||p.new)}; }
      case 'check_exists': { const f = path.resolve(this.basePath, p.path); return {success:true,output:fs.existsSync(f)?'EXISTS':'NOT_FOUND'}; }
      default: return {success:false,output:'Unknown action: '+step.action+'. Available: read_file, write_file, edit_file, run_command, create_project, install_deps, list_dir, append_file, delete_file, move_file, check_exists'};
    }
  }

  createTask(description: string, projectPath: string): CodingTask {
    return { id: uuid(), description, projectPath: path.resolve(this.basePath, projectPath), status: 'planning', plan: [], currentStep: 0, results: [], output: '', createdAt: new Date().toISOString() };
  }
}

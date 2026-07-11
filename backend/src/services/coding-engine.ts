import { v4 as uuid } from 'uuid';
import { Provider, Model, ApiKeyEntry } from '../types';
import { LLMClient } from './llm-client';
import fs from 'fs';
import path from 'path';
import os from 'os';
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
- IMPORTANT: The system runs on Windows. Use Windows-compatible commands:
  - Use "npm init -y" (not "npm init --yes")
  - Use "mkdir name" (not "mkdir -p name")
  - Do NOT use bash operators like && or ; - put each command as a separate step
  - Use "cd" separately after mkdir
  - Use "node script.js" instead of "bash script.sh"
  - Use PowerShell-compatible syntax when needed
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
    // Track current working directory across steps
    let currentWorkDir = task.projectPath;
    for (let i = 0; i < task.plan.length; i++) {
      const step = task.plan[i]; task.currentStep = i; step.status = 'running';
      const start = Date.now();
      try {
        const r = await this.execStep(step, task.projectPath, currentWorkDir);
        // Track cd commands
        if (step.action === 'run_command' && r.success) {
          const cmd = step.params.command?.trim();
          if (cmd && /^cd\s+(.+)/i.test(cmd)) {
            const target = cmd.replace(/^cd\s+/i, '').trim();
            currentWorkDir = path.resolve(currentWorkDir, target);
          }
        }
        step.status = r.success ? 'completed' : 'failed';
        task.results.push({ stepId: step.id, action: step.action, success: r.success, output: r.output, duration: Date.now() - start });
      } catch (e: any) {
        step.status = 'failed';
        task.results.push({ stepId: step.id, action: step.action, success: false, output: e.message, duration: Date.now() - start });
      }
    }
    task.status = task.results.every(r => r.success) ? 'completed' : 'failed';
    task.output = task.results.map(r => (r.success ? '?' : '?') + ' ' + r.action + ': ' + r.output.slice(0, 200)).join('\n');
    return task;
  }

  private getEnv(): NodeJS.ProcessEnv {
    const extra = process.platform === 'win32'
      ? [
          path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python38'),
          path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python312'),
          path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python311'),
          'C:\\Program Files\\nodejs',
          'C:\\node20b\\node-v20.15.1-win-x64',
          'C:\\Program Files\\Git\\cmd',
          ...((process as any).resourcesPath ? [(process as any).resourcesPath] : []),
        ].join(path.delimiter) + path.delimiter
      : '/usr/local/bin:/usr/bin:';
    return { ...process.env, FORCE_COLOR: '0', NODE_NO_WARNINGS: '1', PATH: extra + (process.env.PATH || '') };
  }

  /** Convert bash command to PowerShell-compatible command */
  private convertBashToPS(cmd: string): string {
    if (process.platform !== 'win32') return cmd;
    
    // Already a PowerShell command - leave it
    if (/^(powershell|cmd\.exe|Get-|Set-|New-|Remove-|Copy-|Move-|Write-|Import-|Export-)/i.test(cmd)) return cmd;
    
    // npm/node/python etc work fine on Windows, keep as-is
    if (/^(node |python |npm |npx |pip |git |cargo |rustc |java |javac |go |docker |tsc |yarn |pnpm )/i.test(cmd)) return cmd;
    
    // Convert bash builtins
    let c = cmd;
    c = c.replace(/^mkdir\s+-p\s+/i, 'New-Item -ItemType Directory -Force -Path ');
    c = c.replace(/^mkdir\s+/i, 'New-Item -ItemType Directory -Path ');
    c = c.replace(/^rm\s+-rf\s+/i, 'Remove-Item -Recurse -Force -LiteralPath ');
    c = c.replace(/^rm\s+-f\s+/i, 'Remove-Item -Force -LiteralPath ');
    c = c.replace(/^rm\s+/i, 'Remove-Item -LiteralPath ');
    c = c.replace(/^cat\s+/i, 'Get-Content ');
    c = c.replace(/^ls\s*$/i, 'Get-ChildItem');
    c = c.replace(/^ls\s+/i, 'Get-ChildItem ');
    c = c.replace(/^touch\s+/i, 'New-Item -ItemType File -Force -Path ');
    c = c.replace(/^cp\s+/i, 'Copy-Item ');
    c = c.replace(/^mv\s+/i, 'Move-Item ');
    c = c.replace(/^chmod\s+\+x\s+/i, '# chmod not needed on Windows: ');
    c = c.replace(/^echo\s+"([^"]+)"\s*>\s*(.+)/i, 'Set-Content -Path $2 -Value "$1"');
    c = c.replace(/^echo\s+'([^']+)'\s*>\s*(.+)/i, "Set-Content -Path $2 -Value '$1'");
    c = c.replace(/^echo\s+/i, 'Write-Host ');
    
    // Handle bash/sh script execution
    if (/^(bash |sh )/.test(c)) {
      c = 'powershell -Command "' + c.replace(/^(bash|sh)\s+/, '').replace(/"/g, '\\"') + '"';
    }
    return c;
  }

  /** Split compound commands (&&, ;) and convert each part */
  private splitAndConvertCommands(cmd: string): string[] {
    if (process.platform !== 'win32') return [cmd];
    
    // First, handle && chains
    if (cmd.includes(' && ')) {
      const parts = cmd.split(/\s*&&\s*/).map(c => c.trim()).filter(Boolean);
      return parts.map(p => this.convertBashToPS(p));
    }
    
    // Handle ; chains (but not inside strings/PowerShell)
    if (cmd.includes('; ') && !cmd.includes('powershell') && !cmd.includes('Write-Host')) {
      const parts = cmd.split(/\s*;\s*/).map(c => c.trim()).filter(Boolean);
      if (parts.length > 1) return parts.map(p => this.convertBashToPS(p));
    }
    
    return [this.convertBashToPS(cmd)];
  }

  private async execStep(step: CodingStep, projectPath: string, workDir?: string): Promise<{success: boolean; output: string}> {
    const p = step.params;
    switch (step.action) {
      case 'create_project': {
        const d = path.resolve(this.basePath, p.path || '');
        fs.mkdirSync(d, { recursive: true });
        return { success: true, output: 'Created directory: ' + d };
      }
      case 'write_file': {
        const wf = path.resolve(this.basePath, p.path);
        fs.mkdirSync(path.dirname(wf), { recursive: true });
        fs.writeFileSync(wf, p.content || '', 'utf8');
        return { success: true, output: 'Written: ' + p.path + ' (' + ((p.content || '').length) + ' bytes)' };
      }
      case 'edit_file': {
        const ef = path.resolve(this.basePath, p.path);
        if (!fs.existsSync(ef)) return { success: false, output: 'Not found: ' + p.path };
        let c = fs.readFileSync(ef, 'utf8');
        if (!c.includes(p.old)) return { success: false, output: 'Pattern not found in ' + p.path };
        c = c.replace(p.old, p.new);
        fs.writeFileSync(ef, c, 'utf8');
        return { success: true, output: 'Edited: ' + p.path };
      }
      case 'run_command': {
        const wd = p.workdir ? path.resolve(this.basePath, p.workdir) : (workDir || this.basePath);
        fs.mkdirSync(wd, { recursive: true });
        try {
          const cmds = this.splitAndConvertCommands(p.command);
          let allOutput = '';
          for (const mappedCmd of cmds) {
            // Skip pure cd commands (we track directory ourselves)
            if (/^cd\s+/i.test(mappedCmd.trim())) {
              allOutput += '[cd tracked]\n';
              continue;
            }
            const o = String(execSync(mappedCmd, {
              cwd: wd,
              timeout: Math.min(p.timeout || 60000, 120000),
              encoding: 'utf8',
              shell: 'powershell' as const,
              env: this.getEnv(),
              windowsHide: true,
            }));
            allOutput += (o || '') + '\n';
          }
          return { success: true, output: allOutput.slice(0, 4000) };
        } catch (e: any) {
          return { success: false, output: ((e.stdout || '') + '\n' + (e.stderr || e.message || '')).slice(0, 4000) };
        }
      }
      case 'install_deps': {
        const wd = p.workdir ? path.resolve(this.basePath, p.workdir) : (workDir || this.basePath);
        fs.mkdirSync(wd, { recursive: true });
        const m = p.manager || 'npm';
        const pkgs = Array.isArray(p.packages) ? p.packages.join(' ') : '';
        try {
          const cmd = m + ' install' + (pkgs ? ' ' + pkgs : '');
          execSync(cmd, {
            cwd: wd,
            timeout: 120000,
            encoding: 'utf8',
            shell: 'powershell' as const,
            env: this.getEnv(),
            windowsHide: true,
          });
          return { success: true, output: 'Installed: ' + (pkgs || '(all deps from package.json)') };
        } catch (e: any) {
          return { success: false, output: ((e.stdout || '') + '\n' + (e.stderr || e.message || '')).slice(0, 4000) };
        }
      }
      case 'read_file': {
        const rf = path.resolve(this.basePath, p.path);
        if (!fs.existsSync(rf)) return { success: false, output: 'Not found: ' + p.path };
        const content = fs.readFileSync(rf, 'utf8');
        return { success: true, output: content.slice(0, 8000) + (content.length > 8000 ? '\n... [truncated ' + content.length + ' total chars]' : '') };
      }
      case 'list_dir': {
        const d = p.path ? path.resolve(this.basePath, p.path) : projectPath;
        if (!fs.existsSync(d)) return { success: false, output: 'Not found: ' + d };
        const entries = fs.readdirSync(d, { withFileTypes: true });
        const listing = entries.map(e => (e.isDirectory() ? '[DIR] ' : '     ') + e.name).join('\n');
        return { success: true, output: listing.slice(0, 4000) };
      }
      case 'append_file': {
        const f = path.resolve(this.basePath, p.path);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.appendFileSync(f, p.content || '', 'utf8');
        return { success: true, output: 'Appended to: ' + p.path };
      }
      case 'delete_file': {
        const f = path.resolve(this.basePath, p.path);
        if (!fs.existsSync(f)) return { success: false, output: 'Not found: ' + p.path };
        fs.unlinkSync(f);
        return { success: true, output: 'Deleted: ' + p.path };
      }
      case 'move_file': {
        const src = path.resolve(this.basePath, p.path);
        const dst = path.resolve(this.basePath, p.newPath || p.new);
        if (!fs.existsSync(src)) return { success: false, output: 'Source not found: ' + p.path };
        fs.renameSync(src, dst);
        return { success: true, output: 'Moved: ' + p.path + ' -> ' + (p.newPath || p.new) };
      }
      case 'check_exists': {
        const f = path.resolve(this.basePath, p.path);
        return { success: true, output: fs.existsSync(f) ? 'EXISTS' : 'NOT_FOUND' };
      }
      default:
        return { success: false, output: 'Unknown action: ' + step.action + '. Available: read_file, write_file, edit_file, run_command, create_project, install_deps, list_dir, append_file, delete_file, move_file, check_exists' };
    }
  }

  createTask(description: string, projectPath: string): CodingTask {
    return { id: uuid(), description, projectPath: path.resolve(this.basePath, projectPath), status: 'planning', plan: [], currentStep: 0, results: [], output: '', createdAt: new Date().toISOString() };
  }
}

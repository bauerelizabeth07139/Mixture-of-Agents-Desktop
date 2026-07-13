import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

export interface RunResult {
  success: boolean;
  output: string;
  exitCode: number;
  language: string;
  compileOutput?: string;
  duration: number;
}

const EXT_MAP: Record<string, { lang: string; run: (file: string, cwd: string) => { cmd: string; compile?: string } }> = {
  '.py':   { lang: 'Python',    run: (f) => ({ cmd: `python "${f}"` }) },
  '.js':   { lang: 'JavaScript', run: (f) => ({ cmd: `node "${f}"` }) },
  '.ts':   { lang: 'TypeScript', run: (f, cwd) => {
    const tsc = path.join(cwd, 'node_modules', '.bin', 'tsc');
    return { cmd: `node "${f.replace(/\.ts$/, '.js')}"`, compile: fs.existsSync(tsc) ? `"${tsc}" "${f}"` : `npx tsc "${f}"` };
  }},
  '.c':    { lang: 'C',          run: (f, cwd) => {
    const out = f.replace(/\.c$/, '') + (process.platform === 'win32' ? '.exe' : '');
    return { cmd: `"${out}"`, compile: `gcc "${f}" -o "${out}"` };
  }},
  '.cpp':  { lang: 'C++',       run: (f, cwd) => {
    const out = f.replace(/\.cpp$/, '') + (process.platform === 'win32' ? '.exe' : '');
    return { cmd: `"${out}"`, compile: `g++ "${f}" -o "${out}"` };
  }},
  '.cc':   { lang: 'C++',       run: (f, cwd) => {
    const out = f.replace(/\.cc$/, '') + (process.platform === 'win32' ? '.exe' : '');
    return { cmd: `"${out}"`, compile: `g++ "${f}" -o "${out}"` };
  }},
  '.go':   { lang: 'Go',        run: (f) => ({ cmd: `go run "${f}"` }) },
  '.rs':   { lang: 'Rust',      run: (f, cwd) => {
    const out = f.replace(/\.rs$/, '') + (process.platform === 'win32' ? '.exe' : '');
    return { cmd: `"${out}"`, compile: `rustc "${f}" -o "${out}"` };
  }},
  '.java': { lang: 'Java',      run: (f, cwd) => {
    const cls = path.basename(f, '.java');
    return { cmd: `java -cp "${cwd}" "${cls}"`, compile: `javac "${f}"` };
  }},
  '.rb':   { lang: 'Ruby',      run: (f) => ({ cmd: `ruby "${f}"` }) },
  '.php':  { lang: 'PHP',       run: (f) => ({ cmd: `php "${f}"` }) },
  '.sh':   { lang: 'Shell',     run: (f) => ({ cmd: process.platform === 'win32' ? `powershell -File "${f}"` : `bash "${f}"` }) },
  '.ps1':  { lang: 'PowerShell', run: (f) => ({ cmd: `powershell -ExecutionPolicy Bypass -File "${f}"` }) },
  '.bat':  { lang: 'Batch',     run: (f) => ({ cmd: `"${f}"` }) },
  '.cs':   { lang: 'C#',        run: (f) => ({ cmd: `dotnet run`, compile: undefined }) },
};

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_MAP[ext]?.lang || 'Unknown';
}

export function getSupportedExtensions(): string[] {
  return Object.keys(EXT_MAP);
}

export function runFile(filePath: string, cwd: string, timeout: number = 30000): RunResult {
  const start = Date.now();
  const ext = path.extname(filePath).toLowerCase();
  const handler = EXT_MAP[ext];
  if (!handler) {
    return { success: false, output: `Unsupported file type: ${ext}. Supported: ${Object.keys(EXT_MAP).join(', ')}`, exitCode: 1, language: 'Unknown', duration: 0 };
  }

  const { cmd, compile } = handler.run(filePath, cwd);
  const env: any = { ...process.env, FORCE_COLOR: '0', NODE_NO_WARNINGS: '1' };
  const psPath = process.platform === 'win32' ? (process.env.ComSpec || 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe') : '/bin/bash';

  // Augment PATH
  if (process.platform === 'win32') {
    const extra = [
      path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python312'),
      path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python311'),
      path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python38'),
      'C:\\Program Files\\nodejs',
      'C:\\tools\\nodejs\\node-v20.15.1-win-x64',
      'C:\\node20b\\node-v20.15.1-win-x64',
      'C:\\Program Files\\Git\\cmd',
      'C:\\Program Files\\LLVM\\bin',
      'C:\\mingw64\\bin',
      'C:\\TDM-GCC-64\\bin',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0',
      'C:\\Windows',
      ...((process as any).resourcesPath ? [(process as any).resourcesPath] : []),
    ].join(path.delimiter) + path.delimiter;
    env.PATH = extra + (env.PATH || '');
  }

  let compileOutput = '';
  // Compile step
  if (compile) {
    try {
      compileOutput = execSync(compile, { cwd, timeout: 60000, encoding: 'utf8', shell: psPath as any, env, windowsHide: true });
    } catch (e: any) {
      return {
        success: false, output: '', exitCode: e.status || 1, language: handler.lang,
        compileOutput: ((e.stdout || '') + '\n' + (e.stderr || e.message || '')).slice(0, 8000),
        duration: Date.now() - start,
      };
    }
  }

  // Run step
  try {
    const output = execSync(cmd, { cwd, timeout, encoding: 'utf8', shell: psPath as any, env, windowsHide: true });
    return { success: true, output: (output || '').slice(0, 16000), exitCode: 0, language: handler.lang, compileOutput: compileOutput || undefined, duration: Date.now() - start };
  } catch (e: any) {
    return { success: false, output: ((e.stdout || '') + '\n' + (e.stderr || e.message || '')).slice(0, 16000), exitCode: e.status || 1, language: handler.lang, compileOutput: compileOutput || undefined, duration: Date.now() - start };
  }
}

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface ShellResult { success: boolean; output: string; exitCode: number; }

export function TerminalPanel() {
  const termRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [cwd, setCwd] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const histIdx = useRef(-1);
  const currentLine = useRef('');
  const prompt = useRef('$ ');

  const writeOutput = useCallback((text: string) => {
    const t = termInstance.current;
    if (!t) return;
    const lines = text.split('\n');
    for (const line of lines) t.writeln(line);
  }, []);

  const execCommand = useCallback(async (cmd: string) => {
    try {
      const res = await fetch("/api/coding/shell", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, workdir: cwd || undefined, timeout: 30000 }),
      });
      const data: ShellResult = await res.json();
      if (data.output) writeOutput(data.output.replace(/\n$/, ''));
      if (!data.success && data.exitCode !== 0) {
        termInstance.current?.writeln(`\x1b[31m[exit code: ${data.exitCode}]\x1b[0m`);
      }
    } catch (e: any) {
      termInstance.current?.writeln(`\x1b[31mError: ${e.message}\x1b[0m`);
    }
  }, [cwd, writeOutput]);

  useEffect(() => {
    if (!termRef.current || termInstance.current) return;
    const term = new Terminal({
      theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff', selectionBackground: '#264f78' },
      fontSize: 13,
      fontFamily: 'Cascadia Code, Menlo, Monaco, Consolas, monospace',
      cursorBlink: true,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);
    fit.fit();
    termInstance.current = term;
    fitAddon.current = fit;

    term.writeln('\x1b[1;36m  Mixture of Agents \x1b[0m- Interactive Terminal');
    term.writeln('\x1b[90m  Type commands. Use Up/Down for history.\x1b[0m');
    term.writeln('');
    term.write(prompt.current);

    let line = '';
    term.onKey(({ key, domEvent }) => {
      const code = domEvent.keyCode;
      if (code === 13) { // Enter
        term.writeln('');
        const cmd = line.trim();
        if (cmd) {
          setHistory(prev => [...prev, cmd]);
          histIdx.current = -1;
          if (cmd === 'clear') { term.clear(); }
          else if (cmd.startsWith('cd ')) {
            const target = cmd.slice(3).trim();
            setCwd(prev => {
              const next = prev ? prev + '/' + target : target;
              return next;
            });
            term.writeln(`\x1b[33mChanged directory context to: ${target}\x1b[0m`);
          } else {
            execCommand(cmd);
          }
        }
        line = '';
        currentLine.current = '';
        term.write(prompt.current);
      } else if (code === 8) { // Backspace
        if (line.length > 0) {
          line = line.slice(0, -1);
          currentLine.current = line;
          term.write('\b \b');
        }
      } else if (code === 38) { // Up arrow
        setHistory(prev => {
          if (prev.length === 0) return prev;
          const newIdx = histIdx.current < prev.length - 1 ? histIdx.current + 1 : histIdx.current;
          histIdx.current = newIdx;
          const h = prev[prev.length - 1 - newIdx];
          // Clear current line
          for (let i = 0; i < line.length; i++) term.write('\b \b');
          term.write(h);
          line = h;
          currentLine.current = h;
          return prev;
        });
      } else if (code === 40) { // Down arrow
        setHistory(prev => {
          if (histIdx.current <= 0) {
            histIdx.current = -1;
            for (let i = 0; i < line.length; i++) term.write('\b \b');
            line = '';
            currentLine.current = '';
            return prev;
          }
          histIdx.current--;
          const h = prev[prev.length - 1 - histIdx.current];
          for (let i = 0; i < line.length; i++) term.write('\b \b');
          term.write(h);
          line = h;
          currentLine.current = h;
          return prev;
        });
      } else if (domEvent.key.length === 1 && !domEvent.ctrlKey && !domEvent.altKey) {
        line += domEvent.key;
        currentLine.current = line;
        term.write(domEvent.key);
      }
    });

    const handleResize = () => { try { fit.fit(); } catch {} };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); term.dispose(); termInstance.current = null; };
  }, [execCommand]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 12px', background: '#161b22', borderBottom: '1px solid #30363d', fontSize: 11, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#58a6ff' }}>Terminal</span>
        {cwd && <span style={{ color: '#7ee787' }}>{cwd}</span>}
        <span style={{ marginLeft: 'auto', color: '#484f48' }}>{history.length} commands</span>
      </div>
      <div ref={termRef} style={{ flex: 1, padding: 4, background: '#0d1117' }} />
    </div>
  );
}

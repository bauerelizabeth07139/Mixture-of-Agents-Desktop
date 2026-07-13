import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { api } from '../services/api';

interface FileEntry { name: string; path: string; isDir: boolean; size?: number; children?: FileEntry[]; }
interface EditorPanelProps { onCommandExecute?: (cmd: string) => void; }

const LANG: Record<string,string> = { py:'python',js:'javascript',ts:'typescript',tsx:'typescript',jsx:'javascript',html:'html',css:'css',json:'json',md:'markdown',c:'c',cpp:'cpp',go:'go',rs:'rust',java:'java',rb:'ruby',php:'php',sh:'shell',ps1:'powershell',bat:'bat',sql:'sql',yaml:'yaml',yml:'yaml',toml:'toml',xml:'xml' };
const ICON: Record<string,string> = { py:'🐍',js:'⚡',ts:'🔧',tsx:'🔧',html:'🌐',css:'🎨',json:'📋',md:'📝',c:'⚙️',cpp:'⚙️',go:'🚀',rs:'🧪',java:'☕',rb:'💎',sh:'💻',sql:'📊' };
const fmtSize = (b: number) => b < 1024 ? b+' B' : b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(1)+' MB';
const extOf = (n: string) => (n.split('.').pop()||'').toLowerCase();

const FILE_TEMPLATES: Record<string, {ext:string,label:string,icon:string,content:string}> = {
  'py':     {ext:'.py',     label:'Python',   icon:'🐍', content:'print("Hello, World!")\n'},
  'js':     {ext:'.js',     label:'JavaScript',icon:'⚡',       content:'console.log("Hello, World!");\n'},
  'ts':     {ext:'.ts',     label:'TypeScript',icon:'🔧', content:'const msg: string = "Hello, World!";\nconsole.log(msg);\n'},
  'html':   {ext:'.html',   label:'HTML',      icon:'🌐', content:'<!DOCTYPE html>\n<html>\n<head><title>Page</title></head>\n<body><h1>Hello</h1></body>\n</html>\n'},
  'css':    {ext:'.css',    label:'CSS',       icon:'🎨', content:'body {\n  margin: 0;\n  font-family: sans-serif;\n}\n'},
  'json':   {ext:'.json',   label:'JSON',      icon:'📋', content:'{\n  "name": "project"\n}\n'},
  'md':     {ext:'.md',     label:'Markdown',  icon:'📝', content:'# Title\n\nHello World\n'},
  'c':      {ext:'.c',      label:'C',         icon:'⚙️', content:'#include <stdio.h>\n\nint main() {\n  printf("Hello, World!\\n");\n  return 0;\n}\n'},
  'cpp':    {ext:'.cpp',    label:'C++',       icon:'⚙️', content:'#include <iostream>\n\nint main() {\n  std::cout << "Hello, World!" << std::endl;\n  return 0;\n}\n'},
  'go':     {ext:'.go',     label:'Go',        icon:'🚀', content:'package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("Hello, World!")\n}\n'},
  'rs':     {ext:'.rs',     label:'Rust',      icon:'🧪', content:'fn main() {\n  println!("Hello, World!");\n}\n'},
  'java':   {ext:'.java',   label:'Java',      icon:'☕',       content:'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, World!");\n  }\n}\n'},
  'rb':     {ext:'.rb',     label:'Ruby',      icon:'💎', content:'puts "Hello, World!"\n'},
  'sh':     {ext:'.sh',     label:'Shell',     icon:'💻', content:'#!/bin/bash\necho "Hello, World!"\n'},
};

export function EditorPanel({ onCommandExecute }: EditorPanelProps) {
  const [workspace, setWorkspace] = useState(() => localStorage.getItem('moa-workspace') || '');
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState('');
  const [content, setContent] = useState('');
  const [editContent, setEditContent] = useState('');
  const [language, setLanguage] = useState('plaintext');
  const [modified, setModified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [changedLines, setChangedLines] = useState<Set<number>>(new Set());
  const [commandBar, setCommandBar] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [cmdHistIdx, setCmdHistIdx] = useState(-1);
  const [commandOutput, setCommandOutput] = useState<Array<{cmd: string; output: string; success: boolean}>>([]);
  const [showCmdOutput, setShowCmdOutput] = useState(true);
  const [browseVisible, setBrowseVisible] = useState(false);
  const [browsePath, setBrowsePath] = useState('');
  const [browseEntries, setBrowseEntries] = useState<any[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [newItemMenu, setNewItemMenu] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{x:number;y:number;path:string;isDir:boolean;name:string}|null>(null);
  const [renaming, setRenaming] = useState<string|null>(null);
  const [renameName, setRenameName] = useState('');
  const editorRef = useRef<any>(null);
  const cmdInputRef = useRef<HTMLInputElement>(null);
  const cmdOutputRef = useRef<HTMLDivElement>(null);
  const cmdOutputPanelRef = useRef<HTMLDivElement>(null);

  // Load workspace tree
  const loadTree = useCallback(async () => {
    try {
      const data = await api.listTree(workspace || undefined, 3);
      setTree(data.tree || []);
    } catch {}
  }, [workspace]);

  useEffect(() => { if (workspace) loadTree(); }, [workspace, loadTree]);

  // Persist workspace
  useEffect(() => {
    if (workspace) {
      localStorage.setItem('moa-workspace', workspace);
      api.setWorkspace(workspace).catch(() => {});
    }
  }, [workspace]);

  // Auto-scroll command output
  useEffect(() => { cmdOutputRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [commandOutput]);

  // Close context menu on outside click
  useEffect(() => {
    const close = () => setCtxMenu(null);
    if (ctxMenu) { window.addEventListener('click', close); return () => window.removeEventListener('click', close); }
  }, [ctxMenu]);

  const openFile = async (filePath: string) => {
    setLoading(true);
    try {
      const data = await api.readFile(filePath);
      if (data.content !== undefined) {
        setContent(data.content);
        setEditContent(data.content);
        setSelectedFile(filePath);
        setModified(false);
        setDirty(false);
        setChangedLines(new Set());
        setLanguage(LANG[extOf(filePath)] || 'plaintext');
      }
    } catch {}
    setLoading(false);
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    try {
      await api.writeFile(selectedFile, editContent);
      setContent(editContent);
      setModified(false);
      setDirty(false);
      setChangedLines(new Set());
    } catch {}
  };

  const handleEditorChange = (value: string | undefined) => {
    const newVal = value || '';
    setEditContent(newVal);
    setModified(true);
    setDirty(newVal !== content);
    // Calculate changed lines
    if (editorRef.current) {
      const oldLines = content.split('\n');
      const newLines = newVal.split('\n');
      const changed = new Set<number>();
      const maxLen = Math.max(oldLines.length, newLines.length);
      for (let i = 0; i < maxLen; i++) {
        if ((oldLines[i] || '') !== (newLines[i] || '')) changed.add(i + 1);
      }
      setChangedLines(changed);
    }
  };

  const runFile = async () => {
    if (!selectedFile) return;
    setRunning(true);
    setRunResult(null);
    try {
      const data = await api.runFile(selectedFile, 30000);
      setRunResult(data);
    } catch (e: any) { setRunResult({ success: false, output: e.message, exitCode: 1 }); }
    setRunning(false);
  };

  // Command bar - sends to terminal/shell
  const executeCommand = async () => {
    const cmd = commandBar.trim();
    if (!cmd) return;
    setCommandBar('');
    setCommandHistory(prev => [...prev, cmd]);
    setCmdHistIdx(-1);
    setShowCmdOutput(true);
    try {
      const data = await api.runShell(cmd, workspace || undefined, 30000);
      setCommandOutput(prev => [...prev, { cmd, output: data.output || '', success: data.success !== false }]);
    } catch (e: any) {
      setCommandOutput(prev => [...prev, { cmd, output: e.message, success: false }]);
    }
  };

  const handleCmdKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); executeCommand(); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIdx = cmdHistIdx < commandHistory.length - 1 ? cmdHistIdx + 1 : cmdHistIdx;
        setCmdHistIdx(newIdx);
        setCommandBar(commandHistory[commandHistory.length - 1 - newIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (cmdHistIdx > 0) { setCmdHistIdx(cmdHistIdx - 1); setCommandBar(commandHistory[commandHistory.length - cmdHistIdx]); }
      else { setCmdHistIdx(-1); setCommandBar(''); }
    }
  };

  // Browse for workspace
  const navBrowse = async (p?: string) => {
    setBrowseLoading(true);
    try {
      const data = await api.browseFiles(p || '');
      setBrowseEntries(data.entries || []);
      setBrowsePath(data.path || '');
    } catch {}
    setBrowseLoading(false);
  };

  const toggleDir = (path: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n; });
  };

  const createItem = async (isDir: boolean) => {
    if (!newItemName.trim()) return;
    const parentPath = workspace;
    const fullPath = parentPath + '\\' + newItemName.trim();
    try {
      await api.createFile(fullPath, isDir ? undefined : '', isDir);
      setNewItemMenu(false);
      setNewItemName('');
      loadTree();
    } catch {}
  };

  const deleteItem = async (filePath: string, name: string) => {
    if (!confirm('Delete ' + name + '?')) return;
    try { await api.deleteFile(filePath); if (selectedFile === filePath) { setSelectedFile(''); setContent(''); setEditContent(''); } loadTree(); } catch {}
  };

  const renameItem = async (oldPath: string) => {
    if (!renameName.trim()) return;
    const dir = oldPath.substring(0, oldPath.lastIndexOf('\\'));
    const newPath = dir + '\\' + renameName.trim();
    try { await api.renameFile(oldPath, newPath); setRenaming(null); loadTree(); } catch {}
  };

  const renderTree = (entries: FileEntry[], depth: number): React.ReactNode => {
    return entries.map(entry => {
      const indent = depth * 16 + 8;
      const isExpanded = expanded.has(entry.path);
      if (renaming === entry.path) {
        return (
          <div key={entry.path} style={{ padding: '2px 8px', paddingLeft: indent }}>
            <input autoFocus defaultValue={entry.name} value={renameName} onChange={e => setRenameName(e.target.value)}
              onBlur={() => renameItem(entry.path)} onKeyDown={e => { if (e.key === 'Enter') renameItem(entry.path); if (e.key === 'Escape') setRenaming(null); }}
              style={{ fontSize: 12, padding: '1px 4px', width: '80%', background: 'var(--bg-tertiary)', border: '1px solid var(--accent)', borderRadius: 3, color: 'var(--text-primary)' }} />
          </div>
        );
      }
      return (
        <React.Fragment key={entry.path}>
          <div onClick={() => entry.isDir ? toggleDir(entry.path) : openFile(entry.path)}
            onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, path: entry.path, isDir: entry.isDir, name: entry.name }); }}
            style={{ padding: '2px 8px', paddingLeft: indent, cursor: 'pointer', fontSize: 12, color: selectedFile === entry.path ? 'var(--accent-light)' : 'var(--text-secondary)', background: selectedFile === entry.path ? 'var(--accent-glow)' : 'transparent', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 4 }}
            onMouseEnter={e => { if (selectedFile !== entry.path) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
            onMouseLeave={e => { if (selectedFile !== entry.path) e.currentTarget.style.background = 'transparent'; }}>
            <span style={{ fontSize: 10, width: 10 }}>{entry.isDir ? (isExpanded ? '▼' : '▶') : ''}</span>
            <span>{entry.isDir ? '📁' : (ICON[extOf(entry.name)] || '📄')}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
            {!entry.isDir && entry.size !== undefined && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtSize(entry.size)}</span>}
          </div>
          {entry.isDir && isExpanded && entry.children && renderTree(entry.children, depth + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Top toolbar with workspace picker */}
      <div style={{ padding: '4px 12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flexShrink: 0 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>📂 </span>
        {workspace ? (
          <span style={{ color: 'var(--text-secondary)', fontSize: 11, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={workspace}>{workspace}</span>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>请选择项目目录</span>
        )}
        <button onClick={() => { setBrowseVisible(true); navBrowse(workspace || ''); }} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}>
          {workspace ? '📂 更改' : '📂 选择目录'}
        </button>
        {workspace && (
          <>
            <button onClick={() => setNewItemMenu(!newItemMenu)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}>+ 新建</button>
            <button onClick={loadTree} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '2px 8px' }} title="刷新">↻</button>
          </>
        )}
        <div style={{ flex: 1 }} />
        {selectedFile && (
          <>
            <span style={{ color: 'var(--accent-light)', fontSize: 11 }}>{ICON[extOf(selectedFile)] || '📄'} {selectedFile.split(/[\\/]/).pop()}</span>
            {dirty && <span style={{ color: 'var(--warning)', fontSize: 11 }}>●</span>}
            <button onClick={saveFile} disabled={!dirty} style={{ background: dirty ? 'var(--accent)' : 'var(--bg-tertiary)', border: '1px solid var(--border)', color: dirty ? '#fff' : 'var(--text-muted)', borderRadius: 4, cursor: dirty ? 'pointer' : 'default', fontSize: 11, padding: '2px 8px', opacity: dirty ? 1 : 0.5 }}>💾 保存</button>
            <button onClick={runFile} disabled={running} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}>{running ? '⏳...' : '▶ 运行'}</button>
          </>
        )}
      </div>

      {/* New item menu */}
      {newItemMenu && workspace && (
        <div style={{ padding: '6px 12px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>文件类型:</span>
          {Object.entries(FILE_TEMPLATES).map(([key, t]) => (
            <button key={key} onClick={() => { setNewItemName('file' + t.ext); }}
              style={{ background: newItemName.endsWith(t.ext) ? 'var(--accent)' : 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer', fontSize: 10, padding: '2px 6px' }}>
              {t.icon} {t.label}
            </button>
          ))}
          <input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="文件名"
            style={{ flex: 1, fontSize: 12, padding: '2px 6px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)' }}
            onKeyDown={e => { if (e.key === 'Enter') createItem(false); }} />
          <button onClick={() => createItem(false)} style={{ background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}>创建文件</button>
          <button onClick={() => createItem(true)} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}>创建目录</button>
        </div>
      )}

      {/* Main area: file tree + editor */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* File tree sidebar */}
        {workspace && (
          <div style={{ width: 220, borderRight: '1px solid var(--border)', overflow: 'auto', flexShrink: 0, background: 'var(--bg-secondary)' }}>
            {newItemMenu && (
              <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {Object.entries(FILE_TEMPLATES).map(([key, t]) => (
                    <button key={key} onClick={() => { const base = newItemName.trim() || 'file'; const nm = base.endsWith(t.ext) ? base : base + t.ext; setNewItemName(nm); }}
                      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer', fontSize: 10, padding: '2px 5px' }}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tree.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                {workspace ? '加载中...' : '请先选择项目目录'}
              </div>
            ) : renderTree(tree, 0)}
          </div>
        )}

        {/* Editor area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedFile ? (
            <>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <Editor
                  language={language}
                  value={editContent}
                  onChange={handleEditorChange}
                  theme="vs-dark"
                  onMount={(editor) => { editorRef.current = editor; }}
                  options={{
                    fontSize: 13,
                    fontFamily: 'Cascadia Code, Menlo, Monaco, Consolas, monospace',
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    lineNumbers: 'on',
                    renderLineHighlight: 'all',
                  }}
                />
              </div>
              {/* Change highlighting overlay - show changed line numbers */}
              {changedLines.size > 0 && (
                <div style={{ padding: '2px 12px', background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--warning)', flexShrink: 0 }}>
                  ● {changedLines.size} 行已修改 (行 {Array.from(changedLines).slice(0, 10).join(', ')}{changedLines.size > 10 ? '...' : ''})
                </div>
              )}
              {/* Run result */}
              {runResult && (
                <div style={{ maxHeight: 200, overflow: 'auto', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
                  <div style={{ padding: '4px 12px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: runResult.success ? 'var(--success)' : 'var(--error)' }}>{runResult.success ? '✅' : '❌'} {runResult.language || ''} {runResult.duration ? runResult.duration + 'ms' : ''}</span>
                    {runResult.exitCode !== undefined && <span style={{ color: 'var(--text-muted)' }}>exit: {runResult.exitCode}</span>}
                    <button onClick={() => setRunResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>✕</button>
                  </div>
                  {runResult.compileOutput && <pre style={{ padding: '4px 12px', fontSize: 11, color: 'var(--warning)', margin: 0, whiteSpace: 'pre-wrap' }}>{runResult.compileOutput}</pre>}
                  <pre style={{ padding: '4px 12px', fontSize: 11, color: runResult.success ? 'var(--text-secondary)' : 'var(--error)', margin: 0, whiteSpace: 'pre-wrap' }}>{runResult.output || '(无输出)'}</pre>
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: 12 }}>
              <span style={{ fontSize: 48 }}>📄</span>
              <span style={{ fontSize: 14 }}>{workspace ? '点击左侧文件树打开文件' : '请先选择项目目录'}</span>
              {!workspace && (
                <button onClick={() => { setBrowseVisible(true); navBrowse(''); }}
                  style={{ background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 13, padding: '8px 20px' }}>
                  📂 选择项目目录
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Command bar at bottom - synced with chat */}
      <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        {/* Command output panel */}
        {showCmdOutput && commandOutput.length > 0 && (
          <div ref={cmdOutputPanelRef} style={{ maxHeight: 150, overflow: 'auto', borderBottom: '1px solid var(--border)', padding: '4px 12px' }}>
            {commandOutput.map((item, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--accent-light)', fontFamily: 'monospace' }}>$ {item.cmd}</div>
                <pre style={{ fontSize: 11, color: item.success ? 'var(--text-secondary)' : 'var(--error)', margin: '2px 0', whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto' }}>{item.output || '(无输出)'}</pre>
              </div>
            ))}
            <div ref={cmdOutputRef} />
          </div>
        )}
        {/* Command input */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '4px 12px', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--accent-light)', fontFamily: 'monospace', flexShrink: 0 }}>$</span>
          <input ref={cmdInputRef} value={commandBar} onChange={e => setCommandBar(e.target.value)} onKeyDown={handleCmdKeyDown}
            placeholder={workspace ? '输入命令 (' + workspace + ')' : '输入命令...'}
            style={{ flex: 1, fontSize: 12, padding: '4px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontFamily: 'monospace' }} />
          <button onClick={executeCommand} disabled={!commandBar.trim()}
            style={{ background: commandBar.trim() ? 'var(--accent)' : 'var(--bg-tertiary)', border: '1px solid var(--border)', color: commandBar.trim() ? '#fff' : 'var(--text-muted)', borderRadius: 4, cursor: commandBar.trim() ? 'pointer' : 'default', fontSize: 11, padding: '4px 12px' }}>
            执行
          </button>
          {commandOutput.length > 0 && (
            <button onClick={() => setShowCmdOutput(!showCmdOutput)}
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '4px 8px' }}>
              {showCmdOutput ? '▼' : '▲'} {commandOutput.length}
            </button>
          )}
        </div>
      </div>

      {/* Browse modal */}
      {browseVisible && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setBrowseVisible(false)}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, width: 500, maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>📂 选择项目目录</span>
              <button onClick={() => setBrowseVisible(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{browsePath || '选择驱动器...'}</div>
            <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
              {browseLoading ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>
              ) : browseEntries.map((e: any) => (
                <div key={e.path} onClick={() => e.isDir && navBrowse(e.path)}
                  style={{ padding: '4px 12px', cursor: e.isDir ? 'pointer' : 'default', fontSize: 12, borderRadius: 4, color: e.isDir ? 'var(--accent-light)' : 'var(--text-muted)', opacity: e.isDir ? 1 : 0.5 }}
                  onMouseEnter={ev => { if (e.isDir) ev.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                  onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; }}>
                  {e.isDir ? '📁' : '📄'} {e.name}
                </div>
              ))}
            </div>
            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { if (browsePath) { const parent = browsePath.replace(/[\\/][^\\/]+[\\/]?$/, ''); navBrowse(parent || ''); } }}
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer', fontSize: 12, padding: '4px 12px' }}>
                ← 上级
              </button>
              <button onClick={() => setBrowseVisible(false)}
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer', fontSize: 12, padding: '4px 12px' }}>
                取消
              </button>
              <button onClick={() => { setWorkspace(browsePath); setBrowseVisible(false); setExpanded(new Set([browsePath])); }}
                disabled={!browsePath}
                style={{ background: browsePath ? 'var(--accent)' : 'var(--bg-tertiary)', border: 'none', color: browsePath ? '#fff' : 'var(--text-muted)', borderRadius: 4, cursor: browsePath ? 'pointer' : 'default', fontSize: 12, padding: '4px 12px' }}>
                选择此目录
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          <div onClick={() => { openFile(ctxMenu.path); setCtxMenu(null); }} style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 12, borderRadius: 4 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>👁 打开</div>
          {!ctxMenu.isDir && <div onClick={() => { setSelectedFile(ctxMenu.path); setCtxMenu(null); setTimeout(runFile, 100); }} style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 12, borderRadius: 4 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>▶ 运行</div>}
          {ctxMenu.isDir && <>
            <div onClick={() => { setNewItemMenu(true); setCtxMenu(null); }} style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 12, borderRadius: 4 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>📁+ 新建</div>
          </>}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <div onClick={() => { setRenaming(ctxMenu.path); setRenameName(ctxMenu.name); setCtxMenu(null); }} style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 12, borderRadius: 4 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>✏️ 重命名</div>
          <div onClick={() => { deleteItem(ctxMenu.path, ctxMenu.name); setCtxMenu(null); }} style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 12, borderRadius: 4, color: 'var(--error)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>🗑️ 删除</div>
        </div>
      )}
    </div>
  );
}

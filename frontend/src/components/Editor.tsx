import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { api } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────
interface FileEntry { name: string; path: string; isDir: boolean; size?: number; children?: FileEntry[]; }
interface EditorPanelProps { onCommandExecute?: (cmd: string) => void; threadId?: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────
const LANG: Record<string, string> = {
  py: 'python', js: 'javascript', ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
  html: 'html', css: 'css', json: 'json', md: 'markdown', c: 'c', cpp: 'cpp',
  go: 'go', rs: 'rust', java: 'java', rb: 'ruby', php: 'php', sh: 'shell',
  ps1: 'powershell', bat: 'bat', sql: 'sql', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
};
const ICON: Record<string, string> = {
  py: '🐍', js: '⚡', ts: '🔧', tsx: '🔧',
  html: '🌐', css: '🎨', json: '📋', md: '📝',
  c: '⚙️', cpp: '⚙️', go: '🚀', rs: '🧪',
  java: '☕', rb: '💎', sh: '💻', sql: '📨',
};
const fmtSize = (b: number) =>
  b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
const extOf = (n: string) => (n.split('.').pop() || '').toLowerCase();

const FILE_TEMPLATES: Record<string, { ext: string; label: string; icon: string; content: string }> = {
  py:   { ext: '.py',   label: 'Python',    icon: '🐍', content: 'print("Hello, World!")\n' },
  js:   { ext: '.js',   label: 'JavaScript', icon: '⚡',    content: 'console.log("Hello, World!");\n' },
  ts:   { ext: '.ts',   label: 'TypeScript', icon: '🔧', content: 'const msg: string = "Hello, World!";\nconsole.log(msg);\n' },
  html: { ext: '.html', label: 'HTML',       icon: '🌐', content: '<!DOCTYPE html>\n<html>\n<head><title>Page</title></head>\n<body><h1>Hello</h1></body>\n</html>\n' },
  css:  { ext: '.css',  label: 'CSS',        icon: '🎨', content: 'body {\n  margin: 0;\n  font-family: sans-serif;\n}\n' },
  json: { ext: '.json', label: 'JSON',       icon: '📋', content: '{\n  "name": "project"\n}\n' },
  md:   { ext: '.md',   label: 'Markdown',   icon: '📝', content: '# Title\n\nHello World\n' },
  c:    { ext: '.c',    label: 'C',          icon: '⚙️', content: '#include <stdio.h>\n\nint main() {\n  printf("Hello, World!\\n");\n  return 0;\n}\n' },
  cpp:  { ext: '.cpp',  label: 'C++',        icon: '⚙️', content: '#include <iostream>\n\nint main() {\n  std::cout << "Hello, World!" << std::endl;\n  return 0;\n}\n' },
  go:   { ext: '.go',   label: 'Go',         icon: '🚀', content: 'package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("Hello, World!")\n}\n' },
  rs:   { ext: '.rs',   label: 'Rust',       icon: '🧪', content: 'fn main() {\n  println!("Hello, World!");\n}\n' },
  java: { ext: '.java', label: 'Java',       icon: '☕',    content: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, World!");\n  }\n}\n' },
  rb:   { ext: '.rb',   label: 'Ruby',       icon: '💎', content: 'puts "Hello, World!"\n' },
  sh:   { ext: '.sh',   label: 'Shell',      icon: '💻', content: '#!/bin/bash\necho "Hello, World!"\n' },
};

// ─── Diff helper ──────────────────────────────────────────────────────────
function computeChangedLines(original: string, current: string): number[] {
  if (!original && !current) return [];
  const origLines = original.split('\n');
  const currLines = current.split('\n');
  const changed: number[] = [];
  const max = Math.max(origLines.length, currLines.length);
  for (let i = 0; i < max; i++) {
    if ((origLines[i] || '') !== (currLines[i] || '')) changed.push(i + 1);
  }
  return changed;
}

// ─── Component ────────────────────────────────────────────────────────────
export function EditorPanel({ onCommandExecute, threadId }: EditorPanelProps) {
  // Workspace state (per-thread localStorage)
  const storageKey = threadId ? `moa-project-${threadId}` : 'moa-workspace';
  const [workspace, setWorkspace] = useState(() => localStorage.getItem(storageKey) || localStorage.getItem('moa-workspace') || '');
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState('');
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [editContent, setEditContent] = useState('');
  const [language, setLanguage] = useState('plaintext');
  const [modified, setModified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [changedLines, setChangedLines] = useState<number[]>([]);
  // Command bar
  const [commandBar, setCommandBar] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [cmdHistIdx, setCmdHistIdx] = useState(-1);
  const [commandOutput, setCommandOutput] = useState<Array<{ cmd: string; output: string; success: boolean }>>([]);
  const [showCmdOutput, setShowCmdOutput] = useState(true);
  // Browse dialog
  const [browseVisible, setBrowseVisible] = useState(false);
  const [browsePath, setBrowsePath] = useState('');
  const [browseEntries, setBrowseEntries] = useState<any[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  // New item dialog
  const [newItemMenu, setNewItemMenu] = useState<{ parentPath: string } | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemIsDir, setNewItemIsDir] = useState(false);
  const [newItemTemplate, setNewItemTemplate] = useState<string | null>(null);
  // Context menu & rename
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string; isDir: boolean; name: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  // Manual path input
  const [manualPath, setManualPath] = useState('');
  // Refs
  const editorRef = useRef<any>(null);
  const cmdInputRef = useRef<HTMLInputElement>(null);
  const cmdOutputRef = useRef<HTMLDivElement>(null);
  const cmdOutputPanelRef = useRef<HTMLDivElement>(null);

  const hasNativeDialog = typeof window !== 'undefined' && !!(window as any).__TAI__?.showOpenDialog;

  // ─── Workspace persistence ───────────────────────────────────────────
  useEffect(() => {
    if (workspace) {
      localStorage.setItem(storageKey, workspace);
      localStorage.setItem('moa-workspace', workspace);
      api.setWorkspace(workspace).catch(() => {});
      setExpanded(prev => new Set([...prev, workspace]));
    }
  }, [workspace, storageKey]);

  // ─── Load tree ───────────────────────────────────────────────────────
  const loadTree = useCallback(async () => {
    if (!workspace) { setTree([]); return; }
    try {
      const data = await api.listTree(workspace, 3);
      if (data?.tree) setTree(data.tree);
    } catch (e) { console.error('loadTree failed:', e); }
  }, [workspace]);

  useEffect(() => { loadTree(); }, [loadTree]);

  // ─── Open file ───────────────────────────────────────────────────────
  const openFile = useCallback(async (filePath: string) => {
    setSelectedFile(filePath);
    setLoading(true);
    setRunResult(null);
    setModified(false);
    try {
      const data = await api.readFile(filePath, workspace || undefined);
      const text = data?.content ?? '';
      setContent(text);
      setEditContent(text);
      setOriginalContent(text);
      setChangedLines([]);
      setLanguage(LANG[extOf(filePath)] || 'plaintext');
    } catch (e) {
      setContent(`Error loading file: ${e}`);
      setEditContent('');
      setOriginalContent('');
    }
    setLoading(false);
  }, [workspace]);

  // ─── Save file ───────────────────────────────────────────────────────
  const saveFile = useCallback(async () => {
    if (!selectedFile) return;
    try {
      await api.writeFile(selectedFile, editContent, workspace || undefined);
      setContent(editContent);
      setModified(false);
      setChangedLines(computeChangedLines(originalContent, editContent));
      await loadTree();
    } catch (e) { console.error('saveFile failed:', e); }
  }, [selectedFile, editContent, workspace, originalContent, loadTree]);

  // ─── Run file ────────────────────────────────────────────────────────
  const runFile = useCallback(async () => {
    if (!selectedFile || running) return;
    setRunning(true);
    setRunResult(null);
    try {
      const data = await api.runFile(selectedFile, 30000);
      setRunResult(data);
    } catch (e: any) {
      setRunResult({ success: false, output: e?.message || 'Run failed' });
    }
    setRunning(false);
  }, [selectedFile, running]);

  // ─── Command bar execute ─────────────────────────────────────────────
  const executeCommand = useCallback(async (cmd: string) => {
    if (!cmd.trim()) return;
    setCommandHistory(prev => [...prev, cmd]);
    setCmdHistIdx(-1);
    setCommandOutput(prev => [...prev, { cmd, output: 'Running...', success: true }]);
    try {
      const data = await api.runShell(cmd, workspace || undefined, 30000);
      const entry = { cmd, output: data?.output ?? data?.error ?? JSON.stringify(data), success: !!data?.success };
      setCommandOutput(prev => {
        const next = [...prev];
        next[next.length - 1] = entry;
        return next;
      });
      onCommandExecute?.(cmd);
    } catch (e: any) {
      setCommandOutput(prev => {
        const next = [...prev];
        next[next.length - 1] = { cmd, output: e?.message || 'Command failed', success: false };
        return next;
      });
    }
  }, [workspace, onCommandExecute]);

  // Auto-scroll command output
  useEffect(() => {
    cmdOutputPanelRef.current?.scrollTo({ top: cmdOutputPanelRef.current.scrollHeight, behavior: 'smooth' });
  }, [commandOutput]);

  // ─── File operations ─────────────────────────────────────────────────
  const createItem = useCallback(async (parentPath: string, name: string, isDir: boolean, templateKey?: string) => {
    if (!name.trim()) return;
    let finalName = name.trim();
    if (!isDir && templateKey && FILE_TEMPLATES[templateKey]) {
      const ext = FILE_TEMPLATES[templateKey].ext;
      if (!finalName.endsWith(ext)) finalName += ext;
    }
    const sep = parentPath.includes('\\') ? '\\' : '/';
    const fullPath = parentPath + sep + finalName;
    const templateContent = templateKey && FILE_TEMPLATES[templateKey] ? FILE_TEMPLATES[templateKey].content : '';
    try {
      await api.createFile(fullPath, isDir ? undefined : templateContent, isDir);
      await loadTree();
      if (!isDir) openFile(fullPath);
    } catch (e) { console.error('createItem failed:', e); }
  }, [loadTree, openFile]);

  const deleteItem = useCallback(async (filePath: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await api.deleteFile(filePath);
      if (selectedFile === filePath) { setSelectedFile(''); setContent(''); setEditContent(''); }
      await loadTree();
    } catch (e) { console.error('deleteItem failed:', e); }
  }, [selectedFile, loadTree]);

  const renameItem = useCallback(async (oldPath: string, newName: string) => {
    if (!newName.trim()) return;
    const dir = oldPath.replace(/[\\/][^\\/]+$/, '');
    const sep = oldPath.includes('\\') ? '\\' : '/';
    const newPath = dir + sep + newName.trim();
    try {
      await api.renameFile(oldPath, newPath);
      if (selectedFile === oldPath) setSelectedFile(newPath);
      await loadTree();
    } catch (e) { console.error('renameItem failed:', e); }
  }, [selectedFile, loadTree]);

  // ─── Browse dialog ───────────────────────────────────────────────────
  const navBrowse = useCallback(async (path: string) => {
    setBrowsePath(path);
    setBrowseLoading(true);
    try {
      const data = await api.browseFiles(path);
      setBrowseEntries(data?.entries || []);
    } catch { setBrowseEntries([]); }
    setBrowseLoading(false);
  }, []);

  useEffect(() => {
    if (browseVisible) navBrowse(browsePath || '');
  }, [browseVisible]);

  // ─── Close context menu on outside click ─────────────────────────────
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

  // ─── Compute changed lines ───────────────────────────────────────────
  useEffect(() => {
    if (originalContent) {
      setChangedLines(computeChangedLines(originalContent, modified ? editContent : content));
    }
  }, [editContent, content, originalContent, modified]);

  // ─── Monaco gutter decorations for changed lines ─────────────────────
  const handleEditorMount = useCallback((editor: any) => {
    editorRef.current = editor;
  }, []);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || !changedLines.length) return;
    try {
      const decorations = changedLines.map(line => ({
        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
        options: { isWholeLine: true, className: 'changed-line-highlight', glyphMarginClassName: 'changed-line-glyph' },
      }));
      const prev = (ed as any).__changeDecorations;
      const newDecs = ed.deltaDecorations(prev || [], decorations);
      (ed as any).__changeDecorations = newDecs;
    } catch {}
  }, [changedLines, content, editContent]);

  // ─── Render tree ─────────────────────────────────────────────────────
  const renderTree = (entries: FileEntry[], depth: number): React.ReactNode => {
    const sorted = [...entries].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return sorted.map(entry => {
      const isExpanded = expanded.has(entry.path);
      const isSelected = selectedFile === entry.path;
      const ext = extOf(entry.name);
      const fileChanged = changedLines.length > 0 && selectedFile === entry.path;
      return (
        <React.Fragment key={entry.path}>
          <div
            style={{
              paddingLeft: depth * 16 + 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3,
              cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
              background: isSelected ? 'var(--accent-dim, rgba(100,100,255,0.15))' : 'transparent',
              borderRadius: 4, userSelect: 'none' as const, position: 'relative' as const,
            }}
            onClick={() => {
              if (entry.isDir) {
                setExpanded(prev => {
                  const next = new Set(prev);
                  next.has(entry.path) ? next.delete(entry.path) : next.add(entry.path);
                  return next;
                });
              } else { openFile(entry.path); }
            }}
            onContextMenu={e => {
              e.preventDefault();
              e.stopPropagation();
              setCtxMenu({ x: e.clientX, y: e.clientY, path: entry.path, isDir: entry.isDir, name: entry.name });
            }}
          >
            {entry.isDir ? (
              <span style={{ fontSize: 10, width: 12, textAlign: 'center', opacity: 0.6 }}>{isExpanded ? '▼' : '▶'}</span>
            ) : <span style={{ width: 12 }} />}
            <span>{entry.isDir ? '📂' : (ICON[ext] || '📄')}</span>
            {renaming === entry.path ? (
              <input
                autoFocus
                value={renameName}
                onChange={e => setRenameName(e.target.value)}
                onBlur={() => { renameItem(entry.path, renameName); setRenaming(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { renameItem(entry.path, renameName); setRenaming(null); } if (e.key === 'Escape') setRenaming(null); }}
                onClick={e => e.stopPropagation()}
                style={{ flex: 1, background: 'var(--bg-tertiary, #222)', border: '1px solid var(--accent, #646cff)', color: 'var(--text-primary, #e0e0e0)', borderRadius: 3, padding: '1px 4px', fontSize: 12, outline: 'none' }}
              />
            ) : (
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: entry.isDir ? 1 : 0.9 }}>
                {entry.name}
              </span>
            )}
            {!entry.isDir && fileChanged && (
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f0a030', flexShrink: 0, marginLeft: 'auto' }} title="Modified this session" />
            )}
            {entry.size != null && !entry.isDir && (
              <span style={{ fontSize: 10, color: 'var(--text-muted, #666)', marginLeft: 4 }}>{fmtSize(entry.size)}</span>
            )}
          </div>
          {entry.isDir && isExpanded && entry.children && renderTree(entry.children, depth + 1)}
        </React.Fragment>
      );
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-primary, #1a1a2e)', color: 'var(--text-primary, #e0e0e0)' }}>
      {/* ── Sidebar (File Tree) ── */}
      <div style={{ width: 240, minWidth: 200, maxWidth: 360, borderRight: '1px solid var(--border, #333)', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary, #16162a)', resize: 'horizontal' as const, overflow: 'hidden' }}>
        {/* Sidebar header */}
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border, #333)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <button
            style={{ flex: 1, background: 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
            onClick={async () => {
              if (hasNativeDialog) {
                try {
                  const result = await (window as any).__TAI__.showOpenDialog({ properties: ['openDirectory'] });
                  if (result && !result.canceled && result.filePaths?.[0]) {
                    setWorkspace(result.filePaths[0]);
                  }
                } catch {}
              } else {
                setBrowseVisible(true);
              }
            }}
          >
            {'📂'} Browse
          </button>
          <button
            style={{ background: 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}
            onClick={loadTree} title="Refresh tree"
          >{'↻'}</button>
          <button
            style={{ background: 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}
            onClick={() => {
              if (!workspace) return;
              setNewItemMenu({ parentPath: workspace });
              setNewItemIsDir(false);
              setNewItemName('');
              setNewItemTemplate(null);
            }}
            title="New file/folder"
          >+</button>
        </div>

        {/* Manual path input (when no workspace selected) */}
        {!workspace && (
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border, #333)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted, #666)', marginBottom: 4 }}>Project path:</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                value={manualPath}
                onChange={e => setManualPath(e.target.value)}
                placeholder="Enter project path..."
                style={{ flex: 1, background: 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: 'var(--text-primary)', borderRadius: 4, padding: '3px 6px', fontSize: 11, outline: 'none' }}
                onKeyDown={e => { if (e.key === 'Enter' && manualPath.trim()) setWorkspace(manualPath.trim()); }}
              />
              <button
                style={{ background: 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}
                onClick={() => { if (manualPath.trim()) setWorkspace(manualPath.trim()); }}
              >OK</button>
            </div>
          </div>
        )}

        {/* Current project path display */}
        {workspace && (
          <div style={{ padding: '4px 10px', fontSize: 10, color: 'var(--text-muted, #666)', borderBottom: '1px solid var(--border, #333)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={workspace}>
            {'📁'} {workspace.split(/[\\/]/).pop() || workspace}
          </div>
        )}

        {/* File tree */}
        <div style={{ flex: 1, overflow: 'auto', padding: 4 }}>
          {tree.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted, #666)', fontSize: 12 }}>
              {workspace ? 'No files' : 'Select a project directory'}
            </div>
          ) : renderTree(tree, 0)}
        </div>
      </div>

      {/* ── Main Area (Editor + Command Bar) ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {selectedFile ? (
          <>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', gap: 8, borderBottom: '1px solid var(--border, #333)', fontSize: 12, background: 'var(--bg-secondary, #16162a)' }}>
              <span>{ICON[extOf(selectedFile)] || '📄'}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFile.split(/[\\/]/).pop()}
              </span>
              {dirty && <span style={{ color: '#f0a030', fontSize: 16 }} title="Unsaved changes">{'●'}</span>}
              {changedLines.length > 0 && <span style={{ fontSize: 10, color: '#f0a030' }} title="Changes this session">{changedLines.length} changed</span>}
              <span style={{ fontSize: 10, color: 'var(--text-muted, #666)' }}>{LANG[extOf(selectedFile)] || 'text'}</span>
              <button
                style={{ background: modified ? 'var(--accent, #646cff)' : 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: modified ? '#fff' : 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}
                onClick={() => {
                  if (modified) saveFile();
                  else { setEditContent(content); setModified(true); }
                }}
              >
                {modified ? '💾 Save' : '✏️ Edit'}
              </button>
              <button
                style={{ background: 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}
                onClick={runFile} disabled={running}
              >
                {running ? '⏳...' : '▶ Run'}
              </button>
            </div>

            {/* Editor */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted, #666)' }}>Loading...</div>
              ) : modified ? (
                <Editor
                  height="100%"
                  language={language}
                  value={editContent}
                  onChange={v => { setEditContent(v || ''); setDirty(true); }}
                  theme="vs-dark"
                  onMount={handleEditorMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    glyphMargin: true,
                    padding: { top: 8, bottom: 8 },
                  }}
                />
              ) : (
                <Editor
                  height="100%"
                  language={language}
                  value={content}
                  theme="vs-dark"
                  onMount={handleEditorMount}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    glyphMargin: true,
                    padding: { top: 8, bottom: 8 },
                  }}
                />
              )}
            </div>

            {/* Run result */}
            {runResult && (
              <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border, #333)', maxHeight: 160, overflow: 'auto', background: 'var(--bg-secondary, #16162a)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 11 }}>
                  <span style={{ color: runResult.success ? '#4caf50' : '#f44336' }}>{runResult.success ? '✅' : '❌'}</span>
                  <span>{runResult.language || ''}</span>
                  {runResult.duration && <span style={{ color: 'var(--text-muted, #666)' }}>{runResult.duration}ms</span>}
                  {runResult.exitCode !== undefined && <span style={{ color: 'var(--text-muted, #666)' }}>exit: {runResult.exitCode}</span>}
                  <button style={{ background: 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '3px 8px', marginLeft: 'auto' }} onClick={() => setRunResult(null)}>Dismiss</button>
                </div>
                {runResult.compileOutput && <pre style={{ fontSize: 11, color: '#f0a030', margin: '4px 0', whiteSpace: 'pre-wrap' }}>{runResult.compileOutput}</pre>}
                <pre style={{ fontSize: 11, color: runResult.success ? 'var(--text-primary, #e0e0e0)' : '#f44336', whiteSpace: 'pre-wrap', margin: 0 }}>{runResult.output || '(no output)'}</pre>
              </div>
            )}
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #666)', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 48 }}>{'📝'}</div>
            <div style={{ fontSize: 14 }}>Select a file from the tree to open it</div>
            {!workspace && <div style={{ fontSize: 12, opacity: 0.7 }}>Browse for a project directory to get started</div>}
          </div>
        )}

        {/* ── Command Bar ── */}
        <div style={{ borderTop: '1px solid var(--border, #333)', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary, #16162a)', maxHeight: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '2px 10px', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted, #666)', flex: 1 }}>Terminal</span>
            <button style={{ background: 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 10, padding: '1px 6px' }} onClick={() => setShowCmdOutput(v => !v)}>{showCmdOutput ? '▼' : '▲'}</button>
            {commandOutput.length > 0 && (
              <button style={{ background: 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 10, padding: '1px 6px' }} onClick={() => setCommandOutput([])}>Clear</button>
            )}
          </div>
          {showCmdOutput && commandOutput.length > 0 && (
            <div ref={cmdOutputPanelRef} style={{ flex: 1, overflow: 'auto', padding: '4px 10px', fontSize: 11, fontFamily: 'monospace', minHeight: 40, maxHeight: 140, color: 'var(--text-secondary, #aaa)', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const }}>
              {commandOutput.map((entry, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div style={{ color: entry.success ? 'var(--accent, #646cff)' : '#f44336', fontWeight: 600 }}>$ {entry.cmd}</div>
                  <div style={{ color: entry.success ? 'var(--text-secondary, #ccc)' : '#f44336' }}>{entry.output}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', gap: 6, borderTop: '1px solid var(--border, #333)' }}>
            <span style={{ color: 'var(--accent, #646cff)', fontFamily: 'monospace', fontSize: 12 }}>$</span>
            <input
              ref={cmdInputRef}
              style={{ flex: 1, background: 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: 'var(--text-primary, #e0e0e0)', borderRadius: 4, padding: '4px 8px', fontSize: 12, fontFamily: 'monospace', outline: 'none' }}
              placeholder="Type a command... (npm install, python main.py, etc.)"
              value={commandBar}
              onChange={e => setCommandBar(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (commandBar.trim()) { executeCommand(commandBar.trim()); setCommandBar(''); }
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (commandHistory.length > 0) {
                    const idx = cmdHistIdx < 0 ? commandHistory.length - 1 : Math.max(0, cmdHistIdx - 1);
                    setCmdHistIdx(idx);
                    setCommandBar(commandHistory[idx]);
                  }
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (cmdHistIdx >= 0) {
                    const idx = cmdHistIdx + 1;
                    if (idx >= commandHistory.length) { setCmdHistIdx(-1); setCommandBar(''); }
                    else { setCmdHistIdx(idx); setCommandBar(commandHistory[idx]); }
                  }
                }
              }}
            />
            <button style={{ background: 'var(--accent, #646cff)', border: 'none', color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '3px 8px' }} onClick={() => { if (commandBar.trim()) { executeCommand(commandBar.trim()); setCommandBar(''); } }}>Run</button>
          </div>
        </div>
      </div>

      {/* ── Browse Dialog ── */}
      {browseVisible && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setBrowseVisible(false)}>
          <div style={{ width: 480, maxHeight: '70vh', background: 'var(--bg-secondary, #16162a)', border: '1px solid var(--border, #333)', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border, #333)' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{'📂'} Select Project Directory</span>
              <button onClick={() => setBrowseVisible(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #666)', cursor: 'pointer', fontSize: 16 }}>{'✕'}</button>
            </div>
            <div style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-muted, #666)', borderBottom: '1px solid var(--border, #333)' }}>{browsePath || 'Select a drive...'}</div>
            <div style={{ flex: 1, overflow: 'auto', padding: 8, minHeight: 200 }}>
              {browseLoading ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted, #666)' }}>Loading...</div>
              ) : browseEntries.map((e: any) => (
                <div key={e.path} onClick={() => e.isDir && navBrowse(e.path)}
                  style={{ padding: '4px 12px', cursor: e.isDir ? 'pointer' : 'default', fontSize: 12, borderRadius: 4, color: e.isDir ? 'var(--accent-light, #88f)' : 'var(--text-muted, #666)', opacity: e.isDir ? 1 : 0.5 }}
                  onMouseEnter={ev => { if (e.isDir) ev.currentTarget.style.background = 'var(--bg-tertiary, #222)'; }}
                  onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; }}>
                  {e.isDir ? '📂' : '📄'} {e.name}
                </div>
              ))}
            </div>
            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border, #333)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { if (browsePath) { const parent = browsePath.replace(/[\\/][^\\/]+[\\/]?$/, ''); navBrowse(parent || ''); } }} style={{ background: 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 12, padding: '4px 12px' }}>{'←'} Up</button>
              <button onClick={() => setBrowseVisible(false)} style={{ background: 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 12, padding: '4px 12px' }}>Cancel</button>
              <button onClick={() => { setWorkspace(browsePath); setBrowseVisible(false); setExpanded(new Set([browsePath])); }} disabled={!browsePath} style={{ background: browsePath ? 'var(--accent, #646cff)' : 'var(--bg-tertiary, #222)', border: 'none', color: browsePath ? '#fff' : 'var(--text-muted, #666)', borderRadius: 4, cursor: browsePath ? 'pointer' : 'default', fontSize: 12, padding: '4px 12px' }}>Select</button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Item Dialog ── */}
      {newItemMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setNewItemMenu(null)}>
          <div style={{ width: 360, background: 'var(--bg-secondary, #16162a)', border: '1px solid var(--border, #333)', borderRadius: 8, padding: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{'🌟'} Create New</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button style={{ flex: 1, background: !newItemIsDir ? 'var(--accent, #646cff)' : 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: !newItemIsDir ? '#fff' : 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '3px 8px' }} onClick={() => setNewItemIsDir(false)}>File</button>
              <button style={{ flex: 1, background: newItemIsDir ? 'var(--accent, #646cff)' : 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: newItemIsDir ? '#fff' : 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '3px 8px' }} onClick={() => setNewItemIsDir(true)}>Directory</button>
            </div>
            {!newItemIsDir && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted, #666)', marginBottom: 4 }}>Template (optional):</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {Object.entries(FILE_TEMPLATES).map(([key, t]) => (
                    <button
                      key={key}
                      style={{ background: newItemTemplate === key ? 'var(--accent, #646cff)' : 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: newItemTemplate === key ? '#fff' : 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}
                      onClick={() => {
                        setNewItemTemplate(key);
                        const base = newItemName.replace(/\.[^.]+$/, '') || 'untitled';
                        setNewItemName(base + t.ext);
                      }}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <input
              autoFocus
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              placeholder={newItemIsDir ? 'Folder name' : 'File name (e.g., main.py)'}
              style={{ width: '100%', background: 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: 'var(--text-primary, #e0e0e0)', borderRadius: 4, padding: '6px 10px', fontSize: 13, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  createItem(newItemMenu.parentPath, newItemName, newItemIsDir, newItemTemplate || undefined);
                  setNewItemMenu(null);
                }
                if (e.key === 'Escape') setNewItemMenu(null);
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={{ background: 'var(--bg-tertiary, #222)', border: '1px solid var(--border, #333)', color: 'var(--text-secondary, #aaa)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '3px 8px' }} onClick={() => setNewItemMenu(null)}>Cancel</button>
              <button
                style={{ background: 'var(--accent, #646cff)', border: 'none', color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '3px 8px', opacity: newItemName.trim() ? 1 : 0.5 }}
                disabled={!newItemName.trim()}
                onClick={() => {
                  createItem(newItemMenu.parentPath, newItemName, newItemIsDir, newItemTemplate || undefined);
                  setNewItemMenu(null);
                }}
              >Create</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Context Menu ── */}
      {ctxMenu && (
        <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000, background: 'var(--bg-secondary, #16162a)', border: '1px solid var(--border, #333)', borderRadius: 6, padding: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
          <div onClick={() => { openFile(ctxMenu.path); setCtxMenu(null); }}
            style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 12, borderRadius: 4 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary, #222)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{'👁'} Open</div>
          {!ctxMenu.isDir && <div onClick={() => { setSelectedFile(ctxMenu.path); setCtxMenu(null); setTimeout(runFile, 100); }}
            style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 12, borderRadius: 4 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary, #222)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{'▶'} Run</div>}
          {ctxMenu.isDir && <>
            <div onClick={() => { setNewItemMenu({ parentPath: ctxMenu.path }); setNewItemIsDir(false); setNewItemName(''); setNewItemTemplate(null); setCtxMenu(null); }}
              style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 12, borderRadius: 4 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary, #222)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{'📁+'} New File</div>
            <div onClick={() => { setNewItemMenu({ parentPath: ctxMenu.path }); setNewItemIsDir(true); setNewItemName(''); setCtxMenu(null); }}
              style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 12, borderRadius: 4 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary, #222)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{'📂+'} New Folder</div>
          </>}
          <div style={{ height: 1, background: 'var(--border, #333)', margin: '4px 0' }} />
          <div onClick={() => { setRenaming(ctxMenu.path); setRenameName(ctxMenu.name); setCtxMenu(null); }}
            style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 12, borderRadius: 4 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary, #222)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{'✏️'} Rename</div>
          <div onClick={() => { deleteItem(ctxMenu.path, ctxMenu.name); setCtxMenu(null); }}
            style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 12, borderRadius: 4, color: '#f44336' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary, #222)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{'🗑️'} Delete</div>
        </div>
      )}
    </div>
  );
}

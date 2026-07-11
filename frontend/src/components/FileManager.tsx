import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface FileEntry { name: string; path: string; isDir: boolean; size?: number; children?: FileEntry[]; }

interface FileManagerProps {
  onFileRun?: (filePath: string, result: any) => void;
}

export function FileManager({ onFileRun }: FileManagerProps) {
  const [workspace, setWorkspace] = useState('');
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [browsePath, setBrowsePath] = useState('');
  const [browseEntries, setBrowseEntries] = useState<Array<{name:string;path:string;isDir:boolean}>>([]);
  const [showBrowser, setShowBrowser] = useState(false);
  const [selectedFile, setSelectedFile] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  const [newFileName, setNewFileName] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);
  const [extensions, setExtensions] = useState<Array<{ext:string;language:string}>>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [contextMenu, setContextMenu] = useState<{x:number;y:number;path:string;isDir:boolean;name:string}|null>(null);

  const loadTree = useCallback(async () => {
    if (!workspace) return;
    const res = await api.listTree(workspace, 3);
    if (res.tree) setTree(res.tree);
  }, [workspace]);

  const loadExtensions = useCallback(async () => {
    const res = await api.getSupportedExtensions();
    if (res.extensions) setExtensions(res.extensions);
  }, []);

  useEffect(() => { loadExtensions(); }, [loadExtensions]);
  useEffect(() => { loadTree(); }, [loadTree]);

  const pickFolder = async () => {
    setShowBrowser(true);
    const res = await api.browseFiles('');
    if (res.entries) { setBrowsePath(''); setBrowseEntries(res.entries); }
  };

  const browseTo = async (p: string) => {
    const res = await api.browseFiles(p);
    if (res.entries) { setBrowsePath(res.path); setBrowseEntries(res.entries); }
  };

  const selectWorkspace = async (p: string) => {
    await api.setWorkspace(p);
    setWorkspace(p);
    setShowBrowser(false);
    setTree([]);
  };

  const openFile = async (filePath: string) => {
    setSelectedFile(filePath);
    setRunResult(null);
    try {
      const res = await api.readAbsolute(filePath);
      if (res.type === 'file') {
        setFileContent(res.content || '');
        setEditContent(res.content || '');
        setIsEditing(false);
      }
    } catch {}
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    await api.writeFile(selectedFile, editContent);
    setFileContent(editContent);
    setIsEditing(false);
  };

  const runSelectedFile = async () => {
    if (!selectedFile || running) return;
    setRunning(true);
    setRunResult(null);
    try {
      const res = await api.runFile(selectedFile, 30000);
      setRunResult(res);
      onFileRun?.(selectedFile, res);
    } catch (e: any) {
      setRunResult({ success: false, output: e.message, exitCode: 1, language: 'Error', duration: 0 });
    }
    setRunning(false);
  };

  const createNewFile = async () => {
    if (!newFileName || !workspace) return;
    const isDir = !newFileName.includes('.');
    const fullPath = workspace + '\\' + newFileName;
    await api.createFile(fullPath, '', isDir);
    setNewFileName('');
    setShowNewFile(false);
    loadTree();
  };

  const handleContextMenu = (e: React.MouseEvent, filePath: string, isDir: boolean, name: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, path: filePath, isDir, name });
  };

  const deleteItem = async (filePath: string) => {
    if (!confirm('Delete ' + filePath + '?')) return;
    await api.deleteFile(filePath);
    setContextMenu(null);
    if (selectedFile === filePath) { setSelectedFile(''); setFileContent(''); }
    loadTree();
  };

  const toggleDir = (dirPath: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath); else next.add(dirPath);
      return next;
    });
  };

  const extIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const icons: Record<string, string> = {
      py: '\ud83d\udc0d', js: '\u26a1', ts: '\ud83d\udd27', jsx: '\u269b\ufe0f', tsx: '\u269b\ufe0f',
      html: '\ud83c\udf10', css: '\ud83c\udfa8', json: '\ud83d\udccb', md: '\ud83d\udcdd',
      c: '\u2699\ufe0f', cpp: '\u2699\ufe0f', h: '\u2699\ufe0f', hpp: '\u2699\ufe0f',
      go: '\ud83d\ude80', rs: '\ud83e\uddea', java: '\u2615', rb: '\ud83d\udc8e',
      php: '\ud83d\udc18', sh: '\ud83d\udcbb', ps1: '\ud83d\udcbb', bat: '\ud83d\udcbb',
      txt: '\ud83d\udcc4', yml: '\u2699\ufe0f', yaml: '\u2699\ufe0f', toml: '\u2699\ufe0f',
      xml: '\ud83c\udf10', sql: '\ud83d\udcbe', db: '\ud83d\udcbe', sqlite: '\ud83d\udcbe',
    };
    return icons[ext] || '\ud83d\udcc4';
  };

  const langColor = (lang: string) => {
    const colors: Record<string, string> = {
      Python: '#3572A5', JavaScript: '#f1e05a', TypeScript: '#3178c6', C: '#555555', 'C++': '#f34b7d',
      Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', Ruby: '#701516', PHP: '#4F5D95',
      Shell: '#89e051', PowerShell: '#012456', 'C#': '#178600',
    };
    return colors[lang] || '#8b949e';
  };

  const renderTree = (items: FileEntry[], depth = 0) => {
    return items.map(item => (
      <div key={item.path}>
        <div
          onClick={() => item.isDir ? toggleDir(item.path) : openFile(item.path)}
          onContextMenu={(e) => handleContextMenu(e, item.path, item.isDir, item.name)}
          style={{
            padding: '2px 8px', paddingLeft: 8 + depth * 16, cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 4,
            background: selectedFile === item.path ? 'rgba(88,166,255,0.15)' : 'transparent',
            color: selectedFile === item.path ? '#58a6ff' : '#c9d1d9',
            borderRadius: 3, userSelect: 'none',
          }}
          onMouseEnter={(e) => { if (selectedFile !== item.path) (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
          onMouseLeave={(e) => { if (selectedFile !== item.path) (e.target as HTMLElement).style.background = 'transparent'; }}
        >
          {item.isDir ? (
            <span style={{ fontSize: 10, width: 12 }}>{expandedDirs.has(item.path) ? '\u25bc' : '\u25b6'}</span>
          ) : <span style={{ width: 12 }} />}
          <span>{item.isDir ? '\ud83d\udcc1' : extIcon(item.name)}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
          {!item.isDir && item.size != null && <span style={{ fontSize: 10, color: '#484f58' }}>{item.size > 1024 ? (item.size/1024).toFixed(1)+'KB' : item.size+'B'}</span>}
        </div>
        {item.isDir && expandedDirs.has(item.path) && item.children && renderTree(item.children, depth + 1)}
      </div>
    ));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: '#c9d1d9', fontSize: 13 }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>\ud83d\udcc2 File Manager</span>
        <button onClick={pickFolder} style={{ marginLeft: 'auto', background: '#238636', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>Open Folder</button>
        {workspace && <button onClick={() => setShowNewFile(true)} style={{ background: '#1f6feb', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>+ New</button>}
      </div>

      {/* Workspace path */}
      {workspace && (
        <div style={{ padding: '4px 12px', fontSize: 11, color: '#484f58', borderBottom: '1px solid #21262d', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>\ud83d\udccd</span><span>{workspace}</span>
          <button onClick={loadTree} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 11 }}>\u21bb Refresh</button>
        </div>
      )}

      {/* New file dialog */}
      {showNewFile && (
        <div style={{ padding: '8px 12px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', gap: 6 }}>
          <input value={newFileName} onChange={e => setNewFileName(e.target.value)} placeholder="filename.ext or foldername" onKeyDown={e => e.key === 'Enter' && createNewFile()}
            style={{ flex: 1, background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 4, padding: '3px 8px', fontSize: 12 }} />
          <button onClick={createNewFile} style={{ background: '#238636', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>Create</button>
          <button onClick={() => setShowNewFile(false)} style={{ background: '#30363d', color: '#c9d1d9', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
        </div>
      )}

      {/* File tree */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {!workspace ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#484f58' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>\ud83d\udcc2</div>
            <div>Click <b>Open Folder</b> to select a project directory</div>
          </div>
        ) : tree.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#484f58' }}>Loading...</div>
        ) : renderTree(tree)}
      </div>

      {/* File content / editor */}
      {selectedFile && (
        <div style={{ borderTop: '1px solid #30363d', maxHeight: '50%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6, background: '#161b22', borderBottom: '1px solid #21262d' }}>
            <span style={{ fontSize: 11, color: '#58a6ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedFile.split('\\').pop()}</span>
            <button onClick={() => setIsEditing(!isEditing)} style={{ background: isEditing ? '#da3633' : '#30363d', color: '#c9d1d9', border: 'none', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>{isEditing ? 'Cancel' : 'Edit'}</button>
            {isEditing && <button onClick={saveFile} style={{ background: '#238636', color: '#fff', border: 'none', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>Save</button>}
            <button onClick={runSelectedFile} disabled={running} style={{ background: running ? '#484f58' : '#1f6feb', color: '#fff', border: 'none', borderRadius: 3, padding: '2px 8px', cursor: running ? 'not-allowed' : 'pointer', fontSize: 10 }}>{running ? '...' : '\u25b6 Run'}</button>
          </div>
          {isEditing ? (
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
              style={{ flex: 1, background: '#0d1117', color: '#c9d1d9', border: 'none', padding: 8, fontFamily: 'Cascadia Code, Menlo, monospace', fontSize: 12, resize: 'none', minHeight: 120 }} />
          ) : (
            <pre style={{ flex: 1, background: '#0d1117', color: '#c9d1d9', margin: 0, padding: 8, fontFamily: 'Cascadia Code, Menlo, monospace', fontSize: 12, overflow: 'auto', minHeight: 80, maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {fileContent.slice(0, 20000)}{fileContent.length > 20000 ? '\n...[truncated]' : ''}
            </pre>
          )}
        </div>
      )}

      {/* Run result */}
      {runResult && (
        <div style={{ borderTop: '1px solid #30363d', padding: '8px 12px', maxHeight: 200, overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ color: runResult.success ? '#3fb950' : '#f85149', fontWeight: 600, fontSize: 12 }}>
              {runResult.success ? '\u2705' : '\u274c'} {runResult.language} {runResult.duration ? '(' + runResult.duration + 'ms)' : ''}
            </span>
            {runResult.exitCode !== undefined && <span style={{ fontSize: 10, color: '#484f58' }}>exit: {runResult.exitCode}</span>}
          </div>
          {runResult.compileOutput && (
            <pre style={{ background: '#161b22', color: '#d29922', padding: 6, borderRadius: 4, fontSize: 11, margin: '4px 0', maxHeight: 80, overflow: 'auto', whiteSpace: 'pre-wrap' }}>[compile] {runResult.compileOutput}</pre>
          )}
          <pre style={{ background: '#0d1117', color: runResult.success ? '#c9d1d9' : '#f85149', padding: 6, borderRadius: 4, fontSize: 11, margin: 0, maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {runResult.output || '(no output)'}
          </pre>
        </div>
      )}

      {/* Browse dialog (folder picker) */}
      {showBrowser && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
             onClick={() => setShowBrowser(false)}>
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, width: 500, maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
               onClick={e => e.stopPropagation()}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #30363d', fontWeight: 600 }}>Select Project Folder</div>
            <div style={{ padding: '4px 12px', fontSize: 11, color: '#58a6ff', borderBottom: '1px solid #21262d', wordBreak: 'break-all', minHeight: 20 }}>{browsePath || '(drives)'}</div>
            <div style={{ flex: 1, overflow: 'auto', padding: 4 }}>
              {browseEntries.map(e => (
                <div key={e.path} onClick={() => e.isDir ? browseTo(e.path) : undefined}
                  style={{ padding: '4px 12px', cursor: e.isDir ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: e.isDir ? 1 : 0.5 }}
                  onMouseEnter={(ev) => e.isDir && ((ev.target as HTMLElement).style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={(ev) => ((ev.target as HTMLElement).style.background = 'transparent')}>
                  <span>{e.isDir ? '\ud83d\udcc1' : '\ud83d\udcc4'}</span>
                  <span>{e.name}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '8px 16px', borderTop: '1px solid #30363d', display: 'flex', gap: 8 }}>
              <button onClick={() => { if (browsePath) { const parent = browsePath.replace(/[\\/][^\\/]+[\\/]?$/, ''); browseTo(parent || ''); } }}
                style={{ background: '#30363d', color: '#c9d1d9', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>\u2190 Back</button>
              <button onClick={() => selectWorkspace(browsePath)} disabled={!browsePath}
                style={{ background: browsePath ? '#238636' : '#484f58', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 16px', cursor: browsePath ? 'pointer' : 'not-allowed', fontSize: 12, marginLeft: 'auto' }}>Select This Folder</button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999, background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '4px 0', minWidth: 140 }}
             onMouseLeave={() => setContextMenu(null)}>
          <div onClick={() => { openFile(contextMenu.path); setContextMenu(null); }}
            style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 12 }} onMouseEnter={(e) => (e.target as HTMLElement).style.background = '#1f6feb'} onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'transparent'}>\ud83d\udc41 Open</div>
          {!contextMenu.isDir && (
            <div onClick={() => { setSelectedFile(contextMenu.path); runSelectedFile(); setContextMenu(null); }}
              style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 12 }} onMouseEnter={(e) => (e.target as HTMLElement).style.background = '#1f6feb'} onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'transparent'}>\u25b6 Run</div>
          )}
          <div style={{ height: 1, background: '#30363d', margin: '4px 0' }} />
          <div onClick={() => deleteItem(contextMenu.path)}
            style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 12, color: '#f85149' }} onMouseEnter={(e) => (e.target as HTMLElement).style.background = 'rgba(248,81,73,0.1)'} onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'transparent'}>\u274c Delete</div>
        </div>
      )}
    </div>
  );
}

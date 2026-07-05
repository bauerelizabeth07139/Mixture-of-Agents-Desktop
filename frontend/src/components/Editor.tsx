import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

interface FileEntry { name: string; size?: number; }

export function EditorPanel() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dirs, setDirs] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [currentFile, setCurrentFile] = useState('');
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('plaintext');
  const [modified, setModified] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadDir = async (dirPath?: string) => {
    try {
      const res = await fetch('/api/coding/list-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workdir: dirPath || undefined }),
      });
      const data = await res.json();
      setFiles(data.files || []);
      setDirs(data.dirs || []);
      setCurrentPath(data.path || '');
    } catch {}
  };

  const loadFile = async (filePath: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/coding/read-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, workdir: currentPath }),
      });
      const data = await res.json();
      if (data.content !== undefined) {
        setContent(data.content);
        setCurrentFile(filePath);
        setModified(false);
        setLanguage(guessLanguage(filePath));
      }
    } catch {}
    setLoading(false);
  };

  const saveFile = async () => {
    if (!currentFile) return;
    try {
      await fetch('/api/coding/write-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: currentFile, content, workdir: currentPath }),
      });
      setModified(false);
    } catch {}
  };

  const execInTerminal = async () => {
    if (!currentFile) return;
    const ext = currentFile.split('.').pop()?.toLowerCase();
    let cmd = '';
    if (ext === 'py') cmd = `python ${currentFile}`;
    else if (ext === 'js') cmd = `node ${currentFile}`;
    else if (ext === 'ts') cmd = `npx ts-node ${currentFile}`;
    else if (ext === 'sh') cmd = `bash ${currentFile}`;
    else if (ext === 'html') cmd = `start ${currentFile}`;
    else return;
    try {
      const res = await fetch('/api/coding/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, workdir: currentPath, timeout: 30000 }),
      });
      const data = await res.json();
      alert(data.success ? `Output:\n${data.output.slice(0, 1000)}` : `Error:\n${data.output.slice(0, 1000)}`);
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  useEffect(() => { loadDir(); }, []);

  return (
    <div style={{ height: '100%', display: 'flex', background: '#0d1117' }}>
      {/* File tree sidebar */}
      <div style={{ width: 220, borderRight: '1px solid #30363d', overflow: 'auto', fontSize: 12, flexShrink: 0 }}>
        <div style={{ padding: '6px 10px', background: '#161b22', borderBottom: '1px solid #30363d', color: '#8b949e', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Explorer</span>
          <button onClick={() => loadDir()} style={{ background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 14 }} title="Refresh">&#x21bb;</button>
        </div>
        {currentPath && (
          <div style={{ padding: '4px 10px', color: '#484f48', fontSize: 10, borderBottom: '1px solid #21262d', wordBreak: 'break-all' }}>
            {currentPath}
          </div>
        )}
        <div style={{ padding: 4 }}>
          {dirs.map(d => (
            <div key={d}
              onClick={() => loadDir(currentPath ? currentPath + '/' + d : d)}
              style={{ padding: '3px 8px', cursor: 'pointer', color: '#79c0ff', borderRadius: 3 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#161b22')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              &#128193; {d}
            </div>
          ))}
          {files.map(f => (
            <div key={f.name}
              onClick={() => loadFile(f.name)}
              style={{ padding: '3px 8px', cursor: 'pointer', color: currentFile === f.name ? '#58a6ff' : '#c9d1d9', background: currentFile === f.name ? '#161b22' : 'transparent', borderRadius: 3 }}
              onMouseEnter={e => { if (currentFile !== f.name) e.currentTarget.style.background = '#161b22'; }}
              onMouseLeave={e => { if (currentFile !== f.name) e.currentTarget.style.background = 'transparent'; }}>
              &#128196; {f.name} {f.size ? <span style={{ color: '#484f48', fontSize: 10 }}>({formatSize(f.size)})</span> : null}
            </div>
          ))}
        </div>
      </div>

      {/* Editor area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
        <div style={{ padding: '4px 12px', background: '#161b22', borderBottom: '1px solid #30363d', fontSize: 11, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 8 }}>
          {currentFile ? (
            <>
              <span style={{ color: '#58a6ff' }}>{currentFile}</span>
              {modified && <span style={{ color: '#f0883e' }}>&#9679;</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={saveFile} disabled={!modified} style={{ ...btnStyle, opacity: modified ? 1 : 0.4 }}>Save</button>
                <button onClick={execInTerminal} style={btnStyle}>&#9654; Run</button>
              </span>
            </>
          ) : (
            <span style={{ color: '#484f48' }}>Select a file to edit</span>
          )}
        </div>
        {/* Monaco Editor */}
        <div style={{ flex: 1 }}>
          {currentFile ? (
            <Editor
              language={language}
              value={content}
              onChange={(v) => { setContent(v || ''); setModified(true); }}
              theme="vs-dark"
              options={{
                fontSize: 13,
                fontFamily: 'Cascadia Code, Menlo, Monaco, Consolas, monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
              }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#484f48', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 32 }}>&#128196;</span>
              <span>Open a file from the explorer</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 4,
  padding: '2px 8px', cursor: 'pointer', fontSize: 11,
};

function guessLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', c: 'c', cpp: 'cpp',
    h: 'c', hpp: 'cpp', cs: 'csharp', php: 'php', swift: 'swift', kt: 'kotlin',
    html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
    json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', sql: 'sql', sh: 'shell', bash: 'shell', ps1: 'powershell',
    bat: 'bat', cmd: 'bat', dockerfile: 'dockerfile',
  };
  return map[ext] || 'plaintext';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

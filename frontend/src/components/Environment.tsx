import React, { useState, useEffect } from 'react';

interface ToolInfo { available: boolean; version: string | null; path: string | null; }
interface EnvData {
  cwd: string; homeDir: string; platform: string; arch: string; nodeVersion: string;
  hostname: string; username: string; totalMemory: string; freeMemory: string; cpus: string;
  shell: string; tools: Record<string, ToolInfo>; desktopFiles: string[]; pathEntries: string[];
}

export function EnvironmentPanel() {
  const [env, setEnv] = useState<EnvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'available' | 'missing'>('all');

  const loadEnv = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/coding/environment');
      const data = await res.json();
      setEnv(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadEnv(); }, []);

  if (loading) return <div style={{ padding: 20, color: '#8b949e' }}>Scanning environment...</div>;
  if (!env) return <div style={{ padding: 20, color: '#f85149' }}>Failed to load environment</div>;

  const toolEntries = Object.entries(env.tools);
  const filtered = filter === 'all' ? toolEntries : filter === 'available' ? toolEntries.filter(([, t]) => t.available) : toolEntries.filter(([, t]) => !t.available);

  return (
    <div style={{ padding: 16, color: '#c9d1d9', fontSize: 13, overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, color: '#58a6ff' }}>Environment Detection</h2>
        <button onClick={loadEnv} style={{ background: '#21262d', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>Rescan</button>
      </div>

      {/* System info */}
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: '#f0883e' }}>&#128187; System</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12 }}>
          <span style={{ color: '#8b949e' }}>Hostname</span><span>{env.hostname}</span>
          <span style={{ color: '#8b949e' }}>User</span><span>{env.username}</span>
          <span style={{ color: '#8b949e' }}>Platform</span><span>{env.platform} / {env.arch}</span>
          <span style={{ color: '#8b949e' }}>CPU</span><span>{env.cpus}</span>
          <span style={{ color: '#8b949e' }}>Memory</span><span>{env.totalMemory} ({env.freeMemory} free)</span>
          <span style={{ color: '#8b949e' }}>Shell</span><span style={{ wordBreak: 'break-all' }}>{env.shell}</span>
          <span style={{ color: '#8b949e' }}>Node</span><span>{env.nodeVersion}</span>
          <span style={{ color: '#8b949e' }}>Home</span><span style={{ wordBreak: 'break-all', fontSize: 11 }}>{env.homeDir}</span>
        </div>
      </div>

      {/* Tool filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['all', 'available', 'missing'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ background: filter === f ? '#1f6feb' : '#21262d', color: filter === f ? '#fff' : '#8b949e', border: '1px solid #30363d', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 11, textTransform: 'capitalize' }}>
            {f} ({f === 'all' ? toolEntries.length : f === 'available' ? toolEntries.filter(([, t]) => t.available).length : toolEntries.filter(([, t]) => !t.available).length})
          </button>
        ))}
      </div>

      {/* Tools grid */}
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 120px 1fr 200px', gap: 0, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderBottom: '1px solid #30363d', color: '#8b949e' }}>
          <span></span><span>Tool</span><span>Version</span><span>Path</span>
        </div>
        {filtered.map(([name, tool]) => (
          <div key={name} style={{ display: 'grid', gridTemplateColumns: '40px 120px 1fr 200px', gap: 0, padding: '5px 12px', borderBottom: '1px solid #21262d', alignItems: 'center' }}>
            <span>{tool.available ? '\u2705' : '\u274C'}</span>
            <span style={{ fontWeight: 600, color: tool.available ? '#c9d1d9' : '#484f48' }}>{name}</span>
            <span style={{ color: tool.available ? '#7ee787' : '#484f48', fontSize: 11, wordBreak: 'break-all' }}>{tool.version || '-'}</span>
            <span style={{ color: '#484f48', fontSize: 10, wordBreak: 'break-all' }}>{tool.path || '-'}</span>
          </div>
        ))}
      </div>

      {/* PATH entries */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', color: '#8b949e', fontSize: 12 }}>PATH Entries ({env.pathEntries.length})</summary>
        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 8, marginTop: 4, maxHeight: 200, overflow: 'auto' }}>
          {env.pathEntries.map((p, i) => (
            <div key={i} style={{ fontSize: 11, color: '#8b949e', padding: '2px 0', fontFamily: 'monospace' }}>{p}</div>
          ))}
        </div>
      </details>
    </div>
  );
}

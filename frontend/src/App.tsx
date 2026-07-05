import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './services/api';
import type { Provider, ProviderPreset, Model, McpPreset, SkillPreset, McpServerConfig, SkillConfig, Project } from './types';
import { TerminalPanel } from './components/Terminal';
import { EditorPanel } from './components/Editor';
import { EnvironmentPanel } from './components/Environment';

// ─── Helper Components ───

function CapabilityBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="capability-bar">
      <span className="capability-label">{label}</span>
      <div className="capability-track"><div className="capability-fill" style={{ width: value * 10 + '%', background: color }} /></div>
      <span className="capability-value">{value}</span>
    </div>
  );
}

function CostEfficiencySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [inputVal, setInputVal] = useState(String(value));
  const handleSlider = (v: number) => { onChange(v); setInputVal(String(v)); };
  const handleInput = (s: string) => { setInputVal(s); const n = parseFloat(s); if (!isNaN(n) && n >= 0 && n <= 1) onChange(n); };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
        <span>🚀 效率 (0)</span><span>⚖️ 均衡 (0.5)</span><span>💰 成本 (1)</span>
      </div>
      <div className="slider-container">
        <input type="range" className="slider" min={0} max={1} step={0.01} value={value} onChange={e => handleSlider(parseFloat(e.target.value))} />
        <input type="number" value={inputVal} onChange={e => handleInput(e.target.value)} min={0} max={1} step={0.01}
          style={{ width: 56, textAlign: 'center', fontWeight: 600, fontSize: 12, padding: '4px 6px' }} />
      </div>
    </div>
  );
}

// ─── Tool Call Card (like Codex/Claude Code) ───
function ToolCard({ tool }: { tool: { name: string; status: string; output?: string; icon: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="tool-card">
      <div className="tool-card-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-icon">{tool.icon}</span>
        <span className="tool-name">{tool.name}</span>
        <span className={`tool-status ${tool.status}`}>
          {tool.status === 'running' ? '⏳ 运行中' : tool.status === 'success' ? '✅ 完成' : '❌ 失败'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && tool.output && (
        <div className="tool-card-body">{tool.output}</div>
      )}
    </div>
  );
}

// ─── Message Component ───
function ChatMessage({ msg }: { msg: ChatMsg }) {
  const roleClass = msg.role === 'user' ? 'user' : msg.role === 'orchestrator' ? 'orchestrator' : msg.role === 'error' ? 'error' : 'system';
  const roleIcon = msg.role === 'user' ? '👤' : msg.role === 'orchestrator' ? '🧠' : msg.role === 'error' ? '⚠️' : msg.role === 'agent' ? '🤖' : '💬';
  const roleName = msg.role === 'user' ? '你' : msg.role === 'orchestrator' ? '调度引擎' : msg.role === 'error' ? '系统' : msg.role === 'agent' ? (msg.agentName || '子代理') : '系统';
  return (
    <div className="message">
      <div className={`message-avatar ${roleClass}`}>{roleIcon}</div>
      <div className="message-body">
        <div className="message-header">
          <span className="message-name">{roleName}</span>
          {msg.model && <span className="message-model">{msg.model}</span>}
          <span className="message-time">{msg.time}</span>
        </div>
        <div className="message-content">
          {msg.content.split('\n').map((line, i) => {
            if (line.startsWith('```')) return <pre key={i}><code>{line.replace(/^```\w*/, '')}</code></pre>;
            return <div key={i}>{line || <br />}</div>;
          })}
        </div>
        {msg.tools && msg.tools.map((t, i) => <ToolCard key={i} tool={t} />)}
        {msg.agents && msg.agents.map((a, i) => (
          <div key={i} className="agent-status-card">
            <span className={`agent-status-dot ${a.status}`} />
            <div className="agent-status-info">
              <div className="agent-status-name">{a.name}</div>
              <div className="agent-status-task">{a.task}</div>
              <div className="agent-status-model">{a.model}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Welcome Screen ───
function WelcomeScreen({ onQuickStart }: { onQuickStart: (task: string) => void }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-logo">🧬</div>
      <div className="welcome-title">Mixture of Agents</div>
      <div className="welcome-subtitle">多模型协同智能体系统 — 基于 Claude Code 内核的智能调度引擎，自动分配最适合的模型完成任务</div>
      <div className="welcome-cards">
        <div className="welcome-card" onClick={() => onQuickStart('帮我写一个 Express.js REST API，包含用户 CRUD 操作和 SQLite 数据库')}>
          <div className="welcome-card-icon">💻</div>
          <div className="welcome-card-title">编写代码</div>
          <div className="welcome-card-desc">创建项目、编写代码、自动测试</div>
        </div>
        <div className="welcome-card" onClick={() => onQuickStart('分析当前目录下的 CSV 数据文件，生成统计报告和可视化图表建议')}>
          <div className="welcome-card-icon">📊</div>
          <div className="welcome-card-title">分析数据</div>
          <div className="welcome-card-desc">数据分析、报告生成、趋势发现</div>
        </div>
        <div className="welcome-card" onClick={() => onQuickStart('帮我设计一个博客系统的架构方案，包括前后端技术选型、数据库设计和部署方案')}>
          <div className="welcome-card-icon">🏗️</div>
          <div className="welcome-card-title">系统设计</div>
          <div className="welcome-card-desc">架构设计、技术选型、方案评估</div>
        </div>
      </div>
    </div>
  );
}

// ─── Types for Chat ───
interface ChatMsg {
  id: string; role: 'user' | 'orchestrator' | 'agent' | 'system' | 'error';
  content: string; time: string; model?: string; agentName?: string;
  tools?: Array<{ name: string; status: string; output?: string; icon: string }>;
  agents?: Array<{ name: string; status: string; task: string; model: string }>;
}

// ─── Settings Panel (right side) ───
function SettingsPanel({ providers, ratio, setRatio, thinking, setThinking, modelId, setModelId, visible, onClose }: {
  providers: Provider[]; ratio: number; setRatio: (v: number) => void;
  thinking: string; setThinking: (v: any) => void;
  modelId: string; setModelId: (v: string) => void;
  visible: boolean; onClose: () => void;
}) {
  if (!visible) return null;
  const allModels = providers.flatMap(p => p.models.filter(m => m.type === 'llm').map(m => ({ ...m, pName: p.name, pIcon: p.icon })));
  const totalKeys = providers.reduce((s, p) => s + p.apiKeys.length, 0);
  return (
    <div className="settings-drawer">
      <div className="settings-drawer-header">
        <h3>⚙️ 设置</h3>
        <button className="btn btn-sm btn-icon" onClick={onClose}>✕</button>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">宏观调控模型</div>
        <select value={modelId} onChange={e => setModelId(e.target.value)}>
          <option value="">自动选择</option>
          {allModels.map(m => <option key={m.id} value={m.id}>{m.pIcon} {m.pName} - {m.name}</option>)}
        </select>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">思考强度</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['low', 'medium', 'high'].map(m => (
            <button key={m} className={`btn btn-sm ${thinking === m ? 'btn-primary' : ''}`}
              onClick={() => setThinking(m)} style={{ flex: 1 }}>
              {m === 'low' ? '低' : m === 'medium' ? '中' : '高'}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">成本 / 效率 偏好</div>
        <CostEfficiencySlider value={ratio} onChange={setRatio} />
      </div>
      <div className="settings-section">
        <div className="settings-section-title">快速统计</div>
        <div className="settings-row"><label>已配置提供商</label><span>{providers.length}</span></div>
        <div className="settings-row"><label>可用模型</label><span>{allModels.length}</span></div>
        <div className="settings-row"><label>API Keys</label><span>{totalKeys}</span></div>
      </div>
    </div>
  );
}

// ─── Provider Management Panel ───
function ProviderPanel({ providers, onRefresh }: { providers: Provider[]; onRefresh: () => void }) {
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [selProv, setSelProv] = useState('');
  const [newKey, setNewKey] = useState('');
  const [fetching, setFetching] = useState('');

  const load = useCallback(async () => { setPresets(await api.fetchPresets()); }, []);
  useEffect(() => { load(); }, [load]);

  const addPreset = async (pid: string) => { await api.addPreset(pid); onRefresh(); };
  const addCustom = async () => { if (customName && customUrl) { await api.addCustom(customName, customUrl); setCustomName(''); setCustomUrl(''); onRefresh(); } };
  const addKey = async () => { if (selProv && newKey) { await api.addKey(selProv, newKey); setNewKey(''); onRefresh(); } };
  const fetchModels = async (pid: string) => { setFetching(pid); await api.fetchModels(pid); setFetching(''); onRefresh(); };

  return (
    <div className="tab-panel">
      <h3 style={{ marginBottom: 16, fontSize: 15 }}>📦 预设提供商</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 24 }}>
        {presets.map(p => {
          const added = providers.some(pr => pr.name === p.name);
          return (
            <div key={p.id} className="card" style={{ cursor: added ? 'default' : 'pointer', opacity: added ? 0.5 : 1, padding: 12 }}
              onClick={() => !added && addPreset(p.id)}>
              <div className="card-title">{p.icon} {p.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{p.description}</div>
              {added && <span className="badge badge-success" style={{ marginTop: 6 }}>已添加</span>}
            </div>
          );
        })}
      </div>

      <h3 style={{ marginBottom: 12, fontSize: 15 }}>🔧 自定义提供商</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input placeholder="名称" value={customName} onChange={e => setCustomName(e.target.value)} style={{ flex: 1 }} />
        <input placeholder="Base URL" value={customUrl} onChange={e => setCustomUrl(e.target.value)} style={{ flex: 2 }} />
        <button className="btn btn-primary" onClick={addCustom}>添加</button>
      </div>

      {providers.length > 0 && (
        <>
          <h3 style={{ marginBottom: 12, fontSize: 15 }}>🔑 API Key 管理</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <select value={selProv} onChange={e => setSelProv(e.target.value)} style={{ flex: 1 }}>
              <option value="">选择提供商</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.icon || '🔌'} {p.name}</option>)}
            </select>
            <input placeholder="API Key" value={newKey} onChange={e => setNewKey(e.target.value)} type="password" style={{ flex: 2 }} />
            <button className="btn btn-primary" onClick={addKey}>添加</button>
          </div>
          {providers.map(p => (
            <div key={p.id} className="card">
              <div className="card-title">
                {p.icon || '🔌'} {p.name}
                <span className="badge badge-info" style={{ marginLeft: 8 }}>{p.models.length} 模型</span>
                <span className="badge badge-success" style={{ marginLeft: 4 }}>{p.apiKeys.length} Keys</span>
                {p.apiKeys.length > 0 && (
                  <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => fetchModels(p.id)} disabled={fetching === p.id}>
                    {fetching === p.id ? '⏳ 获取中...' : '🔄 获取模型'}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>{p.baseUrl}</div>
              {p.models.map(m => (
                <div key={m.id} style={{ padding: '3px 0', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{m.name}</span>
                  <span className={`badge ${m.type === 'llm' ? 'badge-info' : m.type === 'tts' ? 'badge-accent' : m.type === 'image' ? 'badge-warning' : 'badge-success'}`}>{m.type}</span>
                  {m.capabilities.multimodal && <span className="badge badge-warning">多模态</span>}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Model Capabilities Panel ───
function ModelPanel({ providers }: { providers: Provider[] }) {
  const allModels = providers.flatMap(p => p.models.map(m => ({ ...m, providerName: p.name, providerIcon: p.icon })));
  const [selected, setSelected] = useState('');
  const model = allModels.find(m => m.id === selected);
  return (
    <div className="tab-panel">
      <h3 style={{ marginBottom: 16, fontSize: 15 }}>🎯 模型能力总览</h3>
      <select value={selected} onChange={e => setSelected(e.target.value)} style={{ marginBottom: 16 }}>
        <option value="">选择模型查看详情</option>
        {allModels.map(m => <option key={m.id} value={m.id}>{m.providerIcon} {m.providerName} - {m.name}</option>)}
      </select>
      {model && (
        <div className="card">
          <div className="card-title">{model.providerIcon} {model.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>{model.providerName} · {model.type}</div>
          <CapabilityBar label="代码" value={model.capabilities.code} color="var(--accent)" />
          <CapabilityBar label="Agent" value={model.capabilities.agent} color="var(--info)" />
          <CapabilityBar label="对话" value={model.capabilities.chat} color="var(--success)" />
          <CapabilityBar label="上下文" value={model.capabilities.context} color="var(--warning)" />
          <CapabilityBar label="速度" value={model.capabilities.speed} color="#ff6b9d" />
          <div style={{ marginTop: 12, fontSize: 12, display: 'flex', gap: 16 }}>
            <span>📥 输入: ${model.capabilities.pricing.inputPer1M}/1M</span>
            <span>📤 输出: ${model.capabilities.pricing.outputPer1M}/1M</span>
            {model.capabilities.multimodal && <span className="badge badge-warning">多模态</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Testing Panel ───
function TestingPanel({ providers }: { providers: Provider[] }) {
  const allModels = providers.flatMap(p => p.models.filter(m => m.type === 'llm').map(m => ({ ...m, pName: p.name, pIcon: p.icon, provId: p.id })));
  const [scope, setScope] = useState<'single' | 'provider' | 'all'>('single');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [testMode, setTestMode] = useState<'quick' | 'full'>('quick');
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [reports, setReports] = useState<any[]>([]);
  const [lastResult, setLastResult] = useState('');

  const providerModels = selectedProvider ? providers.find(p => p.id === selectedProvider)?.models.filter(m => m.type === 'llm') || [] : [];

  const runTest = async () => {
    setTesting(true); setReports([]); setLastResult('');
    try {
      if (scope === 'single') {
        const model = allModels.find(m => m.id === selectedModel);
        if (!model) { alert('Please select a model'); setTesting(false); return; }
        setProgress({ current: 1, total: 1, label: model.modelId });
        const r = testMode === 'quick' ? await api.runQuickTest(model.provId, model.id) : await api.runFullTest(model.provId, model.id);
        setReports(r.reports || []);
        setLastResult('Single model test completed');
      } else if (scope === 'provider') {
        if (!selectedProvider) { alert('Please select a provider'); setTesting(false); return; }
        setProgress({ current: 0, total: providerModels.length || 1, label: 'Testing provider models' });
        const r = await api.runProviderTest(selectedProvider, testMode === 'quick');
        setReports(r.reports || []);
        setLastResult('Provider test done: ' + (r.providerName || '') + ', reports: ' + (r.reports?.length || 0));
        setProgress({ current: providerModels.length || 1, total: providerModels.length || 1, label: 'Done' });
      } else {
        const totalCount = allModels.length || 1;
        setProgress({ current: 0, total: totalCount, label: 'Testing all models' });
        const r = await api.runAllTest(testMode === 'quick');
        setReports(r.reports || []);
        setLastResult('All models test done, reports: ' + (r.reports?.length || 0));
        setProgress({ current: totalCount, total: totalCount, label: 'Done' });
      }
    } catch (e: any) { alert('Test failed: ' + e.message); }
    setTesting(false);
  };

  return (
    <div className="tab-panel">
      <h3 style={{ marginBottom: 16, fontSize: 15 }}>Capability Tests</h3>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[{ k: 'single', l: 'Single Model' }, { k: 'provider', l: 'Single Provider' }, { k: 'all', l: 'All Models' }].map(s => (
          <button key={s.k} className={`btn btn-sm ${scope === s.k ? 'btn-primary' : ''}`} onClick={() => setScope(s.k as any)}>{s.l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button className={`btn btn-sm ${testMode === 'quick' ? 'btn-primary' : ''}`} onClick={() => setTestMode('quick')}>Quick</button>
        <button className={`btn btn-sm ${testMode === 'full' ? 'btn-primary' : ''}`} onClick={() => setTestMode('full')}>Full</button>
      </div>
      {scope === 'single' && (
        <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} style={{ marginBottom: 12 }}>
          <option value="">Select Model</option>
          {allModels.map(m => <option key={m.id} value={m.id}>{m.pIcon} {m.pName} - {m.modelId}</option>)}
        </select>
      )}
      {scope === 'provider' && (
        <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} style={{ marginBottom: 12 }}>
          <option value="">Select Provider</option>
          {providers.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name} ({p.models.filter(m=>m.type==='llm').length} models)</option>)}
        </select>
      )}
      <button className="btn btn-primary" onClick={runTest} disabled={testing} style={{ marginBottom: 16 }}>
        {testing ? 'Testing...' : 'Start Test'}
      </button>
      {testing && progress.total > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>{progress.label || 'Testing...'}</span>
            <span>{progress.current}/{progress.total}</span>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: Math.max(5, Math.round((progress.current/Math.max(1,progress.total))*100)) + '%' }} /></div>
        </div>
      )}
      {lastResult && <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)' }}>{lastResult}</div>}
      {reports.map((r, i) => (
        <div key={i} className="card">
          <div className="card-title">{r.modelName} <span className="badge badge-info" style={{ marginLeft: 8 }}>{r.providerName}</span>
            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700 }}>{r.overallScore?.toFixed(1)}/10</span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
            {r.metrics?.passRate != null && <span>Pass {r.metrics.passRate}%</span>}
            {r.metrics?.avgLatencyMs != null && <span>Avg {r.metrics.avgLatencyMs}ms</span>}
            {r.metrics?.codeAvg != null && <span>Code {r.metrics.codeAvg}</span>}
            {r.metrics?.reasonAvg != null && <span>Reason {r.metrics.reasonAvg}</span>}
            {r.metrics?.chatAvg != null && <span>Chat {r.metrics.chatAvg}</span>}
          </div>
          {r.results?.map((t: any, j: number) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12 }}>
              <span className={`badge ${t.score >= 7 ? 'badge-success' : t.score >= 4 ? 'badge-warning' : 'badge-error'}`}>{t.score}/10</span>
              <span style={{ flex: 1 }}>{t.testName}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{t.latencyMs}ms</span>
            </div>
          ))}
          {r.capabilities && (
            <div style={{ marginTop: 8 }}>
              <CapabilityBar label="Code" value={r.capabilities.code} color="var(--accent)" />
              <CapabilityBar label="Agent" value={r.capabilities.agent} color="var(--info)" />
              <CapabilityBar label="Chat" value={r.capabilities.chat} color="var(--success)" />
            </div>
          )}
          {r.error && <div style={{ color: 'var(--error)', fontSize: 12, marginTop: 6 }}>Error: {r.error}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── Extensions Panel ───
function ExtensionsPanel() {
  const [subTab, setSubTab] = useState<'mcp' | 'skills'>('mcp');
  const [mcpServers, setMcpServers] = useState<any[]>([]);
  const [mcpPresets, setMcpPresets] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [skillPresets, setSkillPresets] = useState<any[]>([]);
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [customMcp, setCustomMcp] = useState({ name: '', description: '', transport: 'stdio' as string, command: '', args: '', url: '', category: '自定义', icon: '🔧' });
  const [customSkill, setCustomSkill] = useState({ name: '', description: '', content: '', category: '自定义', icon: '🔧' });
  const [editingSkill, setEditingSkill] = useState<any>(null);

  const loadAll = useCallback(async () => {
    const [mp, sp] = await Promise.all([api.fetchMcpPresets(), api.fetchSkillPresets()]);
    setMcpPresets(mp); setSkillPresets(sp);
    try { const [ms, sk] = await Promise.all([api.fetchMcpServers(), api.fetchSkills()]); setMcpServers(ms); setSkills(sk); } catch {}
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  return (
    <div className="tab-panel">
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        <button className={`btn ${subTab === 'mcp' ? 'btn-primary' : ''}`} onClick={() => setSubTab('mcp')} style={{ borderRadius: '6px 6px 0 0' }}>🔌 MCP 服务器</button>
        <button className={`btn ${subTab === 'skills' ? 'btn-primary' : ''}`} onClick={() => setSubTab('skills')} style={{ borderRadius: '6px 6px 0 0' }}>⚡ 技能库</button>
      </div>

      {subTab === 'mcp' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15 }}>🔌 MCP 服务器</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddMcp(!showAddMcp)}>+ 自定义添加</button>
          </div>
          {showAddMcp && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid var(--accent)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input placeholder="名称" value={customMcp.name} onChange={e => setCustomMcp({...customMcp, name: e.target.value})} />
                <input placeholder="图标" value={customMcp.icon} onChange={e => setCustomMcp({...customMcp, icon: e.target.value})} />
              </div>
              <input placeholder="描述" value={customMcp.description} onChange={e => setCustomMcp({...customMcp, description: e.target.value})} style={{ marginBottom: 8 }} />
              <select value={customMcp.transport} onChange={e => setCustomMcp({...customMcp, transport: e.target.value})} style={{ marginBottom: 8 }}>
                <option value="stdio">stdio</option><option value="sse">SSE</option><option value="streamable-http">HTTP</option>
              </select>
              {customMcp.transport === 'stdio' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 8 }}>
                  <input placeholder="命令 (如 npx)" value={customMcp.command} onChange={e => setCustomMcp({...customMcp, command: e.target.value})} />
                  <input placeholder="参数 (空格分隔)" value={customMcp.args} onChange={e => setCustomMcp({...customMcp, args: e.target.value})} />
                </div>
              ) : (
                <input placeholder="URL" value={customMcp.url} onChange={e => setCustomMcp({...customMcp, url: e.target.value})} style={{ marginBottom: 8 }} />
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => setShowAddMcp(false)}>取消</button>
                <button className="btn btn-primary btn-sm" onClick={async () => { if (customMcp.name) { await api.addMcpCustom({ name: customMcp.name, description: customMcp.description, transport: customMcp.transport, command: customMcp.command || undefined, args: customMcp.args ? customMcp.args.split(' ').filter(Boolean) : undefined, url: customMcp.url || undefined, enabled: true, category: customMcp.category, icon: customMcp.icon }); setShowAddMcp(false); loadAll(); } }}>添加</button>
              </div>
            </div>
          )}
          <h4 style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>预设 MCP 服务器</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 20 }}>
            {mcpPresets.map((p: any) => {
              const added = mcpServers.some((s: any) => s.name === p.name);
              return (
                <div key={p.id} className="card" style={{ cursor: added ? 'default' : 'pointer', opacity: added ? 0.5 : 1, padding: 10 }}
                  onClick={async () => { if (!added) { await api.addMcpFromPreset(p.id); loadAll(); } }}>
                  <div className="card-title">{p.icon} {p.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>{p.description}</div>
                  <span className="badge badge-info">{p.transport}</span>
                  {added && <span className="badge badge-success" style={{ marginLeft: 4 }}>已添加</span>}
                </div>
              );
            })}
          </div>
          {mcpServers.length > 0 && (
            <>
              <h4 style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>已配置</h4>
              {mcpServers.map((s: any) => (
                <div key={s.id} className="card" style={{ padding: 10, opacity: s.enabled ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{s.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{s.transport === 'stdio' ? s.command + ' ' + (s.args || []).join(' ') : s.url}</div>
                  </div>
                  <span className={`badge ${s.enabled ? 'badge-success' : 'badge-error'}`}>{s.enabled ? '启用' : '禁用'}</span>
                  <button className="btn btn-sm" onClick={async () => { await api.updateMcp(s.id, { enabled: !s.enabled }); loadAll(); }}>{s.enabled ? '禁用' : '启用'}</button>
                  <button className="btn btn-sm" onClick={async () => { await api.removeMcp(s.id); loadAll(); }} style={{ color: 'var(--error)' }}>删除</button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {subTab === 'skills' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15 }}>⚡ 技能库</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddSkill(!showAddSkill)}>+ 自定义创建</button>
          </div>
          {showAddSkill && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid var(--accent)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input placeholder="技能名称" value={customSkill.name} onChange={e => setCustomSkill({...customSkill, name: e.target.value})} />
                <input placeholder="图标" value={customSkill.icon} onChange={e => setCustomSkill({...customSkill, icon: e.target.value})} />
              </div>
              <input placeholder="描述" value={customSkill.description} onChange={e => setCustomSkill({...customSkill, description: e.target.value})} style={{ marginBottom: 8 }} />
              <textarea placeholder="技能内容/系统提示词..." value={customSkill.content} onChange={e => setCustomSkill({...customSkill, content: e.target.value})} style={{ minHeight: 100, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => setShowAddSkill(false)}>取消</button>
                <button className="btn btn-primary btn-sm" onClick={async () => { if (customSkill.name && customSkill.content) { await api.addSkillCustom({ name: customSkill.name, description: customSkill.description, content: customSkill.content, source: 'file', enabled: true, category: customSkill.category, icon: customSkill.icon }); setShowAddSkill(false); loadAll(); } }}>创建</button>
              </div>
            </div>
          )}
          {editingSkill && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid var(--warning)' }}>
              <div className="card-title">编辑: {editingSkill.icon} {editingSkill.name}</div>
              <input value={editingSkill.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingSkill({...editingSkill, name: e.target.value})} style={{ marginBottom: 8 }} />
              <textarea value={editingSkill.content} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditingSkill({...editingSkill, content: e.target.value})} style={{ minHeight: 120, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => setEditingSkill(null)}>取消</button>
                <button className="btn btn-primary btn-sm" onClick={async () => { await api.updateSkill(editingSkill.id, { content: editingSkill.content, name: editingSkill.name }); setEditingSkill(null); loadAll(); }}>保存</button>
              </div>
            </div>
          )}
          <h4 style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>预设技能</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 20 }}>
            {skillPresets.map((p: any) => {
              const added = skills.some((s: any) => s.name === p.name);
              return (
                <div key={p.id} className="card" style={{ cursor: added ? 'default' : 'pointer', opacity: added ? 0.5 : 1, padding: 10 }}
                  onClick={async () => { if (!added) { await api.addSkillFromPreset(p.id); loadAll(); } }}>
                  <div className="card-title">{p.icon} {p.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{p.description}</div>
                  {added && <span className="badge badge-success" style={{ marginTop: 4 }}>已添加</span>}
                </div>
              );
            })}
          </div>
          {skills.length > 0 && (
            <>
              <h4 style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>已配置</h4>
              {skills.map((s: any) => (
                <div key={s.id} className="card" style={{ padding: 10, opacity: s.enabled ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{s.description}</div>
                    </div>
                    <span className={`badge ${s.enabled ? 'badge-success' : 'badge-error'}`}>{s.enabled ? '启用' : '禁用'}</span>
                    <button className="btn btn-sm" onClick={() => setEditingSkill(s)}>编辑</button>
                    <button className="btn btn-sm" onClick={async () => { await api.updateSkill(s.id, { enabled: !s.enabled }); loadAll(); }}>{s.enabled ? '禁用' : '启用'}</button>
                    <button className="btn btn-sm" onClick={async () => { await api.removeSkill(s.id); loadAll(); }} style={{ color: 'var(--error)' }}>删除</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main App ───
export default function App() {
  const [tab, setTab] = useState<'chat' | 'providers' | 'models' | 'testing' | 'extensions' | 'terminal' | 'editor' | 'environment'>('chat');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelId, setModelId] = useState('');
  const [thinking, setThinking] = useState<'low' | 'medium' | 'high'>('medium');
  const [ratio, setRatio] = useState(0.5);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadProviders = useCallback(async () => { setProviders(await api.fetchProviders()); }, []);

  useEffect(() => {
    loadProviders();
    const ws = new WebSocket('ws://' + window.location.hostname + ':3001');
    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      const time = new Date().toLocaleTimeString();
      if (msg.type === 'orchestrator_update') {
        const d = msg.payload;
        if (d.status === 'planning') {
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'orchestrator', content: '🧠 正在分析任务并分解子任务...', time }]);
        } else if (d.status === 'executing') {
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'orchestrator', content: '⚡ 分解完成，正在分配 ' + d.subtasks + ' 个子任务给子代理...', time }]);
        } else if (d.status === 'completed') {
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'orchestrator', content: '✅ 任务完成！\n\n' + (d.result || ''), time }]);
          setSending(false);
        }
      } else if (msg.type === 'agent_update') {
        const a = msg.payload.agent;
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'orchestrator' && last.agents) {
            last.agents = [...last.agents, { name: a.name, status: a.status, task: '执行中...', model: a.modelId }];
          } else {
            updated.push({ id: Date.now().toString(), role: 'system', content: '', time, agents: [{ name: a.name, status: a.status, task: '已分配', model: a.modelId }] });
          }
          return updated;
        });
      } else if (msg.type === 'task_update') {
        const t = msg.payload.task;
        const idBase = t.id || Date.now().toString();
        if (t.status === 'completed') {
          setMessages(prev => [...prev, { id: idBase, role: 'agent', content: '\u2705 ' + t.description.slice(0, 60) + '\n' + (t.result || '').slice(0, 300), time, tools: [{ name: t.description.slice(0, 40), status: 'success', output: t.result?.slice(0, 500), icon: '\uD83D�' }] }]);
        } else if (t.status === 'failed') {
          setMessages(prev => [...prev, { id: idBase + '-fail', role: 'error', content: '\u274C Subtask failed: ' + t.description.slice(0, 60) + '\n' + (t.error || ''), time }]);
        } else if (t.status === 'running') {
          setMessages(prev => [...prev, { id: idBase, role: 'system', content: '\uD83D\uDE80 Running: ' + t.description.slice(0, 80), time }]);
        } else if (t.status === 'retrying') {
          setMessages(prev => [...prev, { id: idBase + '-retry-' + t.attempts, role: 'system', content: '\uD83D\uDD01 Retry #' + t.attempts + ': ' + t.description.slice(0, 80), time }]);
        }
      } else if (msg.type === 'issue_created') {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: '⚠️ 问题记录: ' + JSON.stringify(msg.payload), time }]);
      }
      if (msg.payload?.projectId) {
        fetch('/api/projects/' + msg.payload.projectId).then(r => r.json()).then(setProject).catch(() => {});
      }
    };
    return () => ws.close();
  }, [loadProviders]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async (text?: string) => {
    const task = (text || inputVal).trim();
    if (!task || sending) return;
    setInputVal('');
    setSending(true);
    const time = new Date().toLocaleTimeString();
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: task, time }]);
    try {
      const proj = await api.createProject('Project', '', task, modelId);
      setProject(proj);
      await api.executeProject(proj.id, { costEfficiencyRatio: ratio, orchestratorModel: modelId, thinkingMode: thinking });
    } catch (e: any) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'error', content: '发送失败: ' + e.message, time }]);
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const tabNames: Record<string, string> = { chat: '💬 对话', providers: '📦 提供商', models: '🎯 模型', testing: '🧪 测试', extensions: '🔌 扩展', terminal: '⌨️ 终端', editor: '📝 编辑器', environment: '⚙️ 环境' };

  return (
    <div className="app">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-brand">
          <span className="logo">🧬</span>
          <div>
            <div className="title">Mixture of Agents</div>
            <div className="subtitle">多模型协同 · 智能调度</div>
          </div>
        </div>
        <div className="sidebar-tabs">
          {(Object.entries(tabNames) as [string, string][]).map(([k, l]) => (
            <div key={k} className={`sidebar-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k as any)}>{l}</div>
          ))}
        </div>
        {tab === 'chat' && messages.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">最近对话</div>
            {messages.filter(m => m.role === 'user').slice(-8).reverse().map(m => (
              <div key={m.id} style={{ padding: '6px 0', fontSize: 11, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={() => { const el = document.getElementById('msg-' + m.id); el?.scrollIntoView({ behavior: 'smooth' }); }}>
                {m.content.slice(0, 40)}...
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main */}
      {tab === 'chat' ? (
        <div className="main-content">
          <div className="chat-container">
            {messages.length === 0 ? (
              <WelcomeScreen onQuickStart={(task) => { setInputVal(task); setTimeout(() => handleSend(task), 100); }} />
            ) : (
              <div className="chat-messages">
                {messages.map(m => <div key={m.id} id={'msg-' + m.id}><ChatMessage msg={m} /></div>)}
                {sending && (
                  <div className="message">
                    <div className="message-avatar orchestrator">🧠</div>
                    <div className="message-body">
                      <div className="message-header"><span className="message-name">调度引擎</span><span className="message-time">思考中...</span></div>
                      <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s infinite 0s' }} />
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s infinite 0.2s' }} />
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s infinite 0.4s' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Prompt Bar */}
            <div className="prompt-bar">
              <div className="prompt-wrapper">
                <textarea ref={inputRef} className="prompt-input" value={inputVal} onChange={e => setInputVal(e.target.value)}
                  onKeyDown={handleKeyDown} placeholder="描述你的任务... (Enter 发送, Shift+Enter 换行)"
                  rows={1} style={{ height: Math.min(120, Math.max(24, inputVal.split('\n').length * 22)) }} />
                <div className="prompt-actions">
                  <button className="prompt-btn send" onClick={() => handleSend()} disabled={!inputVal.trim() || sending}>▶</button>
                </div>
              </div>
              <div className="prompt-meta">
                <span className="prompt-meta-chip" onClick={() => setSettingsOpen(!settingsOpen)}>
                  ⚙️ {modelId ? providers.flatMap(p => p.models).find(m => m.id === modelId)?.name || '已选模型' : '自动选择'}
                </span>
                <span className="prompt-meta-chip" onClick={() => setSettingsOpen(!settingsOpen)}>
                  🧠 {thinking === 'low' ? '低' : thinking === 'medium' ? '中' : '高'}
                </span>
                <span className="prompt-meta-chip" onClick={() => setSettingsOpen(!settingsOpen)}>
                  {ratio <= 0.2 ? '🚀 效率' : ratio >= 0.8 ? '💰 成本' : '⚖️ 均衡'} {ratio}
                </span>
                <span style={{ marginLeft: 'auto' }}>{providers.length} 提供商 · {providers.flatMap(p => p.models).length} 模型</span>
              </div>
            </div>
          </div>

          {/* Settings Drawer */}
          <SettingsPanel providers={providers} ratio={ratio} setRatio={setRatio} thinking={thinking} setThinking={setThinking}
            modelId={modelId} setModelId={setModelId} visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
      ) : (
        <div className="main-content">
          <div className="header"><h1>{tabNames[tab]}</h1></div>
          {tab === 'providers' && <ProviderPanel providers={providers} onRefresh={loadProviders} />}
          {tab === 'models' && <ModelPanel providers={providers} />}
          {tab === 'testing' && <TestingPanel providers={providers} />}
          {tab === 'extensions' && <ExtensionsPanel />}
          {tab === 'terminal' && <div style={{height:'calc(100vh - 60px)'}}><TerminalPanel /></div>}
          {tab === 'editor' && <div style={{height:'calc(100vh - 60px)'}}><EditorPanel /></div>}
          {tab === 'environment' && <EnvironmentPanel />}
        </div>
      )}
    </div>
  );
}

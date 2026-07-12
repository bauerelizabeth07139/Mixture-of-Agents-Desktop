import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './services/api';
import type { Provider, ProviderPreset, Model, McpPreset, SkillPreset, McpServerConfig, SkillConfig, Project } from './types';
import { TerminalPanel } from './components/Terminal';
import { EditorPanel } from './components/Editor';
import { EnvironmentPanel } from './components/Environment';
import { FileManager } from './components/FileManager';

// --- Model Notes ---
const MODEL_NOTES: Record<string, string> = {
  'gpt-4o': '多模态强，响应快，通用能力优秀',
  'gpt-4-turbo': '长上下文，推理强',
  'o1': '深度推理链，STEM强，慢速',
  'o3': '增强推理，Agent能力强',
  'o3-mini': '推理能力好，成本低',
  'claude-3-5-sonnet': '编码强，指令遵循好，写作细腻',
  'claude-3-opus': '长文分析，复杂推理',
  'claude-4-opus': '最新旗舰，Agent能力强',
  'claude-4-sonnet': '平衡速度与能力',
  'gemini-2.5-pro': '百万上下文，多模态强',
  'gemini-2.5-flash': '极速响应，成本极低',
  'gemini-2.0-flash': '快速多模态',
  'llama-4': '开源可部署，社区活跃',
  'llama-3.3-70b': '开源旗舰，性价比高',
  'deepseek-v3': '性价比极高，编码强',
  'deepseek-r1': '深度推理，数学强',
  'qwen-2.5-72b': '中英文强，多模态',
  'qwq-32b': '推理强，数学好',
  'mistral-large': '多语言，欧洲语言强',
  'mimo-v2.5': '中文优化，移动端适配',
};
const getModelNote = (name: string) => MODEL_NOTES[name] || '';

// --- Chat Thread Types ---
interface ChatThread {
  id: string;
  title: string;
  messages: ChatMsg[];
  createdAt: string;
  updatedAt: string;
}

// ─── Helper Components ───

function CapabilityBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="capability-bar">
      <span className="capability-label">{label}</span>
      <div className="capability-track"><div className="capability-fill" style={{ width: value * 10 + '%', background: color }} /></div>
      <span className="capability-value">{value.toFixed(1)}/10</span>
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

// ─── Tool Call Card ───
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

// ─── File Attachment Preview ───
function AttachmentPreview({ attachments, onRemove }: { attachments: Array<{type:'image'|'text'|'file', name: string, data: string, preview?: string, size?: number}>; onRemove: (idx: number) => void }) {
  if (attachments.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 12px', flexWrap: 'wrap', borderTop: '1px solid var(--border)' }}>
      {attachments.map((a, i) => (
        <div key={i} style={{ position: 'relative', background: 'var(--surface)', borderRadius: 8, padding: a.type === 'image' ? 4 : '6px 10px', border: '1px solid var(--border)', maxWidth: 200 }}>
          {a.type === 'image' && a.preview ? (
            <img src={a.preview} alt={a.name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, display: 'block' }} />
          ) : a.type === 'text' ? (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 180, maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre-wrap' }}>
              📄 {a.name}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{a.data.length} 字符</div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              📎 {a.name}
              {a.size != null && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{(a.size / 1024).toFixed(1)} KB</div>}
            </div>
          )}
          <button onClick={() => onRemove(i)} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'var(--error)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ─── Drag-Drop Overlay ───
function DragOverlay() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', pointerEvents: 'none' }}>
      <div style={{ border: '3px dashed var(--accent)', borderRadius: 24, padding: '60px 80px', background: 'rgba(30,30,30,0.9)', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📁</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>拖放文件到此处</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>支持 图片 · 文本文件 · PDF</div>
      </div>
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
          {msg.thinkingMode && <span className="message-model" style={{ background: 'var(--info-bg)', color: 'var(--info)', fontSize: 10, padding: '1px 6px', borderRadius: 4 }}>🧠 {msg.thinkingMode}</span>}
          {msg.visionModel && (
            <span className="message-model" style={{ background: 'var(--warning)', color: '#000', fontSize: 10, padding: '1px 6px', borderRadius: 4 }}>
              👁️ 视觉: {msg.visionModel}
            </span>
          )}
          <span className="message-time">{msg.time}</span>
        </div>
        {msg.attachments && msg.attachments.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            {msg.attachments.map((a, i) => (
              a.type === 'image' && a.preview ? (
                <img key={i} src={a.preview} alt={a.name} style={{ maxWidth: 200, maxHeight: 150, borderRadius: 6, border: '1px solid var(--border)' }} />
              ) : (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface)', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                  {a.type === 'text' ? '📄' : '📎'} {a.name}
                </div>
              )
            ))}
          </div>
        )}
        <div className="message-content">
          {msg.content.split('\n').map((line, i) => {
            if (line.startsWith('\`\`\`')) return <pre key={i}><code>{line.replace(/^\`\`\`\w*/, '')}</code></pre>;
            return <div key={i}>{line || <br />}</div>;
          })}
        </div>
        {msg.codeExecution && msg.codeExecution.map((ex, i) => (
          <div key={i} style={{ marginTop: 8, background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{ex.lang === 'python' || ex.lang === 'py' ? '🐍' : ex.lang === 'javascript' || ex.lang === 'js' || ex.lang === 'node' ? '⚡' : '💻'}</span>
              <span>{ex.filename || ex.lang}</span>
              <span style={{ marginLeft: 'auto', color: ex.exitCode === 0 ? 'var(--success)' : 'var(--error)' }}>{ex.exitCode === 0 ? '✅ 成功' : '❌ 失败 (exit ' + ex.exitCode + ')'}</span>
            </div>
            {ex.stdout && <pre style={{ padding: '8px 12px', fontSize: 12, fontFamily: 'var(--font-mono)', margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-primary)', maxHeight: 300, overflow: 'auto' }}>{ex.stdout}</pre>}
            {ex.stderr && <pre style={{ padding: '8px 12px', fontSize: 12, fontFamily: 'var(--font-mono)', margin: 0, whiteSpace: 'pre-wrap', color: 'var(--error)', maxHeight: 200, overflow: 'auto', background: 'var(--error-bg)' }}>{ex.stderr}</pre>}
          </div>
        ))}
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
  visionModel?: string;
  attachments?: Array<{type:'image'|'text'|'file', name: string, data: string, preview?: string, size?: number}>;
  codeExecution?: Array<{lang: string; filename?: string; stdout: string; stderr: string; exitCode: number}>; thinkingMode?: string;
  tools?: Array<{ name: string; status: string; output?: string; icon: string }>;
  agents?: Array<{ name: string; status: string; task: string; model: string }>;
}
// ─── Settings Panel (right side) ───
function SettingsPanel({ providers, ratio, setRatio, orchThinking, setOrchThinking, agentThinking, setAgentThinking, modelId, setModelId, visible, onClose }: {
  providers: Provider[]; ratio: number; setRatio: (v: number) => void;
  orchThinking: string; setOrchThinking: (v: any) => void;
  agentThinking: string; setAgentThinking: (v: any) => void;
  modelId: string; setModelId: (v: string) => void;
  visible: boolean; onClose: () => void;
}) {
  if (!visible) return null;
  const allModelsRaw = providers.flatMap(p => p.models.filter(m => (m.type === 'llm' || m.type === 'vlm')).map(m => ({ ...m, pName: p.name, pIcon: p.icon })));
  const allModels = [...new Map(allModelsRaw.sort((a,b) => (b.capabilities?.code||0) - (a.capabilities?.code||0)).map(m => [m.modelId, m])).values()];
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
      {modelId && getModelNote(providers.flatMap(p=>p.models).find(m=>m.id===modelId)?.name || '') && (
        <div className="settings-section">
          <div className="settings-section-title">备注</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{getModelNote(providers.flatMap(p=>p.models).find(m=>m.id===modelId)?.name || '')}</div>
        </div>
      )}
      <div className="settings-section">
        <div className="settings-section-title">调控模型 思考强度</div>
        <div style={{ display: "flex", gap: 6 }}>
          {["auto", "low", "medium", "high"].map(m => (
            <button key={m} className={`btn btn-sm ${orchThinking === m ? "btn-primary" : ""}`}
              onClick={() => setOrchThinking(m as any)} style={{ flex: 1 }}>
              {m === "auto" ? "自动" : m === "low" ? "低" : m === "medium" ? "中" : "高"}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">全局 子代理 思考强度</div>
        <div style={{ display: "flex", gap: 6 }}>
          {["auto", "low", "medium", "high"].map(m => (
            <button key={m} className={`btn btn-sm ${agentThinking === m ? "btn-primary" : ""}`}
              onClick={() => setAgentThinking(m as any)} style={{ flex: 1 }}>
              {m === "auto" ? "自动" : m === "low" ? "低" : m === "medium" ? "中" : "高"}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
          {agentThinking === "auto" ? "由调控模型决定每个子任务的思考强度" : `全部子代理将使用${agentThinking === "low" ? "低" : agentThinking === "medium" ? "中" : "高"}思考`}
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
  const [multiKeyInput, setMultiKeyInput] = useState('');
  const [showMultiKey, setShowMultiKey] = useState(false);
  const [fetching, setFetching] = useState('');

  const load = useCallback(async () => { setPresets(await api.fetchPresets()); }, []);
  useEffect(() => { load(); }, [load]);

  const addPreset = async (pid: string) => { await api.addPreset(pid); onRefresh(); };
  const addCustom = async () => { if (customName && customUrl) { await api.addCustom(customName, customUrl); setCustomName(''); setCustomUrl(''); onRefresh(); } };
  const addKey = async () => { if (selProv && newKey) { await api.addKey(selProv, newKey); setNewKey(''); onRefresh(); } };
  const addMultiKeys = async () => {
    if (!selProv || !multiKeyInput.trim()) return;
    const keys = multiKeyInput.split('\n').map(k => k.trim()).filter(Boolean);
    for (const k of keys) { await api.addKey(selProv, k); }
    setMultiKeyInput('');
    setShowMultiKey(false);
    onRefresh();
  };
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
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select value={selProv} onChange={e => setSelProv(e.target.value)} style={{ flex: 1 }}>
              <option value="">选择提供商</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.icon || '🔌'} {p.name}</option>)}
            </select>
            {!showMultiKey ? (
              <>
                <input placeholder="API Key" value={newKey} onChange={e => setNewKey(e.target.value)} type="password" style={{ flex: 2 }} />
                <button className="btn btn-primary" onClick={addKey}>添加</button>
                <button className="btn btn-sm" onClick={() => setShowMultiKey(true)} title="批量添加密钥">📋 批量</button>
              </>
            ) : (
              <>
                <textarea placeholder="每行一个 API Key" value={multiKeyInput} onChange={e => setMultiKeyInput(e.target.value)}
                  style={{ flex: 2, minHeight: 60, fontFamily: 'var(--font-mono)', fontSize: 11 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button className="btn btn-primary btn-sm" onClick={addMultiKeys}>批量添加</button>
                  <button className="btn btn-sm" onClick={() => { setShowMultiKey(false); setMultiKeyInput(''); }}>取消</button>
                </div>
              </>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 16 }}>
            {selProv && (() => {
              const prov = providers.find(p => p.id === selProv);
              if (!prov) return null;
              const activeKeys = prov.apiKeys.filter(k => k.isActive).length;
              const poolLimit = 50;
              return <span>✅ {activeKeys}/{prov.apiKeys.length} 个活跃密钥 · 提供商上限: {poolLimit}</span>;
            })()}
          </div>
          {providers.map(p => {
            const activeKeys = p.apiKeys.filter(k => k.isActive).length;
            const poolLimit = 50;
            return (
              <div key={p.id} className="card">
                <div className="card-title">
                  {p.icon || '🔌'} {p.name}
                  <span className="badge badge-info" style={{ marginLeft: 8 }}>{p.models.length} 模型</span>
                  <span className="badge badge-success" style={{ marginLeft: 4 }}>{p.apiKeys.length}/{poolLimit} 个密钥</span>
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    ({activeKeys} 活跃, {p.apiKeys.length - activeKeys} 未激活)
                  </span>
                  {p.apiKeys.length > 0 && (
                    <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => fetchModels(p.id)} disabled={fetching === p.id}>
                      {fetching === p.id ? '⏳ 获取中...' : '🔄 获取模型'}
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>{p.baseUrl}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  {p.apiKeys.map(k => (
                    <span key={k.id} style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 10,
                      background: k.isActive ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.1)',
                      color: k.isActive ? 'var(--success)' : 'var(--error)',
                      border: `1px solid ${k.isActive ? 'var(--success)' : 'var(--error)'}`
                    }}>
                      {k.isActive ? '🟢' : '🔴'} {k.key.slice(0, 8)}...
                    </span>
                  ))}
                </div>
                {p.models.map(m => (
                  <div key={m.id} style={{ padding: '3px 0', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{m.name}</span>
                    <span className={`badge ${m.type === 'llm' ? 'badge-info' : m.type === 'vlm' ? 'badge-primary' : m.type === 'tts' ? 'badge-accent' : m.type === 'image' ? 'badge-warning' : m.type === 'video' ? 'badge-error' : m.type === '3d' ? 'badge-warning' : m.type === 'stt' ? 'badge-accent' : m.type === 'multimodal' ? 'badge-primary' : 'badge-success'}`}>{m.type}</span>
                    {m.capabilities.multimodal && <span className="badge badge-warning">👁️ 多模态</span>}
                    {m.capabilities.multimodal && (m.capabilities as any).visionScore != null && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>视觉 {(m.capabilities as any).visionScore}/10</span>
                    )}
                    {(m.type === 'tts' || (m.capabilities as any).audioScore > 0) && <span className="badge badge-accent">🔊 语音</span>}
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
// ─── Model Capabilities Panel ───
function ModelPanel({ providers }: { providers: Provider[] }) {
  const allModelsRaw = providers.flatMap(p => p.models.map(m => ({ ...m, providerName: p.name, providerIcon: p.icon })));
    const allModels = [...new Map(allModelsRaw.sort((a,b) => (b.capabilities?.code||0) - (a.capabilities?.code||0)).map(m => [m.modelId, m])).values()];
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
          <CapabilityBar label="视觉" value={(model.capabilities as any).visionScore || 0} color="#b388ff" />
          <div style={{ marginTop: 12, fontSize: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {model.capabilities.multimodal && <span className="badge badge-warning">👁️ 多模态</span>}
            {(model.type === 'tts' || (model.capabilities as any).audioScore > 0) && <span className="badge badge-accent">🔊 语音</span>}
            {(model.capabilities as any).visionScore > 0 && (
              <span style={{ fontSize: 11, color: '#b388ff' }}>👁️ 视觉能力: {(model.capabilities as any).visionScore}/10</span>
            )}
            {getModelNote(model.name) && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>📝 {getModelNote(model.name)}</span>}
          </div>
        </div>
      )}
      <h3 style={{ marginTop: 24, marginBottom: 12, fontSize: 15 }}>📋 全部模型列表</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
        {allModels.map(m => (
          <div key={m.id} className="card" style={{ padding: 10, cursor: 'pointer' }} onClick={() => setSelected(m.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span>{m.providerIcon}</span>
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{m.name}</span>
              <span className={`badge ${m.type === 'llm' ? 'badge-info' : m.type === 'vlm' ? 'badge-primary' : m.type === 'tts' ? 'badge-accent' : m.type === 'image' ? 'badge-warning' : m.type === 'video' ? 'badge-error' : m.type === '3d' ? 'badge-warning' : m.type === 'stt' ? 'badge-accent' : m.type === 'multimodal' ? 'badge-primary' : 'badge-success'}`}>{m.type}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, fontSize: 10, flexWrap: 'wrap' }}>
              {m.capabilities.multimodal && <span className="badge badge-warning" style={{ fontSize: 9 }}>👁️ 多模态</span>}
              {(m.type === 'tts' || (m.capabilities as any).audioScore > 0) && <span className="badge badge-accent" style={{ fontSize: 9 }}>🔊 语音</span>}
              <span style={{ color: 'var(--text-muted)' }}>代码 {m.capabilities.code}</span>
              <span style={{ color: 'var(--text-muted)' }}>推理 {m.capabilities.agent}</span>
              <span style={{ color: 'var(--text-muted)' }}>对话 {m.capabilities.chat}</span>
              {(m.capabilities as any).visionScore > 0 && <span style={{ color: '#b388ff' }}>视觉 {(m.capabilities as any).visionScore}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
// ─── Testing Panel (Chinese UI with Quick/Standard modes) ───
function TestingPanel({ providers, onRefresh }: { providers: Provider[]; onRefresh: () => void }) {
  // 测试名中文映射
  const TEST_NAME_CN: Record<string, string> = {
    'Python Function': 'Python函数编写',
    'Bug Detection': 'Bug检测',
    'Data Structure': '数据结构实现',
    'Math Calculation': '数学计算',
    'Logic Puzzle': '逻辑推理',
    'Multi-step Reasoning': '多步推理',
    'Format Following': '格式遵循',
    'Word Count': '字数统计',
    'Multi-turn Context': '多轮上下文',
    'Complex Instruction': '复杂指令遵循',
    'Simple Q&A Speed': '简单问答速度',
    'Vision Description': '视觉描述能力',
    'Echo Test': '指令回显测试',
    'Quick Code': '快速代码测试',
    'Quick Math': '快速数学计算',
    'Quick Format': '快速格式遵循',
    'Quick Speed': '快速响应测试',
  };
  const cn = (name: string) => TEST_NAME_CN[name] || name;
  const DETAIL_CN: Record<string, string> = {
    'Correct FizzBuzz': 'FizzBuzz实现正确',
    'Partial': '部分正确',
    'Did not follow format': '未遵循格式',
    'Perfect compliance': '完全符合要求',
    'Close': '接近目标',
    'Off target': '偏差较大',
    'Fast': '响应较快',
    'Slow': '响应较慢',
    'Incorrect': '实现错误',
    'Found the edge case bug': '找到了边界条件Bug',
    'Did not find the real bug': '未找到真正Bug',
    'All correct': '全部正确',
    'Correct deduction': '推理正确',
    'Exact format match': '格式完全匹配',
    'Word count correct': '字数正确',
    'Maintained context': '保持了上下文',
    'Good instruction following': '指令遵循良好',
    'Fast response': '响应速度快',
    'Correct echo': '正确回复echo',
    'No extra content': '无多余内容',
    'Fast and correct': '快速且正确',
    'Good description': '描述准确',
    'Minimal description': '描述简略',
    'Weak or no description': '描述不足或无描述',
    'Good heap implementation': '最小堆实现正确',
    'Partial implementation': '部分正确',
    'Incorrect implementation': '实现错误',
    'Found multi-step reasoning': '找到多步推理',
    'Partial reasoning': '部分推理',
    'Good context maintenance': '上下文维护良好',
    'Partial context maintained': '部分上下文',
    'Context lost': '上下文丢失',
    'Strong instruction following': '指令遵循良好',
    'Partial instruction following': '部分遵循',
    'Audio capability detected': '检测到音频能力',
    'Limited audio capability': '有限音频能力',
    'No audio support': '不支持音频',
  };
  const cnDetail = (d: string) => DETAIL_CN[d] || d;


  const allModelsRaw = providers.flatMap(p => p.models.filter(m => (m.type === 'llm' || m.type === 'vlm')).map(m => ({ ...m, pName: p.name, pIcon: p.icon, provId: p.id })));
  const allModels = [...new Map(allModelsRaw.sort((a,b) => (b.capabilities?.code||0) - (a.capabilities?.code||0)).map(m => [m.modelId, m])).values()];
  const [scope, setScope] = useState<'single' | 'provider' | 'all'>('single');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [testMode, setTestMode] = useState<'quick' | 'full'>('quick');
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [reports, setReports] = useState<any[]>([]);
  const [lastResult, setLastResult] = useState('');
  const [sortBy, setSortBy] = useState<string>('overallScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const providerModels = selectedProvider ? providers.find(p => p.id === selectedProvider)?.models.filter(m => m.type === 'llm' || m.type === 'vlm') || [] : [];

const estimateLabel = (ms?: number | null) => {
    if (!ms) return '';
    const sec = Math.round(ms / 1000);
    return sec >= 60 ? Math.round(sec / 60) + ' 分钟' : sec + ' 秒';
  };
  const exceedsAny = (reportsArr: any[]) => reportsArr.some((rr: any) => rr.exceedsEstimated);
  const runTest = async () => {
    setTesting(true); setReports([]); setLastResult('');
    try {
      if (scope === 'single') {
        const model = allModels.find(m => m.id === selectedModel);
        if (!model) { alert('请选择一个模型'); setTesting(false); return; }
        setProgress({ current: 1, total: 1, label: model.modelId });
        const r = testMode === 'quick' ? await api.runQuickTest(model.provId, model.id) : await api.runFullTest(model.provId, model.id);
        setReports(r.reports || []);
        if (r.estimatedMs) setProgress(p => ({ ...p, label: '预计 ' + estimateLabel(r.estimatedMs) }));
        if (exceedsAny(r.reports || [])) alert('⚠️ 测试时间可能超出预计，请耐心等待');
        setLastResult('单模型测试完成');
        setProgress({ current: 1, total: 1, label: '完成' });
      } else if (scope === 'provider') {
        if (!selectedProvider) { alert('请选择一个提供商'); setTesting(false); return; }
        setProgress({ current: 0, total: providerModels.length || 1, label: '正在测试提供商模型..' });
        const r = await api.runProviderTest(selectedProvider, testMode === 'quick');
        setReports(r.reports || []);
        if (r.estimatedMs) setProgress(p => ({ ...p, label: '预计 ' + estimateLabel(r.estimatedMs) }));
        setLastResult('提供商测试完成 ' + (r.providerName || '') + ', 报告: ' + (r.reports?.length || 0));
        setProgress({ current: providerModels.length || 1, total: providerModels.length || 1, label: '完成' });
      } else {
        const totalCount = allModels.length || 1;
        setProgress({ current: 0, total: totalCount, label: '正在测试全部模型...' });
        const r = await api.runAllTest(testMode === 'quick');
        setReports(r.reports || []);
        if (r.estimatedMs) setProgress(p => ({ ...p, label: '预计 ' + estimateLabel(r.estimatedMs) }));
        setLastResult('全部模型测试完成, 报告: ' + (r.reports?.length || 0));
        setProgress({ current: totalCount, total: totalCount, label: '完成' });
      }
    } catch (e: any) { alert('测试失败: ' + e.message); }
    await onRefresh();
    setTesting(false);
  };

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const sortedReports = [...reports].sort((a, b) => {
    const getVal = (r: any) => {
      if (sortBy === 'overallScore') return r.overallScore || 0;
      if (sortBy === 'code') return r.capabilities?.code || r.metrics?.codeAvg || 0;
      if (sortBy === 'agent') return r.capabilities?.agent || r.metrics?.reasonAvg || 0;
      if (sortBy === 'chat') return r.capabilities?.chat || r.metrics?.chatAvg || 0;
      if (sortBy === 'speed') return r.capabilities?.speed || 0;
      if (sortBy === 'vision') return (r.capabilities?.visionScore) || 0;
      return r.overallScore || 0;
    };
    return sortDir === 'asc' ? getVal(a) - getVal(b) : getVal(b) - getVal(a);
  });

  const SortHeader = ({ col, children }: { col: string; children: React.ReactNode }) => (
    <th onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', padding: '6px 8px', fontSize: 11, textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
      {children} {sortBy === col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div className="tab-panel">
      <h3 style={{ marginBottom: 16, fontSize: 15 }}>🧪 模型能力测试</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTestMode('quick')} style={{ flex: 1, padding: '12px 16px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: testMode === 'quick' ? 'var(--accent)' : 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600 }}>
          ⚡ 快速测试 <span style={{ fontSize: 10, opacity: 0.7 }}>~3 分钟</span>
        </button>
        <button onClick={() => setTestMode('full')} style={{ flex: 1, padding: '12px 16px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: testMode === 'full' ? 'var(--accent)' : 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600 }}>
          📊 标准测试 <span style={{ fontSize: 10, opacity: 0.7 }}>~12 分钟</span>
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[{ k: 'single', l: '单模型' }, { k: 'provider', l: '单提供商' }, { k: 'all', l: '全部模型' }].map(s => (
          <button key={s.k} className={`btn btn-sm ${scope === s.k ? 'btn-primary' : ''}`} onClick={() => setScope(s.k as any)}>{s.l}</button>
        ))}
      </div>
      {scope === 'single' && (
        <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} style={{ marginBottom: 12, width: '100%' }}>
          <option value="">选择模型</option>
          {allModels.map(m => <option key={m.id} value={m.id}>{m.pIcon} {m.pName} - {m.modelId}</option>)}
        </select>
      )}
      {scope === 'provider' && (
        <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} style={{ marginBottom: 12, width: '100%' }}>
          <option value="">选择提供商</option>
          {providers.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name} ({p.models.filter(m => m.type === 'llm' || m.type === 'vlm').length} 模型)</option>)}
        </select>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={runTest} disabled={testing} style={{ flex: 1 }}>
          {testing ? '⏳ 测试中...' : '🚀 开始测试'}
        </button>
        <button className="btn btn-primary" onClick={() => { setScope('all'); setTimeout(() => runTest(), 100); }} disabled={testing} style={{ background: 'var(--info)' }}>
          {testing ? '⏳ 测试中...' : '🌐 测试全部提供商'}
        </button>
      </div>
      {testing && progress.total > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>{progress.label || '测试中...'}</span>
            <span>{progress.current}/{progress.total}</span>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: Math.max(5, Math.round((progress.current / Math.max(1, progress.total)) * 100)) + '%' }} /></div>
        </div>
      )}
      {lastResult && <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)' }}>{lastResult}</div>}
      {sortedReports.length > 0 && (
        <div style={{ marginBottom: 16, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <SortHeader col="modelName">模型名</SortHeader>
                <th style={{ padding: '6px 8px', fontSize: 11, textAlign: 'left', borderBottom: '1px solid var(--border)' }}>提供商</th>
                <SortHeader col="code">代码</SortHeader>
                <SortHeader col="agent">推理</SortHeader>
                <SortHeader col="chat">对话</SortHeader>
                <SortHeader col="vision">视觉</SortHeader>
                <SortHeader col="speed">速度</SortHeader>
                <SortHeader col="overallScore">总分</SortHeader>
                <th style={{ padding: '6px 8px', fontSize: 11, textAlign: 'left', borderBottom: '1px solid var(--border)' }}>备注</th>
              </tr>
            </thead>
            <tbody>
              {sortedReports.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px', fontWeight: 600 }}>{r.modelName}</td>
                  <td style={{ padding: '8px' }}><span className="badge badge-info">{r.providerName}</span></td>
                  <td style={{ padding: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 40, height: 6, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: ((r.capabilities?.code || r.metrics?.codeAvg || 0) * 10) + '%', height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                      </div>
                      <span>{(r.capabilities?.code || r.metrics?.codeAvg || 0).toFixed(1)}/10</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 40, height: 6, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: ((r.capabilities?.agent || r.metrics?.reasonAvg || 0) * 10) + '%', height: '100%', background: 'var(--info)', borderRadius: 3 }} />
                      </div>
                      <span>{(r.capabilities?.agent || r.metrics?.reasonAvg || 0).toFixed(1)}/10</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 40, height: 6, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: ((r.capabilities?.chat || r.metrics?.chatAvg || 0) * 10) + '%', height: '100%', background: 'var(--success)', borderRadius: 3 }} />
                      </div>
                      <span>{(r.capabilities?.chat || r.metrics?.chatAvg || 0).toFixed(1)}/10</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 40, height: 6, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: ((r.capabilities?.visionScore || 0) * 10) + '%', height: '100%', background: '#b388ff', borderRadius: 3 }} />
                      </div>
                      <span>{(r.capabilities?.visionScore || 0).toFixed(1)}</span>
                      {(r.capabilities?.visionScore || 0) > 0 && <span style={{ fontSize: 9 }}>👁️</span>}
                    </div>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 40, height: 6, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: ((r.capabilities?.speed || 0) * 10) + '%', height: '100%', background: '#ff6b9d', borderRadius: 3 }} />
                      </div>
                      <span>{(r.capabilities?.speed || 0).toFixed(1)}/10</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px', fontWeight: 700, fontSize: 14, color: (r.overallScore || 0) >= 8 ? 'var(--success)' : (r.overallScore || 0) >= 5.6 ? 'var(--warning)' : 'var(--error)' }}>
                    {(r.overallScore || 0).toFixed(1)}
                  </td>
                <td style={{ padding: '8px', fontSize: 11, color: 'var(--text-muted)', maxWidth: 200 }}>{getModelNote(r.modelName) || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {reports.map((r, i) => (
        <div key={i} className="card">
          <div className="card-title">
            {r.modelName}
            <span className="badge badge-info" style={{ marginLeft: 8 }}>{r.providerName}</span>
            {(r.capabilities?.visionScore || 0) > 0 && <span className="badge badge-warning" style={{ marginLeft: 4 }}>👁️ 多模态</span>}
            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700 }}>{r.overallScore?.toFixed(1)}/10</span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
            {r.metrics?.passRate != null && <span>通过率 {r.metrics.passRate}%</span>}
            {r.metrics?.avgLatencyMs != null && <span>平均延迟 {r.metrics.avgLatencyMs}ms</span>}
            {r.metrics?.codeAvg != null && <span>代码 {r.metrics.codeAvg}</span>}
            {r.metrics?.reasonAvg != null && <span>推理 {r.metrics.reasonAvg}</span>}
            {r.metrics?.chatAvg != null && <span>对话 {r.metrics.chatAvg}</span>}
          </div>
          {r.results?.map((t: any, j: number) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12 }}>
              <span className={`badge ${t.score >= 4 ? 'badge-success' : t.score >= 2.8 ? 'badge-warning' : 'badge-error'}`}>{(t.score * 2).toFixed(1)}/10</span>
              <span style={{ flex: 1 }}>{cn(t.testName)}{t.details ? ` · ${cnDetail(String(t.details))}` : ''}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{t.latencyMs}ms</span>
            </div>
          ))}
          {getModelNote(r.modelName) && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
              备注: {getModelNote(r.modelName)}
            </div>
          )}
          {r.capabilities && (
            <div style={{ marginTop: 8 }}>
              <CapabilityBar label="代码" value={r.capabilities.code} color="var(--accent)" />
              <CapabilityBar label="推理" value={r.capabilities.agent} color="var(--info)" />
              <CapabilityBar label="对话" value={r.capabilities.chat} color="var(--success)" />
              <CapabilityBar label="视觉" value={r.capabilities.visionScore || 0} color="#b388ff" />
              <CapabilityBar label="速度" value={r.capabilities.speed || 0} color="#ff6b9d" />
            </div>
          )}
          {r.error && <div style={{ color: 'var(--error)', fontSize: 12, marginTop: 6 }}>错误: {r.error}</div>}
        </div>
      ))}
    </div>
  );
}
// ─── Extensions Panel ───
function ExtensionsPanel() {
  const [subTab, setSubTab] = useState<'mcp' | 'skill-servers' | 'skills'>('mcp');
  const [mcpServers, setMcpServers] = useState<any[]>([]);
  const [mcpPresets, setMcpPresets] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [skillPresets, setSkillPresets] = useState<any[]>([]);
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [customMcp, setCustomMcp] = useState({ name: '', description: '', transport: 'stdio' as string, command: '', args: '', url: '', category: '自定义', icon: '🔧' });
  const [customSkill, setCustomSkill] = useState({ name: '', description: '', content: '', category: '自定义', icon: '🔧' });
  const [editingSkill, setEditingSkill] = useState<any>(null);
  const [skillServers, setSkillServers] = useState<any[]>([]);
  const [skillServerPresets, setSkillServerPresets] = useState<any[]>([]);
  const [showAddSkillServer, setShowAddSkillServer] = useState(false);
  const [customSkillServer, setCustomSkillServer] = useState({ name: '', description: '', transport: 'stdio' as string, command: '', args: '', url: '', category: '自定义', icon: '🔧' });

  const loadAll = useCallback(async () => {
    const [mp, sp, ssp] = await Promise.all([api.fetchMcpPresets(), api.fetchSkillPresets(), api.fetchSkillServerPresets()]);
    setMcpPresets(mp); setSkillPresets(sp); setSkillServerPresets(ssp);
    try { const [ms, sk, ss] = await Promise.all([api.fetchMcpServers(), api.fetchSkills(), api.fetchSkillServers()]); setMcpServers(ms); setSkills(sk); setSkillServers(ss); } catch {}
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  return (
    <div className="tab-panel">
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        <button className={`btn ${subTab === 'mcp' ? 'btn-primary' : ''}`} onClick={() => setSubTab('mcp')} style={{ borderRadius: '6px 6px 0 0' }}>🔌 MCP 服务器</button>
        <button className={`btn ${subTab === 'skill-servers' ? 'btn-primary' : ''}`} onClick={() => setSubTab('skill-servers')} style={{ borderRadius: '6px 6px 0 0' }}>🔧 Skill 服务器</button>
        <button className={`btn ${subTab === 'skills' ? 'btn-primary' : ''}`} onClick={() => setSubTab('skills')} style={{ borderRadius: '6px 6px 0 0' }}>⚡ 专家库</button>
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
                    {s.status && <span className={`badge ${s.status.passed ? 'badge-success' : 'badge-error'}`} style={{ marginLeft: 6 }}>{s.status.passed ? '测试通过' : '测试未通过'}</span>}
                  <button className="btn btn-sm" onClick={async () => { await api.updateMcp(s.id, { enabled: !s.enabled }); loadAll(); }}>{s.enabled ? '禁用' : '启用'}</button>
                  <button className="btn btn-sm" onClick={async () => { await api.removeMcp(s.id); loadAll(); }} style={{ color: 'var(--error)' }}>删除</button>
                    <button className="btn btn-sm" onClick={async () => { await api.testMcp(s.id); loadAll(); }}>测试</button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {subTab === 'skill-servers' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15 }}>🔧 Skill 服务器</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddSkillServer(!showAddSkillServer)}>+ 自定义添加</button>
          </div>
          {showAddSkillServer && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid var(--accent)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input placeholder="名称" value={customSkillServer.name} onChange={e => setCustomSkillServer({...customSkillServer, name: e.target.value})} />
                <input placeholder="图标" value={customSkillServer.icon} onChange={e => setCustomSkillServer({...customSkillServer, icon: e.target.value})} />
              </div>
              <input placeholder="描述" value={customSkillServer.description} onChange={e => setCustomSkillServer({...customSkillServer, description: e.target.value})} style={{ marginBottom: 8 }} />
              <select value={customSkillServer.transport} onChange={e => setCustomSkillServer({...customSkillServer, transport: e.target.value})} style={{ marginBottom: 8 }}>
                <option value="stdio">stdio</option><option value="sse">SSE</option><option value="streamable-http">HTTP</option>
              </select>
              {customSkillServer.transport === 'stdio' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 8 }}>
                  <input placeholder="命令 (如 npx)" value={customSkillServer.command} onChange={e => setCustomSkillServer({...customSkillServer, command: e.target.value})} />
                  <input placeholder="参数 (空格分隔)" value={customSkillServer.args} onChange={e => setCustomSkillServer({...customSkillServer, args: e.target.value})} />
                </div>
              ) : (
                <input placeholder="URL" value={customSkillServer.url} onChange={e => setCustomSkillServer({...customSkillServer, url: e.target.value})} style={{ marginBottom: 8 }} />
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => setShowAddSkillServer(false)}>取消</button>
                <button className="btn btn-primary btn-sm" onClick={async () => { if (customSkillServer.name) { await api.addSkillServerCustom({ name: customSkillServer.name, description: customSkillServer.description, transport: customSkillServer.transport, command: customSkillServer.command || undefined, args: customSkillServer.args ? customSkillServer.args.split(' ').filter(Boolean) : undefined, url: customSkillServer.url || undefined, enabled: true, category: customSkillServer.category, icon: customSkillServer.icon }); setShowAddSkillServer(false); loadAll(); } }}>添加</button>
              </div>
            </div>
          )}
          <h4 style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>预设 Skill 服务器</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 20 }}>
            {skillServerPresets.map((p: any) => {
              const added = skillServers.some((s: any) => s.name === p.name);
              return (
                <div key={p.id} className="card" style={{ cursor: added ? 'default' : 'pointer', opacity: added ? 0.5 : 1, padding: 10 }}
                  onClick={async () => { if (!added) { await api.addSkillServerFromPreset(p.id); loadAll(); } }}>
                  <div className="card-title">{p.icon} {p.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{p.description}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{p.category} · {p.npmPackage || p.transport}</div>
                  {added && <span className="badge badge-success" style={{ marginTop: 4 }}>已添加</span>}
                </div>
              );
            })}
          </div>
          {skillServers.length > 0 && (
            <>
              <h4 style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>已配置</h4>
              {skillServers.map((s: any) => (
                <div key={s.id} className="card" style={{ padding: 10, opacity: s.enabled ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{s.description}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{s.transport}{s.command ? ' · ' + s.command : ''}{s.url ? ' · ' + s.url : ''}</div>
                    </div>
                    <span className={`badge ${s.enabled ? 'badge-success' : 'badge-error'}`}>{s.enabled ? '启用' : '禁用'}</span>
                    {s.status && <span className={`badge ${s.status.passed ? 'badge-success' : 'badge-error'}`} style={{ marginLeft: 6 }}>{s.status.passed ? '测试通过' : '测试未通过'}</span>}
                    <button className="btn btn-sm" onClick={async () => { await api.updateSkillServer(s.id, { enabled: !s.enabled }); loadAll(); }}>{s.enabled ? '禁用' : '启用'}</button>
                    <button className="btn btn-sm" onClick={async () => { await api.removeSkillServer(s.id); loadAll(); }} style={{ color: 'var(--error)' }}>删除</button>
                    <button className="btn btn-sm" onClick={async () => { await api.testSkillServer(s.id); loadAll(); }}>测试</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {subTab === 'skills' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15 }}>⚡ 专家库</h3>
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
          <h4 style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>预设专家</h4>
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
                    {s.status && <span className={`badge ${s.status.passed ? 'badge-success' : 'badge-error'}`} style={{ marginLeft: 6 }}>{s.status.passed ? '测试通过' : '测试未通过'}</span>}
                    <button className="btn btn-sm" onClick={() => setEditingSkill(s)}>编辑</button>
                    <button className="btn btn-sm" onClick={async () => { await api.updateSkill(s.id, { enabled: !s.enabled }); loadAll(); }}>{s.enabled ? '禁用' : '启用'}</button>
                    <button className="btn btn-sm" onClick={async () => { await api.removeSkill(s.id); loadAll(); }} style={{ color: 'var(--error)' }}>删除</button>
                    <button className="btn btn-sm" onClick={async () => { await api.testSkill(s.id); loadAll(); }}>测试</button>
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
  const [tab, setTab] = useState<'chat'|'providers'|'models'|'testing'|'extensions'|'terminal'|'editor'|'files'|'environment'>('chat');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [sending, setSending] = useState(false);
  const [modelId, setModelId] = useState('');
  const [orchThinking, setOrchThinking] = useState<'auto'|'low'|'medium'|'high'>('medium');
  const [agentThinking, setAgentThinking] = useState<'auto'|'low'|'medium'|'high'>('auto');
  const [ratio, setRatio] = useState(0.5);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return (localStorage.getItem('moa-theme') as 'dark' | 'light') || 'dark'; } catch { return 'dark'; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('moa-theme', theme); } catch {}
  }, [theme]);
  const [attachments, setAttachments] = useState<Array<{type:'image'|'text'|'file', name: string, data: string, preview?: string, size?: number}>>([]);
  const [dragging, setDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('');
  const [editingThreadTitle, setEditingThreadTitle] = useState<string>('');
  const dragCounterRef = useRef(0);

  const tabNames: Record<string, string> = {
    chat: '对话', providers: '提供商', models: '模型', testing: '测试',
    extensions: '扩展', files: '文件', terminal: '终端', editor: '编辑器', environment: '环境',
  };

  const loadProviders = useCallback(async () => {
    try { const data = await api.fetchProviders(); setProviders(data); } catch {}
  }, []);

  useEffect(() => { loadProviders(); }, [loadProviders]);
  // Load threads from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('moa-threads');
      if (saved) {
        const parsed = JSON.parse(saved);
        setThreads(parsed);
        if (parsed.length > 0) setActiveThreadId(parsed[0].id);
      }
    } catch {}
  }, []);
  // Persist threads
  useEffect(() => {
    if (threads.length >= 0) try { localStorage.setItem('moa-threads', JSON.stringify(threads)); } catch {}
  }, [threads]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);
  // Auto-save messages to active thread
  useEffect(() => {
    if (activeThreadId && messages.length > 0) {
      setThreads(prev => prev.map(t => t.id === activeThreadId ? { ...t, messages, updatedAt: new Date().toISOString() } : t));
    }
  }, [messages, activeThreadId]);

  // Drag-drop
  useEffect(() => {
    const onOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer) { e.dataTransfer.dropEffect = 'copy'; e.dataTransfer.effectAllowed = 'copy'; } setDragging(true); };
    const onEnter = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current++; if (e.dataTransfer) { e.dataTransfer.dropEffect = 'copy'; e.dataTransfer.effectAllowed = 'copy'; } setDragging(true); };
    const onLeave = (e: DragEvent) => { dragCounterRef.current--; if (dragCounterRef.current === 0) setDragging(false); };
    const onDrop = (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation(); setDragging(false); dragCounterRef.current = 0;
      if (e.dataTransfer?.files) processFiles(Array.from(e.dataTransfer.files));
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => { window.removeEventListener('dragover', onOver); window.removeEventListener('dragenter', onEnter); window.removeEventListener('dragleave', onLeave); window.removeEventListener('drop', onDrop); };
  }, []);

  const processFiles = useCallback((files: File[]) => {
    files.forEach(file => {
      const reader = new FileReader();
      if (file.type.startsWith('image/')) {
        reader.onload = () => setAttachments(prev => [...prev, { type: 'image', name: file.name, data: reader.result as string, preview: reader.result as string, size: file.size }]);
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('text/') || /\.(txt|md|json|py|ts|tsx|js|jsx|csv|xml|yaml|yml|html|css)$/i.test(file.name)) {
        reader.onload = () => setAttachments(prev => [...prev, { type: 'text', name: file.name, data: reader.result as string, size: file.size }]);
        reader.readAsText(file);
      } else {
        reader.onload = () => setAttachments(prev => [...prev, { type: 'file', name: file.name, data: reader.result as string, size: file.size }]);
        reader.readAsDataURL(file);
      }
    });
  }, []);

  const selectedModelSupportsVision = useCallback(() => {
    if (!modelId) return false;
    const m = providers.flatMap(p => p.models).find(m => m.id === modelId);
    return m?.capabilities?.multimodal || m?.type === 'vlm' || false;
  }, [modelId, providers]);

  const findVlmModel = useCallback(() => {
    return providers.flatMap(p => p.models).find(m => m.type === 'vlm' || m.capabilities?.multimodal);
  }, [providers]);

  const handleSend = useCallback(async (overrideText?: string) => {
    const task = overrideText || inputVal.trim();
    if ((!task && attachments.length === 0) || sending) return;

    // Auto-create thread if none active
    if (!activeThreadId) {
      const id = Date.now().toString();
      const now = new Date().toISOString();
      const title = task.slice(0, 30) + (task.length > 30 ? '...' : '');
      const thread: ChatThread = { id, title, messages: [], createdAt: now, updatedAt: now };
      setThreads(prev => [thread, ...prev]);
      setActiveThreadId(id);
    }
    setSending(true);
    const currentAttachments = [...attachments];
    setAttachments([]);
    let content = task;

    // Vision dispatch: if model lacks vision, use VLM to describe images
    const imageAttachments = currentAttachments.filter(a => a.type === 'image');
    if (imageAttachments.length > 0 && !selectedModelSupportsVision()) {
      const vlm = findVlmModel();
      if (vlm) {
        content = `[由 ${vlm.name} 视觉模型分析图片后提供描述作为上下文]\n${task}`;
      }
    }
    const textAttachments = currentAttachments.filter(a => a.type === 'text');
    if (textAttachments.length > 0) {
      content += '\n\n' + textAttachments.map(a => `--- 文件: ${a.name} ---\n${a.data}\n--- 结束 ---`).join('\n\n');
    }

    const displayContent = task || (currentAttachments.length > 0 ? currentAttachments.map(a => a.name).join(', ') : '');
    const userMsg: ChatMsg = { id: Date.now().toString(), role: 'user', content: displayContent, time: new Date().toLocaleTimeString('zh-CN'), attachments: currentAttachments.length > 0 ? currentAttachments : undefined };
    setMessages(prev => [...prev, userMsg]);
    setInputVal('');

    try {
      const chatHistory = messages.filter(m => m.role === 'user' || m.role === 'orchestrator').map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: typeof m.content === 'string' ? m.content : '' }));
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: content, modelId: modelId || undefined, orchestratorThinkingMode: orchThinking, agentThinkingMode: agentThinking, costEfficiencyRatio: ratio, history: chatHistory }) });
      const data = await res.json();
      setMessages(prev => [...prev, { id: (Date.now()+1).toString(), role: data.role || 'orchestrator', content: data.content || data.message || JSON.stringify(data), time: new Date().toLocaleTimeString('zh-CN'), model: data.model, tools: data.tools, agents: data.agents, codeExecution: data.codeExecution, thinkingMode: data.thinkingMode }]);

      // Auto-name thread from first user message
      if (activeThreadId) {
        setThreads(prev => prev.map(t => {
          if (t.id === activeThreadId && t.title === '新建对话') {
            const autoTitle = task.slice(0, 25) + (task.length > 25 ? '...' : '');
            return { ...t, title: autoTitle };
          }
          return t;
        }));
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: (Date.now()+1).toString(), role: 'error', content: err.message || '发送失败，请检查网络连接和 API 配置', time: new Date().toLocaleTimeString('zh-CN') }]);
    } finally { setSending(false); }
  }, [inputVal, attachments, modelId, orchThinking, agentThinking, ratio, providers, selectedModelSupportsVision, findVlmModel, sending]);

  // --- Thread management ---
  const createNewThread = () => {
    const id = Date.now().toString();
    const now = new Date().toISOString();
    const thread: ChatThread = { id, title: '新建对话', messages: [], createdAt: now, updatedAt: now };
    setThreads(prev => [thread, ...prev]);
    setActiveThreadId(id);
    setMessages([]);
    setInputVal('');
  };
  const switchThread = (id: string) => {
    const t = threads.find(x => x.id === id);
    if (t) { setActiveThreadId(id); setMessages(t.messages); }
  };
  const deleteThread = (id: string) => {
    setThreads(prev => prev.filter(t => t.id !== id));
    if (activeThreadId === id) {
      const rest = threads.filter(t => t.id !== id);
      if (rest.length > 0) { setActiveThreadId(rest[0].id); setMessages(rest[0].messages); }
      else { setActiveThreadId(''); setMessages([]); }
    }
  };
  const renameThread = (id: string, title: string) => {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, title } : t));
    setEditingThreadTitle('');
  };

const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) { processFiles(Array.from(e.target.files)); e.target.value = ''; } };

  return (
    <div className="app">
      {dragging && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(56,189,248,0.15)', border:'3px dashed var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{ fontSize:24, fontWeight:700, color:'var(--accent)' }}>📎 拖放文件到此处</div>
        </div>
      )}
      <input ref={fileInputRef} type="file" multiple accept="image/*,.txt,.md,.json,.csv,.py,.js,.ts,.tsx,.jsx,.html,.css,.xml,.yaml,.yml" style={{ display:'none' }} onChange={handleFileInput} />
      <div className="sidebar">
        <div className="sidebar-logo"><span style={{ fontSize:22 }}>🧬</span><span style={{ fontWeight:700, fontSize:14 }}>Mixture of Agents</span></div>
        <div className="sidebar-nav">
          {(['chat','providers','models','testing','extensions','files','terminal','editor','environment'] as const).map(k => (
            <div key={k} className={`sidebar-item ${tab===k?'active':''}`} onClick={() => setTab(k)}>
              <span>{k==='chat'?'💬':k==='providers'?'🔑':k==='models'?'🤖':k==='testing'?'🧪':k==='extensions'?'🧩':k==='files'?'📂':k==='terminal'?'💻':k==='editor'?'📝':'🌐'}</span>
              <span>{tabNames[k]}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
          <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', padding: '6px 12px',
              fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'var(--transition)' }}>
            {theme === 'dark' ? '☀️ 白天模式' : '🌙 黑夜模式'}
          </button>
        </div>
        {/* Thread list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, padding: '0 4px' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>对话历史</span>
            <button onClick={createNewThread} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }} title="新建对话">
              + 新建对话
            </button>
          </div>
          {threads.map(t => (
            <div key={t.id}
              onClick={() => switchThread(t.id)}
              onMouseEnter={(e) => { const el = (e.currentTarget as HTMLElement).querySelector('.thread-actions') as HTMLElement; if (el) el.style.display = 'inline'; }}
              onMouseLeave={(e) => { const el = (e.currentTarget as HTMLElement).querySelector('.thread-actions') as HTMLElement; if (el) el.style.display = 'none'; }}
              style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, marginBottom: 2,
                background: activeThreadId === t.id ? 'var(--accent-glow)' : 'transparent',
                color: activeThreadId === t.id ? 'var(--accent-light)' : 'var(--text-secondary)',
                border: activeThreadId === t.id ? '1px solid rgba(108,92,231,0.3)' : '1px solid transparent',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s ease' }}>
              {editingThreadTitle === t.id ? (
                <input autoFocus defaultValue={t.title} style={{ flex: 1, fontSize: 12, padding: '1px 4px', background: 'var(--bg-tertiary)', border: '1px solid var(--accent)', borderRadius: 3, color: 'var(--text-primary)' }}
                  onBlur={(e) => renameThread(t.id, (e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') renameThread(t.id, (e.target as HTMLInputElement).value); }}
                  onClick={(e) => e.stopPropagation()} />
              ) : (
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
              )}
              <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>{t.messages.length}</span>
              <span className="thread-actions" style={{ display: 'none', flexShrink: 0 }}>
                <span onClick={(e) => { e.stopPropagation(); setEditingThreadTitle(t.id); }} style={{ cursor: 'pointer', fontSize: 12, marginRight: 2 }} title="重命名">✏️</span>
                <span onClick={(e) => { e.stopPropagation(); deleteThread(t.id); }} style={{ cursor: 'pointer', fontSize: 12 }} title="删除">🗑️</span>
              </span>
            </div>
          ))}
          {threads.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 4px', textAlign: 'center' }}>暂无对话历史</div>
          )}
        </div>
      </div>
      {tab === 'chat' ? (
        <div className="main-content">
          <div className="chat-container">
            {messages.length === 0 ? (
              <WelcomeScreen onQuickStart={(task) => { setInputVal(task); setTimeout(() => handleSend(task), 100); }} />
            ) : (
              <div className="chat-messages">
                {messages.map(m => <div key={m.id} id={'msg-'+m.id}><ChatMessage msg={m} /></div>)}
                {sending && (
                  <div className="message">
                    <div className="message-avatar orchestrator">🧠</div>
                    <div className="message-body">
                      <div className="message-header"><span className="message-name">调度引擎</span><span className="message-time">思考中...</span></div>
                      <div style={{ display:'flex', gap:4, padding:'4px 0' }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', animation:'pulse 1s infinite 0s' }} />
                        <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', animation:'pulse 1s infinite 0.2s' }} />
                        <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', animation:'pulse 1s infinite 0.4s' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
            <div className="prompt-bar">
              {attachments.length > 0 && <AttachmentPreview attachments={attachments} onRemove={(i) => setAttachments(prev => prev.filter((_, idx) => idx !== i))} />}
              <div className="prompt-wrapper">
                <textarea ref={inputRef} className="prompt-input" value={inputVal} onChange={e => setInputVal(e.target.value)}
                  onKeyDown={handleKeyDown} placeholder="描述你的任务... (Enter 发送, Shift+Enter 换行, 拖拽文件可上传)"
                  rows={4} style={{ height: Math.min(200, Math.max(88, inputVal.split('\n').length * 22)) }} />
                <div className="prompt-actions">
                  <button className="prompt-btn" onClick={() => fileInputRef.current?.click()} title="添加文件" style={{ fontSize:16, fontWeight:700 }}>＋</button>
                  <button className="prompt-btn send" onClick={() => handleSend()} disabled={(!inputVal.trim() && attachments.length===0) || sending}>▶</button>
                </div>
              </div>
              <div className="prompt-meta">
                <span className="prompt-meta-chip" onClick={() => setSettingsOpen(!settingsOpen)}>⚙️ {modelId ? providers.flatMap(p=>p.models).find(m=>m.id===modelId)?.name || '已选模型' : '自动选择'}</span>
                <span className="prompt-meta-chip" onClick={() => setSettingsOpen(!settingsOpen)}>💠 {orchThinking==='auto'?'自动':orchThinking==='low'?'低':orchThinking==='medium'?'中':'高'} | 子代理: {agentThinking==='auto'?'自动':agentThinking==='low'?'低':agentThinking==='medium'?'中':'高'}</span>
                <span className="prompt-meta-chip" onClick={() => setSettingsOpen(!settingsOpen)}>{ratio<=0.2?'🚀 效率':ratio>=0.8?'💰 成本':'⚖️ 均衡'} {ratio}</span>
                <span style={{ marginLeft:'auto' }}>{providers.length} 提供商 · {providers.flatMap(p=>p.models).length} 模型</span>
              </div>
            </div>
          </div>
          <SettingsPanel providers={providers} ratio={ratio} setRatio={setRatio} orchThinking={orchThinking} setOrchThinking={setOrchThinking} agentThinking={agentThinking} setAgentThinking={setAgentThinking}
            modelId={modelId} setModelId={setModelId} visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
      ) : (
        <div className="main-content">
          <div className="header"><h1>{tabNames[tab]}</h1></div>
          {tab === 'providers' && <ProviderPanel providers={providers} onRefresh={loadProviders} />}
          {tab === 'models' && <ModelPanel providers={providers} />}
          {tab === 'testing' && <TestingPanel providers={providers} onRefresh={loadProviders} />}
          {tab === 'extensions' && <ExtensionsPanel />}
          {tab === 'files' && <div style={{height:'calc(100vh - 60px)'}}><FileManager /></div>}
          {tab === 'terminal' && <div style={{height:'calc(100vh - 60px)'}}><TerminalPanel /></div>}
          {tab === 'editor' && <div style={{height:'calc(100vh - 60px)'}}><EditorPanel /></div>}
          {tab === 'environment' && <EnvironmentPanel />}
        </div>
      )}
    </div>
  );
}
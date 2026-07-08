import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './services/api';
import type { Provider, ProviderPreset, Model, McpPreset, SkillPreset, McpServerConfig, SkillConfig, Project } from './types';
import { TerminalPanel } from './components/Terminal';
import { EditorPanel } from './components/Editor';
import { EnvironmentPanel } from './components/Environment';

// 閳光偓閳光偓閳光偓 Helper Components 閳光偓閳光偓閳光偓

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
        <span>棣冩畬 閺佸牏宸?(0)</span><span>閳挎牭绗?閸у洩銆€ (0.5)</span><span>棣冩尩 閹存劖婀?(1)</span>
      </div>
      <div className="slider-container">
        <input type="range" className="slider" min={0} max={1} step={0.01} value={value} onChange={e => handleSlider(parseFloat(e.target.value))} />
        <input type="number" value={inputVal} onChange={e => handleInput(e.target.value)} min={0} max={1} step={0.01}
          style={{ width: 56, textAlign: 'center', fontWeight: 600, fontSize: 12, padding: '4px 6px' }} />
      </div>
    </div>
  );
}

// 閳光偓閳光偓閳光偓 Tool Call Card (like Codex/Claude Code) 閳光偓閳光偓閳光偓
function ToolCard({ tool }: { tool: { name: string; status: string; output?: string; icon: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="tool-card">
      <div className="tool-card-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-icon">{tool.icon}</span>
        <span className="tool-name">{tool.name}</span>
        <span className={`tool-status ${tool.status}`}>
          {tool.status === 'running' ? '閳?鏉╂劘顢戞稉? : tool.status === 'success' ? '閴?鐎瑰本鍨? : '閴?婢惰精瑙?}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>{expanded ? '閳? : '閳?}</span>
      </div>
      {expanded && tool.output && (
        <div className="tool-card-body">{tool.output}</div>
      )}
    </div>
  );
}

// 閳光偓閳光偓閳光偓 Message Component 閳光偓閳光偓閳光偓
function ChatMessage({ msg }: { msg: ChatMsg }) {
  const roleClass = msg.role === 'user' ? 'user' : msg.role === 'orchestrator' ? 'orchestrator' : msg.role === 'error' ? 'error' : 'system';
  const roleIcon = msg.role === 'user' ? '棣冩噥' : msg.role === 'orchestrator' ? '棣冾潵' : msg.role === 'error' ? '閳跨媴绗? : msg.role === 'agent' ? '棣冾樆' : '棣冩尠';
  const roleName = msg.role === 'user' ? '娴? : msg.role === 'orchestrator' ? '鐠嬪啫瀹冲鏇熸惛' : msg.role === 'error' ? '缁崵绮? : msg.role === 'agent' ? (msg.agentName || '鐎涙劒鍞悶?) : '缁崵绮?;
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

// 閳光偓閳光偓閳光偓 Welcome Screen 閳光偓閳光偓閳光偓
function WelcomeScreen({ onQuickStart }: { onQuickStart: (task: string) => void }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-logo">棣冃?/div>
      <div className="welcome-title">Mixture of Agents</div>
      <div className="welcome-subtitle">婢舵碍膩閸ㄥ宕楅崥灞炬閼虫垝缍嬬化鑽ょ埠 閳?閸╄桨绨?Claude Code 閸愬懏鐗抽惃鍕閼冲€熺殶鎼达箑绱╅幙搴礉閼奉亜濮╅崚鍡涘帳閺堚偓闁倸鎮庨惃鍕侀崹瀣暚閹存劒鎹㈤崝?/div>
      <div className="welcome-cards">
        <div className="welcome-card" onClick={() => onQuickStart('鐢喗鍨滈崘娆庣娑?Express.js REST API閿涘苯瀵橀崥顐ゆ暏閹?CRUD 閹垮秳缍旈崪?SQLite 閺佺増宓佹惔?)}>
          <div className="welcome-card-icon">棣冩崌</div>
          <div className="welcome-card-title">缂傛牕鍟撴禒锝囩垳</div>
          <div className="welcome-card-desc">閸掓稑缂撴い鍦窗閵嗕胶绱崘娆庡敩閻降鈧浇鍤滈崝銊︾ゴ鐠?/div>
        </div>
        <div className="welcome-card" onClick={() => onQuickStart('閸掑棙鐎借ぐ鎾冲閻╊喖缍嶆稉瀣畱 CSV 閺佺増宓侀弬鍥︽閿涘瞼鏁撻幋鎰埠鐠佲剝濮ら崨濠傛嫲閸欘垵顫嬮崠鏍ф禈鐞涖劌缂撶拋?)}>
          <div className="welcome-card-icon">棣冩惓</div>
          <div className="welcome-card-title">閸掑棙鐎介弫鐗堝祦</div>
          <div className="welcome-card-desc">閺佺増宓侀崚鍡樼€介妴浣瑰Г閸涘﹦鏁撻幋鎰┾偓浣界Ъ閸斿灝褰傞悳?/div>
        </div>
        <div className="welcome-card" onClick={() => onQuickStart('鐢喗鍨滅拋鎹愵吀娑撯偓娑擃亜宕ョ€广垻閮寸紒鐔烘畱閺嬭埖鐎弬瑙勵攳閿涘苯瀵橀幏顒€澧犻崥搴ｎ伂閹垛偓閺堫垶鈧鐎烽妴浣规殶閹诡喖绨辩拋鎹愵吀閸滃矂鍎寸純鍙夋煙濡?)}>
          <div className="welcome-card-icon">棣冨綀閿?/div>
          <div className="welcome-card-title">缁崵绮虹拋鎹愵吀</div>
          <div className="welcome-card-desc">閺嬭埖鐎拋鎹愵吀閵嗕焦濡ч張顖炩偓澶婄€烽妴浣规煙濡楀牐鐦庢导?/div>
        </div>
      </div>
    </div>
  );
}

// 閳光偓閳光偓閳光偓 Types for Chat 閳光偓閳光偓閳光偓
interface ChatMsg {
  id: string; role: 'user' | 'orchestrator' | 'agent' | 'system' | 'error';
  content: string; time: string; model?: string; agentName?: string;
  tools?: Array<{ name: string; status: string; output?: string; icon: string }>;
  agents?: Array<{ name: string; status: string; task: string; model: string }>;
}

// 閳光偓閳光偓閳光偓 Settings Panel (right side) 閳光偓閳光偓閳光偓
function SettingsPanel({ providers, ratio, setRatio, thinking, setThinking, modelId, setModelId, visible, onClose }: {
  providers: Provider[]; ratio: number; setRatio: (v: number) => void;
  thinking: string; setThinking: (v: any) => void;
  modelId: string; setModelId: (v: string) => void;
  visible: boolean; onClose: () => void;
}) {
  if (!visible) return null;
  const allModels = providers.flatMap(p => p.models.filter(m => (m.type === 'llm' || m.type === 'vlm')).map(m => ({ ...m, pName: p.name, pIcon: p.icon })));
  const totalKeys = providers.reduce((s, p) => s + p.apiKeys.length, 0);
  return (
    <div className="settings-drawer">
      <div className="settings-drawer-header">
        <h3>閳挎瑱绗?鐠佸墽鐤?/h3>
        <button className="btn btn-sm btn-icon" onClick={onClose}>閴?/button>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">鐎瑰繗顫囩拫鍐╁付濡€崇€?/div>
        <select value={modelId} onChange={e => setModelId(e.target.value)}>
          <option value="">閼奉亜濮╅柅澶嬪</option>
          {allModels.map(m => <option key={m.id} value={m.id}>{m.pIcon} {m.pName} - {m.name}</option>)}
        </select>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">閹繆鈧啫宸辨惔?/div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['low', 'medium', 'high'].map(m => (
            <button key={m} className={`btn btn-sm ${thinking === m ? 'btn-primary' : ''}`}
              onClick={() => setThinking(m)} style={{ flex: 1 }}>
              {m === 'low' ? '娴? : m === 'medium' ? '娑? : '妤?}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">閹存劖婀?/ 閺佸牏宸?閸嬪繐銈?/div>
        <CostEfficiencySlider value={ratio} onChange={setRatio} />
      </div>
      <div className="settings-section">
        <div className="settings-section-title">韫囶偊鈧喓绮虹拋?/div>
        <div className="settings-row"><label>瀹告煡鍘ょ純顔藉絹娓氭稑鏅?/label><span>{providers.length}</span></div>
        <div className="settings-row"><label>閸欘垳鏁ゅΟ鈥崇€?/label><span>{allModels.length}</span></div>
        <div className="settings-row"><label>API Keys</label><span>{totalKeys}</span></div>
      </div>
    </div>
  );
}

// 閳光偓閳光偓閳光偓 Provider Management Panel 閳光偓閳光偓閳光偓
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
      <h3 style={{ marginBottom: 16, fontSize: 15 }}>棣冩憹 妫板嫯顔曢幓鎰返閸?/h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 24 }}>
        {presets.map(p => {
          const added = providers.some(pr => pr.name === p.name);
          return (
            <div key={p.id} className="card" style={{ cursor: added ? 'default' : 'pointer', opacity: added ? 0.5 : 1, padding: 12 }}
              onClick={() => !added && addPreset(p.id)}>
              <div className="card-title">{p.icon} {p.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{p.description}</div>
              {added && <span className="badge badge-success" style={{ marginTop: 6 }}>瀹稿弶鍧婇崝?/span>}
            </div>
          );
        })}
      </div>

      <h3 style={{ marginBottom: 12, fontSize: 15 }}>棣冩暋 閼奉亜鐣炬稊澶嬪絹娓氭稑鏅?/h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input placeholder="閸氬秶袨" value={customName} onChange={e => setCustomName(e.target.value)} style={{ flex: 1 }} />
        <input placeholder="Base URL" value={customUrl} onChange={e => setCustomUrl(e.target.value)} style={{ flex: 2 }} />
        <button className="btn btn-primary" onClick={addCustom}>濞ｈ濮?/button>
      </div>

      {providers.length > 0 && (
        <>
          <h3 style={{ marginBottom: 12, fontSize: 15 }}>棣冩斀 API Key 缁狅紕鎮?/h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <select value={selProv} onChange={e => setSelProv(e.target.value)} style={{ flex: 1 }}>
              <option value="">闁瀚ㄩ幓鎰返閸?/option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.icon || '棣冩敳'} {p.name}</option>)}
            </select>
            <input placeholder="API Key" value={newKey} onChange={e => setNewKey(e.target.value)} type="password" style={{ flex: 2 }} />
            <button className="btn btn-primary" onClick={addKey}>濞ｈ濮?/button>
          </div>
          {providers.map(p => (
            <div key={p.id} className="card">
              <div className="card-title">
                {p.icon || '棣冩敳'} {p.name}
                <span className="badge badge-info" style={{ marginLeft: 8 }}>{p.models.length} 濡€崇€?/span>
                <span className="badge badge-success" style={{ marginLeft: 4 }}>{p.apiKeys.length} Keys</span>
                {p.apiKeys.length > 0 && (
                  <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => fetchModels(p.id)} disabled={fetching === p.id}>
                    {fetching === p.id ? '閳?閼惧嘲褰囨稉?..' : '棣冩敡 閼惧嘲褰囧Ο鈥崇€?}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>{p.baseUrl}</div>
              {p.models.map(m => (
                <div key={m.id} style={{ padding: '3px 0', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{m.name}</span>
                  <span className={`badge ${m.type === 'llm' ? 'badge-info' : m.type === 'vlm' ? 'badge-primary' : m.type === 'tts' ? 'badge-accent' : m.type === 'image' ? 'badge-warning' : m.type === 'video' ? 'badge-error' : 'badge-success'}`}>{m.type}</span>
                  {m.capabilities.multimodal && <span className="badge badge-warning">婢舵碍膩閹?/span>}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// 閳光偓閳光偓閳光偓 Model Capabilities Panel 閳光偓閳光偓閳光偓
function ModelPanel({ providers }: { providers: Provider[] }) {
  const allModels = providers.flatMap(p => p.models.map(m => ({ ...m, providerName: p.name, providerIcon: p.icon })));
  const [selected, setSelected] = useState('');
  const model = allModels.find(m => m.id === selected);
  return (
    <div className="tab-panel">
      <h3 style={{ marginBottom: 16, fontSize: 15 }}>棣冨箚 濡€崇€烽懗钘夊閹槒顫?/h3>
      <select value={selected} onChange={e => setSelected(e.target.value)} style={{ marginBottom: 16 }}>
        <option value="">闁瀚ㄥΟ鈥崇€烽弻銉ф箙鐠囷附鍎?/option>
        {allModels.map(m => <option key={m.id} value={m.id}>{m.providerIcon} {m.providerName} - {m.name}</option>)}
      </select>
      {model && (
        <div className="card">
          <div className="card-title">{model.providerIcon} {model.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>{model.providerName} 璺?{model.type}</div>
          <CapabilityBar label="娴狅絿鐖? value={model.capabilities.code} color="var(--accent)" />
          <CapabilityBar label="Agent" value={model.capabilities.agent} color="var(--info)" />
          <CapabilityBar label="鐎电鐦? value={model.capabilities.chat} color="var(--success)" />
          <CapabilityBar label="娑撳﹣绗呴弬? value={model.capabilities.context} color="var(--warning)" />
          <CapabilityBar label="闁喎瀹? value={model.capabilities.speed} color="#ff6b9d" />
          <div style={{ marginTop: 12, fontSize: 12, display: 'flex', gap: 16 }}>
            <span>棣冩憸 鏉堟挸鍙? ${model.capabilities.pricing.inputPer1M}/1M</span>
            <span>棣冩憶 鏉堟挸鍤? ${model.capabilities.pricing.outputPer1M}/1M</span>
            {model.capabilities.multimodal && <span className="badge badge-warning">婢舵碍膩閹?/span>}
          </div>
        </div>
      )}
    </div>
  );
}

// 閳光偓閳光偓閳光偓 Testing Panel 閳光偓閳光偓閳光偓
function TestingPanel({ providers }: { providers: Provider[] }) {
  const allModels = providers.flatMap(p => p.models.filter(m => (m.type === 'llm' || m.type === 'vlm')).map(m => ({ ...m, pName: p.name, pIcon: p.icon, provId: p.id })));
  const [scope, setScope] = useState<'single' | 'provider' | 'all'>('single');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [testMode, setTestMode] = useState<'quick' | 'full'>('quick');
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [reports, setReports] = useState<any[]>([]);
  const [lastResult, setLastResult] = useState('');

  const providerModels = selectedProvider ? providers.find(p => p.id === selectedProvider)?.models.filter(m => m.type === 'llm' || m.type === 'vlm') || [] : [];

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
          {providers.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name} ({p.models.filter(m=>m.type==='llm'||m.type==='vlm').length} models)</option>)}
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

// 閳光偓閳光偓閳光偓 Extensions Panel 閳光偓閳光偓閳光偓
function ExtensionsPanel() {
  const [subTab, setSubTab] = useState<'mcp' | 'skills'>('mcp');
  const [mcpServers, setMcpServers] = useState<any[]>([]);
  const [mcpPresets, setMcpPresets] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [skillPresets, setSkillPresets] = useState<any[]>([]);
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [customMcp, setCustomMcp] = useState({ name: '', description: '', transport: 'stdio' as string, command: '', args: '', url: '', category: '閼奉亜鐣炬稊?, icon: '棣冩暋' });
  const [customSkill, setCustomSkill] = useState({ name: '', description: '', content: '', category: '閼奉亜鐣炬稊?, icon: '棣冩暋' });
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
        <button className={`btn ${subTab === 'mcp' ? 'btn-primary' : ''}`} onClick={() => setSubTab('mcp')} style={{ borderRadius: '6px 6px 0 0' }}>棣冩敳 MCP 閺堝秴濮熼崳?/button>
        <button className={`btn ${subTab === 'skills' ? 'btn-primary' : ''}`} onClick={() => setSubTab('skills')} style={{ borderRadius: '6px 6px 0 0' }}>閳?閹垛偓閼宠棄绨?/button>
      </div>

      {subTab === 'mcp' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15 }}>棣冩敳 MCP 閺堝秴濮熼崳?/h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddMcp(!showAddMcp)}>+ 閼奉亜鐣炬稊澶嬪潑閸?/button>
          </div>
          {showAddMcp && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid var(--accent)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input placeholder="閸氬秶袨" value={customMcp.name} onChange={e => setCustomMcp({...customMcp, name: e.target.value})} />
                <input placeholder="閸ョ偓鐖? value={customMcp.icon} onChange={e => setCustomMcp({...customMcp, icon: e.target.value})} />
              </div>
              <input placeholder="閹诲繗鍫? value={customMcp.description} onChange={e => setCustomMcp({...customMcp, description: e.target.value})} style={{ marginBottom: 8 }} />
              <select value={customMcp.transport} onChange={e => setCustomMcp({...customMcp, transport: e.target.value})} style={{ marginBottom: 8 }}>
                <option value="stdio">stdio</option><option value="sse">SSE</option><option value="streamable-http">HTTP</option>
              </select>
              {customMcp.transport === 'stdio' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 8 }}>
                  <input placeholder="閸涙垝鎶?(婵?npx)" value={customMcp.command} onChange={e => setCustomMcp({...customMcp, command: e.target.value})} />
                  <input placeholder="閸欏倹鏆?(缁岀儤鐗搁崚鍡涙)" value={customMcp.args} onChange={e => setCustomMcp({...customMcp, args: e.target.value})} />
                </div>
              ) : (
                <input placeholder="URL" value={customMcp.url} onChange={e => setCustomMcp({...customMcp, url: e.target.value})} style={{ marginBottom: 8 }} />
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => setShowAddMcp(false)}>閸欐牗绉?/button>
                <button className="btn btn-primary btn-sm" onClick={async () => { if (customMcp.name) { await api.addMcpCustom({ name: customMcp.name, description: customMcp.description, transport: customMcp.transport, command: customMcp.command || undefined, args: customMcp.args ? customMcp.args.split(' ').filter(Boolean) : undefined, url: customMcp.url || undefined, enabled: true, category: customMcp.category, icon: customMcp.icon }); setShowAddMcp(false); loadAll(); } }}>濞ｈ濮?/button>
              </div>
            </div>
          )}
          <h4 style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>妫板嫯顔?MCP 閺堝秴濮熼崳?/h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 20 }}>
            {mcpPresets.map((p: any) => {
              const added = mcpServers.some((s: any) => s.name === p.name);
              return (
                <div key={p.id} className="card" style={{ cursor: added ? 'default' : 'pointer', opacity: added ? 0.5 : 1, padding: 10 }}
                  onClick={async () => { if (!added) { await api.addMcpFromPreset(p.id); loadAll(); } }}>
                  <div className="card-title">{p.icon} {p.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>{p.description}</div>
                  <span className="badge badge-info">{p.transport}</span>
                  {added && <span className="badge badge-success" style={{ marginLeft: 4 }}>瀹稿弶鍧婇崝?/span>}
                </div>
              );
            })}
          </div>
          {mcpServers.length > 0 && (
            <>
              <h4 style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>瀹告煡鍘ょ純?/h4>
              {mcpServers.map((s: any) => (
                <div key={s.id} className="card" style={{ padding: 10, opacity: s.enabled ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{s.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{s.transport === 'stdio' ? s.command + ' ' + (s.args || []).join(' ') : s.url}</div>
                  </div>
                  <span className={`badge ${s.enabled ? 'badge-success' : 'badge-error'}`}>{s.enabled ? '閸氼垳鏁? : '缁備胶鏁?}</span>
                  <button className="btn btn-sm" onClick={async () => { await api.updateMcp(s.id, { enabled: !s.enabled }); loadAll(); }}>{s.enabled ? '缁備胶鏁? : '閸氼垳鏁?}</button>
                  <button className="btn btn-sm" onClick={async () => { await api.removeMcp(s.id); loadAll(); }} style={{ color: 'var(--error)' }}>閸掔娀娅?/button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {subTab === 'skills' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15 }}>閳?閹垛偓閼宠棄绨?/h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddSkill(!showAddSkill)}>+ 閼奉亜鐣炬稊澶婂灡瀵?/button>
          </div>
          {showAddSkill && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid var(--accent)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input placeholder="閹垛偓閼宠棄鎮曠粔? value={customSkill.name} onChange={e => setCustomSkill({...customSkill, name: e.target.value})} />
                <input placeholder="閸ョ偓鐖? value={customSkill.icon} onChange={e => setCustomSkill({...customSkill, icon: e.target.value})} />
              </div>
              <input placeholder="閹诲繗鍫? value={customSkill.description} onChange={e => setCustomSkill({...customSkill, description: e.target.value})} style={{ marginBottom: 8 }} />
              <textarea placeholder="閹垛偓閼宠棄鍞寸€?缁崵绮洪幓鎰仛鐠?.." value={customSkill.content} onChange={e => setCustomSkill({...customSkill, content: e.target.value})} style={{ minHeight: 100, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => setShowAddSkill(false)}>閸欐牗绉?/button>
                <button className="btn btn-primary btn-sm" onClick={async () => { if (customSkill.name && customSkill.content) { await api.addSkillCustom({ name: customSkill.name, description: customSkill.description, content: customSkill.content, source: 'file', enabled: true, category: customSkill.category, icon: customSkill.icon }); setShowAddSkill(false); loadAll(); } }}>閸掓稑缂?/button>
              </div>
            </div>
          )}
          {editingSkill && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid var(--warning)' }}>
              <div className="card-title">缂傛牞绶? {editingSkill.icon} {editingSkill.name}</div>
              <input value={editingSkill.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingSkill({...editingSkill, name: e.target.value})} style={{ marginBottom: 8 }} />
              <textarea value={editingSkill.content} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditingSkill({...editingSkill, content: e.target.value})} style={{ minHeight: 120, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => setEditingSkill(null)}>閸欐牗绉?/button>
                <button className="btn btn-primary btn-sm" onClick={async () => { await api.updateSkill(editingSkill.id, { content: editingSkill.content, name: editingSkill.name }); setEditingSkill(null); loadAll(); }}>娣囨繂鐡?/button>
              </div>
            </div>
          )}
          <h4 style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>妫板嫯顔曢幎鈧懗?/h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 20 }}>
            {skillPresets.map((p: any) => {
              const added = skills.some((s: any) => s.name === p.name);
              return (
                <div key={p.id} className="card" style={{ cursor: added ? 'default' : 'pointer', opacity: added ? 0.5 : 1, padding: 10 }}
                  onClick={async () => { if (!added) { await api.addSkillFromPreset(p.id); loadAll(); } }}>
                  <div className="card-title">{p.icon} {p.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{p.description}</div>
                  {added && <span className="badge badge-success" style={{ marginTop: 4 }}>瀹稿弶鍧婇崝?/span>}
                </div>
              );
            })}
          </div>
          {skills.length > 0 && (
            <>
              <h4 style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>瀹告煡鍘ょ純?/h4>
              {skills.map((s: any) => (
                <div key={s.id} className="card" style={{ padding: 10, opacity: s.enabled ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{s.description}</div>
                    </div>
                    <span className={`badge ${s.enabled ? 'badge-success' : 'badge-error'}`}>{s.enabled ? '閸氼垳鏁? : '缁備胶鏁?}</span>
                    <button className="btn btn-sm" onClick={() => setEditingSkill(s)}>缂傛牞绶?/button>
                    <button className="btn btn-sm" onClick={async () => { await api.updateSkill(s.id, { enabled: !s.enabled }); loadAll(); }}>{s.enabled ? '缁備胶鏁? : '閸氼垳鏁?}</button>
                    <button className="btn btn-sm" onClick={async () => { await api.removeSkill(s.id); loadAll(); }} style={{ color: 'var(--error)' }}>閸掔娀娅?/button>
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

// 閳光偓閳光偓閳光偓 Main App 閳光偓閳光偓閳光偓
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
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('moa-theme') as 'dark' | 'light') || 'dark');
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
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'orchestrator', content: '棣冾潵 濮濓絽婀崚鍡樼€芥禒璇插楠炶泛鍨庣憴锝呯摍娴犺濮?..', time }]);
        } else if (d.status === 'executing') {
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'orchestrator', content: '閳?閸掑棜袙鐎瑰本鍨氶敍灞绢劀閸︺劌鍨庨柊?' + d.subtasks + ' 娑擃亜鐡欐禒璇插缂佹瑥鐡欐禒锝囨倞...', time }]);
        } else if (d.status === 'completed') {
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'orchestrator', content: '閴?娴犺濮熺€瑰本鍨氶敍涔梟\n' + (d.result || ''), time }]);
          setSending(false);
        }
      } else if (msg.type === 'agent_update') {
        const a = msg.payload.agent;
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'orchestrator' && last.agents) {
            last.agents = [...last.agents, { name: a.name, status: a.status, task: '閹笛嗩攽娑?..', model: a.modelId }];
          } else {
            updated.push({ id: Date.now().toString(), role: 'system', content: '', time, agents: [{ name: a.name, status: a.status, task: '瀹告彃鍨庨柊?, model: a.modelId }] });
          }
          return updated;
        });
      } else if (msg.type === 'task_update') {
        const t = msg.payload.task;
        const idBase = t.id || Date.now().toString();
        if (t.status === 'completed') {
          setMessages(prev => [...prev, { id: idBase, role: 'agent', content: '\u2705 ' + t.description.slice(0, 60) + '\n' + (t.result || '').slice(0, 300), time, tools: [{ name: t.description.slice(0, 40), status: 'success', output: t.result?.slice(0, 500), icon: '\uD83D閿? }] }]);
        } else if (t.status === 'failed') {
          setMessages(prev => [...prev, { id: idBase + '-fail', role: 'error', content: '\u274C Subtask failed: ' + t.description.slice(0, 60) + '\n' + (t.error || ''), time }]);
        } else if (t.status === 'running') {
          setMessages(prev => [...prev, { id: idBase, role: 'system', content: '\uD83D\uDE80 Running: ' + t.description.slice(0, 80), time }]);
        } else if (t.status === 'retrying') {
          setMessages(prev => [...prev, { id: idBase + '-retry-' + t.attempts, role: 'system', content: '\uD83D\uDD01 Retry #' + t.attempts + ': ' + t.description.slice(0, 80), time }]);
        }
      } else if (msg.type === 'issue_created') {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: '閳跨媴绗?闂傤噣顣界拋鏉跨秿: ' + JSON.stringify(msg.payload), time }]);
      }
      if (msg.payload?.projectId) {
        fetch('/api/projects/' + msg.payload.projectId).then(r => r.json()).then(setProject).catch(() => {});
      }
    };
    return () => ws.close();
  }, [loadProviders]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('moa-theme', theme);
  }, [theme]);


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
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'error', content: '閸欐垿鈧礁銇戠拹? ' + e.message, time }]);
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const tabNames: Record<string, string> = { chat: '棣冩尠 鐎电鐦?, providers: '棣冩憹 閹绘劒绶甸崯?, models: '棣冨箚 濡€崇€?, testing: '棣冃?濞村鐦?, extensions: '棣冩敳 閹碘晛鐫?, terminal: '閳鳖煉绗?缂佸牏顏?, editor: '棣冩憫 缂傛牞绶崳?, environment: '閳挎瑱绗?閻滎垰顣? };

  return (
    <div className="app">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-brand">
          <span className="logo">棣冃?/span>
          <div>
            <div className="title">Mixture of Agents</div>
            <div className="subtitle">婢舵碍膩閸ㄥ宕楅崥?璺?閺呴缚鍏樼拫鍐ㄥ</div>
          </div>
          <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
        <div className="sidebar-tabs">
          {(Object.entries(tabNames) as [string, string][]).map(([k, l]) => (
            <div key={k} className={`sidebar-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k as any)}>{l}</div>
          ))}
        </div>
        {tab === 'chat' && messages.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">閺堚偓鏉╂垵顕拠?/div>
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
                    <div className="message-avatar orchestrator">棣冾潵</div>
                    <div className="message-body">
                      <div className="message-header"><span className="message-name">鐠嬪啫瀹冲鏇熸惛</span><span className="message-time">閹繆鈧啩鑵?..</span></div>
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
                  onKeyDown={handleKeyDown} placeholder="閹诲繗鍫担鐘垫畱娴犺濮?.. (Enter 閸欐垿鈧? Shift+Enter 閹广垼顢?"
                  rows={1} style={{ height: Math.min(120, Math.max(24, inputVal.split('\n').length * 22)) }} />
                <div className="prompt-actions">
                  <button className="prompt-btn send" onClick={() => handleSend()} disabled={!inputVal.trim() || sending}>閳?/button>
                </div>
              </div>
              <div className="prompt-meta">
                <span className="prompt-meta-chip" onClick={() => setSettingsOpen(!settingsOpen)}>
                  閳挎瑱绗?{modelId ? providers.flatMap(p => p.models).find(m => m.id === modelId)?.name || '瀹告煡鈧膩閸? : '閼奉亜濮╅柅澶嬪'}
                </span>
                <span className="prompt-meta-chip" onClick={() => setSettingsOpen(!settingsOpen)}>
                  棣冾潵 {thinking === 'low' ? '娴? : thinking === 'medium' ? '娑? : '妤?}
                </span>
                <span className="prompt-meta-chip" onClick={() => setSettingsOpen(!settingsOpen)}>
                  {ratio <= 0.2 ? '棣冩畬 閺佸牏宸? : ratio >= 0.8 ? '棣冩尩 閹存劖婀? : '閳挎牭绗?閸у洩銆€'} {ratio}
                </span>
                <span style={{ marginLeft: 'auto' }}>{providers.length} 閹绘劒绶甸崯?璺?{providers.flatMap(p => p.models).length} 濡€崇€?/span>
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

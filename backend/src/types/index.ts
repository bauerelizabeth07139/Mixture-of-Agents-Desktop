export type ModelCapability = 'code' | 'agent' | 'chat' | 'multimodal' | 'reasoning' | 'fast';

export interface ModelCapabilityProfile {
  code: number; agent: number; chat: number; context: number; speed: number; multimodal: boolean;
  visionScore: number;  // 0-10, from multimodal test
  audioScore: number;   // 0-10, reserved for future audio test
  pricing: { inputPer1M: number; outputPer1M: number; userEditable: boolean; };
}

export type ModelType = 'llm' | 'vlm' | 'tts' | 'image' | 'video' | 'stt';

export interface Model {
  id: string; name: string; providerId: string; modelId: string; type: ModelType;
  capabilities: ModelCapabilityProfile; isDefault?: boolean;
  contextLength?: number; maxOutputLength?: number; description?: string;
}

export interface Provider {
  id: string; name: string; baseUrl: string; type: 'openai-compatible' | 'anthropic' | 'custom';
  icon?: string; apiKeys: ApiKeyEntry[]; models: Model[]; isLocal: boolean; createdAt: string;
  modelsEndpoint?: string | null;
}

export interface ApiKeyEntry {
  id: string; key: string; isActive: boolean; remainingQuota: number | null;
  lastChecked: string | null; failureCount: number;
}

export interface ProviderPreset {
  id: string; name: string; baseUrl: string; type: Provider['type'];
  icon: string; description: string; defaultModels: string[];
  modelsEndpoint?: string | null;
}

export interface SubAgentTask {
  id: string; agentId: string; description: string; assignedModel: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  result?: string; error?: string; attempts: number; maxAttempts: number;
  createdAt: string; updatedAt: string; completedAt?: string;
}

export interface SubAgent {
  id: string; name: string; modelId: string; providerId: string;
  status: 'idle' | 'working' | 'failed' | 'completed';
  currentTask?: string; tasks: string[]; createdAt: string;
}

export interface OrchestratorState {
  id: string; defaultModelId: string; strategy: 'cost' | 'balanced' | 'efficiency';
  costEfficiencyRatio: number; subAgents: SubAgent[]; tasks: SubAgentTask[];
  status: 'idle' | 'planning' | 'executing' | 'completed' | 'failed'; createdAt: string;
  finalResult?: string;
}

export interface Project {
  id: string; name: string; description: string; initialTask: string; taskBackup: string;
  issueLibrary: Issue[]; completedAgents: AgentSummary[]; pendingAgents: AgentSummary[];
  orchestratorState: OrchestratorState; createdAt: string; updatedAt: string;
}

export interface Issue {
  id: string; agentId: string; agentName: string; description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean; resolution?: string; timestamp: string;
}

export interface AgentSummary {
  id: string; agentId: string; name: string; modelId: string; taskDescription: string;
  outcome: 'completed' | 'failed' | 'partial'; summary: string; issues: string[];
  duration: number; timestamp: string;
}

export interface UserPreferences {
  costEfficiencyRatio: number; defaultOrchestratorModel?: string;
  thinkingMode: 'auto' | 'low' | 'medium' | 'high'; maxConcurrentAgents: number; autoRetryOnFailure: boolean;
}

export type WSMessageType = 'orchestrator_update' | 'agent_update' | 'task_update' | 'issue_created' | 'chat_message' | 'progress' | 'error';
export interface WSMessage { type: WSMessageType; payload: any; timestamp: string; }
export interface ChatMessage {
  id: string; role: 'user' | 'assistant' | 'system' | 'orchestrator' | 'agent';
  agentId?: string; content: string; timestamp: string;
  metadata?: { modelUsed?: string; tokensUsed?: number; cost?: number; };
}

// MCP Server configuration
export interface McpServerConfig {
  id: string;
  name: string;
  description: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  // stdio transport fields
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // http/sse transport fields
  url?: string;
  // metadata
  enabled: boolean;
  category: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

// Skill configuration
export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  category: string;
  // source: built-in, file, or url
  source: 'builtin' | 'file' | 'url';
  sourcePath?: string;
  sourceUrl?: string;
  // content
  content: string;
  // metadata
  enabled: boolean;
  icon: string;
  triggerKeywords?: string[];
  createdAt: string;
  updatedAt: string;
}

// Preset catalog entry
export interface McpPreset {
  id: string;
  name: string;
  description: string;
  transport: McpServerConfig['transport'];
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  category: string;
  icon: string;
  npmPackage?: string;
}

export interface SkillPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  content: string;
}
export interface Provider { id: string; name: string; baseUrl: string; type: string; icon?: string; apiKeys: ApiKeyEntry[]; models: Model[]; isLocal: boolean; }
export interface ApiKeyEntry { id: string; key: string; isActive: boolean; }
export type ModelType = 'llm' | 'tts' | 'image' | 'video' | '3d' | 'stt' | 'multimodal';
export interface Model { id: string; name: string; providerId: string; modelId: string; type: ModelType; capabilities: ModelCapabilityProfile; }
export interface ModelCapabilityProfile { code: number; agent: number; chat: number; context: number; speed: number; multimodal: boolean; visionScore: number; audioScore: number; pricing: { inputPer1M: number; outputPer1M: number; }; }
export interface ProviderPreset { id: string; name: string; baseUrl: string; type: string; icon: string; description: string; defaultModels: string[]; }
export interface Project { id: string; name: string; description: string; initialTask: string; orchestratorState: OrchestratorState; issueLibrary: Issue[]; completedAgents: AgentSummary[]; pendingAgents: AgentSummary[]; createdAt: string; }
export interface OrchestratorState { id: string; defaultModelId: string; strategy: string; costEfficiencyRatio: number; subAgents: SubAgent[]; tasks: SubAgentTask[]; status: string; }
export interface SubAgent { id: string; name: string; modelId: string; status: string; currentTask?: string; }
export interface SubAgentTask { id: string; description: string; assignedModel: string; status: string; result?: string; error?: string; attempts: number; }
export interface Issue { id: string; agentId: string; description: string; severity: string; timestamp: string; }
export interface AgentSummary { id: string; name: string; modelId: string; taskDescription: string; outcome: string; summary: string; timestamp: string; }

export interface McpServerConfig {
  id: string; name: string; description: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  command?: string; args?: string[]; env?: Record<string, string>;
  url?: string;
  enabled: boolean; category: string; icon: string;
  createdAt: string; updatedAt: string;
}

export interface SkillConfig {
  id: string; name: string; description: string;
  category: string; source: 'builtin' | 'file' | 'url';
  sourcePath?: string; sourceUrl?: string;
  content: string;
  enabled: boolean; icon: string;
  triggerKeywords?: string[];
  createdAt: string; updatedAt: string;
}

export interface McpPreset {
  id: string; name: string; description: string;
  transport: string; command?: string; args?: string[];
  env?: Record<string, string>; url?: string;
  category: string; icon: string; npmPackage?: string;
}

export interface SkillServerConfig {
  id: string; name: string; description: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  command?: string; args?: string[]; env?: Record<string, string>;
  url?: string;
  enabled: boolean; category: string; icon: string;
  createdAt: string; updatedAt: string;
}

export interface SkillServerPreset {
  id: string; name: string; description: string;
  transport: string; command?: string; args?: string[];
  env?: Record<string, string>; url?: string;
  category: string; icon: string; npmPackage?: string;
}

export interface SkillPreset {
  id: string; name: string; description: string;
  category: string; icon: string; content: string;
}

export interface FileAttachment {
  type: 'image' | 'text' | 'file';
  name: string;
  size: number;
  data: string; // base64 for images, text content for text files
  preview?: string; // data URL for image preview
}

export interface TestProgress {
  modelId: string;
  providerName: string;
  current: number;
  total: number;
  scope: 'single' | 'provider' | 'all';
}
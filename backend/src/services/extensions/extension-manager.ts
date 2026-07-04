import { McpServerConfig, SkillConfig, McpPreset, SkillPreset } from '../../types';
import { v4 as uuid } from 'uuid';
import { MCP_PRESETS, SKILL_PRESETS } from './presets';

export class ExtensionManager {
  private mcpServers: Map<string, McpServerConfig> = new Map();
  private skills: Map<string, SkillConfig> = new Map();

  // MCP Server CRUD
  getAllMcpServers(): McpServerConfig[] {
    return Array.from(this.mcpServers.values());
  }

  getMcpServer(id: string): McpServerConfig | undefined {
    return this.mcpServers.get(id);
  }

  addMcpServer(config: Omit<McpServerConfig, 'id' | 'createdAt' | 'updatedAt'>): McpServerConfig {
    const server: McpServerConfig = {
      ...config,
      id: uuid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.mcpServers.set(server.id, server);
    return server;
  }

  addMcpFromPreset(presetId: string, overrides?: Partial<McpServerConfig>): McpServerConfig | null {
    const preset = MCP_PRESETS.find(p => p.id === presetId);
    if (!preset) return null;
    // Check if already added
    const existing = Array.from(this.mcpServers.values()).find(s => s.name === preset.name);
    if (existing) return existing;
    return this.addMcpServer({
      name: preset.name,
      description: preset.description,
      transport: preset.transport,
      command: preset.command,
      args: preset.args,
      env: preset.env || {},
      url: preset.url,
      enabled: true,
      category: preset.category,
      icon: preset.icon,
      ...overrides,
    });
  }

  updateMcpServer(id: string, updates: Partial<McpServerConfig>): McpServerConfig | null {
    const existing = this.mcpServers.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id: existing.id, updatedAt: new Date().toISOString() };
    this.mcpServers.set(id, updated);
    return updated;
  }

  removeMcpServer(id: string): boolean {
    return this.mcpServers.delete(id);
  }

  // Skill CRUD
  getAllSkills(): SkillConfig[] {
    return Array.from(this.skills.values());
  }

  getSkill(id: string): SkillConfig | undefined {
    return this.skills.get(id);
  }

  addSkill(config: Omit<SkillConfig, 'id' | 'createdAt' | 'updatedAt'>): SkillConfig {
    const skill: SkillConfig = {
      ...config,
      id: uuid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.skills.set(skill.id, skill);
    return skill;
  }

  addSkillFromPreset(presetId: string, overrides?: Partial<SkillConfig>): SkillConfig | null {
    const preset = SKILL_PRESETS.find(p => p.id === presetId);
    if (!preset) return null;
    const existing = Array.from(this.skills.values()).find(s => s.name === preset.name);
    if (existing) return existing;
    return this.addSkill({
      name: preset.name,
      description: preset.description,
      category: preset.category,
      source: 'builtin',
      content: preset.content,
      enabled: true,
      icon: preset.icon,
      ...overrides,
    });
  }

  updateSkill(id: string, updates: Partial<SkillConfig>): SkillConfig | null {
    const existing = this.skills.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id: existing.id, updatedAt: new Date().toISOString() };
    this.skills.set(id, updated);
    return updated;
  }

  removeSkill(id: string): boolean {
    return this.skills.delete(id);
  }

  // Presets
  getMcpPresets(): McpPreset[] { return MCP_PRESETS; }
  getSkillPresets(): SkillPreset[] { return SKILL_PRESETS; }

  // Build context for orchestrator
  buildMcpContext(): string {
    const enabled = Array.from(this.mcpServers.values()).filter(s => s.enabled);
    if (!enabled.length) return '';
    let ctx = 'Available MCP Servers:\n';
    for (const s of enabled) {
      ctx += `- [${s.icon} ${s.name}] ${s.description}`;
      if (s.transport === 'stdio') ctx += ` (command: ${s.command} ${(s.args || []).join(' ')})`;
      if (s.url) ctx += ` (url: ${s.url})`;
      ctx += '\n';
    }
    return ctx;
  }

  buildSkillContext(): string {
    const enabled = Array.from(this.skills.values()).filter(s => s.enabled);
    if (!enabled.length) return '';
    let ctx = 'Available Skills/Tools:\n';
    for (const s of enabled) {
      ctx += `- [${s.icon} ${s.name}] ${s.description}`;
      if (s.triggerKeywords?.length) ctx += ` (keywords: ${s.triggerKeywords.join(', ')})`;
      ctx += '\n';
    }
    return ctx;
  }
}

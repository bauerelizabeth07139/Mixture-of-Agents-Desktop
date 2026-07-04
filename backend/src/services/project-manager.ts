import { v4 as uuid } from 'uuid';
import { Project, OrchestratorState } from '../types';

export class ProjectManager {
  private projects: Map<string, Project> = new Map();

  createProject(name: string, desc: string, task: string, modelId: string): Project {
    const id = uuid(); const now = new Date().toISOString();
    const state: OrchestratorState = { id: uuid(), defaultModelId: modelId, strategy: 'balanced', costEfficiencyRatio: 0.5, subAgents: [], tasks: [], status: 'idle', createdAt: now };
    const p: Project = { id, name, description: desc, initialTask: task, taskBackup: task, issueLibrary: [], completedAgents: [], pendingAgents: [], orchestratorState: state, createdAt: now, updatedAt: now };
    this.projects.set(id, p); return p;
  }
  getProject(id: string) { return this.projects.get(id); }
  getAllProjects() { return Array.from(this.projects.values()); }
  updateProject(id: string, u: Partial<Project>) { const p = this.projects.get(id); if (p) Object.assign(p, u, { updatedAt: new Date().toISOString() }); return p; }
  deleteProject(id: string) { return this.projects.delete(id); }
}

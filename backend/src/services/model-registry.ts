import { Model, ModelCapabilityProfile, ModelType } from '../types';
import { v4 as uuid } from 'uuid';

export class ModelRegistry {
  private models: Map<string, Model> = new Map();

  register(name: string, modelId: string, providerId: string, type: ModelType, caps: ModelCapabilityProfile): Model {
    const id = uuid();
    const m: Model = { id, name, modelId, providerId, type, capabilities: caps };
    this.models.set(id, m); return m;
  }
  get(id: string) { return this.models.get(id); }
  getByProvider(pid: string) { return Array.from(this.models.values()).filter(m => m.providerId === pid); }
  getByType(t: ModelType) { return Array.from(this.models.values()).filter(m => m.type === t); }
  getAll() { return Array.from(this.models.values()); }
  updateCaps(id: string, c: Partial<ModelCapabilityProfile>) { const m = this.models.get(id); if (m) Object.assign(m.capabilities, c); }
}

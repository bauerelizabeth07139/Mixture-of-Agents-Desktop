// ============================================================
// API Pool Manager - Manages API keys with failover
// ============================================================

import { Provider, ApiKeyEntry, Model } from '../types';
import { v4 as uuid } from 'uuid';

export class ApiPoolManager {
  private providers: Map<string, Provider> = new Map();

  addProvider(provider: Provider): void {
    this.providers.set(provider.id, provider);
  }

  removeProvider(providerId: string): void {
    this.providers.delete(providerId);
  }

  getProvider(providerId: string): Provider | undefined {
    return this.providers.get(providerId);
  }

  getAllProviders(): Provider[] {
    return Array.from(this.providers.values());
  }

  /** Add API key to a provider (max 50 keys per provider) */
  addApiKey(providerId: string, key: string): ApiKeyEntry | null {
    const provider = this.providers.get(providerId);
    if (!provider) return null;
    if (provider.apiKeys.length >= 50) return null;

    const entry: ApiKeyEntry = {
      id: uuid(),
      key,
      isActive: true,
      remainingQuota: null,
      lastChecked: null,
      failureCount: 0,
    };
    provider.apiKeys.push(entry);
    return entry;
  }

  /** Remove an API key from a provider */
  removeApiKey(providerId: string, keyId: string): boolean {
    const provider = this.providers.get(providerId);
    if (!provider) return false;
    const idx = provider.apiKeys.findIndex(k => k.id === keyId);
    if (idx === -1) return false;
    provider.apiKeys.splice(idx, 1);
    return true;
  }

  /** Get next available API key for a provider (round-robin with failover) */
  getNextApiKey(providerId: string): ApiKeyEntry | null {
    const provider = this.providers.get(providerId);
    if (!provider || provider.apiKeys.length === 0) return null;

    // Find first active key with remaining quota
    const activeKey = provider.apiKeys.find(k => k.isActive && k.failureCount < 3);
    if (activeKey) return activeKey;

    // All keys exhausted - return null to signal provider is out
    return null;
  }

  /** Mark a key as failed / out of quota */
  markKeyFailed(providerId: string, keyId: string): 'retry' | 'exhausted' | 'provider_exhausted' {
    const provider = this.providers.get(providerId);
    if (!provider) return 'provider_exhausted';

    const key = provider.apiKeys.find(k => k.id === keyId);
    if (!key) return 'provider_exhausted';

    key.failureCount++;
    key.lastChecked = new Date().toISOString();

    if (key.failureCount >= 3) {
      key.isActive = false;
      // Check if provider has any remaining keys
      const hasActive = provider.apiKeys.some(k => k.isActive && k.failureCount < 3);
      if (!hasActive) return 'provider_exhausted';
      return 'exhausted'; // Key exhausted but provider has others
    }

    return 'retry'; // Can retry with same key
  }

  /** Remove exhausted key from pool */
  removeExhaustedKey(providerId: string, keyId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;
    const idx = provider.apiKeys.findIndex(k => k.id === keyId);
    if (idx !== -1) {
      provider.apiKeys.splice(idx, 1);
    }
  }

  /** Get all models across all providers, optionally filtered by type */
  getAvailableModels(type?: Model['type']): Model[] {
    const models: Model[] = [];
    for (const provider of this.providers.values()) {
      const hasActiveKey = provider.apiKeys.some(k => k.isActive);
      if (!hasActiveKey) continue;
      for (const model of provider.models) {
        if (!type || model.type === type) {
          models.push(model);
        }
      }
    }
    return models;
  }

  /** Find a model by id across all providers */
  findModel(modelId: string): { model: Model; provider: Provider } | null {
    for (const provider of this.providers.values()) {
      const model = provider.models.find(m => m.id === modelId);
      if (model) return { model, provider };
    }
    return null;
  }

  /** Get provider with active keys that has a specific model */
  findProviderForModel(modelId: string): { provider: Provider; model: Model; apiKey: ApiKeyEntry } | null {
    for (const provider of this.providers.values()) {
      const model = provider.models.find(m => m.id === modelId);
      if (!model) continue;
      const key = this.getNextApiKey(provider.id);
      if (key) return { provider, model, apiKey: key };
    }
    return null;
  }

  /** Export providers state (for persistence) */
  exportState(): Provider[] {
    return Array.from(this.providers.values());
  }

  /** Import providers state */
  importState(providers: Provider[]): void {
    this.providers.clear();
    for (const p of providers) {
      this.providers.set(p.id, p);
    }
  }
}

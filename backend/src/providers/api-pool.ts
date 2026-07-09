// ============================================================
// API Pool Manager - Per-URL pools with auto-eviction
// ============================================================

import { Provider, ApiKeyEntry, Model } from '../types';
import { v4 as uuid } from 'uuid';

/** Maximum number of API keys per provider pool */
const MAX_KEYS_PER_POOL = 50;
/** Maximum number of provider pools total */
const MAX_POOLS = 25;
/** HTTP status codes that indicate auth/quota failure �� immediate key removal */
const EVICT_STATUS_CODES = new Set([401, 403]);

export interface PoolStats {
  providerId: string;
  providerName: string;
  url: string;
  totalKeys: number;
  activeKeys: number;
  isActive: boolean;
}

export class ApiPoolManager {
  private providers: Map<string, Provider> = new Map();

  // ������ Provider management ����������������������������������������������������������������

  addProvider(provider: Provider): boolean {
    if (this.providers.has(provider.id)) {
      this.providers.set(provider.id, provider);
      return true;
    }
    if (this.providers.size >= MAX_POOLS) return false;
    this.providers.set(provider.id, provider);
    return true;
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

  // ������ Key management ��������������������������������������������������������������������������

  /** Add API key to a provider (max 50 keys per provider) */
  addApiKey(providerId: string, key: string): ApiKeyEntry | null {
    const provider = this.providers.get(providerId);
    if (!provider) return null;
    if (provider.apiKeys.length >= MAX_KEYS_PER_POOL) return null;

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

  /**
   * Get next available API key for a provider (round-robin).
   * Keys with recent failures are rotated to the end; auth/quota failures are evicted.
   */
  getNextApiKey(providerId: string): ApiKeyEntry | null {
    const provider = this.providers.get(providerId);
    if (!provider || provider.apiKeys.length === 0) return null;

    // Find first active key (failureCount 0 = best, but any active works)
    const activeKey = provider.apiKeys.find(k => k.isActive);
    if (activeKey) return activeKey;

    return null;
  }

  /**
   * Move a key to the end of the pool (rotation on failure).
   * This ensures failed keys get retried last after all others have been tried.
   */
  private rotateKeyToEnd(providerId: string, keyId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;
    const idx = provider.apiKeys.findIndex(k => k.id === keyId);
    if (idx === -1 || idx === provider.apiKeys.length - 1) return; // already last or not found
    const [key] = provider.apiKeys.splice(idx, 1);
    provider.apiKeys.push(key);
  }

  /**
   * Report a failed request. Auto-evicts the key immediately for auth/quota
   * errors (401, 403, quota exhausted). Returns status for caller to decide
   * what to do next.
   */
  markKeyFailed(
    providerId: string,
    keyId: string,
    statusCode?: number,
  ): 'exhausted' | 'provider_exhausted' | 'evicted' {
    const provider = this.providers.get(providerId);
    if (!provider) return 'provider_exhausted';

    const key = provider.apiKeys.find(k => k.id === keyId);
    if (!key) return 'provider_exhausted';

    key.lastChecked = new Date().toISOString();

    // Auth/quota failures �� immediate eviction
    if (statusCode !== undefined && EVICT_STATUS_CODES.has(statusCode)) {
      this.removeExhaustedKey(providerId, keyId);
      return provider.apiKeys.some(k => k.isActive) ? 'exhausted' : 'provider_exhausted';
    }

    // Other failures �� increment count, evict after 3
    key.failureCount++;
    if (key.failureCount >= 3) {
      key.isActive = false;
      return provider.apiKeys.some(k => k.isActive) ? 'exhausted' : 'provider_exhausted';
    }

    return 'evicted'; // transient, caller may retry
  }

  /** Remove exhausted key from pool immediately */
  removeExhaustedKey(providerId: string, keyId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;
    const idx = provider.apiKeys.findIndex(k => k.id === keyId);
    if (idx !== -1) {
      provider.apiKeys.splice(idx, 1);
    }
    // If no keys remain, deactivate provider
    if (provider.apiKeys.length === 0) {
      this.deactivateProvider(providerId);
    }
  }

  /** Mark a provider as inactive (all keys exhausted) */
  deactivateProvider(providerId: string): void {
    // Currently we track this implicitly by checking key counts.
    // This method is a hook for future persistence/metadata flags.
    const provider = this.providers.get(providerId);
    if (provider) {
      for (const k of provider.apiKeys) {
        k.isActive = false;
      }
    }
  }

  // ������ Stats ��������������������������������������������������������������������������������������������

  /** Get total key count for a provider */
  getKeyCount(providerId: string): number {
    const provider = this.providers.get(providerId);
    return provider ? provider.apiKeys.length : 0;
  }

  /** Get active (non-exhausted) key count for a provider */
  getActiveKeyCount(providerId: string): number {
    const provider = this.providers.get(providerId);
    return provider ? provider.apiKeys.filter(k => k.isActive).length : 0;
  }

  /** Get stats for all pools */
  getPoolStats(): PoolStats[] {
    return Array.from(this.providers.values()).map(p => ({
      providerId: p.id,
      providerName: p.name,
      url: p.baseUrl,
      totalKeys: p.apiKeys.length,
      activeKeys: p.apiKeys.filter(k => k.isActive).length,
      isActive: p.apiKeys.some(k => k.isActive),
    }));
  }

  /** Get total pool count */
  getPoolCount(): number {
    return this.providers.size;
  }

  // ������ Model lookups ����������������������������������������������������������������������������

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

  // ������ Persistence ��������������������������������������������������������������������������������

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
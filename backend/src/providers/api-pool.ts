// ============================================================
// API Pool Manager - Dedup, exhausted-keys-to-end, concurrency limit (max 80/key)
// ============================================================

import { Provider, ApiKeyEntry, Model } from '../types';
import { v4 as uuid } from 'uuid';

const MAX_KEYS_PER_POOL = 50;
const MAX_POOLS = 25;
const MAX_CONCURRENT_PER_KEY = 80;
const EVICT_STATUS_CODES = new Set([401, 402, 403]);

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
  // Track active concurrent requests per key
  private keyConcurrency: Map<string, number> = new Map();

  // ©¤©¤ Provider management ©¤©¤

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

  // ©¤©¤ Key management ©¤©¤

  /** Add API key with dedup: skip if same key value already exists in this provider */
  addApiKey(providerId: string, key: string): ApiKeyEntry | null {
    const provider = this.providers.get(providerId);
    if (!provider) return null;
    if (provider.apiKeys.length >= MAX_KEYS_PER_POOL) return null;

    // Dedup: check if this exact key string already exists
    const existing = provider.apiKeys.find(k => k.key === key);
    if (existing) return existing;

    const entry: ApiKeyEntry = {
      id: uuid(),
      key,
      isActive: true,
      remainingQuota: null,
      lastChecked: null,
      failureCount: 0,
      concurrentRequests: 0,
    };
    provider.apiKeys.push(entry);
    return entry;
  }

  /** Remove an API key */
  removeApiKey(providerId: string, keyId: string): boolean {
    const provider = this.providers.get(providerId);
    if (!provider) return false;
    const idx = provider.apiKeys.findIndex(k => k.id === keyId);
    if (idx === -1) return false;
    provider.apiKeys.splice(idx, 1);
    this.keyConcurrency.delete(keyId);
    return true;
  }

  /**
   * Get next available API key:
   * 1. Filter out inactive and exhausted keys
   * 2. Filter out keys at concurrency limit (80)
   * 3. Sort by: active concurrency ASC, then failureCount ASC
   * This ensures load balancing across keys and prefers healthy keys.
   */
  getNextApiKey(providerId: string): ApiKeyEntry | null {
    const provider = this.providers.get(providerId);
    if (!provider || provider.apiKeys.length === 0) return null;

    // Clean up exhausted keys first (balance depleted = remove)
    this.cleanupExhaustedKeys(providerId);

    // Sort: keys with remainingQuota=0 go to end, then by concurrency, then failures
    const sorted = [...provider.apiKeys]
      .filter(k => k.isActive)
      .sort((a, b) => {
        // Exhausted (remainingQuota=0) keys go last
        const aExhausted = a.remainingQuota === 0 ? 1 : 0;
        const bExhausted = b.remainingQuota === 0 ? 1 : 0;
        if (aExhausted !== bExhausted) return aExhausted - bExhausted;

        // Then sort by concurrency (lower = better)
        const aConc = a.concurrentRequests || 0;
        const bConc = b.concurrentRequests || 0;
        if (aConc !== bConc) return aConc - bConc;

        // Then sort by failure count (lower = better)
        return a.failureCount - b.failureCount;
      });

    // Find first key not at concurrency limit
    for (const key of sorted) {
      if ((key.concurrentRequests || 0) < MAX_CONCURRENT_PER_KEY) {
        return key;
      }
    }

    // All keys at concurrency limit - return the one with lowest concurrency anyway
    return sorted[0] || null;
  }

  /** Increment concurrency count when a request starts */
  acquireKey(keyId: string): void {
    this.keyConcurrency.set(keyId, (this.keyConcurrency.get(keyId) || 0) + 1);
  }

  /** Decrement concurrency count when a request finishes */
  releaseKey(keyId: string): void {
    const current = this.keyConcurrency.get(keyId) || 0;
    if (current <= 1) this.keyConcurrency.delete(keyId);
    else this.keyConcurrency.set(keyId, current - 1);
  }

  /** Get concurrency count for a key */
  getKeyConcurrency(keyId: string): number {
    return this.keyConcurrency.get(keyId) || 0;
  }

  /** Mark exhausted keys inactive (sorted to end by getNextApiKey, not removed) */
  private cleanupExhaustedKeys(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;
    // Only mark inactive if ALL keys are exhausted -> deactivate provider
    for (const k of provider.apiKeys) {
      if (k.remainingQuota === 0 && k.isActive) {
        k.isActive = false;
      }
    }
    if (!provider.apiKeys.some(k => k.isActive)) {
      this.deactivateProvider(providerId);
    }
  }

  /**
   * Report a failed request.
   * - 401/402/403: immediate removal (auth/quota)
   * - 429 (rate limit): rotate to end, don't remove
   * - Other: increment failure count, deactivate after 3
   */
  markKeyFailed(providerId: string, keyId: string, statusCode?: number): 'exhausted' | 'provider_exhausted' | 'evicted' {
    const provider = this.providers.get(providerId);
    if (!provider) return 'provider_exhausted';

    const key = provider.apiKeys.find(k => k.id === keyId);
    if (!key) return 'provider_exhausted';

    key.lastChecked = new Date().toISOString();

    // Auth/quota failures -> immediate removal
    if (statusCode !== undefined && EVICT_STATUS_CODES.has(statusCode)) {
      this.removeExhaustedKey(providerId, keyId);
      return provider.apiKeys.some(k => k.isActive) ? 'exhausted' : 'provider_exhausted';
    }

    // Rate limit -> mark quota as 0, will be sorted to end
    if (statusCode === 429) {
      key.remainingQuota = 0;
      return provider.apiKeys.some(k => k.isActive) ? 'exhausted' : 'provider_exhausted';
    }

    // Other failures -> increment count
    key.failureCount++;
    if (key.failureCount >= 3) {
      key.isActive = false;
      return provider.apiKeys.some(k => k.isActive) ? 'exhausted' : 'provider_exhausted';
    }

    return 'evicted';
  }

  /** Remove exhausted key immediately */
  removeExhaustedKey(providerId: string, keyId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;
    const idx = provider.apiKeys.findIndex(k => k.id === keyId);
    if (idx !== -1) {
      provider.apiKeys.splice(idx, 1);
      this.keyConcurrency.delete(keyId);
    }
    if (provider.apiKeys.length === 0) this.deactivateProvider(providerId);
  }

  deactivateProvider(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (provider) { for (const k of provider.apiKeys) k.isActive = false; }
  }

  // ©¤©¤ Stats ©¤©¤

  getKeyCount(providerId: string): number {
    return this.providers.get(providerId)?.apiKeys.length || 0;
  }

  getActiveKeyCount(providerId: string): number {
    return this.providers.get(providerId)?.apiKeys.filter(k => k.isActive).length || 0;
  }

  getPoolStats(): PoolStats[] {
    return Array.from(this.providers.values()).map(p => ({
      providerId: p.id, providerName: p.name, url: p.baseUrl,
      totalKeys: p.apiKeys.length, activeKeys: p.apiKeys.filter(k => k.isActive).length,
      isActive: p.apiKeys.some(k => k.isActive),
    }));
  }

  getPoolCount(): number { return this.providers.size; }

  // ©¤©¤ Model lookups ©¤©¤

  getAvailableModels(type?: Model['type']): Model[] {
    const models: Model[] = [];
    for (const provider of this.providers.values()) {
      if (!provider.apiKeys.some(k => k.isActive)) continue;
      for (const model of provider.models) {
        if (!type || model.type === type) models.push(model);
      }
    }
    return models;
  }

  findModel(modelId: string): { model: Model; provider: Provider } | null {
    for (const provider of this.providers.values()) {
      const model = provider.models.find(m => m.id === modelId);
      if (model) return { model, provider };
    }
    return null;
  }

  findProviderForModel(modelId: string): { provider: Provider; model: Model; apiKey: ApiKeyEntry } | null {
    for (const provider of this.providers.values()) {
      const model = provider.models.find(m => m.id === modelId);
      if (!model) continue;
      const key = this.getNextApiKey(provider.id);
      if (key) return { provider, model, apiKey: key };
    }
    return null;
  }

  // ©¤©¤ Persistence ©¤©¤

  exportState(): Provider[] { return Array.from(this.providers.values()); }

  importState(providers: Provider[]): void {
    this.providers.clear();
    for (const p of providers) this.providers.set(p.id, p);
  }
}
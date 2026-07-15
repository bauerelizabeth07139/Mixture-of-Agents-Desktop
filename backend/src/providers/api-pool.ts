import { Provider, Model, ApiKeyEntry } from '../types';

export interface PoolStats {
  providerId: string; providerName: string; url: string;
  totalKeys: number; activeKeys: number; isActive: boolean;
}

const MAX_KEYS_PER_POOL = 50;
const MAX_POOLS = 25;
const MAX_CONCURRENT_PER_KEY = 80;
const EVICT_STATUS_CODES = new Set([401, 402, 403]);

export class ApiPoolManager {
  private providers = new Map<string, Provider>();
  private keyConcurrency = new Map<string, number>();

  // ── CRUD ──

  addProvider(p: Provider): Provider {
    if (this.providers.size >= MAX_POOLS) throw new Error('Max 25 pools');
    this.providers.set(p.id, p);
    return p;
  }

  getProvider(id: string): Provider | undefined { return this.providers.get(id); }
  getAllProviders(): Provider[] { return Array.from(this.providers.values()); }

  removeProvider(id: string): boolean {
    const p = this.providers.get(id);
    if (!p) return false;
    for (const k of p.apiKeys) this.keyConcurrency.delete(k.id);
    this.providers.delete(id);
    return true;
  }

  /** Add API key with dedup: skip if same key value already exists in this provider */
  addApiKey(providerId: string, key: string): ApiKeyEntry | null {
    const provider = this.providers.get(providerId);
    if (!provider) return null;
    if (provider.apiKeys.length >= MAX_KEYS_PER_POOL) return null;

    // Dedup: check if this exact key string already exists
    const existing = provider.apiKeys.find(k => k.key === key);
    if (existing) return existing;

    const entry: ApiKeyEntry = {
      id: `key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      key, isActive: true, remainingQuota: 1,
      failureCount: 0, lastChecked: new Date().toISOString(),
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
   * 1. Filter out inactive keys
   * 2. Sort: exhausted (quota=0) to end, then by concurrency ASC, then failureCount ASC
   * 3. Pick first key under concurrency limit (80)
   * Same URL can use different keys in parallel via concurrency rotation.
   */
  /**
   * Get next available API key:
   * 1. Filter out inactive keys
   * 2. Sort: exhausted (quota=0) to end, keep original order for active keys
   * 3. Return first key under concurrency limit (80)
   * Strategy: use first key until it hits 80 concurrent, then overflow to next.
   */
  getNextApiKey(providerId: string): ApiKeyEntry | null {
    const provider = this.providers.get(providerId);
    if (!provider || provider.apiKeys.length === 0) return null;

    // Separate exhausted and active keys, preserve original order
    const active: ApiKeyEntry[] = [];
    const exhausted: ApiKeyEntry[] = [];
    for (const k of provider.apiKeys) {
      if (!k.isActive) continue;
      if (k.remainingQuota === 0) exhausted.push(k);
      else active.push(k);
    }

    // Try active keys first (original order = prefer first key)
    for (const key of active) {
      if ((this.keyConcurrency.get(key.id) || 0) < MAX_CONCURRENT_PER_KEY) {
        return key;
      }
    }

    // All active keys at concurrency limit? Try exhausted keys as fallback
    for (const key of exhausted) {
      if ((this.keyConcurrency.get(key.id) || 0) < MAX_CONCURRENT_PER_KEY) {
        return key;
      }
    }

    // Everything at limit - return first active key anyway
    return active[0] || exhausted[0] || null;
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

  /**
   * Report a failed request.
   * - 401/402/403: immediate removal (auth/quota failure)
   * - 429 (rate limit): mark quota=0, sorted to end (not removed)
   * - Other: increment failure count, deactivate after 3
   */
  markKeyFailed(providerId: string, keyId: string, statusCode?: number): 'exhausted' | 'provider_exhausted' | 'evicted' {
    const provider = this.providers.get(providerId);
    if (!provider) return 'provider_exhausted';

    const key = provider.apiKeys.find(k => k.id === keyId);
    if (!key) return 'provider_exhausted';

    key.lastChecked = new Date().toISOString();

    if (statusCode !== undefined && EVICT_STATUS_CODES.has(statusCode)) {
      this.removeExhaustedKey(providerId, keyId);
      return provider.apiKeys.some(k => k.isActive) ? 'exhausted' : 'provider_exhausted';
    }

    if (statusCode === 429) {
      key.remainingQuota = 0;
      return provider.apiKeys.some(k => k.isActive) ? 'exhausted' : 'provider_exhausted';
    }

    key.failureCount++;
    if (key.failureCount >= 3) {
      key.isActive = false;
      return provider.apiKeys.some(k => k.isActive) ? 'exhausted' : 'provider_exhausted';
    }

    return 'evicted';
  }

  /** Remove exhausted key immediately (used for 401/402/403) */
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

  /** Reset a key's quota (e.g. after cooldown) */
  resetKeyQuota(providerId: string, keyId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;
    const key = provider.apiKeys.find(k => k.id === keyId);
    if (key) { key.remainingQuota = 1; key.isActive = true; key.failureCount = 0; }
  }

  deactivateProvider(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (provider) { for (const k of provider.apiKeys) k.isActive = false; }
  }

  // ── Stats ──

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

  // ── Model lookups ──

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

  // ── Persistence ──

  exportState(): Provider[] { return Array.from(this.providers.values()); }

  importState(providers: Provider[]): void {
    this.providers.clear();
    for (const p of providers) this.providers.set(p.id, p);
  }
}


/**
 * Per-Tick BotState Cache — Deduplicate HTTP calls to /state within a tick.
 *
 * Multiple reflexes in the same tick each need bot state. Without caching,
 * that's 2-4 HTTP round-trips per tick. This cache guarantees at most one
 * fetch per tick by using a TTL shorter than the tick interval.
 *
 * FAIL-CLOSED CONTRACT:
 * get() returns `null` when the fetcher throws. Every reflex controller must
 * treat `null` or missing fields as "do nothing" — this is the fail-closed invariant.
 * The cache does NOT interpret null; the consumer decides what missing data means.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Types
// ============================================================================

export interface CachedBotState {
  position?: { x: number; y: number; z: number };
  health?: number;
  food?: number;
  inventory?: Array<{ name: string; count: number }>;
  timeOfDay?: number;
  biome?: string;
  nearbyHostiles?: number;
  nearbyPassives?: number;
}

// ============================================================================
// Cache
// ============================================================================

/**
 * TTL-based cache for bot state.
 *
 * Default TTL of 4000ms < tick interval of 5000ms — guarantees at most
 * one fetch per tick. `get()` catches fetcher errors and returns `null`.
 */
export class BotStateCache {
  private cached: CachedBotState | null = null;
  private cachedAt = 0;
  private fetcher: () => Promise<CachedBotState>;
  private ttlMs: number;
  private fetchPromise: Promise<CachedBotState | null> | null = null;

  constructor(fetcher: () => Promise<CachedBotState>, ttlMs = 4000) {
    this.fetcher = fetcher;
    this.ttlMs = ttlMs;
  }

  /**
   * Get the current bot state. Returns cached value if within TTL.
   * Returns `null` on fetcher error — never throws.
   *
   * Deduplicates concurrent calls: if a fetch is already in-flight,
   * subsequent callers share the same promise.
   */
  async get(): Promise<CachedBotState | null> {
    const now = Date.now();
    if (this.cached !== null && now - this.cachedAt < this.ttlMs) {
      return this.cached;
    }

    // Deduplicate concurrent fetches
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this.doFetch(now);
    try {
      return await this.fetchPromise;
    } finally {
      this.fetchPromise = null;
    }
  }

  private async doFetch(now: number): Promise<CachedBotState | null> {
    try {
      const state = await this.fetcher();
      this.cached = state;
      this.cachedAt = now;
      return state;
    } catch {
      // Fail-closed: return null, let consumers decide
      return null;
    }
  }

  /** Force the next get() to refetch, even if TTL hasn't expired. */
  invalidate(): void {
    this.cached = null;
    this.cachedAt = 0;
    this.fetchPromise = null;
  }
}

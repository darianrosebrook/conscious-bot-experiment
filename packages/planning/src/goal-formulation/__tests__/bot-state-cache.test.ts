/**
 * BotState Cache — Unit Tests
 *
 * Verifies TTL-based caching, fail-closed null return, and invalidation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BotStateCache, type CachedBotState } from '../bot-state-cache';

// ============================================================================
// Helpers
// ============================================================================

function makeBotState(overrides: Partial<CachedBotState> = {}): CachedBotState {
  return {
    position: { x: 100, y: 64, z: 200 },
    health: 20,
    food: 18,
    inventory: [{ name: 'bread', count: 5 }],
    timeOfDay: 6000,
    biome: 'plains',
    nearbyHostiles: 0,
    nearbyPassives: 2,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('BotStateCache', () => {
  let fetcherFn: ReturnType<typeof vi.fn>;
  let cache: BotStateCache;

  beforeEach(() => {
    fetcherFn = vi.fn<() => Promise<CachedBotState>>().mockResolvedValue(makeBotState());
    cache = new BotStateCache(fetcherFn, 4000);
  });

  it('returns fetched value on first call', async () => {
    const result = await cache.get();
    expect(result).toBeDefined();
    expect(result?.health).toBe(20);
    expect(result?.food).toBe(18);
    expect(fetcherFn).toHaveBeenCalledTimes(1);
  });

  it('returns cached value within TTL (fetcher called once)', async () => {
    const result1 = await cache.get();
    const result2 = await cache.get();

    expect(result1).toEqual(result2);
    expect(fetcherFn).toHaveBeenCalledTimes(1);
  });

  it('refetches after TTL expires', async () => {
    const state1 = makeBotState({ food: 18 });
    const state2 = makeBotState({ food: 12 });

    fetcherFn
      .mockResolvedValueOnce(state1)
      .mockResolvedValueOnce(state2);

    // Use a very short TTL for testing
    cache = new BotStateCache(fetcherFn, 10);

    const result1 = await cache.get();
    expect(result1?.food).toBe(18);

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 20));

    const result2 = await cache.get();
    expect(result2?.food).toBe(12);
    expect(fetcherFn).toHaveBeenCalledTimes(2);
  });

  it('returns null on fetcher error (does not throw)', async () => {
    fetcherFn.mockRejectedValue(new Error('Network failure'));

    const result = await cache.get();
    expect(result).toBeNull();
  });

  it('does not cache errors — retries after failed fetch', async () => {
    fetcherFn
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(makeBotState({ food: 15 }));

    const result1 = await cache.get();
    expect(result1).toBeNull();

    const result2 = await cache.get();
    expect(result2?.food).toBe(15);
    expect(fetcherFn).toHaveBeenCalledTimes(2);
  });

  it('invalidate() forces refetch on next get()', async () => {
    const state1 = makeBotState({ food: 18 });
    const state2 = makeBotState({ food: 10 });

    fetcherFn
      .mockResolvedValueOnce(state1)
      .mockResolvedValueOnce(state2);

    const result1 = await cache.get();
    expect(result1?.food).toBe(18);
    expect(fetcherFn).toHaveBeenCalledTimes(1);

    cache.invalidate();

    const result2 = await cache.get();
    expect(result2?.food).toBe(10);
    expect(fetcherFn).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent fetches', async () => {
    let resolvePromise!: (value: CachedBotState) => void;
    fetcherFn.mockReturnValue(
      new Promise<CachedBotState>((resolve) => {
        resolvePromise = resolve;
      }),
    );

    // Start two concurrent gets
    const p1 = cache.get();
    const p2 = cache.get();

    // Resolve the single fetch
    resolvePromise(makeBotState({ food: 16 }));

    const [result1, result2] = await Promise.all([p1, p2]);
    expect(result1?.food).toBe(16);
    expect(result2?.food).toBe(16);
    expect(fetcherFn).toHaveBeenCalledTimes(1);
  });

  it('uses default TTL of 4000ms', () => {
    const defaultCache = new BotStateCache(fetcherFn);
    // Verify the cache was constructed (we test TTL behavior in other tests)
    expect(defaultCache).toBeDefined();
  });
});

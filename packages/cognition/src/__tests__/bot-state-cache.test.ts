import { describe, it, expect, beforeEach } from 'vitest';
import {
  updateBotStateCache,
  patchBotStateCache,
  getBotStateCache,
  botStateCacheAgeMs,
  buildInventoryMap,
  isCompletePosition,
  STALE_THRESHOLD_MS,
  _resetCacheForTest,
} from '../bot-state-cache';

/**
 * Tests for the cognition-side bot state cache.
 *
 * @author @darianrosebrook
 */

beforeEach(() => {
  _resetCacheForTest();
});

// ============================================================================
// buildInventoryMap
// ============================================================================

describe('buildInventoryMap', () => {
  it('returns empty map for undefined inventory', () => {
    expect(buildInventoryMap(undefined)).toEqual({});
  });

  it('returns empty map for empty array', () => {
    expect(buildInventoryMap([])).toEqual({});
  });

  it('builds map from inventory array', () => {
    const inv = [
      { name: 'oak_log', count: 12, displayName: 'Oak Log' },
      { name: 'cobblestone', count: 64, displayName: 'Cobblestone' },
    ];
    expect(buildInventoryMap(inv)).toEqual({
      oak_log: 12,
      cobblestone: 64,
    });
  });

  it('sums counts for duplicate item names', () => {
    const inv = [
      { name: 'dirt', count: 32, displayName: 'Dirt' },
      { name: 'dirt', count: 16, displayName: 'Dirt' },
    ];
    expect(buildInventoryMap(inv)).toEqual({ dirt: 48 });
  });

  it('falls back to displayName when name is empty', () => {
    const inv = [{ name: '', count: 5, displayName: 'Mystery Item' }];
    expect(buildInventoryMap(inv)).toEqual({ 'Mystery Item': 5 });
  });
});

// ============================================================================
// Cache lifecycle
// ============================================================================

describe('getBotStateCache', () => {
  it('returns null before any write', () => {
    expect(getBotStateCache()).toBeNull();
  });
});

describe('botStateCacheAgeMs', () => {
  it('returns Infinity before any write', () => {
    expect(botStateCacheAgeMs()).toBe(Infinity);
  });

  it('returns small age immediately after write', () => {
    updateBotStateCache({ health: 20, food: 18, inventory: [] });
    expect(botStateCacheAgeMs()).toBeLessThan(100);
  });
});

describe('updateBotStateCache', () => {
  it('writes a valid envelope', () => {
    const state = {
      health: 15,
      food: 10,
      position: { x: 100, y: 64, z: -200 },
      inventory: [{ name: 'diamond', count: 3, displayName: 'Diamond' }],
      biome: 'desert',
      weather: 'clear',
      dimension: 'overworld',
      nearbyHostiles: 2,
    };
    updateBotStateCache(state, [{ id: 't1', title: 'Mine diamonds', progress: 0.5, status: 'active', type: 'gather' }], 'attentive');

    const envelope = getBotStateCache();
    expect(envelope).not.toBeNull();
    expect(envelope!.v).toBe(1);
    expect(envelope!.seq).toBe(1);
    expect(envelope!.observedAtMs).toBeGreaterThan(0);
    expect(envelope!.seed).toBeTruthy();
    expect(envelope!.state.health).toBe(15);
    expect(envelope!.state.food).toBe(10);
    expect(envelope!.inventoryMap).toEqual({ diamond: 3 });
    expect(envelope!.tasks).toHaveLength(1);
    expect(envelope!.emotionalState).toBe('attentive');
  });

  it('increments seq monotonically', () => {
    updateBotStateCache({ health: 20, food: 20, inventory: [] });
    const first = getBotStateCache()!.seq;

    updateBotStateCache({ health: 19, food: 20, inventory: [] });
    const second = getBotStateCache()!.seq;

    updateBotStateCache({ health: 18, food: 20, inventory: [] });
    const third = getBotStateCache()!.seq;

    expect(second).toBe(first + 1);
    expect(third).toBe(second + 1);
  });

  it('preserves session seed across writes', () => {
    updateBotStateCache({ health: 20, food: 20, inventory: [] });
    const seed1 = getBotStateCache()!.seed;

    updateBotStateCache({ health: 19, food: 20, inventory: [] });
    const seed2 = getBotStateCache()!.seed;

    expect(seed1).toBe(seed2);
  });

  it('defaults tasks to empty array and emotionalState to neutral', () => {
    updateBotStateCache({ health: 20, food: 20, inventory: [] });
    const envelope = getBotStateCache()!;
    expect(envelope.tasks).toEqual([]);
    expect(envelope.emotionalState).toBe('neutral');
  });

  it('builds full inventoryMap with no truncation', () => {
    const manyItems = Array.from({ length: 30 }, (_, i) => ({
      name: `item_${i}`,
      count: i + 1,
      displayName: `Item ${i}`,
    }));
    updateBotStateCache({ health: 20, food: 20, inventory: manyItems });
    const map = getBotStateCache()!.inventoryMap;
    expect(Object.keys(map)).toHaveLength(30);
    expect(map['item_0']).toBe(1);
    expect(map['item_29']).toBe(30);
  });
});

// ============================================================================
// STALE_THRESHOLD_MS
// ============================================================================

describe('STALE_THRESHOLD_MS', () => {
  it('is >= 2x the 60s polling interval', () => {
    expect(STALE_THRESHOLD_MS).toBeGreaterThanOrEqual(120_000);
  });
});

// ============================================================================
// patchBotStateCache
// ============================================================================

describe('patchBotStateCache', () => {
  it('no-ops when cache is null', () => {
    patchBotStateCache({ health: 10 });
    expect(getBotStateCache()).toBeNull();
  });

  it('patches health without changing seq or observedAtMs', () => {
    updateBotStateCache({ health: 20, food: 20, inventory: [] });
    const before = getBotStateCache()!;
    const origSeq = before.seq;
    const origObserved = before.observedAtMs;

    patchBotStateCache({ health: 5 });

    const after = getBotStateCache()!;
    expect(after.state.health).toBe(5);
    expect(after.seq).toBe(origSeq);
    expect(after.observedAtMs).toBe(origObserved);
  });

  it('patches food', () => {
    updateBotStateCache({ health: 20, food: 20, inventory: [] });
    patchBotStateCache({ food: 3 });
    expect(getBotStateCache()!.state.food).toBe(3);
  });

  it('patches position', () => {
    updateBotStateCache({ health: 20, food: 20, inventory: [] });
    patchBotStateCache({ position: { x: 100, y: 64, z: -200 } });
    expect(getBotStateCache()!.state.position).toEqual({ x: 100, y: 64, z: -200 });
  });

  it('ignores undefined fields', () => {
    updateBotStateCache({ health: 20, food: 20, inventory: [] });
    patchBotStateCache({ health: undefined });
    expect(getBotStateCache()!.state.health).toBe(20);
  });

  it('does not affect inventoryMap', () => {
    const inv = [{ name: 'dirt', count: 10, displayName: 'Dirt' }];
    updateBotStateCache({ health: 20, food: 20, inventory: inv });
    patchBotStateCache({ health: 5 });
    expect(getBotStateCache()!.inventoryMap).toEqual({ dirt: 10 });
  });
});

// ============================================================================
// isCompletePosition
// ============================================================================

describe('isCompletePosition', () => {
  it('accepts a full numeric position', () => {
    expect(isCompletePosition({ x: 10, y: 64, z: -200 })).toBe(true);
  });

  it('accepts zero coordinates', () => {
    expect(isCompletePosition({ x: 0, y: 0, z: 0 })).toBe(true);
  });

  it('rejects empty object', () => {
    expect(isCompletePosition({})).toBe(false);
  });

  it('rejects object with NaN coordinate', () => {
    expect(isCompletePosition({ x: NaN, y: 64, z: -200 })).toBe(false);
  });

  it('rejects object with Infinity', () => {
    expect(isCompletePosition({ x: 10, y: Infinity, z: -200 })).toBe(false);
  });

  it('rejects object with missing z', () => {
    expect(isCompletePosition({ x: 10, y: 64 })).toBe(false);
  });

  it('rejects null', () => {
    expect(isCompletePosition(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isCompletePosition(undefined)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(isCompletePosition('position')).toBe(false);
  });
});

// ============================================================================
// patchBotStateCache — position quality guard
// ============================================================================

describe('patchBotStateCache position quality', () => {
  it('rejects empty object position (does not overwrite good state)', () => {
    updateBotStateCache({ health: 20, food: 20, inventory: [], position: { x: 10, y: 64, z: -200 } });
    patchBotStateCache({ position: {} as any });
    expect(getBotStateCache()!.state.position).toEqual({ x: 10, y: 64, z: -200 });
  });

  it('rejects position with NaN coordinate', () => {
    updateBotStateCache({ health: 20, food: 20, inventory: [], position: { x: 10, y: 64, z: -200 } });
    patchBotStateCache({ position: { x: NaN, y: 64, z: -200 } });
    expect(getBotStateCache()!.state.position).toEqual({ x: 10, y: 64, z: -200 });
  });

  it('rejects position with Infinity', () => {
    updateBotStateCache({ health: 20, food: 20, inventory: [], position: { x: 10, y: 64, z: -200 } });
    patchBotStateCache({ position: { x: 10, y: Infinity, z: -200 } });
    expect(getBotStateCache()!.state.position).toEqual({ x: 10, y: 64, z: -200 });
  });

  it('accepts valid position update', () => {
    updateBotStateCache({ health: 20, food: 20, inventory: [], position: { x: 10, y: 64, z: -200 } });
    patchBotStateCache({ position: { x: 50, y: 70, z: -100 } });
    expect(getBotStateCache()!.state.position).toEqual({ x: 50, y: 70, z: -100 });
  });
});

// ============================================================================
// Determinism: same inputs → same content-addressed fields
// ============================================================================

describe('deterministic envelope fields', () => {
  it('same state produces same inventoryMap keys', () => {
    const state = {
      health: 20,
      food: 20,
      inventory: [
        { name: 'stone', count: 10, displayName: 'Stone' },
        { name: 'stick', count: 4, displayName: 'Stick' },
      ],
    };
    updateBotStateCache(state);
    const map1 = { ...getBotStateCache()!.inventoryMap };

    _resetCacheForTest();
    updateBotStateCache(state);
    const map2 = { ...getBotStateCache()!.inventoryMap };

    expect(map1).toEqual(map2);
  });
});

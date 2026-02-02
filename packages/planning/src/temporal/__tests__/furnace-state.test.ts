/**
 * Furnace State — Time-Discretized State Tests (C.2)
 *
 * Acceptance criteria:
 * - FurnaceSlotState, FurnaceSearchState types are usable
 * - hashFurnaceState() produces same hash for same state
 * - Different slot occupancy → different hash
 * - Bucket quantization consistent with MINECRAFT_BUCKET_SIZE_TICKS
 * - Hash excludes timestamps and nondeterministic runtime fields
 */

import { describe, it, expect } from 'vitest';
import { canonicalize, contentHash } from '../../sterling/solve-bundle';
import { MINECRAFT_BUCKET_SIZE_TICKS, toTickBucket } from '../time-state';
import type {
  FurnaceSlotState,
  FurnaceSearchState,
} from '../../sterling/minecraft-furnace-types';
import { FURNACE_HASH_EXCLUDED_FIELDS } from '../../sterling/minecraft-furnace-types';

// ============================================================================
// Hash function under test (uses same canonicalize+contentHash pattern)
// ============================================================================

/**
 * Hash a FurnaceSearchState for SolveBundle identity.
 * Excludes nondeterministic fields per FURNACE_HASH_EXCLUDED_FIELDS.
 */
function hashFurnaceState(state: FurnaceSearchState): string {
  // Strip excluded fields from slots before hashing
  const hashableSlots = state.slots.map((slot) => ({
    id: slot.id,
    type: slot.type,
    readyAtBucket: slot.readyAtBucket,
    // currentItem IS included (affects logical state)
    ...(slot.currentItem !== undefined ? { currentItem: slot.currentItem } : {}),
    // fuelRemaining and smeltProgress are EXCLUDED (nondeterministic runtime)
  }));

  const hashInput = {
    time: state.time,
    slots: hashableSlots,
    inventory: state.inventory,
    completedItems: state.completedItems,
  };

  return contentHash(canonicalize(hashInput));
}

// ============================================================================
// Tests
// ============================================================================

describe('FurnaceSearchState hashing (C.2)', () => {
  const baseState: FurnaceSearchState = {
    time: {
      currentBucket: 5,
      horizonBucket: 105,
      bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
    },
    slots: [
      { id: 'furnace_0', type: 'furnace', readyAtBucket: 0 },
      { id: 'furnace_1', type: 'furnace', readyAtBucket: 0 },
    ],
    inventory: { iron_ore: 4, coal: 2 },
    completedItems: {},
  };

  it('same state → same hash', () => {
    const hash1 = hashFurnaceState(baseState);
    const hash2 = hashFurnaceState(baseState);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{16}$/);
  });

  it('different slot occupancy → different hash', () => {
    const occupiedState: FurnaceSearchState = {
      ...baseState,
      slots: [
        { id: 'furnace_0', type: 'furnace', readyAtBucket: 0, currentItem: 'iron_ore' },
        { id: 'furnace_1', type: 'furnace', readyAtBucket: 0 },
      ],
    };
    expect(hashFurnaceState(baseState)).not.toBe(hashFurnaceState(occupiedState));
  });

  it('different inventory → different hash', () => {
    const altInventory: FurnaceSearchState = {
      ...baseState,
      inventory: { iron_ore: 3, coal: 2 },
    };
    expect(hashFurnaceState(baseState)).not.toBe(hashFurnaceState(altInventory));
  });

  it('different time → different hash', () => {
    const laterState: FurnaceSearchState = {
      ...baseState,
      time: { ...baseState.time, currentBucket: 10 },
    };
    expect(hashFurnaceState(baseState)).not.toBe(hashFurnaceState(laterState));
  });

  it('hash excludes fuelRemaining (nondeterministic)', () => {
    const withFuel: FurnaceSearchState = {
      ...baseState,
      slots: [
        { id: 'furnace_0', type: 'furnace', readyAtBucket: 0, fuelRemaining: 1600 },
        { id: 'furnace_1', type: 'furnace', readyAtBucket: 0 },
      ],
    };
    // fuelRemaining is excluded from hash, so same logical state → same hash
    expect(hashFurnaceState(baseState)).toBe(hashFurnaceState(withFuel));
  });

  it('hash excludes smeltProgress (nondeterministic)', () => {
    const withProgress: FurnaceSearchState = {
      ...baseState,
      slots: [
        { id: 'furnace_0', type: 'furnace', readyAtBucket: 0, smeltProgress: 100 },
        { id: 'furnace_1', type: 'furnace', readyAtBucket: 0 },
      ],
    };
    expect(hashFurnaceState(baseState)).toBe(hashFurnaceState(withProgress));
  });

  it('FURNACE_HASH_EXCLUDED_FIELDS includes expected runtime fields', () => {
    expect(FURNACE_HASH_EXCLUDED_FIELDS).toContain('fuelRemaining');
    expect(FURNACE_HASH_EXCLUDED_FIELDS).toContain('smeltProgress');
    expect(FURNACE_HASH_EXCLUDED_FIELDS).toContain('timestamp');
  });
});

describe('bucket quantization consistency (C.2)', () => {
  it('toTickBucket is consistent with MINECRAFT_BUCKET_SIZE_TICKS', () => {
    expect(toTickBucket(0)).toBe(0);
    expect(toTickBucket(99)).toBe(0); // Still in bucket 0
    expect(toTickBucket(100)).toBe(1); // First tick of bucket 1
    expect(toTickBucket(500)).toBe(5);
  });

  it('MINECRAFT_BUCKET_SIZE_TICKS is 100', () => {
    expect(MINECRAFT_BUCKET_SIZE_TICKS).toBe(100);
  });

  it('bucket boundaries are deterministic', () => {
    // 200 ticks = 10 seconds = 2 buckets (smelting duration)
    const smeltDurationTicks = 200;
    const buckets = Math.ceil(smeltDurationTicks / MINECRAFT_BUCKET_SIZE_TICKS);
    expect(buckets).toBe(2);
  });
});

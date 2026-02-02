/**
 * Acquisition Types — Type shape, hashing, and prior bound tests.
 *
 * Covers:
 * - hashAcquisitionContext: determinism, bucket sensitivity, coordinate insensitivity
 * - computeCandidateSetDigest: determinism, reorder insensitivity, addition sensitivity
 * - PRIOR_MIN / PRIOR_MAX bounds
 */

import { describe, it, expect } from 'vitest';
import {
  hashAcquisitionContext,
  computeCandidateSetDigest,
  PRIOR_MIN,
  PRIOR_MAX,
  type AcquisitionContextV1,
  type AcquisitionCandidate,
} from '../minecraft-acquisition-types';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<AcquisitionContextV1> = {}): AcquisitionContextV1 {
  return {
    targetItem: 'iron_ingot',
    oreNearby: true,
    villagerTradeAvailable: false,
    knownChestCountBucket: 0,
    distBucket_villager: 0,
    distBucket_chest: 0,
    distBucket_ore: 1,
    inventoryHash: 'abcdef0123456789',
    toolTierCap: 'cap:has_wooden_pickaxe',
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<AcquisitionCandidate> = {}): AcquisitionCandidate {
  const ctx = makeContext();
  return {
    strategy: 'mine',
    item: 'iron_ingot',
    estimatedCost: 10,
    feasibility: 'available',
    requires: ['cap:has_stone_pickaxe'],
    contextSnapshot: ctx,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AcquisitionContextV1 hashing', () => {
  it('same context produces same hash', () => {
    const ctx = makeContext();
    expect(hashAcquisitionContext(ctx)).toBe(hashAcquisitionContext(ctx));
  });

  it('identical contexts (separate objects) produce same hash', () => {
    const a = makeContext();
    const b = makeContext();
    expect(hashAcquisitionContext(a)).toBe(hashAcquisitionContext(b));
  });

  it('different oreNearby produces different hash', () => {
    const a = makeContext({ oreNearby: true });
    const b = makeContext({ oreNearby: false });
    expect(hashAcquisitionContext(a)).not.toBe(hashAcquisitionContext(b));
  });

  it('different villagerTradeAvailable produces different hash', () => {
    const a = makeContext({ villagerTradeAvailable: true });
    const b = makeContext({ villagerTradeAvailable: false });
    expect(hashAcquisitionContext(a)).not.toBe(hashAcquisitionContext(b));
  });

  it('different knownChestCountBucket produces different hash', () => {
    const a = makeContext({ knownChestCountBucket: 0 });
    const b = makeContext({ knownChestCountBucket: 1 });
    expect(hashAcquisitionContext(a)).not.toBe(hashAcquisitionContext(b));
  });

  it('different distBucket_villager produces different hash', () => {
    const a = makeContext({ distBucket_villager: 1 });
    const b = makeContext({ distBucket_villager: 2 });
    expect(hashAcquisitionContext(a)).not.toBe(hashAcquisitionContext(b));
  });

  it('different targetItem produces different hash', () => {
    const a = makeContext({ targetItem: 'iron_ingot' });
    const b = makeContext({ targetItem: 'diamond' });
    expect(hashAcquisitionContext(a)).not.toBe(hashAcquisitionContext(b));
  });

  it('different toolTierCap produces different hash', () => {
    const a = makeContext({ toolTierCap: 'cap:has_wooden_pickaxe' });
    const b = makeContext({ toolTierCap: 'cap:has_stone_pickaxe' });
    expect(hashAcquisitionContext(a)).not.toBe(hashAcquisitionContext(b));
  });

  it('undefined toolTierCap produces different hash from defined', () => {
    const a = makeContext({ toolTierCap: undefined });
    const b = makeContext({ toolTierCap: 'cap:has_wooden_pickaxe' });
    expect(hashAcquisitionContext(a)).not.toBe(hashAcquisitionContext(b));
  });

  it('hash is a 16-char hex string', () => {
    const hash = hashAcquisitionContext(makeContext());
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('CandidateSetDigest', () => {
  it('same candidates produce same digest', () => {
    const candidates = [
      makeCandidate({ strategy: 'mine' }),
      makeCandidate({ strategy: 'trade', feasibility: 'available', estimatedCost: 5 }),
    ];
    const d1 = computeCandidateSetDigest(candidates);
    const d2 = computeCandidateSetDigest(candidates);
    expect(d1).toBe(d2);
  });

  it('reordered candidates produce same digest (sorted before hash)', () => {
    const mine = makeCandidate({ strategy: 'mine' });
    const trade = makeCandidate({ strategy: 'trade', feasibility: 'available', estimatedCost: 5 });

    const d1 = computeCandidateSetDigest([mine, trade]);
    const d2 = computeCandidateSetDigest([trade, mine]);
    expect(d1).toBe(d2);
  });

  it('adding a candidate produces different digest', () => {
    const mine = makeCandidate({ strategy: 'mine' });
    const trade = makeCandidate({ strategy: 'trade', feasibility: 'available', estimatedCost: 5 });
    const loot = makeCandidate({ strategy: 'loot', feasibility: 'unknown', estimatedCost: 8 });

    const d1 = computeCandidateSetDigest([mine, trade]);
    const d2 = computeCandidateSetDigest([mine, trade, loot]);
    expect(d1).not.toBe(d2);
  });

  it('different feasibility produces different digest', () => {
    const a = [makeCandidate({ strategy: 'mine', feasibility: 'available' })];
    const b = [makeCandidate({ strategy: 'mine', feasibility: 'unknown' })];
    expect(computeCandidateSetDigest(a)).not.toBe(computeCandidateSetDigest(b));
  });

  it('different cost produces different digest', () => {
    const a = [makeCandidate({ estimatedCost: 10 })];
    const b = [makeCandidate({ estimatedCost: 20 })];
    expect(computeCandidateSetDigest(a)).not.toBe(computeCandidateSetDigest(b));
  });

  it('different requires produces different digest', () => {
    const a = [makeCandidate({ requires: ['cap:has_stone_pickaxe'] })];
    const b = [makeCandidate({ requires: ['cap:has_iron_pickaxe'] })];
    expect(computeCandidateSetDigest(a)).not.toBe(computeCandidateSetDigest(b));
  });

  it('digest is a 16-char hex string', () => {
    const digest = computeCandidateSetDigest([makeCandidate()]);
    expect(digest).toMatch(/^[0-9a-f]{16}$/);
  });

  it('empty candidates array produces a valid digest', () => {
    const digest = computeCandidateSetDigest([]);
    expect(digest).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('Prior bounds', () => {
  it('PRIOR_MIN is 0.05', () => {
    expect(PRIOR_MIN).toBe(0.05);
  });

  it('PRIOR_MAX is 0.95', () => {
    expect(PRIOR_MAX).toBe(0.95);
  });

  it('PRIOR_MIN < PRIOR_MAX', () => {
    expect(PRIOR_MIN).toBeLessThan(PRIOR_MAX);
  });
});

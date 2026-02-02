/**
 * Acquisition Rules — Context building, strategy enumeration, and ranking tests.
 */

import { describe, it, expect } from 'vitest';
import {
  buildAcquisitionContext,
  buildAcquisitionStrategies,
  buildSalvageCandidatesWithInventory,
  rankStrategies,
  distanceToBucket,
  contextKeyFromAcquisitionContext,
  type NearbyEntity,
} from '../minecraft-acquisition-rules';
import type { AcquisitionContextV1, StrategyPrior } from '../minecraft-acquisition-types';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeInventory(items: Record<string, number> = {}): Record<string, number> {
  return items;
}

function makeVillager(distance: number, trades?: Array<{ inputItem: string; outputItem: string }>): NearbyEntity {
  return { type: 'villager', distance, trades };
}

function makeChest(distance: number): NearbyEntity {
  return { type: 'chest', distance };
}

// ── Distance Bucketing ─────────────────────────────────────────────────────

describe('distanceToBucket', () => {
  it('undefined → 0 (none)', () => {
    expect(distanceToBucket(undefined)).toBe(0);
  });

  it('null → 0 (none)', () => {
    expect(distanceToBucket(null)).toBe(0);
  });

  it('negative → 0 (none)', () => {
    expect(distanceToBucket(-5)).toBe(0);
  });

  it('0 → 1 (close)', () => {
    expect(distanceToBucket(0)).toBe(1);
  });

  it('10 → 1 (close, <16)', () => {
    expect(distanceToBucket(10)).toBe(1);
  });

  it('15.9 → 1 (close, <16)', () => {
    expect(distanceToBucket(15.9)).toBe(1);
  });

  it('16 → 2 (medium, >=16 <64)', () => {
    expect(distanceToBucket(16)).toBe(2);
  });

  it('50 → 2 (medium)', () => {
    expect(distanceToBucket(50)).toBe(2);
  });

  it('63.9 → 2 (medium)', () => {
    expect(distanceToBucket(63.9)).toBe(2);
  });

  it('64 → 3 (far)', () => {
    expect(distanceToBucket(64)).toBe(3);
  });

  it('200 → 3 (far)', () => {
    expect(distanceToBucket(200)).toBe(3);
  });
});

// ── Context Building ───────────────────────────────────────────────────────

describe('buildAcquisitionContext', () => {
  it('villager at dist 10 → distBucket_villager=1', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      [],
      [makeVillager(10)],
    );
    expect(ctx.distBucket_villager).toBe(1);
  });

  it('villager at dist 50 → distBucket_villager=2', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      [],
      [makeVillager(50)],
    );
    expect(ctx.distBucket_villager).toBe(2);
  });

  it('no villager → distBucket_villager=0', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      [],
      [],
    );
    expect(ctx.distBucket_villager).toBe(0);
  });

  it('iron_ore in nearbyBlocks → oreNearby=true for iron_ingot', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      ['stone', 'iron_ore', 'dirt'],
      [],
    );
    expect(ctx.oreNearby).toBe(true);
  });

  it('no iron_ore → oreNearby=false for iron_ingot', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      ['stone', 'dirt'],
      [],
    );
    expect(ctx.oreNearby).toBe(false);
  });

  it('villager nearby + item in trade table → villagerTradeAvailable=true', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      [],
      [makeVillager(10)],
    );
    expect(ctx.villagerTradeAvailable).toBe(true);
  });

  it('villager nearby but item NOT in trade table → villagerTradeAvailable=false', () => {
    const ctx = buildAcquisitionContext(
      'oak_planks',
      makeInventory(),
      [],
      [makeVillager(10)],
    );
    expect(ctx.villagerTradeAvailable).toBe(false);
  });

  it('no villager → villagerTradeAvailable=false even if item is tradeable', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      [],
      [],
    );
    expect(ctx.villagerTradeAvailable).toBe(false);
  });

  it('chest nearby → knownChestCountBucket=1', () => {
    const ctx = buildAcquisitionContext(
      'diamond',
      makeInventory(),
      [],
      [makeChest(20)],
    );
    expect(ctx.knownChestCountBucket).toBe(1);
  });

  it('2 chests → knownChestCountBucket=2', () => {
    const ctx = buildAcquisitionContext(
      'diamond',
      makeInventory(),
      [],
      [makeChest(20), makeChest(40)],
    );
    expect(ctx.knownChestCountBucket).toBe(2);
  });

  it('no chests → knownChestCountBucket=0', () => {
    const ctx = buildAcquisitionContext(
      'diamond',
      makeInventory(),
      [],
      [],
    );
    expect(ctx.knownChestCountBucket).toBe(0);
  });

  it('extracts toolTierCap from inventory', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory({ 'cap:has_stone_pickaxe': 1, 'cap:has_wooden_pickaxe': 1 }),
      [],
      [],
    );
    expect(ctx.toolTierCap).toBe('cap:has_stone_pickaxe');
  });

  it('no cap tokens → toolTierCap=undefined', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory({ oak_log: 5 }),
      [],
      [],
    );
    expect(ctx.toolTierCap).toBeUndefined();
  });

  it('same raw positions different entity IDs → same context key (coarse bucketing)', () => {
    const ctx1 = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      ['iron_ore'],
      [{ type: 'villager', distance: 10, name: 'Bob' }],
    );
    const ctx2 = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      ['iron_ore'],
      [{ type: 'villager', distance: 10, name: 'Alice' }],
    );
    expect(contextKeyFromAcquisitionContext(ctx1)).toBe(contextKeyFromAcquisitionContext(ctx2));
  });

  it('village vs cave context key differs', () => {
    const villageCtx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      [],
      [makeVillager(10)],
    );
    const caveCtx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      ['iron_ore'],
      [],
    );
    expect(contextKeyFromAcquisitionContext(villageCtx)).not.toBe(
      contextKeyFromAcquisitionContext(caveCtx)
    );
  });
});

// ── Strategy Enumeration ───────────────────────────────────────────────────

describe('buildAcquisitionStrategies', () => {
  it('mine strategy: iron_ore nearby + wooden_pickaxe → NOT available (needs stone)', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory({ 'cap:has_wooden_pickaxe': 1 }),
      ['iron_ore'],
      [],
    );
    const strategies = buildAcquisitionStrategies(ctx);
    const mine = strategies.find(s => s.strategy === 'mine');
    expect(mine).toBeDefined();
    // iron requires stone pickaxe, wooden is insufficient
    expect(mine!.feasibility).toBe('unknown');
  });

  it('mine strategy: iron_ore nearby + stone_pickaxe → available', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory({ 'cap:has_stone_pickaxe': 1 }),
      ['iron_ore'],
      [],
    );
    const strategies = buildAcquisitionStrategies(ctx);
    const mine = strategies.find(s => s.strategy === 'mine');
    expect(mine).toBeDefined();
    expect(mine!.feasibility).toBe('available');
  });

  it('mine strategy: no ore → unknown', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory({ 'cap:has_stone_pickaxe': 1 }),
      ['stone', 'dirt'],
      [],
    );
    const strategies = buildAcquisitionStrategies(ctx);
    const mine = strategies.find(s => s.strategy === 'mine');
    expect(mine).toBeDefined();
    expect(mine!.feasibility).toBe('unknown');
  });

  it('trade strategy: villager nearby + item in trade table → available', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      [],
      [makeVillager(10)],
    );
    const strategies = buildAcquisitionStrategies(ctx);
    const trade = strategies.find(s => s.strategy === 'trade');
    expect(trade).toBeDefined();
    expect(trade!.feasibility).toBe('available');
  });

  it('trade strategy: no villager → unknown', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      [],
      [],
    );
    const strategies = buildAcquisitionStrategies(ctx);
    const trade = strategies.find(s => s.strategy === 'trade');
    expect(trade).toBeDefined();
    expect(trade!.feasibility).toBe('unknown');
  });

  it('trade strategy: villager nearby but item NOT in trade table → no trade candidate', () => {
    const ctx = buildAcquisitionContext(
      'oak_planks',
      makeInventory(),
      [],
      [makeVillager(10)],
    );
    const strategies = buildAcquisitionStrategies(ctx);
    const trade = strategies.find(s => s.strategy === 'trade');
    expect(trade).toBeUndefined();
  });

  it('loot strategy: chest nearby → available', () => {
    const ctx = buildAcquisitionContext(
      'diamond',
      makeInventory(),
      [],
      [makeChest(20)],
    );
    const strategies = buildAcquisitionStrategies(ctx);
    const loot = strategies.find(s => s.strategy === 'loot');
    expect(loot).toBeDefined();
    expect(loot!.feasibility).toBe('available');
  });

  it('loot strategy: no chest → unknown', () => {
    const ctx = buildAcquisitionContext(
      'diamond',
      makeInventory(),
      [],
      [],
    );
    const strategies = buildAcquisitionStrategies(ctx);
    const loot = strategies.find(s => s.strategy === 'loot');
    expect(loot).toBeDefined();
    expect(loot!.feasibility).toBe('unknown');
  });

  it('salvage strategy: iron_sword in inventory → available (produces iron_ingot)', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory({ iron_sword: 1 }),
      [],
      [],
    );
    // buildAcquisitionStrategies returns salvage as 'unknown' because it lacks inventory
    // Use buildSalvageCandidatesWithInventory for inventory-aware feasibility
    const candidates = buildSalvageCandidatesWithInventory(
      'iron_ingot',
      ctx,
      { iron_sword: 1 },
    );
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].feasibility).toBe('available');
    expect(candidates[0].requires).toContain('iron_sword');
  });

  it('salvage: no matching source item in inventory → empty', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      [],
      [],
    );
    const candidates = buildSalvageCandidatesWithInventory(
      'iron_ingot',
      ctx,
      {},
    );
    expect(candidates).toHaveLength(0);
  });

  it('item with no strategies possible returns only applicable ones', () => {
    // random_item has no ore, no trade, no loot, no salvage
    const ctx = buildAcquisitionContext(
      'random_item',
      makeInventory(),
      [],
      [],
    );
    const strategies = buildAcquisitionStrategies(ctx);
    expect(strategies).toHaveLength(0);
  });
});

// ── Ranking ────────────────────────────────────────────────────────────────

describe('rankStrategies', () => {
  const baseCtx: AcquisitionContextV1 = {
    targetItem: 'iron_ingot',
    oreNearby: true,
    villagerTradeAvailable: true,
    knownChestCountBucket: 1,
    distBucket_villager: 1,
    distBucket_chest: 1,
    distBucket_ore: 1,
    inventoryHash: 'abcdef0123456789',
    toolTierCap: 'cap:has_stone_pickaxe',
  };

  it('lower cost ranks higher (no priors)', () => {
    const candidates = [
      { strategy: 'mine' as const, item: 'iron_ingot', estimatedCost: 10, feasibility: 'available' as const, requires: [], contextSnapshot: baseCtx },
      { strategy: 'trade' as const, item: 'iron_ingot', estimatedCost: 3, feasibility: 'available' as const, requires: [], contextSnapshot: baseCtx },
    ];
    const ranked = rankStrategies(candidates, []);
    expect(ranked[0].strategy).toBe('trade');
    expect(ranked[1].strategy).toBe('mine');
  });

  it('prior success rate affects ranking', () => {
    const candidates = [
      { strategy: 'mine' as const, item: 'iron_ingot', estimatedCost: 5, feasibility: 'available' as const, requires: [], contextSnapshot: baseCtx },
      { strategy: 'trade' as const, item: 'iron_ingot', estimatedCost: 5, feasibility: 'available' as const, requires: [], contextSnapshot: baseCtx },
    ];

    const contextKey = contextKeyFromAcquisitionContext(baseCtx);
    // Mine has higher success rate → lower score → ranks first
    const priors: StrategyPrior[] = [
      { strategy: 'mine', contextKey, successRate: 0.9, sampleCount: 5 },
      { strategy: 'trade', contextKey, successRate: 0.3, sampleCount: 5 },
    ];

    const ranked = rankStrategies(candidates, priors);
    expect(ranked[0].strategy).toBe('mine');
    expect(ranked[1].strategy).toBe('trade');
  });

  it('deterministic tie-break: alphabetical by strategy name', () => {
    const candidates = [
      { strategy: 'trade' as const, item: 'iron_ingot', estimatedCost: 5, feasibility: 'available' as const, requires: [], contextSnapshot: baseCtx },
      { strategy: 'mine' as const, item: 'iron_ingot', estimatedCost: 5, feasibility: 'available' as const, requires: [], contextSnapshot: baseCtx },
    ];

    // Same cost, same default prior → tie broken by name
    const ranked = rankStrategies(candidates, []);
    expect(ranked[0].strategy).toBe('mine');
    expect(ranked[1].strategy).toBe('trade');
  });
});

// ── Context Key ────────────────────────────────────────────────────────────

describe('contextKeyFromAcquisitionContext', () => {
  it('produces deterministic string', () => {
    const ctx = buildAcquisitionContext(
      'iron_ingot',
      makeInventory(),
      ['iron_ore'],
      [makeVillager(10)],
    );
    const k1 = contextKeyFromAcquisitionContext(ctx);
    const k2 = contextKeyFromAcquisitionContext(ctx);
    expect(k1).toBe(k2);
  });

  it('different target items produce different keys', () => {
    const a = buildAcquisitionContext('iron_ingot', makeInventory(), [], []);
    const b = buildAcquisitionContext('diamond', makeInventory(), [], []);
    expect(contextKeyFromAcquisitionContext(a)).not.toBe(
      contextKeyFromAcquisitionContext(b)
    );
  });
});

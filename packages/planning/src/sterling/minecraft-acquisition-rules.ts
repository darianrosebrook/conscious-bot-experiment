/**
 * Minecraft Acquisition Rules (Rig D)
 *
 * Strategy enumeration, ranking, and context building for multi-strategy
 * item acquisition. Builds AcquisitionContextV1 from raw world state and
 * enumerates viable strategies with cost estimates.
 *
 * @author @darianrosebrook
 */

import { hashInventoryState } from './solve-bundle';
import type {
  AcquisitionContextV1,
  AcquisitionCandidate,
  AcquisitionStrategy,
  StrategyPrior,
} from './minecraft-acquisition-types';

// ============================================================================
// Distance Bucketing
// ============================================================================

/**
 * Bucket a distance into coarse ranges.
 * 0 = none (entity not present), 1 = close (<16), 2 = medium (<64), 3 = far (>=64)
 */
export function distanceToBucket(distance: number | undefined | null): number {
  if (distance === undefined || distance === null || distance < 0) return 0;
  if (distance < 16) return 1;
  if (distance < 64) return 2;
  return 3;
}

// ============================================================================
// Trade & Loot Tables
// ============================================================================

/** Common villager trades: item → cost + required profession */
export const MINECRAFT_TRADE_TABLE: Record<
  string,
  { cost: Array<{ item: string; count: number }>; villagerProfession: string }
> = {
  iron_ingot: { cost: [{ item: 'emerald', count: 1 }], villagerProfession: 'armorer' },
  diamond: { cost: [{ item: 'emerald', count: 7 }], villagerProfession: 'toolsmith' },
  coal: { cost: [{ item: 'emerald', count: 1 }], villagerProfession: 'fisherman' },
  lapis_lazuli: { cost: [{ item: 'emerald', count: 1 }], villagerProfession: 'cleric' },
  redstone: { cost: [{ item: 'emerald', count: 1 }], villagerProfession: 'cleric' },
  glowstone: { cost: [{ item: 'emerald', count: 4 }], villagerProfession: 'cleric' },
  ender_pearl: { cost: [{ item: 'emerald', count: 5 }], villagerProfession: 'cleric' },
  bookshelf: { cost: [{ item: 'emerald', count: 9 }], villagerProfession: 'librarian' },
  glass: { cost: [{ item: 'emerald', count: 1 }], villagerProfession: 'librarian' },
};

/** Common loot sources: item → container source + probability */
export const MINECRAFT_LOOT_TABLE: Record<
  string,
  { source: string; probability: number }
> = {
  diamond: { source: 'chest', probability: 0.15 },
  iron_ingot: { source: 'chest', probability: 0.35 },
  gold_ingot: { source: 'chest', probability: 0.25 },
  emerald: { source: 'chest', probability: 0.05 },
  saddle: { source: 'chest', probability: 0.25 },
  name_tag: { source: 'chest', probability: 0.10 },
  coal: { source: 'chest', probability: 0.40 },
  bread: { source: 'chest', probability: 0.50 },
  string: { source: 'chest', probability: 0.40 },
};

/**
 * Reverse recipe lookup: item → source items that can be salvaged.
 * Salvage = reverse-crafting (e.g., iron_sword → 2 iron_ingot).
 */
export const MINECRAFT_SALVAGE_TABLE: Record<
  string,
  Array<{ sourceItem: string; produces: Array<{ item: string; count: number }> }>
> = {
  iron_ingot: [
    { sourceItem: 'iron_sword', produces: [{ item: 'iron_ingot', count: 2 }] },
    { sourceItem: 'iron_pickaxe', produces: [{ item: 'iron_ingot', count: 3 }] },
    { sourceItem: 'iron_shovel', produces: [{ item: 'iron_ingot', count: 1 }] },
    { sourceItem: 'iron_axe', produces: [{ item: 'iron_ingot', count: 3 }] },
    { sourceItem: 'iron_hoe', produces: [{ item: 'iron_ingot', count: 2 }] },
    { sourceItem: 'iron_helmet', produces: [{ item: 'iron_ingot', count: 5 }] },
    { sourceItem: 'iron_chestplate', produces: [{ item: 'iron_ingot', count: 8 }] },
    { sourceItem: 'iron_leggings', produces: [{ item: 'iron_ingot', count: 7 }] },
    { sourceItem: 'iron_boots', produces: [{ item: 'iron_ingot', count: 4 }] },
  ],
  oak_planks: [
    { sourceItem: 'oak_log', produces: [{ item: 'oak_planks', count: 4 }] },
  ],
  stick: [
    { sourceItem: 'oak_planks', produces: [{ item: 'stick', count: 4 }] },
  ],
  cobblestone: [
    { sourceItem: 'stone', produces: [{ item: 'cobblestone', count: 1 }] },
  ],
};

/** Ore block → items mapping for ore detection */
const ORE_BLOCK_MAP: Record<string, string[]> = {
  iron_ore: ['iron_ingot', 'raw_iron'],
  deepslate_iron_ore: ['iron_ingot', 'raw_iron'],
  gold_ore: ['gold_ingot', 'raw_gold'],
  deepslate_gold_ore: ['gold_ingot', 'raw_gold'],
  diamond_ore: ['diamond'],
  deepslate_diamond_ore: ['diamond'],
  coal_ore: ['coal'],
  deepslate_coal_ore: ['coal'],
  copper_ore: ['copper_ingot', 'raw_copper'],
  deepslate_copper_ore: ['copper_ingot', 'raw_copper'],
  lapis_ore: ['lapis_lazuli'],
  deepslate_lapis_ore: ['lapis_lazuli'],
  redstone_ore: ['redstone'],
  deepslate_redstone_ore: ['redstone'],
  emerald_ore: ['emerald'],
  deepslate_emerald_ore: ['emerald'],
};

/** Items that can be directly mined from blocks (not ore) */
const DIRECT_MINE_MAP: Record<string, string[]> = {
  stone: ['cobblestone'],
  cobblestone: ['cobblestone'],
  oak_log: ['oak_log'],
  birch_log: ['birch_log'],
  spruce_log: ['spruce_log'],
  jungle_log: ['jungle_log'],
  acacia_log: ['acacia_log'],
  dark_oak_log: ['dark_oak_log'],
  sand: ['sand'],
  gravel: ['gravel'],
  dirt: ['dirt'],
  clay: ['clay_ball'],
};

/** Tool tier required for mining specific ores */
const ORE_TIER_REQUIREMENTS: Record<string, string> = {
  iron_ore: 'cap:has_stone_pickaxe',
  deepslate_iron_ore: 'cap:has_stone_pickaxe',
  gold_ore: 'cap:has_iron_pickaxe',
  deepslate_gold_ore: 'cap:has_iron_pickaxe',
  diamond_ore: 'cap:has_iron_pickaxe',
  deepslate_diamond_ore: 'cap:has_iron_pickaxe',
  coal_ore: 'cap:has_wooden_pickaxe',
  deepslate_coal_ore: 'cap:has_wooden_pickaxe',
  copper_ore: 'cap:has_stone_pickaxe',
  deepslate_copper_ore: 'cap:has_stone_pickaxe',
  lapis_ore: 'cap:has_stone_pickaxe',
  deepslate_lapis_ore: 'cap:has_stone_pickaxe',
  redstone_ore: 'cap:has_iron_pickaxe',
  deepslate_redstone_ore: 'cap:has_iron_pickaxe',
  emerald_ore: 'cap:has_iron_pickaxe',
  deepslate_emerald_ore: 'cap:has_iron_pickaxe',
};

/** Tier ordering for cap comparison */
const TIER_ORDER: Record<string, number> = {
  'cap:has_wooden_pickaxe': 1,
  'cap:has_stone_pickaxe': 2,
  'cap:has_iron_pickaxe': 3,
  'cap:has_diamond_pickaxe': 4,
};

// ============================================================================
// Context Building
// ============================================================================

export interface NearbyEntity {
  type: string;
  distance?: number;
  name?: string;
  trades?: Array<{ inputItem: string; outputItem: string }>;
}

/**
 * Build an AcquisitionContextV1 from raw world state.
 *
 * Buckets distances coarsely. Context is snapshot-at-entry, not live.
 */
export function buildAcquisitionContext(
  item: string,
  inventory: Record<string, number>,
  nearbyBlocks: string[],
  nearbyEntities: NearbyEntity[] = [],
): AcquisitionContextV1 {
  // Detect ore nearby for target item
  const oreNearby = nearbyBlocks.some(block => {
    const oreItems = ORE_BLOCK_MAP[block];
    if (oreItems?.includes(item)) return true;
    const directItems = DIRECT_MINE_MAP[block];
    return directItems?.includes(item) ?? false;
  });

  // Find villager distance and trade availability
  let villagerDist: number | undefined;
  let villagerTradeAvailable = false;
  for (const entity of nearbyEntities) {
    if (entity.type === 'villager' || entity.type === 'Villager') {
      if (villagerDist === undefined || (entity.distance !== undefined && entity.distance < villagerDist)) {
        villagerDist = entity.distance;
      }
      // Check if villager has trade for this item
      if (entity.trades?.some(t => t.outputItem === item)) {
        villagerTradeAvailable = true;
      }
    }
  }
  // Also check trade table
  if (!villagerTradeAvailable && villagerDist !== undefined && MINECRAFT_TRADE_TABLE[item]) {
    villagerTradeAvailable = true;
  }

  // Find chest distance and count
  let closestChestDist: number | undefined;
  let chestCount = 0;
  for (const entity of nearbyEntities) {
    if (entity.type === 'chest' || entity.type === 'Chest' || entity.type === 'trapped_chest') {
      chestCount++;
      if (closestChestDist === undefined || (entity.distance !== undefined && entity.distance < closestChestDist)) {
        closestChestDist = entity.distance;
      }
    }
  }

  // Find ore block distance
  let closestOreDist: number | undefined;
  if (oreNearby) {
    // Approximate: if ore is nearby, use a close bucket (blocks don't have distance in our model)
    closestOreDist = 8; // Default "close" when ore is detected in nearbyBlocks
  }

  // Extract tool tier cap
  let toolTierCap: string | undefined;
  let maxTier = 0;
  for (const key of Object.keys(inventory)) {
    if (key.startsWith('cap:has_') && key.endsWith('_pickaxe')) {
      const tier = TIER_ORDER[key] ?? 0;
      if (tier > maxTier) {
        maxTier = tier;
        toolTierCap = key;
      }
    }
  }

  return {
    targetItem: item,
    oreNearby,
    villagerTradeAvailable,
    knownChestCountBucket: chestCount >= 2 ? 2 : (chestCount as 0 | 1),
    distBucket_villager: distanceToBucket(villagerDist),
    distBucket_chest: distanceToBucket(closestChestDist),
    distBucket_ore: distanceToBucket(closestOreDist),
    inventoryHash: hashInventoryState(inventory),
    toolTierCap,
  };
}

// ============================================================================
// Strategy Enumeration
// ============================================================================

/**
 * Enumerate viable acquisition strategies for a given item + context.
 *
 * Each candidate stores a contextSnapshot for digest computation.
 * The candidate set is the semantic boundary for M1: learning changes
 * ranking, never the candidate set.
 */
export function buildAcquisitionStrategies(
  ctx: AcquisitionContextV1,
): AcquisitionCandidate[] {
  const candidates: AcquisitionCandidate[] = [];
  const item = ctx.targetItem;

  // ── MINE strategy ──────────────────────────────────────────────────
  const mineCandidate = buildMineCandidate(item, ctx);
  if (mineCandidate) candidates.push(mineCandidate);

  // ── TRADE strategy ─────────────────────────────────────────────────
  const tradeCandidate = buildTradeCandidate(item, ctx);
  if (tradeCandidate) candidates.push(tradeCandidate);

  // ── LOOT strategy ──────────────────────────────────────────────────
  const lootCandidate = buildLootCandidate(item, ctx);
  if (lootCandidate) candidates.push(lootCandidate);

  // ── SALVAGE strategy ───────────────────────────────────────────────
  const salvageCandidates = buildSalvageCandidates(item, ctx);
  candidates.push(...salvageCandidates);

  return candidates;
}

function buildMineCandidate(
  item: string,
  ctx: AcquisitionContextV1,
): AcquisitionCandidate | null {
  // Check if the item can be mined at all
  const isMineable = Object.values(ORE_BLOCK_MAP).some(items => items.includes(item))
    || Object.values(DIRECT_MINE_MAP).some(items => items.includes(item));
  if (!isMineable) return null;

  // Check tool tier requirement
  const requiredTier = findRequiredTier(item);
  const requires: string[] = requiredTier ? [requiredTier] : [];

  // Check if tool tier is sufficient
  const hasSufficientTier = requiredTier
    ? (TIER_ORDER[ctx.toolTierCap ?? ''] ?? 0) >= (TIER_ORDER[requiredTier] ?? 0)
    : true;

  const feasibility = ctx.oreNearby && hasSufficientTier
    ? 'available' as const
    : 'unknown' as const;

  // Base cost for mining: distance factor + effort
  const baseCost = ctx.oreNearby ? 8 : 15;
  const tierPenalty = !hasSufficientTier ? 10 : 0;

  return {
    strategy: 'mine',
    item,
    estimatedCost: baseCost + tierPenalty,
    feasibility,
    requires,
    contextSnapshot: ctx,
  };
}

function buildTradeCandidate(
  item: string,
  ctx: AcquisitionContextV1,
): AcquisitionCandidate | null {
  const trade = MINECRAFT_TRADE_TABLE[item];
  if (!trade) return null;

  const feasibility = ctx.villagerTradeAvailable
    ? 'available' as const
    : 'unknown' as const;

  // Cost based on emerald price + distance
  const emeraldCost = trade.cost.reduce((sum, c) => sum + c.count, 0);
  const distanceCost = ctx.distBucket_villager * 2;
  const requires = ['proximity:villager', ...trade.cost.map(c => c.item)];

  return {
    strategy: 'trade',
    item,
    estimatedCost: emeraldCost + distanceCost,
    feasibility,
    requires,
    contextSnapshot: ctx,
  };
}

function buildLootCandidate(
  item: string,
  ctx: AcquisitionContextV1,
): AcquisitionCandidate | null {
  const loot = MINECRAFT_LOOT_TABLE[item];
  if (!loot) return null;

  const feasibility = ctx.knownChestCountBucket > 0
    ? 'available' as const
    : 'unknown' as const;

  // Cost inversely proportional to probability, plus distance
  const probabilityCost = Math.round((1 / loot.probability) * 3);
  const distanceCost = ctx.distBucket_chest * 2;

  return {
    strategy: 'loot',
    item,
    estimatedCost: probabilityCost + distanceCost,
    feasibility,
    requires: ['proximity:container:chest'],
    contextSnapshot: ctx,
  };
}

function buildSalvageCandidates(
  item: string,
  ctx: AcquisitionContextV1,
): AcquisitionCandidate[] {
  const salvageEntries = MINECRAFT_SALVAGE_TABLE[item];
  if (!salvageEntries) return [];

  // Only include salvage if the source item is actually in inventory
  // (we check inventoryHash indirectly through context — but for feasibility
  // we can't tell from the hash. Caller should provide inventory separately
  // or we check via contextSnapshot. For now, always include as 'unknown'
  // since the context doesn't carry raw inventory.)
  return salvageEntries.map(entry => ({
    strategy: 'salvage' as const,
    item,
    estimatedCost: 3, // Salvage is cheap when available
    feasibility: 'unknown' as const,
    requires: [entry.sourceItem],
    contextSnapshot: ctx,
  }));
}

/**
 * Build salvage candidates with inventory awareness.
 * Uses raw inventory to determine feasibility.
 */
export function buildSalvageCandidatesWithInventory(
  item: string,
  ctx: AcquisitionContextV1,
  inventory: Record<string, number>,
): AcquisitionCandidate[] {
  const salvageEntries = MINECRAFT_SALVAGE_TABLE[item];
  if (!salvageEntries) return [];

  return salvageEntries
    .filter(entry => (inventory[entry.sourceItem] ?? 0) > 0)
    .map(entry => ({
      strategy: 'salvage' as const,
      item,
      estimatedCost: 3,
      feasibility: 'available' as const,
      requires: [entry.sourceItem],
      contextSnapshot: ctx,
    }));
}

function findRequiredTier(item: string): string | undefined {
  for (const [oreBlock, items] of Object.entries(ORE_BLOCK_MAP)) {
    if (items.includes(item)) {
      return ORE_TIER_REQUIREMENTS[oreBlock];
    }
  }
  return undefined;
}

// ============================================================================
// Strategy Ranking
// ============================================================================

/**
 * Rank strategies by cost-adjusted prior score.
 *
 * Score = estimatedCost * (1 - prior.successRate)
 * Lower score = better ranking. Deterministic tie-break by strategy name
 * using simple lexicographic comparison (not localeCompare).
 * Scores are quantized to integer millicost for deterministic ordering.
 */
export function rankStrategies(
  candidates: AcquisitionCandidate[],
  priors: StrategyPrior[],
  _objectiveWeights?: { costWeight?: number; timeWeight?: number; riskWeight?: number },
): AcquisitionCandidate[] {
  const priorMap = new Map<string, StrategyPrior>();
  for (const p of priors) {
    priorMap.set(`${p.strategy}:${p.contextKey}`, p);
  }

  const scored = candidates.map(c => {
    const contextKey = contextKeyFromAcquisitionContext(c.contextSnapshot);
    const prior = priorMap.get(`${c.strategy}:${contextKey}`);
    const successRate = prior?.successRate ?? 0.5;
    const score = c.estimatedCost * (1 - successRate);
    // Quantize to integer millicost for deterministic comparison
    const scoreMillis = Number.isNaN(score) || !Number.isFinite(score)
      ? Number.MAX_SAFE_INTEGER
      : Math.round(score * 1000);
    return { candidate: c, scoreMillis };
  });

  scored.sort((a, b) => {
    const diff = a.scoreMillis - b.scoreMillis;
    if (diff !== 0) return diff;
    // Deterministic tie-break: simple lexicographic by strategy name
    const nameA = a.candidate.strategy;
    const nameB = b.candidate.strategy;
    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
  });

  return scored.map(s => s.candidate);
}

/**
 * Derive a stable context key from AcquisitionContextV1.
 * Subset of context fields that are strategy-relevant for prior indexing.
 */
export function contextKeyFromAcquisitionContext(ctx: AcquisitionContextV1): string {
  // Use a subset: targetItem + presence flags + distance buckets
  const parts = [
    ctx.targetItem,
    ctx.oreNearby ? '1' : '0',
    ctx.villagerTradeAvailable ? '1' : '0',
    String(ctx.knownChestCountBucket),
    String(ctx.distBucket_villager),
    String(ctx.distBucket_chest),
    String(ctx.distBucket_ore),
    ctx.toolTierCap ?? 'none',
  ];
  return parts.join(':');
}

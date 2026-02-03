/**
 * Minecraft Tool Progression Domain Type Definitions
 *
 * Types for planning multi-tier tool upgrades via Sterling's graph search.
 * The tool progression domain models capability states as graph nodes and
 * tier-gated upgrade/mine actions as edges, allowing Sterling to find
 * optimal upgrade paths (wood -> stone -> iron -> diamond).
 *
 * Transport: shares the 'minecraft' Sterling domain (no backend changes).
 * Learning isolation: all action IDs are prefixed with 'tp:' so edge
 * weights don't collide with the crafting solver's namespace.
 *
 * Capabilities are modeled as virtual tokens with 'cap:' prefix that
 * exist only inside Sterling's search state. They MUST NOT appear in
 * bot inventory snapshots or execution-facing artifacts.
 *
 * @author @darianrosebrook
 */

import type { BaseSolveResult } from './base-domain-solver';

// ============================================================================
// Tool Tiers
// ============================================================================

/** Material tiers in Minecraft's tool hierarchy */
export type ToolTier = 'wooden' | 'stone' | 'iron' | 'diamond';

/** Tool types that follow the tier progression */
export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'sword';

/** Ordered tiers from lowest to highest */
export const TOOL_TIERS: readonly ToolTier[] = ['wooden', 'stone', 'iron', 'diamond'] as const;

/**
 * Capability token prefix for virtual inventory items.
 * Tokens with this prefix exist only in Sterling's search state.
 * MUST be rejected in input inventories and filtered from output artifacts.
 */
export const CAP_PREFIX = 'cap:' as const;

// ============================================================================
// Frozen Tier Gate Matrix
// ============================================================================

/**
 * Tier gate matrix — maps each pickaxe tier to the blocks it unlocks for mining.
 *
 * Frozen constant derived from Minecraft 1.20 harvest levels.
 * When upgrading mcData version, re-derive and bump tierMatrixVersion.
 *
 * Harvest levels in Minecraft:
 *   0 = hand (dirt, sand, gravel, wood — no pickaxe needed)
 *   1 = wooden/gold pickaxe (stone, coal_ore, nether quartz, etc.)
 *   2 = stone pickaxe (iron_ore, lapis_ore, copper_ore)
 *   3 = iron pickaxe (diamond_ore, redstone_ore, emerald_ore, gold_ore)
 *   4 = diamond pickaxe (obsidian, ancient_debris)
 *
 * Source: https://minecraft.wiki/w/Pickaxe#Mining
 */
export const TIER_GATE_MATRIX: Readonly<Record<ToolTier, readonly string[]>> = {
  wooden: [
    'stone', 'cobblestone', 'coal_ore', 'deepslate_coal_ore',
    'nether_quartz_ore', 'nether_gold_ore', 'sandstone',
    'red_sandstone', 'dripstone_block', 'pointed_dripstone',
  ],
  stone: [
    'iron_ore', 'deepslate_iron_ore', 'lapis_ore', 'deepslate_lapis_ore',
    'copper_ore', 'deepslate_copper_ore',
  ],
  iron: [
    'diamond_ore', 'deepslate_diamond_ore', 'redstone_ore',
    'deepslate_redstone_ore', 'emerald_ore', 'deepslate_emerald_ore',
    'gold_ore', 'deepslate_gold_ore',
  ],
  diamond: [
    'obsidian', 'crying_obsidian', 'ancient_debris',
    'respawn_anchor', 'netherite_block',
  ],
} as const;

/**
 * Version identifier for the tier matrix. Include in solve requests
 * so learned weights remain interpretable across matrix updates.
 */
export const TIER_MATRIX_VERSION = '1.20.0' as const;

/**
 * Primary materials yielded by mining tier-gated blocks.
 * Maps ore block name to the item it drops (for rule generation).
 */
export const ORE_DROP_MAP: Readonly<Record<string, { item: string; count: number; needsSmelt?: boolean }>> = {
  coal_ore: { item: 'coal', count: 1 },
  deepslate_coal_ore: { item: 'coal', count: 1 },
  iron_ore: { item: 'raw_iron', count: 1, needsSmelt: true },
  deepslate_iron_ore: { item: 'raw_iron', count: 1, needsSmelt: true },
  copper_ore: { item: 'raw_copper', count: 1, needsSmelt: true },
  deepslate_copper_ore: { item: 'raw_copper', count: 1, needsSmelt: true },
  gold_ore: { item: 'raw_gold', count: 1, needsSmelt: true },
  deepslate_gold_ore: { item: 'raw_gold', count: 1, needsSmelt: true },
  lapis_ore: { item: 'lapis_lazuli', count: 4 },
  deepslate_lapis_ore: { item: 'lapis_lazuli', count: 4 },
  redstone_ore: { item: 'redstone', count: 4 },
  deepslate_redstone_ore: { item: 'redstone', count: 4 },
  diamond_ore: { item: 'diamond', count: 1 },
  deepslate_diamond_ore: { item: 'diamond', count: 1 },
  emerald_ore: { item: 'emerald', count: 1 },
  deepslate_emerald_ore: { item: 'emerald', count: 1 },
  nether_quartz_ore: { item: 'quartz', count: 1 },
  nether_gold_ore: { item: 'gold_nugget', count: 1 },
  ancient_debris: { item: 'ancient_debris', count: 1, needsSmelt: true },
} as const;

/**
 * Non-ore block → drop mappings for mine-step verification.
 *
 * When a step mines "stone" without silk touch, the inventory receives
 * "cobblestone" — verification must accept the drop, not the block name.
 *
 * Scope: ONLY used in mine-step verification (acquire_material, dig_block).
 * NOT a global equivalence class — crafting expects the exact item name.
 *
 * Entries mapped to 'air' mean "drops nothing without silk touch."
 * These are informational only — they are NOT pushed into accepted
 * inventory names and cannot satisfy a positive inventory delta.
 * Mining these blocks will correctly fail verification (zero-delta).
 */
export const BLOCK_DROP_MAP: Readonly<Record<string, string>> = {
  stone: 'cobblestone',
  grass_block: 'dirt',
  clay: 'clay_ball',
  glowstone: 'glowstone_dust',
  sea_lantern: 'prismarine_crystals',
  melon: 'melon_slice',
  snow: 'snowball',
  ice: 'air',             // drops nothing without silk touch
  packed_ice: 'air',
  blue_ice: 'air',
} as const;

/**
 * Materials required to craft each tier of pickaxe.
 * Used by the rule builder to generate craft-upgrade edges.
 */
export const PICKAXE_RECIPES: Readonly<Record<ToolTier, { material: string; materialCount: number; sticks: number }>> = {
  wooden: { material: 'oak_planks', materialCount: 3, sticks: 2 },
  stone: { material: 'cobblestone', materialCount: 3, sticks: 2 },
  iron: { material: 'iron_ingot', materialCount: 3, sticks: 2 },
  diamond: { material: 'diamond', materialCount: 3, sticks: 2 },
} as const;

/**
 * Smelting recipes relevant to tool progression.
 * Maps raw material -> smelted output.
 */
export const SMELT_RECIPES: Readonly<Record<string, string>> = {
  raw_iron: 'iron_ingot',
  raw_gold: 'gold_ingot',
  raw_copper: 'copper_ingot',
  ancient_debris: 'netherite_scrap',
} as const;

// ============================================================================
// Rules
// ============================================================================

/**
 * Sterling-valid action types.
 * The Python backend only accepts these four values — 'upgrade' is NOT valid.
 * Upgrade actions use actionType='craft' and are identified by their
 * 'tp:upgrade:*' action prefix for label mapping.
 */
export type SterlingActionType = 'craft' | 'mine' | 'smelt' | 'place';

/** A tool progression rule for Sterling's graph search */
export interface ToolProgressionRule {
  /** Action ID with 'tp:' prefix, e.g. "tp:upgrade:stone_pickaxe", "tp:mine:iron_ore" */
  action: string;
  /**
   * Action category sent to Sterling backend.
   * Must be a SterlingActionType ('craft' | 'mine' | 'smelt' | 'place').
   * Upgrade rules use 'craft' here and are detected by 'tp:upgrade:' prefix.
   */
  actionType: SterlingActionType;
  /** What the action produces (may include cap: virtual tokens) */
  produces: ToolProgressionItem[];
  /** What the action consumes from inventory */
  consumes: ToolProgressionItem[];
  /**
   * Items that must exist in inventory but are NOT consumed.
   *
   * BACKEND CAVEAT: Sterling's _can_apply() skips requires checks for
   * mine rules (early return at line 273). For mine rules that need
   * preconditions, the rule builder compiles requires into consume+reproduce
   * invariant pairs instead. The requires field is still populated for
   * documentation and non-mine rules where it IS enforced.
   */
  requires: ToolProgressionItem[];
  /** Whether a crafting table is needed */
  needsTable: boolean;
  /** Whether a furnace is needed */
  needsFurnace: boolean;
  /** A* cost for this edge */
  baseCost: number;
}

/** An item (real or virtual capability token) in the progression state */
export interface ToolProgressionItem {
  name: string;
  count: number;
}

// ============================================================================
// Solve Result
// ============================================================================

/** A single step in the tool progression solution */
export interface ToolProgressionStep {
  /** Action ID with 'tp:' prefix */
  action: string;
  /** Action category */
  actionType: 'craft' | 'mine' | 'smelt' | 'place' | 'upgrade';
  /** Items produced (cap: tokens FILTERED OUT) */
  produces: ToolProgressionItem[];
  /** Items consumed (cap: tokens FILTERED OUT) */
  consumes: ToolProgressionItem[];
  /** Resulting inventory state (cap: tokens FILTERED OUT) */
  resultingInventory: Record<string, number>;
  /** True when this step could not be mapped to a known rule. */
  degraded?: boolean;
  /** Why this step is degraded: no label found, or label didn't match any rule. */
  degradedReason?: 'no_label' | 'unmatched_rule';
}

/** Blocks the progression plan needs but weren't observed nearby */
export interface NeedsBlocks {
  /** Block types required but not in nearbyBlocks */
  missingBlocks: string[];
  /** The tier that requires these blocks */
  blockedAtTier: ToolTier;
  /** Current best tier the bot has */
  currentTier: ToolTier | null;
}

/** Full result from the tool progression solver */
export interface ToolProgressionSolveResult extends BaseSolveResult {
  solved: boolean;
  steps: ToolProgressionStep[];
  totalNodes: number;
  durationMs: number;
  error?: string;
  /** Target tier the bot was trying to reach */
  targetTier?: ToolTier;
  /** Bot's tier at solve time */
  currentTier?: ToolTier | null;
  /** Target tool type */
  targetTool?: string;
  /** Blocks needed but not observed — honest partial-observability signal */
  needsBlocks?: NeedsBlocks;
  /** Sterling planId for episode reporting */
  planId?: string | null;
  /** True when step mapping encountered edges that could not be mapped to rules. */
  mappingDegraded?: boolean;
  /** Number of solution path edges with no action label from either source. */
  noActionLabelEdges?: number;
  /** Number of edges with a label that didn't match any known rule action. */
  unmatchedRuleEdges?: number;
  /** Number of search_edge (source,target) pairs with conflicting action names. */
  searchEdgeCollisions?: number;
  /** Solve-time join keys for deferred episode reporting */
  solveJoinKeys?: import('./solve-bundle-types').SolveJoinKeys;
}

// ============================================================================
// Episode Reporting
// ============================================================================

/** Execution feedback for Sterling learning */
export interface ToolProgressionEpisodeReport {
  planId: string;
  targetTool: string;
  targetTier: ToolTier;
  currentTier: ToolTier | null;
  success: boolean;
  /** How many tiers were actually upgraded */
  tiersCompleted: number;
  /** Tier where failure occurred, if any */
  failedAtTier?: ToolTier;
  failureReason?: string;
}

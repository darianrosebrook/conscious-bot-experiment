/**
 * Goal Grounder — Production Reasoning Surface
 *
 * Validates that extracted goals are grounded in the situation frame facts.
 * A goal "grounds" when:
 * 1. The target references entities/items/locations that exist in the frame
 * 2. The action is feasible given current state (basic feasibility, not planning)
 * 3. No contradictions exist between the goal and frame facts
 *
 * This is a falsification-style check: we look for violations, not confirmations.
 * The goal passes grounding if no violations are found.
 *
 * @author @darianrosebrook
 */

import type { GoalTagV1 } from '../llm-output-sanitizer';
import type { GroundingResult, GroundingViolation } from './eligibility';

// ============================================================================
// Types
// ============================================================================

/**
 * Situation frame facts for grounding validation.
 * This is a subset of the full ThoughtContext focused on what's needed for grounding.
 */
export interface GroundingContext {
  /** Bot's current state */
  bot: {
    health: number;
    hunger: number;
    inventory: Array<{ name: string; count: number }>;
    position?: { x: number; y: number; z: number };
  };
  /** World state */
  world: {
    biome: string;
    nearbyEntities: Array<{ kind: string; count: number; distance?: number }>;
    nearbyBlocks?: Array<{ type: string; count: number }>;
  };
  /** Known item/entity vocabulary (for unknown reference detection) */
  vocabulary?: {
    knownItems: Set<string>;
    knownEntities: Set<string>;
    knownBiomes: Set<string>;
  };
}

/**
 * Configuration for grounding strictness.
 */
export interface GroundingConfig {
  /** Require exact match for entity references (default: true) */
  strictEntityMatch: boolean;
  /** Require exact match for item references (default: true) */
  strictItemMatch: boolean;
  /** Allow unknown references without failing (track as warning) */
  allowUnknownReferences: boolean;
  /** Maximum edit distance for fuzzy matching (0 = exact only) */
  maxEditDistance: number;
}

const DEFAULT_CONFIG: GroundingConfig = {
  strictEntityMatch: true,
  strictItemMatch: true,
  allowUnknownReferences: true, // LF-5: track unknown separately, don't fail
  maxEditDistance: 0,
};

// ============================================================================
// Known Vocabulary
// ============================================================================

/**
 * Common Minecraft entities for reference validation.
 * This is a baseline vocabulary; actual entities are validated against frame facts.
 */
const COMMON_ENTITIES = new Set([
  // Passive
  'pig', 'cow', 'sheep', 'chicken', 'horse', 'donkey', 'mule', 'rabbit', 'wolf', 'cat', 'ocelot',
  'parrot', 'fox', 'bee', 'squid', 'glow_squid', 'dolphin', 'turtle', 'panda', 'polar_bear',
  'llama', 'trader_llama', 'wandering_trader', 'villager', 'iron_golem', 'snow_golem', 'bat',
  // Hostile
  'zombie', 'skeleton', 'creeper', 'spider', 'cave_spider', 'enderman', 'slime', 'magma_cube',
  'witch', 'pillager', 'vindicator', 'evoker', 'vex', 'ravager', 'phantom', 'drowned', 'husk',
  'stray', 'blaze', 'ghast', 'wither_skeleton', 'piglin', 'piglin_brute', 'hoglin', 'zoglin',
  'zombified_piglin', 'endermite', 'silverfish', 'shulker', 'guardian', 'elder_guardian',
  'warden', 'wither', 'ender_dragon',
]);

/**
 * Common Minecraft biomes for location reference validation.
 */
const COMMON_BIOMES = new Set([
  'plains', 'forest', 'birch_forest', 'dark_forest', 'flower_forest', 'taiga', 'snowy_taiga',
  'old_growth_pine_taiga', 'old_growth_spruce_taiga', 'jungle', 'sparse_jungle', 'bamboo_jungle',
  'swamp', 'mangrove_swamp', 'desert', 'badlands', 'eroded_badlands', 'wooded_badlands',
  'savanna', 'windswept_savanna', 'meadow', 'grove', 'snowy_slopes', 'frozen_peaks', 'jagged_peaks',
  'stony_peaks', 'river', 'frozen_river', 'beach', 'snowy_beach', 'stony_shore', 'ocean',
  'deep_ocean', 'warm_ocean', 'lukewarm_ocean', 'cold_ocean', 'frozen_ocean', 'mushroom_fields',
  'dripstone_caves', 'lush_caves', 'deep_dark', 'nether_wastes', 'soul_sand_valley',
  'crimson_forest', 'warped_forest', 'basalt_deltas', 'the_end', 'end_highlands', 'end_midlands',
]);

// ============================================================================
// Grounding Logic
// ============================================================================

/**
 * Ground a goal against the situation frame facts.
 *
 * This implements falsification-style checking (LF-5):
 * - We look for violations (fabricated references, contradictions)
 * - Unknown references are tracked separately, not automatic failures
 * - A goal passes if no hard violations are found
 *
 * @param goal - The extracted goal to validate
 * @param context - The situation frame facts
 * @param config - Optional grounding configuration
 * @returns Grounding result with pass/fail and any violations
 */
export function groundGoal(
  goal: GoalTagV1,
  context: GroundingContext,
  config: GroundingConfig = DEFAULT_CONFIG
): GroundingResult {
  const violations: GroundingViolation[] = [];
  const referencedFacts: string[] = [];

  // Parse the target into individual terms
  const targetTerms = goal.target.toLowerCase().split(/[\s_]+/).filter(t => t.length > 0);

  // Build context vocabularies
  const inventoryItems = new Set(context.bot.inventory.map(i => normalizeItemName(i.name)));
  const nearbyEntityKinds = new Set(context.world.nearbyEntities.map(e => e.kind.toLowerCase()));
  const currentBiome = context.world.biome.toLowerCase();

  // Check each target term for grounding
  for (const term of targetTerms) {
    const normalized = normalizeItemName(term);

    // Check if term matches inventory
    if (inventoryItems.has(normalized) || itemMatchesInventory(normalized, inventoryItems)) {
      referencedFacts.push(`inventory:${normalized}`);
      continue;
    }

    // Check if term matches nearby entities
    if (nearbyEntityKinds.has(normalized) || entityMatchesNearby(normalized, nearbyEntityKinds)) {
      referencedFacts.push(`entity:${normalized}`);
      continue;
    }

    // Check if term matches biome
    if (currentBiome.includes(normalized) || normalized.includes(currentBiome)) {
      referencedFacts.push(`biome:${currentBiome}`);
      continue;
    }

    // Check if term is a known entity type (not necessarily nearby)
    if (COMMON_ENTITIES.has(normalized)) {
      // Entity type is known but not in frame — possible fabrication
      if (config.strictEntityMatch && !nearbyEntityKinds.has(normalized)) {
        violations.push({
          type: 'fabricated_entity',
          description: `Referenced entity '${normalized}' not present in nearby entities`,
          trigger: term,
        });
      }
      continue;
    }

    // Check if term is a known biome (not necessarily current)
    if (COMMON_BIOMES.has(normalized)) {
      // Biome is known but not current — possible fabrication
      if (normalized !== currentBiome && !currentBiome.includes(normalized)) {
        violations.push({
          type: 'fabricated_location',
          description: `Referenced biome '${normalized}' does not match current biome '${currentBiome}'`,
          trigger: term,
        });
      }
      continue;
    }

    // Check if term is likely an item name (contains common item suffixes)
    if (isLikelyItemName(normalized)) {
      if (config.strictItemMatch && !inventoryItems.has(normalized) && !itemMatchesInventory(normalized, inventoryItems)) {
        // Item name not in inventory — could be fabricated or just not collected
        // Only flag as violation if we're being strict
        violations.push({
          type: 'fabricated_item',
          description: `Referenced item '${normalized}' not found in inventory`,
          trigger: term,
        });
      }
      continue;
    }

    // Unknown reference — track but don't fail by default (LF-5)
    if (!config.allowUnknownReferences) {
      violations.push({
        type: 'unknown_reference',
        description: `Could not classify reference '${normalized}'`,
        trigger: term,
      });
    }
  }

  // Check for action feasibility based on current state
  const actionViolation = checkActionFeasibility(goal.action, context);
  if (actionViolation) {
    violations.push(actionViolation);
  }

  // Determine pass/fail
  // Only hard violations (fabricated_entity, fabricated_item, fabricated_location, contradiction) cause failure
  // unknown_reference is a warning unless allowUnknownReferences is false
  const hardViolations = violations.filter(v => v.type !== 'unknown_reference');
  const pass = hardViolations.length === 0;

  return {
    pass,
    reason: pass
      ? referencedFacts.length > 0
        ? `Goal grounded with ${referencedFacts.length} fact references`
        : 'Goal grounded (generic action)'
      : `Grounding failed: ${hardViolations.map(v => v.description).join('; ')}`,
    referencedFacts,
    violations,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize item name for comparison (lowercase, strip underscores).
 */
function normalizeItemName(name: string): string {
  return name.toLowerCase().replace(/_/g, '');
}

/**
 * Check if a term matches any item in the inventory (fuzzy match).
 */
function itemMatchesInventory(term: string, inventoryItems: Set<string>): boolean {
  // Check for partial matches (e.g., "wood" matches "oak_wood", "oak_log")
  for (const item of inventoryItems) {
    if (item.includes(term) || term.includes(item)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a term matches any nearby entity (fuzzy match).
 */
function entityMatchesNearby(term: string, nearbyEntityKinds: Set<string>): boolean {
  for (const entity of nearbyEntityKinds) {
    if (entity.includes(term) || term.includes(entity)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a term looks like a Minecraft item name.
 */
function isLikelyItemName(term: string): boolean {
  const itemSuffixes = [
    'log', 'wood', 'planks', 'stick', 'ore', 'ingot', 'block', 'slab', 'stairs',
    'fence', 'door', 'trapdoor', 'button', 'pressure_plate', 'sign', 'torch',
    'pickaxe', 'axe', 'shovel', 'hoe', 'sword', 'helmet', 'chestplate', 'leggings',
    'boots', 'bow', 'arrow', 'shield', 'trident', 'crossbow', 'fishing_rod',
    'bucket', 'shears', 'flint_and_steel', 'compass', 'clock', 'map', 'book',
    'coal', 'iron', 'gold', 'diamond', 'emerald', 'lapis', 'redstone', 'quartz',
    'netherite', 'copper', 'stone', 'cobblestone', 'dirt', 'sand', 'gravel',
  ];

  const termLower = term.toLowerCase();
  return itemSuffixes.some(suffix => termLower.includes(suffix) || suffix.includes(termLower));
}

/**
 * Check if an action is feasible given current state.
 *
 * DELETED (PR3): Predicate switch removed - Sterling validates action feasibility.
 * Keeping only critical state check (health <= 0).
 */
function checkActionFeasibility(action: string, context: GroundingContext): GroundingViolation | null {
  // Check for critical state that might make actions infeasible
  if (context.bot.health <= 0) {
    return {
      type: 'contradiction',
      description: 'Cannot perform action: health is 0 (dead)',
      trigger: action,
    };
  }

  // DELETED (PR3): case 'craft'/case 'smelt' predicate switch
  // Sterling owns action validation - TS only checks critical state (health=0)
  return null;
}

/**
 * Create a grounding context from a ThoughtContext.
 * This adapts the full thought context to the grounding-specific subset.
 */
export function createGroundingContext(thoughtContext: {
  currentState?: {
    health?: number;
    food?: number;
    inventory?: Array<{ name: string; count: number }>;
    position?: { x: number; y: number; z: number };
    biome?: string;
    nearbyHostiles?: number;
    nearbyPassives?: number;
  };
}): GroundingContext {
  const state = thoughtContext.currentState ?? {};

  return {
    bot: {
      health: state.health ?? 20,
      hunger: state.food ?? 20,
      inventory: state.inventory ?? [],
      position: state.position,
    },
    world: {
      biome: state.biome ?? 'unknown',
      nearbyEntities: [], // Would need to be populated from actual entity data
    },
  };
}

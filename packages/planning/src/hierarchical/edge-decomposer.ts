/**
 * Edge Decomposer (E.2)
 *
 * Decomposes macro edges into executable micro steps.
 * Uses a registry pattern: each operator family has a decomposition function.
 * Unknown edge patterns produce explicit 'blocked' with 'decomposition_gap'.
 *
 * @author @darianrosebrook
 */

import type { MacroEdge } from './macro-state';
import type { PlanningDecision, BlockedReason } from '../constraints/planning-decisions';

// ============================================================================
// Types
// ============================================================================

/** A single executable micro step. */
export interface MicroStep {
  /** Action name (e.g., 'navigate', 'dig_block'). */
  readonly action: string;
  /** Leaf label for the execution layer. */
  readonly leaf: string;
  /** Parameters for the leaf execution. */
  readonly params: Record<string, unknown>;
  /** Estimated duration in milliseconds. */
  readonly estimatedDurationMs: number;
}

/** Bot state used for decomposition context. */
export interface BotState {
  /** Current abstract context (e.g., 'at_base'). */
  readonly currentContext: string;
  /** Current inventory. */
  readonly inventory: Record<string, number>;
  /** Tools the bot currently has. */
  readonly tools: readonly string[];
}

/** Decomposition function signature. */
export type DecomposeFn = (
  edge: MacroEdge,
  botState: BotState,
) => MicroStep[];

// ============================================================================
// Decomposition Registry
// ============================================================================

/**
 * Registry of edge pattern → decomposition function.
 * Pattern matching is by (from, to) context ID prefix pairs.
 */
export const DECOMPOSITION_REGISTRY = new Map<string, DecomposeFn>();

/**
 * Register a decomposition function for a (from, to) pattern.
 * Pattern key format: "${fromPrefix}→${toPrefix}".
 */
export function registerDecomposition(
  fromPrefix: string,
  toPrefix: string,
  fn: DecomposeFn,
): void {
  DECOMPOSITION_REGISTRY.set(`${fromPrefix}→${toPrefix}`, fn);
}

// ── Default Decompositions ───────────────────────────────────────────

// Navigation: at_* → at_*
registerDecomposition('at_', 'at_', (edge, botState) => [
  {
    action: 'navigate',
    leaf: 'navigate_to',
    params: { targetContext: edge.to },
    estimatedDurationMs: edge.learnedCost * 1000,
  },
  {
    action: 'arrive',
    leaf: 'arrive_at',
    params: { context: edge.to },
    estimatedDurationMs: 500,
  },
]);

// Resource acquisition: at_mine → has_stone
registerDecomposition('at_mine', 'has_stone', (edge, botState) => [
  {
    action: 'equip_tool',
    leaf: 'equip',
    params: { tool: 'pickaxe' },
    estimatedDurationMs: 1000,
  },
  {
    action: 'dig_stone',
    leaf: 'dig_block',
    params: { blockType: 'stone' },
    estimatedDurationMs: 5000,
  },
  {
    action: 'collect_drops',
    leaf: 'collect_items',
    params: { item: 'cobblestone' },
    estimatedDurationMs: 2000,
  },
]);

// Resource acquisition: at_forest → has_wood
registerDecomposition('at_forest', 'has_wood', (edge, botState) => [
  {
    action: 'chop_tree',
    leaf: 'dig_block',
    params: { blockType: 'oak_log' },
    estimatedDurationMs: 4000,
  },
  {
    action: 'collect_wood',
    leaf: 'collect_items',
    params: { item: 'oak_log' },
    estimatedDurationMs: 2000,
  },
]);

// Resource acquisition: at_mine → has_iron
registerDecomposition('at_mine', 'has_iron', (edge, botState) => [
  {
    action: 'equip_pickaxe',
    leaf: 'equip',
    params: { tool: 'stone_pickaxe' },
    estimatedDurationMs: 1000,
  },
  {
    action: 'mine_iron',
    leaf: 'dig_block',
    params: { blockType: 'iron_ore' },
    estimatedDurationMs: 8000,
  },
  {
    action: 'collect_ore',
    leaf: 'collect_items',
    params: { item: 'raw_iron' },
    estimatedDurationMs: 2000,
  },
]);

// Tool crafting: has_* → has_tools
registerDecomposition('has_', 'has_tools', (edge, botState) => [
  {
    action: 'craft_tools',
    leaf: 'craft_recipe',
    params: { recipe: 'tools' },
    estimatedDurationMs: 3000,
  },
]);

// Building: at_build_site → shelter_built
registerDecomposition('at_build_site', 'shelter_built', (edge, botState) => [
  {
    action: 'build_shelter',
    leaf: 'place_block',
    params: { structure: 'shelter' },
    estimatedDurationMs: 10000,
  },
]);

// Idle → at_base
registerDecomposition('idle', 'at_base', (edge, botState) => [
  {
    action: 'go_to_base',
    leaf: 'navigate_to',
    params: { targetContext: 'at_base' },
    estimatedDurationMs: 1000,
  },
]);

// ============================================================================
// Decomposer
// ============================================================================

/**
 * Decompose a macro edge into executable micro steps.
 *
 * Tries exact match first, then prefix matching.
 * Returns blocked with 'decomposition_gap' if no match found.
 */
export function decomposeEdge(
  edge: MacroEdge,
  botState: BotState,
): PlanningDecision<MicroStep[]> {
  // Try exact match
  const exactKey = `${edge.from}→${edge.to}`;
  const exactFn = DECOMPOSITION_REGISTRY.get(exactKey);
  if (exactFn) {
    return { kind: 'ok', value: exactFn(edge, botState) };
  }

  // Try prefix matching
  for (const [pattern, fn] of DECOMPOSITION_REGISTRY) {
    const [fromPrefix, toPrefix] = pattern.split('→');
    if (edge.from.startsWith(fromPrefix) && edge.to.startsWith(toPrefix)) {
      return { kind: 'ok', value: fn(edge, botState) };
    }
  }

  // No match: blocked with decomposition_gap
  return {
    kind: 'blocked',
    reason: 'ontology_gap' as BlockedReason,
    detail: `No decomposition registered for edge ${edge.from}→${edge.to} (decomposition_gap)`,
  };
}

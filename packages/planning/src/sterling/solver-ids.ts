/**
 * Centralized Solver ID Constants
 *
 * Single source of truth for solver ID strings used across:
 * - Solver class definitions (solverId field)
 * - Solver registry lookups (getSolver calls)
 * - Episode reporting (solverId guard checks)
 * - Compat linter context checks
 * - Test fixtures
 *
 * This prevents "string drift" where the same solver ID is spelled
 * differently in producer vs planner vs reporter.
 *
 * @author @darianrosebrook
 */

/**
 * Canonical solver IDs for Minecraft domain solvers.
 *
 * Use these constants instead of string literals to ensure consistency
 * across the codebase and enable compile-time detection of typos.
 */
export const SOLVER_IDS = {
  /** Building module placement and DAG constraints (Rig G) */
  BUILDING: 'minecraft.building',

  /** Recipe crafting from inventory (Rig A) */
  CRAFTING: 'minecraft.crafting',

  /** Tool tier progression: wooden → stone → iron → diamond (Rig B) */
  TOOL_PROGRESSION: 'minecraft.tool_progression',

  /** Multi-strategy resource acquisition: mine/craft/trade/loot/salvage (Rig D) */
  ACQUISITION: 'minecraft.acquisition',

  /** Furnace scheduling with duration constraints (Rig C) */
  FURNACE: 'minecraft.furnace',

  /** Navigation and pathfinding (Rig E) */
  NAVIGATION: 'minecraft.navigation',
} as const;

/**
 * Type-safe solver ID union derived from SOLVER_IDS values.
 * Use this for type annotations to ensure only valid solver IDs are accepted.
 */
export type SolverId = (typeof SOLVER_IDS)[keyof typeof SOLVER_IDS];

/**
 * Check if a string is a valid SolverId.
 * Useful for runtime validation of solver IDs from external sources.
 */
export function isValidSolverId(id: string): id is SolverId {
  return Object.values(SOLVER_IDS).includes(id as SolverId);
}

/**
 * Strategy-specific solver ID prefix for acquisition sub-solvers.
 * Format: 'minecraft.acquisition.<strategy>'
 *
 * @example
 * getAcquisitionStrategySolverId('trade') // 'minecraft.acquisition.trade'
 */
export function getAcquisitionStrategySolverId(
  strategy: 'mine' | 'craft' | 'trade' | 'loot' | 'salvage',
): string {
  return `${SOLVER_IDS.ACQUISITION}.${strategy}`;
}

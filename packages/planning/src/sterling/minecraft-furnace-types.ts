/**
 * Minecraft Furnace Scheduling Domain Type Definitions
 *
 * Types for furnace scheduling: time-discretized state, slot occupancy,
 * and solve results. Extends P03 capsule types with Minecraft-specific
 * furnace semantics.
 *
 * @author @darianrosebrook
 */

import type {
  P03ResourceSlotV1,
  P03TimeStateV1,
  P03PlannedStepV1,
} from './primitives/p03/p03-capsule-types';
import type { SolveBundle } from './index';

// ============================================================================
// Furnace Slot State (extends P03ResourceSlotV1)
// ============================================================================

/**
 * Furnace-specific slot state extending P03ResourceSlotV1 with
 * occupancy tracking for schedule verification.
 */
export interface FurnaceSlotState extends P03ResourceSlotV1 {
  /** Item currently being smelted (undefined if idle). */
  readonly currentItem?: string;
  /** Remaining fuel in ticks (undefined if not tracked). */
  readonly fuelRemaining?: number;
  /** Smelting progress in ticks (undefined if idle). */
  readonly smeltProgress?: number;
}

// ============================================================================
// Furnace Search State
// ============================================================================

/**
 * Complete furnace scheduling search state.
 * Hashed for SolveBundle identity — excludes nondeterministic runtime fields.
 */
export interface FurnaceSearchState {
  /** Temporal state: current time and horizon. */
  readonly time: P03TimeStateV1;
  /** Furnace slot occupancy. */
  readonly slots: readonly FurnaceSlotState[];
  /** Current inventory (items available for smelting). */
  readonly inventory: Record<string, number>;
  /** Items already completed (for goal tracking). */
  readonly completedItems: Record<string, number>;
}

// ============================================================================
// Furnace Scheduling Rule
// ============================================================================

/**
 * A furnace scheduling rule: one of four operator families.
 *
 * Operator families:
 * - load_furnace → mapped to Sterling 'craft' action type
 * - add_fuel → mapped to Sterling 'craft' action type
 * - wait_tick → mapped to Sterling 'smelt' action type
 * - retrieve_output → mapped to Sterling 'craft' action type
 */
export type FurnaceOperatorFamily =
  | 'load_furnace'
  | 'add_fuel'
  | 'wait_tick'
  | 'retrieve_output';

export interface FurnaceSchedulingRule {
  /** Action ID (e.g., 'furnace:load:iron_ore'). */
  action: string;
  /** Sterling action type mapping. */
  actionType: 'craft' | 'smelt';
  /** Operator family. */
  operatorFamily: FurnaceOperatorFamily;
  /** Items produced by this rule. */
  produces: Array<{ name: string; count: number }>;
  /** Items consumed by this rule. */
  consumes: Array<{ name: string; count: number }>;
  /** Invariant-style requirements (consume+produce pairs). */
  requires: Array<{ name: string; count: number }>;
  /** Whether a crafting table is needed. */
  needsTable: boolean;
  /** Whether a furnace is needed. */
  needsFurnace: boolean;
  /** Base cost for A* search. */
  baseCost: number;
  /** Duration in ticks (for temporal scheduling). */
  durationTicks: number;
  /** Slot type required (e.g., 'furnace'). */
  requiresSlotType?: string;
  /** Target slot ID (when scheduling to a specific slot). */
  targetSlotId?: string;
}

// ============================================================================
// Furnace Solve Step
// ============================================================================

/** A single step in the furnace scheduling solution path. */
export interface FurnaceSolveStep {
  /** Action ID. */
  action: string;
  /** Sterling action type. */
  actionType: 'craft' | 'smelt';
  /** Operator family. */
  operatorFamily: FurnaceOperatorFamily;
  /** Items produced. */
  produces: Array<{ name: string; count: number }>;
  /** Items consumed. */
  consumes: Array<{ name: string; count: number }>;
  /** Assigned slot ID (if applicable). */
  slotId?: string;
  /** Scheduled step timing (if temporal mode). */
  schedule?: P03PlannedStepV1;
}

// ============================================================================
// Furnace Solve Result
// ============================================================================

/** Full result from the furnace scheduling solver. */
export interface FurnaceSchedulingSolveResult {
  solved: boolean;
  steps: FurnaceSolveStep[];
  totalNodes: number;
  durationMs: number;
  error?: string;
  /** Sterling planId for episode reporting. */
  planId?: string | null;
  /** Observability metadata — does not affect solve behavior. */
  solveMeta?: { bundles: SolveBundle[] };
  /** Total makespan in buckets (if temporal scheduling). */
  makespanBuckets?: number;
  /** Whether batch operators were used. */
  usedBatch?: boolean;
  /** Solve-time join keys for deferred episode reporting */
  solveJoinKeys?: import('./solve-bundle-types').SolveJoinKeys;
}

// ============================================================================
// Episode Reporting
// ============================================================================

/** Execution feedback sent back to Sterling for learning. */
export interface FurnaceEpisodeReport {
  planId: string;
  /** Items that were to be smelted. */
  goalItems: Record<string, number>;
  success: boolean;
  /** Number of items actually smelted. */
  itemsSmelted: number;
  /** Reason for failure (if any). */
  failureReason?: string;
}

// ============================================================================
// Hash Exclusion Contract
// ============================================================================

/**
 * Fields excluded from FurnaceSearchState hash computation.
 * These are nondeterministic or runtime-only fields.
 */
export const FURNACE_HASH_EXCLUDED_FIELDS = [
  'fuelRemaining',
  'smeltProgress',
  'timestamp',
] as const;

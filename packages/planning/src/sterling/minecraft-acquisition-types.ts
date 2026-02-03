/**
 * Minecraft Acquisition Domain Type Definitions (Rig D)
 *
 * Multi-strategy acquisition solver types. The acquisition solver is a
 * coordinator that delegates to sub-solvers (crafting, macro planner)
 * per strategy. Strategies: mine, trade, loot, salvage.
 *
 * Key design:
 * - AcquisitionContextV1: coarsely bucketed world state (no raw coords)
 * - CandidateSetDigest: content-addressed hash of enumerated strategies
 * - Learning changes ranking/selection, never the candidate set
 *
 * @author @darianrosebrook
 */

import { canonicalize, contentHash } from './solve-bundle';
import type { SolveBundle } from './solve-bundle-types';

// ============================================================================
// Strategy Types
// ============================================================================

/** Available acquisition strategies */
export type AcquisitionStrategy = 'mine' | 'trade' | 'loot' | 'salvage';

/** Feasibility assessment for a strategy in the current context */
export type AcquisitionFeasibility = 'available' | 'possible' | 'unknown';

// ============================================================================
// Acquisition Context
// ============================================================================

/**
 * Coarsely bucketed world state for the acquisition solver.
 *
 * Raw entity IDs and coordinates are unstable. Instead, the solver operates
 * on bucketed context: boolean presence flags and distance buckets.
 * This produces stable hashes under entity ID churn and coordinate noise.
 */
export interface AcquisitionContextV1 {
  /** Target item to acquire */
  readonly targetItem: string;
  /** Any matching ore block in nearbyBlocks */
  readonly oreNearby: boolean;
  /** Villager present AND trade table has item */
  readonly villagerTradeAvailable: boolean;
  /** 0, 1, or 2+ known chests nearby */
  readonly knownChestCountBucket: 0 | 1 | 2;
  /** Coarse distance bucket: 0=none, 1=close (<16), 2=medium (<64), 3=far (>=64) */
  readonly distBucket_villager: number;
  /** Coarse distance bucket for nearest chest */
  readonly distBucket_chest: number;
  /** Coarse distance bucket for nearest ore */
  readonly distBucket_ore: number;
  /** Existing hashInventoryState() output */
  readonly inventoryHash: string;
  /** Highest cap:has_*_pickaxe token held (undefined if none) */
  readonly toolTierCap: string | undefined;
}

// ============================================================================
// Acquisition Candidate
// ============================================================================

/** A single acquisition strategy candidate with cost estimate and feasibility */
export interface AcquisitionCandidate {
  /** Which strategy this candidate represents */
  strategy: AcquisitionStrategy;
  /** Target item */
  item: string;
  /** Estimated cost (lower is better) */
  estimatedCost: number;
  /** Feasibility in current context */
  feasibility: AcquisitionFeasibility;
  /** Items/tokens required for this strategy */
  requires: string[];
  /** Snapshot of the context when this candidate was built */
  contextSnapshot: AcquisitionContextV1;
}

// ============================================================================
// Acquisition Solve Result
// ============================================================================

/** Full result from the acquisition solver */
export interface AcquisitionSolveResult {
  solved: boolean;
  steps: AcquisitionSolveStep[];
  totalNodes: number;
  durationMs: number;
  error?: string;
  /** Sterling planId for episode reporting */
  planId?: string | null;
  /** Observability metadata */
  solveMeta?: { bundles: SolveBundle[] };
  /**
   * Content-addressed ID of the parent (coordinator) bundle.
   * First-class field so callers don't need to index into bundles[0].
   */
  parentBundleId?: string;
  /** The strategy that was selected and executed */
  selectedStrategy: AcquisitionStrategy | null;
  /** Strategies that were viable but not selected */
  alternativeStrategies: AcquisitionStrategy[];
  /** Ordered ranking of all candidates (best first) */
  strategyRanking: AcquisitionCandidate[];
  /** Content-addressed hash of the full enumerated candidate set */
  candidateSetDigest: string;
  /** Solve-time join keys for deferred episode reporting */
  solveJoinKeys?: import('./solve-bundle-types').SolveJoinKeys;
}

/** A single step in the acquisition solution */
export interface AcquisitionSolveStep {
  action: string;
  actionType: string;
  produces: Array<{ name: string; count: number }>;
  consumes: Array<{ name: string; count: number }>;
  resultingInventory: Record<string, number>;
}

// ============================================================================
// Strategy Priors (Learning)
// ============================================================================

/** Prior belief about a strategy's success rate in a given context */
export interface StrategyPrior {
  strategy: AcquisitionStrategy;
  contextKey: string;
  successRate: number;
  sampleCount: number;
}

/** Minimum prior success rate (never drops below this) */
export const PRIOR_MIN = 0.05;

/** Maximum prior success rate (never exceeds this) */
export const PRIOR_MAX = 0.95;

// ============================================================================
// Episode Reporting
// ============================================================================

/** Episode report for acquisition solver learning */
export interface AcquisitionEpisodeReport {
  strategy: AcquisitionStrategy;
  item: string;
  contextKey: string;
  success: boolean;
  planId: string;
  candidateSetDigest: string;
}

// ============================================================================
// Hashing Utilities
// ============================================================================

/**
 * Hash an AcquisitionContextV1 to a deterministic string.
 *
 * Uses canonicalize() + contentHash() — sorted keys, no coordinates,
 * deterministic. Same context → same hash. Different bucketed values
 * → different hash. Raw coordinate changes within same bucket → same hash.
 */
export function hashAcquisitionContext(ctx: AcquisitionContextV1): string {
  return contentHash(canonicalize(ctx));
}

/**
 * Compute a content-addressed digest of the full enumerated candidate set.
 *
 * Candidates are sorted by (strategy, item, feasibility) before hashing
 * so that reordering does not change the digest. This is the semantic
 * boundary for M1: learning changes ranking, never the candidate set.
 *
 * The digest includes: strategy, item, estimatedCost, feasibility, requires,
 * and the contextSnapshot hash.
 */
/**
 * Environment-insensitive lexicographic string comparison.
 * Avoids localeCompare which can vary across ICU/locale data.
 */
function lexCmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Quantize a cost to integer (millicost) for deterministic comparison.
 * Guards against NaN (sorted to end) and floating-point rounding.
 */
function costToMillis(cost: number): number {
  if (Number.isNaN(cost) || !Number.isFinite(cost)) return Number.MAX_SAFE_INTEGER;
  return Math.round(cost * 1000);
}

export function computeCandidateSetDigest(candidates: AcquisitionCandidate[]): string {
  // Sort a copy by fully deterministic key: strategy, item, feasibility, quantized cost, requires.
  // Uses simple lexicographic comparison (not localeCompare) for cross-environment stability.
  const sorted = [...candidates].sort((a, b) => {
    const cmp1 = lexCmp(a.strategy, b.strategy);
    if (cmp1 !== 0) return cmp1;
    const cmp2 = lexCmp(a.item, b.item);
    if (cmp2 !== 0) return cmp2;
    const cmp3 = lexCmp(a.feasibility, b.feasibility);
    if (cmp3 !== 0) return cmp3;
    const cmp4 = costToMillis(a.estimatedCost) - costToMillis(b.estimatedCost);
    if (cmp4 !== 0) return cmp4;
    // Final tiebreaker: sorted requires array as string
    const reqA = [...a.requires].sort().join(',');
    const reqB = [...b.requires].sort().join(',');
    return lexCmp(reqA, reqB);
  });

  // Build a stable representation for hashing.
  // Cost is quantized to integer millicost for deterministic canonicalization.
  const digestInput = sorted.map(c => ({
    strategy: c.strategy,
    item: c.item,
    estimatedCostMillis: costToMillis(c.estimatedCost),
    feasibility: c.feasibility,
    requires: [...c.requires].sort(),
    contextHash: hashAcquisitionContext(c.contextSnapshot),
  }));

  return contentHash(canonicalize(digestInput));
}

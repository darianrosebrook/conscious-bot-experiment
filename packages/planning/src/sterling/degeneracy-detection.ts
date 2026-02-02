/**
 * Degeneracy Detection (M2-a instrumentation)
 *
 * Detects when top strategies have near-equal costs, indicating the solver
 * cannot meaningfully discriminate. This is the diagnostic that proves
 * M2-b (dependency-aware lower bounds in Sterling A* heuristic) is needed.
 *
 * Scope: M2-a is instrumentation only. M2-b (the heuristic fix targeting
 * hVariance increase and pctSameH decrease) is a separate Python-side effort.
 *
 * @author @darianrosebrook
 */

import type { AcquisitionCandidate } from './minecraft-acquisition-types';

// ============================================================================
// Types
// ============================================================================

export interface StrategyDegeneracyReport {
  /** Whether the ranking is degenerate (top strategies tied) */
  isDegenerate: boolean;
  /** Number of strategies within epsilon of the top cost */
  tiedCount: number;
  /** Spread between cheapest and most expensive strategy (0 = all equal) */
  costSpread: number;
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Detect strategy degeneracy in a ranked candidate set.
 *
 * Degenerate when top N strategies have cost within `epsilon * topCost`
 * of each other. This means the solver's cost model cannot meaningfully
 * prefer one strategy over another.
 *
 * @param candidates - Ranked candidates (best first)
 * @param epsilon - Tolerance factor (default 0.1 = 10% of top cost)
 */
export function detectStrategyDegeneracy(
  candidates: AcquisitionCandidate[],
  epsilon = 0.1,
): StrategyDegeneracyReport {
  if (candidates.length <= 1) {
    return {
      isDegenerate: false,
      tiedCount: candidates.length,
      costSpread: 0,
    };
  }

  const topCost = candidates[0].estimatedCost;
  const bottomCost = candidates[candidates.length - 1].estimatedCost;
  const costSpread = bottomCost - topCost;

  // Count how many strategies are within epsilon of the top
  const threshold = topCost === 0 ? 0 : topCost * epsilon;
  let tiedCount = 1;
  for (let i = 1; i < candidates.length; i++) {
    if (Math.abs(candidates[i].estimatedCost - topCost) <= threshold) {
      tiedCount++;
    }
  }

  return {
    isDegenerate: tiedCount > 1,
    tiedCount,
    costSpread,
  };
}

/**
 * Rig D Signals — Diagnostic signals for acquisition solver observability.
 *
 * @author @darianrosebrook
 */

import type {
  AcquisitionSolveResult,
  AcquisitionCandidate,
} from './minecraft-acquisition-types';
import type { StrategyPriorStore } from './minecraft-acquisition-priors';
import { contextKeyFromAcquisitionContext } from './minecraft-acquisition-rules';

// ============================================================================
// Signal Types
// ============================================================================

export interface RigDSignals {
  /** Number of enumerated strategies */
  strategyCount: number;
  /** The strategy that was selected */
  selectedStrategy: string | null;
  /** Number of alternatives (not selected) */
  alternativeCount: number;
  /** Whether a prior update occurred in this solve */
  priorUpdated: boolean;
  /** Context key for the world state */
  contextKey: string;
  /** Content-addressed hash of the candidate set */
  candidateSetDigest: string;
  /** Whether the ranking is degenerate (top strategies tied) */
  degenerateRanking: boolean;
}

// ============================================================================
// Signal Computation
// ============================================================================

/**
 * Compute Rig D diagnostic signals from an acquisition solve result.
 */
export function computeRigDSignals(
  result: AcquisitionSolveResult,
  priorStore?: StrategyPriorStore,
): RigDSignals {
  const contextKey = result.strategyRanking.length > 0
    ? contextKeyFromAcquisitionContext(result.strategyRanking[0].contextSnapshot)
    : '';

  const degenerateRanking = detectRankingDegeneracy(result.strategyRanking);

  const priorUpdated = priorStore
    ? priorStore.size > 0
    : false;

  return {
    strategyCount: result.strategyRanking.length,
    selectedStrategy: result.selectedStrategy,
    alternativeCount: result.alternativeStrategies.length,
    priorUpdated,
    contextKey,
    candidateSetDigest: result.candidateSetDigest,
    degenerateRanking,
  };
}

/**
 * Detect whether the strategy ranking is degenerate (top strategies tied).
 */
function detectRankingDegeneracy(
  ranking: AcquisitionCandidate[],
  epsilon = 0.1,
): boolean {
  if (ranking.length < 2) return false;
  const topCost = ranking[0].estimatedCost;
  if (topCost === 0) return ranking.length > 1;
  const threshold = topCost * epsilon;
  let tiedCount = 1;
  for (let i = 1; i < ranking.length; i++) {
    if (Math.abs(ranking[i].estimatedCost - topCost) <= threshold) {
      tiedCount++;
    }
  }
  return tiedCount > 1;
}

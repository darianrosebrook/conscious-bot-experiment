/**
 * Rig G Execution Advisor — advises whether a plan should proceed based on
 * Rig G metadata (feasibility, parallelism, commuting pairs).
 *
 * Fail-closed on unknown metadata versions: if the consumer sees a version
 * it doesn't understand, it blocks and requests re-solve.
 *
 * @author @darianrosebrook
 */

import type { RigGSignals } from './partial-order-plan';
import type { CommutingPair } from './dag-builder';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RigGMetadata {
  version: number;
  signals: RigGSignals;
  commutingPairs: CommutingPair[];
  partialOrderPlan?: unknown;
  computedAt: number;
}

export interface ExecutionAdvice {
  shouldProceed: boolean;
  blockReason?: string;
  suggestedParallelism: number;
  reorderableStepPairs: CommutingPair[];
  shouldReplan: boolean;
  replanReason?: string;
}

// ---------------------------------------------------------------------------
// Advisor
// ---------------------------------------------------------------------------

const CURRENT_VERSION = 1;

/**
 * Advise on execution readiness given Rig G metadata.
 *
 * - Unknown version → fail-closed (block + replan)
 * - Feasibility failed → block + replan with rejection reasons
 * - Feasibility passed → proceed with suggested parallelism from ready-set size
 */
export function adviseExecution(rigGMeta: RigGMetadata): ExecutionAdvice {
  // Fail-closed on unknown version
  if (rigGMeta.version !== CURRENT_VERSION) {
    return {
      shouldProceed: false,
      blockReason: `Unknown rigG metadata version: ${rigGMeta.version}`,
      suggestedParallelism: 1,
      reorderableStepPairs: [],
      shouldReplan: true,
      replanReason: 'rigG metadata version mismatch — re-solve required',
    };
  }

  // Feasibility gate
  if (!rigGMeta.signals.feasibility_passed) {
    const rejections = Object.keys(rigGMeta.signals.feasibility_rejections);
    return {
      shouldProceed: false,
      blockReason: `Feasibility failed: ${rejections.join(', ')}`,
      suggestedParallelism: 1,
      reorderableStepPairs: [],
      shouldReplan: true,
      replanReason: `Infeasible plan: ${rejections.join(', ')}`,
    };
  }

  // Feasibility passed — compute parallelism from ready-set size
  const suggestedParallelism = Math.min(
    3,
    Math.max(1, Math.floor(rigGMeta.signals.ready_set_size_mean))
  );

  return {
    shouldProceed: true,
    suggestedParallelism,
    reorderableStepPairs: rigGMeta.commutingPairs,
    shouldReplan: false,
  };
}

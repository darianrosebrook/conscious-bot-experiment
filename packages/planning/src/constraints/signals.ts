/**
 * Rig G Signal Computation
 *
 * Collects instrumentation signals from partial-order plan analysis:
 * DAG metrics, linearization quality, feasibility results, commuting pairs.
 *
 * @author @darianrosebrook
 */

import type { PartialOrderPlan, RigGSignals } from './partial-order-plan';
import type { LinearizationResult } from './linearization';
import type { FeasibilityResult } from './feasibility-checker';
import type { CommutingPair } from './dag-builder';

export interface ComputeRigGSignalsInput<T = unknown> {
  plan: PartialOrderPlan<T>;
  linearization: LinearizationResult<T>;
  feasibility?: FeasibilityResult;
  commutingPairs: CommutingPair[];
  /** Whether Rig G degraded to raw step order (DAG/linearization failed) */
  degradedToRawSteps?: boolean;
}

/**
 * Compute all Rig G instrumentation signals from plan analysis results.
 */
export function computeRigGSignals<T>(
  input: ComputeRigGSignalsInput<T>
): RigGSignals {
  const { plan, linearization, feasibility, commutingPairs } = input;

  const readySizes = linearization.readySetSizes;
  const mean =
    readySizes.length > 0
      ? readySizes.reduce((a, b) => a + b, 0) / readySizes.length
      : 0;
  const p95 = computeP95(readySizes);

  const rejections: Record<string, number> = {};
  if (feasibility) {
    for (const v of feasibility.violations) {
      rejections[v.type] = (rejections[v.type] ?? 0) + 1;
    }
  }

  return {
    dag_node_count: plan.nodes.length,
    dag_edge_count: plan.edges.length,
    ready_set_size_mean: Math.round(mean * 100) / 100,
    ready_set_size_p95: p95,
    commuting_pair_count: commutingPairs.length,
    feasibility_passed: feasibility ? feasibility.feasible : true,
    feasibility_rejections: rejections,
    linearization_digest: linearization.linearizationDigest,
    plan_digest: plan.planDigest,
    degraded_to_raw_steps: input.degradedToRawSteps ?? false,
  };
}

/** Compute the 95th percentile of an array of numbers. */
function computeP95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

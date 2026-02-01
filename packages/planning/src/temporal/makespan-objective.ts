/**
 * Temporal Makespan Objective — Schedule Cost Helpers
 *
 * Delegates makespan computation to the adapter (conformance-proven)
 * and provides a pure temporal cost helper for future A* integration.
 * No A* coupling yet — Phase 3 decides where to apply weighting.
 */

import type {
  P03TemporalAdapter,
  P03PlannedStepV1,
} from '../sterling/primitives/p03/p03-capsule-types';

// ── Makespan ───────────────────────────────────────────────────────

/**
 * Compute the makespan of a schedule.
 * Delegates to the adapter's conformance-proven computeMakespan.
 */
export function computeMakespan(
  adapter: P03TemporalAdapter,
  steps: readonly P03PlannedStepV1[],
): number {
  return adapter.computeMakespan(steps);
}

// ── Temporal Cost ──────────────────────────────────────────────────

export interface TemporalCost {
  /** Base action cost (from rule). */
  readonly actionCost: number;
  /** Time cost contribution (from duration). */
  readonly timeCost: number;
  /** Weighted sum of action and time costs. */
  readonly totalCost: number;
}

/**
 * Compute a blended cost that includes both action cost and time cost.
 *
 * The timeWeight parameter (0–1) controls how much duration influences
 * the total cost. At timeWeight=0, cost is purely action-based (current
 * behavior). At timeWeight=1, cost is purely time-based.
 *
 * Pure function — no side effects.
 */
export function computeTemporalCost(
  baseCost: number,
  durationTicks: number,
  timeWeight: number = 0.3,
): TemporalCost {
  const actionCost = baseCost;
  const timeCost = durationTicks;
  const totalCost = actionCost * (1 - timeWeight) + timeCost * timeWeight;
  return { actionCost, timeCost, totalCost };
}

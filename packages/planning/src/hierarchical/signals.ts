/**
 * Rig E Signal Computation
 *
 * Collects instrumentation signals from hierarchical macro/micro planning:
 * macro plan metrics, context coverage, feedback store state, session metrics.
 *
 * @author @darianrosebrook
 */

import type { MacroPlan, MacroStateGraph, MacroEdgeSession } from './macro-state';
import type { FeedbackStore } from './feedback';

// ============================================================================
// Signal Types
// ============================================================================

export interface RigESignals {
  /** Whether both MacroPlanner and FeedbackStore are wired at runtime */
  readonly runtime_configured: boolean;
  /** Whether macro state uses coordinate-like context IDs (should always be false) */
  readonly macro_state_has_coordinates: boolean;
  /** Number of contexts in the registry */
  readonly context_count: number;
  /** Number of edges in the graph */
  readonly edge_count: number;
  /** Number of registered contexts actually used in the current plan */
  readonly contexts_used_in_plan: number;
  /** Macro plan depth (number of edges in the plan) */
  readonly macro_plan_depth: number;
  /** Total estimated cost of the macro plan */
  readonly macro_plan_total_cost: number;
  /** Plan digest for determinism verification */
  readonly macro_plan_digest: string;
  /** Whether costs were updated during planning (should be false) */
  readonly cost_store_updated_during_planning: boolean;
  /** Whether costs were updated on micro outcome (should be true after feedback) */
  readonly cost_store_updated_on_micro_outcome: boolean;
  /** Whether topology changed after feedback (should always be false) */
  readonly topology_changed: boolean;
  /** Number of micro invocations per macro step (should be 1) */
  readonly micro_invocations_per_macro_step: number;
  /** Whether replan was triggered */
  readonly replan_triggered: boolean;
  /** Number of violations recorded */
  readonly violation_count: number;
}

// ============================================================================
// Signal Collection
// ============================================================================

export interface CollectRigESignalsInput {
  graph: MacroStateGraph;
  plan?: MacroPlan;
  feedbackStore: FeedbackStore;
  /** Number of outcomes reported (for micro_invocations_per_macro_step) */
  outcomesReported: number;
  /** Whether any cost was updated on a micro outcome */
  costUpdatedOnOutcome: boolean;
  /** Whether replan was triggered at any point */
  replanTriggered: boolean;
  /** Whether both MacroPlanner and FeedbackStore are wired at runtime */
  runtimeConfigured?: boolean;
}

/**
 * Detect whether any context ID looks like it contains coordinates
 * (e.g. "x:100,z:200" or "pos_123_456"). This catches registry bypass
 * or injection of raw coordinate strings that should be abstract contexts.
 *
 * Heuristic: a context ID is suspicious if it contains 3+ consecutive digits
 * or matches coordinate-like patterns (x:N, y:N, z:N, comma-separated numbers).
 */
function looksLikeCoordinate(contextId: string): boolean {
  // 3+ consecutive digits (e.g., "pos_123" or "node_1000")
  if (/\d{3,}/.test(contextId)) return true;
  // Coordinate-like patterns: x:N, y:N, z:N (case insensitive)
  if (/[xyz]:\s*-?\d/i.test(contextId)) return true;
  // Comma-separated number pairs (e.g., "100,200" or "-50,30")
  if (/-?\d+\s*,\s*-?\d+/.test(contextId)) return true;
  return false;
}

/**
 * Compute all Rig E instrumentation signals.
 */
export function collectRigESignals(
  input: CollectRigESignalsInput
): RigESignals {
  const {
    graph,
    plan,
    feedbackStore,
    outcomesReported,
    costUpdatedOnOutcome,
    replanTriggered,
    runtimeConfigured,
  } = input;

  const contextsInPlan = new Set<string>();
  if (plan) {
    contextsInPlan.add(plan.start);
    contextsInPlan.add(plan.goal);
    for (const edge of plan.edges) {
      contextsInPlan.add(edge.from);
      contextsInPlan.add(edge.to);
    }
  }

  // Defensively scan all context IDs actually used in plan AND in the graph
  // registry. Don't trust that the registry is clean — check actual data.
  const allContextIds = new Set<string>();
  for (const ctx of graph.registry.getAll()) {
    allContextIds.add(ctx.id);
  }
  for (const edge of graph.edges) {
    allContextIds.add(edge.from);
    allContextIds.add(edge.to);
  }
  for (const id of contextsInPlan) {
    allContextIds.add(id);
  }
  const hasCoordinates = [...allContextIds].some(looksLikeCoordinate);

  const macroStepCount = plan ? plan.edges.length : 0;
  const microInvocationsPerMacroStep =
    macroStepCount > 0 ? outcomesReported / macroStepCount : 0;

  return {
    runtime_configured: runtimeConfigured ?? false,
    macro_state_has_coordinates: hasCoordinates,
    context_count: graph.registry.size,
    edge_count: graph.edges.length,
    contexts_used_in_plan: contextsInPlan.size,
    macro_plan_depth: macroStepCount,
    macro_plan_total_cost: plan?.totalCost ?? 0,
    macro_plan_digest: plan?.planDigest ?? '',
    cost_store_updated_during_planning:
      feedbackStore.getViolations().length > 0,
    cost_store_updated_on_micro_outcome: costUpdatedOnOutcome,
    topology_changed: feedbackStore.getTopologyChanged(graph),
    micro_invocations_per_macro_step: Math.round(microInvocationsPerMacroStep * 100) / 100,
    replan_triggered: replanTriggered,
    violation_count: feedbackStore.getViolations().length,
  };
}

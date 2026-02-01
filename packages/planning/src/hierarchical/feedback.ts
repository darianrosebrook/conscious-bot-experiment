/**
 * Feedback Store — Macro Cost Updates from Micro Execution
 *
 * Updates macro edge costs via EMA when micro execution outcomes
 * are reported. Tracks consecutive failures for replan decisions.
 *
 * Re-entrant planning guard: uses a depth counter (not boolean).
 * Planning is active when depth > 0. Cost updates during planning
 * are recorded as violations.
 *
 * INVARIANT: feedback only mutates learnedCost and consecutiveFailures,
 * never adds/removes edges/nodes (topology unchanged).
 *
 * @author @darianrosebrook
 */

import type { MacroEdge, MacroStateGraph, MicroOutcome } from './macro-state';
import { COST_LEARNING_RATE, DEFAULT_REPLAN_THRESHOLD } from './macro-state';

// ============================================================================
// Types
// ============================================================================

export interface CostUpdate {
  readonly edgeId: string;
  readonly previousCost: number;
  readonly newCost: number;
  readonly consecutiveFailures: number;
}

export interface ReplanDecision {
  readonly shouldReplan: boolean;
  readonly reason: string;
  readonly consecutiveFailures: number;
  readonly threshold: number;
}

export interface PlanningViolation {
  readonly edgeId: string;
  readonly plannerPhase: string;
  readonly depth: number;
  readonly callsite: string;
  readonly timestamp: number;
}

// ============================================================================
// Feedback Store
// ============================================================================

/** A queued outcome that arrived during a planning phase. */
interface DeferredOutcome {
  readonly graph: MacroStateGraph;
  readonly outcome: MicroOutcome;
  readonly callsite: string;
  readonly enqueuedAt: number;
}

export class FeedbackStore {
  private planningDepth = 0;
  private readonly violations: PlanningViolation[] = [];
  private readonly replanThreshold: number;

  /** Snapshot of edge topology (edge IDs) at construction for invariant checking */
  private topologySnapshot: string[] | undefined;

  /**
   * Queue of outcomes that arrived while planningDepth > 0.
   * Applied in deterministic order on exitPlanningPhase() when depth returns to 0.
   */
  private readonly deferredOutcomes: DeferredOutcome[] = [];

  constructor(replanThreshold: number = DEFAULT_REPLAN_THRESHOLD) {
    this.replanThreshold = replanThreshold;
  }

  // --------------------------------------------------------------------------
  // Re-entrant planning guard
  // --------------------------------------------------------------------------

  /**
   * Enter a planning phase. Increments depth counter.
   * Planning is active when depth > 0.
   */
  enterPlanningPhase(): void {
    this.planningDepth++;
  }

  /**
   * Exit a planning phase. Decrements depth counter.
   * When depth returns to 0, flushes deferred outcomes in deterministic order.
   */
  exitPlanningPhase(): void {
    this.planningDepth = Math.max(0, this.planningDepth - 1);

    if (this.planningDepth === 0 && this.deferredOutcomes.length > 0) {
      this.flushDeferredOutcomes();
    }
  }

  /**
   * Get the number of outcomes currently queued for deferred application.
   */
  get deferredCount(): number {
    return this.deferredOutcomes.length;
  }

  /**
   * Check if we are currently in a planning phase.
   */
  get isInPlanningPhase(): boolean {
    return this.planningDepth > 0;
  }

  /**
   * Get the current planning depth.
   */
  get currentPlanningDepth(): number {
    return this.planningDepth;
  }

  /**
   * Get all recorded violations.
   */
  getViolations(): readonly PlanningViolation[] {
    return this.violations;
  }

  // --------------------------------------------------------------------------
  // Topology invariant
  // --------------------------------------------------------------------------

  /**
   * Capture a snapshot of the graph topology for invariant checking.
   */
  captureTopology(graph: MacroStateGraph): void {
    this.topologySnapshot = graph.edges.map((e) => e.id).sort();
  }

  /**
   * Check if the topology has changed since the snapshot was taken.
   * Returns false if topology is unchanged (the desired invariant).
   */
  getTopologyChanged(graph: MacroStateGraph): boolean {
    if (!this.topologySnapshot) return false;
    const current = graph.edges.map((e) => e.id).sort();
    if (current.length !== this.topologySnapshot.length) return true;
    for (let i = 0; i < current.length; i++) {
      if (current[i] !== this.topologySnapshot[i]) return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Outcome Recording
  // --------------------------------------------------------------------------

  /**
   * Record a micro execution outcome, updating edge costs.
   *
   * When planningDepth > 0: records a violation and queues the outcome
   * for deferred application when planning exits. This prevents
   * timing-driven nondeterminism where concurrent planning and feedback
   * produce different paths depending on scheduling order.
   *
   * When planningDepth === 0: applies the cost update immediately.
   */
  recordOutcome(
    graph: MacroStateGraph,
    outcome: MicroOutcome,
    callsite: string = 'recordOutcome'
  ): CostUpdate | undefined {
    // Re-entrant planning guard: defer, don't apply
    if (this.planningDepth > 0) {
      this.violations.push({
        edgeId: outcome.macroEdgeId,
        plannerPhase: 'active',
        depth: this.planningDepth,
        callsite,
        timestamp: Date.now(),
      });
      this.deferredOutcomes.push({
        graph,
        outcome,
        callsite,
        enqueuedAt: Date.now(),
      });
      return undefined;
    }

    return this.applyOutcome(graph, outcome);
  }

  /**
   * Apply a single outcome to the graph's edge costs. Internal — called
   * directly when not in planning phase, or from flushDeferredOutcomes.
   */
  private applyOutcome(
    graph: MacroStateGraph,
    outcome: MicroOutcome
  ): CostUpdate | undefined {
    // Find the edge in the graph
    const edge = graph.edges.find(
      (e) => e.id === outcome.macroEdgeId
    ) as MacroEdge | undefined;
    if (!edge) return undefined;

    const previousCost = edge.learnedCost;

    if (outcome.success) {
      // EMA update: learnedCost = (1 - α) * learnedCost + α * observedCost
      const observedCost = outcome.durationMs / 1000; // Normalize to seconds
      edge.learnedCost =
        (1 - COST_LEARNING_RATE) * edge.learnedCost +
        COST_LEARNING_RATE * observedCost;
      edge.consecutiveFailures = 0;
    } else {
      // Failure: increase cost by penalty factor
      const FAILURE_PENALTY = 1.5;
      edge.learnedCost *= FAILURE_PENALTY;
      edge.consecutiveFailures++;
    }

    return {
      edgeId: edge.id,
      previousCost,
      newCost: edge.learnedCost,
      consecutiveFailures: edge.consecutiveFailures,
    };
  }

  /**
   * Flush deferred outcomes in deterministic order:
   * sorted by (edgeId, enqueuedAt) to ensure timing doesn't affect ordering.
   */
  private flushDeferredOutcomes(): void {
    // Sort deterministically: by edgeId first, then by enqueue timestamp
    const sorted = [...this.deferredOutcomes].sort((a, b) => {
      const edgeCmp = a.outcome.macroEdgeId.localeCompare(b.outcome.macroEdgeId);
      if (edgeCmp !== 0) return edgeCmp;
      return a.enqueuedAt - b.enqueuedAt;
    });

    // Clear the queue before applying (prevents re-entrancy issues)
    this.deferredOutcomes.length = 0;

    for (const deferred of sorted) {
      this.applyOutcome(deferred.graph, deferred.outcome);
    }
  }

  // --------------------------------------------------------------------------
  // Replan Decision
  // --------------------------------------------------------------------------

  /**
   * Determine if a replan should be triggered for a given edge.
   */
  shouldReplan(edge: MacroEdge): ReplanDecision {
    if (edge.consecutiveFailures >= this.replanThreshold) {
      return {
        shouldReplan: true,
        reason: `${edge.consecutiveFailures} consecutive failures on edge ${edge.id} (threshold: ${this.replanThreshold})`,
        consecutiveFailures: edge.consecutiveFailures,
        threshold: this.replanThreshold,
      };
    }

    return {
      shouldReplan: false,
      reason: `${edge.consecutiveFailures} consecutive failures (below threshold ${this.replanThreshold})`,
      consecutiveFailures: edge.consecutiveFailures,
      threshold: this.replanThreshold,
    };
  }
}

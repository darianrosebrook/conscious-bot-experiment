/**
 * Feedback Integration (E.3)
 *
 * Orchestrates the plan→execute→feedback→replan cycle:
 * - Holds MacroPlanner + FeedbackStore + active plan
 * - startEdge() creates a session
 * - reportStepOutcome() records leaf step results
 * - completeEdge() finalizes, records outcome, checks shouldReplan
 *
 * EMA cost update is explicit and bounded (no learning→semantics leak).
 *
 * @author @darianrosebrook
 */

import { MacroPlanner } from './macro-planner';
import { FeedbackStore } from './feedback';
import type { MacroEdge, MacroPlan, MacroEdgeSession, MicroOutcome } from './macro-state';
import { createMacroEdgeSession, finalizeSession } from './macro-state';
import type { CostUpdate, ReplanDecision } from './feedback';
import type { PlanningDecision } from '../constraints/planning-decisions';

// ============================================================================
// Types
// ============================================================================

export interface EdgeSession {
  readonly sessionId: string;
  readonly macroEdgeId: string;
  readonly edge: MacroEdge;
  session: MacroEdgeSession;
}

export interface EdgeCompletionResult {
  readonly costUpdate?: CostUpdate;
  readonly shouldReplan: boolean;
  readonly replanDecision: ReplanDecision;
}

// ============================================================================
// FeedbackIntegration
// ============================================================================

export class FeedbackIntegration {
  readonly planner: MacroPlanner;
  readonly feedbackStore: FeedbackStore;
  private activePlan: MacroPlan | null = null;
  private sessions = new Map<string, EdgeSession>();

  constructor(planner: MacroPlanner, replanThreshold: number = 3) {
    this.planner = planner;
    this.feedbackStore = new FeedbackStore(replanThreshold);
  }

  /**
   * Plan a macro path from start to goal.
   */
  plan(start: string, goal: string, goalId: string): PlanningDecision<MacroPlan> {
    this.feedbackStore.enterPlanningPhase();
    try {
      const result = this.planner.planMacroPath(start, goal, goalId);
      if (result.kind === 'ok') {
        this.activePlan = result.value;
      }
      return result;
    } finally {
      this.feedbackStore.exitPlanningPhase();
    }
  }

  /**
   * Get the active plan.
   */
  getActivePlan(): MacroPlan | null {
    return this.activePlan;
  }

  /**
   * Start executing a macro edge. Creates a session to track progress.
   */
  startEdge(edgeId: string, leafStepsIssued: number = 1): EdgeSession | undefined {
    const edge = this.planner.getEdge(edgeId);
    if (!edge) return undefined;

    const session = createMacroEdgeSession(edge, leafStepsIssued);
    const edgeSession: EdgeSession = {
      sessionId: session.sessionId,
      macroEdgeId: edgeId,
      edge,
      session,
    };

    this.sessions.set(session.sessionId, edgeSession);
    return edgeSession;
  }

  /**
   * Report the outcome of a leaf step within a session.
   */
  reportStepOutcome(
    sessionId: string,
    success: boolean,
    durationMs: number,
  ): boolean {
    const edgeSession = this.sessions.get(sessionId);
    if (!edgeSession) return false;

    if (success) {
      edgeSession.session.leafStepsCompleted++;
    } else {
      edgeSession.session.leafStepsFailed++;
    }

    return true;
  }

  /**
   * Complete a macro edge execution. Finalizes the session,
   * records the outcome in the feedback store, and checks
   * whether a replan should be triggered.
   */
  completeEdge(sessionId: string): EdgeCompletionResult | undefined {
    const edgeSession = this.sessions.get(sessionId);
    if (!edgeSession) return undefined;

    // Determine success: all steps completed, none failed
    const allCompleted =
      edgeSession.session.leafStepsCompleted >= edgeSession.session.leafStepsIssued;
    edgeSession.session.status =
      allCompleted && edgeSession.session.leafStepsFailed === 0
        ? 'completed'
        : 'failed';

    // Finalize into MicroOutcome
    const outcome = finalizeSession(edgeSession.session);
    if (!outcome) return undefined;

    // Record in feedback store
    const graph = this.planner.getGraph();
    this.feedbackStore.captureTopology(graph);
    const costUpdate = this.feedbackStore.recordOutcome(graph, outcome);

    // Check replan
    const replanDecision = this.feedbackStore.shouldReplan(edgeSession.edge);

    // Clean up session
    this.sessions.delete(sessionId);

    return {
      costUpdate,
      shouldReplan: replanDecision.shouldReplan,
      replanDecision,
    };
  }
}

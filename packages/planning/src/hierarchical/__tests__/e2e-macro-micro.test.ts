/**
 * Rig E End-to-End Certification Test — Full Macro/Micro Loop
 *
 * Full loop: macro plan → edge session → micro steps → session finalize
 * → feedback → signal collection
 * Replan after N consecutive failures
 * plan-decomposer returns blocked (not empty) on unknown requirement
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { MacroPlanner, buildDefaultMinecraftGraph } from '../macro-planner';
import { FeedbackStore } from '../feedback';
import {
  createMacroEdgeSession,
  finalizeSession,
  DEFAULT_REPLAN_THRESHOLD,
} from '../macro-state';
import type { MicroOutcome, MacroEdge } from '../macro-state';
import { collectRigESignals } from '../signals';
import { decomposeToPlan } from '../../hierarchical-planner/plan-decomposer';
import type { Goal, GoalType, GoalStatus } from '../../types';

// ============================================================================
// Helpers
// ============================================================================

function makeGoal(type: string = 'acquire_item'): Goal {
  return {
    id: 'goal-1',
    type: type as GoalType,
    priority: 0.8,
    urgency: 0.5,
    utility: 0.7,
    description: 'Test goal',
    preconditions: [],
    effects: [],
    status: 'pending' as GoalStatus,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    subGoals: [],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('E2E Macro/Micro Loop — Rig E Certification', () => {
  describe('Full loop: plan → execute → feedback → signals', () => {
    it('completes a full macro/micro cycle', () => {
      const planner = buildDefaultMinecraftGraph();
      const store = new FeedbackStore(DEFAULT_REPLAN_THRESHOLD);
      const graph = planner.getGraph();
      store.captureTopology(graph);

      // 1. Plan macro path: at_base → has_stone
      const planResult = planner.planMacroPath('at_base', 'has_stone', 'goal-1');
      expect(planResult.kind).toBe('ok');
      if (planResult.kind !== 'ok') return;

      const macroPlan = planResult.value;
      expect(macroPlan.edges.length).toBe(2); // at_base→at_mine, at_mine→has_stone

      let outcomesReported = 0;
      let costUpdatedOnOutcome = false;

      // 2. Execute each macro edge
      for (const edge of macroPlan.edges) {
        // Create session
        const session = createMacroEdgeSession(edge, 3);

        // Simulate micro execution
        session.leafStepsCompleted = 3;
        session.status = 'completed';

        // Finalize → exactly one outcome
        const outcome = finalizeSession(session);
        expect(outcome).toBeDefined();
        outcomesReported++;

        // Report feedback
        const update = store.recordOutcome(graph, outcome!);
        if (update) costUpdatedOnOutcome = true;
      }

      // 3. Collect signals
      const signals = collectRigESignals({
        graph,
        plan: macroPlan,
        feedbackStore: store,
        outcomesReported,
        costUpdatedOnOutcome,
        replanTriggered: false,
      });

      // Verify signals
      expect(signals.macro_state_has_coordinates).toBe(false);
      expect(signals.macro_plan_depth).toBe(2);
      expect(signals.micro_invocations_per_macro_step).toBe(1);
      expect(signals.cost_store_updated_during_planning).toBe(false);
      expect(signals.cost_store_updated_on_micro_outcome).toBe(true);
      expect(signals.topology_changed).toBe(false);
      expect(signals.violation_count).toBe(0);
    });
  });

  describe('Replan after N consecutive failures', () => {
    it('triggers replan after threshold failures on same edge', () => {
      const planner = buildDefaultMinecraftGraph();
      const threshold = 3;
      const store = new FeedbackStore(threshold);
      const graph = planner.getGraph();

      // Plan path
      const planResult = planner.planMacroPath('at_base', 'has_stone', 'goal-1');
      expect(planResult.kind).toBe('ok');
      if (planResult.kind !== 'ok') return;

      const firstEdge = planResult.value.edges[0];
      let replanTriggered = false;

      // Fail the first edge N times
      for (let i = 0; i < threshold; i++) {
        const session = createMacroEdgeSession(firstEdge, 3);
        session.leafStepsFailed = 3;
        session.status = 'failed';

        const outcome = finalizeSession(session);
        store.recordOutcome(graph, outcome!);

        const decision = store.shouldReplan(firstEdge);
        if (decision.shouldReplan) {
          replanTriggered = true;

          // Replan: the new plan may use different costs
          const newPlan = planner.planMacroPath('at_base', 'has_stone', 'goal-1-replan');
          expect(newPlan.kind).toBe('ok');
        }
      }

      expect(replanTriggered).toBe(true);
    });
  });

  describe('Cost update during planning is violation', () => {
    it('records violation when outcome reported during planning phase', () => {
      const planner = buildDefaultMinecraftGraph();
      const store = new FeedbackStore();
      const graph = planner.getGraph();
      const edge = graph.edges[0];

      store.enterPlanningPhase();

      // This should record a violation
      store.recordOutcome(
        graph,
        {
          macroEdgeId: edge.id,
          success: true,
          durationMs: 2000,
          leafStepsCompleted: 3,
          leafStepsFailed: 0,
        },
        'test-during-planning'
      );

      store.exitPlanningPhase();

      const signals = collectRigESignals({
        graph,
        feedbackStore: store,
        outcomesReported: 1,
        costUpdatedOnOutcome: true,
        replanTriggered: false,
      });

      expect(signals.cost_store_updated_during_planning).toBe(true);
      expect(signals.violation_count).toBe(1);
    });
  });

  describe('plan-decomposer returns PlanningDecision', () => {
    it('returns ok with plan for known goal type', () => {
      const planner = buildDefaultMinecraftGraph();
      const goal = makeGoal('acquire_item');

      const result = decomposeToPlan(goal, planner);
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      expect(result.value.goalId).toBe(goal.id);
      expect(result.value.steps.length).toBeGreaterThan(0);
    });

    it('returns blocked on unknown requirement mapping', () => {
      const planner = buildDefaultMinecraftGraph();
      const goal = makeGoal('quantum_teleportation');

      const result = decomposeToPlan(goal, planner);
      expect(result.kind).toBe('blocked');
      if (result.kind === 'blocked') {
        expect(result.reason).toBe('ontology_gap');
      }
    });

    it('returns blocked when no goal provided', () => {
      const result = decomposeToPlan(null as any);
      expect(result.kind).toBe('blocked');
    });

    it('returns ok stub plan without macro planner', () => {
      const goal = makeGoal('acquire_item');
      const result = decomposeToPlan(goal);

      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;
      expect(result.value.steps).toHaveLength(0); // stub behavior
    });
  });

  describe('Signals after multiple edge sessions', () => {
    it('correctly computes micro_invocations_per_macro_step for multi-edge plan', () => {
      const planner = buildDefaultMinecraftGraph();
      const store = new FeedbackStore();
      const graph = planner.getGraph();

      // Plan: at_base → at_forest → has_wood (2 edges)
      const planResult = planner.planMacroPath('at_base', 'has_wood', 'goal-1');
      expect(planResult.kind).toBe('ok');
      if (planResult.kind !== 'ok') return;

      const macroPlan = planResult.value;
      let outcomesReported = 0;

      // Execute each edge with exactly one session each
      for (const edge of macroPlan.edges) {
        const session = createMacroEdgeSession(edge, 2);
        session.leafStepsCompleted = 2;
        session.status = 'completed';

        const outcome = finalizeSession(session);
        expect(outcome).toBeDefined();
        outcomesReported++;
        store.recordOutcome(graph, outcome!);
      }

      const signals = collectRigESignals({
        graph,
        plan: macroPlan,
        feedbackStore: store,
        outcomesReported,
        costUpdatedOnOutcome: true,
        replanTriggered: false,
      });

      // Exactly one outcome per edge
      expect(signals.micro_invocations_per_macro_step).toBe(1);
    });
  });

  describe('Defensive coordinate signal (P0-3)', () => {
    it('detects coordinate-like context IDs in graph', () => {
      const planner = new MacroPlanner();
      planner.registerContext({ id: 'at_base', description: 'Base', abstract: true });
      planner.registerContext({ id: 'pos_100_200', description: 'Coord node', abstract: true });
      planner.registerEdge('at_base', 'pos_100_200', 1.0);
      const graph = planner.getGraph();
      const store = new FeedbackStore();

      const signals = collectRigESignals({
        graph,
        feedbackStore: store,
        outcomesReported: 0,
        costUpdatedOnOutcome: false,
        replanTriggered: false,
      });

      expect(signals.macro_state_has_coordinates).toBe(true);
    });

    it('detects xyz coordinate patterns', () => {
      const planner = new MacroPlanner();
      planner.registerContext({ id: 'x:50,z:100', description: 'Raw coords', abstract: true });
      planner.registerEdge('x:50,z:100', 'x:50,z:100', 1.0);
      const graph = planner.getGraph();
      const store = new FeedbackStore();

      const signals = collectRigESignals({
        graph,
        feedbackStore: store,
        outcomesReported: 0,
        costUpdatedOnOutcome: false,
        replanTriggered: false,
      });

      expect(signals.macro_state_has_coordinates).toBe(true);
    });

    it('does not flag normal abstract context IDs', () => {
      const planner = buildDefaultMinecraftGraph();
      const graph = planner.getGraph();
      const store = new FeedbackStore();

      const signals = collectRigESignals({
        graph,
        feedbackStore: store,
        outcomesReported: 0,
        costUpdatedOnOutcome: false,
        replanTriggered: false,
      });

      expect(signals.macro_state_has_coordinates).toBe(false);
    });
  });

  describe('Runtime configuration signal (P0-1)', () => {
    it('runtime_configured is true when explicitly set', () => {
      const planner = buildDefaultMinecraftGraph();
      const graph = planner.getGraph();
      const store = new FeedbackStore();

      const signals = collectRigESignals({
        graph,
        feedbackStore: store,
        outcomesReported: 0,
        costUpdatedOnOutcome: false,
        replanTriggered: false,
        runtimeConfigured: true,
      });

      expect(signals.runtime_configured).toBe(true);
    });

    it('runtime_configured defaults to false when omitted', () => {
      const planner = buildDefaultMinecraftGraph();
      const graph = planner.getGraph();
      const store = new FeedbackStore();

      const signals = collectRigESignals({
        graph,
        feedbackStore: store,
        outcomesReported: 0,
        costUpdatedOnOutcome: false,
        replanTriggered: false,
      });

      expect(signals.runtime_configured).toBe(false);
    });
  });
});

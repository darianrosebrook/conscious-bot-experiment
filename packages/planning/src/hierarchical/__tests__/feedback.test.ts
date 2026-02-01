/**
 * Rig E Certification Tests — Feedback Store
 *
 * EMA cost update
 * consecutiveFailures increment/reset
 * Re-entrant planning guard (depth counter)
 * Nested planning invocation records violation with callsite
 * Topology-unchanged invariant (snapshot comparison)
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { FeedbackStore } from '../feedback';
import { MacroPlanner, buildDefaultMinecraftGraph } from '../macro-planner';
import { COST_LEARNING_RATE } from '../macro-state';
import type { MacroEdge, MacroStateGraph, MicroOutcome } from '../macro-state';

// ============================================================================
// Helpers
// ============================================================================

function makeTestGraph(): { planner: MacroPlanner; graph: MacroStateGraph; edge: MacroEdge } {
  const planner = new MacroPlanner();
  planner.registerContext({ id: 'A', description: 'A', abstract: true });
  planner.registerContext({ id: 'B', description: 'B', abstract: true });
  const edgeResult = planner.registerEdge('A', 'B', 5.0);
  expect(edgeResult.kind).toBe('ok');
  const edge = (edgeResult as any).value as MacroEdge;
  const graph = planner.getGraph();
  return { planner, graph, edge };
}

function makeOutcome(edgeId: string, success: boolean, durationMs: number = 3000): MicroOutcome {
  return {
    macroEdgeId: edgeId,
    success,
    durationMs,
    leafStepsCompleted: success ? 5 : 2,
    leafStepsFailed: success ? 0 : 3,
    failureReason: success ? undefined : 'test_failure',
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Feedback Store — Rig E Certification', () => {
  describe('EMA cost update', () => {
    it('updates learned cost on success using EMA', () => {
      const { graph, edge } = makeTestGraph();
      const store = new FeedbackStore();

      const initialCost = edge.learnedCost;
      expect(initialCost).toBe(5.0);

      const outcome = makeOutcome(edge.id, true, 3000); // 3 seconds
      const update = store.recordOutcome(graph, outcome);

      expect(update).toBeDefined();
      expect(update!.previousCost).toBe(5.0);
      // EMA: (1 - 0.3) * 5.0 + 0.3 * 3.0 = 3.5 + 0.9 = 4.4
      const expected = (1 - COST_LEARNING_RATE) * 5.0 + COST_LEARNING_RATE * 3.0;
      expect(update!.newCost).toBeCloseTo(expected);
      expect(edge.learnedCost).toBeCloseTo(expected);
    });

    it('increases cost on failure by penalty factor', () => {
      const { graph, edge } = makeTestGraph();
      const store = new FeedbackStore();

      const initialCost = edge.learnedCost;
      const outcome = makeOutcome(edge.id, false);
      const update = store.recordOutcome(graph, outcome);

      expect(update).toBeDefined();
      expect(update!.newCost).toBeGreaterThan(initialCost);
      expect(update!.newCost).toBeCloseTo(initialCost * 1.5);
    });
  });

  describe('consecutiveFailures increment/reset', () => {
    it('increments consecutiveFailures on failure', () => {
      const { graph, edge } = makeTestGraph();
      const store = new FeedbackStore();

      expect(edge.consecutiveFailures).toBe(0);

      store.recordOutcome(graph, makeOutcome(edge.id, false));
      expect(edge.consecutiveFailures).toBe(1);

      store.recordOutcome(graph, makeOutcome(edge.id, false));
      expect(edge.consecutiveFailures).toBe(2);
    });

    it('resets consecutiveFailures on success', () => {
      const { graph, edge } = makeTestGraph();
      const store = new FeedbackStore();

      store.recordOutcome(graph, makeOutcome(edge.id, false));
      store.recordOutcome(graph, makeOutcome(edge.id, false));
      expect(edge.consecutiveFailures).toBe(2);

      store.recordOutcome(graph, makeOutcome(edge.id, true, 3000));
      expect(edge.consecutiveFailures).toBe(0);
    });
  });

  describe('Re-entrant planning guard (depth counter)', () => {
    it('tracks planning depth correctly', () => {
      const store = new FeedbackStore();

      expect(store.isInPlanningPhase).toBe(false);
      expect(store.currentPlanningDepth).toBe(0);

      store.enterPlanningPhase();
      expect(store.isInPlanningPhase).toBe(true);
      expect(store.currentPlanningDepth).toBe(1);

      store.enterPlanningPhase();
      expect(store.currentPlanningDepth).toBe(2);

      store.exitPlanningPhase();
      expect(store.currentPlanningDepth).toBe(1);
      expect(store.isInPlanningPhase).toBe(true);

      store.exitPlanningPhase();
      expect(store.currentPlanningDepth).toBe(0);
      expect(store.isInPlanningPhase).toBe(false);
    });

    it('does not go below 0', () => {
      const store = new FeedbackStore();
      store.exitPlanningPhase();
      store.exitPlanningPhase();
      expect(store.currentPlanningDepth).toBe(0);
    });
  });

  describe('Nested planning invocation records violation', () => {
    it('records violation when outcome is recorded during planning', () => {
      const { graph, edge } = makeTestGraph();
      const store = new FeedbackStore();

      store.enterPlanningPhase();
      const outcome = makeOutcome(edge.id, true, 3000);
      store.recordOutcome(graph, outcome, 'test-callsite');
      store.exitPlanningPhase();

      const violations = store.getViolations();
      expect(violations.length).toBe(1);
      expect(violations[0].edgeId).toBe(edge.id);
      expect(violations[0].plannerPhase).toBe('active');
      expect(violations[0].depth).toBe(1);
      expect(violations[0].callsite).toBe('test-callsite');
    });

    it('records violation at correct depth for nested planning', () => {
      const { graph, edge } = makeTestGraph();
      const store = new FeedbackStore();

      store.enterPlanningPhase();
      store.enterPlanningPhase();
      store.recordOutcome(graph, makeOutcome(edge.id, true, 1000), 'nested');
      store.exitPlanningPhase();
      store.exitPlanningPhase();

      const violations = store.getViolations();
      expect(violations.length).toBe(1);
      expect(violations[0].depth).toBe(2);
      expect(violations[0].callsite).toBe('nested');
    });

    it('does not record violation when not in planning phase', () => {
      const { graph, edge } = makeTestGraph();
      const store = new FeedbackStore();

      store.recordOutcome(graph, makeOutcome(edge.id, true, 3000));

      const violations = store.getViolations();
      expect(violations.length).toBe(0);
    });
  });

  describe('Topology-unchanged invariant', () => {
    it('topology is unchanged after feedback', () => {
      const planner = buildDefaultMinecraftGraph();
      const graph = planner.getGraph();
      const store = new FeedbackStore();

      store.captureTopology(graph);

      // Record some outcomes
      const edge = graph.edges[0];
      store.recordOutcome(graph, makeOutcome(edge.id, true, 3000));
      store.recordOutcome(graph, makeOutcome(edge.id, false));

      // Topology should NOT have changed
      expect(store.getTopologyChanged(graph)).toBe(false);
    });

    it('detects topology change if edge is manually added', () => {
      const planner = new MacroPlanner();
      planner.registerContext({ id: 'A', description: 'A', abstract: true });
      planner.registerContext({ id: 'B', description: 'B', abstract: true });
      planner.registerContext({ id: 'C', description: 'C', abstract: true });
      planner.registerEdge('A', 'B', 1.0);

      const store = new FeedbackStore();
      store.captureTopology(planner.getGraph());

      // Manually add an edge (simulating topology change)
      planner.registerEdge('B', 'C', 2.0);

      expect(store.getTopologyChanged(planner.getGraph())).toBe(true);
    });
  });

  describe('shouldReplan', () => {
    it('triggers replan after threshold consecutive failures', () => {
      const { graph, edge } = makeTestGraph();
      const threshold = 3;
      const store = new FeedbackStore(threshold);

      for (let i = 0; i < threshold; i++) {
        store.recordOutcome(graph, makeOutcome(edge.id, false));
      }

      const decision = store.shouldReplan(edge);
      expect(decision.shouldReplan).toBe(true);
      expect(decision.consecutiveFailures).toBe(threshold);
      expect(decision.threshold).toBe(threshold);
    });

    it('does not trigger replan below threshold', () => {
      const { graph, edge } = makeTestGraph();
      const threshold = 3;
      const store = new FeedbackStore(threshold);

      store.recordOutcome(graph, makeOutcome(edge.id, false));
      store.recordOutcome(graph, makeOutcome(edge.id, false));

      const decision = store.shouldReplan(edge);
      expect(decision.shouldReplan).toBe(false);
      expect(decision.consecutiveFailures).toBe(2);
    });

    it('resets replan trigger after success', () => {
      const { graph, edge } = makeTestGraph();
      const threshold = 3;
      const store = new FeedbackStore(threshold);

      store.recordOutcome(graph, makeOutcome(edge.id, false));
      store.recordOutcome(graph, makeOutcome(edge.id, false));
      store.recordOutcome(graph, makeOutcome(edge.id, true, 2000));

      const decision = store.shouldReplan(edge);
      expect(decision.shouldReplan).toBe(false);
      expect(decision.consecutiveFailures).toBe(0);
    });
  });

  describe('Deferred feedback during planning (P0-2)', () => {
    it('does not mutate costs while in planning phase', () => {
      const { graph, edge } = makeTestGraph();
      const store = new FeedbackStore();

      const initialCost = edge.learnedCost;
      expect(initialCost).toBe(5.0);

      store.enterPlanningPhase();
      const result = store.recordOutcome(graph, makeOutcome(edge.id, true, 3000));

      // recordOutcome returns undefined during planning (deferred)
      expect(result).toBeUndefined();
      // Cost must NOT have changed yet
      expect(edge.learnedCost).toBe(5.0);
      // But deferred count should be 1
      expect(store.deferredCount).toBe(1);

      store.exitPlanningPhase();

      // After exiting planning, the deferred outcome is applied
      expect(store.deferredCount).toBe(0);
      expect(edge.learnedCost).not.toBe(5.0);
      const expected = (1 - COST_LEARNING_RATE) * 5.0 + COST_LEARNING_RATE * 3.0;
      expect(edge.learnedCost).toBeCloseTo(expected);
    });

    it('flushes deferred outcomes in deterministic order (by edgeId)', () => {
      const planner = new MacroPlanner();
      planner.registerContext({ id: 'A', description: 'A', abstract: true });
      planner.registerContext({ id: 'B', description: 'B', abstract: true });
      planner.registerContext({ id: 'C', description: 'C', abstract: true });
      planner.registerEdge('A', 'B', 5.0);
      planner.registerEdge('B', 'C', 5.0);
      const graph = planner.getGraph();
      const edgeAB = graph.edges.find(e => e.from === 'A' && e.to === 'B')!;
      const edgeBC = graph.edges.find(e => e.from === 'B' && e.to === 'C')!;
      const store = new FeedbackStore();

      store.enterPlanningPhase();

      // Enqueue in reverse alphabetical order of edgeId
      const edges = [edgeAB, edgeBC].sort(
        (a, b) => b.id.localeCompare(a.id)
      );
      for (const edge of edges) {
        store.recordOutcome(graph, makeOutcome(edge.id, true, 2000));
      }

      expect(store.deferredCount).toBe(2);
      store.exitPlanningPhase();
      expect(store.deferredCount).toBe(0);

      // Both edges should have been updated (regardless of enqueue order)
      expect(edgeAB.learnedCost).not.toBe(5.0);
      expect(edgeBC.learnedCost).not.toBe(5.0);
    });

    it('nested planning: deferred outcomes flush only at outermost exit', () => {
      const { graph, edge } = makeTestGraph();
      const store = new FeedbackStore();

      store.enterPlanningPhase();
      store.enterPlanningPhase(); // depth = 2
      store.recordOutcome(graph, makeOutcome(edge.id, true, 3000));

      expect(store.deferredCount).toBe(1);
      expect(edge.learnedCost).toBe(5.0); // Not applied yet

      store.exitPlanningPhase(); // depth = 1 — still in planning, no flush
      expect(store.deferredCount).toBe(1);
      expect(edge.learnedCost).toBe(5.0); // Still not applied

      store.exitPlanningPhase(); // depth = 0 — flush
      expect(store.deferredCount).toBe(0);
      expect(edge.learnedCost).not.toBe(5.0); // Now applied
    });

    it('records violation AND defers when in planning phase', () => {
      const { graph, edge } = makeTestGraph();
      const store = new FeedbackStore();

      store.enterPlanningPhase();
      store.recordOutcome(graph, makeOutcome(edge.id, true, 3000), 'test-site');

      // Violation recorded
      const violations = store.getViolations();
      expect(violations.length).toBe(1);
      expect(violations[0].callsite).toBe('test-site');

      // But cost not yet mutated
      expect(edge.learnedCost).toBe(5.0);
      expect(store.deferredCount).toBe(1);

      store.exitPlanningPhase();
      // Now cost is mutated
      expect(edge.learnedCost).not.toBe(5.0);
    });
  });
});

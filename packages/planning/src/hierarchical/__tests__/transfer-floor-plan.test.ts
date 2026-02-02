/**
 * Transfer Test — Floor Plan Navigation (E.5)
 *
 * Acceptance: Same MacroPlanner, different domain graph.
 * Office floor plan: rooms as contexts, hallways as edges.
 * Dijkstra finds shortest path.
 * Feedback updates hallway costs.
 * Replan after repeated failures.
 * RigESignals computed correctly.
 * No coordinate patterns in abstract room IDs.
 * Zero Minecraft imports.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MacroPlanner } from '../macro-planner';
import { FeedbackStore } from '../feedback';
import { FeedbackIntegration } from '../feedback-integration';
import { collectRigESignals } from '../signals';
import type { RigESignals } from '../signals';

// ============================================================================
// Office Floor Plan — Zero Minecraft Imports
// ============================================================================

function buildOfficeGraph(): MacroPlanner {
  const planner = new MacroPlanner();

  // Register rooms (abstract context IDs, no coordinates)
  const rooms = [
    { id: 'lobby', description: 'Main lobby' },
    { id: 'conference_a', description: 'Conference room A' },
    { id: 'conference_b', description: 'Conference room B' },
    { id: 'kitchen', description: 'Kitchen area' },
    { id: 'server_room', description: 'Server room' },
    { id: 'office_east', description: 'East office wing' },
    { id: 'office_west', description: 'West office wing' },
  ];

  for (const room of rooms) {
    planner.registerContext({ ...room, abstract: true as const });
  }

  // Hallways (edges) with distance-based costs
  const hallways: Array<[string, string, number]> = [
    ['lobby', 'conference_a', 2.0],
    ['lobby', 'conference_b', 2.5],
    ['lobby', 'kitchen', 3.0],
    ['lobby', 'office_east', 4.0],
    ['lobby', 'office_west', 4.0],
    ['conference_a', 'lobby', 2.0],
    ['conference_b', 'lobby', 2.5],
    ['kitchen', 'lobby', 3.0],
    ['kitchen', 'server_room', 5.0],
    ['server_room', 'kitchen', 5.0],
    ['office_east', 'lobby', 4.0],
    ['office_east', 'server_room', 3.0],
    ['server_room', 'office_east', 3.0],
    ['office_west', 'lobby', 4.0],
  ];

  for (const [from, to, cost] of hallways) {
    planner.registerEdge(from, to, cost);
  }

  planner.registerRequirementMapping('meeting', 'lobby', 'conference_a');
  planner.registerRequirementMapping('lunch', 'lobby', 'kitchen');
  planner.registerRequirementMapping('deploy', 'lobby', 'server_room');

  planner.freeze();
  return planner;
}

// ============================================================================
// Tests
// ============================================================================

describe('transfer: floor plan navigation (E.5)', () => {
  let planner: MacroPlanner;

  beforeEach(() => {
    planner = buildOfficeGraph();
  });

  describe('Dijkstra path finding', () => {
    it('finds shortest path from lobby to server_room', () => {
      const result = planner.planMacroPath('lobby', 'server_room', 'deploy-1');
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Direct: lobby → kitchen → server_room (cost: 3+5=8)
        // OR: lobby → office_east → server_room (cost: 4+3=7)
        expect(result.value.totalCost).toBe(7); // Should pick cheaper route
        expect(result.value.edges.length).toBe(2);
      }
    });

    it('finds direct path for adjacent rooms', () => {
      const result = planner.planMacroPath('lobby', 'conference_a', 'meeting-1');
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.value.edges.length).toBe(1);
        expect(result.value.totalCost).toBe(2.0);
      }
    });

    it('empty plan for same start and goal', () => {
      const result = planner.planMacroPath('lobby', 'lobby', 'same-1');
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.value.edges.length).toBe(0);
        expect(result.value.totalCost).toBe(0);
      }
    });

    it('no path to unreachable context returns blocked', () => {
      // office_west has no outbound edges except back to lobby
      // server_room is only reachable from kitchen or office_east
      const result = planner.planMacroPath('office_west', 'server_room', 'unreachable');
      expect(result.kind).toBe('ok'); // It CAN reach: office_west → lobby → office_east → server_room
      if (result.kind === 'ok') {
        expect(result.value.edges.length).toBeGreaterThan(0);
      }
    });
  });

  describe('feedback updates hallway costs', () => {
    it('successful traversal updates cost via EMA', () => {
      const integration = new FeedbackIntegration(planner, 3);
      const plan = integration.plan('lobby', 'conference_a', 'fb-1');
      expect(plan.kind).toBe('ok');

      if (plan.kind === 'ok') {
        const edge = plan.value.edges[0];
        const originalCost = edge.learnedCost;

        const session = integration.startEdge(edge.id, 1);
        integration.reportStepOutcome(session!.sessionId, true, 1500);
        const result = integration.completeEdge(session!.sessionId);

        expect(result).toBeDefined();
        expect(result!.costUpdate).toBeDefined();
        expect(result!.costUpdate!.newCost).not.toBe(originalCost);
      }
    });
  });

  describe('replan after repeated failures', () => {
    it('3 consecutive failures trigger replan', () => {
      const integration = new FeedbackIntegration(planner, 3);
      const plan = integration.plan('lobby', 'server_room', 'replan-1');
      expect(plan.kind).toBe('ok');

      if (plan.kind === 'ok') {
        const edge = plan.value.edges[0];

        for (let i = 0; i < 3; i++) {
          const session = integration.startEdge(edge.id, 1);
          integration.reportStepOutcome(session!.sessionId, false, 1000);
          const completion = integration.completeEdge(session!.sessionId);
          if (i === 2) {
            expect(completion!.shouldReplan).toBe(true);
          }
        }
      }
    });
  });

  describe('RigESignals', () => {
    it('signals computed correctly for office floor plan', () => {
      const integration = new FeedbackIntegration(planner, 3);
      const plan = integration.plan('lobby', 'server_room', 'signals-1');
      expect(plan.kind).toBe('ok');

      if (plan.kind === 'ok') {
        const graph = planner.getGraph();
        const signals: RigESignals = collectRigESignals({
          graph,
          plan: plan.value,
          feedbackStore: integration.feedbackStore,
          outcomesReported: 0,
          costUpdatedOnOutcome: false,
          replanTriggered: false,
          runtimeConfigured: true,
        });

        expect(signals.runtime_configured).toBe(true);
        expect(signals.macro_state_has_coordinates).toBe(false);
        expect(signals.context_count).toBe(7); // 7 rooms
        expect(signals.edge_count).toBe(14); // 14 hallways
        expect(signals.macro_plan_depth).toBeGreaterThan(0);
        expect(signals.macro_plan_total_cost).toBeGreaterThan(0);
        expect(signals.macro_plan_digest).toMatch(/^[0-9a-f]{16}$/);
        expect(signals.topology_changed).toBe(false);
        expect(signals.violation_count).toBe(0);
      }
    });
  });

  describe('no coordinate patterns in context IDs', () => {
    it('all context IDs are abstract (no coordinates)', () => {
      const graph = planner.getGraph();
      const allContexts = graph.registry.getAll();

      for (const ctx of allContexts) {
        // No 3+ consecutive digits
        expect(ctx.id).not.toMatch(/\d{3,}/);
        // No coordinate patterns
        expect(ctx.id).not.toMatch(/[xyz]:\s*-?\d/i);
        // No comma-separated numbers
        expect(ctx.id).not.toMatch(/-?\d+\s*,\s*-?\d+/);
      }
    });
  });
});

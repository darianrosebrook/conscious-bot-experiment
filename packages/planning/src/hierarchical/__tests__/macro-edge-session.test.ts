/**
 * Rig E Certification Tests — Macro Edge Session
 *
 * Session lifecycle: start → leafSteps → finalize
 * Exactly one MicroOutcome per session
 * micro_invocations_per_macro_step === 1
 * Leaf completion does NOT trigger outcome
 * Session finalization triggers outcome
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  createMacroEdgeSession,
  finalizeSession,
  computeEdgeId,
} from '../macro-state';
import type { MacroEdge, MacroEdgeSession } from '../macro-state';

// ============================================================================
// Helpers
// ============================================================================

function makeEdge(from: string, to: string): MacroEdge {
  return {
    id: computeEdgeId(from, to),
    from,
    to,
    baseCost: 3.0,
    learnedCost: 3.0,
    consecutiveFailures: 0,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Macro Edge Session — Rig E Certification', () => {
  describe('Session lifecycle', () => {
    it('creates a session with correct initial state', () => {
      const edge = makeEdge('at_base', 'at_mine');
      const session = createMacroEdgeSession(edge, 5);

      expect(session.sessionId).toBeTruthy();
      expect(session.macroEdgeId).toBe(edge.id);
      expect(session.macroEdge).toBe(edge);
      expect(session.leafStepsIssued).toBe(5);
      expect(session.leafStepsCompleted).toBe(0);
      expect(session.leafStepsFailed).toBe(0);
      expect(session.status).toBe('running');
      expect(session.outcomeReported).toBe(false);
    });

    it('tracks leaf step completion', () => {
      const edge = makeEdge('at_base', 'at_mine');
      const session = createMacroEdgeSession(edge, 3);

      session.leafStepsCompleted++;
      expect(session.leafStepsCompleted).toBe(1);

      session.leafStepsCompleted++;
      expect(session.leafStepsCompleted).toBe(2);
    });

    it('tracks leaf step failures', () => {
      const edge = makeEdge('at_base', 'at_mine');
      const session = createMacroEdgeSession(edge, 3);

      session.leafStepsFailed++;
      expect(session.leafStepsFailed).toBe(1);
    });
  });

  describe('Session finalization', () => {
    it('produces MicroOutcome on finalization', () => {
      const edge = makeEdge('at_base', 'at_mine');
      const session = createMacroEdgeSession(edge, 3);

      session.leafStepsCompleted = 3;
      session.status = 'completed';

      const outcome = finalizeSession(session);
      expect(outcome).toBeDefined();
      expect(outcome!.macroEdgeId).toBe(edge.id);
      expect(outcome!.success).toBe(true);
      expect(outcome!.leafStepsCompleted).toBe(3);
      expect(outcome!.leafStepsFailed).toBe(0);
      expect(outcome!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('produces failure outcome on failed session', () => {
      const edge = makeEdge('at_base', 'at_mine');
      const session = createMacroEdgeSession(edge, 3);

      session.leafStepsCompleted = 1;
      session.leafStepsFailed = 2;
      session.status = 'failed';

      const outcome = finalizeSession(session);
      expect(outcome).toBeDefined();
      expect(outcome!.success).toBe(false);
      expect(outcome!.failureReason).toBe('micro_execution_failed');
      expect(outcome!.leafStepsCompleted).toBe(1);
      expect(outcome!.leafStepsFailed).toBe(2);
    });
  });

  describe('Exactly-once outcome guarantee', () => {
    it('returns undefined on second finalization', () => {
      const edge = makeEdge('at_base', 'at_mine');
      const session = createMacroEdgeSession(edge, 3);
      session.status = 'completed';

      const outcome1 = finalizeSession(session);
      expect(outcome1).toBeDefined();

      const outcome2 = finalizeSession(session);
      expect(outcome2).toBeUndefined();
    });

    it('outcomeReported is set after first finalization', () => {
      const edge = makeEdge('at_base', 'at_mine');
      const session = createMacroEdgeSession(edge, 3);
      session.status = 'completed';

      expect(session.outcomeReported).toBe(false);

      finalizeSession(session);
      expect(session.outcomeReported).toBe(true);
    });
  });

  describe('Leaf completion does NOT trigger outcome', () => {
    it('session remains running after leaf completions', () => {
      const edge = makeEdge('at_base', 'at_mine');
      const session = createMacroEdgeSession(edge, 3);

      // Simulate leaf completions
      session.leafStepsCompleted++;
      session.leafStepsCompleted++;

      // Session should still be running — no auto-finalization
      expect(session.status).toBe('running');
      expect(session.outcomeReported).toBe(false);
    });
  });

  describe('micro_invocations_per_macro_step === 1', () => {
    it('each session produces exactly one outcome', () => {
      const edges = [
        makeEdge('at_base', 'at_mine'),
        makeEdge('at_mine', 'has_stone'),
        makeEdge('has_stone', 'at_base'),
      ];

      let outcomesReported = 0;

      for (const edge of edges) {
        const session = createMacroEdgeSession(edge, 2);
        session.leafStepsCompleted = 2;
        session.status = 'completed';

        const outcome = finalizeSession(session);
        if (outcome) outcomesReported++;

        // Try to finalize again — should be undefined
        const duplicate = finalizeSession(session);
        if (duplicate) outcomesReported++;
      }

      // Exactly one outcome per edge
      expect(outcomesReported).toBe(edges.length);
      // micro_invocations_per_macro_step = outcomesReported / edges.length
      expect(outcomesReported / edges.length).toBe(1);
    });
  });
});

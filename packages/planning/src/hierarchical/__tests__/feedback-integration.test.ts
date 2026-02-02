/**
 * Feedback Integration Tests (E.3)
 *
 * Acceptance:
 * - Successful execution → EMA cost update
 * - Failed execution → penalty increase
 * - N consecutive failures → shouldReplan triggers
 * - Replan produces different path after cost change
 * - Full cycle: plan → execute → feedback → replan
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FeedbackIntegration } from '../feedback-integration';
import { buildDefaultMinecraftGraph } from '../macro-planner';
import type { MacroPlanner } from '../macro-planner';

describe('FeedbackIntegration (E.3)', () => {
  let planner: MacroPlanner;
  let integration: FeedbackIntegration;

  beforeEach(() => {
    planner = buildDefaultMinecraftGraph();
    integration = new FeedbackIntegration(planner, 3);
  });

  it('can plan a macro path', () => {
    const result = integration.plan('idle', 'has_stone', 'goal-1');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.edges.length).toBeGreaterThan(0);
    }
    expect(integration.getActivePlan()).not.toBeNull();
  });

  it('successful execution → EMA cost update', () => {
    const planResult = integration.plan('idle', 'at_mine', 'goal-2');
    expect(planResult.kind).toBe('ok');

    if (planResult.kind === 'ok') {
      const edge = planResult.value.edges[0];
      const originalCost = edge.learnedCost;

      const session = integration.startEdge(edge.id, 1);
      expect(session).toBeDefined();

      integration.reportStepOutcome(session!.sessionId, true, 2000);
      const completion = integration.completeEdge(session!.sessionId);

      expect(completion).toBeDefined();
      expect(completion!.costUpdate).toBeDefined();
      // Cost should have changed from original (EMA update)
      expect(completion!.costUpdate!.newCost).not.toBe(originalCost);
    }
  });

  it('failed execution → penalty increase', () => {
    const planResult = integration.plan('idle', 'at_mine', 'goal-3');
    expect(planResult.kind).toBe('ok');

    if (planResult.kind === 'ok') {
      const edge = planResult.value.edges[0];
      const originalCost = edge.learnedCost;

      const session = integration.startEdge(edge.id, 1);
      expect(session).toBeDefined();

      // Report failure
      integration.reportStepOutcome(session!.sessionId, false, 5000);
      const completion = integration.completeEdge(session!.sessionId);

      expect(completion).toBeDefined();
      expect(completion!.costUpdate).toBeDefined();
      // Cost should have increased due to failure penalty
      expect(completion!.costUpdate!.newCost).toBeGreaterThan(originalCost);
      expect(completion!.costUpdate!.consecutiveFailures).toBe(1);
    }
  });

  it('N consecutive failures → shouldReplan triggers', () => {
    const planResult = integration.plan('idle', 'at_mine', 'goal-4');
    expect(planResult.kind).toBe('ok');

    if (planResult.kind === 'ok') {
      const edge = planResult.value.edges[0];

      // Fail 3 times consecutively (threshold = 3)
      for (let i = 0; i < 3; i++) {
        const session = integration.startEdge(edge.id, 1);
        expect(session).toBeDefined();
        integration.reportStepOutcome(session!.sessionId, false, 1000);
        const completion = integration.completeEdge(session!.sessionId);

        if (i < 2) {
          expect(completion!.shouldReplan).toBe(false);
        } else {
          // Third failure should trigger replan
          expect(completion!.shouldReplan).toBe(true);
        }
      }
    }
  });

  it('replan produces different path after cost change', () => {
    // Plan initial path
    const plan1 = integration.plan('at_base', 'has_stone', 'goal-5');
    expect(plan1.kind).toBe('ok');

    if (plan1.kind === 'ok') {
      // Increase cost of the first edge dramatically via failures
      const edge = plan1.value.edges[0];
      for (let i = 0; i < 5; i++) {
        const session = integration.startEdge(edge.id, 1);
        if (session) {
          integration.reportStepOutcome(session.sessionId, false, 1000);
          integration.completeEdge(session.sessionId);
        }
      }

      // Replan — should potentially choose a different path or have different cost
      const plan2 = integration.plan('at_base', 'has_stone', 'goal-5-replan');
      expect(plan2.kind).toBe('ok');
      if (plan2.kind === 'ok') {
        // Cost should be different due to learned costs
        expect(plan2.value.totalCost).not.toBe(plan1.value.totalCost);
      }
    }
  });

  it('full cycle: plan → execute → feedback → replan', () => {
    // Step 1: Plan
    const plan1 = integration.plan('idle', 'at_base', 'cycle-goal');
    expect(plan1.kind).toBe('ok');

    if (plan1.kind === 'ok') {
      // Step 2: Execute (succeed)
      const edge1 = plan1.value.edges[0];
      const session1 = integration.startEdge(edge1.id, 1);
      expect(session1).toBeDefined();
      integration.reportStepOutcome(session1!.sessionId, true, 800);
      const result1 = integration.completeEdge(session1!.sessionId);
      expect(result1).toBeDefined();
      expect(result1!.shouldReplan).toBe(false);

      // Step 3: Execute again (fail repeatedly to trigger replan)
      for (let i = 0; i < 3; i++) {
        const session = integration.startEdge(edge1.id, 1);
        if (session) {
          integration.reportStepOutcome(session.sessionId, false, 1000);
          const completion = integration.completeEdge(session.sessionId);

          if (i === 2) {
            // Step 4: Replan triggered
            expect(completion!.shouldReplan).toBe(true);
          }
        }
      }

      // Step 5: Replan
      const plan2 = integration.plan('idle', 'at_base', 'cycle-replan');
      expect(plan2.kind).toBe('ok');
    }
  });
});

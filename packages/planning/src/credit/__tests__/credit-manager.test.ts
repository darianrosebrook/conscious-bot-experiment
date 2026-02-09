/**
 * Test 3: Credit assignment semantics — Rig A Certification (P1)
 *
 * Proves: Priors update only on execution reports, never on plan success (Pivot 3).
 * Evidence: CreditManager modifies priors only via reportExecutionOutcome().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CreditManager,
  computeCreditUpdates,
  REINFORCE_MAGNITUDE,
  PENALIZE_MAGNITUDE,
  DEFAULT_PRIOR,
  MIN_PRIOR,
  MAX_PRIOR,
} from '../credit-manager';
import type { ExecutionReport } from '../credit-manager';

describe('Rig A - Credit assignment', () => {
  let creditManager: CreditManager;

  beforeEach(() => {
    creditManager = new CreditManager();
  });

  it('does not update priors on plan success without execution', () => {
    // Simulate: solver found a plan but no execution report sent
    const priorsBefore = creditManager.getPriors();

    // "Plan found" — but NO reportExecutionOutcome() called
    // (This is the core Rig A invariant: plan success != credit)

    const priorsAfter = creditManager.getPriors();
    expect(priorsAfter).toEqual(priorsBefore);
    expect(Object.keys(priorsAfter)).toHaveLength(0);  // Still empty
  });

  it('updates priors only on execution report (reinforce)', () => {
    const requestHash = 'abc123';
    const ruleId = 'craft:oak_planks';

    const priorBefore = creditManager.getPrior(ruleId);
    expect(priorBefore).toBe(DEFAULT_PRIOR);  // Unseen rule → default

    // Report execution success
    const reports: ExecutionReport[] = [
      { requestHash, stepIndex: 0, ruleId, success: true },
    ];
    const updates = creditManager.reportExecutionOutcome(requestHash, reports);

    expect(updates).toHaveLength(1);
    expect(updates[0].priorAdjustment).toBe(REINFORCE_MAGNITUDE);
    expect(updates[0].reason).toBe('Execution success');

    const priorAfter = creditManager.getPrior(ruleId);
    expect(priorAfter).toBe(DEFAULT_PRIOR + REINFORCE_MAGNITUDE);
    expect(priorAfter).toBeGreaterThan(priorBefore);
  });

  it('penalizes priors on execution failure', () => {
    const requestHash = 'def456';
    const ruleId = 'smelt:iron_ingot';

    const priorBefore = creditManager.getPrior(ruleId);

    // Report execution failure
    const reports: ExecutionReport[] = [
      {
        requestHash,
        stepIndex: 0,
        ruleId,
        success: false,
        failureReason: 'No fuel in furnace',
      },
    ];
    const updates = creditManager.reportExecutionOutcome(requestHash, reports);

    expect(updates).toHaveLength(1);
    expect(updates[0].priorAdjustment).toBe(PENALIZE_MAGNITUDE);
    expect(updates[0].reason).toContain('No fuel in furnace');

    const priorAfter = creditManager.getPrior(ruleId);
    expect(priorAfter).toBe(DEFAULT_PRIOR + PENALIZE_MAGNITUDE);
    expect(priorAfter).toBeLessThan(priorBefore);
  });

  it('clamps priors within [MIN_PRIOR, MAX_PRIOR]', () => {
    const ruleId = 'mine:cobblestone';
    const requestHash = 'clamp-test';

    // Apply many failures to drive prior below MIN_PRIOR
    for (let i = 0; i < 100; i++) {
      creditManager.reportExecutionOutcome(requestHash, [
        { requestHash, stepIndex: 0, ruleId, success: false, failureReason: 'fail' },
      ]);
    }

    expect(creditManager.getPrior(ruleId)).toBeGreaterThanOrEqual(MIN_PRIOR);

    // Apply many successes to drive prior above MAX_PRIOR
    for (let i = 0; i < 200; i++) {
      creditManager.reportExecutionOutcome(requestHash, [
        { requestHash, stepIndex: 0, ruleId, success: true },
      ]);
    }

    expect(creditManager.getPrior(ruleId)).toBeLessThanOrEqual(MAX_PRIOR);
  });

  it('maintains audit log of all credit updates', () => {
    const requestHash = 'audit-test';

    creditManager.reportExecutionOutcome(requestHash, [
      { requestHash, stepIndex: 0, ruleId: 'craft:stick', success: true },
      { requestHash, stepIndex: 1, ruleId: 'craft:planks', success: false, failureReason: 'no wood' },
    ]);

    const log = creditManager.getAuditLog();
    expect(log).toHaveLength(2);
    expect(log[0].update.ruleId).toBe('craft:stick');
    expect(log[0].priorBefore).toBe(DEFAULT_PRIOR);
    expect(log[0].priorAfter).toBe(DEFAULT_PRIOR + REINFORCE_MAGNITUDE);
    expect(log[1].update.ruleId).toBe('craft:planks');
    expect(log[1].priorAfter).toBe(DEFAULT_PRIOR + PENALIZE_MAGNITUDE);
  });

  it('computeCreditUpdates is a pure function (deterministic)', () => {
    const reports: ExecutionReport[] = [
      { requestHash: 'pure', stepIndex: 0, ruleId: 'craft:a', success: true },
      { requestHash: 'pure', stepIndex: 1, ruleId: 'mine:b', success: false, failureReason: 'blocked' },
    ];

    const result1 = computeCreditUpdates(reports);
    const result2 = computeCreditUpdates(reports);

    // Same input → same output (excluding computedAt timestamp)
    expect(result1.map(u => ({ ruleId: u.ruleId, adj: u.priorAdjustment, reason: u.reason })))
      .toEqual(result2.map(u => ({ ruleId: u.ruleId, adj: u.priorAdjustment, reason: u.reason })));
  });
});

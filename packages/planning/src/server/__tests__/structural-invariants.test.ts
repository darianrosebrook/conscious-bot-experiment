/**
 * Structural invariant tests for the autonomy loop.
 *
 * These tests verify system-level properties that span multiple modules:
 * 1. Idle suppression decision codes cover all branches
 * 2. No task can be "immortal" (every blocked reason leads to recovery or failure)
 * 3. Executor ordering: TTL evaluation before retry, retry before eligible-task selection
 *
 * These are design-level invariants — they break when the architecture drifts.
 */

import { describe, it, expect } from 'vitest';
import {
  BLOCKED_REASON_REGISTRY,
  BLOCKED_REASON_TTL_POLICY,
  TRANSIENT_EXPANSION_REASONS,
  CONTRACT_BROKEN_REASONS,
  evaluateTaskBlockState,
  isTaskEligible,
  DEFAULT_BLOCKED_TTL_MS,
  type BlockedReasonClassification,
} from '../../task-lifecycle/task-block-evaluator';

// ============================================================================
// 1. No-Immortal-Tasks: every blocked reason has a finite exit path
// ============================================================================

describe('no-immortal-tasks invariant', () => {
  it('every registry reason has a classification that leads to an exit', () => {
    // An "immortal" task would be one that is blocked with a reason that:
    // - Is not in TRANSIENT (so retryExpansion won't retry it)
    // - Is TTL-exempt (so evaluateTaskBlockState won't auto-fail it)
    // - Is not terminal (so it's not already failed)
    // - Is not executor-managed (so no external lifecycle manages it)
    //
    // If such a reason exists, tasks with it would be blocked forever.
    const validExitClassifications: BlockedReasonClassification[] = [
      'transient',        // Exit: retryExpansion will retry, eventually succeed or exhaust retries
      'contract_broken',  // Exit: TTL auto-fail (numeric TTL)
      'terminal',         // Exit: already terminal
      'executor',         // Exit: executor lifecycle (prereqs, circuit breaker, shadow mode)
    ];

    for (const [reason, entry] of Object.entries(BLOCKED_REASON_REGISTRY)) {
      expect(
        validExitClassifications.includes(entry.classification),
        `Reason "${reason}" has classification "${entry.classification}" which has no exit path`
      ).toBe(true);
    }
  });

  it('transient reasons are TTL-exempt (managed by retryExpansion, not TTL timer)', () => {
    // If a transient reason had a non-exempt TTL, the TTL evaluator could
    // auto-fail it before retryExpansion has a chance to recover.
    for (const reason of TRANSIENT_EXPANSION_REASONS) {
      const entry = BLOCKED_REASON_REGISTRY[reason];
      expect(
        entry?.ttlPolicy,
        `Transient reason "${reason}" must be TTL-exempt to prevent TTL/retry race`
      ).toBe('exempt');
    }
  });

  it('contract-broken reasons have finite numeric TTL (will auto-fail)', () => {
    for (const reason of CONTRACT_BROKEN_REASONS) {
      const entry = BLOCKED_REASON_REGISTRY[reason];
      expect(
        typeof entry?.ttlPolicy === 'number' && entry.ttlPolicy > 0,
        `Contract-broken reason "${reason}" must have positive numeric TTL for auto-fail, got: ${entry?.ttlPolicy}`
      ).toBe(true);
    }
  });

  it('evaluateTaskBlockState auto-fails contract-broken reasons after their TTL', () => {
    for (const reason of CONTRACT_BROKEN_REASONS) {
      const entry = BLOCKED_REASON_REGISTRY[reason];
      if (typeof entry.ttlPolicy !== 'number') continue;

      const task = {
        metadata: {
          blockedReason: reason,
          blockedAt: 1000,
        },
      };
      // Just after TTL expires
      const result = evaluateTaskBlockState(task, 1000 + entry.ttlPolicy + 1);
      expect(
        result.shouldFail,
        `Contract-broken reason "${reason}" should auto-fail after ${entry.ttlPolicy}ms TTL`
      ).toBe(true);
    }
  });

  it('evaluateTaskBlockState does NOT auto-fail transient reasons', () => {
    for (const reason of TRANSIENT_EXPANSION_REASONS) {
      const task = {
        metadata: {
          blockedReason: reason,
          blockedAt: 1000,
        },
      };
      // Even after a very long time (10x default TTL)
      const result = evaluateTaskBlockState(task, 1000 + DEFAULT_BLOCKED_TTL_MS * 10);
      expect(
        result.shouldFail,
        `Transient reason "${reason}" should NOT auto-fail — managed by retryExpansion`
      ).toBe(false);
    }
  });

  it('unknown reasons fall through to default TTL (conservative auto-fail)', () => {
    const task = {
      metadata: {
        blockedReason: 'some_unknown_reason',
        blockedAt: 1000,
      },
    };
    // After default TTL
    const result = evaluateTaskBlockState(task, 1000 + DEFAULT_BLOCKED_TTL_MS + 1);
    expect(result.shouldFail).toBe(true);
    expect(result.failReason).toBe('blocked-ttl-exceeded:some_unknown_reason');
  });
});

// ============================================================================
// 2. Idle suppression decision codes
// ============================================================================
//
// Previously tested the `IdleEpisodeDecision` union from the deleted
// `keep-alive-integration.ts`. The keep-alive subsystem has been cauterized;
// Phase 2 of the cauterize-and-regrow work will reintroduce an `IdleEngine`
// with its own decision type. When that lands, add a new describe block here
// that asserts the IdleEngine decision type's naming convention and that
// emission/suppression variant sets are disjoint.

// ============================================================================
// 3. Executor ordering: blocked evaluation before retry, retry before selection
// ============================================================================

describe('executor task lifecycle ordering', () => {
  it('blocked tasks are not eligible for execution', () => {
    // isTaskEligible must reject blocked tasks — this ensures the executor
    // never picks up a task that is in managed retry or waiting on TTL.
    const blockedTask = {
      status: 'active',
      steps: [{ type: 'test' }],
      metadata: { blockedReason: 'blocked_executor_unavailable' },
    };
    expect(isTaskEligible(blockedTask, Date.now())).toBe(false);
  });

  it('tasks in backoff (nextEligibleAt in future) are not eligible', () => {
    const futureTime = Date.now() + 60_000;
    const backoffTask = {
      status: 'active',
      steps: [{ type: 'test' }],
      metadata: { nextEligibleAt: futureTime },
    };
    expect(isTaskEligible(backoffTask, Date.now())).toBe(false);
  });

  it('tasks past their backoff window become eligible again', () => {
    const pastTime = Date.now() - 1000;
    const readyTask = {
      status: 'active',
      steps: [{ type: 'test' }],
      metadata: { nextEligibleAt: pastTime },
    };
    expect(isTaskEligible(readyTask, Date.now())).toBe(true);
  });

  it('pending tasks without steps are not eligible (prevents no-op execution)', () => {
    const pendingNoSteps = {
      status: 'pending',
      steps: [],
      metadata: {},
    };
    expect(isTaskEligible(pendingNoSteps, Date.now())).toBe(false);
  });

  it('pending tasks with steps are eligible', () => {
    const pendingWithSteps = {
      status: 'pending',
      steps: [{ type: 'craft' }],
      metadata: {},
    };
    expect(isTaskEligible(pendingWithSteps, Date.now())).toBe(true);
  });

  it('completed/failed/cancelled tasks are never eligible', () => {
    for (const status of ['completed', 'failed', 'cancelled', 'pending_planning']) {
      const task = {
        status,
        steps: [{ type: 'test' }],
        metadata: {},
      };
      expect(
        isTaskEligible(task, Date.now()),
        `Status "${status}" should not be eligible`
      ).toBe(false);
    }
  });

  it('both blockedReason and nextEligibleAt block eligibility independently', () => {
    // A task with blockedReason should be ineligible even if nextEligibleAt is past
    const task = {
      status: 'active',
      steps: [{ type: 'test' }],
      metadata: {
        blockedReason: 'blocked_executor_unavailable',
        nextEligibleAt: Date.now() - 60_000, // Past backoff
      },
    };
    expect(isTaskEligible(task, Date.now())).toBe(false);
  });
});

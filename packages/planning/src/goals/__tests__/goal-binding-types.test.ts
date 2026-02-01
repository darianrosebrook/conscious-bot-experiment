/**
 * Goal Binding Types — Illegal State Detection + Normalization
 *
 * Evidence for commit 1:
 * - All 5 illegal state combinations are detected and rejected
 * - Normalization maps hold fields → task metadata fields consistently
 * - Hold apply/clear round-trips leave no orphaned fields
 * - Completion recording increments/resets consecutivePasses correctly
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../../types/task';
import type { GoalBinding, GoalHold } from '../goal-binding-types';
import {
  detectIllegalStates,
  assertConsistentGoalState,
  syncHoldToTaskFields,
  applyHold,
  clearHold,
  recordVerificationResult,
} from '../goal-binding-normalize';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBinding(overrides?: Partial<GoalBinding>): GoalBinding {
  return {
    goalInstanceId: 'inst_001',
    goalKey: 'key_provisional_abc',
    goalKeyAliases: [],
    goalType: 'build_shelter',
    anchors: {},
    completion: {
      verifier: 'verify_shelter_v0',
      definitionVersion: 1,
      consecutivePasses: 0,
    },
    ...overrides,
  };
}

function makeTask(overrides?: Partial<Task> & { goalBinding?: GoalBinding }): Task {
  const { goalBinding, ...rest } = overrides ?? {};
  return {
    id: 'task_001',
    title: 'Build shelter',
    description: 'Build a basic shelter',
    type: 'building',
    priority: 0.5,
    urgency: 0.5,
    progress: 0,
    status: 'pending',
    source: 'goal',
    steps: [],
    parameters: {},
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: [],
      category: 'building',
      ...(goalBinding ? { goalBinding } : {}),
    },
    ...rest,
  };
}

function makeHold(overrides?: Partial<GoalHold>): GoalHold {
  return {
    reason: 'preempted',
    heldAt: Date.now(),
    resumeHints: ['resume at moduleCursor=0'],
    nextReviewAt: Date.now() + 300_000, // 5 min
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Illegal state detection
// ---------------------------------------------------------------------------

describe('Goal Binding — Illegal State Detection', () => {
  it('returns empty for non-goal tasks', () => {
    const task = makeTask();
    expect(detectIllegalStates(task)).toEqual([]);
  });

  it('returns empty for consistent goal-bound task (pending, no hold)', () => {
    const task = makeTask({ goalBinding: makeBinding() });
    expect(detectIllegalStates(task)).toEqual([]);
  });

  it('returns empty for consistent paused task with hold', () => {
    const task = makeTask({
      status: 'paused',
      goalBinding: makeBinding({ hold: makeHold() }),
    });
    // Mirror blockedReason for consistency
    task.metadata.blockedReason = 'preempted';
    expect(detectIllegalStates(task)).toEqual([]);
  });

  // Rule 1: paused without hold metadata
  it('detects paused_without_hold', () => {
    const task = makeTask({
      status: 'paused',
      goalBinding: makeBinding(), // no hold
    });
    const violations = detectIllegalStates(task);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('paused_without_hold');
  });

  // Rule 2: active with hold set
  it('detects non_paused_with_hold (active)', () => {
    const task = makeTask({
      status: 'active',
      goalBinding: makeBinding({ hold: makeHold() }),
    });
    const violations = detectIllegalStates(task);
    expect(violations.some((v) => v.rule === 'non_paused_with_hold')).toBe(true);
  });

  it('detects non_paused_with_hold (pending)', () => {
    const task = makeTask({
      status: 'pending',
      goalBinding: makeBinding({ hold: makeHold() }),
    });
    const violations = detectIllegalStates(task);
    expect(violations.some((v) => v.rule === 'non_paused_with_hold')).toBe(true);
  });

  it('allows hold on completed tasks (transitional — hold cleared after sync)', () => {
    // completed + hold is allowed because the sync reducer clears hold after completing.
    // But the test is: we do NOT flag completed+hold as illegal.
    const task = makeTask({
      status: 'completed',
      goalBinding: makeBinding({ hold: makeHold() }),
    });
    const violations = detectIllegalStates(task);
    expect(violations.some((v) => v.rule === 'non_paused_with_hold')).toBe(false);
  });

  // Rule 3: manual_pause mismatch
  it('detects manual_pause_mismatch when blockedReason is wrong', () => {
    const task = makeTask({
      status: 'paused',
      goalBinding: makeBinding({ hold: makeHold({ reason: 'manual_pause' }) }),
    });
    task.metadata.blockedReason = 'unsafe'; // mismatch
    const violations = detectIllegalStates(task);
    expect(violations.some((v) => v.rule === 'manual_pause_mismatch')).toBe(true);
  });

  it('no manual_pause_mismatch when blockedReason matches', () => {
    const task = makeTask({
      status: 'paused',
      goalBinding: makeBinding({ hold: makeHold({ reason: 'manual_pause' }) }),
    });
    task.metadata.blockedReason = 'manual_pause';
    const violations = detectIllegalStates(task);
    expect(violations.some((v) => v.rule === 'manual_pause_mismatch')).toBe(false);
  });

  // Rule 4: done but not completed
  it('detects done_but_not_completed', () => {
    const task = makeTask({
      status: 'active',
      goalBinding: makeBinding({
        completion: {
          verifier: 'verify_shelter_v0',
          definitionVersion: 1,
          consecutivePasses: 2,
        },
      }),
    });
    const violations = detectIllegalStates(task);
    expect(violations.some((v) => v.rule === 'done_but_not_completed')).toBe(true);
  });

  it('no done_but_not_completed when task is completed', () => {
    const task = makeTask({
      status: 'completed',
      goalBinding: makeBinding({
        completion: {
          verifier: 'verify_shelter_v0',
          definitionVersion: 1,
          consecutivePasses: 2,
        },
      }),
    });
    const violations = detectIllegalStates(task);
    expect(violations.some((v) => v.rule === 'done_but_not_completed')).toBe(false);
  });

  it('no done_but_not_completed when passes < 2', () => {
    const task = makeTask({
      status: 'active',
      goalBinding: makeBinding({
        completion: {
          verifier: 'verify_shelter_v0',
          definitionVersion: 1,
          consecutivePasses: 1,
        },
      }),
    });
    const violations = detectIllegalStates(task);
    expect(violations.some((v) => v.rule === 'done_but_not_completed')).toBe(false);
  });

  // Rule 5: anchored without alias
  it('detects anchored_without_alias', () => {
    const task = makeTask({
      goalBinding: makeBinding({
        anchors: {
          siteSignature: {
            position: { x: 0, y: 64, z: 0 },
            facing: 'N',
            refCorner: { x: 0, y: 64, z: 0 },
            footprintBounds: {
              min: { x: -5, y: 64, z: -5 },
              max: { x: 5, y: 72, z: 5 },
            },
          },
        },
        goalKeyAliases: [], // empty — transition was not recorded
      }),
    });
    const violations = detectIllegalStates(task);
    expect(violations.some((v) => v.rule === 'anchored_without_alias')).toBe(true);
  });

  it('no anchored_without_alias when alias exists', () => {
    const task = makeTask({
      goalBinding: makeBinding({
        anchors: {
          siteSignature: {
            position: { x: 0, y: 64, z: 0 },
            facing: 'N',
            refCorner: { x: 0, y: 64, z: 0 },
            footprintBounds: {
              min: { x: -5, y: 64, z: -5 },
              max: { x: 5, y: 72, z: 5 },
            },
          },
        },
        goalKeyAliases: ['key_provisional_abc'],
      }),
    });
    const violations = detectIllegalStates(task);
    expect(violations.some((v) => v.rule === 'anchored_without_alias')).toBe(false);
  });

  it('no anchored_without_alias when no siteSignature (still Phase A)', () => {
    const task = makeTask({
      goalBinding: makeBinding({
        anchors: {},
        goalKeyAliases: [],
      }),
    });
    const violations = detectIllegalStates(task);
    expect(violations.some((v) => v.rule === 'anchored_without_alias')).toBe(false);
  });

  // Multiple violations simultaneously
  it('detects multiple violations at once', () => {
    const task = makeTask({
      status: 'active',
      goalBinding: makeBinding({
        hold: makeHold(), // active + hold → non_paused_with_hold
        completion: {
          verifier: 'verify_shelter_v0',
          definitionVersion: 1,
          consecutivePasses: 3, // done but not completed
        },
      }),
    });
    const violations = detectIllegalStates(task);
    expect(violations.length).toBeGreaterThanOrEqual(2);
    const rules = violations.map((v) => v.rule);
    expect(rules).toContain('non_paused_with_hold');
    expect(rules).toContain('done_but_not_completed');
  });

  // assertConsistentGoalState throws
  it('assertConsistentGoalState throws on violation', () => {
    const task = makeTask({
      status: 'paused',
      goalBinding: makeBinding(), // no hold
    });
    expect(() => assertConsistentGoalState(task)).toThrow('paused_without_hold');
  });

  it('assertConsistentGoalState does not throw when consistent', () => {
    const task = makeTask({ goalBinding: makeBinding() });
    expect(() => assertConsistentGoalState(task)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Normalization: hold ↔ task fields
// ---------------------------------------------------------------------------

describe('Goal Binding — Hold Normalization', () => {
  it('syncHoldToTaskFields mirrors hold to blockedReason and nextEligibleAt', () => {
    const hold = makeHold({ reason: 'unsafe', nextReviewAt: 99999 });
    const task = makeTask({
      status: 'paused',
      goalBinding: makeBinding({ hold }),
    });

    syncHoldToTaskFields(task);
    expect(task.metadata.blockedReason).toBe('unsafe');
    expect(task.metadata.nextEligibleAt).toBe(99999);
  });

  it('syncHoldToTaskFields clears fields when hold is absent', () => {
    const task = makeTask({
      goalBinding: makeBinding(),
    });
    task.metadata.blockedReason = 'stale_reason';
    task.metadata.nextEligibleAt = 12345;

    syncHoldToTaskFields(task);
    expect(task.metadata.blockedReason).toBeUndefined();
    expect(task.metadata.nextEligibleAt).toBeUndefined();
  });

  it('syncHoldToTaskFields returns false when nothing changed', () => {
    const task = makeTask({ goalBinding: makeBinding() });
    const changed = syncHoldToTaskFields(task);
    expect(changed).toBe(false);
  });

  it('syncHoldToTaskFields returns true when fields changed', () => {
    const hold = makeHold({ reason: 'preempted', nextReviewAt: 55555 });
    const task = makeTask({
      status: 'paused',
      goalBinding: makeBinding({ hold }),
    });
    const changed = syncHoldToTaskFields(task);
    expect(changed).toBe(true);
    expect(task.metadata.blockedReason).toBe('preempted');
  });

  it('syncHoldToTaskFields returns false for non-goal tasks', () => {
    const task = makeTask();
    task.metadata.blockedReason = 'some_reason';
    const changed = syncHoldToTaskFields(task);
    expect(changed).toBe(false);
    // Does not touch non-goal task fields
    expect(task.metadata.blockedReason).toBe('some_reason');
  });
});

// ---------------------------------------------------------------------------
// Hold apply / clear round-trip
// ---------------------------------------------------------------------------

describe('Goal Binding — Hold Lifecycle', () => {
  it('applyHold sets hold + mirrors to task fields', () => {
    const task = makeTask({ goalBinding: makeBinding() });
    const hold = makeHold({ reason: 'materials_missing', nextReviewAt: 77777 });

    applyHold(task, hold);

    const binding = task.metadata.goalBinding!;
    expect(binding.hold).toBe(hold);
    expect(task.metadata.blockedReason).toBe('materials_missing');
    expect(task.metadata.nextEligibleAt).toBe(77777);
  });

  it('clearHold removes hold + clears task fields', () => {
    const hold = makeHold({ reason: 'unsafe', nextReviewAt: 88888 });
    const task = makeTask({
      status: 'paused',
      goalBinding: makeBinding({ hold }),
    });
    task.metadata.blockedReason = 'unsafe';
    task.metadata.nextEligibleAt = 88888;

    clearHold(task);

    const binding = task.metadata.goalBinding!;
    expect(binding.hold).toBeUndefined();
    expect(task.metadata.blockedReason).toBeUndefined();
    expect(task.metadata.nextEligibleAt).toBeUndefined();
  });

  it('apply → clear round-trip leaves no orphaned fields', () => {
    const task = makeTask({ goalBinding: makeBinding() });

    applyHold(task, makeHold({ reason: 'preempted', nextReviewAt: 11111 }));
    expect(task.metadata.blockedReason).toBe('preempted');

    clearHold(task);
    expect(task.metadata.blockedReason).toBeUndefined();
    expect(task.metadata.nextEligibleAt).toBeUndefined();
    expect(task.metadata.goalBinding!.hold).toBeUndefined();
  });

  it('applyHold throws on non-goal task', () => {
    const task = makeTask();
    expect(() => applyHold(task, makeHold())).toThrow('no goalBinding');
  });

  it('clearHold is safe on non-goal task (no-op)', () => {
    const task = makeTask();
    expect(() => clearHold(task)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Completion recording
// ---------------------------------------------------------------------------

describe('Goal Binding — Completion Recording', () => {
  it('increments consecutivePasses on success', () => {
    const task = makeTask({ goalBinding: makeBinding() });

    recordVerificationResult(task, { done: true, score: 0.8 });
    expect(task.metadata.goalBinding!.completion.consecutivePasses).toBe(1);

    recordVerificationResult(task, { done: true, score: 0.9 });
    expect(task.metadata.goalBinding!.completion.consecutivePasses).toBe(2);
  });

  it('resets consecutivePasses on failure', () => {
    const task = makeTask({ goalBinding: makeBinding() });

    recordVerificationResult(task, { done: true });
    recordVerificationResult(task, { done: true });
    expect(task.metadata.goalBinding!.completion.consecutivePasses).toBe(2);

    recordVerificationResult(task, { done: false, blockers: ['no_roof'] });
    expect(task.metadata.goalBinding!.completion.consecutivePasses).toBe(0);
  });

  it('stores lastResult and lastVerifiedAt', () => {
    const task = makeTask({ goalBinding: makeBinding() });
    const before = Date.now();

    recordVerificationResult(task, { done: true, score: 0.7, evidence: ['roof_present'] });

    const completion = task.metadata.goalBinding!.completion;
    expect(completion.lastVerifiedAt).toBeGreaterThanOrEqual(before);
    expect(completion.lastResult).toEqual({
      done: true,
      score: 0.7,
      evidence: ['roof_present'],
    });
  });

  it('is a no-op on non-goal task', () => {
    const task = makeTask();
    expect(() => recordVerificationResult(task, { done: true })).not.toThrow();
  });
});

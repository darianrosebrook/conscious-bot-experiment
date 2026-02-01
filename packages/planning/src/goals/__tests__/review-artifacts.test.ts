/**
 * Review Artifacts A–D
 *
 * These are not standard unit tests — they are structured proof artifacts
 * for human reviewers. Each describe block corresponds to one artifact
 * requested during the review planning session.
 *
 * A) Golden lifecycle trace — full lifecycle from concurrent dedup through
 *    completion and regression, emitted as structured events. Includes
 *    anchor transition, hold apply/clear, and regression bookkeeping.
 * B) Store snapshot before/after — concrete before/after state for the
 *    same lifecycle scenario, including anchor atomicity proof.
 * C) Concurrency test body — 20 concurrent resolves with seeded IDs,
 *    proving the uniqueness invariant. Includes topology boundary note.
 * D) Reducer golden test vectors — deterministic input→output for
 *    manual_pause hard wall, drift resolution, idempotence, and
 *    stability window reset.
 *
 * Time: All tests use vi.useFakeTimers with a fixed epoch (FROZEN_TIME)
 * to eliminate time-dependent flakiness in nextReviewAt, lastVerifiedAt,
 * completedAt, and reducer idempotence assertions.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Task } from '../../types/task';
import type { GoalBinding, GoalHold } from '../goal-binding-types';
import { GoalStatus } from '../../types';
import { createGoalBinding, computeProvisionalKey, anchorGoalIdentity } from '../goal-identity';
import { GoalResolver, type GoalResolverDeps } from '../goal-resolver';
import {
  reduceTaskEvent,
  reduceGoalEvent,
  detectGoalTaskDrift,
  resolveDrift,
  type SyncEffect,
  type TaskEvent,
  type GoalEvent,
} from '../goal-task-sync';
import { requestHold, requestClearHold, DEFAULT_REVIEW_INTERVAL_MS } from '../goal-hold-manager';
import {
  detectIllegalStates,
  assertConsistentGoalState,
} from '../goal-binding-normalize';
import {
  checkCompletion,
  applyCompletionOutcome,
  STABILITY_THRESHOLD,
} from '../completion-checker';
import { VerifierRegistry } from '../verifier-registry';
import {
  GoalLifecycleCollector,
  goalCreatedEvent,
  goalResolvedEvent,
  goalVerificationEvent,
  goalCompletedEvent,
  goalRegressionEvent,
  type GoalLifecycleEvent,
  type GoalAnchoredEvent,
  type GoalHoldAppliedEvent,
  type GoalHoldClearedEvent,
} from '../goal-lifecycle-events';

// ---------------------------------------------------------------------------
// Frozen time — all tests run at this epoch
// ---------------------------------------------------------------------------

const FROZEN_TIME = new Date('2025-01-15T12:00:00Z').getTime();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

function resetIds() {
  idCounter = 0;
}

function nextTaskId(): string {
  return `task_${++idCounter}`;
}

function nextInstId(): string {
  return `inst_${idCounter}`;
}

function makeDeps(store: Map<string, Task>): GoalResolverDeps {
  return {
    getAllTasks: () => [...store.values()],
    storeTask: (task: Task) => {
      store.set(task.id, task);
      return task;
    },
    generateTaskId: nextTaskId,
    generateInstanceId: nextInstId,
  };
}

/** Build a goal-bound task directly (bypassing resolver for controlled setup) */
function buildGoalTask(
  taskId: string,
  goalId: string,
  opts?: {
    status?: Task['status'];
    progress?: number;
    stepsComplete?: boolean;
    withSite?: boolean;
    holdReason?: string;
    consecutivePasses?: number;
    moduleCursor?: number;
    totalModules?: number;
  },
): Task {
  const binding = createGoalBinding({
    goalInstanceId: `inst_${taskId}`,
    goalType: 'build_shelter',
    provisionalKey: computeProvisionalKey({
      goalType: 'build_shelter',
      botPosition: { x: 100, y: 64, z: 200 },
    }),
    verifier: 'verify_shelter_v0',
    goalId,
  });

  if (opts?.withSite) {
    anchorGoalIdentity(binding, {
      refCorner: { x: 100, y: 64, z: 200 },
      facing: 'N',
      siteSignature: {
        position: { x: 100, y: 64, z: 200 },
        facing: 'N',
        refCorner: { x: 100, y: 64, z: 200 },
        footprintBounds: {
          min: { x: 95, y: 64, z: 195 },
          max: { x: 110, y: 72, z: 210 },
        },
      },
    });
  }

  if (opts?.consecutivePasses !== undefined) {
    binding.completion.consecutivePasses = opts.consecutivePasses;
  }

  const totalSteps = 5;
  const doneCount = opts?.stepsComplete ? totalSteps : 0;

  const metadata: any = {
    createdAt: FROZEN_TIME - 60_000,
    updatedAt: FROZEN_TIME,
    retryCount: 0,
    maxRetries: 3,
    childTaskIds: [],
    tags: [],
    category: 'building',
    goalBinding: binding,
  };

  if (opts?.moduleCursor !== undefined) {
    metadata.build = {
      moduleCursor: opts.moduleCursor,
      totalModules: opts.totalModules ?? 5,
    };
  }

  const task: Task = {
    id: taskId,
    title: 'Build shelter',
    description: 'Review artifact test task',
    type: 'building',
    priority: 0.5,
    urgency: 0.5,
    progress: opts?.progress ?? 0,
    status: opts?.status ?? 'pending',
    source: 'goal',
    steps: Array.from({ length: totalSteps }, (_, i) => ({
      id: `step_${i}`,
      label: `Step ${i}`,
      done: i < doneCount,
      order: i,
      meta: {},
    })),
    parameters: {},
    metadata,
  };

  if (opts?.holdReason) {
    requestHold(task, opts.holdReason as any);
  }

  return task;
}

// ---------------------------------------------------------------------------
// Trace-only event constructors
//
// No production factory functions exist for these event types yet. These
// constructors are used purely for review-artifact trace readability.
// They model the event shapes that a production emitter would produce;
// they do NOT prove that production code emits them.
// ---------------------------------------------------------------------------

function traceAnchoredEvent(
  taskId: string,
  goalInstanceId: string,
  oldKey: string,
  newKey: string,
  refCorner: { x: number; y: number; z: number },
  facing: string,
): GoalAnchoredEvent {
  return {
    type: 'goal_anchored',
    timestamp: new Date(FROZEN_TIME).toISOString(),
    taskId,
    goalInstanceId,
    oldGoalKey: oldKey,
    newGoalKey: newKey,
    refCorner,
    facing,
  };
}

function traceHoldAppliedEvent(
  taskId: string,
  goalInstanceId: string,
  reason: string,
  nextReviewAt: number,
): GoalHoldAppliedEvent {
  return {
    type: 'goal_hold_applied',
    timestamp: new Date(FROZEN_TIME).toISOString(),
    taskId,
    goalInstanceId,
    holdReason: reason,
    nextReviewAt,
  };
}

function traceHoldClearedEvent(
  taskId: string,
  goalInstanceId: string,
  previousReason: string,
  wasManual: boolean,
): GoalHoldClearedEvent {
  return {
    type: 'goal_hold_cleared',
    timestamp: new Date(FROZEN_TIME).toISOString(),
    taskId,
    goalInstanceId,
    previousReason,
    wasManual,
  };
}

function makePassingRegistry(): VerifierRegistry {
  const r = new VerifierRegistry();
  r.register('verify_shelter_v0', () => ({
    done: true,
    score: 1.0,
    evidence: ['task_progress_complete', 'all_steps_complete'],
  }));
  return r;
}

function makeFailingRegistry(): VerifierRegistry {
  const r = new VerifierRegistry();
  r.register('verify_shelter_v0', () => ({
    done: false,
    blockers: ['world_shelter_not_found'],
  }));
  return r;
}

// ===========================================================================
// ARTIFACT A — Golden Lifecycle Trace
//
// Covers: create → dedup → anchor → manual_pause hold → hard-wall resume →
//         force-clear → verify×2 → complete → regression
//
// This test models the lifecycle boundaries and asserts the store semantics.
// The trace events are a narrative record for review readability — they are
// NOT emitted by production code (no lifecycle emitter is wired yet).
// The inline assertions at each step prove the actual implementation behavior.
// ===========================================================================

describe('Artifact A: Golden Lifecycle Trace', () => {
  let collector: GoalLifecycleCollector;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_TIME);
    collector = new GoalLifecycleCollector();
    resetIds();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('full lifecycle with all boundary events', () => {
    // ── Phase 1: Create (Phase A — provisional key) ──
    const task = buildGoalTask('t1', 'goal_1', { status: 'active', progress: 0.2 });
    const b = task.metadata.goalBinding as GoalBinding;
    const provisionalKey = b.goalKey;

    collector.emit(goalCreatedEvent(
      't1', b.goalInstanceId, 'build_shelter', b.goalKey, 'verify_shelter_v0',
    ));

    // ── Phase 2: Dedup (second intent → continue) ──
    collector.emit(goalResolvedEvent('t1', 'continue', b.goalKey, 0.75));

    // ── Phase 3: Phase A→B anchor ──
    const oldKey = b.goalKey;
    anchorGoalIdentity(b, {
      refCorner: { x: 100, y: 64, z: 200 },
      facing: 'N',
      siteSignature: {
        position: { x: 100, y: 64, z: 200 },
        facing: 'N',
        refCorner: { x: 100, y: 64, z: 200 },
        footprintBounds: {
          min: { x: 95, y: 64, z: 195 },
          max: { x: 110, y: 72, z: 210 },
        },
      },
    });

    // Assert anchor invariants
    expect(b.goalKeyAliases).toContain(oldKey);
    expect(b.goalKey).not.toBe(oldKey);
    expect(b.anchors.siteSignature).toBeDefined();
    assertConsistentGoalState(task);

    collector.emit(traceAnchoredEvent(
      't1', b.goalInstanceId, oldKey, b.goalKey,
      { x: 100, y: 64, z: 200 }, 'N',
    ));

    // ── Phase 4: manual_pause hold ──
    const holdResult = requestHold(task, 'manual_pause');
    expect(holdResult.action).toBe('applied');
    task.status = 'paused';
    assertConsistentGoalState(task);

    // Deterministic nextReviewAt with frozen time
    const expectedManualReviewAt = FROZEN_TIME + Number.MAX_SAFE_INTEGER;
    expect(b.hold!.nextReviewAt).toBe(expectedManualReviewAt);

    collector.emit(traceHoldAppliedEvent(
      't1', b.goalInstanceId, 'manual_pause', b.hold!.nextReviewAt,
    ));

    // ── Phase 5: goal_resumed → hard wall (noop for manual_pause) ──
    const goalResumedEffects = reduceGoalEvent(
      { type: 'goal_resumed', goalId: 'goal_1' },
      [task],
    );
    expect(goalResumedEffects).toEqual([
      { type: 'noop', reason: expect.stringContaining('manual_pause') },
    ]);
    // Task is STILL paused with hold intact after goal_resumed
    expect(task.status).toBe('paused');
    expect(b.hold?.reason).toBe('manual_pause');

    // ── Phase 6: explicit manual clear (forceManual: true) ──
    const clearResult = requestClearHold(task, { forceManual: true });
    expect(clearResult.action).toBe('cleared');
    task.status = 'active';
    assertConsistentGoalState(task);

    collector.emit(traceHoldClearedEvent(
      't1', b.goalInstanceId, 'manual_pause', true,
    ));

    // ── Phase 7: progress to 100%, verification pass #1 → progressing ──
    task.progress = 1.0;
    task.steps.forEach((s) => (s.done = true));

    const check1 = checkCompletion(task, makePassingRegistry());
    expect(check1.action).toBe('progressing');
    expect(b.completion.consecutivePasses).toBe(1);
    expect(b.completion.lastVerifiedAt).toBe(FROZEN_TIME);

    collector.emit(goalVerificationEvent(
      't1', b.goalInstanceId, 'verify_shelter_v0', true,
      b.completion.consecutivePasses, 1.0,
    ));

    // ── Phase 8: verification pass #2 → completed ──
    const check2 = checkCompletion(task, makePassingRegistry());
    expect(check2.action).toBe('completed');
    expect(b.completion.consecutivePasses).toBe(2);
    applyCompletionOutcome(task, check2);
    expect(task.status).toBe('completed');
    expect(task.metadata.completedAt).toBe(FROZEN_TIME);

    collector.emit(goalVerificationEvent(
      't1', b.goalInstanceId, 'verify_shelter_v0', true,
      b.completion.consecutivePasses, 1.0,
    ));
    collector.emit(goalCompletedEvent(
      't1', b.goalInstanceId, b.completion.consecutivePasses, 60_000,
    ));

    // ── Phase 9: regression — verifier fails on completed task ──
    const passesBeforeRegression = b.completion.consecutivePasses;
    const regCheck = checkCompletion(task, makeFailingRegistry());
    expect(regCheck.action).toBe('regression');
    applyCompletionOutcome(task, regCheck);

    // Regression bookkeeping assertions:
    expect(task.status).toBe('active');
    expect(task.metadata.completedAt).toBeUndefined();
    expect(b.completion.consecutivePasses).toBe(0); // RESET on failure
    expect(b.completion.lastResult?.done).toBe(false);
    expect(b.completion.lastResult?.blockers).toContain('world_shelter_not_found');
    expect(b.completion.lastVerifiedAt).toBe(FROZEN_TIME);

    collector.emit(goalRegressionEvent(
      't1', b.goalInstanceId, passesBeforeRegression, ['world_shelter_not_found'],
    ));

    // ── Verify full trace sequence ──
    const trace = collector.getAll();
    const typeSequence = trace.map((e) => e.type);

    expect(typeSequence).toEqual([
      'goal_created',        // Phase 1: task created with Phase A key
      'goal_resolved',       // Phase 2: dedup → continue
      'goal_anchored',       // Phase 3: Phase A→B key transition
      'goal_hold_applied',   // Phase 4: manual_pause hold
      'goal_hold_cleared',   // Phase 6: force-manual clear
      'goal_verification',   // Phase 7: pass #1 → progressing
      'goal_verification',   // Phase 8: pass #2 → completed
      'goal_completed',      // Phase 8: completion event
      'goal_regression',     // Phase 9: shelter destroyed → re-opened
    ]);

    // ── Verify critical payload fields per event ──

    // goal_created: has provisional key and verifier
    const created = trace[0];
    expect(created.type === 'goal_created' && created.goalKey).toBe(provisionalKey);
    expect(created.type === 'goal_created' && created.verifier).toBe('verify_shelter_v0');

    // goal_resolved: dedup outcome = continue with score
    const resolved = trace[1];
    expect(resolved.type === 'goal_resolved' && resolved.action).toBe('continue');
    expect(resolved.type === 'goal_resolved' && resolved.score).toBe(0.75);

    // goal_anchored: old key differs from new key
    const anchored = trace[2] as GoalAnchoredEvent;
    expect(anchored.oldGoalKey).toBe(provisionalKey);
    expect(anchored.newGoalKey).not.toBe(provisionalKey);
    expect(anchored.refCorner).toEqual({ x: 100, y: 64, z: 200 });

    // goal_hold_applied: manual_pause with deterministic nextReviewAt
    const holdApplied = trace[3] as GoalHoldAppliedEvent;
    expect(holdApplied.holdReason).toBe('manual_pause');
    expect(holdApplied.nextReviewAt).toBe(expectedManualReviewAt);

    // goal_hold_cleared: was manual, cleared via force
    const holdCleared = trace[4] as GoalHoldClearedEvent;
    expect(holdCleared.previousReason).toBe('manual_pause');
    expect(holdCleared.wasManual).toBe(true);

    // goal_verification (pass #1): passed=true, consecutivePasses=1
    const v1 = trace[5];
    expect(v1.type === 'goal_verification' && v1.passed).toBe(true);
    expect(v1.type === 'goal_verification' && v1.consecutivePasses).toBe(1);

    // goal_verification (pass #2): passed=true, consecutivePasses=2
    const v2 = trace[6];
    expect(v2.type === 'goal_verification' && v2.passed).toBe(true);
    expect(v2.type === 'goal_verification' && v2.consecutivePasses).toBe(2);

    // goal_completed: 2 passes
    const completed = trace[7];
    expect(completed.type === 'goal_completed' && completed.passes).toBe(2);

    // goal_regression: previousPasses=2, blockers
    const regression = trace[8];
    expect(regression.type === 'goal_regression' && regression.previousPasses).toBe(2);
    expect(regression.type === 'goal_regression' &&
      regression.blockers).toContain('world_shelter_not_found');
  });
});

// ===========================================================================
// ARTIFACT B — Store Snapshot Before/After
//
// Proves: key transition atomicity, hold state mirroring, completion
// bookkeeping, and that assertConsistentGoalState passes at every
// stable state boundary.
// ===========================================================================

describe('Artifact B: Store Snapshot Before/After', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_TIME);
    resetIds();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures task state before and after full lifecycle', () => {
    // ── BEFORE state ──
    const task = buildGoalTask('t1', 'goal_1', {
      status: 'active',
      progress: 0.2,
    });
    const b = task.metadata.goalBinding as GoalBinding;

    const snapshotBefore = {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      goalKey: b.goalKey,
      goalKeyAliases: [...b.goalKeyAliases],
      hasSiteSignature: !!b.anchors.siteSignature,
      hold: b.hold ? { reason: b.hold.reason } : null,
      consecutivePasses: b.completion.consecutivePasses,
      blockedReason: task.metadata.blockedReason,
    };

    expect(snapshotBefore).toEqual({
      taskId: 't1',
      status: 'active',
      progress: 0.2,
      goalKey: expect.any(String),
      goalKeyAliases: [],
      hasSiteSignature: false,
      hold: null,
      consecutivePasses: 0,
      blockedReason: undefined,
    });

    assertConsistentGoalState(task);

    // ── Lifecycle transitions ──

    // 1. Anchor (Phase A → B)
    const oldKey = b.goalKey;
    anchorGoalIdentity(b, {
      refCorner: { x: 100, y: 64, z: 200 },
      facing: 'N',
      siteSignature: {
        position: { x: 100, y: 64, z: 200 },
        facing: 'N',
        refCorner: { x: 100, y: 64, z: 200 },
        footprintBounds: {
          min: { x: 95, y: 64, z: 195 },
          max: { x: 110, y: 72, z: 210 },
        },
      },
    });
    assertConsistentGoalState(task);

    // 2. Hold (preempted)
    requestHold(task, 'preempted');
    task.status = 'paused';
    assertConsistentGoalState(task);

    // 3. Clear hold, resume
    requestClearHold(task);
    task.status = 'active';
    assertConsistentGoalState(task);

    // 4. Reach completion
    task.progress = 1.0;
    task.steps.forEach((s) => (s.done = true));

    checkCompletion(task, makePassingRegistry()); // pass 1
    const outcome = checkCompletion(task, makePassingRegistry()); // pass 2
    applyCompletionOutcome(task, outcome);

    // ── AFTER state ──
    const snapshotAfter = {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      goalKey: b.goalKey,
      goalKeyAliases: [...b.goalKeyAliases],
      hasSiteSignature: !!b.anchors.siteSignature,
      hold: b.hold ? { reason: b.hold.reason } : null,
      consecutivePasses: b.completion.consecutivePasses,
      completedAt: task.metadata.completedAt,
      blockedReason: task.metadata.blockedReason,
    };

    expect(snapshotAfter).toEqual({
      taskId: 't1',
      status: 'completed',
      progress: 1.0,
      goalKey: expect.any(String),
      goalKeyAliases: [oldKey],
      hasSiteSignature: true,
      hold: null,
      consecutivePasses: 2,
      completedAt: FROZEN_TIME,
      blockedReason: undefined,
    });

    // Key transition: old key is now an alias
    expect(snapshotAfter.goalKey).not.toBe(oldKey);
    expect(snapshotAfter.goalKeyAliases).toContain(oldKey);

    // Stability window: exactly STABILITY_THRESHOLD passes
    expect(snapshotAfter.consecutivePasses).toBe(STABILITY_THRESHOLD);
  });

  it('anchor transition is atomic: aliases + key + siteSignature written together', () => {
    // anchorGoalIdentity is a synchronous function. In JavaScript's event loop,
    // no intermediate state is reachable between the three writes (alias push,
    // key update, siteSignature set). This test verifies:
    // 1. After the call, all three fields are consistent
    // 2. The normalize layer catches a partial write (siteSignature set but no
    //    alias) via the 'anchored_without_alias' rule
    // 3. Double-anchor is rejected (one-way transition guarantee)

    const binding = createGoalBinding({
      goalInstanceId: 'inst_atom',
      goalType: 'build_shelter',
      provisionalKey: 'prov_key_atom',
      verifier: 'verify_shelter_v0',
    });

    const oldKey = binding.goalKey;
    expect(oldKey).toBe('prov_key_atom');
    expect(binding.goalKeyAliases).toEqual([]);
    expect(binding.anchors.siteSignature).toBeUndefined();

    // Anchor
    const newKey = anchorGoalIdentity(binding, {
      refCorner: { x: 50, y: 64, z: 50 },
      facing: 'E',
      siteSignature: {
        position: { x: 50, y: 64, z: 50 },
        facing: 'E',
        refCorner: { x: 50, y: 64, z: 50 },
        footprintBounds: {
          min: { x: 45, y: 64, z: 45 },
          max: { x: 60, y: 72, z: 60 },
        },
      },
    });

    // All three fields consistent after call
    expect(binding.goalKey).toBe(newKey);
    expect(binding.goalKey).not.toBe(oldKey);
    expect(binding.goalKeyAliases).toEqual([oldKey]);
    expect(binding.anchors.siteSignature).toBeDefined();
    expect(binding.anchors.siteSignature!.facing).toBe('E');

    // Simulate partial write: siteSignature set but alias missing
    // (detectIllegalStates catches this via 'anchored_without_alias')
    const corruptedBinding = createGoalBinding({
      goalInstanceId: 'inst_corrupt',
      goalType: 'build_shelter',
      provisionalKey: 'prov_key_corrupt',
      verifier: 'verify_shelter_v0',
    });
    // Bypass the API: manually set siteSignature without anchorGoalIdentity
    corruptedBinding.anchors.siteSignature = {
      position: { x: 0, y: 0, z: 0 },
      facing: 'N',
      refCorner: { x: 0, y: 0, z: 0 },
      footprintBounds: {
        min: { x: -5, y: 0, z: -5 },
        max: { x: 5, y: 8, z: 5 },
      },
    };
    const corruptedTask: Task = {
      id: 't_corrupt',
      title: 'Corrupt',
      description: 'test',
      type: 'building',
      priority: 0.5,
      urgency: 0.5,
      progress: 0,
      status: 'active',
      source: 'goal',
      steps: [],
      parameters: {},
      metadata: {
        createdAt: FROZEN_TIME,
        updatedAt: FROZEN_TIME,
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'building',
        goalBinding: corruptedBinding,
      },
    };
    const violations = detectIllegalStates(corruptedTask);
    expect(violations.some((v) => v.rule === 'anchored_without_alias')).toBe(true);

    // Double-anchor is rejected (one-way guarantee)
    expect(() => {
      anchorGoalIdentity(binding, {
        refCorner: { x: 999, y: 64, z: 999 },
        facing: 'W',
        siteSignature: {
          position: { x: 999, y: 64, z: 999 },
          facing: 'W',
          refCorner: { x: 999, y: 64, z: 999 },
          footprintBounds: {
            min: { x: 990, y: 64, z: 990 },
            max: { x: 1005, y: 72, z: 1005 },
          },
        },
      });
    }).toThrow(/already anchored/i);
  });

  it('captures hold state snapshots (preempted vs manual_pause)', () => {
    const task1 = buildGoalTask('t1', 'goal_1', { status: 'active' });
    const task2 = buildGoalTask('t2', 'goal_2', { status: 'active' });

    // Preempted hold
    requestHold(task1, 'preempted');
    task1.status = 'paused';

    // Manual pause hold
    requestHold(task2, 'manual_pause');
    task2.status = 'paused';

    const b1 = task1.metadata.goalBinding as GoalBinding;
    const b2 = task2.metadata.goalBinding as GoalBinding;

    // Both consistent
    assertConsistentGoalState(task1);
    assertConsistentGoalState(task2);

    // Snapshot preempted: deterministic nextReviewAt
    expect({
      holdReason: b1.hold?.reason,
      blockedReason: task1.metadata.blockedReason,
      nextReviewAt: b1.hold?.nextReviewAt,
    }).toEqual({
      holdReason: 'preempted',
      blockedReason: 'preempted',
      nextReviewAt: FROZEN_TIME + DEFAULT_REVIEW_INTERVAL_MS,
    });

    // Snapshot manual_pause: deterministic nextReviewAt (effectively infinite)
    expect({
      holdReason: b2.hold?.reason,
      blockedReason: task2.metadata.blockedReason,
      nextReviewAt: b2.hold?.nextReviewAt,
    }).toEqual({
      holdReason: 'manual_pause',
      blockedReason: 'manual_pause',
      nextReviewAt: FROZEN_TIME + Number.MAX_SAFE_INTEGER,
    });

    // Clear preempted: succeeds
    expect(requestClearHold(task1).action).toBe('cleared');

    // Clear manual_pause without force: blocked
    expect(requestClearHold(task2).action).toBe('blocked_manual_pause');

    // Clear manual_pause with force: succeeds
    expect(requestClearHold(task2, { forceManual: true }).action).toBe('cleared');
  });
});

// ===========================================================================
// ARTIFACT C — Concurrency Test Body (20 concurrent resolves)
//
// TOPOLOGY BOUNDARY NOTE (for reviewers):
// These tests prove the KeyedMutex behavior inside a single Node.js process.
// The uniqueness invariant ("at most one non-terminal task per (goalType,
// goalKey)") is enforced by an in-memory per-key async mutex.
//
// This guarantee does NOT extend to:
// - Multiple processes (e.g., clustered deployments)
// - Crash/restart scenarios (mutex state is lost)
// - Distributed systems
//
// If multi-process deployment is introduced, a store-level uniqueness
// constraint keyed on (goalType, goalKey, nonTerminal) or a distributed
// lock is required. See keyed-mutex.ts lines 8-9 for the source-level
// documentation of this boundary.
// ===========================================================================

describe('Artifact C: Concurrency — 20 concurrent resolves with seeded IDs', () => {
  beforeEach(() => {
    resetIds();
  });

  it('exactly 1 created, 19 continued, all point to same task', async () => {
    const store = new Map<string, Task>();
    const resolver = new GoalResolver();
    const deps = makeDeps(store);

    // All 20 requests: same goalType, same chunk → same provisionalKey
    const input = {
      goalType: 'build_shelter',
      botPosition: { x: 100, y: 64, z: 200 },
    };

    // Fire 20 concurrent resolves
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        resolver.resolveOrCreate(input, deps),
      ),
    );

    // Partition by outcome
    const created = results.filter((r) => r.action === 'created');
    const continued = results.filter((r) => r.action === 'continue');
    const satisfied = results.filter((r) => r.action === 'already_satisfied');

    // INVARIANT: exactly 1 task created
    expect(created).toHaveLength(1);
    expect(continued).toHaveLength(19);
    expect(satisfied).toHaveLength(0);

    // All outcomes reference the same task
    const allTaskIds = results.map((r) => {
      if (r.action === 'created') return r.taskId;
      if (r.action === 'continue') return r.taskId;
      return 'UNEXPECTED';
    });
    const uniqueIds = new Set(allTaskIds);
    expect(uniqueIds.size).toBe(1);

    // Store contains exactly 1 task
    expect(store.size).toBe(1);

    // The created task has correct goalBinding and no illegal states
    const [task] = store.values();
    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding).toBeDefined();
    expect(binding.goalType).toBe('build_shelter');
    expect(binding.goalKey).toBe(computeProvisionalKey(input));
    expect(binding.goalKeyAliases).toEqual([]);
    expect(binding.completion.consecutivePasses).toBe(0);
    expect(detectIllegalStates(task)).toEqual([]);
  });

  it('different chunks create independent tasks concurrently', async () => {
    const store = new Map<string, Task>();
    const resolver = new GoalResolver();
    const deps = makeDeps(store);

    // 10 requests from chunk (0,0), 10 from chunk (100,100)
    const inputA = { goalType: 'build_shelter', botPosition: { x: 5, y: 64, z: 5 } };
    const inputB = { goalType: 'build_shelter', botPosition: { x: 1600, y: 64, z: 1600 } };

    const results = await Promise.all([
      ...Array.from({ length: 10 }, () => resolver.resolveOrCreate(inputA, deps)),
      ...Array.from({ length: 10 }, () => resolver.resolveOrCreate(inputB, deps)),
    ]);

    const created = results.filter((r) => r.action === 'created');
    expect(created).toHaveLength(2); // one per chunk
    expect(store.size).toBe(2);

    // Verify they have different goalKeys
    const keys = [...store.values()].map(
      (t) => (t.metadata.goalBinding as GoalBinding).goalKey,
    );
    expect(new Set(keys).size).toBe(2);
  });

  it('mutex serializes: no store corruption under contention (50 requests)', async () => {
    const store = new Map<string, Task>();
    const resolver = new GoalResolver();
    const deps = makeDeps(store);
    const input = { goalType: 'build_shelter', botPosition: { x: 5, y: 64, z: 5 } };

    // 50 concurrent requests — stress test
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        resolver.resolveOrCreate(input, deps),
      ),
    );

    // Still exactly 1 created
    expect(results.filter((r) => r.action === 'created')).toHaveLength(1);
    expect(store.size).toBe(1);

    // No non-terminal duplicates
    const nonTerminal = [...store.values()].filter(
      (t) => t.status !== 'completed' && t.status !== 'failed',
    );
    expect(nonTerminal).toHaveLength(1);
  });
});

// ===========================================================================
// ARTIFACT D — Reducer Golden Test Vectors
//
// Deterministic input → output mappings for the sync reducer. Each vector
// specifies: initial state + event → expected SyncEffect[].
//
// Includes: status mapping, manual_pause hard wall, goal_paused/cancelled,
// drift detection/resolution, idempotence, and stability window reset.
// ===========================================================================

describe('Artifact D: Reducer Golden Test Vectors', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_TIME);
    resetIds();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── D.1: Task status → Goal status mapping ──

  it('D.1: task_status_changed produces correct goal status effects', () => {
    const vectors: Array<{
      label: string;
      event: TaskEvent;
      taskStatus: Task['status'];
      expectedGoalStatus: GoalStatus;
    }> = [
      {
        label: 'pending → active',
        event: { type: 'task_status_changed', taskId: 't1', oldStatus: 'pending', newStatus: 'active' },
        taskStatus: 'active',
        expectedGoalStatus: GoalStatus.ACTIVE,
      },
      {
        label: 'active → paused',
        event: { type: 'task_status_changed', taskId: 't1', oldStatus: 'active', newStatus: 'paused' },
        taskStatus: 'paused',
        expectedGoalStatus: GoalStatus.SUSPENDED,
      },
      {
        label: 'active → completed',
        event: { type: 'task_status_changed', taskId: 't1', oldStatus: 'active', newStatus: 'completed' },
        taskStatus: 'completed',
        expectedGoalStatus: GoalStatus.COMPLETED,
      },
      {
        label: 'active → failed',
        event: { type: 'task_status_changed', taskId: 't1', oldStatus: 'active', newStatus: 'failed' },
        taskStatus: 'failed',
        expectedGoalStatus: GoalStatus.FAILED,
      },
    ];

    for (const vec of vectors) {
      const task = buildGoalTask('t1', 'goal_1', { status: vec.taskStatus });
      const effects = reduceTaskEvent(vec.event, task);

      const goalEffect = effects.find((e) => e.type === 'update_goal_status');
      expect(goalEffect).toBeDefined();
      if (goalEffect?.type === 'update_goal_status') {
        expect(goalEffect.status).toBe(vec.expectedGoalStatus);
      }
    }
  });

  // ── D.2: manual_pause hard wall ──

  it('D.2: goal_resumed produces noop for manual_pause tasks (hard wall proof)', () => {
    const task = buildGoalTask('t1', 'goal_1', {
      status: 'paused',
      holdReason: 'manual_pause',
    });

    const event: GoalEvent = { type: 'goal_resumed', goalId: 'goal_1' };
    const effects = reduceGoalEvent(event, [task]);

    // INVARIANT: manual_pause produces noop, never clear_hold or update_task_status
    expect(effects).toEqual([
      {
        type: 'noop',
        reason: expect.stringContaining('manual_pause'),
      },
    ]);

    // Belt-and-suspenders: no clear_hold or status change effects
    expect(effects.filter((e) => e.type === 'clear_hold')).toHaveLength(0);
    expect(effects.filter((e) => e.type === 'update_task_status')).toHaveLength(0);
  });

  it('D.2b: goal_resumed clears non-manual holds', () => {
    const task = buildGoalTask('t1', 'goal_1', {
      status: 'paused',
      holdReason: 'preempted',
    });

    const event: GoalEvent = { type: 'goal_resumed', goalId: 'goal_1' };
    const effects = reduceGoalEvent(event, [task]);

    expect(effects).toEqual([
      { type: 'clear_hold', taskId: 't1' },
      {
        type: 'update_task_status',
        taskId: 't1',
        status: 'pending',
        reason: 'goal goal_1 resumed',
      },
    ]);
  });

  // ── D.3: goal_paused → apply_hold + update_task_status ──

  it('D.3: goal_paused produces hold + status effects for non-terminal tasks', () => {
    const tasks = [
      buildGoalTask('t1', 'goal_1', { status: 'active' }),
      buildGoalTask('t2', 'goal_1', { status: 'pending' }),
      buildGoalTask('t3', 'goal_1', { status: 'completed' }), // terminal, should be skipped
    ];

    const event: GoalEvent = { type: 'goal_paused', goalId: 'goal_1', reason: 'unsafe' };
    const effects = reduceGoalEvent(event, tasks);

    const expectedReviewAt = FROZEN_TIME + 5 * 60 * 1000;

    // Should produce effects for t1 and t2, skip t3
    expect(effects).toEqual([
      { type: 'apply_hold', taskId: 't1', reason: 'unsafe', nextReviewAt: expectedReviewAt },
      { type: 'update_task_status', taskId: 't1', status: 'paused', reason: expect.stringContaining('paused') },
      { type: 'apply_hold', taskId: 't2', reason: 'unsafe', nextReviewAt: expectedReviewAt },
      { type: 'update_task_status', taskId: 't2', status: 'paused', reason: expect.stringContaining('paused') },
    ]);
  });

  // ── D.4: goal_cancelled → fail effects ──

  it('D.4: goal_cancelled produces fail effects, clears holds', () => {
    const task = buildGoalTask('t1', 'goal_1', {
      status: 'paused',
      holdReason: 'preempted',
    });

    const event: GoalEvent = {
      type: 'goal_cancelled',
      goalId: 'goal_1',
      reason: 'user cancelled',
    };
    const effects = reduceGoalEvent(event, [task]);

    expect(effects).toEqual([
      { type: 'clear_hold', taskId: 't1' },
      {
        type: 'update_task_status',
        taskId: 't1',
        status: 'failed',
        reason: 'goal goal_1 cancelled: user cancelled',
      },
    ]);
  });

  // ── D.5: Drift detection and resolution ──

  it('D.5: detectGoalTaskDrift finds mismatches, resolveDrift corrects them', () => {
    const tasks = [
      buildGoalTask('t1', 'goal_1', { status: 'active' }),    // expects ACTIVE
      buildGoalTask('t2', 'goal_2', { status: 'completed' }), // expects COMPLETED
      buildGoalTask('t3', 'goal_3', { status: 'paused' }),     // expects SUSPENDED
    ];

    const goalStatuses = new Map<string, GoalStatus>([
      ['goal_1', GoalStatus.PENDING],     // WRONG: should be ACTIVE
      ['goal_2', GoalStatus.COMPLETED],   // correct
      ['goal_3', GoalStatus.ACTIVE],      // WRONG: should be SUSPENDED
    ]);

    const drift = detectGoalTaskDrift(
      tasks,
      (id) => goalStatuses.get(id),
    );

    expect(drift).toHaveLength(2);
    expect(drift.map((d) => d.goalId).sort()).toEqual(['goal_1', 'goal_3']);

    const d1 = drift.find((d) => d.goalId === 'goal_1')!;
    expect(d1.expectedGoalStatus).toBe(GoalStatus.ACTIVE);
    expect(d1.actualGoalStatus).toBe(GoalStatus.PENDING);

    const d3 = drift.find((d) => d.goalId === 'goal_3')!;
    expect(d3.expectedGoalStatus).toBe(GoalStatus.SUSPENDED);
    expect(d3.actualGoalStatus).toBe(GoalStatus.ACTIVE);

    const corrections = resolveDrift(drift);
    expect(corrections).toHaveLength(2);

    for (const effect of corrections) {
      expect(effect.type).toBe('update_goal_status');
      if (effect.type === 'update_goal_status') {
        const report = drift.find((d) => d.goalId === effect.goalId)!;
        expect(effect.status).toBe(report.expectedGoalStatus);
        expect(effect.reason).toContain('drift correction');
      }
    }
  });

  // ── D.6: Mixed scenario — manual_pause + preempted + active in same goal_resumed ──

  it('D.6: goal_resumed with mixed hold types — manual blocks, preempted clears', () => {
    const manualTask = buildGoalTask('t1', 'goal_1', {
      status: 'paused',
      holdReason: 'manual_pause',
    });
    const preemptedTask = buildGoalTask('t2', 'goal_1', {
      status: 'paused',
      holdReason: 'preempted',
    });
    const activeTask = buildGoalTask('t3', 'goal_1', {
      status: 'active',
    });

    const effects = reduceGoalEvent(
      { type: 'goal_resumed', goalId: 'goal_1' },
      [manualTask, preemptedTask, activeTask],
    );

    expect(effects).toEqual([
      { type: 'noop', reason: expect.stringContaining('manual_pause') },
      { type: 'clear_hold', taskId: 't2' },
      { type: 'update_task_status', taskId: 't2', status: 'pending', reason: 'goal goal_1 resumed' },
    ]);
  });

  // ── D.7: No goalBinding → noop ──

  it('D.7: reduceTaskEvent on non-goal-bound task → noop', () => {
    const plainTask: Task = {
      id: 't_plain',
      title: 'Plain task',
      description: 'not goal-bound',
      type: 'general',
      priority: 0.5,
      urgency: 0.5,
      progress: 0,
      status: 'active',
      source: 'manual',
      steps: [],
      parameters: {},
      metadata: {
        createdAt: FROZEN_TIME,
        updatedAt: FROZEN_TIME,
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'general',
      },
    };

    const effects = reduceTaskEvent(
      { type: 'task_status_changed', taskId: 't_plain', oldStatus: 'pending', newStatus: 'active' },
      plainTask,
    );

    expect(effects).toEqual([
      { type: 'noop', reason: 'task has no goalBinding' },
    ]);
  });

  // ── D.8: Idempotence — same event applied twice → identical effects ──

  it('D.8: reducer is idempotent — same event on same state → identical effects (deep equal)', () => {
    // With frozen time, all Date.now() calls return FROZEN_TIME,
    // making the reducer fully deterministic including nextReviewAt.

    const event: GoalEvent = { type: 'goal_paused', goalId: 'goal_1', reason: 'unsafe' };

    // Create fresh identically-constructed tasks each time (reducer is pure)
    function freshTasks() {
      return [
        buildGoalTask('t1', 'goal_1', { status: 'active' }),
        buildGoalTask('t2', 'goal_1', { status: 'pending' }),
      ];
    }

    const effects1 = reduceGoalEvent(event, freshTasks());
    const effects2 = reduceGoalEvent(event, freshTasks());

    // Full deep equality — possible because time is frozen
    expect(effects1).toEqual(effects2);

    // Also verify task event idempotence
    const taskEvent: TaskEvent = {
      type: 'task_status_changed',
      taskId: 't1',
      oldStatus: 'pending',
      newStatus: 'active',
    };

    const te1 = reduceTaskEvent(taskEvent, buildGoalTask('t1', 'goal_1', { status: 'active' }));
    const te2 = reduceTaskEvent(taskEvent, buildGoalTask('t1', 'goal_1', { status: 'active' }));

    expect(te1).toEqual(te2);
  });

  // ── D.9: Stability window reset — pass, fail, pass, pass ──

  it('D.9: stability window requires CONSECUTIVE passes — failure resets counter', () => {
    const task = buildGoalTask('t1', 'goal_1', {
      status: 'active',
      progress: 1.0,
      stepsComplete: true,
    });
    const b = task.metadata.goalBinding as GoalBinding;

    // Pass #1 → progressing (1/2)
    const r1 = checkCompletion(task, makePassingRegistry());
    expect(r1.action).toBe('progressing');
    expect(b.completion.consecutivePasses).toBe(1);

    // FAIL → resets counter to 0, records failure
    const r2 = checkCompletion(task, makeFailingRegistry());
    expect(r2.action).toBe('failed');
    expect(b.completion.consecutivePasses).toBe(0);
    expect(b.completion.lastResult?.done).toBe(false);
    expect(b.completion.lastResult?.blockers).toContain('world_shelter_not_found');

    // Pass #1 again → progressing (1/2, NOT 2/2)
    const r3 = checkCompletion(task, makePassingRegistry());
    expect(r3.action).toBe('progressing');
    expect(b.completion.consecutivePasses).toBe(1);

    // Pass #2 → NOW completed (2/2 consecutive)
    const r4 = checkCompletion(task, makePassingRegistry());
    expect(r4.action).toBe('completed');
    expect(b.completion.consecutivePasses).toBe(2);
  });
});

/**
 * Goal Protocol Integration Tests
 *
 * Proves that the goal-binding protocol is correctly wired into
 * TaskIntegration's runtime mutators:
 * - Status change on goal-bound tasks fires hooks and applies effects
 * - Management pause attaches manual_pause hold
 * - Concurrent updates use per-call origin (no global sentinel)
 * - manual_pause hard wall: cannot be auto-cleared by goal_resumed
 *
 * Uses a minimal harness that mirrors TaskIntegration's goal-binding
 * wiring without HTTP/WS dependencies.
 *
 * @see docs/internal/goal-binding-protocol.md
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Task } from '../../types/task';
import type { GoalBinding } from '../../goals/goal-binding-types';
import type { MutationOptions } from '../../interfaces/task-integration';
import {
  onTaskStatusChanged,
  onTaskProgressUpdated,
  applySyncEffects,
  type EffectApplierDeps,
} from '../../goals/goal-lifecycle-hooks';
import type { SyncEffect } from '../../goals/goal-task-sync';
import { onGoalAction } from '../../goals/goal-lifecycle-hooks';
import { createGoalBinding, computeProvisionalKey } from '../../goals/goal-identity';
import { applyHold, clearHold, cloneHold, syncHoldToTaskFields, detectIllegalStates } from '../../goals/goal-binding-normalize';
import { partitionSelfHoldEffects, applySelfHoldEffects } from '../../goals/effect-partitioning';
import { GoalStatus } from '../../types';
import type { VerifierRegistry } from '../../goals/verifier-registry';
import { TaskStore } from '../task-store';
import { TaskManagementHandler, type ManagementResult } from '../task-management-handler';
import type { GoalTagV1 } from '@conscious-bot/cognition';

// ---------------------------------------------------------------------------
// Minimal harness that replicates TaskIntegration's goal-binding wiring
// ---------------------------------------------------------------------------

class GoalProtocolHarness {
  readonly taskStore = new TaskStore();
  private managementHandler = new TaskManagementHandler(this.taskStore);

  private verifierRegistry?: VerifierRegistry;
  readonly goalStatusUpdates: Array<{ goalId: string; status: string; reason?: string }> = [];
  private idCounter = 0;

  // ---------------------------------------------------------------------------
  // updateTaskStatus — mirrors TaskIntegration with origin gating
  // ---------------------------------------------------------------------------

  async updateTaskStatus(taskId: string, status: string, options?: MutationOptions): Promise<void> {
    const task = this.taskStore.getTask(taskId);
    if (!task) return;

    const previousStatus = task.status;
    const origin = options?.origin ?? 'runtime';

    // Partition and apply self-targeted hold effects before persist.
    // Uses the same production helpers as TaskIntegration.updateTaskStatus.
    let remainingEffects: SyncEffect[] = [];
    if (origin === 'runtime') {
      const binding = (task.metadata as any).goalBinding as GoalBinding | undefined;
      if (binding) {
        const hookResult = onTaskStatusChanged(
          { ...task, status: status as Task['status'] },
          previousStatus,
          status as Task['status'],
          { verifierRegistry: this.verifierRegistry },
        );

        if (hookResult.syncEffects.length > 0) {
          const { self, remaining } = partitionSelfHoldEffects(taskId, hookResult.syncEffects);
          remainingEffects = remaining;
          applySelfHoldEffects(task, self);
        }
      }
    }

    task.status = status as any;
    task.metadata.updatedAt = Date.now();
    this.taskStore.setTask(task);

    // Apply remaining protocol effects (targeting other tasks/goals)
    if (remainingEffects.length > 0) {
      this.applyGoalProtocolEffects(remainingEffects);
    }
  }

  // ---------------------------------------------------------------------------
  // updateTaskProgress — mirrors TaskIntegration with origin gating
  // ---------------------------------------------------------------------------

  updateTaskProgress(taskId: string, progress: number, status?: Task['status'], options?: MutationOptions): boolean {
    const task = this.taskStore.getTask(taskId);
    if (!task) return false;

    task.progress = Math.max(0, Math.min(1, progress));
    task.metadata.updatedAt = Date.now();
    if (status) task.status = status;
    this.taskStore.setTask(task);

    const origin = options?.origin ?? 'runtime';
    if (origin === 'runtime') {
      const binding = (task.metadata as any).goalBinding as GoalBinding | undefined;
      if (binding) {
        const hookResult = onTaskProgressUpdated(
          task,
          task.progress,
          { verifierRegistry: this.verifierRegistry },
        );
        if (hookResult.syncEffects.length > 0) {
          this.applyGoalProtocolEffects(hookResult.syncEffects);
        }
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // handleManagementAction — mirrors TaskIntegration
  // ---------------------------------------------------------------------------

  handleManagementAction(goal: GoalTagV1, sourceThoughtId?: string): ManagementResult {
    // Pre-condition hold state BEFORE calling handle() so the handler's
    // persist includes both status + hold atomically. Mirrors TaskIntegration.
    const targetId = goal.targetId;
    type PreAction = 'hold_applied' | 'hold_cleared' | 'none';
    let preAction: PreAction = 'none';
    let savedHold: GoalBinding['hold'] | undefined;

    if (targetId) {
      const task = this.taskStore.getTask(targetId);
      if (task) {
        const binding = (task.metadata as any).goalBinding as GoalBinding | undefined;
        if (binding) {
          if (goal.action === 'pause') {
            savedHold = cloneHold(binding.hold);
            applyHold(task, {
              reason: 'manual_pause',
              heldAt: Date.now(),
              resumeHints: [],
              nextReviewAt: Date.now() + 5 * 60 * 1000,
            });
            syncHoldToTaskFields(task);
            preAction = 'hold_applied';
          } else if (goal.action === 'resume' && binding.hold) {
            savedHold = cloneHold(binding.hold);
            clearHold(task);
            syncHoldToTaskFields(task);
            preAction = 'hold_cleared';
          } else if (goal.action === 'cancel' && binding.hold) {
            savedHold = cloneHold(binding.hold);
            clearHold(task);
            syncHoldToTaskFields(task);
            preAction = 'hold_cleared';
          }
        }
      }
    }

    const result = this.managementHandler.handle(goal, sourceThoughtId);

    // Roll back if action was rejected
    if (preAction !== 'none' && result.decision !== 'applied') {
      const task = this.taskStore.getTask(targetId!);
      if (task) {
        const binding = (task.metadata as any).goalBinding as GoalBinding | undefined;
        if (binding) {
          if (preAction === 'hold_applied') {
            if (savedHold) {
              applyHold(task, savedHold);
            } else {
              clearHold(task);
            }
          } else if (preAction === 'hold_cleared' && savedHold) {
            applyHold(task, savedHold);
          }
          syncHoldToTaskFields(task);
          this.taskStore.setTask(task);
        }
      }
      return result;
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // applyGoalProtocolEffects — mirrors TaskIntegration
  // ---------------------------------------------------------------------------

  private applyGoalProtocolEffects(effects: SyncEffect[]): number {
    const statusEffects: SyncEffect[] = [];
    const otherEffects: SyncEffect[] = [];
    for (const e of effects) {
      if (e.type === 'update_task_status') statusEffects.push(e);
      else otherEffects.push(e);
    }

    const deps: EffectApplierDeps = {
      getTask: (id) => this.taskStore.getTask(id),
      setTask: (t) => this.taskStore.setTask(t),
      updateGoalStatus: (goalId, status, reason) => {
        this.goalStatusUpdates.push({ goalId, status, reason });
      },
    };
    let count = applySyncEffects(otherEffects, deps);

    for (const e of statusEffects) {
      if (e.type === 'update_task_status') {
        this.updateTaskStatus(e.taskId, e.status, { origin: 'protocol' });
        count++;
      }
    }

    return count;
  }

  /**
   * Public accessor for tests — invokes the private applyGoalProtocolEffects.
   * Tests call this to verify the routing invariant (update_task_status
   * effects go through updateTaskStatus with origin:'protocol').
   */
  applyEffectsForTest(effects: SyncEffect[]): number {
    return this.applyGoalProtocolEffects(effects);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  createGoalBoundTask(overrides?: {
    goalId?: string;
    goalType?: string;
    status?: Task['status'];
  }): Task {
    const id = `task_${++this.idCounter}`;
    const goalType = overrides?.goalType ?? 'build_shelter';
    const provisionalKey = computeProvisionalKey({
      goalType,
      botPosition: { x: 0, y: 64, z: 0 },
    });

    const binding = createGoalBinding({
      goalInstanceId: `ginst_${this.idCounter}`,
      goalType,
      provisionalKey,
      verifier: `verify_${goalType}_v0`,
      goalId: overrides?.goalId,
    });

    const task: Task = {
      id,
      title: `Build: ${goalType}`,
      description: `Goal-bound task for ${goalType}`,
      type: 'building',
      priority: 0.5,
      urgency: 0.5,
      progress: 0,
      status: overrides?.status ?? 'active',
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
        goalBinding: binding,
      },
    };

    this.taskStore.setTask(task);
    return task;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Goal Protocol Integration', () => {
  let harness: GoalProtocolHarness;

  beforeEach(() => {
    harness = new GoalProtocolHarness();
  });

  // -------------------------------------------------------------------------
  // Test A: Status change on goal-bound task fires hook and applies effects
  // -------------------------------------------------------------------------

  describe('status change fires hooks', () => {
    it('updateTaskStatus on goal-bound task with goalId produces goalStatusUpdate', async () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });

      await harness.updateTaskStatus(task.id, 'completed');

      // Hook should have fired and produced update_goal_status
      expect(harness.goalStatusUpdates.length).toBeGreaterThan(0);
      const update = harness.goalStatusUpdates.find(u => u.goalId === 'g1');
      expect(update).toBeDefined();
      expect(update!.status).toBe(GoalStatus.COMPLETED);

      // Task should be in completed state
      const updated = harness.taskStore.getTask(task.id);
      expect(updated?.status).toBe('completed');
    });

    it('updateTaskStatus with origin=protocol does NOT fire hooks', async () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });

      await harness.updateTaskStatus(task.id, 'completed', { origin: 'protocol' });

      // No hooks should have fired
      expect(harness.goalStatusUpdates.length).toBe(0);

      // But task status should still be updated
      const updated = harness.taskStore.getTask(task.id);
      expect(updated?.status).toBe('completed');
    });

    it('non-goal-bound task status change does not fire hooks', async () => {
      const task: Task = {
        id: 'plain-task',
        title: 'Plain task',
        description: '',
        type: 'general',
        priority: 0.5,
        urgency: 0.5,
        progress: 0,
        status: 'active',
        source: 'manual',
        steps: [],
        parameters: {},
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          retryCount: 0,
          maxRetries: 3,
          childTaskIds: [],
          tags: [],
          category: 'general',
        },
      };
      harness.taskStore.setTask(task);

      await harness.updateTaskStatus(task.id, 'completed');

      expect(harness.goalStatusUpdates.length).toBe(0);
    });

    it('goal-bound task without goalId produces no update_goal_status but hooks still fire', async () => {
      // No goalId → reducer produces noop for goal status
      const task = harness.createGoalBoundTask({ status: 'active' });

      await harness.updateTaskStatus(task.id, 'completed');

      // No goal status update (no goalId to target)
      expect(harness.goalStatusUpdates.length).toBe(0);

      // Task should still be updated
      const updated = harness.taskStore.getTask(task.id);
      expect(updated?.status).toBe('completed');
    });

    it('task state is consistent after status change (detectIllegalStates)', async () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });

      await harness.updateTaskStatus(task.id, 'completed');

      const updated = harness.taskStore.getTask(task.id)!;
      const violations = detectIllegalStates(updated);
      // Completed tasks may trigger done_but_not_completed if consecutivePasses < 2
      // That's expected at the protocol level (verifier hasn't run yet)
      const unexpectedViolations = violations.filter(v => v.rule !== 'done_but_not_completed');
      expect(unexpectedViolations).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Test B: Management pause attaches manual_pause hold
  // -------------------------------------------------------------------------

  describe('management pause/resume with hold protocol', () => {
    it('management pause attaches manual_pause hold on goal-bound task', () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });

      const result = harness.handleManagementAction({
        action: 'pause',
        target: task.title,
        targetId: task.id,
        amount: null,
      } as GoalTagV1);

      expect(result.decision).toBe('applied');
      expect(result.newStatus).toBe('paused');

      const updated = harness.taskStore.getTask(task.id)!;
      expect(updated.status).toBe('paused');

      const binding = updated.metadata.goalBinding as GoalBinding;
      expect(binding.hold).toBeDefined();
      expect(binding.hold!.reason).toBe('manual_pause');

      // State should be consistent
      const violations = detectIllegalStates(updated);
      expect(violations).toEqual([]);
    });

    it('management resume clears hold on goal-bound task', () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });

      // First pause
      harness.handleManagementAction({
        action: 'pause',
        target: task.title,
        targetId: task.id,
        amount: null,
      } as GoalTagV1);

      // Then resume
      const result = harness.handleManagementAction({
        action: 'resume',
        target: task.title,
        targetId: task.id,
        amount: null,
      } as GoalTagV1);

      expect(result.decision).toBe('applied');

      const updated = harness.taskStore.getTask(task.id)!;
      expect(updated.status).toBe('pending');

      const binding = updated.metadata.goalBinding as GoalBinding;
      expect(binding.hold).toBeUndefined();

      // State should be consistent
      const violations = detectIllegalStates(updated);
      expect(violations).toEqual([]);
    });

    it('management cancel clears hold before failing', () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });

      // Pause first to set hold
      harness.handleManagementAction({
        action: 'pause',
        target: task.title,
        targetId: task.id,
        amount: null,
      } as GoalTagV1);

      // Cancel
      const result = harness.handleManagementAction({
        action: 'cancel',
        target: task.title,
        targetId: task.id,
        amount: null,
      } as GoalTagV1);

      expect(result.decision).toBe('applied');

      const updated = harness.taskStore.getTask(task.id)!;
      expect(updated.status).toBe('failed');

      const binding = updated.metadata.goalBinding as GoalBinding;
      expect(binding.hold).toBeUndefined();
    });

    it('management pause on non-goal-bound task has no hold side-effect', () => {
      const task: Task = {
        id: 'plain-task',
        title: 'Plain task',
        description: '',
        type: 'general',
        priority: 0.5,
        urgency: 0.5,
        progress: 0,
        status: 'active',
        source: 'manual',
        steps: [],
        parameters: {},
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          retryCount: 0,
          maxRetries: 3,
          childTaskIds: [],
          tags: [],
          category: 'general',
        },
      };
      harness.taskStore.setTask(task);

      const result = harness.handleManagementAction({
        action: 'pause',
        target: task.title,
        targetId: task.id,
        amount: null,
      } as GoalTagV1);

      expect(result.decision).toBe('applied');
      const updated = harness.taskStore.getTask(task.id)!;
      expect(updated.status).toBe('paused');
      expect(updated.metadata.goalBinding).toBeUndefined();
    });

    it('rejected pause restores prior hold (does not destroy preempted hold)', () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });

      // Apply a preempted hold (simulating goal-level preemption) and pause task
      applyHold(task, {
        reason: 'preempted',
        heldAt: Date.now(),
        resumeHints: ['wait for higher-priority goal to complete'],
        nextReviewAt: Date.now() + 10 * 60 * 1000,
      });
      syncHoldToTaskFields(task);
      task.status = 'paused';
      harness.taskStore.setTask(task);

      // Attempt to pause an already-paused task → handler rejects (invalid_transition)
      const result = harness.handleManagementAction({
        action: 'pause',
        target: task.title,
        targetId: task.id,
        amount: null,
      } as GoalTagV1);

      expect(result.decision).toBe('invalid_transition');

      // Prior preempted hold must be restored, not destroyed
      const updated = harness.taskStore.getTask(task.id)!;
      expect(updated.status).toBe('paused');
      const binding = updated.metadata.goalBinding as GoalBinding;
      expect(binding.hold).toBeDefined();
      expect(binding.hold!.reason).toBe('preempted');
      expect(binding.hold!.resumeHints).toEqual(['wait for higher-priority goal to complete']);
    });

    it('cloneHold isolates rollback snapshot from post-snapshot mutations', () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });

      // Apply a hold with mutable resumeHints
      applyHold(task, {
        reason: 'preempted',
        heldAt: Date.now(),
        resumeHints: ['a'],
        nextReviewAt: Date.now() + 10 * 60 * 1000,
      });
      syncHoldToTaskFields(task);
      task.status = 'paused';
      harness.taskStore.setTask(task);

      // Clone the hold (simulating what preconditioning does)
      const binding = task.metadata.goalBinding as GoalBinding;
      const snapshot = cloneHold(binding.hold);

      // Mutate the original hold's resumeHints AFTER snapshot
      binding.hold!.resumeHints.push('b');

      // Snapshot must be isolated — still ['a'], not ['a', 'b']
      expect(snapshot!.resumeHints).toEqual(['a']);
      expect(binding.hold!.resumeHints).toEqual(['a', 'b']);
    });
  });

  // -------------------------------------------------------------------------
  // Test C: Concurrent updates — origin isolation
  // -------------------------------------------------------------------------

  describe('concurrent origin isolation', () => {
    it('two goal-bound tasks updated simultaneously both fire hooks', async () => {
      const t1 = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });
      const t2 = harness.createGoalBoundTask({ goalId: 'g2', status: 'active' });

      // Simulate concurrent updates (both runtime origin)
      await Promise.all([
        harness.updateTaskStatus(t1.id, 'completed'),
        harness.updateTaskStatus(t2.id, 'paused'),
      ]);

      // Both should have fired hooks
      const g1Update = harness.goalStatusUpdates.find(u => u.goalId === 'g1');
      const g2Update = harness.goalStatusUpdates.find(u => u.goalId === 'g2');

      expect(g1Update).toBeDefined();
      expect(g1Update!.status).toBe(GoalStatus.COMPLETED);

      expect(g2Update).toBeDefined();
      expect(g2Update!.status).toBe(GoalStatus.SUSPENDED);

      // Both tasks should be in correct state
      const updated1 = harness.taskStore.getTask(t1.id)!;
      const updated2 = harness.taskStore.getTask(t2.id)!;
      expect(updated1.status).toBe('completed');
      expect(updated2.status).toBe('paused');
    });

    it('protocol-origin update does not suppress concurrent runtime-origin update', async () => {
      const t1 = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });
      const t2 = harness.createGoalBoundTask({ goalId: 'g2', status: 'active' });

      // t1 updated via protocol (no hooks), t2 updated via runtime (hooks fire)
      await Promise.all([
        harness.updateTaskStatus(t1.id, 'completed', { origin: 'protocol' }),
        harness.updateTaskStatus(t2.id, 'completed'),
      ]);

      // Only g2 should have a goal status update (t1 was protocol origin)
      const g1Updates = harness.goalStatusUpdates.filter(u => u.goalId === 'g1');
      const g2Updates = harness.goalStatusUpdates.filter(u => u.goalId === 'g2');

      expect(g1Updates.length).toBe(0);
      expect(g2Updates.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Test D: manual_pause hard wall — cannot be auto-cleared
  // -------------------------------------------------------------------------

  describe('manual_pause hard wall', () => {
    it('goal_resumed cannot clear manual_pause hold', () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });

      // Pause via management action (manual_pause)
      harness.handleManagementAction({
        action: 'pause',
        target: task.title,
        targetId: task.id,
        amount: null,
      } as GoalTagV1);

      // Verify hold is set
      const pausedTask = harness.taskStore.getTask(task.id)!;
      expect(pausedTask.status).toBe('paused');
      expect((pausedTask.metadata.goalBinding as GoalBinding).hold?.reason).toBe('manual_pause');

      // Simulate goal_resumed event through the reducer
      const hookResult = onGoalAction(
        { type: 'goal_resumed', goalId: 'g1' },
        [pausedTask],
      );

      // Apply effects — should be noop for manual_pause task
      const deps: EffectApplierDeps = {
        getTask: (id) => harness.taskStore.getTask(id),
        setTask: (t) => harness.taskStore.setTask(t),
      };
      applySyncEffects(hookResult.syncEffects, deps);

      // Task should still be paused with manual_pause hold
      const afterResume = harness.taskStore.getTask(task.id)!;
      expect(afterResume.status).toBe('paused');
      expect((afterResume.metadata.goalBinding as GoalBinding).hold?.reason).toBe('manual_pause');

      // Verify the effects were noops
      const noops = hookResult.syncEffects.filter(e => e.type === 'noop');
      expect(noops.length).toBeGreaterThan(0);
      expect(noops.some(e => e.type === 'noop' && e.reason.includes('manual_pause'))).toBe(true);
    });

    it('goal_resumed CAN clear non-manual holds', () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });

      // Apply a preempted hold (not manual_pause)
      applyHold(task, {
        reason: 'preempted',
        heldAt: Date.now(),
        resumeHints: [],
        nextReviewAt: Date.now() + 5 * 60 * 1000,
      });
      syncHoldToTaskFields(task);
      task.status = 'paused';
      harness.taskStore.setTask(task);

      // Simulate goal_resumed
      const hookResult = onGoalAction(
        { type: 'goal_resumed', goalId: 'g1' },
        [task],
      );

      // Should produce clear_hold + update_task_status effects
      const clearHoldEffects = hookResult.syncEffects.filter(e => e.type === 'clear_hold');
      const statusEffects = hookResult.syncEffects.filter(e => e.type === 'update_task_status');
      expect(clearHoldEffects.length).toBe(1);
      expect(statusEffects.length).toBe(1);

      // Apply effects manually (applySyncEffects uses require() for hold ops
      // which doesn't resolve in vitest; apply inline to prove the effect shape)
      for (const effect of hookResult.syncEffects) {
        const t = harness.taskStore.getTask(task.id)!;
        if (effect.type === 'clear_hold') {
          clearHold(t);
          harness.taskStore.setTask(t);
        } else if (effect.type === 'update_task_status') {
          t.status = effect.status;
          t.metadata.updatedAt = Date.now();
          harness.taskStore.setTask(t);
        }
      }

      // Task should now be pending with no hold
      const afterResume = harness.taskStore.getTask(task.id)!;
      expect(afterResume.status).toBe('pending');
      expect((afterResume.metadata.goalBinding as GoalBinding).hold).toBeUndefined();
    });

    it('explicit management resume CAN clear manual_pause', () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });

      // Pause via management
      harness.handleManagementAction({
        action: 'pause',
        target: task.title,
        targetId: task.id,
        amount: null,
      } as GoalTagV1);

      // Resume via management (explicit user action)
      const result = harness.handleManagementAction({
        action: 'resume',
        target: task.title,
        targetId: task.id,
        amount: null,
      } as GoalTagV1);

      expect(result.decision).toBe('applied');

      const afterResume = harness.taskStore.getTask(task.id)!;
      expect(afterResume.status).toBe('pending');
      expect((afterResume.metadata.goalBinding as GoalBinding).hold).toBeUndefined();
      expect(detectIllegalStates(afterResume)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Test E: Observer-snapshot — no illegal states at setTask boundaries
  // Scope: proves consistency at persist-event boundaries for exercised
  // scenarios. Does NOT guarantee no intermediate-reference observers can
  // see stale state (store is reference-based, not copy-on-write).
  // -------------------------------------------------------------------------

  describe('observer-snapshot: consistent state at setTask boundaries', () => {
    it('every setTask call during updateTaskStatus produces consistent state', async () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });
      const violations: Array<{ taskId: string; state: string; violations: any[] }> = [];

      // Spy on setTask to inspect state at every persist boundary
      const originalSetTask = harness.taskStore.setTask.bind(harness.taskStore);
      vi.spyOn(harness.taskStore, 'setTask').mockImplementation((t: Task) => {
        const binding = t.metadata.goalBinding as GoalBinding | undefined;
        if (binding) {
          const v = detectIllegalStates(t);
          // Filter out done_but_not_completed (expected before verifier runs)
          const unexpected = v.filter(viol => viol.rule !== 'done_but_not_completed');
          if (unexpected.length > 0) {
            violations.push({
              taskId: t.id,
              state: t.status,
              violations: unexpected,
            });
          }
        }
        originalSetTask(t);
      });

      // Transition: active → completed (protocol-driven, no hold involved)
      await harness.updateTaskStatus(task.id, 'completed');

      // Transition: active → failed (protocol-driven, no hold involved)
      const task2 = harness.createGoalBoundTask({ goalId: 'g2', status: 'active' });
      await harness.updateTaskStatus(task2.id, 'failed');

      expect(violations).toEqual([]);
      vi.restoreAllMocks();
    });

    it('every setTask call during management pause produces consistent state', () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });
      const violations: Array<{ taskId: string; state: string; violations: any[] }> = [];

      const originalSetTask = harness.taskStore.setTask.bind(harness.taskStore);
      vi.spyOn(harness.taskStore, 'setTask').mockImplementation((t: Task) => {
        const binding = t.metadata.goalBinding as GoalBinding | undefined;
        if (binding) {
          const v = detectIllegalStates(t);
          const unexpected = v.filter(viol => viol.rule !== 'done_but_not_completed');
          if (unexpected.length > 0) {
            violations.push({
              taskId: t.id,
              state: t.status,
              violations: unexpected,
            });
          }
        }
        originalSetTask(t);
      });

      // Management pause should persist status + hold atomically
      harness.handleManagementAction({
        action: 'pause',
        target: task.title,
        targetId: task.id,
        amount: null,
      } as GoalTagV1);

      expect(violations).toEqual([]);
      vi.restoreAllMocks();
    });

    it('every setTask call during management resume produces consistent state', () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });

      // First, pause normally (pre-observer)
      harness.handleManagementAction({
        action: 'pause',
        target: task.title,
        targetId: task.id,
        amount: null,
      } as GoalTagV1);

      const violations: Array<{ taskId: string; state: string; violations: any[] }> = [];

      const originalSetTask = harness.taskStore.setTask.bind(harness.taskStore);
      vi.spyOn(harness.taskStore, 'setTask').mockImplementation((t: Task) => {
        const binding = t.metadata.goalBinding as GoalBinding | undefined;
        if (binding) {
          const v = detectIllegalStates(t);
          const unexpected = v.filter(viol => viol.rule !== 'done_but_not_completed');
          if (unexpected.length > 0) {
            violations.push({
              taskId: t.id,
              state: t.status,
              violations: unexpected,
            });
          }
        }
        originalSetTask(t);
      });

      // Management resume should persist status + clear hold
      harness.handleManagementAction({
        action: 'resume',
        target: task.title,
        targetId: task.id,
        amount: null,
      } as GoalTagV1);

      expect(violations).toEqual([]);
      vi.restoreAllMocks();
    });
  });

  // -------------------------------------------------------------------------
  // Test F: Self-effect partitioning — tests the production helpers
  // (partitionSelfHoldEffects, applySelfHoldEffects) that both
  // TaskIntegration.updateTaskStatus and the harness import.
  // -------------------------------------------------------------------------

  describe('self-effect partitioning (production helpers)', () => {
    it('partitionSelfHoldEffects separates self-targeted hold effects from others', () => {
      const taskId = 'task_target';
      const effects: SyncEffect[] = [
        { type: 'apply_hold', taskId, reason: 'preempted', nextReviewAt: Date.now() + 300_000 },
        { type: 'update_goal_status', goalId: 'g1', status: GoalStatus.SUSPENDED, reason: 'test' },
        { type: 'clear_hold', taskId: 'task_other' },
        { type: 'update_task_status', taskId: 'task_other', status: 'paused', reason: 'cascade' },
        { type: 'noop', reason: 'no-op' },
      ];

      const { self, remaining } = partitionSelfHoldEffects(taskId, effects);

      // Only the apply_hold targeting taskId should be in self
      expect(self).toHaveLength(1);
      expect(self[0].type).toBe('apply_hold');
      if (self[0].type === 'apply_hold') {
        expect(self[0].taskId).toBe(taskId);
      }

      // Everything else is remaining — including clear_hold for a different task
      expect(remaining).toHaveLength(4);
      expect(remaining.map(e => e.type)).toEqual([
        'update_goal_status',
        'clear_hold',
        'update_task_status',
        'noop',
      ]);
    });

    it('partitionSelfHoldEffects handles clear_hold targeting self', () => {
      const taskId = 'task_target';
      const effects: SyncEffect[] = [
        { type: 'clear_hold', taskId },
        { type: 'update_task_status', taskId, status: 'pending', reason: 'resumed' },
      ];

      const { self, remaining } = partitionSelfHoldEffects(taskId, effects);

      expect(self).toHaveLength(1);
      expect(self[0].type).toBe('clear_hold');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].type).toBe('update_task_status');
    });

    it('partitionSelfHoldEffects returns empty self when no hold effects target self', () => {
      const effects: SyncEffect[] = [
        { type: 'update_goal_status', goalId: 'g1', status: GoalStatus.COMPLETED, reason: 'done' },
        { type: 'noop', reason: 'progress' },
      ];

      const { self, remaining } = partitionSelfHoldEffects('task_x', effects);

      expect(self).toHaveLength(0);
      expect(remaining).toHaveLength(2);
    });

    it('applySelfHoldEffects applies hold to in-memory task', () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });
      const now = 1700000000000;
      const reviewAt = now + 300_000;

      const selfEffects: SyncEffect[] = [
        { type: 'apply_hold', taskId: task.id, reason: 'preempted', nextReviewAt: reviewAt },
      ];

      applySelfHoldEffects(task, selfEffects, now);

      const binding = task.metadata.goalBinding as GoalBinding;
      expect(binding.hold).toBeDefined();
      expect(binding.hold!.reason).toBe('preempted');
      expect(binding.hold!.heldAt).toBe(now);
      expect(binding.hold!.nextReviewAt).toBe(reviewAt);
    });

    it('applySelfHoldEffects clears hold from in-memory task', () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });
      applyHold(task, {
        reason: 'preempted',
        heldAt: Date.now(),
        resumeHints: [],
        nextReviewAt: Date.now() + 300_000,
      });

      const selfEffects: SyncEffect[] = [
        { type: 'clear_hold', taskId: task.id },
      ];

      applySelfHoldEffects(task, selfEffects);

      const binding = task.metadata.goalBinding as GoalBinding;
      expect(binding.hold).toBeUndefined();
    });

    it('hold is present at setTask boundary when self-effects applied before persist', () => {
      const task = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });
      const reviewAt = Date.now() + 300_000;

      const effects: SyncEffect[] = [
        { type: 'apply_hold', taskId: task.id, reason: 'preempted', nextReviewAt: reviewAt },
        { type: 'update_goal_status', goalId: 'g1', status: GoalStatus.SUSPENDED, reason: 'test' },
      ];

      // Use production helpers to partition and apply
      const { self, remaining } = partitionSelfHoldEffects(task.id, effects);
      applySelfHoldEffects(task, self);

      let holdPresentAtPersist = false;
      const originalSetTask = harness.taskStore.setTask.bind(harness.taskStore);
      vi.spyOn(harness.taskStore, 'setTask').mockImplementation((t: Task) => {
        if (t.id === task.id) {
          const binding = (t.metadata as any).goalBinding as GoalBinding | undefined;
          holdPresentAtPersist = binding?.hold?.reason === 'preempted';
        }
        originalSetTask(t);
      });

      task.status = 'paused';
      harness.taskStore.setTask(task);

      expect(holdPresentAtPersist).toBe(true);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].type).toBe('update_goal_status');

      vi.restoreAllMocks();
    });
  });

  // -------------------------------------------------------------------------
  // Test G: Cross-task effect routing invariant
  // Calls applyEffectsForTest (which delegates to the private
  // applyGoalProtocolEffects), spies on updateTaskStatus to prove
  // that update_task_status effects route through the mutator with
  // origin:'protocol'. This enforces the routing, not just demonstrates it.
  // -------------------------------------------------------------------------

  describe('cross-task effect routing via applyGoalProtocolEffects', () => {
    it('goal_paused effects route update_task_status through updateTaskStatus with origin:protocol', () => {
      const t1 = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });
      const t2 = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });

      // Produce known effects via onGoalAction
      const allTasks = [
        harness.taskStore.getTask(t1.id)!,
        harness.taskStore.getTask(t2.id)!,
      ];
      const hookResult = onGoalAction(
        { type: 'goal_paused', goalId: 'g1', reason: 'preempted' },
        allTasks,
      );

      // Verify the reducer produced the expected effects
      const holdEffects = hookResult.syncEffects.filter(e => e.type === 'apply_hold');
      const statusEffects = hookResult.syncEffects.filter(e => e.type === 'update_task_status');
      expect(holdEffects.length).toBe(2);
      expect(statusEffects.length).toBe(2);

      // Spy on updateTaskStatus BEFORE feeding effects through the production path
      const statusUpdateCalls: Array<{ taskId: string; status: string; origin?: string }> = [];
      const originalUpdate = harness.updateTaskStatus.bind(harness);
      vi.spyOn(harness, 'updateTaskStatus').mockImplementation(
        async (taskId: string, status: string, options?: MutationOptions) => {
          statusUpdateCalls.push({ taskId, status, origin: options?.origin });
          return originalUpdate(taskId, status, options);
        },
      );

      // Feed ALL effects through the production applyGoalProtocolEffects
      // via the public test accessor — this IS the code under test.
      const applied = harness.applyEffectsForTest(hookResult.syncEffects);

      // Verify update_task_status effects were routed through updateTaskStatus
      expect(statusUpdateCalls.length).toBe(2);
      for (const call of statusUpdateCalls) {
        expect(call.origin).toBe('protocol');
        expect(call.status).toBe('paused');
      }

      // Verify final state is consistent
      for (const taskId of [t1.id, t2.id]) {
        const updated = harness.taskStore.getTask(taskId)!;
        expect(updated.status).toBe('paused');
        const binding = updated.metadata.goalBinding as GoalBinding;
        expect(binding.hold).toBeDefined();
        expect(binding.hold!.reason).toBe('preempted');
      }

      // No hooks re-fired (origin:protocol suppresses re-entrancy)
      expect(harness.goalStatusUpdates.length).toBe(0);

      // Effect count: 2 hold + 2 status = 4 (noops excluded)
      expect(applied).toBe(4);

      vi.restoreAllMocks();
    });

    it('goal_cancelled effects route through applyGoalProtocolEffects correctly', () => {
      const t1 = harness.createGoalBoundTask({ goalId: 'g1', status: 'active' });

      // Pause t1 with a hold
      applyHold(t1, {
        reason: 'preempted',
        heldAt: Date.now(),
        resumeHints: [],
        nextReviewAt: Date.now() + 300_000,
      });
      t1.status = 'paused';
      harness.taskStore.setTask(t1);

      // Produce cancel effects
      const allTasks = [harness.taskStore.getTask(t1.id)!];
      const hookResult = onGoalAction(
        { type: 'goal_cancelled', goalId: 'g1', reason: 'user requested' },
        allTasks,
      );

      // Spy on updateTaskStatus
      const statusUpdateCalls: Array<{ taskId: string; status: string; origin?: string }> = [];
      const originalUpdate = harness.updateTaskStatus.bind(harness);
      vi.spyOn(harness, 'updateTaskStatus').mockImplementation(
        async (taskId: string, status: string, options?: MutationOptions) => {
          statusUpdateCalls.push({ taskId, status, origin: options?.origin });
          return originalUpdate(taskId, status, options);
        },
      );

      // Feed through production path
      harness.applyEffectsForTest(hookResult.syncEffects);

      // Status effect routed through updateTaskStatus with protocol origin
      expect(statusUpdateCalls.length).toBe(1);
      expect(statusUpdateCalls[0].origin).toBe('protocol');
      expect(statusUpdateCalls[0].status).toBe('failed');

      // Final state: failed, no hold
      const updated = harness.taskStore.getTask(t1.id)!;
      expect(updated.status).toBe('failed');
      const binding = updated.metadata.goalBinding as GoalBinding;
      expect(binding.hold).toBeUndefined();

      vi.restoreAllMocks();
    });
  });
});

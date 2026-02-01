/**
 * Periodic Review Backstop Tests
 *
 * Evidence for commit 11:
 * - Detects stale holds (overdue nextReviewAt)
 * - Produces clear_hold + pending effects for stale automated holds
 * - manual_pause produces noop (never auto-cleared)
 * - Detects goal-task drift and produces corrective effects
 * - Caps stale holds processed per cycle
 * - Scans only goal-bound tasks
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../../types/task';
import type { GoalBinding } from '../goal-binding-types';
import { GoalStatus } from '../../types';
import { createGoalBinding } from '../goal-identity';
import { requestHold } from '../goal-hold-manager';
import {
  runPeriodicReview,
  MAX_STALE_HOLDS_PER_CYCLE,
} from '../periodic-review';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGoalTask(
  id: string,
  goalId: string,
  status: Task['status'] = 'paused',
): Task {
  const binding = createGoalBinding({
    goalInstanceId: `inst_${id}`,
    goalType: 'build_shelter',
    provisionalKey: `key_${id}`,
    verifier: 'verify_shelter_v0',
    goalId,
  });

  return {
    id,
    title: 'Build shelter',
    description: 'test',
    type: 'building',
    priority: 0.5,
    urgency: 0.5,
    progress: 0,
    status,
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
}

function makePlainTask(id: string): Task {
  return {
    id,
    title: 'Plain',
    description: 'test',
    type: 'general',
    priority: 0.5,
    urgency: 0.5,
    progress: 0,
    status: 'pending',
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
}

const noGoals = () => undefined;
const goalStatus = (map: Record<string, GoalStatus>) => (id: string) => map[id];

// ---------------------------------------------------------------------------
// Stale holds
// ---------------------------------------------------------------------------

describe('Periodic Review — stale holds', () => {
  it('detects stale holds', () => {
    const task = makeGoalTask('t1', 'g1', 'paused');
    // Apply hold that's already overdue
    requestHold(task, 'preempted', { nextReviewAt: 50_000 });

    const result = runPeriodicReview([task], noGoals, 100_000);

    expect(result.staleHolds).toHaveLength(1);
    expect(result.staleHolds[0].taskId).toBe('t1');
    expect(result.staleHolds[0].holdReason).toBe('preempted');
    expect(result.staleHolds[0].overdueMs).toBe(50_000);
    expect(result.staleHolds[0].isManualPause).toBe(false);
  });

  it('produces clear_hold + pending effects for stale automated holds', () => {
    const task = makeGoalTask('t1', 'g1', 'paused');
    requestHold(task, 'materials_missing', { nextReviewAt: 50_000 });

    const result = runPeriodicReview([task], noGoals, 100_000);

    const clearEffects = result.effects.filter((e) => e.type === 'clear_hold');
    const statusEffects = result.effects.filter((e) => e.type === 'update_task_status');

    expect(clearEffects).toHaveLength(1);
    expect(statusEffects).toHaveLength(1);
    if (statusEffects[0].type === 'update_task_status') {
      expect(statusEffects[0].status).toBe('pending');
    }
  });

  it('manual_pause hold produces noop (never auto-cleared)', () => {
    const task = makeGoalTask('t1', 'g1', 'paused');
    requestHold(task, 'manual_pause');
    // Manually set nextReviewAt to past (unlikely but possible)
    (task.metadata.goalBinding as GoalBinding).hold!.nextReviewAt = 50_000;

    const result = runPeriodicReview([task], noGoals, 100_000);

    expect(result.staleHolds).toHaveLength(1);
    expect(result.staleHolds[0].isManualPause).toBe(true);

    // Effects should only contain noop for manual_pause
    const clearEffects = result.effects.filter((e) => e.type === 'clear_hold');
    expect(clearEffects).toHaveLength(0);
    const noopEffects = result.effects.filter((e) => e.type === 'noop');
    expect(noopEffects.length).toBeGreaterThanOrEqual(1);
  });

  it('non-stale holds are not reported', () => {
    const task = makeGoalTask('t1', 'g1', 'paused');
    requestHold(task, 'preempted', { nextReviewAt: 200_000 });

    const result = runPeriodicReview([task], noGoals, 100_000);

    expect(result.staleHolds).toHaveLength(0);
  });

  it('caps stale holds per cycle', () => {
    const tasks = Array.from({ length: 10 }, (_, i) => {
      const task = makeGoalTask(`t${i}`, `g${i}`, 'paused');
      requestHold(task, 'preempted', { nextReviewAt: 50_000 });
      return task;
    });

    const result = runPeriodicReview(tasks, noGoals, 100_000);

    // Should report all stale holds but only produce effects for MAX_STALE_HOLDS_PER_CYCLE
    expect(result.staleHolds).toHaveLength(10);
    const clearEffects = result.effects.filter((e) => e.type === 'clear_hold');
    expect(clearEffects).toHaveLength(MAX_STALE_HOLDS_PER_CYCLE);
  });
});

// ---------------------------------------------------------------------------
// Goal-task drift
// ---------------------------------------------------------------------------

describe('Periodic Review — drift detection', () => {
  it('detects drift and produces corrective effects', () => {
    const task = makeGoalTask('t1', 'g1', 'active');

    const result = runPeriodicReview(
      [task],
      goalStatus({ g1: GoalStatus.PENDING }),
      100_000,
    );

    expect(result.driftReports).toHaveLength(1);
    expect(result.driftReports[0].expectedGoalStatus).toBe(GoalStatus.ACTIVE);
    expect(result.driftReports[0].actualGoalStatus).toBe(GoalStatus.PENDING);

    // Should have corrective effect
    const goalEffects = result.effects.filter((e) => e.type === 'update_goal_status');
    expect(goalEffects).toHaveLength(1);
  });

  it('no drift when in sync', () => {
    const task = makeGoalTask('t1', 'g1', 'active');

    const result = runPeriodicReview(
      [task],
      goalStatus({ g1: GoalStatus.ACTIVE }),
      100_000,
    );

    expect(result.driftReports).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Non-goal-bound tasks
// ---------------------------------------------------------------------------

describe('Periodic Review — non-goal-bound tasks', () => {
  it('skips plain tasks', () => {
    const result = runPeriodicReview(
      [makePlainTask('t1')],
      noGoals,
      100_000,
    );

    expect(result.tasksScanned).toBe(0);
    expect(result.staleHolds).toHaveLength(0);
    expect(result.driftReports).toHaveLength(0);
  });
});

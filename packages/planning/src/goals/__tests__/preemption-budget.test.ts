/**
 * Preemption Budget + Safe-Stop Tests
 *
 * Evidence for commit 9:
 * - Budget creation with defaults (3 steps, 5s)
 * - Step consumption decrements remaining
 * - Budget exhausts after max steps
 * - Budget exhausts after max time
 * - HoldWitness captures lastStepId and moduleCursor
 * - PreemptionCoordinator lifecycle: signal → record → complete
 * - Coordinator idempotent on double-signal
 * - Coordinator cancel/revoke
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../../types/task';
import {
  createPreemptionBudget,
  consumeStep,
  checkBudget,
  buildHoldWitness,
  isValidWitness,
  PreemptionCoordinator,
  MAX_PREEMPTION_STEPS,
  MAX_PREEMPTION_TIME_MS,
} from '../preemption-budget';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTaskWithSteps(id: string, completedCount: number): Task {
  const steps = Array.from({ length: 5 }, (_, i) => ({
    id: `step_${i}`,
    label: `Step ${i}`,
    done: i < completedCount,
    order: i,
    meta: {},
  }));

  return {
    id,
    title: 'Build shelter',
    description: 'test',
    type: 'building',
    priority: 0.5,
    urgency: 0.5,
    progress: completedCount / 5,
    status: 'active',
    source: 'goal',
    steps,
    parameters: {},
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: [],
      category: 'building',
    },
  };
}

// ---------------------------------------------------------------------------
// createPreemptionBudget
// ---------------------------------------------------------------------------

describe('createPreemptionBudget', () => {
  it('creates budget with defaults', () => {
    const budget = createPreemptionBudget('t1');
    expect(budget.taskId).toBe('t1');
    expect(budget.stepsConsumed).toBe(0);
    expect(budget.maxSteps).toBe(MAX_PREEMPTION_STEPS);
    expect(budget.maxTimeMs).toBe(MAX_PREEMPTION_TIME_MS);
    expect(budget.exhausted).toBe(false);
    expect(budget.signalAt).toBeGreaterThan(0);
  });

  it('accepts custom limits', () => {
    const budget = createPreemptionBudget('t1', { maxSteps: 5, maxTimeMs: 10000 });
    expect(budget.maxSteps).toBe(5);
    expect(budget.maxTimeMs).toBe(10000);
  });
});

// ---------------------------------------------------------------------------
// consumeStep + checkBudget
// ---------------------------------------------------------------------------

describe('consumeStep', () => {
  it('records step consumption', () => {
    const budget = createPreemptionBudget('t1', { maxSteps: 3, now: 1000 });
    const result = consumeStep(budget, 1000);

    expect(result.within).toBe(true);
    if (result.within) {
      expect(result.stepsRemaining).toBe(2);
    }
    expect(budget.stepsConsumed).toBe(1);
  });

  it('exhausts after max steps', () => {
    const budget = createPreemptionBudget('t1', { maxSteps: 3, now: 1000 });
    consumeStep(budget, 1000);
    consumeStep(budget, 1500);
    const result = consumeStep(budget, 2000);

    expect(result.within).toBe(false);
    if (!result.within) {
      expect(result.reason).toBe('steps_exhausted');
    }
    expect(budget.exhausted).toBe(true);
  });

  it('exhausts after max time', () => {
    const budget = createPreemptionBudget('t1', { maxSteps: 10, maxTimeMs: 5000, now: 1000 });
    const result = consumeStep(budget, 7000); // 6 seconds elapsed

    expect(result.within).toBe(false);
    if (!result.within) {
      expect(result.reason).toBe('time_exhausted');
    }
    expect(budget.exhausted).toBe(true);
  });

  it('exhausts with both reasons', () => {
    const budget = createPreemptionBudget('t1', { maxSteps: 2, maxTimeMs: 5000, now: 1000 });
    consumeStep(budget, 1000);
    const result = consumeStep(budget, 7000); // step limit AND time limit

    expect(result.within).toBe(false);
    if (!result.within) {
      expect(result.reason).toBe('both_exhausted');
    }
  });
});

describe('checkBudget', () => {
  it('returns remaining capacity', () => {
    const budget = createPreemptionBudget('t1', { maxSteps: 3, maxTimeMs: 5000, now: 1000 });
    const result = checkBudget(budget, 2000);

    expect(result.within).toBe(true);
    if (result.within) {
      expect(result.stepsRemaining).toBe(3);
      expect(result.timeRemainingMs).toBe(4000);
    }
  });

  it('does not consume steps', () => {
    const budget = createPreemptionBudget('t1', { now: 1000 });
    checkBudget(budget, 2000);
    checkBudget(budget, 3000);
    expect(budget.stepsConsumed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildHoldWitness
// ---------------------------------------------------------------------------

describe('buildHoldWitness', () => {
  it('captures lastStepId from completed steps', () => {
    const task = makeTaskWithSteps('t1', 3); // steps 0,1,2 done
    const witness = buildHoldWitness(task);

    expect(witness.lastStepId).toBe('step_2');
    expect(witness.verified).toBe(false);
  });

  it('captures verified flag', () => {
    const task = makeTaskWithSteps('t1', 2);
    const witness = buildHoldWitness(task, true);

    expect(witness.verified).toBe(true);
  });

  it('handles no completed steps', () => {
    const task = makeTaskWithSteps('t1', 0);
    const witness = buildHoldWitness(task);

    expect(witness.lastStepId).toBeUndefined();
    expect(witness.moduleCursor).toBeUndefined();
  });

  it('captures moduleCursor from build metadata', () => {
    const task = makeTaskWithSteps('t1', 3);
    (task.metadata as any).build = { moduleCursor: 2, totalModules: 5 };
    const witness = buildHoldWitness(task);

    expect(witness.moduleCursor).toBe(2);
  });
});

describe('isValidWitness', () => {
  it('valid with lastStepId', () => {
    expect(isValidWitness({ lastStepId: 'step_3', verified: false })).toBe(true);
  });

  it('valid with moduleCursor', () => {
    expect(isValidWitness({ moduleCursor: 2, verified: false })).toBe(true);
  });

  it('invalid with no identifying fields', () => {
    expect(isValidWitness({ verified: false })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PreemptionCoordinator
// ---------------------------------------------------------------------------

describe('PreemptionCoordinator', () => {
  it('signal creates a budget', () => {
    const coord = new PreemptionCoordinator();
    const budget = coord.signal('t1');

    expect(budget.taskId).toBe('t1');
    expect(coord.isPreempting('t1')).toBe(true);
    expect(coord.activeCount).toBe(1);
  });

  it('double-signal returns existing budget', () => {
    const coord = new PreemptionCoordinator();
    const first = coord.signal('t1');
    const second = coord.signal('t1');

    expect(first).toBe(second); // Same budget object
  });

  it('recordStep tracks consumption', () => {
    const coord = new PreemptionCoordinator();
    coord.signal('t1', { maxSteps: 3, now: 1000 });

    const r1 = coord.recordStep('t1', 1000);
    expect(r1).not.toBeNull();
    expect(r1!.within).toBe(true);

    coord.recordStep('t1', 1500);
    const r3 = coord.recordStep('t1', 2000);
    expect(r3!.within).toBe(false);
  });

  it('returns null for untracked tasks', () => {
    const coord = new PreemptionCoordinator();
    expect(coord.recordStep('unknown')).toBeNull();
    expect(coord.check('unknown')).toBeNull();
  });

  it('complete builds witness and cleans up', () => {
    const coord = new PreemptionCoordinator();
    coord.signal('t1');

    const task = makeTaskWithSteps('t1', 3);
    const witness = coord.complete(task, true);

    expect(witness.lastStepId).toBe('step_2');
    expect(witness.verified).toBe(true);
    expect(coord.isPreempting('t1')).toBe(false);
    expect(coord.activeCount).toBe(0);
  });

  it('cancel removes the budget', () => {
    const coord = new PreemptionCoordinator();
    coord.signal('t1');

    expect(coord.cancel('t1')).toBe(true);
    expect(coord.isPreempting('t1')).toBe(false);
    expect(coord.cancel('t1')).toBe(false); // Already gone
  });

  it('multiple tasks tracked independently', () => {
    const coord = new PreemptionCoordinator();
    coord.signal('t1', { maxSteps: 2, now: 1000 });
    coord.signal('t2', { maxSteps: 5, now: 1000 });

    coord.recordStep('t1', 1000);
    coord.recordStep('t1', 1000);
    // t1 exhausted
    expect(coord.check('t1', 1000)!.within).toBe(false);
    // t2 still active
    expect(coord.check('t2', 1000)!.within).toBe(true);

    expect(coord.activeCount).toBe(1); // Only t2 active
  });

  it('full lifecycle: signal → steps → exhaust → complete', () => {
    const coord = new PreemptionCoordinator();
    const budget = coord.signal('t1', { maxSteps: 2, now: 1000 });

    // Step 1: within budget
    const r1 = coord.recordStep('t1', 1500);
    expect(r1!.within).toBe(true);

    // Step 2: budget exhausted
    const r2 = coord.recordStep('t1', 2000);
    expect(r2!.within).toBe(false);

    // Build witness and clean up
    const task = makeTaskWithSteps('t1', 4);
    const witness = coord.complete(task, true);

    expect(witness.lastStepId).toBe('step_3');
    expect(witness.verified).toBe(true);
    expect(coord.getBudget('t1')).toBeUndefined();
  });
});

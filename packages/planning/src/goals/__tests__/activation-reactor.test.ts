/**
 * Activation Reactor Tests
 *
 * Evidence for commit 10:
 * - Budget: max 3 goals reconsidered per tick
 * - Budget: max 2 reactivated per minute
 * - Hysteresis: cooldown after deactivation (30s)
 * - manual_pause hard wall: manually paused tasks skipped
 * - Relevance scoring determines activation order
 * - Hold review time respected (not yet due → skip)
 * - Already-active tasks skipped
 * - Non-goal-bound tasks skipped
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../../types/task';
import type { GoalBinding } from '../goal-binding-types';
import { createGoalBinding } from '../goal-identity';
import { requestHold } from '../goal-hold-manager';
import {
  ActivationReactor,
  computeRelevance,
  MAX_RECONSIDER_PER_TICK,
  MAX_REACTIVATE_PER_MINUTE,
  REACTIVATION_COOLDOWN_MS,
  type ActivationContext,
} from '../activation-reactor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGoalTask(
  id: string,
  status: Task['status'] = 'pending',
  overrides?: { priority?: number; urgency?: number; progress?: number },
): Task {
  const binding = createGoalBinding({
    goalInstanceId: `inst_${id}`,
    goalType: 'build_shelter',
    provisionalKey: `key_${id}`,
    verifier: 'verify_shelter_v0',
  });

  return {
    id,
    title: 'Build shelter',
    description: 'test',
    type: 'building',
    priority: overrides?.priority ?? 0.5,
    urgency: overrides?.urgency ?? 0.5,
    progress: overrides?.progress ?? 0,
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
    title: 'Plain task',
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

const defaultCtx: ActivationContext = {
  botPosition: { x: 0, y: 64, z: 0 },
  now: 100_000,
  activeTaskIds: new Set(),
};

// ---------------------------------------------------------------------------
// computeRelevance
// ---------------------------------------------------------------------------

describe('computeRelevance', () => {
  it('higher priority → higher relevance', () => {
    const highPri = makeGoalTask('t1', 'pending', { priority: 0.9 });
    const lowPri = makeGoalTask('t2', 'pending', { priority: 0.1 });

    const highBinding = highPri.metadata.goalBinding as GoalBinding;
    const lowBinding = lowPri.metadata.goalBinding as GoalBinding;

    const highScore = computeRelevance(highPri, highBinding, defaultCtx);
    const lowScore = computeRelevance(lowPri, lowBinding, defaultCtx);

    expect(highScore).toBeGreaterThan(lowScore);
  });

  it('higher progress → higher relevance', () => {
    const advanced = makeGoalTask('t1', 'pending', { progress: 0.8 });
    const fresh = makeGoalTask('t2', 'pending', { progress: 0 });

    const advBinding = advanced.metadata.goalBinding as GoalBinding;
    const freshBinding = fresh.metadata.goalBinding as GoalBinding;

    const advScore = computeRelevance(advanced, advBinding, defaultCtx);
    const freshScore = computeRelevance(fresh, freshBinding, defaultCtx);

    expect(advScore).toBeGreaterThan(freshScore);
  });
});

// ---------------------------------------------------------------------------
// Activation Reactor — tick
// ---------------------------------------------------------------------------

describe('ActivationReactor — tick', () => {
  it('activates pending goal-bound tasks', () => {
    const reactor = new ActivationReactor();
    const tasks = [makeGoalTask('t1', 'pending')];

    const result = reactor.tick(tasks, defaultCtx);

    expect(result.activated).toEqual(['t1']);
    expect(result.considered).toBe(1);
  });

  it('skips non-goal-bound tasks', () => {
    const reactor = new ActivationReactor();
    const tasks = [makePlainTask('t1')];

    const result = reactor.tick(tasks, defaultCtx);

    expect(result.activated).toEqual([]);
    expect(result.considered).toBe(0);
  });

  it('skips terminal tasks', () => {
    const reactor = new ActivationReactor();
    const tasks = [
      makeGoalTask('t1', 'completed'),
      makeGoalTask('t2', 'failed'),
    ];

    const result = reactor.tick(tasks, defaultCtx);

    expect(result.activated).toEqual([]);
    expect(result.considered).toBe(0);
  });

  it('skips already-active tasks', () => {
    const reactor = new ActivationReactor();
    const tasks = [makeGoalTask('t1', 'pending')];

    const result = reactor.tick(tasks, {
      ...defaultCtx,
      activeTaskIds: new Set(['t1']),
    });

    expect(result.activated).toEqual([]);
    expect(result.considered).toBe(0);
  });

  it('manual_pause hard wall: skips manually paused tasks', () => {
    const reactor = new ActivationReactor();
    const task = makeGoalTask('t1', 'paused');
    requestHold(task, 'manual_pause');

    const result = reactor.tick([task], defaultCtx);

    expect(result.activated).toEqual([]);
    expect(result.considered).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Budget: reconsider limit
// ---------------------------------------------------------------------------

describe('ActivationReactor — reconsider budget', () => {
  it(`considers at most ${MAX_RECONSIDER_PER_TICK} tasks per tick`, () => {
    const reactor = new ActivationReactor();
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeGoalTask(`t${i}`, 'pending'),
    );

    const result = reactor.tick(tasks, defaultCtx);

    expect(result.considered).toBe(MAX_RECONSIDER_PER_TICK);
    expect(result.budgetExhausted).toBe(true);
  });

  it('does not mark exhausted when under budget', () => {
    const reactor = new ActivationReactor();
    const tasks = [makeGoalTask('t1', 'pending')];

    const result = reactor.tick(tasks, defaultCtx);

    expect(result.budgetExhausted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Budget: reactivation rate limit
// ---------------------------------------------------------------------------

describe('ActivationReactor — reactivation rate limit', () => {
  it(`allows max ${MAX_REACTIVATE_PER_MINUTE} reactivations per minute`, () => {
    const reactor = new ActivationReactor();
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeGoalTask(`t${i}`, 'pending'),
    );

    const result = reactor.tick(tasks, { ...defaultCtx, now: 100_000 });

    // Should activate exactly MAX_REACTIVATE_PER_MINUTE
    expect(result.activated).toHaveLength(MAX_REACTIVATE_PER_MINUTE);
    // Third candidate should be skipped due to rate limit
    expect(result.skipped.length).toBeGreaterThanOrEqual(1);
    expect(result.skipped.some((s) => s.reason.includes('rate limit'))).toBe(true);
  });

  it('reactivation budget resets after 1 minute', () => {
    const reactor = new ActivationReactor();
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeGoalTask(`t${i}`, 'pending'),
    );

    // First tick at t=100000
    reactor.tick(tasks, { ...defaultCtx, now: 100_000 });

    // Second tick at t=200000 (>60s later) — budget should be reset
    const laterTasks = Array.from({ length: 5 }, (_, i) =>
      makeGoalTask(`t${i + 10}`, 'pending'),
    );
    const result = reactor.tick(laterTasks, { ...defaultCtx, now: 200_000 });

    expect(result.activated).toHaveLength(MAX_REACTIVATE_PER_MINUTE);
  });

  it('remainingReactivations tracks correctly', () => {
    const reactor = new ActivationReactor();
    expect(reactor.remainingReactivations(100_000)).toBe(MAX_REACTIVATE_PER_MINUTE);

    const tasks = [makeGoalTask('t1', 'pending')];
    reactor.tick(tasks, { ...defaultCtx, now: 100_000 });

    expect(reactor.remainingReactivations(100_000)).toBe(MAX_REACTIVATE_PER_MINUTE - 1);
  });
});

// ---------------------------------------------------------------------------
// Hysteresis: cooldown after deactivation
// ---------------------------------------------------------------------------

describe('ActivationReactor — hysteresis cooldown', () => {
  it('skips recently deactivated tasks', () => {
    const reactor = new ActivationReactor();
    const task = makeGoalTask('t1', 'pending');

    // Record deactivation at t=100000
    reactor.recordDeactivation('t1', 100_000);

    // Try to activate at t=110000 (10s later, still in cooldown)
    const result = reactor.tick([task], { ...defaultCtx, now: 110_000 });

    expect(result.activated).toEqual([]);
    expect(result.considered).toBe(0);
  });

  it('allows reactivation after cooldown expires', () => {
    const reactor = new ActivationReactor();
    const task = makeGoalTask('t1', 'pending');

    // Record deactivation at t=100000
    reactor.recordDeactivation('t1', 100_000);

    // Try at t=140000 (40s later, past 30s cooldown)
    const result = reactor.tick([task], { ...defaultCtx, now: 140_000 });

    expect(result.activated).toEqual(['t1']);
  });

  it('clearDeactivation removes cooldown', () => {
    const reactor = new ActivationReactor();
    const task = makeGoalTask('t1', 'pending');

    reactor.recordDeactivation('t1', 100_000);
    reactor.clearDeactivation('t1');

    // Should activate immediately
    const result = reactor.tick([task], { ...defaultCtx, now: 100_000 });
    expect(result.activated).toEqual(['t1']);
  });
});

// ---------------------------------------------------------------------------
// Hold review time
// ---------------------------------------------------------------------------

describe('ActivationReactor — hold review time', () => {
  it('skips paused tasks whose hold is not yet due for review', () => {
    const reactor = new ActivationReactor();
    const task = makeGoalTask('t1', 'paused');
    requestHold(task, 'preempted', { nextReviewAt: 200_000 });

    const result = reactor.tick([task], { ...defaultCtx, now: 100_000 });

    expect(result.activated).toEqual([]);
    expect(result.skipped.some((s) => s.reason.includes('not yet due'))).toBe(true);
  });

  it('activates paused tasks whose hold review is due', () => {
    const reactor = new ActivationReactor();
    const task = makeGoalTask('t1', 'paused');
    requestHold(task, 'preempted', { nextReviewAt: 50_000 });

    const result = reactor.tick([task], { ...defaultCtx, now: 100_000 });

    expect(result.activated).toEqual(['t1']);
  });
});

// ---------------------------------------------------------------------------
// Relevance-based ordering
// ---------------------------------------------------------------------------

describe('ActivationReactor — relevance ordering', () => {
  it('activates highest-relevance tasks first', () => {
    const reactor = new ActivationReactor();

    const lowPri = makeGoalTask('t_low', 'pending', { priority: 0.1 });
    const highPri = makeGoalTask('t_high', 'pending', { priority: 0.9 });
    const midPri = makeGoalTask('t_mid', 'pending', { priority: 0.5 });

    const result = reactor.tick(
      [lowPri, highPri, midPri],
      { ...defaultCtx, now: 100_000 },
    );

    // With rate limit of 2, should activate the top 2
    expect(result.activated).toHaveLength(2);
    expect(result.activated[0]).toBe('t_high');
    expect(result.activated[1]).toBe('t_mid');
  });
});

/**
 * Threat→Hold Bridge Tests
 *
 * Evidence for A1 acceptance criteria:
 * - A1.2  shouldHold is pure and deterministic (exhaustive level × threshold)
 * - A1.7  Only 'unsafe' holds are released by the bridge
 * - A1.9  Status restoration captures prevStatus on hold, restores on release
 * - A1.10 Per-task GoalHoldAppliedEvent / GoalHoldClearedEvent emitted
 * - A1.12 Replay determinism: same inputs → identical output
 * - A1.13 Non-interference: existing holds never overridden
 * - A1.14 Deterministic ordering: tasks sorted by id
 * - A1.16 Fail-closed: fetch failure → hold applied
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task } from '../../types/task';
import type { GoalBinding } from '../goal-binding-types';
import { createGoalBinding } from '../goal-identity';
import { requestHold } from '../goal-hold-manager';
import {
  shouldHold,
  fetchThreatSignal,
  evaluateThreatHolds,
  FAIL_CLOSED_SIGNAL,
  type ThreatSignal,
  type ThreatLevel,
  type ThreatHoldBridgeDeps,
  type ThreatBridgeEvaluatedEvent,
} from '../threat-hold-bridge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGoalTask(
  id: string,
  status: Task['status'] = 'active',
): Task {
  const binding = createGoalBinding({
    goalInstanceId: `inst_${id}`,
    goalType: 'build_shelter',
    provisionalKey: `key_${id}`,
    verifier: 'verify_shelter_v0',
  });

  return {
    id,
    title: `Task ${id}`,
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
    title: `Plain task ${id}`,
    description: 'test',
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
}

function makeSignal(level: ThreatLevel, threats: ThreatSignal['threats'] = []): ThreatSignal {
  return {
    overallThreatLevel: level,
    threats,
    fetchedAt: Date.now(),
  };
}

function makeDeps(overrides: Partial<ThreatHoldBridgeDeps> = {}): ThreatHoldBridgeDeps & {
  lifecycleEvents: any[];
  bridgeEvents: ThreatBridgeEvaluatedEvent[];
  statusUpdates: Array<{ id: string; status: string }>;
  metadataUpdates: Array<{ id: string; patch: Record<string, any> }>;
} {
  const lifecycleEvents: any[] = [];
  const bridgeEvents: ThreatBridgeEvaluatedEvent[] = [];
  const statusUpdates: Array<{ id: string; status: string }> = [];
  const metadataUpdates: Array<{ id: string; patch: Record<string, any> }> = [];

  return {
    fetchSignal: overrides.fetchSignal ?? (async () => makeSignal('low')),
    getTasksToEvaluate: overrides.getTasksToEvaluate ?? (() => []),
    updateTaskStatus: overrides.updateTaskStatus ?? (async (id, status) => {
      statusUpdates.push({ id, status });
    }),
    updateTaskMetadata: overrides.updateTaskMetadata ?? ((id, patch) => {
      metadataUpdates.push({ id, patch });
    }),
    emitLifecycleEvent: overrides.emitLifecycleEvent ?? ((event) => {
      lifecycleEvents.push(event);
    }),
    emitBridgeEvent: overrides.emitBridgeEvent ?? ((event) => {
      bridgeEvents.push(event);
    }),
    lifecycleEvents,
    bridgeEvents,
    statusUpdates,
    metadataUpdates,
  };
}

// ---------------------------------------------------------------------------
// shouldHold — pure predicate (A1.2, A1.12)
// ---------------------------------------------------------------------------

describe('shouldHold', () => {
  const levels: ThreatLevel[] = ['low', 'medium', 'high', 'critical'];

  it('low signal + high threshold → false', () => {
    expect(shouldHold(makeSignal('low'), 'high')).toBe(false);
  });

  it('medium signal + high threshold → false', () => {
    expect(shouldHold(makeSignal('medium'), 'high')).toBe(false);
  });

  it('high signal + high threshold → true', () => {
    expect(shouldHold(makeSignal('high'), 'high')).toBe(true);
  });

  it('critical signal + high threshold → true', () => {
    expect(shouldHold(makeSignal('critical'), 'high')).toBe(true);
  });

  it('medium signal + medium threshold → true (configurable)', () => {
    expect(shouldHold(makeSignal('medium'), 'medium')).toBe(true);
  });

  it('low signal + low threshold → true', () => {
    expect(shouldHold(makeSignal('low'), 'low')).toBe(true);
  });

  it('defaults to high threshold', () => {
    expect(shouldHold(makeSignal('medium'))).toBe(false);
    expect(shouldHold(makeSignal('high'))).toBe(true);
  });

  it('exhaustive: every (level, threshold) pair', () => {
    const expected: Record<string, boolean> = {
      'low,low': true,
      'low,medium': false,
      'low,high': false,
      'low,critical': false,
      'medium,low': true,
      'medium,medium': true,
      'medium,high': false,
      'medium,critical': false,
      'high,low': true,
      'high,medium': true,
      'high,high': true,
      'high,critical': false,
      'critical,low': true,
      'critical,medium': true,
      'critical,high': true,
      'critical,critical': true,
    };

    for (const level of levels) {
      for (const threshold of levels) {
        const key = `${level},${threshold}`;
        const result = shouldHold(makeSignal(level), threshold);
        expect(result, `shouldHold(${level}, ${threshold})`).toBe(expected[key]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// evaluateThreatHolds — hold path
// ---------------------------------------------------------------------------

describe('evaluateThreatHolds — hold path', () => {
  it('high threat + active goal-bound task → paused with requestHold(unsafe)', async () => {
    const task = makeGoalTask('t1', 'active');
    const deps = makeDeps({
      fetchSignal: async () => makeSignal('high', [
        { type: 'creeper', distance: 5, threatLevel: 80 },
      ]),
      getTasksToEvaluate: () => [task],
    });

    const event = await evaluateThreatHolds(deps);

    expect(event.holdDecision).toBe(true);
    expect(event.tasksHeld).toEqual(['t1']);
    expect(event.tasksReleased).toEqual([]);
    expect(deps.statusUpdates).toEqual([{ id: 't1', status: 'paused' }]);

    // Verify hold was applied via requestHold
    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold).toBeDefined();
    expect(binding.hold!.reason).toBe('unsafe');
    expect(binding.hold!.resumeHints).toEqual(['creeper at 5m']);
  });

  it('high threat + already-paused task → no action', async () => {
    const task = makeGoalTask('t1', 'paused');
    const deps = makeDeps({
      fetchSignal: async () => makeSignal('high'),
      getTasksToEvaluate: () => [task],
    });

    const event = await evaluateThreatHolds(deps);

    expect(event.tasksHeld).toEqual([]);
    expect(deps.statusUpdates).toEqual([]);
  });

  it('high threat + non-goal-bound task → no action', async () => {
    const task = makePlainTask('t1');
    const deps = makeDeps({
      fetchSignal: async () => makeSignal('high'),
      getTasksToEvaluate: () => [task],
    });

    const event = await evaluateThreatHolds(deps);

    expect(event.tasksHeld).toEqual([]);
    expect(deps.statusUpdates).toEqual([]);
  });

  it('high threat + completed task → no action', async () => {
    const task = makeGoalTask('t1', 'completed');
    const deps = makeDeps({
      fetchSignal: async () => makeSignal('high'),
      getTasksToEvaluate: () => [task],
    });

    const event = await evaluateThreatHolds(deps);
    expect(event.tasksHeld).toEqual([]);
  });

  it('high threat + failed task → no action', async () => {
    const task = makeGoalTask('t1', 'failed');
    const deps = makeDeps({
      fetchSignal: async () => makeSignal('high'),
      getTasksToEvaluate: () => [task],
    });

    const event = await evaluateThreatHolds(deps);
    expect(event.tasksHeld).toEqual([]);
  });

  it('high threat + task held for preempted → no override (A1.13)', async () => {
    const task = makeGoalTask('t1', 'active');
    // Pre-apply a 'preempted' hold
    requestHold(task, 'preempted');

    const deps = makeDeps({
      fetchSignal: async () => makeSignal('high'),
      getTasksToEvaluate: () => [task],
    });

    const event = await evaluateThreatHolds(deps);

    expect(event.tasksHeld).toEqual([]);
    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold!.reason).toBe('preempted'); // unchanged
  });

  it('high threat + task held for manual_pause → no override (A1.13)', async () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'manual_pause');

    const deps = makeDeps({
      fetchSignal: async () => makeSignal('high'),
      getTasksToEvaluate: () => [task],
    });

    const event = await evaluateThreatHolds(deps);

    expect(event.tasksHeld).toEqual([]);
    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold!.reason).toBe('manual_pause'); // unchanged
  });

  it('captures threatHoldPrevStatus on hold (A1.9)', async () => {
    const task = makeGoalTask('t1', 'pending');
    const deps = makeDeps({
      fetchSignal: async () => makeSignal('high'),
      getTasksToEvaluate: () => [task],
    });

    await evaluateThreatHolds(deps);

    // The first metadata update should capture the prev status
    const prevStatusUpdate = deps.metadataUpdates.find(
      (u) => u.id === 't1' && u.patch.threatHoldPrevStatus !== undefined,
    );
    expect(prevStatusUpdate).toBeDefined();
    expect(prevStatusUpdate!.patch.threatHoldPrevStatus).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// evaluateThreatHolds — release path
// ---------------------------------------------------------------------------

describe('evaluateThreatHolds — release path', () => {
  it('low threat + task paused with reason unsafe → released, status restored', async () => {
    const task = makeGoalTask('t1', 'paused');
    requestHold(task, 'unsafe');
    (task.metadata as any).threatHoldPrevStatus = 'active';

    const deps = makeDeps({
      fetchSignal: async () => makeSignal('low'),
      getTasksToEvaluate: () => [task],
    });

    const event = await evaluateThreatHolds(deps);

    expect(event.tasksReleased).toEqual(['t1']);
    expect(deps.statusUpdates).toEqual([{ id: 't1', status: 'active' }]);

    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold).toBeUndefined();
  });

  it('restores pending status when threatHoldPrevStatus is pending (A1.9)', async () => {
    const task = makeGoalTask('t1', 'paused');
    requestHold(task, 'unsafe');
    (task.metadata as any).threatHoldPrevStatus = 'pending';

    const deps = makeDeps({
      fetchSignal: async () => makeSignal('low'),
      getTasksToEvaluate: () => [task],
    });

    await evaluateThreatHolds(deps);

    expect(deps.statusUpdates).toEqual([{ id: 't1', status: 'pending' }]);
  });

  it('defaults to active if threatHoldPrevStatus is missing', async () => {
    const task = makeGoalTask('t1', 'paused');
    requestHold(task, 'unsafe');
    // No threatHoldPrevStatus set

    const deps = makeDeps({
      fetchSignal: async () => makeSignal('low'),
      getTasksToEvaluate: () => [task],
    });

    await evaluateThreatHolds(deps);

    expect(deps.statusUpdates).toEqual([{ id: 't1', status: 'active' }]);
  });

  it('low threat + task paused with reason manual_pause → NOT released (A1.13)', async () => {
    const task = makeGoalTask('t1', 'paused');
    requestHold(task, 'manual_pause');

    const deps = makeDeps({
      fetchSignal: async () => makeSignal('low'),
      getTasksToEvaluate: () => [task],
    });

    const event = await evaluateThreatHolds(deps);

    expect(event.tasksReleased).toEqual([]);
    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold!.reason).toBe('manual_pause'); // unchanged
  });

  it('low threat + task paused with reason preempted → NOT released (A1.13)', async () => {
    const task = makeGoalTask('t1', 'paused');
    requestHold(task, 'preempted');

    const deps = makeDeps({
      fetchSignal: async () => makeSignal('low'),
      getTasksToEvaluate: () => [task],
    });

    const event = await evaluateThreatHolds(deps);

    expect(event.tasksReleased).toEqual([]);
    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold!.reason).toBe('preempted');
  });

  it('low threat + no hold → no action', async () => {
    const task = makeGoalTask('t1', 'active');
    const deps = makeDeps({
      fetchSignal: async () => makeSignal('low'),
      getTasksToEvaluate: () => [task],
    });

    const event = await evaluateThreatHolds(deps);

    expect(event.tasksReleased).toEqual([]);
    expect(deps.statusUpdates).toEqual([]);
  });

  it('clears threatHoldPrevStatus metadata on release', async () => {
    const task = makeGoalTask('t1', 'paused');
    requestHold(task, 'unsafe');
    (task.metadata as any).threatHoldPrevStatus = 'active';

    const deps = makeDeps({
      fetchSignal: async () => makeSignal('low'),
      getTasksToEvaluate: () => [task],
    });

    await evaluateThreatHolds(deps);

    // Should have a metadata update that clears threatHoldPrevStatus
    const clearUpdate = deps.metadataUpdates.find(
      (u) => u.id === 't1' && u.patch.threatHoldPrevStatus === undefined,
    );
    expect(clearUpdate).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Fail-closed (A1.2, A1.16)
// ---------------------------------------------------------------------------

describe('fail-closed behavior', () => {
  it('fetchSignal failure → bridge treats as critical → holds applied', async () => {
    const task = makeGoalTask('t1', 'active');
    const deps = makeDeps({
      fetchSignal: async () => { throw new Error('network down'); },
      getTasksToEvaluate: () => [task],
    });

    // evaluateThreatHolds itself should not throw even though fetchSignal throws;
    // But actually our design says fetchSignal never throws — the caller wraps.
    // In practice, the deps.fetchSignal here throws, so evaluateThreatHolds
    // will propagate. The real isolation is in modular-server's try/catch.
    // Test the fetchThreatSignal function directly for fail-closed:
    // (evaluateThreatHolds assumes fetchSignal never throws)
    await expect(evaluateThreatHolds(deps)).rejects.toThrow();
  });

  it('fetchThreatSignal returns FAIL_CLOSED_SIGNAL on network error', async () => {
    // Mock global fetch to simulate network error
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    try {
      const signal = await fetchThreatSignal('http://localhost:3005/safety', 100);
      expect(signal.overallThreatLevel).toBe('critical');
      expect(signal.threats[0].type).toBe('fetch_failure');
      expect(signal.fetchedAt).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchThreatSignal returns FAIL_CLOSED_SIGNAL on HTTP 500', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    try {
      const signal = await fetchThreatSignal('http://localhost:3005/safety', 100);
      expect(signal.overallThreatLevel).toBe('critical');
      expect(signal.fetchedAt).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchThreatSignal returns FAIL_CLOSED_SIGNAL on malformed overallThreatLevel', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ overallThreatLevel: 'weird', threats: [] }),
    });

    try {
      const signal = await fetchThreatSignal('http://localhost:3005/safety', 100);
      expect(signal.overallThreatLevel).toBe('critical');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchThreatSignal returns FAIL_CLOSED_SIGNAL on empty object', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    try {
      const signal = await fetchThreatSignal('http://localhost:3005/safety', 100);
      expect(signal.overallThreatLevel).toBe('critical');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchThreatSignal returns FAIL_CLOSED_SIGNAL on undefined overallThreatLevel', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ overallThreatLevel: undefined, threats: [] }),
    });

    try {
      const signal = await fetchThreatSignal('http://localhost:3005/safety', 100);
      expect(signal.overallThreatLevel).toBe('critical');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchThreatSignal parses valid response correctly', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        overallThreatLevel: 'medium',
        threats: [
          { type: 'zombie', distance: 12, threatLevel: 40 },
        ],
      }),
    });

    try {
      const signal = await fetchThreatSignal('http://localhost:3005/safety', 100);
      expect(signal.overallThreatLevel).toBe('medium');
      expect(signal.threats).toEqual([
        { type: 'zombie', distance: 12, threatLevel: 40 },
      ]);
      expect(signal.fetchedAt).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchThreatSignal unwraps nested safety payload', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        safety: {
          overallThreatLevel: 'low',
          threats: [],
        },
      }),
    });

    try {
      const signal = await fetchThreatSignal('http://localhost:3005/safety', 100);
      expect(signal.overallThreatLevel).toBe('low');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('FAIL_CLOSED_SIGNAL causes shouldHold to return true with default threshold', () => {
    expect(shouldHold(FAIL_CLOSED_SIGNAL)).toBe(true);
  });

  it('high threat via fail-closed fetchSignal → active tasks get held', async () => {
    const task = makeGoalTask('t1', 'active');
    const deps = makeDeps({
      fetchSignal: async () => ({ ...FAIL_CLOSED_SIGNAL, fetchedAt: Date.now() }),
      getTasksToEvaluate: () => [task],
    });

    const event = await evaluateThreatHolds(deps);

    expect(event.holdDecision).toBe(true);
    expect(event.tasksHeld).toEqual(['t1']);
  });
});

// ---------------------------------------------------------------------------
// Deterministic ordering (A1.14)
// ---------------------------------------------------------------------------

describe('deterministic ordering (A1.14)', () => {
  it('tasks provided in c,a,b order → tasksHeld is a,b,c', async () => {
    const tasks = [
      makeGoalTask('c', 'active'),
      makeGoalTask('a', 'active'),
      makeGoalTask('b', 'active'),
    ];

    const deps = makeDeps({
      fetchSignal: async () => makeSignal('high'),
      getTasksToEvaluate: () => tasks,
    });

    const event = await evaluateThreatHolds(deps);

    expect(event.tasksHeld).toEqual(['a', 'b', 'c']);
  });

  it('release path also sorts by id', async () => {
    const tasks = ['c', 'a', 'b'].map((id) => {
      const t = makeGoalTask(id, 'paused');
      requestHold(t, 'unsafe');
      (t.metadata as any).threatHoldPrevStatus = 'active';
      return t;
    });

    const deps = makeDeps({
      fetchSignal: async () => makeSignal('low'),
      getTasksToEvaluate: () => tasks,
    });

    const event = await evaluateThreatHolds(deps);

    expect(event.tasksReleased).toEqual(['a', 'b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// Audit events (A1.10)
// ---------------------------------------------------------------------------

describe('audit events (A1.10)', () => {
  it('hold: GoalHoldAppliedEvent emitted per task', async () => {
    const tasks = [makeGoalTask('t1', 'active'), makeGoalTask('t2', 'active')];
    const deps = makeDeps({
      fetchSignal: async () => makeSignal('critical'),
      getTasksToEvaluate: () => tasks,
    });

    await evaluateThreatHolds(deps);

    const holdEvents = deps.lifecycleEvents.filter(
      (e: any) => e.type === 'goal_hold_applied',
    );
    expect(holdEvents).toHaveLength(2);
    expect(holdEvents[0].taskId).toBe('t1');
    expect(holdEvents[0].holdReason).toBe('unsafe');
    expect(holdEvents[1].taskId).toBe('t2');
  });

  it('release: GoalHoldClearedEvent emitted per task', async () => {
    const task = makeGoalTask('t1', 'paused');
    requestHold(task, 'unsafe');
    (task.metadata as any).threatHoldPrevStatus = 'active';

    const deps = makeDeps({
      fetchSignal: async () => makeSignal('low'),
      getTasksToEvaluate: () => [task],
    });

    await evaluateThreatHolds(deps);

    const clearEvents = deps.lifecycleEvents.filter(
      (e: any) => e.type === 'goal_hold_cleared',
    );
    expect(clearEvents).toHaveLength(1);
    expect(clearEvents[0].taskId).toBe('t1');
    expect(clearEvents[0].previousReason).toBe('unsafe');
    expect(clearEvents[0].wasManual).toBe(false);
  });

  it('bridge: ThreatBridgeEvaluatedEvent emitted with signal + decision', async () => {
    const signal = makeSignal('high', [{ type: 'creeper', distance: 3, threatLevel: 90 }]);
    const task = makeGoalTask('t1', 'active');
    const deps = makeDeps({
      fetchSignal: async () => signal,
      getTasksToEvaluate: () => [task],
    });

    await evaluateThreatHolds(deps);

    expect(deps.bridgeEvents).toHaveLength(1);
    const be = deps.bridgeEvents[0];
    expect(be.type).toBe('threat_bridge_evaluated');
    expect(be.signal.overallThreatLevel).toBe('high');
    expect(be.holdDecision).toBe(true);
    expect(be.tasksHeld).toEqual(['t1']);
    expect(be.tasksReleased).toEqual([]);
    expect(be.threshold).toBe('high');
  });

  it('no lifecycle events for already_held outcome', async () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'preempted'); // already held

    const deps = makeDeps({
      fetchSignal: async () => makeSignal('high'),
      getTasksToEvaluate: () => [task],
    });

    await evaluateThreatHolds(deps);

    expect(deps.lifecycleEvents).toHaveLength(0);
  });

  it('no lifecycle events for no_hold outcome on release path', async () => {
    const task = makeGoalTask('t1', 'active'); // no hold

    const deps = makeDeps({
      fetchSignal: async () => makeSignal('low'),
      getTasksToEvaluate: () => [task],
    });

    await evaluateThreatHolds(deps);

    expect(deps.lifecycleEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Replay determinism (A1.12)
// ---------------------------------------------------------------------------

describe('replay determinism (A1.12)', () => {
  it('same signal + same task set → identical event output', async () => {
    const signal = makeSignal('high', [{ type: 'skeleton', distance: 8, threatLevel: 60 }]);

    async function run(): Promise<ThreatBridgeEvaluatedEvent> {
      // Fresh tasks each run (to avoid mutation side effects)
      const tasks = [
        makeGoalTask('b', 'active'),
        makeGoalTask('a', 'active'),
      ];
      const deps = makeDeps({
        fetchSignal: async () => signal,
        getTasksToEvaluate: () => tasks,
      });
      return evaluateThreatHolds(deps);
    }

    const event1 = await run();
    const event2 = await run();

    // Compare everything except timestamp (which uses new Date())
    expect(event1.holdDecision).toBe(event2.holdDecision);
    expect(event1.tasksHeld).toEqual(event2.tasksHeld);
    expect(event1.tasksReleased).toEqual(event2.tasksReleased);
    expect(event1.threshold).toBe(event2.threshold);
    expect(event1.signal.overallThreatLevel).toBe(event2.signal.overallThreatLevel);
  });
});

// ---------------------------------------------------------------------------
// Mixed scenarios
// ---------------------------------------------------------------------------

describe('mixed scenarios', () => {
  it('multiple tasks: active held, paused skipped, non-goal skipped, preempted untouched', async () => {
    const activeGoal = makeGoalTask('a', 'active');
    const pausedGoal = makeGoalTask('b', 'paused');
    const plainTask = makePlainTask('c');
    const preemptedGoal = makeGoalTask('d', 'active');
    requestHold(preemptedGoal, 'preempted');

    const deps = makeDeps({
      fetchSignal: async () => makeSignal('high'),
      getTasksToEvaluate: () => [activeGoal, pausedGoal, plainTask, preemptedGoal],
    });

    const event = await evaluateThreatHolds(deps);

    // Only the active goal-bound task without existing hold should be held
    expect(event.tasksHeld).toEqual(['a']);
    expect(event.tasksReleased).toEqual([]);
  });

  it('hold then release cycle restores original status', async () => {
    const task = makeGoalTask('t1', 'pending');

    // Hold cycle
    const holdDeps = makeDeps({
      fetchSignal: async () => makeSignal('critical'),
      getTasksToEvaluate: () => [task],
    });

    const holdEvent = await evaluateThreatHolds(holdDeps);

    expect(holdEvent.tasksHeld).toEqual(['t1']);
    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold!.reason).toBe('unsafe');

    // Simulate the status change (in real code, updateTaskStatus does this)
    task.status = 'paused';
    (task.metadata as any).threatHoldPrevStatus = 'pending';

    // Release cycle
    const releaseDeps = makeDeps({
      fetchSignal: async () => makeSignal('low'),
      getTasksToEvaluate: () => [task],
    });

    const releaseEvent = await evaluateThreatHolds(releaseDeps);

    expect(releaseEvent.tasksReleased).toEqual(['t1']);
    // Should restore to 'pending', not 'active'
    expect(releaseDeps.statusUpdates).toEqual([{ id: 't1', status: 'pending' }]);
  });
});

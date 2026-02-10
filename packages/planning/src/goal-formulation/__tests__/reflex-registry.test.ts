/**
 * ReflexRegistry — Unit Tests
 *
 * Verifies the single evaluateTick() entry point, priority ordering,
 * completion dispatch, dryRun contract, and error isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReflexRegistry, type RegisteredReflex, type BaseReflexResult } from '../reflex-registry';
import { BotStateCache, type CachedBotState } from '../bot-state-cache';
import { EnqueueSkipReason } from '../reflex-lifecycle-events';

// ============================================================================
// Helpers
// ============================================================================

function makeBotState(overrides: Partial<CachedBotState> = {}): CachedBotState {
  return {
    position: { x: 100, y: 64, z: 200 },
    health: 20,
    food: 18,
    inventory: [{ name: 'bread', count: 5 }],
    ...overrides,
  };
}

function makeResult(overrides: Partial<BaseReflexResult> = {}): BaseReflexResult {
  const id = Math.random().toString(36).slice(2, 8);
  return {
    goalKey: `test-goal-${id}`,
    reflexInstanceId: `rid-${id}`,
    builderName: 'test-controller',
    taskData: {
      title: 'Test task',
      description: 'Test description',
      type: 'survival',
      priority: 80,
      urgency: 0.8,
      source: 'autonomous',
      steps: [{
        id: `step-${id}`,
        label: 'Test step',
        done: false,
        order: 0,
        meta: { leaf: 'test_leaf', args: {}, executable: true },
      }],
    },
    proofAccumulator: { goalId: `goal-${id}` },
    ...overrides,
  };
}

function makeReflex(overrides: Partial<RegisteredReflex> = {}): RegisteredReflex {
  return {
    name: overrides.name ?? 'test-reflex',
    priority: overrides.priority ?? 10,
    canPreempt: overrides.canPreempt ?? false,
    evaluate: overrides.evaluate ?? vi.fn().mockResolvedValue(null),
    onEnqueued: overrides.onEnqueued ?? vi.fn(),
    onSkipped: overrides.onSkipped ?? vi.fn(),
    onTaskTerminal: overrides.onTaskTerminal ?? vi.fn(),
    ...overrides,
  };
}

function createTestSetup() {
  const fetcher = vi.fn<() => Promise<CachedBotState>>().mockResolvedValue(makeBotState());
  const cache = new BotStateCache(fetcher, 60000); // Long TTL to avoid refetch in tests
  const registry = new ReflexRegistry(cache);
  const addTask = vi.fn().mockResolvedValue({ id: 'task-123' });
  const getTasks = vi.fn().mockReturnValue([]);
  return { cache, registry, addTask, getTasks, fetcher };
}

// ============================================================================
// Tests
// ============================================================================

describe('ReflexRegistry', () => {
  describe('priority ordering', () => {
    it('evaluates higher-priority (lower number) reflexes first', async () => {
      const { registry, addTask, getTasks } = createTestSetup();
      const evaluateOrder: string[] = [];

      registry.register(makeReflex({
        name: 'low-priority',
        priority: 20,
        evaluate: vi.fn(async () => {
          evaluateOrder.push('low');
          return null;
        }),
      }));

      registry.register(makeReflex({
        name: 'high-priority',
        priority: 5,
        evaluate: vi.fn(async () => {
          evaluateOrder.push('high');
          return null;
        }),
      }));

      await registry.evaluateTick('no_tasks', addTask, getTasks, { dryRun: false });

      expect(evaluateOrder).toEqual(['high', 'low']);
    });

    it('short-circuits after first successful fire', async () => {
      const { registry, addTask, getTasks } = createTestSetup();
      const lowerEval = vi.fn().mockResolvedValue(null);

      registry.register(makeReflex({
        name: 'high',
        priority: 5,
        evaluate: vi.fn().mockResolvedValue(makeResult()),
        onEnqueued: vi.fn(),
      }));

      registry.register(makeReflex({
        name: 'low',
        priority: 20,
        evaluate: lowerEval,
      }));

      const result = await registry.evaluateTick('no_tasks', addTask, getTasks, { dryRun: false });

      expect(result.fired).toBe(true);
      expect(result.reflexName).toBe('high');
      expect(lowerEval).not.toHaveBeenCalled();
    });
  });

  describe('(P1) single evaluateTick — at most one enqueue per tick', () => {
    it('only one task enqueued even with both preemptable and non-preemptable reflexes', async () => {
      const { registry, addTask, getTasks } = createTestSetup();

      registry.register(makeReflex({
        name: 'preemptable',
        priority: 0,
        canPreempt: true,
        evaluate: vi.fn().mockResolvedValue(makeResult({ builderName: 'preempt-ctrl' })),
        onEnqueued: vi.fn(),
      }));

      registry.register(makeReflex({
        name: 'idle-only',
        priority: 10,
        canPreempt: false,
        evaluate: vi.fn().mockResolvedValue(makeResult({ builderName: 'idle-ctrl' })),
        onEnqueued: vi.fn(),
      }));

      // When idle: both are candidates, but only first fires
      const result = await registry.evaluateTick('no_tasks', addTask, getTasks, { dryRun: false });

      expect(result.fired).toBe(true);
      expect(result.reflexName).toBe('preemptable');
      expect(addTask).toHaveBeenCalledTimes(1);
    });

    it('when not idle (idleReason === null): only canPreempt reflexes evaluated', async () => {
      const { registry, addTask, getTasks } = createTestSetup();
      const idleEval = vi.fn().mockResolvedValue(makeResult());

      registry.register(makeReflex({
        name: 'preemptable',
        priority: 0,
        canPreempt: true,
        evaluate: vi.fn().mockResolvedValue(null), // Doesn't fire
      }));

      registry.register(makeReflex({
        name: 'idle-only',
        priority: 10,
        canPreempt: false,
        evaluate: idleEval,
      }));

      await registry.evaluateTick(null, addTask, getTasks, { dryRun: false });

      expect(idleEval).not.toHaveBeenCalled();
    });

    it('when idle: all reflexes evaluated in priority order', async () => {
      const { registry, addTask, getTasks } = createTestSetup();
      const evalOrder: string[] = [];

      registry.register(makeReflex({
        name: 'preemptable',
        priority: 0,
        canPreempt: true,
        evaluate: vi.fn(async () => {
          evalOrder.push('preemptable');
          return null;
        }),
      }));

      registry.register(makeReflex({
        name: 'idle-only',
        priority: 10,
        canPreempt: false,
        evaluate: vi.fn(async () => {
          evalOrder.push('idle-only');
          return null;
        }),
      }));

      await registry.evaluateTick('no_tasks', addTask, getTasks, { dryRun: false });

      expect(evalOrder).toEqual(['preemptable', 'idle-only']);
    });
  });

  describe('GoalKey dedup', () => {
    it('blocks injection when outstanding task has same goalKey', async () => {
      const { registry, addTask, getTasks } = createTestSetup();
      const goalKey = 'shared-goal-key';
      const onSkipped = vi.fn();

      getTasks.mockReturnValue([
        { id: 'existing-task', status: 'pending', metadata: { goalKey }, updatedAt: Date.now() },
      ]);

      registry.register(makeReflex({
        name: 'hunger',
        priority: 10,
        evaluate: vi.fn().mockResolvedValue(makeResult({ goalKey })),
        onSkipped,
      }));

      const result = await registry.evaluateTick('no_tasks', addTask, getTasks, { dryRun: false });

      expect(result.fired).toBe(false);
      expect(addTask).not.toHaveBeenCalled();
      expect(onSkipped).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        EnqueueSkipReason.DEDUPED_EXISTING_TASK,
      );
    });

    it('(P3) stale task does not block (when task age > staleMs)', async () => {
      const { registry, addTask, getTasks } = createTestSetup();
      const goalKey = 'shared-goal-key';

      getTasks.mockReturnValue([
        {
          id: 'stale-task',
          status: 'active',
          metadata: { goalKey },
          updatedAt: Date.now() - 400_000,
          createdAt: Date.now() - 400_000,
        },
      ]);

      registry.register(makeReflex({
        name: 'hunger',
        priority: 10,
        evaluate: vi.fn().mockResolvedValue(makeResult({ goalKey })),
        onEnqueued: vi.fn(),
      }));

      const result = await registry.evaluateTick('no_tasks', addTask, getTasks, { dryRun: false });

      expect(result.fired).toBe(true);
      expect(addTask).toHaveBeenCalledTimes(1);
    });
  });

  describe('(P4) completion dispatch', () => {
    it('dispatches to correct controller by builderName', () => {
      const { registry, cache } = createTestSetup();
      const onTerminal = vi.fn();

      registry.register(makeReflex({
        name: 'hunger',
        priority: 10,
        builderName: 'hunger-driveshaft-controller',
        onTaskTerminal: onTerminal,
      } as any));

      registry.register(makeReflex({
        name: 'exploration',
        priority: 20,
        builderName: 'exploration-driveshaft-controller',
        onTaskTerminal: vi.fn(),
      } as any));

      const task = {
        metadata: {
          taskProvenance: { builder: 'hunger-driveshaft-controller' },
        },
      };

      registry.onTaskTerminal(task, null);

      expect(onTerminal).toHaveBeenCalledWith(task, null);
    });

    it('unknown builderName is silently ignored (no throw)', () => {
      const { registry } = createTestSetup();

      registry.register(makeReflex({ name: 'hunger', priority: 10 }));

      const task = {
        metadata: {
          taskProvenance: { builder: 'unknown-controller' },
        },
      };

      // Should not throw
      expect(() => registry.onTaskTerminal(task, null)).not.toThrow();
    });

    it('handles tasks without taskProvenance gracefully', () => {
      const { registry } = createTestSetup();
      registry.register(makeReflex({ name: 'hunger', priority: 10 }));

      expect(() => registry.onTaskTerminal({}, null)).not.toThrow();
      expect(() => registry.onTaskTerminal({ metadata: {} }, null)).not.toThrow();
      expect(() => registry.onTaskTerminal(null, null)).not.toThrow();
    });
  });

  describe('(P8) dryRun contract', () => {
    it('evaluate is called but enqueue/guard/emit skipped', async () => {
      const { registry, addTask, getTasks } = createTestSetup();
      const onEnqueued = vi.fn();
      const onSkipped = vi.fn();

      registry.register(makeReflex({
        name: 'hunger',
        priority: 10,
        evaluate: vi.fn().mockResolvedValue(makeResult()),
        onEnqueued,
        onSkipped,
      }));

      const result = await registry.evaluateTick('no_tasks', addTask, getTasks, { dryRun: true });

      expect(result.fired).toBe(true);
      expect(result.reflexName).toBe('hunger');
      expect(addTask).not.toHaveBeenCalled();
      expect(onEnqueued).not.toHaveBeenCalled();
      expect(onSkipped).not.toHaveBeenCalled();
    });

    it('short-circuits after first non-null evaluate result in dryRun', async () => {
      const { registry, addTask, getTasks } = createTestSetup();
      const secondEval = vi.fn().mockResolvedValue(makeResult());

      registry.register(makeReflex({
        name: 'first',
        priority: 5,
        evaluate: vi.fn().mockResolvedValue(makeResult()),
      }));

      registry.register(makeReflex({
        name: 'second',
        priority: 10,
        evaluate: secondEval,
      }));

      await registry.evaluateTick('no_tasks', addTask, getTasks, { dryRun: true });

      expect(secondEval).not.toHaveBeenCalled();
    });
  });

  describe('error isolation', () => {
    it('one reflex throwing does not prevent next from evaluating', async () => {
      const { registry, addTask, getTasks } = createTestSetup();
      const secondEnqueued = vi.fn();

      registry.register(makeReflex({
        name: 'broken',
        priority: 5,
        evaluate: vi.fn().mockRejectedValue(new Error('boom')),
      }));

      registry.register(makeReflex({
        name: 'working',
        priority: 10,
        evaluate: vi.fn().mockResolvedValue(makeResult()),
        onEnqueued: secondEnqueued,
      }));

      const result = await registry.evaluateTick('no_tasks', addTask, getTasks, { dryRun: false });

      expect(result.fired).toBe(true);
      expect(result.reflexName).toBe('working');
      expect(secondEnqueued).toHaveBeenCalled();
    });
  });

  describe('fail-closed on null botState', () => {
    it('returns { fired: false } when botState cache returns null', async () => {
      const fetcher = vi.fn().mockResolvedValue(null as any);
      const cache = new BotStateCache(fetcher, 60000);
      // Force the cache to return null by making fetcher throw
      fetcher.mockRejectedValue(new Error('network error'));
      const registry = new ReflexRegistry(cache);
      const evaluate = vi.fn();

      registry.register(makeReflex({
        name: 'hunger',
        priority: 10,
        evaluate,
      }));

      const result = await registry.evaluateTick('no_tasks', vi.fn(), vi.fn().mockReturnValue([]), { dryRun: false });

      expect(result.fired).toBe(false);
      expect(evaluate).not.toHaveBeenCalled();
    });
  });

  describe('getRegistered()', () => {
    it('returns all registered reflexes for diagnostics', () => {
      const { registry } = createTestSetup();

      registry.register(makeReflex({ name: 'alpha', priority: 5 }));
      registry.register(makeReflex({ name: 'beta', priority: 20 }));
      registry.register(makeReflex({ name: 'gamma', priority: 10 }));

      const registered = registry.getRegistered();
      expect(registered).toHaveLength(3);
      expect(registered.map((r) => r.name)).toEqual(['alpha', 'gamma', 'beta']);
    });

    it('returns a copy (mutations do not affect registry)', () => {
      const { registry } = createTestSetup();
      registry.register(makeReflex({ name: 'test', priority: 10 }));

      const copy = registry.getRegistered();
      copy.pop();

      expect(registry.getRegistered()).toHaveLength(1);
    });
  });
});

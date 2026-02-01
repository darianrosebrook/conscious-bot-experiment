/**
 * Goal Resolver — Atomic Resolve-or-Create + Uniqueness Invariant
 *
 * Evidence for commit 5:
 * - 20 concurrent "build shelter" intents → exactly one task created, rest continue
 * - Uniqueness invariant: at most one non-terminal task per (goalType, goalKey)
 * - Completed + verifier → already_satisfied outcome
 * - Different goalTypes don't interfere
 * - Outcome types carry expected fields
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Task } from '../../types/task';
import type { GoalBinding } from '../goal-binding-types';
import { GoalResolver, type GoalResolverDeps } from '../goal-resolver';
import { createGoalBinding, computeProvisionalKey } from '../goal-identity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

function makeDeps(store: Map<string, Task>): GoalResolverDeps {
  return {
    getAllTasks: () => [...store.values()],
    storeTask: (task: Task) => {
      store.set(task.id, task);
      return task;
    },
    generateTaskId: () => `task_${++idCounter}`,
    generateInstanceId: () => `inst_${idCounter}`,
  };
}

function siteAt(x: number, y: number, z: number) {
  return {
    position: { x, y, z },
    facing: 'N' as const,
    refCorner: { x, y, z },
    footprintBounds: {
      min: { x: x - 5, y, z: z - 5 },
      max: { x: x + 5, y: y + 8, z: z + 5 },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GoalResolver — Atomic Resolve-or-Create', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it('creates a task when store is empty', async () => {
    const store = new Map<string, Task>();
    const resolver = new GoalResolver();

    const result = await resolver.resolveOrCreate(
      { goalType: 'build_shelter', botPosition: { x: 5, y: 64, z: 5 } },
      makeDeps(store),
    );

    expect(result.action).toBe('created');
    if (result.action === 'created') {
      expect(result.taskId).toBeTruthy();
      expect(result.goalInstanceId).toBeTruthy();
      expect(result.goalKey).toBeTruthy();
    }
    expect(store.size).toBe(1);
  });

  it('continues existing task on second call (same location)', async () => {
    const store = new Map<string, Task>();
    const resolver = new GoalResolver();
    const deps = makeDeps(store);
    const input = { goalType: 'build_shelter', botPosition: { x: 5, y: 64, z: 5 } };

    const first = await resolver.resolveOrCreate(input, deps);
    expect(first.action).toBe('created');

    const second = await resolver.resolveOrCreate(input, deps);
    expect(second.action).toBe('continue');
    if (first.action === 'created' && second.action === 'continue') {
      expect(second.taskId).toBe(first.taskId);
    }
    // Still only one task
    expect(store.size).toBe(1);
  });

  it('20 concurrent intents → exactly one created', async () => {
    const store = new Map<string, Task>();
    const resolver = new GoalResolver();
    const deps = makeDeps(store);
    const input = { goalType: 'build_shelter', botPosition: { x: 5, y: 64, z: 5 } };

    const results = await Promise.all(
      Array.from({ length: 20 }, () => resolver.resolveOrCreate(input, deps)),
    );

    const created = results.filter((r) => r.action === 'created');
    const continued = results.filter((r) => r.action === 'continue');

    expect(created).toHaveLength(1);
    expect(continued).toHaveLength(19);

    // All point to the same task
    const taskIds = new Set(results.map((r) => {
      if (r.action === 'created') return r.taskId;
      if (r.action === 'continue') return r.taskId;
      return '';
    }));
    expect(taskIds.size).toBe(1);

    // Only one task in store
    expect(store.size).toBe(1);
  });

  it('uniqueness invariant: at most one non-terminal task per (goalType, goalKey)', async () => {
    const store = new Map<string, Task>();
    const resolver = new GoalResolver();
    const deps = makeDeps(store);
    const input = { goalType: 'build_shelter', botPosition: { x: 5, y: 64, z: 5 } };

    // Create 10 concurrently
    await Promise.all(
      Array.from({ length: 10 }, () => resolver.resolveOrCreate(input, deps)),
    );

    // Count non-terminal tasks with this goalType
    const nonTerminal = [...store.values()].filter((t) => {
      const binding = t.metadata.goalBinding as GoalBinding | undefined;
      return (
        binding?.goalType === 'build_shelter' &&
        t.status !== 'completed' &&
        t.status !== 'failed'
      );
    });

    expect(nonTerminal).toHaveLength(1);
  });

  it('different goalTypes create independent tasks', async () => {
    const store = new Map<string, Task>();
    const resolver = new GoalResolver();
    const deps = makeDeps(store);

    const shelter = await resolver.resolveOrCreate(
      { goalType: 'build_shelter', botPosition: { x: 5, y: 64, z: 5 } },
      deps,
    );

    const structure = await resolver.resolveOrCreate(
      { goalType: 'build_structure', botPosition: { x: 5, y: 64, z: 5 } },
      deps,
    );

    expect(shelter.action).toBe('created');
    expect(structure.action).toBe('created');
    expect(store.size).toBe(2);
  });

  it('different locations create independent tasks', async () => {
    const store = new Map<string, Task>();
    const resolver = new GoalResolver();
    const deps = makeDeps(store);

    const here = await resolver.resolveOrCreate(
      { goalType: 'build_shelter', botPosition: { x: 5, y: 64, z: 5 } },
      deps,
    );

    // Far away (different chunk)
    const there = await resolver.resolveOrCreate(
      { goalType: 'build_shelter', botPosition: { x: 500, y: 64, z: 500 } },
      deps,
    );

    expect(here.action).toBe('created');
    expect(there.action).toBe('created');
    expect(store.size).toBe(2);
  });

  it('returns already_satisfied when completed task passes verifier', async () => {
    const store = new Map<string, Task>();
    const resolver = new GoalResolver();
    const input = { goalType: 'build_shelter', botPosition: { x: 100, y: 64, z: 200 } };

    // Pre-populate with a completed task at the same location
    const provisionalKey = computeProvisionalKey(input);
    const binding = createGoalBinding({
      goalInstanceId: 'inst_done',
      goalType: 'build_shelter',
      provisionalKey,
      verifier: 'verify_shelter_v0',
    });
    binding.anchors.siteSignature = siteAt(100, 64, 200);
    // Need an alias since it's "anchored" — simulate transition
    binding.goalKeyAliases.push('old_prov_key');

    const completedTask: Task = {
      id: 'task_done',
      title: 'Build shelter',
      description: 'completed',
      type: 'building',
      priority: 0.5,
      urgency: 0.5,
      progress: 1,
      status: 'completed',
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
    store.set(completedTask.id, completedTask);

    const deps: GoalResolverDeps = {
      ...makeDeps(store),
      isStillSatisfied: () => true,
    };

    const result = await resolver.resolveOrCreate(input, deps);
    expect(result.action).toBe('already_satisfied');
    // No new task created
    expect(store.size).toBe(1);
  });

  it('created task has valid goalBinding', async () => {
    const store = new Map<string, Task>();
    const resolver = new GoalResolver();
    const deps = makeDeps(store);

    const result = await resolver.resolveOrCreate(
      { goalType: 'build_shelter', botPosition: { x: 5, y: 64, z: 5 }, verifier: 'verify_shelter_v0' },
      deps,
    );

    expect(result.action).toBe('created');
    if (result.action !== 'created') return;

    const task = store.get(result.taskId)!;
    const binding = task.metadata.goalBinding as GoalBinding;

    expect(binding).toBeDefined();
    expect(binding.goalInstanceId).toBe(result.goalInstanceId);
    expect(binding.goalKey).toBe(result.goalKey);
    expect(binding.goalType).toBe('build_shelter');
    expect(binding.goalKeyAliases).toEqual([]);
    expect(binding.anchors).toEqual({});
    expect(binding.completion.verifier).toBe('verify_shelter_v0');
    expect(binding.completion.consecutivePasses).toBe(0);
  });
});

/**
 * Goal Resolver Routing — addTask() interception for goal-sourced tasks
 *
 * Evidence for commit 6:
 * - Building tasks with source='goal' route through GoalResolver when enabled
 * - Non-building or non-goal tasks skip the resolver
 * - Duplicate goal intents return existing task (no double-create)
 * - GoalBinding metadata is present on created tasks
 * - Feature gate: resolver disabled → normal addTask path
 * - goalType inference from task title/type/parameters
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Task } from '../../types/task';
import type { GoalBinding } from '../../goals/goal-binding-types';
import { GoalResolver } from '../../goals/goal-resolver';

// ---------------------------------------------------------------------------
// Lightweight stub for TaskIntegration goal-resolver routing logic
//
// We test the routing logic in isolation rather than instantiating the full
// TaskIntegration (which requires service clients, Sterling planner, etc.).
// This mirrors how the routing works inside addTask():
//   1. Check if goalResolver is wired + source='goal' + type='building'
//   2. Infer goalType
//   3. Call resolveOrCreate
//   4. Handle outcome
// ---------------------------------------------------------------------------

interface MinimalTaskStore {
  tasks: Map<string, Task>;
  findSimilarTask: (taskData: Partial<Task>) => Task | null;
}

/**
 * Minimal harness that replicates the goal-resolver routing from TaskIntegration.addTask()
 * without requiring the full class and its service dependencies.
 */
class GoalResolverRoutingHarness {
  private goalResolver?: GoalResolver;
  readonly store: Map<string, Task> = new Map();
  private idCounter = 0;

  enableGoalResolver(resolver?: GoalResolver): void {
    this.goalResolver = resolver ?? new GoalResolver();
  }

  get isGoalResolverConfigured(): boolean {
    return this.goalResolver !== undefined;
  }

  private inferGoalType(taskData: Partial<Task>): string | null {
    if (taskData.parameters?.goalType) return taskData.parameters.goalType;
    const title = (taskData.title || '').toLowerCase();
    const type = (taskData.type || '').toLowerCase();
    if (type === 'building' || title.includes('build')) {
      if (title.includes('shelter')) return 'build_shelter';
      if (title.includes('structure')) return 'build_structure';
      return 'build_shelter';
    }
    return null;
  }

  async addTask(taskData: Partial<Task>): Promise<Task> {
    // Goal-sourced interception
    if (this.goalResolver && taskData.source === 'goal' && taskData.type === 'building') {
      const goalType = this.inferGoalType(taskData);
      if (goalType) {
        const botPosition = taskData.parameters?.botPosition ?? { x: 0, y: 64, z: 0 };
        const verifier = taskData.parameters?.verifier ?? `verify_${goalType}_v0`;

        const outcome = await this.goalResolver.resolveOrCreate(
          { goalType, intentParams: taskData.parameters?.intentParams, botPosition, verifier },
          {
            getAllTasks: () => [...this.store.values()],
            storeTask: (task: Task) => { this.store.set(task.id, task); return task; },
            generateTaskId: () =>
              taskData.id || `task_${++this.idCounter}`,
            generateInstanceId: () => `ginst_${this.idCounter}`,
          },
        );

        if (outcome.action === 'continue') {
          const existing = this.store.get(outcome.taskId);
          if (existing) return existing;
        }

        if (outcome.action === 'already_satisfied') {
          const existing = this.store.get(outcome.taskId);
          if (existing) return existing;
        }

        if (outcome.action === 'created') {
          const created = this.store.get(outcome.taskId);
          if (created) return created;
        }
      }
    }

    // Normal path (non-goal or resolver not enabled)
    const task: Task = {
      id: taskData.id || `task_${++this.idCounter}`,
      title: taskData.title || 'Untitled Task',
      description: taskData.description || '',
      type: taskData.type || 'general',
      priority: taskData.priority ?? 0.5,
      urgency: taskData.urgency ?? 0.5,
      progress: 0,
      status: 'pending',
      source: taskData.source || 'manual',
      steps: taskData.steps || [],
      parameters: taskData.parameters || {},
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: taskData.metadata?.tags || [],
        category: taskData.metadata?.category || 'general',
      },
    };
    this.store.set(task.id, task);
    return task;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Goal Resolver Routing — addTask interception', () => {
  let harness: GoalResolverRoutingHarness;

  beforeEach(() => {
    harness = new GoalResolverRoutingHarness();
  });

  it('routes building+goal tasks through resolver when enabled', async () => {
    harness.enableGoalResolver();

    const task = await harness.addTask({
      title: 'Build shelter',
      type: 'building',
      source: 'goal',
      parameters: { botPosition: { x: 5, y: 64, z: 5 } },
    });

    expect(task).toBeDefined();
    expect(task.source).toBe('goal');

    // Task should have goalBinding from the resolver
    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding).toBeDefined();
    expect(binding.goalType).toBe('build_shelter');
    expect(binding.goalInstanceId).toBeTruthy();
    expect(binding.goalKey).toBeTruthy();
  });

  it('skips resolver for non-goal source tasks', async () => {
    harness.enableGoalResolver();

    const task = await harness.addTask({
      title: 'Build shelter',
      type: 'building',
      source: 'manual',
      parameters: { botPosition: { x: 5, y: 64, z: 5 } },
    });

    // Should NOT have goalBinding (went through normal path)
    expect(task.metadata.goalBinding).toBeUndefined();
    expect(task.source).toBe('manual');
  });

  it('skips resolver for non-building type tasks', async () => {
    harness.enableGoalResolver();

    const task = await harness.addTask({
      title: 'Gather wood',
      type: 'gathering',
      source: 'goal',
    });

    expect(task.metadata.goalBinding).toBeUndefined();
    expect(task.type).toBe('gathering');
  });

  it('skips resolver when not enabled', async () => {
    // Do NOT call enableGoalResolver

    const task = await harness.addTask({
      title: 'Build shelter',
      type: 'building',
      source: 'goal',
      parameters: { botPosition: { x: 5, y: 64, z: 5 } },
    });

    // Should NOT have goalBinding (resolver not wired)
    expect(task.metadata.goalBinding).toBeUndefined();
    expect(harness.isGoalResolverConfigured).toBe(false);
  });

  it('deduplicates: second identical goal intent returns same task', async () => {
    harness.enableGoalResolver();

    const input = {
      title: 'Build shelter',
      type: 'building' as const,
      source: 'goal' as const,
      parameters: { botPosition: { x: 5, y: 64, z: 5 } },
    };

    const first = await harness.addTask(input);
    const second = await harness.addTask(input);

    expect(first.id).toBe(second.id);
    expect(harness.store.size).toBe(1);
  });

  it('10 concurrent goal intents → exactly one task', async () => {
    harness.enableGoalResolver();

    const input: Partial<Task> = {
      title: 'Build shelter',
      type: 'building',
      source: 'goal',
      parameters: { botPosition: { x: 5, y: 64, z: 5 } },
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () => harness.addTask(input)),
    );

    const taskIds = new Set(results.map((t) => t.id));
    expect(taskIds.size).toBe(1);
    expect(harness.store.size).toBe(1);
  });

  it('different goal types create independent tasks', async () => {
    harness.enableGoalResolver();

    const shelter = await harness.addTask({
      title: 'Build shelter',
      type: 'building',
      source: 'goal',
      parameters: { botPosition: { x: 5, y: 64, z: 5 } },
    });

    const structure = await harness.addTask({
      title: 'Build structure',
      type: 'building',
      source: 'goal',
      parameters: { botPosition: { x: 5, y: 64, z: 5 } },
    });

    expect(shelter.id).not.toBe(structure.id);
    expect(harness.store.size).toBe(2);

    const shelterBinding = shelter.metadata.goalBinding as GoalBinding;
    const structureBinding = structure.metadata.goalBinding as GoalBinding;
    expect(shelterBinding.goalType).toBe('build_shelter');
    expect(structureBinding.goalType).toBe('build_structure');
  });

  it('different locations create independent tasks', async () => {
    harness.enableGoalResolver();

    const here = await harness.addTask({
      title: 'Build shelter',
      type: 'building',
      source: 'goal',
      parameters: { botPosition: { x: 5, y: 64, z: 5 } },
    });

    // Far away location (different chunk)
    const there = await harness.addTask({
      title: 'Build shelter',
      type: 'building',
      source: 'goal',
      parameters: { botPosition: { x: 500, y: 64, z: 500 } },
    });

    expect(here.id).not.toBe(there.id);
    expect(harness.store.size).toBe(2);
  });

  it('explicit goalType parameter overrides title inference', async () => {
    harness.enableGoalResolver();

    const task = await harness.addTask({
      title: 'Build something',
      type: 'building',
      source: 'goal',
      parameters: {
        goalType: 'build_structure',
        botPosition: { x: 5, y: 64, z: 5 },
      },
    });

    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.goalType).toBe('build_structure');
  });

  it('isGoalResolverConfigured reflects state', () => {
    expect(harness.isGoalResolverConfigured).toBe(false);
    harness.enableGoalResolver();
    expect(harness.isGoalResolverConfigured).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// goalType inference
// ---------------------------------------------------------------------------

describe('goalType inference', () => {
  let harness: GoalResolverRoutingHarness;

  beforeEach(() => {
    harness = new GoalResolverRoutingHarness();
    harness.enableGoalResolver();
  });

  it('infers build_shelter from title containing "shelter"', async () => {
    const task = await harness.addTask({
      title: 'Build a shelter near base',
      type: 'building',
      source: 'goal',
      parameters: { botPosition: { x: 0, y: 64, z: 0 } },
    });
    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.goalType).toBe('build_shelter');
  });

  it('infers build_structure from title containing "structure"', async () => {
    const task = await harness.addTask({
      title: 'Build a structure',
      type: 'building',
      source: 'goal',
      parameters: { botPosition: { x: 0, y: 64, z: 0 } },
    });
    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.goalType).toBe('build_structure');
  });

  it('defaults to build_shelter for generic building tasks', async () => {
    const task = await harness.addTask({
      title: 'Build something',
      type: 'building',
      source: 'goal',
      parameters: { botPosition: { x: 0, y: 64, z: 0 } },
    });
    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.goalType).toBe('build_shelter');
  });
});

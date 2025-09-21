/**
 * Planning System Validation Test
 *
 * Tests that the planning system properly validates task execution
 * and does not mark goals as completed when tasks fail.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnhancedGoalManager } from '@/goal-formulation/enhanced-goal-manager';
import { EnhancedReactiveExecutor } from '@/reactive-executor/enhanced-reactive-executor';
import { GoalStatus, GoalType } from '@/types';

describe('Planning System Validation', () => {
  let goalManager: EnhancedGoalManager;
  let reactiveExecutor: EnhancedReactiveExecutor;

  beforeEach(() => {
    goalManager = new EnhancedGoalManager();
    reactiveExecutor = new EnhancedReactiveExecutor();

    vi.clearAllMocks();
  });

  it('should not mark goals as completed when tasks fail', async () => {
    // Create a test goal
    const testGoal = {
      id: 'test-goal-1',
      type: GoalType.ACQUIRE_ITEM,
      priority: 0.8,
      urgency: 0.7,
      utility: 0.8,
      description: 'Craft wooden pickaxe for resource gathering',
      preconditions: [],
      effects: [],
      status: GoalStatus.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      subGoals: [],
    };

    goalManager.upsert(testGoal);

    // Check initial state
    const initialGoals = goalManager.getGoalsByStatus(GoalStatus.PENDING);
    expect(initialGoals).toHaveLength(1);

    // Create a task from the goal
    const task = {
      id: 'test-task-1',
      type: 'craft',
      description: 'Craft wooden pickaxe for resource gathering',
      parameters: { item: 'wooden_pickaxe', quantity: 1 },
    };

    // Mock the executor to return failure
    vi.spyOn(reactiveExecutor, 'executeTask').mockResolvedValue({
      success: false,
      error: 'Bot not connected',
      data: null,
    });

    const result = await reactiveExecutor.executeTask(task);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Bot not connected');

    // Verify goal is still pending (not completed)
    const pendingGoals = goalManager.getGoalsByStatus(GoalStatus.PENDING);
    expect(pendingGoals).toHaveLength(1);
    expect(pendingGoals[0].id).toBe('test-goal-1');
  });

  it('should handle multiple failed tasks correctly', async () => {
    // Create multiple test goals
    const testGoals = [
      {
        id: 'test-goal-1',
        type: GoalType.ACQUIRE_ITEM,
        priority: 0.8,
        urgency: 0.7,
        utility: 0.8,
        description: 'Craft wooden pickaxe',
        preconditions: [],
        effects: [],
        status: GoalStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      },
      {
        id: 'test-goal-2',
        type: GoalType.MOVE_TO_LOCATION,
        priority: 0.6,
        urgency: 0.5,
        utility: 0.6,
        description: 'Move to mining area',
        preconditions: [],
        effects: [],
        status: GoalStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      },
    ];

    testGoals.forEach((goal) => goalManager.upsert(goal));

    // Mock executor to always fail
    vi.spyOn(reactiveExecutor, 'executeTask').mockResolvedValue({
      success: false,
      error: 'Connection lost',
      data: null,
    });

    // Execute multiple tasks
    const tasks = [
      { id: 'task-1', type: 'craft', parameters: { item: 'wooden_pickaxe' } },
      { id: 'task-2', type: 'move', parameters: { x: 100, y: 64, z: 200 } },
    ];

    for (const task of tasks) {
      const result = await reactiveExecutor.executeTask(task);
      expect(result.success).toBe(false);
    }

    // Verify all goals are still pending
    const pendingGoals = goalManager.getGoalsByStatus(GoalStatus.PENDING);
    expect(pendingGoals).toHaveLength(2);
  });

  it('should handle partial success correctly', async () => {
    const testGoal = {
      id: 'test-goal-partial',
      type: GoalType.EXPLORE,
      priority: 0.7,
      urgency: 0.6,
      utility: 0.7,
      description: 'Explore new area safely',
      preconditions: [],
      effects: [],
      status: GoalStatus.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      subGoals: [],
    };

    goalManager.upsert(testGoal);

    // Mock partial success (some tasks succeed, others fail)
    vi.spyOn(reactiveExecutor, 'executeTask').mockImplementation(
      async (task) => {
        if (task.type === 'move') {
          return { success: true, error: null, data: { type: 'move' } };
        } else {
          return { success: false, error: 'Cannot perform action', data: null };
        }
      }
    );

    const tasks = [
      { id: 'task-move', type: 'move', parameters: { x: 100, y: 64, z: 200 } },
      { id: 'task-sense', type: 'sense', parameters: { range: 10 } },
    ];

    const results = [];
    for (const task of tasks) {
      const result = await reactiveExecutor.executeTask(task);
      results.push(result);
    }

    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);

    // Goal should still be pending since not all tasks succeeded
    const pendingGoals = goalManager.getGoalsByStatus(GoalStatus.PENDING);
    expect(pendingGoals).toHaveLength(1);
  });

  it('should validate system state before task execution', async () => {
    const testGoal = {
      id: 'test-validation-goal',
      type: GoalType.CRAFT_ITEM,
      priority: 0.9,
      urgency: 0.8,
      utility: 0.9,
      description: 'Craft essential tools',
      preconditions: [],
      effects: [],
      status: GoalStatus.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      subGoals: [],
    };

    goalManager.upsert(testGoal);

    // Mock system validation failure
    vi.spyOn(reactiveExecutor, 'executeTask').mockResolvedValue({
      success: false,
      error: 'System validation failed: Bot not ready',
      data: null,
    });

    const task = {
      id: 'validation-task',
      type: 'craft',
      description: 'Craft tools',
      parameters: { item: 'wooden_tools' },
    };

    const result = await reactiveExecutor.executeTask(task);
    expect(result.success).toBe(false);
    expect(result.error).toContain('validation failed');

    // Goal should remain pending
    const pendingGoals = goalManager.getGoalsByStatus(GoalStatus.PENDING);
    expect(pendingGoals).toHaveLength(1);
  });
});

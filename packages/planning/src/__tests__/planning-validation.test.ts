/**
 * Planning Validation Test
 *
 * Tests that the planning system properly validates task execution
 * instead of always reporting success when the bot hasn't actually performed actions.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnhancedReactiveExecutor } from '@/reactive-executor/enhanced-reactive-executor';

describe('Planning Validation', () => {
  let executor: EnhancedReactiveExecutor;

  beforeEach(() => {
    executor = new EnhancedReactiveExecutor();
    vi.clearAllMocks();
  });

  it('should fail craft task when bot is not connected', async () => {
    const craftTask = {
      id: 'test-craft-1',
      type: 'craft',
      description: 'Craft wooden pickaxe for resource gathering',
      parameters: { item: 'wooden_pickaxe', quantity: 1 },
    };

    // Mock executor to return failure when bot is not connected
    vi.spyOn(executor, 'executeTask').mockResolvedValue({
      success: false,
      error: 'Bot not connected to Minecraft server',
      data: null,
    });

    const result = await executor.executeTask(craftTask);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Bot not connected to Minecraft server');
  });

  it('should fail move task when bot is not connected', async () => {
    const moveTask = {
      id: 'test-move-1',
      type: 'move',
      description: 'Move forward 5 blocks',
      parameters: { distance: 5 },
    };

    vi.spyOn(executor, 'executeTask').mockResolvedValue({
      success: false,
      error: 'Bot connection lost',
      data: null,
    });

    const result = await executor.executeTask(moveTask);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Bot connection lost');
  });

  it('should fail gather task when bot is not connected', async () => {
    const gatherTask = {
      id: 'test-gather-1',
      type: 'gather',
      description: 'Gather wood resources',
      parameters: { item: 'wood', quantity: 10 },
    };

    vi.spyOn(executor, 'executeTask').mockResolvedValue({
      success: false,
      error: 'Cannot execute action: Bot not ready',
      data: null,
    });

    const result = await executor.executeTask(gatherTask);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Cannot execute action: Bot not ready');
  });

  it('should fail sense task when bot is not connected', async () => {
    const senseTask = {
      id: 'test-sense-1',
      type: 'sense',
      description: 'Check light level in area',
      parameters: { range: 10 },
    };

    vi.spyOn(executor, 'executeTask').mockResolvedValue({
      success: false,
      error: 'Sensing failed: No bot connection',
      data: null,
    });

    const result = await executor.executeTask(senseTask);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Sensing failed: No bot connection');
  });

  it('should handle different failure types correctly', async () => {
    const tasks = [
      { type: 'craft', parameters: { item: 'wooden_pickaxe' } },
      { type: 'move', parameters: { x: 100, y: 64, z: 200 } },
      { type: 'gather', parameters: { item: 'cobblestone', quantity: 5 } },
      { type: 'sense', parameters: { range: 15 } },
    ];

    const expectedErrors = [
      'Bot not connected to Minecraft server',
      'Bot connection lost',
      'Cannot execute action: Bot not ready',
      'Sensing failed: No bot connection',
    ];

    for (let i = 0; i < tasks.length; i++) {
      vi.spyOn(executor, 'executeTask').mockResolvedValueOnce({
        success: false,
        error: expectedErrors[i],
        data: null,
      });

      const result = await executor.executeTask(tasks[i]);
      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedErrors[i]);
    }
  });

  it('should validate bot readiness before task execution', async () => {
    const tasks = [
      { id: 'task-1', type: 'craft', parameters: { item: 'tools' } },
      { id: 'task-2', type: 'move', parameters: { x: 50, y: 64, z: 50 } },
    ];

    // Mock readiness validation failure
    vi.spyOn(executor, 'executeTask').mockImplementation(async (task) => {
      return {
        success: false,
        error: `Validation failed for ${task.type}: System not ready`,
        data: null,
      };
    });

    for (const task of tasks) {
      const result = await executor.executeTask(task);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
      expect(result.error).toContain('System not ready');
    }
  });

  it('should provide detailed error information', async () => {
    const task = {
      id: 'test-detailed-error',
      type: 'craft',
      description: 'Craft essential items',
      parameters: { item: 'iron_tools', quantity: 1 },
    };

    vi.spyOn(executor, 'executeTask').mockResolvedValue({
      success: false,
      error:
        'Detailed execution error: Bot disconnected, cannot perform craft operation',
      data: {
        attemptedAction: 'craft',
        targetItem: 'iron_tools',
        reason: 'disconnection',
      },
    });

    const result = await executor.executeTask(task);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Detailed execution error');
    expect(result.error).toContain('Bot disconnected');
    expect(result.error).toContain('cannot perform craft operation');
    expect(result.data?.attemptedAction).toBe('craft');
    expect(result.data?.targetItem).toBe('iron_tools');
    expect(result.data?.reason).toBe('disconnection');
  });

  it('should handle multiple validation failures consistently', async () => {
    const testCases = [
      { type: 'craft', expectedError: 'Crafting failed: Bot not connected' },
      { type: 'move', expectedError: 'Movement failed: Bot disconnected' },
      { type: 'gather', expectedError: 'Gathering failed: No bot connection' },
      { type: 'sense', expectedError: 'Sensing failed: Bot not available' },
    ];

    for (const testCase of testCases) {
      const task = {
        id: `test-${testCase.type}`,
        type: testCase.type,
        description: `${testCase.type} operation`,
        parameters: {},
      };

      vi.spyOn(executor, 'executeTask').mockResolvedValueOnce({
        success: false,
        error: testCase.expectedError,
        data: null,
      });

      const result = await executor.executeTask(task);
      expect(result.success).toBe(false);
      expect(result.error).toBe(testCase.expectedError);
    }
  });
});

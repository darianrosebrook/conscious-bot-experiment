/// <reference types="vitest/globals" />

/**
 * Cognitive-Minecraft Integration Test Suite
 *
 * Tests the full cognitive feedback loop with minecraft actions.
 * Validates how cognitive integration processes real minecraft task results.
 *
 * @author @darianrosebrook
 */

import { CognitiveIntegration } from '../cognitive-integration';
import fetch from 'node-fetch';

// Mock fetch for HTTP requests
vi.mock('node-fetch');
const mockFetch = fetch as any;

// Mock EventEmitter to avoid issues
vi.mock('events', () => {
  class MockEventEmitter {
    on = vi.fn();
    emit = vi.fn();
    removeListener = vi.fn();
  }
  return { EventEmitter: MockEventEmitter };
});

describe('Cognitive-Minecraft Integration Tests', () => {
  let cognitiveIntegration: CognitiveIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    cognitiveIntegration = new CognitiveIntegration({
      failureThreshold: 0.7,
      successThreshold: 0.8,
      maxRetries: 3,
    });
  });

  describe('Successful Task Execution with Cognitive Feedback', () => {
    it('should process successful crafting task with positive feedback', async () => {
      const task = {
        id: 'craft-task-1',
        type: 'craft',
        parameters: { item: 'wooden_pickaxe', quantity: 1 },
        attempts: 1,
        status: 'completed',
      };

      const minecraftResult = {
        success: true,
        item: 'wooden_pickaxe',
        quantity: 1,
        crafted: true,
      };

      const feedback = await cognitiveIntegration.processTaskCompletion(
        task,
        minecraftResult,
        {
          taskType: 'craft',
          goal: 'tool_creation',
          attempts: 1,
        }
      );

      expect(feedback.success).toBe(true);
      expect(feedback.taskId).toBe('craft-task-1');
      expect(feedback.reasoning).toContain('Successfully completed');
      expect(feedback.emotionalImpact).toBe('positive');
      expect(feedback.confidence).toBeGreaterThan(0.5);
      expect(feedback.alternativeSuggestions).toHaveLength(0);
    });

    it('should process successful mining task with location-based feedback', async () => {
      const task = {
        id: 'mine-task-1',
        type: 'mine',
        parameters: { resource: 'stone' },
        attempts: 1,
        status: 'completed',
      };

      const minecraftResult = {
        results: [
          { success: false, error: 'No block found' },
          { success: true, block: 'stone', position: { x: 10, y: 63, z: 5 } },
        ],
        type: 'mining',
        success: true,
        error: undefined,
      };

      const feedback = await cognitiveIntegration.processTaskCompletion(
        task,
        minecraftResult,
        {
          taskType: 'mine',
          goal: 'resource_gathering',
          attempts: 1,
        }
      );

      expect(feedback.success).toBe(true);
      expect(feedback.reasoning).toContain('Successfully completed');
      expect(feedback.emotionalImpact).toBe('positive');
      expect(feedback.alternativeSuggestions).toHaveLength(0);
    });
  });

  describe('Failed Task Execution with Adaptive Feedback', () => {
    it('should process failed crafting task and suggest alternatives', async () => {
      const task = {
        id: 'craft-task-2',
        type: 'craft',
        parameters: { item: 'wooden_pickaxe', quantity: 1 },
        attempts: 2,
        status: 'failed',
      };

      const minecraftResult = {
        success: false,
        error: 'Insufficient materials to craft 1x wooden_pickaxe',
        canCraft: false,
      };

      const feedback = await cognitiveIntegration.processTaskCompletion(
        task,
        minecraftResult,
        {
          taskType: 'craft',
          goal: 'tool_creation',
          attempts: 2,
        }
      );

      expect(feedback.success).toBe(false);
      expect(feedback.taskId).toBe('craft-task-2');
      expect(feedback.reasoning).toContain('High failure rate');
      expect(feedback.emotionalImpact).toBe('negative');
      expect(feedback.confidence).toBeLessThan(0.5);
      expect(feedback.alternativeSuggestions).toContain(
        'Gather the required materials first'
      );
      expect(feedback.alternativeSuggestions).toContain(
        'Try crafting simpler items first'
      );
    });

    it('should process failed mining task and suggest location changes', async () => {
      const task = {
        id: 'mine-task-2',
        type: 'mine',
        parameters: { resource: 'stone' },
        attempts: 3,
        status: 'failed',
      };

      const minecraftResult = {
        results: [
          { success: false, error: 'No block found' },
          { success: false, error: 'No block found' },
          { success: false, error: 'No block found' },
        ],
        type: 'mining',
        success: false,
        error: 'No blocks were successfully mined',
      };

      const feedback = await cognitiveIntegration.processTaskCompletion(
        task,
        minecraftResult,
        {
          taskType: 'mine',
          goal: 'resource_gathering',
          attempts: 3,
        }
      );

      expect(feedback.success).toBe(false);
      expect(feedback.reasoning).toContain('High failure rate');
      expect(feedback.emotionalImpact).toBe('negative');
      expect(feedback.alternativeSuggestions).toContain(
        'Look for different types of blocks to mine'
      );
      expect(feedback.alternativeSuggestions).toContain(
        'Try mining in a different location'
      );
    });
  });

  describe('Stuck Pattern Detection with Minecraft Context', () => {
    it('should detect stuck crafting pattern and suggest task abandonment', async () => {
      // Simulate multiple failed crafting attempts
      const tasks = [
        {
          id: 'craft-task-stuck',
          type: 'craft',
          parameters: { item: 'wooden_pickaxe' },
          attempts: 1,
          status: 'failed',
        },
        {
          id: 'craft-task-stuck',
          type: 'craft',
          parameters: { item: 'wooden_pickaxe' },
          attempts: 2,
          status: 'failed',
        },
        {
          id: 'craft-task-stuck',
          type: 'craft',
          parameters: { item: 'wooden_pickaxe' },
          attempts: 3,
          status: 'failed',
        },
      ];

      const failedResult = {
        success: false,
        error: 'Insufficient materials to craft 1x wooden_pickaxe',
        canCraft: false,
      };

      // Process each task to build history
      for (const task of tasks) {
        await cognitiveIntegration.processTaskCompletion(task, failedResult, {
          taskType: 'craft',
          goal: 'tool_creation',
          attempts: task.attempts,
        });
      }

      // Process final task that should trigger stuck detection
      const finalTask = {
        id: 'craft-task-stuck',
        type: 'craft',
        parameters: { item: 'wooden_pickaxe' },
        attempts: 4,
        status: 'failed',
      };

      const feedback = await cognitiveIntegration.processTaskCompletion(
        finalTask,
        failedResult,
        {
          taskType: 'craft',
          goal: 'tool_creation',
          attempts: 4,
        }
      );

      expect(feedback.reasoning).toContain('Stuck in a loop');
      expect(feedback.alternativeSuggestions).toContain(
        'Try a different task type instead of craft'
      );
      expect(feedback.emotionalImpact).toBe('negative');
      expect(feedback.confidence).toBeLessThan(0.3);

      // Check if task should be abandoned
      const shouldAbandon =
        cognitiveIntegration.shouldAbandonTask('craft-task-stuck');
      expect(shouldAbandon).toBe(true);
    });

    it('should detect mining location pattern and suggest exploration', async () => {
      // Simulate multiple failed mining attempts at same area
      const miningTasks = Array.from({ length: 4 }, (_, i) => ({
        id: `mine-task-stuck-${i + 1}`,
        type: 'mine',
        parameters: { resource: 'stone' },
        attempts: i + 1,
        status: 'failed',
      }));

      const failedMiningResult = {
        results: [
          { success: false, error: 'No block found' },
          { success: false, error: 'No block found' },
        ],
        type: 'mining',
        success: false,
        error: 'No blocks were successfully mined',
      };

      // Process mining tasks to build failure pattern
      for (const task of miningTasks) {
        await cognitiveIntegration.processTaskCompletion(
          task,
          failedMiningResult,
          {
            taskType: 'mine',
            goal: 'resource_gathering',
            attempts: task.attempts,
          }
        );
      }

      const finalFeedback = await cognitiveIntegration.processTaskCompletion(
        miningTasks[3],
        failedMiningResult,
        {
          taskType: 'mine',
          goal: 'resource_gathering',
          attempts: 4,
        }
      );

      expect(finalFeedback.reasoning).toContain('High failure rate');
      expect(finalFeedback.alternativeSuggestions).toContain(
        'Try mining in a different location'
      );
      expect(finalFeedback.alternativeSuggestions).toContain(
        'Look for different types of blocks to mine'
      );
    });
  });

  describe('Task Performance Analysis with Minecraft Data', () => {
    it('should analyze crafting performance based on material availability', async () => {
      const craftingTasks = [
        {
          id: 'craft-analysis-1',
          type: 'craft',
          parameters: { item: 'wooden_pickaxe' },
          attempts: 1,
          status: 'completed',
        },
        {
          id: 'craft-analysis-2',
          type: 'craft',
          parameters: { item: 'wooden_pickaxe' },
          attempts: 1,
          status: 'failed',
        },
        {
          id: 'craft-analysis-3',
          type: 'craft',
          parameters: { item: 'wooden_pickaxe' },
          attempts: 2,
          status: 'completed',
        },
      ];

      const results = [
        { success: true, item: 'wooden_pickaxe', crafted: true },
        { success: false, error: 'Insufficient materials' },
        { success: true, item: 'wooden_pickaxe', crafted: true },
      ];

      // Process tasks to build performance history
      for (let i = 0; i < craftingTasks.length; i++) {
        await cognitiveIntegration.processTaskCompletion(
          craftingTasks[i],
          results[i],
          {
            taskType: 'craft',
            goal: 'tool_creation',
            attempts: craftingTasks[i].attempts,
          }
        );
      }

      const stats = cognitiveIntegration.getTaskStats('craft-analysis-3');
      expect(stats.totalAttempts).toBe(1); // This task had 1 attempt
      expect(stats.successCount).toBe(1); // 1 success for this specific task
      expect(stats.failureCount).toBe(0); // 0 failures for this specific task
      expect(stats.successRate).toBeCloseTo(1.0, 2); // 1 success out of 1 attempt
    });

    it('should provide cognitive insights based on minecraft task patterns', async () => {
      // Build a history of mining tasks with mixed results
      const miningHistory = [
        { success: true, block: 'stone' },
        { success: false, error: 'No block found' },
        { success: true, block: 'coal_ore' },
        { success: true, block: 'iron_ore' },
        { success: false, error: 'No block found' },
      ];

      for (let i = 0; i < miningHistory.length; i++) {
        const task = {
          id: `mine-insight-${i + 1}`,
          type: 'mine',
          parameters: { resource: 'any' },
          attempts: 1,
          status: miningHistory[i].success ? 'completed' : 'failed',
        };

        const result = {
          results: [miningHistory[i]],
          type: 'mining',
          success: miningHistory[i].success,
          error: miningHistory[i].success ? undefined : miningHistory[i].error,
        };

        await cognitiveIntegration.processTaskCompletion(task, result, {
          taskType: 'mine',
          goal: 'resource_gathering',
          attempts: 1,
        });
      }

      const insights = await cognitiveIntegration.getCognitiveInsights('mine');
      expect(insights.length).toBeGreaterThan(0);
      expect(insights.some((insight) => insight.includes('success rate'))).toBe(
        true
      );
    });
  });

  describe('Memory Integration with Minecraft Context', () => {
    it('should store minecraft task results in memory for future reference', async () => {
      const task = {
        id: 'memory-test-1',
        type: 'craft',
        parameters: { item: 'wooden_pickaxe' },
        attempts: 1,
        status: 'completed',
      };

      const minecraftResult = {
        success: true,
        item: 'wooden_pickaxe',
        quantity: 1,
        crafted: true,
      };

      const feedback = await cognitiveIntegration.processTaskCompletion(
        task,
        minecraftResult,
        {
          taskType: 'craft',
          goal: 'tool_creation',
          attempts: 1,
          minecraftContext: {
            inventory: ['oak_log', 'oak_log', 'stick'],
            position: { x: 10, y: 64, z: 5 },
            time: 'day',
          },
        }
      );

      expect(feedback.taskId).toBe('memory-test-1');

      // Verify the feedback contains minecraft-specific reasoning
      expect(feedback.reasoning).toContain('Successfully completed craft task');

      // The memory storage is internal, but we can verify the task was processed
      const stats = cognitiveIntegration.getTaskStats('memory-test-1');
      expect(stats.totalAttempts).toBe(1);
      expect(stats.successCount).toBe(1);
    });
  });
});

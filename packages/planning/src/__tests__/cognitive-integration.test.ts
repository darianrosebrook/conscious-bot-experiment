/**
 * Cognitive Integration Test Suite
 *
 * Tests the cognitive integration system's ability to analyze task performance,
 * generate feedback, and provide adaptive decision-making capabilities.
 *
 * @author @darianrosebrook
 */

import {
  CognitiveIntegration,
  CognitiveFeedback,
} from '../cognitive-integration';

// Mock EventEmitter to avoid issues with the mock
vi.mock('events', () => {
  class MockEventEmitter {
    on = vi.fn();
    emit = vi.fn();
    removeListener = vi.fn();
  }
  return { EventEmitter: MockEventEmitter };
});

describe('CognitiveIntegration', () => {
  let cognitiveIntegration: CognitiveIntegration;

  beforeEach(() => {
    cognitiveIntegration = new CognitiveIntegration({
      failureThreshold: 0.7,
      successThreshold: 0.8,
      maxRetries: 3,
      maxHistorySize: 10,
    });
  });

  describe('Task Performance Analysis', () => {
    it('should correctly analyze successful task completion', async () => {
      const task = {
        id: 'test-task-1',
        type: 'mine',
        description: 'Mine for resources',
      };

      const result = {
        success: true,
        type: 'mining',
        error: undefined,
      };

      const feedback = await cognitiveIntegration.processTaskCompletion(
        task,
        result,
        {
          taskType: 'mine',
          goal: 'resource_gathering',
          attempts: 1,
        }
      );

      expect(feedback.success).toBe(true);
      expect(feedback.reasoning).toContain('Successfully completed');
      expect(feedback.alternativeSuggestions).toHaveLength(0);
      expect(feedback.emotionalImpact).toBe('positive');
      expect(feedback.confidence).toBeGreaterThan(0.5);
    });

    it('should correctly analyze failed task completion', async () => {
      const task = {
        id: 'test-task-2',
        type: 'craft',
        description: 'Craft wooden pickaxe',
      };

      const result = {
        success: false,
        type: 'crafting',
        error: 'Missing required materials',
      };

      const feedback = await cognitiveIntegration.processTaskCompletion(
        task,
        result,
        {
          taskType: 'craft',
          goal: 'tool_crafting',
          attempts: 1,
        }
      );

      expect(feedback.success).toBe(false);
      expect(feedback.reasoning).toContain('High failure rate');
      expect(feedback.alternativeSuggestions.length).toBeGreaterThan(0);
      expect(feedback.emotionalImpact).toBe('negative');
      expect(feedback.confidence).toBeLessThan(0.5);
    });

    it('should detect stuck patterns in task execution', async () => {
      const task = {
        id: 'test-task-3',
        type: 'mine',
        description: 'Mine for resources',
      };

      // Simulate multiple consecutive failures
      for (let i = 0; i < 3; i++) {
        const result = {
          success: false,
          type: 'mining',
          error: 'No blocks found',
        };

        await cognitiveIntegration.processTaskCompletion(task, result, {
          taskType: 'mine',
          goal: 'resource_gathering',
          attempts: i + 1,
        });
      }

      const finalResult = {
        success: false,
        type: 'mining',
        error: 'No blocks found',
      };

      const feedback = await cognitiveIntegration.processTaskCompletion(
        task,
        finalResult,
        {
          taskType: 'mine',
          goal: 'resource_gathering',
          attempts: 4,
        }
      );

      expect(feedback.reasoning).toContain('Stuck in a loop');
      expect(feedback.alternativeSuggestions).toContain(
        'Try a different task type instead of mine'
      );
      expect(feedback.emotionalImpact).toBe('negative');
    });

    it('should calculate failure rates correctly', async () => {
      const task = {
        id: 'test-task-4',
        type: 'craft',
        description: 'Craft items',
      };

      // Simulate 3 failures and 1 success (75% failure rate)
      const results = [
        { success: false, error: 'Missing materials' },
        { success: false, error: 'Missing materials' },
        { success: false, error: 'Missing materials' },
        { success: true, error: undefined },
      ];

      for (let i = 0; i < results.length; i++) {
        await cognitiveIntegration.processTaskCompletion(task, results[i], {
          taskType: 'craft',
          goal: 'crafting',
          attempts: i + 1,
        });
      }

      const finalResult = {
        success: false,
        error: 'Missing materials',
      };

      const feedback = await cognitiveIntegration.processTaskCompletion(
        task,
        finalResult,
        {
          taskType: 'craft',
          goal: 'crafting',
          attempts: 5,
        }
      );

      expect(feedback.reasoning).toContain('High failure rate');
      expect(feedback.alternativeSuggestions).toContain(
        'Gather the required materials first'
      );
    });
  });

  describe('Alternative Task Generation', () => {
    it('should suggest appropriate alternatives for crafting failures', async () => {
      const task = {
        id: 'test-task-5',
        type: 'craft',
        description: 'Craft complex item',
      };

      const result = {
        success: false,
        error: 'Missing required materials',
      };

      const feedback = await cognitiveIntegration.processTaskCompletion(
        task,
        result,
        {
          taskType: 'craft',
          goal: 'advanced_crafting',
          attempts: 1,
        }
      );

      expect(feedback.alternativeSuggestions).toContain(
        'Gather the required materials first'
      );
      expect(feedback.alternativeSuggestions).toContain(
        'Try crafting simpler items first'
      );
    });

    it('should suggest appropriate alternatives for mining failures', async () => {
      const task = {
        id: 'test-task-6',
        type: 'mine',
        description: 'Mine for specific resource',
      };

      const result = {
        success: false,
        error: 'No suitable blocks found',
      };

      const feedback = await cognitiveIntegration.processTaskCompletion(
        task,
        result,
        {
          taskType: 'mine',
          goal: 'resource_gathering',
          attempts: 1,
        }
      );

      expect(feedback.alternativeSuggestions).toContain(
        'Look for different types of blocks to mine'
      );
      expect(feedback.alternativeSuggestions).toContain(
        'Try mining in a different location'
      );
    });
  });

  describe('Task Statistics', () => {
    it('should track task statistics correctly', () => {
      const taskId = 'test-task-7';
      const stats = cognitiveIntegration.getTaskStats(taskId);

      expect(stats).toEqual({
        totalAttempts: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        lastAttempt: null,
      });
    });

    it('should calculate success rates after multiple attempts', async () => {
      const task = {
        id: 'test-task-8',
        type: 'explore',
        description: 'Explore area',
      };

      // Simulate 2 successes and 1 failure
      const results = [
        { success: true, error: undefined },
        { success: false, error: 'Obstacle encountered' },
        { success: true, error: undefined },
      ];

      for (let i = 0; i < results.length; i++) {
        await cognitiveIntegration.processTaskCompletion(task, results[i], {
          taskType: 'explore',
          goal: 'exploration',
          attempts: i + 1,
        });
      }

      const stats = cognitiveIntegration.getTaskStats(task.id);
      expect(stats.totalAttempts).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.successRate).toBeCloseTo(0.67, 2);
    });
  });

  describe('Task Abandonment Logic', () => {
    it('should recommend abandoning tasks with high failure rates', async () => {
      const task = {
        id: 'test-task-9',
        type: 'craft',
        description: 'Craft complex item',
      };

      // Simulate multiple failures to trigger abandonment
      for (let i = 0; i < 4; i++) {
        const result = {
          success: false,
          error: 'Missing materials',
        };

        await cognitiveIntegration.processTaskCompletion(task, result, {
          taskType: 'craft',
          goal: 'crafting',
          attempts: i + 1,
        });
      }

      const shouldAbandon = cognitiveIntegration.shouldAbandonTask(task.id);
      expect(shouldAbandon).toBe(true);
    });

    it('should not recommend abandoning tasks with good success rates', async () => {
      const task = {
        id: 'test-task-10',
        type: 'move',
        description: 'Move to location',
      };

      // Simulate mostly successful attempts
      const results = [
        { success: true, error: undefined },
        { success: true, error: undefined },
        { success: false, error: 'Obstacle' },
        { success: true, error: undefined },
      ];

      for (let i = 0; i < results.length; i++) {
        await cognitiveIntegration.processTaskCompletion(task, results[i], {
          taskType: 'move',
          goal: 'navigation',
          attempts: i + 1,
        });
      }

      const shouldAbandon = cognitiveIntegration.shouldAbandonTask(task.id);
      expect(shouldAbandon).toBe(false);
    });
  });

  describe('Cognitive Insights', () => {
    it('should generate insights for task types', async () => {
      const task = {
        id: 'test-task-11',
        type: 'mine',
        description: 'Mine for resources',
      };

      // Create some task history
      for (let i = 0; i < 3; i++) {
        const result = {
          success: i < 2, // 2 successes, 1 failure
          error: i === 2 ? 'No blocks found' : undefined,
        };

        await cognitiveIntegration.processTaskCompletion(task, result, {
          taskType: 'mine',
          goal: 'resource_gathering',
          attempts: i + 1,
        });
      }

      const insights = await cognitiveIntegration.getCognitiveInsights('mine');
      expect(insights.length).toBeGreaterThan(0);
      expect(insights.some((insight) => insight.includes('success rate'))).toBe(
        true
      );
    });
  });

  describe('Configuration', () => {
    it('should use default configuration when none provided', () => {
      const defaultIntegration = new CognitiveIntegration();
      expect(defaultIntegration).toBeDefined();
    });

    it('should use custom configuration when provided', () => {
      const customConfig = {
        failureThreshold: 0.5,
        successThreshold: 0.9,
        maxRetries: 5,
        maxHistorySize: 20,
      };

      const customIntegration = new CognitiveIntegration(customConfig);
      expect(customIntegration).toBeDefined();
    });
  });

  describe('Memory Management', () => {
    it('should limit history size to prevent memory leaks', async () => {
      const task = {
        id: 'test-task-12',
        type: 'explore',
        description: 'Explore area',
      };

      // Create more attempts than maxHistorySize
      for (let i = 0; i < 15; i++) {
        const result = {
          success: i % 2 === 0, // Alternating success/failure
          error: i % 2 === 1 ? 'Error' : undefined,
        };

        await cognitiveIntegration.processTaskCompletion(task, result, {
          taskType: 'explore',
          goal: 'exploration',
          attempts: i + 1,
        });
      }

      const stats = cognitiveIntegration.getTaskStats(task.id);
      expect(stats.totalAttempts).toBeLessThanOrEqual(10); // maxHistorySize
    });
  });
});

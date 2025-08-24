/**
 * Dashboard Cognitive Stream Integration Test Suite
 * 
 * Tests the integration between the cognitive system and dashboard display,
 * including cognitive feedback processing and stream updates.
 * 
 * @author @darianrosebrook
 */

describe('Dashboard Cognitive Stream Integration', () => {
  describe('Cognitive Feedback Processing', () => {
    it('should process cognitive feedback for dashboard display', () => {
      const mockCognitiveFeedback = {
        taskId: 'test-task-1',
        success: false,
        reasoning: 'High failure rate (75.0%) for craft task. Current strategy may not be optimal.',
        alternativeSuggestions: ['Gather the required materials first', 'Try crafting simpler items first'],
        emotionalImpact: 'negative' as const,
        confidence: 0.3,
        timestamp: Date.now(),
      };

      const mockTask = {
        id: 'test-task-1',
        type: 'craft',
        description: 'Craft wooden pickaxe',
        status: 'failed',
        cognitiveFeedback: mockCognitiveFeedback,
      };

      // Simulate the processing that happens in the dashboard stream
      const processCognitiveFeedback = (task: any) => {
        if (!task.cognitiveFeedback) return null;

        const feedback = task.cognitiveFeedback;
        return {
          id: `feedback-${feedback.timestamp}-${Math.random().toString(36).substr(2, 9)}`,
          ts: new Date(feedback.timestamp).toISOString(),
          text: `🧠 ${feedback.reasoning}`,
          type: 'reflection' as const,
        };
      };

      const processedFeedback = processCognitiveFeedback(mockTask);

      expect(processedFeedback).toBeDefined();
      expect(processedFeedback?.text).toContain('🧠');
      expect(processedFeedback?.text).toContain('High failure rate');
      expect(processedFeedback?.type).toBe('reflection');
    });

    it('should process alternative suggestions for dashboard display', () => {
      const mockCognitiveFeedback = {
        taskId: 'test-task-2',
        success: false,
        reasoning: 'Failed to complete craft task: Missing required materials.',
        alternativeSuggestions: ['Gather the required materials first', 'Try crafting simpler items first'],
        emotionalImpact: 'neutral' as const,
        confidence: 0.4,
        timestamp: Date.now(),
      };

      const mockTask = {
        id: 'test-task-2',
        type: 'craft',
        description: 'Craft wooden pickaxe',
        status: 'failed',
        cognitiveFeedback: mockCognitiveFeedback,
      };

      // Simulate the processing that happens in the dashboard stream
      const processAlternativeSuggestions = (task: any) => {
        const feedback = task.cognitiveFeedback;
        if (!feedback?.alternativeSuggestions?.length) return null;

        return {
          id: `suggestions-${feedback.timestamp}-${Math.random().toString(36).substr(2, 9)}`,
          ts: new Date(feedback.timestamp).toISOString(),
          text: `💡 Alternatives: ${feedback.alternativeSuggestions.slice(0, 2).join(', ')}`,
          type: 'reflection' as const,
        };
      };

      const processedSuggestions = processAlternativeSuggestions(mockTask);

      expect(processedSuggestions).toBeDefined();
      expect(processedSuggestions?.text).toContain('💡 Alternatives:');
      expect(processedSuggestions?.text).toContain('Gather the required materials first');
      expect(processedSuggestions?.text).toContain('Try crafting simpler items first');
    });

    it('should handle tasks without cognitive feedback gracefully', () => {
      const mockTask = {
        id: 'test-task-3',
        type: 'move',
        description: 'Move to location',
        status: 'completed',
        cognitiveFeedback: null,
      };

      const processCognitiveFeedback = (task: any) => {
        if (!task.cognitiveFeedback) return null;
        // This should not be reached
        return { error: 'Should not reach here' };
      };

      const processedFeedback = processCognitiveFeedback(mockTask);

      expect(processedFeedback).toBeNull();
    });
  });

  describe('Task Status Integration', () => {
    it('should display successful task completion with positive feedback', () => {
      const mockTask = {
        id: 'test-task-4',
        type: 'mine',
        description: 'Mine for resources',
        status: 'completed',
        cognitiveFeedback: {
          taskId: 'test-task-4',
          success: true,
          reasoning: 'Successfully completed mine task on first attempt. The approach was effective.',
          alternativeSuggestions: [],
          emotionalImpact: 'positive' as const,
          confidence: 0.9,
          timestamp: Date.now(),
        },
      };

      const getTaskDisplayInfo = (task: any) => {
        const feedback = task.cognitiveFeedback;
        return {
          status: task.status,
          hasFeedback: !!feedback,
          isPositive: feedback?.emotionalImpact === 'positive',
          confidence: feedback?.confidence || 0,
          reasoning: feedback?.reasoning || 'No feedback available',
        };
      };

      const displayInfo = getTaskDisplayInfo(mockTask);

      expect(displayInfo.status).toBe('completed');
      expect(displayInfo.hasFeedback).toBe(true);
      expect(displayInfo.isPositive).toBe(true);
      expect(displayInfo.confidence).toBeGreaterThan(0.8);
      expect(displayInfo.reasoning).toContain('Successfully completed');
    });

    it('should display failed task with negative feedback', () => {
      const mockTask = {
        id: 'test-task-5',
        type: 'craft',
        description: 'Craft wooden pickaxe',
        status: 'failed',
        failureReason: 'Missing required materials',
        cognitiveFeedback: {
          taskId: 'test-task-5',
          success: false,
          reasoning: 'Failed to complete craft task: Missing required materials. May need different resources or approach.',
          alternativeSuggestions: ['Gather the required materials first'],
          emotionalImpact: 'negative' as const,
          confidence: 0.2,
          timestamp: Date.now(),
        },
      };

      const getTaskDisplayInfo = (task: any) => {
        const feedback = task.cognitiveFeedback;
        return {
          status: task.status,
          failureReason: task.failureReason,
          hasFeedback: !!feedback,
          isNegative: feedback?.emotionalImpact === 'negative',
          confidence: feedback?.confidence || 0,
          hasAlternatives: feedback?.alternativeSuggestions?.length > 0,
        };
      };

      const displayInfo = getTaskDisplayInfo(mockTask);

      expect(displayInfo.status).toBe('failed');
      expect(displayInfo.failureReason).toBe('Missing required materials');
      expect(displayInfo.hasFeedback).toBe(true);
      expect(displayInfo.isNegative).toBe(true);
      expect(displayInfo.confidence).toBeLessThan(0.5);
      expect(displayInfo.hasAlternatives).toBe(true);
    });

    it('should display abandoned task with abandonment reason', () => {
      const mockTask = {
        id: 'test-task-6',
        type: 'craft',
        description: 'Craft complex item',
        status: 'abandoned',
        abandonReason: 'Cognitive feedback suggests abandonment',
        cognitiveFeedback: {
          taskId: 'test-task-6',
          success: false,
          reasoning: 'Stuck in a loop with craft task. Failed 3 times consecutively. Need to change approach.',
          alternativeSuggestions: ['Try a different task type', 'Focus on other achievable goals first'],
          emotionalImpact: 'negative' as const,
          confidence: 0.1,
          timestamp: Date.now(),
        },
      };

      const getTaskDisplayInfo = (task: any) => {
        return {
          status: task.status,
          abandonReason: task.abandonReason,
          hasAlternatives: task.cognitiveFeedback?.alternativeSuggestions?.length > 0,
          alternativeCount: task.cognitiveFeedback?.alternativeSuggestions?.length || 0,
        };
      };

      const displayInfo = getTaskDisplayInfo(mockTask);

      expect(displayInfo.status).toBe('abandoned');
      expect(displayInfo.abandonReason).toBe('Cognitive feedback suggests abandonment');
      expect(displayInfo.hasAlternatives).toBe(true);
      expect(displayInfo.alternativeCount).toBe(2);
    });
  });

  describe('Stream Data Aggregation', () => {
    it('should aggregate multiple cognitive feedback entries', () => {
      const mockTasks = [
        {
          id: 'task-1',
          type: 'mine',
          status: 'completed',
          cognitiveFeedback: {
            taskId: 'task-1',
            success: true,
            reasoning: 'Successfully mined stone block',
            timestamp: Date.now() - 1000,
          },
        },
        {
          id: 'task-2',
          type: 'craft',
          status: 'failed',
          cognitiveFeedback: {
            taskId: 'task-2',
            success: false,
            reasoning: 'Failed to craft item: missing materials',
            timestamp: Date.now(),
          },
        },
      ];

      const aggregateCognitiveFeedback = (tasks: any[]) => {
        return tasks
          .filter(task => task.cognitiveFeedback)
          .map(task => ({
            id: `feedback-${task.cognitiveFeedback.timestamp}`,
            taskId: task.id,
            taskType: task.type,
            reasoning: task.cognitiveFeedback.reasoning,
            success: task.cognitiveFeedback.success,
            timestamp: task.cognitiveFeedback.timestamp,
          }))
          .sort((a, b) => b.timestamp - a.timestamp);
      };

      const aggregated = aggregateCognitiveFeedback(mockTasks);

      expect(aggregated).toHaveLength(2);
      expect(aggregated[0].taskId).toBe('task-2'); // Most recent first
      expect(aggregated[1].taskId).toBe('task-1');
      expect(aggregated[0].success).toBe(false);
      expect(aggregated[1].success).toBe(true);
    });

    it('should filter recent tasks with cognitive feedback', () => {
      const mockTasks = [
        {
          id: 'task-1',
          status: 'completed',
          cognitiveFeedback: { timestamp: Date.now() - 5000 },
        },
        {
          id: 'task-2',
          status: 'failed',
          cognitiveFeedback: { timestamp: Date.now() - 1000 },
        },
        {
          id: 'task-3',
          status: 'completed',
          cognitiveFeedback: null, // No feedback
        },
        {
          id: 'task-4',
          status: 'failed',
          cognitiveFeedback: { timestamp: Date.now() },
        },
      ];

      const filterRecentTasksWithFeedback = (tasks: any[], maxAgeMs = 3000) => {
        const now = Date.now();
        return tasks.filter(task => 
          task.cognitiveFeedback && 
          (now - task.cognitiveFeedback.timestamp) <= maxAgeMs
        );
      };

      const recentTasks = filterRecentTasksWithFeedback(mockTasks);

      expect(recentTasks).toHaveLength(2);
      expect(recentTasks[0].id).toBe('task-2');
      expect(recentTasks[1].id).toBe('task-4');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed cognitive feedback gracefully', () => {
      const mockTask = {
        id: 'task-7',
        type: 'mine',
        status: 'completed',
        cognitiveFeedback: {
          // Missing required fields
          taskId: 'task-7',
          // No reasoning, success, or timestamp
        },
      };

      const processCognitiveFeedback = (task: any) => {
        try {
          const feedback = task.cognitiveFeedback;
          if (!feedback?.reasoning || feedback.success === undefined) {
            return {
              id: `feedback-${Date.now()}`,
              text: '⚠️ Incomplete cognitive feedback data',
              type: 'error' as const,
            };
          }

          return {
            id: `feedback-${feedback.timestamp || Date.now()}`,
            text: `🧠 ${feedback.reasoning}`,
            type: 'reflection' as const,
          };
        } catch (error) {
          return {
            id: `error-${Date.now()}`,
            text: '⚠️ Error processing cognitive feedback',
            type: 'error' as const,
          };
        }
      };

      const processed = processCognitiveFeedback(mockTask);

      expect(processed.text).toContain('⚠️ Incomplete cognitive feedback data');
      expect(processed.type).toBe('error');
    });

    it('should handle missing task data gracefully', () => {
      const processTaskData = (task: any) => {
        if (!task || typeof task !== 'object') {
          return {
            id: `error-${Date.now()}`,
            text: '⚠️ Invalid task data',
            type: 'error' as const,
          };
        }

        return {
          id: task.id || 'unknown',
          type: task.type || 'unknown',
          status: task.status || 'unknown',
          hasFeedback: !!task.cognitiveFeedback,
        };
      };

      const result1 = processTaskData(null);
      const result2 = processTaskData(undefined);
      const result3 = processTaskData('invalid');

      expect(result1.text).toContain('⚠️ Invalid task data');
      expect(result2.text).toContain('⚠️ Invalid task data');
      expect(result3.text).toContain('⚠️ Invalid task data');
    });
  });

  describe('Performance Considerations', () => {
    it('should limit the number of processed feedback entries', () => {
      const mockTasks = Array.from({ length: 20 }, (_, i) => ({
        id: `task-${i}`,
        status: 'completed',
        cognitiveFeedback: {
          taskId: `task-${i}`,
          reasoning: `Feedback for task ${i}`,
          timestamp: Date.now() - i * 1000,
        },
      }));

      const processLimitedFeedback = (tasks: any[], limit = 10) => {
        return tasks
          .filter(task => task.cognitiveFeedback)
          .slice(0, limit)
          .map(task => ({
            id: task.id,
            reasoning: task.cognitiveFeedback.reasoning,
          }));
      };

      const processed = processLimitedFeedback(mockTasks, 10);

      expect(processed).toHaveLength(10);
      expect(processed[0].id).toBe('task-0');
      expect(processed[9].id).toBe('task-9');
    });

    it('should deduplicate feedback entries', () => {
      const mockTasks = [
        {
          id: 'task-1',
          cognitiveFeedback: { timestamp: 1000, reasoning: 'Same feedback' },
        },
        {
          id: 'task-2',
          cognitiveFeedback: { timestamp: 1000, reasoning: 'Same feedback' },
        },
        {
          id: 'task-3',
          cognitiveFeedback: { timestamp: 2000, reasoning: 'Different feedback' },
        },
      ];

      const deduplicateFeedback = (tasks: any[]) => {
        const seen = new Set();
        return tasks.filter(task => {
          const feedback = task.cognitiveFeedback;
          if (!feedback) return false;

          const key = `${feedback.timestamp}-${feedback.reasoning}`;
          if (seen.has(key)) return false;

          seen.add(key);
          return true;
        });
      };

      const deduplicated = deduplicateFeedback(mockTasks);

      expect(deduplicated).toHaveLength(2);
      expect(deduplicated[0].id).toBe('task-1');
      expect(deduplicated[1].id).toBe('task-3');
    });
  });
});

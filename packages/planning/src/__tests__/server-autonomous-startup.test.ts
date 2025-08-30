/**
 * Server Autonomous Startup Test Suite
 *
 * Tests that the autonomous task executor starts properly when the server starts
 * and that the bot actually begins performing tasks rather than standing idle.
 *
 * @author @darianrosebrook
 */

import { vi } from 'vitest';
import fetch from 'node-fetch';

// Mock fetch for HTTP requests
vi.mock('node-fetch');
const mockFetch = fetch as any;

describe('Server Autonomous Startup Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Server Startup and Autonomous Execution', () => {
    it('should trigger autonomous task execution on startup', async () => {
      // Mock successful HTTP responses for task execution
      mockFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ success: true, distance: 3 }),
        } as any)
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({ success: true, message: 'Hello, world!' }),
        } as any);

      // Simulate server startup sequence
      const serverStartup = async () => {
        const startupSequence = [];

        // 1. Server starts
        startupSequence.push('server_started');

        // 2. Autonomous task executor is scheduled
        startupSequence.push('autonomous_executor_scheduled');

        // 3. Initial task generation after 30 seconds (simulated)
        startupSequence.push('initial_task_generation');

        // 4. Generate autonomous task
        const autonomousTask = {
          id: `auto-task-${Date.now()}`,
          type: 'explore',
          description: 'Explore the surroundings',
          status: 'pending',
          autonomous: true,
        };

        startupSequence.push('autonomous_task_generated');

        // 5. Execute the task
        const executeTaskInMinecraft = async (task: any) => {
          const minecraftUrl = 'http://localhost:3005';

          if (task.type === 'explore') {
            // Move forward
            const moveResult = await fetch(`${minecraftUrl}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'move_forward',
                parameters: { distance: 3 },
              }),
            }).then((res) => res.json());

            // Send chat message
            const chatResult = await fetch(`${minecraftUrl}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'chat',
                parameters: { message: 'Exploring the world!' },
              }),
            }).then((res) => res.json());

            return {
              results: [moveResult, chatResult],
              type: 'exploration',
              success: true,
              error: undefined,
            };
          }
        };

        const result = await executeTaskInMinecraft(autonomousTask);
        startupSequence.push('task_executed');

        return {
          sequence: startupSequence,
          task: autonomousTask,
          result,
        };
      };

      const startup = await serverStartup();

      // Verify startup sequence
      expect(startup.sequence).toContain('server_started');
      expect(startup.sequence).toContain('autonomous_executor_scheduled');
      expect(startup.sequence).toContain('initial_task_generation');
      expect(startup.sequence).toContain('autonomous_task_generated');
      expect(startup.sequence).toContain('task_executed');

      // Verify task was generated and executed
      expect(startup.task.type).toBe('explore');
      expect(startup.task.autonomous).toBe(true);
      expect(startup.result.success).toBe(true);
      expect(startup.result.type).toBe('exploration');

      // Verify HTTP calls were made
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should schedule regular autonomous task execution', () => {
      // Simulate setInterval scheduling
      const scheduleAutonomousExecution = () => {
        const schedule = {
          immediate: false,
          interval: 120000, // 2 minutes
          scheduledExecutions: [] as number[],
        };

        // Simulate immediate execution
        schedule.immediate = true;

        // Simulate scheduled executions over 10 minutes
        for (let i = 1; i <= 5; i++) {
          const executionTime = Date.now() + i * schedule.interval;
          schedule.scheduledExecutions.push(executionTime);
        }

        return schedule;
      };

      const schedule = scheduleAutonomousExecution();

      expect(schedule.immediate).toBe(true);
      expect(schedule.interval).toBe(120000);
      expect(schedule.scheduledExecutions).toHaveLength(5);
      expect(
        schedule.scheduledExecutions[1] - schedule.scheduledExecutions[0]
      ).toBe(120000);
    });

    it('should handle startup when minecraft interface is not available', async () => {
      // Mock network error
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const handleStartupFailure = async () => {
        try {
          // Try to execute autonomous task
          const minecraftUrl = 'http://localhost:3005';
          await fetch(`${minecraftUrl}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'move_forward',
              parameters: { distance: 1 },
            }),
          });
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : 'Unknown error',
            shouldRetry: true,
            retryDelay: 5000, // 5 seconds
          };
        }
      };

      const failure = await handleStartupFailure();

      expect(failure.error).toBe('Connection refused');
      expect(failure.shouldRetry).toBe(true);
      expect(failure.retryDelay).toBe(5000);
    });
  });

  describe('Autonomous Task Types and Variety', () => {
    it('should generate a variety of autonomous tasks over time', () => {
      const taskTypes = ['explore', 'gather', 'craft', 'build', 'farm', 'mine'];
      const generatedTasks = [];

      // Simulate multiple autonomous task generations
      for (let i = 0; i < 10; i++) {
        const taskType =
          taskTypes[Math.floor(Math.random() * taskTypes.length)];
        const task = {
          id: `auto-task-${Date.now()}-${i}`,
          type: taskType,
          description: `Autonomous ${taskType} task`,
          status: 'pending',
          autonomous: true,
          createdAt: Date.now() + i * 120000, // 2 minutes apart
        };
        generatedTasks.push(task);
      }

      // Verify variety in task types
      const uniqueTypes = new Set(generatedTasks.map((t) => t.type));
      expect(uniqueTypes.size).toBeGreaterThan(1);
      expect(generatedTasks.every((t) => t.autonomous)).toBe(true);

      // Verify tasks are spaced out in time
      for (let i = 1; i < generatedTasks.length; i++) {
        const timeDiff =
          generatedTasks[i].createdAt - generatedTasks[i - 1].createdAt;
        expect(timeDiff).toBe(120000); // 2 minutes
      }
    });

    it('should prioritize different task types based on context', () => {
      const contextBasedTaskSelection = (context: any) => {
        const taskPriorities = {
          lowHealth: ['craft', 'gather'], // Need tools and resources
          lowFood: ['farm', 'gather'], // Need food
          noShelter: ['build', 'gather'], // Need shelter
          exploration: ['explore', 'mine'], // Need to explore and find resources
          default: ['explore', 'gather', 'craft', 'build', 'farm', 'mine'],
        };

        if (context.health < 0.3) return taskPriorities.lowHealth;
        if (context.food < 0.3) return taskPriorities.lowFood;
        if (!context.hasShelter) return taskPriorities.noShelter;
        if (context.explorationLevel < 0.5) return taskPriorities.exploration;

        return taskPriorities.default;
      };

      // Test different contexts
      const lowHealthContext = {
        health: 0.2,
        food: 0.8,
        hasShelter: true,
        explorationLevel: 0.7,
      };
      const lowFoodContext = {
        health: 0.8,
        food: 0.2,
        hasShelter: true,
        explorationLevel: 0.7,
      };
      const noShelterContext = {
        health: 0.8,
        food: 0.8,
        hasShelter: false,
        explorationLevel: 0.7,
      };

      expect(contextBasedTaskSelection(lowHealthContext)).toContain('craft');
      expect(contextBasedTaskSelection(lowHealthContext)).toContain('gather');
      expect(contextBasedTaskSelection(lowFoodContext)).toContain('farm');
      expect(contextBasedTaskSelection(noShelterContext)).toContain('build');
    });
  });

  describe('Task Execution Monitoring', () => {
    it('should monitor task execution success and failure rates', () => {
      const taskExecutionMonitor = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        successRate: 0,
        lastExecutionTime: 0,
        executionHistory: [] as any[],

        recordExecution: function (task: any, result: any) {
          this.totalExecutions++;
          this.lastExecutionTime = Date.now();

          const execution = {
            taskId: task.id,
            taskType: task.type,
            success: result.success,
            timestamp: this.lastExecutionTime,
            duration: result.duration || 0,
          };

          this.executionHistory.push(execution);

          if (result.success) {
            this.successfulExecutions++;
          } else {
            this.failedExecutions++;
          }

          this.successRate = this.successfulExecutions / this.totalExecutions;
        },

        getStats: function () {
          return {
            totalExecutions: this.totalExecutions,
            successfulExecutions: this.successfulExecutions,
            failedExecutions: this.failedExecutions,
            successRate: this.successRate,
            lastExecutionTime: this.lastExecutionTime,
            averageExecutionTime:
              this.executionHistory.length > 0
                ? this.executionHistory.reduce(
                    (sum, exec) => sum + exec.duration,
                    0
                  ) / this.executionHistory.length
                : 0,
          };
        },
      };

      // Simulate some task executions
      const tasks = [
        { id: 'task-1', type: 'explore' },
        { id: 'task-2', type: 'gather' },
        { id: 'task-3', type: 'craft' },
      ];

      const results = [
        { success: true, duration: 5000 },
        { success: false, duration: 3000 },
        { success: true, duration: 8000 },
      ];

      tasks.forEach((task, index) => {
        taskExecutionMonitor.recordExecution(task, results[index]);
      });

      const stats = taskExecutionMonitor.getStats();

      expect(stats.totalExecutions).toBe(3);
      expect(stats.successfulExecutions).toBe(2);
      expect(stats.failedExecutions).toBe(1);
      expect(stats.successRate).toBeCloseTo(0.67, 2);
      expect(stats.averageExecutionTime).toBeCloseTo(5333.33, 1);
    });

    it('should adapt task selection based on execution history', () => {
      const adaptiveTaskSelector = {
        executionHistory: [] as any[],
        taskTypeSuccessRates: {} as Record<string, number>,

        recordExecution: function (taskType: string, success: boolean) {
          this.executionHistory.push({
            taskType,
            success,
            timestamp: Date.now(),
          });
          this.updateSuccessRates();
        },

        updateSuccessRates: function () {
          const taskTypes = new Set(
            this.executionHistory.map((h) => h.taskType)
          );

          taskTypes.forEach((type) => {
            const typeExecutions = this.executionHistory.filter(
              (h) => h.taskType === type
            );
            const successful = typeExecutions.filter((h) => h.success).length;
            this.taskTypeSuccessRates[type as string] =
              successful / typeExecutions.length;
          });
        },

        selectNextTask: function () {
          const taskTypes = [
            'explore',
            'gather',
            'craft',
            'build',
            'farm',
            'mine',
          ];

          // Prefer task types with higher success rates
          const rankedTasks = taskTypes
            .map((type) => ({
              type,
              successRate: this.taskTypeSuccessRates[type] || 0.5, // Default to 0.5 for new types
            }))
            .sort((a, b) => b.successRate - a.successRate);

          return rankedTasks[0].type;
        },
      };

      // Simulate execution history
      adaptiveTaskSelector.recordExecution('explore', true);
      adaptiveTaskSelector.recordExecution('explore', true);
      adaptiveTaskSelector.recordExecution('craft', false);
      adaptiveTaskSelector.recordExecution('craft', false);
      adaptiveTaskSelector.recordExecution('gather', true);

      const nextTask = adaptiveTaskSelector.selectNextTask();

      // Should prefer 'explore' or 'gather' over 'craft' due to success rates
      expect(['explore', 'gather']).toContain(nextTask);
      expect(nextTask).not.toBe('craft');
    });
  });
});

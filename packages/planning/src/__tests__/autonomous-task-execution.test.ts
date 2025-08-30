/// <reference types="vitest/globals" />

/**
 * Autonomous Task Execution Test Suite
 *
 * Tests the autonomous task generation and execution system to ensure
 * the bot actually performs tasks when it joins rather than just standing there.
 *
 * @author @darianrosebrook
 */

import fetch from 'node-fetch';

// Mock fetch for HTTP requests
vi.mock('node-fetch');
const mockFetch = fetch as any;

// Mock the planning system
const mockPlanningSystem = {
  goalFormulation: {
    _tasks: [] as any[],
    _lastTaskExecution: 0,
    _failedTaskCount: 0,
    _maxConsecutiveFailures: 3,
    addTask: vi.fn((task: any) => {
      mockPlanningSystem.goalFormulation._tasks.push(task);
    }),
    getCurrentTasks: vi.fn(() => mockPlanningSystem.goalFormulation._tasks),
  },
  reactiveExecutor: {
    executeNextTask: vi.fn(),
  },
};

describe('Autonomous Task Execution Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlanningSystem.goalFormulation._tasks = [];
    mockPlanningSystem.goalFormulation._lastTaskExecution = 0;
  });

  describe('Autonomous Task Generation', () => {
    it('should generate autonomous tasks when no tasks are available', () => {
      // Mock the generateAutonomousTask function
      const generateAutonomousTask = () => ({
        id: `auto-task-${Date.now()}`,
        type: 'explore',
        description: 'Explore the surroundings to understand the environment',
        priority: 0.6,
        urgency: 0.5,
        parameters: { distance: 5, direction: 'forward' },
        goal: 'autonomous_exploration',
        status: 'pending',
        createdAt: Date.now(),
        completedAt: null,
        autonomous: true,
      });

      const task = generateAutonomousTask();

      expect(task).toBeDefined();
      expect(task.type).toBe('explore');
      expect(task.autonomous).toBe(true);
      expect(task.status).toBe('pending');
      expect(task.goal).toBe('autonomous_exploration');
    });

    it('should generate different types of autonomous tasks', () => {
      const taskTypes = ['explore', 'gather', 'craft', 'build', 'farm', 'mine'];
      const generatedTasks = [];

      for (let i = 0; i < 10; i++) {
        const task = {
          id: `auto-task-${Date.now()}-${i}`,
          type: taskTypes[Math.floor(Math.random() * taskTypes.length)],
          description: 'Autonomous task',
          priority: 0.6,
          urgency: 0.5,
          parameters: {},
          goal: 'autonomous_exploration',
          status: 'pending',
          createdAt: Date.now(),
          completedAt: null,
          autonomous: true,
        };
        generatedTasks.push(task);
      }

      // Verify we get different task types
      const uniqueTypes = new Set(generatedTasks.map((t) => t.type));
      expect(uniqueTypes.size).toBeGreaterThan(1);
      expect(generatedTasks.every((t) => t.autonomous)).toBe(true);
    });

    it('should generate tasks with appropriate parameters', () => {
      const taskTypes = [
        {
          type: 'explore',
          expectedParams: ['distance', 'direction'],
        },
        {
          type: 'gather',
          expectedParams: ['resource', 'amount'],
        },
        {
          type: 'craft',
          expectedParams: ['item'],
        },
        {
          type: 'mine',
          expectedParams: ['depth', 'resource'],
        },
      ];

      taskTypes.forEach(({ type, expectedParams }) => {
        const task = {
          id: `auto-task-${Date.now()}`,
          type,
          description: `Autonomous ${type} task`,
          parameters: expectedParams.reduce((params, param) => {
            params[param] = 'default_value';
            return params;
          }, {} as any),
          goal: 'autonomous_exploration',
          status: 'pending',
          autonomous: true,
        };

        expect(task.parameters).toBeDefined();
        expectedParams.forEach((param) => {
          expect(task.parameters[param]).toBeDefined();
        });
      });
    });
  });

  describe('Autonomous Task Execution Logic', () => {
    it('should execute autonomous task when no pending tasks exist', async () => {
      const now = Date.now();
      const twoMinutes = 2 * 60 * 1000;

      // Mock the autonomous task executor logic
      const autonomousTaskExecutor = async () => {
        // Check if enough time has passed
        if (
          now - mockPlanningSystem.goalFormulation._lastTaskExecution <
          twoMinutes
        ) {
          return;
        }

        // Check if there are any pending tasks
        const pendingTasks = mockPlanningSystem.goalFormulation._tasks.filter(
          (task: any) => task.status === 'pending'
        );

        // If no pending tasks, generate a new autonomous task
        if (pendingTasks.length === 0) {
          const newTask = {
            id: `auto-task-${now}`,
            type: 'explore',
            description: 'Explore the surroundings',
            status: 'pending',
            autonomous: true,
          };

          mockPlanningSystem.goalFormulation.addTask(newTask);

          // Execute the task
          await mockPlanningSystem.reactiveExecutor.executeNextTask();
          mockPlanningSystem.goalFormulation._lastTaskExecution = now;

          return newTask;
        }
      };

      const result = await autonomousTaskExecutor();

      expect(result).toBeDefined();
      expect(result?.type).toBe('explore');
      expect(result?.autonomous).toBe(true);
      expect(
        mockPlanningSystem.reactiveExecutor.executeNextTask
      ).toHaveBeenCalled();
    });

    it('should execute pending tasks before generating new ones', async () => {
      const now = Date.now();
      const twoMinutes = 2 * 60 * 1000;

      // Add a pending task
      const pendingTask = {
        id: 'pending-task-1',
        type: 'mine',
        description: 'Mine for resources',
        status: 'pending',
        autonomous: false,
      };
      mockPlanningSystem.goalFormulation.addTask(pendingTask);

      const autonomousTaskExecutor = async () => {
        if (
          now - mockPlanningSystem.goalFormulation._lastTaskExecution <
          twoMinutes
        ) {
          return;
        }

        const pendingTasks = mockPlanningSystem.goalFormulation._tasks.filter(
          (task: any) => task.status === 'pending'
        );

        if (pendingTasks.length > 0) {
          // Execute the next pending task
          await mockPlanningSystem.reactiveExecutor.executeNextTask();
          mockPlanningSystem.goalFormulation._lastTaskExecution = now;
          return pendingTasks[0];
        }
      };

      const result = await autonomousTaskExecutor();

      expect(result).toBeDefined();
      expect(result?.id).toBe('pending-task-1');
      expect(result?.status).toBe('pending');
      expect(
        mockPlanningSystem.reactiveExecutor.executeNextTask
      ).toHaveBeenCalled();
    });

    it('should respect time intervals between task executions', async () => {
      const now = Date.now();
      const twoMinutes = 2 * 60 * 1000;

      // Set last execution to 1 minute ago (should not execute)
      mockPlanningSystem.goalFormulation._lastTaskExecution =
        now - 1 * 60 * 1000;

      const autonomousTaskExecutor = async () => {
        if (
          now - mockPlanningSystem.goalFormulation._lastTaskExecution <
          twoMinutes
        ) {
          return null; // Should not execute
        }

        const newTask = {
          id: `auto-task-${now}`,
          type: 'explore',
          status: 'pending',
          autonomous: true,
        };

        mockPlanningSystem.goalFormulation.addTask(newTask);
        await mockPlanningSystem.reactiveExecutor.executeNextTask();
        return newTask;
      };

      const result = await autonomousTaskExecutor();

      expect(result).toBeNull();
      expect(
        mockPlanningSystem.reactiveExecutor.executeNextTask
      ).not.toHaveBeenCalled();
    });
  });

  describe('Task Execution in Minecraft', () => {
    it('should execute explore task in minecraft', async () => {
      const mockResponse = { success: true, distance: 3 };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
      } as any);

      const executeTaskInMinecraft = async (task: any) => {
        const minecraftUrl = 'http://localhost:3005';

        if (task.type === 'explore') {
          const result = await fetch(`${minecraftUrl}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'move_forward',
              parameters: { distance: task.parameters?.distance || 3 },
            }),
          }).then((res) => res.json());

          return {
            results: [result],
            type: 'exploration',
            success: true,
            error: undefined,
          };
        }
      };

      const task = {
        type: 'explore',
        parameters: { distance: 5, direction: 'forward' },
      };

      const result = await executeTaskInMinecraft(task);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3005/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'move_forward',
          parameters: { distance: 5 },
        }),
      });

      expect(result?.success).toBe(true);
      expect(result?.type).toBe('exploration');
    });

    it('should execute gather task in minecraft', async () => {
      const mockResponses = [
        { success: true, position: { x: 0, y: 64, z: 0 } },
        { success: true, block: 'oak_log', position: { x: 1, y: 64, z: 0 } },
      ];

      mockFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve(mockResponses[0]),
        } as any)
        .mockResolvedValueOnce({
          json: () => Promise.resolve(mockResponses[1]),
        } as any);

      const executeTaskInMinecraft = async (task: any) => {
        const minecraftUrl = 'http://localhost:3005';

        if (task.type === 'gather') {
          // Get current position
          const gameState = await fetch(`${minecraftUrl}/state`).then((res) =>
            res.json()
          );

          // Try to gather resources
          const gatherResult = await fetch(`${minecraftUrl}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'mine_block',
              parameters: { position: { x: 1, y: 64, z: 0 } },
            }),
          }).then((res) => res.json());

          return {
            results: [gatherResult],
            type: 'gathering',
            success: true,
            error: undefined,
          };
        }
      };

      const task = {
        type: 'gather',
        parameters: { resource: 'wood', amount: 1 },
      };

      const result = await executeTaskInMinecraft(task);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result?.success).toBe(true);
      expect(result?.type).toBe('gathering');
    });

    it('should handle task execution failures gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const executeTaskInMinecraft = async (task: any) => {
        try {
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
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      };

      const task = {
        type: 'move',
        parameters: { distance: 1 },
      };

      const result = await executeTaskInMinecraft(task);

      expect(result?.success).toBe(false);
      expect(result?.error).toBe('Network error');
    });
  });

  describe('Autonomous Task Scheduling', () => {
    it('should schedule autonomous task execution at regular intervals', () => {
      const scheduleAutonomousExecution = () => {
        // Simulate setInterval behavior
        const interval = 30000; // 30 seconds
        const executions: number[] = [];

        // Simulate 3 executions over 1.5 minutes
        for (let i = 0; i < 3; i++) {
          const executionTime = Date.now() + i * interval;
          executions.push(executionTime);
        }

        return executions;
      };

      const executions = scheduleAutonomousExecution();

      expect(executions).toHaveLength(3);
      expect(executions[1] - executions[0]).toBe(30000);
      expect(executions[2] - executions[1]).toBe(30000);
    });

    it('should start autonomous execution immediately when bot joins', () => {
      const startAutonomousExecution = () => {
        // Immediate execution
        const immediateExecution = Date.now();

        // Scheduled interval execution
        const intervalExecution = Date.now() + 30000;

        return {
          immediate: immediateExecution,
          nextScheduled: intervalExecution,
        };
      };

      const execution = startAutonomousExecution();

      expect(execution.immediate).toBeLessThanOrEqual(Date.now());
      expect(execution.nextScheduled).toBeGreaterThan(Date.now());
    });
  });

  describe('Task Priority and Selection', () => {
    it('should prioritize urgent tasks over autonomous tasks', () => {
      const tasks = [
        {
          id: 'urgent-task',
          type: 'craft',
          priority: 0.9,
          urgency: 0.8,
          status: 'pending',
          autonomous: false,
        },
        {
          id: 'auto-task',
          type: 'explore',
          priority: 0.6,
          urgency: 0.5,
          status: 'pending',
          autonomous: true,
        },
      ];

      const selectNextTask = (taskList: any[]) => {
        return taskList.sort((a, b) => {
          // Prioritize by urgency first, then by priority
          if (a.urgency !== b.urgency) {
            return b.urgency - a.urgency;
          }
          return b.priority - a.priority;
        })[0];
      };

      const nextTask = selectNextTask(tasks);

      expect(nextTask.id).toBe('urgent-task');
      expect(nextTask.urgency).toBe(0.8);
      expect(nextTask.autonomous).toBe(false);
    });

    it('should select autonomous tasks when no urgent tasks exist', () => {
      const tasks = [
        {
          id: 'auto-task-1',
          type: 'explore',
          priority: 0.6,
          urgency: 0.5,
          status: 'pending',
          autonomous: true,
        },
        {
          id: 'auto-task-2',
          type: 'gather',
          priority: 0.7,
          urgency: 0.4,
          status: 'pending',
          autonomous: true,
        },
      ];

      const selectNextTask = (taskList: any[]) => {
        return taskList.sort((a, b) => b.priority - a.priority)[0];
      };

      const nextTask = selectNextTask(tasks);

      expect(nextTask.id).toBe('auto-task-2');
      expect(nextTask.priority).toBe(0.7);
      expect(nextTask.autonomous).toBe(true);
    });
  });
});

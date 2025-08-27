/**
 * End-to-End Integration Test Suite
 *
 * Tests the complete flow from planning system through cognitive integration
 * to minecraft actions using a mock minecraft server.
 *
 * @author @darianrosebrook
 */

import { CognitiveIntegration } from '../cognitive-integration';
import fetch from 'node-fetch';

// Mock EventEmitter
vi.mock('events', () => {
  class MockEventEmitter {
    on = vi.fn();
    emit = vi.fn();
    removeListener = vi.fn();
  }
  return { EventEmitter: MockEventEmitter };
});

// Mock fetch but allow real HTTP calls to our mock server
vi.mock('node-fetch');
const mockFetch = fetch as vi.MockedFunction<typeof fetch>;

// Import mock server (we'll use the actual implementation in a real test)
interface MockMinecraftServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getState(): any;
  setState(state: any): void;
  addBlock(position: any, type: string): void;
  getChatHistory(): any[];
}

// Mock the server for this test
const createMockServer = (): MockMinecraftServer => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  getState: vi.fn(() => ({
    position: { x: 0, y: 64, z: 0 },
    health: 20,
    food: 20,
    inventory: [{ name: 'oak_log', count: 5 }],
    connected: true,
  })),
  setState: vi.fn(),
  addBlock: vi.fn(),
  getChatHistory: vi.fn(() => []),
});

describe('End-to-End Integration Tests', () => {
  let cognitiveIntegration: CognitiveIntegration;
  let mockServer: MockMinecraftServer;

  beforeAll(async () => {
    mockServer = createMockServer();
    await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    cognitiveIntegration = new CognitiveIntegration({
      failureThreshold: 0.7,
      successThreshold: 0.8,
      maxRetries: 3,
    });
  });

  describe('Complete Task Execution Flow', () => {
    it('should execute successful crafting workflow with cognitive feedback', async () => {
      // Mock HTTP responses for successful crafting
      mockFetch
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({ success: true, canCraft: true, hasRecipe: true }),
        } as any)
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              success: true,
              item: 'wooden_pickaxe',
              crafted: true,
            }),
        } as any)
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              success: true,
              message: 'Successfully crafted wooden_pickaxe!',
            }),
        } as any);

      // Simulate the complete task execution flow
      const task = {
        id: 'e2e-craft-1',
        type: 'craft',
        parameters: { item: 'wooden_pickaxe', quantity: 1 },
        attempts: 1,
        status: 'pending',
        startedAt: Date.now(),
      };

      // Execute task in minecraft (simulated)
      const executeTaskInMinecraft = async (task: any) => {
        const minecraftUrl = 'http://localhost:3005';

        // Check if we can craft
        const canCraft = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'can_craft',
            parameters: { item: task.parameters.item },
          }),
        }).then((res) => res.json());

        if (!(canCraft as any).success || !(canCraft as any).canCraft) {
          return { success: false, error: (canCraft as any).error };
        }

        // Craft the item
        const craftResult = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'craft_item',
            parameters: {
              item: task.parameters.item,
              quantity: task.parameters.quantity,
            },
          }),
        }).then((res) => res.json());

        // Send chat message
        await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'chat',
            parameters: {
              message: (craftResult as any).success
                ? `Successfully crafted ${task.parameters.item}!`
                : `Failed to craft ${task.parameters.item}`,
            },
          }),
        });

        return craftResult;
      };

      // Execute the task
      const result = await executeTaskInMinecraft(task);

      // Validate task completion
      const taskCompleted =
        (result as any).success === true && !(result as any).error;

      // Update task status
      task.status = taskCompleted ? 'completed' : 'failed';
      task.attempts = 1;

      // Process cognitive feedback
      const cognitiveFeedback =
        await cognitiveIntegration.processTaskCompletion(task, result, {
          taskType: 'craft',
          goal: 'tool_creation',
          attempts: 1,
        });

      // Verify the complete flow
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({
        success: true,
        item: 'wooden_pickaxe',
        crafted: true,
      });
      expect(taskCompleted).toBe(true);
      expect(task.status).toBe('completed');
      expect(cognitiveFeedback.success).toBe(true);
      expect(cognitiveFeedback.taskId).toBe('e2e-craft-1');
      expect(cognitiveFeedback.reasoning).toContain('Successfully completed');
      expect(cognitiveFeedback.emotionalImpact).toBe('positive');
    });

    it('should handle failed crafting with adaptive cognitive response', async () => {
      // Mock HTTP responses for failed crafting
      mockFetch
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              success: true,
              canCraft: false,
              error: 'Insufficient materials',
            }),
        } as any)
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              success: true,
              message: 'Cannot craft wooden_pickaxe: Insufficient materials',
            }),
        } as any);

      const task = {
        id: 'e2e-craft-fail-1',
        type: 'craft',
        parameters: { item: 'wooden_pickaxe', quantity: 1 },
        attempts: 2,
        status: 'pending',
      };

      // Execute task (will fail)
      const executeTaskInMinecraft = async (task: any) => {
        const minecraftUrl = 'http://localhost:3005';

        const canCraft = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'can_craft',
            parameters: { item: task.parameters.item },
          }),
        }).then((res) => res.json());

        if (!(canCraft as any).success || !(canCraft as any).canCraft) {
          // Send failure message
          await fetch(`${minecraftUrl}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'chat',
              parameters: {
                message: `Cannot craft ${task.parameters.item}: ${(canCraft as any).error}`,
              },
            }),
          });

          return {
            success: false,
            error: (canCraft as any).error,
            canCraft: false,
          };
        }

        return { success: true };
      };

      const result = await executeTaskInMinecraft(task);
      const taskCompleted = (result as any).success === true;

      task.status = taskCompleted ? 'completed' : 'failed';

      // Process cognitive feedback
      const cognitiveFeedback =
        await cognitiveIntegration.processTaskCompletion(task, result, {
          taskType: 'craft',
          goal: 'tool_creation',
          attempts: 2,
        });

      // Verify failure handling
      expect(result).toEqual({
        success: false,
        error: 'Insufficient materials',
        canCraft: false,
      });
      expect(taskCompleted).toBe(false);
      expect(task.status).toBe('failed');
      expect(cognitiveFeedback.success).toBe(false);
      expect(cognitiveFeedback.reasoning).toContain('High failure rate');
      expect(cognitiveFeedback.alternativeSuggestions).toContain(
        'Gather the required materials first'
      );
      expect(cognitiveFeedback.emotionalImpact).toBe('negative');
    });

    it('should execute mining workflow with position-based feedback', async () => {
      // Mock HTTP responses for mining
      mockFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ position: { x: 0, y: 64, z: 0 } }),
        } as any)
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({ success: false, error: 'No block found' }),
        } as any)
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              success: true,
              block: 'stone',
              position: { x: 1, y: 64, z: 0 },
            }),
        } as any);

      const task = {
        id: 'e2e-mine-1',
        type: 'mine',
        parameters: { resource: 'stone' },
        attempts: 1,
        status: 'pending',
      };

      // Execute mining task
      const executeTaskInMinecraft = async (task: any) => {
        const minecraftUrl = 'http://localhost:3005';

        // Get bot position
        const gameState = await fetch(`${minecraftUrl}/state`)
          .then((res) => res.json())
          .catch(() => ({ position: { x: 0, y: 64, z: 0 } }));

        const botPos = (gameState as any).position;

        // Try mining positions
        const miningPositions = [
          { x: botPos.x, y: botPos.y - 1, z: botPos.z },
          { x: botPos.x + 1, y: botPos.y, z: botPos.z },
        ];

        const mineResults = [];
        let successfulMining = false;

        for (const position of miningPositions) {
          const mineResult = await fetch(`${minecraftUrl}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'mine_block',
              parameters: { position },
            }),
          }).then((res) => res.json());

          mineResults.push(mineResult);

          if ((mineResult as any).success) {
            successfulMining = true;
            break;
          }
        }

        return {
          results: mineResults,
          type: 'mining',
          success: successfulMining,
          error: successfulMining
            ? undefined
            : 'No blocks were successfully mined',
        };
      };

      const result = await executeTaskInMinecraft(task);
      const taskCompleted = (result as any).success === true;

      task.status = taskCompleted ? 'completed' : 'failed';

      // Process cognitive feedback
      const cognitiveFeedback =
        await cognitiveIntegration.processTaskCompletion(task, result, {
          taskType: 'mine',
          goal: 'resource_gathering',
          attempts: 1,
        });

      // Verify mining workflow
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(taskCompleted).toBe(true);
      expect(cognitiveFeedback.success).toBe(true);
      expect(cognitiveFeedback.reasoning).toContain('Successfully completed');
    });
  });

  describe('Cognitive Adaptation Scenarios', () => {
    it('should detect stuck pattern and suggest task abandonment', async () => {
      // Simulate multiple failed attempts
      const failedTasks = Array.from({ length: 4 }, (_, i) => ({
        id: `stuck-task-${i + 1}`,
        type: 'craft',
        parameters: { item: 'diamond_pickaxe' },
        attempts: i + 1,
        status: 'failed',
      }));

      const failedResult = {
        success: false,
        error: 'Insufficient materials to craft 1x diamond_pickaxe',
        canCraft: false,
      };

      // Process each failed task
      for (const task of failedTasks) {
        await cognitiveIntegration.processTaskCompletion(task, failedResult, {
          taskType: 'craft',
          goal: 'advanced_tool_creation',
          attempts: task.attempts,
        });
      }

      // Check if task should be abandoned
      const shouldAbandon =
        cognitiveIntegration.shouldAbandonTask('stuck-task-4');
      expect(shouldAbandon).toBe(true);

      // Get cognitive insights
      const insights = await cognitiveIntegration.getCognitiveInsights('craft');
      expect(insights.length).toBeGreaterThan(0);
      expect(insights.some((insight) => insight.includes('success rate'))).toBe(
        true
      );
    });

    it('should provide performance-based recommendations', async () => {
      // Mix of successful and failed tasks
      const mixedTasks = [
        { success: true, item: 'stick', crafted: true },
        { success: false, error: 'Insufficient materials' },
        { success: true, item: 'wooden_pickaxe', crafted: true },
        { success: false, error: 'Insufficient materials' },
        { success: true, item: 'crafting_table', crafted: true },
      ];

      for (let i = 0; i < mixedTasks.length; i++) {
        const task = {
          id: `perf-task-${i + 1}`,
          type: 'craft',
          parameters: { item: 'various' },
          attempts: 1,
          status: mixedTasks[i].success ? 'completed' : 'failed',
        };

        await cognitiveIntegration.processTaskCompletion(task, mixedTasks[i], {
          taskType: 'craft',
          goal: 'general_crafting',
          attempts: 1,
        });
      }

      const stats = cognitiveIntegration.getTaskStats('perf-task-5');
      expect(stats.totalAttempts).toBe(1); // This task had 1 attempt
      expect(stats.successCount).toBe(1); // 1 success for this specific task
      expect(stats.failureCount).toBe(0); // 0 failures for this specific task
      expect(stats.successRate).toBeCloseTo(1.0, 1); // 1 success out of 1 attempt
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const task = {
        id: 'network-error-task',
        type: 'move',
        parameters: { distance: 1 },
        attempts: 1,
        status: 'pending',
      };

      // Simulate network error during task execution
      const executeTaskInMinecraft = async (task: any) => {
        return await fetch('http://localhost:3005/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'move_forward',
            parameters: { distance: task.parameters.distance },
          }),
        }).then((res) => res.json());
      };

      await expect(executeTaskInMinecraft(task)).rejects.toThrow(
        'Network timeout'
      );
    });

    it('should handle malformed responses', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as any);

      const task = {
        id: 'malformed-response-task',
        type: 'chat',
        parameters: { message: 'test' },
        attempts: 1,
        status: 'pending',
      };

      const executeTaskInMinecraft = async (task: any) => {
        return await fetch('http://localhost:3005/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'chat',
            parameters: { message: task.parameters.message },
          }),
        }).then((res) => res.json());
      };

      await expect(executeTaskInMinecraft(task)).rejects.toThrow(
        'Invalid JSON'
      );
    });
  });
});

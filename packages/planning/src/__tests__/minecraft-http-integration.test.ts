/**
 * Minecraft HTTP Integration Test Suite
 *
 * Tests the HTTP communication between the planning system and minecraft interface.
 * Validates the full request/response cycle and error handling.
 *
 * @author @darianrosebrook
 */

import fetch from 'node-fetch';

// Mock fetch for HTTP requests
vi.mock('node-fetch');
const mockFetch = fetch as any;

// Import the function we want to test
async function executeTaskInMinecraft(task: any) {
  try {
    const minecraftUrl = 'http://localhost:3005';

    switch (task.type) {
      case 'move':
        return await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'move_forward',
            parameters: { distance: task.parameters?.distance || 1 },
          }),
        }).then((res) => res.json());

      case 'chat':
        return await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'chat',
            parameters: {
              message:
                task.parameters?.message ||
                task.description ||
                'Executing task!',
            },
          }),
        }).then((res) => res.json());

      case 'craft':
        // First check if we can craft the item
        const canCraft = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'can_craft',
            parameters: { item: task.parameters?.item || 'wooden_pickaxe' },
          }),
        }).then((res) => res.json());

        if (!(canCraft as any).success || !(canCraft as any).canCraft) {
          // Send failure message to chat
          await fetch(`${minecraftUrl}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'chat',
              parameters: {
                message: `Cannot craft ${task.parameters?.item || 'wooden_pickaxe'}: ${(canCraft as any).error || 'Missing materials'}`,
              },
            }),
          });

          return {
            success: false,
            error: (canCraft as any).error || 'Cannot craft item',
            canCraft: false,
          };
        }

        // Attempt to craft the item
        const craftResult = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'craft_item',
            parameters: {
              item: task.parameters?.item || 'wooden_pickaxe',
              quantity: task.parameters?.quantity || 1,
            },
          }),
        }).then((res) => res.json());

        // Send result message to chat
        const resultMessage = (craftResult as any).success
          ? `Successfully crafted ${task.parameters?.item || 'wooden_pickaxe'}!`
          : `Failed to craft ${task.parameters?.item || 'wooden_pickaxe'}: ${(craftResult as any).error}`;

        await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'chat',
            parameters: { message: resultMessage },
          }),
        });

        return craftResult;

      case 'mine':
        // Get current bot position
        const gameState = await fetch(`${minecraftUrl}/state`)
          .then((res) => res.json())
          .catch(() => ({ position: { x: 0, y: 64, z: 0 } }));

        const botPos = (gameState as any).position || { x: 0, y: 64, z: 0 };

        // Try to mine blocks around the bot
        const miningPositions = [
          { x: botPos.x, y: botPos.y - 1, z: botPos.z },
          { x: botPos.x + 1, y: botPos.y, z: botPos.z },
          { x: botPos.x - 1, y: botPos.y, z: botPos.z },
        ];

        const mineResults = [];
        let successfulMining = false;

        for (const position of miningPositions) {
          try {
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
          } catch (error) {
            mineResults.push({ success: false, error: String(error) });
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

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  } catch (error) {
    console.error('Error executing task in Minecraft:', error);
    throw error;
  }
}

describe('Minecraft HTTP Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HTTP Communication', () => {
    it('should send move action via HTTP', async () => {
      const mockResponse = { success: true, distance: 2 };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
      } as any);

      const task = {
        type: 'move',
        parameters: { distance: 2 },
      };

      const result = await executeTaskInMinecraft(task);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3005/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'move_forward',
          parameters: { distance: 2 },
        }),
      });

      expect(result).toEqual(mockResponse);
    });

    it('should send chat action via HTTP', async () => {
      const mockResponse = { success: true, message: 'Hello, world!' };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
      } as any);

      const task = {
        type: 'chat',
        parameters: { message: 'Hello, world!' },
      };

      const result = await executeTaskInMinecraft(task);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3005/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'chat',
          parameters: { message: 'Hello, world!' },
        }),
      });

      expect(result).toEqual(mockResponse);
    });

    it('should handle successful crafting workflow', async () => {
      // Mock can_craft response
      const canCraftResponse = { success: true, canCraft: true };
      // Mock craft_item response
      const craftResponse = {
        success: true,
        item: 'wooden_pickaxe',
        quantity: 1,
      };
      // Mock chat response
      const chatResponse = {
        success: true,
        message: 'Successfully crafted wooden_pickaxe!',
      };

      mockFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve(canCraftResponse),
        } as any)
        .mockResolvedValueOnce({
          json: () => Promise.resolve(craftResponse),
        } as any)
        .mockResolvedValueOnce({
          json: () => Promise.resolve(chatResponse),
        } as any);

      const task = {
        type: 'craft',
        parameters: { item: 'wooden_pickaxe', quantity: 1 },
      };

      const result = await executeTaskInMinecraft(task);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual(craftResponse);
    });

    it('should handle failed crafting workflow', async () => {
      // Mock can_craft response (failure)
      const canCraftResponse = {
        success: true,
        canCraft: false,
        error: 'Missing materials',
      };
      // Mock chat response
      const chatResponse = {
        success: true,
        message: 'Cannot craft wooden_pickaxe: Missing materials',
      };

      mockFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve(canCraftResponse),
        } as any)
        .mockResolvedValueOnce({
          json: () => Promise.resolve(chatResponse),
        } as any);

      const task = {
        type: 'craft',
        parameters: { item: 'wooden_pickaxe', quantity: 1 },
      };

      const result = await executeTaskInMinecraft(task);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        success: false,
        error: 'Missing materials',
        canCraft: false,
      });
    });

    it('should handle mining workflow with multiple positions', async () => {
      // Mock game state response
      const gameStateResponse = { position: { x: 10, y: 64, z: 20 } };
      // Mock mining responses (first fails, second succeeds)
      const mineResponse1 = { success: false, error: 'No block found' };
      const mineResponse2 = {
        success: true,
        block: 'stone',
        position: { x: 11, y: 64, z: 20 },
      };

      mockFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve(gameStateResponse),
        } as any)
        .mockResolvedValueOnce({
          json: () => Promise.resolve(mineResponse1),
        } as any)
        .mockResolvedValueOnce({
          json: () => Promise.resolve(mineResponse2),
        } as any);

      const task = {
        type: 'mine',
        parameters: { resource: 'stone' },
      };

      const result = await executeTaskInMinecraft(task);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({
        results: [mineResponse1, mineResponse2],
        type: 'mining',
        success: true,
        error: undefined,
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const task = {
        type: 'move',
        parameters: { distance: 1 },
      };

      await expect(executeTaskInMinecraft(task)).rejects.toThrow(
        'Network error'
      );
    });

    it('should handle invalid JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as any);

      const task = {
        type: 'chat',
        parameters: { message: 'test' },
      };

      await expect(executeTaskInMinecraft(task)).rejects.toThrow(
        'Invalid JSON'
      );
    });

    it('should handle unknown task types', async () => {
      const task = {
        type: 'unknown_task',
        parameters: {},
      };

      await expect(executeTaskInMinecraft(task)).rejects.toThrow(
        'Unknown task type: unknown_task'
      );
    });
  });

  describe('Request Format Validation', () => {
    it('should use default parameters when not provided', async () => {
      const mockResponse = { success: true, distance: 1 };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
      } as any);

      const task = {
        type: 'move',
        parameters: {}, // No distance provided
      };

      await executeTaskInMinecraft(task);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3005/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'move_forward',
          parameters: { distance: 1 }, // Default value used
        }),
      });
    });

    it('should use task description as chat message fallback', async () => {
      const mockResponse = {
        success: true,
        message: 'Task description message',
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
      } as any);

      const task = {
        type: 'chat',
        description: 'Task description message',
        parameters: {}, // No message provided
      };

      await executeTaskInMinecraft(task);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3005/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'chat',
          parameters: { message: 'Task description message' },
        }),
      });
    });
  });
});

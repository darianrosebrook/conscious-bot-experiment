/**
 * Minecraft Integration Test Suite
 *
 * Tests the integration between cognitive/task modules and the actual Minecraft bot connection.
 * Validates the full flow from planning system through HTTP API to mineflayer actions.
 *
 * @author @darianrosebrook
 */

import {
  SimpleMinecraftInterface,
  SimpleBotConfig,
} from '../standalone-simple';
import { EventEmitter } from 'events';

// Mock mineflayer to avoid requiring actual Minecraft server
vi.mock('mineflayer', () => ({
  createBot: vi.fn(() => ({
    entity: {
      position: {
        x: 0,
        y: 64,
        z: 0,
        clone: () => ({ offset: () => ({ x: 0, y: 64, z: 5 }) }),
      },
      yaw: 0,
      pitch: 0,
    },
    health: 20,
    food: 20,
    inventory: {
      items: () => [
        { name: 'oak_log', count: 5 },
        { name: 'cobblestone', count: 10 },
      ],
    },
    time: { timeOfDay: 1000 },
    isRaining: false,
    once: vi.fn((event, callback) => {
      if (event === 'spawn') {
        setTimeout(callback, 100); // Simulate spawn delay
      }
    }),
    on: vi.fn(),
    quit: vi.fn(),
    setControlState: vi.fn(),
    look: vi.fn().mockResolvedValue(undefined),
    chat: vi.fn(),
    recipesFor: vi.fn(() => [{ id: 'wooden_pickaxe_recipe' }]),
    canCraft: vi.fn(() => true),
    craft: vi.fn().mockResolvedValue(undefined),
    blockAt: vi.fn(() => ({
      name: 'stone',
      position: { x: 0, y: 63, z: 0 },
    })),
    dig: vi.fn().mockResolvedValue(undefined),
    mcData: {
      itemsByName: {
        wooden_pickaxe: { id: 270 },
        oak_log: { id: 17 },
        stone: { id: 1 },
      },
    },
    vec3: class MockVec3 {
      constructor(
        public x: number,
        public y: number,
        public z: number
      ) {}
    },
  })),
}));

describe('Minecraft Integration Tests', () => {
  let minecraftInterface: SimpleMinecraftInterface;
  const mockConfig: SimpleBotConfig = {
    host: 'localhost',
    port: 25565,
    username: 'TestBot',
    version: '1.20.1',
    auth: 'offline',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    minecraftInterface = new SimpleMinecraftInterface(mockConfig);
  });

  afterEach(async () => {
    if (minecraftInterface.connected) {
      await minecraftInterface.disconnect();
    }
  });

  describe('Connection Management', () => {
    it('should connect to minecraft server successfully', async () => {
      const connectPromise = minecraftInterface.connect();

      // Simulate the connection events
      setTimeout(() => {
        minecraftInterface.emit('connected');
      }, 50);

      await connectPromise;
      expect(minecraftInterface.connected).toBe(true);
    });

    it('should handle connection errors gracefully', async () => {
      const mockBot = require('mineflayer').createBot();
      mockBot.once.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Connection failed')), 50);
        }
      });

      await expect(minecraftInterface.connect()).rejects.toThrow(
        'Connection failed'
      );
    });

    it('should disconnect properly', async () => {
      await minecraftInterface.connect();
      await minecraftInterface.disconnect();
      expect(minecraftInterface.connected).toBe(false);
    });
  });

  describe('Game State Retrieval', () => {
    beforeEach(async () => {
      await minecraftInterface.connect();
    });

    it('should get current game state', async () => {
      const gameState = await minecraftInterface.getGameState();

      expect(gameState).toEqual({
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        food: 20,
        inventory: [
          { name: 'oak_log', count: 5 },
          { name: 'cobblestone', count: 10 },
        ],
        time: 1000,
        weather: 'clear',
      });
    });

    it('should throw error when not connected', async () => {
      await minecraftInterface.disconnect();
      await expect(minecraftInterface.getGameState()).rejects.toThrow(
        'Not connected to server'
      );
    });
  });

  describe('Action Execution', () => {
    beforeEach(async () => {
      await minecraftInterface.connect();
    });

    describe('Movement Actions', () => {
      it('should execute move_forward action', async () => {
        const result = await minecraftInterface.executeAction({
          type: 'move_forward',
          parameters: { distance: 2 },
        });

        expect(result).toEqual({ success: true, distance: 2 });

        const mockBot = minecraftInterface.botInstance;
        expect(mockBot?.setControlState).toHaveBeenCalledWith('forward', true);
        expect(mockBot?.setControlState).toHaveBeenCalledWith('forward', false);
      });

      it('should execute turn_left action', async () => {
        const result = await minecraftInterface.executeAction({
          type: 'turn_left',
          parameters: { angle: 45 },
        });

        expect(result).toEqual({ success: true, angle: 45 });

        const mockBot = minecraftInterface.botInstance;
        expect(mockBot?.look).toHaveBeenCalled();
      });

      it('should execute jump action', async () => {
        const result = await minecraftInterface.executeAction({
          type: 'jump',
          parameters: {},
        });

        expect(result).toEqual({ success: true });

        const mockBot = minecraftInterface.botInstance;
        expect(mockBot?.setControlState).toHaveBeenCalledWith('jump', true);
        expect(mockBot?.setControlState).toHaveBeenCalledWith('jump', false);
      });
    });

    describe('Communication Actions', () => {
      it('should execute chat action', async () => {
        const result = await minecraftInterface.executeAction({
          type: 'chat',
          parameters: { message: 'Hello, world!' },
        });

        expect(result).toEqual({ success: true, message: 'Hello, world!' });

        const mockBot = minecraftInterface.botInstance;
        expect(mockBot?.chat).toHaveBeenCalledWith('Hello, world!');
      });

      it('should store chat messages in history', async () => {
        await minecraftInterface.executeAction({
          type: 'chat',
          parameters: { message: 'Test message' },
        });

        const chatHistory = minecraftInterface.getChatHistory();
        expect(chatHistory).toHaveLength(1);
        expect(chatHistory[0].message).toBe('Test message');
        expect(chatHistory[0].sender).toBe('TestBot');
      });
    });

    describe('Crafting Actions', () => {
      it('should check if item can be crafted', async () => {
        const result = await minecraftInterface.executeAction({
          type: 'can_craft',
          parameters: { item: 'wooden_pickaxe' },
        });

        expect(result).toEqual({
          success: true,
          canCraft: true,
          item: 'wooden_pickaxe',
          hasRecipe: true,
          requiresMaterials: false,
        });
      });

      it('should handle unknown items in can_craft', async () => {
        const result = await minecraftInterface.executeAction({
          type: 'can_craft',
          parameters: { item: 'unknown_item' },
        });

        expect(result).toEqual({
          success: true,
          canCraft: false,
          error: 'Item unknown_item not found',
        });
      });

      it('should craft items successfully', async () => {
        const result = await minecraftInterface.executeAction({
          type: 'craft_item',
          parameters: { item: 'wooden_pickaxe', quantity: 1 },
        });

        expect(result).toEqual({
          success: true,
          item: 'wooden_pickaxe',
          quantity: 1,
          crafted: true,
        });

        const mockBot = minecraftInterface.botInstance;
        expect(mockBot?.craft).toHaveBeenCalled();
      });

      it('should handle insufficient materials for crafting', async () => {
        const mockBot = minecraftInterface.botInstance;
        (mockBot as any).canCraft = vi.fn(() => false);

        const result = await minecraftInterface.executeAction({
          type: 'craft_item',
          parameters: { item: 'wooden_pickaxe', quantity: 1 },
        });

        expect(result).toEqual({
          success: false,
          error: 'Insufficient materials to craft 1x wooden_pickaxe',
        });
      });
    });

    describe('Mining Actions', () => {
      it('should mine blocks successfully', async () => {
        const result = await minecraftInterface.executeAction({
          type: 'mine_block',
          parameters: { position: { x: 0, y: 63, z: 0 } },
        });

        expect(result).toEqual({
          success: true,
          block: 'stone',
          position: { x: 0, y: 63, z: 0 },
        });

        const mockBot = minecraftInterface.botInstance;
        expect(mockBot?.dig).toHaveBeenCalled();
      });

      it('should handle mining non-existent blocks', async () => {
        const mockBot = minecraftInterface.botInstance;
        (mockBot as any).blockAt = vi.fn(() => null);

        const result = await minecraftInterface.executeAction({
          type: 'mine_block',
          parameters: { position: { x: 100, y: 100, z: 100 } },
        });

        expect(result).toEqual({
          success: false,
          error: 'No block found at position 100, 100, 100',
        });
      });
    });

    describe('Error Handling', () => {
      it('should handle unknown action types', async () => {
        await expect(
          minecraftInterface.executeAction({
            type: 'unknown_action',
            parameters: {},
          })
        ).rejects.toThrow('Unknown action type: unknown_action');
      });

      it('should handle actions when not connected', async () => {
        await minecraftInterface.disconnect();

        await expect(
          minecraftInterface.executeAction({
            type: 'move_forward',
            parameters: { distance: 1 },
          })
        ).rejects.toThrow('Not connected to server');
      });
    });
  });
});

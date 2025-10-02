/**
 * Standalone Minecraft Interface Test
 *
 * Tests basic Minecraft interface components without requiring
 * full planning system integration.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BotAdapter } from '../bot-adapter';
import { ObservationMapper } from '../observation-mapper';
import { ActionTranslator } from '../action-translator';
import { BotConfig } from '../types';

// Mock mineflayer for testing
vi.mock('mineflayer', () => ({
  createBot: vi.fn(() => ({
    entity: {
      position: { x: 0, y: 64, z: 0, clone: () => ({ x: 0, y: 64, z: 0 }) },
      yaw: 0,
      pitch: 0,
    },
    health: 20,
    food: 20,
    foodSaturation: 5,
    experience: { points: 0 },
    game: {
      gameMode: 'survival',
      dimension: 'overworld',
      difficulty: 'normal',
    },
    time: { timeOfDay: 6000 },
    isRaining: false,
    inventory: {
      slots: new Array(36).fill(null),
      items: () => [],
    },
    entities: {},
    players: {},
    version: '1.20.1',
    username: 'TestBot',
    loadPlugin: vi.fn(),
    blockAt: vi.fn(() => null),
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    quit: vi.fn(),
    end: vi.fn(),
    lookAt: vi.fn(),
    dig: vi.fn(),
    craft: vi.fn(),
    equip: vi.fn(),
    recipesFor: vi.fn(() => []),
    canCraft: vi.fn(() => true),
    mcData: {
      itemsByName: {},
    },
    pathfinder: {
      setMovements: vi.fn(),
      setGoal: vi.fn(),
    },
    setControlState: vi.fn(),
    heldItem: null,
  })),
}));

describe('Minecraft Interface - Standalone Tests', () => {
  let botAdapter: BotAdapter;
  let observationMapper: ObservationMapper;
  let actionTranslator: ActionTranslator;
  let config: BotConfig;

  beforeEach(() => {
    config = {
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline',
      pathfindingTimeout: 30000,
      actionTimeout: 10000,
      observationRadius: 16,
      autoReconnect: true,
      maxReconnectAttempts: 5,
      emergencyDisconnect: true,
    };

    botAdapter = new BotAdapter(config);
    observationMapper = new ObservationMapper(config);

    // Mock bot for ActionTranslator
    const mockBot = {
      entity: {
        position: { x: 0, y: 64, z: 0, clone: () => ({ x: 0, y: 64, z: 0 }) },
      },
      loadPlugin: vi.fn(),
    } as any;

    // Skip ActionTranslator for now to focus on BotAdapter tests
    // actionTranslator = new ActionTranslator(mockBot, config);
  });

  describe('BotAdapter', () => {
    it('should create bot adapter with valid config', () => {
      expect(botAdapter).toBeDefined();
      expect(botAdapter.config).toEqual(config);
    });

    it('should validate bot configuration', () => {
      const validConfig = { ...config };
      expect(() => new BotAdapter(validConfig)).not.toThrow();
    });

    it('should handle invalid configuration gracefully', () => {
      const invalidConfig = { ...config, host: '' };
      expect(() => new BotAdapter(invalidConfig)).not.toThrow();
    });

    it('should filter environmental observations by radius', () => {
      // Test that events within radius are processed and events outside are ignored
      const closePosition = { x: 5, y: 64, z: 5 }; // 5 blocks away
      const farPosition = { x: 50, y: 64, z: 50 }; // 50 blocks away (beyond default radius of 16)

      // Mock the bot entity position by setting it directly on the bot adapter
      // We need to access the private bot property
      (botAdapter as any).bot = {
        entity: {
          position: { x: 0, y: 64, z: 0 },
        },
        vec3: (x: number, y: number, z: number) => ({ x, y, z }),
      } as any;

      // Test close position (should be within radius)
      expect(botAdapter.isWithinObservationRadius(closePosition)).toBe(true);

      // Test far position (should be outside radius)
      expect(botAdapter.isWithinObservationRadius(farPosition)).toBe(false);
    });

    it('should use configurable observation radius', () => {
      const customConfig = { ...config, observationRadius: 32 };
      const customBotAdapter = new BotAdapter(customConfig);

      const closePosition = { x: 20, y: 64, z: 20 }; // 28.28 blocks away (diagonal, within 32)
      const farPosition = { x: 50, y: 64, z: 50 }; // 70.71 blocks away (diagonal, beyond 32)

      // Mock the bot entity position by setting it directly on the bot adapter
      (customBotAdapter as any).bot = {
        entity: {
          position: { x: 0, y: 64, z: 0 },
        },
        vec3: (x: number, y: number, z: number) => ({ x, y, z }),
      } as any;

      // Test positions relative to custom radius (32 blocks)
      expect(customBotAdapter.isWithinObservationRadius(closePosition)).toBe(
        true
      );
      expect(customBotAdapter.isWithinObservationRadius(farPosition)).toBe(
        false
      );
    });
  });

  describe('ObservationMapper', () => {
    it('should create observation mapper', () => {
      expect(observationMapper).toBeDefined();
      expect(observationMapper.config).toEqual(config);
    });

    it('should map basic game state to cognitive context', () => {
      const mockGameState = {
        position: { x: 10, y: 64, z: 10 },
        health: 20,
        food: 18,
        inventory: [],
        nearbyEntities: [],
        nearbyBlocks: [],
        time: 6000,
        weather: 'clear',
      };

      const context = observationMapper.mapGameStateToContext(mockGameState);

      expect(context).toBeDefined();
      expect(context.selfState).toBeDefined();
      expect(context.selfState.position).toEqual(mockGameState.position);
      expect(context.selfState.health).toBe(mockGameState.health);
    });

    it('should handle empty game state', () => {
      const emptyState = {
        position: { x: 0, y: 64, z: 0 },
        health: 0,
        food: 0,
        inventory: [],
        nearbyEntities: [],
        nearbyBlocks: [],
        time: 0,
        weather: 'clear',
      };

      const context = observationMapper.mapGameStateToContext(emptyState);
      expect(context).toBeDefined();
      expect(context.selfState.health).toBe(0);
    });
  });

  describe('ActionTranslator', () => {
    it('should create action translator', () => {
      expect(actionTranslator).toBeDefined();
      expect(actionTranslator.config).toEqual(config);
    });

    it('should translate basic movement actions', () => {
      const movementAction = {
        type: 'move_forward',
        parameters: { distance: 5 },
        priority: 1,
      };

      const commands =
        actionTranslator.translateActionToCommands(movementAction);
      expect(commands).toBeDefined();
      expect(Array.isArray(commands)).toBe(true);
    });

    it('should translate mining actions', () => {
      const miningAction = {
        type: 'mine_block',
        parameters: {
          position: { x: 10, y: 64, z: 10 },
          tool: 'pickaxe',
        },
        priority: 1,
      };

      const commands = actionTranslator.translateActionToCommands(miningAction);
      expect(commands).toBeDefined();
      expect(Array.isArray(commands)).toBe(true);
    });

    it('should handle unknown action types gracefully', () => {
      const unknownAction = {
        type: 'unknown_action',
        parameters: {},
        priority: 1,
      };

      const commands =
        actionTranslator.translateActionToCommands(unknownAction);
      expect(commands).toBeDefined();
      expect(Array.isArray(commands)).toBe(true);
    });
  });

  describe('Integration', () => {
    it('should work together without planning system', () => {
      // Test that all components can be instantiated together
      expect(botAdapter).toBeDefined();
      expect(observationMapper).toBeDefined();
      expect(actionTranslator).toBeDefined();

      // Test basic data flow
      const gameState = {
        position: { x: 5, y: 64, z: 5 },
        health: 20,
        food: 20,
        inventory: [],
        nearbyEntities: [],
        nearbyBlocks: [],
        time: 6000,
        weather: 'clear',
      };

      const context = observationMapper.mapGameStateToContext(gameState);
      expect(context).toBeDefined();

      const action = {
        type: 'move_forward',
        parameters: { distance: 3 },
        priority: 1,
      };

      const commands = actionTranslator.translateActionToCommands(action);
      expect(commands).toBeDefined();
    });
  });
});

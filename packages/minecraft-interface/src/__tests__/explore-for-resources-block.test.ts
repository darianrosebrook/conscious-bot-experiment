/**
 * Explore-for-resources block handling tests.
 *
 * Verifies that when executeExplore receives resource_tags for blocks (e.g. stone),
 * the block-finding logic is invoked: perception filters for block observations,
 * and when blocks are found, the bot paths and digs instead of picking up items.
 *
 * Mocks use fixtures matching real API shapes:
 * - World perception API (packages/world POST /api/perception/visual-field)
 * - executeExplore params from planning (resource_tags, goal_item, reason)
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PERCEPTION_RESPONSE_BLOCKS_FOUND,
  PERCEPTION_RESPONSE_MIXED_BLOCKS,
  PERCEPTION_RESPONSE_ITEM_FOUND,
  PERCEPTION_RESPONSE_EMPTY,
  ITEM_OBS_STICK_STRING_ID,
  EXPLORE_PARAMS_STONE_PICKAXE,
  BLOCK_OBS_COBBLESTONE,
  BLOCK_OBS_IRON_ORE,
} from './fixtures/explore-for-resources-fixtures';
import { Vec3 } from 'vec3';

vi.mock('mineflayer-pathfinder', () => ({
  pathfinder: vi.fn(),
  Movements: vi.fn().mockImplementation(() => ({
    scafoldingBlocks: [],
    canDig: false,
  })),
}));

vi.mock('../navigation-bridge', () => ({
  NavigationBridge: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@conscious-bot/core', () => ({
  resilientFetch: vi.fn(),
}));

vi.mock('@conscious-bot/world', () => {
  class MockRaycastEngine {
    hasLineOfSight = () => true;
  }
  return {
    RaycastEngine: MockRaycastEngine,
    validateSensingConfig: vi.fn((c: any) => c),
    SensingConfig: {},
    Orientation: {},
  };
});

import { resilientFetch } from '@conscious-bot/core';
import { ActionTranslator } from '../action-translator';

function createMockBot(overrides: Record<string, unknown> = {}) {
  const position = new Vec3(0, 64, 0);
  return {
    entity: {
      position,
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      on: vi.fn(),
      once: vi.fn(),
    },
    inventory: { items: () => [], slots: () => [] },
    blockAt: vi.fn().mockReturnValue(null),
    findBlock: vi.fn().mockResolvedValue(null),
    pathfinder: {
      goto: vi.fn().mockResolvedValue({}),
      stop: vi.fn(),
      setMovements: vi.fn(),
    },
    chat: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    loadPlugin: vi.fn(),
    registry: { blocksByName: {}, itemsByName: {} },
    mcData: {
      blocksByName: {
        stone: { id: 1 },
        cobblestone: { id: 4 },
        iron_ore: { id: 15 },
        oak_log: { id: 17 },
        acacia_log: { id: 162 },
      },
      itemsByName: {},
    },
    version: '1.20.4',
    world: { getBlock: vi.fn() },
    entities: {},
    ...overrides,
  } as any;
}

function setupMockLeafFactory(digBlockResult: { status: string; result?: unknown } = { status: 'success', result: {} }) {
  const digBlockLeaf = {
    spec: { name: 'dig_block', placeholder: false },
    run: vi.fn().mockResolvedValue(digBlockResult),
  };
  (global as any).minecraftLeafFactory = {
    get: (name: string) => (name === 'dig_block' ? digBlockLeaf : null),
    isRoutable: (name: string) => name === 'dig_block',
  };
  return digBlockLeaf;
}

function clearLeafFactory() {
  delete (global as any).minecraftLeafFactory;
}

describe('explore-for-resources block handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLeafFactory();
  });

  describe('perception path: block target', () => {
    it('when perception returns block observations and target is stone, paths and digs (success)', async () => {
      const mockFetch = resilientFetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => PERCEPTION_RESPONSE_BLOCKS_FOUND,
      });

      const mockBot = createMockBot();
      const digLeaf = setupMockLeafFactory({ status: 'success', result: { mined: true } });
      const translator = new ActionTranslator(mockBot, {
        actionTimeout: 5000,
        pathfindingTimeout: 5000,
      });

      const result = await translator.executeAction({
        type: 'explore_for_resources',
        parameters: EXPLORE_PARAMS_STONE_PICKAXE,
        timeout: 10000,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.blockType).toBe('stone');
      expect(result.data?.mined).toBe(true);

      expect(mockBot.pathfinder.goto).toHaveBeenCalled();
      expect(digLeaf.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          pos: { x: 5, y: 64, z: 5 },
        })
      );
    });

    it('when perception returns no blocks, falls through to item search (no block path)', async () => {
      const mockFetch = resilientFetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => PERCEPTION_RESPONSE_EMPTY,
      });

      const mockBot = createMockBot();
      setupMockLeafFactory();
      const translator = new ActionTranslator(mockBot, {
        actionTimeout: 5000,
        pathfindingTimeout: 5000,
      });

      const result = await translator.executeAction({
        type: 'explore_for_resources',
        parameters: EXPLORE_PARAMS_STONE_PICKAXE,
        timeout: 2000,
      });

      expect(mockBot.pathfinder.goto).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    });

    it('filters block observations by blockNameMatches (stone matches stone, not dirt)', async () => {
      const mockFetch = resilientFetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => PERCEPTION_RESPONSE_MIXED_BLOCKS,
      });

      const mockBot = createMockBot();
      const digLeaf = setupMockLeafFactory({ status: 'success', result: { mined: true } });
      const translator = new ActionTranslator(mockBot, {
        actionTimeout: 5000,
        pathfindingTimeout: 5000,
      });

      const result = await translator.executeAction({
        type: 'explore_for_resources',
        parameters: { resource_tags: ['stone'], radius: 64 },
        timeout: 10000,
      });

      expect(result.success).toBe(true);
      expect(digLeaf.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ pos: { x: 5, y: 64, z: 5 } })
      );
    });
  });

  describe('fallback spiral path: block target', () => {
    it('when perception API fails, fallback spiral scans for blocks via blockAt', async () => {
      const mockFetch = resilientFetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({ ok: false });

      const mockBot = createMockBot();
      let callCount = 0;
      mockBot.blockAt.mockImplementation((pos: Vec3) => {
        callCount++;
        if (pos.x === 2 && pos.y === 64 && pos.z === 0) {
          return { name: 'stone', position: pos };
        }
        return null;
      });

      const digLeaf = setupMockLeafFactory({ status: 'success', result: { mined: true } });
      const translator = new ActionTranslator(mockBot, {
        actionTimeout: 5000,
        pathfindingTimeout: 5000,
      });

      const result = await translator.executeAction({
        type: 'explore_for_resources',
        parameters: { resource_tags: ['stone'], radius: 16 },
        timeout: 5000,
      });

      expect(callCount).toBeGreaterThan(0);
      if (result.success) {
        expect(digLeaf.run).toHaveBeenCalled();
        expect(mockBot.pathfinder.goto).toHaveBeenCalled();
      }
    });

    it('multi-tag exploration: finds oak_log when resource_tags are acacia_log then oak_log', async () => {
      const mockFetch = resilientFetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({ ok: false });

      const mockBot = createMockBot();
      mockBot.blockAt.mockImplementation((pos: Vec3) => {
        if (pos.x === 2 && pos.y === 64 && pos.z === 0) {
          return { name: 'oak_log', position: pos };
        }
        if (pos.y === 63 || pos.y === 64) {
          return { name: 'grass_block', position: pos };
        }
        return null;
      });

      const digLeaf = setupMockLeafFactory({ status: 'success', result: { mined: true } });
      const translator = new ActionTranslator(mockBot, {
        actionTimeout: 5000,
        pathfindingTimeout: 5000,
      });

      const result = await translator.executeAction({
        type: 'explore_for_resources',
        parameters: {
          resource_tags: ['acacia_log', 'oak_log'],
          radius: 16,
          goal_item: 'wooden_pickaxe',
        },
        timeout: 15000,
      });

      expect(result.success).toBe(true);
      expect(result.data?.blockType).toBe('oak_log');
      expect(result.data?.mined).toBe(true);
      expect(digLeaf.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          pos: { x: 2, y: 64, z: 0 },
        })
      );
    });
  });

  describe('item target (unchanged behavior)', () => {
    it('when target is not a block (e.g. stick), does not use block branch', async () => {
      const mockFetch = resilientFetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...PERCEPTION_RESPONSE_ITEM_FOUND,
          observations: [ITEM_OBS_STICK_STRING_ID],
        }),
      });

      const mockBot = createMockBot();
      mockBot.mcData.itemsByName = { stick: { id: 280 } };
      setupMockLeafFactory();
      const translator = new ActionTranslator(mockBot, {
        actionTimeout: 5000,
        pathfindingTimeout: 5000,
      });

      const result = await translator.executeAction({
        type: 'explore_for_resources',
        parameters: { resource_tags: ['stick'], radius: 64 },
        timeout: 2000,
      });

      expect(mockBot.pathfinder.goto).toHaveBeenCalled();
      expect(result.error).not.toContain('Unknown action type');
    });
  });

  describe('switched-up block targets (regression guards)', () => {
    it('cobblestone target: perception returns cobblestone, paths and digs', async () => {
      const mockFetch = resilientFetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          observations: [BLOCK_OBS_COBBLESTONE],
          observerPosition: { x: 0, y: 64, z: 0 },
          radius: 64,
        }),
      });

      const mockBot = createMockBot();
      const digLeaf = setupMockLeafFactory({ status: 'success', result: { mined: true } });
      const translator = new ActionTranslator(mockBot, {
        actionTimeout: 5000,
        pathfindingTimeout: 5000,
      });

      const result = await translator.executeAction({
        type: 'explore_for_resources',
        parameters: { resource_tags: ['cobblestone'], radius: 64 },
        timeout: 10000,
      });

      expect(result.success).toBe(true);
      expect(result.data?.blockType).toBe('cobblestone');
      expect(digLeaf.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ pos: { x: 3, y: 63, z: 4 } })
      );
    });

    it('iron_ore target: perception returns iron_ore, paths and digs', async () => {
      const mockFetch = resilientFetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          observations: [BLOCK_OBS_IRON_ORE],
          observerPosition: { x: 0, y: 64, z: 0 },
          radius: 64,
        }),
      });

      const mockBot = createMockBot();
      const digLeaf = setupMockLeafFactory({ status: 'success', result: { mined: true } });
      const translator = new ActionTranslator(mockBot, {
        actionTimeout: 5000,
        pathfindingTimeout: 5000,
      });

      const result = await translator.executeAction({
        type: 'explore_for_resources',
        parameters: { resource_tags: ['iron_ore'], radius: 64 },
        timeout: 10000,
      });

      expect(result.success).toBe(true);
      expect(result.data?.blockType).toBe('iron_ore');
      expect(digLeaf.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ pos: { x: 10, y: 32, z: 8 } })
      );
    });

    it('empty resource_tags: falls through to item search (no block target)', async () => {
      const mockFetch = resilientFetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => PERCEPTION_RESPONSE_EMPTY,
      });

      const mockBot = createMockBot();
      setupMockLeafFactory();
      const translator = new ActionTranslator(mockBot, {
        actionTimeout: 5000,
        pathfindingTimeout: 5000,
      });

      const result = await translator.executeAction({
        type: 'explore_for_resources',
        parameters: { radius: 64 },
        timeout: 2000,
      });

      expect(result.success).toBe(false);
      expect(result.error).not.toContain('Unknown action type');
    });

    it('minecraft:stone prefix: normalizes and matches block', async () => {
      const mockFetch = resilientFetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          observations: [{ type: 'block', name: 'stone', pos: { x: 2, y: 64, z: 2 }, distance: 3 }],
          observerPosition: { x: 0, y: 64, z: 0 },
          radius: 64,
        }),
      });

      const mockBot = createMockBot();
      const digLeaf = setupMockLeafFactory({ status: 'success', result: { mined: true } });
      const translator = new ActionTranslator(mockBot, {
        actionTimeout: 5000,
        pathfindingTimeout: 5000,
      });

      const result = await translator.executeAction({
        type: 'explore_for_resources',
        parameters: { resource_tags: ['minecraft:stone'], radius: 64 },
        timeout: 10000,
      });

      expect(result.success).toBe(true);
      // blockType is the actual block name from the world (stone), not the input prefix
      expect(result.data?.blockType).toBe('stone');
    });
  });

  describe('planning-to-execution integration', () => {
    it('full chain: needsBlocks task -> explore step -> execute with perception -> success', async () => {
      const { SterlingPlanner } = await import('../../../planning/src/task-integration/sterling-planner');
      const { MinecraftToolProgressionSolver } = await import('../../../planning/src/sterling/minecraft-tool-progression-solver');

      const mockSterling = {
        isAvailable: vi.fn().mockReturnValue(true),
        solve: vi.fn(),
        getConnectionNonce: vi.fn().mockReturnValue(1),
        registerDomainDeclaration: vi.fn().mockResolvedValue({ success: true }),
        initialize: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        getHealthStatus: vi.fn().mockReturnValue({ enabled: true }),
        verifyReachability: vi.fn(),
        queryKnowledgeGraph: vi.fn(),
        withFallback: vi.fn(),
      };

      const mockGet = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            inventory: [{ name: 'wooden_pickaxe', count: 1 }],
            position: { x: 0, y: 64, z: 0 },
            worldState: {
              environment: { nearbyBlocks: [], nearbyBlockCounts: {} },
            },
          },
        }),
      });

      const planner = new SterlingPlanner({ minecraftGet: mockGet });
      planner.registerSolver(new MinecraftToolProgressionSolver(mockSterling as any));

      const task = {
        id: 'test-tp-1',
        title: 'Get stone_pickaxe',
        parameters: {
          requirementCandidate: {
            kind: 'tool_progression',
            targetTool: 'stone_pickaxe',
            toolType: 'pickaxe',
            targetTier: 'stone',
            quantity: 1,
          },
        },
        metadata: {
          currentState: {
            inventory: [{ name: 'wooden_pickaxe', count: 1 }],
            nearbyBlocks: [],
            nearbyEntities: [],
          },
        },
      };

      const planResult = await planner.generateDynamicSteps(task as any);
      expect(planResult.steps).toHaveLength(1);
      const step = planResult.steps[0];
      expect(step.meta?.leaf).toBe('explore_for_resources');
      const args = step.meta?.args as Record<string, unknown>;

      (resilientFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => PERCEPTION_RESPONSE_BLOCKS_FOUND,
      });

      const mockBot = createMockBot();
      const digLeaf = setupMockLeafFactory({ status: 'success', result: { mined: true } });
      const translator = new ActionTranslator(mockBot, {
        actionTimeout: 5000,
        pathfindingTimeout: 5000,
      });

      const action = {
        type: 'explore_for_resources',
        parameters: { ...args, radius: 64 },
        timeout: 10000,
      };

      const execResult = await translator.executeAction(action as any);

      expect(execResult.success).toBe(true);
      expect(execResult.data?.blockType).toBe('stone');
      expect(execResult.data?.mined).toBe(true);
      expect(digLeaf.run).toHaveBeenCalled();
    });
  });
});

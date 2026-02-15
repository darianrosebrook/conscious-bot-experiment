/**
 * Leaf kickoff switched-up regression tests.
 *
 * Verifies that leaves invoked from the planning pipeline kick off correctly
 * when parameters are varied (different items, block types, recipes, etc.).
 * Catches regressions when "switching it up" breaks dispatch or normalization.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { ActionTranslator } from '../action-translator';
import type { MinecraftActionType } from '../types';

function createMockBot() {
  return {
    entity: {
      position: { x: 0, y: 64, z: 0 },
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
    version: '1.20.4',
    world: { getBlock: vi.fn() },
  } as any;
}

function createMockLeaf(name: string) {
  return {
    spec: { name, placeholder: false },
    run: vi.fn().mockResolvedValue({ status: 'success', result: {} }),
  };
}

function setupMockLeafFactory(
  overrides: Record<string, ReturnType<typeof createMockLeaf>> = {}
) {
  const defaultLeaves = [
    'craft_recipe', 'smelt', 'place_workstation', 'introspect_recipe',
    'dig_block', 'acquire_material', 'place_block', 'place_torch_if_needed',
    'place_torch', 'retreat_and_block', 'consume_food', 'sleep', 'collect_items',
    'sense_hostiles', 'chat', 'wait', 'get_light_level', 'get_block_at',
    'find_resource', 'move_to', 'step_forward_safely', 'follow_entity',
    'sterling_navigate', 'attack_entity', 'equip_weapon', 'retreat_from_threat',
    'use_item', 'equip_tool', 'open_container', 'transfer_items',
    'close_container', 'manage_inventory', 'till_soil', 'plant_crop',
    'harvest_crop', 'manage_farm', 'interact_with_block', 'operate_piston',
    'control_redstone', 'control_environment',
    'prepare_site', 'build_module', 'place_feature', 'explore_for_resources',
    'gather_resources',
  ];
  const leaves = new Map<string, ReturnType<typeof createMockLeaf>>();
  for (const name of defaultLeaves) {
    leaves.set(name, overrides[name] ?? createMockLeaf(name));
  }
  for (const [name, leaf] of Object.entries(overrides)) {
    leaves.set(name, leaf);
  }
  const factory = {
    get: (n: string) => leaves.get(n) ?? null,
    isRoutable: (n: string) => !leaves.get(n)?.spec.placeholder,
  };
  (global as any).minecraftLeafFactory = factory;
  return factory;
}

function clearLeafFactory() {
  delete (global as any).minecraftLeafFactory;
}

function expectNotUnknownType(result: { success: boolean; error?: string }) {
  if (result.error) {
    expect(result.error).not.toContain('Unknown action type');
  }
}

describe('leaf kickoff switched-up regression', () => {
  let translator: ActionTranslator;

  beforeEach(() => {
    translator = new ActionTranslator(createMockBot(), {
      actionTimeout: 5000,
      pathfindingTimeout: 5000,
    });
    clearLeafFactory();
  });

  describe('acquire_material', () => {
    it.each([
      { item: 'oak_log', count: 1 },
      { item: 'stone', count: 8 },
      { item: 'iron_ore', count: 4 },
      { item: 'cobblestone', count: 64 },
      { blockType: 'oak_log' },
    ])('kicks off with %j', async (params) => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('acquire_material')!;

      const result = await translator.executeAction({
        type: 'acquire_material',
        parameters: params,
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });
  });

  describe('place_block', () => {
    it.each([
      { block_type: 'cobblestone' },
      { block_type: 'stone' },
      { block_type: 'stone_bricks' },
      { block_type: 'oak_planks' },
    ])('kicks off with %j', async (params) => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('place_block')!;

      const result = await translator.executeAction({
        type: 'place_block',
        parameters: params,
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });
  });

  describe('craft_recipe / craft / craft_item', () => {
    it.each([
      { type: 'craft' as const, params: { item: 'stick', quantity: 4 } },
      { type: 'craft' as const, params: { item: 'wooden_pickaxe', quantity: 1 } },
      { type: 'craft' as const, params: { item: 'stone_pickaxe', quantity: 1 } },
      { type: 'craft_item' as const, params: { item: 'crafting_table' } },
      { type: 'craft_recipe' as const, params: { recipe: 'oak_planks', qty: 4 } },
    ])('$type kicks off', async ({ type, params }) => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('craft_recipe')!;

      const result = await translator.executeAction({
        type,
        parameters: params,
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });
  });

  describe('smelt / smelt_item', () => {
    it.each([
      { item: 'iron_ore', quantity: 1 },
      { item: 'raw_iron', quantity: 1 },
      { item: 'raw_gold', quantity: 1 },
      { item: 'cobblestone', quantity: 8 },
      { item: 'iron_ore', quantity: 4, fuel: 'charcoal' },
    ])('kicks off with %j', async (params) => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('smelt')!;

      const result = await translator.executeAction({
        type: 'smelt',
        parameters: params,
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });

    it('smelt_item alias kicks off', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('smelt')!;

      const result = await translator.executeAction({
        type: 'smelt_item',
        parameters: { item: 'raw_copper', quantity: 1 },
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });
  });

  describe('consume_food', () => {
    it.each([
      {},
      { food_type: 'cooked_beef' },
      { food_type: 'bread' },
      { food_type: 'any', amount: 2 },
    ])('kicks off with %j', async (params) => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('consume_food')!;

      const result = await translator.executeAction({
        type: 'consume_food',
        parameters: params,
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });
  });

  describe('collect_items_enhanced', () => {
    it.each([
      { item: 'oak_log', radius: 10 },
      { item: 'stick', radius: 16 },
      { item: 'cobblestone', radius: 32 },
    ])('kicks off with %j', async (params) => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('collect_items')!;

      const result = await translator.executeAction({
        type: 'collect_items_enhanced',
        parameters: params,
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });
  });

  describe('find_resource', () => {
    it.each([
      { blockType: 'oak_log' },
      { blockType: 'stone' },
      { blockType: 'iron_ore', radius: 64 },
    ])('kicks off with %j', async (params) => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('find_resource')!;

      const result = await translator.executeAction({
        type: 'find_resource',
        parameters: params,
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });
  });

  describe('place_workstation', () => {
    it.each([
      { workstation: 'crafting_table' },
      { workstation: 'furnace' },
    ])('kicks off with %j', async (params) => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('place_workstation')!;

      const result = await translator.executeAction({
        type: 'place_workstation',
        parameters: params,
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });
  });

  describe('equip_tool', () => {
    it('kicks off with default params', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('equip_tool')!;

      const result = await translator.executeAction({
        type: 'equip_tool',
        parameters: {},
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });
  });

  describe('building leaves (prepare_site, build_module, place_feature)', () => {
    it.each(['prepare_site', 'build_module', 'place_feature'] as const)(
      '%s kicks off with blockType stone',
      async (type) => {
        const factory = setupMockLeafFactory();
        const leaf = factory.get(type)!;

        const result = await translator.executeAction({
          type,
          parameters: { blockType: 'stone' },
          timeout: 5000,
        });

        expect(leaf.run).toHaveBeenCalled();
        expectNotUnknownType(result);
      }
    );

    it.each(['prepare_site', 'build_module', 'place_feature'] as const)(
      '%s kicks off with blockType cobblestone',
      async (type) => {
        const factory = setupMockLeafFactory();
        const leaf = factory.get(type)!;

        const result = await translator.executeAction({
          type,
          parameters: { blockType: 'cobblestone' },
          timeout: 5000,
        });

        expect(leaf.run).toHaveBeenCalled();
        expectNotUnknownType(result);
      }
    );
  });

  describe('use_item', () => {
    it.each([
      { item: 'bread' },
      { item: 'cooked_beef', quantity: 1 },
    ])('kicks off with %j', async (params) => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('use_item')!;

      const result = await translator.executeAction({
        type: 'use_item',
        parameters: params,
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });
  });

  describe('get_block_at', () => {
    it('kicks off with position', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('get_block_at')!;

      const result = await translator.executeAction({
        type: 'get_block_at',
        parameters: { position: { x: 0, y: 64, z: 0 } },
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });
  });

  describe('interact_with_block', () => {
    it('kicks off with position', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('interact_with_block')!;

      const result = await translator.executeAction({
        type: 'interact_with_block',
        parameters: { position: { x: 10, y: 64, z: 10 } },
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });
  });
});

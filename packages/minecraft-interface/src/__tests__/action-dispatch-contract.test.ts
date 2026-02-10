/**
 * Action dispatch contract tests (Phase 0).
 *
 * Verifies that action types emitted by the planner reach their
 * corresponding leaf implementations without "Unknown action type" errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock mineflayer-pathfinder so Movements constructor doesn't need a real registry
vi.mock('mineflayer-pathfinder', () => ({
  pathfinder: vi.fn(),
  Movements: vi.fn().mockImplementation(() => ({
    scafoldingBlocks: [],
    canDig: false,
  })),
}));

// Mock NavigationBridge to avoid complex initialization
vi.mock('../navigation-bridge', () => ({
  NavigationBridge: vi.fn().mockImplementation(() => ({})),
}));

import { ActionTranslator } from '../action-translator';
import { ACTION_CONTRACTS } from '../action-contract-registry';
import type { MinecraftActionType } from '../types';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

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
    inventory: {
      items: () => [],
      slots: () => [],
    },
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

function createMockLeaf(name: string, placeholder = false) {
  return {
    spec: { name, placeholder },
    run: vi.fn().mockResolvedValue({
      status: 'success',
      result: { recipe: 'test', crafted: 1 },
    }),
  };
}

function setupMockLeafFactory(
  overrides: Record<string, ReturnType<typeof createMockLeaf>> = {}
) {
  const leaves = new Map<string, ReturnType<typeof createMockLeaf>>();

  // Register standard leaves — must include every leaf registered by registerCoreLeaves()
  const defaultLeaves = [
    // crafting
    'craft_recipe',
    'smelt',
    'place_workstation',
    'introspect_recipe',
    // interaction
    'dig_block',
    'acquire_material',
    'place_block',
    'place_torch_if_needed',
    'place_torch',
    'retreat_and_block',
    'consume_food',
    'sleep',
    'collect_items',
    // sensing
    'sense_hostiles',
    'chat',
    'wait',
    'get_light_level',
    'get_block_at',
    'find_resource',
    // movement
    'move_to',
    'step_forward_safely',
    'follow_entity',
    'sterling_navigate',
    // combat
    'attack_entity',
    'equip_weapon',
    'retreat_from_threat',
    'use_item',
    'equip_tool',
    // container
    'open_container',
    'transfer_items',
    'close_container',
    'manage_inventory',
    // farming
    'till_soil',
    'plant_crop',
    'harvest_crop',
    'manage_farm',
    // world interaction
    'interact_with_block',
    'operate_piston',
    'control_redstone',
    'build_structure',
    'control_environment',
    // construction (stubs)
    'prepare_site',
    'build_module',
    'place_feature',
  ];

  for (const name of defaultLeaves) {
    leaves.set(name, overrides[name] || createMockLeaf(name));
  }

  // Apply any additional overrides
  for (const [name, leaf] of Object.entries(overrides)) {
    leaves.set(name, leaf);
  }

  const factory = {
    get: (name: string) => leaves.get(name) ?? null,
    isRoutable: (name: string) => {
      const leaf = leaves.get(name);
      if (!leaf) return false;
      return leaf.spec.placeholder !== true;
    },
  };

  (global as any).minecraftLeafFactory = factory;
  return factory;
}

function clearLeafFactory() {
  delete (global as any).minecraftLeafFactory;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * Assert that the result does not contain an "Unknown action type" error.
 * If error is undefined (success), the assertion passes.
 */
function expectNotUnknownType(result: { success: boolean; error?: string }) {
  if (result.error) {
    expect(result.error).not.toContain('Unknown action type');
  }
  // If no error, action type was recognized — pass
}

describe('action dispatch contract', () => {
  let translator: ActionTranslator;
  let mockBot: ReturnType<typeof createMockBot>;

  beforeEach(() => {
    mockBot = createMockBot();
    translator = new ActionTranslator(mockBot, {
      actionTimeout: 5000,
      pathfindingTimeout: 5000,
    });
    clearLeafFactory();
  });

  describe('Commit 0a: craft alias', () => {
    it('type "craft" reaches executeCraftItem (no "Unknown action type")', async () => {
      setupMockLeafFactory();

      const result = await translator.executeAction({
        type: 'craft',
        parameters: { item: 'stick', quantity: 4 },
        timeout: 1000,
      });

      expectNotUnknownType(result);
    });

    it('type "craft_item" still works (backward compat)', async () => {
      setupMockLeafFactory();

      const result = await translator.executeAction({
        type: 'craft_item',
        parameters: { item: 'stick', quantity: 1 },
        timeout: 1000,
      });

      expectNotUnknownType(result);
    });

    it('craft delegates to craft_recipe leaf via LeafFactory', async () => {
      const factory = setupMockLeafFactory();
      const craftLeaf = factory.get('craft_recipe')!;

      await translator.executeAction({
        type: 'craft',
        parameters: { item: 'stick', quantity: 2 },
        timeout: 1000,
      });

      expect(craftLeaf.run).toHaveBeenCalled();
    });
  });

  describe('Commit 0a: smelt handler', () => {
    it('type "smelt" reaches SmeltLeaf (no "Unknown action type")', async () => {
      setupMockLeafFactory();

      const result = await translator.executeAction({
        type: 'smelt',
        parameters: { item: 'iron_ore', quantity: 1 },
        timeout: 1000,
      });

      expectNotUnknownType(result);
    });

    it('type "smelt_item" also works', async () => {
      setupMockLeafFactory();

      const result = await translator.executeAction({
        type: 'smelt_item',
        parameters: { item: 'iron_ore', quantity: 1 },
        timeout: 1000,
      });

      expectNotUnknownType(result);
    });

    it('smelt calls the smelt leaf run method', async () => {
      const factory = setupMockLeafFactory();
      const smeltLeaf = factory.get('smelt')!;

      await translator.executeAction({
        type: 'smelt',
        parameters: { item: 'iron_ore', quantity: 1 },
        timeout: 1000,
      });

      expect(smeltLeaf.run).toHaveBeenCalled();
    });

    it('smelt with no LeafFactory returns structured error', async () => {
      clearLeafFactory();

      const result = await translator.executeAction({
        type: 'smelt',
        parameters: { item: 'iron_ore' },
        timeout: 1000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Leaf factory not available');
      expectNotUnknownType(result);
    });
  });

  describe('Commit 0a: building leaves', () => {
    it.each(['prepare_site', 'build_module', 'place_feature'] as const)(
      'type "%s" delegates to LeafFactory (no "Unknown action type")',
      async (type) => {
        setupMockLeafFactory();

        const result = await translator.executeAction({
          type,
          parameters: { blockType: 'stone' },
          timeout: 1000,
        });

        expectNotUnknownType(result);
      }
    );

    it.each(['prepare_site', 'build_module', 'place_feature'] as const)(
      'type "%s" calls the leaf run method',
      async (type) => {
        const factory = setupMockLeafFactory();
        const leaf = factory.get(type)!;

        await translator.executeAction({
          type,
          parameters: { blockType: 'stone' },
          timeout: 1000,
        });

        expect(leaf.run).toHaveBeenCalled();
      }
    );
  });

  describe('Commit 0a: placeholder leaf rejection', () => {
    it('placeholder smelt leaf returns structured error', async () => {
      setupMockLeafFactory({
        smelt: createMockLeaf('smelt', true),
      });

      const result = await translator.executeAction({
        type: 'smelt',
        parameters: { item: 'iron_ore' },
        timeout: 1000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('placeholder');
      expectNotUnknownType(result);
    });

    it('placeholder building leaf returns structured error', async () => {
      setupMockLeafFactory({
        prepare_site: createMockLeaf('prepare_site', true),
      });

      const result = await translator.executeAction({
        type: 'prepare_site',
        parameters: {},
        timeout: 1000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('placeholder');
      expectNotUnknownType(result);
    });

    it('missing leaf returns structured error', async () => {
      // Set up factory but without prepare_site
      (global as any).minecraftLeafFactory = {
        get: (name: string) => null,
      };

      const result = await translator.executeAction({
        type: 'prepare_site',
        parameters: {},
        timeout: 1000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No leaf registered');
      expectNotUnknownType(result);
    });
  });

  describe('Commit 0a: unknown type still fails', () => {
    it('truly unknown type returns "Unknown action type"', async () => {
      setupMockLeafFactory();

      const result = await translator.executeAction({
        type: 'nonexistent_thing' as any,
        parameters: {},
        timeout: 1000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action type');
    });
  });

  // -------------------------------------------------------------------
  // Commit 0b: LeafFactory-first dispatch
  // -------------------------------------------------------------------

  describe('Commit 0b: LeafFactory-first dispatch', () => {
    it('registered non-placeholder leaf takes priority over hardcoded switch', async () => {
      // Register a custom leaf for 'wait' (which also has a hardcoded handler).
      // If LeafFactory-first works, our custom leaf should be called.
      const customWaitLeaf = createMockLeaf('wait');
      setupMockLeafFactory({ wait: customWaitLeaf });

      const result = await translator.executeAction({
        type: 'wait',
        parameters: { duration: 100 },
        timeout: 1000,
      });

      expect(customWaitLeaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });

    it('placeholder leaf falls through to hardcoded handler', async () => {
      // Register a placeholder leaf for 'wait'
      const placeholderWait = createMockLeaf('wait', true);
      setupMockLeafFactory({ wait: placeholderWait });

      const result = await translator.executeAction({
        type: 'wait',
        parameters: { duration: 100 },
        timeout: 1000,
      });

      // Placeholder should NOT be called; hardcoded handler takes over
      expect(placeholderWait.run).not.toHaveBeenCalled();
      // Should still succeed via hardcoded handler
      expectNotUnknownType(result);
    });

    it('unregistered type falls through to hardcoded handler', async () => {
      // scan_environment has a hardcoded handler but no leaf
      setupMockLeafFactory();
      // Make sure scan_environment is NOT in the factory
      (global as any).minecraftLeafFactory = {
        get: (name: string) => {
          if (name === 'scan_environment') return null;
          return (global as any)._originalFactory?.get(name) ?? null;
        },
      };

      const result = await translator.executeAction({
        type: 'scan_environment',
        parameters: { radius: 10, action: 'find_nearest_block' },
        timeout: 1000,
      });

      // Should reach hardcoded handler, not "Unknown action type"
      expectNotUnknownType(result);
    });

    it('ACTION_TYPE_TO_LEAF: "craft" resolves to craft_recipe leaf', async () => {
      const factory = setupMockLeafFactory();
      const craftLeaf = factory.get('craft_recipe')!;

      await translator.executeAction({
        type: 'craft',
        parameters: { item: 'stick', quantity: 1 },
        timeout: 1000,
      });

      expect(craftLeaf.run).toHaveBeenCalled();
    });

    it('ACTION_TYPE_TO_LEAF: "craft_item" resolves to craft_recipe leaf', async () => {
      const factory = setupMockLeafFactory();
      const craftLeaf = factory.get('craft_recipe')!;

      await translator.executeAction({
        type: 'craft_item',
        parameters: { item: 'stick', quantity: 1 },
        timeout: 1000,
      });

      expect(craftLeaf.run).toHaveBeenCalled();
    });

    it('ACTION_TYPE_TO_LEAF: "smelt" resolves to smelt leaf', async () => {
      const factory = setupMockLeafFactory();
      const smeltLeaf = factory.get('smelt')!;

      await translator.executeAction({
        type: 'smelt',
        parameters: { item: 'iron_ore', quantity: 1 },
        timeout: 1000,
      });

      expect(smeltLeaf.run).toHaveBeenCalled();
    });

    it('no LeafFactory at all falls through to hardcoded handlers', async () => {
      clearLeafFactory();

      // 'wait' should still work via hardcoded handler
      const result = await translator.executeAction({
        type: 'wait',
        parameters: { duration: 100 },
        timeout: 1000,
      });

      expectNotUnknownType(result);
    });
  });

  // -------------------------------------------------------------------
  // Centralized dispatch: routing + semantic guards
  // -------------------------------------------------------------------

  describe('Centralized dispatch: new leaf routing', () => {
    it('acquire_material routes to leaf', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('acquire_material')!;

      const result = await translator.executeAction({
        type: 'acquire_material',
        parameters: { item: 'oak_log', count: 1 },
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });

    it('place_block (single, no pattern) routes to leaf', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('place_block')!;

      const result = await translator.executeAction({
        type: 'place_block',
        parameters: { block_type: 'cobblestone' },
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });

    it('place_block with non-default placement routes to handler (not leaf)', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('place_block')!;

      // With placement: 'pattern_3x3_floor' it should fall through to handler
      const result = await translator.executeAction({
        type: 'place_block',
        parameters: { block_type: 'stone', placement: 'pattern_3x3_floor', count: 9 },
        timeout: 5000,
      });

      // Leaf should NOT be called — handler takes over
      expect(leaf.run).not.toHaveBeenCalled();
      expectNotUnknownType(result);
    });

    it('place_block with count > 1 routes to handler (not leaf)', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('place_block')!;

      const result = await translator.executeAction({
        type: 'place_block',
        parameters: { block_type: 'stone', count: 9 },
        timeout: 5000,
      });

      // Leaf should NOT be called — count > 1 guard redirects
      expect(leaf.run).not.toHaveBeenCalled();
      expectNotUnknownType(result);
    });

    it('consume_food routes to leaf', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('consume_food')!;

      const result = await translator.executeAction({
        type: 'consume_food',
        parameters: { food_type: 'cooked_beef' },
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });

    it('collect_items_enhanced without exploreOnFail routes to leaf', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('collect_items')!;

      const result = await translator.executeAction({
        type: 'collect_items_enhanced',
        parameters: { item: 'oak_log', radius: 10 },
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });

    it('collect_items_enhanced with exploreOnFail=true routes to handler (not leaf)', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('collect_items')!;

      const result = await translator.executeAction({
        type: 'collect_items_enhanced',
        parameters: { item: 'oak_log', radius: 10, exploreOnFail: true },
        timeout: 5000,
      });

      // Leaf should NOT be called — semantic guard redirects to handler
      expect(leaf.run).not.toHaveBeenCalled();
      expectNotUnknownType(result);
    });

    it('response includes requestedActionType and resolvedLeafName', async () => {
      setupMockLeafFactory();

      const result = await translator.executeAction({
        type: 'acquire_material',
        parameters: { item: 'oak_log', count: 1 },
        timeout: 5000,
      });

      expect(result.success).toBe(true);
      expect(result.data?.requestedActionType).toBe('acquire_material');
      expect(result.data?.resolvedLeafName).toBe('acquire_material');
    });

    it('move_to still uses legacy handler (not routed through leaf)', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('move_to')!;

      const result = await translator.executeAction({
        type: 'move_to',
        parameters: { x: 100, y: 64, z: 100 },
        timeout: 5000,
      });

      // move_to is in LEGACY_ONLY — leaf should NOT be called
      expect(leaf.run).not.toHaveBeenCalled();
      expectNotUnknownType(result);
    });

    it('craft still uses dedicated handler (not generic leaf dispatch)', async () => {
      const factory = setupMockLeafFactory();
      const craftLeaf = factory.get('craft_recipe')!;

      const result = await translator.executeAction({
        type: 'craft',
        parameters: { item: 'stick', quantity: 4 },
        timeout: 5000,
      });

      // craft goes through executeCraftItem which calls leaf.run directly
      // (not through dispatchToLeaf)
      expect(craftLeaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });

    it('smelt uses dedicated handler (dispatchMode: handler)', async () => {
      const factory = setupMockLeafFactory();
      const smeltLeaf = factory.get('smelt')!;

      await translator.executeAction({
        type: 'smelt',
        parameters: { item: 'raw_iron', quantity: 1 },
        timeout: 5000,
      });

      // smelt has dispatchMode: 'handler', so it goes through executeSmeltItem
      // which calls the leaf directly with its own param mapping
      expect(smeltLeaf.run).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Cross-type normalization proof tests
  // -------------------------------------------------------------------

  describe('Cross-type normalization proof', () => {
    it('collect_items_enhanced (exploreOnFail=false): leaf receives itemName, not item', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('collect_items')!;

      await translator.executeAction({
        type: 'collect_items_enhanced',
        parameters: { item: 'oak_log', radius: 10, exploreOnFail: false },
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      const leafArgs = leaf.run.mock.calls[0][1];
      // The alias item → itemName must apply using collect_items_enhanced contract
      expect(leafArgs.itemName).toBe('oak_log');
      expect(leafArgs.item).toBeUndefined();
      // exploreOnFail should be stripped
      expect(leafArgs.exploreOnFail).toBeUndefined();
      // radius should pass through
      expect(leafArgs.radius).toBe(10);
    });

    it('collect_items_enhanced: response has different requestedActionType and resolvedLeafName', async () => {
      setupMockLeafFactory();

      const result = await translator.executeAction({
        type: 'collect_items_enhanced',
        parameters: { item: 'oak_log', radius: 10 },
        timeout: 5000,
      });

      expect(result.success).toBe(true);
      expect(result.data?.requestedActionType).toBe('collect_items_enhanced');
      expect(result.data?.resolvedLeafName).toBe('collect_items');
    });

    it('place_block: leaf receives item (aliased from block_type)', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('place_block')!;

      await translator.executeAction({
        type: 'place_block',
        parameters: { block_type: 'cobblestone' },
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      const leafArgs = leaf.run.mock.calls[0][1];
      expect(leafArgs.item).toBe('cobblestone');
      expect(leafArgs.block_type).toBeUndefined();
      // placement and count should be stripped
      expect(leafArgs.placement).toBeUndefined();
      expect(leafArgs.count).toBeUndefined();
    });

    it('acquire_material: leaf receives item (aliased from blockType)', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('acquire_material')!;

      await translator.executeAction({
        type: 'acquire_material',
        parameters: { blockType: 'oak_log' },
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      const leafArgs = leaf.run.mock.calls[0][1];
      expect(leafArgs.item).toBe('oak_log');
      expect(leafArgs.blockType).toBeUndefined();
      // count default should be injected
      expect(leafArgs.count).toBe(1);
    });

    it('acquire_material without item rejects with missing required key', async () => {
      setupMockLeafFactory();

      const result = await translator.executeAction({
        type: 'acquire_material',
        parameters: {},
        timeout: 5000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required params');
      expect(result.error).toContain('item');
    });
  });

  // -------------------------------------------------------------------
  // Handler normalization proof tests
  // -------------------------------------------------------------------

  describe('Handler normalization proof', () => {
    it('smelt handler: leaf receives { input, qty, fuel } not { item, quantity }', async () => {
      const factory = setupMockLeafFactory();
      const smeltLeaf = factory.get('smelt')!;

      await translator.executeAction({
        type: 'smelt',
        parameters: { item: 'raw_iron', quantity: 3 },
        timeout: 5000,
      });

      expect(smeltLeaf.run).toHaveBeenCalled();
      const leafArgs = smeltLeaf.run.mock.calls[0][1];
      // Contract aliases: item → input, quantity → qty
      expect(leafArgs.input).toBe('raw_iron');
      expect(leafArgs.qty).toBe(3);
      // Original keys must NOT survive
      expect(leafArgs.item).toBeUndefined();
      expect(leafArgs.quantity).toBeUndefined();
      // Default fuel applied
      expect(leafArgs.fuel).toBe('coal');
    });

    it('smelt_item handler: leaf receives normalized params identically', async () => {
      const factory = setupMockLeafFactory();
      const smeltLeaf = factory.get('smelt')!;

      await translator.executeAction({
        type: 'smelt_item',
        parameters: { item: 'raw_gold', quantity: 1, fuel: 'charcoal' },
        timeout: 5000,
      });

      expect(smeltLeaf.run).toHaveBeenCalled();
      const leafArgs = smeltLeaf.run.mock.calls[0][1];
      expect(leafArgs.input).toBe('raw_gold');
      expect(leafArgs.qty).toBe(1);
      expect(leafArgs.fuel).toBe('charcoal');
      expect(leafArgs.item).toBeUndefined();
      expect(leafArgs.quantity).toBeUndefined();
    });

    it('smelt handler: response includes requestedActionType and resolvedLeafName', async () => {
      setupMockLeafFactory();

      const result = await translator.executeAction({
        type: 'smelt',
        parameters: { item: 'raw_iron' },
        timeout: 5000,
      });

      expect(result.success).toBe(true);
      expect(result.data?.requestedActionType).toBe('smelt');
      expect(result.data?.resolvedLeafName).toBe('smelt');
    });

    it('craft handler: leaf receives { recipe, qty } not { item, quantity }', async () => {
      const factory = setupMockLeafFactory();
      const craftLeaf = factory.get('craft_recipe')!;

      await translator.executeAction({
        type: 'craft',
        parameters: { item: 'stick', quantity: 4 },
        timeout: 5000,
      });

      expect(craftLeaf.run).toHaveBeenCalled();
      const leafArgs = craftLeaf.run.mock.calls[0][1];
      // Contract aliases: item → recipe, quantity → qty
      expect(leafArgs.recipe).toBe('stick');
      expect(leafArgs.qty).toBe(4);
      // Original keys must NOT survive
      expect(leafArgs.item).toBeUndefined();
      expect(leafArgs.quantity).toBeUndefined();
    });

    it('craft handler: response includes requestedActionType and resolvedLeafName', async () => {
      setupMockLeafFactory();

      const result = await translator.executeAction({
        type: 'craft',
        parameters: { item: 'stick', quantity: 4 },
        timeout: 5000,
      });

      expect(result.success).toBe(true);
      expect(result.data?.requestedActionType).toBe('craft');
      expect(result.data?.resolvedLeafName).toBe('craft_recipe');
    });

    it('craft_item handler: leaf receives normalized params', async () => {
      const factory = setupMockLeafFactory();
      const craftLeaf = factory.get('craft_recipe')!;

      await translator.executeAction({
        type: 'craft_item',
        parameters: { item: 'wooden_pickaxe' },
        timeout: 5000,
      });

      expect(craftLeaf.run).toHaveBeenCalled();
      const leafArgs = craftLeaf.run.mock.calls[0][1];
      expect(leafArgs.recipe).toBe('wooden_pickaxe');
      // qty default from contract
      expect(leafArgs.qty).toBe(1);
      expect(leafArgs.item).toBeUndefined();
    });

    it('smelt handler: abort signal propagated to leaf context', async () => {
      const factory = setupMockLeafFactory();
      const smeltLeaf = factory.get('smelt')!;
      const abortController = new AbortController();

      await translator.executeAction(
        {
          type: 'smelt',
          parameters: { item: 'raw_iron' },
          timeout: 5000,
        },
        abortController.signal,
      );

      expect(smeltLeaf.run).toHaveBeenCalled();
      const context = smeltLeaf.run.mock.calls[0][0];
      expect(context.abortSignal).toBe(abortController.signal);
    });

    it('craft handler: abort signal propagated to leaf context', async () => {
      const factory = setupMockLeafFactory();
      const craftLeaf = factory.get('craft_recipe')!;
      const abortController = new AbortController();

      await translator.executeAction(
        {
          type: 'craft',
          parameters: { item: 'stick', quantity: 4 },
          timeout: 5000,
        },
        abortController.signal,
      );

      expect(craftLeaf.run).toHaveBeenCalled();
      const context = craftLeaf.run.mock.calls[0][0];
      expect(context.abortSignal).toBe(abortController.signal);
    });
  });

  // -------------------------------------------------------------------
  // requiredKeys enforcement across all dispatch paths
  // -------------------------------------------------------------------

  describe('requiredKeys enforcement across all dispatch paths', () => {
    it('Phase 1 guarded: place_block without item rejects', async () => {
      setupMockLeafFactory();

      const result = await translator.executeAction({
        type: 'place_block',
        parameters: {},  // missing required 'item' (and no block_type alias)
        timeout: 5000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required params');
      expect(result.error).toContain('item');
    });

    it('Phase 2 legacy: dispatchToLeafLegacy enforces requiredKeys', async () => {
      // prepare_site normally has no requiredKeys. Temporarily patch it
      // to prove the legacy dispatch path enforces requiredKeys.
      const original = ACTION_CONTRACTS['prepare_site'];
      const saved = { ...original };
      try {
        ACTION_CONTRACTS['prepare_site'] = {
          ...original,
          requiredKeys: ['blueprint'],
        };
        setupMockLeafFactory();

        const result = await translator.executeAction({
          type: 'prepare_site',
          parameters: { blockType: 'stone' },  // missing 'blueprint'
          timeout: 5000,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Missing required params');
        expect(result.error).toContain('blueprint');
      } finally {
        // Restore original contract
        ACTION_CONTRACTS['prepare_site'] = saved;
      }
    });

    it('Phase 2 legacy: passes when required params present', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('prepare_site')!;

      const result = await translator.executeAction({
        type: 'prepare_site',
        parameters: { blockType: 'stone' },
        timeout: 5000,
      });

      // prepare_site has no requiredKeys — should succeed
      expect(leaf.run).toHaveBeenCalled();
      expectNotUnknownType(result);
    });

    it('error string shape is consistent across dispatch paths', async () => {
      // Phase 1 (acquire_material)
      setupMockLeafFactory();
      const phase1 = await translator.executeAction({
        type: 'acquire_material',
        parameters: {},
        timeout: 5000,
      });

      // Phase 1 guarded (place_block)
      const guarded = await translator.executeAction({
        type: 'place_block',
        parameters: {},
        timeout: 5000,
      });

      // All should match the pattern "Missing required params for <type>: <keys>"
      const pattern = /^Missing required params for \w+: \w+/;
      expect(phase1.error).toMatch(pattern);
      expect(guarded.error).toMatch(pattern);
    });
  });

  // -------------------------------------------------------------------
  // AbortSignal propagation across all dispatch paths
  // -------------------------------------------------------------------

  describe('AbortSignal propagation', () => {
    it('Phase 1: signal reaches leaf context', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('acquire_material')!;
      const abortController = new AbortController();

      await translator.executeAction(
        {
          type: 'acquire_material',
          parameters: { item: 'oak_log' },
          timeout: 5000,
        },
        abortController.signal,
      );

      expect(leaf.run).toHaveBeenCalled();
      const context = leaf.run.mock.calls[0][0];
      expect(context.abortSignal).toBe(abortController.signal);
    });

    it('Phase 2 legacy: signal reaches leaf context', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('prepare_site')!;
      const abortController = new AbortController();

      await translator.executeAction(
        {
          type: 'prepare_site',
          parameters: { blockType: 'stone' },
          timeout: 5000,
        },
        abortController.signal,
      );

      expect(leaf.run).toHaveBeenCalled();
      const context = leaf.run.mock.calls[0][0];
      expect(context.abortSignal).toBe(abortController.signal);
    });

    it('no signal provided: context still has an abortSignal (default)', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('acquire_material')!;

      await translator.executeAction({
        type: 'acquire_material',
        parameters: { item: 'oak_log' },
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      const context = leaf.run.mock.calls[0][0];
      // Should have a default AbortSignal (from new AbortController().signal)
      expect(context.abortSignal).toBeDefined();
      expect(context.abortSignal).toBeInstanceOf(AbortSignal);
    });
  });

  // -------------------------------------------------------------------
  // 4th Gate: Handler alignment — every ACTION_CONTRACTS leaf has a
  // registered leaf handler in the leaf factory
  // -------------------------------------------------------------------

  describe('4th Gate: handler alignment', () => {
    it('every ACTION_CONTRACTS leafName has a registered leaf in the factory', () => {
      const factory = setupMockLeafFactory();
      const missingLeaves: string[] = [];

      for (const [actionType, contract] of Object.entries(ACTION_CONTRACTS)) {
        const leaf = factory.get(contract.leafName);
        if (!leaf) {
          missingLeaves.push(`${actionType} → ${contract.leafName}`);
        }
      }

      expect(missingLeaves).toEqual([]);
    });

    it('every ACTION_CONTRACTS leafName resolves to a non-placeholder leaf', () => {
      const factory = setupMockLeafFactory();
      const placeholderLeaves: string[] = [];

      for (const [actionType, contract] of Object.entries(ACTION_CONTRACTS)) {
        const leaf = factory.get(contract.leafName);
        if (leaf && leaf.spec.placeholder) {
          placeholderLeaves.push(`${actionType} → ${contract.leafName} (placeholder)`);
        }
      }

      expect(placeholderLeaves).toEqual([]);
    });

    it('dispatching every ACTION_CONTRACTS type does not produce "Unknown action type"', async () => {
      setupMockLeafFactory();
      const unknownTypes: string[] = [];

      // Minimal valid args per action type for dispatch testing
      const minimalArgs: Record<string, Record<string, unknown>> = {
        acquire_material: { item: 'oak_log' },
        place_block: { block_type: 'cobblestone' },
        consume_food: {},
        collect_items_enhanced: { item: 'oak_log', radius: 10 },
        craft: { item: 'stick' },
        craft_item: { item: 'stick' },
        smelt: { item: 'raw_iron' },
        smelt_item: { item: 'raw_iron' },
        collect_items: {},
        sleep: {},
        find_resource: { blockType: 'oak_log' },
        equip_tool: {},
        introspect_recipe: { output: 'crafting_table' },
        place_workstation: { workstation: 'crafting_table' },
        prepare_site: { blockType: 'stone' },
        build_module: { blockType: 'stone' },
        place_feature: { blockType: 'stone' },
        sense_hostiles: {},
        get_light_level: {},
        get_block_at: { position: { x: 0, y: 64, z: 0 } },
        place_torch: {},
        chat: { message: 'test' },
        wait: { duration: 100 },
        step_forward_safely: { distance: 1 },
        attack_entity: {},
        equip_weapon: {},
        retreat_from_threat: {},
        retreat_and_block: {},
        use_item: { item: 'bread' },
        manage_inventory: { action: 'sort' },
        till_soil: {},
        manage_farm: {},
        harvest_crop: {},
        interact_with_block: { position: { x: 0, y: 64, z: 0 } },
      };

      for (const actionType of Object.keys(ACTION_CONTRACTS)) {
        const result = await translator.executeAction({
          type: actionType as MinecraftActionType,
          parameters: minimalArgs[actionType] ?? {},
          timeout: 1000,
        });

        if (result.error && result.error.includes('Unknown action type')) {
          unknownTypes.push(actionType);
        }
      }

      expect(unknownTypes).toEqual([]);
    });
  });
});

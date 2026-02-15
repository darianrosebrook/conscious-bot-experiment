/**
 * Crafting grid integration tests.
 *
 * Verifies crafting workflow dispatch: place_workstation, craft_recipe,
 * introspect_recipe. Uses mocked bot and leaf factory (no live server).
 * Aligned with leaf-kickoff-switched and sterling-pipeline-e2e patterns.
 *
 * Run: pnpm --filter @conscious-bot/minecraft-interface test:crafting:integration
 * Or: bash scripts/run-e2e.sh
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
    'craft_recipe',
    'smelt',
    'place_workstation',
    'introspect_recipe',
    'acquire_material',
    'place_block',
    'dig_block',
    'find_resource',
    'chat',
    'wait',
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

describe('Crafting grid integration', () => {
  let translator: ActionTranslator;

  beforeEach(() => {
    translator = new ActionTranslator(createMockBot(), {
      actionTimeout: 5000,
      pathfindingTimeout: 5000,
    });
    clearLeafFactory();
  });

  describe('place_workstation', () => {
    it.each([
      { workstation: 'crafting_table' },
      { workstation: 'furnace' },
      { workstation: 'blast_furnace' },
    ])('dispatches with %j', async (params) => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('place_workstation')!;

      const result = await translator.executeAction({
        type: 'place_workstation',
        parameters: params,
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expect(leaf.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workstation: params.workstation })
      );
      expectNotUnknownType(result);
    });
  });

  describe('craft_recipe', () => {
    it.each([
      { recipe: 'oak_planks', qty: 4 },
      { recipe: 'stick', qty: 4 },
      { recipe: 'wooden_pickaxe', qty: 1 },
      { recipe: 'crafting_table', qty: 1 },
      { recipe: 'stone_pickaxe', qty: 1 },
    ])('dispatches with %j', async (params) => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('craft_recipe')!;

      const result = await translator.executeAction({
        type: 'craft_recipe',
        parameters: params,
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expect(leaf.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          recipe: params.recipe,
          qty: params.qty ?? 1,
        })
      );
      expectNotUnknownType(result);
    });

    it('craft alias maps to craft_recipe with recipe and qty', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('craft_recipe')!;

      await translator.executeAction({
        type: 'craft',
        parameters: { item: 'wooden_pickaxe', quantity: 1 },
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      const callArgs = leaf.run.mock.calls[0][1];
      expect(callArgs.recipe ?? callArgs.item).toBe('wooden_pickaxe');
      expect(callArgs.qty ?? callArgs.quantity).toBe(1);
    });
  });

  describe('introspect_recipe', () => {
    it('dispatches with output item', async () => {
      const factory = setupMockLeafFactory();
      const leaf = factory.get('introspect_recipe')!;

      const result = await translator.executeAction({
        type: 'introspect_recipe',
        parameters: { output: 'wooden_pickaxe' },
        timeout: 5000,
      });

      expect(leaf.run).toHaveBeenCalled();
      expect(leaf.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ output: 'wooden_pickaxe' })
      );
      expectNotUnknownType(result);
    });
  });

  describe('crafting workflow sequence', () => {
    it('place_workstation then craft_recipe invokes both leaves in order', async () => {
      const factory = setupMockLeafFactory();
      const placeLeaf = factory.get('place_workstation')!;
      const craftLeaf = factory.get('craft_recipe')!;

      await translator.executeAction({
        type: 'place_workstation',
        parameters: { workstation: 'crafting_table' },
        timeout: 5000,
      });

      await translator.executeAction({
        type: 'craft_recipe',
        parameters: { recipe: 'wooden_pickaxe', qty: 1 },
        timeout: 5000,
      });

      expect(placeLeaf.run).toHaveBeenCalledTimes(1);
      expect(craftLeaf.run).toHaveBeenCalledTimes(1);
      expect(placeLeaf.run).toHaveBeenCalledBefore(craftLeaf.run);
    });

    it('acquire_material then craft_recipe invokes both leaves', async () => {
      const factory = setupMockLeafFactory();
      const acquireLeaf = factory.get('acquire_material')!;
      const craftLeaf = factory.get('craft_recipe')!;

      await translator.executeAction({
        type: 'acquire_material',
        parameters: { item: 'oak_log', count: 4 },
        timeout: 5000,
      });

      await translator.executeAction({
        type: 'craft_recipe',
        parameters: { recipe: 'oak_planks', qty: 16 },
        timeout: 5000,
      });

      expect(acquireLeaf.run).toHaveBeenCalledTimes(1);
      expect(craftLeaf.run).toHaveBeenCalledTimes(1);
    });
  });
});

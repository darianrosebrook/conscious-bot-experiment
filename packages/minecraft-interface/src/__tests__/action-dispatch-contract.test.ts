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

  // Register standard leaves
  const defaultLeaves = [
    'craft_recipe',
    'smelt',
    'dig_block',
    'place_block',
    'move_to',
    'prepare_site',
    'build_module',
    'place_feature',
    'wait',
    'attack_entity',
    'chat',
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
});

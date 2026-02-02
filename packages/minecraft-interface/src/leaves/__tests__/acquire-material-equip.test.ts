/**
 * AcquireMaterialLeaf auto-equip tests
 *
 * Verifies that AcquireMaterialLeaf:
 * - Auto-selects the best tool by material tier when no explicit tool is given
 * - Respects explicit tool arg when provided
 * - Falls back to hand when no matching tool exists
 * - Records toolUsed in result metadata
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Vec3 } from 'vec3';
import { AcquireMaterialLeaf } from '../interaction-leaves';

// Create a mock bot that has a stone block nearby and configurable inventory
function createMockBot(inventoryItems: Array<{ name: string; count: number; slot: number }>) {
  const bot = {
    entity: {
      position: new Vec3(0, 64, 0),
      height: 1.62,
    },
    blockAt: vi.fn().mockImplementation((pos: Vec3) => {
      // Place a stone block at (1, 64, 0) — one block east
      if (pos.x === 1 && pos.y === 64 && pos.z === 0) {
        return { name: 'stone', position: pos, diggable: true };
      }
      return { name: 'air', position: pos };
    }),
    inventory: {
      items: vi.fn().mockReturnValue(inventoryItems),
    },
    equip: vi.fn().mockResolvedValue(undefined),
    dig: vi.fn().mockResolvedValue(undefined),
    lookAt: vi.fn().mockResolvedValue(undefined),
    setControlState: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    pathfinder: null,
    loadPlugin: vi.fn(),
  };
  return bot;
}

function createMockCtx(bot: any) {
  return {
    bot,
    now: () => Date.now(),
    emitMetric: vi.fn(),
    abortSignal: new AbortController().signal,
  };
}

describe('AcquireMaterialLeaf auto-equip', () => {
  let leaf: AcquireMaterialLeaf;

  beforeEach(() => {
    leaf = new AcquireMaterialLeaf();
    vi.clearAllMocks();
  });

  it('auto-selects diamond_pickaxe over stone_pickaxe for stone', async () => {
    const bot = createMockBot([
      { name: 'stone_pickaxe', count: 1, slot: 0 },
      { name: 'diamond_pickaxe', count: 1, slot: 1 },
    ]);
    // After dig, simulate inventory gain so the leaf reports success
    let digCount = 0;
    bot.dig.mockImplementation(async () => {
      digCount++;
    });
    // Simulate inventory delta: after dig, total count increases
    let callCount = 0;
    const originalItems = bot.inventory.items;
    bot.inventory.items = vi.fn().mockImplementation(() => {
      callCount++;
      // After equip + before dig: return original inventory
      // After dig: return inventory with extra cobblestone
      if (digCount > 0 && callCount > 2) {
        return [
          { name: 'stone_pickaxe', count: 1, slot: 0 },
          { name: 'diamond_pickaxe', count: 1, slot: 1 },
          { name: 'cobblestone', count: 1, slot: 2 },
        ];
      }
      return [
        { name: 'stone_pickaxe', count: 1, slot: 0 },
        { name: 'diamond_pickaxe', count: 1, slot: 1 },
      ];
    });

    const ctx = createMockCtx(bot);
    const result = await leaf.run(ctx as any, { item: 'stone', count: 1 });

    // Should have called equip with the diamond pickaxe
    expect(bot.equip).toHaveBeenCalled();
    const equippedItem = bot.equip.mock.calls[0][0];
    expect(equippedItem.name).toBe('diamond_pickaxe');

    // Result should include toolUsed
    expect(result.result).toBeDefined();
    expect((result.result as any).toolUsed).toBe('diamond_pickaxe');
  });

  it('selects iron_pickaxe when it is the only pickaxe', async () => {
    const bot = createMockBot([
      { name: 'iron_pickaxe', count: 1, slot: 0 },
      { name: 'iron_sword', count: 1, slot: 1 },
    ]);
    let digCount = 0;
    bot.dig.mockImplementation(async () => { digCount++; });
    let callCount = 0;
    bot.inventory.items = vi.fn().mockImplementation(() => {
      callCount++;
      if (digCount > 0 && callCount > 2) {
        return [
          { name: 'iron_pickaxe', count: 1, slot: 0 },
          { name: 'iron_sword', count: 1, slot: 1 },
          { name: 'cobblestone', count: 1, slot: 2 },
        ];
      }
      return [
        { name: 'iron_pickaxe', count: 1, slot: 0 },
        { name: 'iron_sword', count: 1, slot: 1 },
      ];
    });

    const ctx = createMockCtx(bot);
    const result = await leaf.run(ctx as any, { item: 'stone', count: 1 });

    expect(bot.equip).toHaveBeenCalled();
    const equippedItem = bot.equip.mock.calls[0][0];
    expect(equippedItem.name).toBe('iron_pickaxe');
    expect((result.result as any).toolUsed).toBe('iron_pickaxe');
  });

  it('falls back to hand when no matching tool exists', async () => {
    const bot = createMockBot([
      { name: 'iron_sword', count: 1, slot: 0 },
      { name: 'bow', count: 1, slot: 1 },
    ]);
    let digCount = 0;
    bot.dig.mockImplementation(async () => { digCount++; });
    let callCount = 0;
    bot.inventory.items = vi.fn().mockImplementation(() => {
      callCount++;
      if (digCount > 0 && callCount > 2) {
        return [
          { name: 'iron_sword', count: 1, slot: 0 },
          { name: 'bow', count: 1, slot: 1 },
          { name: 'cobblestone', count: 1, slot: 2 },
        ];
      }
      return [
        { name: 'iron_sword', count: 1, slot: 0 },
        { name: 'bow', count: 1, slot: 1 },
      ];
    });

    const ctx = createMockCtx(bot);
    const result = await leaf.run(ctx as any, { item: 'stone', count: 1 });

    // equip should NOT have been called (hand — no item to equip)
    expect(bot.equip).not.toHaveBeenCalled();
    expect((result.result as any).toolUsed).toBe('hand');
  });

  it('uses explicit tool arg over auto-selection', async () => {
    const bot = createMockBot([
      { name: 'stone_pickaxe', count: 1, slot: 0 },
      { name: 'diamond_pickaxe', count: 1, slot: 1 },
    ]);
    let digCount = 0;
    bot.dig.mockImplementation(async () => { digCount++; });
    let callCount = 0;
    bot.inventory.items = vi.fn().mockImplementation(() => {
      callCount++;
      if (digCount > 0 && callCount > 2) {
        return [
          { name: 'stone_pickaxe', count: 1, slot: 0 },
          { name: 'diamond_pickaxe', count: 1, slot: 1 },
          { name: 'cobblestone', count: 1, slot: 2 },
        ];
      }
      return [
        { name: 'stone_pickaxe', count: 1, slot: 0 },
        { name: 'diamond_pickaxe', count: 1, slot: 1 },
      ];
    });

    const ctx = createMockCtx(bot);
    // Explicitly request stone_pickaxe even though diamond is available
    const result = await leaf.run(ctx as any, { item: 'stone', count: 1, tool: 'stone_pickaxe' });

    expect(bot.equip).toHaveBeenCalled();
    const equippedItem = bot.equip.mock.calls[0][0];
    expect(equippedItem.name).toBe('stone_pickaxe');
    expect((result.result as any).toolUsed).toBe('stone_pickaxe');
  });

  it('selects axe for log blocks', async () => {
    const bot = createMockBot([
      { name: 'iron_axe', count: 1, slot: 0 },
      { name: 'diamond_axe', count: 1, slot: 1 },
    ]);
    // Override blockAt to return oak_log instead of stone
    bot.blockAt.mockImplementation((pos: Vec3) => {
      if (pos.x === 1 && pos.y === 64 && pos.z === 0) {
        return { name: 'oak_log', position: pos, diggable: true };
      }
      return { name: 'air', position: pos };
    });
    let digCount = 0;
    bot.dig.mockImplementation(async () => { digCount++; });
    let callCount = 0;
    bot.inventory.items = vi.fn().mockImplementation(() => {
      callCount++;
      if (digCount > 0 && callCount > 2) {
        return [
          { name: 'iron_axe', count: 1, slot: 0 },
          { name: 'diamond_axe', count: 1, slot: 1 },
          { name: 'oak_log', count: 1, slot: 2 },
        ];
      }
      return [
        { name: 'iron_axe', count: 1, slot: 0 },
        { name: 'diamond_axe', count: 1, slot: 1 },
      ];
    });

    const ctx = createMockCtx(bot);
    const result = await leaf.run(ctx as any, { item: 'oak_log', count: 1 });

    expect(bot.equip).toHaveBeenCalled();
    const equippedItem = bot.equip.mock.calls[0][0];
    expect(equippedItem.name).toBe('diamond_axe');
    expect((result.result as any).toolUsed).toBe('diamond_axe');
  });

  it('selects shovel for dirt blocks', async () => {
    const bot = createMockBot([
      { name: 'wooden_shovel', count: 1, slot: 0 },
      { name: 'iron_shovel', count: 1, slot: 1 },
    ]);
    bot.blockAt.mockImplementation((pos: Vec3) => {
      if (pos.x === 1 && pos.y === 64 && pos.z === 0) {
        return { name: 'dirt', position: pos, diggable: true };
      }
      return { name: 'air', position: pos };
    });
    let digCount = 0;
    bot.dig.mockImplementation(async () => { digCount++; });
    let callCount = 0;
    bot.inventory.items = vi.fn().mockImplementation(() => {
      callCount++;
      if (digCount > 0 && callCount > 2) {
        return [
          { name: 'wooden_shovel', count: 1, slot: 0 },
          { name: 'iron_shovel', count: 1, slot: 1 },
          { name: 'dirt', count: 1, slot: 2 },
        ];
      }
      return [
        { name: 'wooden_shovel', count: 1, slot: 0 },
        { name: 'iron_shovel', count: 1, slot: 1 },
      ];
    });

    const ctx = createMockCtx(bot);
    const result = await leaf.run(ctx as any, { item: 'dirt', count: 1 });

    expect(bot.equip).toHaveBeenCalled();
    const equippedItem = bot.equip.mock.calls[0][0];
    expect(equippedItem.name).toBe('iron_shovel');
    expect((result.result as any).toolUsed).toBe('iron_shovel');
  });

  it('selects pickaxe (not shovel) for sandstone blocks', async () => {
    const bot = createMockBot([
      { name: 'iron_pickaxe', count: 1, slot: 0 },
      { name: 'iron_shovel', count: 1, slot: 1 },
    ]);
    bot.blockAt.mockImplementation((pos: Vec3) => {
      if (pos.x === 1 && pos.y === 64 && pos.z === 0) {
        return { name: 'sandstone', position: pos, diggable: true };
      }
      return { name: 'air', position: pos };
    });
    let digCount = 0;
    bot.dig.mockImplementation(async () => { digCount++; });
    let callCount = 0;
    bot.inventory.items = vi.fn().mockImplementation(() => {
      callCount++;
      if (digCount > 0 && callCount > 2) {
        return [
          { name: 'iron_pickaxe', count: 1, slot: 0 },
          { name: 'iron_shovel', count: 1, slot: 1 },
          { name: 'sandstone', count: 1, slot: 2 },
        ];
      }
      return [
        { name: 'iron_pickaxe', count: 1, slot: 0 },
        { name: 'iron_shovel', count: 1, slot: 1 },
      ];
    });

    const ctx = createMockCtx(bot);
    const result = await leaf.run(ctx as any, { item: 'sandstone', count: 1 });

    expect(bot.equip).toHaveBeenCalled();
    const equippedItem = bot.equip.mock.calls[0][0];
    // sandstone is pickaxe-mineable, not shovel — verify no misclassification
    expect(equippedItem.name).toBe('iron_pickaxe');
    expect((result.result as any).toolUsed).toBe('iron_pickaxe');
  });

  it('explicit tool class "pickaxe" selects best tier, not arbitrary', async () => {
    const bot = createMockBot([
      { name: 'wooden_pickaxe', count: 1, slot: 0 },
      { name: 'stone_pickaxe', count: 1, slot: 1 },
      { name: 'diamond_pickaxe', count: 1, slot: 2 },
    ]);
    let digCount = 0;
    bot.dig.mockImplementation(async () => { digCount++; });
    let callCount = 0;
    bot.inventory.items = vi.fn().mockImplementation(() => {
      callCount++;
      if (digCount > 0 && callCount > 2) {
        return [
          { name: 'wooden_pickaxe', count: 1, slot: 0 },
          { name: 'stone_pickaxe', count: 1, slot: 1 },
          { name: 'diamond_pickaxe', count: 1, slot: 2 },
          { name: 'cobblestone', count: 1, slot: 3 },
        ];
      }
      return [
        { name: 'wooden_pickaxe', count: 1, slot: 0 },
        { name: 'stone_pickaxe', count: 1, slot: 1 },
        { name: 'diamond_pickaxe', count: 1, slot: 2 },
      ];
    });

    const ctx = createMockCtx(bot);
    // Pass tool class name, not exact item name
    const result = await leaf.run(ctx as any, { item: 'stone', count: 1, tool: 'pickaxe' });

    expect(bot.equip).toHaveBeenCalled();
    const equippedItem = bot.equip.mock.calls[0][0];
    // Should pick diamond (best tier), not wooden (first in list)
    expect(equippedItem.name).toBe('diamond_pickaxe');
    expect((result.result as any).toolUsed).toBe('diamond_pickaxe');
  });

  it('includes toolUsed in hard-failure result', async () => {
    const bot = createMockBot([
      { name: 'iron_pickaxe', count: 1, slot: 0 },
    ]);
    // Make dig throw to trigger the catch block
    bot.dig.mockRejectedValue(new Error('dig failed'));

    const ctx = createMockCtx(bot);
    const result = await leaf.run(ctx as any, { item: 'stone', count: 1 });

    expect(result.status).toBe('failure');
    expect(result.result).toBeDefined();
    expect((result.result as any).toolUsed).toBe('iron_pickaxe');
  });
});

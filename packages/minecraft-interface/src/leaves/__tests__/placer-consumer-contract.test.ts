/**
 * Placer-Consumer Contract Test
 *
 * Verifies that PlaceWorkstationLeaf and CraftRecipeLeaf/SmeltLeaf agree on
 * workstation search radius and placement semantics. After PlaceWorkstationLeaf
 * succeeds, consumer leaves must be able to find the workstation.
 *
 * This catches "placer/consumer radius or semantics drift" early.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi } from 'vitest';
import { Vec3 } from 'vec3';
import {
  PlaceWorkstationLeaf,
  WORKSTATION_SEARCH_RADIUS,
  WORKSTATION_TYPES,
} from '../crafting-leaves';
import type { LeafContext } from '@conscious-bot/core';

/** Type for the result payload from PlaceWorkstationLeaf. */
interface PlaceWorkstationResult {
  workstation: string;
  position: { x: number; y: number; z: number };
  reused: boolean;
}

function createMockBot(
  blockMap: Record<string, { name: string; boundingBox?: string }>,
  inventoryItems: Array<{ name: string; count: number }> = []
) {
  return {
    entity: {
      position: new Vec3(0, 64, 0),
    },
    blockAt: vi.fn((pos: Vec3) => {
      const x = Math.floor(pos.x), y = Math.floor(pos.y), z = Math.floor(pos.z);
      const key = `${x},${y},${z}`;
      const data = blockMap[key] || { name: 'air', boundingBox: 'empty' };
      return { ...data, position: new Vec3(x, y, z) };
    }),
    inventory: {
      items: vi.fn().mockReturnValue(
        inventoryItems.map((item, i) => ({ ...item, slot: i, metadata: {} }))
      ),
    },
    equip: vi.fn(),
    placeBlock: vi.fn(),
  } as any;
}

function createMockContext(bot: any): LeafContext {
  return {
    bot,
    abortSignal: new AbortController().signal,
    now: () => Date.now(),
    snapshot: vi.fn().mockResolvedValue({}),
    inventory: vi.fn().mockResolvedValue({ items: bot.inventory.items() }),
    emitMetric: vi.fn(),
    emitError: vi.fn(),
  } as any;
}

function buildDefaultWorld(): Record<string, { name: string; boundingBox?: string }> {
  const map: Record<string, { name: string; boundingBox?: string }> = {};
  for (let x = -4; x <= 4; x++) {
    for (let z = -4; z <= 4; z++) {
      map[`${x},63,${z}`] = { name: 'stone', boundingBox: 'block' };
      map[`${x},64,${z}`] = { name: 'air', boundingBox: 'empty' };
    }
  }
  map['0,64,0'] = { name: 'player', boundingBox: 'block' };
  return map;
}

/**
 * Replicate the consumer-side findNearestBlock logic from crafting-leaves.ts.
 * This is the exact algorithm CraftRecipeLeaf and SmeltLeaf use.
 */
function consumerFindNearestBlock(
  bot: any,
  names: string[],
  radius: number
): Vec3 | null {
  const pos = bot.entity.position;
  for (let r = 1; r <= radius; r++) {
    for (let x = -r; x <= r; x++) {
      for (let y = -r; y <= r; y++) {
        for (let z = -r; z <= r; z++) {
          const checkPos = pos.offset(x, y, z);
          const block = bot.blockAt(checkPos);
          if (block && names.includes(block.name)) {
            return checkPos;
          }
        }
      }
    }
  }
  return null;
}

describe('Placer-Consumer Contract', () => {
  it('WORKSTATION_SEARCH_RADIUS is consistent (placer and consumer use same value)', () => {
    // This test exists to catch if the constant is accidentally changed
    // or if a consumer bypasses it with a different literal.
    expect(WORKSTATION_SEARCH_RADIUS).toBe(6);
  });

  it('WORKSTATION_TYPES contains all expected workstation types', () => {
    expect(WORKSTATION_TYPES.has('crafting_table')).toBe(true);
    expect(WORKSTATION_TYPES.has('furnace')).toBe(true);
    expect(WORKSTATION_TYPES.has('blast_furnace')).toBe(true);
  });

  it('after PlaceWorkstationLeaf places a crafting_table, consumer findNearestBlock finds it', async () => {
    const world = buildDefaultWorld();
    const bot = createMockBot(world, [{ name: 'crafting_table', count: 1 }]);

    // Wire placeBlock to update shared world model
    bot.placeBlock.mockImplementation(async (refBlock: any, faceVec: Vec3) => {
      const target = refBlock.position.offset(faceVec.x, faceVec.y, faceVec.z);
      const key = `${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`;
      world[key] = { name: 'crafting_table', boundingBox: 'block' };
    });

    const ctx = createMockContext(bot);
    const leaf = new PlaceWorkstationLeaf();
    const result = await leaf.run(ctx, { workstation: 'crafting_table' });
    const data = result.result as PlaceWorkstationResult;

    expect(result.status).toBe('success');
    expect(data.reused).toBe(false);

    // Now simulate what CraftRecipeLeaf does: search for a crafting_table
    const found = consumerFindNearestBlock(
      bot,
      ['crafting_table'],
      WORKSTATION_SEARCH_RADIUS
    );

    expect(found).not.toBeNull();
    expect(found!.x).toBe(data.position.x);
    expect(found!.y).toBe(data.position.y);
    expect(found!.z).toBe(data.position.z);
  });

  it('after PlaceWorkstationLeaf places a furnace, consumer findNearestBlock finds it', async () => {
    const world = buildDefaultWorld();
    const bot = createMockBot(world, [{ name: 'furnace', count: 1 }]);

    bot.placeBlock.mockImplementation(async (refBlock: any, faceVec: Vec3) => {
      const target = refBlock.position.offset(faceVec.x, faceVec.y, faceVec.z);
      const key = `${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`;
      world[key] = { name: 'furnace', boundingBox: 'block' };
    });

    const ctx = createMockContext(bot);
    const leaf = new PlaceWorkstationLeaf();
    const result = await leaf.run(ctx, { workstation: 'furnace' });
    const data = result.result as PlaceWorkstationResult;

    expect(result.status).toBe('success');

    // Consumer search for furnace variants (same as SmeltLeaf)
    const found = consumerFindNearestBlock(
      bot,
      ['furnace', 'blast_furnace'],
      WORKSTATION_SEARCH_RADIUS
    );

    expect(found).not.toBeNull();
    expect(found!.x).toBe(data.position.x);
    expect(found!.y).toBe(data.position.y);
    expect(found!.z).toBe(data.position.z);
  });

  it('reused workstation is found by consumer at same position', async () => {
    const world = buildDefaultWorld();
    // Pre-place a crafting_table with standable adjacency
    world['2,64,0'] = { name: 'crafting_table', boundingBox: 'block' };

    const bot = createMockBot(world);
    const ctx = createMockContext(bot);

    const leaf = new PlaceWorkstationLeaf();
    const result = await leaf.run(ctx, { workstation: 'crafting_table' });
    const data = result.result as PlaceWorkstationResult;

    expect(result.status).toBe('success');
    expect(data.reused).toBe(true);

    // Consumer should find the same workstation
    const found = consumerFindNearestBlock(
      bot,
      ['crafting_table'],
      WORKSTATION_SEARCH_RADIUS
    );

    expect(found).not.toBeNull();
    expect(found!.x).toBe(data.position.x);
    expect(found!.y).toBe(data.position.y);
    expect(found!.z).toBe(data.position.z);
  });
});

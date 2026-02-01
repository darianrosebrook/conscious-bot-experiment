/**
 * PlaceWorkstationLeaf Tests
 *
 * Tests mapped directly to design invariants:
 * 1. Usability: standable adjacent position exists after success
 * 2. Consumer radius: workstation within 6 blocks of bot
 * 3. Placement preference: distance 2-3 preferred, 1 is fallback
 * 4. Reuse = usable: reuse requires presence + standable adjacency
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Vec3 } from 'vec3';
import { PlaceWorkstationLeaf, MAX_NEARBY_WORKSTATIONS } from '../crafting-leaves';
import type { LeafContext } from '@conscious-bot/core';

/** Type for the result payload from PlaceWorkstationLeaf. */
interface PlaceWorkstationResult {
  workstation: string;
  position: { x: number; y: number; z: number };
  reused: boolean;
}

/**
 * Create a mock bot with configurable world blocks.
 * blockMap: Record<string, { name: string; boundingBox?: string }>
 *   keyed by "x,y,z" strings
 */
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
      // Include position so placeBlock mock can compute target from reference + faceVector
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

/**
 * Build a blockMap with solid ground floor and air above.
 * Covers positions from -4 to +4 in x/z around origin y=64.
 */
function buildDefaultWorld(): Record<string, { name: string; boundingBox?: string }> {
  const map: Record<string, { name: string; boundingBox?: string }> = {};
  for (let x = -4; x <= 4; x++) {
    for (let z = -4; z <= 4; z++) {
      // Solid ground at y=63
      map[`${x},63,${z}`] = { name: 'stone', boundingBox: 'block' };
      // Air at y=64 (feet level)
      map[`${x},64,${z}`] = { name: 'air', boundingBox: 'empty' };
    }
  }
  // Bot position is at 0,64,0 — should not be air for placement (bot stands here)
  map['0,64,0'] = { name: 'player', boundingBox: 'block' };
  return map;
}

describe('PlaceWorkstationLeaf', () => {
  let leaf: PlaceWorkstationLeaf;

  beforeEach(() => {
    leaf = new PlaceWorkstationLeaf();
    vi.clearAllMocks();
  });

  it('should have correct spec', () => {
    expect(leaf.spec.name).toBe('place_workstation');
    expect(leaf.spec.version).toBe('1.0.0');
    expect(leaf.spec.permissions).toContain('place');
    expect(leaf.spec.timeoutMs).toBe(8000);
  });

  // ──────────────────────────────────────────────────────────────
  // Test 1: Reuse — workstation exists + standable adjacency
  // Invariants 1, 4
  // ──────────────────────────────────────────────────────────────
  it('reuses an existing workstation with standable adjacency', async () => {
    const world = buildDefaultWorld();
    // Place a crafting_table at (2, 64, 0) — within 6 blocks
    world['2,64,0'] = { name: 'crafting_table', boundingBox: 'block' };
    // Adjacent positions (3,64,0) and (1,64,0) are air with solid below — standable
    // Already in buildDefaultWorld

    const bot = createMockBot(world);
    const ctx = createMockContext(bot);

    const result = await leaf.run(ctx, { workstation: 'crafting_table' });
    const data = result.result as PlaceWorkstationResult;

    expect(result.status).toBe('success');
    expect(data.reused).toBe(true);
    expect(data.workstation).toBe('crafting_table');
    expect(data.position).toEqual({ x: 2, y: 64, z: 0 });
    // Should NOT call placeBlock
    expect(bot.placeBlock).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────
  // Test 2: No reuse — workstation exists but no standable adjacency
  // Invariant 4
  // ──────────────────────────────────────────────────────────────
  it('does not reuse workstation when no standable adjacent position exists', async () => {
    const world = buildDefaultWorld();
    // Place a crafting_table at (2, 64, 0)
    world['2,64,0'] = { name: 'crafting_table', boundingBox: 'block' };
    // Block all 4 adjacent positions with solid blocks (no standing room)
    world['3,64,0'] = { name: 'stone', boundingBox: 'block' };
    world['1,64,0'] = { name: 'stone', boundingBox: 'block' };
    world['2,64,1'] = { name: 'stone', boundingBox: 'block' };
    world['2,64,-1'] = { name: 'stone', boundingBox: 'block' };

    const bot = createMockBot(world, [{ name: 'crafting_table', count: 1 }]);

    // Make placeBlock succeed and update the world
    // Real mineflayer API: placeBlock(referenceBlock, faceVector) where target = ref.position + face
    bot.placeBlock.mockImplementation(async (refBlock: any, faceVec: Vec3) => {
      const target = refBlock.position.offset(faceVec.x, faceVec.y, faceVec.z);
      const key = `${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`;
      world[key] = { name: 'crafting_table', boundingBox: 'block' };
    });

    const ctx = createMockContext(bot);
    const result = await leaf.run(ctx, { workstation: 'crafting_table' });
    const data = result.result as PlaceWorkstationResult;

    expect(result.status).toBe('success');
    expect(data.reused).toBe(false);
    expect(bot.placeBlock).toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────
  // Test 3: Place new workstation
  // Invariants 1, 2, 3
  // ──────────────────────────────────────────────────────────────
  it('places a new crafting_table when none exists nearby', async () => {
    const world = buildDefaultWorld();

    const bot = createMockBot(world, [{ name: 'crafting_table', count: 1 }]);

    // Track where placeBlock is called and update world
    bot.placeBlock.mockImplementation(async (refBlock: any, faceVec: Vec3) => {
      const target = refBlock.position.offset(faceVec.x, faceVec.y, faceVec.z);
      const key = `${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`;
      world[key] = { name: 'crafting_table', boundingBox: 'block' };
    });

    const ctx = createMockContext(bot);
    const result = await leaf.run(ctx, { workstation: 'crafting_table' });
    const data = result.result as PlaceWorkstationResult;

    expect(result.status).toBe('success');
    expect(data.reused).toBe(false);
    expect(data.workstation).toBe('crafting_table');
    expect(bot.placeBlock).toHaveBeenCalled();

    // Verify placement is within 6 blocks (invariant 2)
    const pos = data.position;
    const dist = Math.abs(pos.x) + Math.abs(pos.z); // Manhattan distance at same y
    expect(dist).toBeLessThanOrEqual(6);
  });

  // ──────────────────────────────────────────────────────────────
  // Test 4: Missing inventory
  // ──────────────────────────────────────────────────────────────
  it('fails with inventory.missingItem when workstation not in inventory', async () => {
    const world = buildDefaultWorld();
    const bot = createMockBot(world, []); // empty inventory
    const ctx = createMockContext(bot);

    const result = await leaf.run(ctx, { workstation: 'crafting_table' });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('inventory.missingItem');
  });

  // ──────────────────────────────────────────────────────────────
  // Test 5: No valid position
  // ──────────────────────────────────────────────────────────────
  it('fails with place.invalidFace when all candidates are blocked', async () => {
    // Build a world where all positions around the bot are solid
    const map: Record<string, { name: string; boundingBox?: string }> = {};
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        map[`${x},63,${z}`] = { name: 'stone', boundingBox: 'block' };
        map[`${x},64,${z}`] = { name: 'stone', boundingBox: 'block' };
      }
    }

    const bot = createMockBot(map, [{ name: 'crafting_table', count: 1 }]);
    const ctx = createMockContext(bot);

    const result = await leaf.run(ctx, { workstation: 'crafting_table' });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('place.invalidFace');
    expect(result.error?.retryable).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────
  // Test 6: Furnace placement
  // ──────────────────────────────────────────────────────────────
  it('places a furnace successfully', async () => {
    const world = buildDefaultWorld();

    const bot = createMockBot(world, [{ name: 'furnace', count: 1 }]);
    bot.placeBlock.mockImplementation(async (refBlock: any, faceVec: Vec3) => {
      const target = refBlock.position.offset(faceVec.x, faceVec.y, faceVec.z);
      const key = `${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`;
      world[key] = { name: 'furnace', boundingBox: 'block' };
    });

    const ctx = createMockContext(bot);
    const result = await leaf.run(ctx, { workstation: 'furnace' });
    const data = result.result as PlaceWorkstationResult;

    expect(result.status).toBe('success');
    expect(data.reused).toBe(false);
    expect(data.workstation).toBe('furnace');
  });

  // ──────────────────────────────────────────────────────────────
  // Test 7: Invalid workstation name
  // ──────────────────────────────────────────────────────────────
  it('rejects invalid workstation name', async () => {
    const world = buildDefaultWorld();
    const bot = createMockBot(world);
    const ctx = createMockContext(bot);

    const result = await leaf.run(ctx, { workstation: 'diamond_block' });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('world.invalidPosition');
  });

  it('rejects missing workstation arg', async () => {
    const world = buildDefaultWorld();
    const bot = createMockBot(world);
    const ctx = createMockContext(bot);

    const result = await leaf.run(ctx, {});

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('world.invalidPosition');
  });

  // ──────────────────────────────────────────────────────────────
  // Test 8: Consumer radius invariant
  // Invariant 2
  // ──────────────────────────────────────────────────────────────
  it('places workstation within 6 blocks of bot', async () => {
    const world = buildDefaultWorld();

    const bot = createMockBot(world, [{ name: 'crafting_table', count: 1 }]);
    bot.placeBlock.mockImplementation(async (refBlock: any, faceVec: Vec3) => {
      const target = refBlock.position.offset(faceVec.x, faceVec.y, faceVec.z);
      const key = `${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`;
      world[key] = { name: 'crafting_table', boundingBox: 'block' };
    });

    const ctx = createMockContext(bot);
    const result = await leaf.run(ctx, { workstation: 'crafting_table' });
    const data = result.result as PlaceWorkstationResult;

    expect(result.status).toBe('success');

    const pos = data.position;
    const botPos = bot.entity.position;
    const chebyshevDist = Math.max(
      Math.abs(pos.x - botPos.x),
      Math.abs(pos.y - botPos.y),
      Math.abs(pos.z - botPos.z)
    );
    expect(chebyshevDist).toBeLessThanOrEqual(6);
  });

  // ──────────────────────────────────────────────────────────────
  // Test 9: Line-of-sight blocks reuse
  // Invariant 1 (usability strengthening)
  // ──────────────────────────────────────────────────────────────
  it('does not reuse workstation when line-of-sight is blocked', async () => {
    const world = buildDefaultWorld();
    // Place a crafting_table at (2, 64, 0) — within radius, has standable adjacency
    world['2,64,0'] = { name: 'crafting_table', boundingBox: 'block' };

    const bot = createMockBot(world, [{ name: 'crafting_table', count: 1 }]);

    // Wire placeBlock to update shared world model
    bot.placeBlock.mockImplementation(async (refBlock: any, faceVec: Vec3) => {
      const target = refBlock.position.offset(faceVec.x, faceVec.y, faceVec.z);
      const key = `${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`;
      world[key] = { name: 'crafting_table', boundingBox: 'block' };
    });

    // Create context WITH line-of-sight that always returns false (occluded)
    const ctx = createMockContext(bot);
    (ctx as any).hasLineOfSight = vi.fn().mockReturnValue(false);

    const result = await leaf.run(ctx, { workstation: 'crafting_table' });
    const data = result.result as PlaceWorkstationResult;

    expect(result.status).toBe('success');
    // Should NOT reuse — LOS blocked despite standable adjacency
    expect(data.reused).toBe(false);
    expect(bot.placeBlock).toHaveBeenCalled();
  });

  it('reuses workstation when line-of-sight is clear', async () => {
    const world = buildDefaultWorld();
    world['2,64,0'] = { name: 'crafting_table', boundingBox: 'block' };

    const bot = createMockBot(world);
    const ctx = createMockContext(bot);
    (ctx as any).hasLineOfSight = vi.fn().mockReturnValue(true);

    const result = await leaf.run(ctx, { workstation: 'crafting_table' });
    const data = result.result as PlaceWorkstationResult;

    expect(result.status).toBe('success');
    expect(data.reused).toBe(true);
    expect(bot.placeBlock).not.toHaveBeenCalled();
    // Verify LOS was actually checked
    expect((ctx as any).hasLineOfSight).toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────
  // Test 11: Sprawl mitigation — refuses when too many nearby
  // ──────────────────────────────────────────────────────────────
  it('refuses to place when nearby workstation count hits soft cap', async () => {
    const world = buildDefaultWorld();
    // Place MAX_NEARBY_WORKSTATIONS crafting tables — all with blocked adjacency
    // so none are reusable, but count still triggers sprawl limit
    for (let i = 1; i <= MAX_NEARBY_WORKSTATIONS; i++) {
      world[`${i},64,${i}`] = { name: 'crafting_table', boundingBox: 'block' };
      // Block all adjacent positions
      world[`${i + 1},64,${i}`] = { name: 'stone', boundingBox: 'block' };
      world[`${i - 1},64,${i}`] = { name: 'stone', boundingBox: 'block' };
      world[`${i},64,${i + 1}`] = { name: 'stone', boundingBox: 'block' };
      world[`${i},64,${i - 1}`] = { name: 'stone', boundingBox: 'block' };
    }

    const bot = createMockBot(world, [{ name: 'crafting_table', count: 1 }]);
    const ctx = createMockContext(bot);

    const result = await leaf.run(ctx, { workstation: 'crafting_table' });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('place.sprawlLimit');
    expect(result.error?.retryable).toBe(true);
    expect(bot.placeBlock).not.toHaveBeenCalled();
  });

  it('allows placement when nearby count is below soft cap', async () => {
    const world = buildDefaultWorld();
    // Place 1 crafting table with blocked adjacency (not reusable, but below cap)
    world['3,64,3'] = { name: 'crafting_table', boundingBox: 'block' };
    world['4,64,3'] = { name: 'stone', boundingBox: 'block' };
    world['2,64,3'] = { name: 'stone', boundingBox: 'block' };
    world['3,64,4'] = { name: 'stone', boundingBox: 'block' };
    world['3,64,2'] = { name: 'stone', boundingBox: 'block' };

    const bot = createMockBot(world, [{ name: 'crafting_table', count: 1 }]);
    bot.placeBlock.mockImplementation(async (refBlock: any, faceVec: Vec3) => {
      const target = refBlock.position.offset(faceVec.x, faceVec.y, faceVec.z);
      const key = `${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`;
      world[key] = { name: 'crafting_table', boundingBox: 'block' };
    });

    const ctx = createMockContext(bot);
    const result = await leaf.run(ctx, { workstation: 'crafting_table' });

    expect(result.status).toBe('success');
    expect((result.result as PlaceWorkstationResult).reused).toBe(false);
    // Emits unusable_nearby metric since 1 exists but isn't usable
    expect(ctx.emitMetric).toHaveBeenCalledWith(
      'place_workstation_unusable_nearby',
      1,
      { workstation: 'crafting_table' },
    );
  });
});

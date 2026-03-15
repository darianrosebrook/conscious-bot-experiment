/**
 * M5: VerifyModuleLeaf consumer tests.
 *
 * Proves the leaf correctly consumes embedded witness data from
 * decomposed verify_module steps and produces the right diff.
 *
 * Three cases:
 * 1. All expected blocks present → postconditionsMet: true
 * 2. One expected block missing → postconditionsMet: false, diff.missing populated
 * 3. One requiredEmpty position filled → postconditionsMet: false, diff.unexpectedFills populated
 */

import { describe, it, expect, vi } from 'vitest';
import { VerifyModuleLeaf } from '../construction-leaves';

// ── Mock bot with controllable world state ──

function makeMockBot(worldBlocks: Record<string, string>) {
  return {
    blockAt: vi.fn((pos: any) => {
      const key = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
      const name = worldBlocks[key];
      if (!name) return { name: 'air', boundingBox: 'empty' };
      return { name, boundingBox: 'block' };
    }),
  };
}

function makeCtx(worldBlocks: Record<string, string>) {
  const bot = makeMockBot(worldBlocks);
  return {
    bot,
    now: () => Date.now(),
    emitMetric: vi.fn(),
    inventory: vi.fn().mockResolvedValue([]),
  };
}

// ── Foundation witness fixture (3 blocks for simplicity) ──

const foundationWitness = {
  moduleId: 'foundation_test',
  refCorner: { x: 100, y: 64, z: 200 },
  facing: 'N',
  expectedPlacements: [
    { dx: 0, dy: 0, dz: 0, blockId: 'cobblestone' },
    { dx: 1, dy: 0, dz: 0, blockId: 'cobblestone' },
    { dx: 2, dy: 0, dz: 0, blockId: 'cobblestone' },
  ],
  requiredEmpty: [] as Array<{ dx: number; dy: number; dz: number }>,
};

// ── Wall witness with door opening ──

const wallWitness = {
  moduleId: 'walls_test',
  refCorner: { x: 100, y: 64, z: 200 },
  facing: 'N',
  expectedPlacements: [
    { dx: 0, dy: 1, dz: 0, blockId: 'oak_planks' },
    { dx: 2, dy: 1, dz: 0, blockId: 'oak_planks' },
  ],
  requiredEmpty: [
    { dx: 1, dy: 1, dz: 0 }, // Door opening — must be air
  ],
};

// ── Tests ──

describe('VerifyModuleLeaf consumer tests', () => {
  const leaf = new VerifyModuleLeaf();

  it('exact match: all expected blocks present → postconditionsMet true', async () => {
    const world: Record<string, string> = {
      '100,64,200': 'cobblestone',
      '101,64,200': 'cobblestone',
      '102,64,200': 'cobblestone',
    };
    const ctx = makeCtx(world);

    const result = await leaf.run(ctx as any, {
      moduleId: 'foundation_test',
      witness: foundationWitness,
    });

    console.log('=== EXACT MATCH ===');
    console.log('status:', result.status);
    console.log('postconditionsMet:', (result as any).result.postconditionsMet);
    console.log('scannedPositions:', (result as any).result.scannedPositions);
    console.log('diff.missing:', JSON.stringify((result as any).result.diff.missing));
    console.log('diff.wrong:', JSON.stringify((result as any).result.diff.wrong));

    expect(result.status).toBe('success');
    expect((result as any).result.postconditionsMet).toBe(true);
    expect((result as any).result.scannedPositions).toBe(3);
    expect((result as any).result.diff.missing).toHaveLength(0);
    expect((result as any).result.diff.wrong).toHaveLength(0);
  });

  it('missing block: one expected block absent → postconditionsMet false', async () => {
    const world: Record<string, string> = {
      '100,64,200': 'cobblestone',
      // '101,64,200' missing — air
      '102,64,200': 'cobblestone',
    };
    const ctx = makeCtx(world);

    const result = await leaf.run(ctx as any, {
      moduleId: 'foundation_test',
      witness: foundationWitness,
    });

    console.log('=== MISSING BLOCK ===');
    console.log('status:', result.status);
    console.log('postconditionsMet:', (result as any).result.postconditionsMet);
    console.log('diff.missing:', JSON.stringify((result as any).result.diff.missing));

    expect(result.status).toBe('failure');
    expect((result as any).result.postconditionsMet).toBe(false);
    expect((result as any).result.diff.missing).toHaveLength(1);
    expect((result as any).result.diff.missing[0].pos).toEqual({ x: 101, y: 64, z: 200 });
    expect((result as any).result.diff.missing[0].expected).toBe('cobblestone');
    expect((result as any).result.diff.missing[0].actual).toBe('air');
  });

  it('filled void: requiredEmpty position occupied → postconditionsMet false', async () => {
    const world: Record<string, string> = {
      '100,65,200': 'oak_planks',   // wall block — correct
      '101,65,200': 'cobblestone',  // door opening — SHOULD BE AIR
      '102,65,200': 'oak_planks',   // wall block — correct
    };
    const ctx = makeCtx(world);

    const result = await leaf.run(ctx as any, {
      moduleId: 'walls_test',
      witness: wallWitness,
    });

    console.log('=== FILLED VOID ===');
    console.log('status:', result.status);
    console.log('postconditionsMet:', (result as any).result.postconditionsMet);
    console.log('diff.unexpectedFills:', JSON.stringify((result as any).result.diff.unexpectedFills));

    expect(result.status).toBe('failure');
    expect((result as any).result.postconditionsMet).toBe(false);
    expect((result as any).result.diff.unexpectedFills).toHaveLength(1);
    expect((result as any).result.diff.unexpectedFills[0].pos).toEqual({ x: 101, y: 65, z: 200 });
    expect((result as any).result.diff.unexpectedFills[0].actual).toBe('cobblestone');
  });

  it('wrong block type: expected cobblestone but found dirt → diff.wrong', async () => {
    const world: Record<string, string> = {
      '100,64,200': 'cobblestone',
      '101,64,200': 'dirt',         // Wrong block type
      '102,64,200': 'cobblestone',
    };
    const ctx = makeCtx(world);

    const result = await leaf.run(ctx as any, {
      moduleId: 'foundation_test',
      witness: foundationWitness,
    });

    console.log('=== WRONG BLOCK ===');
    console.log('status:', result.status);
    console.log('diff.wrong:', JSON.stringify((result as any).result.diff.wrong));

    expect(result.status).toBe('failure');
    expect((result as any).result.postconditionsMet).toBe(false);
    expect((result as any).result.diff.wrong).toHaveLength(1);
    expect((result as any).result.diff.wrong[0].expected).toBe('cobblestone');
    expect((result as any).result.diff.wrong[0].actual).toBe('dirt');
  });
});

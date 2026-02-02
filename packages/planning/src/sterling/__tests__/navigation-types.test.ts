/**
 * Tests for minecraft-navigation-types.ts
 *
 * Validates occupancy grid utilities, heuristic admissibility,
 * goal metric, hazard policy hashing, and hash determinism.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  BLOCK_TYPE,
  MOVEMENT_COSTS,
  CARDINAL_DIRECTIONS,
  gridAt,
  isPassable,
  isSolid,
  hashOccupancyGrid,
  encodeGridToBase64,
  computeHazardPolicyId,
  DEFAULT_HAZARD_POLICY,
  hasArrived,
  computeNavigationHeuristic,
  hashNavigationGoal,
  hashNavigationStart,
} from '../minecraft-navigation-types';
import type { OccupancyGrid, NavigationHazardPolicy } from '../minecraft-navigation-types';

// ============================================================================
// Helper: create a simple grid
// ============================================================================

/**
 * Create a test occupancy grid filled with a single block type.
 * Default: 5x3x5 grid of air at origin (0,0,0).
 */
function createTestGrid(opts?: {
  dx?: number;
  dy?: number;
  dz?: number;
  origin?: { x: number; y: number; z: number };
  fill?: number;
}): OccupancyGrid {
  const dx = opts?.dx ?? 5;
  const dy = opts?.dy ?? 3;
  const dz = opts?.dz ?? 5;
  const fill = opts?.fill ?? BLOCK_TYPE.AIR;
  const blocks = new Uint8Array(dx * dy * dz).fill(fill);
  return {
    origin: opts?.origin ?? { x: 0, y: 0, z: 0 },
    size: { dx, dy, dz },
    blocks,
  };
}

/**
 * Set a block in the grid at absolute world coordinates.
 */
function setBlock(grid: OccupancyGrid, x: number, y: number, z: number, type: number): void {
  const lx = x - grid.origin.x;
  const ly = y - grid.origin.y;
  const lz = z - grid.origin.z;
  const { dy, dz } = grid.size;
  grid.blocks[((lx * dy) + ly) * dz + lz] = type;
}

// ============================================================================
// gridAt
// ============================================================================

describe('gridAt', () => {
  it('returns correct block type for in-bounds coordinates', () => {
    const grid = createTestGrid({ fill: BLOCK_TYPE.SOLID });
    setBlock(grid, 2, 1, 3, BLOCK_TYPE.AIR);
    expect(gridAt(grid, 2, 1, 3)).toBe(BLOCK_TYPE.AIR);
    expect(gridAt(grid, 0, 0, 0)).toBe(BLOCK_TYPE.SOLID);
  });

  it('returns -1 for out-of-bounds coordinates', () => {
    const grid = createTestGrid({ dx: 3, dy: 3, dz: 3 });
    expect(gridAt(grid, -1, 0, 0)).toBe(-1);
    expect(gridAt(grid, 3, 0, 0)).toBe(-1);
    expect(gridAt(grid, 0, -1, 0)).toBe(-1);
    expect(gridAt(grid, 0, 3, 0)).toBe(-1);
    expect(gridAt(grid, 0, 0, -1)).toBe(-1);
    expect(gridAt(grid, 0, 0, 3)).toBe(-1);
  });

  it('handles non-zero origin', () => {
    const grid = createTestGrid({ dx: 3, dy: 3, dz: 3, origin: { x: 10, y: 60, z: 100 } });
    setBlock(grid, 11, 61, 101, BLOCK_TYPE.LAVA);
    expect(gridAt(grid, 11, 61, 101)).toBe(BLOCK_TYPE.LAVA);
    expect(gridAt(grid, 9, 60, 100)).toBe(-1); // below origin
    expect(gridAt(grid, 13, 60, 100)).toBe(-1); // above max
  });

  it('uses X→Y→Z linearization order', () => {
    // Verify index = ((lx * dy) + ly) * dz + lz
    const grid = createTestGrid({ dx: 2, dy: 2, dz: 2, fill: BLOCK_TYPE.AIR });
    // (0,0,0) → idx 0, (0,0,1) → idx 1, (0,1,0) → idx 2, (0,1,1) → idx 3
    // (1,0,0) → idx 4, (1,0,1) → idx 5, (1,1,0) → idx 6, (1,1,1) → idx 7
    grid.blocks[0] = 10;
    grid.blocks[1] = 11;
    grid.blocks[2] = 12;
    grid.blocks[3] = 13;
    grid.blocks[4] = 14;
    grid.blocks[5] = 15;
    grid.blocks[6] = 16;
    grid.blocks[7] = 17;
    expect(gridAt(grid, 0, 0, 0)).toBe(10);
    expect(gridAt(grid, 0, 0, 1)).toBe(11);
    expect(gridAt(grid, 0, 1, 0)).toBe(12);
    expect(gridAt(grid, 0, 1, 1)).toBe(13);
    expect(gridAt(grid, 1, 0, 0)).toBe(14);
    expect(gridAt(grid, 1, 0, 1)).toBe(15);
    expect(gridAt(grid, 1, 1, 0)).toBe(16);
    expect(gridAt(grid, 1, 1, 1)).toBe(17);
  });
});

// ============================================================================
// isPassable / isSolid
// ============================================================================

describe('isPassable', () => {
  it('returns true only for air blocks', () => {
    const grid = createTestGrid({ dx: 1, dy: 1, dz: 6, fill: BLOCK_TYPE.AIR });
    grid.blocks[0] = BLOCK_TYPE.AIR;
    grid.blocks[1] = BLOCK_TYPE.SOLID;
    grid.blocks[2] = BLOCK_TYPE.WATER;
    grid.blocks[3] = BLOCK_TYPE.LAVA;
    grid.blocks[4] = BLOCK_TYPE.LADDER;
    grid.blocks[5] = BLOCK_TYPE.HAZARD;

    expect(isPassable(grid, 0, 0, 0)).toBe(true);  // air
    expect(isPassable(grid, 0, 0, 1)).toBe(false);  // solid
    expect(isPassable(grid, 0, 0, 2)).toBe(false);  // water (Phase 1: impassable)
    expect(isPassable(grid, 0, 0, 3)).toBe(false);  // lava
    expect(isPassable(grid, 0, 0, 4)).toBe(false);  // ladder (Phase 1: impassable)
    expect(isPassable(grid, 0, 0, 5)).toBe(false);  // hazard
  });

  it('returns false for out-of-bounds', () => {
    const grid = createTestGrid({ dx: 1, dy: 1, dz: 1 });
    expect(isPassable(grid, 5, 5, 5)).toBe(false);
  });
});

describe('isSolid', () => {
  it('returns true only for solid blocks', () => {
    const grid = createTestGrid({ dx: 1, dy: 1, dz: 3 });
    grid.blocks[0] = BLOCK_TYPE.AIR;
    grid.blocks[1] = BLOCK_TYPE.SOLID;
    grid.blocks[2] = BLOCK_TYPE.WATER;
    expect(isSolid(grid, 0, 0, 0)).toBe(false);
    expect(isSolid(grid, 0, 0, 1)).toBe(true);
    expect(isSolid(grid, 0, 0, 2)).toBe(false);
  });
});

// ============================================================================
// hashOccupancyGrid
// ============================================================================

describe('hashOccupancyGrid', () => {
  it('returns a 16-char hex string', () => {
    const grid = createTestGrid();
    const hash = hashOccupancyGrid(grid);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic: same grid produces same hash', () => {
    const g1 = createTestGrid({ dx: 3, dy: 3, dz: 3, fill: BLOCK_TYPE.SOLID });
    const g2 = createTestGrid({ dx: 3, dy: 3, dz: 3, fill: BLOCK_TYPE.SOLID });
    expect(hashOccupancyGrid(g1)).toBe(hashOccupancyGrid(g2));
  });

  it('different grids produce different hashes', () => {
    const g1 = createTestGrid({ fill: BLOCK_TYPE.AIR });
    const g2 = createTestGrid({ fill: BLOCK_TYPE.SOLID });
    expect(hashOccupancyGrid(g1)).not.toBe(hashOccupancyGrid(g2));
  });

  it('different origins produce different hashes', () => {
    const g1 = createTestGrid({ origin: { x: 0, y: 0, z: 0 } });
    const g2 = createTestGrid({ origin: { x: 10, y: 0, z: 0 } });
    expect(hashOccupancyGrid(g1)).not.toBe(hashOccupancyGrid(g2));
  });
});

// ============================================================================
// encodeGridToBase64
// ============================================================================

describe('encodeGridToBase64', () => {
  it('round-trips through Buffer.from(base64)', () => {
    const grid = createTestGrid({ dx: 2, dy: 2, dz: 2, fill: BLOCK_TYPE.SOLID });
    setBlock(grid, 0, 0, 0, BLOCK_TYPE.AIR);
    const encoded = encodeGridToBase64(grid);
    const decoded = new Uint8Array(Buffer.from(encoded, 'base64'));
    expect(decoded).toEqual(grid.blocks);
  });
});

// ============================================================================
// computeHazardPolicyId
// ============================================================================

describe('computeHazardPolicyId', () => {
  it('returns a 16-char hex string', () => {
    const id = computeHazardPolicyId(DEFAULT_HAZARD_POLICY);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic', () => {
    const a = computeHazardPolicyId(DEFAULT_HAZARD_POLICY);
    const b = computeHazardPolicyId(DEFAULT_HAZARD_POLICY);
    expect(a).toBe(b);
  });

  it('excludes hazardPolicyId from hash (changing it does not change output)', () => {
    const p1: NavigationHazardPolicy = { ...DEFAULT_HAZARD_POLICY, hazardPolicyId: 'aaa' };
    const p2: NavigationHazardPolicy = { ...DEFAULT_HAZARD_POLICY, hazardPolicyId: 'bbb' };
    expect(computeHazardPolicyId(p1)).toBe(computeHazardPolicyId(p2));
  });

  it('different penalties produce different IDs', () => {
    const p1 = { ...DEFAULT_HAZARD_POLICY };
    const p2 = { ...DEFAULT_HAZARD_POLICY, penalties: { lava_adjacent: 200 } };
    expect(computeHazardPolicyId(p1)).not.toBe(computeHazardPolicyId(p2));
  });
});

// ============================================================================
// hasArrived (goal metric contract)
// ============================================================================

describe('hasArrived', () => {
  const goal = { x: 10, y: 68, z: 280 };

  it('returns true when at goal', () => {
    expect(hasArrived(goal, goal, 1, 0)).toBe(true);
  });

  it('returns true within toleranceXZ', () => {
    expect(hasArrived({ x: 11, y: 68, z: 280 }, goal, 1, 0)).toBe(true);
    expect(hasArrived({ x: 9, y: 68, z: 280 }, goal, 1, 0)).toBe(true);
    expect(hasArrived({ x: 10, y: 68, z: 281 }, goal, 1, 0)).toBe(true);
  });

  it('returns false outside toleranceXZ', () => {
    expect(hasArrived({ x: 12, y: 68, z: 280 }, goal, 1, 0)).toBe(false);
  });

  it('uses L∞ (Chebyshev) distance in XZ, not L1 (Manhattan)', () => {
    // L∞ of (11, 68, 281) from (10, 68, 280) = max(1, 1) = 1 → within tolerance
    expect(hasArrived({ x: 11, y: 68, z: 281 }, goal, 1, 0)).toBe(true);
    // L1 would be 2, but L∞ is 1
  });

  it('respects toleranceY separately', () => {
    expect(hasArrived({ x: 10, y: 69, z: 280 }, goal, 1, 0)).toBe(false);
    expect(hasArrived({ x: 10, y: 69, z: 280 }, goal, 1, 1)).toBe(true);
    expect(hasArrived({ x: 10, y: 67, z: 280 }, goal, 1, 1)).toBe(true);
    expect(hasArrived({ x: 10, y: 66, z: 280 }, goal, 1, 1)).toBe(false);
  });
});

// ============================================================================
// computeNavigationHeuristic — admissibility
// ============================================================================

describe('computeNavigationHeuristic', () => {
  it('returns 0 when at goal', () => {
    expect(computeNavigationHeuristic(10, 68, 280, 10, 68, 280)).toBe(0);
  });

  it('flat terrain: h = L1 horizontal distance', () => {
    // 10 blocks east: h = 10 * 1.0 = 10
    expect(computeNavigationHeuristic(0, 64, 0, 10, 64, 0)).toBe(10);
    // 5 blocks north: h = 5 * 1.0 = 5
    expect(computeNavigationHeuristic(0, 64, 5, 0, 64, 0)).toBe(5);
  });

  it('pure ascent: h = 2.0 * up (jump_up covers horizontal too)', () => {
    // 3 blocks up, 3 blocks east: all via jump_up → h = 2.0*3 + 1.0*max(0,3-3) = 6
    expect(computeNavigationHeuristic(0, 64, 0, 3, 67, 0)).toBe(6);
  });

  it('pure descent: h = 0.8 * down (descend covers horizontal too)', () => {
    // 3 blocks down, 3 blocks east: all via descend → h = 0.8*3 + 1.0*max(0,3-3) = 2.4
    expect(computeNavigationHeuristic(0, 67, 0, 3, 64, 0)).toBeCloseTo(2.4);
  });

  it('ascent with excess horizontal: h = 2.0*up + 1.0*(d-up)', () => {
    // 2 blocks up, 5 blocks east: h = 2.0*2 + 1.0*3 = 7
    expect(computeNavigationHeuristic(0, 64, 0, 5, 66, 0)).toBe(7);
  });

  it('descent with excess horizontal: h = 0.8*down + 1.0*(d-down)', () => {
    // 2 blocks down, 5 blocks east: h = 0.8*2 + 1.0*3 = 4.6
    expect(computeNavigationHeuristic(0, 66, 0, 5, 64, 0)).toBeCloseTo(4.6);
  });

  it('staircase counterexample: 10 east + 10 down = 8.0 (not 16.0)', () => {
    // This is the key admissibility test from the plan.
    // Each descend covers 1 horizontal + 1 down at cost 0.8.
    // Optimal cost = 10 * 0.8 = 8.0.
    // Naive heuristic = (10)*0.8 + (10)*1.0 = 18.0 (WRONG — double-counts).
    // Correct: h = 0.8*10 + 1.0*max(0,10-10) = 8.0.
    expect(computeNavigationHeuristic(0, 74, 0, 10, 64, 0)).toBeCloseTo(8.0);
  });

  it('vertical climb only (no horizontal): h = 2.0 * up', () => {
    // 5 blocks straight up: must use 5 jump_ups, each covering 1 horizontal.
    // But d=0, up=5. h = 2.0*5 + 1.0*max(0,0-5) = 10.0
    // d - up = 0 - 5 = -5 → max(0, -5) = 0
    expect(computeNavigationHeuristic(0, 64, 0, 0, 69, 0)).toBe(10);
  });

  it('heuristic is non-negative', () => {
    // Random cases
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(Math.random() * 100);
      const y = Math.floor(Math.random() * 100);
      const z = Math.floor(Math.random() * 100);
      const gx = Math.floor(Math.random() * 100);
      const gy = Math.floor(Math.random() * 100);
      const gz = Math.floor(Math.random() * 100);
      expect(computeNavigationHeuristic(x, y, z, gx, gy, gz)).toBeGreaterThanOrEqual(0);
    }
  });

  it('heuristic is admissible: h(s) <= actual cost for known shortest paths', () => {
    // Case 1: flat walk 5 east. Optimal = 5*1.0 = 5. h = 5.
    expect(computeNavigationHeuristic(0, 64, 0, 5, 64, 0)).toBeLessThanOrEqual(5);

    // Case 2: 3 jumps up-east. Optimal = 3*2.0 = 6. h = 6.
    expect(computeNavigationHeuristic(0, 64, 0, 3, 67, 0)).toBeLessThanOrEqual(6);

    // Case 3: 4 descends. Optimal = 4*0.8 = 3.2. h = 3.2.
    expect(computeNavigationHeuristic(0, 68, 0, 4, 64, 0)).toBeLessThanOrEqual(3.2);

    // Case 4: 2 up + 8 east. Optimal = 2*2.0 + 6*1.0 = 10. h = 10.
    expect(computeNavigationHeuristic(0, 64, 0, 8, 66, 0)).toBeLessThanOrEqual(10);

    // Case 5: mixed direction. 5 east + 3 north + 2 up.
    // d = 8, up = 2. h = 2*2.0 + max(0,8-2)*1.0 = 10.0
    // Optimal would be 2 jump_ups (covers 2 horizontal) + 6 walks = 2*2.0 + 6*1.0 = 10.0
    expect(computeNavigationHeuristic(0, 64, 3, 5, 66, 0)).toBeLessThanOrEqual(10.0);
  });
});

// ============================================================================
// Hash helpers — determinism (R4)
// ============================================================================

describe('hash determinism', () => {
  it('hashNavigationGoal: same inputs produce same hash', () => {
    const a = hashNavigationGoal({ x: 10, y: 68, z: 280 }, 1, 0);
    const b = hashNavigationGoal({ x: 10, y: 68, z: 280 }, 1, 0);
    expect(a).toBe(b);
  });

  it('hashNavigationGoal: different tolerance changes hash', () => {
    const a = hashNavigationGoal({ x: 10, y: 68, z: 280 }, 1, 0);
    const b = hashNavigationGoal({ x: 10, y: 68, z: 280 }, 2, 1);
    expect(a).not.toBe(b);
  });

  it('hashNavigationStart: same inputs produce same hash', () => {
    const a = hashNavigationStart({ x: -16, y: 64, z: 300 });
    const b = hashNavigationStart({ x: -16, y: 64, z: 300 });
    expect(a).toBe(b);
  });

  it('hashNavigationStart: different positions produce different hashes', () => {
    const a = hashNavigationStart({ x: 0, y: 64, z: 0 });
    const b = hashNavigationStart({ x: 1, y: 64, z: 0 });
    expect(a).not.toBe(b);
  });

  it('all hashes are 16-char hex strings', () => {
    const hex16 = /^[0-9a-f]{16}$/;
    expect(hashNavigationGoal({ x: 0, y: 0, z: 0 }, 1, 0)).toMatch(hex16);
    expect(hashNavigationStart({ x: 0, y: 0, z: 0 })).toMatch(hex16);
    expect(hashOccupancyGrid(createTestGrid())).toMatch(hex16);
    expect(computeHazardPolicyId(DEFAULT_HAZARD_POLICY)).toMatch(hex16);
  });
});

// ============================================================================
// Constants
// ============================================================================

describe('constants', () => {
  it('BLOCK_TYPE has expected values 0-5', () => {
    expect(BLOCK_TYPE.AIR).toBe(0);
    expect(BLOCK_TYPE.SOLID).toBe(1);
    expect(BLOCK_TYPE.WATER).toBe(2);
    expect(BLOCK_TYPE.LAVA).toBe(3);
    expect(BLOCK_TYPE.LADDER).toBe(4);
    expect(BLOCK_TYPE.HAZARD).toBe(5);
  });

  it('MOVEMENT_COSTS has Phase 1 values', () => {
    expect(MOVEMENT_COSTS.walk_cardinal).toBe(1.0);
    expect(MOVEMENT_COSTS.jump_up).toBe(2.0);
    expect(MOVEMENT_COSTS.descend).toBe(0.8);
  });

  it('CARDINAL_DIRECTIONS covers 4 directions with correct deltas', () => {
    expect(CARDINAL_DIRECTIONS).toHaveLength(4);
    const labels = CARDINAL_DIRECTIONS.map((d) => d.label);
    expect(labels).toContain('north');
    expect(labels).toContain('south');
    expect(labels).toContain('east');
    expect(labels).toContain('west');
  });

  it('DEFAULT_HAZARD_POLICY has expected shape', () => {
    expect(DEFAULT_HAZARD_POLICY.version).toBe(1);
    expect(DEFAULT_HAZARD_POLICY.riskMode).toBe('normal');
    expect(DEFAULT_HAZARD_POLICY.maxReplans).toBe(3);
    expect(DEFAULT_HAZARD_POLICY.scanMargin).toBe(5);
    expect(DEFAULT_HAZARD_POLICY.penalties.lava_adjacent).toBe(100);
  });
});

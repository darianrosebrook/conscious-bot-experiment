/**
 * Minecraft Navigation Domain Types
 *
 * Types for the Sterling navigation solver: occupancy grid, hazard policy,
 * movement primitives, and solve results. Phase 1: 4-cardinal movement only
 * (walk, jump_up, descend). No diagonals, sprint, swim, or climb.
 *
 * Encoding invariants (contractVersion: 1):
 * - Coordinate convention: Minecraft standard (x=east+, y=up+, z=south+)
 * - All coordinates are integer block positions (Math.floor from world coords)
 * - Grid linearization: X→Y→Z row-major. index = ((lx * dy) + ly) * dz + lz
 * - Block types: 0=air, 1=solid, 2=water, 3=lava, 4=ladder, 5=hazard
 * - Phase 1 passability: ONLY air (0) is passable
 * - Out-of-bounds grid lookups return -1 (impassable)
 *
 * @author @darianrosebrook
 */

import { createHash } from 'node:crypto';
import type { BaseSolveResult } from './base-domain-solver';
import type { ContentHash } from './solve-bundle-types';

// ============================================================================
// Block Types
// ============================================================================

/** Block type encoding for occupancy grid (1 byte per block) */
export const BLOCK_TYPE = {
  AIR: 0,
  SOLID: 1,
  WATER: 2,
  LAVA: 3,
  LADDER: 4,
  HAZARD: 5,
} as const;

export type BlockType = (typeof BLOCK_TYPE)[keyof typeof BLOCK_TYPE];

// ============================================================================
// Occupancy Grid
// ============================================================================

/**
 * Compact 3D occupancy grid for navigation.
 *
 * Encoding: X→Y→Z row-major. Index = ((lx * dy) + ly) * dz + lz
 * where lx = x - origin.x, ly = y - origin.y, lz = z - origin.z.
 *
 * Total bytes = dx * dy * dz.
 */
export interface OccupancyGrid {
  origin: { x: number; y: number; z: number };
  size: { dx: number; dy: number; dz: number };
  /** Raw block type data. 0=air, 1=solid, 2=water, 3=lava, 4=ladder, 5=hazard */
  blocks: Uint8Array;
}

/**
 * Look up block type at absolute world coordinates.
 * Returns -1 if out of bounds (treated as impassable).
 */
export function gridAt(grid: OccupancyGrid, x: number, y: number, z: number): number {
  const lx = x - grid.origin.x;
  const ly = y - grid.origin.y;
  const lz = z - grid.origin.z;
  const { dx, dy, dz } = grid.size;
  if (lx < 0 || lx >= dx || ly < 0 || ly >= dy || lz < 0 || lz >= dz) {
    return -1;
  }
  return grid.blocks[((lx * dy) + ly) * dz + lz];
}

/**
 * Check if a block is passable (Phase 1: only air).
 * Water (2) and ladder (4) are encoded in the grid but treated as
 * IMPASSABLE until swim/climb primitives are added in Phase 5.
 * This must match Python _is_passable() — changing one without the
 * other creates a solver/actuator mismatch.
 */
export function isPassable(grid: OccupancyGrid, x: number, y: number, z: number): boolean {
  return gridAt(grid, x, y, z) === BLOCK_TYPE.AIR;
}

/** Check if a block is solid (block type 1). */
export function isSolid(grid: OccupancyGrid, x: number, y: number, z: number): boolean {
  return gridAt(grid, x, y, z) === BLOCK_TYPE.SOLID;
}

/**
 * Hash occupancy grid for SolveBundle identity.
 * Computed over raw bytes (not base64) to avoid encoding drift.
 */
export function hashOccupancyGrid(grid: OccupancyGrid): ContentHash {
  const hash = createHash('sha256');
  // Include origin and size in hash for identity
  hash.update(`${grid.origin.x},${grid.origin.y},${grid.origin.z}`);
  hash.update(`${grid.size.dx},${grid.size.dy},${grid.size.dz}`);
  hash.update(grid.blocks);
  return hash.digest('hex').slice(0, 16);
}

/**
 * Encode occupancy grid blocks to base64 for transport.
 */
export function encodeGridToBase64(grid: OccupancyGrid): string {
  return Buffer.from(grid.blocks).toString('base64');
}

// ============================================================================
// Hazard Policy
// ============================================================================

/**
 * Navigation hazard policy — control-plane object committed into SolveBundle.
 * Can be overridden per-invocation (e.g., riskMode: 'aggressive' when fleeing).
 */
export interface NavigationHazardPolicy {
  /** Content hash of the policy (computed at build time, excludes this field) */
  hazardPolicyId: string;
  /** Monotonic version; bumped on policy changes */
  version: number;
  /** Risk tolerance level */
  riskMode: 'cautious' | 'normal' | 'aggressive';
  /** Hazard type → cost penalty mapping */
  penalties: Record<string, number>;
  /** Hard cap on replans per invocation */
  maxReplans: number;
  /** Blocks beyond straight-line to include in scan */
  scanMargin: number;
  /** Strategy when replans repeat */
  replanEscalation: 'expand_scan' | 'downgrade_primitives' | 'safe_mode' | 'fail';
}

/**
 * Default hazard policy (shipped, not hardcoded in solver).
 * hazardPolicyId is computed at runtime via computeHazardPolicyId().
 */
export const DEFAULT_HAZARD_POLICY: NavigationHazardPolicy = {
  hazardPolicyId: '',
  version: 1,
  riskMode: 'normal',
  penalties: {
    lava_adjacent: 100,
    cliff_lethal: 50,
    hostile_zone: 20,
    cactus: 15,
    deep_water: 8,
    dark_area: 5,
  },
  maxReplans: 3,
  scanMargin: 5,
  replanEscalation: 'expand_scan',
};

/**
 * Compute content-addressed hazardPolicyId.
 * SHA-256 of canonical JSON (sorted keys) excluding hazardPolicyId itself.
 */
export function computeHazardPolicyId(policy: NavigationHazardPolicy): string {
  const { hazardPolicyId: _, ...rest } = policy;
  const keys = Object.keys(rest).sort();
  const canonical: Record<string, unknown> = {};
  for (const key of keys) {
    canonical[key] = (rest as Record<string, unknown>)[key];
  }
  return createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex')
    .slice(0, 16);
}

// ============================================================================
// Movement Primitives
// ============================================================================

/** Phase 1 movement costs (4-neighborhood only, all >= 0.8) */
export const MOVEMENT_COSTS = {
  walk_cardinal: 1.0,
  jump_up: 2.0,
  descend: 0.8,
} as const;

/** Cardinal directions for Phase 1 (no diagonals) */
export const CARDINAL_DIRECTIONS = [
  { dx: 0, dz: -1, label: 'north' },
  { dx: 0, dz: 1, label: 'south' },
  { dx: 1, dz: 0, label: 'east' },
  { dx: -1, dz: 0, label: 'west' },
] as const;

/** Phase 1 action types */
export type NavigationActionType = 'walk' | 'jump_up' | 'descend';

/** Movement primitive returned by solver, executed by leaf */
export interface NavigationPrimitive {
  /** Full action name: "walk_north", "jump_up_east", "descend_south" */
  action: string;
  /** Phase 1 action type */
  actionType: NavigationActionType;
  /** Source position (integer block coords) */
  from: { x: number; y: number; z: number };
  /** Destination position (integer block coords) */
  to: { x: number; y: number; z: number };
  /** Movement cost (base + hazard penalty) */
  cost: number;
}

// ============================================================================
// Solve Result
// ============================================================================

/** Navigation solve result extending base solver result */
export interface NavigationSolveResult extends BaseSolveResult {
  solved: boolean;
  /** Ordered movement primitives to execute */
  primitives: NavigationPrimitive[];
  /** Path positions (from → to for each primitive) */
  pathPositions: Array<{ x: number; y: number; z: number }>;
  totalNodes: number;
  durationMs: number;
  /** Number of replans used in this invocation */
  replansUsed: number;
  planId?: string | null;
  error?: string;
}

// ============================================================================
// Goal Metric
// ============================================================================

/**
 * Canonical goal arrival check.
 * Both Python solver is_goal() and leaf arrival check use this metric.
 *
 * arrived = max(|dx|, |dz|) <= toleranceXZ && |dy| <= toleranceY
 *
 * Positions are integer block positions (floored).
 */
export function hasArrived(
  pos: { x: number; y: number; z: number },
  goal: { x: number; y: number; z: number },
  toleranceXZ: number,
  toleranceY: number,
): boolean {
  return (
    Math.max(Math.abs(pos.x - goal.x), Math.abs(pos.z - goal.z)) <= toleranceXZ &&
    Math.abs(pos.y - goal.y) <= toleranceY
  );
}

// ============================================================================
// Heuristic
// ============================================================================

/**
 * Admissible piecewise heuristic accounting for coupled moves (Phase 1).
 *
 * jump_up covers 1 horizontal + 1 up (cost 2.0).
 * descend covers 1 horizontal + 1 down (cost 0.8).
 * walk covers 1 horizontal (cost 1.0).
 *
 * Vertical moves "pay for" horizontal progress, so we must not double-count.
 *
 * If dy >= 0 (need to go up):
 *   h = 2.0 * up + 1.0 * max(0, d - up)
 * If dy < 0 (need to go down):
 *   h = 0.8 * down + 1.0 * max(0, d - down)
 */
export function computeNavigationHeuristic(
  x: number, y: number, z: number,
  goalX: number, goalY: number, goalZ: number,
): number {
  const d = Math.abs(x - goalX) + Math.abs(z - goalZ);
  const dy = goalY - y;
  const up = Math.max(dy, 0);
  const down = Math.max(-dy, 0);

  if (dy >= 0) {
    return 2.0 * up + 1.0 * Math.max(0, d - up);
  } else {
    return 0.8 * down + 1.0 * Math.max(0, d - down);
  }
}

// ============================================================================
// Hash Helpers
// ============================================================================

/**
 * Deterministic goal hash for SolveBundle.
 * Format: "nav_goal:{x},{y},{z}:{tolXZ},{tolY}"
 */
export function hashNavigationGoal(
  goal: { x: number; y: number; z: number },
  toleranceXZ: number,
  toleranceY: number,
): ContentHash {
  const str = `nav_goal:${goal.x},${goal.y},${goal.z}:${toleranceXZ},${toleranceY}`;
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}

/**
 * Deterministic start hash for SolveBundle.
 * Format: "nav_start:{x},{y},{z}"
 */
export function hashNavigationStart(start: { x: number; y: number; z: number }): ContentHash {
  const str = `nav_start:${start.x},${start.y},${start.z}`;
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}

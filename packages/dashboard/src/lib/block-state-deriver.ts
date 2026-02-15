/**
 * Block State Deriver — Derives Minecraft block state from placement context.
 *
 * Given block type, clicked face normal, and placement mode (floor vs face),
 * produces the appropriate block state (half, facing, type, open) for slabs,
 * stairs, trapdoors, torches, doors, and other directional blocks.
 *
 * @author @darianrosebrook
 */

import type { Vec3 } from '@/types/building';
import type { BlockState } from '@/types/building';

/** Minecraft facing names from axis-aligned normals */
type FacingDir = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

/** Normal (x,y,z) to Minecraft facing */
function normalToFacing(normal: { x: number; y: number; z: number }): FacingDir {
  if (normal.y > 0.5) return 'up';
  if (normal.y < -0.5) return 'down';
  if (normal.x > 0.5) return 'east';
  if (normal.x < -0.5) return 'west';
  if (normal.z > 0.5) return 'south';
  if (normal.z < -0.5) return 'north';
  return 'north';
}

/** Block types that use slab half (top/bottom) */
const SLAB_BLOCKS = new Set([
  'oak_slab', 'spruce_slab', 'birch_slab', 'jungle_slab', 'acacia_slab', 'dark_oak_slab',
  'cobblestone_slab', 'stone_brick_slab', 'sandstone_slab', 'brick_slab', 'nether_brick_slab',
  'quartz_slab', 'smooth_stone_slab', 'deepslate_brick_slab', 'mossy_cobblestone_slab',
  'mossy_stone_brick_slab', 'andesite_slab', 'diorite_slab', 'granite_slab',
]);

/** Block types that use trapdoor half, facing, open */
const TRAPDOOR_BLOCKS = new Set([
  'oak_trapdoor', 'spruce_trapdoor', 'birch_trapdoor', 'jungle_trapdoor', 'acacia_trapdoor',
  'dark_oak_trapdoor', 'iron_trapdoor', 'crimson_trapdoor', 'warped_trapdoor',
]);

/** Block types that are torches (wall or floor) */
const TORCH_BLOCKS = new Set(['torch', 'soul_torch']);

/** Block types that use stair half, facing, shape */
const STAIRS_BLOCKS = new Set([
  'oak_stairs', 'spruce_stairs', 'birch_stairs', 'jungle_stairs', 'acacia_stairs', 'dark_oak_stairs',
  'cobblestone_stairs', 'stone_brick_stairs', 'sandstone_stairs', 'brick_stairs',
  'nether_brick_stairs', 'quartz_stairs', 'prismarine_stairs', 'deepslate_brick_stairs',
]);

/** Block types that use door half, facing, open */
const DOOR_BLOCKS = new Set([
  'oak_door', 'spruce_door', 'birch_door', 'jungle_door', 'acacia_door', 'dark_oak_door',
  'crimson_door', 'warped_door', 'iron_door',
]);

/** Block types that require wall attachment (ladder, etc.) */
const WALL_ATTACH_BLOCKS = new Set(['ladder']);

/** Default facing when placing on floor (player-facing approximation). */
const DEFAULT_FLOOR_FACING: FacingDir = 'north';

/**
 * Derive block state from placement context.
 *
 * @param blockType — e.g. 'oak_slab', 'torch', 'oak_trapdoor'
 * @param faceNormal — Normal of the clicked face (points outward from clicked block)
 * @param placementPos — Grid cell where block will be placed
 * @param isFloor — True when placing on floor (y=0 plane)
 */
export function deriveBlockState(
  blockType: string,
  faceNormal: { x: number; y: number; z: number },
  _placementPos: Vec3,
  isFloor: boolean,
): BlockState | undefined {
  const base = blockType.replace(/^minecraft:/, '');
  const facing = normalToFacing(faceNormal);

  // Slabs: half = top when clicking underside of block above, bottom when clicking top of block below
  if (SLAB_BLOCKS.has(base)) {
    const half = facing === 'up' ? 'bottom' : facing === 'down' ? 'top' : 'bottom';
    return { half };
  }

  // Trapdoors: half = top/bottom by face, facing from horizontal component, open=false
  if (TRAPDOOR_BLOCKS.has(base)) {
    const half = facing === 'down' ? 'top' : 'bottom';
    const trapFacing =
      facing === 'up' || facing === 'down' ? DEFAULT_FLOOR_FACING : facing;
    return { half, facing: trapFacing, open: false };
  }

  // Torches: type=floor on top face, type=wall on side face; facing from normal
  if (TORCH_BLOCKS.has(base)) {
    if (isFloor || facing === 'up') {
      return { type: 'floor', facing: 'up' };
    }
    if (facing === 'down') {
      return { type: 'floor', facing: 'up' };
    }
    return { type: 'wall', facing };
  }

  // Stairs: half=bottom by default, facing from horizontal component
  if (STAIRS_BLOCKS.has(base)) {
    const half = facing === 'down' ? 'top' : 'bottom';
    const stairFacing =
      facing === 'up' || facing === 'down' ? DEFAULT_FLOOR_FACING : facing;
    return { half, facing: stairFacing, shape: 'straight' };
  }

  // Doors: half=lower (we place one block; solver/executor would place upper), facing
  if (DOOR_BLOCKS.has(base)) {
    const doorFacing =
      facing === 'up' || facing === 'down' ? DEFAULT_FLOOR_FACING : facing;
    return { half: 'lower', facing: doorFacing, open: false };
  }

  // Ladder: facing = opposite of wall we attach to (ladder faces outward)
  if (WALL_ATTACH_BLOCKS.has(base)) {
    const ladderFacing =
      facing === 'up' || facing === 'down' ? DEFAULT_FLOOR_FACING : facing;
    return { facing: ladderFacing };
  }

  return undefined;
}

/**
 * Build variant key string for blockStates lookup.
 * Format: "half=bottom,facing=north,type=floor"
 */
/** Canonical variant key (alphabetical by key, matches Minecraft blockstate format). */
export function blockStateToVariantKey(state: BlockState): string {
  const parts: string[] = [];
  if (state.facing) parts.push(`facing=${state.facing}`);
  if (state.half) parts.push(`half=${state.half}`);
  if (state.open !== undefined) parts.push(`open=${state.open}`);
  if (state.shape) parts.push(`shape=${state.shape}`);
  if (state.type) parts.push(`type=${state.type}`);
  return parts.join(',');
}

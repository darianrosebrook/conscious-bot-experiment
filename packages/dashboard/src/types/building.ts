/**
 * Building Designer Types
 *
 * Types for the 3D block builder tab — placing Minecraft blocks
 * in a grid canvas and sending them to Sterling's building solver.
 */

// ─── Primitives ──────────────────────────────────────────────────────────────

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Minecraft block state properties (subset relevant to placement). */
export interface BlockState {
  half?: 'top' | 'bottom' | 'lower' | 'upper';
  facing?: 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
  type?: 'floor' | 'wall' | 'single' | 'left' | 'right';
  open?: boolean;
  shape?: 'straight' | 'inner_left' | 'inner_right' | 'outer_left' | 'outer_right';
}

export interface PlacedBlock {
  position: Vec3;
  blockType: string; // e.g. 'cobblestone', 'oak_planks'
  /** Derived from placement context (face, floor). Optional for blocks that don't use it. */
  blockState?: BlockState;
}

export type BuildMode = 'place' | 'erase';

// ─── Block Categories ────────────────────────────────────────────────────────

export interface BlockCategory {
  id: string;
  label: string;
  blocks: string[];
}

export const BLOCK_CATEGORIES: BlockCategory[] = [
  {
    id: 'stone',
    label: 'Stone',
    blocks: [
      'cobblestone',
      'stone',
      'stone_bricks',
      'smooth_stone',
      'sandstone',
      'bricks',
      'mossy_cobblestone',
      'mossy_stone_bricks',
      'deepslate_bricks',
      'polished_deepslate',
      'andesite',
      'diorite',
      'granite',
      'prismarine',
      'nether_bricks',
      'quartz_block',
    ],
  },
  {
    id: 'wood',
    label: 'Wood',
    blocks: [
      'oak_planks',
      'spruce_planks',
      'birch_planks',
      'jungle_planks',
      'acacia_planks',
      'dark_oak_planks',
      'crimson_planks',
      'warped_planks',
      'oak_log',
      'spruce_log',
      'birch_log',
      'jungle_log',
      'stripped_oak_log',
      'stripped_spruce_log',
    ],
  },
  {
    id: 'glass',
    label: 'Glass',
    blocks: [
      'glass',
      'white_stained_glass',
      'light_blue_stained_glass',
      'blue_stained_glass',
      'red_stained_glass',
      'green_stained_glass',
      'yellow_stained_glass',
      'orange_stained_glass',
      'purple_stained_glass',
      'pink_stained_glass',
      'lime_stained_glass',
      'cyan_stained_glass',
    ],
  },
  {
    id: 'lighting',
    label: 'Lighting',
    blocks: [
      'torch',
      'soul_torch',
      'lantern',
      'soul_lantern',
      'glowstone',
      'sea_lantern',
      'redstone_lamp',
      'shroomlight',
      'jack_o_lantern',
      'candle',
    ],
  },
  {
    id: 'decoration',
    label: 'Decoration',
    blocks: [
      'bookshelf',
      'hay_block',
      'iron_block',
      'gold_block',
      'diamond_block',
      'emerald_block',
      'lapis_block',
      'redstone_block',
      'copper_block',
    ],
  },
  {
    id: 'stairs',
    label: 'Stairs',
    blocks: [
      'oak_stairs',
      'spruce_stairs',
      'birch_stairs',
      'jungle_stairs',
      'acacia_stairs',
      'dark_oak_stairs',
      'cobblestone_stairs',
      'stone_brick_stairs',
      'sandstone_stairs',
      'brick_stairs',
      'nether_brick_stairs',
      'quartz_stairs',
      'prismarine_stairs',
      'deepslate_brick_stairs',
    ],
  },
  {
    id: 'slabs',
    label: 'Slabs',
    blocks: [
      'oak_slab',
      'spruce_slab',
      'birch_slab',
      'jungle_slab',
      'acacia_slab',
      'dark_oak_slab',
      'cobblestone_slab',
      'stone_brick_slab',
      'sandstone_slab',
      'brick_slab',
      'nether_brick_slab',
      'quartz_slab',
      'smooth_stone_slab',
      'deepslate_brick_slab',
    ],
  },
  {
    id: 'doors',
    label: 'Doors',
    blocks: [
      'oak_door',
      'spruce_door',
      'birch_door',
      'jungle_door',
      'acacia_door',
      'dark_oak_door',
      'crimson_door',
      'warped_door',
      'iron_door',
      'oak_trapdoor',
      'spruce_trapdoor',
      'birch_trapdoor',
      'dark_oak_trapdoor',
      'iron_trapdoor',
      'ladder',
    ],
  },
  {
    id: 'workstations',
    label: 'Stations',
    blocks: [
      'crafting_table',
      'furnace',
      'blast_furnace',
      'smoker',
      'barrel',
      'anvil',
      'loom',
      'brewing_stand',
      'stonecutter',
      'cartography_table',
      'fletching_table',
      'smithing_table',
      'grindstone',
      'lectern',
      'composter',
      'cauldron',
    ],
  },
  {
    id: 'natural',
    label: 'Natural',
    blocks: [
      'dirt',
      'grass_block',
      'sand',
      'gravel',
      'clay',
      'snow_block',
      'ice',
      'packed_ice',
      'mud',
      'moss_block',
    ],
  },
];

/** Flat list of all available blocks across categories. */
export const ALL_BLOCKS = BLOCK_CATEGORIES.flatMap((c) => c.blocks);

/** Default block type for new placements. */
export const DEFAULT_BLOCK_TYPE = 'cobblestone';

/** Default grid dimensions (blocks). */
export const DEFAULT_GRID_SIZE: Vec3 = { x: 16, y: 16, z: 16 };

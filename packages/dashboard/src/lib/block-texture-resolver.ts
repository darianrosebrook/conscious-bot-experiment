/**
 * block-texture-resolver — Shared texture name resolution for Minecraft blocks
 *
 * Centralizes the resolveTextureName and TEXTURE_REMAP logic previously
 * duplicated in block-canvas.tsx and materials-picker.tsx.
 * Also provides per-face texture mapping for blocks with distinct
 * top/side/bottom textures (grass, logs, crafting table, etc.).
 */

// ─── Per-face texture interface ──────────────────────────────────────────────

export interface BlockFaceTextures {
  top: string;
  side: string;
  bottom: string;
}

// ─── Remap table ─────────────────────────────────────────────────────────────

/**
 * Stairs and slabs don't have their own texture files — they reuse
 * the base block's texture. This map resolves derived block names
 * to their texture source.
 */
const TEXTURE_REMAP: Record<string, string> = {
  // Stone variants (plural mismatch)
  stone_brick: 'stone_bricks',
  nether_brick: 'nether_bricks',
  deepslate_brick: 'deepslate_bricks',
  brick: 'bricks',
  quartz: 'quartz_block',
  prismarine: 'prismarine',
  sandstone: 'sandstone',
  smooth_stone: 'smooth_stone',
  // Wood planks — stairs/slabs strip to e.g. "oak", but file is "oak_planks.png"
  oak: 'oak_planks',
  spruce: 'spruce_planks',
  birch: 'birch_planks',
  jungle: 'jungle_planks',
  acacia: 'acacia_planks',
  dark_oak: 'dark_oak_planks',
  crimson: 'crimson_planks',
  warped: 'warped_planks',
};

// ─── Core resolver ───────────────────────────────────────────────────────────

/**
 * Resolve a block type name to its texture file name.
 * Strips _stairs/_slab suffixes and applies remap table.
 */
export function resolveTextureName(blockType: string): string {
  const base = blockType
    .replace(/_stairs$/, '')
    .replace(/_slab$/, '');

  if (blockType !== base) {
    return TEXTURE_REMAP[base] ?? base;
  }

  return blockType;
}

// ─── Per-face resolver ───────────────────────────────────────────────────────

/**
 * Resolve a block type to per-face texture names (top, side, bottom).
 * Handles blocks with distinct face textures like grass, logs, and
 * crafting tables. Falls back to uniform faces for simple blocks.
 */
export function resolveBlockTextures(blockType: string): BlockFaceTextures {
  // Grass block: green top, dirt+grass side, dirt bottom
  if (blockType === 'grass_block') {
    return { top: 'grass_block_top', side: 'grass_block_side', bottom: 'dirt' };
  }

  // Log blocks: rings on top/bottom, bark on sides
  const logMatch = blockType.match(/^(stripped_)?(\w+)_log$/);
  if (logMatch) {
    const prefix = logMatch[1] ?? '';
    const wood = logMatch[2];
    return {
      top: `${prefix}${wood}_log_top`,
      side: `${prefix}${wood}_log`,
      bottom: `${prefix}${wood}_log_top`,
    };
  }

  // Crafting table: distinct top, side, and bottom
  if (blockType === 'crafting_table') {
    return {
      top: 'crafting_table_top',
      side: 'crafting_table_side',
      bottom: 'oak_planks',
    };
  }

  // Furnace family: distinct front/top
  if (blockType === 'furnace') {
    return {
      top: 'furnace_top',
      side: 'furnace_front',
      bottom: 'furnace_top',
    };
  }

  if (blockType === 'blast_furnace') {
    return {
      top: 'blast_furnace_top',
      side: 'blast_furnace_front',
      bottom: 'blast_furnace_top',
    };
  }

  // TNT
  if (blockType === 'tnt') {
    return { top: 'tnt_top', side: 'tnt_side', bottom: 'tnt_bottom' };
  }

  // Vegetation: use grass_block_top (same as Live viewer when atlas has it).
  // Avoid grass/fern/tall_grass texture names until atlas-index is confirmed to include them.
  if (blockType === 'grass' || blockType === 'fern' || blockType === 'tall_grass') {
    return { top: 'grass_block_top', side: 'grass_block_side', bottom: 'grass_block_top' };
  }

  // Default: all faces use the same texture
  const tex = resolveTextureName(blockType);
  return { top: tex, side: tex, bottom: tex };
}

/** Return the URL for a block's primary texture thumbnail. */
export function getBlockTextureUrl(blockType: string): string {
  return `/block_textures/${resolveTextureName(blockType)}.png`;
}

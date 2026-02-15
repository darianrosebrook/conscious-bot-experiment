/**
 * Platform Terrain — procedural floor and vegetation for the block builder.
 *
 * Generates a floating platform: stone base, grass_block top, with grass,
 * fern, and tall_grass in a non-uniform oval band around the edge.
 * Used for visual context; not stored in the building store.
 *
 * @author @darianrosebrook
 */

import type { Vec3, BlockState } from '@/types/building';

export interface TerrainBlock {
  position: Vec3;
  blockType: string;
  blockState?: BlockState;
}

/** Seeded pseudo-random for deterministic vegetation placement */
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/** Check if (x,z) is inside ellipse centered at (cx, cz) with radii rx, rz */
function isInEllipse(x: number, z: number, cx: number, cz: number, rx: number, rz: number): boolean {
  if (rx <= 0 || rz <= 0) return false;
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return dx * dx + dz * dz <= 1;
}

/** Check if (x,z) is in the edge band: inside outer ellipse, outside inner ellipse */
function isInEdgeBand(
  x: number,
  z: number,
  cx: number,
  cz: number,
  innerRx: number,
  innerRz: number,
  outerRx: number,
  outerRz: number,
): boolean {
  return isInEllipse(x, z, cx, cz, outerRx, outerRz) && !isInEllipse(x, z, cx, cz, innerRx, innerRz);
}

/** Distance from center (normalized 0–1 at ellipse edge) */
function normalizedDist(x: number, z: number, cx: number, cz: number, rx: number, rz: number): number {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return Math.sqrt(dx * dx + dz * dz);
}

const VEGETATION_TYPES = ['grass', 'fern', 'tall_grass'] as const;

/**
 * Generate platform terrain blocks.
 *
 * The platform sits below the build grid: stone at y=-2, grass_block at y=-1,
 * vegetation at y=0/1. The grid and build area start at y=0 (on top of grass).
 * The ellipse extends past the grid edges so the platform looks like a natural
 * island that the build sits on.
 *
 * @param gridSize — x, z extent of the grid
 * @param seed — for reproducible vegetation placement
 */
export function generatePlatformTerrain(
  gridSize: Vec3,
  seed: number = 42,
): TerrainBlock[] {
  const blocks: TerrainBlock[] = [];

  // Platform extends 3 blocks past each edge so it's visible beyond the grid
  const pad = 3;
  const cx = (gridSize.x - 1) / 2;
  const cz = (gridSize.z - 1) / 2;
  const rx = Math.max(2, (gridSize.x + pad * 2) * 0.48);
  const rz = Math.max(2, (gridSize.z + pad * 2) * 0.48);

  const innerRx = rx * 0.7;
  const innerRz = rz * 0.7;
  const rnd = seededRandom(seed);

  // Scan wider area (pad beyond grid on each side)
  for (let x = -pad; x < gridSize.x + pad; x++) {
    for (let z = -pad; z < gridSize.z + pad; z++) {
      if (!isInEllipse(x + 0.5, z + 0.5, cx, cz, rx, rz)) continue;

      blocks.push({ position: { x, y: -2, z }, blockType: 'stone' });
      blocks.push({ position: { x, y: -1, z }, blockType: 'grass_block' });
    }
  }

  // Vegetation only on the edge band (outside grid area to avoid blocking builds)
  for (let x = -pad; x < gridSize.x + pad; x++) {
    for (let z = -pad; z < gridSize.z + pad; z++) {
      const px = x + 0.5;
      const pz = z + 0.5;
      if (!isInEdgeBand(px, pz, cx, cz, innerRx, innerRz, rx, rz)) continue;

      const dist = normalizedDist(px, pz, cx, cz, rx, rz);
      const density = 0.5 - dist * 0.3;
      if (rnd() > density) continue;

      const vegType = VEGETATION_TYPES[Math.floor(rnd() * VEGETATION_TYPES.length)];
      if (vegType === 'tall_grass') {
        blocks.push({ position: { x, y: 0, z }, blockType: 'tall_grass', blockState: { half: 'lower' } });
        blocks.push({ position: { x, y: 1, z }, blockType: 'tall_grass', blockState: { half: 'upper' } });
      } else {
        blocks.push({ position: { x, y: 0, z }, blockType: vegType });
      }
    }
  }

  return blocks;
}

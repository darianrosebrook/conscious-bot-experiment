/**
 * block-geometry-builder — Creates BoxGeometry with per-face atlas UVs
 *
 * Each block type maps to a cached geometry where UV coordinates point
 * to the correct atlas tile for each face (top, side, bottom).
 *
 * THREE.js BoxGeometry face order (4 vertices each):
 *   0-3:   +X (right side)
 *   4-7:   -X (left side)
 *   8-11:  +Y (top)
 *   12-15: -Y (bottom)
 *   16-19: +Z (front side)
 *   20-23: -Z (back side)
 */

import * as THREE from 'three';
import { resolveBlockTextures } from './block-texture-resolver';
import type { AtlasIndex, AtlasEntry } from '@/types/atlas';
import { buildBlockGeometryFromAssets } from './mc-asset-block-loader';
import type { BlockStatesData, BlockStateForVariant } from './mc-asset-block-loader';

// ─── Geometry cache ──────────────────────────────────────────────────────────

const geometryCache = new Map<string, THREE.BufferGeometry>();

/** Minecraft 16ths → block units (0–1). */
const S = (n: number) => n / 16;

/**
 * Torch: thin vertical stick (2×10×2 in 16ths) sitting on the floor.
 * Same shape for torch and soul_torch.
 */
function createTorchGeometry(
  blockType: string,
  atlasIndex: AtlasIndex,
): THREE.BufferGeometry {
  const cacheKey = blockType;
  const cached = geometryCache.get(cacheKey);
  if (cached) return cached;

  const w = S(2);
  const h = S(10);
  const d = S(2);
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, (h / 2) - 0.5, 0);

  applyAtlasUVs(geo, blockType, atlasIndex);
  geometryCache.set(cacheKey, geo);
  return geo;
}

/**
 * Lantern: small cage (6×7×6 in 16ths) sitting on the floor.
 * Same shape for lantern and soul_lantern.
 */
function createLanternGeometry(
  blockType: string,
  atlasIndex: AtlasIndex,
): THREE.BufferGeometry {
  const cacheKey = blockType;
  const cached = geometryCache.get(cacheKey);
  if (cached) return cached;

  const w = S(6);
  const h = S(7);
  const d = S(6);
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, (h / 2) - 0.5, 0);

  applyAtlasUVs(geo, blockType, atlasIndex);
  geometryCache.set(cacheKey, geo);
  return geo;
}

/** Default UV entry when atlas textures are empty (e.g. mc-assets path) */
const DEFAULT_ATLAS_ENTRY: AtlasEntry = {
  u: 0,
  v: 0,
  su: 0.0625,
  sv: 0.0625,
  col: 0,
  row: 0,
};

function applyAtlasUVs(
  geo: THREE.BufferGeometry,
  blockType: string,
  atlasIndex: AtlasIndex,
): void {
  const faces = resolveBlockTextures(blockType);
  const topEntry = atlasIndex.textures[faces.top];
  const sideEntry = atlasIndex.textures[faces.side];
  const bottomEntry = atlasIndex.textures[faces.bottom];
  const fallback =
    sideEntry ?? Object.values(atlasIndex.textures)[0] ?? DEFAULT_ATLAS_ENTRY;
  const top = topEntry ?? fallback;
  const side = sideEntry ?? fallback;
  const bottom = bottomEntry ?? fallback;

  const faceTextures: AtlasEntry[] = [
    side,
    side,
    top,
    bottom,
    side,
    side,
  ];

  const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute;
  const uvArray = uvAttr.array as Float32Array;

  for (let face = 0; face < 6; face++) {
    const entry = faceTextures[face] ?? DEFAULT_ATLAS_ENTRY;
    const baseIdx = face * 4 * 2;
    uvArray[baseIdx + 0] = entry.u;
    uvArray[baseIdx + 1] = entry.v;
    uvArray[baseIdx + 2] = entry.u + entry.su;
    uvArray[baseIdx + 3] = entry.v;
    uvArray[baseIdx + 4] = entry.u;
    uvArray[baseIdx + 5] = entry.v + entry.sv;
    uvArray[baseIdx + 6] = entry.u + entry.su;
    uvArray[baseIdx + 7] = entry.v + entry.sv;
  }
  uvAttr.needsUpdate = true;

  const colorArray = new Float32Array(24 * 3);
  colorArray.fill(1.0);
  geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
}

/** Cache key for geometry with optional block state. */
function geometryCacheKey(blockType: string, blockState?: BlockStateForVariant | null): string {
  if (!blockState || Object.keys(blockState).length === 0) return blockType;
  const parts = [blockType, ...Object.entries(blockState).map(([k, v]) => `${k}=${v}`)];
  return parts.join('|');
}

/**
 * Create (or return cached) geometry with UV coordinates mapped
 * to the atlas for the given block type's per-face textures.
 * When blockStates is available (from asset pipeline), uses Minecraft
 * models for correct shapes (torch, lantern, stairs, slabs, etc.).
 * blockState selects the variant (half, facing, type) for directional blocks.
 */
export function createBlockGeometry(
  blockType: string,
  atlasIndex: AtlasIndex,
  blockStates?: BlockStatesData | null,
  blockState?: BlockStateForVariant | null,
): THREE.BufferGeometry {
  const cacheKey = geometryCacheKey(blockType, blockState);
  const cached = geometryCache.get(cacheKey);
  if (cached) return cached;

  // Prefer asset pipeline models (same as viewer)
  if (blockStates) {
    const mcGeo = buildBlockGeometryFromAssets(blockType, blockStates, blockState);
    if (mcGeo) {
      geometryCache.set(cacheKey, mcGeo);
      return mcGeo;
    }
  }

  // Fallback: hardcoded torch/lantern or full cube
  if (blockType === 'torch' || blockType === 'soul_torch') {
    return createTorchGeometry(blockType, atlasIndex);
  }
  if (blockType === 'lantern' || blockType === 'soul_lantern') {
    return createLanternGeometry(blockType, atlasIndex);
  }

  const geo = new THREE.BoxGeometry(1, 1, 1);
  applyAtlasUVs(geo, blockType, atlasIndex);
  geometryCache.set(cacheKey, geo);
  return geo;
}

/** Clear the geometry cache (useful for hot reload). */
export function clearGeometryCache(): void {
  for (const geo of geometryCache.values()) geo.dispose();
  geometryCache.clear();
}

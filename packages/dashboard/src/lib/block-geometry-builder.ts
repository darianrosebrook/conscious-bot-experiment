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

// ─── Geometry cache ──────────────────────────────────────────────────────────

const geometryCache = new Map<string, THREE.BufferGeometry>();

/**
 * Create (or return cached) BoxGeometry with UV coordinates mapped
 * to the atlas for the given block type's per-face textures.
 */
export function createBlockGeometry(
  blockType: string,
  atlasIndex: AtlasIndex,
): THREE.BufferGeometry {
  const cacheKey = blockType;
  const cached = geometryCache.get(cacheKey);
  if (cached) return cached;

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute;
  const uvArray = uvAttr.array as Float32Array;

  const faces = resolveBlockTextures(blockType);

  // Look up atlas entries, falling back to the base texture name
  const topEntry = atlasIndex.textures[faces.top];
  const sideEntry = atlasIndex.textures[faces.side];
  const bottomEntry = atlasIndex.textures[faces.bottom];

  // Fallback: if a per-face texture isn't in the atlas, use the side texture
  const fallback = sideEntry ?? Object.values(atlasIndex.textures)[0];
  const top = topEntry ?? fallback;
  const side = sideEntry ?? fallback;
  const bottom = bottomEntry ?? fallback;

  // Map face indices to atlas entries
  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
  const faceTextures: AtlasEntry[] = [
    side,   // +X (right)
    side,   // -X (left)
    top,    // +Y (top)
    bottom, // -Y (bottom)
    side,   // +Z (front)
    side,   // -Z (back)
  ];

  // Each face has 4 vertices, each vertex has 2 UV coords
  // Default BoxGeometry UVs are [0,1], [1,1], [0,0], [1,0] per face
  for (let face = 0; face < 6; face++) {
    const entry = faceTextures[face];
    const baseIdx = face * 4 * 2; // 4 vertices × 2 components

    // Map the standard [0,1] UV range to the atlas tile's UV range
    // Vertex 0: (0,1) → (u, v)
    // Vertex 1: (1,1) → (u + su, v)
    // Vertex 2: (0,0) → (u, v + sv)
    // Vertex 3: (1,0) → (u + su, v + sv)
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

  // Initialize vertex colors to white (will be modified by AO)
  const colorArray = new Float32Array(24 * 3); // 24 vertices × RGB
  colorArray.fill(1.0);
  geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

  geometryCache.set(cacheKey, geo);
  return geo;
}

/** Clear the geometry cache (useful for hot reload). */
export function clearGeometryCache(): void {
  for (const geo of geometryCache.values()) geo.dispose();
  geometryCache.clear();
}

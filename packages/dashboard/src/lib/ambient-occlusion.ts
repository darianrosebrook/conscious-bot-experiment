/**
 * ambient-occlusion — Baked vertex-color AO for block meshes
 *
 * Simplified version of the viewer's corner-based AO algorithm.
 * For each of 8 cube corners, checks 3 diagonal neighbors in the
 * blockIndex Set. More occluded corners get darker vertex colors,
 * creating natural shadow effects where blocks meet.
 *
 * AO factor range: 0.5 (fully occluded) to 1.0 (fully open)
 */

import type { Vec3 } from '@/types/building';

// ─── Corner definitions ──────────────────────────────────────────────────────

/**
 * Each corner of a unit cube has 3 adjacent neighbor offsets that
 * could occlude it. These are the 3 diagonal directions from each corner.
 *
 * Corner index matches THREE.js BoxGeometry vertex ordering:
 * Corners 0-7 map to the 8 vertices of the cube, and each corner
 * is shared by 3 faces (3 vertices in the geometry).
 */
const CORNER_OFFSETS: Array<{ dx: number; dy: number; dz: number }[]> = [
  // Corner 0: +X +Y +Z
  [{ dx: 1, dy: 0, dz: 0 }, { dx: 0, dy: 1, dz: 0 }, { dx: 0, dy: 0, dz: 1 }],
  // Corner 1: -X +Y +Z
  [{ dx: -1, dy: 0, dz: 0 }, { dx: 0, dy: 1, dz: 0 }, { dx: 0, dy: 0, dz: 1 }],
  // Corner 2: +X -Y +Z
  [{ dx: 1, dy: 0, dz: 0 }, { dx: 0, dy: -1, dz: 0 }, { dx: 0, dy: 0, dz: 1 }],
  // Corner 3: -X -Y +Z
  [{ dx: -1, dy: 0, dz: 0 }, { dx: 0, dy: -1, dz: 0 }, { dx: 0, dy: 0, dz: 1 }],
  // Corner 4: +X +Y -Z
  [{ dx: 1, dy: 0, dz: 0 }, { dx: 0, dy: 1, dz: 0 }, { dx: 0, dy: 0, dz: -1 }],
  // Corner 5: -X +Y -Z
  [{ dx: -1, dy: 0, dz: 0 }, { dx: 0, dy: 1, dz: 0 }, { dx: 0, dy: 0, dz: -1 }],
  // Corner 6: +X -Y -Z
  [{ dx: 1, dy: 0, dz: 0 }, { dx: 0, dy: -1, dz: 0 }, { dx: 0, dy: 0, dz: -1 }],
  // Corner 7: -X -Y -Z
  [{ dx: -1, dy: 0, dz: 0 }, { dx: 0, dy: -1, dz: 0 }, { dx: 0, dy: 0, dz: -1 }],
];

/**
 * Maps each of 24 BoxGeometry vertices to one of 8 cube corners.
 *
 * BoxGeometry face order: +X(0-3), -X(4-7), +Y(8-11), -Y(12-15), +Z(16-19), -Z(20-23)
 * Within each face, vertices are ordered: (+u,+v), (-u,+v), (+u,-v), (-u,-v)
 */
const VERTEX_TO_CORNER: number[] = [
  // +X face: corners with +X
  0, 4, 2, 6,   // +X+Y+Z, +X+Y-Z, +X-Y+Z, +X-Y-Z
  // -X face: corners with -X
  5, 1, 7, 3,   // -X+Y-Z, -X+Y+Z, -X-Y-Z, -X-Y+Z
  // +Y face: corners with +Y
  5, 4, 1, 0,   // -X+Y-Z, +X+Y-Z, -X+Y+Z, +X+Y+Z
  // -Y face: corners with -Y
  3, 2, 7, 6,   // -X-Y+Z, +X-Y+Z, -X-Y-Z, +X-Y-Z
  // +Z face: corners with +Z
  1, 0, 3, 2,   // -X+Y+Z, +X+Y+Z, -X-Y+Z, +X-Y+Z
  // -Z face: corners with -Z
  4, 5, 6, 7,   // +X+Y-Z, -X+Y-Z, +X-Y-Z, -X-Y-Z
];

// ─── AO computation ──────────────────────────────────────────────────────────

/**
 * Compute baked AO vertex colors for a block at the given position.
 *
 * @param position Block position in the grid
 * @param blockIndex Set of "x,y,z" position keys for occupied blocks
 * @returns Float32Array of 24×3 vertex color values (RGB, range 0.5–1.0)
 */
export function bakeBlockAO(position: Vec3, blockIndex: Set<string>): Float32Array {
  const colors = new Float32Array(24 * 3);
  const { x, y, z } = position;

  // Compute AO factor for each of the 8 corners
  const cornerAO = new Float32Array(8);
  for (let c = 0; c < 8; c++) {
    const neighbors = CORNER_OFFSETS[c];
    let occluded = 0;
    for (const { dx, dy, dz } of neighbors) {
      if (blockIndex.has(`${x + dx},${y + dy},${z + dz}`)) {
        occluded++;
      }
    }
    // Also check the diagonal neighbor
    const diag = neighbors.reduce(
      (acc, n) => ({ dx: acc.dx + n.dx, dy: acc.dy + n.dy, dz: acc.dz + n.dz }),
      { dx: 0, dy: 0, dz: 0 },
    );
    if (blockIndex.has(`${x + diag.dx},${y + diag.dy},${z + diag.dz}`)) {
      occluded++;
    }

    // AO factor: 0.5 (fully occluded) to 1.0 (fully open)
    const openSides = 4 - occluded;
    cornerAO[c] = 0.5 + (openSides / 4) * 0.5;
  }

  // Map corner AO to vertex colors
  for (let v = 0; v < 24; v++) {
    const corner = VERTEX_TO_CORNER[v];
    const ao = cornerAO[corner];
    colors[v * 3 + 0] = ao; // R
    colors[v * 3 + 1] = ao; // G
    colors[v * 3 + 2] = ao; // B
  }

  return colors;
}

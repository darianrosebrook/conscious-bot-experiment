/**
 * P08 Reference Adapter — Portable Systems Synthesis Implementation
 *
 * Satisfies all 5 P08 invariants:
 *   1. deterministic_evaluation — same design + spec = same result
 *   2. bounded_design           — node count capped at MAX_DESIGN_NODES
 *   3. symmetry_canonicalization — rotations produce same hash
 *   4. spec_predicate            — evaluation returns boolean, not metrics
 *   5. bounded_motifs            — motif library capped at MAX_MOTIFS
 *
 * Zero Minecraft imports. Zero vitest imports.
 */

import type {
  P08BehavioralSpecV1,
  P08DesignOperatorV1,
  P08DesignStateV1,
  P08GridCellV1,
  P08MotifV1,
  P08SpecResultV1,
  P08SynthesisAdapter,
} from './p08-capsule-types.js';
import { MAX_DESIGN_NODES, MAX_MOTIFS } from './p08-capsule-types.js';

export class P08ReferenceAdapter implements P08SynthesisAdapter {
  readonly maxDesignNodes = MAX_DESIGN_NODES;
  readonly maxMotifs = MAX_MOTIFS;

  createEmptyDesign(width: number, depth: number): P08DesignStateV1 {
    return {
      width,
      depth,
      cells: {},
      nodeCount: 0,
    };
  }

  applyOperator(
    design: P08DesignStateV1,
    operator: P08DesignOperatorV1,
    x: number,
    z: number,
  ): P08DesignStateV1 | null {
    // Pivot 2: enforce MAX_DESIGN_NODES
    if (design.nodeCount >= MAX_DESIGN_NODES) return null;

    // Enforce footprint bounds
    if (x < 0 || x >= design.width || z < 0 || z >= design.depth) return null;

    const key = `${x},${z}`;
    const cell: P08GridCellV1 = { x, z, cellType: operator.cellType };

    const alreadyOccupied = key in design.cells;
    const newCells = { ...design.cells, [key]: cell };

    return {
      width: design.width,
      depth: design.depth,
      cells: newCells,
      nodeCount: alreadyOccupied ? design.nodeCount : design.nodeCount + 1,
    };
  }

  evaluateSpec(
    design: P08DesignStateV1,
    spec: P08BehavioralSpecV1,
  ): P08SpecResultV1 {
    const violations: string[] = [];
    const metrics: Record<string, number> = {};

    // Count cells by type
    const typeCounts: Record<string, number> = {};
    for (const cell of Object.values(design.cells)) {
      typeCounts[cell.cellType] = (typeCounts[cell.cellType] || 0) + 1;
    }

    // Check each spec param: param name maps to a minimum count for that cell type
    for (const [paramName, minValue] of Object.entries(spec.params)) {
      const actual = typeCounts[paramName] ?? 0;
      metrics[paramName] = actual;
      if (actual < minValue) {
        violations.push(
          `${paramName}: ${actual} < required ${minValue}`,
        );
      }
    }

    // Check coverage: ratio of occupied cells to total grid
    const totalCells = design.width * design.depth;
    const coverage = totalCells > 0 ? design.nodeCount / totalCells : 0;
    metrics['coverage'] = coverage;

    // Check footprint bounds
    if (
      design.width > spec.maxFootprint.width ||
      design.depth > spec.maxFootprint.depth
    ) {
      violations.push(
        `Footprint ${design.width}x${design.depth} exceeds max ${spec.maxFootprint.width}x${spec.maxFootprint.depth}`,
      );
    }

    // Pivot 4: spec is a boolean predicate
    return {
      satisfied: violations.length === 0,
      violations,
      metrics,
    };
  }

  hashDesign(design: P08DesignStateV1): string {
    // Pivot 3: canonicalize for symmetry by choosing smallest hash
    // among all 4 rotations
    const rotations = [
      this._sortedCellString(design),
      this._sortedCellString(this._rotate90(design)),
      this._sortedCellString(this._rotate90(this._rotate90(design))),
      this._sortedCellString(
        this._rotate90(this._rotate90(this._rotate90(design))),
      ),
    ];
    rotations.sort();
    return simpleHash(rotations[0]);
  }

  extractMotif(
    design: P08DesignStateV1,
    regionX: number,
    regionZ: number,
    regionWidth: number,
    regionDepth: number,
  ): P08MotifV1 {
    const pattern: P08GridCellV1[] = [];

    for (const cell of Object.values(design.cells)) {
      if (
        cell.x >= regionX &&
        cell.x < regionX + regionWidth &&
        cell.z >= regionZ &&
        cell.z < regionZ + regionDepth
      ) {
        // Store as relative coordinates
        pattern.push({
          x: cell.x - regionX,
          z: cell.z - regionZ,
          cellType: cell.cellType,
        });
      }
    }

    // Sort for deterministic hashing
    pattern.sort((a, b) => {
      if (a.x !== b.x) return a.x - b.x;
      if (a.z !== b.z) return a.z - b.z;
      return a.cellType.localeCompare(b.cellType);
    });

    const patternStr = pattern
      .map((c) => `${c.x},${c.z}:${c.cellType}`)
      .join('|');
    const id = simpleHash(patternStr);

    return {
      id,
      name: `Motif-${id.slice(0, 6)}`,
      pattern,
      successCount: 1,
    };
  }

  instantiateMotif(
    design: P08DesignStateV1,
    motif: P08MotifV1,
    offsetX: number,
    offsetZ: number,
  ): P08DesignStateV1 | null {
    // Check if adding all motif cells would exceed bounds
    let newNodeCount = design.nodeCount;
    const newCells = { ...design.cells };

    for (const cell of motif.pattern) {
      const absX = cell.x + offsetX;
      const absZ = cell.z + offsetZ;

      // Enforce footprint
      if (absX < 0 || absX >= design.width || absZ < 0 || absZ >= design.depth)
        return null;

      const key = `${absX},${absZ}`;
      if (!(key in newCells)) {
        newNodeCount++;
        // Pivot 2: enforce MAX_DESIGN_NODES
        if (newNodeCount > MAX_DESIGN_NODES) return null;
      }
      newCells[key] = { x: absX, z: absZ, cellType: cell.cellType };
    }

    return {
      width: design.width,
      depth: design.depth,
      cells: newCells,
      nodeCount: newNodeCount,
    };
  }

  // -- Internal helpers (not part of adapter interface) --------------------

  /** Rotate a design 90 degrees clockwise. */
  private _rotate90(design: P08DesignStateV1): P08DesignStateV1 {
    const rotatedCells: Record<string, P08GridCellV1> = {};
    for (const cell of Object.values(design.cells)) {
      // 90° clockwise: (x, z) → (depth - 1 - z, x)
      const newX = design.depth - 1 - cell.z;
      const newZ = cell.x;
      const key = `${newX},${newZ}`;
      rotatedCells[key] = { x: newX, z: newZ, cellType: cell.cellType };
    }
    return {
      width: design.depth,
      depth: design.width,
      cells: rotatedCells,
      nodeCount: design.nodeCount,
    };
  }

  /** Produce a sorted string representation of all cells for hashing. */
  private _sortedCellString(design: P08DesignStateV1): string {
    return Object.entries(design.cells)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v.cellType}`)
      .join('|');
  }
}

/**
 * Simple deterministic hash function (no crypto dependency).
 * Uses FNV-1a 32-bit hash, returns hex string.
 */
function simpleHash(input: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) | 0; // FNV prime, force 32-bit
  }
  // Convert to unsigned and return as hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

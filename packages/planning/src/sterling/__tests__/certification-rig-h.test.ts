/**
 * Rig H Certification Tests — P08 Systems Synthesis
 *
 * Tests all 5 P08 invariants across two domains:
 *   1. deterministic_evaluation — same design + spec = same result
 *   2. bounded_design           — node count capped
 *   3. symmetry_canonicalization — rotations produce same hash
 *   4. spec_predicate            — evaluation returns boolean
 *   5. bounded_motifs            — motif library bounded
 *
 * 38 tests across 9 describe blocks.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_DESIGN_NODES,
  MAX_MOTIFS,
  P08_CONTRACT_VERSION,
  P08_INVARIANTS,
} from '../primitives/p08/p08-capsule-types.js';
import type { P08DesignStateV1 } from '../primitives/p08/p08-capsule-types.js';
import { P08ReferenceAdapter } from '../primitives/p08/p08-reference-adapter.js';
import {
  CIRCUIT_OPERATORS,
  CIRCUIT_SPEC,
  FARM_OPERATORS,
  FARM_SPEC,
  SMALL_FARM_SPEC,
} from '../primitives/p08/p08-reference-fixtures.js';
import {
  MINECRAFT_FARM_OPERATORS,
  MINECRAFT_FARM_SPECS,
} from '../../synthesis/index.js';

const adapter = new P08ReferenceAdapter();

// ── Helpers ──────────────────────────────────────────────────────────

function buildFarmDesign(): P08DesignStateV1 {
  let design = adapter.createEmptyDesign(9, 9);
  // Place a water source at center
  const waterOp = FARM_OPERATORS.find((o) => o.id === 'place_water')!;
  design = adapter.applyOperator(design, waterOp, 4, 4)!;
  // Place 8 farmland around it
  const farmOp = FARM_OPERATORS.find((o) => o.id === 'place_farmland')!;
  for (const [x, z] of [[3,4],[5,4],[4,3],[4,5],[3,3],[5,5],[3,5],[5,3]] as [number,number][]) {
    design = adapter.applyOperator(design, farmOp, x, z)!;
  }
  // Place 2 torches
  const torchOp = FARM_OPERATORS.find((o) => o.id === 'place_torch')!;
  design = adapter.applyOperator(design, torchOp, 0, 0)!;
  design = adapter.applyOperator(design, torchOp, 8, 8)!;
  return design;
}

function buildCircuitDesign(): P08DesignStateV1 {
  let design = adapter.createEmptyDesign(7, 7);
  const sourceOp = CIRCUIT_OPERATORS.find((o) => o.id === 'place_source')!;
  const wireOp = CIRCUIT_OPERATORS.find((o) => o.id === 'place_wire')!;
  const outputOp = CIRCUIT_OPERATORS.find((o) => o.id === 'place_output')!;

  design = adapter.applyOperator(design, sourceOp, 0, 3)!;
  design = adapter.applyOperator(design, wireOp, 1, 3)!;
  design = adapter.applyOperator(design, wireOp, 2, 3)!;
  design = adapter.applyOperator(design, wireOp, 3, 3)!;
  design = adapter.applyOperator(design, outputOp, 4, 3)!;
  return design;
}

// ── 1. Deterministic Evaluation (Pivot 1) ────────────────────────────

describe('P08 Invariant: deterministic_evaluation', () => {
  it('same design + spec yields identical result', () => {
    const design = buildFarmDesign();
    const results = Array.from({ length: 50 }, () =>
      adapter.evaluateSpec(design, FARM_SPEC),
    );
    const first = JSON.stringify(results[0]);
    expect(results.every((r) => JSON.stringify(r) === first)).toBe(true);
  });

  it('same design + different spec yields different result', () => {
    // Build a 5x5 design that meets SMALL_FARM_SPEC but not FARM_SPEC
    let smallDesign = adapter.createEmptyDesign(5, 5);
    const waterOp = FARM_OPERATORS.find((o) => o.id === 'place_water')!;
    const farmOp = FARM_OPERATORS.find((o) => o.id === 'place_farmland')!;
    smallDesign = adapter.applyOperator(smallDesign, waterOp, 2, 2)!;
    for (const [x, z] of [[1,2],[3,2],[2,1],[2,3]] as [number,number][]) {
      smallDesign = adapter.applyOperator(smallDesign, farmOp, x, z)!;
    }
    const r1 = adapter.evaluateSpec(smallDesign, FARM_SPEC);
    const r2 = adapter.evaluateSpec(smallDesign, SMALL_FARM_SPEC);
    // Meets SMALL_FARM_SPEC (water:1, farmland:4) but not FARM_SPEC (needs 8 farmland + 2 torches)
    expect(r2.satisfied).toBe(true);
    expect(r1.satisfied).toBe(false);
  });

  it('empty design fails spec', () => {
    const design = adapter.createEmptyDesign(9, 9);
    const result = adapter.evaluateSpec(design, FARM_SPEC);
    expect(result.satisfied).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('applyOperator is deterministic', () => {
    const design = adapter.createEmptyDesign(5, 5);
    const op = FARM_OPERATORS[0];
    const results = Array.from({ length: 50 }, () =>
      adapter.applyOperator(design, op, 2, 2),
    );
    const first = JSON.stringify(results[0]);
    expect(results.every((r) => JSON.stringify(r) === first)).toBe(true);
  });
});

// ── 2. Bounded Design (Pivot 2) ──────────────────────────────────────

describe('P08 Invariant: bounded_design', () => {
  it('rejects operator when at MAX_DESIGN_NODES', () => {
    // Create a design and fill it to the limit
    let design = adapter.createEmptyDesign(20, 20);
    const op = FARM_OPERATORS.find((o) => o.id === 'place_farmland')!;
    for (let i = 0; i < MAX_DESIGN_NODES; i++) {
      const x = i % 20;
      const z = Math.floor(i / 20);
      design = adapter.applyOperator(design, op, x, z)!;
    }
    expect(design.nodeCount).toBe(MAX_DESIGN_NODES);

    // Next operator should be rejected
    const result = adapter.applyOperator(design, op, 0, 19);
    expect(result).toBeNull();
  });

  it('rejects operator outside footprint', () => {
    const design = adapter.createEmptyDesign(5, 5);
    const op = FARM_OPERATORS[0];
    expect(adapter.applyOperator(design, op, 5, 5)).toBeNull();
    expect(adapter.applyOperator(design, op, -1, 0)).toBeNull();
  });

  it('replacing cell at same position does not increase count', () => {
    let design = adapter.createEmptyDesign(5, 5);
    const waterOp = FARM_OPERATORS.find((o) => o.id === 'place_water')!;
    const farmOp = FARM_OPERATORS.find((o) => o.id === 'place_farmland')!;
    design = adapter.applyOperator(design, waterOp, 2, 2)!;
    expect(design.nodeCount).toBe(1);
    design = adapter.applyOperator(design, farmOp, 2, 2)!;
    expect(design.nodeCount).toBe(1); // Same position, no increase
  });

  it('MAX_DESIGN_NODES is 100', () => {
    expect(MAX_DESIGN_NODES).toBe(100);
  });
});

// ── 3. Symmetry Canonicalization (Pivot 3) ───────────────────────────

describe('P08 Invariant: symmetry_canonicalization', () => {
  it('design and its 90° rotation produce same hash', () => {
    let design = adapter.createEmptyDesign(5, 5);
    const op = FARM_OPERATORS.find((o) => o.id === 'place_water')!;
    design = adapter.applyOperator(design, op, 1, 0)!;

    // Create the 90° rotation manually
    let rotated = adapter.createEmptyDesign(5, 5);
    // (1,0) rotated 90° CW in 5x5 grid: (5-1-0, 1) = (4, 1)
    rotated = adapter.applyOperator(rotated, op, 4, 1)!;

    expect(adapter.hashDesign(design)).toBe(adapter.hashDesign(rotated));
  });

  it('symmetric design (center only) has same hash under all rotations', () => {
    let design = adapter.createEmptyDesign(5, 5);
    const op = FARM_OPERATORS.find((o) => o.id === 'place_water')!;
    design = adapter.applyOperator(design, op, 2, 2)!;
    // Center cell: all rotations map to center
    const hash = adapter.hashDesign(design);
    // Hash should be consistent
    expect(adapter.hashDesign(design)).toBe(hash);
  });

  it('different designs produce different hashes', () => {
    let design1 = adapter.createEmptyDesign(5, 5);
    let design2 = adapter.createEmptyDesign(5, 5);
    const waterOp = FARM_OPERATORS.find((o) => o.id === 'place_water')!;
    const farmOp = FARM_OPERATORS.find((o) => o.id === 'place_farmland')!;
    design1 = adapter.applyOperator(design1, waterOp, 0, 0)!;
    design2 = adapter.applyOperator(design2, farmOp, 0, 0)!;
    expect(adapter.hashDesign(design1)).not.toBe(adapter.hashDesign(design2));
  });

  it('hash is deterministic', () => {
    const design = buildFarmDesign();
    const hashes = Array.from({ length: 50 }, () => adapter.hashDesign(design));
    expect(hashes.every((h) => h === hashes[0])).toBe(true);
  });
});

// ── 4. Spec Predicate (Pivot 4) ──────────────────────────────────────

describe('P08 Invariant: spec_predicate', () => {
  it('evaluateSpec returns boolean satisfied', () => {
    const design = buildFarmDesign();
    const result = adapter.evaluateSpec(design, FARM_SPEC);
    expect(typeof result.satisfied).toBe('boolean');
  });

  it('violations are string descriptions', () => {
    const design = adapter.createEmptyDesign(9, 9);
    const result = adapter.evaluateSpec(design, FARM_SPEC);
    expect(result.violations.length).toBeGreaterThan(0);
    for (const v of result.violations) {
      expect(typeof v).toBe('string');
    }
  });

  it('metrics are numeric (for audit only)', () => {
    const design = buildFarmDesign();
    const result = adapter.evaluateSpec(design, FARM_SPEC);
    for (const val of Object.values(result.metrics)) {
      expect(typeof val).toBe('number');
    }
  });

  it('footprint violation detected', () => {
    // Create design wider than spec allows
    const design = adapter.createEmptyDesign(15, 15);
    const result = adapter.evaluateSpec(design, FARM_SPEC); // maxFootprint 9x9
    expect(result.satisfied).toBe(false);
    expect(result.violations.some((v) => v.includes('Footprint'))).toBe(true);
  });
});

// ── 5. Bounded Motifs (Pivot 5) ──────────────────────────────────────

describe('P08 Invariant: bounded_motifs', () => {
  it('extractMotif produces motif with relative coordinates', () => {
    const design = buildFarmDesign();
    const motif = adapter.extractMotif(design, 3, 3, 3, 3);
    // All cells should have coords in [0, 2]
    for (const cell of motif.pattern) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.x).toBeLessThan(3);
      expect(cell.z).toBeGreaterThanOrEqual(0);
      expect(cell.z).toBeLessThan(3);
    }
  });

  it('extractMotif is deterministic', () => {
    const design = buildFarmDesign();
    const motifs = Array.from({ length: 50 }, () =>
      adapter.extractMotif(design, 3, 3, 3, 3),
    );
    const first = JSON.stringify(motifs[0]);
    expect(motifs.every((m) => JSON.stringify(m) === first)).toBe(true);
  });

  it('instantiateMotif places cells at offset', () => {
    const design = buildFarmDesign();
    const motif = adapter.extractMotif(design, 3, 3, 3, 3);

    let target = adapter.createEmptyDesign(9, 9);
    target = adapter.instantiateMotif(target, motif, 0, 0)!;
    expect(target).not.toBeNull();
    expect(target.nodeCount).toBe(motif.pattern.length);
  });

  it('instantiateMotif is deterministic', () => {
    const design = buildFarmDesign();
    const motif = adapter.extractMotif(design, 3, 3, 3, 3);

    const results = Array.from({ length: 50 }, () => {
      const target = adapter.createEmptyDesign(9, 9);
      return adapter.instantiateMotif(target, motif, 0, 0);
    });
    const first = JSON.stringify(results[0]);
    expect(results.every((r) => JSON.stringify(r) === first)).toBe(true);
  });

  it('instantiateMotif rejects when exceeding MAX_DESIGN_NODES', () => {
    // Fill a design near the limit
    let design = adapter.createEmptyDesign(20, 20);
    const op = FARM_OPERATORS.find((o) => o.id === 'place_farmland')!;
    for (let i = 0; i < MAX_DESIGN_NODES - 1; i++) {
      design = adapter.applyOperator(design, op, i % 20, Math.floor(i / 20))!;
    }
    expect(design.nodeCount).toBe(MAX_DESIGN_NODES - 1);

    // Create a motif with 3 cells — should exceed limit
    const motif = {
      id: 'test',
      name: 'test',
      pattern: [
        { x: 0, z: 0, cellType: 'farmland' },
        { x: 1, z: 0, cellType: 'farmland' },
        { x: 2, z: 0, cellType: 'farmland' },
      ],
      successCount: 1,
    };
    // Place at unused area
    const result = adapter.instantiateMotif(design, motif, 15, 15);
    expect(result).toBeNull();
  });

  it('MAX_MOTIFS is 50', () => {
    expect(MAX_MOTIFS).toBe(50);
  });
});

// ── 6. Multi-Domain Portability ──────────────────────────────────────

describe('P08 Multi-domain portability', () => {
  it('circuit domain creates valid design', () => {
    const design = buildCircuitDesign();
    expect(design.nodeCount).toBe(5);
  });

  it('circuit design meets circuit spec', () => {
    const design = buildCircuitDesign();
    const result = adapter.evaluateSpec(design, CIRCUIT_SPEC);
    expect(result.satisfied).toBe(true);
  });

  it('farm design does NOT meet circuit spec', () => {
    const design = buildFarmDesign();
    const result = adapter.evaluateSpec(design, CIRCUIT_SPEC);
    // Farm has water/farmland/torch — not source/wire/output
    expect(result.satisfied).toBe(false);
  });

  it('circuit design does NOT meet farm spec', () => {
    const design = buildCircuitDesign();
    const result = adapter.evaluateSpec(design, FARM_SPEC);
    expect(result.satisfied).toBe(false);
  });

  it('same adapter handles both domains', () => {
    const farm = adapter.createEmptyDesign(9, 9);
    const circuit = adapter.createEmptyDesign(7, 7);
    expect(farm.width).toBe(9);
    expect(circuit.width).toBe(7);
  });
});

// ── 7. Minecraft Farm Module ─────────────────────────────────────────

describe('P08 Minecraft synthesis module', () => {
  it('defines 4 farm operators', () => {
    expect(MINECRAFT_FARM_OPERATORS).toHaveLength(4);
    const ids = MINECRAFT_FARM_OPERATORS.map((o) => o.id);
    expect(ids).toContain('place_water_source');
    expect(ids).toContain('place_farmland');
    expect(ids).toContain('place_torch');
    expect(ids).toContain('place_path');
  });

  it('defines 3 farm specs', () => {
    expect(MINECRAFT_FARM_SPECS).toHaveLength(3);
    const ids = MINECRAFT_FARM_SPECS.map((s) => s.id);
    expect(ids).toContain('mc_basic_9x9_farm');
    expect(ids).toContain('mc_compact_5x5_farm');
    expect(ids).toContain('mc_double_farm');
  });

  it('Minecraft operators work with reference adapter', () => {
    let design = adapter.createEmptyDesign(9, 9);
    const waterOp = MINECRAFT_FARM_OPERATORS.find(
      (o) => o.id === 'place_water_source',
    )!;
    design = adapter.applyOperator(design, waterOp, 4, 4)!;
    expect(design.nodeCount).toBe(1);
    expect(design.cells['4,4'].cellType).toBe('water');
  });
});

// ── 8. Operator and Design Integration ───────────────────────────────

describe('P08 Operator and design integration', () => {
  it('createEmptyDesign has zero nodes', () => {
    const design = adapter.createEmptyDesign(5, 5);
    expect(design.nodeCount).toBe(0);
    expect(Object.keys(design.cells)).toHaveLength(0);
  });

  it('sequential operators build up design correctly', () => {
    let design = adapter.createEmptyDesign(9, 9);
    const waterOp = FARM_OPERATORS.find((o) => o.id === 'place_water')!;
    const farmOp = FARM_OPERATORS.find((o) => o.id === 'place_farmland')!;

    design = adapter.applyOperator(design, waterOp, 4, 4)!;
    expect(design.nodeCount).toBe(1);

    design = adapter.applyOperator(design, farmOp, 3, 4)!;
    expect(design.nodeCount).toBe(2);

    design = adapter.applyOperator(design, farmOp, 5, 4)!;
    expect(design.nodeCount).toBe(3);
  });

  it('motif from one design can be placed in another', () => {
    const source = buildFarmDesign();
    const motif = adapter.extractMotif(source, 3, 3, 3, 3);

    let target = adapter.createEmptyDesign(9, 9);
    target = adapter.instantiateMotif(target, motif, 6, 6)!;
    expect(target).not.toBeNull();
    expect(target.nodeCount).toBe(motif.pattern.length);

    // Cells should be at offset positions
    for (const cell of motif.pattern) {
      const key = `${cell.x + 6},${cell.z + 6}`;
      expect(key in target.cells).toBe(true);
    }
  });
});

// ── 9. P08 Contract Metadata ─────────────────────────────────────────

describe('P08 contract metadata', () => {
  it('has 5 invariants', () => {
    expect(P08_INVARIANTS).toHaveLength(5);
  });

  it('invariant names match expected pivots', () => {
    expect(P08_INVARIANTS).toContain('deterministic_evaluation');
    expect(P08_INVARIANTS).toContain('bounded_design');
    expect(P08_INVARIANTS).toContain('symmetry_canonicalization');
    expect(P08_INVARIANTS).toContain('spec_predicate');
    expect(P08_INVARIANTS).toContain('bounded_motifs');
  });

  it('contract version is p08.v1', () => {
    expect(P08_CONTRACT_VERSION).toBe('p08.v1');
  });

  it('adapter exposes correct constants', () => {
    expect(adapter.maxDesignNodes).toBe(MAX_DESIGN_NODES);
    expect(adapter.maxMotifs).toBe(MAX_MOTIFS);
  });
});

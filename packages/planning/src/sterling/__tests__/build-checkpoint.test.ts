/**
 * M5: Build checkpoint tests.
 *
 * Proves:
 * 1. Module witness digest is deterministic and content-sensitive
 * 2. Checkpoint ID is deterministic and content-sensitive
 * 3. Build metadata initializes correctly and advances immutably
 * 4. Resume decision handles: fresh start, continue, repair, replan
 * 5. Checkpoint-based resume uses delta recomputation, not "continue from step N"
 */

import { describe, it, expect } from 'vitest';
import {
  computeWitnessDigest,
  buildModuleWitness,
  computeCheckpointId,
  createBuildCheckpoint,
  initBuildMetadata,
  advanceBuildMetadata,
  computeResumeDecision,
} from '../build-checkpoint';
import type { SiteSignature } from '../../types/build-checkpoint';

const testSite: SiteSignature = {
  position: { x: 100, y: 64, z: 200 },
  facing: 'N',
  refCorner: { x: 98, y: 64, z: 198 },
  footprintBounds: {
    min: { x: 98, y: 64, z: 198 },
    max: { x: 102, y: 68, z: 202 },
  },
};

describe('M5: Module Witness', () => {
  it('witness digest is deterministic', () => {
    const placements = [
      { dx: 0, dy: 0, dz: 0, blockId: 'oak_planks' },
      { dx: 1, dy: 0, dz: 0, blockId: 'oak_planks' },
    ];
    const d1 = computeWitnessDigest(placements, []);
    const d2 = computeWitnessDigest(placements, []);
    expect(d1).toBe(d2);
  });

  it('witness digest changes when placements change', () => {
    const p1 = [{ dx: 0, dy: 0, dz: 0, blockId: 'oak_planks' }];
    const p2 = [{ dx: 0, dy: 0, dz: 0, blockId: 'cobblestone' }];
    expect(computeWitnessDigest(p1, [])).not.toBe(computeWitnessDigest(p2, []));
  });

  it('witness digest is order-independent (sorted internally)', () => {
    const p1 = [
      { dx: 1, dy: 0, dz: 0, blockId: 'oak_planks' },
      { dx: 0, dy: 0, dz: 0, blockId: 'oak_planks' },
    ];
    const p2 = [
      { dx: 0, dy: 0, dz: 0, blockId: 'oak_planks' },
      { dx: 1, dy: 0, dz: 0, blockId: 'oak_planks' },
    ];
    expect(computeWitnessDigest(p1, [])).toBe(computeWitnessDigest(p2, []));
  });

  it('buildModuleWitness produces complete witness with digest', () => {
    const witness = buildModuleWitness(
      'wall_north',
      { x: 98, y: 64, z: 198 },
      'N',
      [{ dx: 0, dy: 0, dz: 0, blockId: 'cobblestone' }],
      [{ dx: 0, dy: 1, dz: 0 }],
    );
    expect(witness.moduleId).toBe('wall_north');
    expect(witness.refCorner).toEqual({ x: 98, y: 64, z: 198 });
    expect(witness.expectedPlacements).toHaveLength(1);
    expect(witness.requiredEmpty).toHaveLength(1);
    expect(witness.witnessDigest).toBeTruthy();
  });
});

describe('M5: Build Checkpoint', () => {
  it('checkpoint ID is deterministic', () => {
    const id1 = computeCheckpointId('tmpl_abc', 2, ['wall_north', 'wall_south']);
    const id2 = computeCheckpointId('tmpl_abc', 2, ['wall_north', 'wall_south']);
    expect(id1).toBe(id2);
  });

  it('checkpoint ID changes when cursor changes', () => {
    const id1 = computeCheckpointId('tmpl_abc', 1, ['wall_north']);
    const id2 = computeCheckpointId('tmpl_abc', 2, ['wall_north']);
    expect(id1).not.toBe(id2);
  });

  it('checkpoint ID changes when completed modules change', () => {
    const id1 = computeCheckpointId('tmpl_abc', 2, ['wall_north']);
    const id2 = computeCheckpointId('tmpl_abc', 2, ['wall_north', 'wall_south']);
    expect(id1).not.toBe(id2);
  });

  it('checkpoint ID is module-order independent', () => {
    const id1 = computeCheckpointId('tmpl_abc', 2, ['wall_south', 'wall_north']);
    const id2 = computeCheckpointId('tmpl_abc', 2, ['wall_north', 'wall_south']);
    expect(id1).toBe(id2);
  });

  it('createBuildCheckpoint produces complete checkpoint', () => {
    const cp = createBuildCheckpoint(
      'tmpl_abc',
      1,
      ['foundation'],
      [{ kind: 'crafting_table', pos: { x: 100, y: 64, z: 200 }, reachable: true, lastVerifiedAt: Date.now(), provenance: { source: 'placed', moduleIndex: 0 } }],
      [{ invariant: 'foundation_solid', passed: true, evidence: 'all blocks present' }],
      { cobblestone: 20, oak_planks: 8 },
    );
    expect(cp.checkpointId).toBeTruthy();
    expect(cp.moduleCursor).toBe(1);
    expect(cp.completedModules).toEqual(['foundation']);
    expect(cp.stationSnapshot).toHaveLength(1);
    expect(cp.invariantResults).toHaveLength(1);
    expect(cp.inventorySummary.cobblestone).toBe(20);
    expect(cp.savedAt).toBeGreaterThan(0);
  });
});

describe('M5: Build Metadata', () => {
  it('initializes with cursor at 0 and empty checkpoints', () => {
    const meta = initBuildMetadata('tmpl_abc', testSite);
    expect(meta.moduleCursor).toBe(0);
    expect(meta.completedModules).toEqual([]);
    expect(meta.checkpoints).toEqual([]);
    expect(meta.witnesses).toEqual({});
    expect(meta.siteSignature).toEqual(testSite);
  });

  it('advance is immutable (original unchanged)', () => {
    const meta = initBuildMetadata('tmpl_abc', testSite);
    const witness = buildModuleWitness('foundation', testSite.refCorner, 'N', [{ dx: 0, dy: 0, dz: 0, blockId: 'cobblestone' }]);
    const cp = createBuildCheckpoint('tmpl_abc', 1, ['foundation'], [], [{ invariant: 'test', passed: true }], {});

    const advanced = advanceBuildMetadata(meta, 'foundation', cp, witness);

    // Original unchanged
    expect(meta.moduleCursor).toBe(0);
    expect(meta.completedModules).toEqual([]);
    expect(meta.checkpoints).toEqual([]);

    // Advanced has new state
    expect(advanced.moduleCursor).toBe(1);
    expect(advanced.completedModules).toEqual(['foundation']);
    expect(advanced.checkpoints).toHaveLength(1);
    expect(advanced.witnesses['foundation']).toBeDefined();
    expect(advanced.witnesses['foundation'].witnessDigest).toBeTruthy();
  });
});

describe('M5: Resume Decision', () => {
  it('no metadata → continue from cursor 0', () => {
    const decision = computeResumeDecision(undefined, 'tmpl_abc', true);
    expect(decision.action).toBe('continue');
    expect(decision).toHaveProperty('fromCursor', 0);
  });

  it('empty checkpoints → continue from cursor 0', () => {
    const meta = initBuildMetadata('tmpl_abc', testSite);
    const decision = computeResumeDecision(meta, 'tmpl_abc', true);
    expect(decision.action).toBe('continue');
    expect(decision).toHaveProperty('fromCursor', 0);
  });

  it('template changed → replan', () => {
    const meta = initBuildMetadata('tmpl_abc', testSite);
    const cp = createBuildCheckpoint('tmpl_abc', 1, ['foundation'], [], [{ invariant: 'test', passed: true }], {});
    const withCp = advanceBuildMetadata(meta, 'foundation', cp);

    const decision = computeResumeDecision(withCp, 'tmpl_DIFFERENT', true);
    expect(decision.action).toBe('replan');
    expect(decision.reason).toBe('template_changed');
  });

  it('site not valid → replan', () => {
    const meta = initBuildMetadata('tmpl_abc', testSite);
    const cp = createBuildCheckpoint('tmpl_abc', 1, ['foundation'], [], [{ invariant: 'test', passed: true }], {});
    const withCp = advanceBuildMetadata(meta, 'foundation', cp);

    const decision = computeResumeDecision(withCp, 'tmpl_abc', false);
    expect(decision.action).toBe('replan');
    expect(decision.reason).toBe('site_unrecognizable');
  });

  it('blocking deltas → repair', () => {
    const meta = initBuildMetadata('tmpl_abc', testSite);
    const cp = createBuildCheckpoint(
      'tmpl_abc', 1, ['foundation'], [], [{ invariant: 'test', passed: true }], {},
      [{ moduleId: 'foundation', issue: 'missing_block_at_corner', severity: 'blocking' }],
    );
    const withCp = advanceBuildMetadata(meta, 'foundation', cp);

    const decision = computeResumeDecision(withCp, 'tmpl_abc', true);
    expect(decision.action).toBe('repair');
    expect(decision).toHaveProperty('deltas');
    expect((decision as any).deltas).toHaveLength(1);
  });

  it('clean checkpoint → continue from last cursor', () => {
    const meta = initBuildMetadata('tmpl_abc', testSite);
    const cp1 = createBuildCheckpoint('tmpl_abc', 1, ['foundation'], [], [{ invariant: 'test', passed: true }], {});
    const step1 = advanceBuildMetadata(meta, 'foundation', cp1);
    const cp2 = createBuildCheckpoint('tmpl_abc', 2, ['foundation', 'wall_north'], [], [{ invariant: 'test', passed: true }], {});
    const step2 = advanceBuildMetadata(step1, 'wall_north', cp2);

    const decision = computeResumeDecision(step2, 'tmpl_abc', true);
    expect(decision.action).toBe('continue');
    expect(decision).toHaveProperty('fromCursor', 2);
    expect(decision.reason).toBe('checkpoint_clean');
  });
});

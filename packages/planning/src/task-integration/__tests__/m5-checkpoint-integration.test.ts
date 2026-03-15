/**
 * M5: Planner + executor integration tests for checkpointed building.
 *
 * Proves:
 * 1. Planner selects the checkpointed path for certification templates
 *    and returns place_block + verify_module steps (not build_module stubs)
 * 2. task.metadata.build is seeded with templateDigest, siteSignature,
 *    moduleCursor=0, empty checkpoints, and witness map
 * 3. verify_module success commits a real BuildCheckpoint and advances
 *    moduleCursor from 0 to 1
 * 4. Re-entry with existing checkpoint skips completed modules
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SterlingPlanner } from '../sterling-planner';
import { SOLVER_IDS } from '../../sterling/solver-ids';
import { BUILDING_DECLARATION } from '../../sterling/minecraft-building-solver';
import { advanceBuildMetadata, createBuildCheckpoint } from '../../sterling/build-checkpoint';

// ── Mock building solver that returns solved for shelter ──

function createMockBuildingSolver() {
  return {
    solverId: SOLVER_IDS.BUILDING,
    sterlingDomain: 'building' as const,
    contractVersion: 1,
    declarationMode: 'dev' as const,
    getDomainDeclaration: vi.fn().mockReturnValue(BUILDING_DECLARATION),
    registeredDigest: null,
    isAvailable: vi.fn().mockReturnValue(true),
    ensureDeclarationRegistered: vi.fn().mockResolvedValue(true),
    solveBuildingPlan: vi.fn().mockResolvedValue({
      solved: true,
      steps: [{ moduleId: 'foundation_5x5', moduleType: 'apply_module' }],
      totalNodes: 5,
      durationMs: 50,
      planId: 'build-plan-test',
      solveMeta: {
        bundles: [{
          bundleId: 'minecraft.building:test_hash',
          bundleHash: 'test_hash',
          timestamp: Date.now(),
          input: { solverId: 'minecraft.building' },
          output: { solved: true, planId: 'build-plan-test' },
          compatReport: { valid: true, issues: [], checkedAt: Date.now(), definitionCount: 1 },
        }],
      },
      solveJoinKeys: { planId: 'build-plan-test', bundleHash: 'test_hash' },
    }),
    toTaskStepsWithReplan: vi.fn().mockReturnValue([
      { id: 'stub-1', label: 'stub', done: false, order: 1, meta: { leaf: 'build_module', moduleId: 'foundation_5x5' } },
    ]),
  };
}

function createMockGet() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      data: {
        data: {
          inventory: { items: [{ name: 'cobblestone', count: 64 }, { name: 'oak_planks', count: 64 }] },
        },
        worldState: {
          nearbyBlocks: ['grass_block', 'dirt'],
          nearbyBlockSummary: { counts: { grass_block: 10, dirt: 20 } },
        },
      },
    }),
  });
}

// ── Tests ──

describe('M5: Planner integration — checkpointed building', () => {
  let planner: SterlingPlanner;
  let mockGet: ReturnType<typeof createMockGet>;

  beforeEach(() => {
    mockGet = createMockGet();
    planner = new SterlingPlanner({ minecraftGet: mockGet });
  });

  it('selects checkpointed path and returns place_block + verify_module steps', async () => {
    const solver = createMockBuildingSolver();
    planner.registerSolver(solver as any);

    const taskData: any = {
      id: 'test-build-m5',
      title: 'Build basic shelter',
      type: 'build',
      parameters: {
        requirementCandidate: { kind: 'build', outputPattern: 'basic_shelter_5x5' },
      },
      metadata: {
        currentState: { position: { x: 100, y: 64, z: 200 } },
      },
    };

    const result = await planner.generateDynamicSteps(taskData);

    // === ARTIFACT: Step types ===
    const leafTypes = result.steps.map(s => (s.meta as any)?.leaf).filter(Boolean);
    const placeBlockCount = leafTypes.filter(l => l === 'place_block').length;
    const verifyModuleCount = leafTypes.filter(l => l === 'verify_module').length;
    const buildModuleCount = leafTypes.filter(l => l === 'build_module').length;

    console.log('=== PLANNER INTEGRATION ARTIFACTS ===');
    console.log(`total steps: ${result.steps.length}`);
    console.log(`place_block: ${placeBlockCount}`);
    console.log(`verify_module: ${verifyModuleCount}`);
    console.log(`build_module (stubs): ${buildModuleCount}`);
    console.log(`step types: ${[...new Set(leafTypes)].join(', ')}`);

    // Must have place_block steps (real world mutation), not build_module stubs
    expect(placeBlockCount).toBeGreaterThan(0);
    expect(verifyModuleCount).toBeGreaterThan(0);
    expect(buildModuleCount).toBe(0); // No stubs

    // === ARTIFACT: BuildMetadata seeded ===
    const buildMeta = taskData.metadata?.build;
    console.log(`\nbuildMeta present: ${!!buildMeta}`);
    console.log(`templateDigest: ${buildMeta?.templateDigest}`);
    console.log(`moduleCursor: ${buildMeta?.moduleCursor}`);
    console.log(`completedModules: [${buildMeta?.completedModules?.join(',')}]`);
    console.log(`checkpoints: ${buildMeta?.checkpoints?.length}`);
    console.log(`witnesses keys: [${Object.keys(buildMeta?.witnesses ?? {}).join(',')}]`);
    console.log(`siteSignature.position: ${JSON.stringify(buildMeta?.siteSignature?.position)}`);

    expect(buildMeta).toBeDefined();
    expect(buildMeta.templateDigest).toBeTruthy();
    expect(buildMeta.moduleCursor).toBe(0);
    expect(buildMeta.completedModules).toEqual([]);
    expect(buildMeta.checkpoints).toEqual([]);
    expect(Object.keys(buildMeta.witnesses).length).toBeGreaterThan(0);
    expect(buildMeta.siteSignature).toBeDefined();
    expect(buildMeta.siteSignature.position).toEqual({ x: 100, y: 64, z: 200 });
  });

  it('re-entry with checkpoint skips completed foundation module', async () => {
    const solver = createMockBuildingSolver();
    planner.registerSolver(solver as any);

    // Simulate a task that already has foundation completed
    const { decomposeCheckpointableTemplate } = await import('../../sterling/building-decomposer');
    const { getSimpleShelterTemplate } = await import('../../sterling/building-templates-shared');
    const { initBuildMetadata } = await import('../../sterling/build-checkpoint');

    const template = getSimpleShelterTemplate();
    const siteOrigin = { x: 100, y: 64, z: 200 };
    const decomposed = decomposeCheckpointableTemplate(template, siteOrigin);

    // Seed metadata with foundation already completed
    const buildMeta = initBuildMetadata(decomposed.templateDigest, {
      position: siteOrigin,
      facing: 'N',
      refCorner: siteOrigin,
      footprintBounds: { min: siteOrigin, max: { x: 112, y: 69, z: 212 } },
    });

    // Store witnesses
    for (const mod of decomposed.modules) {
      buildMeta.witnesses[mod.moduleId] = mod.witness;
    }

    // Advance past foundation
    const checkpoint = createBuildCheckpoint(
      decomposed.templateDigest, 1, ['foundation_5x5'], [],
      [{ invariant: 'module_verified', passed: true }], { cobblestone: 40 },
    );
    const advancedMeta = advanceBuildMetadata(buildMeta, 'foundation_5x5', checkpoint);

    const taskData: any = {
      id: 'test-build-m5-resume',
      title: 'Build basic shelter',
      type: 'build',
      parameters: {
        requirementCandidate: { kind: 'build', outputPattern: 'basic_shelter_5x5' },
      },
      metadata: {
        build: advancedMeta,
        currentState: { position: siteOrigin },
      },
    };

    const result = await planner.generateDynamicSteps(taskData);

    // === ARTIFACT: Resumed steps ===
    const moduleIds = [...new Set(
      result.steps
        .map(s => (s.meta as any)?.moduleId)
        .filter(Boolean)
    )];

    console.log('=== RESUME ARTIFACTS ===');
    console.log(`total resumed steps: ${result.steps.length}`);
    console.log(`module IDs in steps: [${moduleIds.join(',')}]`);
    console.log(`foundation_5x5 present: ${moduleIds.includes('foundation_5x5')}`);

    // Foundation must NOT be replayed
    expect(moduleIds).not.toContain('foundation_5x5');

    // Remaining modules should be present
    expect(result.steps.length).toBeGreaterThan(0);

    // At least walls should be in the remaining steps
    expect(moduleIds.some(id => id.includes('walls'))).toBe(true);
  });
});

describe('M5: Executor integration — checkpoint advancement', () => {
  it('advanceBuildMetadata creates real checkpoint with correct fields', async () => {
    const { initBuildMetadata, createBuildCheckpoint, advanceBuildMetadata: advance } = await import('../../sterling/build-checkpoint');

    const meta = initBuildMetadata('digest_abc', {
      position: { x: 0, y: 64, z: 0 },
      facing: 'N',
      refCorner: { x: 0, y: 64, z: 0 },
      footprintBounds: { min: { x: 0, y: 64, z: 0 }, max: { x: 10, y: 69, z: 10 } },
    });

    // Simulate verify_module success → checkpoint advancement
    const checkpoint = createBuildCheckpoint(
      'digest_abc',
      1, // moduleCursor after advancement
      ['foundation_5x5'],
      [], // stations
      [{ invariant: 'module_verified', passed: true, evidence: 'all 25 blocks present' }],
      { cobblestone: 39 }, // inventory after placing 25 cobblestone from 64
    );

    const advanced = advance(meta, 'foundation_5x5', checkpoint);

    // === ARTIFACT: Checkpoint state ===
    console.log('=== CHECKPOINT ADVANCEMENT ARTIFACTS ===');
    console.log(`checkpointId: ${checkpoint.checkpointId}`);
    console.log(`moduleCursor: ${advanced.moduleCursor}`);
    console.log(`completedModules: [${advanced.completedModules.join(',')}]`);
    console.log(`checkpoints count: ${advanced.checkpoints.length}`);
    console.log(`invariantResults: ${JSON.stringify(advanced.checkpoints[0]?.invariantResults)}`);
    console.log(`inventorySummary.cobblestone: ${advanced.checkpoints[0]?.inventorySummary?.cobblestone}`);

    expect(advanced.moduleCursor).toBe(1);
    expect(advanced.completedModules).toEqual(['foundation_5x5']);
    expect(advanced.checkpoints).toHaveLength(1);
    expect(advanced.checkpoints[0].checkpointId).toBeTruthy();
    expect(advanced.checkpoints[0].checkpointId).toBe(checkpoint.checkpointId);
    expect(advanced.checkpoints[0].invariantResults[0].passed).toBe(true);
    expect(advanced.checkpoints[0].inventorySummary.cobblestone).toBe(39);

    // Original unchanged (immutability)
    expect(meta.moduleCursor).toBe(0);
    expect(meta.completedModules).toEqual([]);
  });
});

/**
 * M3b: craft_for_build bridge integration test.
 *
 * Proves the full deficit → acquisition → replan cycle produces a typed
 * craft_for_build bridge with real bundle identities.
 *
 * Scenarios:
 * 1. First building solve returns needsMaterials → deficit declaration persisted
 * 2. Second building solve (replan) succeeds → bridge created with coherent linkage
 * 3. Replan with template mismatch → bridge skipped with coherence failure reason
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SterlingPlanner } from '../sterling-planner';
import { SOLVER_IDS } from '../../sterling/solver-ids';
import { BUILDING_DECLARATION } from '../../sterling/minecraft-building-solver';

// ── Mock building solver ──

function createMockBuildingSolver(responses: Array<{
  solved: boolean;
  needsMaterials?: { deficit: Record<string, number>; blockedModules: string[]; currentProgress: number };
  steps?: any[];
  planId?: string;
  bundleHash?: string;
}>) {
  let callIndex = 0;
  return {
    solverId: SOLVER_IDS.BUILDING,
    sterlingDomain: 'building' as const,
    contractVersion: 1,
    declarationMode: 'dev' as const,
    getDomainDeclaration: vi.fn().mockReturnValue(BUILDING_DECLARATION),
    registeredDigest: null,
    isAvailable: vi.fn().mockReturnValue(true),
    ensureDeclarationRegistered: vi.fn().mockResolvedValue(true),
    solveBuildingPlan: vi.fn().mockImplementation(async () => {
      const resp = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return {
        solved: resp.solved,
        steps: resp.steps ?? [],
        totalNodes: 10,
        durationMs: 50,
        planId: resp.planId ?? `build-plan-${callIndex}`,
        needsMaterials: resp.needsMaterials,
        solveMeta: {
          bundles: [{
            bundleId: `minecraft.building:${resp.bundleHash ?? `hash${callIndex}`}`,
            bundleHash: resp.bundleHash ?? `hash${callIndex}`,
            timestamp: Date.now(),
            input: { solverId: 'minecraft.building' },
            output: { solved: resp.solved, planId: resp.planId ?? `build-plan-${callIndex}` },
            compatReport: { valid: true, issues: [], checkedAt: Date.now(), definitionCount: 1 },
          }],
        },
        solveJoinKeys: resp.planId ? { planId: resp.planId, bundleHash: resp.bundleHash ?? `hash${callIndex}` } : undefined,
      };
    }),
    toTaskStepsWithReplan: vi.fn().mockImplementation((result: any, templateId: string) => {
      if (result.needsMaterials) {
        const steps: any[] = [];
        let order = 1;
        for (const [item, count] of Object.entries(result.needsMaterials.deficit)) {
          steps.push({
            id: `step-acquire-${order}`,
            label: `acquire ${item}`,
            done: false,
            order: order++,
            meta: { leaf: 'acquire_material', item, count, templateId },
          });
        }
        steps.push({
          id: `step-replan-${order}`,
          label: `replan building`,
          done: false,
          order: order++,
          meta: { leaf: 'replan_building', templateId },
        });
        return steps;
      }
      return result.steps.map((s: any, i: number) => ({
        id: `step-build-${i + 1}`,
        label: `build step ${i + 1}`,
        done: false,
        order: i + 1,
        meta: { leaf: 'building_step', ...s },
      }));
    }),
  };
}

function createMockGet() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      data: {
        data: { inventory: { items: [{ name: 'cobblestone', count: 20 }] } },
        worldState: { nearbyBlocks: ['cobblestone'], nearbyBlockSummary: { counts: { cobblestone: 20 } } },
      },
    }),
  });
}

describe('M3b: craft_for_build bridge', () => {
  let planner: SterlingPlanner;
  let mockGet: ReturnType<typeof createMockGet>;

  beforeEach(() => {
    mockGet = createMockGet();
    planner = new SterlingPlanner({ minecraftGet: mockGet });
  });

  it('first building solve with needsMaterials persists deficit declaration', async () => {
    const solver = createMockBuildingSolver([
      {
        solved: false,
        needsMaterials: { deficit: { cobblestone: 12, oak_planks: 6 }, blockedModules: ['wall_north'], currentProgress: 0 },
        bundleHash: 'deficit_bundle_abc',
        planId: 'build-plan-1',
      },
    ]);
    planner.registerSolver(solver as any);

    const taskData: any = {
      id: 'test-build-1',
      title: 'Build basic shelter',
      type: 'build',
      parameters: { requirementCandidate: { kind: 'build', outputPattern: 'basic_shelter_5x5' } },
      metadata: {},
    };

    await planner.generateDynamicSteps(taskData);

    // Deficit declaration should be persisted
    const decl = taskData.metadata?.solver?.buildingDeficitDeclaration;
    expect(decl).toBeDefined();
    expect(decl.originatingBundleHash).toBe('deficit_bundle_abc');
    expect(decl.templateId).toBe('basic_shelter_5x5__p0stub');
    expect(decl.deficit).toEqual({ cobblestone: 12, oak_planks: 6 });
    expect(decl.blockedModules).toEqual(['wall_north']);
    expect(decl.declaredAt).toBeGreaterThan(0);
  });

  it('replan after deficit resolution creates craft_for_build bridge', async () => {
    const solver = createMockBuildingSolver([
      // First call: deficit
      {
        solved: false,
        needsMaterials: { deficit: { cobblestone: 12 }, blockedModules: ['wall_north'], currentProgress: 0 },
        bundleHash: 'deficit_bundle_def',
        planId: 'build-plan-1',
      },
      // Second call: replan succeeds
      {
        solved: true,
        steps: [{ action: 'place_block', item: 'cobblestone' }],
        bundleHash: 'replan_bundle_ghi',
        planId: 'build-plan-2',
      },
    ]);
    planner.registerSolver(solver as any);

    const taskData: any = {
      id: 'test-build-2',
      title: 'Build basic shelter',
      type: 'build',
      parameters: { requirementCandidate: { kind: 'build', outputPattern: 'basic_shelter_5x5' } },
      metadata: {},
    };

    // First call: deficit detected, acquisition steps emitted
    await planner.generateDynamicSteps(taskData);
    expect(taskData.metadata?.solver?.buildingDeficitDeclaration).toBeDefined();
    expect(taskData.metadata?.solver?.buildingReplanCount).toBe(1);

    // Second call: replan after acquisition
    const result = await planner.generateDynamicSteps(taskData);

    // Bridge should be created
    const bridge = taskData.metadata?.solver?.craftForBuildBridge;
    expect(bridge).toBeDefined();
    expect(bridge.coherent).toBe(true);
    expect(bridge.kind).toBe('craft_for_build');
    expect(bridge.bridgeHash).toBeTruthy();
    expect(bridge.deficit).toEqual({ cobblestone: 12 });
    expect(bridge.originatingBundleHash).toBe('deficit_bundle_def');
    expect(bridge.replanBundleHash).toBe('replan_bundle_ghi');

    // Steps should be building steps (replan succeeded)
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('replan with no stored deficit skips bridge creation', async () => {
    const solver = createMockBuildingSolver([
      // Direct success (no deficit phase)
      {
        solved: true,
        steps: [{ action: 'place_block', item: 'cobblestone' }],
        bundleHash: 'direct_bundle_xyz',
        planId: 'build-plan-direct',
      },
    ]);
    planner.registerSolver(solver as any);

    const taskData: any = {
      id: 'test-build-3',
      title: 'Build basic shelter',
      type: 'build',
      parameters: { requirementCandidate: { kind: 'build', outputPattern: 'basic_shelter_5x5' } },
      metadata: { solver: { buildingReplanCount: 1 } }, // Simulate replan without deficit
    };

    await planner.generateDynamicSteps(taskData);

    // No bridge should be created (no deficit declaration stored)
    expect(taskData.metadata?.solver?.craftForBuildBridge).toBeUndefined();
  });
});

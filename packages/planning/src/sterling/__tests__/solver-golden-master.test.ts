/**
 * Golden-master tests for crafting and building solvers.
 *
 * These lock the external behavior (label format, episode payload shape)
 * BEFORE the BaseDomainSolver extraction so any regression is caught.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MinecraftCraftingSolver } from '../minecraft-crafting-solver';
import { MinecraftBuildingSolver } from '../minecraft-building-solver';
import type { MinecraftCraftingSolveResult } from '../minecraft-crafting-types';
import type { BuildingSolveResult } from '../minecraft-building-types';
import type { SterlingReasoningService } from '../sterling-reasoning-service';
import { canonicalize } from '../solve-bundle';
import { buildCraftingRules } from '../minecraft-crafting-rules';

// ---------------------------------------------------------------------------
// Mock SterlingReasoningService
// ---------------------------------------------------------------------------

function createMockService(overrides?: Partial<SterlingReasoningService>) {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    solve: vi.fn().mockResolvedValue({
      solutionFound: false,
      solutionPath: [],
      discoveredNodes: [],
      searchEdges: [],
      metrics: {},
      durationMs: 0,
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    getHealthStatus: vi.fn().mockReturnValue({ enabled: true }),
    verifyReachability: vi.fn(),
    queryKnowledgeGraph: vi.fn(),
    withFallback: vi.fn(),
    ...overrides,
  } as unknown as SterlingReasoningService;
}

// ===========================================================================
// Crafting Solver
// ===========================================================================

describe('MinecraftCraftingSolver — golden-master', () => {
  let service: SterlingReasoningService;
  let solver: MinecraftCraftingSolver;

  beforeEach(() => {
    service = createMockService();
    solver = new MinecraftCraftingSolver(service);
  });

  // ---- toTaskSteps label format ----

  it('toTaskSteps produces correct labels for a 3-step mine+craft+craft result', () => {
    const result: MinecraftCraftingSolveResult = {
      solved: true,
      steps: [
        {
          action: 'mine:oak_log',
          actionType: 'mine',
          produces: [{ name: 'oak_log', count: 3 }],
          consumes: [],
          resultingInventory: { oak_log: 3 },
        },
        {
          action: 'craft:oak_planks',
          actionType: 'craft',
          produces: [{ name: 'oak_planks', count: 4 }],
          consumes: [{ name: 'oak_log', count: 1 }],
          resultingInventory: { oak_log: 2, oak_planks: 4 },
        },
        {
          action: 'craft:stick',
          actionType: 'craft',
          produces: [{ name: 'stick', count: 4 }],
          consumes: [{ name: 'oak_planks', count: 2 }],
          resultingInventory: { oak_log: 2, oak_planks: 2, stick: 4 },
        },
      ],
      totalNodes: 42,
      durationMs: 100,
    };

    const steps = solver.toTaskSteps(result);

    expect(steps).toHaveLength(3);
    expect(steps[0].label).toBe(
      'Leaf: minecraft.dig_block (blockType=oak_log, count=3)'
    );
    expect(steps[1].label).toBe(
      'Leaf: minecraft.craft_recipe (recipe=oak_planks, qty=4)'
    );
    expect(steps[2].label).toBe(
      'Leaf: minecraft.craft_recipe (recipe=stick, qty=4)'
    );

    // Order is 1-based sequential
    expect(steps.map((s) => s.order)).toEqual([1, 2, 3]);
    // All start not done
    expect(steps.every((s) => s.done === false)).toBe(true);
    // Duration estimates
    expect(steps[0].estimatedDuration).toBe(5000); // mine
    expect(steps[1].estimatedDuration).toBe(2000); // craft
    expect(steps[2].estimatedDuration).toBe(2000); // craft
  });

  it('toTaskSteps returns empty array for unsolved result', () => {
    const result: MinecraftCraftingSolveResult = {
      solved: false,
      steps: [],
      totalNodes: 0,
      durationMs: 0,
      error: 'No solution',
    };
    expect(solver.toTaskSteps(result)).toEqual([]);
  });

  // ---- solveCraftingGoal returns planId ----

  it('solveCraftingGoal returns planId from Sterling metrics', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [],
      discoveredNodes: [],
      searchEdges: [],
      metrics: { planId: 'plan-abc-123' },
      durationMs: 50,
    });

    const mcData = { itemsByName: {}, recipes: {}, items: {} };
    const result = await solver.solveCraftingGoal('wooden_pickaxe', [], mcData, []);

    expect(result.planId).toBe('plan-abc-123');
  });

  // ---- reportEpisodeResult payload shape ----

  it('reportEpisodeResult sends correct payload with explicit planId', () => {
    solver.reportEpisodeResult('wooden_pickaxe', true, 3, 'plan-abc-123');

    expect(service.solve).toHaveBeenCalledTimes(1);

    const reportCall = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(reportCall[0]).toBe('minecraft');
    expect(reportCall[1]).toMatchObject({
      command: 'report_episode',
      domain: 'minecraft',
      planId: 'plan-abc-123',
      goal: 'wooden_pickaxe',
      success: true,
      stepsCompleted: 3,
    });
  });

  it('reportEpisodeResult skips when planId is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    solver.reportEpisodeResult('wooden_pickaxe', true, 3);

    // No solve call — report was skipped
    expect(service.solve).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing planId')
    );

    warnSpy.mockRestore();
  });

  // ---- unavailable result ----

  it('returns unavailable result when service is down', async () => {
    (service.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await solver.solveCraftingGoal('stick', [], {}, []);

    expect(result.solved).toBe(false);
    expect(result.error).toBe('Sterling reasoning service unavailable');
    expect(result.steps).toEqual([]);
  });

  // ===========================================================================
  // credit assignment: solve does not auto-report (Invariant 5)
  // ===========================================================================

  describe('credit assignment: solve does not auto-report', () => {
    const mcData = {
      itemsByName: {
        stick: { id: 1, name: 'stick' },
        oak_planks: { id: 2, name: 'oak_planks' },
      },
      items: {
        1: { id: 1, name: 'stick' },
        2: { id: 2, name: 'oak_planks' },
      },
      recipes: {
        1: [
          {
            result: { id: 1, count: 4 },
            ingredients: [2, 2],
          },
        ],
      },
    };

    it('solved path never calls reportEpisodeResult or sends report_episode', async () => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [{ source: 'A', target: 'B' }],
        discoveredNodes: ['A', 'B'],
        searchEdges: [{ source: 'A', target: 'B', label: { action: 'craft:stick' } }],
        metrics: { planId: 'plan-credit-1' },
        durationMs: 10,
      });

      const reportSpy = vi.spyOn(solver, 'reportEpisodeResult');

      await solver.solveCraftingGoal('stick', [], mcData, []);

      // reportEpisodeResult was never called by the solver internally
      expect(reportSpy).not.toHaveBeenCalled();

      // service.solve was called exactly once — for the solve, not for report_episode
      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).not.toHaveProperty('command', 'report_episode');

      reportSpy.mockRestore();
    });

    it('unsolved path never calls reportEpisodeResult or sends report_episode', async () => {
      // Default mock returns solutionFound: false
      const reportSpy = vi.spyOn(solver, 'reportEpisodeResult');

      await solver.solveCraftingGoal('stick', [], mcData, []);

      expect(reportSpy).not.toHaveBeenCalled();

      // service.solve was called exactly once — for the solve
      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).not.toHaveProperty('command', 'report_episode');

      reportSpy.mockRestore();
    });
  });

  // ===========================================================================
  // solveMeta evidence — proves bundle wiring runs on every solve path
  // ===========================================================================

  describe('solveMeta bundle attachment', () => {
    // Minimal mcData that generates at least one crafting rule for "stick"
    const mcData = {
      itemsByName: {
        stick: { id: 1, name: 'stick' },
        oak_planks: { id: 2, name: 'oak_planks' },
      },
      items: {
        1: { id: 1, name: 'stick' },
        2: { id: 2, name: 'oak_planks' },
      },
      recipes: {
        1: [
          {
            result: { id: 1, count: 4 },
            ingredients: [2, 2],
          },
        ],
      },
    };

    it('solved path attaches solveMeta with correct bundle shape', async () => {
      // Mock a solved result with a solutionPath edge so mapSolutionToSteps runs
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [{ source: 'A', target: 'B' }],
        discoveredNodes: ['A', 'B'],
        searchEdges: [{ source: 'A', target: 'B', label: { action: 'craft:stick' } }],
        metrics: { planId: 'plan-solved-1' },
        durationMs: 42,
      });

      const result = await solver.solveCraftingGoal('stick', [], mcData, []);

      expect(result.solved).toBe(true);
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(1);

      const bundle = result.solveMeta!.bundles[0];
      // Input hashes
      expect(bundle.input.solverId).toBe('minecraft.crafting');
      expect(bundle.input.definitionHash).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.input.initialStateHash).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.input.goalHash).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.input.definitionCount).toBeGreaterThan(0);

      // Output
      expect(bundle.output.solved).toBe(true);
      expect(bundle.output.planId).toBe('plan-solved-1');
      expect(bundle.output.stepsDigest).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.output.searchStats.totalNodes).toBe(2);
      expect(bundle.output.searchStats.durationMs).toBe(42);

      // Compat report
      expect(bundle.compatReport.valid).toBe(true);

      // Content-addressed bundleId
      expect(bundle.bundleId).toMatch(/^minecraft\.crafting:[0-9a-f]{16}$/);
    });

    it('unsolved path attaches solveMeta with solved=false', async () => {
      // Default mock returns solutionFound: false
      const result = await solver.solveCraftingGoal('stick', [], mcData, []);

      expect(result.solved).toBe(false);
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(1);

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.output.solved).toBe(false);
      expect(bundle.output.stepsDigest).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.output.searchStats.solutionPathLength).toBe(0);
      expect(bundle.compatReport.valid).toBe(true);
      expect(bundle.bundleId).toMatch(/^minecraft\.crafting:[0-9a-f]{16}$/);
    });

    it('bundle ID is deterministic for same inputs/outputs', async () => {
      const mockResponse = {
        solutionFound: false,
        solutionPath: [],
        discoveredNodes: [],
        searchEdges: [],
        metrics: {},
        durationMs: 0,
      };

      (service.solve as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce(mockResponse);

      const result1 = await solver.solveCraftingGoal('stick', [], mcData, []);
      const result2 = await solver.solveCraftingGoal('stick', [], mcData, []);

      expect(result1.solveMeta!.bundles[0].bundleHash)
        .toBe(result2.solveMeta!.bundles[0].bundleHash);
    });

    it('solved bundle includes rationale with correct maxNodes and compat', async () => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [{ source: 'A', target: 'B' }],
        discoveredNodes: ['A', 'B'],
        searchEdges: [{ source: 'A', target: 'B', label: { action: 'craft:stick' } }],
        metrics: { planId: 'plan-rationale-c' },
        durationMs: 10,
      });

      const result = await solver.solveCraftingGoal('stick', [], mcData, []);

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.output.rationale).toBeDefined();
      expect(bundle.output.rationale!.boundingConstraints.maxNodes).toBe(5000);
      expect(bundle.output.rationale!.boundingConstraints.objectiveWeightsSource).toBe('default');
      expect(bundle.output.rationale!.shapingEvidence.compatValid).toBe(true);
      expect(bundle.output.rationale!.shapingEvidence.issueCount).toBe(0);
    });
  });

  // ===========================================================================
  // Payload-equivalence snapshot — proves outbound payload stability
  // ===========================================================================

  describe('outbound payload stability', () => {
    const mcData = {
      itemsByName: {
        stick: { id: 1, name: 'stick' },
        oak_planks: { id: 2, name: 'oak_planks' },
      },
      items: {
        1: { id: 1, name: 'stick' },
        2: { id: 2, name: 'oak_planks' },
      },
      recipes: {
        1: [
          {
            result: { id: 1, count: 4 },
            ingredients: [2, 2],
          },
        ],
      },
    };

    it('solve payload matches canonical snapshot', async () => {
      await solver.solveCraftingGoal('stick', [], mcData, ['oak_log']);

      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];

      // Capture the payload fields that Sterling sees
      const stablePayload = {
        contractVersion: payload.contractVersion,
        solverId: payload.solverId,
        inventory: payload.inventory,
        goal: payload.goal,
        nearbyBlocks: payload.nearbyBlocks,
        rules: payload.rules,
        maxNodes: payload.maxNodes,
        useLearning: payload.useLearning,
      };

      // Canonical snapshot — if this changes, the diff proves intentionality
      const snapshot = canonicalize(stablePayload);
      expect(snapshot).toMatchSnapshot();
    });
  });

  // ===========================================================================
  // client payload generation is stateless across solves (Invariant 4)
  // ===========================================================================

  describe('client payload generation is stateless across solves', () => {
    const mcData = {
      itemsByName: {
        stick: { id: 1, name: 'stick' },
        oak_planks: { id: 2, name: 'oak_planks' },
      },
      items: {
        1: { id: 1, name: 'stick' },
        2: { id: 2, name: 'oak_planks' },
      },
      recipes: {
        1: [
          {
            result: { id: 1, count: 4 },
            ingredients: [2, 2],
          },
        ],
      },
    };

    it('identical inputs produce byte-equivalent wire payloads across solves', async () => {
      await solver.solveCraftingGoal('stick', [], mcData, ['oak_log']);
      await solver.solveCraftingGoal('stick', [], mcData, ['oak_log']);

      expect(service.solve).toHaveBeenCalledTimes(2);
      const calls = (service.solve as ReturnType<typeof vi.fn>).mock.calls;
      const payload1 = calls[0][1];
      const payload2 = calls[1][1];

      expect(canonicalize(payload1)).toBe(canonicalize(payload2));
    });

    it('learning event does not contaminate subsequent solve payloads', async () => {
      await solver.solveCraftingGoal('stick', [], mcData, ['oak_log']);

      const firstCallPayload = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0][1];

      // Simulate learning event: report an episode result
      solver.reportEpisodeResult('stick', true, 1, 'plan-learn-1');

      await solver.solveCraftingGoal('stick', [], mcData, ['oak_log']);

      // Call 0 = first solve, Call 1 = reportEpisodeResult, Call 2 = second solve
      const thirdCallPayload = (service.solve as ReturnType<typeof vi.fn>).mock.calls[2][1];

      expect(canonicalize(firstCallPayload)).toBe(canonicalize(thirdCallPayload));
    });
  });

  // ===========================================================================
  // Temporal mode payload isolation (Rig C, Phase 3A)
  // ===========================================================================

  describe('temporal mode payload isolation', () => {
    const mcData = {
      itemsByName: {
        stick: { id: 1, name: 'stick' },
        oak_planks: { id: 2, name: 'oak_planks' },
      },
      items: {
        1: { id: 1, name: 'stick' },
        2: { id: 2, name: 'oak_planks' },
      },
      recipes: {
        1: [
          {
            result: { id: 1, count: 4 },
            ingredients: [2, 2],
          },
        ],
      },
    };

    it('mode=off produces identical payload to default (no temporal fields)', async () => {
      // Call with explicit mode=off
      await solver.solveCraftingGoal('stick', [], mcData, ['oak_log'], { mode: 'off' });

      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];

      // Must NOT have temporal fields
      expect(payload).not.toHaveProperty('currentTickBucket');
      expect(payload).not.toHaveProperty('horizonBucket');
      expect(payload).not.toHaveProperty('bucketSizeTicks');
      expect(payload).not.toHaveProperty('slots');

      // Payload must match the existing golden-master snapshot
      const stablePayload = {
        contractVersion: payload.contractVersion,
        solverId: payload.solverId,
        inventory: payload.inventory,
        goal: payload.goal,
        nearbyBlocks: payload.nearbyBlocks,
        rules: payload.rules,
        maxNodes: payload.maxNodes,
        useLearning: payload.useLearning,
      };
      const snapshot = canonicalize(stablePayload);
      expect(snapshot).toMatchSnapshot();
    });

    it('mode=local_only produces identical Sterling payload (temporal stays local)', async () => {
      await solver.solveCraftingGoal('stick', [], mcData, ['oak_log'], {
        mode: 'local_only',
        nowTicks: 1000,
      });

      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];

      // Must NOT have temporal fields — local_only keeps them local
      expect(payload).not.toHaveProperty('currentTickBucket');
      expect(payload).not.toHaveProperty('horizonBucket');
      expect(payload).not.toHaveProperty('bucketSizeTicks');
      expect(payload).not.toHaveProperty('slots');

      // Canonical payload matches off mode
      const stablePayload = {
        contractVersion: payload.contractVersion,
        solverId: payload.solverId,
        inventory: payload.inventory,
        goal: payload.goal,
        nearbyBlocks: payload.nearbyBlocks,
        rules: payload.rules,
        maxNodes: payload.maxNodes,
        useLearning: payload.useLearning,
      };
      const snapshot = canonicalize(stablePayload);
      expect(snapshot).toMatchSnapshot();
    });

    it('mode=undefined (omitted) produces identical payload to default', async () => {
      // Call without temporal options (existing behavior)
      await solver.solveCraftingGoal('stick', [], mcData, ['oak_log']);

      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];

      expect(payload).not.toHaveProperty('currentTickBucket');
      expect(payload).not.toHaveProperty('slots');
    });

    it('rules have no durationTicks or requiresSlotType in off mode', async () => {
      await solver.solveCraftingGoal('stick', [], mcData, ['oak_log']);

      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];
      const rules = payload.rules as Array<Record<string, unknown>>;

      for (const rule of rules) {
        expect(rule).not.toHaveProperty('durationTicks');
        expect(rule).not.toHaveProperty('requiresSlotType');
      }
    });

    it('mine-only rules in local_only mode do not false-deadlock', async () => {
      await solver.solveCraftingGoal(
        'stick',
        [],
        // mcData with only mine rules — no furnace requirement
        {
          itemsByName: {
            iron_ingot: { id: 10, name: 'iron_ingot' },
          },
          items: {
            10: { id: 10, name: 'iron_ingot' },
          },
          recipes: {},
        },
        [],
        {
          mode: 'local_only',
          nowTicks: 0,
          // No slots observed and no nearby furnace blocks = no furnace slots
          // But mine rules don't require furnace, so no deadlock expected
        },
      );

      // mine:iron_ingot doesn't need a furnace — Sterling should be called
      expect(service.solve).toHaveBeenCalledTimes(1);
    });

    it('deadlock gating fires when enrichment detects capacity deadlock', async () => {
      // buildCraftingRules only generates mine/craft/place rules (never smelt),
      // so deadlock via solveCraftingGoal's mcData input alone is not possible
      // today. This test verifies the gating works by testing at the enrichment
      // boundary directly — the same code path the solver uses.
      //
      // Import the enrichment entrypoint and reference adapter to prove the
      // deadlock check → early return path works.
      const { computeTemporalEnrichment: compute } = await import('../../temporal/temporal-enrichment');
      const { P03ReferenceAdapter: Adapter } = await import('../primitives/p03/p03-reference-adapter');
      const { MAX_WAIT_BUCKETS, HORIZON_BUCKETS, MINECRAFT_BUCKET_SIZE_TICKS } = await import('../../temporal/time-state');

      const adapter = new Adapter(MAX_WAIT_BUCKETS, 8);

      // Rules with needsFurnace=true — like a future smelt rule
      const rules = [
        {
          action: 'smelt:iron_ore',
          actionType: 'smelt' as const,
          produces: [{ name: 'iron_ingot', count: 1 }],
          consumes: [{ name: 'iron_ore', count: 1 }],
          requires: [],
          needsTable: false,
          needsFurnace: true,
          baseCost: 1,
        },
      ];

      const enrichment = compute({
        mode: 'local_only',
        adapter,
        stateInput: {
          nowTicks: 0,
          nearbyBlocks: [],           // no furnace blocks nearby
          slotsObserved: undefined,   // no slots observed
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules,
      });

      // Deadlock should fire: needsFurnace=true rule but no furnace slots
      expect(enrichment.deadlock).toBeDefined();
      expect(enrichment.deadlock!.isDeadlock).toBe(true);
      // Exactly ['furnace'] — no extraneous slot types, no missing ones
      expect(enrichment.deadlock!.blockedSlotTypes).toEqual(['furnace']);

      // This is exactly what the solver checks before calling Sterling:
      // if (enrichment.deadlock?.isDeadlock) return early without calling solve
    });

    it('sterling_temporal mode attaches temporal fields to payload', async () => {
      // Include multiple furnace blocks to verify canonical slot ordering
      await solver.solveCraftingGoal('stick', [], mcData, ['furnace', 'smoker', 'furnace'], {
        mode: 'sterling_temporal',
        nowTicks: 500,
      });

      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];

      expect(payload).toHaveProperty('currentTickBucket');
      expect(payload).toHaveProperty('horizonBucket');
      expect(payload).toHaveProperty('bucketSizeTicks');
      expect(payload).toHaveProperty('slots');
      expect(payload.currentTickBucket).toBe(5); // 500 / 100
      expect(Number.isInteger(payload.currentTickBucket)).toBe(true);

      // Slots must be canonically ordered by (type ASC, readyAtBucket ASC, id ASC)
      const slots = payload.slots as Array<{ id: string; type: string; readyAtBucket: number }>;
      expect(slots.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < slots.length; i++) {
        const prev = slots[i - 1];
        const curr = slots[i];
        const typeCmp = prev.type.localeCompare(curr.type);
        if (typeCmp === 0) {
          const readyCmp = prev.readyAtBucket - curr.readyAtBucket;
          if (readyCmp === 0) {
            expect(prev.id.localeCompare(curr.id)).toBeLessThanOrEqual(0);
          } else {
            expect(readyCmp).toBeLessThanOrEqual(0);
          }
        } else {
          expect(typeCmp).toBeLessThanOrEqual(0);
        }
      }
    });

    it('rule durationTicks and requiresSlotType never leak into Sterling payload', async () => {
      // Even in local_only mode where enrichment runs, the payload rules
      // sent to Sterling must not contain temporal annotation fields
      await solver.solveCraftingGoal('stick', [], mcData, ['furnace'], {
        mode: 'local_only',
        nowTicks: 1000,
      });

      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];
      const rules = payload.rules as Array<Record<string, unknown>>;

      for (const rule of rules) {
        expect(rule).not.toHaveProperty('durationTicks');
        expect(rule).not.toHaveProperty('requiresSlotType');
      }

      // Top-level temporal state fields must also stay local in local_only
      expect(payload).not.toHaveProperty('currentTickBucket');
      expect(payload).not.toHaveProperty('horizonBucket');
      expect(payload).not.toHaveProperty('bucketSizeTicks');
      expect(payload).not.toHaveProperty('slots');
    });

    it('rule durationTicks and requiresSlotType never leak in sterling_temporal mode', async () => {
      // Even in sterling_temporal mode, temporal fields on rules stay local.
      // Only the top-level temporal state fields are sent to Sterling.
      await solver.solveCraftingGoal('stick', [], mcData, ['furnace'], {
        mode: 'sterling_temporal',
        nowTicks: 1000,
      });

      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];
      const rules = payload.rules as Array<Record<string, unknown>>;

      for (const rule of rules) {
        expect(rule).not.toHaveProperty('durationTicks');
        expect(rule).not.toHaveProperty('requiresSlotType');
      }
    });
  });

  // ===========================================================================
  // A.1: Composite goal test — wire format supports multi-item goals
  // ===========================================================================

  describe('composite goal format', () => {
    it('wire payload goal field is Record<string, number> supporting multiple items', () => {
      const compositeGoal = { stick: 4, crafting_table: 1 };
      const canonical = canonicalize(compositeGoal);
      // Deterministic output proves the wire format works for multi-item goals
      expect(canonical).toBe('{"crafting_table":1,"stick":4}');
      // solveCraftingGoal currently builds single-item goals, but the wire format
      // already supports composites — this test documents that capability.
    });
  });

  // ===========================================================================
  // A.2: Substitute-allowed variant test — recipe variants
  // ===========================================================================

  describe('substitute-allowed variant rules', () => {
    // mcData with two recipe variants for stick (contrived but proves variant wiring)
    const mcDataWithVariants = {
      itemsByName: {
        stick: { id: 1, name: 'stick' },
        oak_planks: { id: 2, name: 'oak_planks' },
        birch_planks: { id: 3, name: 'birch_planks' },
      },
      items: {
        1: { id: 1, name: 'stick' },
        2: { id: 2, name: 'oak_planks' },
        3: { id: 3, name: 'birch_planks' },
      },
      recipes: {
        1: [
          { result: { id: 1, count: 4 }, ingredients: [2, 2] },
          { result: { id: 1, count: 4 }, ingredients: [3, 3] },
        ],
      },
    };

    it('buildCraftingRules generates variant rules for multiple recipe variants', () => {
      const rules = buildCraftingRules(mcDataWithVariants, 'stick');

      // Should have at least two craft:stick variants
      const stickRules = rules.filter(r => r.action.startsWith('craft:stick'));
      expect(stickRules.length).toBeGreaterThanOrEqual(2);

      // One uses oak_planks, the other uses birch_planks
      const usesOak = stickRules.some(r =>
        r.consumes.some(c => c.name === 'oak_planks')
      );
      const usesBirch = stickRules.some(r =>
        r.consumes.some(c => c.name === 'birch_planks')
      );
      expect(usesOak).toBe(true);
      expect(usesBirch).toBe(true);
    });

    it('both variant rules appear in the wire payload sent to Sterling', async () => {
      await solver.solveCraftingGoal('stick', [], mcDataWithVariants, []);

      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];
      const ruleActions = (payload.rules as Array<{ action: string }>).map(r => r.action);

      const stickVariants = ruleActions.filter(a => a.startsWith('craft:stick'));
      expect(stickVariants.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ===========================================================================
// Building Solver
// ===========================================================================

describe('MinecraftBuildingSolver — golden-master', () => {
  let service: SterlingReasoningService;
  let solver: MinecraftBuildingSolver;

  beforeEach(() => {
    service = createMockService();
    solver = new MinecraftBuildingSolver(service);
  });

  // ---- toTaskSteps label format ----

  it('toTaskSteps produces correct labels for a 3-step building result', () => {
    const result: BuildingSolveResult = {
      solved: true,
      steps: [
        {
          moduleId: 'site_prep_1',
          moduleType: 'prep_site',
          materialsNeeded: [],
          resultingProgress: 1,
          resultingInventory: {},
        },
        {
          moduleId: 'walls_1',
          moduleType: 'apply_module',
          materialsNeeded: [
            { name: 'cobblestone', count: 24 },
            { name: 'oak_log', count: 4 },
          ],
          resultingProgress: 2,
          resultingInventory: {},
        },
        {
          moduleId: 'door_1',
          moduleType: 'place_feature',
          materialsNeeded: [{ name: 'oak_door', count: 1 }],
          resultingProgress: 3,
          resultingInventory: {},
        },
      ],
      totalNodes: 10,
      durationMs: 30,
    };

    const steps = solver.toTaskSteps(result);

    expect(steps).toHaveLength(3);
    expect(steps[0].label).toBe(
      'Leaf: minecraft.prepare_site (module=site_prep_1)'
    );
    expect(steps[1].label).toBe(
      'Leaf: minecraft.build_module (module=walls_1, materials=cobblestonex24, oak_logx4)'
    );
    expect(steps[2].label).toBe(
      'Leaf: minecraft.place_feature (module=door_1)'
    );

    expect(steps.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(steps[0].estimatedDuration).toBe(10000); // prep_site
    expect(steps[1].estimatedDuration).toBe(20000); // apply_module
    expect(steps[2].estimatedDuration).toBe(5000); // place_feature
  });

  // ---- toTaskStepsWithReplan deficit path ----

  it('toTaskStepsWithReplan inserts acquisition steps + replan sentinel for deficit', () => {
    const result: BuildingSolveResult = {
      solved: false,
      steps: [],
      totalNodes: 5,
      durationMs: 20,
      needsMaterials: {
        deficit: { cobblestone: 12, oak_log: 2 },
        blockedModules: ['walls_1'],
        currentProgress: 0,
      },
    };

    const steps = solver.toTaskStepsWithReplan(result, 'basic_shelter_5x5__p0stub');

    // 2 acquisition steps + 1 replan sentinel
    expect(steps).toHaveLength(3);

    expect(steps[0].label).toBe(
      'Leaf: minecraft.acquire_material (item=cobblestone, count=12)'
    );
    expect(steps[0].meta).toMatchObject({
      domain: 'building',
      leaf: 'acquire_material',
      item: 'cobblestone',
      count: 12,
      templateId: 'basic_shelter_5x5__p0stub',
    });

    expect(steps[1].label).toBe(
      'Leaf: minecraft.acquire_material (item=oak_log, count=2)'
    );

    expect(steps[2].label).toBe(
      'Leaf: minecraft.replan_building (templateId=basic_shelter_5x5__p0stub)'
    );
    expect(steps[2].meta).toMatchObject({
      domain: 'building',
      leaf: 'replan_building',
      templateId: 'basic_shelter_5x5__p0stub',
    });

    expect(steps.map((s) => s.order)).toEqual([1, 2, 3]);
  });

  // ---- toTaskStepsWithReplan normal path ----

  it('toTaskStepsWithReplan produces building steps when solved', () => {
    const result: BuildingSolveResult = {
      solved: true,
      steps: [
        {
          moduleId: 'floor_1',
          moduleType: 'apply_module',
          materialsNeeded: [{ name: 'cobblestone', count: 25 }],
          resultingProgress: 1,
          resultingInventory: {},
        },
      ],
      totalNodes: 8,
      durationMs: 25,
    };

    const steps = solver.toTaskStepsWithReplan(result, 'basic_shelter_5x5');

    expect(steps).toHaveLength(1);
    expect(steps[0].label).toBe(
      'Leaf: minecraft.build_module (module=floor_1, materials=cobblestonex25)'
    );
    expect(steps[0].meta).toMatchObject({
      domain: 'building',
      leaf: 'build_module',
      moduleId: 'floor_1',
      moduleType: 'apply_module',
      templateId: 'basic_shelter_5x5',
    });
  });

  // ---- solveBuildingPlan returns planId ----

  it('solveBuildingPlan returns planId from Sterling metrics', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [],
      discoveredNodes: [],
      searchEdges: [],
      metrics: { planId: 'bld-plan-456', steps: [] },
      durationMs: 40,
    });

    const result = await solver.solveBuildingPlan(
      'basic_shelter_5x5',
      'N',
      ['walls_1'],
      { cobblestone: 50 },
      { terrain: 'flat', biome: 'plains', hasTreesNearby: true, hasWaterNearby: false, siteCaps: 'flat_5x5_clear' },
      [{ moduleId: 'walls_1', moduleType: 'apply_module', requiresModules: [], materialsNeeded: [], placementFeasible: true, baseCost: 1 }]
    );

    expect(result.planId).toBe('bld-plan-456');
  });

  // ---- reportEpisodeResult payload shape ----

  it('reportEpisodeResult sends correct payload with explicit planId', () => {
    solver.reportEpisodeResult(
      'basic_shelter_5x5',
      true,
      ['walls_1'],
      undefined,
      undefined,
      'bld-plan-456',
      true
    );

    expect(service.solve).toHaveBeenCalledTimes(1);

    const reportCall = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(reportCall[0]).toBe('building');
    expect(reportCall[1]).toMatchObject({
      command: 'report_episode',
      domain: 'building',
      contractVersion: 1,
      planId: 'bld-plan-456',
      templateId: 'basic_shelter_5x5',
      success: true,
      executedModuleIds: ['walls_1'],
      isStub: true,
    });
  });

  // ---- unavailable result ----

  it('returns unavailable result when service is down', async () => {
    (service.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await solver.solveBuildingPlan(
      'basic_shelter_5x5',
      'N',
      ['walls_1'],
      {},
      { terrain: 'flat', biome: 'plains', hasTreesNearby: false, hasWaterNearby: false, siteCaps: 'flat_5x5_clear' },
      [{ moduleId: 'walls_1', moduleType: 'apply_module', requiresModules: [], materialsNeeded: [], placementFeasible: true, baseCost: 1 }]
    );

    expect(result.solved).toBe(false);
    expect(result.error).toBe('Sterling reasoning service unavailable');
    expect(result.steps).toEqual([]);
  });

  // ===========================================================================
  // solveMeta evidence — proves bundle wiring runs on every solve path
  // ===========================================================================

  describe('solveMeta bundle attachment', () => {
    const modules = [
      { moduleId: 'walls_1', moduleType: 'apply_module' as const, requiresModules: [], materialsNeeded: [{ name: 'cobblestone', count: 24 }], placementFeasible: true, baseCost: 1 },
    ];
    const siteState = { terrain: 'flat' as const, biome: 'plains', hasTreesNearby: false, hasWaterNearby: false, siteCaps: 'flat_5x5_clear' };

    it('solved path attaches solveMeta with correct bundle shape', async () => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [{ source: 'S0', target: 'S1' }],
        discoveredNodes: ['S0', 'S1'],
        searchEdges: [],
        metrics: {
          planId: 'bld-plan-solved',
          steps: [{ moduleId: 'walls_1', moduleType: 'apply_module', materialsNeeded: [{ name: 'cobblestone', count: 24 }], resultingProgress: 1, resultingInventory: {} }],
        },
        durationMs: 30,
      });

      const result = await solver.solveBuildingPlan(
        'basic_shelter_5x5', 'N', ['walls_1'], { cobblestone: 50 }, siteState, modules
      );

      expect(result.solved).toBe(true);
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(1);

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.input.solverId).toBe('minecraft.building');
      expect(bundle.input.definitionHash).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.input.definitionCount).toBe(1);
      expect(bundle.output.solved).toBe(true);
      expect(bundle.output.planId).toBe('bld-plan-solved');
      expect(bundle.compatReport.valid).toBe(true);
      expect(bundle.compatReport.definitionCount).toBe(1);
      // Building uses modules, not rules — ruleCount should be module count
      expect(bundle.compatReport.issues).toEqual([]);
      expect(bundle.bundleId).toMatch(/^minecraft\.building:[0-9a-f]{16}$/);
    });

    it('unsolved path attaches solveMeta with solved=false', async () => {
      // Default mock returns solutionFound: false
      const result = await solver.solveBuildingPlan(
        'basic_shelter_5x5', 'N', ['walls_1'], {}, siteState, modules
      );

      expect(result.solved).toBe(false);
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(1);

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.output.solved).toBe(false);
      expect(bundle.output.searchStats.solutionPathLength).toBe(0);
      expect(bundle.bundleId).toMatch(/^minecraft\.building:[0-9a-f]{16}$/);
    });

    it('solved bundle includes rationale with correct maxNodes and compat', async () => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [{ source: 'S0', target: 'S1' }],
        discoveredNodes: ['S0', 'S1'],
        searchEdges: [],
        metrics: {
          planId: 'bld-plan-rationale',
          steps: [{ moduleId: 'walls_1', moduleType: 'apply_module', materialsNeeded: [], resultingProgress: 1, resultingInventory: {} }],
        },
        durationMs: 20,
      });

      const result = await solver.solveBuildingPlan(
        'basic_shelter_5x5', 'N', ['walls_1'], { cobblestone: 50 }, siteState, modules
      );

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.output.rationale).toBeDefined();
      expect(bundle.output.rationale!.boundingConstraints.maxNodes).toBe(2000);
      expect(bundle.output.rationale!.shapingEvidence.compatValid).toBe(true);
      expect(bundle.output.rationale!.shapingEvidence.issueCount).toBe(0);
    });

    it('needsMaterials path attaches solveMeta with solved=false', async () => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: false,
        solutionPath: [],
        discoveredNodes: ['S0'],
        searchEdges: [],
        metrics: {
          planId: 'bld-plan-deficit',
          needsMaterials: { deficit: { cobblestone: 12 }, blockedModules: ['walls_1'], currentProgress: 0 },
        },
        durationMs: 10,
      });

      const result = await solver.solveBuildingPlan(
        'basic_shelter_5x5', 'N', ['walls_1'], {}, siteState, modules
      );

      expect(result.solved).toBe(false);
      expect(result.needsMaterials).toBeDefined();
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(1);

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.output.solved).toBe(false);
      expect(bundle.bundleId).toMatch(/^minecraft\.building:[0-9a-f]{16}$/);
    });
  });

  // ===========================================================================
  // Payload-equivalence snapshot — proves outbound payload stability
  // ===========================================================================

  describe('outbound payload stability', () => {
    it('solve payload matches canonical snapshot', async () => {
      const modules = [
        { moduleId: 'walls_1', moduleType: 'apply_module' as const, requiresModules: [], materialsNeeded: [], placementFeasible: true, baseCost: 1 },
      ];
      const siteState = { terrain: 'flat' as const, biome: 'plains', hasTreesNearby: false, hasWaterNearby: false, siteCaps: 'flat_5x5_clear' };

      await solver.solveBuildingPlan(
        'basic_shelter_5x5', 'N', ['walls_1'], { cobblestone: 50 }, siteState, modules
      );

      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];

      // Capture the payload fields that Sterling sees.
      // NOTE: command and domain are excluded — SterlingClient injects those.
      const stablePayload = {
        contractVersion: payload.contractVersion,
        templateId: payload.templateId,
        facing: payload.facing,
        goalModules: payload.goalModules,
        inventory: payload.inventory,
        siteState: payload.siteState,
        modules: payload.modules,
        maxNodes: payload.maxNodes,
        useLearning: payload.useLearning,
      };

      const snapshot = canonicalize(stablePayload);
      expect(snapshot).toMatchSnapshot();
    });
  });
});

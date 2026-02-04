/**
 * Label Mapping Regression Tests
 *
 * Tripwire tests that verify the exact bug fixed in the Sterling step mapping:
 * Python emits edge labels as strings ("craft:oak_planks"), but the TypeScript
 * solver previously expected objects ({ action: "craft:oak_planks" }).
 *
 * These tests exercise:
 * 1. extractActionName with all label union variants
 * 2. mapSolutionToSteps with string labels on solution_path edges
 * 3. mapSolutionToSteps with string labels on search_edge fallback
 * 4. mapSolutionToSteps with missing labels (degradation path)
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractActionName } from '../label-utils';
import { MinecraftCraftingSolver } from '../minecraft-crafting-solver';
import { MinecraftToolProgressionSolver } from '../minecraft-tool-progression-solver';
import { buildToolProgressionRules } from '../minecraft-tool-progression-rules';
import { SterlingReasoningService } from '../sterling-reasoning-service';
import type { SterlingSolveResult } from '@conscious-bot/core';

// ============================================================================
// extractActionName unit tests
// ============================================================================

describe('extractActionName', () => {
  it('extracts from string label (Python format)', () => {
    expect(extractActionName('craft:oak_planks')).toBe('craft:oak_planks');
  });

  it('extracts from object with .action property', () => {
    expect(extractActionName({ action: 'mine:oak_log' })).toBe('mine:oak_log');
  });

  it('extracts from object with .label property (legacy)', () => {
    expect(extractActionName({ label: 'smelt:iron_ingot' })).toBe('smelt:iron_ingot');
  });

  it('prefers .action over .label when both present', () => {
    expect(extractActionName({ action: 'craft:stick', label: 'wrong' })).toBe('craft:stick');
  });

  it('returns null for undefined', () => {
    expect(extractActionName(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(extractActionName(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractActionName('')).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(extractActionName({})).toBeNull();
  });

  it('returns null for object with non-string action', () => {
    expect(extractActionName({ action: 42 })).toBeNull();
  });

  it('returns null for number', () => {
    expect(extractActionName(123)).toBeNull();
  });

  it('returns null for boolean', () => {
    expect(extractActionName(true)).toBeNull();
  });
});

// ============================================================================
// mapSolutionToSteps integration — string labels
// ============================================================================

describe('CraftingSolver string label mapping', () => {
  let service: SterlingReasoningService;
  let solver: MinecraftCraftingSolver;

  // Minimal mcData for stick (requires oak_planks)
  const mcData = {
    itemsByName: {
      stick: { id: 1, name: 'stick' },
      oak_planks: { id: 2, name: 'oak_planks' },
      oak_log: { id: 3, name: 'oak_log' },
    },
    items: {
      1: { id: 1, name: 'stick' },
      2: { id: 2, name: 'oak_planks' },
      3: { id: 3, name: 'oak_log' },
    },
    recipes: {
      1: [{ result: { id: 1, count: 4 }, ingredients: [2, 2] }],
      2: [{ result: { id: 2, count: 4 }, ingredients: [3] }],
    },
  };

  beforeEach(() => {
    service = new SterlingReasoningService({
      url: 'ws://localhost:9999',
      enabled: false, // Disable to prevent auto-connect in tests
    });
    vi.spyOn(service, 'isAvailable').mockReturnValue(true);
    vi.spyOn(service, 'solve').mockResolvedValue({
      solutionFound: false,
      solutionPath: [],
      discoveredNodes: [],
      searchEdges: [],
      metrics: {},
      durationMs: 0,
    });
    solver = new MinecraftCraftingSolver(service);
  });

  it('maps steps correctly when solution_path edges have string labels', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [
        { source: 'S0', target: 'S1', label: 'craft:oak_planks' },
        { source: 'S1', target: 'S2', label: 'craft:stick' },
      ],
      discoveredNodes: [
        { id: 'S0', g: 0, h: 2, distance: 0 },
        { id: 'S1', g: 1, h: 1, distance: 1 },
        { id: 'S2', g: 2, h: 0, distance: 2, isSolution: true },
      ],
      searchEdges: [
        { source: 'S0', target: 'S1', label: 'craft:oak_planks' },
        { source: 'S1', target: 'S2', label: 'craft:stick' },
      ],
      metrics: { planId: 'test-string-labels' },
      durationMs: 5,
    } satisfies SterlingSolveResult);

    const result = await solver.solveCraftingGoal('stick', [], mcData, []);

    expect(result.solved).toBe(true);
    expect(result.steps).toHaveLength(2);

    // Step 1: craft oak_planks
    expect(result.steps[0].action).toBe('craft:oak_planks');
    expect(result.steps[0].actionType).toBe('craft');
    expect(result.steps[0].produces).toEqual([{ name: 'oak_planks', count: 4 }]);
    expect(result.steps[0].consumes).toEqual([{ name: 'oak_log', count: 1 }]);

    // Step 2: craft stick
    expect(result.steps[1].action).toBe('craft:stick');
    expect(result.steps[1].actionType).toBe('craft');
    expect(result.steps[1].produces).toEqual([{ name: 'stick', count: 4 }]);
    expect(result.steps[1].consumes).toEqual([{ name: 'oak_planks', count: 2 }]);

    // No "unknown-*" actions
    expect(result.steps.every(s => !s.action.startsWith('unknown'))).toBe(true);
  });

  it('falls back to search_edge labels when solution_path labels are missing', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [
        // No label field — simulates older Sterling server
        { source: 'S0', target: 'S1' },
      ],
      discoveredNodes: [
        { id: 'S0', g: 0, h: 1, distance: 0 },
        { id: 'S1', g: 1, h: 0, distance: 1, isSolution: true },
      ],
      searchEdges: [
        // search_edge has the label as a string
        { source: 'S0', target: 'S1', label: 'craft:stick' },
      ],
      metrics: { planId: 'test-fallback' },
      durationMs: 3,
    } satisfies SterlingSolveResult);

    const result = await solver.solveCraftingGoal('stick', [], mcData, []);

    expect(result.solved).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].action).toBe('craft:stick');
    expect(result.steps[0].produces).toEqual([{ name: 'stick', count: 4 }]);
    expect(result.steps[0].consumes).toEqual([{ name: 'oak_planks', count: 2 }]);
  });

  it('maps steps when search_edge labels are objects (backward compat)', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [{ source: 'S0', target: 'S1' }],
      discoveredNodes: [
        { id: 'S0', g: 0, h: 1, distance: 0 },
        { id: 'S1', g: 1, h: 0, distance: 1, isSolution: true },
      ],
      searchEdges: [
        { source: 'S0', target: 'S1', label: { action: 'craft:stick' } },
      ],
      metrics: { planId: 'test-object-labels' },
      durationMs: 3,
    } satisfies SterlingSolveResult);

    const result = await solver.solveCraftingGoal('stick', [], mcData, []);

    expect(result.solved).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].action).toBe('craft:stick');
    expect(result.steps[0].produces).toEqual([{ name: 'stick', count: 4 }]);
  });

  it('produces unknown-* when both solution_path and search_edge labels are absent', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [{ source: 'S0', target: 'S1' }],
      discoveredNodes: [
        { id: 'S0', g: 0, h: 1, distance: 0 },
        { id: 'S1', g: 1, h: 0, distance: 1, isSolution: true },
      ],
      // No search edges at all — no way to recover action name
      searchEdges: [],
      metrics: { planId: 'test-no-labels' },
      durationMs: 2,
    } satisfies SterlingSolveResult);

    const result = await solver.solveCraftingGoal('stick', [], mcData, []);

    expect(result.solved).toBe(true);
    expect(result.steps).toHaveLength(1);
    // This is the degraded path — unknown action with empty produces/consumes
    expect(result.steps[0].action).toBe('unknown-0');
    expect(result.steps[0].produces).toEqual([]);
    expect(result.steps[0].consumes).toEqual([]);
    // Per-step degradation marker
    expect(result.steps[0].degraded).toBe(true);
    expect(result.steps[0].degradedReason).toBe('no_label');

    // Task-level degradation metadata is surfaced
    expect(result.mappingDegraded).toBe(true);
    expect(result.noActionLabelEdges).toBe(1);
    expect(result.unmatchedRuleEdges).toBe(0);
  });

  it('does not set mappingDegraded when all edges map successfully', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [
        { source: 'S0', target: 'S1', label: 'craft:stick' },
      ],
      discoveredNodes: [
        { id: 'S0', g: 0, h: 1, distance: 0 },
        { id: 'S1', g: 1, h: 0, distance: 1, isSolution: true },
      ],
      searchEdges: [],
      metrics: { planId: 'test-clean-mapping' },
      durationMs: 3,
    } satisfies SterlingSolveResult);

    const result = await solver.solveCraftingGoal('stick', [], mcData, []);

    expect(result.solved).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].action).toBe('craft:stick');
    expect(result.mappingDegraded).toBeUndefined();
    expect(result.noActionLabelEdges).toBeUndefined();
  });

  it('tracks unmatchedRuleEdges when label exists but does not match any rule', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [
        { source: 'S0', target: 'S1', label: 'craft:nonexistent_item' },
      ],
      discoveredNodes: [
        { id: 'S0', g: 0, h: 1, distance: 0 },
        { id: 'S1', g: 1, h: 0, distance: 1, isSolution: true },
      ],
      searchEdges: [],
      metrics: { planId: 'test-unmatched' },
      durationMs: 2,
    } satisfies SterlingSolveResult);

    const result = await solver.solveCraftingGoal('stick', [], mcData, []);

    expect(result.solved).toBe(true);
    expect(result.mappingDegraded).toBe(true);
    expect(result.noActionLabelEdges).toBe(0);
    expect(result.unmatchedRuleEdges).toBe(1);
    // Step has the label as the action (not unknown-*) since a label exists
    expect(result.steps[0].action).toBe('craft:nonexistent_item');
    // Per-step degradation marker
    expect(result.steps[0].degraded).toBe(true);
    expect(result.steps[0].degradedReason).toBe('unmatched_rule');
  });

  it('detects search-edge collisions when same (source,target) has different actions', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      // solution_path has no label — forces fallback to search_edge
      solutionPath: [{ source: 'S0', target: 'S1' }],
      discoveredNodes: [
        { id: 'S0', g: 0, h: 1, distance: 0 },
        { id: 'S1', g: 1, h: 0, distance: 1, isSolution: true },
      ],
      // Two search edges for same (S0,S1) with different actions
      searchEdges: [
        { source: 'S0', target: 'S1', label: 'craft:stick' },
        { source: 'S0', target: 'S1', label: 'craft:oak_planks' },
      ],
      metrics: { planId: 'test-collision' },
      durationMs: 2,
    } satisfies SterlingSolveResult);

    const result = await solver.solveCraftingGoal('stick', [], mcData, []);

    expect(result.solved).toBe(true);
    // First entry wins — craft:stick is used
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].action).toBe('craft:stick');
    expect(result.steps[0].produces).toEqual([{ name: 'stick', count: 4 }]);

    // Collision is detected and reported
    expect(result.mappingDegraded).toBe(true);
    expect(result.searchEdgeCollisions).toBe(1);
    expect(result.noActionLabelEdges).toBe(0);
    expect(result.unmatchedRuleEdges).toBe(0);
  });

  it('does not count collisions when same (source,target) has same action', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [{ source: 'S0', target: 'S1', label: 'craft:stick' }],
      discoveredNodes: [
        { id: 'S0', g: 0, h: 1, distance: 0 },
        { id: 'S1', g: 1, h: 0, distance: 1, isSolution: true },
      ],
      // Duplicate edges with same action — not a collision
      searchEdges: [
        { source: 'S0', target: 'S1', label: 'craft:stick' },
        { source: 'S0', target: 'S1', label: 'craft:stick' },
      ],
      metrics: { planId: 'test-no-collision' },
      durationMs: 2,
    } satisfies SterlingSolveResult);

    const result = await solver.solveCraftingGoal('stick', [], mcData, []);

    expect(result.solved).toBe(true);
    expect(result.mappingDegraded).toBeUndefined();
    expect(result.searchEdgeCollisions).toBeUndefined();
  });

  it('toTaskSteps generates correct leaf args from string-label-resolved steps', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [
        { source: 'S0', target: 'S1', label: 'mine:oak_log' },
        { source: 'S1', target: 'S2', label: 'craft:oak_planks' },
        { source: 'S2', target: 'S3', label: 'craft:stick' },
      ],
      discoveredNodes: [
        { id: 'S0', g: 0, h: 3, distance: 0 },
        { id: 'S1', g: 1, h: 2, distance: 1 },
        { id: 'S2', g: 2, h: 1, distance: 2 },
        { id: 'S3', g: 3, h: 0, distance: 3, isSolution: true },
      ],
      searchEdges: [],
      metrics: { planId: 'test-leaf-args' },
      durationMs: 8,
    } satisfies SterlingSolveResult);

    const result = await solver.solveCraftingGoal('stick', [], mcData, []);
    const taskSteps = solver.toTaskSteps(result);

    expect(taskSteps).toHaveLength(3);

    // mine step
    expect(taskSteps[0]?.meta?.leaf).toBe('acquire_material');
    expect(taskSteps[0]?.meta?.action).toBe('mine:oak_log');
    expect(taskSteps[0]?.meta?.produces).toEqual([{ name: 'oak_log', count: 1 }]);

    // craft oak_planks step
    expect(taskSteps[1]?.meta?.leaf).toBe('craft_recipe');
    expect(taskSteps[1]?.meta?.action).toBe('craft:oak_planks');
    expect(taskSteps[1]?.meta?.produces).toEqual([{ name: 'oak_planks', count: 4 }]);

    // craft stick step
    expect(taskSteps[2]?.meta?.leaf).toBe('craft_recipe');
    expect(taskSteps[2]?.meta?.action).toBe('craft:stick');
    expect(taskSteps[2]?.meta?.produces).toEqual([{ name: 'stick', count: 4 }]);

    // Non-degraded steps should not have degradation markers
    expect(taskSteps[0]?.meta?.degraded).toBeUndefined();
    expect(taskSteps[1]?.meta?.degraded).toBeUndefined();
    expect(taskSteps[2]?.meta?.degraded).toBeUndefined();
  });

  // ========================================================================
  // Strict mapping mode
  // ========================================================================

  describe('strictMapping mode', () => {
    it('returns solved=false with empty steps when mapping is degraded', async () => {
      solver.strictMapping = true;

      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [
          // No label — will produce degraded step
          { source: 'S0', target: 'S1' },
        ],
        discoveredNodes: [
          { id: 'S0', g: 0, h: 1, distance: 0 },
          { id: 'S1', g: 1, h: 0, distance: 1, isSolution: true },
        ],
        searchEdges: [],
        metrics: { planId: 'test-strict-no-label' },
        durationMs: 2,
      } satisfies SterlingSolveResult);

      const result = await solver.solveCraftingGoal('stick', [], mcData, []);

      expect(result.solved).toBe(false);
      expect(result.steps).toEqual([]);
      expect(result.mappingDegraded).toBe(true);
      expect(result.noActionLabelEdges).toBe(1);
      expect(result.error).toContain('Step mapping degraded');
      expect(result.error).toContain('1 edges without label');
    });

    it('returns solved=false when mapping has unmatched rules in strict mode', async () => {
      solver.strictMapping = true;

      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [
          { source: 'S0', target: 'S1', label: 'craft:nonexistent_item' },
        ],
        discoveredNodes: [
          { id: 'S0', g: 0, h: 1, distance: 0 },
          { id: 'S1', g: 1, h: 0, distance: 1, isSolution: true },
        ],
        searchEdges: [],
        metrics: { planId: 'test-strict-unmatched' },
        durationMs: 2,
      } satisfies SterlingSolveResult);

      const result = await solver.solveCraftingGoal('stick', [], mcData, []);

      expect(result.solved).toBe(false);
      expect(result.steps).toEqual([]);
      expect(result.mappingDegraded).toBe(true);
      expect(result.unmatchedRuleEdges).toBe(1);
      expect(result.error).toContain('1 unmatched rules');
    });

    it('returns solved=false when mapping has search-edge collisions in strict mode', async () => {
      solver.strictMapping = true;

      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [{ source: 'S0', target: 'S1' }],
        discoveredNodes: [
          { id: 'S0', g: 0, h: 1, distance: 0 },
          { id: 'S1', g: 1, h: 0, distance: 1, isSolution: true },
        ],
        searchEdges: [
          { source: 'S0', target: 'S1', label: 'craft:stick' },
          { source: 'S0', target: 'S1', label: 'craft:oak_planks' },
        ],
        metrics: { planId: 'test-strict-collision' },
        durationMs: 2,
      } satisfies SterlingSolveResult);

      const result = await solver.solveCraftingGoal('stick', [], mcData, []);

      expect(result.solved).toBe(false);
      expect(result.steps).toEqual([]);
      expect(result.mappingDegraded).toBe(true);
      expect(result.searchEdgeCollisions).toBe(1);
    });

    it('still returns solved=true when mapping is clean in strict mode', async () => {
      solver.strictMapping = true;

      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [
          { source: 'S0', target: 'S1', label: 'craft:stick' },
        ],
        discoveredNodes: [
          { id: 'S0', g: 0, h: 1, distance: 0 },
          { id: 'S1', g: 1, h: 0, distance: 1, isSolution: true },
        ],
        searchEdges: [],
        metrics: { planId: 'test-strict-clean' },
        durationMs: 3,
      } satisfies SterlingSolveResult);

      const result = await solver.solveCraftingGoal('stick', [], mcData, []);

      expect(result.solved).toBe(true);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].action).toBe('craft:stick');
      expect(result.mappingDegraded).toBeUndefined();
    });

    it('preserves planId and solveMeta in strict mode failure', async () => {
      solver.strictMapping = true;

      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [{ source: 'S0', target: 'S1' }],
        discoveredNodes: [
          { id: 'S0', g: 0, h: 1, distance: 0 },
          { id: 'S1', g: 1, h: 0, distance: 1, isSolution: true },
        ],
        searchEdges: [],
        metrics: { planId: 'test-strict-meta' },
        durationMs: 5,
      } satisfies SterlingSolveResult);

      const result = await solver.solveCraftingGoal('stick', [], mcData, []);

      expect(result.solved).toBe(false);
      expect(result.planId).toBe('test-strict-meta');
      expect(result.solveMeta?.bundles).toHaveLength(1);
      expect(result.durationMs).toBe(5);
    });

    it('returns solved=false when both noLabel and unmatchedRule occur in same path', async () => {
      solver.strictMapping = true;

      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [
          { source: 'S0', target: 'S1' },                                // no label
          { source: 'S1', target: 'S2', label: 'craft:nonexistent_item' }, // unmatched rule
        ],
        discoveredNodes: [
          { id: 'S0', g: 0, h: 2, distance: 0 },
          { id: 'S1', g: 1, h: 1, distance: 1 },
          { id: 'S2', g: 2, h: 0, distance: 2, isSolution: true },
        ],
        searchEdges: [],
        metrics: { planId: 'test-strict-mixed' },
        durationMs: 3,
      } satisfies SterlingSolveResult);

      const result = await solver.solveCraftingGoal('stick', [], mcData, []);

      expect(result.solved).toBe(false);
      expect(result.steps).toEqual([]);
      expect(result.mappingDegraded).toBe(true);
      expect(result.noActionLabelEdges).toBe(1);
      expect(result.unmatchedRuleEdges).toBe(1);
      expect(result.searchEdgeCollisions).toBe(0);
      expect(result.error).toContain('1 edges without label');
      expect(result.error).toContain('1 unmatched rules');
    });

    it('returns solved=false when all three degradation types occur together', async () => {
      solver.strictMapping = true;

      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [
          { source: 'S0', target: 'S1' },                                // no label
          { source: 'S1', target: 'S2', label: 'craft:nonexistent_item' }, // unmatched rule
        ],
        discoveredNodes: [
          { id: 'S0', g: 0, h: 2, distance: 0 },
          { id: 'S1', g: 1, h: 1, distance: 1 },
          { id: 'S2', g: 2, h: 0, distance: 2, isSolution: true },
        ],
        // Collision on S0→S1 fallback
        searchEdges: [
          { source: 'S0', target: 'S1', label: 'craft:stick' },
          { source: 'S0', target: 'S1', label: 'craft:oak_planks' },
        ],
        metrics: { planId: 'test-strict-all-three' },
        durationMs: 3,
      } satisfies SterlingSolveResult);

      const result = await solver.solveCraftingGoal('stick', [], mcData, []);

      expect(result.solved).toBe(false);
      expect(result.steps).toEqual([]);
      expect(result.mappingDegraded).toBe(true);
      // S0→S1 has no solution_path label but gets resolved via search_edge fallback
      // to craft:stick (first entry wins), which IS a valid rule — so it maps successfully.
      // S1→S2 has label craft:nonexistent_item which doesn't match any rule.
      // Net: noLabelEdges=0 (resolved via fallback), unmatchedRuleEdges=1, collisions=1
      expect(result.unmatchedRuleEdges).toBe(1);
      expect(result.searchEdgeCollisions).toBe(1);
    });

    it('defaults to best-effort mode (strictMapping=false)', () => {
      const freshSolver = new MinecraftCraftingSolver(service);
      expect(freshSolver.strictMapping).toBe(false);
    });
  });

  it('toTaskSteps propagates degradation markers to step meta', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [
        { source: 'S0', target: 'S1', label: 'craft:stick' },
        { source: 'S1', target: 'S2' }, // no label — degraded
      ],
      discoveredNodes: [
        { id: 'S0', g: 0, h: 2, distance: 0 },
        { id: 'S1', g: 1, h: 1, distance: 1 },
        { id: 'S2', g: 2, h: 0, distance: 2, isSolution: true },
      ],
      searchEdges: [],
      metrics: { planId: 'test-step-degradation' },
      durationMs: 3,
    } satisfies SterlingSolveResult);

    const result = await solver.solveCraftingGoal('stick', [], mcData, []);
    const taskSteps = solver.toTaskSteps(result);

    expect(taskSteps).toHaveLength(2);

    // First step is clean
    expect(taskSteps[0]?.meta?.degraded).toBeUndefined();
    expect(taskSteps[0]?.meta?.action).toBe('craft:stick');

    // Second step is degraded
    expect(taskSteps[1]?.meta?.degraded).toBe(true);
    expect(taskSteps[1]?.meta?.degradedReason).toBe('no_label');
    expect(taskSteps[1]?.meta?.action).toBe('unknown-1');
  });
});

// ============================================================================
// ToolProgressionSolver strict mapping mode
// ============================================================================

describe('ToolProgressionSolver strict mapping mode', () => {
  let service: SterlingReasoningService;
  let solver: MinecraftToolProgressionSolver;

  beforeEach(() => {
    service = new SterlingReasoningService({
      url: 'ws://localhost:9999',
      enabled: false, // Disable to prevent auto-connect in tests
    });
    vi.spyOn(service, 'isAvailable').mockReturnValue(true);
    vi.spyOn(service, 'solve').mockResolvedValue({
      solutionFound: false,
      solutionPath: [],
      discoveredNodes: [],
      searchEdges: [],
      metrics: {},
      durationMs: 0,
    });
    solver = new MinecraftToolProgressionSolver(service);
  });

  it('defaults to best-effort mode (strictMapping=false)', () => {
    expect(solver.strictMapping).toBe(false);
  });

  it('returns solved=false when tier solve has degraded mapping in strict mode', async () => {
    solver.strictMapping = true;

    // Mock: solution found but solution_path has no label
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [
        { source: 'S0', target: 'S1' }, // no label → degraded
      ],
      discoveredNodes: [
        { id: 'S0', g: 0, h: 1, distance: 0 },
        { id: 'S1', g: 1, h: 0, distance: 1, isSolution: true },
      ],
      searchEdges: [],
      metrics: { planId: 'tp-strict-test' },
      durationMs: 4,
    } satisfies SterlingSolveResult);

    const result = await solver.solveToolProgression(
      'wooden_pickaxe',
      {},
      []
    );

    expect(result.solved).toBe(false);
    expect(result.steps).toEqual([]);
    expect(result.mappingDegraded).toBe(true);
    expect(result.noActionLabelEdges).toBeGreaterThan(0);
    expect(result.error).toContain('Step mapping degraded');
  });

  it('returns solved=true when mapping is clean in strict mode', async () => {
    solver.strictMapping = true;

    // Derive action labels from the rule builder itself — avoids hardcoding
    // action names that could change if the rule generator is refactored.
    const { rules } = buildToolProgressionRules(
      'wooden_pickaxe', 'pickaxe', null, 'wooden', []
    );
    const ruleActions = rules.map(r => r.action);

    // Build a solution path using real rule actions from the builder.
    // We only need enough edges to exercise the mapping; use first 3 rules.
    const pathLabels = ruleActions.slice(0, 3);
    const solutionPath = pathLabels.map((label, i) => ({
      source: `S${i}`,
      target: `S${i + 1}`,
      label,
    }));
    const discoveredNodes = Array.from({ length: pathLabels.length + 1 }, (_, i) => ({
      id: `S${i}`,
      g: i,
      h: pathLabels.length - i,
      distance: i,
      ...(i === pathLabels.length ? { isSolution: true as const } : {}),
    }));

    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath,
      discoveredNodes,
      searchEdges: [],
      metrics: { planId: 'tp-strict-clean' },
      durationMs: 10,
    } satisfies SterlingSolveResult);

    const result = await solver.solveToolProgression(
      'wooden_pickaxe',
      {},
      []
    );

    expect(result.solved).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.mappingDegraded).toBeUndefined();
    // All steps should have real action names, not unknown-*
    for (const step of result.steps) {
      expect(step.action).not.toMatch(/^tp:unknown-/);
    }
  });

  it('preserves solveMeta bundles in strict mode failure', async () => {
    solver.strictMapping = true;

    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [{ source: 'S0', target: 'S1' }],
      discoveredNodes: [
        { id: 'S0', g: 0, h: 1, distance: 0 },
        { id: 'S1', g: 1, h: 0, distance: 1, isSolution: true },
      ],
      searchEdges: [],
      metrics: { planId: 'tp-strict-meta' },
      durationMs: 6,
    } satisfies SterlingSolveResult);

    const result = await solver.solveToolProgression(
      'wooden_pickaxe',
      {},
      []
    );

    expect(result.solved).toBe(false);
    expect(result.planId).toBe('tp-strict-meta');
    expect(result.solveMeta?.bundles).toHaveLength(1);
    expect(result.targetTier).toBe('wooden');
    expect(result.targetTool).toBe('wooden_pickaxe');
  });

  it('aggregates degradation across tiers in strict mode', async () => {
    solver.strictMapping = true;

    // Derive first-tier labels from the rule builder
    const { rules: woodenRules } = buildToolProgressionRules(
      'wooden_pickaxe', 'pickaxe', null, 'wooden', []
    );
    const tier1Actions = woodenRules.map(r => r.action);
    const tier1Path = tier1Actions.slice(0, 3).map((label, i) => ({
      source: `S${i}`,
      target: `S${i + 1}`,
      label,
    }));
    const tier1Nodes = Array.from({ length: tier1Path.length + 1 }, (_, i) => ({
      id: `S${i}`,
      g: i,
      h: tier1Path.length - i,
      distance: i,
      ...(i === tier1Path.length ? { isSolution: true as const } : {}),
    }));

    // First tier solve succeeds cleanly (labels from rule builder)
    (service.solve as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: tier1Path,
        discoveredNodes: tier1Nodes,
        searchEdges: [],
        metrics: { planId: 'tp-tier1' },
        durationMs: 5,
      } satisfies SterlingSolveResult)
      // Second tier solve has a degraded edge (no label)
      .mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [
          { source: 'T0', target: 'T1' }, // no label → degraded
        ],
        discoveredNodes: [
          { id: 'T0', g: 0, h: 1, distance: 0 },
          { id: 'T1', g: 1, h: 0, distance: 1, isSolution: true },
        ],
        searchEdges: [],
        metrics: { planId: 'tp-tier2' },
        durationMs: 3,
      } satisfies SterlingSolveResult);

    // stone_pickaxe requires both wooden and stone tier solves
    const result = await solver.solveToolProgression(
      'stone_pickaxe',
      {},
      ['stone', 'cobblestone']
    );

    // Strict mode catches degradation from second tier
    expect(result.solved).toBe(false);
    expect(result.steps).toEqual([]);
    expect(result.mappingDegraded).toBe(true);
    expect(result.noActionLabelEdges).toBeGreaterThanOrEqual(1);
    expect(result.error).toContain('Step mapping degraded');
  });
});

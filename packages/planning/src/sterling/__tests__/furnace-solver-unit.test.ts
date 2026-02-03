/**
 * Furnace Solver Unit Tests (C.1 / C.3)
 *
 * R1: Solved path populates solveMeta.bundles with correct shape
 * R1: Bundle has input hashes, output metrics, compatReport
 * R4: Same inputs → same bundleId (deterministic)
 * Unavailable result when service is down
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MinecraftFurnaceSolver } from '../minecraft-furnace-solver';
import type { SterlingReasoningService } from '../sterling-reasoning-service';

// ============================================================================
// Mock Factory
// ============================================================================

function createMockService(
  overrides?: Partial<SterlingReasoningService>,
): SterlingReasoningService {
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
    getConnectionNonce: vi.fn().mockReturnValue(1),
    registerDomainDeclaration: vi.fn().mockResolvedValue({ success: true }),
    initialize: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    getHealthStatus: vi.fn().mockReturnValue({ enabled: true }),
    verifyReachability: vi.fn(),
    queryKnowledgeGraph: vi.fn(),
    withFallback: vi.fn(),
    ...overrides,
  } as unknown as SterlingReasoningService;
}

// ============================================================================
// Tests
// ============================================================================

describe('MinecraftFurnaceSolver — unit tests (C.1)', () => {
  let service: SterlingReasoningService;
  let solver: MinecraftFurnaceSolver;

  beforeEach(() => {
    service = createMockService();
    solver = new MinecraftFurnaceSolver(service);
  });

  // ── Identity ──────────────────────────────────────────────────────

  it('has correct solverId and domain', () => {
    expect(solver.solverId).toBe('minecraft.furnace');
    expect(solver.sterlingDomain).toBe('minecraft');
    expect(solver.contractVersion).toBe(1);
  });

  // ── Unavailable ───────────────────────────────────────────────────

  it('returns unavailable result when service is down', async () => {
    (service.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await solver.solveFurnaceSchedule(
      ['iron_ore'],
      { iron_ore: 4, coal: 2 },
      2,
    );

    expect(result.solved).toBe(false);
    expect(result.error).toContain('unavailable');
    expect(result.solveMeta).toBeUndefined();
  });

  // ── Unsolved path ─────────────────────────────────────────────────

  it('unsolved path attaches solveMeta with solved=false', async () => {
    const result = await solver.solveFurnaceSchedule(
      ['iron_ore'],
      { iron_ore: 4, coal: 2 },
      2,
    );

    expect(result.solved).toBe(false);
    expect(result.solveMeta).toBeDefined();
    expect(result.solveMeta!.bundles).toHaveLength(1);

    const bundle = result.solveMeta!.bundles[0];
    expect(bundle.output.solved).toBe(false);
    expect(bundle.output.stepsDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.compatReport.valid).toBe(true);
  });

  // ── Solved path: R1 bundle shape ──────────────────────────────────

  describe('solved path — R1 bundle shape', () => {
    beforeEach(() => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [
          { source: 'S0', target: 'S1', label: 'furnace:load:iron_ore' },
          { source: 'S1', target: 'S2', label: 'furnace:fuel:iron_ore' },
          { source: 'S2', target: 'S3', label: 'furnace:smelt:iron_ore' },
          { source: 'S3', target: 'S4', label: 'furnace:retrieve:iron_ore' },
        ],
        discoveredNodes: ['S0', 'S1', 'S2', 'S3', 'S4'],
        searchEdges: [
          { source: 'S0', target: 'S1', label: 'furnace:load:iron_ore' },
          { source: 'S1', target: 'S2', label: 'furnace:fuel:iron_ore' },
          { source: 'S2', target: 'S3', label: 'furnace:smelt:iron_ore' },
          { source: 'S3', target: 'S4', label: 'furnace:retrieve:iron_ore' },
        ],
        metrics: { planId: 'furnace-plan-1' },
        durationMs: 25,
      });
    });

    it('populates solveMeta.bundles with length 1', async () => {
      const result = await solver.solveFurnaceSchedule(
        ['iron_ore'],
        { iron_ore: 4, coal: 2 },
        2,
      );

      expect(result.solved).toBe(true);
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(1);
    });

    it('bundle has input.definitionHash, initialStateHash, goalHash', async () => {
      const result = await solver.solveFurnaceSchedule(
        ['iron_ore'],
        { iron_ore: 4, coal: 2 },
        2,
      );

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.input.solverId).toBe('minecraft.furnace');
      expect(bundle.input.definitionHash).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.input.initialStateHash).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.input.goalHash).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.input.definitionCount).toBeGreaterThan(0);
    });

    it('bundle has output.stepsDigest, solved=true, planId', async () => {
      const result = await solver.solveFurnaceSchedule(
        ['iron_ore'],
        { iron_ore: 4, coal: 2 },
        2,
      );

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.output.solved).toBe(true);
      expect(bundle.output.planId).toBe('furnace-plan-1');
      expect(bundle.output.stepsDigest).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.output.searchStats.totalNodes).toBe(5);
      expect(bundle.output.searchStats.durationMs).toBe(25);
    });

    it('compatReport.valid === true', async () => {
      const result = await solver.solveFurnaceSchedule(
        ['iron_ore'],
        { iron_ore: 4, coal: 2 },
        2,
      );

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.compatReport.valid).toBe(true);
    });

    it('maps all four operator families in solution steps', async () => {
      const result = await solver.solveFurnaceSchedule(
        ['iron_ore'],
        { iron_ore: 4, coal: 2 },
        2,
      );

      expect(result.steps).toHaveLength(4);
      const families = result.steps.map((s) => s.operatorFamily);
      expect(families).toEqual([
        'load_furnace',
        'add_fuel',
        'wait_tick',
        'retrieve_output',
      ]);
    });
  });

  // ── R4: Deterministic bundle ID ───────────────────────────────────

  describe('R4 — deterministic bundle ID', () => {
    it('same inputs → same bundleHash', async () => {
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

      const result1 = await solver.solveFurnaceSchedule(
        ['iron_ore'],
        { iron_ore: 4, coal: 2 },
        2,
      );
      const result2 = await solver.solveFurnaceSchedule(
        ['iron_ore'],
        { iron_ore: 4, coal: 2 },
        2,
      );

      expect(result1.solveMeta!.bundles[0].bundleHash).toBe(
        result2.solveMeta!.bundles[0].bundleHash,
      );
    });

    it('bundleId follows solverId:hash format', async () => {
      const result = await solver.solveFurnaceSchedule(
        ['iron_ore'],
        { iron_ore: 4, coal: 2 },
        2,
      );

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.bundleId).toMatch(/^minecraft\.furnace:[0-9a-f]{16}$/);
    });
  });

  // ── Error resilience ──────────────────────────────────────────────

  it('produces bundle even on Sterling error', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Connection refused'),
    );

    const result = await solver.solveFurnaceSchedule(
      ['iron_ore'],
      { iron_ore: 4, coal: 2 },
      2,
    );

    expect(result.solved).toBe(false);
    expect(result.error).toContain('Connection refused');
    expect(result.solveMeta).toBeDefined();
    expect(result.solveMeta!.bundles).toHaveLength(1);
  });

  // ── Credit assignment ─────────────────────────────────────────────

  it('solve does not auto-report episodes', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [
        { source: 'S0', target: 'S1', label: 'furnace:smelt:iron_ore' },
      ],
      discoveredNodes: ['S0', 'S1'],
      searchEdges: [
        { source: 'S0', target: 'S1', label: 'furnace:smelt:iron_ore' },
      ],
      metrics: { planId: 'furnace-credit-1' },
      durationMs: 5,
    });

    const reportSpy = vi.spyOn(solver, 'reportEpisodeResult');
    await solver.solveFurnaceSchedule(['iron_ore'], { iron_ore: 1, coal: 1 }, 1);

    expect(reportSpy).not.toHaveBeenCalled();
    expect(service.solve).toHaveBeenCalledTimes(1);

    reportSpy.mockRestore();
  });
});

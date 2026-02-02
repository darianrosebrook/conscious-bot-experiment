/**
 * Unit tests for MinecraftNavigationSolver.
 *
 * Validates:
 * - Solver-layer execution evidence (R1): solveMeta.bundles with correct shape
 * - Payload-equivalence stability (R3): outbound solve payload structure
 * - Deterministic bundle IDs (R4): same inputs → same bundleId
 * - Input validation (grid bounds, dimensions)
 * - Solution mapping (node IDs → NavigationPrimitive[])
 * - Unavailability handling
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MinecraftNavigationSolver } from '../minecraft-navigation-solver';
import type { SterlingReasoningService } from '../sterling-reasoning-service';
import type { OccupancyGrid } from '../minecraft-navigation-types';
import { BLOCK_TYPE, hashOccupancyGrid, hashNavigationGoal, hashNavigationStart } from '../minecraft-navigation-types';

// ============================================================================
// Helpers
// ============================================================================

function createTestGrid(opts?: {
  dx?: number;
  dy?: number;
  dz?: number;
  origin?: { x: number; y: number; z: number };
  fill?: number;
}): OccupancyGrid {
  const dx = opts?.dx ?? 10;
  const dy = opts?.dy ?? 5;
  const dz = opts?.dz ?? 10;
  const fill = opts?.fill ?? BLOCK_TYPE.AIR;
  const blocks = new Uint8Array(dx * dy * dz).fill(fill);
  return {
    origin: opts?.origin ?? { x: 0, y: 60, z: 0 },
    size: { dx, dy, dz },
    blocks,
  };
}

function setBlock(grid: OccupancyGrid, x: number, y: number, z: number, type: number): void {
  const lx = x - grid.origin.x;
  const ly = y - grid.origin.y;
  const lz = z - grid.origin.z;
  const { dy, dz } = grid.size;
  grid.blocks[((lx * dy) + ly) * dz + lz] = type;
}

/**
 * Create a mock SterlingReasoningService.
 * Default: returns solutionFound=true with a simple 3-step walk path.
 */
function createMockService(overrides?: {
  solutionFound?: boolean;
  solutionPath?: any[];
  discoveredNodes?: any[];
  durationMs?: number;
  error?: string;
}) {
  const solutionFound = overrides?.solutionFound ?? true;
  const discoveredNodes = overrides?.discoveredNodes ?? [
    { id: 'nav:5,62,5' },
    { id: 'nav:5,62,6' },
    { id: 'nav:5,62,7' },
    { id: 'nav:5,62,8' },
  ];
  const solutionPath = overrides?.solutionPath ?? [
    { source: 'nav:5,62,5', target: 'nav:5,62,6', label: 'walk_south', cost: 1.0 },
    { source: 'nav:5,62,6', target: 'nav:5,62,7', label: 'walk_south', cost: 1.0 },
    { source: 'nav:5,62,7', target: 'nav:5,62,8', label: 'walk_south', cost: 1.0 },
  ];

  return {
    isAvailable: vi.fn().mockReturnValue(true),
    solve: vi.fn().mockResolvedValue({
      solutionFound,
      solutionPath,
      discoveredNodes,
      searchEdges: [],
      metrics: {},
      durationMs: overrides?.durationMs ?? 42,
      error: overrides?.error,
    }),
    reportEpisode: vi.fn(),
  } as unknown as SterlingReasoningService;
}

// ============================================================================
// Tests
// ============================================================================

describe('MinecraftNavigationSolver', () => {
  let service: SterlingReasoningService;
  let solver: MinecraftNavigationSolver;

  beforeEach(() => {
    service = createMockService();
    solver = new MinecraftNavigationSolver(service);
  });

  // --------------------------------------------------------------------------
  // Basic properties
  // --------------------------------------------------------------------------

  describe('solver identity', () => {
    it('has correct sterlingDomain and solverId', () => {
      expect(solver.sterlingDomain).toBe('navigation');
      expect(solver.solverId).toBe('minecraft.navigation');
    });
  });

  // --------------------------------------------------------------------------
  // Unavailability
  // --------------------------------------------------------------------------

  describe('unavailability', () => {
    it('returns unavailable result when service is not available', async () => {
      (service.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const grid = createTestGrid();
      const result = await solver.solveNavigation(
        { x: 5, y: 62, z: 5 },
        { x: 5, y: 62, z: 8 },
        grid,
      );

      expect(result.solved).toBe(false);
      expect(result.error).toContain('unavailable');
      expect(result.primitives).toEqual([]);
      expect(result.pathPositions).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Input validation
  // --------------------------------------------------------------------------

  describe('input validation', () => {
    it('rejects grid with zero dimensions', async () => {
      const grid: OccupancyGrid = {
        origin: { x: 0, y: 0, z: 0 },
        size: { dx: 0, dy: 5, dz: 5 },
        blocks: new Uint8Array(0),
      };
      const result = await solver.solveNavigation(
        { x: 0, y: 2, z: 0 },
        { x: 4, y: 2, z: 4 },
        grid,
      );
      expect(result.solved).toBe(false);
      expect(result.error).toContain('zero or negative');
    });

    it('rejects grid with mismatched block count', async () => {
      const grid: OccupancyGrid = {
        origin: { x: 0, y: 0, z: 0 },
        size: { dx: 3, dy: 3, dz: 3 },
        blocks: new Uint8Array(10), // should be 27
      };
      const result = await solver.solveNavigation(
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 2, z: 2 },
        grid,
      );
      expect(result.solved).toBe(false);
      expect(result.error).toContain('mismatch');
    });

    it('rejects start outside grid bounds', async () => {
      const grid = createTestGrid({ dx: 5, dy: 5, dz: 5, origin: { x: 0, y: 60, z: 0 } });
      const result = await solver.solveNavigation(
        { x: 100, y: 62, z: 100 }, // way outside
        { x: 2, y: 62, z: 2 },
        grid,
      );
      expect(result.solved).toBe(false);
      expect(result.error).toContain('outside grid bounds');
    });

    it('accepts goal outside grid (solver will return no path)', async () => {
      const grid = createTestGrid({ dx: 5, dy: 5, dz: 5, origin: { x: 0, y: 60, z: 0 } });
      // Goal is outside grid, but the solver should be called
      // (Sterling determines no path, not our validation)
      const result = await solver.solveNavigation(
        { x: 2, y: 62, z: 2 },
        { x: 100, y: 62, z: 100 },
        grid,
      );
      // Should reach Sterling, which returns our mock solution
      expect(service.solve).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // R1: Solver-layer execution evidence — solveMeta.bundles
  // --------------------------------------------------------------------------

  describe('solveMeta.bundles (R1)', () => {
    it('produces solveMeta with 1 bundle on successful solve', async () => {
      const grid = createTestGrid();
      const result = await solver.solveNavigation(
        { x: 5, y: 62, z: 5 },
        { x: 5, y: 62, z: 8 },
        grid,
      );

      expect(result.solved).toBe(true);
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta?.bundles).toHaveLength(1);
    });

    it('bundle has correct input fields', async () => {
      const grid = createTestGrid();
      const start = { x: 5, y: 62, z: 5 };
      const goal = { x: 5, y: 62, z: 8 };
      const result = await solver.solveNavigation(start, goal, grid);

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.input.solverId).toBe('minecraft.navigation');
      expect(bundle.input.definitionHash).toBe(hashOccupancyGrid(grid));
      expect(bundle.input.initialStateHash).toBe(hashNavigationStart(start));
      expect(bundle.input.goalHash).toBe(hashNavigationGoal(goal, 1, 0));
      expect(bundle.input.definitionCount).toBe(0); // grid-based, no rules
    });

    it('bundle has correct output fields on success', async () => {
      const grid = createTestGrid();
      const result = await solver.solveNavigation(
        { x: 5, y: 62, z: 5 },
        { x: 5, y: 62, z: 8 },
        grid,
      );

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.output.solved).toBe(true);
      expect(bundle.output.stepsDigest).toBeTruthy();
      expect(typeof bundle.output.stepsDigest).toBe('string');
      expect(bundle.output.searchStats.durationMs).toBe(42);
      expect(bundle.output.searchStats.totalNodes).toBe(4);
      expect(bundle.output.searchStats.solutionPathLength).toBe(3);
    });

    it('bundle has valid compatReport', async () => {
      const grid = createTestGrid();
      const result = await solver.solveNavigation(
        { x: 5, y: 62, z: 5 },
        { x: 5, y: 62, z: 8 },
        grid,
      );

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.compatReport.valid).toBe(true);
      expect(bundle.compatReport.issues).toEqual([]);
    });

    it('produces solveMeta bundle on failed solve too', async () => {
      service = createMockService({ solutionFound: false, error: 'No path found' });
      solver = new MinecraftNavigationSolver(service);

      const grid = createTestGrid();
      const result = await solver.solveNavigation(
        { x: 5, y: 62, z: 5 },
        { x: 5, y: 62, z: 8 },
        grid,
      );

      expect(result.solved).toBe(false);
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta?.bundles).toHaveLength(1);
      expect(result.solveMeta!.bundles[0].output.solved).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // R3: Payload-equivalence — outbound solve payload
  // --------------------------------------------------------------------------

  describe('outbound payload structure (R3)', () => {
    it('sends correct payload to sterlingService.solve()', async () => {
      const grid = createTestGrid({ dx: 5, dy: 5, dz: 5, origin: { x: 0, y: 60, z: 0 } });
      const start = { x: 2, y: 62, z: 2 };
      const goal = { x: 4, y: 62, z: 4 };

      await solver.solveNavigation(start, goal, grid, 1, 0, undefined, {
        maxNodes: 5000,
        useLearning: false,
      });

      expect(service.solve).toHaveBeenCalledOnce();
      const [domain, payload] = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];

      expect(domain).toBe('navigation');
      expect(payload.command).toBe('solve');
      expect(payload.domain).toBe('navigation');
      expect(payload.solverId).toBe('minecraft.navigation');
      expect(payload.start).toEqual(start);
      expect(payload.goal).toEqual(goal);
      expect(payload.toleranceXZ).toBe(1);
      expect(payload.toleranceY).toBe(0);
      expect(payload.maxNodes).toBe(5000);
      expect(payload.useLearning).toBe(false);

      // Occupancy grid is encoded
      expect(payload.occupancyGrid).toBeDefined();
      expect(payload.occupancyGrid.origin).toEqual({ x: 0, y: 60, z: 0 });
      expect(payload.occupancyGrid.size).toEqual({ dx: 5, dy: 5, dz: 5 });
      expect(typeof payload.occupancyGrid.blocks).toBe('string'); // base64

      // Hazard policy is included
      expect(payload.hazardPolicy).toBeDefined();
      expect(payload.hazardPolicy.riskMode).toBe('normal');
      expect(payload.hazardPolicy.penalties).toBeDefined();
    });

    it('uses default tolerance values when not specified', async () => {
      const grid = createTestGrid();
      await solver.solveNavigation(
        { x: 5, y: 62, z: 5 },
        { x: 5, y: 62, z: 8 },
        grid,
      );

      const payload = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(payload.toleranceXZ).toBe(1);
      expect(payload.toleranceY).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // R4: Deterministic bundle IDs
  // --------------------------------------------------------------------------

  describe('bundle ID determinism (R4)', () => {
    it('same inputs produce same bundleId', async () => {
      const grid = createTestGrid();
      const start = { x: 5, y: 62, z: 5 };
      const goal = { x: 5, y: 62, z: 8 };

      const r1 = await solver.solveNavigation(start, goal, grid);
      const r2 = await solver.solveNavigation(start, goal, grid);

      expect(r1.solveMeta!.bundles[0].bundleId).toBe(
        r2.solveMeta!.bundles[0].bundleId,
      );
    });

    it('different goals produce different bundleIds', async () => {
      const grid = createTestGrid();
      const start = { x: 5, y: 62, z: 5 };

      const r1 = await solver.solveNavigation(start, { x: 5, y: 62, z: 8 }, grid);
      const r2 = await solver.solveNavigation(start, { x: 5, y: 62, z: 9 }, grid);

      expect(r1.solveMeta!.bundles[0].bundleId).not.toBe(
        r2.solveMeta!.bundles[0].bundleId,
      );
    });

    it('different start positions produce different bundleIds', async () => {
      const grid = createTestGrid();
      const goal = { x: 5, y: 62, z: 8 };

      const r1 = await solver.solveNavigation({ x: 5, y: 62, z: 5 }, goal, grid);
      const r2 = await solver.solveNavigation({ x: 3, y: 62, z: 5 }, goal, grid);

      expect(r1.solveMeta!.bundles[0].bundleId).not.toBe(
        r2.solveMeta!.bundles[0].bundleId,
      );
    });
  });

  // --------------------------------------------------------------------------
  // Solution mapping
  // --------------------------------------------------------------------------

  describe('solution mapping', () => {
    it('maps walk edges to walk primitives', async () => {
      const grid = createTestGrid();
      const result = await solver.solveNavigation(
        { x: 5, y: 62, z: 5 },
        { x: 5, y: 62, z: 8 },
        grid,
      );

      expect(result.primitives).toHaveLength(3);
      for (const p of result.primitives) {
        expect(p.actionType).toBe('walk');
        expect(p.action).toBe('walk_south');
        expect(p.cost).toBe(1.0);
      }
    });

    it('maps jump_up edges correctly', async () => {
      service = createMockService({
        discoveredNodes: [
          { id: 'nav:5,62,5' },
          { id: 'nav:5,63,6' },
        ],
        solutionPath: [
          { source: 'nav:5,62,5', target: 'nav:5,63,6', label: 'jump_up_south', cost: 2.0 },
        ],
      });
      solver = new MinecraftNavigationSolver(service);

      const grid = createTestGrid();
      const result = await solver.solveNavigation(
        { x: 5, y: 62, z: 5 },
        { x: 5, y: 63, z: 6 },
        grid,
      );

      expect(result.primitives).toHaveLength(1);
      expect(result.primitives[0].actionType).toBe('jump_up');
      expect(result.primitives[0].from).toEqual({ x: 5, y: 62, z: 5 });
      expect(result.primitives[0].to).toEqual({ x: 5, y: 63, z: 6 });
    });

    it('maps descend edges correctly', async () => {
      service = createMockService({
        discoveredNodes: [
          { id: 'nav:5,63,5' },
          { id: 'nav:5,62,6' },
        ],
        solutionPath: [
          { source: 'nav:5,63,5', target: 'nav:5,62,6', label: 'descend_south', cost: 0.8 },
        ],
      });
      solver = new MinecraftNavigationSolver(service);

      const grid = createTestGrid();
      const result = await solver.solveNavigation(
        { x: 5, y: 63, z: 5 },
        { x: 5, y: 62, z: 6 },
        grid,
      );

      expect(result.primitives).toHaveLength(1);
      expect(result.primitives[0].actionType).toBe('descend');
    });

    it('extracts pathPositions from primitives', async () => {
      const grid = createTestGrid();
      const result = await solver.solveNavigation(
        { x: 5, y: 62, z: 5 },
        { x: 5, y: 62, z: 8 },
        grid,
      );

      expect(result.pathPositions).toEqual([
        { x: 5, y: 62, z: 6 },
        { x: 5, y: 62, z: 7 },
        { x: 5, y: 62, z: 8 },
      ]);
    });
  });

  // --------------------------------------------------------------------------
  // No-solution case
  // --------------------------------------------------------------------------

  describe('no solution', () => {
    it('returns solved=false with error message', async () => {
      service = createMockService({
        solutionFound: false,
        discoveredNodes: [{ id: 'nav:5,62,5' }],
        solutionPath: [],
        error: 'No path found',
      });
      solver = new MinecraftNavigationSolver(service);

      const grid = createTestGrid();
      const result = await solver.solveNavigation(
        { x: 5, y: 62, z: 5 },
        { x: 5, y: 62, z: 8 },
        grid,
      );

      expect(result.solved).toBe(false);
      expect(result.primitives).toEqual([]);
      expect(result.error).toContain('No path found');
      expect(result.replansUsed).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Episode reporting
  // --------------------------------------------------------------------------

  describe('reportEpisodeResult', () => {
    it('delegates to reportEpisode with correct payload', () => {
      // reportEpisode is a protected method on BaseDomainSolver that calls
      // sterlingService.reportEpisode. We just verify it doesn't throw.
      expect(() =>
        solver.reportEpisodeResult(
          { x: 5, y: 62, z: 5 },
          { x: 5, y: 62, z: 8 },
          true,
          3,
          'plan-123',
        ),
      ).not.toThrow();
    });
  });
});

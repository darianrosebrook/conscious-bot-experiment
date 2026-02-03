/**
 * Furnace Solver Golden-Master Snapshot (C.6)
 *
 * R3: Outbound payload captured and snapshotted with canonical JSON.
 * R3: Identical inputs → byte-equivalent payloads.
 * R4: Bundle ID deterministic; rule order doesn't change definitionHash.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MinecraftFurnaceSolver } from '../minecraft-furnace-solver';
import { canonicalize } from '../solve-bundle';
import type { SterlingReasoningService } from '../sterling-reasoning-service';

// ============================================================================
// Mock Factory
// ============================================================================

function createMockService(): SterlingReasoningService {
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
  } as unknown as SterlingReasoningService;
}

// ============================================================================
// Tests
// ============================================================================

describe('MinecraftFurnaceSolver — golden-master (C.6)', () => {
  let service: SterlingReasoningService;
  let solver: MinecraftFurnaceSolver;

  beforeEach(() => {
    service = createMockService();
    solver = new MinecraftFurnaceSolver(service);
  });

  describe('outbound payload stability', () => {
    it('solve payload matches canonical snapshot', async () => {
      await solver.solveFurnaceSchedule(
        ['iron_ore'],
        { iron_ore: 4, coal: 2 },
        2,
        0,
      );

      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];

      // Capture stable payload fields Sterling sees
      const stablePayload = {
        contractVersion: payload.contractVersion,
        solverId: payload.solverId,
        inventory: payload.inventory,
        goal: payload.goal,
        nearbyBlocks: payload.nearbyBlocks,
        rules: payload.rules,
        maxNodes: payload.maxNodes,
        useLearning: payload.useLearning,
        furnaceSlots: payload.furnaceSlots,
        nowTicks: payload.nowTicks,
      };

      const snapshot = canonicalize(stablePayload);
      expect(snapshot).toMatchSnapshot();
    });

    it('identical inputs produce byte-equivalent wire payloads', async () => {
      await solver.solveFurnaceSchedule(
        ['iron_ore'],
        { iron_ore: 4, coal: 2 },
        2,
        0,
      );
      await solver.solveFurnaceSchedule(
        ['iron_ore'],
        { iron_ore: 4, coal: 2 },
        2,
        0,
      );

      expect(service.solve).toHaveBeenCalledTimes(2);
      const calls = (service.solve as ReturnType<typeof vi.fn>).mock.calls;
      const payload1 = calls[0][1];
      const payload2 = calls[1][1];

      expect(canonicalize(payload1)).toBe(canonicalize(payload2));
    });
  });

  describe('bundle identity determinism', () => {
    it('same inputs produce same bundleHash across separate solves', async () => {
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
      expect(result1.solveMeta!.bundles[0].bundleId).toBe(
        result2.solveMeta!.bundles[0].bundleId,
      );
    });

    it('different inputs produce different bundleHash', async () => {
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
        ['gold_ore'],
        { gold_ore: 4, coal: 2 },
        2,
      );

      expect(result1.solveMeta!.bundles[0].bundleHash).not.toBe(
        result2.solveMeta!.bundles[0].bundleHash,
      );
    });
  });
});

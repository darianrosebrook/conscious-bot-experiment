/**
 * Unit tests for BaseDomainSolver.
 *
 * Uses a concrete stub subclass to verify protocol-layer behavior:
 * - Envelope fields (command, domain, contractVersion)
 * - planId-required skip semantics
 * - Availability gating
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseDomainSolver, type BaseSolveResult } from '../base-domain-solver';
import type { SterlingReasoningService } from '../sterling-reasoning-service';

// ---------------------------------------------------------------------------
// Stub subclass
// ---------------------------------------------------------------------------

interface StubResult extends BaseSolveResult {
  planId?: string | null;
}

class StubSolver extends BaseDomainSolver<StubResult> {
  readonly sterlingDomain = 'stub' as const;
  readonly solverId = 'test.stub';

  protected makeUnavailableResult(): StubResult {
    return {
      solved: false,
      steps: [],
      totalNodes: 0,
      durationMs: 0,
      error: 'unavailable',
    };
  }

  // Expose protected methods for testing
  public testIsAvailable(): boolean {
    return this.isAvailable();
  }

  public testMakeUnavailableResult(): StubResult {
    return this.makeUnavailableResult();
  }

  public testExtractPlanId(result: any): string | null {
    return this.extractPlanId(result);
  }

  public testReportEpisode(payload: Record<string, unknown>): void {
    this.reportEpisode(payload);
  }
}

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

function createMockService() {
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
  } as unknown as SterlingReasoningService;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('BaseDomainSolver', () => {
  let service: SterlingReasoningService;
  let solver: StubSolver;

  beforeEach(() => {
    service = createMockService();
    solver = new StubSolver(service);
  });

  // ---- Availability ----

  it('delegates isAvailable() to the service', () => {
    expect(solver.testIsAvailable()).toBe(true);

    (service.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);
    expect(solver.testIsAvailable()).toBe(false);
  });

  it('makeUnavailableResult returns correctly-typed empty result', () => {
    const result = solver.testMakeUnavailableResult();
    expect(result).toEqual({
      solved: false,
      steps: [],
      totalNodes: 0,
      durationMs: 0,
      error: 'unavailable',
    });
  });

  // ---- planId extraction ----

  it('extractPlanId pulls from metrics.planId', () => {
    const result = { metrics: { planId: 'abc-123' } };
    expect(solver.testExtractPlanId(result)).toBe('abc-123');
  });

  it('extractPlanId returns null when metrics has no planId', () => {
    const result = { metrics: {} };
    expect(solver.testExtractPlanId(result)).toBeNull();
  });

  it('extractPlanId returns null when metrics is undefined', () => {
    const result = {};
    expect(solver.testExtractPlanId(result)).toBeNull();
  });

  // ---- Episode reporting ----

  it('reportEpisode sends correct envelope fields', () => {
    solver.testReportEpisode({
      planId: 'plan-xyz',
      goal: 'test',
      success: true,
    });

    expect(service.solve).toHaveBeenCalledTimes(1);

    const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('stub');
    expect(call[1]).toMatchObject({
      command: 'report_episode',
      domain: 'stub',
      contractVersion: 1,
      planId: 'plan-xyz',
      goal: 'test',
      success: true,
    });
  });

  it('reportEpisode skips and warns when planId is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    solver.testReportEpisode({ goal: 'test', success: false });

    expect(service.solve).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Sterling] Skipping stub episode report: missing planId'
    );

    warnSpy.mockRestore();
  });

  it('reportEpisode skips and warns when planId is null', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    solver.testReportEpisode({ planId: null, goal: 'test', success: false });

    expect(service.solve).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Sterling] Skipping stub episode report: missing planId'
    );

    warnSpy.mockRestore();
  });

  it('reportEpisode skips silently when service is unavailable', () => {
    (service.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);

    solver.testReportEpisode({ planId: 'plan-xyz', goal: 'test', success: true });

    expect(service.solve).not.toHaveBeenCalled();
  });

  it('reportEpisode swallows errors from solve()', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (service.solve as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('connection lost')
    );

    solver.testReportEpisode({ planId: 'plan-xyz', goal: 'test', success: true });

    // Wait for the promise rejection to be handled
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(warnSpy).toHaveBeenCalledWith(
      '[Sterling] Failed to report stub episode: connection lost'
    );

    warnSpy.mockRestore();
  });

  // ---- Identity fields ----

  it('exposes solverId and sterlingDomain', () => {
    expect(solver.solverId).toBe('test.stub');
    expect(solver.sterlingDomain).toBe('stub');
    expect(solver.contractVersion).toBe(1);
  });
});

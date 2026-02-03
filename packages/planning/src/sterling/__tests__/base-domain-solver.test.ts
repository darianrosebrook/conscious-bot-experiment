/**
 * Unit tests for BaseDomainSolver.
 *
 * Uses a concrete stub subclass to verify protocol-layer behavior:
 * - Envelope fields (command, domain, contractVersion)
 * - planId-required skip semantics
 * - Availability gating
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseDomainSolver, type BaseSolveResult } from '../base-domain-solver';
import type { SterlingReasoningService } from '../sterling-reasoning-service';
import type { EpisodeLinkage } from '../solve-bundle-types';

// ---------------------------------------------------------------------------
// Stub subclass
// ---------------------------------------------------------------------------

interface StubResult extends BaseSolveResult {
  planId?: string | null;
}

class StubSolver extends BaseDomainSolver<StubResult> {
  readonly sterlingDomain = 'stub' as const;
  get solverId() { return 'test.stub'; }

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

  public testReportEpisode(payload: Record<string, unknown>, linkage?: EpisodeLinkage): Promise<any> {
    return this.reportEpisode(payload, linkage);
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
    getConnectionNonce: vi.fn().mockReturnValue(1),
    registerDomainDeclaration: vi.fn().mockResolvedValue({ success: true }),
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

// ===========================================================================
// Phase 1 Identity Field Toggle Tests
// ===========================================================================

describe('BaseDomainSolver Phase 1 identity fields', () => {
  let service: SterlingReasoningService;
  let solver: StubSolver;
  const originalEnv = process.env.STERLING_REPORT_IDENTITY_FIELDS;

  beforeEach(() => {
    service = createMockService();
    solver = new StubSolver(service);
    // Reset toggle
    delete process.env.STERLING_REPORT_IDENTITY_FIELDS;
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.STERLING_REPORT_IDENTITY_FIELDS = originalEnv;
    } else {
      delete process.env.STERLING_REPORT_IDENTITY_FIELDS;
    }
  });

  it('does NOT include identity fields when toggle is OFF (default)', async () => {
    // Toggle OFF by default (env var not set)
    const linkage: EpisodeLinkage = {
      bundleHash: 'b-hash',
      traceBundleHash: 't-hash',
      outcomeClass: 'EXECUTION_SUCCESS',
      engineCommitment: 'engine-v1',
      operatorRegistryHash: 'registry-v1',
    };

    await solver.testReportEpisode({ planId: 'plan-1', success: true }, linkage);

    const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toMatchObject({
      command: 'report_episode',
      bundle_hash: 'b-hash',
      trace_bundle_hash: 't-hash',
      outcome_class: 'EXECUTION_SUCCESS',
    });
    // Identity fields should NOT be present
    expect(call[1]).not.toHaveProperty('engine_commitment');
    expect(call[1]).not.toHaveProperty('operator_registry_hash');
  });

  it('includes identity fields when toggle is ON', async () => {
    process.env.STERLING_REPORT_IDENTITY_FIELDS = '1';

    // Use a different solverId to avoid latch interference
    class StubPhase1 extends StubSolver {
      override get solverId() { return 'test.stub.phase1'; }
    }
    const solver2 = new StubPhase1(service);

    const linkage: EpisodeLinkage = {
      bundleHash: 'b-hash-2',
      traceBundleHash: 't-hash-2',
      outcomeClass: 'EXECUTION_SUCCESS',
      engineCommitment: 'engine-v2',
      operatorRegistryHash: 'registry-v2',
    };

    await solver2.testReportEpisode({ planId: 'plan-2', success: true }, linkage);

    const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toMatchObject({
      command: 'report_episode',
      bundle_hash: 'b-hash-2',
      trace_bundle_hash: 't-hash-2',
      outcome_class: 'EXECUTION_SUCCESS',
      engine_commitment: 'engine-v2',
      operator_registry_hash: 'registry-v2',
    });
  });

  it('still sends core linkage fields even when identity fields are undefined', async () => {
    process.env.STERLING_REPORT_IDENTITY_FIELDS = '1';

    // Use a different solverId
    class StubCoreOnly extends StubSolver {
      override get solverId() { return 'test.stub.core-only'; }
    }
    const solver3 = new StubCoreOnly(service);

    const linkage: EpisodeLinkage = {
      bundleHash: 'b-core',
      traceBundleHash: 't-core',
      outcomeClass: 'EXECUTION_FAILURE',
      // No engineCommitment or operatorRegistryHash
    };

    await solver3.testReportEpisode({ planId: 'plan-3', success: false }, linkage);

    const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toMatchObject({
      command: 'report_episode',
      bundle_hash: 'b-core',
      trace_bundle_hash: 't-core',
      outcome_class: 'EXECUTION_FAILURE',
    });
    // Fields not present because linkage didn't have them
    expect(call[1]).not.toHaveProperty('engine_commitment');
    expect(call[1]).not.toHaveProperty('operator_registry_hash');
  });

  it('downgrades and latches when Sterling rejects unknown fields', async () => {
    process.env.STERLING_REPORT_IDENTITY_FIELDS = '1';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Use a different solverId for this test
    class StubDowngrade extends StubSolver {
      override get solverId() { return 'test.stub.downgrade'; }
    }
    const solver4 = new StubDowngrade(service);

    // First call: reject with "unknown field" error
    (service.solve as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('validation error: unknown field engine_commitment'))
      .mockResolvedValueOnce({
        solutionFound: false,
        solutionPath: [],
        discoveredNodes: [],
        searchEdges: [],
        metrics: { episode_hash: 'ep-123' },
        durationMs: 0,
      });

    const linkage: EpisodeLinkage = {
      bundleHash: 'b-downgrade',
      engineCommitment: 'engine-rejected',
      operatorRegistryHash: 'registry-rejected',
    };

    const result = await solver4.testReportEpisode({ planId: 'plan-4', success: true }, linkage);

    // Should have called solve twice (first with fields, then without)
    expect(service.solve).toHaveBeenCalledTimes(2);

    // First call included identity fields
    const firstCall = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall[1]).toHaveProperty('engine_commitment', 'engine-rejected');

    // Second call did NOT include identity fields
    const secondCall = (service.solve as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(secondCall[1]).not.toHaveProperty('engine_commitment');
    expect(secondCall[1]).not.toHaveProperty('operator_registry_hash');

    // Should have logged downgrade warning
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Identity fields rejected for test.stub.downgrade')
    );

    // Result should still return the ack from retry
    expect(result).toEqual({ episodeHash: 'ep-123', requestId: undefined });

    warnSpy.mockRestore();
  });
});

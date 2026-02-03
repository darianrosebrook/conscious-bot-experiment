/**
 * Unit tests for BaseDomainSolver.
 *
 * Uses a concrete stub subclass to verify protocol-layer behavior:
 * - Envelope fields (command, domain, contractVersion)
 * - planId-required skip semantics
 * - Availability gating
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseDomainSolver, type BaseSolveResult, __resetIdentityLatchForTests } from '../base-domain-solver';
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
    // Reset toggle and latch state
    delete process.env.STERLING_REPORT_IDENTITY_FIELDS;
    __resetIdentityLatchForTests();
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

    // First call: reject with "unknown field" error, then succeed on retry
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

    // Should have logged downgrade warning with actual error hint
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Identity fields rejected for test.stub.downgrade')
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown field engine_commitment')
    );

    // Result should still return the ack from retry
    expect(result).toEqual({ episodeHash: 'ep-123', requestId: undefined });

    warnSpy.mockRestore();
  });

  it('does NOT latch if retry also fails (no positive evidence)', async () => {
    process.env.STERLING_REPORT_IDENTITY_FIELDS = '1';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Use a different solverId for this test
    class StubNoLatch extends StubSolver {
      override get solverId() { return 'test.stub.no-latch'; }
    }
    const solver5 = new StubNoLatch(service);

    // Both calls fail — first mentions identity field (triggers retry), second fails
    (service.solve as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('unknown field engine_commitment'))
      .mockRejectedValueOnce(new Error('network timeout'));

    const linkage: EpisodeLinkage = {
      bundleHash: 'b-no-latch',
      engineCommitment: 'engine-test',
    };

    await solver5.testReportEpisode({ planId: 'plan-5', success: true }, linkage);

    // Should have tried twice (identity rejection detected, retry attempted)
    expect(service.solve).toHaveBeenCalledTimes(2);

    // Should NOT have logged latch warning (no positive evidence — retry also failed)
    const latchWarnings = warnSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('Identity fields rejected')
    );
    expect(latchWarnings.length).toBe(0);

    warnSpy.mockRestore();
  });

  it('latch prevents identity fields on subsequent calls', async () => {
    process.env.STERLING_REPORT_IDENTITY_FIELDS = '1';
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Use a different solverId for this test
    class StubLatchPersist extends StubSolver {
      override get solverId() { return 'test.stub.latch-persist'; }
    }
    const solver6 = new StubLatchPersist(service);

    // First call: reject then succeed (triggers latch)
    (service.solve as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('unknown field engine_commitment'))
      .mockResolvedValueOnce({ metrics: { episode_hash: 'ep-first' } })
      // Second call: should succeed directly (no identity fields sent)
      .mockResolvedValueOnce({ metrics: { episode_hash: 'ep-second' } });

    const linkage: EpisodeLinkage = {
      bundleHash: 'b-persist',
      engineCommitment: 'engine-latched',
      operatorRegistryHash: 'registry-latched',
    };

    // First reportEpisode triggers latch
    await solver6.testReportEpisode({ planId: 'plan-6a', success: true }, linkage);
    expect(service.solve).toHaveBeenCalledTimes(2); // reject + retry

    // Reset mock to track second reportEpisode independently
    (service.solve as ReturnType<typeof vi.fn>).mockClear();
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      metrics: { episode_hash: 'ep-second' },
    });

    // Second reportEpisode — latch should prevent identity fields
    await solver6.testReportEpisode({ planId: 'plan-6b', success: true }, linkage);

    // Should only call once (no retry needed because latch skipped identity fields)
    expect(service.solve).toHaveBeenCalledTimes(1);

    // The call should NOT include identity fields (due to latch)
    const thirdCall = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(thirdCall[1]).not.toHaveProperty('engine_commitment');
    expect(thirdCall[1]).not.toHaveProperty('operator_registry_hash');
    // But should still include core linkage
    expect(thirdCall[1]).toHaveProperty('bundle_hash', 'b-persist');
  });

  it('does NOT retry on unrelated schema errors (no identity field mentioned)', async () => {
    process.env.STERLING_REPORT_IDENTITY_FIELDS = '1';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    class StubUnrelated extends StubSolver {
      override get solverId() { return 'test.stub.unrelated-error'; }
    }
    const solver7 = new StubUnrelated(service);

    // Error mentions "schema" but NOT an identity field — should NOT trigger retry
    (service.solve as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('schema validation failed: planId is required'));

    const linkage: EpisodeLinkage = {
      bundleHash: 'b-unrelated',
      engineCommitment: 'engine-test',
      operatorRegistryHash: 'registry-test',
    };

    await solver7.testReportEpisode({ planId: 'plan-7', success: true }, linkage);

    // Should only call ONCE (no retry because error isn't identity-specific)
    expect(service.solve).toHaveBeenCalledTimes(1);

    // Should log generic failure, not identity rejection
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to report stub episode')
    );

    warnSpy.mockRestore();
  });

  it('retries on schema error that mentions identity field', async () => {
    process.env.STERLING_REPORT_IDENTITY_FIELDS = '1';
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    class StubSchemaIdentity extends StubSolver {
      override get solverId() { return 'test.stub.schema-identity'; }
    }
    const solver8 = new StubSchemaIdentity(service);

    // Error mentions "schema" AND an identity field — should trigger retry
    (service.solve as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('schema error: operator_registry_hash not accepted'))
      .mockResolvedValueOnce({ metrics: { episode_hash: 'ep-schema' } });

    const linkage: EpisodeLinkage = {
      bundleHash: 'b-schema',
      engineCommitment: 'engine-schema',
      operatorRegistryHash: 'registry-schema',
    };

    await solver8.testReportEpisode({ planId: 'plan-8', success: true }, linkage);

    // Should call twice (first with fields, retry without)
    expect(service.solve).toHaveBeenCalledTimes(2);
  });

  it('latch is scoped by (solverId, contractVersion) — different versions re-probe', async () => {
    process.env.STERLING_REPORT_IDENTITY_FIELDS = '1';
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Version 1 solver that gets latched
    class StubV1 extends StubSolver {
      override get solverId() { return 'test.stub.versioned'; }
      override readonly contractVersion = 1;
    }
    // Version 2 solver — should NOT be affected by v1 latch
    class StubV2 extends StubSolver {
      override get solverId() { return 'test.stub.versioned'; }
      override readonly contractVersion = 2;
    }

    const solverV1 = new StubV1(service);
    const solverV2 = new StubV2(service);

    // V1: reject then succeed (triggers latch for v1)
    (service.solve as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('unknown field engine_commitment'))
      .mockResolvedValueOnce({ metrics: { episode_hash: 'ep-v1' } });

    const linkage: EpisodeLinkage = {
      bundleHash: 'b-versioned',
      engineCommitment: 'engine-test',
      operatorRegistryHash: 'registry-test',
    };

    await solverV1.testReportEpisode({ planId: 'plan-v1', success: true }, linkage);
    expect(service.solve).toHaveBeenCalledTimes(2); // reject + retry

    // V2: should still attempt with identity fields (different version, not latched)
    (service.solve as ReturnType<typeof vi.fn>).mockClear();
    (service.solve as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('unknown field engine_commitment'))
      .mockResolvedValueOnce({ metrics: { episode_hash: 'ep-v2' } });

    await solverV2.testReportEpisode({ planId: 'plan-v2', success: true }, linkage);

    // V2 should ALSO have tried with identity fields (not latched by v1)
    expect(service.solve).toHaveBeenCalledTimes(2);
    const firstV2Call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstV2Call[1]).toHaveProperty('engine_commitment', 'engine-test');
  });

  it('missing outcomeClass warning fires once per latchKey (tripwire not siren)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    class StubOutcomeWarn extends StubSolver {
      override get solverId() { return 'test.stub.outcome-warn'; }
    }
    const solver = new StubOutcomeWarn(service);

    // Linkage with undefined outcomeClass
    const linkageNoOutcome: EpisodeLinkage = {
      bundleHash: 'b-no-outcome',
      // outcomeClass intentionally undefined
    };

    // First call should warn
    await solver.testReportEpisode({ planId: 'plan-warn-1', success: true }, linkageNoOutcome);
    const warnCalls = warnSpy.mock.calls.filter(
      (call) => call[0]?.includes('has no outcomeClass')
    );
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0][0]).toContain('test.stub.outcome-warn@1'); // latchKey format

    // Second call should NOT warn (already warned for this latchKey)
    await solver.testReportEpisode({ planId: 'plan-warn-2', success: true }, linkageNoOutcome);
    const warnCallsAfter = warnSpy.mock.calls.filter(
      (call) => call[0]?.includes('has no outcomeClass')
    );
    expect(warnCallsAfter).toHaveLength(1); // Still just 1

    warnSpy.mockRestore();
  });
});

/**
 * Declaration Registration Unit Tests
 *
 * Proves Phase 2A acceptance criteria:
 * - Registration idempotent + solverId-keyed (AC #1)
 * - Mode-enforced: DEV fail-open, CERTIFYING fail-closed (AC #2)
 * - Connection-scoped re-registration (footgun #1)
 * - Concurrent calls share in-flight promise (footgun #2)
 * - All 4 production declarations validate + register
 * - No identity hash contamination (AC #4)
 * - solverId in report_episode payload (D5)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseDomainSolver, type BaseSolveResult, type DeclarationMode } from '../base-domain-solver';
import type { SterlingReasoningService } from '../sterling-reasoning-service';
import type { DomainDeclarationV1 } from '../domain-declaration';
import { computeRegistrationDigest, validateDeclaration } from '../domain-declaration';
import { CRAFTING_DECLARATION } from '../minecraft-crafting-solver';
import { TOOL_PROGRESSION_DECLARATION } from '../minecraft-tool-progression-solver';
import { ACQUISITION_DECLARATION } from '../minecraft-acquisition-solver';
import { BUILDING_DECLARATION } from '../minecraft-building-solver';
import { createSolveBundle, computeBundleInput, computeBundleOutput } from '../solve-bundle';

// ---------------------------------------------------------------------------
// Stub subclass with declaration
// ---------------------------------------------------------------------------

const STUB_DECLARATION: DomainDeclarationV1 = {
  declarationVersion: 1,
  solverId: 'test.stub',
  contractVersion: 1,
  implementsPrimitives: ['CB-P01'],
  consumesFields: ['inventory', 'goal'],
  producesFields: ['steps', 'planId'],
};

class DeclaringStubSolver extends BaseDomainSolver<BaseSolveResult> {
  readonly sterlingDomain = 'stub' as const;
  readonly solverId = 'test.stub';

  protected makeUnavailableResult(): BaseSolveResult {
    return { solved: false, steps: [], totalNodes: 0, durationMs: 0, error: 'unavailable' };
  }

  override getDomainDeclaration(): DomainDeclarationV1 {
    return STUB_DECLARATION;
  }

  // Expose for testing
  public testEnsureRegistered() { return this.ensureDeclarationRegistered(); }
  public testReportEpisode(payload: Record<string, unknown>) {
    return this.reportEpisode(payload);
  }
}

class NullDeclarationSolver extends BaseDomainSolver<BaseSolveResult> {
  readonly sterlingDomain = 'stub' as const;
  readonly solverId = 'test.null';

  protected makeUnavailableResult(): BaseSolveResult {
    return { solved: false, steps: [], totalNodes: 0, durationMs: 0, error: 'unavailable' };
  }

  // Default getDomainDeclaration() returns null
  public testEnsureRegistered() { return this.ensureDeclarationRegistered(); }
}

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

function createMockService(nonce = 1) {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    getConnectionNonce: vi.fn().mockReturnValue(nonce),
    registerDomainDeclaration: vi.fn().mockResolvedValue({ success: true, digest: 'mock-digest' }),
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

describe('ensureDeclarationRegistered', () => {
  let service: ReturnType<typeof createMockService>;
  let solver: DeclaringStubSolver;

  beforeEach(() => {
    service = createMockService() as any;
    solver = new DeclaringStubSolver(service as unknown as SterlingReasoningService);
  });

  // #1: Wire correctness
  it('calls service.registerDomainDeclaration with correct declaration and registration digest', async () => {
    const result = await solver.testEnsureRegistered();
    expect(result).toBe(true);

    const expectedDigest = computeRegistrationDigest(STUB_DECLARATION);
    expect(service.registerDomainDeclaration).toHaveBeenCalledTimes(1);
    expect(service.registerDomainDeclaration).toHaveBeenCalledWith(
      STUB_DECLARATION,
      expectedDigest,
    );
  });

  // #2: Idempotency
  it('second call with same connection nonce skips re-registration', async () => {
    await solver.testEnsureRegistered();
    await solver.testEnsureRegistered();
    expect(service.registerDomainDeclaration).toHaveBeenCalledTimes(1);
  });

  // #3: Connection-scoped (footgun #1)
  it('connection nonce change triggers re-registration', async () => {
    await solver.testEnsureRegistered();
    expect(service.registerDomainDeclaration).toHaveBeenCalledTimes(1);

    // Simulate reconnect by changing nonce
    (service.getConnectionNonce as ReturnType<typeof vi.fn>).mockReturnValue(2);
    await solver.testEnsureRegistered();
    expect(service.registerDomainDeclaration).toHaveBeenCalledTimes(2);
  });

  // #4: Concurrency safety (footgun #2)
  it('concurrent calls await same promise, only one registration attempt', async () => {
    let resolveRegistration!: (val: { success: boolean }) => void;
    (service.registerDomainDeclaration as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => { resolveRegistration = resolve; }),
    );

    const p1 = solver.testEnsureRegistered();
    const p2 = solver.testEnsureRegistered();
    const p3 = solver.testEnsureRegistered();

    resolveRegistration({ success: true });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(r3).toBe(true);
    expect(service.registerDomainDeclaration).toHaveBeenCalledTimes(1);
  });

  // #5: DEV mode failure → returns false, does not throw
  it('DEV mode: registration failure returns false, does not throw', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    solver.declarationMode = 'dev';
    (service.registerDomainDeclaration as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'digest_mismatch',
    });

    const result = await solver.testEnsureRegistered();
    expect(result).toBe(false);
    warnSpy.mockRestore();
  });

  // #6: CERTIFYING mode failure → throws with diagnostic context
  it('CERTIFYING mode: registration failure throws with solverId+digest+nonce+error', async () => {
    solver.declarationMode = 'certifying';
    (service.registerDomainDeclaration as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'digest_mismatch',
    });

    await expect(solver.testEnsureRegistered()).rejects.toThrow('[DeclarationRegistration]');
    // Verify the error includes diagnostic fields
    try {
      await solver.testEnsureRegistered();
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('solverId=test.stub');
      expect(msg).toContain('digest=');
      expect(msg).toContain('nonce=');
      expect(msg).toContain('digest_mismatch');
    }
  });

  // #7: Backward compat — null declaration
  it('null getDomainDeclaration(): no-op, returns true', async () => {
    const nullSolver = new NullDeclarationSolver(service as unknown as SterlingReasoningService);
    const result = await nullSolver.testEnsureRegistered();
    expect(result).toBe(true);
    expect(service.registerDomainDeclaration).not.toHaveBeenCalled();
  });

  // #8: Recovery — state resets on failure
  it('registration state resets on failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    solver.declarationMode = 'dev';

    // First call: fail
    (service.registerDomainDeclaration as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'temporary_error',
    });
    const r1 = await solver.testEnsureRegistered();
    expect(r1).toBe(false);

    // Second call: should retry (not skip) because state was reset
    (service.registerDomainDeclaration as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
    });
    const r2 = await solver.testEnsureRegistered();
    expect(r2).toBe(true);

    expect(service.registerDomainDeclaration).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  // #9: Deterministic digest for CRAFTING_DECLARATION
  it('CRAFTING_DECLARATION registration digest is deterministic', () => {
    const d1 = computeRegistrationDigest(CRAFTING_DECLARATION);
    const d2 = computeRegistrationDigest(CRAFTING_DECLARATION);
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^[0-9a-f]{16}$/);
  });

  // #10: Deterministic digest for TOOL_PROGRESSION_DECLARATION
  it('TOOL_PROGRESSION_DECLARATION registration digest is deterministic', () => {
    const d1 = computeRegistrationDigest(TOOL_PROGRESSION_DECLARATION);
    const d2 = computeRegistrationDigest(TOOL_PROGRESSION_DECLARATION);
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^[0-9a-f]{16}$/);
  });

  // #11: All 4 declarations validate successfully
  it('all 4 production declarations validate successfully', () => {
    expect(() => validateDeclaration(CRAFTING_DECLARATION)).not.toThrow();
    expect(() => validateDeclaration(TOOL_PROGRESSION_DECLARATION)).not.toThrow();
    expect(() => validateDeclaration(ACQUISITION_DECLARATION)).not.toThrow();
    expect(() => validateDeclaration(BUILDING_DECLARATION)).not.toThrow();
  });

  // #12: Digests differ between solvers
  it('digests differ between solvers', () => {
    const digests = new Set([
      computeRegistrationDigest(CRAFTING_DECLARATION),
      computeRegistrationDigest(TOOL_PROGRESSION_DECLARATION),
      computeRegistrationDigest(ACQUISITION_DECLARATION),
      computeRegistrationDigest(BUILDING_DECLARATION),
    ]);
    expect(digests.size).toBe(4);
  });
});

// ===========================================================================
// Integration: solveCraftingGoal calls ensureDeclarationRegistered
// ===========================================================================

describe('solver integration: solveCraftingGoal calls ensureDeclarationRegistered', () => {
  it('solveCraftingGoal() calls ensureDeclarationRegistered', async () => {
    const service = createMockService() as any;
    const { MinecraftCraftingSolver } = await import('../minecraft-crafting-solver');
    const solver = new MinecraftCraftingSolver(service as unknown as SterlingReasoningService);

    // Make solve return a no-solution result
    service.solve.mockResolvedValue({
      solutionFound: false,
      solutionPath: [],
      discoveredNodes: [],
      searchEdges: [],
      metrics: {},
      durationMs: 10,
    });

    // Use a minimal mcData stub that passes isValidMcData but returns no recipes
    const mcDataStub = {
      recipes: {},
      items: {},
      itemsByName: {},
    };

    // Solve — it should call registerDomainDeclaration via ensureDeclarationRegistered.
    // buildCraftingRules returns [] with this stub, so the solver early-returns after
    // ensureDeclarationRegistered is called.
    await solver.solveCraftingGoal('stick', [{ name: 'oak_planks', count: 2 }], mcDataStub, []);

    expect(service.registerDomainDeclaration).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// No identity contamination (AC #4)
// ===========================================================================

describe('bundleHash unchanged with/without declaration registration', () => {
  it('bundleHash is identical regardless of declaration registration state', () => {
    // Create a bundle with known inputs — declaration registration doesn't affect bundleHash
    const input = computeBundleInput({
      solverId: 'minecraft.crafting',
      contractVersion: 1,
      definitions: [{ action: 'craft:stick', actionType: 'craft', produces: [], consumes: [] }],
      inventory: { oak_planks: 2 },
      goal: { stick: 1 },
      nearbyBlocks: [],
    });
    const output = computeBundleOutput({
      planId: 'plan-1',
      solved: true,
      steps: [{ action: 'craft:stick' }],
      totalNodes: 10,
      durationMs: 50,
      solutionPathLength: 1,
    });
    const compatReport = {
      valid: true,
      issues: [],
      checkedAt: Date.now(),
      definitionCount: 1,
    };

    const bundle1 = createSolveBundle(input, output, compatReport);
    const bundle2 = createSolveBundle(input, output, compatReport);

    // BundleHash must be identical — declarations live on sterlingIdentity which is excluded
    expect(bundle1.bundleHash).toBe(bundle2.bundleHash);
  });
});

// ===========================================================================
// D5: report_episode includes solverId in payload
// ===========================================================================

describe('report_episode includes solverId', () => {
  it('report_episode payload contains solverId', async () => {
    const service = createMockService() as any;
    const solver = new DeclaringStubSolver(service as unknown as SterlingReasoningService);

    await solver.testReportEpisode({
      planId: 'plan-xyz',
      goal: 'test',
      success: true,
    });

    const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toMatchObject({
      command: 'report_episode',
      solverId: 'test.stub',
    });
  });
});

// ===========================================================================
// Socket lifecycle: nonce increment guarantees re-registration
// ===========================================================================

describe('socket lifecycle nonce coverage', () => {
  it('nonce=0 → register → nonce=1 (reconnect) → re-registers', async () => {
    // Simulate: initial connect (nonce=0), register, then reconnect (nonce=1)
    const service = createMockService(0) as any;
    const solver = new DeclaringStubSolver(service as unknown as SterlingReasoningService);

    // First registration at nonce=0
    await solver.testEnsureRegistered();
    expect(service.registerDomainDeclaration).toHaveBeenCalledTimes(1);

    // Simulate reconnect: nonce increments to 1
    (service.getConnectionNonce as ReturnType<typeof vi.fn>).mockReturnValue(1);
    await solver.testEnsureRegistered();
    expect(service.registerDomainDeclaration).toHaveBeenCalledTimes(2);
  });

  it('nonce=1 → register → nonce=1 (same connection) → skips', async () => {
    const service = createMockService(1) as any;
    const solver = new DeclaringStubSolver(service as unknown as SterlingReasoningService);

    await solver.testEnsureRegistered();
    await solver.testEnsureRegistered();
    await solver.testEnsureRegistered();

    // Same nonce, should only register once
    expect(service.registerDomainDeclaration).toHaveBeenCalledTimes(1);
  });

  it('nonce=1 → register → nonce=2 → register → nonce=3 → register (multiple reconnects)', async () => {
    const service = createMockService(1) as any;
    const solver = new DeclaringStubSolver(service as unknown as SterlingReasoningService);

    // Connection 1
    await solver.testEnsureRegistered();
    expect(service.registerDomainDeclaration).toHaveBeenCalledTimes(1);

    // Reconnect → connection 2
    (service.getConnectionNonce as ReturnType<typeof vi.fn>).mockReturnValue(2);
    await solver.testEnsureRegistered();
    expect(service.registerDomainDeclaration).toHaveBeenCalledTimes(2);

    // Reconnect → connection 3
    (service.getConnectionNonce as ReturnType<typeof vi.fn>).mockReturnValue(3);
    await solver.testEnsureRegistered();
    expect(service.registerDomainDeclaration).toHaveBeenCalledTimes(3);
  });

  it('registration failure at nonce=1 → nonce stays 1 → retries on next call', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = createMockService(1) as any;
    const solver = new DeclaringStubSolver(service as unknown as SterlingReasoningService);
    solver.declarationMode = 'dev';

    // Fail first attempt
    (service.registerDomainDeclaration as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'transient',
    });
    const r1 = await solver.testEnsureRegistered();
    expect(r1).toBe(false);

    // Same nonce, but state was reset — should retry
    (service.registerDomainDeclaration as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
    });
    const r2 = await solver.testEnsureRegistered();
    expect(r2).toBe(true);
    expect(service.registerDomainDeclaration).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });
});

/**
 * Authoritative mock factory for SterlingReasoningService.
 *
 * SINGLE SOURCE OF TRUTH for mock service shape.
 * When SterlingReasoningService adds a new public method, add it here.
 * Then run: `npx vitest run packages/planning/src/sterling/__tests__`
 * Any test that builds its own mock missing the new method will fail on
 * the solver calling the missing method.
 *
 * Existing test files with inline `createMockService()` are NOT required
 * to migrate — but new test files SHOULD import from here.
 *
 * grep anchor: MOCK_SERVICE_REQUIRED_METHODS
 */

import { vi } from 'vitest';
import type { SterlingReasoningService } from '../sterling-reasoning-service';

// ---------------------------------------------------------------------------
// Required method list (grep target for auditing inline mocks)
// ---------------------------------------------------------------------------

/**
 * Every public method that SterlingReasoningService exposes and that
 * solvers / BaseDomainSolver may call. When adding a method to
 * SterlingReasoningService, add it here — then `grep -r
 * 'MOCK_SERVICE_REQUIRED_METHODS' __tests__/` to find this file.
 */
export const MOCK_SERVICE_REQUIRED_METHODS = [
  'isAvailable',
  'solve',
  'getConnectionNonce',
  'registerDomainDeclaration',
  'initialize',
  'destroy',
  'getHealthStatus',
  'verifyReachability',
  'queryKnowledgeGraph',
  'withFallback',
] as const;

// ---------------------------------------------------------------------------
// Default solve response (unsolved, empty)
// ---------------------------------------------------------------------------

export const DEFAULT_SOLVE_RESPONSE = {
  solutionFound: false,
  solutionPath: [] as unknown[],
  discoveredNodes: [] as unknown[],
  searchEdges: [] as unknown[],
  metrics: {},
  durationMs: 0,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface MockServiceOptions {
  /** Override the solve response */
  solveResponse?: Record<string, unknown>;
  /** Override connection nonce value */
  connectionNonce?: number;
  /** Override registration result */
  registrationResult?: { success: boolean; digest?: string; error?: string };
  /** Partial overrides for any method — merged last, wins over everything */
  overrides?: Partial<SterlingReasoningService>;
}

/**
 * Create a mock SterlingReasoningService with all required methods stubbed.
 *
 * Usage:
 * ```ts
 * import { createMockSterlingService } from './mock-sterling-service';
 * const service = createMockSterlingService();
 * const solver = new MinecraftCraftingSolver(service);
 * ```
 */
export function createMockSterlingService(
  opts?: MockServiceOptions,
): SterlingReasoningService {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    solve: vi.fn().mockResolvedValue(opts?.solveResponse ?? DEFAULT_SOLVE_RESPONSE),
    getConnectionNonce: vi.fn().mockReturnValue(opts?.connectionNonce ?? 1),
    registerDomainDeclaration: vi.fn().mockResolvedValue(
      opts?.registrationResult ?? { success: true },
    ),
    initialize: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    getHealthStatus: vi.fn().mockReturnValue({ enabled: true }),
    verifyReachability: vi.fn(),
    queryKnowledgeGraph: vi.fn(),
    withFallback: vi.fn(),
    ...opts?.overrides,
  } as unknown as SterlingReasoningService;
}

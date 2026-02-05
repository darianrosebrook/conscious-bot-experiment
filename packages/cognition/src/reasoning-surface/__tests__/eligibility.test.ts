/**
 * Tests for Eligibility Derivation
 *
 * Validates the single choke point for convertEligible (LF-2).
 *
 * MIGRATION NOTE (PR4):
 * These tests now use ReductionProvenance (Sterling-driven) instead of
 * the legacy GoalTagV1 + GroundingResult interface. Eligibility is now:
 *
 *   convertEligible = (sterlingProcessed && isExecutable)
 *
 * Sterling is the semantic authority. TS does NOT interpret goal tags.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';

import {
  deriveEligibility,
  assertEligibilityInvariant,
  type EligibilityInput,
} from '../eligibility';

import type { ReductionProvenance } from '../../types';

// ============================================================================
// Mock Helpers: ReductionProvenance
// ============================================================================

/**
 * Create a mock ReductionProvenance for Sterling-processed, executable result.
 */
function mockSterlingExecutable(goalPropId: string | null = 'prop_abc123'): ReductionProvenance {
  return {
    sterlingProcessed: true,
    envelopeId: 'env_test123',
    reducerResult: {
      intent_family: 'PLAN',
      intent_type: 'TASK_EXECUTE',
      committed_goal_prop_id: goalPropId,
      is_executable: true,
      grounding: { passed: true, reason: 'grounded' },
    },
    isExecutable: true,
    blockReason: null,
    durationMs: 42,
    sterlingError: null,
  };
}

/**
 * Create a mock ReductionProvenance for Sterling-processed, NOT executable result.
 */
function mockSterlingNotExecutable(reason: string = 'grounding_failed'): ReductionProvenance {
  return {
    sterlingProcessed: true,
    envelopeId: 'env_test456',
    reducerResult: {
      intent_family: 'PLAN',
      intent_type: 'TASK_EXECUTE',
      committed_goal_prop_id: 'prop_xyz789',
      is_executable: false,
      grounding: { passed: false, reason },
    },
    isExecutable: false,
    blockReason: reason,
    durationMs: 38,
    sterlingError: null,
  };
}

/**
 * Create a mock ReductionProvenance for Sterling unavailable (degraded mode).
 */
function mockSterlingUnavailable(errorMsg: string = 'connection_timeout'): ReductionProvenance {
  return {
    sterlingProcessed: false,
    envelopeId: 'env_degraded',
    reducerResult: null,
    isExecutable: false,
    blockReason: 'sterling_unavailable',
    durationMs: 0,
    sterlingError: errorMsg,
  };
}

// ============================================================================
// Core Eligibility Tests
// ============================================================================

describe('deriveEligibility', () => {
  describe('Sterling-driven eligibility rule: (sterlingProcessed && isExecutable) === convertEligible', () => {
    it('should be eligible when Sterling processed AND marked executable', () => {
      const input: EligibilityInput = {
        reduction: mockSterlingExecutable(),
      };

      const result = deriveEligibility(input);

      expect(result.convertEligible).toBe(true);
      expect(result.derived).toBe(true);
      expect(result.reasoning).toBe('sterling_executable');
    });

    it('should NOT be eligible when Sterling processed but marked NOT executable', () => {
      const input: EligibilityInput = {
        reduction: mockSterlingNotExecutable('grounding_violation'),
      };

      const result = deriveEligibility(input);

      expect(result.convertEligible).toBe(false);
      expect(result.derived).toBe(true);
      expect(result.reasoning).toBe('sterling_not_executable');
    });

    it('should NOT be eligible when Sterling unavailable (degraded mode)', () => {
      const input: EligibilityInput = {
        reduction: mockSterlingUnavailable('ws_connection_failed'),
      };

      const result = deriveEligibility(input);

      expect(result.convertEligible).toBe(false);
      expect(result.derived).toBe(true);
      expect(result.reasoning).toBe('sterling_unavailable');
    });

    it('should NOT be eligible when no reduction present (null)', () => {
      const input: EligibilityInput = {
        reduction: null,
      };

      const result = deriveEligibility(input);

      expect(result.convertEligible).toBe(false);
      expect(result.derived).toBe(true);
      expect(result.reasoning).toBe('no_reduction');
    });
  });

  describe('derived marker', () => {
    it('should always set derived=true for all reduction states', () => {
      const cases: EligibilityInput[] = [
        { reduction: mockSterlingExecutable() },
        { reduction: mockSterlingNotExecutable() },
        { reduction: mockSterlingUnavailable() },
        { reduction: null },
      ];

      for (const input of cases) {
        const result = deriveEligibility(input);
        expect(result.derived).toBe(true);
      }
    });
  });

  describe('fail-closed behavior (I-FAILCLOSED-1)', () => {
    it('should fail closed when sterlingProcessed is false', () => {
      // This is the critical fail-closed invariant:
      // If Sterling didn't process, we MUST NOT allow task conversion
      const input: EligibilityInput = {
        reduction: {
          sterlingProcessed: false,
          envelopeId: null,
          reducerResult: null,
          isExecutable: false, // Even if someone tried to set this true, sterlingProcessed=false wins
          blockReason: 'not_processed',
          durationMs: 0,
          sterlingError: 'bypass',
        },
      };

      const result = deriveEligibility(input);

      expect(result.convertEligible).toBe(false);
      expect(result.reasoning).toBe('sterling_unavailable');
    });

    it('should NOT allow eligibility if isExecutable but sterlingProcessed false (defense in depth)', () => {
      // Edge case: malformed reduction where isExecutable=true but sterlingProcessed=false
      // This should NEVER happen in practice, but we test defensive behavior
      const input: EligibilityInput = {
        reduction: {
          sterlingProcessed: false,
          envelopeId: 'env_malformed',
          reducerResult: null,
          isExecutable: true, // Attempting to bypass Sterling
          blockReason: null,
          durationMs: 0,
          sterlingError: null,
        },
      };

      const result = deriveEligibility(input);

      // MUST fail closed — sterlingProcessed=false takes precedence
      expect(result.convertEligible).toBe(false);
      expect(result.reasoning).toBe('sterling_unavailable');
    });
  });
});

// ============================================================================
// Invariant Assertion Tests
// ============================================================================

describe('assertEligibilityInvariant', () => {
  it('should not throw for valid Sterling executable derivation', () => {
    const input: EligibilityInput = {
      reduction: mockSterlingExecutable(),
    };
    const output = deriveEligibility(input);

    expect(() => assertEligibilityInvariant(input, output)).not.toThrow();
  });

  it('should not throw for valid Sterling not executable derivation', () => {
    const input: EligibilityInput = {
      reduction: mockSterlingNotExecutable(),
    };
    const output = deriveEligibility(input);

    expect(() => assertEligibilityInvariant(input, output)).not.toThrow();
  });

  it('should not throw for valid null reduction derivation', () => {
    const input: EligibilityInput = {
      reduction: null,
    };
    const output = deriveEligibility(input);

    expect(() => assertEligibilityInvariant(input, output)).not.toThrow();
  });

  it('should throw if convertEligible is wrong (should be true but is false)', () => {
    const input: EligibilityInput = {
      reduction: mockSterlingExecutable(),
    };

    // Manually corrupt the output
    const badOutput = {
      convertEligible: false, // Should be true — Sterling says executable
      derived: true as const,
      reasoning: 'sterling_executable' as const,
    };

    expect(() => assertEligibilityInvariant(input, badOutput)).toThrow(
      /Eligibility invariant violated/
    );
  });

  it('should throw if convertEligible is wrong (should be false but is true)', () => {
    const input: EligibilityInput = {
      reduction: mockSterlingNotExecutable(),
    };

    // Manually corrupt the output
    const badOutput = {
      convertEligible: true, // Should be false — Sterling says not executable
      derived: true as const,
      reasoning: 'sterling_not_executable' as const,
    };

    expect(() => assertEligibilityInvariant(input, badOutput)).toThrow(
      /Eligibility invariant violated/
    );
  });

  it('should throw if derived is not true', () => {
    const input: EligibilityInput = {
      reduction: null,
    };

    // Manually corrupt the output
    const badOutput = {
      convertEligible: false,
      derived: false as any, // Should be true
      reasoning: 'no_reduction' as const,
    };

    expect(() => assertEligibilityInvariant(input, badOutput)).toThrow(
      /derivation marker missing/
    );
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('eligibility edge cases', () => {
  it('should handle Sterling executable with null goal prop id', () => {
    // Sterling can mark something executable even without a specific goal prop
    // (e.g., for exploration or observation intents)
    const input: EligibilityInput = {
      reduction: mockSterlingExecutable(null),
    };

    const result = deriveEligibility(input);

    // Still eligible if Sterling says so — we don't second-guess
    expect(result.convertEligible).toBe(true);
    expect(result.reasoning).toBe('sterling_executable');
  });

  it('should handle Sterling with empty block reason', () => {
    const input: EligibilityInput = {
      reduction: {
        ...mockSterlingNotExecutable(),
        blockReason: '', // Empty string instead of descriptive reason
      },
    };

    const result = deriveEligibility(input);

    expect(result.convertEligible).toBe(false);
    expect(result.reasoning).toBe('sterling_not_executable');
  });

  it('should handle Sterling unavailable with null error', () => {
    const input: EligibilityInput = {
      reduction: {
        sterlingProcessed: false,
        envelopeId: null,
        reducerResult: null,
        isExecutable: false,
        blockReason: null,
        durationMs: 0,
        sterlingError: null, // No error message captured
      },
    };

    const result = deriveEligibility(input);

    expect(result.convertEligible).toBe(false);
    expect(result.reasoning).toBe('sterling_unavailable');
  });

  it('should handle reduction with high latency', () => {
    // Latency should not affect eligibility — only sterlingProcessed + isExecutable matter
    const input: EligibilityInput = {
      reduction: {
        ...mockSterlingExecutable(),
        durationMs: 5000, // 5 seconds — slow but valid
      },
    };

    const result = deriveEligibility(input);

    expect(result.convertEligible).toBe(true);
    expect(result.reasoning).toBe('sterling_executable');
  });
});

// ============================================================================
// Boundary Contract Tests (I-BOUNDARY-1)
// ============================================================================

describe('boundary contract: TS does NOT interpret Sterling semantics', () => {
  it('should NOT check reducerResult contents for eligibility', () => {
    // Even if reducerResult looks "invalid", we trust isExecutable
    // TS does NOT second-guess Sterling's semantic decisions
    const input: EligibilityInput = {
      reduction: {
        sterlingProcessed: true,
        envelopeId: 'env_weird',
        reducerResult: {
          // Unusual but valid Sterling output
          intent_family: null, // No intent detected
          intent_type: null,
          committed_goal_prop_id: null, // No goal
          is_executable: true, // But Sterling says executable anyway
          grounding: null,
        },
        isExecutable: true, // Trust this flag
        blockReason: null,
        durationMs: 15,
        sterlingError: null,
      },
    };

    const result = deriveEligibility(input);

    // We MUST trust Sterling's isExecutable flag
    // TS does NOT interpret the contents of reducerResult
    expect(result.convertEligible).toBe(true);
    expect(result.reasoning).toBe('sterling_executable');
  });

  it('should NOT allow TS-side overrides based on grounding details', () => {
    // TS cannot look at grounding.passed and override isExecutable
    const input: EligibilityInput = {
      reduction: {
        sterlingProcessed: true,
        envelopeId: 'env_grounding_conflict',
        reducerResult: {
          intent_family: 'PLAN',
          intent_type: 'TASK_EXECUTE',
          committed_goal_prop_id: 'prop_123',
          is_executable: false, // Sterling says no
          grounding: { passed: true, reason: 'looks_grounded' }, // But grounding looks ok?
        },
        isExecutable: false, // Trust this
        blockReason: 'sterling_decision',
        durationMs: 20,
        sterlingError: null,
      },
    };

    const result = deriveEligibility(input);

    // MUST respect Sterling's isExecutable=false, NOT override based on grounding.passed
    expect(result.convertEligible).toBe(false);
    expect(result.reasoning).toBe('sterling_not_executable');
  });
});

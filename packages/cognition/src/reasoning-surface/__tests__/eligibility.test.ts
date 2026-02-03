/**
 * Tests for Eligibility Derivation
 *
 * Validates the single choke point for convertEligible (LF-2).
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';

import {
  deriveEligibility,
  assertEligibilityInvariant,
  type EligibilityInput,
  type GroundingResult,
} from '../eligibility';

// Mock GoalTagV1
const mockGoal = (action: string, target: string) => ({
  version: 1 as const,
  action,
  target,
  targetId: null,
  amount: null,
  raw: `[GOAL: ${action} ${target}]`,
});

// Mock GroundingResult
const mockGrounding = (pass: boolean): GroundingResult => ({
  pass,
  reason: pass ? 'Goal grounded' : 'Grounding failed',
  referencedFacts: pass ? ['fact1', 'fact2'] : [],
  violations: pass ? [] : [{ type: 'fabricated_entity', description: 'test', trigger: 'test' }],
});

describe('deriveEligibility', () => {
  describe('eligibility rule: (goal_present && grounding_pass) === convertEligible', () => {
    it('should be eligible when goal present AND grounding passes', () => {
      const input: EligibilityInput = {
        extractedGoal: mockGoal('collect', 'wood'),
        groundingResult: mockGrounding(true),
      };

      const result = deriveEligibility(input);

      expect(result.convertEligible).toBe(true);
      expect(result.derived).toBe(true);
      expect(result.reasoning).toBe('goal_present_and_grounding_pass');
    });

    it('should NOT be eligible when goal present but grounding fails', () => {
      const input: EligibilityInput = {
        extractedGoal: mockGoal('collect', 'diamonds'),
        groundingResult: mockGrounding(false),
      };

      const result = deriveEligibility(input);

      expect(result.convertEligible).toBe(false);
      expect(result.derived).toBe(true);
      expect(result.reasoning).toBe('goal_present_but_grounding_fail');
    });

    it('should NOT be eligible when no goal present', () => {
      const input: EligibilityInput = {
        extractedGoal: null,
        groundingResult: null,
      };

      const result = deriveEligibility(input);

      expect(result.convertEligible).toBe(false);
      expect(result.derived).toBe(true);
      expect(result.reasoning).toBe('no_goal_present');
    });

    it('should NOT be eligible when goal present but no grounding result', () => {
      const input: EligibilityInput = {
        extractedGoal: mockGoal('collect', 'wood'),
        groundingResult: null,
      };

      const result = deriveEligibility(input);

      expect(result.convertEligible).toBe(false);
      expect(result.derived).toBe(true);
      expect(result.reasoning).toBe('goal_present_but_no_grounding');
    });
  });

  describe('derived marker', () => {
    it('should always set derived=true', () => {
      const cases: EligibilityInput[] = [
        { extractedGoal: mockGoal('mine', 'stone'), groundingResult: mockGrounding(true) },
        { extractedGoal: mockGoal('mine', 'stone'), groundingResult: mockGrounding(false) },
        { extractedGoal: mockGoal('mine', 'stone'), groundingResult: null },
        { extractedGoal: null, groundingResult: null },
      ];

      for (const input of cases) {
        const result = deriveEligibility(input);
        expect(result.derived).toBe(true);
      }
    });
  });
});

describe('assertEligibilityInvariant', () => {
  it('should not throw for valid derivation', () => {
    const input: EligibilityInput = {
      extractedGoal: mockGoal('collect', 'wood'),
      groundingResult: mockGrounding(true),
    };
    const output = deriveEligibility(input);

    expect(() => assertEligibilityInvariant(input, output)).not.toThrow();
  });

  it('should throw if convertEligible is wrong', () => {
    const input: EligibilityInput = {
      extractedGoal: mockGoal('collect', 'wood'),
      groundingResult: mockGrounding(true),
    };

    // Manually corrupt the output
    const badOutput = {
      convertEligible: false, // Should be true
      derived: true as const,
      reasoning: 'goal_present_and_grounding_pass' as const,
    };

    expect(() => assertEligibilityInvariant(input, badOutput)).toThrow(
      /Eligibility invariant violated/
    );
  });

  it('should throw if derived is not true', () => {
    const input: EligibilityInput = {
      extractedGoal: null,
      groundingResult: null,
    };

    // Manually corrupt the output
    const badOutput = {
      convertEligible: false,
      derived: false as any, // Should be true
      reasoning: 'no_goal_present' as const,
    };

    expect(() => assertEligibilityInvariant(input, badOutput)).toThrow(
      /derivation marker missing/
    );
  });
});

describe('eligibility edge cases', () => {
  it('should handle empty target in goal', () => {
    const input: EligibilityInput = {
      extractedGoal: mockGoal('explore', ''),
      groundingResult: mockGrounding(true),
    };

    const result = deriveEligibility(input);

    // Still eligible if grounding passed (grounding would catch empty targets if needed)
    expect(result.convertEligible).toBe(true);
  });

  it('should handle grounding with no referenced facts', () => {
    const input: EligibilityInput = {
      extractedGoal: mockGoal('explore', 'area'),
      groundingResult: {
        pass: true,
        reason: 'Generic action',
        referencedFacts: [], // No specific facts referenced
        violations: [],
      },
    };

    const result = deriveEligibility(input);

    expect(result.convertEligible).toBe(true);
  });
});

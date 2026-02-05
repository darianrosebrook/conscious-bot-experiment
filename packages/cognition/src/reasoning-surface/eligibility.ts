/**
 * Eligibility Derivation — Single Choke Point (LF-2)
 *
 * This module is the ONLY source of truth for `convertEligible`.
 * All upstream values are OVERWRITTEN by this derivation.
 *
 * MIGRATION (PR4): Eligibility is now Sterling-driven.
 *
 * The rule is simple and immutable:
 *   convertEligible = (sterlingProcessed && isExecutable)
 *
 * TS does NOT infer semantics from language output. The "goal present"
 * and "grounding pass" checks are now Sterling's responsibility.
 *
 * @author @darianrosebrook
 */

import type { ReductionProvenance } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface GroundingResult {
  pass: boolean;
  reason: string;
  referencedFacts: string[];
  violations: GroundingViolation[];
}

export interface GroundingViolation {
  type: 'fabricated_entity' | 'fabricated_item' | 'fabricated_location' | 'contradiction' | 'unknown_reference';
  description: string;
  /** The text that triggered the violation */
  trigger: string;
}

/**
 * Input to eligibility derivation.
 *
 * MIGRATION (PR4): Changed from { extractedGoal, groundingResult } to { reduction }.
 * Sterling is the semantic authority — TS passes through the reduction result.
 */
export interface EligibilityInput {
  /** Sterling reduction provenance (semantic authority) */
  reduction: ReductionProvenance | null;
}

export interface EligibilityOutput {
  /** Whether this thought can be converted to a task */
  convertEligible: boolean;
  /** Always true — this marks the output as coming from the canonical derivation */
  derived: true;
  /** Human-readable reasoning for the decision */
  reasoning: EligibilityReasoning;
}

export type EligibilityReasoning =
  | 'sterling_executable'
  | 'sterling_not_executable'
  | 'sterling_unavailable'
  | 'no_reduction'
  // Legacy values for backwards compatibility (may be used by downstream)
  | 'goal_present_and_grounding_pass'
  | 'goal_present_but_grounding_fail'
  | 'goal_present_but_no_grounding'
  | 'no_goal_present';

// ============================================================================
// Derivation Function
// ============================================================================

/**
 * Derive eligibility from Sterling reduction provenance.
 *
 * This is the SINGLE CHOKE POINT for eligibility (LF-2).
 * All other code paths that need `convertEligible` must call this function.
 *
 * BOUNDARY RULE (I-BOUNDARY-1):
 * TS does NOT infer semantics from language output. Sterling's is_executable
 * is the authoritative decision. TS must NOT override it.
 *
 * The invariant is:
 *   convertEligible === (reduction.sterlingProcessed && reduction.isExecutable)
 *
 * @param input - The Sterling reduction provenance
 * @returns Eligibility decision with derived=true marker
 */
export function deriveEligibility(input: EligibilityInput): EligibilityOutput {
  const r = input.reduction;

  // No reduction provided — not eligible
  if (!r) {
    return {
      convertEligible: false,
      derived: true,
      reasoning: 'no_reduction',
    };
  }

  // Sterling unavailable (degraded mode) — fail-closed
  if (!r.sterlingProcessed) {
    return {
      convertEligible: false,
      derived: true,
      reasoning: 'sterling_unavailable',
    };
  }

  // Sterling processed — use its is_executable decision (opaque pass-through)
  if (r.isExecutable) {
    return {
      convertEligible: true,
      derived: true,
      reasoning: 'sterling_executable',
    };
  }

  return {
    convertEligible: false,
    derived: true,
    reasoning: 'sterling_not_executable',
  };
}

/**
 * Assert that eligibility was derived correctly.
 *
 * Use this in tests to verify that the eligibility invariant holds.
 * Throws if the invariant is violated.
 *
 * @param input - The original input to deriveEligibility
 * @param output - The output from deriveEligibility
 * @throws Error if the invariant is violated
 */
export function assertEligibilityInvariant(
  input: EligibilityInput,
  output: EligibilityOutput
): void {
  const r = input.reduction;
  const expectedEligible = r !== null && r.sterlingProcessed && r.isExecutable;

  if (output.convertEligible !== expectedEligible) {
    throw new Error(
      `Eligibility invariant violated: expected convertEligible=${expectedEligible}, ` +
      `got ${output.convertEligible}. Input: sterlingProcessed=${r?.sterlingProcessed}, ` +
      `isExecutable=${r?.isExecutable}`
    );
  }

  if (output.derived !== true) {
    throw new Error(
      `Eligibility derivation marker missing: derived=${output.derived}`
    );
  }
}

/**
 * Eligibility Derivation — Single Choke Point (LF-2)
 *
 * This module is the ONLY source of truth for `convertEligible`.
 * All upstream values are OVERWRITTEN by this derivation.
 *
 * The rule is simple and immutable:
 *   convertEligible = (extractedGoal !== null && groundingResult?.pass === true)
 *
 * This prevents scattered eligibility logic that could diverge between
 * production and eval, or between different code paths.
 *
 * @author @darianrosebrook
 */

import type { GoalTagV1 } from '../llm-output-sanitizer';

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

export interface EligibilityInput {
  extractedGoal: GoalTagV1 | null;
  groundingResult: GroundingResult | null;
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
  | 'goal_present_and_grounding_pass'
  | 'goal_present_but_grounding_fail'
  | 'goal_present_but_no_grounding'
  | 'no_goal_present';

// ============================================================================
// Derivation Function
// ============================================================================

/**
 * Derive eligibility from goal extraction and grounding results.
 *
 * This is the SINGLE CHOKE POINT for eligibility (LF-2).
 * All other code paths that need `convertEligible` must call this function.
 *
 * The invariant is:
 *   convertEligible === (extractedGoal !== null && groundingResult?.pass === true)
 *
 * @param input - The goal extraction and grounding results
 * @returns Eligibility decision with derived=true marker
 */
export function deriveEligibility(input: EligibilityInput): EligibilityOutput {
  const goalPresent = input.extractedGoal !== null;
  const groundingPass = input.groundingResult?.pass === true;

  // The eligibility rule: goal must be present AND grounding must pass
  const convertEligible = goalPresent && groundingPass;

  // Determine reasoning based on state
  let reasoning: EligibilityReasoning;
  if (!goalPresent) {
    reasoning = 'no_goal_present';
  } else if (input.groundingResult === null) {
    reasoning = 'goal_present_but_no_grounding';
  } else if (groundingPass) {
    reasoning = 'goal_present_and_grounding_pass';
  } else {
    reasoning = 'goal_present_but_grounding_fail';
  }

  return {
    convertEligible,
    derived: true,
    reasoning,
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
  const expectedEligible = input.extractedGoal !== null && input.groundingResult?.pass === true;

  if (output.convertEligible !== expectedEligible) {
    throw new Error(
      `Eligibility invariant violated: expected convertEligible=${expectedEligible}, ` +
      `got ${output.convertEligible}. Input: goal=${input.extractedGoal !== null}, ` +
      `grounding=${input.groundingResult?.pass}`
    );
  }

  if (output.derived !== true) {
    throw new Error(
      `Eligibility derivation marker missing: derived=${output.derived}`
    );
  }
}

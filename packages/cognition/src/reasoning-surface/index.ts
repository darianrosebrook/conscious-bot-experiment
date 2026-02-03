/**
 * Reasoning Surface — Production API Boundary
 *
 * This module is the canonical boundary for thought processing logic.
 * Both production code and eval harness import from here, ensuring
 * they use identical code paths (LF-4).
 *
 * The reasoning surface provides:
 * - Frame rendering (factual-only situation frames)
 * - Goal extraction (bounded-scan parser)
 * - Goal grounding (falsification-style validation)
 * - Eligibility derivation (single choke point)
 *
 * IMPORTANT: Changes to this module affect both production and eval.
 * Update SURFACE_VERSION when semantics change, and regenerate digests.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Version and Digests (LF-4: Verifiable Production Surface)
// ============================================================================

/**
 * Version of the reasoning surface API.
 * Bump when semantics change (not just implementation).
 */
export const SURFACE_VERSION = '1.0.0';

/**
 * SHA-256 digests of source files for verification.
 * Eval harness can verify it's using the expected code.
 *
 * Regenerate with:
 *   shasum -a 256 packages/cognition/src/reasoning-surface/*.ts
 */
export const SURFACE_DIGESTS = {
  frameRenderer: 'b63887aae45fba37d193c820cf1ad1cf3ddc0de4037fcf61898bf984cb6bc700',
  goalExtractor: '44517d93cc2f81793cd34b5246c61db62a96c8ee7a7f8c0d3ebe16e81f12b9b6',
  grounder: '518648b6c6f37a29cc78cda176d797ec2b19def42d6628ad3ac09113a334b405',
  eligibility: 'fec54e4021da9e9925ec3771c9bb70d5620b2d91987db23fb4fd302faff85857',
} as const;

// ============================================================================
// Frame Rendering
// ============================================================================

export {
  renderSituationFrame,
  thoughtContextToFrameContext,
  FRAME_PROFILES,
} from './frame-renderer';

export type {
  FrameProfile,
  FrameContext,
  SituationFrame,
  BotFacts,
  WorldFacts,
  StateDelta,
  MemoryItem,
} from './frame-renderer';

// ============================================================================
// Goal Extraction
// ============================================================================

export {
  extractGoal,
  extractGoalFromSanitized,
  extractGoalTag,
  extractIntent,
  normalizeGoalAction,
  canonicalGoalKey,
  sanitizeLLMOutput,
  CANONICAL_ACTIONS,
  NORMALIZE_MAP_VERSION,
} from './goal-extractor';

export type {
  GoalExtractionResult,
  GoalTag,
  GoalTagV1,
  GoalTagFailReason,
  IntentLabel,
  IntentParse,
} from './goal-extractor';

// ============================================================================
// Goal Grounding
// ============================================================================

export {
  groundGoal,
  createGroundingContext,
} from './grounder';

export type {
  GroundingContext,
  GroundingConfig,
} from './grounder';

// ============================================================================
// Eligibility Derivation (LF-2: Single Choke Point)
// ============================================================================

export {
  deriveEligibility,
  assertEligibilityInvariant,
} from './eligibility';

export type {
  EligibilityInput,
  EligibilityOutput,
  EligibilityReasoning,
  GroundingResult,
  GroundingViolation,
} from './eligibility';

// ============================================================================
// Convenience: Full Processing Pipeline
// ============================================================================

import type { GoalTagV1 } from './goal-extractor';
import type { GroundingContext } from './grounder';
import type { EligibilityOutput, GroundingResult } from './eligibility';
import { sanitizeLLMOutput } from './goal-extractor';
import { groundGoal } from './grounder';
import { deriveEligibility } from './eligibility';

/**
 * Result of the full reasoning pipeline.
 */
export interface ReasoningPipelineResult {
  /** Sanitized text (goal tag removed) */
  text: string;
  /** Extracted goal, or null */
  goal: GoalTagV1 | null;
  /** Grounding result, or null if no goal */
  grounding: GroundingResult | null;
  /** Eligibility derivation */
  eligibility: EligibilityOutput;
}

/**
 * Run the full reasoning pipeline on raw LLM output.
 *
 * This is a convenience function that chains:
 * 1. sanitizeLLMOutput (extracts goal)
 * 2. groundGoal (validates against context)
 * 3. deriveEligibility (determines convertEligible)
 *
 * @param rawOutput - Raw LLM output text
 * @param context - Grounding context for validation
 * @returns Full pipeline result
 */
export function processLLMOutput(
  rawOutput: string,
  context: GroundingContext
): ReasoningPipelineResult {
  // Step 1: Sanitize and extract goal
  const sanitized = sanitizeLLMOutput(rawOutput);

  // Step 2: Ground goal if present
  const grounding = sanitized.goalTagV1
    ? groundGoal(sanitized.goalTagV1, context)
    : null;

  // Step 3: Derive eligibility (single choke point)
  const eligibility = deriveEligibility({
    extractedGoal: sanitized.goalTagV1,
    groundingResult: grounding,
  });

  return {
    text: sanitized.text,
    goal: sanitized.goalTagV1,
    grounding,
    eligibility,
  };
}

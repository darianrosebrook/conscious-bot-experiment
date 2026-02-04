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
 * - Sterling language IO integration (semantic authority)
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
export const SURFACE_VERSION = '1.1.0'; // Bumped for Sterling integration

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
// Sterling Language IO Integration
// ============================================================================

import type { GoalTagV1 } from './goal-extractor';
import type { GroundingContext } from './grounder';
import type { EligibilityOutput, EligibilityReasoning, GroundingResult } from './eligibility';
import { sanitizeLLMOutput } from './goal-extractor';
import { groundGoal } from './grounder';
import { deriveEligibility } from './eligibility';

// Import Sterling language IO client
import {
  getDefaultLanguageIOClient,
  type ReduceResult,
  type ReduceError,
  type FallbackResult,
  type ReducerResultView,
} from '../language-io';

// ============================================================================
// Pipeline Result Types
// ============================================================================

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
 * Extended result from Sterling-based pipeline.
 *
 * This includes all fields from ReasoningPipelineResult plus
 * Sterling-specific metadata for provenance and debugging.
 */
export interface SterlingPipelineResult extends ReasoningPipelineResult {
  /** Whether Sterling was used (vs fallback) */
  sterlingUsed: boolean;
  /** Sterling reducer result (if Sterling was used) */
  reducerResult: ReducerResultView | null;
  /** Reason for fallback (if Sterling was not used) */
  fallbackReason: string | null;
  /** Whether the result is executable (from Sterling) */
  isExecutable: boolean;
  /** Block reason if not executable */
  blockReason: string | null;
  /** Envelope ID for provenance */
  envelopeId: string | null;
  /** Round-trip duration in ms */
  durationMs: number;
  /** Whether grounding was performed (false in fallback mode) */
  groundingPerformed: boolean;
}

/**
 * Options for async LLM output processing.
 */
export interface ProcessLLMOutputAsyncOptions {
  /** Model ID for provenance tracking */
  modelId?: string;
  /** Prompt digest for provenance tracking */
  promptDigest?: string;
  /** Whether to require executable result (throws if not) */
  requireExecutable?: boolean;
}

// ============================================================================
// Legacy Sync Pipeline (Fallback)
// ============================================================================

/**
 * Run the full reasoning pipeline on raw LLM output (LEGACY SYNC).
 *
 * This is the LEGACY synchronous function that chains:
 * 1. sanitizeLLMOutput (extracts goal)
 * 2. groundGoal (validates against context)
 * 3. deriveEligibility (determines convertEligible)
 *
 * IMPORTANT: This does NOT go through Sterling. Use processLLMOutputAsync()
 * for production paths that need Sterling semantic authority.
 *
 * @param rawOutput - Raw LLM output text
 * @param context - Grounding context for validation
 * @returns Full pipeline result
 *
 * @deprecated Use processLLMOutputAsync() for Sterling semantic authority
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

// ============================================================================
// Sterling-Based Async Pipeline (Production)
// ============================================================================

/**
 * Run the full reasoning pipeline on raw LLM output through Sterling.
 *
 * This is the CANONICAL entry point for production paths that need
 * Sterling semantic authority. It:
 *
 * 1. Builds a LanguageIOEnvelope from the raw output
 * 2. Sends the envelope to Sterling for semantic reduction
 * 3. Parses and validates the reducer result
 * 4. Maps the result to the ReasoningPipelineResult shape
 * 5. Enforces the execution gate (is_executable)
 *
 * If Sterling is unavailable, falls back to legacy processing for
 * explicit [GOAL:] tags only (fail-closed for natural language intent).
 *
 * @param rawOutput - Raw LLM output text
 * @param context - Grounding context for validation
 * @param options - Optional processing options
 * @returns Extended pipeline result with Sterling metadata
 */
export async function processLLMOutputAsync(
  rawOutput: string,
  context: GroundingContext,
  options: ProcessLLMOutputAsyncOptions = {}
): Promise<SterlingPipelineResult> {
  const client = getDefaultLanguageIOClient();
  await client.connect();

  // Try Sterling first
  const outcome = await client.reduceWithFallback(rawOutput, {
    modelId: options.modelId,
    promptDigest: options.promptDigest,
  });

  // Handle fallback mode
  if ('mode' in outcome && outcome.mode === 'fallback') {
    return handleFallbackResult(rawOutput, context, outcome);
  }

  // Sterling succeeded - map to pipeline result
  const reduceResult = outcome as ReduceResult;
  return mapSterlingResultToPipelineResult(rawOutput, context, reduceResult, options);
}

/**
 * Handle fallback when Sterling is unavailable.
 *
 * In fallback mode:
 * - Explicit [GOAL:] tags → process with legacy pipeline
 * - Natural language intent → NOT executable (fail-closed)
 */
function handleFallbackResult(
  rawOutput: string,
  context: GroundingContext,
  fallback: FallbackResult
): SterlingPipelineResult {
  // Run legacy pipeline to get text/goal/grounding
  const legacyResult = processLLMOutput(rawOutput, context);

  // In fallback mode, execution depends on policy:
  // - 'permissive': Allow explicit goals even without grounding (resilience)
  // - 'markers_only': Allow explicit goals but mark as ungrounded (default)
  // - 'strict': Never reached (throws earlier)
  const isExecutable = fallback.hasExplicitGoal && legacyResult.goal !== null;

  // Build block reason that indicates lack of grounding
  let blockReason: string | null = null;
  if (!isExecutable) {
    blockReason = 'Sterling unavailable; natural language intent not processed';
  } else if (fallback.fallbackPolicy === 'markers_only') {
    blockReason = 'UNGROUNDED: Sterling unavailable, execution granted for explicit marker only';
  }

  return {
    ...legacyResult,
    sterlingUsed: false,
    reducerResult: null,
    fallbackReason: fallback.fallbackReason,
    isExecutable,
    blockReason,
    envelopeId: fallback.envelope.envelope_id,
    durationMs: 0, // Not tracked in fallback
    groundingPerformed: false, // SECURITY: No grounding in fallback mode
  };
}

/**
 * Map Sterling reducer result to pipeline result.
 *
 * This translates Sterling's semantic output into the shape expected
 * by downstream consumers (KeepAliveController, etc.).
 */
function mapSterlingResultToPipelineResult(
  rawOutput: string,
  context: GroundingContext,
  reduceResult: ReduceResult,
  options: ProcessLLMOutputAsyncOptions
): SterlingPipelineResult {
  const { result, envelope, canConvert, blockReason, durationMs } = reduceResult;

  // Run legacy pipeline to get text/goal extraction
  // (Sterling doesn't return the sanitized text or extracted goal shape)
  const legacyResult = processLLMOutput(rawOutput, context);

  // Build grounding result from Sterling's grounding
  let grounding: GroundingResult | null = null;
  if (result.grounding) {
    grounding = {
      pass: result.grounding.passed,
      reason: result.grounding.reason,
      referencedFacts: [],
      violations: result.grounding.passed ? [] : [{
        type: 'unknown_reference',
        description: result.grounding.reason,
        trigger: 'sterling_grounding_failed',
      }],
    };
  } else if (legacyResult.grounding) {
    // Use legacy grounding if Sterling didn't provide one
    grounding = legacyResult.grounding;
  }

  // Build eligibility from Sterling's is_executable
  // Determine reasoning string
  const goalPresent = result.committed_goal_prop_id !== null;
  const groundingPass = result.grounding?.passed ?? false;
  let reasoning: EligibilityReasoning;
  if (goalPresent && groundingPass) {
    reasoning = 'goal_present_and_grounding_pass';
  } else if (goalPresent && !groundingPass) {
    reasoning = 'goal_present_but_grounding_fail';
  } else if (goalPresent) {
    reasoning = 'goal_present_but_no_grounding';
  } else {
    reasoning = 'no_goal_present';
  }

  const eligibility: EligibilityOutput = {
    convertEligible: result.is_executable,
    derived: true,
    reasoning,
  };

  // Throw if requireExecutable was set and result is not executable
  if (options.requireExecutable && !result.is_executable) {
    const reason = blockReason || 'Result is not executable';
    throw new Error(`ExecutionGateError: ${reason}`);
  }

  return {
    text: legacyResult.text,
    goal: legacyResult.goal,
    grounding,
    eligibility,
    sterlingUsed: true,
    reducerResult: result,
    fallbackReason: null,
    isExecutable: result.is_executable,
    blockReason,
    envelopeId: envelope.envelope_id,
    durationMs,
    groundingPerformed: result.grounding !== null, // True if Sterling provided grounding
  };
}

// ============================================================================
// Re-exports from Language IO for Convenience
// ============================================================================

export {
  getDefaultLanguageIOClient,
  SterlingLanguageIOClient,
  setDefaultLanguageIOClient,
  ExecutionGateError,
  canConvertToTask,
  requireExecutable,
} from '../language-io';

export type {
  ReduceResult,
  ReduceError,
  FallbackResult,
  ReducerResultView,
  LanguageIOClientConfig,
} from '../language-io';

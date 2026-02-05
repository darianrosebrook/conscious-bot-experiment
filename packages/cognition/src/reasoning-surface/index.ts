/**
 * Reasoning Surface — Production API Boundary
 *
 * This module is the canonical boundary for thought processing logic.
 * Both production code and eval harness import from here, ensuring
 * they use identical code paths (LF-4).
 *
 * The reasoning surface provides:
 * - Frame rendering (factual-only situation frames)
 * - Goal grounding (Sterling-owned, fail-closed)
 * - Eligibility derivation (single choke point, Sterling-driven)
 * - Sterling language IO integration (semantic authority)
 *
 * MIGRATION (PR4): Local semantic logic has been DELETED.
 * - Goal extraction → Sterling via language-io
 * - Grounding → Sterling via ReductionProvenance
 * - Eligibility → Sterling's is_executable (opaque pass-through)
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
export const SURFACE_VERSION = '2.0.0'; // Bumped for Sterling-owned grounding/eligibility

/**
 * SHA-256 digests of source files for verification.
 * Eval harness can verify it's using the expected code.
 *
 * Regenerate with:
 *   shasum -a 256 packages/cognition/src/reasoning-surface/*.ts
 *
 * MIGRATION NOTE (PR4):
 * - goal-extractor.ts DELETED (Migration A)
 * - grounder.ts REWRITTEN (Sterling pass-through)
 * - eligibility.ts REWRITTEN (Sterling-driven)
 */
export const SURFACE_DIGESTS = {
  frameRenderer: 'b63887aae45fba37d193c820cf1ad1cf3ddc0de4037fcf61898bf984cb6bc700',
  grounder: 'PENDING_REGENERATION', // Regenerate after migration
  eligibility: 'PENDING_REGENERATION', // Regenerate after migration
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
// Goal Grounding (Sterling-Owned)
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
// Eligibility Derivation (LF-2: Single Choke Point, Sterling-Driven)
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

import type { ReductionProvenance } from '../types';
import type { GroundingContext } from './grounder';
import type { EligibilityOutput, GroundingResult } from './eligibility';
import { groundGoal, createGroundingContext } from './grounder';
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
 *
 * MIGRATION (PR4): Changed to Sterling-driven.
 * - `goal` field removed — Sterling provides committed_goal_prop_id
 * - `grounding` is derived from Sterling's result
 * - `eligibility` is derived from Sterling's is_executable
 */
export interface ReasoningPipelineResult {
  /** Sanitized text (for display) */
  text: string;
  /** Grounding result from Sterling */
  grounding: GroundingResult | null;
  /** Eligibility derivation from Sterling */
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
// Eligibility Computation Helper
// ============================================================================

/**
 * Compute eligibility from ReductionProvenance.
 *
 * This is a convenience function that combines groundGoal and deriveEligibility
 * for use by thought-generator.ts and other consumers.
 *
 * BOUNDARY RULE (I-BOUNDARY-1):
 * This function does NOT perform semantic inference. It passes Sterling's
 * reduction result through to the eligibility derivation.
 *
 * @param reduction - Sterling reduction provenance, or null
 * @param context - Grounding context (unused — Sterling owns grounding)
 * @returns Eligibility output and grounding result
 */
export function computeEligibility(
  reduction: ReductionProvenance | null,
  context: { currentState?: Record<string, unknown> }
): { eligibility: EligibilityOutput; grounding: GroundingResult | null } {
  const groundingContext = createGroundingContext(context);
  const grounding = groundGoal(reduction, groundingContext);

  const eligibility = deriveEligibility({ reduction });

  return { eligibility, grounding };
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
 * If Sterling is unavailable, returns a fail-closed result (not executable).
 *
 * @param rawOutput - Raw LLM output text
 * @param context - Grounding context (for signature compatibility)
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
 * In fallback mode, execution is NOT allowed (fail-closed).
 * TS does NOT perform local semantic interpretation.
 */
function handleFallbackResult(
  rawOutput: string,
  _context: GroundingContext,
  fallback: FallbackResult
): SterlingPipelineResult {
  // Build reduction provenance for degraded mode
  const degradedReduction: ReductionProvenance = {
    sterlingProcessed: false,
    envelopeId: fallback.envelope.envelope_id,
    reducerResult: null,
    isExecutable: false,
    blockReason: 'sterling_unavailable',
    durationMs: 0,
    sterlingError: fallback.fallbackReason,
  };

  const grounding = groundGoal(degradedReduction, _context);
  const eligibility = deriveEligibility({ reduction: degradedReduction });

  return {
    text: fallback.envelope.sanitized_text,
    grounding,
    eligibility,
    sterlingUsed: false,
    reducerResult: null,
    fallbackReason: fallback.fallbackReason,
    isExecutable: false,
    blockReason: 'Sterling unavailable; execution not allowed',
    envelopeId: fallback.envelope.envelope_id,
    durationMs: 0,
    groundingPerformed: false,
  };
}

/**
 * Map Sterling reducer result to pipeline result.
 *
 * This translates Sterling's semantic output into the shape expected
 * by downstream consumers (KeepAliveController, etc.).
 */
function mapSterlingResultToPipelineResult(
  _rawOutput: string,
  _context: GroundingContext,
  reduceResult: ReduceResult,
  options: ProcessLLMOutputAsyncOptions
): SterlingPipelineResult {
  const { result, envelope, canConvert, blockReason, durationMs } = reduceResult;

  // Build reduction provenance
  const reduction: ReductionProvenance = {
    sterlingProcessed: true,
    envelopeId: envelope.envelope_id,
    reducerResult: result,
    isExecutable: result.is_executable,
    blockReason,
    durationMs,
    sterlingError: null,
  };

  // Derive grounding and eligibility through the canonical path
  const grounding = groundGoal(reduction, _context);
  const eligibility = deriveEligibility({ reduction });

  // Throw if requireExecutable was set and result is not executable
  if (options.requireExecutable && !result.is_executable) {
    const reason = blockReason || 'Result is not executable';
    throw new Error(`ExecutionGateError: ${reason}`);
  }

  return {
    text: envelope.sanitized_text,
    grounding,
    eligibility,
    sterlingUsed: true,
    reducerResult: result,
    fallbackReason: null,
    isExecutable: result.is_executable,
    blockReason,
    envelopeId: envelope.envelope_id,
    durationMs,
    groundingPerformed: result.grounding !== null,
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

// ============================================================================
// DEPRECATED: Legacy Exports (for downstream compatibility)
// ============================================================================
// These exports are DEPRECATED and will be removed after packages/planning migration.
// DO NOT use these in new code.

/**
 * @deprecated Use language-io module instead. Sterling is the semantic authority.
 */
export {
  extractGoalTag,
  extractIntent,
  sanitizeLLMOutput,
} from '../llm-output-sanitizer';

/**
 * @deprecated Use ReductionProvenance.reducerResult instead. Sterling owns goal extraction.
 */
export type {
  GoalTag,
  GoalTagV1,
  GoalTagFailReason,
  IntentLabel,
  IntentParse,
} from '../llm-output-sanitizer';

/**
 * @deprecated Use processLLMOutputAsync instead. This bypasses Sterling.
 */
export function processLLMOutput(
  rawOutput: string,
  context: GroundingContext
): ReasoningPipelineResult & { goal: any } {
  // Legacy sync processing — does NOT go through Sterling
  // This is kept ONLY for backwards compatibility during migration
  const { sanitizeLLMOutput: sanitize } = require('../llm-output-sanitizer');
  const sanitized = sanitize(rawOutput);

  // Build a fake reduction for the new pipeline
  const fakeReduction: ReductionProvenance = {
    sterlingProcessed: false,
    envelopeId: null,
    reducerResult: null,
    isExecutable: false,
    blockReason: 'legacy_sync_path_no_sterling',
    durationMs: 0,
    sterlingError: 'Legacy sync path does not use Sterling',
  };

  const grounding = groundGoal(fakeReduction, context, { requireSterling: false });
  const eligibility = deriveEligibility({ reduction: fakeReduction });

  return {
    text: sanitized.text,
    goal: sanitized.goalTagV1, // Legacy field
    grounding,
    eligibility,
  };
}

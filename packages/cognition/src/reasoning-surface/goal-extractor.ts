/**
 * Goal Extractor — Production Reasoning Surface (DEPRECATED)
 *
 * Re-exports evidence extraction from llm-output-sanitizer.
 * Semantic exports removed in PR2 - Sterling is the semantic authority.
 *
 * @deprecated Migrating to language-io module. Semantic functions deleted.
 * @author @darianrosebrook
 */

// Re-export types from the canonical source
export type {
  GoalTag,
  GoalTagV1,
  GoalTagFailReason,
  IntentLabel,
  IntentParse,
} from '../llm-output-sanitizer';

// Re-export functions (semantic exports removed in PR2)
export {
  extractGoalTag,
  extractIntent,
  // DELETED (PR2): normalizeGoalAction - Sterling normalizes
  // DELETED (PR2): canonicalGoalKey - use Sterling committed_goal_prop_id
  sanitizeLLMOutput,
  // DELETED (PR2): CANONICAL_ACTIONS - Sterling validates
  // DELETED (PR2): NORMALIZE_MAP_VERSION - Sterling normalizes
} from '../llm-output-sanitizer';

// ============================================================================
// Additional Goal Extraction Utilities
// ============================================================================

import type { GoalTagV1 } from '../llm-output-sanitizer';
import { extractGoalTag as baseExtractGoalTag, sanitizeLLMOutput } from '../llm-output-sanitizer';

/**
 * Result of goal extraction with additional metadata for the reasoning surface.
 */
export interface GoalExtractionResult {
  /** The extracted goal, or null if no valid goal was found */
  goal: GoalTagV1 | null;
  /** The text with the goal tag removed */
  cleanedText: string;
  /** Whether a goal tag was present (even if invalid) */
  tagPresent: boolean;
  /** The raw goal tag text for debugging (when parsing fails) */
  rawTag: string | null;
  /** Reason why extraction failed (if it did) */
  failReason: string;
  /** Number of [GOAL: openers found (for multi-tag detection) */
  tagCount: number;
}

/**
 * Extract a goal tag from raw LLM output.
 *
 * This wraps the base extractGoalTag to provide a more ergonomic result
 * for the reasoning surface consumers.
 *
 * @param text - The raw text to extract a goal from
 * @returns Structured extraction result
 */
export function extractGoal(text: string): GoalExtractionResult {
  const result = baseExtractGoalTag(text);

  return {
    goal: result.goalV1,
    cleanedText: result.text,
    tagPresent: result.tagCount > 0,
    rawTag: result.rawGoalTag,
    failReason: result.failReason,
    tagCount: result.tagCount,
  };
}

/**
 * Extract a goal tag from text that has already been sanitized.
 *
 * Use this when you've already run sanitizeLLMOutput and have the
 * goalTagV1 from its result. This avoids double-extraction.
 *
 * @param sanitizedResult - The result from sanitizeLLMOutput
 * @returns Structured extraction result
 */
export function extractGoalFromSanitized(sanitizedResult: ReturnType<typeof sanitizeLLMOutput>): GoalExtractionResult {
  return {
    goal: sanitizedResult.goalTagV1,
    cleanedText: sanitizedResult.text,
    tagPresent: sanitizedResult.flags.goalTagCount > 0,
    rawTag: sanitizedResult.flags.rawGoalTag,
    failReason: sanitizedResult.flags.goalTagFailReason,
    tagCount: sanitizedResult.flags.goalTagCount,
  };
}

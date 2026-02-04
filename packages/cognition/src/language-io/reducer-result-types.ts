/**
 * TypeScript wrapper for LanguageReducerResultV1.
 *
 * Exposes ONLY what TS needs:
 * - Stable identifiers (for task creation)
 * - Execution status (for gating)
 * - Advisory (for routing ONLY)
 *
 * Does NOT expose:
 * - Raw predicates
 * - Proposition roles
 * - Entity labels
 * - Anything enabling local semantic mapping
 *
 * Key invariants:
 * - I-CONVERSION-1: TS must not map predicates to task types locally
 * - I-BOUNDARY-2: TS must not define semantic enums
 *
 * @author @darianrosebrook
 */

import {
  validateReducerResultVersion,
  SchemaVersionError,
  REDUCER_RESULT_SUPPORTED_VERSIONS,
} from './schema-compatibility';

// =============================================================================
// Result View Types (What TS Receives)
// =============================================================================

/**
 * TS wrapper for LanguageReducerResultV1.
 *
 * This is a READ-ONLY view exposing only safe fields.
 * TS cannot access raw predicates, proposition roles, or anything
 * that would enable local semantic mapping.
 */
export interface ReducerResultView {
  // Stable identifiers (for task creation linkage)
  readonly committed_goal_prop_id: string | null;
  readonly committed_ir_digest: string;
  readonly source_envelope_id: string;

  // Execution status (THE gate for task conversion)
  readonly is_executable: boolean;
  readonly is_semantically_empty: boolean;

  // Advisory (routing hint ONLY, may be null)
  readonly advisory: AdvisoryView | null;

  // Grounding (if performed)
  readonly grounding: GroundingView | null;

  // Schema version (for compatibility checking)
  readonly schema_version: string;

  // Reducer provenance
  readonly reducer_version: string;
}

/**
 * Advisory classification view.
 *
 * Advisory is for ROUTING HINTS only - it does NOT grant execution authority.
 * Even if advisory.confidence is high, if is_executable is false, no task conversion.
 */
export interface AdvisoryView {
  readonly intent_family: string | null;
  readonly intent_type: string | null;
  readonly confidence: number;
  readonly suggested_domain: string | null;
}

/**
 * Grounding result view.
 *
 * Grounding validates that the committed goal can be executed
 * given the current world state.
 */
export interface GroundingView {
  readonly passed: boolean;
  readonly reason: string;
  readonly world_snapshot_digest: string | null;
}

// =============================================================================
// Response Validation
// =============================================================================

/**
 * Type guard for valid reducer response structure.
 */
function isValidReducerResponse(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const data = raw as Record<string, unknown>;
  return (
    typeof data.schema_version === 'string' &&
    typeof data.source_envelope_id === 'string' &&
    typeof data.committed_ir_digest === 'string'
  );
}

/**
 * Parse raw reducer response into ReducerResultView.
 *
 * Validates schema version and fails closed on unknown versions.
 *
 * @param raw - Raw JSON response from Sterling
 * @returns Parsed ReducerResultView
 * @throws Error if response is invalid or version is unsupported
 */
export function parseReducerResult(raw: unknown): ReducerResultView {
  if (!isValidReducerResponse(raw)) {
    throw new Error('Invalid reducer response structure');
  }

  const data = raw as Record<string, unknown>;

  // Version check - fail closed on unknown versions
  const schemaVersion = data.schema_version as string;
  validateReducerResultVersion(schemaVersion);

  // Extract advisory if present
  const advisory = data.advisory
    ? {
        intent_family: ((data.advisory as Record<string, unknown>).intent_family as string) ?? null,
        intent_type: ((data.advisory as Record<string, unknown>).intent_type as string) ?? null,
        confidence: ((data.advisory as Record<string, unknown>).confidence as number) ?? 0,
        suggested_domain:
          ((data.advisory as Record<string, unknown>).suggested_domain as string) ?? null,
      }
    : null;

  // Extract grounding if present
  const grounding = data.grounding
    ? {
        passed: (data.grounding as Record<string, unknown>).passed as boolean,
        reason: ((data.grounding as Record<string, unknown>).reason as string) ?? '',
        world_snapshot_digest:
          ((data.grounding as Record<string, unknown>).world_snapshot_digest as string) ?? null,
      }
    : null;

  // Compute is_executable based on Sterling's rules:
  // - Must have committed_goal_prop_id
  // - If grounding was performed, it must have passed
  const hasCommittedGoal = data.committed_goal_prop_id !== null;
  const groundingPassed = grounding === null || grounding.passed;
  const isExecutable = hasCommittedGoal && groundingPassed;

  // Compute is_semantically_empty
  const isSemanticEmpty = !hasCommittedGoal && !data.has_committed_propositions;

  return {
    committed_goal_prop_id: (data.committed_goal_prop_id as string) ?? null,
    committed_ir_digest: data.committed_ir_digest as string,
    source_envelope_id: data.source_envelope_id as string,
    is_executable: isExecutable,
    is_semantically_empty: Boolean(isSemanticEmpty),
    advisory,
    grounding,
    schema_version: schemaVersion,
    reducer_version: (data.reducer_version as string) ?? 'unknown',
  };
}

// Re-export for convenience
export { SchemaVersionError, REDUCER_RESULT_SUPPORTED_VERSIONS };

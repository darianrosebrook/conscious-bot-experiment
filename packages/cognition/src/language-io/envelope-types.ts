/**
 * TypeScript projections of Sterling Language IO schemas.
 *
 * These types are READ-ONLY projections - they define the shape of data
 * that TS constructs for Sterling to consume. TS must NOT interpret the
 * contents semantically.
 *
 * Key invariants:
 * - I-BOUNDARY-1: Sterling is the only place where free-text becomes semantics
 * - I-BOUNDARY-3: TS may extract only explicitly declared surface markers verbatim
 *
 * @author @darianrosebrook
 */

// =============================================================================
// Schema Constants (must match Sterling's Python constants)
// =============================================================================

export const LANGUAGE_IO_ENVELOPE_SCHEMA_ID = 'sterling.language_io_envelope.v1';
export const LANGUAGE_IO_ENVELOPE_SCHEMA_VERSION = '1.0.0';
export const SANITIZATION_VERSION = 'sanitizer/v3';

// =============================================================================
// Supporting Types
// =============================================================================

/**
 * Metadata about sanitization transforms applied to raw text.
 *
 * These flags record what the sanitizer detected/modified, enabling
 * downstream analysis of LLM output patterns without re-parsing.
 */
export interface SanitizationFlags {
  readonly had_code_fences: boolean;
  readonly had_degeneration: boolean;
  readonly had_multiple_goal_tags: boolean;
  readonly stripped_thinking_blocks: boolean;
  readonly normalized_whitespace: boolean;
}

/**
 * A verbatim-extracted surface marker.
 *
 * Key invariant (I-BOUNDARY-3): TS may extract only explicitly declared
 * surface markers verbatim. NO normalization, NO interpretation.
 */
export interface DeclaredMarker {
  /** Category of marker ("GOAL_TAG", "INTENT_LINE", etc.) */
  readonly marker_type: string;
  /** Exactly as written (e.g., "[GOAL: craft wood]") */
  readonly verbatim_text: string;
  /** Character offsets in raw_text_verbatim [start, end] */
  readonly span: readonly [number, number];
}

/**
 * Content-addressed reference to world state for grounding.
 *
 * Grounding = (committed_ir, world_snapshot) -> GroundingResult
 */
export interface WorldSnapshotRef {
  /** Short content-addressed ID (sha256[:16]) */
  readonly snapshot_id: string;
  /** Full hash for verification */
  readonly snapshot_digest: string;
  /** Where snapshot came from ("bot_state_endpoint", "session_cache", etc.) */
  readonly source: string;
}

// =============================================================================
// Main Envelope Type
// =============================================================================

/**
 * Capsule for LLM output sent to Sterling for semantic inference.
 *
 * TypeScript constructs this; Sterling consumes it.
 * TypeScript must NOT interpret the contents semantically.
 *
 * Key design decisions:
 * 1. Carries BOTH raw and sanitized text as versioned evidence surfaces
 * 2. Declared markers are verbatim spans, not interpretations
 * 3. World snapshot is referenced, not embedded (explicit grounding boundary)
 * 4. Envelope ID is content-addressed from raw_text_verbatim
 *
 * Invariants:
 * - I-BOUNDARY-1: Sterling is the only place where free-text becomes semantics
 * - I-BOUNDARY-3: TS may extract only explicitly declared surface markers verbatim
 * - I-AUDIT-1: envelope_id provides provenance anchor for audit chain
 */
export interface LanguageIOEnvelopeV1 {
  // Schema identification
  readonly schema_id: string;
  readonly schema_version: string;

  // Raw content (exact bytes from model)
  readonly raw_text_verbatim: string;

  // Sanitized content (deterministic transform, versioned)
  readonly sanitized_text: string;
  readonly sanitization_version: string;
  readonly sanitization_flags: SanitizationFlags;

  // Declared markers (verbatim spans, list for multiple)
  readonly declared_markers: readonly DeclaredMarker[];

  // Provenance
  readonly envelope_id: string;
  readonly timestamp_ms: number;
  readonly model_id: string | null;
  readonly prompt_digest: string | null;

  // World context reference (for grounding)
  readonly world_snapshot_ref: WorldSnapshotRef | null;
}

/**
 * Create default sanitization flags (nothing detected).
 */
export function createDefaultSanitizationFlags(): SanitizationFlags {
  return {
    had_code_fences: false,
    had_degeneration: false,
    had_multiple_goal_tags: false,
    stripped_thinking_blocks: false,
    normalized_whitespace: false,
  };
}

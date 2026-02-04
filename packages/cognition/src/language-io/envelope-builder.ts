/**
 * LanguageIOEnvelope builder for the Language IO boundary.
 *
 * This is the CANONICAL entry point for envelope construction.
 * TS extracts verbatim markers ONLY - no interpretation, no normalization.
 *
 * Key invariants:
 * - I-BOUNDARY-1: Sterling is the only place where free-text becomes semantics
 * - I-BOUNDARY-3: TS may extract only explicitly declared surface markers verbatim
 * - I-AUDIT-1: envelope_id provides provenance anchor for audit chain
 *
 * @author @darianrosebrook
 */

import { createHash } from 'crypto';
import { extractVerbatimMarkers } from './marker-extractor';
import { sanitize } from './sanitization-pipeline';
import type { LanguageIOEnvelopeV1, WorldSnapshotRef } from './envelope-types';
import {
  LANGUAGE_IO_ENVELOPE_SCHEMA_ID,
  LANGUAGE_IO_ENVELOPE_SCHEMA_VERSION,
} from './envelope-types';

export interface EnvelopeBuilderOptions {
  /** Model identifier (e.g., "mlx-qwen-7b") */
  modelId?: string;
  /** Content-addressed hash of the prompt that produced this output */
  promptDigest?: string;
  /** Reference to world state for grounding */
  worldSnapshotRef?: WorldSnapshotRef;
}

/**
 * Build a LanguageIOEnvelopeV1 from raw LLM output.
 *
 * This is the CANONICAL entry point for envelope construction.
 * TS extracts verbatim markers ONLY - no interpretation, no normalization.
 *
 * @param rawText - Raw LLM output text (exact bytes from model)
 * @param options - Optional metadata (model ID, prompt digest, world snapshot)
 * @returns Complete LanguageIOEnvelopeV1 ready for Sterling consumption
 *
 * @example
 * ```typescript
 * const envelope = buildLanguageIOEnvelope(
 *   'I see trees nearby. [GOAL: craft wood]',
 *   { modelId: 'mlx-qwen-7b' }
 * );
 * // envelope.declared_markers[0].verbatim_text === '[GOAL: craft wood]'
 * // Sterling interprets what "craft wood" means
 * ```
 */
export function buildLanguageIOEnvelope(
  rawText: string,
  options: EnvelopeBuilderOptions = {},
): LanguageIOEnvelopeV1 {
  // 1. Compute envelope_id (must match Python: sha256(raw_text_verbatim)[:16])
  const envelopeId = computeEnvelopeId(rawText);

  // 2. Extract verbatim markers (GOAL_TAG only, no interpretation)
  const declaredMarkers = extractVerbatimMarkers(rawText);

  // 3. Run versioned sanitization pipeline
  const { sanitizedText, flags, version } = sanitize(rawText);

  return {
    schema_id: LANGUAGE_IO_ENVELOPE_SCHEMA_ID,
    schema_version: LANGUAGE_IO_ENVELOPE_SCHEMA_VERSION,
    raw_text_verbatim: rawText,
    sanitized_text: sanitizedText,
    sanitization_version: version,
    sanitization_flags: flags,
    declared_markers: declaredMarkers,
    envelope_id: envelopeId,
    timestamp_ms: Date.now(),
    model_id: options.modelId ?? null,
    prompt_digest: options.promptDigest ?? null,
    world_snapshot_ref: options.worldSnapshotRef ?? null,
  };
}

/**
 * Compute envelope_id matching Python algorithm exactly.
 *
 * CRITICAL: Must produce identical output for identical input.
 * Python uses: hashlib.sha256(raw_text.encode('utf-8')).hexdigest()[:16]
 * TS must use UTF-8 encoding to match.
 *
 * @param rawText - Raw text to hash
 * @returns First 16 hex characters of SHA256 hash
 *
 * @example
 * ```typescript
 * computeEnvelopeId('hello world') === 'b94d27b9934d3e08'
 * ```
 */
export function computeEnvelopeId(rawText: string): string {
  const hash = createHash('sha256');
  hash.update(rawText, 'utf8');
  return hash.digest('hex').slice(0, 16);
}

/**
 * Verify an envelope's ID matches its content.
 *
 * Use this to validate envelopes received from external sources.
 *
 * @param envelope - Envelope to verify
 * @returns true if envelope_id matches computed hash
 */
export function verifyEnvelopeId(envelope: LanguageIOEnvelopeV1): boolean {
  const computed = computeEnvelopeId(envelope.raw_text_verbatim);
  return envelope.envelope_id === computed;
}

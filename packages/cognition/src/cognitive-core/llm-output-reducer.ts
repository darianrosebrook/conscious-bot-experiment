/**
 * LLM Output Reducer — Single Semantic Boundary
 *
 * This module is the ONLY place where raw LLM output becomes a Sterling envelope
 * and is reduced. All semantic interpretation happens in Sterling; TS code here
 * is strictly: envelope assembly, transport, error mapping, and provenance.
 *
 * BOUNDARY RULE (I-REDUCTION-1):
 * TS may assemble envelopes, route tasks, and log provenance, but it may NOT
 * infer or normalize semantic fields that Sterling owns.
 *
 * Forbidden operations after reduce():
 * - Inferring missing fields from text
 * - Normalizing action/target strings
 * - Parsing bracket tags as fallback
 * - "Salvaging" executability if is_executable=false
 *
 * Allowed operations after reduce():
 * - Logging provenance (envelope_id, schema_version, latency)
 * - Error classification and mapping
 * - Routing based on is_executable (opaquely)
 * - Attaching result to downstream context
 *
 * @author @darianrosebrook
 */

import {
  buildLanguageIOEnvelope,
  type LanguageIOEnvelopeV1,
  type ReduceResult,
  type ReduceError as ClientReduceError,
  type ReducerResultView,
  type SterlingLanguageIOClient,
} from '../language-io';

/**
 * Type guard to distinguish ReduceResult from ReduceError.
 */
function isReduceError(result: ReduceResult | ClientReduceError): result is ClientReduceError {
  return 'code' in result && 'message' in result;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Context for LLM output reduction.
 * Contains provenance information but NO semantic interpretation.
 */
export interface ReductionContext {
  /** Model that produced the output */
  modelId?: string;
  /** Digest of the prompt that produced the output */
  promptDigest?: string;
  /** Request ID for tracing */
  requestId?: string;
}

/**
 * Result of reducing LLM output through Sterling.
 * This is the canonical shape for downstream consumption.
 */
export interface ReductionResult {
  /** The Sterling reducer result (semantic authority) */
  reducerResult: ReducerResultView;
  /** The envelope that was sent to Sterling */
  envelope: LanguageIOEnvelopeV1;
  /** Whether the result is executable (opaque pass-through from Sterling) */
  isExecutable: boolean;
  /** Block reason if not executable (opaque pass-through from Sterling) */
  blockReason: string | null;
  /** Round-trip duration in milliseconds */
  durationMs: number;
  /** Whether this was a degraded-mode fallback */
  degradedMode: boolean;
  /** Reason for degraded mode, if applicable */
  degradedReason: string | null;
}

/**
 * Error thrown when reduction fails in a way that cannot be recovered.
 */
export class ReductionError extends Error {
  constructor(
    message: string,
    public readonly envelope: LanguageIOEnvelopeV1,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ReductionError';
  }
}

// ============================================================================
// Structured Logging (Observability)
// ============================================================================

/**
 * Structured log event for reduction operations.
 * One event per request — makes bypass diagnosable in production.
 */
export interface ReductionLogEvent {
  event: 'llm_output_reduction';
  envelope_schema_version: string;
  envelope_id: string;
  /** Hash of verbatim_text (not raw text — privacy) */
  verbatim_text_hash: string;
  reduce_latency_ms: number;
  reducer_result_schema_version: string;
  is_executable: boolean;
  degraded_mode: boolean;
  error_class: string | null;
  request_id: string | null;
}

/**
 * Compute a simple hash of text for logging (not cryptographic).
 * Used to correlate logs without storing raw text.
 */
function hashForLogging(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `hash_${Math.abs(hash).toString(16)}`;
}

// ============================================================================
// Core Reduction Function
// ============================================================================

/**
 * Reduce raw LLM output through Sterling.
 *
 * This is the SINGLE SEMANTIC BOUNDARY. All paths that need semantic
 * interpretation of LLM output must go through this function.
 *
 * IMPORTANT: This function does NOT perform any semantic fix-up on the
 * Sterling result. The reducer result is passed through opaquely.
 *
 * @param rawOutput - Raw text from LLM (verbatim, no preprocessing)
 * @param client - Sterling language IO client (injectable for testing)
 * @param context - Provenance context (optional)
 * @returns Reduction result with Sterling's semantic interpretation
 * @throws ReductionError if reduction fails and cannot be recovered
 */
export async function reduceRawLLMOutput(
  rawOutput: string,
  client: SterlingLanguageIOClient,
  context: ReductionContext = {}
): Promise<ReductionResult> {
  const startTime = performance.now();

  // Step 1: Build envelope (TS assembles, no semantic interpretation)
  // Build envelope BEFORE connect so we have provenance even on connect failure
  const envelope = buildLanguageIOEnvelope(rawOutput, {
    modelId: context.modelId,
    promptDigest: context.promptDigest,
  });

  // Step 2: Ensure client is connected
  // Wrap connect failures in ReductionError to preserve envelope provenance
  try {
    await client.connect();
  } catch (err) {
    throw new ReductionError(
      `Sterling connect failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      envelope,
      err instanceof Error ? err : undefined
    );
  }

  // Step 3: Reduce through Sterling (semantic authority)
  let degradedMode = false;
  let degradedReason: string | null = null;

  const reduceOutcome = await client.reduce(rawOutput, {
    modelId: context.modelId,
    promptDigest: context.promptDigest,
  });

  // Check if Sterling returned an error
  if (isReduceError(reduceOutcome)) {
    // Reduction failed — do NOT attempt local semantic parsing
    // This is fail-closed: if Sterling can't reduce, we don't guess
    const durationMs = performance.now() - startTime;

    // Log the failure for observability
    logReduction({
      event: 'llm_output_reduction',
      envelope_schema_version: envelope.schema_version,
      envelope_id: envelope.envelope_id,
      verbatim_text_hash: hashForLogging(envelope.raw_text_verbatim),
      reduce_latency_ms: durationMs,
      reducer_result_schema_version: 'N/A',
      is_executable: false,
      degraded_mode: true,
      error_class: reduceOutcome.code,
      request_id: context.requestId ?? null,
    });

    throw new ReductionError(
      `Sterling reduction failed: [${reduceOutcome.code}] ${reduceOutcome.message}`,
      envelope
    );
  }

  // Success - reduceOutcome is ReduceResult
  const reduceResult = reduceOutcome;

  const durationMs = performance.now() - startTime;

  // Step 4: Log for observability (no semantic processing here)
  logReduction({
    event: 'llm_output_reduction',
    envelope_schema_version: envelope.schema_version,
    envelope_id: envelope.envelope_id,
    verbatim_text_hash: hashForLogging(envelope.raw_text_verbatim),
    reduce_latency_ms: durationMs,
    reducer_result_schema_version: reduceResult.result.schema_version ?? '1.0.0',
    is_executable: reduceResult.result.is_executable,
    degraded_mode: degradedMode,
    error_class: null,
    request_id: context.requestId ?? null,
  });

  // Step 5: Return result (opaque pass-through, NO semantic fix-up)
  return {
    reducerResult: reduceResult.result,
    envelope: reduceResult.envelope,
    isExecutable: reduceResult.result.is_executable,
    blockReason: reduceResult.blockReason,
    durationMs,
    degradedMode,
    degradedReason,
  };
}

/**
 * Log a reduction event.
 * Separated for testability and potential async logging.
 */
function logReduction(event: ReductionLogEvent): void {
  // Use structured logging if available, otherwise console
  if (process.env.NODE_ENV !== 'test') {
    console.log(JSON.stringify(event));
  }
}

// ============================================================================
// Test Helpers (exported for DI)
// ============================================================================

/**
 * Create a mock reduction result for testing.
 * Tests should use this to avoid constructing fragile fixtures.
 */
export function createMockReductionResult(
  overrides: Partial<ReductionResult> = {}
): ReductionResult {
  return {
    reducerResult: {
      is_executable: true,
      is_semantically_empty: false,
      committed_goal_prop_id: 'prop_test_123',
      committed_ir_digest: 'digest_test_456',
      source_envelope_id: 'env_test_abc',
      advisory: null,
      grounding: null,
      schema_version: '1.0.0',
      reducer_version: '1.0.0',
    },
    envelope: {
      schema_id: 'language_io_envelope',
      schema_version: '1.0.0',
      envelope_id: 'env_test_abc',
      raw_text_verbatim: 'test output',
      sanitized_text: 'test output',
      sanitization_version: '1.0.0',
      sanitization_flags: {},
      declared_markers: [],
      model_id: null,
      prompt_digest: null,
      world_snapshot_ref: null,
      timestamp_ms: Date.now(),
    } as unknown as LanguageIOEnvelopeV1,
    isExecutable: true,
    blockReason: null,
    durationMs: 10,
    degradedMode: false,
    degradedReason: null,
    ...overrides,
  };
}

/**
 * Sterling Language IO Client
 *
 * This is the SINGLE module that performs the language IO reducer roundtrip.
 * All code paths that need to process LLM output through Sterling must use
 * this client.
 *
 * Flow:
 * 1. buildLanguageIOEnvelope(rawText) - construct input capsule
 * 2. send envelope to Sterling "language_io.reduce" command via transport
 * 3. parseReducerResult(rawResponse) - parse output
 * 4. requireExecutable(result) - enforce execution gate
 *
 * Key invariants:
 * - I-BOUNDARY-1: Sterling is the only semantic authority
 * - I-FAILCLOSED-1: Unknown versions and unavailable Sterling fail closed
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import type { LanguageIOEnvelopeV1, WorldSnapshotRef } from './envelope-types';
import { buildLanguageIOEnvelope } from './envelope-builder';
import type { ReducerResultView } from './reducer-result-types';
import { parseReducerResult, SchemaVersionError } from './reducer-result-types';
import {
  canConvertToTask,
  requireExecutable,
  getExecutionBlockReason,
  ExecutionGateError,
} from './execution-gate';
import type { LanguageIOTransport } from './transport';
import { getDefaultTransport, MockLanguageIOTransport } from './transport';

// =============================================================================
// Types
// =============================================================================

export interface LanguageIOClientConfig {
  /** WebSocket URL for Sterling. Default: ws://localhost:8766 */
  url?: string;
  /** Whether the client is enabled. Default: true unless STERLING_ENABLED=false */
  enabled?: boolean;
  /** Timeout for reduce operations in ms. Default: 10000 */
  reduceTimeout?: number;
  /** Max retry attempts for transient failures. Default: 2 */
  maxRetries?: number;
  /** Optional transport (for dependency injection). If not provided, uses default. */
  transport?: LanguageIOTransport;
  /**
   * Fallback policy when Sterling is unavailable.
   * - 'permissive': Allow explicit goals without grounding (resilience mode)
   * - 'strict': Require Sterling to be available (certification mode)
   * - 'markers_only': Allow explicit markers but mark as ungrounded
   * Default: 'markers_only'
   */
  fallbackPolicy?: 'permissive' | 'strict' | 'markers_only';
}

export interface ReduceOptions {
  /** Model ID for provenance tracking */
  modelId?: string;
  /** Prompt digest for provenance tracking */
  promptDigest?: string;
  /** World snapshot reference for grounding */
  worldSnapshotRef?: WorldSnapshotRef;
}

export interface ReduceResult {
  /** The parsed reducer result (safe view) */
  result: ReducerResultView;
  /** The original envelope that was sent */
  envelope: LanguageIOEnvelopeV1;
  /** Whether the result can be converted to a task */
  canConvert: boolean;
  /** Human-readable reason if conversion is blocked */
  blockReason: string | null;
  /** Round-trip duration in ms */
  durationMs: number;
}

export interface ReduceError {
  /** Error code for programmatic handling */
  code:
    | 'STERLING_UNAVAILABLE'
    | 'STERLING_TIMEOUT'
    | 'SCHEMA_VERSION_MISMATCH'
    | 'INVALID_RESPONSE'
    | 'CONNECTION_FAILED'
    | 'UNKNOWN';
  /** Human-readable error message */
  message: string;
  /** The envelope that was attempted (for debugging) */
  envelope?: LanguageIOEnvelopeV1;
  /** Duration before failure in ms */
  durationMs: number;
}

// =============================================================================
// Fallback Mode Types
// =============================================================================

/**
 * Fallback result when Sterling is unavailable.
 *
 * In fallback mode, we can ONLY extract explicit [GOAL:] tags.
 * Natural language intent is NOT processed (fail-closed).
 *
 * SECURITY: Fallback execution is granted WITHOUT grounding validation.
 * Downstream code should gate world-affecting actions appropriately.
 */
export interface FallbackResult {
  /** Fallback mode indicator */
  mode: 'fallback';
  /** Whether an explicit goal tag was found */
  hasExplicitGoal: boolean;
  /** The envelope that was built (for later retry) */
  envelope: LanguageIOEnvelopeV1;
  /** Reason for fallback */
  fallbackReason: string;
  /** Whether grounding was performed (always false in fallback) */
  groundingPerformed: false;
  /** Fallback policy that was applied */
  fallbackPolicy: 'permissive' | 'strict' | 'markers_only';
}

// =============================================================================
// Client Implementation
// =============================================================================

/**
 * Sterling Language IO Client.
 *
 * This client is responsible for:
 * 1. Building language IO envelopes from raw LLM output
 * 2. Sending envelopes to Sterling for semantic reduction via transport
 * 3. Parsing and validating reducer results
 * 4. Enforcing the execution gate before task conversion
 *
 * Usage:
 * ```typescript
 * // With real Sterling transport (production)
 * const transport = new SterlingTransportAdapter(sterlingClient);
 * const client = new SterlingLanguageIOClient({ transport });
 * await client.connect();
 *
 * // With mock transport (testing)
 * const client = new SterlingLanguageIOClient({ enabled: true });
 * await client.connect();
 *
 * const result = await client.reduce(rawLLMOutput, { modelId: 'mlx-qwen-7b' });
 * if (result.canConvert) {
 *   // Safe to convert to task
 *   const task = convertToTask(result.result.committed_goal_prop_id);
 * }
 * ```
 */
export class SterlingLanguageIOClient extends EventEmitter {
  private config: Required<Omit<LanguageIOClientConfig, 'transport' | 'fallbackPolicy'>> & {
    fallbackPolicy: 'permissive' | 'strict' | 'markers_only';
  };
  private transport: LanguageIOTransport;
  private connected = false;

  constructor(config: LanguageIOClientConfig = {}) {
    super();
    this.config = {
      url: config.url || process.env.STERLING_WS_URL || 'ws://localhost:8766',
      enabled: config.enabled ?? process.env.STERLING_ENABLED !== 'false',
      fallbackPolicy: config.fallbackPolicy ?? 'markers_only',
      reduceTimeout: config.reduceTimeout ?? 10000,
      maxRetries: config.maxRetries ?? 2,
    };

    // Use provided transport or fall back to default
    this.transport = config.transport ?? getDefaultTransport();
  }

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  /**
   * Check if the client is enabled and available.
   */
  isAvailable(): boolean {
    return this.config.enabled && this.connected && this.transport.isAvailable();
  }

  /**
   * Connect to Sterling WebSocket server.
   *
   * When using a real transport (SterlingTransportAdapter), this ensures
   * the underlying SterlingClient is connected.
   */
  async connect(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    if (this.connected) {
      return;
    }

    // Mark as connected - the transport handles actual connection state
    this.connected = true;
    this.emit('connected');
  }

  /**
   * Disconnect from Sterling.
   */
  disconnect(): void {
    this.connected = false;
    this.emit('disconnected');
  }

  /**
   * Get the current transport (for testing/inspection).
   */
  getTransport(): LanguageIOTransport {
    return this.transport;
  }

  /**
   * Set a new transport (for testing).
   */
  setTransport(transport: LanguageIOTransport): void {
    this.transport = transport;
  }

  // ---------------------------------------------------------------------------
  // Core Reduce Operation
  // ---------------------------------------------------------------------------

  /**
   * Process raw LLM output through Sterling's language IO reducer.
   *
   * This is the CANONICAL entry point for language processing.
   * It builds an envelope, sends it to Sterling via transport, and parses the result.
   *
   * @param rawText - Raw LLM output text
   * @param options - Optional metadata for provenance tracking
   * @returns ReduceResult on success, ReduceError on failure
   */
  async reduce(
    rawText: string,
    options: ReduceOptions = {},
  ): Promise<ReduceResult | ReduceError> {
    const startTime = Date.now();

    // 1. Build envelope (always succeeds - this is local)
    const envelope = buildLanguageIOEnvelope(rawText, {
      modelId: options.modelId,
      promptDigest: options.promptDigest,
      worldSnapshotRef: options.worldSnapshotRef,
    });

    // 2. Check availability
    if (!this.isAvailable()) {
      return {
        code: 'STERLING_UNAVAILABLE',
        message: 'Sterling Language IO client is not available',
        envelope,
        durationMs: Date.now() - startTime,
      };
    }

    // 3. Send to Sterling via transport and await result
    try {
      const rawResponse = await this.transport.sendReduce(
        envelope as unknown as Record<string, unknown>,
        this.config.reduceTimeout,
      );
      const durationMs = Date.now() - startTime;

      // 4. Parse result (validates schema version)
      const result = parseReducerResult(rawResponse);

      // 5. Check execution gate
      const canConvert = canConvertToTask(result);
      const blockReason = getExecutionBlockReason(result);

      return {
        result,
        envelope,
        canConvert,
        blockReason,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      if (error instanceof SchemaVersionError) {
        return {
          code: 'SCHEMA_VERSION_MISMATCH',
          message: error.message,
          envelope,
          durationMs,
        };
      }

      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          code: 'STERLING_TIMEOUT',
          message: `Reduce operation timed out after ${this.config.reduceTimeout}ms`,
          envelope,
          durationMs,
        };
      }

      if (error instanceof Error && error.message.includes('unavailable')) {
        return {
          code: 'STERLING_UNAVAILABLE',
          message: error.message,
          envelope,
          durationMs,
        };
      }

      return {
        code: 'UNKNOWN',
        message: error instanceof Error ? error.message : String(error),
        envelope,
        durationMs,
      };
    }
  }

  /**
   * Process LLM output with required executability.
   *
   * This is a convenience method that throws ExecutionGateError if the
   * result is not executable. Use this when you MUST have an executable
   * result or want to fail loudly.
   *
   * @param rawText - Raw LLM output text
   * @param options - Optional metadata
   * @returns ReduceResult (guaranteed canConvert=true)
   * @throws ExecutionGateError if not executable
   * @throws Error for other failures
   */
  async reduceAndRequireExecutable(
    rawText: string,
    options: ReduceOptions = {},
  ): Promise<ReduceResult> {
    const outcome = await this.reduce(rawText, options);

    // Check for errors
    if ('code' in outcome) {
      throw new Error(`Reduce failed: [${outcome.code}] ${outcome.message}`);
    }

    // Enforce execution gate
    requireExecutable(outcome.result);

    return outcome;
  }

  /**
   * Process LLM output with fallback when Sterling is unavailable.
   *
   * In fallback mode:
   * - Explicit [GOAL:] tags are extracted (verbatim, no interpretation)
   * - Natural language intent is NOT processed (fail-closed)
   * - The result is marked as fallback mode
   *
   * Use this when you need best-effort processing but can tolerate
   * degraded functionality when Sterling is down.
   */
  async reduceWithFallback(
    rawText: string,
    options: ReduceOptions = {},
  ): Promise<ReduceResult | FallbackResult> {
    const outcome = await this.reduce(rawText, options);

    // If reduce succeeded, return it
    if (!('code' in outcome)) {
      return outcome;
    }

    // Sterling unavailable - check fallback policy
    if (outcome.code === 'STERLING_UNAVAILABLE' || outcome.code === 'STERLING_TIMEOUT') {
      // Strict mode: fail closed, no fallback allowed
      if (this.config.fallbackPolicy === 'strict') {
        throw new Error(`Sterling unavailable and fallbackPolicy=strict: ${outcome.message}`);
      }

      const envelope = outcome.envelope!;
      const hasExplicitGoal = envelope.declared_markers.length > 0;

      return {
        mode: 'fallback',
        hasExplicitGoal,
        envelope,
        fallbackReason: outcome.message,
        groundingPerformed: false,
        fallbackPolicy: this.config.fallbackPolicy,
      };
    }

    // For other errors, don't fallback - fail loudly
    throw new Error(`Reduce failed: [${outcome.code}] ${outcome.message}`);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let defaultClient: SterlingLanguageIOClient | null = null;

/**
 * Get the default Sterling Language IO client instance.
 *
 * This singleton is used by the reasoning surface and other modules
 * that need language IO processing.
 */
export function getDefaultLanguageIOClient(): SterlingLanguageIOClient {
  if (!defaultClient) {
    defaultClient = new SterlingLanguageIOClient();
  }
  return defaultClient;
}

/**
 * Set a custom client as the default (useful for testing).
 */
export function setDefaultLanguageIOClient(client: SterlingLanguageIOClient | null): void {
  defaultClient = client;
}

// =============================================================================
// Re-exports for Convenience
// =============================================================================

export { ExecutionGateError, SchemaVersionError };
export type { ReducerResultView, AdvisoryView, GroundingView } from './reducer-result-types';
export { canConvertToTask, requireExecutable, getExecutionBlockReason } from './execution-gate';

// Transport exports for production wiring
export {
  type LanguageIOTransport,
  SterlingTransportAdapter,
  MockLanguageIOTransport,
  getDefaultTransport,
  setDefaultTransport,
} from './transport';

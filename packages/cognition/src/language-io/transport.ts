/**
 * Language IO Transport Layer
 *
 * Provides an abstraction over the WebSocket communication with Sterling.
 * This allows the SterlingLanguageIOClient to be tested with mock transports
 * while using real WebSocket communication in production.
 *
 * Key principle: The transport is a thin adapter, not a semantic authority.
 * All semantic interpretation happens in Sterling; this just moves bytes.
 *
 * @author @darianrosebrook
 */

import type { LanguageIOEnvelopeV1 } from './envelope-types';

// =============================================================================
// Transport Interface
// =============================================================================

/**
 * Result from Sterling's language_io.reduce command.
 *
 * This is a direct projection of Sterling's response schema.
 * TypeScript must NOT interpret these fields semantically.
 */
export interface LanguageIOReduceResponse {
  schema_id: string;
  schema_version: string;
  source_envelope_id: string;
  committed_ir_digest: string;
  committed_goal_prop_id: string | null;
  has_committed_propositions: boolean;
  advisory: {
    intent_family: string;
    intent_type: string;
    confidence: number;
    suggested_domain: string;
  } | null;
  grounding: {
    passed: boolean;
    reason: string;
    world_snapshot_digest: string | null;
  } | null;
  reducer_version: string;
}

/**
 * Transport interface for language IO operations.
 *
 * Implementations:
 * - SterlingTransportAdapter: Uses real SterlingClient WebSocket
 * - MockTransport: For unit testing
 */
export interface LanguageIOTransport {
  /**
   * Send a language IO reduce request to Sterling.
   *
   * @param envelope - The envelope to send (as plain object for serialization)
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns The reducer result or throws an error
   */
  sendReduce(
    envelope: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<LanguageIOReduceResponse>;

  /**
   * Check if the transport is available.
   */
  isAvailable(): boolean;
}

// =============================================================================
// Sterling Transport Adapter
// =============================================================================

/**
 * Interface for the SterlingClient methods we need.
 * This avoids a direct dependency on packages/core.
 */
export interface SterlingClientLike {
  sendLanguageIOReduce(
    envelope: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<{ success: true; result: LanguageIOReduceResponse } | { success: false; error: string }>;
  isAvailable(): boolean;
  connect(): Promise<void>;
}

/**
 * Transport adapter that wraps a real SterlingClient.
 *
 * This is the production transport that sends envelopes over WebSocket
 * to the Sterling server.
 */
export class SterlingTransportAdapter implements LanguageIOTransport {
  constructor(private client: SterlingClientLike) {}

  async sendReduce(
    envelope: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<LanguageIOReduceResponse> {
    const result = await this.client.sendLanguageIOReduce(envelope, timeoutMs);

    if (!result.success) {
      throw new Error(`Sterling reduce failed: ${result.error}`);
    }

    return result.result;
  }

  isAvailable(): boolean {
    return this.client.isAvailable();
  }
}

// =============================================================================
// Mock Transport (for testing)
// =============================================================================

/**
 * Mock transport that simulates Sterling behavior.
 *
 * This is used for:
 * - Unit testing without a real Sterling server
 * - Development when Sterling is unavailable
 * - Deterministic test fixtures
 *
 * The mock implements the SAME semantic logic that Sterling would,
 * allowing tests to verify the TypeScript boundary behavior.
 */
export class MockLanguageIOTransport implements LanguageIOTransport {
  private _isAvailable = true;
  private _mockResponses: Map<string, LanguageIOReduceResponse> = new Map();

  /**
   * Configure availability (for testing unavailable scenarios).
   */
  setAvailable(available: boolean): void {
    this._isAvailable = available;
  }

  /**
   * Register a mock response for a specific envelope ID.
   */
  registerMockResponse(envelopeId: string, response: LanguageIOReduceResponse): void {
    this._mockResponses.set(envelopeId, response);
  }

  /**
   * Clear all registered mock responses.
   */
  clearMockResponses(): void {
    this._mockResponses.clear();
  }

  async sendReduce(
    envelope: Record<string, unknown>,
    _timeoutMs?: number,
  ): Promise<LanguageIOReduceResponse> {
    if (!this._isAvailable) {
      throw new Error('Mock transport unavailable');
    }

    const envelopeId = envelope.envelope_id as string;

    // Check for registered mock response
    const mockResponse = this._mockResponses.get(envelopeId);
    if (mockResponse) {
      return mockResponse;
    }

    // Default behavior: simulate Sterling's semantic logic
    return this.buildDefaultResponse(envelope);
  }

  isAvailable(): boolean {
    return this._isAvailable;
  }

  /**
   * Build a default mock response based on envelope content.
   *
   * This simulates Sterling's behavior:
   * - Explicit [GOAL:] tags → committed goal, is_executable=true
   * - Natural language intent → advisory only, is_executable=false
   * - No intent → semantically empty
   */
  private buildDefaultResponse(envelope: Record<string, unknown>): LanguageIOReduceResponse {
    const declaredMarkers = envelope.declared_markers as Array<{
      marker_type: string;
      verbatim_text: string;
    }> || [];

    const hasExplicitGoal = declaredMarkers.some(m => m.marker_type === 'GOAL_TAG');
    const rawText = envelope.raw_text_verbatim as string || '';

    // Check for natural language intent patterns
    const hasIntentPattern =
      /\b(i intend to|i want to|i will|i should|let me|i'm going to|i need to|i plan to)\b/i.test(rawText);

    const envelopeId = envelope.envelope_id as string || 'unknown';

    if (hasExplicitGoal) {
      // Explicit goal → committed, executable
      return {
        schema_id: 'sterling.language_reducer_result.v1',
        schema_version: '1.1.0',
        source_envelope_id: envelopeId,
        committed_ir_digest: `ling_ir:mock_${envelopeId}`,
        committed_goal_prop_id: `prop_${envelopeId.slice(0, 8)}`,
        has_committed_propositions: true,
        advisory: {
          intent_family: 'PLAN',
          intent_type: 'TASK_DECOMPOSE',
          confidence: 1.0,
          suggested_domain: 'planning',
        },
        grounding: {
          passed: true,
          reason: 'Mock grounding passed (explicit goal)',
          world_snapshot_digest: null,
        },
        reducer_version: 'mock_reducer/v1.0.0',
      };
    }

    if (hasIntentPattern) {
      // Natural language intent → advisory only, NOT executable
      return {
        schema_id: 'sterling.language_reducer_result.v1',
        schema_version: '1.1.0',
        source_envelope_id: envelopeId,
        committed_ir_digest: `ling_ir:mock_${envelopeId}`,
        committed_goal_prop_id: null, // NO committed goal
        has_committed_propositions: false,
        advisory: {
          intent_family: 'PLAN',
          intent_type: 'NAVIGATE',
          confidence: 0.7,
          suggested_domain: 'planning',
        },
        grounding: null,
        reducer_version: 'mock_reducer/v1.0.0',
      };
    }

    // No goal, no intent → semantically empty
    return {
      schema_id: 'sterling.language_reducer_result.v1',
      schema_version: '1.1.0',
      source_envelope_id: envelopeId,
      committed_ir_digest: `ling_ir:mock_${envelopeId}`,
      committed_goal_prop_id: null,
      has_committed_propositions: false,
      advisory: null,
      grounding: null,
      reducer_version: 'mock_reducer/v1.0.0',
    };
  }
}

// =============================================================================
// Default Transport Instance
// =============================================================================

let defaultTransport: LanguageIOTransport | null = null;

/**
 * Get the default language IO transport.
 *
 * If not set, returns a MockLanguageIOTransport for development.
 * In production, call setDefaultTransport() with a SterlingTransportAdapter.
 */
export function getDefaultTransport(): LanguageIOTransport {
  if (!defaultTransport) {
    // Default to mock for development/testing
    defaultTransport = new MockLanguageIOTransport();
  }
  return defaultTransport;
}

/**
 * Set the default transport (call with SterlingTransportAdapter in production).
 */
export function setDefaultTransport(transport: LanguageIOTransport | null): void {
  defaultTransport = transport;
}

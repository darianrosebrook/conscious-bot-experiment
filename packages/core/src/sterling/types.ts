/**
 * Sterling WebSocket Protocol Type Definitions
 *
 * Pure TypeScript types for communication with Sterling's unified WS server.
 * No runtime dependencies.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Configuration
// ============================================================================

export interface SterlingClientConfig {
  /** WebSocket server URL. Default: ws://localhost:8766 */
  url?: string;
  /** Whether the client is enabled. Default: true */
  enabled?: boolean;
  /** Timeout for solve operations in ms. Default: 60000 */
  solveTimeout?: number;
  /** Connection timeout in ms. Default: 5000 */
  connectTimeout?: number;
  /** Ping interval in ms. Default: 30000 */
  pingInterval?: number;
  /** Number of consecutive failures before circuit breaker opens. Default: 5 */
  circuitBreakerThreshold?: number;
  /** Time in ms before circuit breaker auto-resets. Default: 30000 */
  circuitBreakerTimeout?: number;
  /** Max reconnection attempts. Default: 5 */
  maxReconnectAttempts?: number;
  /** Base delay for reconnection backoff in ms. Default: 1000 */
  reconnectBaseDelay?: number;
}

// ============================================================================
// Domains & Requests
// ============================================================================

/** Known Sterling solver domains */
export type SterlingDomain =
  | 'escape'
  | 'wikipedia'
  | 'wordnet'
  | 'cube'
  | 'minecraft'
  | 'building'
  | string;

/** Client-to-server command */
export interface SterlingRequest {
  command:
    | 'solve'
    | 'ping'
    | 'get_status'
    | 'get_metrics'
    | 'reset'
    | 'switch_domain'
    | 'update_config'
    | 'register_domain_declaration_v1'
    | 'get_domain_declaration_v1'
    | 'language_io.reduce'
    | 'expand_by_digest_v1'
    | 'resolve_intent_steps'
    | 'server_info_v1';
  domain?: SterlingDomain;
  [key: string]: unknown;
}

// ============================================================================
// Language IO Types (for language_io.reduce command)
// ============================================================================

/** Response from language_io.reduce command */
export interface SterlingLanguageIOResultMessage {
  type: 'language_io.result';
  requestId: string;
  result: SterlingLanguageReducerResult;
}

/** Sterling's language reducer result (matches Python schema) */
export interface SterlingLanguageReducerResult {
  schema_id: string;
  schema_version: string;
  source_envelope_id: string;
  committed_ir_digest: string;
  committed_goal_prop_id: string | null;
  has_committed_propositions: boolean;
  advisory: SterlingAdvisory | null;
  grounding: SterlingGrounding | null;
  reducer_version: string;
}

/** Advisory from Sterling (routing hints, NOT authority) */
export interface SterlingAdvisory {
  intent_family: string;
  intent_type: string;
  confidence: number;
  suggested_domain: string;
}

/** Grounding result from Sterling */
export interface SterlingGrounding {
  passed: boolean;
  reason: string;
  world_snapshot_digest: string | null;
}

// ============================================================================
// Server Messages (discriminated union on `type`)
// ============================================================================

export interface SterlingDiscoverMessage {
  type: 'discover';
  u: string;
  title?: string;
  g: number;
  h: number;
  distance: number;
  isStart?: boolean;
  isSolution?: boolean;
  edgeScore?: number;
  edgeUsage?: number;
  edgeNovelty?: number;
}

export interface SterlingDequeueMessage {
  type: 'dequeue';
  u: string;
}

export interface SterlingSearchEdgeMessage {
  type: 'search_edge';
  source: string;
  target: string;
  /** Action label — may be a string (Python emits rule.action directly) or structured object */
  label: string | Record<string, unknown>;
}

export interface SterlingSearchStartMessage {
  type: 'search_start';
  u: string;
}

export interface SterlingSolutionMessage {
  type: 'solution';
  u: string;
}

export interface SterlingSolutionPathMessage {
  type: 'solution_path';
  source: string;
  target: string;
  /** Action label — may be a string (Python emits rule.action directly) or structured object */
  label?: string | Record<string, unknown>;
}

export interface SterlingCompleteMessage {
  type: 'complete';
  domain?: SterlingDomain;
  metrics?: Record<string, unknown>;
  leaderboard?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface SterlingErrorMessage {
  type: 'error';
  message: string;
  /** Error code for structured error handling (e.g. 'unknown_domain') */
  code?: string;
  /** Domain that triggered the error, if applicable */
  domain?: string;
  /** Echo of the client-sent requestId for response correlation (declaration commands only). */
  requestId?: string;
}

export interface SterlingPongMessage {
  type: 'pong';
}

export interface SterlingStatusMessage {
  type: 'status';
  data: Record<string, unknown>;
}

export interface SterlingMetricsMessage {
  type: 'metrics';
  domain?: SterlingDomain;
  data: Record<string, unknown>;
  leaderboard?: Record<string, unknown>;
}

export interface SterlingResetCompleteMessage {
  type: 'reset_complete';
  domain?: SterlingDomain;
  message: string;
  leaderboard_reset?: boolean;
}

export interface SterlingDomainSwitchedMessage {
  type: 'domain_switched';
  domain: SterlingDomain;
  status: Record<string, unknown>;
}

export interface SterlingInitializationResultMessage {
  type: 'initialization_result';
  domain: SterlingDomain;
  success: boolean;
  message: string;
}

export interface SterlingDeclarationRegisteredMessage {
  type: 'declaration_registered';
  digest: string;
  solverId: string;
  /** Echo of the client-sent requestId for response correlation. */
  requestId?: string;
}

export interface SterlingDeclarationRetrievedMessage {
  type: 'declaration_retrieved';
  digest: string;
  declaration: Record<string, unknown>;
  /** Echo of the client-sent requestId for response correlation. */
  requestId?: string;
}

export interface SterlingDeclarationNotFoundMessage {
  type: 'declaration_not_found';
  digest: string;
  /** Echo of the client-sent requestId for response correlation. */
  requestId?: string;
}

// ---------------------------------------------------------------------------
// Digest Expansion (materialize-only)
// ---------------------------------------------------------------------------

export interface SterlingExpandByDigestStep {
  id?: string;
  order?: number;
  leaf: string;
  args: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export type SterlingExpandByDigestStatus = 'ok' | 'blocked' | 'error';

export interface SterlingExpandByDigestResultMessage {
  type: 'expand_by_digest.result';
  request_id: string;
  status: SterlingExpandByDigestStatus;
  blocked_reason?: string;
  error?: string;
  plan_bundle_digest?: string;
  steps?: SterlingExpandByDigestStep[];
  schema_version?: string;
  retry_after_ms?: number;
}

/**
 * Per-intent replacement entry from resolve_intent_steps.
 * Each entry maps one intent step (by index) to its resolved executable
 * steps or an unresolved reason. This enables deterministic splicing on
 * the TS side without positional guessing.
 */
export interface SterlingIntentReplacement {
  intent_step_index: number;
  resolved: boolean;
  /** Present when resolved === true: the executable steps that replace this intent step. */
  steps?: SterlingExpandByDigestStep[];
  /** Present when resolved === false: why resolution failed. */
  unresolved_reason?: string;
}

export type SterlingResolveIntentStepsStatus = 'ok' | 'blocked' | 'error';

/** Response from resolve_intent_steps command. */
export interface SterlingResolveIntentStepsResultMessage {
  type: 'resolve_intent_steps.result';
  request_id: string;
  status: SterlingResolveIntentStepsStatus;
  replacements?: SterlingIntentReplacement[];
  plan_bundle_digest?: string;
  schema_version?: string;
  blocked_reason?: string;
  error?: string;
  /** @deprecated Legacy shape — present on pre-v0.2.0 servers that return flat steps instead of replacements. */
  steps?: SterlingExpandByDigestStep[];
  /** @deprecated Legacy shape — present on pre-v0.2.0 servers. */
  unresolved_steps?: Array<{ leaf: string; reason: string }>;
}

/** Response from server_info_v1 command (evidence-grade server identity). */
export interface SterlingServerInfoResultMessage {
  type: 'server_info.result';
  request_id?: string;
  status: 'ok';
  banner_line: string;
}

/** Discriminated union of all server-to-client message types */
export type SterlingMessage =
  | SterlingDiscoverMessage
  | SterlingDequeueMessage
  | SterlingSearchEdgeMessage
  | SterlingSearchStartMessage
  | SterlingSolutionMessage
  | SterlingSolutionPathMessage
  | SterlingCompleteMessage
  | SterlingErrorMessage
  | SterlingPongMessage
  | SterlingStatusMessage
  | SterlingMetricsMessage
  | SterlingResetCompleteMessage
  | SterlingDomainSwitchedMessage
  | SterlingInitializationResultMessage
  | SterlingDeclarationRegisteredMessage
  | SterlingDeclarationRetrievedMessage
  | SterlingDeclarationNotFoundMessage
  | SterlingExpandByDigestResultMessage
  | SterlingResolveIntentStepsResultMessage
  | SterlingServerInfoResultMessage
  | SterlingLanguageIOResultMessage;

// ============================================================================
// Aggregated Results
// ============================================================================

/** A single edge in the solution path */
export interface SterlingSolutionEdge {
  source: string;
  target: string;
  /** Action label — may be a string (e.g. "craft:oak_planks") or structured object */
  label?: string | Record<string, unknown>;
}

/** A discovered node during search */
export interface SterlingDiscoveredNode {
  id: string;
  title?: string;
  g: number;
  h: number;
  distance: number;
  isStart?: boolean;
  isSolution?: boolean;
}

/** A search edge encountered during exploration */
export interface SterlingSearchEdge {
  source: string;
  target: string;
  /** Action label — may be a string (Python emits rule.action directly) or structured object */
  label: string | Record<string, unknown>;
}

/** Aggregated result collected from streamed solve messages */
export interface SterlingSolveResult {
  /** Whether a solution was found */
  solutionFound: boolean;
  /** Ordered path from start to goal */
  solutionPath: SterlingSolutionEdge[];
  /** Nodes discovered during search */
  discoveredNodes: SterlingDiscoveredNode[];
  /** Edges explored during search */
  searchEdges: SterlingSearchEdge[];
  /** Metrics from the complete message */
  metrics: Record<string, unknown>;
  /** Error message if solve failed */
  error?: string;
  /** Wall-clock duration in ms */
  durationMs: number;
}

// ============================================================================
// Health Status
// ============================================================================

export type SterlingConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface SterlingHealthStatus {
  /** Whether the client is connected and usable */
  connected: boolean;
  /** Current connection state */
  connectionState: SterlingConnectionState;
  /** Last ping round-trip time in ms, or null if never pinged */
  lastPingMs: number | null;
  /** Whether the circuit breaker is currently open */
  circuitBreakerOpen: boolean;
}

// ============================================================================
// Callback types
// ============================================================================

/** Callback for streaming solve progress */
export type SterlingSolveStepCallback = (message: SterlingMessage) => void;

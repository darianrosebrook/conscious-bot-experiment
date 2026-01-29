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
  | string;

/** Client-to-server command */
export interface SterlingRequest {
  command: 'solve' | 'ping' | 'get_status' | 'get_metrics' | 'reset' | 'switch_domain' | 'update_config';
  domain?: SterlingDomain;
  [key: string]: unknown;
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
  label: Record<string, unknown>;
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
  | SterlingInitializationResultMessage;

// ============================================================================
// Aggregated Results
// ============================================================================

/** A single edge in the solution path */
export interface SterlingSolutionEdge {
  source: string;
  target: string;
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
  label: Record<string, unknown>;
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

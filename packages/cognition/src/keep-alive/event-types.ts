/**
 * Keep-Alive Event Types
 *
 * Structured event types for keep-alive system observability.
 * All events follow a consistent format for JSONL logging.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Base Event Types
// ============================================================================

/**
 * Base event structure for all keep-alive events.
 */
export interface KeepAliveEvent {
  type: KeepAliveEventType;
  timestamp_ms: number;
  payload: Record<string, unknown>;
}

/**
 * All keep-alive event types.
 */
export type KeepAliveEventType =
  | 'keepalive_tick'
  | 'keepalive_thought'
  | 'keepalive_steady_state'
  | 'keepalive_skip_cooldown'
  | 'keepalive_skip_not_idle'
  | 'keepalive_bypass'
  | 'keepalive_perception_refresh'
  | 'keepalive_circuit_open'
  | 'keepalive_violation';

// ============================================================================
// Specific Event Payloads
// ============================================================================

/**
 * Payload for keepalive_tick event.
 * Emitted on each successful keep-alive tick.
 */
export interface KeepAliveTickPayload {
  /** Kind of frame rendered */
  frame_kind: 'factual_only';
  /** Whether no goals were suggested (should always be true) */
  no_suggested_goals: boolean;
  /** Number of facts in the frame */
  fact_count: number;
  /** Current stimulus acceleration factor */
  acceleration_factor: number;
  /** Effective interval after acceleration */
  effective_interval_ms: number;
}

/**
 * Payload for keepalive_thought event.
 * Emitted when a thought is generated from keep-alive.
 */
export interface KeepAliveThoughtPayload {
  /** Thought ID */
  thought_id: string;
  /** Whether the thought is convert-eligible */
  convert_eligible: boolean;
  /** Whether eligibility was derived (should always be true) */
  derived: boolean;
  /** Eligibility reasoning */
  reasoning: string;
  /** Whether a goal tag was extracted */
  goal_present: boolean;
  /** Whether grounding passed (null if no goal) */
  grounding_pass: boolean | null;
  /** Source of the thought */
  source: 'keepalive';
}

/**
 * Payload for keepalive_steady_state event.
 * Emitted periodically to indicate prolonged observation state.
 */
export interface KeepAliveSteadyStatePayload {
  /** Number of consecutive ticks without convert-eligible thoughts */
  convert_eligible_count: number;
  /** Duration in this steady state */
  duration_ms: number;
  /** Note that this is expected behavior */
  note: 'autonomy_optional';
}

/**
 * Payload for keepalive_skip_cooldown event.
 * Emitted when a tick is skipped due to cooldown.
 */
export interface KeepAliveSkipCooldownPayload {
  /** Time remaining before next allowed tick */
  remaining_ms: number;
  /** Reason for cooldown */
  reason: 'min_interval' | 'rate_limit';
}

/**
 * Payload for keepalive_skip_not_idle event.
 * Emitted when a tick is skipped because idle conditions aren't met (LF-9).
 */
export interface KeepAliveSkipNotIdlePayload {
  /** Why the bot isn't considered idle */
  reason: 'active_plan_steps' | 'recent_task_conversion' | 'critical_threat' | 'recent_user_command';
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Payload for keepalive_bypass event.
 * Emitted when a tick is accelerated due to stimulus.
 */
export interface KeepAliveBypassPayload {
  /** Stimulus that triggered acceleration */
  reason: string;
  /** Effective interval after acceleration */
  effective_interval_ms: number;
  /** Acceleration factor applied */
  acceleration_factor: number;
}

/**
 * Payload for keepalive_perception_refresh event.
 * Emitted when perception is refreshed.
 */
export interface KeepAlivePerceptionRefreshPayload {
  /** Number of refreshes in the last minute */
  refresh_count_last_minute: number;
  /** Maximum allowed per minute */
  max_per_minute: number;
}

/**
 * Payload for keepalive_circuit_open event.
 * Emitted when the perception refresh circuit breaker opens.
 */
export interface KeepAliveCircuitOpenPayload {
  /** Number of refreshes that triggered the breaker */
  refresh_count_last_minute: number;
  /** Maximum allowed before breaker opens */
  max_per_minute: number;
  /** When the breaker will close */
  reopen_at_ms: number;
}

/**
 * Payload for keepalive_violation event.
 * Emitted if an invariant is violated (should never happen).
 */
export interface KeepAliveViolationPayload {
  /** Invariant that was violated */
  invariant: string;
  /** Description of the violation */
  description: string;
  /** Related data */
  data?: Record<string, unknown>;
}

// ============================================================================
// Event Builder Functions
// ============================================================================

/**
 * Create a keep-alive event with timestamp.
 */
export function createKeepAliveEvent<T extends Record<string, unknown>>(
  type: KeepAliveEventType,
  payload: T
): KeepAliveEvent {
  return {
    type,
    timestamp_ms: Date.now(),
    payload,
  };
}

/**
 * Create a keepalive_tick event.
 */
export function createTickEvent(payload: KeepAliveTickPayload): KeepAliveEvent {
  return createKeepAliveEvent('keepalive_tick', payload as unknown as Record<string, unknown>);
}

/**
 * Create a keepalive_thought event.
 */
export function createThoughtEvent(payload: KeepAliveThoughtPayload): KeepAliveEvent {
  return createKeepAliveEvent('keepalive_thought', payload as unknown as Record<string, unknown>);
}

/**
 * Create a keepalive_skip_not_idle event.
 */
export function createSkipNotIdleEvent(payload: KeepAliveSkipNotIdlePayload): KeepAliveEvent {
  return createKeepAliveEvent('keepalive_skip_not_idle', payload as unknown as Record<string, unknown>);
}

/**
 * Create a keepalive_violation event.
 */
export function createViolationEvent(payload: KeepAliveViolationPayload): KeepAliveEvent {
  return createKeepAliveEvent('keepalive_violation', payload as unknown as Record<string, unknown>);
}

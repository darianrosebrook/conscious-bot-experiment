/**
 * Keep-Alive Module — Main Entry Point
 *
 * Provides the keep-alive intention check loop for allowing
 * (but not compelling) goal emission during idle periods.
 *
 * @author @darianrosebrook
 */

// Controller
export {
  KeepAliveController,
  DEFAULT_KEEPALIVE_CONFIG,
} from './keep-alive-controller';

export type {
  KeepAliveConfig,
  KeepAliveTickResult,
  KeepAliveThought,
  KeepAliveContext,
  LLMGenerator,
} from './keep-alive-controller';

// Idle Detection
export {
  detectIdle,
  buildIdleContext,
  estimateThreatLevel,
  DEFAULT_IDLE_CONFIG,
} from './idle-detector';

export type {
  IdleContext,
  IdleDecision,
  IdleReason,
  IdleDetectorConfig,
} from './idle-detector';

// Intention Check Prompt
export {
  renderIntentionCheckPrompt,
  getIntentionCheckVariants,
  validateNonInjectivePrompt,
  INTENTION_CHECK_TEMPLATE,
  INTENTION_CHECK_MINIMAL,
  INTENTION_CHECK_REFLECTIVE,
  INTENTION_CHECK_VARIANTS,
} from './intention-check-prompt';

export type { IntentionCheckVariant } from './intention-check-prompt';

// Event Types
export {
  createKeepAliveEvent,
  createTickEvent,
  createThoughtEvent,
  createSkipNotIdleEvent,
  createViolationEvent,
} from './event-types';

export type {
  KeepAliveEvent,
  KeepAliveEventType,
  KeepAliveTickPayload,
  KeepAliveThoughtPayload,
  KeepAliveSteadyStatePayload,
  KeepAliveSkipCooldownPayload,
  KeepAliveSkipNotIdlePayload,
  KeepAliveBypassPayload,
  KeepAlivePerceptionRefreshPayload,
  KeepAliveCircuitOpenPayload,
  KeepAliveViolationPayload,
} from './event-types';

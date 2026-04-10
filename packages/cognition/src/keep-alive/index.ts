/**
 * Keep-Alive Module — Main Entry Point
 *
 * Provides the keep-alive intention check loop for allowing
 * (but not compelling) goal emission during idle periods.
 *
 * @author @darianrosebrook
 *
 * ============================================================================
 * QUARANTINE: keep-alive-rename  →  see ./QUARANTINE.md
 * ============================================================================
 *
 * THIS MODULE IS MISNAMED. It is a bot idle-episode GOAL EMISSION loop that
 * calls the LLM to decide whether to generate an autonomous goal during idle
 * time. It is NOT an HTTP/SSE/server-hot keepalive in any sense of the word.
 *
 * The name collision with those other "keepalive" meanings is the root cause
 * of at least one prior LLM-agent confabulation. This module is scheduled
 * for rename/scrub review.
 *
 * Before modifying anything in this directory, read `./QUARANTINE.md` — it
 * documents what the module actually does, what it is NOT, the naming
 * history, the current gating lever (`STERLING_IDLE_EPISODES_ENABLED`),
 * and the candidate scrub plans.
 *
 * Grep for `QUARANTINE: keep-alive-rename` from the repo root to find every
 * file currently marked for this review.
 * ============================================================================
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

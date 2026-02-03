/**
 * Idle Detector — Keep-Alive Gate (LF-9)
 *
 * Determines when keep-alive is allowed to run.
 *
 * Keep-alive is ONLY allowed when ALL of these conditions are true:
 * 1. No active plan steps (bot is not executing a plan)
 * 2. No recent task conversions (in last 30 seconds)
 * 3. No critical threat (high/critical threat level)
 * 4. No recent user command (in last 10 seconds)
 *
 * This prevents keep-alive from:
 * - Interfering with active plan execution
 * - Generating redundant goals right after task conversion
 * - Distracting from critical safety situations
 * - Overriding user intent
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Context needed for idle detection.
 */
export interface IdleContext {
  /** Number of active plan steps currently executing */
  activePlanSteps: number;
  /** Number of task conversions in the recent window */
  recentTaskConversions: number;
  /** Current threat level assessment */
  threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  /** Timestamp of last user command (0 if none) */
  lastUserCommand: number;
  /** Timestamp of last keep-alive tick (0 if none) */
  lastKeepAliveTick: number;
}

/**
 * Result of idle detection.
 */
export interface IdleDecision {
  /** Whether the bot is considered idle */
  isIdle: boolean;
  /** Reason for the decision */
  reason: IdleReason;
  /** Suggested delay before next check (ms) */
  nextCheckMs: number;
}

/**
 * Reasons why the bot may not be idle.
 */
export type IdleReason =
  | 'all_conditions_met'       // Bot is idle, all checks passed
  | 'active_plan_steps'        // Bot is executing a plan
  | 'recent_task_conversion'   // Recent thought was converted to task
  | 'critical_threat'          // High/critical threat requires attention
  | 'recent_user_command';     // User recently issued a command

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for idle detection.
 */
export interface IdleDetectorConfig {
  /** Time window for "recent" task conversions (ms) */
  recentTaskConversionWindowMs: number;
  /** Time window for "recent" user command (ms) */
  recentUserCommandWindowMs: number;
}

/**
 * Default configuration.
 */
export const DEFAULT_IDLE_CONFIG: IdleDetectorConfig = {
  recentTaskConversionWindowMs: 30_000,  // 30 seconds
  recentUserCommandWindowMs: 10_000,      // 10 seconds
};

// ============================================================================
// Idle Detection Function
// ============================================================================

/**
 * Detect whether the bot is idle and keep-alive can run.
 *
 * Keep-alive is ONLY allowed to run when these conditions are ALL true:
 * 1. No active plan steps (bot is not executing a plan)
 * 2. No recent task conversions (in last 30 seconds)
 * 3. No critical threat (high/critical threat level)
 * 4. No recent user command (in last 10 seconds)
 *
 * @param context - Current bot context
 * @param config - Idle detection configuration
 * @returns Idle decision with reason and suggested next check time
 */
export function detectIdle(
  context: IdleContext,
  config: IdleDetectorConfig = DEFAULT_IDLE_CONFIG
): IdleDecision {
  const now = Date.now();

  // Check 1: No active plan steps
  if (context.activePlanSteps > 0) {
    return {
      isIdle: false,
      reason: 'active_plan_steps',
      nextCheckMs: 5_000, // Check again in 5 seconds
    };
  }

  // Check 2: No recent task conversions
  if (context.recentTaskConversions > 0) {
    return {
      isIdle: false,
      reason: 'recent_task_conversion',
      nextCheckMs: 10_000, // Check again in 10 seconds
    };
  }

  // Check 3: No critical threat
  if (context.threatLevel === 'high' || context.threatLevel === 'critical') {
    return {
      isIdle: false,
      reason: 'critical_threat',
      nextCheckMs: 1_000, // Check frequently during threats
    };
  }

  // Check 4: No recent user command
  const timeSinceUserCommand = now - context.lastUserCommand;
  if (timeSinceUserCommand < config.recentUserCommandWindowMs) {
    const remaining = config.recentUserCommandWindowMs - timeSinceUserCommand;
    return {
      isIdle: false,
      reason: 'recent_user_command',
      nextCheckMs: remaining + 1_000, // Check after window expires + buffer
    };
  }

  // All conditions met — bot is idle
  return {
    isIdle: true,
    reason: 'all_conditions_met',
    nextCheckMs: 0, // No delay needed, can tick immediately
  };
}

// ============================================================================
// Context Builder Helpers
// ============================================================================

/**
 * Build an idle context from various sources.
 * This is a convenience function for assembling context from different parts of the system.
 */
export function buildIdleContext(params: {
  activePlanSteps: number;
  recentTaskConversions: number;
  threatLevel: IdleContext['threatLevel'];
  lastUserCommand: number;
  lastKeepAliveTick: number;
}): IdleContext {
  return {
    activePlanSteps: params.activePlanSteps,
    recentTaskConversions: params.recentTaskConversions,
    threatLevel: params.threatLevel,
    lastUserCommand: params.lastUserCommand,
    lastKeepAliveTick: params.lastKeepAliveTick,
  };
}

/**
 * Estimate threat level from hostile count.
 */
export function estimateThreatLevel(hostileCount: number): IdleContext['threatLevel'] {
  if (hostileCount === 0) return 'none';
  if (hostileCount <= 2) return 'low';
  if (hostileCount <= 5) return 'medium';
  if (hostileCount <= 10) return 'high';
  return 'critical';
}

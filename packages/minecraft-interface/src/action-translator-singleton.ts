/**
 * action-translator-singleton.ts
 *
 * Ensures exactly one ActionTranslator instance exists per bot,
 * shared across the /action endpoint, PlanExecutor, and SafetyMonitor.
 *
 * Why: Two separate ActionTranslator instances each own a NavigationBridge
 * with bot.pathfinder. Concurrent navigation from both causes pathfinder
 * state corruption (see docs/contracts/execution-path-audit.md RISK 1).
 */

import type { Bot } from 'mineflayer';
import type { ActionTranslator } from './action-translator';

/** Module-scoped singleton. */
let _instance: ActionTranslator | null = null;
let _instanceBot: Bot | null = null;

/**
 * Register the canonical ActionTranslator for this process.
 * Called once by PlanExecutor.initialize() after it creates the translator.
 *
 * If the bot reference changes (reconnect), the old instance is replaced.
 */
export function registerActionTranslator(
  translator: ActionTranslator,
  bot: Bot
): void {
  if (_instance && _instanceBot === bot) {
    // Same bot, same instance — idempotent
    return;
  }
  _instance = translator;
  _instanceBot = bot;
}

/**
 * Get the canonical ActionTranslator, or null if none is registered yet.
 *
 * The /action endpoint should call this instead of constructing its own.
 * If null, the endpoint can fall back to constructing a temporary one
 * (preserving current behavior during the transition).
 */
export function getActionTranslator(): ActionTranslator | null {
  return _instance;
}

/**
 * Get the bot associated with the registered ActionTranslator.
 */
export function getRegisteredBot(): Bot | null {
  return _instanceBot;
}

/**
 * Clear the singleton (used during disconnect/shutdown).
 */
export function clearActionTranslator(): void {
  _instance = null;
  _instanceBot = null;
}

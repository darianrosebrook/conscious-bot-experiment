/**
 * Constants shared across the cognition server.
 */

/** Regex to strip residual [GOAL:...] tags (and optional trailing amount) from display text */
export const GOAL_TAG_STRIP = /\s*\[GOAL:[^\]]*\](?:\s*\d+\w*)?/gi;

/** Types that are status/environmental updates, not spoken thoughts. */
export const TTS_EXCLUDED_TYPES = new Set([
  'status',
  'system_status',
  'system_metric',
  'environmental',
]);

/** Content that looks like a status line (health/hunger/inventory) — do not send to TTS. */
export const TTS_STATUS_LIKE = /^(Health|Hunger|Food|Inventory|System status):\s*\d/i;

/** Interval between thought generation cycles in milliseconds. */
export const THOUGHT_CYCLE_MS = 60000;

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

/** Metadata thoughtTypes that are system narration, not the bot's voice. */
export const TTS_EXCLUDED_META_TYPES = new Set([
  'processing-start',    // "Processing intrusive thought: ..."
  'thought-recording',   // "Recorded thought: ... (no immediate action)"
  'processing-error',    // "Failed to process intrusive thought: ..."
]);

/** Content that looks like a status line (health/hunger/inventory) — do not send to TTS. */
export const TTS_STATUS_LIKE = /^(Health|Hunger|Food|Inventory|System status):\s*\d/i;

/** Interval between thought generation cycles in milliseconds. */
export const THOUGHT_CYCLE_MS = 60000;

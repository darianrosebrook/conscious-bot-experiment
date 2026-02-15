/**
 * Text Utilities
 *
 * Canonical source for goal-tag stripping, wrapper-sentence unwrapping,
 * and display-text cleaning used across the dashboard.
 *
 * @author @darianrosebrook
 */

/** Strip [GOAL:] routing tags — these are for the planner, not for display. */
export const GOAL_TAG_RE = /\s*\[GOAL:[^\]]*\](?:\s*\d+\w*)?/gi;

/** Strip INTENT: <word> tags — shown as chips, not inline text. */
export const INTENT_TAG_RE = /\s*INTENT:\s*\w+/gi;

/** Wrapper patterns that embed the real content in quotes. */
export const WRAPPER_PATTERNS: { re: RegExp; group: number }[] = [
  {
    re: /^(?:Processing intrusive thought|Thought processing started):\s*"(.+)"\.?$/i,
    group: 1,
  },
  { re: /^From thought\s+"(.+?)"\s*[—–-]\s*.+$/i, group: 1 },
  { re: /^Social interaction:\s*Chat from\s+\S+:\s*"(.+)"$/i, group: 1 },
];

/** Strip [GOAL:] tags from text, returning cleaned string. */
export function stripGoalTags(text: string): string {
  return text.replace(GOAL_TAG_RE, '').trim() || text;
}

/**
 * Clean display text: strip GOAL and INTENT tags, unwrap wrapper sentences,
 * collapse whitespace, remove surrounding quotes.
 */
export function cleanDisplayText(text: string): string {
  if (!text) return text;

  // Strip GOAL and INTENT tags everywhere (including inside quoted substrings)
  let display = text.replace(GOAL_TAG_RE, '').replace(INTENT_TAG_RE, '').trim();

  // Try to unwrap known wrapper patterns
  for (const { re, group } of WRAPPER_PATTERNS) {
    const m = display.match(re);
    if (m?.[group]) {
      display = m[group].trim();
      break;
    }
  }

  // Collapse whitespace
  display = display.replace(/\s+/g, ' ').trim();

  // Remove leading/trailing quotes wrapping the entire string
  if (display.length >= 2 && display.startsWith('"') && display.endsWith('"')) {
    display = display.slice(1, -1).trim();
  }

  return display || text;
}

/** Result of parsing thought content for tags. */
export interface ParsedThoughtTags {
  displayText: string;
  goals: string[];
  intents: string[];
}

/**
 * Parse [GOAL:] and INTENT: tags out of text, returning cleaned display
 * text and extracted tag values for rendering as chips.
 */
export function parseThoughtTags(text: string): ParsedThoughtTags {
  const goals: string[] = [];
  const intents: string[] = [];

  const goalRe = /\s*\[GOAL:\s*([^\]]+)\](?:\s*\d+\w*)?/gi;
  let match: RegExpExecArray | null;
  while ((match = goalRe.exec(text)) !== null) {
    const raw = match[1]?.trim() ?? '';
    if (raw) goals.push(raw);
  }

  const intentRe = /INTENT:\s*(\w+)/gi;
  while ((match = intentRe.exec(text)) !== null) {
    const raw = match[1]?.trim() ?? '';
    if (raw && raw.toLowerCase() !== 'none') intents.push(raw);
  }

  const displayText = text
    .replace(GOAL_TAG_RE, '')
    .replace(INTENT_TAG_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { displayText, goals, intents };
}

/**
 * Parse [GOAL:] tags out of text, returning both the cleaned display
 * text and the extracted goal strings.
 * @deprecated Use parseThoughtTags for goals + intents.
 */
export function parseGoalTags(text: string): {
  displayText: string;
  goals: string[];
} {
  const { displayText, goals } = parseThoughtTags(text);
  return { displayText, goals };
}

/** Convert a raw goal string to a short label (capitalize first word). */
export function goalToLabel(goal: string): string {
  const first = goal.split(/\s+/)[0] ?? goal;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** Convert an intent word to a display label (capitalize). */
export function intentToLabel(intent: string): string {
  return intent.charAt(0).toUpperCase() + intent.slice(1).toLowerCase();
}

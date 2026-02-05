/**
 * Chat Formatting — Non-Semantic Text Cleanup
 *
 * This module provides pure string formatting for chat responses.
 * It does NOT produce any semantic structures (goals, intents, etc.).
 *
 * BOUNDARY RULE: This is formatting only.
 * - Strip marker lines/tags as string cleanup
 * - Enforce character limits
 * - Normalize whitespace
 * - Do NOT parse, infer, or produce semantic artifacts
 *
 * @author @darianrosebrook
 */

/**
 * Maximum character limit for chat responses.
 */
export const CHAT_MAX_CHARS = 256;

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Strip protocol markers from text (pure visual cleanup).
 * Does NOT attempt to interpret or extract semantic content.
 */
function stripProtocolMarkers(text: string): string {
  let out = text;

  // Remove bracketed protocol markers
  out = out.replace(/\[\s*GOAL\s*:[^\]]*\]/gi, '');
  out = out.replace(/\[\s*INTENT\s*:[^\]]*\]/gi, '');
  out = out.replace(/\[\s*OBSERVE\s*:[^\]]*\]/gi, '');
  out = out.replace(/\[\s*THINK\s*:[^\]]*\]/gi, '');

  // Remove line-based protocol markers (common model patterns)
  // Use [^\n]* instead of [\s\S]* to avoid eating the rest of the string
  out = out.replace(/^[\t ]*INTENT\s*:[^\n]*$/gim, '');
  out = out.replace(/^[\t ]*GOAL\s*:[^\n]*$/gim, '');

  // Remove common role prefix if the model emits it
  out = out.replace(/^[\t ]*(assistant|assistant\s*:)\s*/i, '');

  return out;
}

/**
 * Normalize whitespace without destroying structure.
 */
function normalizeWhitespace(text: string): string {
  let out = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Trim each line but keep line breaks
  out = out
    .split('\n')
    .map((l) => l.trim())
    .join('\n');

  // Collapse excessive blank lines
  out = out.replace(/\n{3,}/g, '\n\n');

  // Collapse repeated spaces/tabs inside lines
  out = out.replace(/[ \t]{2,}/g, ' ');

  return out.trim();
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Format text for general display (non-chat surfaces).
 *
 * Operations (all non-semantic):
 * - Strip known marker patterns (visual cleanup)
 * - Normalize whitespace
 * - NO character limit (use formatForChat for chat surfaces)
 *
 * Use this for degraded mode display when Sterling is unavailable.
 *
 * @param text - Raw text to format
 * @returns Formatted text safe for display
 */
export function formatForDisplay(text: string): string {
  if (!text) return '';
  return normalizeWhitespace(stripProtocolMarkers(text));
}

/**
 * Format text for chat display.
 *
 * Operations (all non-semantic):
 * - Strip known marker patterns (visual cleanup)
 * - Normalize whitespace
 * - Enforce character limit
 *
 * @param text - Raw text to format
 * @param maxChars - Maximum character limit (default: 256)
 * @returns Formatted text safe for chat display
 */
export function formatForChat(text: string, maxChars: number = CHAT_MAX_CHARS): string {
  const cleaned = formatForDisplay(text);
  if (cleaned.length <= maxChars) return cleaned;

  // Truncate at word boundary if possible
  const truncated = cleaned.substring(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.7) {
    return truncated.substring(0, lastSpace) + '...';
  }
  return truncated.trimEnd() + '...';
}

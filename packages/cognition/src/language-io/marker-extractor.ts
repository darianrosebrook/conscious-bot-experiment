/**
 * Verbatim marker extraction for Language IO envelopes.
 *
 * CRITICAL DESIGN CONSTRAINT:
 * This extracts the EXACT text, including brackets.
 * NO normalization, NO interpretation, NO action mapping.
 * Sterling handles all semantic interpretation.
 *
 * Key invariant (I-BOUNDARY-3): TS may extract only explicitly declared
 * surface markers verbatim.
 *
 * @author @darianrosebrook
 */

import type { DeclaredMarker } from './envelope-types';

/**
 * Extract verbatim markers from text.
 *
 * CRITICAL: This extracts the EXACT text, including brackets.
 * NO normalization, NO interpretation, NO action mapping.
 * Sterling handles all semantic interpretation.
 *
 * Supported marker types:
 * - GOAL_TAG: [GOAL: ...] patterns
 *
 * @param text - Raw text to extract markers from
 * @returns Array of verbatim markers with their exact spans
 */
export function extractVerbatimMarkers(text: string): DeclaredMarker[] {
  const markers: DeclaredMarker[] = [];

  // Pattern matches [GOAL: ...] tags
  // We capture the FULL tag including brackets for verbatim storage
  // Case-insensitive to match [goal:], [GOAL:], [Goal:], etc.
  const goalTagPattern = /\[GOAL:\s*[^\]]+\]/gi;

  let match: RegExpExecArray | null;
  while ((match = goalTagPattern.exec(text)) !== null) {
    markers.push({
      marker_type: 'GOAL_TAG',
      verbatim_text: match[0], // Exact text including brackets
      span: [match.index, match.index + match[0].length] as const,
    });
  }

  return markers;
}

/**
 * Count goal tag markers without full extraction.
 *
 * Useful for quickly checking if text contains goals without
 * building the full marker array.
 */
export function countGoalTags(text: string): number {
  const goalTagPattern = /\[GOAL:\s*[^\]]+\]/gi;
  const matches = text.match(goalTagPattern);
  return matches ? matches.length : 0;
}

/**
 * Check if text contains any goal tags.
 *
 * Fastest way to check for goal presence.
 */
export function hasGoalTag(text: string): boolean {
  return /\[GOAL:\s*[^\]]+\]/i.test(text);
}

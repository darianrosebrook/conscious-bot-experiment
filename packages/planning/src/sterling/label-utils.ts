/**
 * Label Utilities — Single source of truth for Sterling edge label extraction.
 *
 * Sterling's Python server emits edge labels in two forms:
 * - String: the rule action name directly (e.g. "craft:oak_planks")
 * - Object: structured label with .action or .label property
 *
 * Both solution_path and search_edge messages may carry either form.
 * This module normalizes that union into a consistent action name string.
 *
 * @author @darianrosebrook
 */

/**
 * Extract an action name from a Sterling edge label.
 *
 * Handles the full label union:
 * - string → returned directly (e.g. "craft:oak_planks")
 * - object with .action (string) → extracted
 * - object with .label (string) → extracted (legacy fallback)
 * - undefined/null/other → returns null
 *
 * Returns `null` (not empty string) when no action name can be extracted,
 * so callers can distinguish "label absent" from "label present but empty".
 */
export function extractActionName(label: unknown): string | null {
  if (typeof label === 'string') return label || null;
  if (label && typeof label === 'object') {
    const obj = label as Record<string, unknown>;
    if (typeof obj.action === 'string' && obj.action) return obj.action;
    if (typeof obj.label === 'string' && obj.label) return obj.label;
  }
  return null;
}

/** Degradation counters from step mapping — shared across solver domains. */
export interface MappingDegradation {
  degraded: true;
  /** Edges with no label on solution_path AND no matching search_edge. */
  noLabelEdges: number;
  /** Edges with a label that didn't match any known rule action. */
  unmatchedRuleEdges: number;
  /** search_edge (source,target) pairs with conflicting action names. */
  searchEdgeCollisions: number;
}

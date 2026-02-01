/**
 * Temporal Duration Model — Rule-to-Duration Mapping
 *
 * Pure, table-driven mapping from Minecraft action types to tick
 * durations and slot type requirements. No runtime variability.
 *
 * Used by the temporal enrichment layer to annotate crafting rules
 * with duration and slot information before pre-solve analysis.
 */

import type { MinecraftSlotType } from './time-state';

// ── Duration Table ─────────────────────────────────────────────────

export interface OperatorDuration {
  /** Action type prefix to match against rule.action or rule.actionType. */
  readonly actionType: string;
  /** Base duration in ticks for a single operation. */
  readonly baseDurationTicks: number;
  /** Additional ticks per extra item in batch (beyond the first). */
  readonly perItemDurationTicks: number;
  /** Slot type required, if any. */
  readonly requiresSlotType?: MinecraftSlotType;
}

/**
 * Minecraft operator duration table.
 *
 * Frozen constant — no runtime modification.
 * Duration values from Minecraft wiki (20 tps):
 *   - Furnace smelt/cook: 200 ticks (10 seconds)
 *   - Blast furnace: 100 ticks (5 seconds)
 *   - Smoker: 100 ticks (5 seconds)
 *   - Craft: 0 ticks (instant)
 *   - Mine: ~40 ticks (average, varies by tool/block)
 *   - Place: ~5 ticks (near-instant)
 */
export const OPERATOR_DURATIONS: readonly OperatorDuration[] = Object.freeze([
  { actionType: 'smelt',       baseDurationTicks: 200, perItemDurationTicks: 200, requiresSlotType: 'furnace' },
  { actionType: 'cook',        baseDurationTicks: 200, perItemDurationTicks: 200, requiresSlotType: 'furnace' },
  { actionType: 'blast_smelt', baseDurationTicks: 100, perItemDurationTicks: 100, requiresSlotType: 'blast_furnace' },
  { actionType: 'smoke',       baseDurationTicks: 100, perItemDurationTicks: 100, requiresSlotType: 'smoker' },
  { actionType: 'craft',       baseDurationTicks: 0,   perItemDurationTicks: 0 },
  { actionType: 'mine',        baseDurationTicks: 40,  perItemDurationTicks: 0 },
  { actionType: 'place',       baseDurationTicks: 5,   perItemDurationTicks: 0 },
]);

// ── Lookup ─────────────────────────────────────────────────────────

/**
 * Find the duration entry for a given action string.
 *
 * Matches by checking if the action starts with the operator's
 * actionType (e.g., "smelt:iron_ore" matches "smelt").
 * Falls back to matching by actionType field on the rule.
 */
export function findDuration(action: string, actionType?: string): OperatorDuration | undefined {
  return OPERATOR_DURATIONS.find(
    (d) => action.startsWith(d.actionType) || actionType === d.actionType,
  );
}

/**
 * Compute the total duration in ticks for an operation.
 *
 * For batch operations: base + perItem * (count - 1).
 * For single operations: base duration only.
 */
export function computeDurationTicks(action: string, itemCount: number = 1, actionType?: string): number {
  const def = findDuration(action, actionType);
  if (!def) return 0;
  return def.baseDurationTicks + def.perItemDurationTicks * Math.max(0, itemCount - 1);
}

// ── Rule Annotation ────────────────────────────────────────────────

export interface DurationAnnotation {
  /** Duration in ticks for this operation. */
  readonly durationTicks: number;
  /** Slot type required, if any. */
  readonly requiresSlotType?: MinecraftSlotType;
}

/**
 * Annotate a rule action with its duration and slot requirement.
 *
 * Pure function — does not mutate input.
 */
export function annotateRuleWithDuration(
  action: string,
  actionType?: string,
  itemCount: number = 1,
): DurationAnnotation {
  const def = findDuration(action, actionType);
  return {
    durationTicks: def
      ? def.baseDurationTicks + def.perItemDurationTicks * Math.max(0, itemCount - 1)
      : 0,
    requiresSlotType: def?.requiresSlotType,
  };
}

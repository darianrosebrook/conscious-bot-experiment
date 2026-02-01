/**
 * Temporal Deadlock Prevention — Pre-Solve Capacity Check
 *
 * Derives slot needs from enriched rules and goal, then delegates
 * to the adapter's checkDeadlock. Conservative (fail-closed): if
 * uncertain whether an action requires a slot, it is treated as
 * requiring one.
 */

import type {
  P03TemporalAdapter,
  P03TemporalStateV1,
  P03DeadlockCheckV1,
  P03SlotNeedV1,
} from '../sterling/primitives/p03/p03-capsule-types';
import type { MinecraftCraftingRule } from '../sterling/minecraft-crafting-types';
import { findDuration } from './duration-model';

// ── Slot Needs Derivation ──────────────────────────────────────────

/**
 * Derive slot needs from a set of crafting rules.
 *
 * Conservative: any rule whose action maps to a duration entry with
 * requiresSlotType gets that slot type counted. Additionally, rules
 * with needsFurnace=true are treated as requiring a 'furnace' slot
 * even if the duration model doesn't map them (fail-closed).
 *
 * Returns deduplicated slot needs with count=1 per type. The
 * conservative assumption is that at least one slot of each required
 * type must be available within horizon.
 */
export function deriveSlotNeeds(rules: readonly MinecraftCraftingRule[]): P03SlotNeedV1[] {
  const needed = new Set<string>();

  for (const rule of rules) {
    const dur = findDuration(rule.action, rule.actionType);
    if (dur?.requiresSlotType) {
      needed.add(dur.requiresSlotType);
    }

    // Fail-closed: needsFurnace implies furnace slot requirement
    // even if duration model doesn't explicitly map this action
    if (rule.needsFurnace && !needed.has('furnace')) {
      needed.add('furnace');
    }
  }

  return Array.from(needed)
    .sort() // deterministic order
    .map((type) => ({ type, count: 1 }));
}

// ── Deadlock Check ─────────────────────────────────────────────────

/**
 * Check for capacity deadlock before calling the solver.
 *
 * Derives slot needs from the rules, then delegates to the adapter.
 * Returns the adapter's result unchanged — no additional logic
 * layered on top.
 */
export function checkDeadlockForRules(
  adapter: P03TemporalAdapter,
  rules: readonly MinecraftCraftingRule[],
  state: P03TemporalStateV1,
): P03DeadlockCheckV1 {
  const needs = deriveSlotNeeds(rules);
  return adapter.checkDeadlock(needs, state);
}

/**
 * Check for capacity deadlock with explicit slot needs.
 * Direct delegation to the adapter — provided for callers that
 * construct their own slot needs.
 */
export function checkDeadlock(
  adapter: P03TemporalAdapter,
  needs: readonly P03SlotNeedV1[],
  state: P03TemporalStateV1,
): P03DeadlockCheckV1 {
  return adapter.checkDeadlock(needs, state);
}

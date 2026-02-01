/**
 * Temporal Capacity Manager — Thin Adapter Delegation
 *
 * Provides Minecraft-vocabulary convenience functions that delegate
 * to the injected P03TemporalAdapter. No reimplementation of slot
 * tie-breaking, reservation, or canonicalization logic — those
 * semantics are owned by the adapter and proven by conformance tests.
 */

import type {
  P03TemporalAdapter,
  P03TemporalStateV1,
  P03ResourceSlotV1,
} from '../sterling/primitives/p03/p03-capsule-types';

// ── Canonicalize ───────────────────────────────────────────────────

/**
 * Canonicalize temporal state through the adapter.
 * Validates integers and sorts slots deterministically.
 */
export function canonicalizeState(
  adapter: P03TemporalAdapter,
  state: P03TemporalStateV1,
): P03TemporalStateV1 {
  return adapter.canonicalize(state);
}

// ── Slot Finding ───────────────────────────────────────────────────

/**
 * Find the best available slot of a given type at a given bucket.
 * Deterministic tie-breaking per P03_CANONICALIZATION.
 */
export function findSlot(
  adapter: P03TemporalAdapter,
  slots: readonly P03ResourceSlotV1[],
  slotType: string,
  atBucket: number,
): P03ResourceSlotV1 | undefined {
  return adapter.findAvailableSlot(slots, slotType, atBucket);
}

// ── Slot Reservation ───────────────────────────────────────────────

/**
 * Reserve a slot: returns new array with the target slot's
 * readyAtBucket advanced. Immutable — input is not mutated.
 */
export function reserveSlot(
  adapter: P03TemporalAdapter,
  slots: readonly P03ResourceSlotV1[],
  slotId: string,
  durationBuckets: number,
  currentBucket: number,
): P03ResourceSlotV1[] {
  return adapter.reserveSlot(slots, slotId, durationBuckets, currentBucket);
}

// ── Earliest Available ─────────────────────────────────────────────

/**
 * Find the earliest bucket at which a slot of the given type becomes
 * available. Returns Infinity if no slot of that type exists.
 */
export function getEarliestAvailableBucket(
  slots: readonly P03ResourceSlotV1[],
  slotType: string,
): number {
  const matching = slots.filter((s) => s.type === slotType);
  if (matching.length === 0) return Infinity;
  return Math.min(...matching.map((s) => s.readyAtBucket));
}

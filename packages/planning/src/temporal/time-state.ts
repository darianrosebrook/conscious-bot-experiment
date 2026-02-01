/**
 * Temporal Time State — Domain-Specific Conversion to P03 Capsule State
 *
 * Converts domain-observable context (tick counts, nearby blocks, slot
 * observations) into P03TemporalStateV1. This is the boundary where
 * domain-specific knowledge (Minecraft tick rate, bucket granularity)
 * is translated into the capsule's integer-bucket model.
 *
 * Outputs capsule types only — no new temporal types invented here.
 */

import type {
  P03TemporalStateV1,
  P03ResourceSlotV1,
  P03TemporalAdapter,
} from '../sterling/primitives/p03/p03-capsule-types';

// ── Minecraft Domain Constants ─────────────────────────────────────

/** Ticks per bucket. 100 ticks ≈ 5 seconds at 20 tps. */
export const MINECRAFT_BUCKET_SIZE_TICKS = 100;

/**
 * Search horizon: how far ahead (in buckets) the temporal state extends
 * from currentBucket. Controls temporalState.time.horizonBucket.
 */
export const HORIZON_BUCKETS = 100;

/**
 * Max wait bound: the adapter's maxWaitBuckets parameter. Controls how
 * far a slot's readyAtBucket can be from the horizon before deadlock
 * is declared. Currently equal to HORIZON_BUCKETS but semantically
 * distinct — HORIZON_BUCKETS is "how far we plan", MAX_WAIT_BUCKETS
 * is "how long we'll tolerate waiting for a slot."
 */
export const MAX_WAIT_BUCKETS = 100;

/**
 * @deprecated Use HORIZON_BUCKETS or MAX_WAIT_BUCKETS instead.
 * Kept temporarily for backward compatibility with existing tests.
 */
export const DEFAULT_HORIZON_BUCKETS = HORIZON_BUCKETS;

// ── Slot Type Vocabulary ───────────────────────────────────────────

/**
 * Known Minecraft slot types. The capsule treats these as opaque tokens;
 * this vocabulary exists so the domain layer can construct slots from
 * observed blocks.
 */
export const MINECRAFT_SLOT_TYPES = [
  'furnace',
  'blast_furnace',
  'smoker',
  'crafting_table',
] as const;

export type MinecraftSlotType = (typeof MINECRAFT_SLOT_TYPES)[number];

// ── Block-to-Slot Inference ────────────────────────────────────────

/** Map from Minecraft block name to slot type. */
const BLOCK_TO_SLOT_TYPE: Record<string, MinecraftSlotType> = {
  furnace: 'furnace',
  lit_furnace: 'furnace',
  blast_furnace: 'blast_furnace',
  lit_blast_furnace: 'blast_furnace',
  smoker: 'smoker',
  lit_smoker: 'smoker',
  crafting_table: 'crafting_table',
};

/**
 * Infer resource slots from nearby blocks.
 *
 * When real slot observation isn't available, this provides a
 * pessimistic-idle fallback: each observed block of a known type
 * becomes a slot at readyAtBucket = currentBucket (assumed idle).
 *
 * Slots are assigned deterministic IDs based on block type and
 * discovery order.
 */
export function inferSlotsFromBlocks(
  nearbyBlocks: readonly string[],
  currentBucket: number,
): P03ResourceSlotV1[] {
  const counts: Record<string, number> = {};
  const slots: P03ResourceSlotV1[] = [];

  for (const block of nearbyBlocks) {
    const slotType = BLOCK_TO_SLOT_TYPE[block];
    if (slotType === undefined) continue;

    const idx = counts[slotType] ?? 0;
    counts[slotType] = idx + 1;

    slots.push({
      id: `${slotType}_${idx}`,
      type: slotType,
      readyAtBucket: currentBucket, // pessimistic idle
    });
  }

  return slots;
}

// ── Tick-to-Bucket Conversion ──────────────────────────────────────

/**
 * Convert a raw tick count to an integer bucket.
 * Always floors — the capsule requires non-negative integers.
 */
export function toTickBucket(ticks: number, bucketSize: number = MINECRAFT_BUCKET_SIZE_TICKS): number {
  return Math.floor(ticks / bucketSize);
}

// ── State Construction ─────────────────────────────────────────────

export interface MakeTemporalStateInput {
  /** Current time in domain ticks (e.g., Minecraft game ticks). */
  nowTicks: number;
  /** Planning horizon in buckets (default: HORIZON_BUCKETS). */
  horizonBuckets?: number;
  /** Observed resource slots. If absent, inferred from nearbyBlocks. */
  slotsObserved?: readonly P03ResourceSlotV1[];
  /** Nearby blocks for slot inference fallback. */
  nearbyBlocks?: readonly string[];
  /** Bucket size in ticks (default: MINECRAFT_BUCKET_SIZE_TICKS). */
  bucketSizeTicks?: number;
}

/**
 * Construct a P03TemporalStateV1 from domain observations.
 *
 * The returned state is canonicalized via the provided adapter,
 * ensuring all conformance invariants (integer validation, slot
 * sorting) are enforced at construction time.
 */
export function makeTemporalState(
  input: MakeTemporalStateInput,
  adapter: P03TemporalAdapter,
): P03TemporalStateV1 {
  const bucketSize = input.bucketSizeTicks ?? MINECRAFT_BUCKET_SIZE_TICKS;
  const currentBucket = toTickBucket(input.nowTicks, bucketSize);
  const horizon = input.horizonBuckets ?? HORIZON_BUCKETS;

  const slots: P03ResourceSlotV1[] =
    input.slotsObserved
      ? [...input.slotsObserved]
      : inferSlotsFromBlocks(input.nearbyBlocks ?? [], currentBucket);

  const rawState: P03TemporalStateV1 = {
    time: {
      currentBucket,
      horizonBucket: currentBucket + horizon,
      bucketSizeTicks: bucketSize,
    },
    slots,
  };

  // Canonicalize through the adapter — enforces integer validation + slot sorting
  return adapter.canonicalize(rawState);
}

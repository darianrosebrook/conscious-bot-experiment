/**
 * P03 Reference Adapter — Domain-Agnostic Implementation
 *
 * A clean, portable implementation of P03TemporalAdapter that satisfies
 * all 5 conformance invariants. This adapter is domain-agnostic — it
 * operates purely on capsule types with no Minecraft or domain-specific
 * imports.
 *
 * Used by conformance test files to prove the capsule contract is
 * satisfiable across multiple fixture domains (furnace, CI runner, etc.).
 *
 * Zero vitest imports. Zero domain imports.
 */

import type {
  P03TemporalAdapter,
  P03TemporalStateV1,
  P03ResourceSlotV1,
  P03BatchOperatorV1,
  P03PlannedStepV1,
  P03DeadlockCheckV1,
  P03SlotNeedV1,
} from './p03-capsule-types';

// ── Validation helpers ─────────────────────────────────────────────

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `P03 integer_buckets violation: ${label} must be a non-negative integer, got ${value}`,
    );
  }
}

// ── Reference Adapter ──────────────────────────────────────────────

export class P03ReferenceAdapter implements P03TemporalAdapter {
  readonly maxWaitBuckets: number;
  readonly batchThreshold: number;

  constructor(maxWaitBuckets: number, batchThreshold: number) {
    this.maxWaitBuckets = maxWaitBuckets;
    this.batchThreshold = batchThreshold;
  }

  canonicalize(state: P03TemporalStateV1): P03TemporalStateV1 {
    // INV-1: Validate all time fields are non-negative integers
    assertNonNegativeInteger(state.time.currentBucket, 'currentBucket');
    assertNonNegativeInteger(state.time.horizonBucket, 'horizonBucket');
    assertNonNegativeInteger(state.time.bucketSizeTicks, 'bucketSizeTicks');

    for (const slot of state.slots) {
      assertNonNegativeInteger(slot.readyAtBucket, `slot[${slot.id}].readyAtBucket`);
    }

    // Sort slots by (type ASC, readyAtBucket ASC, id ASC)
    // per P03_CANONICALIZATION.slotSortOrder
    const sortedSlots = [...state.slots]
      .map((s) => ({ ...s }))
      .sort((a, b) => {
        const typeCmp = a.type.localeCompare(b.type);
        if (typeCmp !== 0) return typeCmp;
        const readyCmp = a.readyAtBucket - b.readyAtBucket;
        if (readyCmp !== 0) return readyCmp;
        return a.id.localeCompare(b.id);
      });

    return {
      time: { ...state.time },
      slots: sortedSlots,
    };
  }

  findAvailableSlot(
    slots: readonly P03ResourceSlotV1[],
    slotType: string,
    atBucket: number,
  ): P03ResourceSlotV1 | undefined {
    // INV-3: Deterministic slot selection
    // Filter to matching type and available at requested bucket,
    // then sort by (readyAtBucket ASC, id ASC) per P03_CANONICALIZATION.slotSelectionOrder
    const candidates = slots
      .filter((s) => s.type === slotType && s.readyAtBucket <= atBucket);

    if (candidates.length === 0) return undefined;

    // Deterministic tie-breaking: lowest readyAtBucket, then lexicographic id
    return [...candidates].sort((a, b) => {
      const readyCmp = a.readyAtBucket - b.readyAtBucket;
      if (readyCmp !== 0) return readyCmp;
      return a.id.localeCompare(b.id);
    })[0];
  }

  reserveSlot(
    slots: readonly P03ResourceSlotV1[],
    slotId: string,
    durationBuckets: number,
    currentBucket: number,
  ): P03ResourceSlotV1[] {
    // Immutable: return new array with the target slot's readyAtBucket advanced
    return slots.map((s) =>
      s.id === slotId
        ? { ...s, readyAtBucket: currentBucket + durationBuckets }
        : { ...s },
    );
  }

  checkDeadlock(
    needs: readonly P03SlotNeedV1[],
    state: P03TemporalStateV1,
  ): P03DeadlockCheckV1 {
    // INV-5: Deadlock detected when any needed slot type has no slot
    // available within the planning horizon
    if (needs.length === 0) {
      return { isDeadlock: false };
    }

    const blockedTypes: string[] = [];

    for (const need of needs) {
      const available = state.slots.filter(
        (s) => s.type === need.type && s.readyAtBucket <= state.time.horizonBucket,
      );
      if (available.length < need.count) {
        blockedTypes.push(need.type);
      }
    }

    if (blockedTypes.length > 0) {
      return {
        isDeadlock: true,
        reason: `Capacity deadlock: slot types [${blockedTypes.join(', ')}] not available within horizon (bucket ${state.time.horizonBucket})`,
        blockedSlotTypes: blockedTypes,
      };
    }

    return { isDeadlock: false };
  }

  preferBatch(
    itemType: string,
    goalCount: number,
    batchOperators: readonly P03BatchOperatorV1[],
    batchThreshold: number,
  ): { useBatch: boolean; operator?: P03BatchOperatorV1; batchSize?: number } {
    // INV-4: Batch preferred when count >= threshold and matching operator exists
    if (goalCount < batchThreshold) {
      return { useBatch: false };
    }

    const matching = batchOperators.find((op) => op.itemType === itemType);
    if (!matching) {
      return { useBatch: false };
    }

    const batchSize = Math.min(goalCount, matching.maxBatchSize);
    return { useBatch: true, operator: matching, batchSize };
  }

  computeMakespan(steps: readonly P03PlannedStepV1[]): number {
    if (steps.length === 0) return 0;
    const minStart = Math.min(...steps.map((s) => s.startBucket));
    const maxEnd = Math.max(...steps.map((s) => s.endBucket));
    return maxEnd - minStart;
  }
}

/**
 * P03 Conformance Suite — Temporal Planning Invariants
 *
 * Parameterized test factory for the 5 temporal planning invariants.
 * Each test delegates to the adapter's methods and asserts capsule-level
 * contracts. Domain fixtures are supplied by the caller.
 *
 * Import in test files:
 *   import { runP03ConformanceSuite } from '@conscious-bot/testkits/src/p03';
 *
 * Invariants tested:
 *   INV-1 integer_buckets       — All time values are non-negative integers
 *   INV-2 bounded_wait          — No wait exceeds maxWaitBuckets
 *   INV-3 deterministic_slot_choice — Same state produces same slot choice
 *   INV-4 batch_preference      — Batch operator preferred when applicable
 *   INV-5 deadlock_pre_solve    — Deadlock detected when slots unavailable
 */

import { describe, it, expect } from 'vitest';
import type {
  P03TemporalAdapter,
  P03TemporalStateV1,
  P03ResourceSlotV1,
  P03BatchOperatorV1,
  P03SlotNeedV1,
  P03PlannedStepV1,
} from '../../../planning/src/sterling/primitives/p03/p03-capsule-types';

// ── Config ──────────────────────────────────────────────────────────

export interface P03ConformanceConfig {
  /** Human-readable name for this surface (e.g., "Minecraft Furnace"). */
  name: string;

  /** Factory: create a fresh adapter instance for each test. */
  createAdapter: () => P03TemporalAdapter;

  // ── Fixture data ────────────────────────────────────────────────

  /** Temporal state with all slots idle (readyAtBucket = 0). */
  idleState: P03TemporalStateV1;

  /** Temporal state where all slots are busy beyond horizon (deadlock). */
  deadlockedState: P03TemporalStateV1;

  /** Slots with at least 2 of the same type at readyAtBucket = 0 but different ids. */
  tieBreakSlots: readonly P03ResourceSlotV1[];

  /** The slot type to use for tie-breaking tests (e.g., 'furnace', 'runner'). */
  slotType: string;

  /**
   * Expected winner of tie-break: the slot id that should be selected
   * when multiple slots of the same type are available at the same bucket.
   * Must be the lexicographically smallest id.
   */
  expectedTieBreakWinnerId: string;

  /** Slot needs for deadlock testing (at least 1 slot of slotType). */
  slotNeeds: readonly P03SlotNeedV1[];

  /** Batch operators available in this domain. */
  batchOperators: readonly P03BatchOperatorV1[];

  /** Item type that has a batch operator. */
  batchItemType: string;

  /** A goal count that exceeds the adapter's batch threshold. */
  largeBatchCount: number;

  /** A goal count below the adapter's batch threshold. */
  smallBatchCount: number;

  /**
   * A valid schedule (parallel) with lower makespan.
   * Used to verify computeMakespan returns correct value.
   */
  parallelSchedule: readonly P03PlannedStepV1[];

  /** Expected makespan of parallelSchedule. */
  parallelMakespan: number;

  /**
   * A valid schedule (serial) with higher makespan.
   * Used to verify computeMakespan and compare against parallel.
   */
  serialSchedule: readonly P03PlannedStepV1[];

  /** Expected makespan of serialSchedule. */
  serialMakespan: number;
}

// ── Suite ───────────────────────────────────────────────────────────

export function runP03ConformanceSuite(config: P03ConformanceConfig): void {
  const {
    name,
    createAdapter,
    idleState,
    deadlockedState,
    tieBreakSlots,
    slotType,
    expectedTieBreakWinnerId,
    slotNeeds,
    batchOperators,
    batchItemType,
    largeBatchCount,
    smallBatchCount,
    parallelSchedule,
    parallelMakespan,
    serialSchedule,
    serialMakespan,
  } = config;

  describe(`P03 Conformance: ${name}`, () => {
    // ── INV-1: integer_buckets ────────────────────────────────────

    describe('INV-1: integer_buckets', () => {
      it('canonicalize rejects float currentBucket', () => {
        const adapter = createAdapter();
        const badState: P03TemporalStateV1 = {
          time: { ...idleState.time, currentBucket: 1.5 },
          slots: [...idleState.slots],
        };
        expect(() => adapter.canonicalize(badState)).toThrow();
      });

      it('canonicalize rejects float horizonBucket', () => {
        const adapter = createAdapter();
        const badState: P03TemporalStateV1 = {
          time: { ...idleState.time, horizonBucket: 99.9 },
          slots: [...idleState.slots],
        };
        expect(() => adapter.canonicalize(badState)).toThrow();
      });

      it('canonicalize rejects float readyAtBucket on slot', () => {
        const adapter = createAdapter();
        const badSlots: P03ResourceSlotV1[] = [
          { id: 'slot_0', type: slotType, readyAtBucket: 2.7 },
        ];
        const badState: P03TemporalStateV1 = {
          time: idleState.time,
          slots: badSlots,
        };
        expect(() => adapter.canonicalize(badState)).toThrow();
      });

      it('canonicalize rejects negative currentBucket', () => {
        const adapter = createAdapter();
        const badState: P03TemporalStateV1 = {
          time: { ...idleState.time, currentBucket: -1 },
          slots: [...idleState.slots],
        };
        expect(() => adapter.canonicalize(badState)).toThrow();
      });

      it('canonicalize rejects NaN in time fields', () => {
        const adapter = createAdapter();
        const badState: P03TemporalStateV1 = {
          time: { ...idleState.time, currentBucket: NaN },
          slots: [...idleState.slots],
        };
        expect(() => adapter.canonicalize(badState)).toThrow();
      });

      it('canonicalize accepts valid integer state', () => {
        const adapter = createAdapter();
        const result = adapter.canonicalize(idleState);
        expect(Number.isInteger(result.time.currentBucket)).toBe(true);
        expect(Number.isInteger(result.time.horizonBucket)).toBe(true);
        expect(result.time.currentBucket).toBeGreaterThanOrEqual(0);
        expect(result.time.horizonBucket).toBeGreaterThan(result.time.currentBucket);
        for (const slot of result.slots) {
          expect(Number.isInteger(slot.readyAtBucket)).toBe(true);
          expect(slot.readyAtBucket).toBeGreaterThanOrEqual(0);
        }
      });

      it('canonicalize sorts slots deterministically', () => {
        const adapter = createAdapter();
        const state: P03TemporalStateV1 = {
          time: idleState.time,
          slots: [...tieBreakSlots].reverse(), // reversed order
        };
        const result = adapter.canonicalize(state);
        // Slots should be sorted by (type, readyAtBucket, id)
        for (let i = 1; i < result.slots.length; i++) {
          const prev = result.slots[i - 1];
          const curr = result.slots[i];
          const cmp =
            prev.type.localeCompare(curr.type) ||
            (prev.readyAtBucket - curr.readyAtBucket) ||
            prev.id.localeCompare(curr.id);
          expect(cmp).toBeLessThanOrEqual(0);
        }
      });
    });

    // ── INV-2: bounded_wait ──────────────────────────────────────

    describe('INV-2: bounded_wait', () => {
      it('adapter declares maxWaitBuckets as a positive integer', () => {
        const adapter = createAdapter();
        expect(adapter.maxWaitBuckets).toBeGreaterThan(0);
        expect(Number.isInteger(adapter.maxWaitBuckets)).toBe(true);
      });

      it('checkDeadlock detects slots beyond horizon', () => {
        const adapter = createAdapter();
        const result = adapter.checkDeadlock(slotNeeds, deadlockedState);
        expect(result.isDeadlock).toBe(true);
        expect(result.blockedSlotTypes).toBeDefined();
        expect(result.blockedSlotTypes!.length).toBeGreaterThan(0);
      });

      it('checkDeadlock allows slots within horizon', () => {
        const adapter = createAdapter();
        const result = adapter.checkDeadlock(slotNeeds, idleState);
        expect(result.isDeadlock).toBe(false);
      });
    });

    // ── INV-3: deterministic_slot_choice ─────────────────────────

    describe('INV-3: deterministic_slot_choice', () => {
      it('selects same slot across 100 repeated calls', () => {
        const adapter = createAdapter();
        const results: string[] = [];
        for (let i = 0; i < 100; i++) {
          const slot = adapter.findAvailableSlot(tieBreakSlots, slotType, 0);
          expect(slot).toBeDefined();
          results.push(slot!.id);
        }
        // All should be the expected tie-break winner
        expect(results.every((id) => id === expectedTieBreakWinnerId)).toBe(true);
      });

      it('selects slot with lowest readyAtBucket when different', () => {
        const adapter = createAdapter();
        const slots: P03ResourceSlotV1[] = [
          { id: 'slot_late', type: slotType, readyAtBucket: 10 },
          { id: 'slot_early', type: slotType, readyAtBucket: 0 },
        ];
        const selected = adapter.findAvailableSlot(slots, slotType, 0);
        expect(selected).toBeDefined();
        expect(selected!.id).toBe('slot_early');
      });

      it('returns undefined when no slot of requested type exists', () => {
        const adapter = createAdapter();
        const selected = adapter.findAvailableSlot(tieBreakSlots, 'nonexistent_type', 0);
        expect(selected).toBeUndefined();
      });

      it('returns undefined when no slot is available at the requested bucket', () => {
        const adapter = createAdapter();
        const busySlots: P03ResourceSlotV1[] = [
          { id: 'slot_0', type: slotType, readyAtBucket: 50 },
        ];
        const selected = adapter.findAvailableSlot(busySlots, slotType, 10);
        expect(selected).toBeUndefined();
      });

      it('reserveSlot returns new array without mutating input', () => {
        const adapter = createAdapter();
        const originalSlots: P03ResourceSlotV1[] = [
          { id: 'slot_0', type: slotType, readyAtBucket: 0 },
        ];
        const originalReadyAt = originalSlots[0].readyAtBucket;
        const newSlots = adapter.reserveSlot(originalSlots, 'slot_0', 5, 0);

        // Input must not be mutated
        expect(originalSlots[0].readyAtBucket).toBe(originalReadyAt);
        // New array should have updated readyAt
        const reserved = newSlots.find((s) => s.id === 'slot_0');
        expect(reserved).toBeDefined();
        expect(reserved!.readyAtBucket).toBe(5); // 0 + 5
      });
    });

    // ── INV-4: batch_preference ──────────────────────────────────

    describe('INV-4: batch_preference', () => {
      it('prefers batch operator when count >= threshold', () => {
        const adapter = createAdapter();
        const result = adapter.preferBatch(
          batchItemType,
          largeBatchCount,
          batchOperators,
          adapter.batchThreshold,
        );
        expect(result.useBatch).toBe(true);
        expect(result.operator).toBeDefined();
        expect(result.batchSize).toBeDefined();
        expect(result.batchSize!).toBeGreaterThan(0);
        expect(result.batchSize!).toBeLessThanOrEqual(result.operator!.maxBatchSize);
      });

      it('does not batch when count < threshold', () => {
        const adapter = createAdapter();
        const result = adapter.preferBatch(
          batchItemType,
          smallBatchCount,
          batchOperators,
          adapter.batchThreshold,
        );
        expect(result.useBatch).toBe(false);
      });

      it('does not batch when no matching operator exists', () => {
        const adapter = createAdapter();
        const result = adapter.preferBatch(
          'nonexistent_item_type',
          largeBatchCount,
          batchOperators,
          adapter.batchThreshold,
        );
        expect(result.useBatch).toBe(false);
      });

      it('batch threshold is a positive integer', () => {
        const adapter = createAdapter();
        expect(adapter.batchThreshold).toBeGreaterThan(0);
        expect(Number.isInteger(adapter.batchThreshold)).toBe(true);
      });
    });

    // ── INV-5: deadlock_pre_solve ────────────────────────────────

    describe('INV-5: deadlock_pre_solve', () => {
      it('deadlock detected when all slots busy beyond horizon', () => {
        const adapter = createAdapter();
        const result = adapter.checkDeadlock(slotNeeds, deadlockedState);
        expect(result.isDeadlock).toBe(true);
        expect(result.reason).toBeDefined();
        expect(typeof result.reason).toBe('string');
        expect(result.reason!.length).toBeGreaterThan(0);
      });

      it('no deadlock when at least one slot available within horizon', () => {
        const adapter = createAdapter();
        const result = adapter.checkDeadlock(slotNeeds, idleState);
        expect(result.isDeadlock).toBe(false);
      });

      it('deadlock check does not mutate state', () => {
        const adapter = createAdapter();
        const slotsCopy = deadlockedState.slots.map((s) => ({ ...s }));
        adapter.checkDeadlock(slotNeeds, deadlockedState);
        // Verify slots unchanged
        for (let i = 0; i < deadlockedState.slots.length; i++) {
          expect(deadlockedState.slots[i].readyAtBucket).toBe(slotsCopy[i].readyAtBucket);
        }
      });

      it('empty slot needs never deadlock', () => {
        const adapter = createAdapter();
        const result = adapter.checkDeadlock([], deadlockedState);
        expect(result.isDeadlock).toBe(false);
      });
    });

    // ── Makespan computation ─────────────────────────────────────

    describe('Makespan computation', () => {
      it('parallel schedule has lower makespan than serial', () => {
        const adapter = createAdapter();
        const parallel = adapter.computeMakespan(parallelSchedule);
        const serial = adapter.computeMakespan(serialSchedule);
        expect(parallel).toBeLessThan(serial);
      });

      it('parallel schedule makespan matches expected', () => {
        const adapter = createAdapter();
        expect(adapter.computeMakespan(parallelSchedule)).toBe(parallelMakespan);
      });

      it('serial schedule makespan matches expected', () => {
        const adapter = createAdapter();
        expect(adapter.computeMakespan(serialSchedule)).toBe(serialMakespan);
      });

      it('empty schedule has makespan 0', () => {
        const adapter = createAdapter();
        expect(adapter.computeMakespan([])).toBe(0);
      });

      it('single-step schedule makespan is endBucket - startBucket', () => {
        const adapter = createAdapter();
        const steps: P03PlannedStepV1[] = [
          { opId: 'test_op', startBucket: 5, endBucket: 15 },
        ];
        expect(adapter.computeMakespan(steps)).toBe(10);
      });
    });
  });
}

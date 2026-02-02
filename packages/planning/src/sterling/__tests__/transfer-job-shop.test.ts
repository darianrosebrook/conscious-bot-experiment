/**
 * Transfer Test — Job Shop Scheduling (C.7)
 *
 * Acceptance: Uses P03TemporalAdapter with non-Minecraft job/machine rules.
 * Same capsule infrastructure: adapter, hashing, slot management, batch preference.
 * Linter, hashing, bundle capture all work.
 * Zero Minecraft imports.
 */

import { describe, it, expect } from 'vitest';
import { P03ReferenceAdapter } from '../primitives/p03/p03-reference-adapter';
import type {
  P03TemporalStateV1,
  P03ResourceSlotV1,
  P03OperatorV1,
  P03BatchOperatorV1,
  P03PlannedStepV1,
  P03SlotNeedV1,
} from '../primitives/p03/p03-capsule-types';
import { canonicalize, contentHash } from '../solve-bundle';

// ============================================================================
// Job Shop Domain — Zero Minecraft Imports
// ============================================================================

/** Bucket size: 1 minute per bucket. */
const JOB_SHOP_BUCKET_SIZE = 60;
const JOB_SHOP_MAX_WAIT = 50;
const JOB_SHOP_BATCH_THRESHOLD = 4;

/** Machine slots (welding stations). */
const MACHINES: P03ResourceSlotV1[] = [
  { id: 'welder_0', type: 'welder', readyAtBucket: 0 },
  { id: 'welder_1', type: 'welder', readyAtBucket: 0 },
  { id: 'lathe_0', type: 'lathe', readyAtBucket: 0 },
];

/** Job operators. */
const JOB_OPERATORS: P03OperatorV1[] = [
  { opId: 'weld_frame', durationTicks: 300, requiresSlotType: 'welder', baseCost: 10 },
  { opId: 'weld_panel', durationTicks: 180, requiresSlotType: 'welder', baseCost: 8 },
  { opId: 'turn_shaft', durationTicks: 240, requiresSlotType: 'lathe', baseCost: 12 },
  { opId: 'assemble', durationTicks: 0, baseCost: 5 }, // No machine needed
];

/** Batch operator for welding. */
const BATCH_OPERATORS: P03BatchOperatorV1[] = [
  {
    opId: 'weld_batch_panel',
    durationTicks: 180,
    requiresSlotType: 'welder',
    baseCost: 3,
    itemType: 'panel',
    maxBatchSize: 10,
    perItemDurationTicks: 120,
  },
];

// ============================================================================
// Tests
// ============================================================================

describe('transfer: job shop scheduling (C.7)', () => {
  const adapter = new P03ReferenceAdapter(JOB_SHOP_MAX_WAIT, JOB_SHOP_BATCH_THRESHOLD);

  describe('canonicalization', () => {
    it('canonicalizes job shop temporal state', () => {
      const state: P03TemporalStateV1 = {
        time: {
          currentBucket: 0,
          horizonBucket: JOB_SHOP_MAX_WAIT,
          bucketSizeTicks: JOB_SHOP_BUCKET_SIZE,
        },
        slots: MACHINES,
      };

      const canonical = adapter.canonicalize(state);
      expect(canonical.time.currentBucket).toBe(0);
      expect(canonical.time.bucketSizeTicks).toBe(60);
      // Slots sorted by (type ASC, readyAtBucket ASC, id ASC)
      expect(canonical.slots[0].type).toBe('lathe');
      expect(canonical.slots[1].type).toBe('welder');
    });
  });

  describe('slot management', () => {
    it('finds available welder slot', () => {
      const slot = adapter.findAvailableSlot(MACHINES, 'welder', 0);
      expect(slot).toBeDefined();
      expect(slot!.type).toBe('welder');
    });

    it('finds available lathe slot', () => {
      const slot = adapter.findAvailableSlot(MACHINES, 'lathe', 0);
      expect(slot).toBeDefined();
      expect(slot!.id).toBe('lathe_0');
    });

    it('no slot available for unknown type', () => {
      const slot = adapter.findAvailableSlot(MACHINES, 'drill_press', 0);
      expect(slot).toBeUndefined();
    });

    it('reserves slot immutably', () => {
      const reserved = adapter.reserveSlot(MACHINES, 'welder_0', 5, 0);
      // Original unchanged
      expect(MACHINES[0].readyAtBucket).toBe(0);
      // New array has updated slot
      const updatedSlot = reserved.find((s) => s.id === 'welder_0');
      expect(updatedSlot!.readyAtBucket).toBe(5);
    });
  });

  describe('deadlock detection', () => {
    it('no deadlock when machines available', () => {
      const needs: P03SlotNeedV1[] = [
        { type: 'welder', count: 1 },
        { type: 'lathe', count: 1 },
      ];
      const state: P03TemporalStateV1 = {
        time: { currentBucket: 0, horizonBucket: JOB_SHOP_MAX_WAIT, bucketSizeTicks: JOB_SHOP_BUCKET_SIZE },
        slots: MACHINES,
      };

      const result = adapter.checkDeadlock(needs, state);
      expect(result.isDeadlock).toBe(false);
    });

    it('deadlock when all machines busy beyond horizon', () => {
      const busyMachines: P03ResourceSlotV1[] = [
        { id: 'welder_0', type: 'welder', readyAtBucket: 100 },
        { id: 'welder_1', type: 'welder', readyAtBucket: 100 },
        { id: 'lathe_0', type: 'lathe', readyAtBucket: 100 },
      ];
      const needs: P03SlotNeedV1[] = [{ type: 'welder', count: 1 }];
      const state: P03TemporalStateV1 = {
        time: { currentBucket: 0, horizonBucket: JOB_SHOP_MAX_WAIT, bucketSizeTicks: JOB_SHOP_BUCKET_SIZE },
        slots: busyMachines,
      };

      const result = adapter.checkDeadlock(needs, state);
      expect(result.isDeadlock).toBe(true);
      expect(result.blockedSlotTypes).toContain('welder');
    });
  });

  describe('batch preference', () => {
    it('prefers batch when count >= threshold', () => {
      const result = adapter.preferBatch(
        'panel',
        JOB_SHOP_BATCH_THRESHOLD,
        BATCH_OPERATORS,
        JOB_SHOP_BATCH_THRESHOLD,
      );
      expect(result.useBatch).toBe(true);
      expect(result.operator!.opId).toBe('weld_batch_panel');
    });

    it('no batch for unknown item type', () => {
      const result = adapter.preferBatch(
        'not_a_panel',
        10,
        BATCH_OPERATORS,
        JOB_SHOP_BATCH_THRESHOLD,
      );
      expect(result.useBatch).toBe(false);
    });
  });

  describe('makespan computation', () => {
    it('parallel job makespan is correct', () => {
      const schedule: P03PlannedStepV1[] = [
        { opId: 'weld_frame', startBucket: 0, endBucket: 5, slotId: 'welder_0' },
        { opId: 'weld_panel', startBucket: 0, endBucket: 3, slotId: 'welder_1' },
        { opId: 'turn_shaft', startBucket: 0, endBucket: 4, slotId: 'lathe_0' },
      ];

      expect(adapter.computeMakespan(schedule)).toBe(5);
    });

    it('empty schedule has zero makespan', () => {
      expect(adapter.computeMakespan([])).toBe(0);
    });
  });

  describe('hashing', () => {
    it('same state produces same hash', () => {
      const state1 = canonicalize({
        machines: MACHINES.map((m) => ({ id: m.id, type: m.type, readyAtBucket: m.readyAtBucket })),
        jobs: JOB_OPERATORS.map((o) => o.opId),
      });
      const state2 = canonicalize({
        machines: MACHINES.map((m) => ({ id: m.id, type: m.type, readyAtBucket: m.readyAtBucket })),
        jobs: JOB_OPERATORS.map((o) => o.opId),
      });

      expect(contentHash(state1)).toBe(contentHash(state2));
    });

    it('different machine state produces different hash', () => {
      const hash1 = contentHash(
        canonicalize({ machines: MACHINES }),
      );
      const hash2 = contentHash(
        canonicalize({
          machines: [
            ...MACHINES.slice(0, 2),
            { id: 'lathe_0', type: 'lathe', readyAtBucket: 10 },
          ],
        }),
      );

      expect(hash1).not.toBe(hash2);
    });
  });
});

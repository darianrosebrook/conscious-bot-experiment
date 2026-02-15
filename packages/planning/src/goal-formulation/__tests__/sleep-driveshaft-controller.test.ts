/**
 * SleepDriveshaftController — Unit Tests
 *
 * Verifies time-based trigger, safety gates, night-cycle hysteresis,
 * fail-closed on missing timeOfDay, dryRun contract, and sleep leaf shape.
 *
 * Stage 1 only: placeBed=false (sleep in existing bed, no crafting/placement).
 *
 * Covers: G-6 (sleep has no producer)
 *
 * Run with: npx vitest run packages/planning/src/goal-formulation/__tests__/sleep-driveshaft-controller.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SleepDriveshaftController,
  type SleepDriveshaftConfig,
} from '../sleep-driveshaft-controller';
import { RecordingLifecycleEmitter } from '../reflex-lifecycle-events';
import type { CachedBotState } from '../bot-state-cache';

// ============================================================================
// Helpers
// ============================================================================

/** Night tick (middle of night): 18000 */
const NIGHT_TICK = 18000;
/** Day tick (midday): 6000 */
const DAY_TICK = 6000;
/** Dusk tick (just after nightfall): 12600 */
const DUSK_TICK = 12600;
/** Dawn tick (just after sunrise): 23500 */
const DAWN_TICK = 23500;

function makeBotState(overrides: Partial<CachedBotState> = {}): CachedBotState {
  return {
    position: { x: 100, y: 64, z: 200 },
    health: 20,
    food: 18,
    inventory: [{ name: 'bread', count: 5 }],
    timeOfDay: NIGHT_TICK,
    biome: 'plains',
    nearbyHostiles: 0,
    nearbyPassives: 2,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<SleepDriveshaftConfig> = {}): Partial<SleepDriveshaftConfig> {
  return {
    nightStartTick: 12542,
    nightEndTick: 23460,
    maxHostiles: 0,
    bedSearchRadius: 16,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('SleepDriveshaftController', () => {
  let emitter: RecordingLifecycleEmitter;
  let controller: SleepDriveshaftController;

  beforeEach(() => {
    emitter = new RecordingLifecycleEmitter();
    controller = new SleepDriveshaftController({
      ...makeConfig(),
      emitter,
    });
  });

  // ── Night detection ──

  describe('Night detection', () => {
    it('recognizes night ticks', () => {
      expect(controller.isNight(12542)).toBe(true);  // exactly at dusk
      expect(controller.isNight(18000)).toBe(true);   // midnight
      expect(controller.isNight(23460)).toBe(true);   // exactly at dawn boundary
    });

    it('recognizes day ticks', () => {
      expect(controller.isNight(0)).toBe(false);      // midnight (MC zero)
      expect(controller.isNight(6000)).toBe(false);    // midday
      expect(controller.isNight(12541)).toBe(false);   // just before dusk
      expect(controller.isNight(23461)).toBe(false);   // just after dawn
    });
  });

  // ── Happy path: night + idle + no hostiles → sleep task ──

  describe('Happy path', () => {
    it('night + idle + no hostiles → emits sleep task', async () => {
      const result = await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK, nearbyHostiles: 0 }),
        'no_tasks',
        { dryRun: false },
      );

      expect(result).not.toBeNull();
      expect(result!.goalKey).toBe('survival:sleep');
      expect(result!.builderName).toBe('sleep-driveshaft-controller');
      expect(result!.taskData.title).toBe('Sleep (reflex)');
      expect(result!.taskData.type).toBe('survival');
      expect(result!.taskData.source).toBe('autonomous');
    });

    it('sleep step has correct leaf and Stage 1 args', async () => {
      const result = await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        'no_tasks',
        { dryRun: false },
      );

      const step = result!.taskData.steps[0];
      expect(step.meta.leaf).toBe('sleep');
      expect(step.meta.args.placeBed).toBe(false);
      expect(step.meta.args.searchRadius).toBe(16);
      expect(step.meta.executable).toBe(true);
    });

    it('task has normal priority (preemptable by safety)', async () => {
      const result = await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        'no_tasks',
        { dryRun: false },
      );

      // Priority 40: above exploration (30), below critical hunger
      expect(result!.taskData.priority).toBe(40);
    });
  });

  // ── Fail-closed gates ──

  describe('Fail-closed gates', () => {
    it('timeOfDay undefined → returns null', async () => {
      const result = await controller.evaluate(
        makeBotState({ timeOfDay: undefined }),
        'no_tasks',
        { dryRun: false },
      );
      expect(result).toBeNull();
    });

    it('daytime → returns null', async () => {
      const result = await controller.evaluate(
        makeBotState({ timeOfDay: DAY_TICK }),
        'no_tasks',
        { dryRun: false },
      );
      expect(result).toBeNull();
    });

    it('not idle (active tasks) → returns null', async () => {
      const result = await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        'all_in_backoff',
        { dryRun: false },
      );
      expect(result).toBeNull();
    });

    it('hostiles nearby → returns null', async () => {
      const result = await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK, nearbyHostiles: 1 }),
        'no_tasks',
        { dryRun: false },
      );
      expect(result).toBeNull();
    });

    it('idleReason is null → returns null', async () => {
      const result = await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        null,
        { dryRun: false },
      );
      expect(result).toBeNull();
    });
  });

  // ── Night-cycle hysteresis ──

  describe('Night-cycle hysteresis', () => {
    it('fires once per night cycle', async () => {
      // First fire at night → succeeds
      const result1 = await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        'no_tasks',
        { dryRun: false },
      );
      expect(result1).not.toBeNull();

      // Second fire same night → blocked
      const result2 = await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        'no_tasks',
        { dryRun: false },
      );
      expect(result2).toBeNull();
    });

    it('re-arms after dawn → night cycle', async () => {
      // Night 1: fire
      const result1 = await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        'no_tasks',
        { dryRun: false },
      );
      expect(result1).not.toBeNull();

      // Dawn: reset
      await controller.evaluate(
        makeBotState({ timeOfDay: DAY_TICK }),
        'no_tasks',
        { dryRun: false },
      );

      // Night 2: should fire again
      const result3 = await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        'no_tasks',
        { dryRun: false },
      );
      expect(result3).not.toBeNull();
    });

    it('does not re-arm without seeing dawn', async () => {
      // Night 1: fire
      await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        'no_tasks',
        { dryRun: false },
      );

      // Still night — should not fire
      const result = await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK + 100 }),
        'no_tasks',
        { dryRun: false },
      );
      expect(result).toBeNull();
    });
  });

  // ── DryRun contract ──

  describe('DryRun contract', () => {
    it('dryRun returns result without disarming', async () => {
      const result = await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        'no_tasks',
        { dryRun: true },
      );
      expect(result).not.toBeNull();

      // Should still be armed — dryRun didn't consume the reflex
      expect(controller.isArmed()).toBe(true);
      expect(controller.hasFiredThisNight()).toBe(false);
    });

    it('dryRun followed by live fire both succeed', async () => {
      const dry = await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        'no_tasks',
        { dryRun: true },
      );
      expect(dry).not.toBeNull();

      const live = await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        'no_tasks',
        { dryRun: false },
      );
      expect(live).not.toBeNull();

      // Now disarmed
      expect(controller.isArmed()).toBe(false);
    });
  });

  // ── Lifecycle events ──

  describe('Lifecycle events', () => {
    it('emits goal_formulated and task_planned on live fire', async () => {
      await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        'no_tasks',
        { dryRun: false },
      );

      const events = emitter.events;
      expect(events.some((e) => e.type === 'goal_formulated')).toBe(true);
      expect(events.some((e) => e.type === 'task_planned')).toBe(true);

      const goalEvent = events.find((e) => e.type === 'goal_formulated')!;
      expect(goalEvent.need_type).toBe('survival');
    });

    it('emits goal_formulated but NOT task_planned on dryRun', async () => {
      await controller.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        'no_tasks',
        { dryRun: true },
      );

      const events = emitter.events;
      expect(events.some((e) => e.type === 'goal_formulated')).toBe(true);
      expect(events.some((e) => e.type === 'task_planned')).toBe(false);
    });
  });

  // ── Custom config ──

  describe('Custom config', () => {
    it('respects custom bedSearchRadius', async () => {
      const ctrl = new SleepDriveshaftController({
        ...makeConfig({ bedSearchRadius: 32 }),
        emitter,
      });

      const result = await ctrl.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK }),
        'no_tasks',
        { dryRun: false },
      );

      expect(result!.taskData.steps[0].meta.args.searchRadius).toBe(32);
    });

    it('respects custom maxHostiles', async () => {
      const ctrl = new SleepDriveshaftController({
        ...makeConfig({ maxHostiles: 1 }),
        emitter,
      });

      // 1 hostile with maxHostiles=1 → still fires
      const result = await ctrl.evaluate(
        makeBotState({ timeOfDay: NIGHT_TICK, nearbyHostiles: 1 }),
        'no_tasks',
        { dryRun: false },
      );
      expect(result).not.toBeNull();
    });
  });

  // ── Lifecycle bridge methods ──

  describe('Lifecycle bridge methods', () => {
    it('emitTaskEnqueued emits correct event', () => {
      controller.emitTaskEnqueued('reflex-1', 'task-1', 'survival:sleep');
      expect(emitter.events.some((e) => e.type === 'task_enqueued')).toBe(true);
    });

    it('emitTaskEnqueueSkipped emits correct event', () => {
      controller.emitTaskEnqueueSkipped('reflex-1', 'survival:sleep', 'duplicate');
      expect(emitter.events.some((e) => e.type === 'task_enqueue_skipped')).toBe(true);
    });
  });
});

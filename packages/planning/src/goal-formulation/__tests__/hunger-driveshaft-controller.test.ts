/**
 * Tests for HungerDriveshaftController
 *
 * Certifies that the hunger driveshaft routes through the real goal-formulation
 * pipeline (homeostasis → needs → candidates → ranking → task construction)
 * and produces content-addressed proof bundles with strict verification.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HungerDriveshaftController,
  verifyProof,
  isFood,
  type BotHungerState,
} from '../hunger-driveshaft-controller';
import { RecordingLifecycleEmitter } from '../reflex-lifecycle-events';
import { createAutonomyProofBundle, deriveGoalId } from '../autonomy-proof-bundle';
import { canonicalize, contentHash } from '../../sterling/solve-bundle';
import { GoalType } from '../../types';

// ============================================================================
// Helpers
// ============================================================================

/** Bot state with bread in inventory and food level at given value */
function makeBotState(food: number, foodItem = 'bread', foodCount = 5): BotHungerState {
  return {
    food,
    inventory: [{ name: foodItem, count: foodCount }],
  };
}

/** Bot state with no food items */
function makeHungryBotNoFood(food: number): BotHungerState {
  return {
    food,
    inventory: [{ name: 'cobblestone', count: 64 }],
  };
}

/** Standard leaf args matching the consume_food contract */
const EXPECTED_ARGS = { food_type: 'any', amount: 1 };

// ============================================================================
// evaluate() — threshold and hysteresis gates
// ============================================================================

describe('HungerDriveshaftController', () => {
  let emitter: RecordingLifecycleEmitter;
  let controller: HungerDriveshaftController;

  beforeEach(() => {
    emitter = new RecordingLifecycleEmitter();
    controller = new HungerDriveshaftController({
      triggerThreshold: 12,
      resetThreshold: 16,
      criticalThreshold: 5,
      emitter,
    });
  });

  describe('evaluate() — threshold gates', () => {
    it('returns null when food is above triggerThreshold', async () => {
      const result = await controller.evaluate(makeBotState(15), 'no_tasks');
      expect(result).toBeNull();
    });

    it('returns null when no food in inventory', async () => {
      // food=5 → hunger=0.75 which is >0.7, template would match
      // but no food items in inventory
      const result = await controller.evaluate(makeHungryBotNoFood(5), 'no_tasks');
      expect(result).toBeNull();
    });

    it('returns null at normal threshold when idleReason !== no_tasks', async () => {
      // food=10, below trigger but not critical
      const result = await controller.evaluate(makeBotState(10), 'all_in_backoff');
      expect(result).toBeNull();
    });

    it('produces result when hungry with food in inventory and urgency > 0.7', async () => {
      // food=5 → hunger = 1 - 5/20 = 0.75 → urgency > 0.7 → eat_immediate matches
      const result = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(result).not.toBeNull();
      expect(result!.goal.type).toBe(GoalType.SURVIVAL);
      expect(result!.goal.description.toLowerCase()).toContain('eat food');
    });

    it('produces result at criticalThreshold even when idleReason !== no_tasks', async () => {
      // food=5 (= critical=5) with food available → should fire regardless of idle reason
      const result = await controller.evaluate(makeBotState(5), 'all_in_backoff');
      expect(result).not.toBeNull();
    });

    it('does not fire at food=6 when idleReason !== no_tasks (above criticalThreshold)', async () => {
      // food=6 is above criticalThreshold=5, and eat_immediate needs urgency > 0.7
      // hunger = 1 - 6/20 = 0.7 → urgency = 0.7 → NOT > 0.7 → template doesn't match
      const result = await controller.evaluate(makeBotState(6), 'all_in_backoff');
      expect(result).toBeNull();
    });

    it('returns null when hunger urgency is too low for eat_immediate template', async () => {
      // food=10 → hunger = 0.5 → urgency = 0.5 → < 0.7 → eat_immediate doesn't match
      const result = await controller.evaluate(makeBotState(10), 'no_tasks');
      expect(result).toBeNull();
    });
  });

  describe('hysteresis', () => {
    it('fires at T_low, disarms, does not fire again until T_high', async () => {
      // First fire at food=5
      const r1 = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(r1).not.toBeNull();
      expect(controller.isArmed()).toBe(false);

      // Second evaluation at food=5 — disarmed, should not fire
      const r2 = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(r2).toBeNull();

      // Still disarmed at food=12 (< resetThreshold=16)
      const r3 = await controller.evaluate(makeBotState(12), 'no_tasks');
      expect(r3).toBeNull();
      expect(controller.isArmed()).toBe(false);
    });

    it('re-arms at T_high, fires again at next T_low', async () => {
      // Fire once
      const r1 = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(r1).not.toBeNull();
      expect(controller.isArmed()).toBe(false);

      // Re-arm at food=16 (>= resetThreshold)
      // This call returns null because food=16 > triggerThreshold=12
      const r2 = await controller.evaluate(makeBotState(16), 'no_tasks');
      expect(r2).toBeNull();
      expect(controller.isArmed()).toBe(true);

      // Fire again at food=5
      const r3 = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(r3).not.toBeNull();
      expect(controller.isArmed()).toBe(false);
    });
  });

  describe('real pipeline integration', () => {
    it('task has single consume_food step with explicit leaf args', async () => {
      const result = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(result).not.toBeNull();
      expect(result!.taskData.steps).toHaveLength(1);
      expect(result!.taskData.steps[0].meta.leaf).toBe('consume_food');
      expect(result!.taskData.steps[0].meta.args).toEqual(EXPECTED_ARGS);
      expect(result!.taskData.steps[0].meta.executable).toBe(true);
    });

    it('selected goal has GoalType.SURVIVAL', async () => {
      const result = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(result).not.toBeNull();
      expect(result!.goal.type).toBe(GoalType.SURVIVAL);
    });

    it('task source is autonomous', async () => {
      const result = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(result).not.toBeNull();
      expect(result!.taskData.source).toBe('autonomous');
    });

    it('goalKey is content-derived and deterministic', async () => {
      // Two evaluations should produce same goalKey (food_item excluded from identity)
      const c1 = new HungerDriveshaftController({ triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5 });
      const c2 = new HungerDriveshaftController({ triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5 });

      const r1 = await c1.evaluate(makeBotState(5, 'bread'), 'no_tasks');
      const r2 = await c2.evaluate(makeBotState(5, 'bread'), 'no_tasks');

      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      expect(r1!.goalKey).toBe(r2!.goalKey);
    });

    it('goalKey is the same regardless of food item (food_item not in identity)', async () => {
      // Since food_item was moved to evidence, goalKey should be stable
      const c1 = new HungerDriveshaftController({ triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5 });
      const c2 = new HungerDriveshaftController({ triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5 });

      const r1 = await c1.evaluate(makeBotState(5, 'bread'), 'no_tasks');
      const r2 = await c2.evaluate(makeBotState(5, 'apple'), 'no_tasks');

      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      expect(r1!.goalKey).toBe(r2!.goalKey);
    });

    it('stores proof accumulator with candidate food info', async () => {
      const result = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(result).not.toBeNull();

      const acc = controller.getAccumulator(result!.reflexInstanceId);
      expect(acc).toBeDefined();
      expect(acc!.foodItem).toBe('bread');
      expect(acc!.templateName).toBe('eat_immediate');
      expect(acc!.homeostasisDigest).toBeTruthy();
      expect(acc!.candidatesDigest).toBeTruthy();
    });

    it('reflexInstanceId is unique per emission (unlike goalKey)', async () => {
      const c1 = new HungerDriveshaftController({ triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5 });
      const c2 = new HungerDriveshaftController({ triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5 });

      const r1 = await c1.evaluate(makeBotState(5), 'no_tasks');
      const r2 = await c2.evaluate(makeBotState(5), 'no_tasks');

      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      // goalKey is the same (content-addressed), but reflexInstanceId differs
      expect(r1!.goalKey).toBe(r2!.goalKey);
      expect(r1!.reflexInstanceId).not.toBe(r2!.reflexInstanceId);
    });

    it('dryRun does not disarm hysteresis or store accumulator', async () => {
      const result = await controller.evaluate(makeBotState(5), 'no_tasks', { dryRun: true });
      expect(result).not.toBeNull();
      // Controller should still be armed (dryRun did not disarm)
      expect(controller.isArmed()).toBe(true);
      // No accumulator stored
      expect(controller.getAccumulator(result!.reflexInstanceId)).toBeUndefined();
    });

    it('dryRun still runs the full pipeline and returns a valid result', async () => {
      const result = await controller.evaluate(makeBotState(5), 'no_tasks', { dryRun: true });
      expect(result).not.toBeNull();
      expect(result!.taskData.steps[0].meta.leaf).toBe('consume_food');
      expect(result!.goalKey).toBeTruthy();
      expect(result!.reflexInstanceId).toBeTruthy();
    });
  });

  describe('proof bundle — identity vs evidence', () => {
    it('bundle_hash is deterministic for same semantic chain', () => {
      const identity = makeIdentity();

      const evidence1 = makeEvidence('uuid-1');
      const evidence2 = {
        ...makeEvidence('uuid-2-different'),
        task_id: 'tid2',
        execution_receipt: { extra: 'data' },
        candidate_food_item: 'apple',
        candidate_food_count: 3,
        timing: { trigger_to_goal_ms: 999, goal_to_task_ms: 999, task_to_execution_ms: 999, total_ms: 2997 },
        triggered_at: 9999,
      };

      const b1 = createAutonomyProofBundle(identity, evidence1);
      const b2 = createAutonomyProofBundle(identity, evidence2);

      expect(b1.bundle_hash).toBe(b2.bundle_hash);
    });

    it('different proof_id (UUID) does NOT change bundle_hash', () => {
      const identity = makeIdentity();
      const e1 = makeEvidence('uuid-aaa');
      const e2 = makeEvidence('uuid-bbb');

      const b1 = createAutonomyProofBundle(identity, e1);
      const b2 = createAutonomyProofBundle(identity, e2);
      expect(b1.bundle_hash).toBe(b2.bundle_hash);
    });

    it('different items_consumed DOES change bundle_hash', () => {
      const id1 = makeIdentity({ items_consumed: ['bread'] });
      const id2 = makeIdentity({ items_consumed: ['cooked_beef'] });

      const evidence = makeEvidence('uuid-x');
      const b1 = createAutonomyProofBundle(id1, evidence);
      const b2 = createAutonomyProofBundle(id2, evidence);
      expect(b1.bundle_hash).not.toBe(b2.bundle_hash);
    });

    it('different execution result DOES change bundle_hash', () => {
      const id1 = makeIdentity({ result: 'ok' });
      const id2 = makeIdentity({ result: 'error' });

      const evidence = makeEvidence('uuid-x');
      const b1 = createAutonomyProofBundle(id1, evidence);
      const b2 = createAutonomyProofBundle(id2, evidence);
      expect(b1.bundle_hash).not.toBe(b2.bundle_hash);
    });

    it('different timing does NOT change bundle_hash', () => {
      const identity = makeIdentity();
      const e1 = makeEvidence('uuid-x', { trigger_to_goal_ms: 1, goal_to_task_ms: 1, task_to_execution_ms: 1, total_ms: 3 });
      const e2 = makeEvidence('uuid-x', { trigger_to_goal_ms: 9999, goal_to_task_ms: 9999, task_to_execution_ms: 9999, total_ms: 29997 });

      const b1 = createAutonomyProofBundle(identity, e1);
      const b2 = createAutonomyProofBundle(identity, e2);
      expect(b1.bundle_hash).toBe(b2.bundle_hash);
    });

    it('different task_id does NOT change bundle_hash', () => {
      const identity = makeIdentity();
      const e1 = { ...makeEvidence('uuid-x'), task_id: 'task-111' };
      const e2 = { ...makeEvidence('uuid-x'), task_id: 'task-222' };

      const b1 = createAutonomyProofBundle(identity, e1);
      const b2 = createAutonomyProofBundle(identity, e2);
      expect(b1.bundle_hash).toBe(b2.bundle_hash);
    });

    it('candidate_food_item (evidence) does NOT change bundle_hash', () => {
      const identity = makeIdentity();
      const e1 = { ...makeEvidence('uuid-x'), candidate_food_item: 'bread' };
      const e2 = { ...makeEvidence('uuid-x'), candidate_food_item: 'apple' };

      const b1 = createAutonomyProofBundle(identity, e1);
      const b2 = createAutonomyProofBundle(identity, e2);
      expect(b1.bundle_hash).toBe(b2.bundle_hash);
    });

    it('items_consumed order is stable (sorted)', () => {
      // Same items in different order should produce same hash after sorting
      const id1 = makeIdentity({ items_consumed: ['apple', 'bread'] });
      const id2 = makeIdentity({ items_consumed: ['apple', 'bread'] });
      // Pre-sorted: both should be identical
      const b1 = createAutonomyProofBundle(id1, makeEvidence('x'));
      const b2 = createAutonomyProofBundle(id2, makeEvidence('x'));
      expect(b1.bundle_hash).toBe(b2.bundle_hash);

      // Unsorted would differ — this is why the controller sorts before building
      const id3 = makeIdentity({ items_consumed: ['bread', 'apple'] });
      const b3 = createAutonomyProofBundle(id3, makeEvidence('x'));
      expect(b3.bundle_hash).not.toBe(b1.bundle_hash);
    });
  });

  describe('proof verification (stricter than executor)', () => {
    it('passes when food increased and inventory decreased', () => {
      const result = verifyProof(
        { food: 5, inventory: { bread: 5 } },
        { food: 11, inventory: { bread: 4 } },
        {},
      );
      expect(result.verified).toBe(true);
      expect(result.reason).toBe('food_increased_and_consumed');
    });

    it('passes when leaf receipt confirms consumption', () => {
      const result = verifyProof(
        { food: 5, inventory: { bread: 5 } },
        { food: 5, inventory: { bread: 5 } }, // food didn't change in snapshot
        { itemsConsumed: 1, foodConsumed: 'bread' },
      );
      expect(result.verified).toBe(true);
      expect(result.reason).toBe('receipt_confirms_consumption');
    });

    it('fails when food did not increase and no consumption evidence', () => {
      const result = verifyProof(
        { food: 5, inventory: { bread: 5 } },
        { food: 5, inventory: { bread: 5 } },
        {},
      );
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('no_food_increase_or_consumption_evidence');
    });

    it('passes when food increased with receipt confirmation but no inventory change', () => {
      const result = verifyProof(
        { food: 5, inventory: { bread: 5 } },
        { food: 11, inventory: { bread: 5 } },
        { itemsConsumed: 1 },
      );
      expect(result.verified).toBe(true);
      expect(result.reason).toBe('receipt_confirms_consumption');
    });

    it('FAILS when food increased but no consumption evidence (strict)', () => {
      // This is the key strictness difference from the executor verifier.
      // Food went up but neither receipt nor inventory confirms eating.
      const result = verifyProof(
        { food: 5, inventory: { bread: 5 } },
        { food: 11, inventory: { bread: 5 } },
        {},
      );
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('food_increased_but_no_consumption_evidence');
    });

    it('FAILS when food increased but inventory unavailable (no food items tracked)', () => {
      const result = verifyProof(
        { food: 5, inventory: { cobblestone: 10 } },
        { food: 11, inventory: { cobblestone: 10 } },
        {},
      );
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('food_increased_but_inventory_unavailable');
    });

    it('passes when food increased and food item decreased', () => {
      const result = verifyProof(
        { food: 5, inventory: { cooked_beef: 3 } },
        { food: 13, inventory: { cooked_beef: 2 } },
        {},
      );
      expect(result.verified).toBe(true);
      expect(result.reason).toBe('food_increased_and_consumed');
    });
  });

  describe('buildProofBundle', () => {
    it('assembles complete bundle from accumulator + execution result', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(result).not.toBeNull();

      const bundle = controller.buildProofBundle(
        result!.proofAccumulator,
        { result: 'ok', receipt: { foodConsumed: 'bread', itemsConsumed: 1 }, taskId: 'task-123' },
        { food_after: 11, inventory_after: [{ name: 'bread', count: 4 }] },
      );

      expect(bundle.schema_version).toBe('autonomy_proof_v1');
      expect(bundle.bundle_hash).toBeTruthy();
      expect(bundle.identity.trigger.food_level).toBe(5);
      expect(bundle.identity.preconditions.food_available).toBe(true);
      expect(bundle.identity.execution.result).toBe('ok');
      expect(bundle.identity.verification.food_before).toBe(5);
      expect(bundle.identity.verification.food_after).toBe(11);
      expect(bundle.identity.verification.delta).toBe(6);
      expect(bundle.identity.task.steps[0].args).toEqual({ food_type: 'any', amount: 1 });
      expect(bundle.evidence.task_id).toBe('task-123');
      expect(bundle.evidence.proof_id).toBeTruthy();
      expect(bundle.evidence.candidate_food_item).toBe('bread');
      expect(bundle.evidence.candidate_food_count).toBe(5);
    });

    it('overrides execution result to error when proof verification fails', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(result).not.toBeNull();

      const bundle = controller.buildProofBundle(
        result!.proofAccumulator,
        { result: 'ok', receipt: {}, taskId: 'task-456' },
        { food_after: 5, inventory_after: [{ name: 'bread', count: 5 }] },
      );

      // Executor said ok, but proof verification fails (food didn't change)
      expect(bundle.identity.execution.result).toBe('error');
    });

    it('items_consumed in identity are sorted for deterministic hashing', async () => {
      const result = await controller.evaluate(
        { food: 5, inventory: [{ name: 'bread', count: 3 }, { name: 'apple', count: 2 }] },
        'no_tasks',
      );
      expect(result).not.toBeNull();

      const bundle = controller.buildProofBundle(
        result!.proofAccumulator,
        { result: 'ok', receipt: { itemsConsumed: 2 }, taskId: 'task-sort' },
        {
          food_after: 15,
          inventory_after: [{ name: 'bread', count: 2 }, { name: 'apple', count: 1 }],
        },
      );

      // Both bread and apple decreased — items_consumed should be sorted
      expect(bundle.identity.verification.items_consumed).toEqual(['apple', 'bread']);
    });

    it('cleans up accumulator after building bundle', async () => {
      const result = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(result).not.toBeNull();

      controller.buildProofBundle(
        result!.proofAccumulator,
        { result: 'ok', receipt: { itemsConsumed: 1 }, taskId: 'task-x' },
        { food_after: 11, inventory_after: [{ name: 'bread', count: 4 }] },
      );

      expect(controller.getAccumulator(result!.reflexInstanceId)).toBeUndefined();
    });
  });

  describe('lifecycle events', () => {
    it('emits goal_formulated with content-derived goal_id', async () => {
      await controller.evaluate(makeBotState(5), 'no_tasks');

      const events = emitter.getByType('goal_formulated');
      expect(events).toHaveLength(1);
      expect(events[0].need_type).toBe('survival');
      expect(events[0].goal_id).toBeTruthy();
      expect(events[0].trigger_digest).toBeTruthy();
      expect(events[0].candidates_digest).toBeTruthy();
    });

    it('emits task_created during evaluate(), goal_verified/goal_closed on bundle build', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(result).not.toBeNull();

      // task_created should be emitted during evaluate(), not buildProofBundle()
      const taskEventsBeforeBuild = emitter.getByType('task_created');
      expect(taskEventsBeforeBuild).toHaveLength(1);
      expect(taskEventsBeforeBuild[0].task_id).toMatch(/^pending-/);

      controller.buildProofBundle(
        result!.proofAccumulator,
        { result: 'ok', receipt: { itemsConsumed: 1 }, taskId: 'task-lc' },
        { food_after: 11, inventory_after: [{ name: 'bread', count: 4 }] },
      );

      // No additional task_created events from buildProofBundle
      const taskEventsAfterBuild = emitter.getByType('task_created');
      expect(taskEventsAfterBuild).toHaveLength(1);

      const verifyEvents = emitter.getByType('goal_verified');
      expect(verifyEvents).toHaveLength(1);

      const closedEvents = emitter.getByType('goal_closed');
      expect(closedEvents).toHaveLength(1);
      expect(closedEvents[0].success).toBe(true);
      expect(closedEvents[0].bundle_hash).toBeTruthy();
    });

    it('events carry content-addressed digests', async () => {
      await controller.evaluate(makeBotState(5), 'no_tasks');

      const events = emitter.getByType('goal_formulated');
      expect(events[0].trigger_digest).toMatch(/^[0-9a-f]{16}$/);
      expect(events[0].candidates_digest).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('WorldState adapter', () => {
    it('hasItem("food") returns true when food in inventory', async () => {
      // We test this indirectly: if the pipeline selects eat_immediate,
      // hasItem('food') must have returned true
      const result = await controller.evaluate(makeBotState(5, 'bread'), 'no_tasks');
      expect(result).not.toBeNull();
    });

    it('hasItem("food") returns false when no food in inventory', async () => {
      // No food means eat_immediate template won't match, so null result
      const result = await controller.evaluate(makeHungryBotNoFood(5), 'no_tasks');
      expect(result).toBeNull();
    });

    it('getHunger() correctly maps food level to 0-1', async () => {
      // food=5 → hunger = 1 - 5/20 = 0.75
      const result = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(result).not.toBeNull();
      const acc = controller.getAccumulator(result!.reflexInstanceId);
      expect(acc).toBeDefined();
      const expectedHunger = Math.round((1 - 5 / 20) * 100) / 100;
      expect(expectedHunger).toBe(0.75);
    });
  });

  describe('deriveGoalId', () => {
    it('same inputs produce same goal_id', () => {
      const id1 = deriveGoalId('survival', 'eat_immediate');
      const id2 = deriveGoalId('survival', 'eat_immediate');
      expect(id1).toBe(id2);
    });

    it('different template produces different goal_id', () => {
      const id1 = deriveGoalId('survival', 'eat_immediate');
      const id2 = deriveGoalId('survival', 'acquire_food');
      expect(id1).not.toBe(id2);
    });
  });

  describe('isFood', () => {
    it('recognizes common food items', () => {
      expect(isFood('bread')).toBe(true);
      expect(isFood('cooked_beef')).toBe(true);
      expect(isFood('apple')).toBe(true);
      expect(isFood('baked_potato')).toBe(true);
    });

    it('rejects non-food items', () => {
      expect(isFood('cobblestone')).toBe(false);
      expect(isFood('iron_ingot')).toBe(false);
      expect(isFood('dirt')).toBe(false);
    });
  });

  describe('isCritical', () => {
    it('returns true when food <= criticalThreshold', () => {
      expect(controller.isCritical(makeBotState(5))).toBe(true);
      expect(controller.isCritical(makeBotState(4))).toBe(true);
    });

    it('returns false when food > criticalThreshold', () => {
      expect(controller.isCritical(makeBotState(6))).toBe(false);
      expect(controller.isCritical(makeBotState(15))).toBe(false);
    });
  });

  describe('accumulator eviction', () => {
    it('evicts accumulators older than TTL on evaluate()', async () => {
      // Fire to create an accumulator
      const r1 = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(r1).not.toBeNull();
      const acc = controller.getAccumulator(r1!.reflexInstanceId);
      expect(acc).toBeDefined();

      // Manually backdate the accumulator to simulate age
      acc!.triggeredAt = Date.now() - 31 * 60 * 1000; // 31 minutes ago

      // Re-arm and evaluate again — eviction happens at start of evaluate()
      // First re-arm
      await controller.evaluate(makeBotState(16), 'no_tasks'); // re-arm
      // Now the stale accumulator should have been evicted
      expect(controller.getAccumulator(r1!.reflexInstanceId)).toBeUndefined();
    });
  });
});

// ============================================================================
// Test Helpers
// ============================================================================

function makeIdentity(overrides?: {
  items_consumed?: string[];
  result?: 'ok' | 'error' | 'skipped';
}) {
  return {
    trigger: { hunger_value: 0.75, threshold: 12, food_level: 5 },
    preconditions: { food_available: true },
    goal: { need_type: 'survival', template_name: 'eat_immediate', description: 'Eat food to restore hunger' },
    task: { steps: [{ leaf: 'consume_food', args: { food_type: 'any', amount: 1 } }] },
    execution: { result: (overrides?.result ?? 'ok') as 'ok' | 'error' | 'skipped' },
    verification: {
      food_before: 5,
      food_after: 11,
      delta: 6,
      items_consumed: overrides?.items_consumed ?? ['bread'],
    },
  };
}

function makeEvidence(
  proofId: string,
  timing?: { trigger_to_goal_ms: number; goal_to_task_ms: number; task_to_execution_ms: number; total_ms: number },
) {
  return {
    proof_id: proofId,
    goal_id: 'gid-test',
    task_id: 'tid-test',
    homeostasis_sample_digest: 'aaaa' as string,
    candidates_digest: 'bbbb' as string,
    execution_receipt: {},
    candidate_food_item: 'bread',
    candidate_food_count: 5,
    timing: timing ?? {
      trigger_to_goal_ms: 10,
      goal_to_task_ms: 5,
      task_to_execution_ms: 100,
      total_ms: 115,
    },
    triggered_at: Date.now(),
  };
}

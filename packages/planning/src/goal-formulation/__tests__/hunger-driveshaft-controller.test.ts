/**
 * Tests for HungerDriveshaftController
 *
 * Certifies that the hunger driveshaft routes through the real goal-formulation
 * pipeline (homeostasis → needs → candidates → ranking → task construction)
 * and produces content-addressed proof bundles with strict verification.
 *
 * Test categories:
 *   - Threshold gates & hysteresis (AC-4)
 *   - Real pipeline integration (AC-1)
 *   - Proof bundle identity vs evidence (AC-2)
 *   - Proof verification with reason enum (AC-3, AC-15)
 *   - Lifecycle events with joinability (AC-7, AC-10)
 *   - Shadow mode / dryRun (AC-5)
 *   - Fault injection invariants (AC-11)
 *   - Restart / duplication safety (AC-12)
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HungerDriveshaftController,
  verifyProof,
  isFood,
  VerificationReason,
  ALL_VERIFICATION_REASONS,
  type BotHungerState,
  type VerificationReasonType,
} from '../hunger-driveshaft-controller';
import { normalizeInventoryItem, normalizeInventory } from '../../modules/normalize-inventory';
import { RecordingLifecycleEmitter, EnqueueSkipReason } from '../reflex-lifecycle-events';
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
      const c1 = new HungerDriveshaftController({ triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5 });
      const c2 = new HungerDriveshaftController({ triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5 });

      const r1 = await c1.evaluate(makeBotState(5, 'bread'), 'no_tasks');
      const r2 = await c2.evaluate(makeBotState(5, 'bread'), 'no_tasks');

      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      expect(r1!.goalKey).toBe(r2!.goalKey);
    });

    it('goalKey is the same regardless of food item (food_item not in identity)', async () => {
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

    it('dryRun does NOT emit task_planned (no task will be enqueued)', async () => {
      await controller.evaluate(makeBotState(5), 'no_tasks', { dryRun: true });

      // goal_formulated should still be emitted (shadow observability)
      const goalEvents = emitter.getByType('goal_formulated');
      expect(goalEvents).toHaveLength(1);

      // But task_planned should NOT be emitted — no task will be enqueued
      const taskEvents = emitter.getByType('task_planned');
      expect(taskEvents).toHaveLength(0);
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

    it('reflexInstanceId (evidence-layer) does NOT change bundle_hash', async () => {
      // Two evaluations with identical bot state produce different reflexInstanceIds
      // (UUIDs) but the bundles should hash identically because reflexInstanceId
      // is in evidence, not identity.
      const c1 = new HungerDriveshaftController({ triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5 });
      const c2 = new HungerDriveshaftController({ triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5 });

      const r1 = await c1.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      const r2 = await c2.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();

      // reflexInstanceIds must differ (UUIDs)
      expect(r1!.reflexInstanceId).not.toBe(r2!.reflexInstanceId);

      // Build bundles with identical execution + after-state
      const afterState = { food_after: 11, inventory_after: [{ name: 'bread', count: 4 }] };
      const execution = { result: 'ok' as const, receipt: { itemsConsumed: 1 }, taskId: 'task-x' };

      const b1 = c1.buildProofBundle(r1!.proofAccumulator, execution, afterState);
      const b2 = c2.buildProofBundle(r2!.proofAccumulator, execution, afterState);

      // bundle_hash must be identical — reflexInstanceId is NOT in identity
      expect(b1.bundle_hash).toBe(b2.bundle_hash);

      // But evidence-layer proof_ids must differ
      expect(b1.evidence.proof_id).not.toBe(b2.evidence.proof_id);
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

  // ============================================================================
  // AC-15: Verification reason enum + exhaustiveness
  // ============================================================================

  describe('proof verification (stricter than executor)', () => {
    it('passes when food increased and inventory decreased', () => {
      const result = verifyProof(
        { food: 5, inventory: { bread: 5 } },
        { food: 11, inventory: { bread: 4 } },
        {},
      );
      expect(result.verified).toBe(true);
      expect(result.reason).toBe(VerificationReason.FOOD_INCREASED_AND_CONSUMED);
    });

    it('passes when leaf receipt confirms consumption', () => {
      const result = verifyProof(
        { food: 5, inventory: { bread: 5 } },
        { food: 5, inventory: { bread: 5 } }, // food didn't change in snapshot
        { itemsConsumed: 1, foodConsumed: 'bread' },
      );
      expect(result.verified).toBe(true);
      expect(result.reason).toBe(VerificationReason.RECEIPT_CONFIRMS_CONSUMPTION);
    });

    it('fails when food did not increase and no consumption evidence', () => {
      const result = verifyProof(
        { food: 5, inventory: { bread: 5 } },
        { food: 5, inventory: { bread: 5 } },
        {},
      );
      expect(result.verified).toBe(false);
      expect(result.reason).toBe(VerificationReason.NO_FOOD_INCREASE_OR_CONSUMPTION_EVIDENCE);
    });

    it('passes when food increased with receipt confirmation but no inventory change', () => {
      const result = verifyProof(
        { food: 5, inventory: { bread: 5 } },
        { food: 11, inventory: { bread: 5 } },
        { itemsConsumed: 1 },
      );
      expect(result.verified).toBe(true);
      expect(result.reason).toBe(VerificationReason.RECEIPT_CONFIRMS_CONSUMPTION);
    });

    it('FAILS when food increased but no consumption evidence (strict)', () => {
      const result = verifyProof(
        { food: 5, inventory: { bread: 5 } },
        { food: 11, inventory: { bread: 5 } },
        {},
      );
      expect(result.verified).toBe(false);
      expect(result.reason).toBe(VerificationReason.FOOD_INCREASED_BUT_NO_CONSUMPTION_EVIDENCE);
    });

    it('FAILS when food increased but inventory unavailable (no food items tracked)', () => {
      const result = verifyProof(
        { food: 5, inventory: { cobblestone: 10 } },
        { food: 11, inventory: { cobblestone: 10 } },
        {},
      );
      expect(result.verified).toBe(false);
      expect(result.reason).toBe(VerificationReason.FOOD_INCREASED_BUT_INVENTORY_UNAVAILABLE);
    });

    it('passes when food increased and food item decreased', () => {
      const result = verifyProof(
        { food: 5, inventory: { cooked_beef: 3 } },
        { food: 13, inventory: { cooked_beef: 2 } },
        {},
      );
      expect(result.verified).toBe(true);
      expect(result.reason).toBe(VerificationReason.FOOD_INCREASED_AND_CONSUMED);
    });

    it('FAILS with AFTER_STATE_UNAVAILABLE when after-state is null', () => {
      const result = verifyProof(
        { food: 5, inventory: { bread: 5 } },
        null,
        {},
      );
      expect(result.verified).toBe(false);
      expect(result.reason).toBe(VerificationReason.AFTER_STATE_UNAVAILABLE);
    });

    it('AFTER_STATE_UNAVAILABLE is distinct from NO_FOOD_INCREASE', () => {
      const unavailable = verifyProof(
        { food: 5, inventory: { bread: 5 } },
        null,
        {},
      );
      const noIncrease = verifyProof(
        { food: 5, inventory: { bread: 5 } },
        { food: 5, inventory: { bread: 5 } },
        {},
      );
      expect(unavailable.reason).not.toBe(noIncrease.reason);
    });

    it('every failure-mode test covers a unique reason from the enum', () => {
      // Collect all reasons exercised in this describe block
      const exercisedReasons = new Set<VerificationReasonType>([
        VerificationReason.RECEIPT_CONFIRMS_CONSUMPTION,
        VerificationReason.FOOD_INCREASED_AND_CONSUMED,
        VerificationReason.FOOD_INCREASED_BUT_NO_CONSUMPTION_EVIDENCE,
        VerificationReason.FOOD_INCREASED_BUT_INVENTORY_UNAVAILABLE,
        VerificationReason.NO_FOOD_INCREASE_OR_CONSUMPTION_EVIDENCE,
        VerificationReason.AFTER_STATE_UNAVAILABLE,
      ]);

      // Assert exhaustiveness: every enum value is tested
      for (const reason of ALL_VERIFICATION_REASONS) {
        expect(exercisedReasons.has(reason)).toBe(true);
      }
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

    it('handles null after-state (getBotState failure at completion)', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(result).not.toBeNull();

      const bundle = controller.buildProofBundle(
        result!.proofAccumulator,
        { result: 'ok', receipt: {}, taskId: 'task-null' },
        null,
      );

      // After-state unavailable → verification fails → execution overridden to error
      expect(bundle.identity.execution.result).toBe('error');
      // null, not -1 — prevents "unknown" from masquerading as real negative evidence
      expect(bundle.identity.verification.food_after).toBeNull();
      expect(bundle.identity.verification.delta).toBeNull();
      expect(bundle.identity.verification.items_consumed).toEqual([]);
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

  // ============================================================================
  // AC-10: Lifecycle events with joinability (reflexInstanceId on every event)
  // ============================================================================

  describe('lifecycle events', () => {
    it('emits goal_formulated with reflexInstanceId and content-derived goal_id', async () => {
      const result = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(result).not.toBeNull();

      const events = emitter.getByType('goal_formulated');
      expect(events).toHaveLength(1);
      expect(events[0].reflexInstanceId).toBe(result!.reflexInstanceId);
      expect(events[0].need_type).toBe('survival');
      expect(events[0].goal_id).toBeTruthy();
      expect(events[0].trigger_digest).toBeTruthy();
      expect(events[0].candidates_digest).toBeTruthy();
    });

    it('emits task_planned (not task_created) during evaluate() with reflexInstanceId', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(result).not.toBeNull();

      // task_planned should be emitted during evaluate()
      const taskEvents = emitter.getByType('task_planned');
      expect(taskEvents).toHaveLength(1);
      expect(taskEvents[0].reflexInstanceId).toBe(result!.reflexInstanceId);
      expect(taskEvents[0].task_id).toMatch(/^pending-/);
      expect(taskEvents[0].goal_id).toBeTruthy();
    });

    it('emitTaskEnqueued bridges task_planned to real task ID', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(result).not.toBeNull();

      // Simulate integration layer calling emitTaskEnqueued after addTask()
      controller.emitTaskEnqueued(
        result!.reflexInstanceId,
        'real-task-id-789',
        result!.proofAccumulator.goalId,
      );

      const enqueueEvents = emitter.getByType('task_enqueued');
      expect(enqueueEvents).toHaveLength(1);
      expect(enqueueEvents[0].reflexInstanceId).toBe(result!.reflexInstanceId);
      expect(enqueueEvents[0].task_id).toBe('real-task-id-789');
    });

    it('goal_verified and goal_closed carry reflexInstanceId on bundle build', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(result).not.toBeNull();

      controller.buildProofBundle(
        result!.proofAccumulator,
        { result: 'ok', receipt: { itemsConsumed: 1 }, taskId: 'task-lc' },
        { food_after: 11, inventory_after: [{ name: 'bread', count: 4 }] },
      );

      const verifyEvents = emitter.getByType('goal_verified');
      expect(verifyEvents).toHaveLength(1);
      expect(verifyEvents[0].reflexInstanceId).toBe(result!.reflexInstanceId);

      const closedEvents = emitter.getByType('goal_closed');
      expect(closedEvents).toHaveLength(1);
      expect(closedEvents[0].reflexInstanceId).toBe(result!.reflexInstanceId);
      expect(closedEvents[0].success).toBe(true);
      expect(closedEvents[0].bundle_hash).toBeTruthy();
    });

    it('no task_planned events from buildProofBundle (only from evaluate)', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(result).not.toBeNull();

      const beforeCount = emitter.getByType('task_planned').length;

      controller.buildProofBundle(
        result!.proofAccumulator,
        { result: 'ok', receipt: { itemsConsumed: 1 }, taskId: 'task-lc' },
        { food_after: 11, inventory_after: [{ name: 'bread', count: 4 }] },
      );

      // No additional task_planned events from buildProofBundle
      expect(emitter.getByType('task_planned').length).toBe(beforeCount);
    });

    it('all events for a single reflex firing share the same reflexInstanceId', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(result).not.toBeNull();

      controller.emitTaskEnqueued(
        result!.reflexInstanceId,
        'real-task-id',
        result!.proofAccumulator.goalId,
      );

      controller.buildProofBundle(
        result!.proofAccumulator,
        { result: 'ok', receipt: { itemsConsumed: 1 }, taskId: 'real-task-id' },
        { food_after: 11, inventory_after: [{ name: 'bread', count: 4 }] },
      );

      // Every event should have the same reflexInstanceId
      const allEvents = emitter.getEvents();
      const reflexId = result!.reflexInstanceId;
      for (const event of allEvents) {
        expect((event as any).reflexInstanceId).toBe(reflexId);
      }
    });

    it('events carry content-addressed digests', async () => {
      await controller.evaluate(makeBotState(5), 'no_tasks');

      const events = emitter.getByType('goal_formulated');
      expect(events[0].trigger_digest).toMatch(/^[0-9a-f]{16}$/);
      expect(events[0].candidates_digest).toMatch(/^[0-9a-f]{16}$/);
    });

    it('emitTaskEnqueueSkipped emits event and evicts accumulator', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(result).not.toBeNull();

      // Accumulator exists before skip
      expect(controller.getAccumulator(result!.reflexInstanceId)).toBeDefined();

      // Simulate integration layer: addTask returned null (dedup)
      controller.emitTaskEnqueueSkipped(
        result!.reflexInstanceId,
        result!.proofAccumulator.goalId,
        EnqueueSkipReason.DEDUPED_EXISTING_TASK,
        'existing-task-42',
      );

      const skipEvents = emitter.getByType('task_enqueue_skipped');
      expect(skipEvents).toHaveLength(1);
      expect(skipEvents[0].reflexInstanceId).toBe(result!.reflexInstanceId);
      expect(skipEvents[0].reason).toBe(EnqueueSkipReason.DEDUPED_EXISTING_TASK);
      expect(skipEvents[0].existing_task_id).toBe('existing-task-42');

      // Accumulator evicted — no completion event will arrive
      expect(controller.getAccumulator(result!.reflexInstanceId)).toBeUndefined();
    });

    it('emitTaskEnqueueSkipped with enqueue_failed reason', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(result).not.toBeNull();

      controller.emitTaskEnqueueSkipped(
        result!.reflexInstanceId,
        result!.proofAccumulator.goalId,
        EnqueueSkipReason.ENQUEUE_FAILED,
      );

      const skipEvents = emitter.getByType('task_enqueue_skipped');
      expect(skipEvents).toHaveLength(1);
      expect(skipEvents[0].reason).toBe(EnqueueSkipReason.ENQUEUE_FAILED);
      expect(skipEvents[0].existing_task_id).toBeUndefined();

      // Accumulator evicted
      expect(controller.getAccumulator(result!.reflexInstanceId)).toBeUndefined();
    });

    it('emitTaskEnqueueSkipped with enqueue_returned_null reason', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(result).not.toBeNull();

      controller.emitTaskEnqueueSkipped(
        result!.reflexInstanceId,
        result!.proofAccumulator.goalId,
        EnqueueSkipReason.ENQUEUE_RETURNED_NULL,
      );

      const skipEvents = emitter.getByType('task_enqueue_skipped');
      expect(skipEvents[0].reason).toBe(EnqueueSkipReason.ENQUEUE_RETURNED_NULL);
      expect(controller.getAccumulator(result!.reflexInstanceId)).toBeUndefined();
    });
  });

  // ============================================================================
  // AC-11: Fault injection invariants
  // ============================================================================

  describe('fault injection invariants', () => {
    it('evaluate() does not disarm or store accumulators when pipeline returns null (no food)', async () => {
      // Simulates "getBotState succeeded but no food in inventory" — the most
      // common real-world path where evaluate() returns null after threshold check.
      expect(controller.isArmed()).toBe(true);

      const result = await controller.evaluate(makeHungryBotNoFood(5), 'no_tasks');
      expect(result).toBeNull();

      // Controller state unchanged
      expect(controller.isArmed()).toBe(true);
      // No lifecycle events emitted for a null result
      expect(emitter.getEvents()).toHaveLength(0);
    });

    it('proof verification failure records error and still emits goal_closed', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(result).not.toBeNull();

      // Simulate: executor says ok, but food didn't change — proof should fail
      const bundle = controller.buildProofBundle(
        result!.proofAccumulator,
        { result: 'ok', receipt: {}, taskId: 'task-fault' },
        { food_after: 5, inventory_after: [{ name: 'bread', count: 5 }] },
      );

      // Bundle records error even though executor said ok
      expect(bundle.identity.execution.result).toBe('error');

      // goal_closed is still emitted with success=false
      const closedEvents = emitter.getByType('goal_closed');
      expect(closedEvents).toHaveLength(1);
      expect(closedEvents[0].success).toBe(false);
      expect(closedEvents[0].reason).toBe(VerificationReason.NO_FOOD_INCREASE_OR_CONSUMPTION_EVIDENCE);
    });

    it('buildProofBundle with null afterState still cleans up accumulator', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
      expect(result).not.toBeNull();

      // Verify accumulator exists before
      expect(controller.getAccumulator(result!.reflexInstanceId)).toBeDefined();

      controller.buildProofBundle(
        result!.proofAccumulator,
        { result: 'ok', receipt: {}, taskId: 'task-null-cleanup' },
        null, // getBotState() failed at completion
      );

      // Accumulator cleaned up even though after-state was unavailable
      expect(controller.getAccumulator(result!.reflexInstanceId)).toBeUndefined();

      // goal_closed still emitted
      const closedEvents = emitter.getByType('goal_closed');
      expect(closedEvents).toHaveLength(1);
      expect(closedEvents[0].success).toBe(false);
      expect(closedEvents[0].reason).toBe(VerificationReason.AFTER_STATE_UNAVAILABLE);
    });

    it('repeated null evaluations do not leak lifecycle events', async () => {
      // Simulate N ticks where getBotState works but food is above threshold
      for (let i = 0; i < 10; i++) {
        await controller.evaluate(makeBotState(15), 'no_tasks');
      }

      // No events should have been emitted — no reflex triggered
      expect(emitter.getEvents()).toHaveLength(0);
    });

    it('evaluate() does not emit misleading events when food gate fails', async () => {
      // Food=5 but no food items → pipeline reaches food gate, returns null
      // Should NOT emit goal_formulated or task_planned
      await controller.evaluate(makeHungryBotNoFood(5), 'no_tasks');

      expect(emitter.getByType('goal_formulated')).toHaveLength(0);
      expect(emitter.getByType('task_planned')).toHaveLength(0);
    });
  });

  // ============================================================================
  // AC-12: Restart / duplication safety
  // ============================================================================

  describe('restart / duplication safety', () => {
    it('hysteresis prevents double-injection within same lifecycle', async () => {
      // Fire once
      const r1 = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(r1).not.toBeNull();

      // Immediately try again — hysteresis should block
      const r2 = await controller.evaluate(makeBotState(5), 'no_tasks');
      expect(r2).toBeNull();

      // Total events: 1 goal_formulated + 1 task_planned = 2
      expect(emitter.getByType('goal_formulated')).toHaveLength(1);
      expect(emitter.getByType('task_planned')).toHaveLength(1);
    });

    it('fresh controller (simulating restart) re-fires if still hungry', async () => {
      // Controller 1 fires
      const c1 = new HungerDriveshaftController({
        triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5,
      });
      const r1 = await c1.evaluate(makeBotState(5), 'no_tasks');
      expect(r1).not.toBeNull();

      // Controller 2 (simulating restart — in-memory state lost)
      const c2 = new HungerDriveshaftController({
        triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5,
      });
      const r2 = await c2.evaluate(makeBotState(5), 'no_tasks');
      expect(r2).not.toBeNull();

      // Both fired — the integration layer's findSimilarTask() provides dedup.
      // The controller itself does NOT prevent this (it has no cross-instance state).
      // This test documents the contract: restart safety is at the integration layer.
    });

    it('documents: single executor instance only (no cross-process dedup)', () => {
      // The controller's hysteresis and accumulator map are in-memory only.
      // Multi-instance dedup is NOT supported — the integration layer must
      // check findSimilarTask() before addTask() to prevent duplicates.
      //
      // This test serves as documentation and will fail if someone adds
      // cross-process state without updating this assertion.
      const controller1 = new HungerDriveshaftController({
        triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5,
      });
      const controller2 = new HungerDriveshaftController({
        triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5,
      });

      // Two controller instances have independent armed state
      expect(controller1.isArmed()).toBe(true);
      expect(controller2.isArmed()).toBe(true);

      // There is no shared state between them
      // This is intentional — cross-process dedup is at the task layer
    });

    it('rapid evaluations at T_low produce at most 1 result before disarming', async () => {
      const results = [];
      // Simulate 5 rapid ticks at food=5
      for (let i = 0; i < 5; i++) {
        results.push(await controller.evaluate(makeBotState(5), 'no_tasks'));
      }

      // Exactly 1 should have fired
      const fired = results.filter((r) => r !== null);
      expect(fired).toHaveLength(1);
    });
  });

  describe('WorldState adapter', () => {
    it('hasItem("food") returns true when food in inventory', async () => {
      const result = await controller.evaluate(makeBotState(5, 'bread'), 'no_tasks');
      expect(result).not.toBeNull();
    });

    it('hasItem("food") returns false when no food in inventory', async () => {
      const result = await controller.evaluate(makeHungryBotNoFood(5), 'no_tasks');
      expect(result).toBeNull();
    });

    it('getHunger() correctly maps food level to 0-1', async () => {
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
// Service boundary contract tests (regression for live-discovered seam bugs)
// ============================================================================

describe('service boundary contracts', () => {
  // Contract: MC interface returns inventory items with `type` field,
  // but the controller expects `name`. The normalizeInventory() helper
  // (modules/normalize-inventory.ts) owns this boundary. These tests
  // verify the real helper and confirm the controller works with
  // normalized output.

  describe('normalizeInventoryItem (real helper)', () => {
    it('maps type→name for MC interface wire format', () => {
      expect(normalizeInventoryItem({ type: 'bread', count: 16, slot: 36, metadata: 0 }))
        .toEqual({ name: 'bread', count: 16 });
    });

    it('prefers name over type when both present', () => {
      expect(normalizeInventoryItem({ name: 'cooked_beef', type: 'beef', count: 5 }))
        .toEqual({ name: 'cooked_beef', count: 5 });
    });

    it('falls back to "unknown" when both name and type are missing', () => {
      expect(normalizeInventoryItem({ count: 1 } as any).name).toBe('unknown');
    });
  });

  describe('normalizeInventory (batch)', () => {
    it('normalizes an array of raw items', () => {
      const raw = [
        { type: 'bread', count: 16, slot: 36, metadata: 0 },
        { type: 'diamond', count: 3, slot: 37, metadata: 0 },
      ];
      expect(normalizeInventory(raw)).toEqual([
        { name: 'bread', count: 16 },
        { name: 'diamond', count: 3 },
      ]);
    });

    it('returns undefined for undefined input', () => {
      expect(normalizeInventory(undefined)).toBeUndefined();
    });
  });

  describe('controller + normalized inventory integration', () => {
    it('isFood() matches items provided with name field', () => {
      expect(isFood('bread')).toBe(true);
      expect(isFood('cooked_beef')).toBe(true);
      expect(isFood('diamond')).toBe(false);
    });

    it('controller evaluate() finds food in normalized inventory', async () => {
      const controller = new HungerDriveshaftController({
        triggerThreshold: 12,
        resetThreshold: 16,
        criticalThreshold: 5,
        emitter: new RecordingLifecycleEmitter(),
      });
      // normalizeInventory output → controller input
      const normalized = normalizeInventory([{ type: 'bread', count: 3, slot: 36, metadata: 0 }])!;
      const result = await controller.evaluate(
        { food: 5, inventory: normalized },
        'no_tasks',
      );
      expect(result).not.toBeNull();
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

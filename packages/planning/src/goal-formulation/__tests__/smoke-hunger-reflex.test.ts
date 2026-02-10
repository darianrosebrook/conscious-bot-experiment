/**
 * Smoke test: Hunger Driveshaft → Proof Bundle → Golden-Run Artifact
 *
 * Exercises the full hunger reflex pipeline end-to-end without a live
 * Minecraft server or executor loop. Uses the same pattern as the existing
 * loop-closure integration test (sterling-step-executor.test.ts):
 *
 *   1. Real HungerDriveshaftController (real pipeline, not mocked)
 *   2. Real GoldenRunRecorder (writes committed artifact)
 *   3. Real tryEnqueueReflexTask (discriminated result)
 *   4. Real proof verification + bundle construction
 *
 * Scenarios tested:
 *   S1: Full success — hungry bot with food → task injected → food consumed → proof passes
 *   S2: Verification failure — task completed but food didn't change → proof fails
 *   S3: After-state unavailable — getBotState fails at completion → null handling
 *   S4: Enqueue failure — addTask throws → skip event, no proof
 *   S5: Shadow mode — dryRun evaluates but no artifact produced
 *   S6: Artifact schema — golden-run artifact has correct reflex_proof shape
 *
 * Artifact: artifacts/golden-run-test-hunger-reflex/golden-hunger-reflex-*.json
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HungerDriveshaftController,
  VerificationReason,
  type BotHungerState,
} from '../hunger-driveshaft-controller';
import { RecordingLifecycleEmitter, EnqueueSkipReason } from '../reflex-lifecycle-events';
import { tryEnqueueReflexTask } from '../reflex-enqueue';
import { GoldenRunRecorder } from '../../golden-run-recorder';

// ============================================================================
// Test infrastructure
// ============================================================================

const ARTIFACT_DIR = 'artifacts/golden-run-test-hunger-reflex';

function makeBotState(food: number, foodItem = 'bread', foodCount = 5): BotHungerState {
  return {
    food,
    inventory: [{ name: foodItem, count: foodCount }],
  };
}

/** Simulate addTask returning a task with an ID */
function mockAddTaskSuccess(taskId: string) {
  return async (data: Record<string, unknown>) => ({
    id: taskId,
    ...data,
    status: 'pending',
  });
}

/** Simulate addTask throwing */
function mockAddTaskThrows(error: Error) {
  return async () => { throw error; };
}

/** Simulate addTask returning null (dedup or internal failure) */
function mockAddTaskNull() {
  return async () => null;
}

// ============================================================================
// Smoke scenarios
// ============================================================================

describe('smoke: hunger driveshaft → proof bundle → golden-run artifact', () => {
  let emitter: RecordingLifecycleEmitter;
  let controller: HungerDriveshaftController;
  let recorder: GoldenRunRecorder;

  beforeEach(() => {
    emitter = new RecordingLifecycleEmitter();
    controller = new HungerDriveshaftController({
      triggerThreshold: 12,
      resetThreshold: 16,
      criticalThreshold: 5,
      emitter,
    });
    recorder = new GoldenRunRecorder(ARTIFACT_DIR);
  });

  // --------------------------------------------------------------------------
  // S1: Full success — the golden path
  // --------------------------------------------------------------------------

  it('S1: hungry bot → reflex fires → task enqueued → food consumed → proof passes → artifact written', async () => {
    const runId = 'hunger-reflex-success';

    // 1. Evaluate: food=5, bread in inventory → reflex fires
    const reflexResult = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
    expect(reflexResult).not.toBeNull();
    expect(reflexResult!.goal.description.toLowerCase()).toContain('eat food');

    // 2. Enqueue via helper (structural mutual exclusion)
    const enqueueResult = await tryEnqueueReflexTask(
      mockAddTaskSuccess('task-smoke-1'),
      reflexResult!,
    );
    expect(enqueueResult.kind).toBe('enqueued');

    // 3. Emit task_enqueued (as integration layer would)
    if (enqueueResult.kind === 'enqueued') {
      controller.emitTaskEnqueued(
        reflexResult!.reflexInstanceId,
        enqueueResult.taskId,
        reflexResult!.proofAccumulator.goalId,
      );
    }

    // 4. Simulate task completion: food went from 5 → 11, bread from 5 → 4
    const bundle = controller.buildProofBundle(
      reflexResult!.proofAccumulator,
      { result: 'ok', receipt: { itemsConsumed: 1, foodConsumed: 'bread' }, taskId: 'task-smoke-1' },
      { food_after: 11, inventory_after: [{ name: 'bread', count: 4 }] },
    );

    // 5. Record to golden run
    recorder.recordReflexProof(runId, bundle);

    // ---- Assertions ----

    // Bundle identity
    expect(bundle.schema_version).toBe('autonomy_proof_v1');
    expect(bundle.bundle_hash).toBeTruthy();
    expect(bundle.identity.execution.result).toBe('ok');
    expect(bundle.identity.verification.food_before).toBe(5);
    expect(bundle.identity.verification.food_after).toBe(11);
    expect(bundle.identity.verification.delta).toBe(6);
    expect(bundle.identity.verification.items_consumed).toEqual(['bread']);

    // Bundle evidence
    expect(bundle.evidence.task_id).toBe('task-smoke-1');
    expect(bundle.evidence.candidate_food_item).toBe('bread');
    expect(bundle.evidence.timing.total_ms).toBeGreaterThanOrEqual(0);

    // Golden-run artifact
    const report = recorder.getReport(runId);
    expect(report).not.toBeNull();
    expect(report!.execution?.reflex_proof).toBeDefined();
    expect(report!.execution!.reflex_proof!.schema_version).toBe('autonomy_proof_v1');
    expect(report!.execution!.reflex_proof!.bundle_hash).toBe(bundle.bundle_hash);

    // Lifecycle events (complete chain)
    const events = emitter.getEvents();
    const types = events.map((e) => e.type);
    expect(types).toContain('goal_formulated');
    expect(types).toContain('task_planned');
    expect(types).toContain('task_enqueued');
    expect(types).toContain('goal_verified');
    expect(types).toContain('goal_closed');

    // All events share reflexInstanceId
    for (const event of events) {
      expect((event as any).reflexInstanceId).toBe(reflexResult!.reflexInstanceId);
    }

    // goal_closed reports success
    const closedEvent = emitter.getByType('goal_closed')[0];
    expect(closedEvent.success).toBe(true);
  });

  // --------------------------------------------------------------------------
  // S2: Verification failure — executor said ok, proof says no
  // --------------------------------------------------------------------------

  it('S2: task completed but food unchanged → proof overrides to error', async () => {
    const runId = 'hunger-reflex-verify-fail';

    const reflexResult = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
    expect(reflexResult).not.toBeNull();

    // Simulate: executor completed successfully, but food didn't change (phantom eat)
    const bundle = controller.buildProofBundle(
      reflexResult!.proofAccumulator,
      { result: 'ok', receipt: {}, taskId: 'task-smoke-2' },
      { food_after: 5, inventory_after: [{ name: 'bread', count: 5 }] },
    );

    recorder.recordReflexProof(runId, bundle);

    // Proof verification overrides executor result
    expect(bundle.identity.execution.result).toBe('error');
    expect(bundle.identity.verification.delta).toBe(0);

    // goal_closed reports failure with specific reason
    const closedEvent = emitter.getByType('goal_closed')[0];
    expect(closedEvent.success).toBe(false);
    expect(closedEvent.reason).toBe(VerificationReason.NO_FOOD_INCREASE_OR_CONSUMPTION_EVIDENCE);

    // Artifact records the failure
    const report = recorder.getReport(runId);
    expect(report!.execution!.reflex_proof!.identity.execution.result).toBe('error');
  });

  // --------------------------------------------------------------------------
  // S3: After-state unavailable — getBotState fails at completion
  // --------------------------------------------------------------------------

  it('S3: null after-state → proof uses null semantics, not sentinel -1', async () => {
    const runId = 'hunger-reflex-null-after';

    const reflexResult = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
    expect(reflexResult).not.toBeNull();

    // Simulate: getBotState() failed at completion time
    const bundle = controller.buildProofBundle(
      reflexResult!.proofAccumulator,
      { result: 'ok', receipt: {}, taskId: 'task-smoke-3' },
      null, // afterState unavailable
    );

    recorder.recordReflexProof(runId, bundle);

    // Null semantics — not sentinel -1
    expect(bundle.identity.verification.food_after).toBeNull();
    expect(bundle.identity.verification.delta).toBeNull();
    expect(bundle.identity.execution.result).toBe('error');

    // Distinct reason
    const closedEvent = emitter.getByType('goal_closed')[0];
    expect(closedEvent.reason).toBe(VerificationReason.AFTER_STATE_UNAVAILABLE);

    // Artifact persists null, not -1
    const report = recorder.getReport(runId);
    expect(report!.execution!.reflex_proof!.identity.verification.food_after).toBeNull();
    expect(report!.execution!.reflex_proof!.identity.verification.delta).toBeNull();
  });

  // --------------------------------------------------------------------------
  // S4: Enqueue failure — addTask throws → skip event, no proof
  // --------------------------------------------------------------------------

  it('S4: addTask throws → enqueue_failed skip, accumulator evicted, no proof bundle', async () => {
    const reflexResult = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
    expect(reflexResult).not.toBeNull();

    // Attempt enqueue — addTask throws
    const enqueueResult = await tryEnqueueReflexTask(
      mockAddTaskThrows(new Error('connection refused')),
      reflexResult!,
    );
    expect(enqueueResult.kind).toBe('skipped');
    if (enqueueResult.kind === 'skipped') {
      expect(enqueueResult.reason).toBe(EnqueueSkipReason.ENQUEUE_FAILED);
      expect(enqueueResult.error).toBeInstanceOf(Error);
    }

    // Emit skip (as integration layer would)
    controller.emitTaskEnqueueSkipped(
      reflexResult!.reflexInstanceId,
      reflexResult!.proofAccumulator.goalId,
      EnqueueSkipReason.ENQUEUE_FAILED,
    );

    // Accumulator evicted — no proof will be built
    expect(controller.getAccumulator(reflexResult!.reflexInstanceId)).toBeUndefined();

    // Events: goal_formulated + task_planned + task_enqueue_skipped (no goal_closed)
    const types = emitter.getEvents().map((e) => e.type);
    expect(types).toContain('goal_formulated');
    expect(types).toContain('task_planned');
    expect(types).toContain('task_enqueue_skipped');
    expect(types).not.toContain('goal_closed');
  });

  // --------------------------------------------------------------------------
  // S5: addTask returns null — skip event
  // --------------------------------------------------------------------------

  it('S5: addTask returns null → enqueue_returned_null skip', async () => {
    const reflexResult = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
    expect(reflexResult).not.toBeNull();

    const enqueueResult = await tryEnqueueReflexTask(
      mockAddTaskNull(),
      reflexResult!,
    );
    expect(enqueueResult.kind).toBe('skipped');
    if (enqueueResult.kind === 'skipped') {
      expect(enqueueResult.reason).toBe(EnqueueSkipReason.ENQUEUE_RETURNED_NULL);
      expect(enqueueResult.error).toBeUndefined();
    }
  });

  // --------------------------------------------------------------------------
  // S6: Shadow mode — dryRun evaluates pipeline but produces no artifact
  // --------------------------------------------------------------------------

  it('S6: shadow/dryRun → pipeline runs, no accumulator stored, no task_planned', async () => {
    const reflexResult = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks', { dryRun: true });
    expect(reflexResult).not.toBeNull();
    expect(reflexResult!.taskData.steps[0].meta.leaf).toBe('consume_food');

    // dryRun: no accumulator → no proof can be built
    expect(controller.getAccumulator(reflexResult!.reflexInstanceId)).toBeUndefined();

    // dryRun: armed state unchanged → can fire again without recovery
    expect(controller.isArmed()).toBe(true);

    // Events: goal_formulated only (no task_planned in shadow)
    const types = emitter.getEvents().map((e) => e.type);
    expect(types).toContain('goal_formulated');
    expect(types).not.toContain('task_planned');
  });

  // --------------------------------------------------------------------------
  // S7: Artifact schema — proof bundle shape matches AutonomyProofBundleV1
  // --------------------------------------------------------------------------

  it('S7: artifact reflex_proof conforms to AutonomyProofBundleV1 schema', async () => {
    const runId = 'hunger-reflex-schema';

    const reflexResult = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
    expect(reflexResult).not.toBeNull();

    const bundle = controller.buildProofBundle(
      reflexResult!.proofAccumulator,
      { result: 'ok', receipt: { itemsConsumed: 1 }, taskId: 'task-schema' },
      { food_after: 11, inventory_after: [{ name: 'bread', count: 4 }] },
    );

    recorder.recordReflexProof(runId, bundle);
    const report = recorder.getReport(runId);
    const proof = report!.execution!.reflex_proof!;

    // Schema version
    expect(proof.schema_version).toBe('autonomy_proof_v1');

    // Identity layer (hashed)
    expect(proof.identity).toHaveProperty('trigger');
    expect(proof.identity.trigger).toHaveProperty('hunger_value');
    expect(proof.identity.trigger).toHaveProperty('threshold');
    expect(proof.identity.trigger).toHaveProperty('food_level');
    expect(proof.identity).toHaveProperty('preconditions');
    expect(proof.identity.preconditions).toHaveProperty('food_available');
    expect(proof.identity).toHaveProperty('goal');
    expect(proof.identity.goal).toHaveProperty('need_type');
    expect(proof.identity.goal).toHaveProperty('template_name');
    expect(proof.identity).toHaveProperty('task');
    expect(proof.identity.task.steps).toHaveLength(1);
    expect(proof.identity.task.steps[0].leaf).toBe('consume_food');
    expect(proof.identity).toHaveProperty('execution');
    expect(proof.identity).toHaveProperty('verification');
    expect(proof.identity.verification).toHaveProperty('food_before');
    expect(proof.identity.verification).toHaveProperty('food_after');
    expect(proof.identity.verification).toHaveProperty('delta');
    expect(proof.identity.verification).toHaveProperty('items_consumed');

    // Evidence layer (NOT hashed)
    expect(proof.evidence).toHaveProperty('proof_id');
    expect(proof.evidence).toHaveProperty('goal_id');
    expect(proof.evidence).toHaveProperty('task_id');
    expect(proof.evidence).toHaveProperty('homeostasis_sample_digest');
    expect(proof.evidence).toHaveProperty('candidates_digest');
    expect(proof.evidence).toHaveProperty('execution_receipt');
    expect(proof.evidence).toHaveProperty('candidate_food_item');
    expect(proof.evidence).toHaveProperty('candidate_food_count');
    expect(proof.evidence).toHaveProperty('timing');
    expect(proof.evidence.timing).toHaveProperty('trigger_to_goal_ms');
    expect(proof.evidence.timing).toHaveProperty('goal_to_task_ms');
    expect(proof.evidence.timing).toHaveProperty('task_to_execution_ms');
    expect(proof.evidence.timing).toHaveProperty('total_ms');
    expect(proof.evidence).toHaveProperty('triggered_at');

    // Bundle hash
    expect(typeof proof.bundle_hash).toBe('string');
    expect(proof.bundle_hash.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // S8: Content-addressed determinism across full pipeline
  // --------------------------------------------------------------------------

  it('S8: two identical pipeline runs produce identical bundle_hash', async () => {
    const c1 = new HungerDriveshaftController({ triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5 });
    const c2 = new HungerDriveshaftController({ triggerThreshold: 12, resetThreshold: 16, criticalThreshold: 5 });

    const r1 = await c1.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
    const r2 = await c2.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();

    const afterState = { food_after: 11, inventory_after: [{ name: 'bread', count: 4 }] };
    const execution = { result: 'ok' as const, receipt: { itemsConsumed: 1 }, taskId: 'task-det' };

    const b1 = c1.buildProofBundle(r1!.proofAccumulator, execution, afterState);
    const b2 = c2.buildProofBundle(r2!.proofAccumulator, execution, afterState);

    // Same semantic chain → same hash (content-addressed)
    expect(b1.bundle_hash).toBe(b2.bundle_hash);

    // Different runtime evidence (proof_id, timing)
    expect(b1.evidence.proof_id).not.toBe(b2.evidence.proof_id);
  });

  // --------------------------------------------------------------------------
  // S9: Lifecycle event accounting invariant
  // --------------------------------------------------------------------------

  it('S9: task_planned count == task_enqueued + task_enqueue_skipped (accounting invariant)', async () => {
    // Fire 1: success
    const r1 = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
    expect(r1).not.toBeNull();
    controller.emitTaskEnqueued(r1!.reflexInstanceId, 'task-1', r1!.proofAccumulator.goalId);

    // Re-arm
    await controller.evaluate(makeBotState(16), 'no_tasks');

    // Fire 2: enqueue fails
    const r2 = await controller.evaluate(makeBotState(5, 'bread', 5), 'no_tasks');
    expect(r2).not.toBeNull();
    controller.emitTaskEnqueueSkipped(r2!.reflexInstanceId, r2!.proofAccumulator.goalId, EnqueueSkipReason.ENQUEUE_FAILED);

    // Count events
    const planned = emitter.getByType('task_planned').length;
    const enqueued = emitter.getByType('task_enqueued').length;
    const skipped = emitter.getByType('task_enqueue_skipped').length;

    // Invariant: every task_planned has exactly one terminal outcome
    expect(planned).toBe(enqueued + skipped);
    expect(planned).toBe(2);
    expect(enqueued).toBe(1);
    expect(skipped).toBe(1);
  });
});

/**
 * Verifier Registry + verify_shelter_v0 Tests
 *
 * Evidence for commit 12:
 * - Registry: register, lookup, list, duplicate rejection
 * - verify(): handles missing verifier, verifier errors
 * - verify_shelter_v0: task progress check
 * - verify_shelter_v0: all steps complete check
 * - verify_shelter_v0: module completion check
 * - verify_shelter_v0: world state verification (if available)
 * - Default registry factory
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../../types/task';
import type { GoalBinding } from '../goal-binding-types';
import { createGoalBinding } from '../goal-identity';
import {
  VerifierRegistry,
  verifyShelterV0,
  createDefaultVerifierRegistry,
  type VerifierFn,
  type VerificationWorldState,
} from '../verifier-registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeShelterTask(overrides?: {
  progress?: number;
  stepsComplete?: boolean;
  moduleCursor?: number;
  totalModules?: number;
  withSite?: boolean;
}): Task {
  const binding = createGoalBinding({
    goalInstanceId: 'inst_v',
    goalType: 'build_shelter',
    provisionalKey: 'key_v',
    verifier: 'verify_shelter_v0',
  });

  if (overrides?.withSite) {
    binding.anchors.siteSignature = {
      position: { x: 100, y: 64, z: 200 },
      facing: 'N',
      refCorner: { x: 100, y: 64, z: 200 },
      footprintBounds: {
        min: { x: 95, y: 64, z: 195 },
        max: { x: 110, y: 72, z: 210 },
      },
    };
    binding.goalKeyAliases.push('old_key');
  }

  const totalSteps = 5;
  const doneCount = overrides?.stepsComplete ? totalSteps : 0;
  const steps = Array.from({ length: totalSteps }, (_, i) => ({
    id: `step_${i}`,
    label: `Step ${i}`,
    done: i < doneCount,
    order: i,
    meta: {},
  }));

  const metadata: any = {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    retryCount: 0,
    maxRetries: 3,
    childTaskIds: [],
    tags: [],
    category: 'building',
    goalBinding: binding,
  };

  if (overrides?.moduleCursor !== undefined) {
    metadata.build = {
      moduleCursor: overrides.moduleCursor,
      totalModules: overrides.totalModules ?? 5,
    };
  }

  return {
    id: 'task_v',
    title: 'Build shelter',
    description: 'test',
    type: 'building',
    priority: 0.5,
    urgency: 0.5,
    progress: overrides?.progress ?? 0,
    status: 'active',
    source: 'goal',
    steps,
    parameters: {},
    metadata,
  };
}

// ---------------------------------------------------------------------------
// VerifierRegistry
// ---------------------------------------------------------------------------

describe('VerifierRegistry', () => {
  it('registers and retrieves verifiers', () => {
    const registry = new VerifierRegistry();
    const fn: VerifierFn = () => ({ done: true });

    registry.register('test_v0', fn);

    expect(registry.has('test_v0')).toBe(true);
    expect(registry.get('test_v0')).toBe(fn);
    expect(registry.size).toBe(1);
  });

  it('rejects duplicate registration', () => {
    const registry = new VerifierRegistry();
    registry.register('test_v0', () => ({ done: true }));

    expect(() => registry.register('test_v0', () => ({ done: false }))).toThrow(
      'already registered',
    );
  });

  it('lists all registered verifiers', () => {
    const registry = new VerifierRegistry();
    registry.register('a', () => ({ done: true }));
    registry.register('b', () => ({ done: false }));

    expect(registry.list()).toEqual(expect.arrayContaining(['a', 'b']));
    expect(registry.list()).toHaveLength(2);
  });

  it('verify returns failure for unknown verifier', () => {
    const registry = new VerifierRegistry();
    const task = makeShelterTask();

    const result = registry.verify('nonexistent', task);
    expect(result.done).toBe(false);
    expect(result.blockers).toContain("verifier 'nonexistent' not registered");
  });

  it('verify catches verifier errors', () => {
    const registry = new VerifierRegistry();
    registry.register('broken', () => {
      throw new Error('kaboom');
    });

    const task = makeShelterTask();
    const result = registry.verify('broken', task);

    expect(result.done).toBe(false);
    expect(result.blockers?.[0]).toContain('kaboom');
  });

  it('verify passes worldState to verifier', () => {
    const registry = new VerifierRegistry();
    let receivedWorld: VerificationWorldState | undefined;
    registry.register('inspector', (task, ws) => {
      receivedWorld = ws;
      return { done: true };
    });

    const world: VerificationWorldState = { hasShelter: () => true };
    registry.verify('inspector', makeShelterTask(), world);

    expect(receivedWorld).toBe(world);
  });
});

// ---------------------------------------------------------------------------
// verify_shelter_v0
// ---------------------------------------------------------------------------

describe('verifyShelterV0', () => {
  it('done when all checks pass', () => {
    const task = makeShelterTask({
      progress: 1.0,
      stepsComplete: true,
      moduleCursor: 5,
      totalModules: 5,
    });

    const result = verifyShelterV0(task);

    expect(result.done).toBe(true);
    expect(result.evidence).toContain('task_progress_complete');
    expect(result.evidence).toContain('all_steps_complete');
    expect(result.evidence).toContain('all_modules_complete');
    expect(result.score).toBeGreaterThan(0);
  });

  it('not done when progress is low', () => {
    const task = makeShelterTask({ progress: 0.3 });

    const result = verifyShelterV0(task);

    expect(result.done).toBe(false);
    expect(result.blockers).toBeDefined();
    expect(result.blockers!.some((b) => b.includes('task_progress_low'))).toBe(true);
  });

  it('not done when steps remain', () => {
    const task = makeShelterTask({
      progress: 1.0,
      stepsComplete: false,
    });

    const result = verifyShelterV0(task);

    expect(result.done).toBe(false);
    expect(result.blockers!.some((b) => b.includes('steps_remaining'))).toBe(true);
  });

  it('not done when modules remain', () => {
    const task = makeShelterTask({
      progress: 1.0,
      stepsComplete: true,
      moduleCursor: 3,
      totalModules: 5,
    });

    const result = verifyShelterV0(task);

    expect(result.done).toBe(false);
    expect(result.blockers!.some((b) => b.includes('modules_remaining'))).toBe(true);
  });

  it('uses world state hasShelter when available', () => {
    const task = makeShelterTask({
      progress: 1.0,
      stepsComplete: true,
      withSite: true,
    });

    const worldYes: VerificationWorldState = { hasShelter: () => true };
    const resultYes = verifyShelterV0(task, worldYes);
    expect(resultYes.evidence).toContain('world_shelter_confirmed');

    const worldNo: VerificationWorldState = { hasShelter: () => false };
    const resultNo = verifyShelterV0(task, worldNo);
    expect(resultNo.blockers).toBeDefined();
    expect(resultNo.blockers!.some((b) => b.includes('world_shelter_not_found'))).toBe(true);
  });

  it('skips world check when no site signature', () => {
    const task = makeShelterTask({
      progress: 1.0,
      stepsComplete: true,
      withSite: false,
    });

    const world: VerificationWorldState = { hasShelter: () => false };
    const result = verifyShelterV0(task, world);

    // Should not include world check results (no site to check)
    expect(result.evidence?.includes('world_shelter_confirmed')).toBeFalsy();
    expect(result.blockers?.some((b) => b.includes('world_shelter'))).toBeFalsy();
  });

  it('score is proportional to checks passed', () => {
    // All pass
    const allPass = verifyShelterV0(
      makeShelterTask({ progress: 1.0, stepsComplete: true }),
    );
    expect(allPass.score).toBe(1.0);

    // Partial
    const partial = verifyShelterV0(
      makeShelterTask({ progress: 0.5, stepsComplete: true }),
    );
    expect(partial.score).toBeGreaterThan(0);
    expect(partial.score).toBeLessThan(1.0);
  });
});

// ---------------------------------------------------------------------------
// Default registry
// ---------------------------------------------------------------------------

describe('createDefaultVerifierRegistry', () => {
  it('includes verify_shelter_v0', () => {
    const registry = createDefaultVerifierRegistry();
    expect(registry.has('verify_shelter_v0')).toBe(true);
  });

  it('shelter verifier works through registry', () => {
    const registry = createDefaultVerifierRegistry();
    const task = makeShelterTask({ progress: 1.0, stepsComplete: true });

    const result = registry.verify('verify_shelter_v0', task);
    expect(result.done).toBe(true);
  });
});

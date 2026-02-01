/**
 * Goal Resolver — Scoring + Dry Resolution
 *
 * Evidence for commit 4:
 * - Proximity decay: 1.0 at 0m, 0.0 at 128m, linear
 * - Anchor match dominance: exact siteSignature match scores highest
 * - Spatial scope: completed shelter at 80m does not satisfy new request at bot position
 * - Spatial scope: completed shelter within footprint + 8m margin → satisfied
 * - Key match boost: goalKey match raises score above threshold
 * - Candidate ordering: higher score first
 * - Shelter vs structure identity differentiation
 * - Verifier integration: already_satisfied only when verifier returns true
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../../types/task';
import type { GoalBinding } from '../goal-binding-types';
import { createGoalBinding, computeProvisionalKey, anchorGoalIdentity } from '../goal-identity';
import {
  scoreCandidate,
  findCandidates,
  isWithinSatisfactionScope,
  resolveGoalDry,
  CONTINUE_THRESHOLD,
  PROXIMITY_MAX_DISTANCE,
  PROVISIONAL_SCOPE_RADIUS,
} from '../goal-resolver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBinding(overrides?: Partial<GoalBinding>): GoalBinding {
  return createGoalBinding({
    goalInstanceId: 'inst_test',
    goalType: 'build_shelter',
    provisionalKey: 'prov_test',
    verifier: 'verify_shelter_v0',
    ...overrides,
  });
}

function makeTask(
  id: string,
  overrides?: Partial<Task> & { goalBinding?: GoalBinding },
): Task {
  const { goalBinding, ...rest } = overrides ?? {};
  return {
    id,
    title: 'Build shelter',
    description: 'test',
    type: 'building',
    priority: 0.5,
    urgency: 0.5,
    progress: 0,
    status: 'pending',
    source: 'goal',
    steps: [],
    parameters: {},
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: [],
      category: 'building',
      ...(goalBinding ? { goalBinding } : {}),
    },
    ...rest,
  };
}

const siteAt = (x: number, y: number, z: number) => ({
  position: { x, y, z },
  facing: 'N' as const,
  refCorner: { x, y, z },
  footprintBounds: {
    min: { x: x - 5, y, z: z - 5 },
    max: { x: x + 5, y: y + 8, z: z + 5 },
  },
});

// ---------------------------------------------------------------------------
// scoreCandidate
// ---------------------------------------------------------------------------

describe('scoreCandidate — proximity decay', () => {
  it('returns ~1.0 proximity at distance 0', () => {
    const binding = makeBinding();
    binding.anchors.siteSignature = siteAt(100, 64, 200);
    const task = makeTask('t1', { goalBinding: binding });
    const breakdown = scoreCandidate(task, binding, {
      goalType: 'build_shelter',
      botPosition: { x: 100, y: 64, z: 200 },
    });
    expect(breakdown.proximity).toBeCloseTo(1.0, 2);
  });

  it('returns 0.5 proximity at distance 64', () => {
    const binding = makeBinding();
    binding.anchors.siteSignature = siteAt(100, 64, 200);
    const task = makeTask('t1', { goalBinding: binding });
    const breakdown = scoreCandidate(task, binding, {
      goalType: 'build_shelter',
      botPosition: { x: 100 + 64, y: 64, z: 200 },
    });
    expect(breakdown.proximity).toBeCloseTo(0.5, 1);
  });

  it('returns 0 proximity at distance >= 128', () => {
    const binding = makeBinding();
    binding.anchors.siteSignature = siteAt(100, 64, 200);
    const task = makeTask('t1', { goalBinding: binding });
    const breakdown = scoreCandidate(task, binding, {
      goalType: 'build_shelter',
      botPosition: { x: 100 + PROXIMITY_MAX_DISTANCE, y: 64, z: 200 },
    });
    expect(breakdown.proximity).toBe(0);
  });
});

describe('scoreCandidate — anchor match', () => {
  it('exact refCorner match scores anchorMatch = 1.0', () => {
    const binding = makeBinding();
    binding.anchors.siteSignature = siteAt(100, 64, 200);
    const task = makeTask('t1', { goalBinding: binding });
    const breakdown = scoreCandidate(task, binding, {
      goalType: 'build_shelter',
      botPosition: { x: 100, y: 64, z: 200 },
    });
    expect(breakdown.anchorMatch).toBe(1.0);
  });

  it('non-exact siteSignature scores anchorMatch = 0.3', () => {
    const binding = makeBinding();
    binding.anchors.siteSignature = siteAt(100, 64, 200);
    const task = makeTask('t1', { goalBinding: binding });
    const breakdown = scoreCandidate(task, binding, {
      goalType: 'build_shelter',
      botPosition: { x: 105, y: 64, z: 200 },
    });
    expect(breakdown.anchorMatch).toBe(0.3);
  });

  it('no siteSignature → anchorMatch = 0', () => {
    const binding = makeBinding();
    const task = makeTask('t1', { goalBinding: binding });
    const breakdown = scoreCandidate(task, binding, {
      goalType: 'build_shelter',
      botPosition: { x: 100, y: 64, z: 200 },
    });
    expect(breakdown.anchorMatch).toBe(0);
  });
});

describe('scoreCandidate — recency', () => {
  it('recent task gets bonus', () => {
    const binding = makeBinding();
    const task = makeTask('t1', { goalBinding: binding });
    task.metadata.startedAt = Date.now() - 60_000; // 1 min ago
    const breakdown = scoreCandidate(task, binding, {
      goalType: 'build_shelter',
      botPosition: { x: 0, y: 64, z: 0 },
      now: Date.now(),
    });
    expect(breakdown.recency).toBe(0.1);
  });

  it('old task gets no bonus', () => {
    const binding = makeBinding();
    const task = makeTask('t1', { goalBinding: binding });
    task.metadata.startedAt = Date.now() - 2 * 60 * 60 * 1000; // 2h ago
    const breakdown = scoreCandidate(task, binding, {
      goalType: 'build_shelter',
      botPosition: { x: 0, y: 64, z: 0 },
      now: Date.now(),
    });
    expect(breakdown.recency).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isWithinSatisfactionScope
// ---------------------------------------------------------------------------

describe('isWithinSatisfactionScope', () => {
  it('anchored: within footprint + 8 margin → true', () => {
    const binding = makeBinding();
    binding.anchors.siteSignature = siteAt(100, 64, 200);
    // footprint is 95..105, 64..72, 195..205 + 8 margin = 87..113, 56..80, 187..213
    expect(isWithinSatisfactionScope(binding, { x: 100, y: 64, z: 200 })).toBe(true);
    expect(isWithinSatisfactionScope(binding, { x: 113, y: 64, z: 213 })).toBe(true);
  });

  it('anchored: outside margin → false', () => {
    const binding = makeBinding();
    binding.anchors.siteSignature = siteAt(100, 64, 200);
    expect(isWithinSatisfactionScope(binding, { x: 200, y: 64, z: 200 })).toBe(false);
  });

  it('completed shelter at 80m does not satisfy (spatial scope)', () => {
    const binding = makeBinding();
    binding.anchors.siteSignature = siteAt(100, 64, 200);
    // Bot at 80m away
    expect(isWithinSatisfactionScope(binding, { x: 180, y: 64, z: 200 })).toBe(false);
  });

  it('provisional: within 32m radius → true', () => {
    const binding = makeBinding();
    binding.anchors.regionHint = { x: 100, y: 64, z: 200, r: 32 };
    expect(isWithinSatisfactionScope(binding, { x: 110, y: 64, z: 200 })).toBe(true);
  });

  it('provisional: beyond 32m → false', () => {
    const binding = makeBinding();
    binding.anchors.regionHint = { x: 100, y: 64, z: 200, r: 32 };
    expect(isWithinSatisfactionScope(binding, { x: 200, y: 64, z: 200 })).toBe(false);
  });

  it('no anchors → false', () => {
    const binding = makeBinding();
    expect(isWithinSatisfactionScope(binding, { x: 0, y: 0, z: 0 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findCandidates
// ---------------------------------------------------------------------------

describe('findCandidates', () => {
  it('returns only tasks with matching goalType', () => {
    const bindingA = makeBinding();
    const bindingB = createGoalBinding({
      goalInstanceId: 'inst_other',
      goalType: 'build_structure', // different type
      provisionalKey: 'prov_other',
      verifier: 'verify_structure_v0',
    });
    const taskA = makeTask('t1', { goalBinding: bindingA });
    const taskB = makeTask('t2', { goalBinding: bindingB });

    const candidates = findCandidates([taskA, taskB], {
      goalType: 'build_shelter',
      botPosition: { x: 0, y: 64, z: 0 },
    });

    expect(candidates.every((c) => c.binding.goalType === 'build_shelter')).toBe(true);
  });

  it('returns candidates sorted by score descending', () => {
    // Near task should score higher than far task
    const nearBinding = makeBinding();
    nearBinding.anchors.siteSignature = siteAt(10, 64, 10);
    const nearTask = makeTask('near', { goalBinding: nearBinding });

    const farBinding = createGoalBinding({
      goalInstanceId: 'inst_far',
      goalType: 'build_shelter',
      provisionalKey: 'prov_far',
      verifier: 'verify_shelter_v0',
    });
    farBinding.anchors.siteSignature = siteAt(100, 64, 100);
    const farTask = makeTask('far', { goalBinding: farBinding });

    const candidates = findCandidates([farTask, nearTask], {
      goalType: 'build_shelter',
      botPosition: { x: 10, y: 64, z: 10 },
    });

    expect(candidates.length).toBe(2);
    expect(candidates[0].task.id).toBe('near');
  });

  it('skips non-goal tasks', () => {
    const plainTask = makeTask('plain'); // no goalBinding
    const candidates = findCandidates([plainTask], {
      goalType: 'build_shelter',
      botPosition: { x: 0, y: 64, z: 0 },
    });
    expect(candidates).toHaveLength(0);
  });

  it('key match boosts score', () => {
    const provisionalKey = computeProvisionalKey({
      goalType: 'build_shelter',
      botPosition: { x: 5, y: 64, z: 5 },
    });
    const binding = createGoalBinding({
      goalInstanceId: 'inst_keyed',
      goalType: 'build_shelter',
      provisionalKey,
      verifier: 'verify_shelter_v0',
    });
    const task = makeTask('keyed', { goalBinding: binding });

    const candidates = findCandidates([task], {
      goalType: 'build_shelter',
      botPosition: { x: 5, y: 64, z: 5 },
    });

    expect(candidates).toHaveLength(1);
    // Key match should set keyMatch to 1.0
    expect(candidates[0].breakdown.keyMatch).toBe(1.0);
    // Total should be above continue threshold (keyMatch alone contributes 0.35)
    expect(candidates[0].score).toBeGreaterThan(CONTINUE_THRESHOLD);
  });
});

// ---------------------------------------------------------------------------
// resolveGoalDry
// ---------------------------------------------------------------------------

describe('resolveGoalDry', () => {
  it('returns "continue" when non-terminal task scores above threshold', () => {
    const provisionalKey = computeProvisionalKey({
      goalType: 'build_shelter',
      botPosition: { x: 5, y: 64, z: 5 },
    });
    const binding = createGoalBinding({
      goalInstanceId: 'inst_cont',
      goalType: 'build_shelter',
      provisionalKey,
      verifier: 'verify_shelter_v0',
    });
    const task = makeTask('existing', { status: 'active', goalBinding: binding });

    const result = resolveGoalDry([task], {
      goalType: 'build_shelter',
      botPosition: { x: 5, y: 64, z: 5 },
    });

    expect(result.action).toBe('continue');
    if (result.action === 'continue') {
      expect(result.taskId).toBe('existing');
    }
  });

  it('returns "create" when no matching tasks exist', () => {
    const result = resolveGoalDry([], {
      goalType: 'build_shelter',
      botPosition: { x: 5, y: 64, z: 5 },
    });
    expect(result.action).toBe('create');
  });

  it('returns "create" when existing tasks are too far', () => {
    const binding = makeBinding();
    binding.anchors.siteSignature = siteAt(500, 64, 500);
    const task = makeTask('far_away', { status: 'active', goalBinding: binding });

    const result = resolveGoalDry([task], {
      goalType: 'build_shelter',
      botPosition: { x: 0, y: 64, z: 0 },
    });

    expect(result.action).toBe('create');
  });

  it('returns "already_satisfied" when completed + in scope + verifier passes', () => {
    const binding = makeBinding();
    binding.anchors.siteSignature = siteAt(100, 64, 200);
    const task = makeTask('done', { status: 'completed', goalBinding: binding });

    const result = resolveGoalDry(
      [task],
      {
        goalType: 'build_shelter',
        botPosition: { x: 100, y: 64, z: 200 },
      },
      () => true, // verifier passes
    );

    expect(result.action).toBe('already_satisfied');
    if (result.action === 'already_satisfied') {
      expect(result.taskId).toBe('done');
    }
  });

  it('returns "create" when completed but verifier fails', () => {
    const binding = makeBinding();
    binding.anchors.siteSignature = siteAt(100, 64, 200);
    const task = makeTask('damaged', { status: 'completed', goalBinding: binding });

    const result = resolveGoalDry(
      [task],
      {
        goalType: 'build_shelter',
        botPosition: { x: 100, y: 64, z: 200 },
      },
      () => false, // verifier fails
    );

    expect(result.action).toBe('create');
  });

  it('returns "create" when completed but out of spatial scope', () => {
    const binding = makeBinding();
    binding.anchors.siteSignature = siteAt(100, 64, 200);
    const task = makeTask('far_done', { status: 'completed', goalBinding: binding });

    const result = resolveGoalDry(
      [task],
      {
        goalType: 'build_shelter',
        botPosition: { x: 300, y: 64, z: 300 }, // 80m+ away
      },
      () => true,
    );

    expect(result.action).toBe('create');
  });

  it('prefers non-terminal over completed (continue before already_satisfied)', () => {
    const provisionalKey = computeProvisionalKey({
      goalType: 'build_shelter',
      botPosition: { x: 5, y: 64, z: 5 },
    });

    const activeBinding = createGoalBinding({
      goalInstanceId: 'inst_active',
      goalType: 'build_shelter',
      provisionalKey,
      verifier: 'verify_shelter_v0',
    });
    const activeTask = makeTask('active_one', { status: 'active', goalBinding: activeBinding });

    const completedBinding = createGoalBinding({
      goalInstanceId: 'inst_completed',
      goalType: 'build_shelter',
      provisionalKey: 'prov_completed',
      verifier: 'verify_shelter_v0',
    });
    completedBinding.anchors.siteSignature = siteAt(5, 64, 5);
    const completedTask = makeTask('completed_one', { status: 'completed', goalBinding: completedBinding });

    const result = resolveGoalDry(
      [activeTask, completedTask],
      {
        goalType: 'build_shelter',
        botPosition: { x: 5, y: 64, z: 5 },
      },
      () => true,
    );

    expect(result.action).toBe('continue');
    if (result.action === 'continue') {
      expect(result.taskId).toBe('active_one');
    }
  });

  it('skips non-goal tasks', () => {
    const plainTask = makeTask('plain');
    const result = resolveGoalDry([plainTask], {
      goalType: 'build_shelter',
      botPosition: { x: 0, y: 64, z: 0 },
    });
    expect(result.action).toBe('create');
  });

  it('paused tasks are eligible for "continue"', () => {
    const provisionalKey = computeProvisionalKey({
      goalType: 'build_shelter',
      botPosition: { x: 5, y: 64, z: 5 },
    });
    const binding = createGoalBinding({
      goalInstanceId: 'inst_paused',
      goalType: 'build_shelter',
      provisionalKey,
      verifier: 'verify_shelter_v0',
    });
    const task = makeTask('paused_one', { status: 'paused', goalBinding: binding });

    const result = resolveGoalDry([task], {
      goalType: 'build_shelter',
      botPosition: { x: 5, y: 64, z: 5 },
    });

    expect(result.action).toBe('continue');
  });
});

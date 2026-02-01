/**
 * Goal Identity — Key Computation + Phase A→B Transition
 *
 * Evidence for commit 3:
 * - Provisional keys are deterministic and chunk-stable
 * - Anchored keys differ by goal type (shelter excludes template, structure includes it)
 * - Phase A→B transition pushes old key to aliases atomically
 * - Double-anchor is rejected
 * - goalInstanceId is never modified by transition
 * - Binding factory produces valid Phase A state
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  hashGoalKey,
  coarseRegion,
  computeProvisionalKey,
  computeAnchoredKey,
  anchorGoalIdentity,
  createGoalBinding,
} from '../goal-identity';
import { detectIllegalStates } from '../goal-binding-normalize';
import type { Task } from '../../types/task';

// ---------------------------------------------------------------------------
// hashGoalKey
// ---------------------------------------------------------------------------

describe('hashGoalKey', () => {
  it('produces deterministic output', () => {
    const a = hashGoalKey('build_shelter', 'oak', '0:0');
    const b = hashGoalKey('build_shelter', 'oak', '0:0');
    expect(a).toBe(b);
  });

  it('differs on different inputs', () => {
    const a = hashGoalKey('build_shelter', 'oak', '0:0');
    const b = hashGoalKey('build_shelter', 'spruce', '0:0');
    expect(a).not.toBe(b);
  });

  it('separator prevents collisions', () => {
    // "ab" + "c" should differ from "a" + "bc"
    const a = hashGoalKey('ab', 'c');
    const b = hashGoalKey('a', 'bc');
    expect(a).not.toBe(b);
  });

  it('returns 16 hex chars', () => {
    const key = hashGoalKey('test');
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ---------------------------------------------------------------------------
// coarseRegion
// ---------------------------------------------------------------------------

describe('coarseRegion', () => {
  it('buckets into 16-block grid', () => {
    expect(coarseRegion({ x: 0, y: 64, z: 0 })).toBe('0:0');
    expect(coarseRegion({ x: 15, y: 64, z: 15 })).toBe('0:0');
    expect(coarseRegion({ x: 16, y: 64, z: 0 })).toBe('1:0');
    expect(coarseRegion({ x: -1, y: 64, z: -1 })).toBe('-1:-1');
  });

  it('nearby positions in same chunk produce same key', () => {
    const a = coarseRegion({ x: 5, y: 64, z: 10 });
    const b = coarseRegion({ x: 12, y: 64, z: 3 });
    expect(a).toBe(b); // both in chunk 0:0
  });
});

// ---------------------------------------------------------------------------
// computeProvisionalKey
// ---------------------------------------------------------------------------

describe('computeProvisionalKey', () => {
  it('same intent + same chunk = same key', () => {
    const a = computeProvisionalKey({
      goalType: 'build_shelter',
      botPosition: { x: 5, y: 64, z: 10 },
    });
    const b = computeProvisionalKey({
      goalType: 'build_shelter',
      botPosition: { x: 12, y: 64, z: 3 },
    });
    expect(a).toBe(b);
  });

  it('different chunk = different key', () => {
    const a = computeProvisionalKey({
      goalType: 'build_shelter',
      botPosition: { x: 5, y: 64, z: 10 },
    });
    const b = computeProvisionalKey({
      goalType: 'build_shelter',
      botPosition: { x: 200, y: 64, z: 200 },
    });
    expect(a).not.toBe(b);
  });

  it('different goal type = different key', () => {
    const a = computeProvisionalKey({
      goalType: 'build_shelter',
      botPosition: { x: 5, y: 64, z: 10 },
    });
    const b = computeProvisionalKey({
      goalType: 'build_structure',
      botPosition: { x: 5, y: 64, z: 10 },
    });
    expect(a).not.toBe(b);
  });

  it('intent params differentiate', () => {
    const a = computeProvisionalKey({
      goalType: 'build_shelter',
      intentParams: 'stone',
      botPosition: { x: 5, y: 64, z: 10 },
    });
    const b = computeProvisionalKey({
      goalType: 'build_shelter',
      intentParams: 'wood',
      botPosition: { x: 5, y: 64, z: 10 },
    });
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// computeAnchoredKey
// ---------------------------------------------------------------------------

describe('computeAnchoredKey', () => {
  const refCorner = { x: 100, y: 64, z: 200 };

  it('shelter identity excludes templateDigest', () => {
    const a = computeAnchoredKey({
      goalType: 'build_shelter',
      refCorner,
      facing: 'N',
      templateDigest: 'digest_A',
    });
    const b = computeAnchoredKey({
      goalType: 'build_shelter',
      refCorner,
      facing: 'N',
      templateDigest: 'digest_B',
    });
    expect(a).toBe(b); // template not in shelter identity
  });

  it('structure identity includes templateDigest', () => {
    const a = computeAnchoredKey({
      goalType: 'build_structure',
      refCorner,
      facing: 'N',
      templateDigest: 'digest_A',
    });
    const b = computeAnchoredKey({
      goalType: 'build_structure',
      refCorner,
      facing: 'N',
      templateDigest: 'digest_B',
    });
    expect(a).not.toBe(b); // template is identity for structures
  });

  it('different refCorner = different key', () => {
    const a = computeAnchoredKey({
      goalType: 'build_shelter',
      refCorner: { x: 100, y: 64, z: 200 },
      facing: 'N',
    });
    const b = computeAnchoredKey({
      goalType: 'build_shelter',
      refCorner: { x: 101, y: 64, z: 200 },
      facing: 'N',
    });
    expect(a).not.toBe(b);
  });

  it('different facing = different key', () => {
    const a = computeAnchoredKey({
      goalType: 'build_shelter',
      refCorner,
      facing: 'N',
    });
    const b = computeAnchoredKey({
      goalType: 'build_shelter',
      refCorner,
      facing: 'E',
    });
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Phase A → Phase B transition
// ---------------------------------------------------------------------------

describe('anchorGoalIdentity', () => {
  const siteSignature = {
    position: { x: 100, y: 64, z: 200 },
    facing: 'N' as const,
    refCorner: { x: 100, y: 64, z: 200 },
    footprintBounds: {
      min: { x: 95, y: 64, z: 195 },
      max: { x: 110, y: 72, z: 210 },
    },
  };

  it('pushes old key to aliases and computes new key', () => {
    const binding = createGoalBinding({
      goalInstanceId: 'inst_001',
      goalType: 'build_shelter',
      provisionalKey: 'old_provisional_key',
      verifier: 'verify_shelter_v0',
    });

    const oldKey = binding.goalKey;
    const newKey = anchorGoalIdentity(binding, {
      refCorner: siteSignature.refCorner,
      facing: siteSignature.facing,
      siteSignature,
    });

    expect(binding.goalKeyAliases).toContain(oldKey);
    expect(binding.goalKey).toBe(newKey);
    expect(newKey).not.toBe(oldKey);
    expect(binding.anchors.siteSignature).toBe(siteSignature);
  });

  it('goalInstanceId is unchanged after transition', () => {
    const binding = createGoalBinding({
      goalInstanceId: 'inst_stable',
      goalType: 'build_shelter',
      provisionalKey: 'prov_key',
      verifier: 'verify_shelter_v0',
    });

    anchorGoalIdentity(binding, {
      refCorner: siteSignature.refCorner,
      facing: siteSignature.facing,
      siteSignature,
    });

    expect(binding.goalInstanceId).toBe('inst_stable');
  });

  it('rejects double-anchor', () => {
    const binding = createGoalBinding({
      goalInstanceId: 'inst_002',
      goalType: 'build_shelter',
      provisionalKey: 'prov_key_2',
      verifier: 'verify_shelter_v0',
    });

    anchorGoalIdentity(binding, {
      refCorner: siteSignature.refCorner,
      facing: siteSignature.facing,
      siteSignature,
    });

    expect(() =>
      anchorGoalIdentity(binding, {
        refCorner: { x: 999, y: 64, z: 999 },
        facing: 'S',
        siteSignature: {
          ...siteSignature,
          refCorner: { x: 999, y: 64, z: 999 },
          facing: 'S',
        },
      }),
    ).toThrow('already anchored');
  });

  it('anchored binding passes illegal-state check (alias recorded)', () => {
    const binding = createGoalBinding({
      goalInstanceId: 'inst_003',
      goalType: 'build_shelter',
      provisionalKey: 'prov_key_3',
      verifier: 'verify_shelter_v0',
    });

    anchorGoalIdentity(binding, {
      refCorner: siteSignature.refCorner,
      facing: siteSignature.facing,
      siteSignature,
    });

    // Build a mock task to test illegal state detection
    const task: Task = {
      id: 'task_003',
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
        goalBinding: binding,
      },
    };

    const violations = detectIllegalStates(task);
    // Should have no anchored_without_alias violation
    expect(violations.some((v) => v.rule === 'anchored_without_alias')).toBe(false);
  });

  it('includes templateDigest for build_structure', () => {
    const binding = createGoalBinding({
      goalInstanceId: 'inst_004',
      goalType: 'build_structure',
      provisionalKey: 'prov_key_4',
      verifier: 'verify_structure_v0',
    });

    const keyWithDigestA = anchorGoalIdentity(binding, {
      refCorner: siteSignature.refCorner,
      facing: siteSignature.facing,
      siteSignature,
      templateDigest: 'template_AAA',
    });

    // Create another binding with different template
    const binding2 = createGoalBinding({
      goalInstanceId: 'inst_005',
      goalType: 'build_structure',
      provisionalKey: 'prov_key_5',
      verifier: 'verify_structure_v0',
    });

    const keyWithDigestB = anchorGoalIdentity(binding2, {
      refCorner: siteSignature.refCorner,
      facing: siteSignature.facing,
      siteSignature,
      templateDigest: 'template_BBB',
    });

    expect(keyWithDigestA).not.toBe(keyWithDigestB);
  });
});

// ---------------------------------------------------------------------------
// createGoalBinding factory
// ---------------------------------------------------------------------------

describe('createGoalBinding', () => {
  it('creates Phase A binding with correct defaults', () => {
    const binding = createGoalBinding({
      goalInstanceId: 'inst_factory',
      goalType: 'build_shelter',
      provisionalKey: 'prov_factory',
      verifier: 'verify_shelter_v0',
      goalId: 'goal_123',
    });

    expect(binding.goalInstanceId).toBe('inst_factory');
    expect(binding.goalKey).toBe('prov_factory');
    expect(binding.goalKeyAliases).toEqual([]);
    expect(binding.goalType).toBe('build_shelter');
    expect(binding.goalId).toBe('goal_123');
    expect(binding.anchors).toEqual({});
    expect(binding.hold).toBeUndefined();
    expect(binding.completion.verifier).toBe('verify_shelter_v0');
    expect(binding.completion.definitionVersion).toBe(1);
    expect(binding.completion.consecutivePasses).toBe(0);
    expect(binding.completion.lastVerifiedAt).toBeUndefined();
    expect(binding.supersedesInstanceId).toBeUndefined();
  });

  it('Phase A binding passes illegal-state check', () => {
    const binding = createGoalBinding({
      goalInstanceId: 'inst_check',
      goalType: 'build_shelter',
      provisionalKey: 'prov_check',
      verifier: 'verify_shelter_v0',
    });

    const task: Task = {
      id: 'task_check',
      title: 'test',
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
        goalBinding: binding,
      },
    };

    expect(detectIllegalStates(task)).toEqual([]);
  });
});

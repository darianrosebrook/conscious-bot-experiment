/**
 * Anti-footgun: P21 Type Equivalence Assertion
 *
 * Compile-time bidirectional assignability check between Minecraft rig
 * types and P21 capsule types. If either type drifts, tsc --noEmit fails.
 *
 * This is a structural contract test, not a behavioral test.
 *
 * Expanded with:
 * - Delta type literal union equivalence (SaliencyDeltaType ↔ P21DeltaType)
 * - Required semantic key set assertions for adapter mappings
 */

import { describe, it, expect } from 'vitest';
import type { ThreatLevel, SaliencyDeltaType, TrackSummary, SaliencyDelta } from '../types';
import type {
  P21RiskLevel,
  P21RiskClassifier,
  P21DeltaType,
  P21TrackSummary,
  P21SaliencyDelta,
} from '../../../../planning/src/sterling/primitives/p21/p21-capsule-types';
import type { RiskClassifier } from '../track-set';

// ── Compile-time assignability checks ───────────────────────────────
//
// These types are never instantiated at runtime. They exist only to
// make tsc fail if the literal unions or structural shapes drift apart.

type AssertAssignable<T, U> = T extends U ? true : never;

// ThreatLevel (Minecraft rig) must be assignable to P21RiskLevel (capsule)
type _CheckThreatToRisk = AssertAssignable<ThreatLevel, P21RiskLevel>;
// P21RiskLevel must be assignable to ThreatLevel
type _CheckRiskToThreat = AssertAssignable<P21RiskLevel, ThreatLevel>;

// RiskClassifier (Minecraft rig) must structurally match the required fields of P21RiskClassifier
type P21RiskClassifierCore = Pick<P21RiskClassifier, 'riskClasses' | 'classifyRisk'>;
type _CheckRigToP21Classifier = AssertAssignable<RiskClassifier, P21RiskClassifierCore>;
type _CheckP21ToRigClassifier = AssertAssignable<P21RiskClassifierCore, RiskClassifier>;

// Delta type bidirectional assignability
type _CheckDeltaTypeForward = AssertAssignable<SaliencyDeltaType, P21DeltaType>;
type _CheckDeltaTypeReverse = AssertAssignable<P21DeltaType, SaliencyDeltaType>;

// Suppress unused variable warnings — these are compile-time-only markers
const _typeChecks: [
  _CheckThreatToRisk,
  _CheckRiskToThreat,
  _CheckRigToP21Classifier,
  _CheckP21ToRigClassifier,
  _CheckDeltaTypeForward,
  _CheckDeltaTypeReverse,
] = [true, true, true, true, true, true];

// ── Semantic core field sets ────────────────────────────────────────

const P21_TRACK_SEMANTIC_KEYS = [
  'trackId', 'classLabel', 'classEnum', 'posBucketX', 'posBucketY', 'posBucketZ',
  'proximityBucket', 'visibility', 'riskLevel', 'confidence', 'pUnknown',
  'firstSeenTick', 'lastSeenTick',
] as const;

const P21_DELTA_SEMANTIC_KEYS = [
  'type', 'trackId', 'classLabel', 'riskLevel', 'proximityBucket',
] as const;

function assertHasKeys(obj: Record<string, unknown>, keys: readonly string[], label: string) {
  const missing = keys.filter(k => !(k in obj));
  expect(missing, `${label} missing keys`).toEqual([]);
}

// ── Adapter mapping functions (capsule ← rig) ──────────────────────

function toCapsuleTrack(track: TrackSummary): P21TrackSummary {
  return {
    trackId: track.trackId,
    classLabel: track.classLabel,
    classEnum: track.kindEnum,
    posBucketX: track.posBucketX,
    posBucketY: track.posBucketY,
    posBucketZ: track.posBucketZ,
    proximityBucket: track.distBucket,
    visibility: track.visibility,
    riskLevel: track.threatLevel,
    confidence: track.confidence,
    pUnknown: track.pUnknown,
    firstSeenTick: track.firstSeenTick,
    lastSeenTick: track.lastSeenTick,
  } satisfies P21TrackSummary;
}

function toCapsuleDelta(delta: SaliencyDelta): P21SaliencyDelta {
  return {
    type: delta.type,
    trackId: delta.trackId,
    classLabel: delta.classLabel,
    riskLevel: delta.threatLevel,
    proximityBucket: delta.distBucket,
    prev: delta.prev
      ? {
          riskLevel: delta.prev.threatLevel,
          proximityBucket: delta.prev.distBucket,
        }
      : undefined,
    track: delta.track ? toCapsuleTrack(delta.track) : undefined,
  };
}

// ── Runtime equivalence tests ───────────────────────────────────────

describe('P21 type equivalence', () => {
  it('ThreatLevel and P21RiskLevel share the same literal values', () => {
    // Both types enumerate the same 5 values
    const levels: ThreatLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
    const p21Levels: P21RiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
    expect(levels).toEqual(p21Levels);
  });

  it('RiskClassifier and P21RiskClassifier have compatible signatures', () => {
    // A RiskClassifier must have riskClasses and classifyRisk
    // This validates that if you write a function accepting P21RiskClassifier,
    // a RiskClassifier instance can be passed (minus optional methods)
    const rigClassifier: RiskClassifier = {
      riskClasses: new Set(['zombie']),
      classifyRisk: (_classLabel: string, _proximityBucket: number, _pUnknown: number) => 'none' as ThreatLevel,
    };

    // Structural compatibility: the rig classifier satisfies the core P21 shape
    const asP21Core: P21RiskClassifierCore = rigClassifier;
    expect(asP21Core.riskClasses).toBe(rigClassifier.riskClasses);
    expect(typeof asP21Core.classifyRisk).toBe('function');
  });

  it('SaliencyDeltaType values match P21DeltaType', () => {
    const rigTypes: SaliencyDeltaType[] = ['new_threat', 'track_lost', 'reclassified', 'movement_bucket_change'];
    const capsuleTypes: P21DeltaType[] = ['new_threat', 'track_lost', 'reclassified', 'movement_bucket_change'];
    expect(rigTypes).toEqual(capsuleTypes);
  });

  it('toCapsuleTrack produces all semantic core fields', () => {
    const rigTrack: TrackSummary = {
      trackId: 'test-track-001',
      classLabel: 'zombie',
      kindEnum: 1,
      posBucketX: 10,
      posBucketY: 64,
      posBucketZ: 5,
      distBucket: 3,
      visibility: 'visible',
      threatLevel: 'high',
      confidence: 0.9,
      pUnknown: 0.05,
      firstSeenTick: 1,
      lastSeenTick: 10,
    };
    const capsuleTrack = toCapsuleTrack(rigTrack);
    assertHasKeys(capsuleTrack as unknown as Record<string, unknown>, P21_TRACK_SEMANTIC_KEYS, 'P21TrackSummary');
  });

  it('toCapsuleDelta produces all semantic core fields', () => {
    const rigDelta: SaliencyDelta = {
      type: 'new_threat',
      trackId: 'test-track-001',
      classLabel: 'zombie',
      threatLevel: 'high',
      distBucket: 3,
    };
    const capsuleDelta = toCapsuleDelta(rigDelta);
    assertHasKeys(capsuleDelta as unknown as Record<string, unknown>, P21_DELTA_SEMANTIC_KEYS, 'P21SaliencyDelta');
  });
});

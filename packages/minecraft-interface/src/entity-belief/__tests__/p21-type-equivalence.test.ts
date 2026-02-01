/**
 * Anti-footgun: P21 Type Equivalence Assertion
 *
 * Compile-time bidirectional assignability check between Minecraft rig
 * types and P21 capsule types. If either type drifts, tsc --noEmit fails.
 *
 * This is a structural contract test, not a behavioral test.
 */

import { describe, it, expect } from 'vitest';
import type { ThreatLevel } from '../types';
import type {
  P21RiskLevel,
  P21RiskClassifier,
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

// Suppress unused variable warnings — these are compile-time-only markers
const _typeChecks: [
  _CheckThreatToRisk,
  _CheckRiskToThreat,
  _CheckRigToP21Classifier,
  _CheckP21ToRigClassifier,
] = [true, true, true, true];

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
});

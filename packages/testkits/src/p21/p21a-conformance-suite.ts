/**
 * P21-A Conformance Suite — Track Maintenance Invariants
 *
 * Parameterized test factory for the 9 track-maintenance invariants
 * (+ 1 optional id_robustness). Each it() block delegates to a shared
 * probe function from p21a-invariant-probes.ts — single source of truth.
 *
 * Import in test files:
 *   import { runP21AConformanceSuite } from '@conscious-bot/testkits/src/p21';
 *
 * Changes from original conformance suite:
 * - delta_budget removed (moved to P21-B emission layer)
 * - INV-4 uncertainty_monotonicity: mode-aware (conservative vs predictive)
 * - INV-5 uncertainty_suppression: classifyRiskDetailed-aware
 * - INV-6 hysteresis: parameterized via hysteresisBudget
 * - INV-9 features_not_required: renamed from features_excluded
 * - INV-10 id_robustness: new opt-in invariant
 */

import { describe, it } from 'vitest';
import type {
  P21ImplementationAdapter,
  P21RiskClassifier,
  P21BeliefMode,
  P21Extension,
} from '../../../planning/src/sterling/primitives/p21/p21-capsule-types';
import {
  probeINV01,
  probeINV02,
  probeINV03,
  probeINV04,
  probeINV04b,
  probeINV05,
  probeINV06,
  probeINV07,
  probeINV08,
  probeINV09,
  probeINV10,
  type ProbeConfig,
} from './p21a-invariant-probes';
import { createRunHandle, type P21RunHandle } from './run-handle';
import { P21A_INVARIANT_IDS } from './invariant-ids';

// ── Config ──────────────────────────────────────────────────────────

export interface P21AConformanceConfig {
  name: string;
  createAdapter: (classifier: P21RiskClassifier) => P21ImplementationAdapter;
  classifier: P21RiskClassifier;
  trackCap: number;
  /** Max deltas per emission in steady state. Default 0 (strict quiescence). */
  sparsityBudget?: number;
  /** pUnknown threshold above which risk must be suppressed. Default 0.5. */
  uncertaintyThreshold?: number;
  /** Belief mode: conservative suppresses risk under uncertainty; predictive does not. Default 'conservative'. */
  mode?: P21BeliefMode;
  /** Maximum reclassified deltas allowed under oscillation. Default 4. */
  hysteresisBudget?: number;
  /** Explicitly declared extensions. Extension-specific invariants only activate when declared. */
  declaredExtensions?: P21Extension[];
}

// ── Suite ───────────────────────────────────────────────────────────

export function runP21AConformanceSuite(config: P21AConformanceConfig): P21RunHandle {
  const {
    name,
    createAdapter,
    classifier,
    trackCap,
    sparsityBudget = 0,
    uncertaintyThreshold = 0.5,
    mode = 'conservative',
    hysteresisBudget = 4,
    declaredExtensions = [],
  } = config;

  const hasIdRobustness = declaredExtensions.includes('id_robustness');

  const probeConfig: ProbeConfig = {
    trackCap,
    sparsityBudget,
    uncertaintyThreshold,
    mode,
    hysteresisBudget,
    declaredExtensions,
  };

  const handle = createRunHandle(name, [...P21A_INVARIANT_IDS]);

  describe(`P21-A Conformance: ${name}`, () => {
    it('INV-1 determinism: same inputs produce identical snapshots and deltas', () => {
      return handle.record('P21A-INV-01', () => {
        probeINV01(createAdapter, classifier, probeConfig);
      });
    });

    it('INV-2 boundedness: track count never exceeds declared trackCap', () => {
      return handle.record('P21A-INV-02', () => {
        probeINV02(createAdapter, classifier, probeConfig);
      });
    });

    it('INV-3 event_sparsity: steady state delta rate <= declared sparsity budget', () => {
      return handle.record('P21A-INV-03', () => {
        probeINV03(createAdapter, classifier, probeConfig);
      });
    });

    it(`INV-4 uncertainty_monotonicity [${mode}]: unobserved track has non-decreasing pUnknown${mode === 'conservative' ? ' and non-increasing risk' : ''}`, () => {
      return handle.record('P21A-INV-04', () => {
        probeINV04(createAdapter, classifier, probeConfig);
      });
    });

    if (mode === 'predictive') {
      it('INV-4b predictive_accountability: predictive mode requires explainability extension', () => {
        return handle.record('P21A-INV-04b', () => {
          probeINV04b(createAdapter, classifier, probeConfig);
        });
      });
    }

    it('INV-5 uncertainty_suppression: pUnknown > threshold suppresses classification-derived risk', () => {
      return handle.record('P21A-INV-05', () => {
        probeINV05(createAdapter, classifier, probeConfig);
      });
    });

    it(`INV-6 hysteresis: oscillating proximity produces <= ${hysteresisBudget} reclassified deltas`, () => {
      return handle.record('P21A-INV-06', () => {
        probeINV06(createAdapter, classifier, probeConfig);
      });
    });

    it('INV-7 identity_persistence: occlusion gap followed by reappearance associates to same trackId', () => {
      return handle.record('P21A-INV-07', () => {
        probeINV07(createAdapter, classifier, probeConfig);
      });
    });

    it('INV-8 new_threat_completeness: every new_threat delta includes .track payload', () => {
      return handle.record('P21A-INV-08', () => {
        probeINV08(createAdapter, classifier, probeConfig);
      });
    });

    it('INV-9 features_not_required: features field does not affect trackId generation', () => {
      return handle.record('P21A-INV-09', () => {
        probeINV09(createAdapter, classifier, probeConfig);
      });
    });

    if (hasIdRobustness) {
      it('INV-10 id_robustness: new entityId with same class and position associates to same trackId', () => {
        return handle.record('P21A-INV-10', () => {
          probeINV10(createAdapter, classifier, probeConfig);
        });
      });
    }
  });

  return handle;
}

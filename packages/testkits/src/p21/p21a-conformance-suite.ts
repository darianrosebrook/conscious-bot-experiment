/**
 * P21-A Conformance Suite — Track Maintenance Invariants
 *
 * Parameterized test factory for the 9 track-maintenance invariants
 * (+ 1 optional id_robustness). Replaces the original monolithic
 * p21-conformance-suite.ts with Pivot 1–3 updates applied.
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

import { describe, it, expect } from 'vitest';
import type {
  P21ImplementationAdapter,
  P21RiskClassifier,
  P21EvidenceItem,
  P21BeliefMode,
  P21Extension,
} from '../../../planning/src/sterling/primitives/p21/p21-capsule-types';
import { makeItem, batch, riskOrd, firstRiskClass } from './helpers';

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

export function runP21AConformanceSuite(config: P21AConformanceConfig) {
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

  const hasRiskComponentsV1 = declaredExtensions.includes('risk_components_v1');
  const hasIdRobustness = declaredExtensions.includes('id_robustness');
  const hasPredictiveModel = declaredExtensions.includes('predictive_model');

  const riskLabel = firstRiskClass(classifier);

  describe(`P21-A Conformance: ${name}`, () => {
    // INV-1: determinism — two adapters, same stream, compare JSON snapshots
    it('INV-1 determinism: same inputs produce identical snapshots and deltas', () => {
      const adapterA = createAdapter(classifier);
      const adapterB = createAdapter(classifier);

      const allDeltasA: unknown[] = [];
      const allDeltasB: unknown[] = [];

      for (let t = 1; t <= 20; t++) {
        const items: P21EvidenceItem[] = [
          makeItem({ entityId: 100, classLabel: riskLabel, proximityBucket: 3, posBucketX: 10 }),
        ];
        if (t >= 5) {
          items.push(
            makeItem({ entityId: 200, classLabel: riskLabel, proximityBucket: 6, posBucketX: -5, classEnum: 2 }),
          );
        }

        const dA = adapterA.ingest(batch(t, items));
        const dB = adapterB.ingest(batch(t, items));
        allDeltasA.push(...dA);
        allDeltasB.push(...dB);

        const tA = adapterA.tick(t);
        const tB = adapterB.tick(t);
        allDeltasA.push(...tA);
        allDeltasB.push(...tB);
      }

      // Snapshots must be identical
      const snapA = adapterA.getSnapshot(20);
      const snapB = adapterB.getSnapshot(20);
      expect(JSON.stringify(snapA)).toBe(JSON.stringify(snapB));

      // Deltas must be identical
      expect(JSON.stringify(allDeltasA)).toBe(JSON.stringify(allDeltasB));
    });

    // INV-2: boundedness — trackCap+20 entities, size <= trackCap
    it('INV-2 boundedness: track count never exceeds declared trackCap', () => {
      const adapter = createAdapter(classifier);
      const items: P21EvidenceItem[] = [];

      for (let i = 0; i < trackCap + 20; i++) {
        items.push(
          makeItem({
            entityId: i + 100,
            classLabel: riskLabel,
            proximityBucket: 3,
            posBucketX: i * 10,
          }),
        );
      }

      adapter.ingest(batch(1, items));
      expect(adapter.size).toBeLessThanOrEqual(trackCap);
    });

    // INV-3: event_sparsity — stable scene after warmup produces <= sparsityBudget deltas
    it('INV-3 event_sparsity: steady state delta rate <= declared sparsity budget', () => {
      const adapter = createAdapter(classifier);
      const item = makeItem({ entityId: 10, classLabel: riskLabel, proximityBucket: 3 });

      // Warmup phase
      adapter.ingest(batch(1, [item]));
      adapter.tick(1);
      adapter.ingest(batch(2, [item]));
      adapter.tick(2);

      // Stable phase: 20 identical observations, count all deltas
      let totalDeltas = 0;
      for (let t = 3; t <= 22; t++) {
        const d1 = adapter.ingest(batch(t, [item]));
        const d2 = adapter.tick(t);
        totalDeltas += d1.length + d2.length;
      }

      expect(totalDeltas).toBeLessThanOrEqual(sparsityBudget);
    });

    // INV-4: uncertainty_monotonicity
    // Conservative mode: pUnknown non-decreasing AND riskLevel non-increasing
    // Predictive mode: pUnknown non-decreasing only (risk may persist)
    it(`INV-4 uncertainty_monotonicity [${mode}]: unobserved track has non-decreasing pUnknown${mode === 'conservative' ? ' and non-increasing risk' : ''}`, () => {
      const adapter = createAdapter(classifier);
      const item = makeItem({
        entityId: 10,
        classLabel: riskLabel,
        proximityBucket: 3,
        los: 'visible',
      });

      // Create and warm up the track
      adapter.ingest(batch(1, [item]));
      adapter.tick(1);
      adapter.ingest(batch(2, [item]));
      adapter.tick(2);

      // Stop observing — track pUnknown and risk
      let prevPUnknown = -1;
      let prevRiskOrd = Infinity;

      for (let t = 3; t <= 22; t++) {
        adapter.ingest(batch(t, [])); // no observations
        adapter.tick(t);

        const snap = adapter.getSnapshot(t);
        const track = snap.tracks.find(
          (tr) => tr.classLabel === riskLabel && tr.pUnknown > 0,
        );

        if (track) {
          // pUnknown must be non-decreasing (always, regardless of mode)
          expect(track.pUnknown).toBeGreaterThanOrEqual(prevPUnknown);
          prevPUnknown = track.pUnknown;

          if (mode === 'conservative') {
            // riskLevel ordinal must be non-increasing in conservative mode
            const currentRiskOrd = riskOrd(track.riskLevel);
            expect(currentRiskOrd).toBeLessThanOrEqual(prevRiskOrd);
            prevRiskOrd = currentRiskOrd;
          }
        }
      }

      // We should have observed at least some drift
      expect(prevPUnknown).toBeGreaterThan(0);
    });

    // INV-4b: predictive_accountability — predictive mode requires explainability extension
    if (mode === 'predictive') {
      it('INV-4b predictive_accountability: predictive mode requires explainability extension', () => {
        expect(hasRiskComponentsV1 || hasPredictiveModel).toBe(true);
      });
    }

    // INV-5: uncertainty_suppression
    // Base contract: classification-derived risk must be suppressed when pUnknown > threshold.
    //   Without risk_components_v1: overall riskLevel must drop to 'low' or below.
    //   This is correct when all risk is classification-derived (no presence risk).
    // Extension contract (risk_components_v1): classificationRisk is suppressed independently;
    //   presenceRisk is intentionally unconstrained by pUnknown (a nearby entity is still
    //   nearby even if we're uncertain about its class). riskLevel is a normative combiner
    //   that must be >= max(classificationRisk, presenceRisk).
    it('INV-5 uncertainty_suppression: pUnknown > threshold suppresses classification-derived risk', () => {
      const adapter = createAdapter(classifier);
      const item = makeItem({
        entityId: 10,
        classLabel: riskLabel,
        proximityBucket: 1, // very close — would be high/critical risk if certain
        los: 'visible',
      });

      // Create and warm up
      adapter.ingest(batch(1, [item]));
      adapter.tick(1);
      adapter.ingest(batch(2, [item]));
      adapter.tick(2);

      // Verify track has non-none risk initially (close proximity + risk class)
      const snapBefore = adapter.getSnapshot(2);
      const trackBefore = snapBefore.tracks.find((tr) => tr.classLabel === riskLabel);
      expect(trackBefore).toBeDefined();
      expect(riskOrd(trackBefore!.riskLevel)).toBeGreaterThan(riskOrd('none'));

      // Stop observing until pUnknown > threshold
      for (let t = 3; t <= 40; t++) {
        adapter.ingest(batch(t, []));
        adapter.tick(t);
      }

      const snapAfter = adapter.getSnapshot(40);
      const trackAfter = snapAfter.tracks.find(
        (tr) => tr.classLabel === riskLabel && tr.pUnknown > uncertaintyThreshold,
      );

      if (trackAfter) {
        if (hasRiskComponentsV1) {
          // Declaration-gated: extension declared → method must exist (fail-closed)
          expect(classifier.classifyRiskDetailed).toBeDefined();
          const detail = classifier.classifyRiskDetailed!(
            trackAfter.classLabel,
            trackAfter.proximityBucket,
            trackAfter.pUnknown,
          );
          // classificationRisk should be non-increasing (suppressed)
          expect(riskOrd(detail.classificationRisk)).toBeLessThanOrEqual(riskOrd('low'));
          // riskLevel >= presenceRisk (presence risk can't exceed final)
          expect(riskOrd(detail.riskLevel)).toBeGreaterThanOrEqual(riskOrd(detail.presenceRisk));
          // Normative combiner: riskLevel >= max(classificationRisk, presenceRisk)
          expect(riskOrd(detail.riskLevel)).toBeGreaterThanOrEqual(
            Math.max(riskOrd(detail.classificationRisk), riskOrd(detail.presenceRisk)),
          );
        } else {
          // Simple mode: risk must be suppressed to 'low' or below
          expect(riskOrd(trackAfter.riskLevel)).toBeLessThanOrEqual(riskOrd('low'));
        }
      }
      // If track was evicted (pUnknown → confidence too low), that also satisfies suppression
    });

    // INV-6: hysteresis — oscillating input produces bounded reclassified delta count
    it(`INV-6 hysteresis: oscillating proximity produces <= ${hysteresisBudget} reclassified deltas`, () => {
      const adapter = createAdapter(classifier);
      const evidenceAt = (proximityBucket: number) =>
        makeItem({ entityId: 10, classLabel: riskLabel, proximityBucket, los: 'visible' });

      // Warmup
      adapter.ingest(batch(1, [evidenceAt(3)]));
      adapter.tick(1);
      adapter.ingest(batch(2, [evidenceAt(3)]));
      adapter.tick(2);

      // Oscillate between bucket 3 and 4 for 20 ticks
      let reclassifiedCount = 0;
      for (let t = 3; t <= 22; t++) {
        const prox = t % 2 === 0 ? 3 : 4;
        const deltas = adapter.ingest(batch(t, [evidenceAt(prox)]));
        const tickDeltas = adapter.tick(t);
        reclassifiedCount += [...deltas, ...tickDeltas].filter(
          (d) => d.type === 'reclassified',
        ).length;
      }

      // Hysteresis/cooldown should suppress most oscillation
      expect(reclassifiedCount).toBeLessThanOrEqual(hysteresisBudget);
    });

    // INV-7: identity_persistence — occlude 5 ticks, reappear = same trackId
    it('INV-7 identity_persistence: occlusion gap followed by reappearance associates to same trackId', () => {
      const adapter = createAdapter(classifier);
      const item = makeItem({
        entityId: 10,
        classLabel: riskLabel,
        proximityBucket: 3,
        posBucketX: 5,
        los: 'visible',
      });

      // Create and warm up
      adapter.ingest(batch(1, [item]));
      adapter.tick(1);
      adapter.ingest(batch(2, [item]));
      adapter.tick(2);

      // Capture the trackId
      const snapBefore = adapter.getSnapshot(2);
      const trackBefore = snapBefore.tracks.find((tr) => tr.classLabel === riskLabel);
      expect(trackBefore).toBeDefined();
      const originalTrackId = trackBefore!.trackId;

      // Occlude for 5 ticks
      for (let t = 3; t <= 7; t++) {
        adapter.ingest(batch(t, []));
        adapter.tick(t);
      }

      // Reappear at same position with same entityId
      adapter.ingest(batch(8, [item]));
      adapter.tick(8);

      const snapAfter = adapter.getSnapshot(8);
      const trackAfter = snapAfter.tracks.find((tr) => tr.classLabel === riskLabel);
      expect(trackAfter).toBeDefined();
      expect(trackAfter!.trackId).toBe(originalTrackId);
    });

    // INV-8: new_threat_completeness — every new_threat delta includes .track
    it('INV-8 new_threat_completeness: every new_threat delta includes .track payload', () => {
      const adapter = createAdapter(classifier);

      // Create several entities over warmup window
      const allDeltas: Array<{ type: string; track?: unknown }> = [];

      for (let t = 1; t <= 10; t++) {
        const items: P21EvidenceItem[] = [];
        for (let i = 0; i < Math.min(5, t); i++) {
          items.push(
            makeItem({
              entityId: i + 100,
              classLabel: riskLabel,
              proximityBucket: 3,
              posBucketX: i * 10,
              classEnum: i + 1,
            }),
          );
        }

        const d = adapter.ingest(batch(t, items));
        const td = adapter.tick(t);
        allDeltas.push(...d, ...td);
      }

      const newThreatDeltas = allDeltas.filter((d) => d.type === 'new_threat');
      // Should have at least one new_threat
      expect(newThreatDeltas.length).toBeGreaterThan(0);

      // Every new_threat must include .track
      for (const delta of newThreatDeltas) {
        expect(delta.track).toBeDefined();
      }
    });

    // INV-9: features_not_required — same evidence with different features produce same trackId
    it('INV-9 features_not_required: features field does not affect trackId generation', () => {
      const adapterA = createAdapter(classifier);
      const adapterB = createAdapter(classifier);

      const baseItem: P21EvidenceItem = makeItem({
        entityId: 10,
        classLabel: riskLabel,
        proximityBucket: 3,
        posBucketX: 5,
        los: 'visible',
      });

      const itemWithFeaturesA: P21EvidenceItem = {
        ...baseItem,
        features: { health: 20, weapon: 'sword' },
      };
      const itemWithFeaturesB: P21EvidenceItem = {
        ...baseItem,
        features: { health: 5, weapon: 'bow' },
      };

      // Feed different features to each adapter
      adapterA.ingest(batch(1, [itemWithFeaturesA]));
      adapterA.tick(1);
      adapterB.ingest(batch(1, [itemWithFeaturesB]));
      adapterB.tick(1);

      adapterA.ingest(batch(2, [itemWithFeaturesA]));
      adapterA.tick(2);
      adapterB.ingest(batch(2, [itemWithFeaturesB]));
      adapterB.tick(2);

      const snapA = adapterA.getSnapshot(2);
      const snapB = adapterB.getSnapshot(2);

      expect(snapA.tracks.length).toBe(1);
      expect(snapB.tracks.length).toBe(1);

      // TrackIds must be identical despite different features
      expect(snapA.tracks[0].trackId).toBe(snapB.tracks[0].trackId);
    });

    // INV-10 (opt-in): id_robustness — new entityId + same class/pos → same trackId
    if (hasIdRobustness) {
      it('INV-10 id_robustness: new entityId with same class and position associates to same trackId', () => {
        const adapter = createAdapter(classifier);
        const item = makeItem({
          entityId: 10,
          classLabel: riskLabel,
          proximityBucket: 3,
          posBucketX: 5,
          los: 'visible',
        });

        // Create and warm up
        adapter.ingest(batch(1, [item]));
        adapter.tick(1);
        adapter.ingest(batch(2, [item]));
        adapter.tick(2);

        // Capture the trackId
        const snapBefore = adapter.getSnapshot(2);
        const trackBefore = snapBefore.tracks.find((tr) => tr.classLabel === riskLabel);
        expect(trackBefore).toBeDefined();
        const originalTrackId = trackBefore!.trackId;

        // Same class + same position but NEW entityId
        const newIdItem = makeItem({
          entityId: 999,
          classLabel: riskLabel,
          proximityBucket: 3,
          posBucketX: 5,
          los: 'visible',
        });

        // Brief gap, then reappear with different entityId
        adapter.ingest(batch(3, []));
        adapter.tick(3);
        adapter.ingest(batch(4, [newIdItem]));
        adapter.tick(4);

        const snapAfter = adapter.getSnapshot(4);
        const trackAfter = snapAfter.tracks.find((tr) => tr.classLabel === riskLabel);
        expect(trackAfter).toBeDefined();
        expect(trackAfter!.trackId).toBe(originalTrackId);
      });
    }
  });
}

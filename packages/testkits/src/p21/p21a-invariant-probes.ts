/**
 * P21-A Invariant Probes — Single Source of Truth
 *
 * Each probe function encapsulates one P21-A invariant's test logic.
 * Used by:
 *   - p21a-conformance-suite.ts (production conformance via it() wrappers)
 *   - p21a-needle-breaks.test.ts (mutation harness — runs probes under mutated adapters)
 *
 * Probes use vitest expect() for assertions and throw on violation.
 * Returns void on pass.
 */

import { expect } from 'vitest';
import type {
  P21ImplementationAdapter,
  P21RiskClassifier,
  P21EvidenceItem,
  P21BeliefMode,
  P21Extension,
} from '../../../planning/src/sterling/primitives/p21/p21-capsule-types';
import { makeItem, batch, riskOrd, firstRiskClass } from './helpers';

// ── Config ──────────────────────────────────────────────────────────

export interface ProbeConfig {
  trackCap: number;
  sparsityBudget: number;
  uncertaintyThreshold: number;
  mode: P21BeliefMode;
  hysteresisBudget: number;
  declaredExtensions: P21Extension[];
}

export type AdapterFactory = (classifier: P21RiskClassifier) => P21ImplementationAdapter;

// ── Probe helpers ───────────────────────────────────────────────────

function resolveExtensions(config: ProbeConfig) {
  return {
    hasRiskComponentsV1: config.declaredExtensions.includes('risk_components_v1'),
    hasIdRobustness: config.declaredExtensions.includes('id_robustness'),
    hasPredictiveModel: config.declaredExtensions.includes('predictive_model'),
  };
}

// ── INV-1: determinism ──────────────────────────────────────────────

export function probeINV01(
  createAdapter: AdapterFactory,
  classifier: P21RiskClassifier,
  config: ProbeConfig,
): void {
  const riskLabel = firstRiskClass(classifier);
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

  const snapA = adapterA.getSnapshot(20);
  const snapB = adapterB.getSnapshot(20);
  expect(JSON.stringify(snapA)).toBe(JSON.stringify(snapB));
  expect(JSON.stringify(allDeltasA)).toBe(JSON.stringify(allDeltasB));
}

// ── INV-2: boundedness ──────────────────────────────────────────────

export function probeINV02(
  createAdapter: AdapterFactory,
  classifier: P21RiskClassifier,
  config: ProbeConfig,
): void {
  const riskLabel = firstRiskClass(classifier);
  const adapter = createAdapter(classifier);
  const items: P21EvidenceItem[] = [];

  for (let i = 0; i < config.trackCap + 20; i++) {
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
  expect(adapter.size).toBeLessThanOrEqual(config.trackCap);
}

// ── INV-3: event_sparsity ───────────────────────────────────────────

export function probeINV03(
  createAdapter: AdapterFactory,
  classifier: P21RiskClassifier,
  config: ProbeConfig,
): void {
  const riskLabel = firstRiskClass(classifier);
  const adapter = createAdapter(classifier);
  const item = makeItem({ entityId: 10, classLabel: riskLabel, proximityBucket: 3 });

  adapter.ingest(batch(1, [item]));
  adapter.tick(1);
  adapter.ingest(batch(2, [item]));
  adapter.tick(2);

  let totalDeltas = 0;
  for (let t = 3; t <= 22; t++) {
    const d1 = adapter.ingest(batch(t, [item]));
    const d2 = adapter.tick(t);
    totalDeltas += d1.length + d2.length;
  }

  expect(totalDeltas).toBeLessThanOrEqual(config.sparsityBudget);
}

// ── INV-4: uncertainty_monotonicity ─────────────────────────────────

export function probeINV04(
  createAdapter: AdapterFactory,
  classifier: P21RiskClassifier,
  config: ProbeConfig,
): void {
  const riskLabel = firstRiskClass(classifier);
  const adapter = createAdapter(classifier);
  const item = makeItem({
    entityId: 10,
    classLabel: riskLabel,
    proximityBucket: 3,
    los: 'visible',
  });

  adapter.ingest(batch(1, [item]));
  adapter.tick(1);
  adapter.ingest(batch(2, [item]));
  adapter.tick(2);

  let prevPUnknown = -1;
  let prevRiskOrd = Infinity;

  for (let t = 3; t <= 22; t++) {
    adapter.ingest(batch(t, []));
    adapter.tick(t);

    const snap = adapter.getSnapshot(t);
    const track = snap.tracks.find(
      (tr) => tr.classLabel === riskLabel && tr.pUnknown > 0,
    );

    if (track) {
      expect(track.pUnknown).toBeGreaterThanOrEqual(prevPUnknown);
      prevPUnknown = track.pUnknown;

      if (config.mode === 'conservative') {
        const currentRiskOrd = riskOrd(track.riskLevel);
        expect(currentRiskOrd).toBeLessThanOrEqual(prevRiskOrd);
        prevRiskOrd = currentRiskOrd;
      }
    }
  }

  expect(prevPUnknown).toBeGreaterThan(0);
}

// ── INV-4b: predictive_accountability ───────────────────────────────

export function probeINV04b(
  _createAdapter: AdapterFactory,
  _classifier: P21RiskClassifier,
  config: ProbeConfig,
): void {
  const { hasRiskComponentsV1, hasPredictiveModel } = resolveExtensions(config);
  expect(hasRiskComponentsV1 || hasPredictiveModel).toBe(true);
}

// ── INV-5: uncertainty_suppression ──────────────────────────────────

export function probeINV05(
  createAdapter: AdapterFactory,
  classifier: P21RiskClassifier,
  config: ProbeConfig,
): void {
  const { hasRiskComponentsV1 } = resolveExtensions(config);
  const riskLabel = firstRiskClass(classifier);
  const adapter = createAdapter(classifier);
  const item = makeItem({
    entityId: 10,
    classLabel: riskLabel,
    proximityBucket: 1,
    los: 'visible',
  });

  adapter.ingest(batch(1, [item]));
  adapter.tick(1);
  adapter.ingest(batch(2, [item]));
  adapter.tick(2);

  const snapBefore = adapter.getSnapshot(2);
  const trackBefore = snapBefore.tracks.find((tr) => tr.classLabel === riskLabel);
  expect(trackBefore).toBeDefined();
  expect(riskOrd(trackBefore!.riskLevel)).toBeGreaterThan(riskOrd('none'));

  for (let t = 3; t <= 40; t++) {
    adapter.ingest(batch(t, []));
    adapter.tick(t);
  }

  const snapAfter = adapter.getSnapshot(40);
  const trackAfter = snapAfter.tracks.find(
    (tr) => tr.classLabel === riskLabel && tr.pUnknown > config.uncertaintyThreshold,
  );

  if (trackAfter) {
    if (hasRiskComponentsV1) {
      expect(classifier.classifyRiskDetailed).toBeDefined();
      const detail = classifier.classifyRiskDetailed!(
        trackAfter.classLabel,
        trackAfter.proximityBucket,
        trackAfter.pUnknown,
      );
      expect(riskOrd(detail.classificationRisk)).toBeLessThanOrEqual(riskOrd('low'));
      expect(riskOrd(detail.riskLevel)).toBeGreaterThanOrEqual(riskOrd(detail.presenceRisk));
      expect(riskOrd(detail.riskLevel)).toBeGreaterThanOrEqual(
        Math.max(riskOrd(detail.classificationRisk), riskOrd(detail.presenceRisk)),
      );
    } else {
      expect(riskOrd(trackAfter.riskLevel)).toBeLessThanOrEqual(riskOrd('low'));
    }
  }
}

// ── INV-6: hysteresis ───────────────────────────────────────────────

export function probeINV06(
  createAdapter: AdapterFactory,
  classifier: P21RiskClassifier,
  config: ProbeConfig,
): void {
  const riskLabel = firstRiskClass(classifier);
  const adapter = createAdapter(classifier);
  const evidenceAt = (proximityBucket: number) =>
    makeItem({ entityId: 10, classLabel: riskLabel, proximityBucket, los: 'visible' });

  adapter.ingest(batch(1, [evidenceAt(3)]));
  adapter.tick(1);
  adapter.ingest(batch(2, [evidenceAt(3)]));
  adapter.tick(2);

  let reclassifiedCount = 0;
  for (let t = 3; t <= 22; t++) {
    const prox = t % 2 === 0 ? 3 : 4;
    const deltas = adapter.ingest(batch(t, [evidenceAt(prox)]));
    const tickDeltas = adapter.tick(t);
    reclassifiedCount += [...deltas, ...tickDeltas].filter(
      (d) => d.type === 'reclassified',
    ).length;
  }

  expect(reclassifiedCount).toBeLessThanOrEqual(config.hysteresisBudget);
}

// ── INV-7: identity_persistence ─────────────────────────────────────

export function probeINV07(
  createAdapter: AdapterFactory,
  classifier: P21RiskClassifier,
  _config: ProbeConfig,
): void {
  const riskLabel = firstRiskClass(classifier);
  const adapter = createAdapter(classifier);
  const item = makeItem({
    entityId: 10,
    classLabel: riskLabel,
    proximityBucket: 3,
    posBucketX: 5,
    los: 'visible',
  });

  adapter.ingest(batch(1, [item]));
  adapter.tick(1);
  adapter.ingest(batch(2, [item]));
  adapter.tick(2);

  const snapBefore = adapter.getSnapshot(2);
  const trackBefore = snapBefore.tracks.find((tr) => tr.classLabel === riskLabel);
  expect(trackBefore).toBeDefined();
  const originalTrackId = trackBefore!.trackId;

  for (let t = 3; t <= 7; t++) {
    adapter.ingest(batch(t, []));
    adapter.tick(t);
  }

  adapter.ingest(batch(8, [item]));
  adapter.tick(8);

  const snapAfter = adapter.getSnapshot(8);
  const trackAfter = snapAfter.tracks.find((tr) => tr.classLabel === riskLabel);
  expect(trackAfter).toBeDefined();
  expect(trackAfter!.trackId).toBe(originalTrackId);
}

// ── INV-8: new_threat_completeness ──────────────────────────────────

export function probeINV08(
  createAdapter: AdapterFactory,
  classifier: P21RiskClassifier,
  _config: ProbeConfig,
): void {
  const riskLabel = firstRiskClass(classifier);
  const adapter = createAdapter(classifier);

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
  expect(newThreatDeltas.length).toBeGreaterThan(0);

  for (const delta of newThreatDeltas) {
    expect(delta.track).toBeDefined();
  }
}

// ── INV-9: features_not_required ────────────────────────────────────

export function probeINV09(
  createAdapter: AdapterFactory,
  classifier: P21RiskClassifier,
  _config: ProbeConfig,
): void {
  const riskLabel = firstRiskClass(classifier);
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

  expect(snapA.tracks[0].trackId).toBe(snapB.tracks[0].trackId);
}

// ── INV-10: id_robustness (opt-in) ─────────────────────────────────

export function probeINV10(
  createAdapter: AdapterFactory,
  classifier: P21RiskClassifier,
  _config: ProbeConfig,
): void {
  const riskLabel = firstRiskClass(classifier);
  const adapter = createAdapter(classifier);
  const item = makeItem({
    entityId: 10,
    classLabel: riskLabel,
    proximityBucket: 3,
    posBucketX: 5,
    los: 'visible',
  });

  adapter.ingest(batch(1, [item]));
  adapter.tick(1);
  adapter.ingest(batch(2, [item]));
  adapter.tick(2);

  const snapBefore = adapter.getSnapshot(2);
  const trackBefore = snapBefore.tracks.find((tr) => tr.classLabel === riskLabel);
  expect(trackBefore).toBeDefined();
  const originalTrackId = trackBefore!.trackId;

  const newIdItem = makeItem({
    entityId: 999,
    classLabel: riskLabel,
    proximityBucket: 3,
    posBucketX: 5,
    los: 'visible',
  });

  adapter.ingest(batch(3, []));
  adapter.tick(3);
  adapter.ingest(batch(4, [newIdItem]));
  adapter.tick(4);

  const snapAfter = adapter.getSnapshot(4);
  const trackAfter = snapAfter.tracks.find((tr) => tr.classLabel === riskLabel);
  expect(trackAfter).toBeDefined();
  expect(trackAfter!.trackId).toBe(originalTrackId);
}

// ── Invariant registry (for needle-break harness) ───────────────────

export interface InvariantProbeEntry {
  id: string;
  name: string;
  probe: (createAdapter: AdapterFactory, classifier: P21RiskClassifier, config: ProbeConfig) => void;
  /** If set, probe only runs when this condition is met */
  guard?: (config: ProbeConfig) => boolean;
}

export const P21A_PROBE_REGISTRY: InvariantProbeEntry[] = [
  { id: 'INV-1', name: 'determinism', probe: probeINV01 },
  { id: 'INV-2', name: 'boundedness', probe: probeINV02 },
  { id: 'INV-3', name: 'event_sparsity', probe: probeINV03 },
  { id: 'INV-4', name: 'uncertainty_monotonicity', probe: probeINV04 },
  { id: 'INV-4b', name: 'predictive_accountability', probe: probeINV04b,
    guard: (config) => config.mode === 'predictive' },
  { id: 'INV-5', name: 'uncertainty_suppression', probe: probeINV05 },
  { id: 'INV-6', name: 'hysteresis', probe: probeINV06 },
  { id: 'INV-7', name: 'identity_persistence', probe: probeINV07 },
  { id: 'INV-8', name: 'new_threat_completeness', probe: probeINV08 },
  { id: 'INV-9', name: 'features_not_required', probe: probeINV09 },
  { id: 'INV-10', name: 'id_robustness', probe: probeINV10,
    guard: (config) => config.declaredExtensions.includes('id_robustness') },
];

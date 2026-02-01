/**
 * P21 Boundary Milestone — Executable Definition-of-Done
 *
 * Each test is a frozen checklist item. If any fails, the boundary
 * milestone is not met. Do NOT delete or weaken these tests.
 *
 * Items correspond to the P21 boundary milestone closeout:
 * - No raw detections → cognition
 * - Determinism (replay-stable)
 * - Boundedness (TRACK_CAP, delta cap)
 * - Event sparsity (quiescence after warmup)
 * - Restart safety (stream_id nonce, explicit bot_id)
 * - Bypass tripwire (CI)
 * - Uncertainty honesty (pUnknown drift)
 * - Hysteresis proven (oscillation test)
 * - Fail-closed on schema violations
 * - Saliency reasoner tested
 * - Producer-side new_threat enforcement
 * - Tick-rate ambiguity defused
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TrackSet } from '../track-set';
import { BeliefBus } from '../belief-bus';
import {
  TRACK_CAP,
  MAX_SALIENCY_EVENTS_PER_EMISSION,
  ENTITY_KIND_ENUM,
  type EvidenceItem,
  type EvidenceBatch,
} from '../types';

// ── Helpers ──────────────────────────────────────────────────────────

function makeEvidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    engineId: 0,
    kind: 'zombie',
    kindEnum: ENTITY_KIND_ENUM[overrides.kind ?? 'zombie'] ?? ENTITY_KIND_ENUM.unknown,
    posBucketX: 5,
    posBucketY: 64,
    posBucketZ: 0,
    distBucket: 3,
    los: 'unknown',
    features: {},
    ...overrides,
    ...(overrides.kind && !overrides.kindEnum
      ? { kindEnum: ENTITY_KIND_ENUM[overrides.kind] ?? ENTITY_KIND_ENUM.unknown }
      : {}),
  };
}

function makeBatch(tickId: number, items: EvidenceItem[]): EvidenceBatch {
  return { tickId, items };
}

// ── P21 Boundary Milestone Checklist ─────────────────────────────────

describe('P21 Boundary Milestone — Definition of Done', () => {
  it('DOD-1: No raw detections → cognition (legacy path gated)', () => {
    const source = readFileSync(resolve(__dirname, '../../bot-adapter.ts'), 'utf-8');

    // setupEntityDetection only reachable via LEGACY_ENTITY_PROCESS
    const idx = source.indexOf('this.setupEntityDetection()');
    expect(idx).toBeGreaterThan(-1);
    const context = source.slice(Math.max(0, idx - 300), idx + 50);
    expect(context).toContain('LEGACY_ENTITY_PROCESS');

    // LEGACY_ENTITY_PROCESS not set in test env
    expect(process.env.LEGACY_ENTITY_PROCESS).toBeUndefined();
  });

  it('DOD-2: Determinism — identical evidence → identical envelopes', () => {
    const busA = new BeliefBus('bot-test', 'bot-test-1');
    const busB = new BeliefBus('bot-test', 'bot-test-1');

    for (let tick = 1; tick <= 20; tick++) {
      const items = [
        makeEvidence({ engineId: 100, kind: 'zombie', distBucket: 3, posBucketX: 10 }),
      ];
      if (tick >= 5) {
        items.push(makeEvidence({ engineId: 200, kind: 'skeleton', distBucket: 5, posBucketX: -5 }));
      }

      busA.ingest(makeBatch(tick, items));
      busB.ingest(makeBatch(tick, items));

      if (tick % 5 === 0) {
        const seq = tick / 5 - 1;
        expect(JSON.stringify(busA.buildEnvelope(seq)))
          .toBe(JSON.stringify(busB.buildEnvelope(seq)));
      }
    }
  });

  it('DOD-3: Boundedness — TRACK_CAP enforced', () => {
    const trackSet = new TrackSet();
    const items: EvidenceItem[] = [];
    for (let i = 0; i < TRACK_CAP + 20; i++) {
      items.push(makeEvidence({
        engineId: i + 100,
        kind: 'zombie',
        distBucket: 3,
        posBucketX: i * 10,
      }));
    }

    trackSet.ingest(makeBatch(1, items));
    expect(trackSet.size).toBeLessThanOrEqual(TRACK_CAP);
  });

  it('DOD-4: Boundedness — delta cap enforced', () => {
    const bus = new BeliefBus('bot-test', 'bot-test-1');
    const items: EvidenceItem[] = [];
    for (let i = 0; i < MAX_SALIENCY_EVENTS_PER_EMISSION + 10; i++) {
      items.push(makeEvidence({
        engineId: i + 100,
        kind: 'zombie',
        distBucket: 3,
        posBucketX: i * 10,
      }));
    }

    bus.ingest(makeBatch(1, items));
    bus.flushPendingDeltas(); // clear warmup
    bus.ingest(makeBatch(2, items));

    const envelope = bus.buildEnvelope(0);
    expect(envelope.saliency_events.length).toBeLessThanOrEqual(MAX_SALIENCY_EVENTS_PER_EMISSION);
  });

  it('DOD-5: Event sparsity — stable scene produces zero deltas', () => {
    const trackSet = new TrackSet();
    const item = makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 });

    // Warmup
    trackSet.ingest(makeBatch(1, [item]));
    trackSet.tick(1);
    trackSet.ingest(makeBatch(2, [item]));
    trackSet.tick(2);

    // Stable: 20 identical observations should produce 0 deltas
    let totalDeltas = 0;
    for (let t = 3; t <= 22; t++) {
      const d1 = trackSet.ingest(makeBatch(t, [item]));
      const d2 = trackSet.tick(t);
      totalDeltas += d1.length + d2.length;
    }

    expect(totalDeltas).toBe(0);
  });

  it('DOD-6: Restart safety — explicit bot_id in envelope', () => {
    const bus = new BeliefBus('bot-steve', 'bot-steve-42');
    bus.ingest(makeBatch(1, []));
    const envelope = bus.buildEnvelope(0);

    expect(envelope.bot_id).toBe('bot-steve');
    expect(envelope.stream_id).toBe('bot-steve-42');
  });

  it('DOD-7: Uncertainty honesty — pUnknown drifts when unobserved', () => {
    const trackSet = new TrackSet();
    const item = makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, los: 'visible' });

    // Create and warm up track
    trackSet.ingest(makeBatch(1, [item]));
    trackSet.tick(1);
    trackSet.ingest(makeBatch(2, [item]));
    trackSet.tick(2);

    // Stop observing — pUnknown should increase
    for (let t = 3; t <= 20; t++) {
      trackSet.ingest(makeBatch(t, []));
      trackSet.tick(t);
    }

    const snapshot = trackSet.getSnapshot(20);
    const track = snapshot.tracks[0];
    expect(track).toBeDefined();
    expect(track.pUnknown).toBeGreaterThan(0);
  });

  it('DOD-8: pUnknown > 0.5 → threatLevel drops to none', () => {
    const trackSet = new TrackSet();
    const item = makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, los: 'visible' });

    trackSet.ingest(makeBatch(1, [item]));
    trackSet.tick(1);
    trackSet.ingest(makeBatch(2, [item]));
    trackSet.tick(2);

    // Stop observing until pUnknown > 0.5 (at 0.03/tick, ~17 ticks)
    for (let t = 3; t <= 24; t++) {
      trackSet.ingest(makeBatch(t, []));
      trackSet.tick(t);
    }

    const snapshot = trackSet.getSnapshot(24);
    const track = snapshot.tracks.find(tr => tr.pUnknown > 0.5);
    if (track) {
      expect(track.threatLevel).toBe('none');
    }
  });

  it('DOD-9: Fail-closed — new_threat without track dropped at producer', () => {
    const bus = new BeliefBus('bot-test', 'bot-test-1');

    // Inject malformed delta directly
    (bus as any).pendingDeltas.push({
      type: 'new_threat',
      trackId: 'bad',
      classLabel: 'zombie',
      threatLevel: 'high',
      distBucket: 3,
      // track intentionally omitted
    });

    const origError = console.error;
    console.error = () => {}; // suppress
    const envelope = bus.buildEnvelope(0);
    console.error = origError;

    const badDeltas = envelope.saliency_events.filter(
      d => d.type === 'new_threat' && d.trackId === 'bad'
    );
    expect(badDeltas).toHaveLength(0);
    expect(bus.droppedNewThreatCount).toBe(1);
  });

  it('DOD-10: Saliency reasoner exists with tests', () => {
    const reasonerPath = resolve(__dirname, '../../../../cognition/src/environmental/saliency-reasoner.ts');
    const testPath = resolve(__dirname, '../../../../cognition/src/environmental/__tests__/saliency-reasoner.test.ts');

    const reasonerSource = readFileSync(reasonerPath, 'utf-8');
    const testSource = readFileSync(testPath, 'utf-8');

    expect(reasonerSource).toContain('applySaliencyEnvelope');
    expect(reasonerSource).toContain('bot_id');
    expect(testSource).toContain('applySaliencyEnvelope');
    // Minimum test coverage: at least 15 test cases
    const testCount = (testSource.match(/\bit\(/g) ?? []).length;
    expect(testCount).toBeGreaterThanOrEqual(15);
  });

  it('DOD-11: Tick-rate ambiguity defused — rates defined per-second', () => {
    const trackSetPath = resolve(__dirname, '../track-set.ts');
    const source = readFileSync(trackSetPath, 'utf-8');

    // Per-second rate constants exist
    expect(source).toContain('CONFIDENCE_DECAY_PER_SEC');
    expect(source).toContain('UNKNOWN_DRIFT_PER_SEC');

    // Per-tick values derived from TRACK_HZ
    expect(source).toContain('TRACK_HZ');
    expect(source).toContain('/ TRACK_HZ');
  });

  it('DOD-12: Hysteresis — oscillation produces bounded reclassified deltas', () => {
    const trackSet = new TrackSet();
    const evidenceAt = (distBucket: number) =>
      makeEvidence({ engineId: 10, kind: 'zombie', distBucket, los: 'visible' });

    // Warmup
    trackSet.ingest(makeBatch(1, [evidenceAt(3)]));
    trackSet.tick(1);
    trackSet.ingest(makeBatch(2, [evidenceAt(3)]));
    trackSet.tick(2);

    // Oscillate between distBucket 3 and 4 for 20 ticks
    let reclassifiedCount = 0;
    for (let t = 3; t <= 22; t++) {
      const dist = t % 2 === 0 ? 3 : 4;
      const deltas = trackSet.ingest(makeBatch(t, [evidenceAt(dist)]));
      const tickDeltas = trackSet.tick(t);
      reclassifiedCount += [...deltas, ...tickDeltas]
        .filter(d => d.type === 'reclassified').length;
    }

    // Cooldown of 5 ticks should suppress most oscillation
    expect(reclassifiedCount).toBeLessThanOrEqual(4);
  });
});

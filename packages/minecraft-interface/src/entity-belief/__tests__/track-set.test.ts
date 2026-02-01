import { describe, it, expect, beforeEach } from 'vitest';
import { TrackSet } from '../track-set';
import { EvidenceBatch, EvidenceItem, TRACK_CAP, ENTITY_KIND_ENUM } from '../types';

describe('TrackSet', () => {
  let trackSet: TrackSet;

  beforeEach(() => {
    trackSet = new TrackSet();
  });

  describe('ingest', () => {
    it('creates a new track on first evidence but defers new_threat until warmup', () => {
      const batch = makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]);

      const deltas = trackSet.ingest(batch);

      expect(trackSet.size).toBe(1);
      // Warmup: new_threat deferred until 2nd observation
      expect(deltas).toHaveLength(0);
    });

    it('emits new_threat after warmup (2nd observation)', () => {
      // First observation: track created, no delta
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      // Second observation: warmup met, new_threat emitted
      const deltas = trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      const newThreat = deltas.find(d => d.type === 'new_threat');
      expect(newThreat).toBeDefined();
      expect(newThreat!.classLabel).toBe('zombie');
      expect(newThreat!.distBucket).toBe(3);
      expect(newThreat!.track).toBeDefined(); // Full track state included
      expect(newThreat!.track!.trackId).toBeTruthy();
    });

    it('associates evidence to existing track by engineId', () => {
      // First + second ingest: warmup
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, posBucketX: 5 }),
      ]));
      trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, posBucketX: 5 }),
      ]));
      expect(trackSet.size).toBe(1);

      // Third ingest: same engineId, moved slightly within same bucket
      const deltas = trackSet.ingest(makeBatch(3, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, posBucketX: 6 }),
      ]));

      expect(trackSet.size).toBe(1); // Still one track
      // No new_threat (already emitted), no movement (same distBucket)
      expect(deltas.filter(d => d.type === 'new_threat')).toHaveLength(0);
    });

    it('emits movement_bucket_change when distance bucket changes', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 5 }),
      ]));

      const deltas = trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 2 }),
      ]));

      const moveDelta = deltas.find(d => d.type === 'movement_bucket_change' || d.type === 'reclassified');
      expect(moveDelta).toBeDefined();
    });

    it('emits reclassified when threat level changes', () => {
      // Start far (low threat)
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 6 }),
      ]));

      // Move close (high/critical threat)
      const deltas = trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 1 }),
      ]));

      const reclassified = deltas.find(d => d.type === 'reclassified');
      expect(reclassified).toBeDefined();
      expect(reclassified!.threatLevel).not.toBe('low');
    });
  });

  describe('determinism', () => {
    it('same inputs produce same deltas', () => {
      const batch = makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
        makeEvidence({ engineId: 11, kind: 'skeleton', distBucket: 5 }),
      ]);

      const ts1 = new TrackSet();
      const deltas1 = ts1.ingest(batch);

      const ts2 = new TrackSet();
      const deltas2 = ts2.ingest(batch);

      expect(deltas1.map(d => d.type)).toEqual(deltas2.map(d => d.type));
      expect(deltas1.map(d => d.classLabel)).toEqual(deltas2.map(d => d.classLabel));
      expect(deltas1.map(d => d.distBucket)).toEqual(deltas2.map(d => d.distBucket));
    });

    it('same inputs produce same trackId', () => {
      const batch = makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, posBucketX: 5 }),
      ]);

      const ts1 = new TrackSet();
      ts1.ingest(batch);
      const snap1 = ts1.getSnapshot(1);

      const ts2 = new TrackSet();
      ts2.ingest(batch);
      const snap2 = ts2.getSnapshot(1);

      expect(snap1.tracks[0].trackId).toBe(snap2.tracks[0].trackId);
    });
  });

  describe('boundedness (TRACK_CAP)', () => {
    it('never exceeds TRACK_CAP tracks', () => {
      const items: EvidenceItem[] = [];
      for (let i = 0; i < TRACK_CAP + 10; i++) {
        items.push(
          makeEvidence({
            engineId: i + 100,
            kind: 'zombie',
            distBucket: 3,
            posBucketX: i * 10, // Far apart so they don't associate
            posBucketY: 64,
            posBucketZ: 0,
          })
        );
      }

      trackSet.ingest(makeBatch(1, items));

      expect(trackSet.size).toBeLessThanOrEqual(TRACK_CAP);
    });
  });

  describe('tick / decay', () => {
    it('transitions visibility from visible to inferred after INFERRED_THRESHOLD ticks', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      // Tick without observation for 3 ticks (INFERRED_THRESHOLD)
      for (let t = 2; t <= 4; t++) {
        trackSet.tick(t);
      }

      const snapshot = trackSet.getSnapshot(4);
      expect(snapshot.tracks[0].visibility).toBe('inferred');
    });

    it('transitions from inferred to lost after LOST_THRESHOLD ticks', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      // Tick without observation for 15 ticks (LOST_THRESHOLD)
      let lostDelta = false;
      for (let t = 2; t <= 16; t++) {
        const deltas = trackSet.tick(t);
        if (deltas.some(d => d.type === 'track_lost')) {
          lostDelta = true;
        }
      }

      expect(lostDelta).toBe(true);
    });

    it('evicts tracks after EVICTION_THRESHOLD ticks without observation', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      expect(trackSet.size).toBe(1);

      // Tick without observation for 25+ ticks (EVICTION_THRESHOLD)
      for (let t = 2; t <= 27; t++) {
        trackSet.tick(t);
      }

      expect(trackSet.size).toBe(0);
    });

    it('does not decay tracks observed this tick', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      // Re-observe on tick 2
      trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      const snapshot = trackSet.getSnapshot(2);
      expect(snapshot.tracks[0].visibility).toBe('visible');
      expect(snapshot.tracks[0].confidence).toBeGreaterThan(0.8); // boosted
    });
  });

  describe('saliencyDiff / hysteresis', () => {
    it('returns null when no significant change', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      // Same position/threat
      const deltas = trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      // Should have no movement/reclassified deltas (only possible new_threat from first)
      const changeDelta = deltas.find(
        d => d.type === 'movement_bucket_change' || d.type === 'reclassified'
      );
      expect(changeDelta).toBeUndefined();
    });

    it('emits when distance bucket changes', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 5 }),
      ]));

      const deltas = trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      expect(deltas.length).toBeGreaterThan(0);
    });
  });

  describe('snapshot', () => {
    it('returns all tracks as TrackSummary', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
        makeEvidence({ engineId: 11, kind: 'skeleton', distBucket: 5 }),
      ]));

      const snapshot = trackSet.getSnapshot(1);

      expect(snapshot.tickId).toBe(1);
      expect(snapshot.tracks).toHaveLength(2);
      expect(snapshot.tracks.map(t => t.classLabel).sort()).toEqual(['skeleton', 'zombie']);
    });
  });

  describe('threat classification', () => {
    it('classifies hostile entities near bot as critical', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 0 }),
      ]));

      const snapshot = trackSet.getSnapshot(1);
      expect(snapshot.tracks[0].threatLevel).toBe('critical');
    });

    it('classifies non-hostile entities as no threat', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'cow', distBucket: 2 }),
      ]));

      const snapshot = trackSet.getSnapshot(1);
      expect(snapshot.tracks[0].threatLevel).toBe('none');
    });
  });

  // ── T3: Near-threshold oscillation (hysteresis boundary) ───────

  describe('T3: hysteresis — near-threshold oscillation', () => {
    it('limits reclassified deltas under rapid boundary oscillation', () => {
      // Warmup at distBucket=3 (high threat)
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));
      trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      // Oscillate between distBucket=3 (high) and distBucket=4 (medium) for 20 ticks
      let reclassifiedCount = 0;
      for (let t = 3; t <= 22; t++) {
        const bucket = t % 2 === 0 ? 3 : 4;
        const deltas = trackSet.ingest(makeBatch(t, [
          makeEvidence({ engineId: 10, kind: 'zombie', distBucket: bucket }),
        ]));
        reclassifiedCount += deltas.filter(d => d.type === 'reclassified').length;
      }

      // Cooldown of 5 ticks means at most ~4 reclassified deltas over 20 ticks
      expect(reclassifiedCount).toBeLessThanOrEqual(4);
      expect(reclassifiedCount).toBeGreaterThanOrEqual(1); // Should still emit some
    });
  });

  // ── T4: Event sparsity after warmup (quiescence) ──────────────

  describe('T4: event sparsity — quiescence after warmup', () => {
    it('emits exactly 0 deltas after warmup with identical observations', () => {
      // Warmup: 2 observations
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));
      trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      // 50 identical observations — should produce zero deltas
      let totalDeltas = 0;
      for (let t = 3; t <= 52; t++) {
        const deltas = trackSet.ingest(makeBatch(t, [
          makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
        ]));
        totalDeltas += deltas.length;
      }

      expect(totalDeltas).toBe(0);
    });
  });

  // ── T5: Multi-batch replay determinism ────────────────────────

  describe('T5: multi-batch replay determinism', () => {
    it('identical 10-batch sequences produce identical snapshots and deltas', () => {
      // Build a 10-batch sequence: entities appear, move, disappear, reappear
      const batches: EvidenceBatch[] = [
        makeBatch(1, [
          makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 5, posBucketX: 10 }),
        ]),
        makeBatch(2, [
          makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 5, posBucketX: 10 }),
          makeEvidence({ engineId: 11, kind: 'skeleton', distBucket: 7, posBucketX: 20 }),
        ]),
        makeBatch(3, [
          makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, posBucketX: 8 }),
          makeEvidence({ engineId: 11, kind: 'skeleton', distBucket: 7, posBucketX: 20 }),
        ]),
        makeBatch(4, [
          makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 2, posBucketX: 6 }),
        ]),
        // Tick 5-7: no observations for entity 11 (goes inferred/lost)
        makeBatch(5, [
          makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 1, posBucketX: 4 }),
        ]),
        makeBatch(6, [
          makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 1, posBucketX: 4 }),
        ]),
        makeBatch(7, [
          makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 2, posBucketX: 6 }),
        ]),
        // Entity 12 appears
        makeBatch(8, [
          makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, posBucketX: 8 }),
          makeEvidence({ engineId: 12, kind: 'creeper', distBucket: 4, posBucketX: 30 }),
        ]),
        makeBatch(9, [
          makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 4, posBucketX: 10 }),
          makeEvidence({ engineId: 12, kind: 'creeper', distBucket: 4, posBucketX: 30 }),
        ]),
        makeBatch(10, [
          makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 5, posBucketX: 12 }),
          makeEvidence({ engineId: 12, kind: 'creeper', distBucket: 3, posBucketX: 28 }),
        ]),
      ];

      // Run on two independent TrackSets
      const ts1 = new TrackSet();
      const ts2 = new TrackSet();
      const allDeltas1: string[] = [];
      const allDeltas2: string[] = [];

      for (const batch of batches) {
        const d1 = ts1.ingest(batch);
        ts1.tick(batch.tickId);
        const d2 = ts2.ingest(batch);
        ts2.tick(batch.tickId);

        allDeltas1.push(...d1.map(d => `${d.type}:${d.trackId}:${d.distBucket}`));
        allDeltas2.push(...d2.map(d => `${d.type}:${d.trackId}:${d.distBucket}`));
      }

      // Identical delta sequences
      expect(allDeltas1).toEqual(allDeltas2);

      // Identical final snapshots
      const snap1 = ts1.getSnapshot(10);
      const snap2 = ts2.getSnapshot(10);

      expect(snap1.tracks.length).toBe(snap2.tracks.length);
      for (let i = 0; i < snap1.tracks.length; i++) {
        expect(snap1.tracks[i].trackId).toBe(snap2.tracks[i].trackId);
        expect(snap1.tracks[i].confidence).toBe(snap2.tracks[i].confidence);
        expect(snap1.tracks[i].pUnknown).toBe(snap2.tracks[i].pUnknown);
        expect(snap1.tracks[i].distBucket).toBe(snap2.tracks[i].distBucket);
        expect(snap1.tracks[i].threatLevel).toBe(snap2.tracks[i].threatLevel);
      }
    });
  });

  // ── T6: Confidence/pUnknown boundary tests ────────────────────

  describe('T6: confidence and pUnknown boundaries', () => {
    it('T6.1: pUnknown rises monotonically when unobserved', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      const pValues: number[] = [];
      for (let t = 2; t <= 12; t++) {
        trackSet.tick(t);
        const track = trackSet.getTrack(
          trackSet.getSnapshot(t).tracks[0]?.trackId ?? ''
        );
        if (track) pValues.push(track.pUnknown);
      }

      // Each value should be >= the previous
      for (let i = 1; i < pValues.length; i++) {
        expect(pValues[i]).toBeGreaterThanOrEqual(pValues[i - 1]);
      }
      // Should have grown from 0
      expect(pValues[pValues.length - 1]).toBeGreaterThan(0);
    });

    it('T6.2: pUnknown > 0.5 drops threatLevel to none for hostile entity', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 1 }),
      ]));

      // Initially critical threat
      let snapshot = trackSet.getSnapshot(1);
      expect(snapshot.tracks[0].threatLevel).toBe('critical');

      // Let pUnknown drift past 0.5 (0.03/tick, ~17 ticks to reach 0.5)
      for (let t = 2; t <= 20; t++) {
        trackSet.tick(t);
      }

      snapshot = trackSet.getSnapshot(20);
      const track = snapshot.tracks[0];
      if (track) {
        expect(track.pUnknown).toBeGreaterThan(0.5);
        expect(track.threatLevel).toBe('none');
      }
    });

    it('T6.3: observation reduces pUnknown — visible > unknown > occluded', () => {
      // Create track and let pUnknown drift up
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));
      for (let t = 2; t <= 11; t++) {
        trackSet.tick(t);
      }

      const trackId = trackSet.getSnapshot(11).tracks[0]?.trackId;
      expect(trackId).toBeTruthy();
      const pBefore = trackSet.getTrack(trackId!)!.pUnknown;
      expect(pBefore).toBeGreaterThan(0);

      // Observe with 'visible' — largest recovery
      trackSet.ingest(makeBatch(12, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, los: 'visible' }),
      ]));
      const pAfterVisible = trackSet.getTrack(trackId!)!.pUnknown;
      expect(pAfterVisible).toBeLessThan(pBefore);

      // Now test that 'unknown' recovers less than 'visible'
      // Build fresh trackset for a clean comparison
      const ts2 = new TrackSet();
      ts2.ingest(makeBatch(1, [
        makeEvidence({ engineId: 20, kind: 'zombie', distBucket: 3 }),
      ]));
      for (let t = 2; t <= 11; t++) {
        ts2.tick(t);
      }
      const trackId2 = ts2.getSnapshot(11).tracks[0]?.trackId;
      const pBefore2 = ts2.getTrack(trackId2!)!.pUnknown;

      ts2.ingest(makeBatch(12, [
        makeEvidence({ engineId: 20, kind: 'zombie', distBucket: 3, los: 'unknown' }),
      ]));
      const pAfterUnknown = ts2.getTrack(trackId2!)!.pUnknown;

      // visible recovers more → lower pUnknown after visible
      const visibleRecovery = pBefore - pAfterVisible;
      const unknownRecovery = pBefore2 - pAfterUnknown;
      expect(visibleRecovery).toBeGreaterThan(unknownRecovery);
    });

    it('T6.4: confidence decays to floor (0.1), not zero', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      // Decay for enough ticks to guarantee floor reached
      // 0.8 initial, 0.02/tick, floor 0.1 → (0.8-0.1)/0.02 = 35 ticks to reach floor
      // Use 40 ticks (still under 25 eviction threshold? No — eviction is at 25)
      // Actually we must stay under eviction threshold (25) so track isn't removed.
      // At 24 ticks: 0.8 - 23*0.02 = 0.34 — above floor but still proves floor works.
      // To truly reach floor without eviction, we need to observe periodically.
      // Strategy: observe once at tick 12 to reset ticksSinceObserved, then decay again.
      for (let t = 2; t <= 12; t++) {
        trackSet.tick(t);
      }
      // Re-observe with occluded (minimal boost: +0.02)
      trackSet.ingest(makeBatch(13, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, los: 'occluded' }),
      ]));
      // Continue decaying
      for (let t = 14; t <= 36; t++) {
        trackSet.tick(t);
      }
      // Re-observe again to prevent eviction
      trackSet.ingest(makeBatch(37, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, los: 'occluded' }),
      ]));
      for (let t = 38; t <= 60; t++) {
        trackSet.tick(t);
      }

      const snapshot = trackSet.getSnapshot(60);
      const track = snapshot.tracks[0];
      expect(track).toBeDefined();
      expect(track.confidence).toBeGreaterThanOrEqual(0.1);
      // It should be AT the floor (0.1) after enough decay
      expect(track.confidence).toBeCloseTo(0.1, 1);
    });

    it('T6.5: many observations boost confidence to 1.0 and cap it', () => {
      // Observe many times
      for (let t = 1; t <= 20; t++) {
        trackSet.ingest(makeBatch(t, [
          makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, los: 'visible' }),
        ]));
      }

      const snapshot = trackSet.getSnapshot(20);
      expect(snapshot.tracks[0].confidence).toBe(1);
    });

    it('T6.6: quality-gated boost — occluded boosts less than visible', () => {
      // Track A: occluded observations
      const tsA = new TrackSet();
      tsA.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, los: 'occluded' }),
      ]));
      // Decay a bit
      for (let t = 2; t <= 5; t++) tsA.tick(t);
      const confBeforeA = tsA.getTrack(tsA.getSnapshot(5).tracks[0].trackId)!.confidence;
      tsA.ingest(makeBatch(6, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, los: 'occluded' }),
      ]));
      const confAfterA = tsA.getTrack(tsA.getSnapshot(6).tracks[0].trackId)!.confidence;
      const boostA = confAfterA - confBeforeA;

      // Track B: visible observations
      const tsB = new TrackSet();
      tsB.ingest(makeBatch(1, [
        makeEvidence({ engineId: 20, kind: 'zombie', distBucket: 3, los: 'visible' }),
      ]));
      for (let t = 2; t <= 5; t++) tsB.tick(t);
      const confBeforeB = tsB.getTrack(tsB.getSnapshot(5).tracks[0].trackId)!.confidence;
      tsB.ingest(makeBatch(6, [
        makeEvidence({ engineId: 20, kind: 'zombie', distBucket: 3, los: 'visible' }),
      ]));
      const confAfterB = tsB.getTrack(tsB.getSnapshot(6).tracks[0].trackId)!.confidence;
      const boostB = confAfterB - confBeforeB;

      expect(boostB).toBeGreaterThan(boostA); // visible > occluded
    });
  });

  // ── T7: Occlusion → reappearance (same track, no spawn spam) ──

  describe('T7: occlusion then reappearance — identity persistence', () => {
    it('re-observation of same entity reuses trackId, no new_threat', () => {
      // Create and warm up (2 observations)
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, posBucketX: 5 }),
      ]));
      trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, posBucketX: 5 }),
      ]));

      const trackId = trackSet.getSnapshot(2).tracks[0].trackId;
      expect(trackId).toBeTruthy();

      // Stop observing for 5 ticks (goes inferred)
      for (let t = 3; t <= 7; t++) {
        trackSet.tick(t);
      }

      const inferredSnap = trackSet.getSnapshot(7);
      expect(inferredSnap.tracks[0].visibility).toBe('inferred');
      expect(inferredSnap.tracks[0].trackId).toBe(trackId);

      // Re-observe same entity at same position
      const deltas = trackSet.ingest(makeBatch(8, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, posBucketX: 5 }),
      ]));

      // Same trackId
      const reappeared = trackSet.getSnapshot(8);
      expect(reappeared.tracks).toHaveLength(1);
      expect(reappeared.tracks[0].trackId).toBe(trackId);
      expect(reappeared.tracks[0].visibility).toBe('visible');

      // No new_threat delta (this is a re-observation, not a new entity)
      const newThreats = deltas.filter(d => d.type === 'new_threat');
      expect(newThreats).toHaveLength(0);
    });
  });
});

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
    // Re-compute kindEnum if kind was overridden
    ...(overrides.kind && !overrides.kindEnum
      ? { kindEnum: ENTITY_KIND_ENUM[overrides.kind] ?? ENTITY_KIND_ENUM.unknown }
      : {}),
  };
}

function makeBatch(tickId: number, items: EvidenceItem[]): EvidenceBatch {
  return { tickId, items };
}

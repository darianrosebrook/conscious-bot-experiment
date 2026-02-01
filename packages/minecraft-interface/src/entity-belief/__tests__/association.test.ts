import { describe, it, expect, beforeEach } from 'vitest';
import { TrackSet } from '../track-set';
import { EvidenceBatch, EvidenceItem, ENTITY_KIND_ENUM } from '../types';

describe('TrackSet association robustness', () => {
  let trackSet: TrackSet;

  beforeEach(() => {
    trackSet = new TrackSet();
  });

  describe('engineId noise handling', () => {
    it('handles engineId change for same physical entity via position matching', () => {
      // Entity appears with engineId 10
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', posBucketX: 5, posBucketY: 64, posBucketZ: 0 }),
      ]));
      expect(trackSet.size).toBe(1);

      // Same entity reappears with new engineId but similar position
      trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 20, kind: 'zombie', posBucketX: 6, posBucketY: 64, posBucketZ: 0 }),
      ]));

      // Should still be one track (associated by proximity + kind)
      expect(trackSet.size).toBe(1);
    });

    it('creates new track when position is too far for association', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', posBucketX: 5 }),
      ]));

      // New entity far away with different engineId
      trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 20, kind: 'zombie', posBucketX: 50 }),
      ]));

      expect(trackSet.size).toBe(2);
    });

    it('does not associate different kinds at same position', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', posBucketX: 5 }),
      ]));

      trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 20, kind: 'skeleton', posBucketX: 5 }),
      ]));

      expect(trackSet.size).toBe(2);
    });
  });

  describe('proximity matching', () => {
    it('associates within 3-bucket Manhattan distance', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', posBucketX: 5, posBucketY: 64, posBucketZ: 5 }),
      ]));

      // Move within 3 blocks (Manhattan: |6-5| + |64-64| + |6-5| = 2)
      trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 99, kind: 'zombie', posBucketX: 6, posBucketY: 64, posBucketZ: 6 }),
      ]));

      expect(trackSet.size).toBe(1);
    });

    it('does not associate beyond 3-bucket Manhattan distance', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', posBucketX: 5, posBucketY: 64, posBucketZ: 5 }),
      ]));

      // Move beyond 3 blocks (Manhattan: |10-5| = 5)
      trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 99, kind: 'zombie', posBucketX: 10, posBucketY: 64, posBucketZ: 5 }),
      ]));

      expect(trackSet.size).toBe(2);
    });
  });

  describe('occlusion handling', () => {
    it('occluded evidence sets visibility to inferred, not lost', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, los: 'visible' }),
      ]));

      // Same entity now occluded
      trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, los: 'occluded' }),
      ]));

      const snapshot = trackSet.getSnapshot(2);
      expect(snapshot.tracks[0].visibility).toBe('inferred');
    });

    it('visible evidence restores visibility from inferred', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, los: 'occluded' }),
      ]));

      trackSet.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3, los: 'visible' }),
      ]));

      const snapshot = trackSet.getSnapshot(2);
      expect(snapshot.tracks[0].visibility).toBe('visible');
    });
  });

  describe('lost track association', () => {
    it('does not associate new evidence with lost tracks', () => {
      trackSet.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', posBucketX: 5 }),
      ]));

      // Decay until lost
      for (let t = 2; t <= 16; t++) {
        trackSet.tick(t);
      }

      const snapshotBefore = trackSet.getSnapshot(16);
      const lostTrack = snapshotBefore.tracks.find(t => t.visibility === 'lost');
      expect(lostTrack).toBeDefined();

      // New evidence at same position should create new track
      trackSet.ingest(makeBatch(17, [
        makeEvidence({ engineId: 20, kind: 'zombie', posBucketX: 5 }),
      ]));

      // Should have both the lost track and the new one
      expect(trackSet.size).toBe(2);
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
    ...(overrides.kind && !overrides.kindEnum
      ? { kindEnum: ENTITY_KIND_ENUM[overrides.kind] ?? ENTITY_KIND_ENUM.unknown }
      : {}),
  };
}

function makeBatch(tickId: number, items: EvidenceItem[]): EvidenceBatch {
  return { tickId, items };
}

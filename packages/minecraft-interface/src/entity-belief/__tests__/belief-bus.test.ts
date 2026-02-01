import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BeliefBus } from '../belief-bus';
import { EvidenceBatch, EvidenceItem, ENTITY_KIND_ENUM, MAX_SALIENCY_EVENTS_PER_EMISSION, SNAPSHOT_INTERVAL_TICKS } from '../types';

describe('BeliefBus', () => {
  let bus: BeliefBus;

  beforeEach(() => {
    bus = new BeliefBus('test-bot', 'test-stream');
  });

  describe('ingest', () => {
    it('accumulates deltas from evidence ingestion after warmup', () => {
      // First observation: warmup (no deltas)
      bus.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));
      bus.flushPendingDeltas(); // clear any pending

      // Second observation: warmup met, new_threat emitted
      bus.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      const deltas = bus.flushPendingDeltas();
      expect(deltas.length).toBeGreaterThan(0);
      expect(deltas[0].type).toBe('new_threat');
    });

    it('tracks entity count', () => {
      bus.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
        makeEvidence({ engineId: 11, kind: 'skeleton', distBucket: 5 }),
      ]));

      expect(bus.trackCount).toBe(2);
    });
  });

  describe('flushPendingDeltas', () => {
    it('returns and clears pending deltas', () => {
      // First observation: warmup
      bus.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));
      bus.flushPendingDeltas(); // clear warmup cycle

      // Second observation: warmup met, new_threat fires
      bus.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      const first = bus.flushPendingDeltas();
      expect(first.length).toBeGreaterThan(0);

      const second = bus.flushPendingDeltas();
      expect(second).toHaveLength(0);
    });

    it('caps deltas at MAX_SALIENCY_EVENTS_PER_EMISSION', () => {
      // Create many entities to generate many deltas
      const items: EvidenceItem[] = [];
      for (let i = 0; i < MAX_SALIENCY_EVENTS_PER_EMISSION + 10; i++) {
        items.push(
          makeEvidence({
            engineId: i + 100,
            kind: 'zombie',
            distBucket: 3,
            posBucketX: i * 10, // spread out so they don't associate
          })
        );
      }
      // First ingest: warmup — no deltas yet
      bus.ingest(makeBatch(1, items));
      bus.flushPendingDeltas(); // clear

      // Second ingest: warmup met, many new_threat deltas
      bus.ingest(makeBatch(2, items));

      const deltas = bus.flushPendingDeltas();
      expect(deltas.length).toBeLessThanOrEqual(MAX_SALIENCY_EVENTS_PER_EMISSION);
    });

    it('preserves overflow deltas for next flush', () => {
      const items: EvidenceItem[] = [];
      for (let i = 0; i < MAX_SALIENCY_EVENTS_PER_EMISSION + 5; i++) {
        items.push(
          makeEvidence({
            engineId: i + 100,
            kind: 'zombie',
            distBucket: 3,
            posBucketX: i * 10,
          })
        );
      }
      // First ingest: warmup — tracks created, no new_threat deltas
      bus.ingest(makeBatch(1, items));
      bus.flushPendingDeltas(); // clear any pending

      // Second ingest: warmup met for all tracks, new_threat deltas fire
      bus.ingest(makeBatch(2, items));

      const first = bus.flushPendingDeltas();
      expect(first.length).toBe(MAX_SALIENCY_EVENTS_PER_EMISSION);

      const second = bus.flushPendingDeltas();
      expect(second.length).toBeGreaterThan(0);
    });
  });

  describe('snapshot emission', () => {
    it('emits snapshot on first tick (forceSnapshot on construction)', () => {
      bus.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      expect(bus.shouldEmitSnapshot()).toBe(true);
    });

    it('does not emit snapshot immediately after one was sent', () => {
      bus.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      // Build envelope consumes the snapshot
      bus.buildEnvelope(0);

      expect(bus.shouldEmitSnapshot()).toBe(false);
    });

    it('emits snapshot after SNAPSHOT_INTERVAL_TICKS', () => {
      bus.ingest(makeBatch(1, []));
      bus.buildEnvelope(0); // Consume initial snapshot

      // Advance to tick SNAPSHOT_INTERVAL_TICKS + 1
      for (let t = 2; t <= SNAPSHOT_INTERVAL_TICKS + 2; t++) {
        bus.ingest(makeBatch(t, []));
      }

      expect(bus.shouldEmitSnapshot()).toBe(true);
    });

    it('forceSnapshot() triggers snapshot on next emission', () => {
      bus.ingest(makeBatch(1, []));
      bus.buildEnvelope(0); // Consume initial snapshot

      expect(bus.shouldEmitSnapshot()).toBe(false);

      bus.forceSnapshot();
      expect(bus.shouldEmitSnapshot()).toBe(true);
    });
  });

  describe('buildEnvelope', () => {
    it('produces a valid BeliefStreamEnvelope', () => {
      bus.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      const envelope = bus.buildEnvelope(0);

      expect(envelope.request_version).toBe('saliency_delta');
      expect(envelope.type).toBe('environmental_awareness');
      expect(envelope.bot_id).toBe('test-bot');
      expect(envelope.stream_id).toBe('test-stream');
      expect(envelope.seq).toBe(0);
      expect(envelope.tick_id).toBe(1);
      expect(Array.isArray(envelope.saliency_events)).toBe(true);
    });

    it('includes snapshot when due', () => {
      bus.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      const envelope = bus.buildEnvelope(0);
      expect(envelope.snapshot).toBeDefined();
      expect(envelope.snapshot!.tracks).toHaveLength(1);
    });

    it('omits snapshot when not due', () => {
      bus.ingest(makeBatch(1, []));
      bus.buildEnvelope(0); // Consume initial snapshot

      bus.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      const envelope = bus.buildEnvelope(1);
      expect(envelope.snapshot).toBeUndefined();
    });
  });

  describe('hasContent', () => {
    it('returns true when there are pending deltas', () => {
      bus.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));
      // Consume the forced snapshot but not deltas
      expect(bus.hasContent()).toBe(true);
    });

    it('returns true when snapshot is pending', () => {
      bus.ingest(makeBatch(1, []));
      expect(bus.hasContent()).toBe(true); // forced snapshot
    });

    it('returns false when nothing to emit', () => {
      bus.ingest(makeBatch(1, []));
      bus.buildEnvelope(0); // Consume snapshot + deltas
      expect(bus.hasContent()).toBe(false);
    });
  });

  describe('producer-side new_threat enforcement', () => {
    it('all emitted new_threat deltas include track payload', () => {
      // Warmup observation
      bus.ingest(makeBatch(1, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));
      bus.buildEnvelope(0); // Consume initial snapshot + any warmup deltas

      // Second observation triggers new_threat
      bus.ingest(makeBatch(2, [
        makeEvidence({ engineId: 10, kind: 'zombie', distBucket: 3 }),
      ]));

      const envelope = bus.buildEnvelope(1);
      const newThreats = envelope.saliency_events.filter((d) => d.type === 'new_threat');

      for (const delta of newThreats) {
        expect(delta.track).toBeDefined();
        expect(delta.track!.trackId).toBe(delta.trackId);
      }

      expect(bus.droppedNewThreatCount).toBe(0);
    });

    it('drops new_threat without track at producer boundary', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Force a malformed delta by directly manipulating pending buffer
      // (simulates a hypothetical bug in TrackSet)
      (bus as any).pendingDeltas.push({
        type: 'new_threat',
        trackId: 'bad-track',
        classLabel: 'zombie',
        threatLevel: 'high',
        distBucket: 3,
        // track intentionally omitted
      });

      const envelope = bus.buildEnvelope(0);

      // Malformed delta should be filtered out
      const newThreats = envelope.saliency_events.filter(
        (d) => d.type === 'new_threat' && d.trackId === 'bad-track'
      );
      expect(newThreats).toHaveLength(0);
      expect(bus.droppedNewThreatCount).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('INVARIANT VIOLATION')
      );

      errorSpy.mockRestore();
    });
  });

  // ── Serialized envelope determinism harness ──────────────────────

  describe('serialized envelope determinism', () => {
    it('two independent BeliefBus instances produce byte-identical envelopes for same evidence sequence', () => {
      const busA = new BeliefBus('bot-test', 'bot-test-1');
      const busB = new BeliefBus('bot-test', 'bot-test-1');

      // Build a 60-tick evidence replay scenario:
      // - Ticks 1-10: zombie appears at distBucket=5, approaches
      // - Ticks 11-20: skeleton appears at distBucket=4
      // - Ticks 21-30: zombie moves closer (distBucket=2)
      // - Ticks 31-40: zombie disappears (no evidence), skeleton still present
      // - Ticks 41-50: zombie reappears at distBucket=3
      // - Ticks 51-60: both entities present, stable

      const envelopesA: string[] = [];
      const envelopesB: string[] = [];

      for (let tick = 1; tick <= 60; tick++) {
        const items: EvidenceItem[] = [];

        // Zombie: present ticks 1-30, absent 31-40, returns 41-60
        if (tick <= 30 || tick >= 41) {
          const zombieDist = tick <= 10 ? 5 : tick <= 20 ? 4 : tick <= 30 ? 2 : 3;
          items.push(makeEvidence({
            engineId: 100,
            kind: 'zombie',
            distBucket: zombieDist,
            posBucketX: 10,
          }));
        }

        // Skeleton: present ticks 11-60
        if (tick >= 11) {
          items.push(makeEvidence({
            engineId: 200,
            kind: 'skeleton',
            distBucket: 4,
            posBucketX: -5,
          }));
        }

        const batch = makeBatch(tick, items);
        busA.ingest(batch);
        busB.ingest(batch);

        // Emit envelopes every 5 ticks (simulating 1Hz at 5Hz tick rate)
        if (tick % 5 === 0) {
          const seq = tick / 5 - 1;
          const envA = busA.buildEnvelope(seq);
          const envB = busB.buildEnvelope(seq);

          envelopesA.push(JSON.stringify(envA));
          envelopesB.push(JSON.stringify(envB));
        }
      }

      // Byte-identical comparison
      expect(envelopesA.length).toBe(12); // 60/5 = 12 emissions
      for (let i = 0; i < envelopesA.length; i++) {
        expect(envelopesA[i]).toBe(envelopesB[i]);
      }
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

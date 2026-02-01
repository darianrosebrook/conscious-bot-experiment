import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applySaliencyEnvelope,
  createSaliencyReasonerState,
  SaliencyReasonerState,
  BeliefStreamEnvelope,
  TrackSummary,
  SaliencyDelta,
  BotStreamState,
} from '../saliency-reasoner';

// ── Helpers ──────────────────────────────────────────────────────────

function makeTrack(overrides: Partial<TrackSummary> = {}): TrackSummary {
  return {
    trackId: 'track-abc',
    classLabel: 'zombie',
    kindEnum: 1,
    posBucketX: 5,
    posBucketY: 64,
    posBucketZ: 0,
    distBucket: 3,
    visibility: 'visible',
    threatLevel: 'high',
    confidence: 0.8,
    pUnknown: 0,
    firstSeenTick: 1,
    lastSeenTick: 1,
    ...overrides,
  };
}

function makeEnvelope(overrides: Partial<BeliefStreamEnvelope> = {}): BeliefStreamEnvelope {
  return {
    request_version: 'saliency_delta',
    type: 'environmental_awareness',
    bot_id: 'bot-steve',
    stream_id: 'bot-steve-1',
    seq: 0,
    tick_id: 1,
    saliency_events: [],
    ...overrides,
  };
}

function makeDelta(overrides: Partial<SaliencyDelta> = {}): SaliencyDelta {
  return {
    type: 'new_threat',
    trackId: 'track-abc',
    classLabel: 'zombie',
    threatLevel: 'high',
    distBucket: 3,
    ...overrides,
  };
}

describe('SaliencyReasoner', () => {
  let state: SaliencyReasonerState;

  beforeEach(() => {
    state = createSaliencyReasonerState();
  });

  // ── T1: Core scenarios ──────────────────────────────────────────

  describe('T1.1: Snapshot application — rebuilds state from scratch', () => {
    it('replaces all tracks with snapshot contents', () => {
      // Pre-populate with some track
      state.tracks.set('old-track', makeTrack({ trackId: 'old-track', classLabel: 'skeleton' }));

      const envelope = makeEnvelope({
        seq: 0,
        tick_id: 10,
        snapshot: {
          tickId: 10,
          tracks: [
            makeTrack({ trackId: 'new-track-1', classLabel: 'zombie' }),
            makeTrack({ trackId: 'new-track-2', classLabel: 'creeper' }),
          ],
        },
      });

      const insight = applySaliencyEnvelope(envelope, state);

      expect(insight.processed).toBe(true);
      expect(state.tracks.size).toBe(2);
      expect(state.tracks.has('old-track')).toBe(false);
      expect(state.tracks.has('new-track-1')).toBe(true);
      expect(state.tracks.has('new-track-2')).toBe(true);
    });
  });

  describe('T1.2: Delta application — all 4 delta types', () => {
    it('new_threat with track — full hydration', () => {
      const track = makeTrack({ trackId: 'track-1' });
      const envelope = makeEnvelope({
        seq: 0,
        saliency_events: [
          makeDelta({ trackId: 'track-1', track }),
        ],
      });

      applySaliencyEnvelope(envelope, state);

      expect(state.tracks.size).toBe(1);
      const stored = state.tracks.get('track-1');
      expect(stored).toBeDefined();
      expect(stored!.classLabel).toBe('zombie');
      expect(stored!.threatLevel).toBe('high');
    });

    it('track_lost — sets visibility to lost', () => {
      state.tracks.set('track-1', makeTrack({ trackId: 'track-1' }));

      const envelope = makeEnvelope({
        seq: 0,
        saliency_events: [
          makeDelta({ type: 'track_lost', trackId: 'track-1' }),
        ],
      });

      applySaliencyEnvelope(envelope, state);

      expect(state.tracks.get('track-1')!.visibility).toBe('lost');
    });

    it('reclassified — updates threatLevel', () => {
      state.tracks.set('track-1', makeTrack({ trackId: 'track-1', threatLevel: 'high' }));

      const envelope = makeEnvelope({
        seq: 0,
        saliency_events: [
          makeDelta({ type: 'reclassified', trackId: 'track-1', threatLevel: 'critical' }),
        ],
      });

      applySaliencyEnvelope(envelope, state);

      expect(state.tracks.get('track-1')!.threatLevel).toBe('critical');
    });

    it('movement_bucket_change — updates distBucket and threatLevel', () => {
      state.tracks.set('track-1', makeTrack({ trackId: 'track-1', distBucket: 5, threatLevel: 'medium' }));

      const envelope = makeEnvelope({
        seq: 0,
        saliency_events: [
          makeDelta({
            type: 'movement_bucket_change',
            trackId: 'track-1',
            distBucket: 1,
            threatLevel: 'critical',
          }),
        ],
      });

      applySaliencyEnvelope(envelope, state);

      expect(state.tracks.get('track-1')!.distBucket).toBe(1);
      expect(state.tracks.get('track-1')!.threatLevel).toBe('critical');
    });
  });

  describe('T1.3: new_threat with delta.track — full hydration', () => {
    it('creates complete track from delta.track payload', () => {
      const track = makeTrack({
        trackId: 'hydrated-track',
        classLabel: 'creeper',
        distBucket: 2,
        threatLevel: 'high',
        posBucketX: 10,
        posBucketY: 65,
        posBucketZ: -3,
      });

      const envelope = makeEnvelope({
        seq: 0,
        saliency_events: [makeDelta({ trackId: 'hydrated-track', track })],
      });

      applySaliencyEnvelope(envelope, state);

      const stored = state.tracks.get('hydrated-track');
      expect(stored).toBeDefined();
      expect(stored!.classLabel).toBe('creeper');
      expect(stored!.posBucketX).toBe(10);
      expect(stored!.posBucketY).toBe(65);
      expect(stored!.posBucketZ).toBe(-3);
    });
  });

  describe('T1.4: new_threat WITHOUT delta.track — fail-closed', () => {
    it('does NOT create track, logs warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const envelope = makeEnvelope({
        seq: 0,
        saliency_events: [
          makeDelta({ trackId: 'orphan-track', track: undefined }),
        ],
      });

      applySaliencyEnvelope(envelope, state);

      expect(state.tracks.size).toBe(0);
      expect(state.tracks.has('orphan-track')).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('orphan-track')
      );

      warnSpy.mockRestore();
    });
  });

  describe('T1.5: Out-of-order envelope rejection', () => {
    it('rejects envelope with seq <= lastSeq', () => {
      // First envelope: seq 0
      applySaliencyEnvelope(
        makeEnvelope({ seq: 0, saliency_events: [makeDelta({ track: makeTrack() })] }),
        state
      );
      expect(state.tracks.size).toBe(1);

      // Second envelope: seq 0 again (stale)
      const result = applySaliencyEnvelope(
        makeEnvelope({ seq: 0, tick_id: 2 }),
        state
      );

      expect(result.processed).toBe(false);
      expect(result.thought.categories).toContain('stale');
    });

    it('accepts higher seq', () => {
      applySaliencyEnvelope(makeEnvelope({ seq: 0 }), state);
      const result = applySaliencyEnvelope(makeEnvelope({ seq: 1, tick_id: 2 }), state);

      expect(result.processed).toBe(true);
    });
  });

  describe('T1.6: Snapshot-before-deltas ordering', () => {
    it('snapshot clears then deltas apply on top', () => {
      const envelope = makeEnvelope({
        seq: 0,
        tick_id: 10,
        snapshot: {
          tickId: 10,
          tracks: [makeTrack({ trackId: 'snap-track', classLabel: 'cow', threatLevel: 'none' })],
        },
        saliency_events: [
          makeDelta({
            type: 'new_threat',
            trackId: 'delta-track',
            classLabel: 'skeleton',
            threatLevel: 'high',
            track: makeTrack({ trackId: 'delta-track', classLabel: 'skeleton' }),
          }),
        ],
      });

      applySaliencyEnvelope(envelope, state);

      expect(state.tracks.size).toBe(2);
      expect(state.tracks.has('snap-track')).toBe(true);
      expect(state.tracks.has('delta-track')).toBe(true);
    });
  });

  describe('T1.7: Deterministic thought generation', () => {
    it('same tracks produce same text (trackId tie-breaker)', () => {
      const tracks = [
        makeTrack({ trackId: 'aaa', classLabel: 'zombie', threatLevel: 'high', distBucket: 3 }),
        makeTrack({ trackId: 'bbb', classLabel: 'skeleton', threatLevel: 'high', distBucket: 3 }),
      ];

      const envelope = makeEnvelope({
        seq: 0,
        snapshot: { tickId: 1, tracks },
      });

      const state1 = createSaliencyReasonerState();
      const insight1 = applySaliencyEnvelope(envelope, state1);

      const state2 = createSaliencyReasonerState();
      const insight2 = applySaliencyEnvelope(envelope, state2);

      expect(insight1.thought.text).toBe(insight2.thought.text);
    });
  });

  describe('T1.8: Significant threat detection', () => {
    it('critical/high visible tracks trigger shouldRespond', () => {
      const envelope = makeEnvelope({
        seq: 0,
        snapshot: {
          tickId: 1,
          tracks: [makeTrack({ threatLevel: 'critical', visibility: 'visible' })],
        },
      });

      const insight = applySaliencyEnvelope(envelope, state);

      expect(insight.actions.shouldRespond).toBe(true);
      expect(insight.actions.response).toBeDefined();
    });

    it('low/none threats do not trigger shouldRespond', () => {
      const envelope = makeEnvelope({
        seq: 0,
        snapshot: {
          tickId: 1,
          tracks: [makeTrack({ threatLevel: 'low', classLabel: 'zombie' })],
        },
      });

      const insight = applySaliencyEnvelope(envelope, state);

      expect(insight.actions.shouldRespond).toBe(false);
    });
  });

  describe('T1.9: Empty scene', () => {
    it('produces "No significant entities nearby."', () => {
      const envelope = makeEnvelope({
        seq: 0,
        snapshot: { tickId: 1, tracks: [] },
      });

      const insight = applySaliencyEnvelope(envelope, state);

      expect(insight.thought.text).toBe('No significant entities nearby.');
    });
  });

  // ── T2: Stream restart contract ────────────────────────────────

  describe('T2: Stream restart contract', () => {
    it('T2.1: New stream_id resets state for same bot prefix', () => {
      // Stream 1: send envelopes seq 0, 1, 2
      applySaliencyEnvelope(
        makeEnvelope({
          stream_id: 'bot-steve-1',
          seq: 0,
          saliency_events: [makeDelta({ trackId: 'old-track', track: makeTrack({ trackId: 'old-track' }) })],
        }),
        state
      );
      applySaliencyEnvelope(makeEnvelope({ stream_id: 'bot-steve-1', seq: 1, tick_id: 2 }), state);
      applySaliencyEnvelope(makeEnvelope({ stream_id: 'bot-steve-1', seq: 2, tick_id: 3 }), state);

      expect(state.tracks.size).toBe(1);
      expect(state.tracks.has('old-track')).toBe(true);

      // Stream 2: new stream (bot restart), seq 0
      const result = applySaliencyEnvelope(
        makeEnvelope({
          stream_id: 'bot-steve-2',
          seq: 0,
          tick_id: 4,
          saliency_events: [makeDelta({ trackId: 'new-track', track: makeTrack({ trackId: 'new-track' }) })],
        }),
        state
      );

      expect(result.processed).toBe(true);
      // Old tracks cleared, new track present
      expect(state.tracks.has('old-track')).toBe(false);
      expect(state.tracks.has('new-track')).toBe(true);
      expect(state.tracks.size).toBe(1);
    });

    it('T2.2: Old stream_id messages rejected after new stream appears', () => {
      // Stream 1: seq 0, 1
      applySaliencyEnvelope(
        makeEnvelope({ stream_id: 'bot-steve-1', seq: 0, tick_id: 1 }),
        state
      );
      applySaliencyEnvelope(
        makeEnvelope({ stream_id: 'bot-steve-1', seq: 1, tick_id: 2 }),
        state
      );

      // Stream 2: first message (bot restart)
      applySaliencyEnvelope(
        makeEnvelope({ stream_id: 'bot-steve-2', seq: 0, tick_id: 3 }),
        state
      );

      // Old stream (stream 1) sends seq 3 — should be rejected
      const result = applySaliencyEnvelope(
        makeEnvelope({ stream_id: 'bot-steve-1', seq: 3, tick_id: 4 }),
        state
      );

      expect(result.processed).toBe(false);
      expect(result.thought.text).toContain('superseded');
    });

    it('T2.3: Out-of-order within same stream is discarded', () => {
      applySaliencyEnvelope(makeEnvelope({ seq: 1, tick_id: 1 }), state);
      applySaliencyEnvelope(makeEnvelope({ seq: 3, tick_id: 3 }), state);

      // seq=2 arrives late
      const result = applySaliencyEnvelope(makeEnvelope({ seq: 2, tick_id: 2 }), state);

      expect(result.processed).toBe(false);
      expect(result.thought.categories).toContain('stale');
    });

    it('T2.4: Independent streams do not interfere', () => {
      // Two different bots (explicit bot_id)
      applySaliencyEnvelope(
        makeEnvelope({
          bot_id: 'bot-steve',
          stream_id: 'bot-steve-1',
          seq: 0,
          tick_id: 1,
          saliency_events: [makeDelta({ trackId: 'steve-track', track: makeTrack({ trackId: 'steve-track' }) })],
        }),
        state
      );

      applySaliencyEnvelope(
        makeEnvelope({
          bot_id: 'bot-alex',
          stream_id: 'bot-alex-1',
          seq: 0,
          tick_id: 1,
          saliency_events: [makeDelta({ trackId: 'alex-track', track: makeTrack({ trackId: 'alex-track' }) })],
        }),
        state
      );

      expect(state.tracks.size).toBe(2);
      expect(state.tracks.has('steve-track')).toBe(true);
      expect(state.tracks.has('alex-track')).toBe(true);
    });
  });

  // ── T1.10 + T1.11: Additional stream tests ────────────────────

  describe('T1.10: New stream_id resets state', () => {
    it('clears tracks and updates bot state for new stream', () => {
      applySaliencyEnvelope(
        makeEnvelope({
          bot_id: 'bot-steve',
          stream_id: 'bot-steve-1',
          seq: 0,
          snapshot: { tickId: 1, tracks: [makeTrack({ trackId: 't1' })] },
        }),
        state
      );

      expect(state.tracks.size).toBe(1);
      expect(state.bots['bot-steve'].lastSeq).toBe(0);
      expect(state.bots['bot-steve'].activeStreamId).toBe('bot-steve-1');

      // New stream appears
      applySaliencyEnvelope(
        makeEnvelope({ bot_id: 'bot-steve', stream_id: 'bot-steve-2', seq: 0, tick_id: 10 }),
        state
      );

      // Bot state updated: new active stream, old stream in superseded list
      expect(state.bots['bot-steve'].activeStreamId).toBe('bot-steve-2');
      expect(state.bots['bot-steve'].lastSeq).toBe(0);
      expect(state.bots['bot-steve'].supersededStreams).toContain('bot-steve-1');
    });
  });

  describe('Insight structure', () => {
    it('includes correct tickId, trackCount, deltaCount', () => {
      const envelope = makeEnvelope({
        seq: 0,
        tick_id: 42,
        snapshot: { tickId: 42, tracks: [makeTrack(), makeTrack({ trackId: 'track-2' })] },
        saliency_events: [makeDelta({ type: 'reclassified', threatLevel: 'critical' })],
      });

      const insight = applySaliencyEnvelope(envelope, state);

      expect(insight.tickId).toBe(42);
      expect(insight.trackCount).toBe(2);
      expect(insight.deltaCount).toBe(1);
    });
  });

  // ── Bounded GC of superseded streams ─────────────────────────────

  describe('Bounded superseded stream GC', () => {
    it('evicts oldest superseded stream when exceeding MAX_SUPERSEDED_STREAMS_PER_BOT', () => {
      // Send 6 distinct streams for the same bot (cap is 4 superseded)
      for (let i = 1; i <= 6; i++) {
        applySaliencyEnvelope(
          makeEnvelope({
            bot_id: 'bot-steve',
            stream_id: `bot-steve-${i}`,
            seq: 0,
            tick_id: i,
          }),
          state
        );
      }

      const botState = state.bots['bot-steve'];
      expect(botState.activeStreamId).toBe('bot-steve-6');

      // Superseded list should be bounded (cap = 4)
      expect(botState.supersededStreams.length).toBeLessThanOrEqual(4);

      // Oldest (bot-steve-1) should have been evicted
      expect(botState.supersededStreams).not.toContain('bot-steve-1');

      // Most recent superseded (bot-steve-5) should still be tracked
      expect(botState.supersededStreams).toContain('bot-steve-5');
    });

    it('still rejects messages from recently superseded streams', () => {
      // Stream 1 → Stream 2
      applySaliencyEnvelope(
        makeEnvelope({ bot_id: 'bot-steve', stream_id: 'bot-steve-1', seq: 0, tick_id: 1 }),
        state
      );
      applySaliencyEnvelope(
        makeEnvelope({ bot_id: 'bot-steve', stream_id: 'bot-steve-2', seq: 0, tick_id: 2 }),
        state
      );

      // Message from superseded stream 1
      const result = applySaliencyEnvelope(
        makeEnvelope({ bot_id: 'bot-steve', stream_id: 'bot-steve-1', seq: 1, tick_id: 3 }),
        state
      );

      expect(result.processed).toBe(false);
      expect(result.thought.text).toContain('superseded');
    });
  });
});

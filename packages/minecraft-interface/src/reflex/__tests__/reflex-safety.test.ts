import { describe, it, expect } from 'vitest';
import { assessReflexThreats, toExecutionSnapshot } from '../reflex-safety';
import type { Snapshot, TrackSummary } from '../../entity-belief/types';

describe('assessReflexThreats', () => {
  it('returns no threats for empty snapshot', () => {
    const snapshot = makeSnapshot([]);
    const result = assessReflexThreats(snapshot);

    expect(result.hasCriticalThreat).toBe(false);
    expect(result.threats).toHaveLength(0);
    expect(result.recommendedAction).toBe('none');
  });

  it('detects critical threat from hostile at close range', () => {
    const snapshot = makeSnapshot([
      makeTrack({ classLabel: 'creeper', distBucket: 1, threatLevel: 'critical' }),
    ]);
    const result = assessReflexThreats(snapshot);

    expect(result.hasCriticalThreat).toBe(true);
    expect(result.threats).toHaveLength(1);
    expect(result.recommendedAction).toBe('flee');
  });

  it('returns evade for high threat without critical', () => {
    const snapshot = makeSnapshot([
      makeTrack({ classLabel: 'zombie', distBucket: 3, threatLevel: 'high' }),
    ]);
    const result = assessReflexThreats(snapshot);

    expect(result.hasCriticalThreat).toBe(false);
    expect(result.recommendedAction).toBe('evade');
  });

  it('returns shield for medium/low threats', () => {
    const snapshot = makeSnapshot([
      makeTrack({ classLabel: 'spider', distBucket: 5, threatLevel: 'medium' }),
    ]);
    const result = assessReflexThreats(snapshot);

    expect(result.recommendedAction).toBe('shield');
  });

  it('ignores lost tracks', () => {
    const snapshot = makeSnapshot([
      makeTrack({ classLabel: 'zombie', distBucket: 1, threatLevel: 'critical', visibility: 'lost' }),
    ]);
    const result = assessReflexThreats(snapshot);

    expect(result.hasCriticalThreat).toBe(false);
    expect(result.threats).toHaveLength(0);
  });

  it('ignores non-threat entities', () => {
    const snapshot = makeSnapshot([
      makeTrack({ classLabel: 'cow', distBucket: 2, threatLevel: 'none' }),
    ]);
    const result = assessReflexThreats(snapshot);

    expect(result.threats).toHaveLength(0);
    expect(result.recommendedAction).toBe('none');
  });

  it('includes inferred tracks in assessment', () => {
    const snapshot = makeSnapshot([
      makeTrack({ classLabel: 'creeper', distBucket: 1, threatLevel: 'critical', visibility: 'inferred' }),
    ]);
    const result = assessReflexThreats(snapshot);

    expect(result.hasCriticalThreat).toBe(true);
  });
});

describe('toExecutionSnapshot', () => {
  it('maps tracks to nearbyEntities format', () => {
    const snapshot = makeSnapshot([
      makeTrack({ classLabel: 'zombie', distBucket: 3, threatLevel: 'high' }),
      makeTrack({ classLabel: 'cow', distBucket: 2, threatLevel: 'none' }),
    ]);

    const execSnap = toExecutionSnapshot(snapshot);

    expect(execSnap.nearbyEntities).toHaveLength(2);
    expect(execSnap.nearbyEntities[0].type).toBe('zombie');
    expect(execSnap.nearbyEntities[0].distance).toBe(6); // distBucket * 2
  });

  it('excludes lost tracks', () => {
    const snapshot = makeSnapshot([
      makeTrack({ classLabel: 'zombie', distBucket: 3, threatLevel: 'high', visibility: 'lost' }),
    ]);

    const execSnap = toExecutionSnapshot(snapshot);

    expect(execSnap.nearbyEntities).toHaveLength(0);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────

function makeSnapshot(tracks: TrackSummary[]): Snapshot {
  return { tickId: 1, tracks };
}

function makeTrack(overrides: Partial<TrackSummary> = {}): TrackSummary {
  return {
    trackId: `track-${Math.random().toString(36).slice(2, 10)}`,
    classLabel: 'zombie',
    kindEnum: 1,
    posBucketX: 5,
    posBucketY: 64,
    posBucketZ: 0,
    distBucket: 3,
    visibility: 'visible',
    threatLevel: 'medium',
    confidence: 0.8,
    pUnknown: 0,
    firstSeenTick: 1,
    lastSeenTick: 1,
    ...overrides,
  };
}

/**
 * B2 Determinism Scope Canary
 *
 * Documents that P21-B envelope determinism (INV B2) depends on
 * object construction order within a single Node runtime.
 *
 * JSON.stringify preserves insertion order — semantically identical
 * objects with different property insertion order produce different
 * JSON strings. This canary makes that dependency explicit and
 * testable, preventing misreading B2 as "canonical JSON determinism."
 *
 * If this test ever starts FAILING (i.e., both strings become equal),
 * the runtime or serialization layer changed to sorted-key canonical
 * encoding — update the B2 claim boundary accordingly.
 */

import { describe, it, expect } from 'vitest';
import type {
  P21Envelope,
  P21SaliencyDelta,
  P21TrackSummary,
} from '../../../../planning/src/sterling/primitives/p21/p21-capsule-types';

describe('B2 determinism scope canary', () => {
  it('envelope construction order affects JSON.stringify (documents unclaimed scope)', () => {
    // Build track summaries with different property insertion order
    const trackA: P21TrackSummary = {
      trackId: 'abc',
      classLabel: 'intruder',
      classEnum: 1,
      posBucketX: 0,
      posBucketY: 0,
      posBucketZ: 0,
      proximityBucket: 3,
      visibility: 'visible',
      riskLevel: 'high',
      confidence: 0.9,
      pUnknown: 0.1,
      firstSeenTick: 1,
      lastSeenTick: 5,
    };
    const trackB: P21TrackSummary = {
      riskLevel: 'high',
      confidence: 0.9,
      pUnknown: 0.1,
      trackId: 'abc',
      classLabel: 'intruder',
      classEnum: 1,
      visibility: 'visible',
      proximityBucket: 3,
      posBucketX: 0,
      posBucketY: 0,
      posBucketZ: 0,
      firstSeenTick: 1,
      lastSeenTick: 5,
    };

    const deltaA: P21SaliencyDelta = {
      type: 'new_threat',
      trackId: 'abc',
      classLabel: 'intruder',
      riskLevel: 'high',
      proximityBucket: 3,
      track: trackA,
    };
    const deltaB: P21SaliencyDelta = {
      track: trackB,
      type: 'new_threat',
      trackId: 'abc',
      riskLevel: 'high',
      classLabel: 'intruder',
      proximityBucket: 3,
    };

    const envelopeA: P21Envelope = {
      request_version: 'saliency_delta',
      type: 'environmental_awareness',
      bot_id: 'test',
      stream_id: 's1',
      seq: 1,
      tick_id: 5,
      saliency_events: [deltaA],
    };
    const envelopeB: P21Envelope = {
      seq: 1,
      tick_id: 5,
      request_version: 'saliency_delta',
      type: 'environmental_awareness',
      bot_id: 'test',
      stream_id: 's1',
      saliency_events: [deltaB],
    };

    // Node JSON.stringify preserves insertion order — these should differ
    expect(JSON.stringify(envelopeA)).not.toBe(JSON.stringify(envelopeB));

    // This canary DOCUMENTS that B2 determinism depends on construction path.
    // If this test ever starts passing (a === b), the runtime changed to
    // sorted-key serialization — update the B2 claim boundary accordingly.
  });
});

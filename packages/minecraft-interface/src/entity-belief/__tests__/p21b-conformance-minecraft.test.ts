/**
 * P21-B Conformance — Minecraft BeliefBus Proving Surface
 *
 * Wraps the existing BeliefBus through a P21EmissionAdapter and runs
 * the capsule emission conformance suite. This proves that the Minecraft
 * emission path satisfies all 4 P21-B emission-protocol invariants.
 */

import { runP21BConformanceSuite } from '@conscious-bot/testkits/src/p21';
import type {
  P21EmissionAdapter,
  P21EvidenceBatch,
  P21EvidenceItem,
  P21Envelope,
  P21SaliencyDelta,
  P21TrackSummary,
  P21Snapshot,
} from '../../../../planning/src/sterling/primitives/p21/p21-capsule-types';
import { BeliefBus } from '../belief-bus';
import {
  MAX_SALIENCY_EVENTS_PER_EMISSION,
  SNAPSHOT_INTERVAL_TICKS,
  type EvidenceBatch,
  type EvidenceItem,
  type SaliencyDelta,
  type TrackSummary,
  type BeliefStreamEnvelope,
} from '../types';

// ── Field Mapping: Capsule <-> Rig ──────────────────────────────────

function toRigBatch(capsuleBatch: P21EvidenceBatch): EvidenceBatch {
  return {
    tickId: capsuleBatch.tickId,
    items: capsuleBatch.items.map(toRigItem),
  };
}

function toRigItem(item: P21EvidenceItem): EvidenceItem {
  return {
    engineId: item.entityId,
    kind: item.classLabel,
    kindEnum: item.classEnum,
    posBucketX: item.posBucketX,
    posBucketY: item.posBucketY,
    posBucketZ: item.posBucketZ,
    distBucket: item.proximityBucket,
    los: item.los,
    features: item.features ?? {},
  };
}

function toCapsuleDelta(delta: SaliencyDelta): P21SaliencyDelta {
  return {
    type: delta.type,
    trackId: delta.trackId,
    classLabel: delta.classLabel,
    riskLevel: delta.threatLevel,
    proximityBucket: delta.distBucket,
    prev: delta.prev
      ? {
          riskLevel: delta.prev.threatLevel,
          proximityBucket: delta.prev.distBucket,
        }
      : undefined,
    track: delta.track ? toCapsuleTrack(delta.track) : undefined,
  };
}

function toCapsuleTrack(track: TrackSummary): P21TrackSummary {
  return {
    trackId: track.trackId,
    classLabel: track.classLabel,
    classEnum: track.kindEnum,
    posBucketX: track.posBucketX,
    posBucketY: track.posBucketY,
    posBucketZ: track.posBucketZ,
    proximityBucket: track.distBucket,
    visibility: track.visibility,
    riskLevel: track.threatLevel,
    confidence: track.confidence,
    pUnknown: track.pUnknown,
    firstSeenTick: track.firstSeenTick,
    lastSeenTick: track.lastSeenTick,
  };
}

function toCapsuleSnapshot(snap: { tickId: number; tracks: TrackSummary[] }): P21Snapshot {
  return {
    tickId: snap.tickId,
    tracks: snap.tracks.map(toCapsuleTrack),
  };
}

function toCapsuleEnvelope(env: BeliefStreamEnvelope): P21Envelope {
  return {
    request_version: env.request_version,
    type: env.type,
    bot_id: env.bot_id,
    stream_id: env.stream_id,
    seq: env.seq,
    tick_id: env.tick_id,
    snapshot: env.snapshot ? toCapsuleSnapshot(env.snapshot) : undefined,
    saliency_events: env.saliency_events.map(toCapsuleDelta),
  };
}

// ── P21EmissionAdapter wrapping BeliefBus ───────────────────────────

function createMinecraftEmissionAdapter(): P21EmissionAdapter {
  const bus = new BeliefBus('test-bot', 'test-stream');

  return {
    ingestAndTick(batch: P21EvidenceBatch): void {
      bus.ingest(toRigBatch(batch));
    },
    buildEnvelope(seq: number): P21Envelope {
      return toCapsuleEnvelope(bus.buildEnvelope(seq));
    },
    hasContent(): boolean {
      return bus.hasContent();
    },
    get deltaCap() {
      return MAX_SALIENCY_EVENTS_PER_EMISSION;
    },
    get snapshotIntervalTicks() {
      return SNAPSHOT_INTERVAL_TICKS;
    },
  };
}

// ── Run the P21-B conformance suite ─────────────────────────────────

runP21BConformanceSuite({
  name: 'Minecraft BeliefBus',
  createEmissionAdapter: createMinecraftEmissionAdapter,
  riskLabel: 'zombie',
  deltaCap: MAX_SALIENCY_EVENTS_PER_EMISSION,
  snapshotIntervalTicks: SNAPSHOT_INTERVAL_TICKS,
});

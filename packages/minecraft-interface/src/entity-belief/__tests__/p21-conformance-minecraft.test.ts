/**
 * P21-A Conformance — Minecraft Proving Surface
 *
 * Wires the existing TrackSet through a P21ImplementationAdapter and runs
 * the capsule conformance suite. This proves that the Minecraft entity-belief
 * implementation satisfies all 9 P21-A track-maintenance invariants.
 *
 * Import note: conformance suites now live in @conscious-bot/testkits.
 * The vitest alias resolves this to the local workspace package source.
 */

import { runP21AConformanceSuite } from '@conscious-bot/testkits/src/p21';
import { MOB_DOMAIN_CLASSIFIER } from '../../../../planning/src/sterling/primitives/p21/p21-reference-fixtures';
import type {
  P21ImplementationAdapter,
  P21RiskClassifier,
  P21EvidenceBatch,
  P21EvidenceItem,
  P21SaliencyDelta,
  P21Snapshot,
  P21TrackSummary,
} from '../../../../planning/src/sterling/primitives/p21/p21-capsule-types';
import { TrackSet, type RiskClassifier } from '../track-set';
import {
  TRACK_CAP,
  type EvidenceBatch,
  type EvidenceItem,
  type SaliencyDelta,
  type TrackSummary,
} from '../types';

// ── Field Mapping: Capsule <-> Rig ──────────────────────────────────
//
// Capsule (domain-agnostic)   Rig (Minecraft)
// ─────────────────────────   ───────────────
// entityId                    engineId
// classLabel                  kind
// classEnum                   kindEnum
// proximityBucket             distBucket
// riskLevel                   threatLevel
// riskClasses                 HOSTILE_KINDS
// classifyRisk                classifyThreat

/** Adapt a P21RiskClassifier to the local RiskClassifier interface. */
function adaptClassifier(p21: P21RiskClassifier): RiskClassifier {
  return {
    riskClasses: p21.riskClasses,
    classifyRisk: p21.classifyRisk,
  };
}

/** Map a capsule evidence batch to the rig's EvidenceBatch format. */
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

/** Map a rig SaliencyDelta to the capsule's P21SaliencyDelta format. */
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

/** Create a P21ImplementationAdapter wrapping a Minecraft TrackSet. */
function createMinecraftAdapter(classifier: P21RiskClassifier): P21ImplementationAdapter {
  const trackSet = new TrackSet(adaptClassifier(classifier));

  return {
    ingest(batch: P21EvidenceBatch): P21SaliencyDelta[] {
      const rigDeltas = trackSet.ingest(toRigBatch(batch));
      return rigDeltas.map(toCapsuleDelta);
    },
    tick(tickId: number): P21SaliencyDelta[] {
      const rigDeltas = trackSet.tick(tickId);
      return rigDeltas.map(toCapsuleDelta);
    },
    getSnapshot(tickId: number): P21Snapshot {
      const rigSnap = trackSet.getSnapshot(tickId);
      return {
        tickId: rigSnap.tickId,
        tracks: rigSnap.tracks.map(toCapsuleTrack),
      };
    },
    get size() {
      return trackSet.size;
    },
  };
}

// ── Run the P21-A conformance suite ─────────────────────────────────

runP21AConformanceSuite({
  name: 'Minecraft TrackSet',
  createAdapter: createMinecraftAdapter,
  classifier: MOB_DOMAIN_CLASSIFIER,
  trackCap: TRACK_CAP,
  sparsityBudget: 0,
  uncertaintyThreshold: 0.5,
  mode: 'conservative',
  hysteresisBudget: 4,
  declaredExtensions: [],
});

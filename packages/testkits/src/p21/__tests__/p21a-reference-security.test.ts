/**
 * P21-A Conformance — Reference Security Domain Proving Surface
 *
 * A minimal, standalone TrackSet implementation that implements
 * P21ImplementationAdapter using P21 types natively (no Minecraft imports).
 * Mirrors the core algorithm from the Minecraft track-set.ts with
 * security-domain semantics.
 *
 * This is the portability proof: same P21-A invariants, different domain,
 * different implementation.
 */

import { createHash } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { describe, it, expect, afterAll } from 'vitest';
import { runP21AConformanceSuite } from '../p21a-conformance-suite';
import { generateP21AManifest } from '../proof-manifest';
import { createSurfaceResultsFromHandle, finalizeManifest } from '../manifest-helpers';
import { SECURITY_DOMAIN_CLASSIFIER } from '../../../../planning/src/sterling/primitives/p21/p21-reference-fixtures';
import type {
  P21ImplementationAdapter,
  P21RiskClassifier,
  P21EvidenceBatch,
  P21EvidenceItem,
  P21SaliencyDelta,
  P21Snapshot,
  P21TrackSummary,
  P21Visibility,
  P21RiskLevel,
} from '../../../../planning/src/sterling/primitives/p21/p21-capsule-types';
import { RISK_LEVEL_ORDER } from '../../../../planning/src/sterling/primitives/p21/p21-capsule-types';

// ── Constants ───────────────────────────────────────────────────────

const TRACK_HZ = 5;
const CONFIDENCE_DECAY_PER_TICK = 0.10 / TRACK_HZ;
const CONFIDENCE_FLOOR = 0.1;
const UNKNOWN_DRIFT_PER_TICK = 0.15 / TRACK_HZ;

const CONFIDENCE_BOOST: Record<string, number> = { visible: 0.1, unknown: 0.05, occluded: 0.02 };
const PUNKNOWN_RECOVERY: Record<string, number> = { visible: 0.15, unknown: 0.08, occluded: 0.03 };

const INFERRED_THRESHOLD = Math.round(0.6 * TRACK_HZ);  // 3 ticks
const LOST_THRESHOLD = Math.round(3.0 * TRACK_HZ);      // 15 ticks
const EVICTION_THRESHOLD = Math.round(5.0 * TRACK_HZ);  // 25 ticks
const SALIENCY_COOLDOWN_TICKS = Math.round(1.0 * TRACK_HZ); // 5 ticks
const WARMUP_OBSERVATION_COUNT = 2;

// ── Track entry (internal mutable state) ────────────────────────────

interface RefTrackEntry {
  trackId: string;
  classLabel: string;
  classEnum: number;
  posBucketX: number;
  posBucketY: number;
  posBucketZ: number;
  proximityBucket: number;
  visibility: P21Visibility;
  riskLevel: P21RiskLevel;
  confidence: number;
  pUnknown: number;
  firstSeenTick: number;
  lastSeenTick: number;
  lastEntityId: number;
  ticksSinceObserved: number;
}

// ── Reference TrackSet ──────────────────────────────────────────────

class ReferenceTrackSet implements P21ImplementationAdapter {
  private tracks = new Map<string, RefTrackEntry>();
  private entityIdIndex = new Map<number, string>();
  private disambiguatorCounter = 0;
  private lastDeltaTick = new Map<string, number>();
  private observationCount = new Map<string, number>();
  private classifier: P21RiskClassifier;
  private cap: number;

  constructor(classifier: P21RiskClassifier, cap: number) {
    this.classifier = classifier;
    this.cap = cap;
  }

  get size(): number {
    return this.tracks.size;
  }

  getSnapshot(tickId: number): P21Snapshot {
    const tracks: P21TrackSummary[] = [];
    for (const entry of this.tracks.values()) {
      tracks.push(this.toSummary(entry));
    }
    return { tickId, tracks };
  }

  ingest(batch: P21EvidenceBatch): P21SaliencyDelta[] {
    const deltas: P21SaliencyDelta[] = [];

    for (const item of batch.items) {
      const existing = this.findAssociation(item);

      if (existing) {
        const oldTrack = { ...existing };
        this.updateTrack(existing, item, batch.tickId);

        this.observationCount.set(
          existing.trackId,
          (this.observationCount.get(existing.trackId) ?? 0) + 1,
        );

        const delta = this.saliencyDiff(oldTrack, existing);
        if (delta && this.passesCooldown(delta, batch.tickId)) {
          deltas.push(delta);
          this.lastDeltaTick.set(`${delta.trackId}:${delta.type}`, batch.tickId);
        }
      } else {
        const newTrack = this.createTrack(item, batch.tickId);
        if (newTrack) {
          this.observationCount.set(newTrack.trackId, 1);
        }
      }
    }

    // Emit deferred new_threat for tracks that have passed warmup this tick
    for (const [trackId, count] of this.observationCount) {
      if (count === WARMUP_OBSERVATION_COUNT) {
        const track = this.tracks.get(trackId);
        if (track && !this.lastDeltaTick.has(`${trackId}:new_threat`)) {
          deltas.push({
            type: 'new_threat',
            trackId: track.trackId,
            classLabel: track.classLabel,
            riskLevel: track.riskLevel,
            proximityBucket: track.proximityBucket,
            track: this.toSummary(track),
          });
          this.lastDeltaTick.set(`${trackId}:new_threat`, batch.tickId);
        }
      }
    }

    return deltas;
  }

  tick(tickId: number): P21SaliencyDelta[] {
    const deltas: P21SaliencyDelta[] = [];
    const toEvict: string[] = [];

    for (const [trackId, entry] of this.tracks) {
      if (entry.lastSeenTick === tickId) continue;

      entry.ticksSinceObserved++;
      entry.confidence = Math.max(CONFIDENCE_FLOOR, entry.confidence - CONFIDENCE_DECAY_PER_TICK);
      entry.pUnknown = Math.min(1, entry.pUnknown + UNKNOWN_DRIFT_PER_TICK);
      entry.riskLevel = this.classifier.classifyRisk(
        entry.classLabel,
        entry.proximityBucket,
        entry.pUnknown,
      );

      const oldVisibility = entry.visibility;
      if (entry.ticksSinceObserved >= LOST_THRESHOLD) {
        entry.visibility = 'lost';
      } else if (entry.ticksSinceObserved >= INFERRED_THRESHOLD) {
        entry.visibility = 'inferred';
      }

      if (oldVisibility !== 'lost' && entry.visibility === 'lost') {
        deltas.push({
          type: 'track_lost',
          trackId: entry.trackId,
          classLabel: entry.classLabel,
          riskLevel: entry.riskLevel,
          proximityBucket: entry.proximityBucket,
        });
      }

      if (entry.ticksSinceObserved >= EVICTION_THRESHOLD) {
        toEvict.push(trackId);
      }
    }

    for (const trackId of toEvict) {
      const entry = this.tracks.get(trackId);
      if (entry) {
        this.entityIdIndex.delete(entry.lastEntityId);
        this.tracks.delete(trackId);
        this.cleanupTrackState(trackId);
      }
    }

    return deltas;
  }

  // ── Private helpers ─────────────────────────────────────────────

  private findAssociation(item: P21EvidenceItem): RefTrackEntry | undefined {
    const byEngine = this.entityIdIndex.get(item.entityId);
    if (byEngine) {
      const track = this.tracks.get(byEngine);
      if (track) return track;
    }

    let best: RefTrackEntry | undefined;
    let bestDist = Infinity;

    for (const track of this.tracks.values()) {
      if (track.classEnum !== item.classEnum) continue;
      if (track.visibility === 'lost') continue;

      const dist =
        Math.abs(track.posBucketX - item.posBucketX) +
        Math.abs(track.posBucketY - item.posBucketY) +
        Math.abs(track.posBucketZ - item.posBucketZ);

      if (dist <= 3 && dist < bestDist) {
        bestDist = dist;
        best = track;
      }
    }

    return best;
  }

  private updateTrack(track: RefTrackEntry, item: P21EvidenceItem, tickId: number): void {
    if (track.lastEntityId !== item.entityId) {
      this.entityIdIndex.delete(track.lastEntityId);
      track.lastEntityId = item.entityId;
      this.entityIdIndex.set(item.entityId, track.trackId);
    }

    track.posBucketX = item.posBucketX;
    track.posBucketY = item.posBucketY;
    track.posBucketZ = item.posBucketZ;
    track.proximityBucket = item.proximityBucket;
    track.visibility = item.los === 'occluded' ? 'inferred' : 'visible';

    const boost = CONFIDENCE_BOOST[item.los] ?? CONFIDENCE_BOOST.unknown;
    track.confidence = Math.min(1, track.confidence + boost);

    const recovery = PUNKNOWN_RECOVERY[item.los] ?? PUNKNOWN_RECOVERY.unknown;
    track.pUnknown = Math.max(0, track.pUnknown - recovery);

    track.riskLevel = this.classifier.classifyRisk(
      track.classLabel,
      item.proximityBucket,
      track.pUnknown,
    );
    track.lastSeenTick = tickId;
    track.ticksSinceObserved = 0;
  }

  private createTrack(item: P21EvidenceItem, tickId: number): RefTrackEntry | null {
    if (this.tracks.size >= this.cap) {
      this.evictOne();
    }
    if (this.tracks.size >= this.cap) {
      return null;
    }

    const disambiguator = this.disambiguatorCounter++;
    const input = `${tickId}:${item.posBucketX}:${item.posBucketY}:${item.posBucketZ}:${item.classEnum}:${disambiguator}`;
    const trackId = createHash('sha256').update(input).digest('hex').slice(0, 16);

    const entry: RefTrackEntry = {
      trackId,
      classLabel: item.classLabel,
      classEnum: item.classEnum,
      posBucketX: item.posBucketX,
      posBucketY: item.posBucketY,
      posBucketZ: item.posBucketZ,
      proximityBucket: item.proximityBucket,
      visibility: item.los === 'occluded' ? 'inferred' : 'visible',
      riskLevel: this.classifier.classifyRisk(item.classLabel, item.proximityBucket, 0),
      confidence: 0.8,
      pUnknown: 0.0,
      firstSeenTick: tickId,
      lastSeenTick: tickId,
      lastEntityId: item.entityId,
      ticksSinceObserved: 0,
    };

    this.tracks.set(trackId, entry);
    this.entityIdIndex.set(item.entityId, trackId);
    return entry;
  }

  private evictOne(): void {
    let worstId: string | undefined;
    let worstScore = Infinity;

    for (const [trackId, entry] of this.tracks) {
      const riskWeight = (RISK_LEVEL_ORDER[entry.riskLevel] ?? 0) + 1;
      const recency = 1 / (entry.ticksSinceObserved + 1);
      const score = entry.confidence * (1 - entry.pUnknown * 0.5) * riskWeight * recency;

      if (score < worstScore || (score === worstScore && trackId < (worstId ?? ''))) {
        worstScore = score;
        worstId = trackId;
      }
    }

    if (worstId) {
      const entry = this.tracks.get(worstId);
      if (entry) {
        this.entityIdIndex.delete(entry.lastEntityId);
      }
      this.tracks.delete(worstId);
      this.cleanupTrackState(worstId);
    }
  }

  private saliencyDiff(
    oldTrack: RefTrackEntry,
    newTrack: RefTrackEntry,
  ): P21SaliencyDelta | null {
    if (oldTrack.riskLevel !== newTrack.riskLevel) {
      return {
        type: 'reclassified',
        trackId: newTrack.trackId,
        classLabel: newTrack.classLabel,
        riskLevel: newTrack.riskLevel,
        proximityBucket: newTrack.proximityBucket,
        prev: {
          riskLevel: oldTrack.riskLevel,
          proximityBucket: oldTrack.proximityBucket,
        },
      };
    }

    if (oldTrack.proximityBucket !== newTrack.proximityBucket) {
      return {
        type: 'movement_bucket_change',
        trackId: newTrack.trackId,
        classLabel: newTrack.classLabel,
        riskLevel: newTrack.riskLevel,
        proximityBucket: newTrack.proximityBucket,
        prev: {
          proximityBucket: oldTrack.proximityBucket,
        },
      };
    }

    return null;
  }

  private passesCooldown(delta: P21SaliencyDelta, currentTick: number): boolean {
    const key = `${delta.trackId}:${delta.type}`;
    const lastTick = this.lastDeltaTick.get(key);
    if (lastTick !== undefined && currentTick - lastTick < SALIENCY_COOLDOWN_TICKS) {
      return false;
    }
    return true;
  }

  private cleanupTrackState(trackId: string): void {
    this.observationCount.delete(trackId);
    for (const key of this.lastDeltaTick.keys()) {
      if (key.startsWith(trackId + ':')) {
        this.lastDeltaTick.delete(key);
      }
    }
  }

  private toSummary(entry: RefTrackEntry): P21TrackSummary {
    return {
      trackId: entry.trackId,
      classLabel: entry.classLabel,
      classEnum: entry.classEnum,
      posBucketX: entry.posBucketX,
      posBucketY: entry.posBucketY,
      posBucketZ: entry.posBucketZ,
      proximityBucket: entry.proximityBucket,
      visibility: entry.visibility,
      riskLevel: entry.riskLevel,
      confidence: entry.confidence,
      pUnknown: entry.pUnknown,
      firstSeenTick: entry.firstSeenTick,
      lastSeenTick: entry.lastSeenTick,
    };
  }
}

// ── Run the P21-A conformance suite ─────────────────────────────────

const SURFACE_NAME = 'Reference Security Domain';

const handle = runP21AConformanceSuite({
  name: SURFACE_NAME,
  createAdapter: (classifier) => new ReferenceTrackSet(classifier, 64),
  classifier: SECURITY_DOMAIN_CLASSIFIER,
  trackCap: 64,
  sparsityBudget: 0,
  uncertaintyThreshold: 0.5,
  mode: 'conservative',
  hysteresisBudget: 4,
  declaredExtensions: [],
});

// ── Manifest emission ───────────────────────────────────────────────

const MANIFEST_DIR = process.env.PROOF_ARTIFACT_DIR
  ?? path.resolve(__dirname, '../../../../..', '.proof-artifacts');

afterAll(() => {
  const surfaceResults = createSurfaceResultsFromHandle(handle);
  const manifest = generateP21AManifest({
    contract_version: '1.0.0',
    adapters: [{ name: SURFACE_NAME, path: __filename }],
    config: {
      trackCap: 64,
      sparsityBudget: 0,
      uncertaintyThreshold: 0.5,
      mode: 'conservative',
      hysteresisBudget: 4,
      declaredExtensions: [],
    },
    surfaceResults,
  });
  manifest.results.timestamp = new Date().toISOString();
  manifest.results.runtime = `node@${process.versions.node} / ${process.platform}-${process.arch}`;

  // Patch execution truth from handle and validate consistency
  finalizeManifest(handle, manifest);

  const surfaceSlug = SURFACE_NAME.toLowerCase().replace(/\s+/g, '-');
  const filename = `${manifest.capability_id.replace('.', '-')}-${surfaceSlug}-${process.pid}.json`;

  try {
    mkdirSync(MANIFEST_DIR, { recursive: true });
    writeFileSync(path.join(MANIFEST_DIR, filename), JSON.stringify(manifest, null, 2));
  } catch (err) {
    if (process.env.PROOF_ARTIFACT_STRICT === '1') {
      throw err;
    }
    console.warn(`[proof-artifact] Failed to write manifest: ${err}`);
  }
});

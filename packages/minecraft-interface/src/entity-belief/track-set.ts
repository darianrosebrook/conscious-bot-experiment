/**
 * TrackSet — Entity belief maintenance with bounded tracks
 *
 * Ingests EvidenceBatches, maintains a bounded set of entity tracks,
 * and emits SaliencyDeltas when significant changes occur.
 *
 * Determinism contract:
 * - Same inputs produce same outputs (no Date.now(), no Math.random())
 * - Track IDs are content-derived from firstSeenTick + position + kind
 * - Association uses engineId hint + position/kind matching
 * - Eviction is deterministic: lowest confidence * oldest * lowest threat
 */

import { createHash } from 'crypto';
import {
  EvidenceBatch,
  EvidenceItem,
  TrackEntry,
  TrackSummary,
  SaliencyDelta,
  SaliencyDeltaType,
  Snapshot,
  ThreatLevel,
  Visibility,
  LOS,
  TRACK_CAP,
  TRACK_HZ,
} from './types';

// ── Risk classifier interface ────────────────────────────────────────
// Structurally identical to P21RiskClassifier from the capsule contract.
// Defined locally to avoid runtime dependency on @conscious-bot/planning.

export interface RiskClassifier {
  readonly riskClasses: ReadonlySet<string>;
  classifyRisk(classLabel: string, proximityBucket: number, pUnknown: number): ThreatLevel;
}

// ── Threat classification ───────────────────────────────────────────

const HOSTILE_KINDS = new Set([
  'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch',
  'blaze', 'ghast', 'slime', 'phantom', 'drowned', 'husk', 'stray',
  'pillager', 'vindicator', 'ravager', 'warden', 'piglin', 'hoglin', 'zoglin',
]);

function classifyThreat(kind: string, distBucket: number, pUnknown: number = 0): ThreatLevel {
  if (pUnknown > 0.5) return 'none';
  if (!HOSTILE_KINDS.has(kind)) return 'none';
  if (distBucket <= 1) return 'critical'; // 0-3 blocks
  if (distBucket <= 3) return 'high';     // 4-7 blocks
  if (distBucket <= 5) return 'medium';   // 8-11 blocks
  return 'low';
}

const DEFAULT_CLASSIFIER: RiskClassifier = {
  riskClasses: HOSTILE_KINDS,
  classifyRisk: classifyThreat,
};

// ── Track ID generation ─────────────────────────────────────────────

function generateTrackId(
  firstSeenTick: number,
  posBucketX: number,
  posBucketY: number,
  posBucketZ: number,
  kindEnum: number,
  disambiguator: number
): string {
  const input = `${firstSeenTick}:${posBucketX}:${posBucketY}:${posBucketZ}:${kindEnum}:${disambiguator}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// ── Threat level ordering (for comparison) ──────────────────────────

const THREAT_ORDER: Record<ThreatLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// ── Decay / drift rates (defined per second, converted at module load) ──
//
// All rates are authored in "per second" units for human readability.
// The per-tick value is derived from TRACK_HZ so that changing the tick
// interval changes the per-tick step without silently altering the per-second rate.

/** Confidence decay: 0.10 per second → at 5Hz = 0.02 per tick */
const CONFIDENCE_DECAY_PER_SEC = 0.10;
const CONFIDENCE_DECAY_PER_TICK = CONFIDENCE_DECAY_PER_SEC / TRACK_HZ;

const CONFIDENCE_FLOOR = 0.1;      // confidence never drops below this (track still exists)

/** pUnknown drift: 0.15 per second → at 5Hz = 0.03 per tick */
const UNKNOWN_DRIFT_PER_SEC = 0.15;
const UNKNOWN_DRIFT_PER_TICK = UNKNOWN_DRIFT_PER_SEC / TRACK_HZ;

/** Confidence boost and pUnknown recovery are per-observation, not per-tick — unchanged */
const CONFIDENCE_BOOST: Record<LOS, number> = { visible: 0.1, unknown: 0.05, occluded: 0.02 };
const PUNKNOWN_RECOVERY: Record<LOS, number> = { visible: 0.15, unknown: 0.08, occluded: 0.03 };

/** Visibility thresholds (in seconds, converted to ticks) */
const INFERRED_AFTER_SEC = 0.6;  // 3 ticks at 5Hz
const LOST_AFTER_SEC = 3.0;      // 15 ticks at 5Hz
const EVICTION_AFTER_SEC = 5.0;  // 25 ticks at 5Hz
const INFERRED_THRESHOLD = Math.round(INFERRED_AFTER_SEC * TRACK_HZ);
const LOST_THRESHOLD = Math.round(LOST_AFTER_SEC * TRACK_HZ);
const EVICTION_THRESHOLD = Math.round(EVICTION_AFTER_SEC * TRACK_HZ);

/** Saliency cooldown: 1 second → 5 ticks at 5Hz */
const SALIENCY_COOLDOWN_SEC = 1.0;
const SALIENCY_COOLDOWN_TICKS = Math.round(SALIENCY_COOLDOWN_SEC * TRACK_HZ);

const WARMUP_OBSERVATION_COUNT = 2; // require N observations before emitting new_threat

export class TrackSet {
  private tracks = new Map<string, TrackEntry>();
  private engineIdIndex = new Map<number, string>(); // engineId → trackId
  private disambiguatorCounter = 0;
  /** Per-track last delta emission tick: `trackId:deltaType` → tick */
  private lastDeltaTick = new Map<string, number>();
  /** Per-track observation count (for warmup gating) */
  private observationCount = new Map<string, number>();
  private classifier: RiskClassifier;

  constructor(classifier?: RiskClassifier) {
    this.classifier = classifier ?? DEFAULT_CLASSIFIER;
  }

  /** Current number of active tracks */
  get size(): number {
    return this.tracks.size;
  }

  /** Get a snapshot of all tracks as immutable summaries */
  getSnapshot(tickId: number): Snapshot {
    const summaries: TrackSummary[] = [];
    for (const entry of this.tracks.values()) {
      summaries.push(trackEntryToSummary(entry));
    }
    return { tickId, tracks: summaries };
  }

  /** Get a track by ID (for testing/inspection) */
  getTrack(trackId: string): TrackEntry | undefined {
    return this.tracks.get(trackId);
  }

  /**
   * Ingest an evidence batch: associate evidence to existing tracks,
   * create new tracks, and return saliency deltas for significant changes.
   */
  ingest(batch: EvidenceBatch): SaliencyDelta[] {
    const deltas: SaliencyDelta[] = [];
    const observedTrackIds = new Set<string>();

    for (const item of batch.items) {
      const existing = this.findAssociation(item);

      if (existing) {
        // Update existing track
        const oldTrack = { ...existing };
        this.updateTrack(existing, item, batch.tickId);
        observedTrackIds.add(existing.trackId);

        // Increment observation count for warmup
        this.observationCount.set(
          existing.trackId,
          (this.observationCount.get(existing.trackId) ?? 0) + 1
        );

        const delta = this.saliencyDiff(oldTrack, existing);
        if (delta && this.passesCooldown(delta, batch.tickId)) {
          deltas.push(delta);
          this.lastDeltaTick.set(`${delta.trackId}:${delta.type}`, batch.tickId);
        }
      } else {
        // Create new track (if under cap)
        const newTrack = this.createTrack(item, batch.tickId);
        if (newTrack) {
          observedTrackIds.add(newTrack.trackId);
          // Warmup: first observation, count = 1 — defer new_threat delta
          this.observationCount.set(newTrack.trackId, 1);
          // new_threat suppressed until warmup; track still created and visible
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
            threatLevel: track.threatLevel,
            distBucket: track.distBucket,
            track: trackEntryToSummary(track),
          });
          this.lastDeltaTick.set(`${trackId}:new_threat`, batch.tickId);
        }
      }
    }

    return deltas;
  }

  /**
   * Tick: decay unobserved tracks, transition visibility states,
   * evict stale tracks. Returns deltas for tracks that become lost.
   */
  tick(currentTickId: number): SaliencyDelta[] {
    const deltas: SaliencyDelta[] = [];
    const toEvict: string[] = [];

    for (const [trackId, entry] of this.tracks) {
      if (entry.lastSeenTick === currentTickId) {
        // Was just observed this tick, skip decay
        continue;
      }

      entry.ticksSinceObserved++;

      // Confidence decay (floor, not zero)
      entry.confidence = Math.max(CONFIDENCE_FLOOR, entry.confidence - CONFIDENCE_DECAY_PER_TICK);

      // pUnknown drift: classification uncertainty grows when unobserved
      entry.pUnknown = Math.min(1, entry.pUnknown + UNKNOWN_DRIFT_PER_TICK);

      // Recompute threat with current pUnknown (may drop to 'none' when pUnknown > threshold)
      entry.threatLevel = this.classifier.classifyRisk(entry.classLabel, entry.distBucket, entry.pUnknown);

      // Visibility transitions
      const oldVisibility = entry.visibility;
      if (entry.ticksSinceObserved >= LOST_THRESHOLD) {
        entry.visibility = 'lost';
      } else if (entry.ticksSinceObserved >= INFERRED_THRESHOLD) {
        entry.visibility = 'inferred';
      }

      // Emit track_lost when transitioning to lost
      if (oldVisibility !== 'lost' && entry.visibility === 'lost') {
        deltas.push({
          type: 'track_lost',
          trackId: entry.trackId,
          classLabel: entry.classLabel,
          threatLevel: entry.threatLevel,
          distBucket: entry.distBucket,
        });
      }

      // Mark for eviction
      if (entry.ticksSinceObserved >= EVICTION_THRESHOLD) {
        toEvict.push(trackId);
      }
    }

    // Evict stale tracks
    for (const trackId of toEvict) {
      const entry = this.tracks.get(trackId);
      if (entry) {
        this.engineIdIndex.delete(entry.lastEngineId);
        this.tracks.delete(trackId);
        this.cleanupTrackState(trackId);
      }
    }

    return deltas;
  }

  /**
   * Compute saliency diff between old and new track state.
   * Returns null if no significant change (hysteresis).
   */
  saliencyDiff(oldTrack: TrackEntry | TrackSummary, newTrack: TrackEntry | TrackSummary): SaliencyDelta | null {
    // Threat level band change
    if (oldTrack.threatLevel !== newTrack.threatLevel) {
      return {
        type: 'reclassified',
        trackId: newTrack.trackId,
        classLabel: newTrack.classLabel,
        threatLevel: newTrack.threatLevel,
        distBucket: newTrack.distBucket,
        prev: {
          threatLevel: oldTrack.threatLevel,
          distBucket: oldTrack.distBucket,
        },
      };
    }

    // Distance bucket change
    if (oldTrack.distBucket !== newTrack.distBucket) {
      return {
        type: 'movement_bucket_change',
        trackId: newTrack.trackId,
        classLabel: newTrack.classLabel,
        threatLevel: newTrack.threatLevel,
        distBucket: newTrack.distBucket,
        prev: {
          distBucket: oldTrack.distBucket,
        },
      };
    }

    return null;
  }

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * Cooldown gate: suppress same delta type for the same track within
   * SALIENCY_COOLDOWN_TICKS ticks to prevent flip-flop from threshold oscillation.
   */
  private passesCooldown(delta: SaliencyDelta, currentTick: number): boolean {
    const key = `${delta.trackId}:${delta.type}`;
    const lastTick = this.lastDeltaTick.get(key);
    if (lastTick !== undefined && currentTick - lastTick < SALIENCY_COOLDOWN_TICKS) {
      return false;
    }
    return true;
  }

  /** Clean up per-track auxiliary state on eviction */
  private cleanupTrackState(trackId: string): void {
    this.observationCount.delete(trackId);
    // Clean all cooldown entries for this track
    for (const key of this.lastDeltaTick.keys()) {
      if (key.startsWith(trackId + ':')) {
        this.lastDeltaTick.delete(key);
      }
    }
  }

  private findAssociation(item: EvidenceItem): TrackEntry | undefined {
    // Primary: engineId hint
    const trackIdByEngine = this.engineIdIndex.get(item.engineId);
    if (trackIdByEngine) {
      const track = this.tracks.get(trackIdByEngine);
      if (track) return track;
    }

    // Secondary: position + kind matching (nearest within same kind)
    let bestMatch: TrackEntry | undefined;
    let bestDist = Infinity;

    for (const track of this.tracks.values()) {
      if (track.kindEnum !== item.kindEnum) continue;
      if (track.visibility === 'lost') continue;

      const dx = track.posBucketX - item.posBucketX;
      const dy = track.posBucketY - item.posBucketY;
      const dz = track.posBucketZ - item.posBucketZ;
      const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz); // Manhattan distance in buckets

      if (dist <= 3 && dist < bestDist) {
        bestDist = dist;
        bestMatch = track;
      }
    }

    return bestMatch;
  }

  private updateTrack(track: TrackEntry, item: EvidenceItem, tickId: number): void {
    // Update engine ID mapping
    if (track.lastEngineId !== item.engineId) {
      this.engineIdIndex.delete(track.lastEngineId);
      track.lastEngineId = item.engineId;
      this.engineIdIndex.set(item.engineId, track.trackId);
    }

    track.posBucketX = item.posBucketX;
    track.posBucketY = item.posBucketY;
    track.posBucketZ = item.posBucketZ;
    track.distBucket = item.distBucket;
    track.visibility = item.los === 'occluded' ? 'inferred' : 'visible';

    // Quality-gated confidence boost (C2)
    const boost = CONFIDENCE_BOOST[item.los] ?? CONFIDENCE_BOOST.unknown;
    track.confidence = Math.min(1, track.confidence + boost);

    // pUnknown recovery: observation reduces classification uncertainty (C1)
    const recovery = PUNKNOWN_RECOVERY[item.los] ?? PUNKNOWN_RECOVERY.unknown;
    track.pUnknown = Math.max(0, track.pUnknown - recovery);

    track.threatLevel = this.classifier.classifyRisk(track.classLabel, item.distBucket, track.pUnknown);
    track.lastSeenTick = tickId;
    track.ticksSinceObserved = 0;
  }

  private createTrack(item: EvidenceItem, tickId: number): TrackEntry | null {
    // Enforce capacity: evict if at cap
    if (this.tracks.size >= TRACK_CAP) {
      this.evictOne();
    }

    // Still at cap after eviction attempt (shouldn't happen, but guard)
    if (this.tracks.size >= TRACK_CAP) {
      return null;
    }

    const disambiguator = this.disambiguatorCounter++;
    const trackId = generateTrackId(
      tickId,
      item.posBucketX,
      item.posBucketY,
      item.posBucketZ,
      item.kindEnum,
      disambiguator
    );

    const entry: TrackEntry = {
      trackId,
      classLabel: item.kind,
      kindEnum: item.kindEnum,
      posBucketX: item.posBucketX,
      posBucketY: item.posBucketY,
      posBucketZ: item.posBucketZ,
      distBucket: item.distBucket,
      visibility: item.los === 'occluded' ? 'inferred' : 'visible',
      threatLevel: this.classifier.classifyRisk(item.kind, item.distBucket, 0),
      confidence: 0.8,
      pUnknown: 0.0, // Fresh evidence = strong classification
      firstSeenTick: tickId,
      lastSeenTick: tickId,
      lastEngineId: item.engineId,
      ticksSinceObserved: 0,
    };

    this.tracks.set(trackId, entry);
    this.engineIdIndex.set(item.engineId, trackId);

    return entry;
  }

  /**
   * Evict the least important track.
   * Policy: lowest (confidence * threatWeight * recency)
   * Deterministic: ties broken by trackId lexicographic order.
   */
  private evictOne(): void {
    let worstId: string | undefined;
    let worstScore = Infinity;

    for (const [trackId, entry] of this.tracks) {
      const threatWeight = THREAT_ORDER[entry.threatLevel] + 1;
      const recency = 1 / (entry.ticksSinceObserved + 1);
      const score = entry.confidence * (1 - entry.pUnknown * 0.5) * threatWeight * recency;

      if (score < worstScore || (score === worstScore && trackId < (worstId ?? ''))) {
        worstScore = score;
        worstId = trackId;
      }
    }

    if (worstId) {
      const entry = this.tracks.get(worstId);
      if (entry) {
        this.engineIdIndex.delete(entry.lastEngineId);
      }
      this.tracks.delete(worstId);
      this.cleanupTrackState(worstId);
    }
  }
}

function trackEntryToSummary(entry: TrackEntry): TrackSummary {
  return {
    trackId: entry.trackId,
    classLabel: entry.classLabel,
    kindEnum: entry.kindEnum,
    posBucketX: entry.posBucketX,
    posBucketY: entry.posBucketY,
    posBucketZ: entry.posBucketZ,
    distBucket: entry.distBucket,
    visibility: entry.visibility,
    threatLevel: entry.threatLevel,
    confidence: entry.confidence,
    pUnknown: entry.pUnknown,
    firstSeenTick: entry.firstSeenTick,
    lastSeenTick: entry.lastSeenTick,
  };
}

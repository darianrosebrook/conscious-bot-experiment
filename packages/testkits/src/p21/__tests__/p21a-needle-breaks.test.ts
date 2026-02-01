/**
 * P21-A Needle-Break Harness
 *
 * Calibrates the conformance probes as a measurement instrument.
 * Each "needle" injects a specific mutation into a reference TrackSet
 * and asserts that exactly the expected invariants fail (precision)
 * and that all expected invariants do fail (recall).
 *
 * This proves that the harness produces clean, layer-correct failure signals.
 * If a needle has unexpected collateral failures, the toleration set must
 * be explicitly reviewed and justified.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  P21A_PROBE_REGISTRY,
  type AdapterFactory,
  type ProbeConfig,
  type InvariantProbeEntry,
} from '../p21a-invariant-probes';
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

// ── Constants (mirrored from reference-security) ────────────────────

const TRACK_HZ = 5;
const CONFIDENCE_DECAY_PER_TICK = 0.10 / TRACK_HZ;
const CONFIDENCE_FLOOR = 0.1;
const UNKNOWN_DRIFT_PER_TICK = 0.15 / TRACK_HZ;

const CONFIDENCE_BOOST: Record<string, number> = { visible: 0.1, unknown: 0.05, occluded: 0.02 };
const PUNKNOWN_RECOVERY: Record<string, number> = { visible: 0.15, unknown: 0.08, occluded: 0.03 };

const INFERRED_THRESHOLD = Math.round(0.6 * TRACK_HZ);
const LOST_THRESHOLD = Math.round(3.0 * TRACK_HZ);
const EVICTION_THRESHOLD = Math.round(5.0 * TRACK_HZ);
const SALIENCY_COOLDOWN_TICKS = Math.round(1.0 * TRACK_HZ);
const WARMUP_OBSERVATION_COUNT = 2;

// ── Mutation hooks ──────────────────────────────────────────────────

interface MutationHooks {
  overridePUnknownDrift?: (current: number, drift: number) => number;
  overrideAssociation?: (item: P21EvidenceItem, candidate: RefTrackEntry | undefined) => RefTrackEntry | undefined | 'always_new';
  overrideBoundedness?: (currentSize: number, cap: number) => boolean;
  overrideNewThreatDelta?: (delta: P21SaliencyDelta) => P21SaliencyDelta;
  overrideTrackIdHash?: (item: P21EvidenceItem, tickId: number, disambiguator: number) => string;
  overrideRiskClassification?: (classLabel: string, proxBucket: number, pUnknown: number, classifier: P21RiskClassifier) => P21RiskLevel;
  /** If true, tracks are never evicted (used to test extension fail-closed paths). */
  disableEviction?: boolean;
}

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

// ── HookableReferenceTrackSet ───────────────────────────────────────

class HookableReferenceTrackSet implements P21ImplementationAdapter {
  private tracks = new Map<string, RefTrackEntry>();
  private entityIdIndex = new Map<number, string>();
  private disambiguatorCounter = 0;
  private lastDeltaTick = new Map<string, number>();
  private observationCount = new Map<string, number>();
  private classifier: P21RiskClassifier;
  private cap: number;
  private hooks: MutationHooks;

  constructor(classifier: P21RiskClassifier, cap: number, hooks: MutationHooks = {}) {
    this.classifier = classifier;
    this.cap = cap;
    this.hooks = hooks;
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
      const rawCandidate = this.findAssociation(item);
      let existing: RefTrackEntry | undefined;

      if (this.hooks.overrideAssociation) {
        const result = this.hooks.overrideAssociation(item, rawCandidate);
        if (result === 'always_new') {
          existing = undefined;
        } else {
          existing = result;
        }
      } else {
        existing = rawCandidate;
      }

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

    for (const [trackId, count] of this.observationCount) {
      if (count === WARMUP_OBSERVATION_COUNT) {
        const track = this.tracks.get(trackId);
        if (track && !this.lastDeltaTick.has(`${trackId}:new_threat`)) {
          let delta: P21SaliencyDelta = {
            type: 'new_threat',
            trackId: track.trackId,
            classLabel: track.classLabel,
            riskLevel: track.riskLevel,
            proximityBucket: track.proximityBucket,
            track: this.toSummary(track),
          };
          if (this.hooks.overrideNewThreatDelta) {
            delta = this.hooks.overrideNewThreatDelta(delta);
          }
          deltas.push(delta);
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

      // Hook: pUnknown drift
      if (this.hooks.overridePUnknownDrift) {
        entry.pUnknown = this.hooks.overridePUnknownDrift(entry.pUnknown, UNKNOWN_DRIFT_PER_TICK);
      } else {
        entry.pUnknown = Math.min(1, entry.pUnknown + UNKNOWN_DRIFT_PER_TICK);
      }

      // Hook: risk classification
      if (this.hooks.overrideRiskClassification) {
        entry.riskLevel = this.hooks.overrideRiskClassification(
          entry.classLabel, entry.proximityBucket, entry.pUnknown, this.classifier,
        );
      } else {
        entry.riskLevel = this.classifier.classifyRisk(
          entry.classLabel, entry.proximityBucket, entry.pUnknown,
        );
      }

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

      if (!this.hooks.disableEviction && entry.ticksSinceObserved >= EVICTION_THRESHOLD) {
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

    // Hook: risk classification on update
    if (this.hooks.overrideRiskClassification) {
      track.riskLevel = this.hooks.overrideRiskClassification(
        track.classLabel, item.proximityBucket, track.pUnknown, this.classifier,
      );
    } else {
      track.riskLevel = this.classifier.classifyRisk(
        track.classLabel, item.proximityBucket, track.pUnknown,
      );
    }
    track.lastSeenTick = tickId;
    track.ticksSinceObserved = 0;
  }

  private createTrack(item: P21EvidenceItem, tickId: number): RefTrackEntry | null {
    // Hook: boundedness check
    const isAtCap = this.hooks.overrideBoundedness
      ? this.hooks.overrideBoundedness(this.tracks.size, this.cap)
      : this.tracks.size >= this.cap;

    if (isAtCap) {
      this.evictOne();
    }

    // After eviction, re-check with the standard logic (not the hook)
    // to ensure we don't infinitely loop on broken boundedness hooks
    if (this.tracks.size >= this.cap && !this.hooks.overrideBoundedness) {
      return null;
    }
    // With override: allow creation even if at cap (to test boundedness violation)
    if (!this.hooks.overrideBoundedness && this.tracks.size >= this.cap) {
      return null;
    }

    const disambiguator = this.disambiguatorCounter++;

    let trackId: string;
    if (this.hooks.overrideTrackIdHash) {
      trackId = this.hooks.overrideTrackIdHash(item, tickId, disambiguator);
    } else {
      const input = `${tickId}:${item.posBucketX}:${item.posBucketY}:${item.posBucketZ}:${item.classEnum}:${disambiguator}`;
      trackId = createHash('sha256').update(input).digest('hex').slice(0, 16);
    }

    const riskLevel = this.hooks.overrideRiskClassification
      ? this.hooks.overrideRiskClassification(item.classLabel, item.proximityBucket, 0, this.classifier)
      : this.classifier.classifyRisk(item.classLabel, item.proximityBucket, 0);

    const entry: RefTrackEntry = {
      trackId,
      classLabel: item.classLabel,
      classEnum: item.classEnum,
      posBucketX: item.posBucketX,
      posBucketY: item.posBucketY,
      posBucketZ: item.posBucketZ,
      proximityBucket: item.proximityBucket,
      visibility: item.los === 'occluded' ? 'inferred' : 'visible',
      riskLevel,
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

  private saliencyDiff(oldTrack: RefTrackEntry, newTrack: RefTrackEntry): P21SaliencyDelta | null {
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

// ── Needle-break runner ─────────────────────────────────────────────

interface NeedleResult {
  invariantId: string;
  passed: boolean;
  error?: Error;
}

interface FailureSignature {
  expectedFailures: string[];
  toleratedFailures?: string[];
}

function runAllProbes(
  createAdapter: AdapterFactory,
  classifier: P21RiskClassifier,
  config: ProbeConfig,
): NeedleResult[] {
  const results: NeedleResult[] = [];

  for (const entry of P21A_PROBE_REGISTRY) {
    if (entry.guard && !entry.guard(config)) {
      continue;
    }
    try {
      entry.probe(createAdapter, classifier, config);
      results.push({ invariantId: entry.id, passed: true });
    } catch (err) {
      results.push({
        invariantId: entry.id,
        passed: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  return results;
}

function assertFailureSignature(
  results: NeedleResult[],
  signature: FailureSignature,
  mutationName: string,
): void {
  const failed = new Set(results.filter(r => !r.passed).map(r => r.invariantId));
  const expected = new Set(signature.expectedFailures);
  const tolerated = new Set(signature.toleratedFailures ?? []);

  // Recall: every expected failure actually failed
  for (const exp of expected) {
    if (!failed.has(exp)) {
      throw new Error(
        `[${mutationName}] Expected ${exp} to FAIL but it PASSED. ` +
        `Failed set: [${[...failed].join(', ')}]`,
      );
    }
  }

  // Precision: no unexpected failures beyond expected + tolerated
  const unexpected = [...failed].filter(id => !expected.has(id) && !tolerated.has(id));
  if (unexpected.length > 0) {
    const details = results
      .filter(r => unexpected.includes(r.invariantId))
      .map(r => `  ${r.invariantId}: ${r.error?.message?.slice(0, 120)}`)
      .join('\n');
    throw new Error(
      `[${mutationName}] Unexpected failures: [${unexpected.join(', ')}]\n${details}`,
    );
  }

  // Diagnostic: compute and log metrics
  const recall = [...expected].filter(e => failed.has(e)).length / expected.size;
  const precision = [...expected].filter(e => failed.has(e)).length / Math.max(failed.size, 1);
  // eslint-disable-next-line no-console
  console.log(
    `  [needle:${mutationName}] recall=${recall.toFixed(2)} precision=${precision.toFixed(2)} ` +
    `failed=[${[...failed].join(',')}] expected=[${[...expected].join(',')}] ` +
    `tolerated=[${[...tolerated].join(',')}]`,
  );
}

// ── Test config ─────────────────────────────────────────────────────

const PROBE_CONFIG: ProbeConfig = {
  trackCap: 64,
  sparsityBudget: 0,
  uncertaintyThreshold: 0.5,
  mode: 'conservative',
  hysteresisBudget: 4,
  declaredExtensions: [],
};

const classifier = SECURITY_DOMAIN_CLASSIFIER;

// ── Tests ───────────────────────────────────────────────────────────

describe('P21-A Needle-Break Harness', () => {
  // ── Sanity: unmutated reference passes all probes ─────────────────

  it('SANITY: all probes pass against unmutated reference', () => {
    const createAdapter: AdapterFactory = (cls) =>
      new HookableReferenceTrackSet(cls, PROBE_CONFIG.trackCap);

    const results = runAllProbes(createAdapter, classifier, PROBE_CONFIG);
    const failures = results.filter(r => !r.passed);

    if (failures.length > 0) {
      const details = failures
        .map(f => `  ${f.invariantId}: ${f.error?.message?.slice(0, 200)}`)
        .join('\n');
      throw new Error(`Unmutated reference failed ${failures.length} probes:\n${details}`);
    }
  });

  // ── Category 1: Single-invariant needles ──────────────────────────

  describe('single-invariant needles', () => {
    it('punknown_decreases_unobserved: INV-4 fails (pUnknown decreases instead of increasing)', () => {
      const createAdapter: AdapterFactory = (cls) =>
        new HookableReferenceTrackSet(cls, PROBE_CONFIG.trackCap, {
          overridePUnknownDrift: (current, _drift) => Math.max(0, current - 0.01),
        });

      const results = runAllProbes(createAdapter, classifier, PROBE_CONFIG);
      assertFailureSignature(results, {
        expectedFailures: ['INV-4'],
        toleratedFailures: ['INV-5'],
      }, 'punknown_decreases_unobserved');
    });

    it('track_count_exceeds_cap: INV-2 fails (boundedness check always passes, allowing unbounded growth)', () => {
      const createAdapter: AdapterFactory = (cls) =>
        new HookableReferenceTrackSet(cls, PROBE_CONFIG.trackCap, {
          overrideBoundedness: (_currentSize, _cap) => false,
        });

      const results = runAllProbes(createAdapter, classifier, PROBE_CONFIG);
      assertFailureSignature(results, {
        expectedFailures: ['INV-2'],
        toleratedFailures: ['INV-1', 'INV-3'],
      }, 'track_count_exceeds_cap');
    });

    it('new_threat_missing_track: INV-8 fails (.track stripped from new_threat deltas)', () => {
      const createAdapter: AdapterFactory = (cls) =>
        new HookableReferenceTrackSet(cls, PROBE_CONFIG.trackCap, {
          overrideNewThreatDelta: (delta) => {
            const { track: _, ...rest } = delta;
            return rest as P21SaliencyDelta;
          },
        });

      const results = runAllProbes(createAdapter, classifier, PROBE_CONFIG);
      assertFailureSignature(results, {
        expectedFailures: ['INV-8'],
        toleratedFailures: [],
      }, 'new_threat_missing_track');
    });

    it('features_affect_trackid: INV-9 fails (features included in trackId hash)', () => {
      const createAdapter: AdapterFactory = (cls) =>
        new HookableReferenceTrackSet(cls, PROBE_CONFIG.trackCap, {
          overrideTrackIdHash: (item, tickId, disambiguator) => {
            const featureStr = item.features ? JSON.stringify(item.features) : '';
            const input = `${tickId}:${item.posBucketX}:${item.posBucketY}:${item.posBucketZ}:${item.classEnum}:${disambiguator}:${featureStr}`;
            return createHash('sha256').update(input).digest('hex').slice(0, 16);
          },
        });

      const results = runAllProbes(createAdapter, classifier, PROBE_CONFIG);
      assertFailureSignature(results, {
        expectedFailures: ['INV-9'],
        toleratedFailures: ['INV-1'],
      }, 'features_affect_trackid');
    });
  });

  // ── Category 2: Known-coupled needles ─────────────────────────────

  describe('known-coupled needles', () => {
    it('broken_association: always_new tracks cause proliferation failures (INV-3, INV-8, INV-9)', () => {
      // With always_new, every observation creates a fresh track instead of
      // updating existing ones. The original track persists during INV-7's
      // 5-tick occlusion gap, so identity_persistence passes vacuously.
      // The real damage is proliferation: extra deltas (INV-3), new tracks
      // miss warmup sequencing (INV-8), different creation paths (INV-9).
      const createAdapter: AdapterFactory = (cls) =>
        new HookableReferenceTrackSet(cls, PROBE_CONFIG.trackCap, {
          overrideAssociation: (_item, _candidate) => 'always_new',
        });

      const results = runAllProbes(createAdapter, classifier, PROBE_CONFIG);
      assertFailureSignature(results, {
        expectedFailures: ['INV-3'],
        toleratedFailures: ['INV-1', 'INV-2', 'INV-7', 'INV-8', 'INV-9'],
      }, 'broken_association');
    });

    it('risk_never_suppressed: INV-5 fails (risk stays elevated despite high pUnknown)', () => {
      // When classification ignores pUnknown, risk stays elevated even as
      // pUnknown increases past the suppression threshold. With eviction
      // disabled, the track survives to tick 40 with pUnknown > 0.5 and
      // high risk — INV-5 expects risk ≤ 'low' but gets 'high'.
      const createAdapter: AdapterFactory = (cls) =>
        new HookableReferenceTrackSet(cls, PROBE_CONFIG.trackCap, {
          overrideRiskClassification: (classLabel, proxBucket, _pUnknown, clsf) =>
            clsf.classifyRisk(classLabel, proxBucket, 0),
          disableEviction: true,
        });

      const results = runAllProbes(createAdapter, classifier, PROBE_CONFIG);
      assertFailureSignature(results, {
        expectedFailures: ['INV-5'],
        toleratedFailures: ['INV-4'],
      }, 'risk_never_suppressed');
    });
  });

  // ── Category 3: Extension/mode gating ─────────────────────────────

  describe('extension gating needles', () => {
    it('declare_risk_components_without_method: INV-5 fails (extension declared, method missing)', () => {
      // The risk_components_v1 extension gates the INV-5 branch that calls
      // classifyRiskDetailed. With this extension declared but the method
      // absent, INV-5 should fail with "expect(...).toBeDefined()".
      //
      // The reference TrackSet evicts tracks at 25 ticks, but INV-5 checks
      // at tick 40 — past eviction. To exercise the fail-closed path, we
      // use overridePUnknownDrift to make pUnknown reach the threshold
      // quickly, then cap it to avoid triggering eviction-related issues.
      // The track is still evicted at tick 28, so the probe needs a track
      // alive at tick 40 with pUnknown > 0.5. We override risk classification
      // to keep risk at 'none' (preventing classifier from suppressing it
      // normally) — this keeps the track alive but with high pUnknown.
      // Actually, eviction is based on ticksSinceObserved, not risk, so
      // the track will still be evicted.
      //
      // Real solution: the reference TrackSet evicts at 25 ticks. The probe
      // checks at tick 40. With any reference implementation using this
      // eviction window, the track won't survive. This is by-design: eviction
      // IS a form of risk suppression.
      //
      // To test fail-closed properly, we use a wider eviction window via
      // a custom subclass with no eviction.
      const classifierWithoutDetailed: P21RiskClassifier = {
        riskClasses: classifier.riskClasses,
        classifyRisk: classifier.classifyRisk,
        // classifyRiskDetailed intentionally omitted
      };

      const extensionConfig: ProbeConfig = {
        ...PROBE_CONFIG,
        declaredExtensions: ['risk_components_v1'],
      };

      // Disable eviction so the track survives past tick 40 with pUnknown > threshold
      const createAdapter: AdapterFactory = (cls) =>
        new HookableReferenceTrackSet(cls, extensionConfig.trackCap, {
          disableEviction: true,
        });

      const results = runAllProbes(createAdapter, classifierWithoutDetailed, extensionConfig);
      assertFailureSignature(results, {
        expectedFailures: ['INV-5'],
        toleratedFailures: [],
      }, 'declare_risk_components_without_method');
    });

    it('predictive_without_extension: INV-4b fails (predictive mode without extension)', () => {
      const predictiveConfig: ProbeConfig = {
        ...PROBE_CONFIG,
        mode: 'predictive',
        declaredExtensions: [],
      };

      const createAdapter: AdapterFactory = (cls) =>
        new HookableReferenceTrackSet(cls, predictiveConfig.trackCap);

      const results = runAllProbes(createAdapter, classifier, predictiveConfig);
      assertFailureSignature(results, {
        expectedFailures: ['INV-4b'],
        toleratedFailures: [],
      }, 'predictive_without_extension');
    });
  });
});

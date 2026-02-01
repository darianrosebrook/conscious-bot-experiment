/**
 * Entity Belief Maintenance Types
 *
 * Defines the belief-layer boundary contract: raw entity detections
 * are fused into tracks, and only SaliencyDeltas/Snapshots cross
 * into cognition and planning.
 *
 * All spatial values use integer buckets (no floats in deterministic core).
 * All ordering uses monotonic tickId (no Date.now() in belief core).
 */

// ── Constants ───────────────────────────────────────────────────────

export const POS_BUCKET_SIZE = 1;
export const DIST_BUCKET_SIZE = 2;
export const TRACK_CAP = 64;
export const MAX_SALIENCY_EVENTS_PER_EMISSION = 32;
export const TICK_INTERVAL_MS = 200;
export const EMIT_INTERVAL_MS = 1000;
/** Derived tick rate (Hz). All per-second rates are converted to per-tick using this. */
export const TRACK_HZ = 1000 / TICK_INTERVAL_MS; // 5 Hz
export const SNAPSHOT_INTERVAL_TICKS = 25; // ~5s at 5Hz

// ── Entity Kind Enum ────────────────────────────────────────────────

export const ENTITY_KIND_ENUM: Record<string, number> = {
  zombie: 1,
  skeleton: 2,
  creeper: 3,
  spider: 4,
  enderman: 5,
  witch: 6,
  blaze: 7,
  ghast: 8,
  slime: 9,
  phantom: 10,
  drowned: 11,
  husk: 12,
  stray: 13,
  pillager: 14,
  vindicator: 15,
  ravager: 16,
  warden: 17,
  piglin: 18,
  hoglin: 19,
  zoglin: 20,
  // Passive / neutral
  player: 100,
  villager: 101,
  cow: 102,
  sheep: 103,
  pig: 104,
  chicken: 105,
  wolf: 106,
  cat: 107,
  horse: 108,
  iron_golem: 109,
  // Fallback
  unknown: 999,
};

// ── LOS Vocabulary ──────────────────────────────────────────────────

export const LOS_VALUES = ['visible', 'occluded', 'unknown'] as const;
export type LOS = (typeof LOS_VALUES)[number];

// ── Evidence Layer ──────────────────────────────────────────────────

export interface EvidenceItem {
  /** Minecraft engine entity ID (may change on respawn) */
  engineId: number;
  /** Entity type name */
  kind: string;
  /** Numeric enum for deterministic sorting */
  kindEnum: number;
  /** Integer-bucketed position */
  posBucketX: number;
  posBucketY: number;
  posBucketZ: number;
  /** Integer-bucketed distance from bot */
  distBucket: number;
  /** Line-of-sight status */
  los: LOS;
  /** Optional extra features (health, equipment, etc.) */
  features: Record<string, number | string>;
}

export interface EvidenceBatch {
  tickId: number;
  items: EvidenceItem[];
}

export interface CanonicalEvidenceKey {
  posBucketX: number;
  posBucketY: number;
  posBucketZ: number;
  distBucket: number;
  kindEnum: number;
}

// ── Track Layer ─────────────────────────────────────────────────────

export type Visibility = 'visible' | 'inferred' | 'lost';

export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface TrackSummary {
  trackId: string;
  classLabel: string;
  kindEnum: number;
  posBucketX: number;
  posBucketY: number;
  posBucketZ: number;
  distBucket: number;
  visibility: Visibility;
  threatLevel: ThreatLevel;
  confidence: number; // 0..1
  /** Classification uncertainty: probability mass for "don't know what this is" */
  pUnknown: number; // 0..1
  firstSeenTick: number;
  lastSeenTick: number;
}

/** Internal mutable track entry used by TrackSet */
export interface TrackEntry extends TrackSummary {
  /** Most recent engine ID associated with this track */
  lastEngineId: number;
  /** Ticks since last direct observation */
  ticksSinceObserved: number;
}

// ── Saliency Layer ──────────────────────────────────────────────────

export type SaliencyDeltaType =
  | 'new_threat'
  | 'track_lost'
  | 'reclassified'
  | 'movement_bucket_change';

export interface SaliencyDelta {
  type: SaliencyDeltaType;
  trackId: string;
  classLabel: string;
  threatLevel: ThreatLevel;
  distBucket: number;
  /** Previous values for change context */
  prev?: {
    threatLevel?: ThreatLevel;
    distBucket?: number;
  };
  /** Full track state, included on new_threat so cognition can hydrate without snapshot */
  track?: TrackSummary;
}

// ── Snapshot ─────────────────────────────────────────────────────────

export interface Snapshot {
  tickId: number;
  tracks: TrackSummary[];
}

// ── Stream Envelope ─────────────────────────────────────────────────

export interface BeliefStreamEnvelope {
  request_version: 'saliency_delta';
  type: 'environmental_awareness';
  /** Stable bot identity (e.g. 'bot-steve'). Does not change across restarts. */
  bot_id: string;
  /** Ephemeral stream identity. Changes on every bot instantiation. */
  stream_id: string;
  seq: number;
  tick_id: number;
  snapshot?: Snapshot;
  saliency_events: SaliencyDelta[];
}

export {
  // Types
  type EvidenceBatch,
  type EvidenceItem,
  type CanonicalEvidenceKey,
  type TrackSummary,
  type TrackEntry,
  type SaliencyDelta,
  type SaliencyDeltaType,
  type Snapshot,
  type BeliefStreamEnvelope,
  type Visibility,
  type ThreatLevel,
  type LOS,
  // Constants
  LOS_VALUES,
  POS_BUCKET_SIZE,
  DIST_BUCKET_SIZE,
  TRACK_CAP,
  MAX_SALIENCY_EVENTS_PER_EMISSION,
  TICK_INTERVAL_MS,
  EMIT_INTERVAL_MS,
  SNAPSHOT_INTERVAL_TICKS,
  ENTITY_KIND_ENUM,
} from './types';

export {
  buildEvidenceBatch,
  canonicalizeEvidence,
  toPosBucket,
  toDistBucket,
  kindToEnum,
} from './evidence-builder';

export { TrackSet, type RiskClassifier } from './track-set';
export { BeliefBus } from './belief-bus';
export {
  BeliefTelemetry,
  type BeliefTelemetryCounters,
  type PreventabilitySignal,
} from './telemetry';

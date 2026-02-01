/**
 * P21 Primitive Capsule — Domain-Agnostic Types
 *
 * Defines the contract for entity belief maintenance and saliency
 * as a portable primitive that any domain can implement.
 *
 * Zero Minecraft imports. Zero vitest imports.
 *
 * Field naming conventions (pivots from Minecraft-flavored rig names):
 *   distBucket      -> proximityBucket  (monotone proximity/imminence ordinal)
 *   threatLevel     -> riskLevel        (not all domains have "threats")
 *   hostileClasses  -> riskClasses      (not all domains have static hostile labels)
 *   classifyThreat  -> classifyRisk
 *   engineId        -> entityId
 *   kindEnum        -> classEnum
 */

// ── Risk Level ──────────────────────────────────────────────────────

export type P21RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export const RISK_LEVEL_ORDER: Record<P21RiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// ── Belief Mode (Pivot 1) ───────────────────────────────────────────

/**
 * Conservative: uncertainty always suppresses risk (current Minecraft behavior).
 * Predictive: uncertainty does not force risk downward; risk can persist
 * under high pUnknown if the domain's classifier chooses so.
 */
export type P21BeliefMode = 'conservative' | 'predictive';

// ── Extensions (declaration-gated, not method-existence-gated) ──────

/**
 * Declared extensions that activate additional invariant checks.
 * Extension-specific invariants only fire when the extension is declared
 * in the adapter's capability descriptor — method presence alone is not
 * negotiation; negotiation is declaration.
 */
export type P21Extension =
  | 'risk_components_v1'
  | 'id_robustness'
  | 'predictive_model';

// ── Risk Detail (Pivot 1) ───────────────────────────────────────────

/**
 * Decomposed risk classification returned by classifyRiskDetailed.
 * Separates classification-derived risk from presence-derived risk,
 * allowing the conformance suite to assert on each component.
 */
export interface P21RiskDetail {
  /** Final risk level (what the adapter should use) */
  riskLevel: P21RiskLevel;
  /** Risk from classification certainty (suppressed by high pUnknown) */
  classificationRisk: P21RiskLevel;
  /** Risk from mere presence (unconstrained by pUnknown) */
  presenceRisk: P21RiskLevel;
}

// ── Evidence Layer ──────────────────────────────────────────────────

export interface P21EvidenceItem {
  entityId: number;
  classLabel: string;
  classEnum: number;
  posBucketX: number;
  posBucketY: number;
  posBucketZ: number;
  /** Monotone proximity/imminence ordinal (lower = closer/more imminent) */
  proximityBucket: number;
  los: 'visible' | 'occluded' | 'unknown';
  /** Optional extra features. Excluded from hashing; size-capped by adapter. */
  features?: Record<string, number | string>;
}

export interface P21EvidenceBatch {
  tickId: number;
  items: P21EvidenceItem[];
}

// ── Track Layer ─────────────────────────────────────────────────────

export type P21Visibility = 'visible' | 'inferred' | 'lost';

export interface P21TrackSummary {
  trackId: string;
  classLabel: string;
  classEnum: number;
  posBucketX: number;
  posBucketY: number;
  posBucketZ: number;
  proximityBucket: number;
  visibility: P21Visibility;
  riskLevel: P21RiskLevel;
  /** Existence confidence: 0..1 */
  confidence: number;
  /** Classification uncertainty: 0..1 */
  pUnknown: number;
  firstSeenTick: number;
  lastSeenTick: number;
}

// ── Saliency Layer ──────────────────────────────────────────────────

export type P21DeltaType =
  | 'new_threat'
  | 'track_lost'
  | 'reclassified'
  | 'movement_bucket_change';

export interface P21SaliencyDelta {
  type: P21DeltaType;
  trackId: string;
  classLabel: string;
  riskLevel: P21RiskLevel;
  proximityBucket: number;
  prev?: { riskLevel?: P21RiskLevel; proximityBucket?: number };
  /** Full track state. Required on new_threat. */
  track?: P21TrackSummary;
}

// ── Snapshot ────────────────────────────────────────────────────────

export interface P21Snapshot {
  tickId: number;
  tracks: P21TrackSummary[];
}

// ── Envelope ────────────────────────────────────────────────────────

export interface P21Envelope {
  request_version: 'saliency_delta';
  type: 'environmental_awareness';
  bot_id: string;
  stream_id: string;
  seq: number;
  tick_id: number;
  snapshot?: P21Snapshot;
  saliency_events: P21SaliencyDelta[];
}

// ── Adapter Interface ───────────────────────────────────────────────

export interface P21RiskClassifier {
  /**
   * Set of class labels considered risk-bearing in this domain.
   * For domains where risk is stateful (not label-based), return the
   * currently-risk-bearing set; the classifier is queried per-tick.
   */
  readonly riskClasses: ReadonlySet<string>;

  /**
   * Classify risk given class, proximity, and classification uncertainty.
   * Must be pure (deterministic, no side effects).
   */
  classifyRisk(classLabel: string, proximityBucket: number, pUnknown: number): P21RiskLevel;

  /**
   * Optional: decomposed risk classification (Pivot 1).
   * When present, the conformance suite can assert on classificationRisk
   * and presenceRisk independently, enabling predictive-mode domains
   * where presence risk is not suppressed by uncertainty.
   */
  classifyRiskDetailed?(
    classLabel: string,
    proximityBucket: number,
    pUnknown: number,
  ): P21RiskDetail;
}

export interface P21ImplementationAdapter {
  ingest(batch: P21EvidenceBatch): P21SaliencyDelta[];
  tick(tickId: number): P21SaliencyDelta[];
  getSnapshot(tickId: number): P21Snapshot;
  readonly size: number;
}

// ── Emission Adapter Interface (Pivot 4 — P21-B) ───────────────────

/**
 * Emission-layer adapter for P21-B invariants.
 * Separates delta budgeting (emission concern) from track maintenance
 * (adapter concern). The P21-A adapter produces deltas; the P21-B
 * emission adapter caps, envelopes, and snapshots them.
 */
export interface P21EmissionAdapter {
  /** Ingest a batch of deltas and advance the emission tick counter. */
  ingestAndTick(batch: P21EvidenceBatch): void;
  /** Build an envelope for the given sequence number. */
  buildEnvelope(seq: number): P21Envelope;
  /** Whether the adapter has any content to emit. */
  hasContent(): boolean;
  /** Maximum saliency events per emitted envelope. */
  readonly deltaCap: number;
  /** Ticks between snapshot inclusions. */
  readonly snapshotIntervalTicks: number;
}

// ── Capability Descriptors ──────────────────────────────────────────

/**
 * Canonical sub-primitive claim identifiers.
 * Human-facing (dashboards, closeout docs) and machine-facing (manifest generation).
 * Never use bare 'p21' — always qualify with the sub-primitive suffix.
 */
export type P21ClaimId = 'p21.a' | 'p21.b';

/**
 * P21-A sub-primitive capability descriptor.
 * Declares which invariants, mode, extensions, and budgets
 * a P21-A adapter claims to satisfy.
 */
export interface P21ACapabilityDescriptor {
  /** Explicit claim identifier — must be 'p21.a', not implied by nesting. */
  claim_id: 'p21.a';
  invariants: readonly P21AInvariant[];
  mode: P21BeliefMode;
  declaredExtensions: P21Extension[];
  trackCap: number;
  sparsityBudget: number;
  hysteresisBudget: number;
  uncertaintyThreshold: number;
}

/**
 * P21-B sub-primitive capability descriptor.
 * Declares which emission-layer invariants a P21-B adapter claims to satisfy.
 */
export interface P21BCapabilityDescriptor {
  /** Explicit claim identifier — must be 'p21.b', not implied by nesting. */
  claim_id: 'p21.b';
  invariants: readonly P21BInvariant[];
  deltaCap: number;
  snapshotIntervalTicks: number;
}

/**
 * Full P21 capability descriptor for sub-primitive claims.
 * Uses `p21.a` / `p21.b` — never bare `p21`.
 */
export interface P21CapabilityDescriptor {
  capability_id: 'p21';
  contract_version: string;
  /** Content hash of suite source — placeholder until CI generates */
  suite_hash?: string;
  p21a?: P21ACapabilityDescriptor;
  p21b?: P21BCapabilityDescriptor;
}

// ── Conformance Invariants ──────────────────────────────────────────

/**
 * P21-A: Track Maintenance invariants.
 * These govern the adapter's internal state management.
 */
export const P21A_INVARIANTS = [
  'determinism',
  'boundedness',
  'event_sparsity',
  'uncertainty_monotonicity',
  'uncertainty_suppression',
  'hysteresis',
  'identity_persistence',
  'new_threat_completeness',
  'features_not_required',
] as const;
export type P21AInvariant = (typeof P21A_INVARIANTS)[number];

/**
 * P21-B: Emission Protocol invariants.
 * These govern how deltas are packaged and emitted.
 */
export const P21B_INVARIANTS = [
  'delta_budget',
  'envelope_determinism',
  'producer_validation',
  'snapshot_cadence',
] as const;
export type P21BInvariant = (typeof P21B_INVARIANTS)[number];

/**
 * Combined P21 invariant list.
 * @deprecated Prefer P21A_INVARIANTS or P21B_INVARIANTS with explicit
 * P21CapabilityDescriptor for sub-primitive claims.
 */
export const P21_INVARIANTS = [...P21A_INVARIANTS, ...P21B_INVARIANTS] as const;
export type P21Invariant = (typeof P21_INVARIANTS)[number];

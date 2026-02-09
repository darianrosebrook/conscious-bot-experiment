/**
 * P11 Primitive Capsule — Domain-Agnostic Types
 *
 * Defines the contract for epistemic planning (belief-state and active
 * sensing) as a portable primitive that any domain can implement.
 *
 * Zero Minecraft imports. Zero vitest imports.
 *
 * Core invariants encoded in this capsule:
 *   1. Probabilities are discrete buckets only (no continuous floats)
 *   2. Hypothesis set is bounded (MAX_HYPOTHESES cap with deterministic eviction)
 *   3. Probe selection maximizes expected information gain (discriminative)
 *   4. Confidence threshold gates action commitment (no early commit)
 *   5. Belief update is deterministic (same prior + evidence = same posterior)
 *
 * Field naming conventions (domain-agnostic):
 *   village/fault/sector   -> hypothesis   (abstract alternative)
 *   biome_sample/run_test  -> probe        (sensing action)
 *   mob/block/log_entry    -> evidence     (observation payload)
 */

// -- Contract Version --------------------------------------------------------

export type P11ContractVersion = 'p11.v1';

export const P11_CONTRACT_VERSION: P11ContractVersion = 'p11.v1';

// -- Probability Buckets ----------------------------------------------------

/**
 * Discrete probability values. All belief probabilities must be one of
 * these values — never raw floats. This prevents state explosion and
 * ensures deterministic hashing.
 */
export const PROB_BUCKETS = [
  0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0,
] as const;

export type ProbBucket = (typeof PROB_BUCKETS)[number];

/**
 * Snap a raw probability to the nearest bucket.
 * Pure function — no side effects, deterministic.
 */
export function toProbBucket(rawProb: number): ProbBucket {
  const clamped = Math.max(0, Math.min(1, rawProb));
  const index = Math.round(clamped * 10);
  return PROB_BUCKETS[index];
}

// -- Hypothesis --------------------------------------------------------------

/**
 * A hypothesis is an abstract alternative the agent considers.
 * Domain decides what hypotheses represent (location, fault, diagnosis).
 * Features are opaque key-value pairs used by likelihood computation.
 */
export interface P11HypothesisV1 {
  /** Stable identifier for this hypothesis. */
  readonly id: string;
  /** Human-readable description (for explanations/audit). */
  readonly description: string;
  /** Domain-specific features used by likelihood computation. */
  readonly features: Readonly<Record<string, string | number | boolean>>;
}

// -- Belief State ------------------------------------------------------------

/** Maximum number of hypotheses tracked simultaneously. */
export const MAX_HYPOTHESES = 32;

/**
 * Belief state: a probability distribution over hypotheses.
 *
 * Probabilities are ProbBucket values (discrete).
 * The distribution need not sum to 1.0 exactly due to bucketing,
 * but normalization should be applied after each update.
 */
export interface P11BeliefStateV1 {
  /**
   * Hypothesis ID -> probability bucket.
   * Ordered by hypothesis ID for deterministic iteration.
   */
  readonly distribution: ReadonlyMap<string, ProbBucket>;
  /** Set of probe IDs already executed (avoids redundant sensing). */
  readonly explored: ReadonlySet<string>;
  /** Cached Shannon entropy of the current distribution. */
  readonly entropy: number;
  /** Tick at which this belief state was last updated. */
  readonly lastUpdatedTick: number;
}

// -- Evidence ----------------------------------------------------------------

/**
 * A payload of observed evidence from executing a probe.
 * Domain-agnostic: the `type` and `value` are opaque tokens
 * interpreted by the likelihood function.
 */
export interface P11EvidencePayloadV1 {
  /** Evidence category (e.g., 'biome_indicator', 'test_result'). */
  readonly type: string;
  /** Observed value — must be JSON-serializable for deterministic hashing. */
  readonly value: string | number | boolean;
  /** Observation confidence (0..1). Used by likelihood computation. */
  readonly confidence: number;
}

/**
 * Observed evidence from a specific probe execution.
 */
export interface P11ObservedEvidenceV1 {
  /** Which probe produced this evidence. */
  readonly probeId: string;
  /** The evidence payload. */
  readonly payload: P11EvidencePayloadV1;
  /** Game tick when evidence was observed. */
  readonly observedAtTick: number;
}

// -- Probe Operator ----------------------------------------------------------

/**
 * A probe operator is a sensing action the agent can execute
 * to gather evidence and reduce belief uncertainty.
 *
 * Cost components are domain-defined but structurally constrained
 * to ensure probe selection can compare costs meaningfully.
 */
export interface P11ProbeOperatorV1 {
  /** Stable identifier for this probe type. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Description for audit/explanation. */
  readonly description: string;
  /** Cost vector for probe selection trade-offs. */
  readonly cost: P11ProbeCostV1;
}

export interface P11ProbeCostV1 {
  /** Time to execute in domain ticks. Must be >= 0. */
  readonly timeTicks: number;
  /** Risk exposure (0..1). 0 = no risk. */
  readonly risk: number;
  /** Resource cost (normalized 0..1). 0 = free. */
  readonly resource: number;
}

// -- Information Gain --------------------------------------------------------

/**
 * Result of computing expected information gain for a probe.
 */
export interface P11InfoGainResultV1 {
  /** Probe that was evaluated. */
  readonly probeId: string;
  /** Expected entropy reduction (bits). Higher = more informative. */
  readonly expectedGain: number;
  /** Net score after subtracting cost penalty. */
  readonly netScore: number;
}

// -- Confidence Check --------------------------------------------------------

/**
 * Result of checking whether belief has reached the confidence
 * threshold required to commit to action.
 */
export interface P11ConfidenceCheckV1 {
  /** Whether confidence threshold is met. */
  readonly reached: boolean;
  /** Hypothesis with highest probability (null if distribution empty). */
  readonly bestHypothesis: string | null;
  /** Probability of the best hypothesis. */
  readonly confidence: ProbBucket;
}

// -- Belief Update Result ----------------------------------------------------

/**
 * Result of updating belief given observed evidence.
 * Contains the new belief state and metadata about the update.
 */
export interface P11BeliefUpdateResultV1 {
  /** Updated belief state. */
  readonly belief: P11BeliefStateV1;
  /** Whether any hypothesis was evicted due to MAX_HYPOTHESES cap. */
  readonly evicted: readonly string[];
}

// -- Adapter Interface -------------------------------------------------------

/**
 * Minimal adapter interface that a domain must implement
 * to satisfy P11 conformance.
 *
 * All methods must be pure (deterministic, no side effects).
 */
export interface P11EpistemicAdapter {
  /**
   * Initialize a uniform belief state over the given hypotheses.
   * If hypotheses.length > MAX_HYPOTHESES, the lowest-priority
   * hypotheses are evicted (by index).
   */
  initializeBelief(
    hypotheses: readonly P11HypothesisV1[],
    tick: number,
  ): P11BeliefStateV1;

  /**
   * Calculate Shannon entropy of a belief state.
   * Must be pure and consistent with the distribution values.
   */
  calculateEntropy(belief: P11BeliefStateV1): number;

  /**
   * Compute the likelihood of evidence given a hypothesis.
   * Must be pure and deterministic.
   * Returns a value in [0, 1].
   */
  computeLikelihood(
    hypothesis: P11HypothesisV1,
    evidence: P11ObservedEvidenceV1,
  ): number;

  /**
   * Update belief state given observed evidence.
   * Must be deterministic: same prior + evidence = same posterior.
   * Must apply toProbBucket() to all posterior values.
   * Must enforce MAX_HYPOTHESES (evict lowest-probability, then oldest).
   */
  updateBelief(
    prior: P11BeliefStateV1,
    evidence: P11ObservedEvidenceV1,
    hypotheses: readonly P11HypothesisV1[],
  ): P11BeliefUpdateResultV1;

  /**
   * Compute expected information gain for a probe.
   * Must be deterministic.
   */
  expectedInfoGain(
    probe: P11ProbeOperatorV1,
    belief: P11BeliefStateV1,
    hypotheses: readonly P11HypothesisV1[],
  ): P11InfoGainResultV1;

  /**
   * Select the best probe from available probes.
   * Must maximize expected information gain with deterministic tie-breaking
   * (lexicographic by probe ID).
   * Returns null if no probes are available.
   */
  selectProbe(
    probes: readonly P11ProbeOperatorV1[],
    belief: P11BeliefStateV1,
    hypotheses: readonly P11HypothesisV1[],
  ): P11ProbeOperatorV1 | null;

  /**
   * Check whether belief has reached the confidence threshold.
   * No action should be committed until this returns reached: true.
   */
  checkConfidence(
    belief: P11BeliefStateV1,
    threshold: number,
  ): P11ConfidenceCheckV1;

  /** Default confidence threshold for this domain. */
  readonly defaultThreshold: number;

  /** Maximum hypotheses this adapter supports. */
  readonly maxHypotheses: number;
}

// -- Invariants --------------------------------------------------------------

/**
 * P11 conformance invariants.
 * Each maps directly to one of the 5 Rig I certification pivots.
 */
export const P11_INVARIANTS = [
  /** All probabilities are ProbBucket values; no raw floats in state. */
  'discrete_buckets',
  /** Hypothesis count never exceeds MAX_HYPOTHESES. */
  'bounded_hypotheses',
  /** Probe selection maximizes expected information gain; deterministic tie-break. */
  'discriminative_probe',
  /** No action commit below confidence threshold. */
  'confidence_gate',
  /** Same prior + evidence produces identical posterior. */
  'deterministic_update',
] as const;

export type P11Invariant = (typeof P11_INVARIANTS)[number];

// -- Capability Descriptor ---------------------------------------------------

export type P11ClaimId = 'p11';

export interface P11CapabilityDescriptor {
  /** Explicit claim identifier. */
  readonly claim_id: P11ClaimId;
  /** Contract version. */
  readonly contract_version: P11ContractVersion;
  /** Which invariants this adapter claims to satisfy. */
  readonly invariants: readonly P11Invariant[];
  /** Default confidence threshold. */
  readonly defaultThreshold: number;
  /** Maximum hypotheses. */
  readonly maxHypotheses: number;
  /** Content hash of conformance suite source (placeholder until CI generates). */
  readonly suite_hash?: string;
}

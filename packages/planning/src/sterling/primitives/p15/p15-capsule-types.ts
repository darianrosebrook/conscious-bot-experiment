/**
 * P15 Primitive Capsule — Domain-Agnostic Types
 *
 * Defines the contract for fault diagnosis and repair as a thin wrapper
 * over P11 (epistemic planning). P15 does NOT compute information gain,
 * entropy, or belief updates itself — it delegates those to P11. P15's
 * "intelligence" is sequencing, gating, and boundedness.
 *
 * Zero Minecraft imports. Zero vitest imports.
 *
 * New semantics added by P15 (beyond P11):
 *   - Repair actions that modify state to fix a diagnosed fault
 *   - Validation probes that confirm repairs worked
 *   - Diagnose → repair → validate control loop with episode record
 *
 * Core invariants encoded in this capsule:
 *   1. Probe scoring is deterministic (delegates to P11; tie-breaks explicit)
 *   2. Belief update is deterministic (delegates to P11)
 *   3. Entropy decreases when probe is discriminative
 *   4. Hypothesis set is bounded (inherited from P11)
 *   5. Repair only after confidence; validation must follow repair
 *   6. Episode is bounded (max steps enforced; fail-closed termination)
 */

// -- P11 Imports (delegation, not reimplementation) --------------------------

import type {
  P11BeliefStateV1,
  P11HypothesisV1,
  P11ProbeOperatorV1,
  P11ObservedEvidenceV1,
  ProbBucket,
} from '../p11/p11-capsule-types.js';

// Re-export P11 types that P15 consumers need
export type {
  P11BeliefStateV1,
  P11HypothesisV1,
  P11ProbeOperatorV1,
  P11ObservedEvidenceV1,
  ProbBucket,
};

// -- Contract Version --------------------------------------------------------

export type P15ContractVersion = 'p15.v1';

export const P15_CONTRACT_VERSION: P15ContractVersion = 'p15.v1';

// -- Episode Bounds ----------------------------------------------------------

/** Maximum number of probe + repair + validation steps in a diagnosis episode. */
export const MAX_DIAGNOSIS_STEPS = 20;

/** Default confidence threshold for committing to a repair. */
export const DEFAULT_DIAGNOSIS_THRESHOLD = 0.8;

/** Default minimum information gain to continue probing. */
export const DEFAULT_MIN_INFO_GAIN = 0.01;

// -- Repair Action -----------------------------------------------------------

/**
 * A repair action that modifies the system to fix a diagnosed fault.
 * Applicability is expressed as a list of hypothesis IDs (not predicates)
 * to ensure deterministic matching and portability.
 */
export interface P15RepairActionV1 {
  /** Stable identifier for this repair. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Cost of executing this repair (scalar, comparable). */
  readonly cost: number;
  /** Which fault hypotheses this repair addresses. */
  readonly applicableHypothesisIds: readonly string[];
}

// -- Validation Probe --------------------------------------------------------

/**
 * A post-repair probe that confirms the fix worked.
 * Maps 1:1 to a repair action (enforced by adapter).
 *
 * The validation probe is expressed as a P11 probe (so it can be
 * routed through the same P11 belief update path) plus an expected
 * success observation token.
 */
export interface P15ValidationProbeV1 {
  /** Stable identifier for this validation. */
  readonly id: string;
  /** Which repair this validates. Must be unique per repairId. */
  readonly repairId: string;
  /** The P11 probe shape used for evidence gathering. */
  readonly asP11Probe: P11ProbeOperatorV1;
  /** The observation value that counts as "fixed". */
  readonly expectedSuccessValue: string | number | boolean;
  /** The evidence type to check against. */
  readonly evidenceType: string;
}

// -- Diagnosis Parameters ----------------------------------------------------

/**
 * Parameters controlling the diagnosis loop.
 * All bounds are deterministic and enforced.
 */
export interface P15DiagnosisParamsV1 {
  /** Maximum total steps (probes + repairs + validations). */
  readonly maxSteps: number;
  /** Confidence threshold for committing to repair. */
  readonly confidenceThreshold: number;
  /** Minimum expected information gain to continue probing. */
  readonly minInfoGain: number;
}

// -- Episode Record ----------------------------------------------------------

/**
 * Termination reason for a diagnosis episode.
 * Each reason is explicit and deterministic.
 */
export type P15TerminationReason =
  | 'resolved'                  // fault diagnosed, repaired, and validated
  | 'max_steps'                 // step budget exhausted
  | 'no_discriminative_probe'   // no probe exceeds minInfoGain
  | 'no_applicable_repair'      // confident in hypothesis but no repair available
  | 'validation_failed'         // repair applied but validation shows fault persists
  | 'all_repairs_exhausted';    // all applicable repairs tried and failed

/**
 * A snapshot of belief state at a point in the episode.
 * Lightweight digest for audit trail (not the full distribution).
 */
export interface P15BeliefSnapshotV1 {
  readonly step: number;
  readonly entropy: number;
  readonly topHypothesisId: string | null;
  readonly topProbBucket: ProbBucket;
  readonly hypothesisCount: number;
}

/**
 * Record of a probe execution within the episode.
 */
export interface P15ProbeRecordV1 {
  readonly step: number;
  readonly probeId: string;
  readonly observedValue: string | number | boolean;
  readonly infoGain: number;
}

/**
 * Record of a repair attempt within the episode.
 */
export interface P15RepairRecordV1 {
  readonly step: number;
  readonly repairId: string;
  readonly targetHypothesisId: string;
  readonly reason: string;
}

/**
 * Record of a validation check within the episode.
 */
export interface P15ValidationRecordV1 {
  readonly step: number;
  readonly validationProbeId: string;
  readonly observedValue: string | number | boolean;
  readonly expectedValue: string | number | boolean;
  readonly success: boolean;
}

/**
 * Complete episode record for a diagnosis run.
 * Deterministic and auditable — same inputs produce same episode.
 */
export interface P15DiagnosisEpisodeV1 {
  /** Probes executed during diagnosis. */
  readonly probesExecuted: readonly P15ProbeRecordV1[];
  /** Belief snapshots at each step. */
  readonly beliefSnapshots: readonly P15BeliefSnapshotV1[];
  /** Repairs attempted. */
  readonly repairsAttempted: readonly P15RepairRecordV1[];
  /** Validations performed. */
  readonly validations: readonly P15ValidationRecordV1[];
  /** Whether the fault was resolved. */
  readonly resolved: boolean;
  /** What resolved the fault (if resolved). */
  readonly resolvedBy?: {
    readonly hypothesisId: string;
    readonly repairId: string;
    readonly validationProbeId: string;
  };
  /** Why the episode terminated. */
  readonly terminatedBy: P15TerminationReason;
  /** Total steps consumed. */
  readonly totalSteps: number;
}

// -- Observation Provider ----------------------------------------------------

/**
 * Callback that provides observations for probes.
 * In tests: deterministic oracle mapping.
 * In production: real-world observation from execution.
 */
export type P15ObservationProvider = (
  probeId: string,
  hypotheses: readonly P11HypothesisV1[],
) => P11ObservedEvidenceV1;

// -- Adapter Interface -------------------------------------------------------

/**
 * P15 Fault Diagnosis Adapter.
 *
 * Wraps a P11 epistemic adapter. All epistemic computation (entropy,
 * information gain, belief updates, probe selection) is delegated to P11.
 * P15 adds repair/validation sequencing and episode control.
 *
 * All methods must be pure (deterministic, no side effects).
 */
export interface P15FaultDiagnosisAdapter {
  /**
   * Select the best diagnostic probe.
   * Delegates to P11 selectProbe. Returns null if no probes remain
   * or none exceed minInfoGain.
   */
  selectDiagnosticProbe(
    belief: P11BeliefStateV1,
    probes: readonly P11ProbeOperatorV1[],
    hypotheses: readonly P11HypothesisV1[],
    minInfoGain: number,
  ): P11ProbeOperatorV1 | null;

  /**
   * Update belief given observed evidence.
   * Delegates to P11 updateBelief.
   */
  updateDiagnosticBelief(
    belief: P11BeliefStateV1,
    evidence: P11ObservedEvidenceV1,
    hypotheses: readonly P11HypothesisV1[],
  ): P11BeliefStateV1;

  /**
   * Select a repair for the diagnosed hypothesis.
   * Only callable when confidence threshold is met.
   * Deterministic: lowest cost, then lexicographic ID.
   * Skips already-applied repairs.
   * Returns null if no applicable repair available.
   */
  selectRepair(
    topHypothesisId: string,
    repairs: readonly P15RepairActionV1[],
    appliedRepairs: readonly string[],
  ): P15RepairActionV1 | null;

  /**
   * Find the validation probe for a given repair.
   * Enforces 1:1 mapping. Returns null if no validation exists.
   */
  requiresValidation(
    repairId: string,
    validations: readonly P15ValidationProbeV1[],
  ): P15ValidationProbeV1 | null;

  /**
   * Check whether a validation observation matches the expected outcome.
   */
  evaluateValidation(
    observation: P11ObservedEvidenceV1,
    validation: P15ValidationProbeV1,
  ): boolean;

  /**
   * Run the full diagnosis loop.
   * Deterministic: same inputs + same observation provider → same episode.
   */
  runDiagnosisLoop(
    initialBelief: P11BeliefStateV1,
    hypotheses: readonly P11HypothesisV1[],
    diagnosticProbes: readonly P11ProbeOperatorV1[],
    repairs: readonly P15RepairActionV1[],
    validations: readonly P15ValidationProbeV1[],
    params: P15DiagnosisParamsV1,
    observe: P15ObservationProvider,
  ): P15DiagnosisEpisodeV1;

  /** Default diagnosis parameters. */
  readonly defaultParams: P15DiagnosisParamsV1;
}

// -- Invariants --------------------------------------------------------------

/**
 * P15 conformance invariants.
 * Each maps to a certification pivot for Rig N.
 */
export const P15_INVARIANTS = [
  /** Same belief + probes → same ranking and selected probe (delegates to P11). */
  'deterministic_probe_scoring',
  /** Same prior + evidence → identical posterior (delegates to P11). */
  'belief_update_deterministic',
  /** Discriminative observation reduces entropy. */
  'entropy_decreases_when_discriminative',
  /** Hypothesis set cannot grow; only reweights existing (inherited from P11). */
  'bounded_hypothesis_set',
  /** Repair only after confidence; validation follows repair; failed validation re-enters diagnosis. */
  'diagnose_repair_validate_order',
  /** Max steps enforced; fail-closed termination with explicit reason. */
  'bounded_episode',
] as const;

export type P15Invariant = (typeof P15_INVARIANTS)[number];

// -- Capability Descriptor ---------------------------------------------------

export type P15ClaimId = 'p15';

export interface P15CapabilityDescriptor {
  /** Explicit claim identifier. */
  readonly claim_id: P15ClaimId;
  /** Contract version. */
  readonly contract_version: P15ContractVersion;
  /** Which invariants this adapter claims to satisfy. */
  readonly invariants: readonly P15Invariant[];
  /** Maximum diagnosis steps. */
  readonly maxDiagnosisSteps: number;
  /** Default confidence threshold. */
  readonly defaultConfidenceThreshold: number;
  /** Default minimum info gain. */
  readonly defaultMinInfoGain: number;
  /** Content hash of conformance suite source (placeholder until CI generates). */
  readonly suite_hash?: string;
}

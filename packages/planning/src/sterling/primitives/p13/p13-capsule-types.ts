/**
 * P13 Primitive Capsule — Domain-Agnostic Types
 *
 * Defines the contract for irreversibility and commitment planning
 * as a portable primitive that any domain can implement.
 *
 * Zero Minecraft imports. Zero vitest imports.
 *
 * Core invariants encoded in this capsule:
 *   1. Every operator has an explicit reversibility tag (no heuristic detection)
 *   2. Irreversible actions require verification-before-commit sequencing
 *   3. Verification is deterministic (same target → same result)
 *   4. Option value is bounded (OPTION_VALUE_MAX cap)
 *   5. Committed state is monotonic (once committed, never decreases)
 *
 * Field naming conventions (domain-agnostic):
 *   lock_trade/deploy/sign   -> commit       (irreversible action)
 *   inspect/preview/test     -> verify       (pre-commit check)
 *   reroll/rollback/undo     -> foreclosed   (blocked by commitment)
 */

// -- Contract Version --------------------------------------------------------

export type P13ContractVersion = 'p13.v1';

export const P13_CONTRACT_VERSION: P13ContractVersion = 'p13.v1';

// -- Bounds ------------------------------------------------------------------

/** Maximum option value for any single state. Prevents objective explosion. */
export const OPTION_VALUE_MAX = 10;

/** Default verification confidence required before irreversible commit. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

// -- Reversibility Classification --------------------------------------------

/**
 * Every operator must be classified into exactly one reversibility class.
 * Pivot 1: explicit tags, no heuristic detection.
 */
export type P13ReversibilityClass =
  | 'fully_reversible'    // Can be undone at no cost
  | 'costly_reversible'   // Can be undone but with significant cost
  | 'irreversible';       // Cannot be undone; one-way door

/**
 * Irreversibility tag on an operator.
 * Every domain operator must carry this metadata.
 */
export interface P13IrreversibilityTagV1 {
  /** Which operator this tag applies to. */
  readonly operatorId: string;
  /** Reversibility classification. */
  readonly reversibility: P13ReversibilityClass;
  /** Cost to roll back (Infinity for irreversible). */
  readonly rollbackCost: number;
  /** Extra cost added to objective for committing. */
  readonly commitmentCost: number;
  /** Option value lost when this operator is committed. */
  readonly optionValueLost: number;
}

// -- Verification Operator ---------------------------------------------------

/**
 * A verification operator is a pre-commit check that increases
 * confidence in the outcome of an irreversible action.
 */
export interface P13VerificationOperatorV1 {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Which irreversible operator IDs this verification enables. */
  readonly verifies: readonly string[];
  /** Cost of performing this verification. */
  readonly cost: number;
  /** Confidence increase per application (0..1). */
  readonly confidenceGain: number;
}

// -- Verification State ------------------------------------------------------

/**
 * Tracks verification confidence per target (irreversible operator).
 * Confidence accumulates from verification operators.
 */
export interface P13VerificationStateV1 {
  /** Target operator ID → accumulated confidence (0..1, clamped). */
  readonly confidence: Readonly<Record<string, number>>;
  /** Which verification operators have been applied. */
  readonly appliedVerifications: readonly string[];
}

// -- Commitment State --------------------------------------------------------

/**
 * Tracks which operators have been committed (one-way doors closed).
 * Pivot 5: monotonic — committedCount never decreases.
 */
export interface P13CommitmentStateV1 {
  /** Set of operator IDs that have been committed. */
  readonly committed: readonly string[];
  /** Count of committed operators (monotonic non-decreasing). */
  readonly committedCount: number;
  /** Operators blocked by commitments (cannot be used anymore). */
  readonly blocked: readonly string[];
}

// -- Commitment Constraint ---------------------------------------------------

/**
 * A constraint that defines what an irreversible commitment requires
 * and what it blocks.
 */
export interface P13CommitmentConstraintV1 {
  /** The irreversible operator this constraint applies to. */
  readonly operatorId: string;
  /** Required verification confidence before committing. */
  readonly requiredConfidence: number;
  /** Operator IDs blocked once this operator is committed. */
  readonly blocksOperators: readonly string[];
}

// -- Option Value ------------------------------------------------------------

/**
 * Option value state: tracks how much flexibility remains.
 * Pivot 4: bounded at OPTION_VALUE_MAX.
 */
export interface P13OptionValueStateV1 {
  /** Uncommitted choices still available. */
  readonly availableOptions: readonly string[];
  /** Committed (locked) choices. */
  readonly lockedOptions: readonly string[];
  /** Computed option value (bounded). */
  readonly optionValue: number;
}

// -- Commit Check Result -----------------------------------------------------

/**
 * Result of checking whether an irreversible commit is allowed.
 */
export interface P13CommitCheckResultV1 {
  /** Whether the commit is allowed (confidence met, not blocked). */
  readonly allowed: boolean;
  /** Reason for rejection (null if allowed). */
  readonly reason: string | null;
  /** Current confidence for this target. */
  readonly currentConfidence: number;
  /** Required confidence for this target. */
  readonly requiredConfidence: number;
}

// -- Commitment Cost Breakdown -----------------------------------------------

/**
 * Full cost breakdown for an irreversible action.
 */
export interface P13CommitmentCostV1 {
  /** Base action cost (same as reversible version). */
  readonly baseCost: number;
  /** Penalty for committing (from irreversibility tag). */
  readonly commitmentPenalty: number;
  /** Value of foreclosed alternatives. */
  readonly optionValueLoss: number;
  /** Total cost: baseCost + commitmentPenalty + optionValueLoss. */
  readonly totalCost: number;
}

// -- Adapter Interface -------------------------------------------------------

/**
 * Minimal adapter interface that a domain must implement
 * to satisfy P13 conformance.
 *
 * All methods must be pure (deterministic, no side effects).
 */
export interface P13CommitmentAdapter {
  /**
   * Initialize verification state (all confidence at 0).
   */
  initializeVerification(): P13VerificationStateV1;

  /**
   * Initialize commitment state (nothing committed).
   */
  initializeCommitment(
    allOperatorIds: readonly string[],
  ): P13CommitmentStateV1;

  /**
   * Initialize option value state.
   * All operators start as available options.
   */
  initializeOptionValue(
    allOperatorIds: readonly string[],
  ): P13OptionValueStateV1;

  /**
   * Apply a verification operator, increasing confidence for its targets.
   * Must be deterministic. Confidence clamped to [0, 1].
   */
  applyVerification(
    state: P13VerificationStateV1,
    verification: P13VerificationOperatorV1,
  ): P13VerificationStateV1;

  /**
   * Check whether an irreversible commit is allowed.
   * Must check: (1) confidence >= required, (2) operator not blocked.
   */
  canCommit(
    operatorId: string,
    verificationState: P13VerificationStateV1,
    commitmentState: P13CommitmentStateV1,
    constraints: readonly P13CommitmentConstraintV1[],
  ): P13CommitCheckResultV1;

  /**
   * Execute a commitment (close a one-way door).
   * Must: (1) add to committed set, (2) increment committedCount,
   * (3) add blocked operators, (4) be deterministic.
   * Pivot 5: committedCount must never decrease.
   */
  executeCommitment(
    operatorId: string,
    commitmentState: P13CommitmentStateV1,
    constraints: readonly P13CommitmentConstraintV1[],
  ): P13CommitmentStateV1;

  /**
   * Calculate the full cost of an irreversible action.
   * Includes base cost + commitment penalty + option value loss.
   */
  calculateCommitmentCost(
    tag: P13IrreversibilityTagV1,
    optionState: P13OptionValueStateV1,
  ): P13CommitmentCostV1;

  /**
   * Calculate option value for the current state.
   * Must be bounded: result <= OPTION_VALUE_MAX.
   */
  calculateOptionValue(
    state: P13OptionValueStateV1,
  ): number;

  /**
   * Update option value state after a commitment.
   * Moves the committed operator from available to locked.
   */
  updateOptionValueAfterCommit(
    state: P13OptionValueStateV1,
    committedOperatorId: string,
  ): P13OptionValueStateV1;

  /** Option value maximum. */
  readonly optionValueMax: number;

  /** Default confidence threshold. */
  readonly defaultConfidenceThreshold: number;
}

// -- Invariants --------------------------------------------------------------

/**
 * P13 conformance invariants.
 * Each maps directly to one of the 5 Rig K certification pivots.
 */
export const P13_INVARIANTS = [
  /** Every operator has explicit reversibility tag. */
  'explicit_reversibility',
  /** Irreversible actions require verify-before-commit sequencing. */
  'verify_before_commit',
  /** Verification is deterministic: same target → same result. */
  'deterministic_verification',
  /** Option value is bounded at OPTION_VALUE_MAX. */
  'bounded_option_value',
  /** Committed state is monotonic: committedCount never decreases. */
  'monotonic_commitment',
] as const;

export type P13Invariant = (typeof P13_INVARIANTS)[number];

// -- Capability Descriptor ---------------------------------------------------

export type P13ClaimId = 'p13';

export interface P13CapabilityDescriptor {
  /** Explicit claim identifier. */
  readonly claim_id: P13ClaimId;
  /** Contract version. */
  readonly contract_version: P13ContractVersion;
  /** Which invariants this adapter claims to satisfy. */
  readonly invariants: readonly P13Invariant[];
  /** Option value maximum. */
  readonly optionValueMax: number;
  /** Default confidence threshold. */
  readonly defaultConfidenceThreshold: number;
  /** Content hash of conformance suite source. */
  readonly suite_hash?: string;
}

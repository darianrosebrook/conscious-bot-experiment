/**
 * P13 Reference Adapter — Portable Commitment Planning Implementation
 *
 * Satisfies all 5 P13 invariants:
 *   1. explicit_reversibility      — every operator tagged
 *   2. verify_before_commit        — verification precedes commitment
 *   3. deterministic_verification  — same target → same result
 *   4. bounded_option_value        — capped at OPTION_VALUE_MAX
 *   5. monotonic_commitment        — committedCount never decreases
 *
 * Zero Minecraft imports. Zero vitest imports.
 */

import type {
  P13CommitCheckResultV1,
  P13CommitmentAdapter,
  P13CommitmentConstraintV1,
  P13CommitmentCostV1,
  P13CommitmentStateV1,
  P13IrreversibilityTagV1,
  P13OptionValueStateV1,
  P13VerificationOperatorV1,
  P13VerificationStateV1,
} from './p13-capsule-types.js';
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  OPTION_VALUE_MAX,
} from './p13-capsule-types.js';

export class P13ReferenceAdapter implements P13CommitmentAdapter {
  readonly optionValueMax = OPTION_VALUE_MAX;
  readonly defaultConfidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD;

  initializeVerification(): P13VerificationStateV1 {
    return {
      confidence: {},
      appliedVerifications: [],
    };
  }

  initializeCommitment(
    allOperatorIds: readonly string[],
  ): P13CommitmentStateV1 {
    // Nothing committed initially; nothing blocked
    return {
      committed: [],
      committedCount: 0,
      blocked: [],
    };
  }

  initializeOptionValue(
    allOperatorIds: readonly string[],
  ): P13OptionValueStateV1 {
    return {
      availableOptions: [...allOperatorIds],
      lockedOptions: [],
      optionValue: this.calculateOptionValue({
        availableOptions: allOperatorIds,
        lockedOptions: [],
        optionValue: 0, // Will be recalculated
      }),
    };
  }

  applyVerification(
    state: P13VerificationStateV1,
    verification: P13VerificationOperatorV1,
  ): P13VerificationStateV1 {
    const newConfidence: Record<string, number> = { ...state.confidence };

    // Increase confidence for each target this verification covers
    for (const targetId of verification.verifies) {
      const current = newConfidence[targetId] ?? 0;
      // Clamp to [0, 1]
      newConfidence[targetId] = Math.min(1, current + verification.confidenceGain);
    }

    return {
      confidence: newConfidence,
      appliedVerifications: [...state.appliedVerifications, verification.id],
    };
  }

  canCommit(
    operatorId: string,
    verificationState: P13VerificationStateV1,
    commitmentState: P13CommitmentStateV1,
    constraints: readonly P13CommitmentConstraintV1[],
  ): P13CommitCheckResultV1 {
    // Check if operator is blocked
    if (commitmentState.blocked.includes(operatorId)) {
      return {
        allowed: false,
        reason: `Operator ${operatorId} is blocked by a prior commitment`,
        currentConfidence: verificationState.confidence[operatorId] ?? 0,
        requiredConfidence: DEFAULT_CONFIDENCE_THRESHOLD,
      };
    }

    // Check if already committed
    if (commitmentState.committed.includes(operatorId)) {
      return {
        allowed: false,
        reason: `Operator ${operatorId} is already committed`,
        currentConfidence: verificationState.confidence[operatorId] ?? 0,
        requiredConfidence: DEFAULT_CONFIDENCE_THRESHOLD,
      };
    }

    // Find the constraint for this operator
    const constraint = constraints.find((c) => c.operatorId === operatorId);
    const requiredConfidence = constraint?.requiredConfidence ?? DEFAULT_CONFIDENCE_THRESHOLD;
    const currentConfidence = verificationState.confidence[operatorId] ?? 0;

    // Pivot 2: verify before commit — confidence must meet threshold
    if (currentConfidence < requiredConfidence) {
      return {
        allowed: false,
        reason: `Confidence ${currentConfidence.toFixed(2)} < required ${requiredConfidence.toFixed(2)} for ${operatorId}`,
        currentConfidence,
        requiredConfidence,
      };
    }

    return {
      allowed: true,
      reason: null,
      currentConfidence,
      requiredConfidence,
    };
  }

  executeCommitment(
    operatorId: string,
    commitmentState: P13CommitmentStateV1,
    constraints: readonly P13CommitmentConstraintV1[],
  ): P13CommitmentStateV1 {
    // Find blocked operators from this commitment
    const constraint = constraints.find((c) => c.operatorId === operatorId);
    const newBlocked = constraint?.blocksOperators ?? [];

    // Pivot 5: monotonic — committed set only grows
    const committed = [...commitmentState.committed, operatorId];
    // Deduplicate blocked list
    const allBlocked = [...new Set([...commitmentState.blocked, ...newBlocked])];
    // Sort for determinism
    allBlocked.sort();

    return {
      committed,
      committedCount: committed.length,
      blocked: allBlocked,
    };
  }

  calculateCommitmentCost(
    tag: P13IrreversibilityTagV1,
    optionState: P13OptionValueStateV1,
  ): P13CommitmentCostV1 {
    const baseCost = tag.commitmentCost;
    const commitmentPenalty = tag.rollbackCost === Infinity ? tag.commitmentCost : tag.rollbackCost;
    const optionValueLoss = tag.optionValueLost;

    return {
      baseCost,
      commitmentPenalty,
      optionValueLoss,
      totalCost: baseCost + commitmentPenalty + optionValueLoss,
    };
  }

  calculateOptionValue(state: P13OptionValueStateV1): number {
    // Pivot 4: bounded at OPTION_VALUE_MAX
    // Simple model: 2 points per available option
    const raw = state.availableOptions.length * 2;
    return Math.min(raw, OPTION_VALUE_MAX);
  }

  updateOptionValueAfterCommit(
    state: P13OptionValueStateV1,
    committedOperatorId: string,
  ): P13OptionValueStateV1 {
    const availableOptions = state.availableOptions.filter(
      (id) => id !== committedOperatorId,
    );
    const lockedOptions = [...state.lockedOptions, committedOperatorId];

    const newState: P13OptionValueStateV1 = {
      availableOptions,
      lockedOptions,
      optionValue: 0, // Placeholder, recalculated below
    };

    return {
      ...newState,
      optionValue: this.calculateOptionValue(newState),
    };
  }
}

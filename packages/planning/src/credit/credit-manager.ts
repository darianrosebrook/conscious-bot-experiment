/**
 * Credit Manager — Rig A Certification Hardening (P1)
 *
 * Execution-based credit assignment for Sterling rule priors.
 * Updates priors ONLY from execution outcomes, never from plan success.
 *
 * Core invariant: "Learning never changes semantics."
 *   - A solved plan does NOT trigger credit updates
 *   - Only step execution reports (success/failure) modify priors
 *   - All credit updates are logged for audit
 *
 * Credit magnitudes:
 *   - Success: +0.1 (reinforce)
 *   - Failure: -0.2 (penalize, asymmetric to bias toward caution)
 *
 * @author @darianrosebrook
 */

import type { ContentHash } from '../sterling/solve-bundle-types';

// ============================================================================
// Types
// ============================================================================

/** Report from executing a single plan step */
export interface ExecutionReport {
  /** Which solve this execution belongs to (definitionHash or bundleHash) */
  requestHash: ContentHash;
  /** Index of the step in the plan */
  stepIndex: number;
  /** Rule action ID that was executed */
  ruleId: string;
  /** Whether the execution succeeded */
  success: boolean;
  /** Actual inventory effect observed (optional, for drift detection) */
  actualEffect?: Record<string, number>;
  /** Why the step failed (required when success=false) */
  failureReason?: string;
}

/** A computed credit update to apply to a rule's prior */
export interface CreditUpdate {
  ruleId: string;
  /** Positive = reinforce, negative = penalize */
  priorAdjustment: number;
  reason: string;
  /** Timestamp of when this update was computed */
  computedAt: number;
}

/** An entry in the credit audit log */
export interface CreditAuditEntry {
  requestHash: ContentHash;
  update: CreditUpdate;
  priorBefore: number;
  priorAfter: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Credit for a successfully executed step */
export const REINFORCE_MAGNITUDE = 0.1;

/** Penalty for a failed step (negative — asymmetric for caution bias) */
export const PENALIZE_MAGNITUDE = -0.2;

/** Default prior value for unseen rules */
export const DEFAULT_PRIOR = 1.0;

/** Minimum prior value (floor to prevent zero-probability rules) */
export const MIN_PRIOR = 0.01;

/** Maximum prior value (ceiling to prevent runaway reinforcement) */
export const MAX_PRIOR = 10.0;

// ============================================================================
// Credit Manager
// ============================================================================

/**
 * Manages execution-based credit assignment for rule priors.
 *
 * In-memory storage for now. Future: persist to Sterling or memory system.
 */
export class CreditManager {
  /** Rule priors: action → prior weight */
  private priors = new Map<string, number>();

  /** Audit log of all credit updates */
  private auditLog: CreditAuditEntry[] = [];

  /**
   * Get the current prior for a rule.
   * Returns DEFAULT_PRIOR for unseen rules.
   */
  getPrior(ruleId: string): number {
    return this.priors.get(ruleId) ?? DEFAULT_PRIOR;
  }

  /**
   * Get all current priors as a record.
   */
  getPriors(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [ruleId, prior] of this.priors) {
      result[ruleId] = prior;
    }
    return result;
  }

  /**
   * Report execution outcomes and apply credit updates.
   *
   * This is the ONLY way to modify priors. Plan success alone
   * does NOT trigger credit updates — this is the core Rig A invariant.
   */
  reportExecutionOutcome(
    requestHash: ContentHash,
    reports: ExecutionReport[],
  ): CreditUpdate[] {
    const updates = computeCreditUpdates(reports);

    for (const update of updates) {
      const priorBefore = this.getPrior(update.ruleId);
      const priorAfter = clamp(
        priorBefore + update.priorAdjustment,
        MIN_PRIOR,
        MAX_PRIOR,
      );
      this.priors.set(update.ruleId, priorAfter);

      this.auditLog.push({
        requestHash,
        update,
        priorBefore,
        priorAfter,
      });
    }

    return updates;
  }

  /**
   * Get the full audit log. For testing and debugging.
   */
  getAuditLog(): readonly CreditAuditEntry[] {
    return this.auditLog;
  }

  /**
   * Reset all priors and audit log. For testing only.
   */
  reset(): void {
    this.priors.clear();
    this.auditLog = [];
  }
}

// ============================================================================
// Pure Computation
// ============================================================================

/**
 * Compute credit updates from execution reports.
 *
 * Pure function — no side effects. The CreditManager applies
 * the returned updates to its internal state.
 *
 * Determinism: same reports → same updates (timestamp excluded
 * from identity; included only for logging).
 */
export function computeCreditUpdates(reports: ExecutionReport[]): CreditUpdate[] {
  const updates: CreditUpdate[] = [];
  const now = Date.now();

  for (const report of reports) {
    if (report.success) {
      updates.push({
        ruleId: report.ruleId,
        priorAdjustment: REINFORCE_MAGNITUDE,
        reason: 'Execution success',
        computedAt: now,
      });
    } else {
      updates.push({
        ruleId: report.ruleId,
        priorAdjustment: PENALIZE_MAGNITUDE,
        reason: `Execution failure: ${report.failureReason ?? 'unknown'}`,
        computedAt: now,
      });
    }
  }

  return updates;
}

// ============================================================================
// Helpers
// ============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

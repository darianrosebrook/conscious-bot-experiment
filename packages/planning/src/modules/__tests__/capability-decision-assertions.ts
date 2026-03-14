/**
 * M2b: Shared assertion helper for capability decision records.
 *
 * Validates that a CapabilityDecisionRecord carries the required fields
 * for its proof status level. Fails if a solver drops its declaration
 * digest, loses primitive claims, or silently regresses proof status.
 */

import { expect } from 'vitest';
import type { CapabilityDecisionRecord, ProofStatus } from '../solve-contract';

export interface AssertDecisionOptions {
  /** Expected proof status (exact match) */
  expectedProofStatus?: ProofStatus;
  /** Minimum proof status (at least this level) */
  minProofStatus?: ProofStatus;
  /** Expected solver ID */
  expectedSolverId?: string;
  /** Expected primitives (exact set match) */
  expectedPrimitives?: readonly string[];
  /** Minimum primitive count */
  minPrimitives?: number;
  /** Whether warnings are expected (true = must have warnings, false = must be empty) */
  expectWarnings?: boolean;
  /** Label for error messages */
  label?: string;
}

const PROOF_STATUS_ORDER: Record<ProofStatus, number> = {
  undeclared: 0,
  declared: 1,
  structural: 2,
  verified: 3,
};

/**
 * Assert that a CapabilityDecisionRecord meets the specified requirements.
 */
export function assertCapabilityDecision(
  decision: CapabilityDecisionRecord | undefined,
  options: AssertDecisionOptions = {},
): void {
  const label = options.label ? `[${options.label}]` : '';

  expect(decision, `${label} decision record must be present`).toBeDefined();
  const d = decision!;

  // Proof status
  if (options.expectedProofStatus) {
    expect(d.proofStatus, `${label} proofStatus`).toBe(options.expectedProofStatus);
  }
  if (options.minProofStatus) {
    const actual = PROOF_STATUS_ORDER[d.proofStatus];
    const min = PROOF_STATUS_ORDER[options.minProofStatus];
    expect(actual, `${label} proofStatus ${d.proofStatus} should be at least ${options.minProofStatus}`).toBeGreaterThanOrEqual(min);
  }

  // Solver ID
  if (options.expectedSolverId) {
    expect(d.solverId, `${label} solverId`).toBe(options.expectedSolverId);
  }

  // Declaration digest
  if (d.proofStatus !== 'undeclared') {
    expect(d.declarationDigest, `${label} declarationDigest must be present when not undeclared`).toBeTruthy();
    expect(d.solverId, `${label} solverId must be present when not undeclared`).toBeTruthy();
  }

  // Primitives
  if (options.expectedPrimitives) {
    expect([...d.requiredPrimitives].sort()).toEqual([...options.expectedPrimitives].sort());
  }
  if (options.minPrimitives !== undefined) {
    expect(d.requiredPrimitives.length, `${label} primitive count`).toBeGreaterThanOrEqual(options.minPrimitives);
  }

  // Warnings
  if (options.expectWarnings === true) {
    expect(d.warnings.length, `${label} should have warnings`).toBeGreaterThan(0);
  }
  if (options.expectWarnings === false) {
    expect(d.warnings, `${label} should have no warnings`).toHaveLength(0);
  }
}

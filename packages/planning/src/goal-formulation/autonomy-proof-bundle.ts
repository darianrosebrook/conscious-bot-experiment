/**
 * Autonomy Proof Bundle — Content-Addressed Evidence for Autonomous Goal Execution
 *
 * Two-layer design:
 *  - Identity payload: hashed for semantic identity (no runtime IDs, timestamps, or nondeterministic fields)
 *  - Evidence envelope: full artifact with runtime-specific data
 *
 * Same bot state + same outcome = same bundle_hash, regardless of when or how many times it ran.
 *
 * @author @darianrosebrook
 */

import type { ContentHash } from '../sterling/solve-bundle-types';
import { canonicalize, contentHash } from '../sterling/solve-bundle';

// ============================================================================
// Identity Layer — hashed for semantic identity
// ============================================================================

/**
 * Hashed for semantic identity — NO runtime IDs, timestamps, or nondeterministic fields.
 *
 * IMPORTANT: food_item is NOT in identity because the controller doesn't control
 * which food the leaf actually consumes (leaf sorts by stack size, picks its own).
 * The realized consumption is captured in verification.items_consumed (sorted for
 * deterministic hashing). The candidate food item at trigger time is in evidence.
 */
export interface AutonomyProofIdentity {
  trigger: {
    /** 0-1 normalized hunger, rounded to 2 decimal places */
    hunger_value: number;
    /** Configured T_low threshold */
    threshold: number;
    /** 0-20 raw food level */
    food_level: number;
  };
  preconditions: {
    /** Whether any edible food was in inventory at trigger time */
    food_available: boolean;
  };
  goal: {
    /** e.g. 'survival' */
    need_type: string;
    /** e.g. 'eat_immediate' */
    template_name: string;
    description: string;
  };
  task: {
    steps: Array<{ leaf: string; args: Record<string, unknown> }>;
  };
  execution: {
    result: 'ok' | 'error' | 'skipped';
  };
  verification: {
    food_before: number;
    food_after: number;
    delta: number;
    /** From inventory delta, SORTED for deterministic hashing */
    items_consumed: string[];
  };
}

// ============================================================================
// Evidence Layer — runtime-specific, NOT hashed
// ============================================================================

export interface AutonomyProofEvidence {
  /** UUID for this specific run */
  proof_id: string;
  /** Content-derived: contentHash({need_type, template_name}) */
  goal_id: string;
  /** From addTask() response */
  task_id: string;
  /** Hash of full homeostasis sample */
  homeostasis_sample_digest: ContentHash;
  /** Hash of all goal candidates */
  candidates_digest: ContentHash;
  /** Raw leaf execution receipt */
  execution_receipt: Record<string, unknown>;
  /** Food item that triggered the reflex (first match in inventory at trigger time) */
  candidate_food_item: string;
  /** Count of that food item at trigger time */
  candidate_food_count: number;
  timing: {
    trigger_to_goal_ms: number;
    goal_to_task_ms: number;
    task_to_execution_ms: number;
    total_ms: number;
  };
  /** Epoch ms when trigger fired */
  triggered_at: number;
}

// ============================================================================
// Full Bundle
// ============================================================================

/** Full artifact with runtime evidence — identity + timing + IDs */
export interface AutonomyProofBundleV1 {
  schema_version: 'autonomy_proof_v1';
  /** contentHash(canonicalize(identity)) — evidence excluded */
  bundle_hash: ContentHash;
  identity: AutonomyProofIdentity;
  evidence: AutonomyProofEvidence;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an autonomy proof bundle with content-addressed identity.
 *
 * The bundle_hash is computed from the identity payload only — evidence
 * fields (proof_id, timing, task_id) are excluded so that the same
 * semantic chain always produces the same hash.
 */
export function createAutonomyProofBundle(
  identity: AutonomyProofIdentity,
  evidence: AutonomyProofEvidence,
): AutonomyProofBundleV1 {
  const bundle_hash = contentHash(canonicalize(identity));
  return {
    schema_version: 'autonomy_proof_v1',
    bundle_hash,
    identity,
    evidence,
  };
}

/**
 * Compute a content-derived goal ID from semantic goal properties.
 * Same need_type + template_name = same goal_id, always.
 *
 * food_item is intentionally excluded: the leaf chooses which food to
 * consume, so the goal's semantic identity is "eat food" not "eat bread."
 */
export function deriveGoalId(
  need_type: string,
  template_name: string,
): string {
  return contentHash(canonicalize({ need_type, template_name }));
}

/**
 * Goal Identity
 *
 * Deterministic goalKey computation and Phase A→B transition logic.
 *
 * Identity uses two layers:
 * - goalInstanceId: immutable UUID, used for all internal references
 * - goalKey: deterministic lookup key for dedup, may change once (Phase A → Phase B)
 *
 * Phase A (provisional): hash(goalType + intentParams + coarseRegion)
 *   - Before a build site is committed
 *   - "Sticky nearby" — same area resolves to same key
 *
 * Phase B (anchored): depends on goal type
 *   - build_structure: hash(goalType + refCorner + facing + templateDigest)
 *   - build_shelter: hash(goalType + refCorner + facing) — template is attribute, not identity
 *
 * @see docs/internal/goal-binding-protocol.md §B
 */

import { createHash } from 'crypto';
import type { GoalBinding, GoalAnchors } from './goal-binding-types';

// ---------------------------------------------------------------------------
// goalKey hashing
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic content-addressed key from arbitrary string inputs.
 * Uses SHA-256, truncated to 16 hex chars for readability.
 */
export function hashGoalKey(...parts: string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(part);
    hash.update('\0'); // separator to prevent collisions like ("ab","c") vs ("a","bc")
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Compute a coarse region key from a position.
 * Buckets into 16-block (chunk) grid aligned coordinates.
 */
export function coarseRegion(pos: { x: number; y: number; z: number }): string {
  const cx = Math.floor(pos.x / 16);
  const cz = Math.floor(pos.z / 16);
  return `${cx}:${cz}`;
}

// ---------------------------------------------------------------------------
// Phase A: provisional key
// ---------------------------------------------------------------------------

export interface ProvisionalKeyInput {
  goalType: string;
  intentParams?: string;
  botPosition: { x: number; y: number; z: number };
}

/**
 * Compute Phase A (provisional) goalKey.
 * Coarse-grained: two requests from the same chunk resolve to the same key.
 */
export function computeProvisionalKey(input: ProvisionalKeyInput): string {
  return hashGoalKey(
    input.goalType,
    input.intentParams ?? '',
    coarseRegion(input.botPosition),
  );
}

// ---------------------------------------------------------------------------
// Phase B: anchored key
// ---------------------------------------------------------------------------

export interface AnchoredKeyInput {
  goalType: string;
  refCorner: { x: number; y: number; z: number };
  facing: string;
  /** Only included in identity for goal types where template is identity (e.g. build_structure) */
  templateDigest?: string;
}

/** Goal types where templateDigest is part of identity */
const TEMPLATE_IDENTITY_TYPES = new Set(['build_structure']);

/**
 * Compute Phase B (anchored) goalKey.
 * Site-specific; template included only for goal types where it's identity.
 */
export function computeAnchoredKey(input: AnchoredKeyInput): string {
  const parts = [
    input.goalType,
    `${input.refCorner.x}:${input.refCorner.y}:${input.refCorner.z}`,
    input.facing,
  ];
  if (input.templateDigest && TEMPLATE_IDENTITY_TYPES.has(input.goalType)) {
    parts.push(input.templateDigest);
  }
  return hashGoalKey(...parts);
}

// ---------------------------------------------------------------------------
// Phase A → Phase B transition
// ---------------------------------------------------------------------------

export interface AnchorTransitionInput {
  refCorner: { x: number; y: number; z: number };
  facing: 'N' | 'S' | 'E' | 'W';
  siteSignature: NonNullable<GoalAnchors['siteSignature']>;
  templateDigest?: string;
}

/**
 * Transition a GoalBinding from Phase A (provisional) to Phase B (anchored).
 *
 * This mutates the binding in place:
 * 1. Pushes current goalKey to goalKeyAliases
 * 2. Computes new anchored goalKey
 * 3. Sets anchors.siteSignature
 *
 * Returns the new goalKey.
 *
 * Preconditions:
 * - binding.anchors.siteSignature must be undefined (not yet anchored)
 * - This must only be called once per goal instance
 *
 * Callers must hold the KeyedMutex for the old goalKey before calling this.
 */
export function anchorGoalIdentity(
  binding: GoalBinding,
  input: AnchorTransitionInput,
): string {
  if (binding.anchors.siteSignature) {
    throw new Error(
      `Goal ${binding.goalInstanceId} is already anchored (Phase B). Cannot re-anchor.`,
    );
  }

  // 1. Record old key as alias
  binding.goalKeyAliases.push(binding.goalKey);

  // 2. Compute new key
  const newKey = computeAnchoredKey({
    goalType: binding.goalType,
    refCorner: input.refCorner,
    facing: input.facing,
    templateDigest: input.templateDigest,
  });
  binding.goalKey = newKey;

  // 3. Set anchor
  binding.anchors.siteSignature = input.siteSignature;

  return newKey;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new GoalBinding in Phase A (provisional).
 *
 * @param goalInstanceId - Immutable UUID (caller must generate via crypto.randomUUID() or similar)
 * @param goalType - Goal type string (e.g. 'build_shelter')
 * @param provisionalKey - Computed via computeProvisionalKey()
 * @param verifier - Completion verifier name
 * @param goalId - Optional reference to the Goal.id that spawned this task
 */
export function createGoalBinding(params: {
  goalInstanceId: string;
  goalType: string;
  provisionalKey: string;
  verifier: string;
  goalId?: string;
}): GoalBinding {
  return {
    goalInstanceId: params.goalInstanceId,
    goalKey: params.provisionalKey,
    goalKeyAliases: [],
    goalType: params.goalType,
    goalId: params.goalId,
    anchors: {},
    completion: {
      verifier: params.verifier,
      definitionVersion: 1,
      consecutivePasses: 0,
    },
  };
}

/**
 * M3: Typed Bridge Artifact Types
 *
 * Bridge artifacts formalize the handoff between two solvers in a multi-step
 * plan. They turn implicit orchestration glue into inspectable, hashable,
 * and eventually promotable evidence.
 *
 * Two bridge types:
 * - acquire_for_craft: Rig D acquisition → Rig A crafting
 * - craft_for_build: Rig A crafting → Rig G building (via needsMaterials deficit)
 *
 * Design principles:
 * - Bridge is a CB-side identity scope (not a Sterling solve)
 * - Precondition/postcondition witnesses are content-addressed
 * - Upstream/downstream segment refs point to real SolveBundle identities
 * - Capability decision refs anchor the bridge to M2 routing provenance
 * - Bridge identity is deterministic: same inputs → same bridgeHash
 *
 * @author @darianrosebrook
 */

import type { ContentHash } from './solve-bundle-types';
import type { CapabilityDecisionRecord } from '../modules/solve-contract';

// ============================================================================
// Bridge Semantics Version
// ============================================================================

/** Bridge semantics version. Bump when witness shape changes. */
export const BRIDGE_SEMANTICS_VERSION = '1.0.0';

// ============================================================================
// Bridge Kind
// ============================================================================

/**
 * The two production bridge types.
 * Each maps to a specific upstream→downstream solver pair.
 */
export type BridgeKind = 'acquire_for_craft' | 'craft_for_build';

// ============================================================================
// Segment Reference
// ============================================================================

/**
 * Reference to a solve segment in a multi-step plan.
 * Points to the SolveBundle (or OrchestrationProvenance) that produced
 * or consumed the bridge contract.
 */
export interface SegmentRef {
  /** Solver ID that produced this segment */
  solverId: string;
  /** CB-local bundle hash (content-addressed) */
  bundleHash: ContentHash;
  /** Sterling trace hash (absent if solver didn't talk to Sterling) */
  traceBundleHash?: string;
  /** Plan ID from Sterling (for episode correlation) */
  planId?: string;
}

// ============================================================================
// Witnesses
// ============================================================================

/**
 * Precondition witness: what the downstream solver expects to be true
 * before it can proceed.
 */
export interface PreconditionWitness {
  /** Content hash of the precondition state */
  witnessHash: ContentHash;
  /** What kind of precondition */
  kind: 'inventory_sufficient' | 'material_deficit_resolved' | 'items_available';
  /** The specific items and counts that must be present */
  requiredItems: Record<string, number>;
}

/**
 * Postcondition witness: what the upstream solver produced as evidence
 * that the precondition can be met.
 */
export interface PostconditionWitness {
  /** Content hash of the postcondition state */
  witnessHash: ContentHash;
  /** What kind of postcondition */
  kind: 'items_produced' | 'steps_resolved' | 'plan_solved';
  /** The items/counts that were produced or made available */
  producedItems: Record<string, number>;
  /** Whether the upstream solve succeeded */
  solved: boolean;
}

// ============================================================================
// Bridge Edge V1
// ============================================================================

/**
 * A typed, content-addressed bridge artifact between two solver segments.
 *
 * This is a CB-side orchestration artifact (like OrchestrationProvenance).
 * It does NOT represent a Sterling solve. It represents the typed agreement
 * between an upstream and downstream solver about what was handed off.
 */
export interface BridgeEdgeV1 {
  /** Schema version for forward compatibility */
  semanticsVersion: string;
  /** What kind of bridge this is */
  kind: BridgeKind;
  /** Content-addressed identity of this bridge */
  bridgeHash: ContentHash;
  /** When this bridge was created (excluded from bridgeHash) */
  createdAt: number;

  /** Reference to the upstream solver segment */
  upstreamRef: SegmentRef;
  /** Reference to the downstream solver segment */
  downstreamRef: SegmentRef;

  /** What the downstream solver expects */
  precondition: PreconditionWitness;
  /** What the upstream solver produced */
  postcondition: PostconditionWitness;

  /** M2 capability decision that justified the upstream route */
  upstreamDecision?: CapabilityDecisionRecord;
  /** M2 capability decision that justified the downstream route */
  downstreamDecision?: CapabilityDecisionRecord;
}

/**
 * Partial Order Plan — Core Types
 *
 * A DAG-based representation of building plans where nodes are modules
 * and edges encode ordering constraints. Supports content-addressed
 * identifiers and deterministic serialization.
 *
 * NOTE: 'support' constraint is deliberately omitted. Module-level
 * dependencies are typed as 'dependency'. Geometric block-level support
 * is deferred until BuildingModule gains position data.
 *
 * @author @darianrosebrook
 */

import { canonicalize, contentHash } from '../sterling/solve-bundle';

export const PARTIAL_ORDER_SCHEMA_VERSION = 1;

export const MAX_DAG_NODES = 200;

// ============================================================================
// Core Types
// ============================================================================

export interface PlanNode<T = unknown> {
  /** Content-addressed: hash of {schemaVersion, moduleId, moduleType} */
  readonly id: string;
  readonly data: T;
  /** Optional conflict keys for commuting detection.
   *  Two nodes with overlapping conflict keys are non-commuting
   *  even if no DAG edge exists. Conservative: if unsure, add a key. */
  readonly conflictKeys: readonly string[];
}

export interface PlanEdge {
  readonly from: string; // PlanNode.id
  readonly to: string; // PlanNode.id
  readonly constraint: ConstraintType;
}

/**
 * Constraint types for plan edges.
 * - 'dependency': module X requires module Y completed first
 * - 'reachability': bot must be within reach distance
 *
 * 'support' is deliberately omitted — deferred until geometric
 * block-level occupancy data is available.
 */
export type ConstraintType = 'dependency' | 'reachability';

export interface PartialOrderPlan<T = unknown> {
  readonly schemaVersion: number;
  readonly nodes: ReadonlyArray<PlanNode<T>>;
  readonly edges: ReadonlyArray<PlanEdge>;
  readonly planDigest: string; // includes schemaVersion in hash input
}

// ============================================================================
// Node ID Generation
// ============================================================================

/**
 * Generate a content-addressed node ID from module identity fields.
 *
 * Includes schemaVersion so schema evolution produces a new ID family
 * (no silent version collisions).
 */
export function computeNodeId(moduleId: string, moduleType: string): string {
  return contentHash(
    canonicalize({
      schemaVersion: PARTIAL_ORDER_SCHEMA_VERSION,
      moduleId,
      moduleType,
    })
  );
}

/**
 * Compute a plan digest that includes the schema version.
 * Deterministic: same nodes+edges → same digest.
 */
export function computePlanDigest<T>(
  nodes: ReadonlyArray<PlanNode<T>>,
  edges: ReadonlyArray<PlanEdge>
): string {
  const nodeIds = nodes.map((n) => n.id).sort();
  const edgeIds = edges
    .map((e) => `${e.from}->${e.to}:${e.constraint}`)
    .sort();
  return contentHash(
    canonicalize({
      schemaVersion: PARTIAL_ORDER_SCHEMA_VERSION,
      nodes: nodeIds,
      edges: edgeIds,
    })
  );
}

// ============================================================================
// Rig G Signals
// ============================================================================

export interface RigGSignals {
  /** Number of nodes in the DAG */
  readonly dag_node_count: number;
  /** Number of edges in the DAG */
  readonly dag_edge_count: number;
  /** Mean ready-set size during linearization */
  readonly ready_set_size_mean: number;
  /** 95th percentile ready-set size during linearization */
  readonly ready_set_size_p95: number;
  /** Number of commuting (unordered, non-conflicting) node pairs */
  readonly commuting_pair_count: number;
  /** Whether feasibility check passed */
  readonly feasibility_passed: boolean;
  /** Number of feasibility rejections by type */
  readonly feasibility_rejections: Record<string, number>;
  /** Linearization digest for determinism verification */
  readonly linearization_digest: string;
  /** Plan digest for content-addressed identity */
  readonly plan_digest: string;
  /** Whether Rig G degraded to raw step order (DAG/linearization failed in permissive mode) */
  readonly degraded_to_raw_steps: boolean;
}

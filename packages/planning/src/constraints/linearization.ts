/**
 * Deterministic Topological Sort (Kahn's Algorithm)
 *
 * Linearizes a PartialOrderPlan into a total order with deterministic
 * tie-breaking by content-addressed node ID. Tracks ready-set sizes
 * per step for instrumentation signals.
 *
 * On cycle detection: returns PlanningDecision with kind='error',
 * reason='cycle_detected' instead of throwing.
 *
 * @author @darianrosebrook
 */

import { canonicalize, contentHash } from '../sterling/solve-bundle';
import type { PlanningDecision } from './planning-decisions';
import type { PartialOrderPlan, PlanNode } from './partial-order-plan';
import { PARTIAL_ORDER_SCHEMA_VERSION } from './partial-order-plan';

// ============================================================================
// Result Types
// ============================================================================

export interface LinearizationResult<T = unknown> {
  /** Linearized order of nodes */
  readonly order: ReadonlyArray<PlanNode<T>>;
  /** Ready-set sizes at each step (for p95/mean computation) */
  readonly readySetSizes: readonly number[];
  /** Content-addressed digest of the linearization (includes schemaVersion) */
  readonly linearizationDigest: string;
}

// ============================================================================
// Linearizer
// ============================================================================

/**
 * Deterministic topological sort via Kahn's algorithm.
 *
 * Tie-break: when multiple nodes have in-degree 0, pick the one
 * with the lexicographically smallest node.id (content-addressed,
 * so deterministic across runs).
 */
export function linearize<T>(
  plan: PartialOrderPlan<T>
): PlanningDecision<LinearizationResult<T>> {
  const nodeMap = new Map<string, PlanNode<T>>();
  for (const node of plan.nodes) {
    nodeMap.set(node.id, node);
  }

  // Build adjacency list and in-degree map
  const inDegree = new Map<string, number>();
  const successors = new Map<string, string[]>();
  for (const node of plan.nodes) {
    inDegree.set(node.id, 0);
    successors.set(node.id, []);
  }

  for (const edge of plan.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    successors.get(edge.from)!.push(edge.to);
  }

  // Initialize ready set with nodes that have in-degree 0
  const readySet: string[] = [];
  for (const [nodeId, deg] of inDegree) {
    if (deg === 0) {
      readySet.push(nodeId);
    }
  }
  // Sort for deterministic tie-breaking
  readySet.sort();

  const order: PlanNode<T>[] = [];
  const readySetSizes: number[] = [];
  let processed = 0;

  while (readySet.length > 0) {
    readySetSizes.push(readySet.length);

    // Pick the lexicographically smallest node ID
    const nextId = readySet.shift()!;
    const node = nodeMap.get(nextId)!;
    order.push(node);
    processed++;

    // Reduce in-degree of successors
    for (const succId of successors.get(nextId)!) {
      const newDeg = (inDegree.get(succId) ?? 1) - 1;
      inDegree.set(succId, newDeg);
      if (newDeg === 0) {
        // Insert in sorted position for deterministic ordering
        insertSorted(readySet, succId);
      }
    }
  }

  // Cycle detection: not all nodes were processed
  if (processed !== plan.nodes.length) {
    const unprocessed = plan.nodes
      .filter((n) => !order.some((o) => o.id === n.id))
      .map((n) => n.id);
    return {
      kind: 'error',
      reason: 'cycle_detected',
      detail: `Cycle detected in DAG: ${unprocessed.length} nodes unreachable. Involved: ${unprocessed.slice(0, 5).join(', ')}`,
    };
  }

  const linearizationDigest = computeLinearizationDigest(order);

  return {
    kind: 'ok',
    value: {
      order,
      readySetSizes,
      linearizationDigest,
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

/** Insert a string into a sorted array maintaining sort order. */
function insertSorted(arr: string[], value: string): void {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, value);
}

/** Compute a content-addressed digest of the linearization order. */
function computeLinearizationDigest<T>(
  order: ReadonlyArray<PlanNode<T>>
): string {
  const nodeIds = order.map((n) => n.id);
  return contentHash(
    canonicalize({
      schemaVersion: PARTIAL_ORDER_SCHEMA_VERSION,
      linearizedOrder: nodeIds,
    })
  );
}

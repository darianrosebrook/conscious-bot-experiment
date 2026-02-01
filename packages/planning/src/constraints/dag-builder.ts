/**
 * Module → DAG Converter
 *
 * Converts building modules into a PartialOrderPlan DAG. Derives
 * dependency edges from requiresModules. Enforces MAX_DAG_NODES bound
 * with explicit blocked result (no silent truncation).
 *
 * Conflict keys are derived from moduleType for commuting detection.
 *
 * @author @darianrosebrook
 */

import type { BuildingModule } from '../sterling/minecraft-building-types';
import type { BuildingSolveStep } from '../sterling/minecraft-building-types';
import type { PlanningDecision } from './planning-decisions';
import type {
  PartialOrderPlan,
  PlanNode,
  PlanEdge,
} from './partial-order-plan';
import {
  MAX_DAG_NODES,
  computeNodeId,
  computePlanDigest,
  PARTIAL_ORDER_SCHEMA_VERSION,
} from './partial-order-plan';

// ============================================================================
// DAG Builder
// ============================================================================

/**
 * Build a PartialOrderPlan DAG from building modules and their solve steps.
 *
 * On MAX_DAG_NODES exceeded: returns blocked with bound_exceeded.
 * No silent truncation.
 */
export function buildDagFromModules(
  modules: ReadonlyArray<BuildingModule>,
  steps: ReadonlyArray<BuildingSolveStep>
): PlanningDecision<PartialOrderPlan<BuildingSolveStep>> {
  if (steps.length > MAX_DAG_NODES) {
    return {
      kind: 'blocked',
      reason: 'bound_exceeded',
      detail: `Step count ${steps.length} exceeds MAX_DAG_NODES (${MAX_DAG_NODES})`,
    };
  }

  // Build a lookup from moduleId → module definition for dependency info
  const moduleMap = new Map<string, BuildingModule>();
  for (const mod of modules) {
    moduleMap.set(mod.moduleId, mod);
  }

  // Create nodes from steps (preserving step data)
  const nodes: PlanNode<BuildingSolveStep>[] = [];
  const nodeIdMap = new Map<string, string>(); // moduleId → PlanNode.id

  for (const step of steps) {
    const nodeId = computeNodeId(step.moduleId, step.moduleType);
    nodeIdMap.set(step.moduleId, nodeId);

    const conflictKeys = deriveConflictKeys(step, moduleMap.get(step.moduleId));

    nodes.push({
      id: nodeId,
      data: step,
      conflictKeys,
    });
  }

  // Create edges from module dependency declarations
  const edges: PlanEdge[] = [];
  for (const step of steps) {
    const toNodeId = nodeIdMap.get(step.moduleId);
    if (!toNodeId) continue;

    const moduleDef = moduleMap.get(step.moduleId);
    if (!moduleDef) continue;

    for (const depModuleId of moduleDef.requiresModules) {
      const fromNodeId = nodeIdMap.get(depModuleId);
      if (!fromNodeId) continue;

      edges.push({
        from: fromNodeId,
        to: toNodeId,
        constraint: 'dependency',
      });
    }
  }

  const planDigest = computePlanDigest(nodes, edges);

  return {
    kind: 'ok',
    value: {
      schemaVersion: PARTIAL_ORDER_SCHEMA_VERSION,
      nodes,
      edges,
      planDigest,
    },
  };
}

// ============================================================================
// Commuting Detection
// ============================================================================

/** A pair of nodes that can be executed in either order. */
export interface CommutingPair {
  readonly nodeA: string;
  readonly nodeB: string;
}

/**
 * Find all pairs of nodes that are unordered in the DAG (no path between
 * them) AND have no overlapping conflict keys.
 *
 * Two nodes commute if:
 * 1. Neither is a transitive predecessor/successor of the other
 * 2. They share no conflict keys
 */
export function findCommutingPairs<T>(
  plan: PartialOrderPlan<T>
): CommutingPair[] {
  const nodeIds = plan.nodes.map((n) => n.id);
  const nodeMap = new Map<string, PlanNode<T>>();
  for (const node of plan.nodes) {
    nodeMap.set(node.id, node);
  }

  // Build transitive closure via BFS from each node
  const reachable = new Map<string, Set<string>>();
  const successors = new Map<string, string[]>();
  for (const id of nodeIds) {
    successors.set(id, []);
  }
  for (const edge of plan.edges) {
    successors.get(edge.from)!.push(edge.to);
  }

  for (const startId of nodeIds) {
    const visited = new Set<string>();
    const queue = [...(successors.get(startId) ?? [])];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const succ of successors.get(current) ?? []) {
        if (!visited.has(succ)) queue.push(succ);
      }
    }
    reachable.set(startId, visited);
  }

  // Find unordered pairs
  const pairs: CommutingPair[] = [];
  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      const a = nodeIds[i];
      const b = nodeIds[j];

      // Check if they are ordered (either direction)
      const aReachesB = reachable.get(a)?.has(b) ?? false;
      const bReachesA = reachable.get(b)?.has(a) ?? false;

      if (aReachesB || bReachesA) continue;

      // Check conflict keys overlap
      const nodeA = nodeMap.get(a)!;
      const nodeB = nodeMap.get(b)!;
      if (hasConflictKeyOverlap(nodeA.conflictKeys, nodeB.conflictKeys)) {
        continue;
      }

      pairs.push({ nodeA: a, nodeB: b });
    }
  }

  return pairs;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Derive conflict keys for a step/module.
 *
 * For Phase G1, building modules derive conflict keys from moduleType.
 * All place_feature steps in the same region share a key.
 * Conservative: if unsure, add a conflict key.
 */
function deriveConflictKeys(
  step: BuildingSolveStep,
  module?: BuildingModule
): string[] {
  const keys: string[] = [];

  // Same-type modules in the same region are conservatively non-commuting
  // place_feature modules that share material types conflict
  if (step.moduleType === 'place_feature') {
    keys.push(`type:place_feature`);
  }

  // prep_site modules always conflict (only one site prep at a time)
  if (step.moduleType === 'prep_site') {
    keys.push('type:prep_site');
  }

  return keys;
}

/** Check if two conflict key arrays have any overlap. */
function hasConflictKeyOverlap(
  a: readonly string[],
  b: readonly string[]
): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setA = new Set(a);
  for (const key of b) {
    if (setA.has(key)) return true;
  }
  return false;
}

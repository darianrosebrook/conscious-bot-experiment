/**
 * Feasibility Checker
 *
 * Checks that a partial-order plan satisfies all constraints.
 * Returns PlanningDecision: ok with FeasibilityResult on pass,
 * blocked on infeasible with typed reason.
 *
 * Phase G2 scope:
 * - Dependency: all required modules are present as predecessors
 * - Reachability: bot within reach distance (if position data available)
 *
 * @author @darianrosebrook
 */

import type { PlanningDecision } from './planning-decisions';
import type { PartialOrderPlan } from './partial-order-plan';
import type { PlanConstraint } from './constraint-model';

// ============================================================================
// Result Types
// ============================================================================

export interface FeasibilityViolation {
  readonly type: 'dependency' | 'reachability';
  readonly detail: string;
  /** The module ID that has the violation */
  readonly moduleId: string;
  /** For dependency: the missing required module. For reachability: the distance. */
  readonly context: Record<string, unknown>;
}

export interface FeasibilityResult {
  readonly feasible: boolean;
  readonly violations: readonly FeasibilityViolation[];
}

// ============================================================================
// Checker
// ============================================================================

/**
 * Check feasibility of a plan against a set of constraints.
 *
 * Returns blocked with first violation detail when infeasible.
 * Returns ok with full FeasibilityResult in all cases so callers
 * can inspect violations even on pass.
 */
export function checkFeasibility<T>(
  plan: PartialOrderPlan<T>,
  constraints: readonly PlanConstraint[]
): PlanningDecision<FeasibilityResult> {
  const violations: FeasibilityViolation[] = [];

  // Build set of node IDs (moduleIds) present in the plan
  const moduleIdsInPlan = new Set<string>();
  for (const node of plan.nodes) {
    const data = node.data as Record<string, unknown>;
    if (typeof data?.moduleId === 'string') {
      moduleIdsInPlan.add(data.moduleId);
    }
  }

  // Build map from moduleId to node.id for edge checking
  const moduleToNodeId = new Map<string, string>();
  for (const node of plan.nodes) {
    const data = node.data as Record<string, unknown>;
    if (typeof data?.moduleId === 'string') {
      moduleToNodeId.set(data.moduleId, node.id);
    }
  }

  // Build set of edges for precedence checking
  const edgeSet = new Set<string>();
  for (const edge of plan.edges) {
    edgeSet.add(`${edge.from}->${edge.to}`);
  }

  // Build transitive closure for dependency checking
  const successors = new Map<string, string[]>();
  for (const node of plan.nodes) {
    successors.set(node.id, []);
  }
  for (const edge of plan.edges) {
    successors.get(edge.from)?.push(edge.to);
  }

  const reachable = new Map<string, Set<string>>();
  for (const nodeId of successors.keys()) {
    const visited = new Set<string>();
    const queue = [...(successors.get(nodeId) ?? [])];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const succ of successors.get(current) ?? []) {
        if (!visited.has(succ)) queue.push(succ);
      }
    }
    reachable.set(nodeId, visited);
  }

  for (const constraint of constraints) {
    switch (constraint.type) {
      case 'dependency': {
        // Check that the required module exists in the plan
        if (!moduleIdsInPlan.has(constraint.requiredModuleId)) {
          violations.push({
            type: 'dependency',
            detail: `Module '${constraint.dependentModuleId}' requires '${constraint.requiredModuleId}' but it is not in the plan`,
            moduleId: constraint.dependentModuleId,
            context: {
              requiredModuleId: constraint.requiredModuleId,
              dependentModuleId: constraint.dependentModuleId,
            },
          });
          break;
        }

        // Check that there's a precedence edge (direct or transitive)
        const reqNodeId = moduleToNodeId.get(constraint.requiredModuleId);
        const depNodeId = moduleToNodeId.get(constraint.dependentModuleId);
        if (reqNodeId && depNodeId) {
          const canReach = reachable.get(reqNodeId)?.has(depNodeId) ?? false;
          if (!canReach) {
            violations.push({
              type: 'dependency',
              detail: `Module '${constraint.dependentModuleId}' requires '${constraint.requiredModuleId}' but no precedence path exists in the DAG`,
              moduleId: constraint.dependentModuleId,
              context: {
                requiredModuleId: constraint.requiredModuleId,
                dependentModuleId: constraint.dependentModuleId,
              },
            });
          }
        }
        break;
      }

      case 'reachability': {
        if (
          constraint.currentDistance !== undefined &&
          constraint.currentDistance > constraint.maxDistance
        ) {
          violations.push({
            type: 'reachability',
            detail: `Module '${constraint.moduleId}' is ${constraint.currentDistance} blocks away but max reach is ${constraint.maxDistance}`,
            moduleId: constraint.moduleId,
            context: {
              currentDistance: constraint.currentDistance,
              maxDistance: constraint.maxDistance,
            },
          });
        }
        break;
      }

      case 'support': {
        // Check that the support module exists in the plan
        if (!moduleIdsInPlan.has(constraint.supportModuleId)) {
          violations.push({
            type: 'dependency',
            detail: `Module '${constraint.dependentModuleId}' requires support from '${constraint.supportModuleId}' but it is not in the plan`,
            moduleId: constraint.dependentModuleId,
            context: {
              supportModuleId: constraint.supportModuleId,
              dependentModuleId: constraint.dependentModuleId,
            },
          });
          break;
        }

        // Check that there's a precedence path from support → dependent
        const supportNodeId = moduleToNodeId.get(constraint.supportModuleId);
        const supportDepNodeId = moduleToNodeId.get(constraint.dependentModuleId);
        if (supportNodeId && supportDepNodeId) {
          const canReach = reachable.get(supportNodeId)?.has(supportDepNodeId) ?? false;
          if (!canReach) {
            violations.push({
              type: 'dependency',
              detail: `Module '${constraint.dependentModuleId}' requires support from '${constraint.supportModuleId}' but no precedence path exists in the DAG`,
              moduleId: constraint.dependentModuleId,
              context: {
                supportModuleId: constraint.supportModuleId,
                dependentModuleId: constraint.dependentModuleId,
              },
            });
          }
        }
        break;
      }
    }
  }

  if (violations.length > 0) {
    return {
      kind: 'blocked',
      reason:
        violations[0].type === 'dependency'
          ? 'infeasible_dependency'
          : 'infeasible_reachability',
      detail: violations[0].detail,
    };
  }

  return {
    kind: 'ok',
    value: {
      feasible: true,
      violations: [],
    },
  };
}

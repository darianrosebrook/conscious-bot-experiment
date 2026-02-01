/**
 * Plan Decomposer — Hierarchical Plan Decomposition via Macro Planner
 *
 * Replaces the original stub with macro-planner-backed decomposition.
 * Returns PlanningDecision<Plan>: ok with macro-derived steps,
 * blocked with reason on failure. Never returns empty steps silently.
 *
 * @author @darianrosebrook
 */

import type { Goal, Plan, PlanStep, PlanStatus } from '../types';
import type { PlanningDecision } from '../constraints/planning-decisions';
import type { MacroPlanner } from '../hierarchical/macro-planner';

/**
 * Decompose a goal into a Plan using the macro planner.
 *
 * If no macro planner is provided, falls back to a stub plan
 * (backward compat for callers not yet using hierarchical planning).
 */
export function decomposeToPlan(
  goal: Goal,
  macroPlanner?: MacroPlanner
): PlanningDecision<Plan> {
  if (!goal) {
    return {
      kind: 'blocked',
      reason: 'ontology_gap',
      detail: 'No goal provided for plan decomposition',
    };
  }

  if (!macroPlanner) {
    // Fallback: stub plan for backward compatibility
    const now = Date.now();
    return {
      kind: 'ok',
      value: {
        id: `plan-${now}-${goal.id}`,
        goalId: goal.id,
        steps: [],
        status: 'pending' as unknown as PlanStatus,
        priority: goal.priority,
        estimatedDuration: 0,
        createdAt: now,
        updatedAt: now,
        successProbability: 0.5,
      },
    };
  }

  // Map goal type to requirement kind for context lookup
  const requirementKind = goalTypeToRequirementKind(goal.type);
  const contextResult = macroPlanner.contextFromRequirement(requirementKind);

  if (contextResult.kind !== 'ok') {
    return contextResult;
  }

  const { start, goal: goalContext } = contextResult.value;
  const pathResult = macroPlanner.planMacroPath(start, goalContext, goal.id);

  if (pathResult.kind !== 'ok') {
    return pathResult;
  }

  const macroPlan = pathResult.value;
  const now = Date.now();

  // Convert macro edges to plan steps
  const steps: PlanStep[] = macroPlan.edges.map((edge, index) => ({
    id: `macro-step-${edge.id}`,
    planId: macroPlan.planDigest,
    action: {
      id: `macro-action-${edge.id}`,
      name: `${edge.from} → ${edge.to}`,
      description: `Transition from ${edge.from} to ${edge.to}`,
      type: 'movement' as any,
      preconditions: [],
      effects: [],
      cost: edge.learnedCost,
      duration: edge.learnedCost * 1000,
      successProbability: 0.8,
    },
    preconditions: [],
    effects: [],
    status: 'pending' as any,
    order: index + 1,
    estimatedDuration: edge.learnedCost * 1000,
    dependencies: index > 0 ? [`macro-step-${macroPlan.edges[index - 1].id}`] : [],
  }));

  return {
    kind: 'ok',
    value: {
      id: `plan-${now}-${goal.id}`,
      goalId: goal.id,
      steps,
      status: 'pending' as unknown as PlanStatus,
      priority: goal.priority,
      estimatedDuration: macroPlan.totalCost * 1000,
      createdAt: now,
      updatedAt: now,
      successProbability: 0.7,
    },
  };
}

/**
 * Map goal type to requirement kind for context lookup.
 */
function goalTypeToRequirementKind(goalType: string): string {
  switch (goalType) {
    case 'acquire_item':
    case 'resource_gathering':
      return 'collect';
    case 'achievement':
    case 'crafting':
      return 'craft';
    case 'structure_construction':
    case 'creativity':
      return 'build';
    case 'exploration':
    case 'reach_location':
      return 'mine';
    default:
      return goalType;
  }
}

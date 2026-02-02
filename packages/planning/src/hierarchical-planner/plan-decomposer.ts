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
import { decomposeEdge } from '../hierarchical/edge-decomposer';
import type { BotState } from '../hierarchical/edge-decomposer';

/**
 * Decompose a goal into a Plan using the macro planner.
 *
 * If no macro planner is provided, falls back to a stub plan
 * (backward compat for callers not yet using hierarchical planning).
 *
 * When botState is provided, macro edges are decomposed into micro steps
 * via the edge decomposer registry (E.2). Otherwise macro edges are mapped
 * to single movement PlanSteps for backward compatibility.
 */
export function decomposeToPlan(
  goal: Goal,
  macroPlanner?: MacroPlanner,
  botState?: BotState,
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
  // When botState is provided, decompose each macro edge into micro steps (E.2)
  const steps: PlanStep[] = [];
  let order = 1;
  let prevStepId: string | undefined;

  for (const edge of macroPlan.edges) {
    if (botState) {
      const decomposed = decomposeEdge(edge, botState);
      if (decomposed.kind === 'ok') {
        for (const micro of decomposed.value) {
          const stepId = `micro-step-${edge.id}-${order}`;
          steps.push({
            id: stepId,
            planId: macroPlan.planDigest,
            action: {
              id: `micro-action-${edge.id}-${order}`,
              name: micro.action,
              description: `${micro.action} (${micro.leaf})`,
              type: 'movement' as any,
              preconditions: [],
              effects: [],
              cost: micro.estimatedDurationMs / 1000,
              duration: micro.estimatedDurationMs,
              successProbability: 0.8,
              parameters: micro.params,
            },
            preconditions: [],
            effects: [],
            status: 'pending' as any,
            order,
            estimatedDuration: micro.estimatedDurationMs,
            dependencies: prevStepId ? [prevStepId] : [],
            stepId: micro.leaf,
          });
          prevStepId = stepId;
          order++;
        }
        continue;
      }
      // If decomposition is blocked, fall through to coarse macro step
    }

    // Coarse fallback: single movement step per macro edge
    const stepId = `macro-step-${edge.id}`;
    steps.push({
      id: stepId,
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
      order,
      estimatedDuration: edge.learnedCost * 1000,
      dependencies: prevStepId ? [prevStepId] : [],
    });
    prevStepId = stepId;
    order++;
  }

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

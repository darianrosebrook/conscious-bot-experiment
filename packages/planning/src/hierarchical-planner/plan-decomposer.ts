/**
 * Plan decomposer (stub).
 *
 * Author: @darianrosebrook
 */

import { Goal, Plan } from '@/types';

export function decomposeToPlan(goal: Goal): Plan | undefined {
  if (!goal) return undefined;
  const now = Date.now();
  return {
    id: `plan-${now}-${goal.id}`,
    goalId: goal.id,
    steps: [],
    status: 0 as any,
    priority: goal.priority,
    estimatedDuration: 0,
    createdAt: now,
    updatedAt: now,
    successProbability: 0.5,
  };
}

/**
 * GOAP planner (stub).
 *
 * Author: @darianrosebrook
 */

import { Plan, Goal } from '@/types';

export function planWithGOAP(goal?: Goal): Plan | undefined {
  if (!goal) return undefined;
  const now = Date.now();
  return {
    id: `goap-${now}-${goal.id}`,
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

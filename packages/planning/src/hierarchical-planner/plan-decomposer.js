"use strict";
/**
 * Plan decomposer (stub).
 *
 * Author: @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.decomposeToPlan = decomposeToPlan;
function decomposeToPlan(goal) {
    if (!goal)
        return undefined;
    const now = Date.now();
    return {
        id: `plan-${now}-${goal.id}`,
        goalId: goal.id,
        steps: [],
        status: 0,
        priority: goal.priority,
        estimatedDuration: 0,
        createdAt: now,
        updatedAt: now,
        successProbability: 0.5,
    };
}
//# sourceMappingURL=plan-decomposer.js.map
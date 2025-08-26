"use strict";
/**
 * Hierarchical Task Planner (HTN) - stub implementation.
 *
 * Provides a placeholder API for decomposing high-level goals into plans.
 *
 * Author: @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HierarchicalPlanner = void 0;
class HierarchicalPlanner {
    /**
     * Decompose a goal into a minimal plan (stub).
     */
    decompose(goal) {
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
}
exports.HierarchicalPlanner = HierarchicalPlanner;
//# sourceMappingURL=hierarchical-planner.js.map
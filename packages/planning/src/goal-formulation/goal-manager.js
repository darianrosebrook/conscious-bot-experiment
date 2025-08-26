"use strict";
/**
 * Goal management utilities.
 *
 * Maintains a queue of goals with utility scoring and safe selection.
 *
 * Author: @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoalManager = exports.defaultUtilityFn = void 0;
const types_1 = require("../types");
/**
 * Simple utility function: weighted sum of priority factors.
 */
exports.defaultUtilityFn = {
    id: 'default-utility',
    name: 'Default Utility',
    weights: {
        needIntensity: 0.5,
        needUrgency: 0.3,
        novelty: 0.1,
        opportunity: 0.1,
    },
    calculate: (ctx) => {
        const intensity = average(ctx.needs.map((n) => n.intensity)) ?? 0;
        const urgency = average(ctx.needs.map((n) => n.urgency)) ?? 0;
        const novelty = 0.2; // placeholder
        const opportunity = 0.5; // placeholder
        return clamp(intensity * 0.5 + urgency * 0.3 + novelty * 0.1 + opportunity * 0.1);
    },
};
function clamp(v) {
    return Math.max(0, Math.min(1, v));
}
function average(arr) {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : undefined;
}
/**
 * Minimal in-memory goal manager with safe defaults.
 */
class GoalManager {
    constructor() {
        this.goals = [];
    }
    upsert(goal) {
        const idx = this.goals.findIndex((g) => g.id === goal.id);
        if (idx >= 0)
            this.goals[idx] = goal;
        else
            this.goals.push(goal);
    }
    list() {
        return [...this.goals];
    }
    /**
     * Create a skeleton goal from needs, scored by the provided utility function.
     */
    createFromNeeds(needs, utilityFn = exports.defaultUtilityFn) {
        if (!needs?.length)
            return undefined; // Early return guard
        const now = Date.now();
        const ctx = {
            homeostasis: {
                health: 1,
                hunger: 0,
                energy: 1,
                safety: 1,
                curiosity: 0.5,
                social: 0.3,
                achievement: 0.4,
                creativity: 0.6,
                timestamp: now,
            },
            goals: this.goals,
            needs,
            resources: [],
            worldState: undefined,
            time: now,
        };
        const utility = clamp(utilityFn.calculate(ctx));
        const topNeed = needs[0];
        const goal = {
            id: `goal-${now}-${topNeed.type}`,
            type: topNeed.type,
            priority: clamp(topNeed.intensity),
            urgency: clamp(topNeed.urgency),
            utility,
            description: `Pursue ${topNeed.type} need`,
            preconditions: [],
            effects: [],
            status: types_1.GoalStatus.PENDING,
            createdAt: now,
            updatedAt: now,
            subGoals: [],
        };
        this.upsert(goal);
        return goal;
    }
    /**
     * Select next goal to activate.
     */
    selectNext() {
        if (!this.goals.length)
            return undefined;
        const candidates = this.goals.filter((g) => g.status === types_1.GoalStatus.PENDING || g.status === types_1.GoalStatus.SUSPENDED);
        if (!candidates.length)
            return undefined;
        candidates.sort((a, b) => b.utility - a.utility);
        return candidates[0];
    }
}
exports.GoalManager = GoalManager;
//# sourceMappingURL=goal-manager.js.map
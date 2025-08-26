"use strict";
/**
 * Need generation based on homeostasis state.
 *
 * Converts HomeostasisState measurements into a prioritized list of Needs.
 * Applies early-return guards and safe defaults.
 *
 * Author: @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNeeds = generateNeeds;
const types_1 = require("../types");
/**
 * Generate needs ordered by intensity and urgency.
 */
function generateNeeds(state) {
    if (!state) {
        // Fail-fast guard; return conservative curiosity exploration only
        const now = Date.now();
        return [
            {
                id: `need-${now}-curiosity`,
                type: types_1.NeedType.CURIOSITY,
                intensity: 0.3,
                urgency: 0.2,
                satisfaction: 0.5,
                description: 'Explore surroundings to gather context',
                createdAt: now,
                updatedAt: now,
            },
        ];
    }
    const now = Date.now();
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const needs = [
        // Survival and safety first
        {
            id: `need-${now}-survival`,
            type: types_1.NeedType.SURVIVAL,
            intensity: clamp(1 - state.health),
            urgency: clamp(1 - state.health),
            satisfaction: clamp(state.health),
            description: 'Maintain health and avoid harm',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: `need-${now}-safety`,
            type: types_1.NeedType.SAFETY,
            intensity: clamp(1 - state.safety),
            urgency: clamp(1 - state.safety),
            satisfaction: clamp(state.safety),
            description: 'Increase safety level and reduce risk',
            createdAt: now,
            updatedAt: now,
        },
        // Nutrition and energy
        {
            id: `need-${now}-nutrition`,
            type: types_1.NeedType.SURVIVAL,
            intensity: clamp(state.hunger),
            urgency: clamp(state.hunger),
            satisfaction: clamp(1 - state.hunger),
            description: 'Reduce hunger through food',
            createdAt: now,
            updatedAt: now,
        },
        // Exploration and curiosity
        {
            id: `need-${now}-exploration`,
            type: types_1.NeedType.EXPLORATION,
            intensity: clamp(state.curiosity),
            urgency: clamp(state.curiosity * 0.5),
            satisfaction: clamp(1 - state.curiosity),
            description: 'Explore environment for opportunities',
            createdAt: now,
            updatedAt: now,
        },
        // Social & achievement
        {
            id: `need-${now}-social`,
            type: types_1.NeedType.SOCIAL,
            intensity: clamp(state.social),
            urgency: clamp(state.social * 0.4),
            satisfaction: clamp(1 - state.social),
            description: 'Engage in social interaction when appropriate',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: `need-${now}-achievement`,
            type: types_1.NeedType.ACHIEVEMENT,
            intensity: clamp(state.achievement),
            urgency: clamp(state.achievement * 0.5),
            satisfaction: clamp(1 - state.achievement),
            description: 'Pursue progress toward goals',
            createdAt: now,
            updatedAt: now,
        },
    ];
    needs.sort((a, b) => b.intensity + b.urgency - (a.intensity + a.urgency));
    return needs;
}
//# sourceMappingURL=need-generator.js.map
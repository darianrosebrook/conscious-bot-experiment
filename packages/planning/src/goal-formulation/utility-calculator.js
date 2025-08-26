"use strict";
/**
 * Utility calculator helpers.
 *
 * Provides a composable, weighted utility calculation with safe guards.
 *
 * Author: @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWeightedUtility = createWeightedUtility;
function createWeightedUtility(weights) {
    return {
        id: `utility-${Object.keys(weights).join('-')}`,
        name: 'Weighted Utility',
        weights,
        calculate: (ctx) => {
            if (!ctx)
                return 0;
            const w = weights ?? {};
            const intensity = avg(ctx.needs?.map((n) => n.intensity)) ?? 0;
            const urgency = avg(ctx.needs?.map((n) => n.urgency)) ?? 0;
            const health = ctx.homeostasis?.health ?? 1;
            const safety = ctx.homeostasis?.safety ?? 1;
            const score = intensity * (w.needIntensity ?? 0.4) +
                urgency * (w.needUrgency ?? 0.3) +
                (1 - health) * (w.healthRisk ?? 0.2) +
                (1 - safety) * (w.safetyRisk ?? 0.1);
            return clamp(score);
        },
    };
}
function avg(arr) {
    return arr && arr.length
        ? arr.reduce((a, b) => a + b, 0) / arr.length
        : undefined;
}
function clamp(v) {
    return Math.max(0, Math.min(1, v));
}
//# sourceMappingURL=utility-calculator.js.map
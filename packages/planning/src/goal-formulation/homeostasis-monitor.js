"use strict";
/**
 * Homeostasis monitoring utilities.
 *
 * Provides a minimal monitor to sample the agent's internal state and
 * return a normalized HomeostasisState with safe defaults and guard rails.
 *
 * Author: @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomeostasisMonitor = void 0;
exports.getDefaultHomeostasis = getDefaultHomeostasis;
/**
 * Return a safe default homeostasis snapshot.
 */
function getDefaultHomeostasis() {
    const now = Date.now();
    return {
        health: 1,
        hunger: 0.2,
        energy: 0.8,
        safety: 0.9,
        curiosity: 0.5,
        social: 0.3,
        achievement: 0.4,
        creativity: 0.6,
        timestamp: now,
    };
}
/**
 * Monitors internal signals and synthesizes a HomeostasisState.
 */
class HomeostasisMonitor {
    /**
     * Sample current homeostasis; returns safe defaults if inputs are missing.
     */
    sample(partial) {
        const base = getDefaultHomeostasis();
        return {
            health: partial?.health ?? base.health,
            hunger: partial?.hunger ?? base.hunger,
            energy: partial?.energy ?? base.energy,
            safety: partial?.safety ?? base.safety,
            curiosity: partial?.curiosity ?? base.curiosity,
            social: partial?.social ?? base.social,
            achievement: partial?.achievement ?? base.achievement,
            creativity: partial?.creativity ?? base.creativity,
            timestamp: Date.now(),
        };
    }
}
exports.HomeostasisMonitor = HomeostasisMonitor;
//# sourceMappingURL=homeostasis-monitor.js.map
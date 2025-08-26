"use strict";
/**
 * Degradation Manager - Graceful degradation and recovery strategies
 *
 * Implements intelligent degradation strategies when performance constraints
 * cannot be met, with automatic recovery when conditions improve.
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DegradationManager = void 0;
const events_1 = require("events");
const types_1 = require("./types");
/**
 * Intelligent degradation management with recovery strategies
 */
class DegradationManager extends events_1.EventEmitter {
    constructor(componentPriorities = [], config = {
        recoveryAttemptInterval: 300000, // 5 minutes
        maxDegradationDuration: 3600000, // 1 hour
        recoveryThreshold: 0.25, // 25% improvement needed for recovery
    }) {
        super();
        this.componentPriorities = componentPriorities;
        this.config = config;
        this.currentState = {
            currentLevel: types_1.DegradationLevel.NONE,
            activeStrategies: [],
            triggeredAt: 0,
            reason: '',
            disabledFeatures: [],
            performance: {
                baselineLatency: 0,
                currentLatency: 0,
                improvement: 0,
            },
            recoveryEligible: true,
        };
        this.degradationRules = new Map();
        this.disabledFeatures = new Set();
        this.degradationHistory = [];
        this.initializeDefaultRules();
        this.startRecoveryMonitoring();
    }
    /**
     * Evaluate appropriate degradation strategy for current situation
     */
    evaluateDegradationStrategy(violation, currentState) {
        // Determine target degradation level based on violation severity
        const targetLevel = this.calculateTargetDegradationLevel(violation, currentState);
        // Get applicable rules for target level
        const rules = this.degradationRules.get(targetLevel) || [];
        // Select best rule based on current context
        const selectedRule = this.selectOptimalRule(rules, violation, currentState);
        if (!selectedRule) {
            // Fallback to emergency degradation
            return this.createEmergencyStrategy(violation);
        }
        const strategy = {
            level: targetLevel,
            actions: selectedRule.actions.map((action) => action.target),
            expectedImprovement: `${selectedRule.expectedImprovement}%`,
            impactLevel: selectedRule.impactLevel,
            estimatedDuration: this.estimateDegradationDuration(violation, selectedRule),
            reversible: selectedRule.reversible,
            dependencies: selectedRule.prerequisites,
        };
        this.emit('degradation-evaluated', strategy);
        return strategy;
    }
    /**
     * Execute graceful degradation with component prioritization
     */
    executeDegradation(strategy) {
        const previousLevel = this.currentState.currentLevel;
        // Execute degradation actions
        const disabledFeatures = [];
        const baselineLatency = this.currentState.performance.currentLatency || 200;
        for (const action of strategy.actions) {
            const success = this.executeAction(action, strategy.level);
            if (success) {
                disabledFeatures.push(action);
                this.emit('feature-disabled', action, `Degradation level ${strategy.level}`);
            }
        }
        // Update degradation state
        this.currentState = {
            currentLevel: strategy.level,
            activeStrategies: [strategy],
            triggeredAt: Date.now(),
            reason: `Performance degradation: ${strategy.expectedImprovement} improvement expected`,
            disabledFeatures,
            performance: {
                baselineLatency,
                currentLatency: baselineLatency, // Will be updated as we measure
                improvement: 0, // Will be calculated as performance improves
            },
            recoveryEligible: strategy.reversible,
        };
        // Record degradation in history
        this.degradationHistory.push({
            level: strategy.level,
            timestamp: Date.now(),
            reason: this.currentState.reason,
            duration: 0, // Will be updated when degradation ends
        });
        this.emit('degradation-level-changed', previousLevel, strategy.level);
        this.emit('degradation-executed', this.currentState);
        return this.currentState;
    }
    /**
     * Monitor degraded operation and plan recovery
     */
    assessRecovery(state) {
        const now = Date.now();
        const degradationDuration = now - state.triggeredAt;
        // Calculate current performance improvement
        const improvement = state.performance.baselineLatency > 0
            ? (state.performance.baselineLatency -
                state.performance.currentLatency) /
                state.performance.baselineLatency
            : 0;
        // Determine if recovery is feasible
        const feasible = this.isRecoveryFeasible(state, improvement, degradationDuration);
        const confidence = this.calculateRecoveryConfidence(state, improvement);
        const assessment = {
            feasible,
            confidence,
            estimatedDuration: this.estimateRecoveryDuration(state),
            requiredConditions: this.getRecoveryConditions(state),
            risks: this.assessRecoveryRisks(state),
            recommendedApproach: this.recommendRecoveryApproach(state, improvement, degradationDuration),
            nextAssessment: now + this.config.recoveryAttemptInterval,
        };
        this.emit('recovery-assessed', assessment);
        return assessment;
    }
    /**
     * Restore full operation when constraints allow
     */
    restoreOperation(state, strategy) {
        if (!state.recoveryEligible) {
            throw new Error('Recovery is not eligible for current degradation state');
        }
        this.emit('recovery-started', state);
        // Restore disabled features in reverse order
        const restoredFeatures = [];
        for (let i = state.disabledFeatures.length - 1; i >= 0; i--) {
            const feature = state.disabledFeatures[i];
            const success = this.restoreFeature(feature);
            if (success) {
                restoredFeatures.push(feature);
                this.emit('feature-restored', feature);
            }
        }
        // Create new state representing recovery
        const recoveredState = {
            currentLevel: types_1.DegradationLevel.NONE,
            activeStrategies: [],
            triggeredAt: 0,
            reason: 'Recovery completed successfully',
            disabledFeatures: state.disabledFeatures.filter((f) => !restoredFeatures.includes(f)),
            performance: {
                baselineLatency: state.performance.baselineLatency,
                currentLatency: state.performance.currentLatency,
                improvement: state.performance.improvement,
            },
            recoveryEligible: true,
        };
        // Update history
        const historyEntry = this.degradationHistory[this.degradationHistory.length - 1];
        if (historyEntry) {
            historyEntry.duration = Date.now() - historyEntry.timestamp;
        }
        this.currentState = recoveredState;
        this.emit('degradation-level-changed', state.currentLevel, types_1.DegradationLevel.NONE);
        this.emit('recovery-completed', recoveredState);
        return recoveredState;
    }
    /**
     * Update performance metrics for degradation assessment
     */
    updatePerformanceMetrics(latency) {
        if (this.currentState.currentLevel === types_1.DegradationLevel.NONE) {
            return;
        }
        const oldLatency = this.currentState.performance.currentLatency;
        this.currentState.performance.currentLatency = latency;
        // Calculate improvement
        if (this.currentState.performance.baselineLatency > 0) {
            this.currentState.performance.improvement =
                (this.currentState.performance.baselineLatency - latency) /
                    this.currentState.performance.baselineLatency;
        }
        // Check if significant improvement occurred
        const improvementThreshold = this.config.recoveryThreshold;
        if (this.currentState.performance.improvement >= improvementThreshold) {
            // Schedule recovery assessment
            this.scheduleRecoveryAssessment();
        }
    }
    /**
     * Get current degradation state
     */
    getCurrentState() {
        return { ...this.currentState };
    }
    /**
     * Get degradation history
     */
    getDegradationHistory(limit = 50) {
        return this.degradationHistory.slice(-limit);
    }
    /**
     * Force recovery attempt (for manual intervention)
     */
    forceRecovery() {
        const assessment = this.assessRecovery(this.currentState);
        if (assessment.feasible && assessment.confidence > 0.5) {
            // Attempt recovery
            try {
                this.restoreOperation(this.currentState, this.currentState.activeStrategies[0]);
            }
            catch (error) {
                // Recovery failed, update assessment
                assessment.feasible = false;
                assessment.risks.push('Manual recovery attempt failed');
            }
        }
        return assessment;
    }
    /**
     * Clean up resources
     */
    dispose() {
        if (this.recoveryTimer) {
            clearTimeout(this.recoveryTimer);
        }
        this.removeAllListeners();
    }
    // ===== PRIVATE METHODS =====
    initializeDefaultRules() {
        // Minimal degradation rules
        this.degradationRules.set(types_1.DegradationLevel.MINIMAL, [
            {
                level: types_1.DegradationLevel.MINIMAL,
                actions: [
                    { type: 'disable_feature', target: 'curiosity_exploration' },
                    {
                        type: 'reduce_quality',
                        target: 'memory_consolidation',
                        parameters: { frequency: 0.5 },
                    },
                    { type: 'simplify_algorithm', target: 'social_responses' },
                ],
                expectedImprovement: 15,
                impactLevel: 'low',
                prerequisites: [],
                reversible: true,
            },
        ]);
        // Moderate degradation rules
        this.degradationRules.set(types_1.DegradationLevel.MODERATE, [
            {
                level: types_1.DegradationLevel.MODERATE,
                actions: [
                    { type: 'disable_feature', target: 'complex_planning' },
                    { type: 'cache_only', target: 'llm_reflection' },
                    {
                        type: 'reduce_quality',
                        target: 'planning_horizon',
                        parameters: { reduction: 0.6 },
                    },
                ],
                expectedImprovement: 40,
                impactLevel: 'medium',
                prerequisites: [],
                reversible: true,
            },
        ]);
        // Severe degradation rules
        this.degradationRules.set(types_1.DegradationLevel.SEVERE, [
            {
                level: types_1.DegradationLevel.SEVERE,
                actions: [
                    { type: 'disable_feature', target: 'llm_integration' },
                    { type: 'cache_only', target: 'planning_system' },
                    { type: 'simplify_algorithm', target: 'all_cognitive_modules' },
                ],
                expectedImprovement: 70,
                impactLevel: 'high',
                prerequisites: [],
                reversible: true,
            },
        ]);
        // Critical degradation rules
        this.degradationRules.set(types_1.DegradationLevel.CRITICAL, [
            {
                level: types_1.DegradationLevel.CRITICAL,
                actions: [
                    { type: 'disable_feature', target: 'all_planning' },
                    { type: 'cache_only', target: 'safety_reflexes' },
                    { type: 'simplify_algorithm', target: 'sensory_processing' },
                ],
                expectedImprovement: 90,
                impactLevel: 'critical',
                prerequisites: [],
                reversible: false, // Critical degradation may not be fully reversible
            },
        ]);
    }
    calculateTargetDegradationLevel(violation, currentState) {
        const violationRatio = violation.budgetExceeded / violation.allocatedBudget;
        // If already degraded, consider stepping up
        let targetLevel = currentState.currentLevel;
        if (violationRatio > 2) {
            targetLevel = Math.max(targetLevel, types_1.DegradationLevel.SEVERE);
        }
        else if (violationRatio > 1) {
            targetLevel = Math.max(targetLevel, types_1.DegradationLevel.MODERATE);
        }
        else if (violationRatio > 0.5) {
            targetLevel = Math.max(targetLevel, types_1.DegradationLevel.MINIMAL);
        }
        // Emergency contexts may require more aggressive degradation
        if (violation.context === types_1.PerformanceContext.EMERGENCY) {
            targetLevel = Math.min(types_1.DegradationLevel.CRITICAL, targetLevel + 1);
        }
        return targetLevel;
    }
    selectOptimalRule(rules, violation, currentState) {
        if (rules.length === 0)
            return null;
        // Score rules based on expected improvement and impact
        const scoredRules = rules.map((rule) => ({
            rule,
            score: this.scoreRule(rule, violation, currentState),
        }));
        // Sort by score (higher is better)
        scoredRules.sort((a, b) => b.score - a.score);
        return scoredRules[0].rule;
    }
    scoreRule(rule, violation, currentState) {
        let score = rule.expectedImprovement; // Base score on expected improvement
        // Prefer less impactful rules
        const impactPenalty = {
            low: 0,
            medium: -10,
            high: -20,
            critical: -40,
        };
        score += impactPenalty[rule.impactLevel];
        // Prefer reversible rules
        if (rule.reversible) {
            score += 5;
        }
        // Check if prerequisites are met
        for (const prereq of rule.prerequisites) {
            if (!this.isPrerequisiteMet(prereq, currentState)) {
                score -= 100; // Heavy penalty for unmet prerequisites
            }
        }
        return score;
    }
    isPrerequisiteMet(prerequisite, state) {
        // Implementation depends on specific prerequisites
        // For now, assume all prerequisites are met
        return true;
    }
    createEmergencyStrategy(violation) {
        return {
            level: types_1.DegradationLevel.CRITICAL,
            actions: ['disable_all_non_essential', 'emergency_mode_only'],
            expectedImprovement: '95%',
            impactLevel: 'critical',
            estimatedDuration: 60000, // 1 minute emergency degradation
            reversible: false,
            dependencies: [],
        };
    }
    estimateDegradationDuration(violation, rule) {
        // Base duration on violation severity and rule impact
        const baseDuration = 300000; // 5 minutes
        const severityMultiplier = violation.severity === 'critical' ? 2 : 1;
        const impactMultiplier = rule.impactLevel === 'critical' ? 3 : 1;
        return baseDuration * severityMultiplier * impactMultiplier;
    }
    executeAction(action, level) {
        // Implementation would interact with actual system components
        // For now, just track the disabled feature
        this.disabledFeatures.add(action);
        return true;
    }
    restoreFeature(feature) {
        // Implementation would re-enable the actual system component
        // For now, just remove from disabled set
        return this.disabledFeatures.delete(feature);
    }
    isRecoveryFeasible(state, improvement, duration) {
        // Check if sufficient improvement has been achieved
        if (improvement < this.config.recoveryThreshold) {
            return false;
        }
        // Check if degradation has been active long enough to be stable
        if (duration < 60000) {
            return false; // Wait at least 1 minute
        }
        // Check if maximum degradation duration exceeded
        if (duration > this.config.maxDegradationDuration) {
            return true; // Force recovery after max duration
        }
        return state.recoveryEligible;
    }
    calculateRecoveryConfidence(state, improvement) {
        let confidence = improvement * 2; // Base confidence on improvement
        // Adjust based on degradation level
        const levelConfidence = {
            [types_1.DegradationLevel.NONE]: 1.0,
            [types_1.DegradationLevel.MINIMAL]: 0.9,
            [types_1.DegradationLevel.MODERATE]: 0.7,
            [types_1.DegradationLevel.SEVERE]: 0.4,
            [types_1.DegradationLevel.CRITICAL]: 0.1,
        };
        confidence *= levelConfidence[state.currentLevel];
        return Math.min(1, Math.max(0, confidence));
    }
    estimateRecoveryDuration(state) {
        // Base recovery time on degradation level
        const baseTimes = {
            [types_1.DegradationLevel.NONE]: 0,
            [types_1.DegradationLevel.MINIMAL]: 30000, // 30 seconds
            [types_1.DegradationLevel.MODERATE]: 120000, // 2 minutes
            [types_1.DegradationLevel.SEVERE]: 300000, // 5 minutes
            [types_1.DegradationLevel.CRITICAL]: 600000, // 10 minutes
        };
        return baseTimes[state.currentLevel];
    }
    getRecoveryConditions(state) {
        const conditions = [];
        if (state.performance.improvement < this.config.recoveryThreshold) {
            conditions.push(`Performance improvement >= ${this.config.recoveryThreshold * 100}%`);
        }
        if (state.currentLevel >= types_1.DegradationLevel.SEVERE) {
            conditions.push('System load reduction');
            conditions.push('Resource availability confirmation');
        }
        return conditions;
    }
    assessRecoveryRisks(state) {
        const risks = [];
        if (state.currentLevel >= types_1.DegradationLevel.MODERATE) {
            risks.push('Performance regression');
            risks.push('Cascade failure during recovery');
        }
        if (state.performance.improvement < 0.5) {
            risks.push('Insufficient performance improvement');
        }
        return risks;
    }
    recommendRecoveryApproach(state, improvement, duration) {
        if (duration > this.config.maxDegradationDuration) {
            return 'immediate'; // Force recovery
        }
        if (improvement >= 0.5 && state.currentLevel <= types_1.DegradationLevel.MODERATE) {
            return 'immediate';
        }
        if (improvement >= 0.3) {
            return 'gradual';
        }
        if (improvement >= this.config.recoveryThreshold) {
            return 'scheduled';
        }
        return 'manual'; // Requires human intervention
    }
    scheduleRecoveryAssessment() {
        if (this.recoveryTimer) {
            clearTimeout(this.recoveryTimer);
        }
        this.recoveryTimer = setTimeout(() => {
            const assessment = this.assessRecovery(this.currentState);
            if (assessment.feasible && assessment.confidence > 0.7) {
                // Attempt automatic recovery
                try {
                    this.restoreOperation(this.currentState, this.currentState.activeStrategies[0]);
                }
                catch (error) {
                    // Recovery failed, schedule next attempt
                    this.scheduleRecoveryAssessment();
                }
            }
            else {
                // Schedule next assessment
                this.scheduleRecoveryAssessment();
            }
        }, this.config.recoveryAttemptInterval);
    }
    startRecoveryMonitoring() {
        // Start periodic recovery monitoring
        setInterval(() => {
            if (this.currentState.currentLevel > types_1.DegradationLevel.NONE) {
                this.assessRecovery(this.currentState);
            }
        }, this.config.recoveryAttemptInterval);
    }
}
exports.DegradationManager = DegradationManager;
//# sourceMappingURL=degradation-manager.js.map
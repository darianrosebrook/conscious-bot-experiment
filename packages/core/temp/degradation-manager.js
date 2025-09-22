"use strict";
/**
 * Degradation Manager - Graceful degradation and recovery strategies
 *
 * Implements intelligent degradation strategies when performance constraints
 * cannot be met, with automatic recovery when conditions improve.
 *
 * @author @darianrosebrook
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DegradationManager = void 0;
var events_1 = require("events");
var types_1 = require("./types");
/**
 * Intelligent degradation management with recovery strategies
 */
var DegradationManager = /** @class */ (function (_super) {
    __extends(DegradationManager, _super);
    function DegradationManager(componentPriorities, config) {
        if (componentPriorities === void 0) { componentPriorities = []; }
        if (config === void 0) { config = {
            recoveryAttemptInterval: 300000, // 5 minutes
            maxDegradationDuration: 3600000, // 1 hour
            recoveryThreshold: 0.25, // 25% improvement needed for recovery
        }; }
        var _this = _super.call(this) || this;
        _this.componentPriorities = componentPriorities;
        _this.config = config;
        _this.currentState = {
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
        _this.degradationRules = new Map();
        _this.disabledFeatures = new Set();
        _this.degradationHistory = [];
        _this.initializeDefaultRules();
        _this.startRecoveryMonitoring();
        return _this;
    }
    /**
     * Evaluate appropriate degradation strategy for current situation
     */
    DegradationManager.prototype.evaluateDegradationStrategy = function (violation, currentState) {
        // Determine target degradation level based on violation severity
        var targetLevel = this.calculateTargetDegradationLevel(violation, currentState);
        // Get applicable rules for target level
        var rules = this.degradationRules.get(targetLevel) || [];
        // Select best rule based on current context
        var selectedRule = this.selectOptimalRule(rules, violation, currentState);
        if (!selectedRule) {
            // Fallback to emergency degradation
            return this.createEmergencyStrategy(violation);
        }
        var strategy = {
            level: targetLevel,
            actions: selectedRule.actions.map(function (action) { return action.target; }),
            expectedImprovement: "".concat(selectedRule.expectedImprovement, "%"),
            impactLevel: selectedRule.impactLevel,
            estimatedDuration: this.estimateDegradationDuration(violation, selectedRule),
            reversible: selectedRule.reversible,
            dependencies: selectedRule.prerequisites,
        };
        this.emit('degradation-evaluated', strategy);
        return strategy;
    };
    /**
     * Execute graceful degradation with component prioritization
     */
    DegradationManager.prototype.executeDegradation = function (strategy) {
        var previousLevel = this.currentState.currentLevel;
        // Execute degradation actions
        var disabledFeatures = [];
        var baselineLatency = this.currentState.performance.currentLatency || 200;
        for (var _i = 0, _a = strategy.actions; _i < _a.length; _i++) {
            var action = _a[_i];
            var success = this.executeAction(action, strategy.level);
            if (success) {
                disabledFeatures.push(action);
                this.emit('feature-disabled', action, "Degradation level ".concat(strategy.level));
            }
        }
        // Update degradation state
        this.currentState = {
            currentLevel: strategy.level,
            activeStrategies: [strategy],
            triggeredAt: Date.now(),
            reason: "Performance degradation: ".concat(strategy.expectedImprovement, " improvement expected"),
            disabledFeatures: disabledFeatures,
            performance: {
                baselineLatency: baselineLatency,
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
    };
    /**
     * Monitor degraded operation and plan recovery
     */
    DegradationManager.prototype.assessRecovery = function (state) {
        var now = Date.now();
        var degradationDuration = now - state.triggeredAt;
        // Calculate current performance improvement
        var improvement = state.performance.baselineLatency > 0
            ? (state.performance.baselineLatency -
                state.performance.currentLatency) /
                state.performance.baselineLatency
            : 0;
        // Determine if recovery is feasible
        var feasible = this.isRecoveryFeasible(state, improvement, degradationDuration);
        var confidence = this.calculateRecoveryConfidence(state, improvement);
        var assessment = {
            feasible: feasible,
            confidence: confidence,
            estimatedDuration: this.estimateRecoveryDuration(state),
            requiredConditions: this.getRecoveryConditions(state),
            risks: this.assessRecoveryRisks(state),
            recommendedApproach: this.recommendRecoveryApproach(state, improvement, degradationDuration),
            nextAssessment: now + this.config.recoveryAttemptInterval,
        };
        this.emit('recovery-assessed', assessment);
        return assessment;
    };
    /**
     * Restore full operation when constraints allow
     */
    DegradationManager.prototype.restoreOperation = function (state, strategy) {
        if (!state.recoveryEligible) {
            throw new Error('Recovery is not eligible for current degradation state');
        }
        this.emit('recovery-started', state);
        // Restore disabled features in reverse order
        var restoredFeatures = [];
        for (var i = state.disabledFeatures.length - 1; i >= 0; i--) {
            var feature = state.disabledFeatures[i];
            var success = this.restoreFeature(feature);
            if (success) {
                restoredFeatures.push(feature);
                this.emit('feature-restored', feature);
            }
        }
        // Create new state representing recovery
        var recoveredState = {
            currentLevel: types_1.DegradationLevel.NONE,
            activeStrategies: [],
            triggeredAt: 0,
            reason: 'Recovery completed successfully',
            disabledFeatures: state.disabledFeatures.filter(function (f) { return !restoredFeatures.includes(f); }),
            performance: {
                baselineLatency: state.performance.baselineLatency,
                currentLatency: state.performance.currentLatency,
                improvement: state.performance.improvement,
            },
            recoveryEligible: true,
        };
        // Update history
        var historyEntry = this.degradationHistory[this.degradationHistory.length - 1];
        if (historyEntry) {
            historyEntry.duration = Date.now() - historyEntry.timestamp;
        }
        this.currentState = recoveredState;
        this.emit('degradation-level-changed', state.currentLevel, types_1.DegradationLevel.NONE);
        this.emit('recovery-completed', recoveredState);
        return recoveredState;
    };
    /**
     * Update performance metrics for degradation assessment
     */
    DegradationManager.prototype.updatePerformanceMetrics = function (latency) {
        if (this.currentState.currentLevel === types_1.DegradationLevel.NONE) {
            return;
        }
        var oldLatency = this.currentState.performance.currentLatency;
        this.currentState.performance.currentLatency = latency;
        // Calculate improvement
        if (this.currentState.performance.baselineLatency > 0) {
            this.currentState.performance.improvement =
                (this.currentState.performance.baselineLatency - latency) /
                    this.currentState.performance.baselineLatency;
        }
        // Check if significant improvement occurred
        var improvementThreshold = this.config.recoveryThreshold;
        if (this.currentState.performance.improvement >= improvementThreshold) {
            // Schedule recovery assessment
            this.scheduleRecoveryAssessment();
        }
    };
    /**
     * Get current degradation state
     */
    DegradationManager.prototype.getCurrentState = function () {
        return __assign({}, this.currentState);
    };
    /**
     * Get degradation history
     */
    DegradationManager.prototype.getDegradationHistory = function (limit) {
        if (limit === void 0) { limit = 50; }
        return this.degradationHistory.slice(-limit);
    };
    /**
     * Force recovery attempt (for manual intervention)
     */
    DegradationManager.prototype.forceRecovery = function () {
        var assessment = this.assessRecovery(this.currentState);
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
    };
    /**
     * Clean up resources
     */
    DegradationManager.prototype.dispose = function () {
        if (this.recoveryTimer) {
            clearTimeout(this.recoveryTimer);
        }
        this.removeAllListeners();
    };
    // ===== PRIVATE METHODS =====
    DegradationManager.prototype.initializeDefaultRules = function () {
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
    };
    DegradationManager.prototype.calculateTargetDegradationLevel = function (violation, currentState) {
        var violationRatio = violation.budgetExceeded / violation.allocatedBudget;
        // If already degraded, consider stepping up
        var targetLevel = currentState.currentLevel;
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
    };
    DegradationManager.prototype.selectOptimalRule = function (rules, violation, currentState) {
        var _this = this;
        if (rules.length === 0)
            return null;
        // Score rules based on expected improvement and impact
        var scoredRules = rules.map(function (rule) { return ({
            rule: rule,
            score: _this.scoreRule(rule, violation, currentState),
        }); });
        // Sort by score (higher is better)
        scoredRules.sort(function (a, b) { return b.score - a.score; });
        return scoredRules[0].rule;
    };
    DegradationManager.prototype.scoreRule = function (rule, violation, currentState) {
        var score = rule.expectedImprovement; // Base score on expected improvement
        // Prefer less impactful rules
        var impactPenalty = {
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
        for (var _i = 0, _a = rule.prerequisites; _i < _a.length; _i++) {
            var prereq = _a[_i];
            if (!this.isPrerequisiteMet(prereq, currentState)) {
                score -= 100; // Heavy penalty for unmet prerequisites
            }
        }
        return score;
    };
    DegradationManager.prototype.isPrerequisiteMet = function (prerequisite, state) {
        // Implementation depends on specific prerequisites
        // For now, assume all prerequisites are met
        return true;
    };
    DegradationManager.prototype.createEmergencyStrategy = function (violation) {
        return {
            level: types_1.DegradationLevel.CRITICAL,
            actions: ['disable_all_non_essential', 'emergency_mode_only'],
            expectedImprovement: '95%',
            impactLevel: 'critical',
            estimatedDuration: 60000, // 1 minute emergency degradation
            reversible: false,
            dependencies: [],
        };
    };
    DegradationManager.prototype.estimateDegradationDuration = function (violation, rule) {
        // Base duration on violation severity and rule impact
        var baseDuration = 300000; // 5 minutes
        var severityMultiplier = violation.severity === 'critical' ? 2 : 1;
        var impactMultiplier = rule.impactLevel === 'critical' ? 3 : 1;
        return baseDuration * severityMultiplier * impactMultiplier;
    };
    DegradationManager.prototype.executeAction = function (action, level) {
        // Implementation would interact with actual system components
        // For now, just track the disabled feature
        this.disabledFeatures.add(action);
        return true;
    };
    DegradationManager.prototype.restoreFeature = function (feature) {
        // Implementation would re-enable the actual system component
        // For now, just remove from disabled set
        return this.disabledFeatures.delete(feature);
    };
    DegradationManager.prototype.isRecoveryFeasible = function (state, improvement, duration) {
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
    };
    DegradationManager.prototype.calculateRecoveryConfidence = function (state, improvement) {
        var _a;
        var confidence = improvement * 2; // Base confidence on improvement
        // Adjust based on degradation level
        var levelConfidence = (_a = {},
            _a[types_1.DegradationLevel.NONE] = 1.0,
            _a[types_1.DegradationLevel.MINIMAL] = 0.9,
            _a[types_1.DegradationLevel.MODERATE] = 0.7,
            _a[types_1.DegradationLevel.SEVERE] = 0.4,
            _a[types_1.DegradationLevel.CRITICAL] = 0.1,
            _a);
        confidence *= levelConfidence[state.currentLevel];
        return Math.min(1, Math.max(0, confidence));
    };
    DegradationManager.prototype.estimateRecoveryDuration = function (state) {
        var _a;
        // Base recovery time on degradation level
        var baseTimes = (_a = {},
            _a[types_1.DegradationLevel.NONE] = 0,
            _a[types_1.DegradationLevel.MINIMAL] = 30000,
            _a[types_1.DegradationLevel.MODERATE] = 120000,
            _a[types_1.DegradationLevel.SEVERE] = 300000,
            _a[types_1.DegradationLevel.CRITICAL] = 600000,
            _a);
        return baseTimes[state.currentLevel];
    };
    DegradationManager.prototype.getRecoveryConditions = function (state) {
        var conditions = [];
        if (state.performance.improvement < this.config.recoveryThreshold) {
            conditions.push("Performance improvement >= ".concat(this.config.recoveryThreshold * 100, "%"));
        }
        if (state.currentLevel >= types_1.DegradationLevel.SEVERE) {
            conditions.push('System load reduction');
            conditions.push('Resource availability confirmation');
        }
        return conditions;
    };
    DegradationManager.prototype.assessRecoveryRisks = function (state) {
        var risks = [];
        if (state.currentLevel >= types_1.DegradationLevel.MODERATE) {
            risks.push('Performance regression');
            risks.push('Cascade failure during recovery');
        }
        if (state.performance.improvement < 0.5) {
            risks.push('Insufficient performance improvement');
        }
        return risks;
    };
    DegradationManager.prototype.recommendRecoveryApproach = function (state, improvement, duration) {
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
    };
    DegradationManager.prototype.scheduleRecoveryAssessment = function () {
        var _this = this;
        if (this.recoveryTimer) {
            clearTimeout(this.recoveryTimer);
        }
        this.recoveryTimer = setTimeout(function () {
            var assessment = _this.assessRecovery(_this.currentState);
            if (assessment.feasible && assessment.confidence > 0.7) {
                // Attempt automatic recovery
                try {
                    _this.restoreOperation(_this.currentState, _this.currentState.activeStrategies[0]);
                }
                catch (error) {
                    // Recovery failed, schedule next attempt
                    _this.scheduleRecoveryAssessment();
                }
            }
            else {
                // Schedule next assessment
                _this.scheduleRecoveryAssessment();
            }
        }, this.config.recoveryAttemptInterval);
    };
    DegradationManager.prototype.startRecoveryMonitoring = function () {
        var _this = this;
        // Start periodic recovery monitoring
        setInterval(function () {
            if (_this.currentState.currentLevel > types_1.DegradationLevel.NONE) {
                _this.assessRecovery(_this.currentState);
            }
        }, this.config.recoveryAttemptInterval);
    };
    return DegradationManager;
}(events_1.EventEmitter));
exports.DegradationManager = DegradationManager;

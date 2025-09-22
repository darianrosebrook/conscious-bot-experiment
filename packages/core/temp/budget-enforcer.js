"use strict";
/**
 * Budget Enforcer - Performance budget allocation and enforcement
 *
 * Enforces time budgets and triggers degradation when performance
 * constraints are violated to maintain real-time responsiveness.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BudgetEnforcer = void 0;
var events_1 = require("events");
var uuid_1 = require("uuid");
var types_1 = require("./types");
/**
 * Budget enforcement system that maintains real-time constraints
 */
var BudgetEnforcer = /** @class */ (function (_super) {
    __extends(BudgetEnforcer, _super);
    function BudgetEnforcer(baseBudgets, adaptiveConfig) {
        var _this = _super.call(this) || this;
        _this.baseBudgets = baseBudgets;
        _this.adaptiveConfig = adaptiveConfig;
        _this.activeBudgets = new Map();
        _this.violationHistory = [];
        _this.currentSystemLoad = {
            cpu: 0.5,
            memory: 0.4,
            network: 0.2,
            concurrentOperations: 0,
            queueDepth: 0,
            level: 'low',
            timestamp: Date.now(),
        };
        // Start budget monitoring
        _this.monitoringInterval = setInterval(function () {
            _this.monitorActiveBudgets();
        }, 100); // Check every 100ms for real-time responsiveness
        return _this;
    }
    /**
     * Allocate performance budget for cognitive operation
     */
    BudgetEnforcer.prototype.allocateBudget = function (operation, context) {
        var baseBudget = this.baseBudgets[context];
        var adjustedBudget = this.calculateDynamicBudget(baseBudget, this.currentSystemLoad);
        // Apply operation-specific adjustments
        var operationMultiplier = this.getOperationMultiplier(operation);
        var contextMultiplier = this.getContextMultiplier(context);
        var totalBudget = adjustedBudget.total * operationMultiplier * contextMultiplier;
        var reservedBuffer = Math.min(totalBudget * 0.1, 10); // 10% buffer, max 10ms
        var allocation = {
            sessionId: (0, uuid_1.v4)(),
            totalBudget: totalBudget,
            allocatedBudget: totalBudget - reservedBuffer,
            reservedBuffer: reservedBuffer,
            context: context,
            allocation: {
                signalProcessing: adjustedBudget.allocation.signalProcessing * operationMultiplier,
                routing: adjustedBudget.allocation.routing * operationMultiplier,
                execution: adjustedBudget.allocation.execution * operationMultiplier,
            },
            adjustmentFactors: {
                systemLoad: this.getLoadScalingFactor(this.currentSystemLoad.level),
                operationType: operationMultiplier,
                context: contextMultiplier,
            },
            expiryTime: Date.now() + totalBudget * 2, // Budget expires after 2x allocated time
        };
        (0, types_1.validateBudgetAllocation)(allocation);
        // Track active budget
        this.activeBudgets.set(allocation.sessionId, {
            allocation: allocation,
            startTime: Date.now(),
            lastCheck: Date.now(),
            warningsSent: 0,
            violated: false,
        });
        this.emit('budget-allocated', allocation);
        return allocation;
    };
    /**
     * Monitor ongoing operation against allocated budget
     */
    BudgetEnforcer.prototype.monitorBudgetUsage = function (session, allocation) {
        var activeBudget = this.activeBudgets.get(allocation.sessionId);
        if (!activeBudget) {
            throw new Error("Budget allocation ".concat(allocation.sessionId, " not found"));
        }
        var now = Date.now();
        var elapsed = now - activeBudget.startTime;
        var utilization = elapsed / allocation.allocatedBudget;
        // Calculate remaining budget
        var remaining = Math.max(0, allocation.allocatedBudget - elapsed);
        // Project if we'll exceed budget
        var progress = this.estimateProgress(session);
        var projectedTotal = progress > 0 ? elapsed / progress : allocation.allocatedBudget * 2;
        var projectedOverrun = Math.max(0, projectedTotal - allocation.allocatedBudget);
        // Determine warning level
        var warningLevel = 'none';
        var recommendedAction = 'continue';
        if (utilization > 0.9) {
            warningLevel = 'critical';
            recommendedAction = 'abort';
        }
        else if (utilization > 0.8) {
            warningLevel = 'high';
            recommendedAction = 'degrade';
        }
        else if (utilization > 0.6) {
            warningLevel = 'medium';
            recommendedAction = 'optimize';
        }
        else if (utilization > 0.4) {
            warningLevel = 'low';
            recommendedAction = 'continue';
        }
        var status = {
            utilization: utilization,
            remaining: remaining,
            projectedOverrun: projectedOverrun,
            warningLevel: warningLevel,
            timeRemaining: remaining,
            recommendedAction: recommendedAction,
        };
        // Send warnings if needed
        if (warningLevel !== 'none' && activeBudget.warningsSent < 3) {
            activeBudget.warningsSent++;
            this.emit('budget-warning', allocation.sessionId, status);
        }
        // Check for violations
        if (elapsed > allocation.allocatedBudget && !activeBudget.violated) {
            activeBudget.violated = true;
            var violation = this.createBudgetViolation(session, allocation, elapsed);
            this.handleBudgetViolation(violation);
        }
        activeBudget.lastCheck = now;
        return status;
    };
    /**
     * Trigger degradation when budget violations detected
     */
    BudgetEnforcer.prototype.triggerDegradation = function (violation) {
        // Determine appropriate degradation level based on violation severity
        var degradationLevel;
        var overrunRatio = violation.budgetExceeded / violation.allocatedBudget;
        if (overrunRatio > 3) {
            degradationLevel = types_1.DegradationLevel.CRITICAL;
        }
        else if (overrunRatio > 2) {
            degradationLevel = types_1.DegradationLevel.SEVERE;
        }
        else if (overrunRatio > 1.5) {
            degradationLevel = types_1.DegradationLevel.MODERATE;
        }
        else {
            degradationLevel = types_1.DegradationLevel.MINIMAL;
        }
        var degradationState = {
            currentLevel: degradationLevel,
            activeStrategies: [], // Will be populated by DegradationManager
            triggeredAt: Date.now(),
            reason: "Budget violation: ".concat(violation.budgetExceeded, "ms over ").concat(violation.allocatedBudget, "ms limit"),
            disabledFeatures: [],
            performance: {
                baselineLatency: violation.allocatedBudget,
                currentLatency: violation.actualDuration,
                improvement: 0, // Will be measured after degradation
            },
            recoveryEligible: false, // Will be determined after degradation settles
        };
        this.emit('degradation-triggered', violation, degradationState);
        return degradationState;
    };
    /**
     * Calculate dynamic budget adjustments based on system load
     */
    BudgetEnforcer.prototype.calculateDynamicBudget = function (baseBudget, systemLoad) {
        var loadFactor = this.getLoadScalingFactor(systemLoad.level);
        return {
            total: baseBudget.total * loadFactor,
            allocation: {
                signalProcessing: baseBudget.allocation.signalProcessing * loadFactor,
                routing: baseBudget.allocation.routing * loadFactor,
                execution: baseBudget.allocation.execution * loadFactor,
            },
            triggers: baseBudget.triggers,
        };
    };
    /**
     * Update system load for dynamic budget calculations
     */
    BudgetEnforcer.prototype.updateSystemLoad = function (systemLoad) {
        this.currentSystemLoad = systemLoad;
        // Adjust existing budgets if system load changed significantly
        var previousLevel = this.currentSystemLoad.level;
        if (systemLoad.level !== previousLevel) {
            this.adjustActiveBudgets(systemLoad);
        }
    };
    /**
     * Get current active budget allocations
     */
    BudgetEnforcer.prototype.getActiveBudgets = function () {
        return Array.from(this.activeBudgets.values()).map(function (ab) { return ab.allocation; });
    };
    /**
     * Get recent budget violations
     */
    BudgetEnforcer.prototype.getViolationHistory = function (limit) {
        if (limit === void 0) { limit = 50; }
        return this.violationHistory.slice(-limit);
    };
    /**
     * Force release budget allocation (for cleanup)
     */
    BudgetEnforcer.prototype.releaseBudget = function (sessionId) {
        return this.activeBudgets.delete(sessionId);
    };
    /**
     * Get budget statistics
     */
    BudgetEnforcer.prototype.getBudgetStatistics = function () {
        var recentCutoff = Date.now() - 300000; // 5 minutes
        var recentViolations = this.violationHistory.filter(function (v) { return v.timestamp > recentCutoff; });
        var activeBudgetsList = Array.from(this.activeBudgets.values());
        var totalUtilization = activeBudgetsList.reduce(function (sum, budget) {
            var elapsed = Date.now() - budget.startTime;
            return sum + elapsed / budget.allocation.allocatedBudget;
        }, 0);
        return {
            activeBudgets: this.activeBudgets.size,
            totalViolations: this.violationHistory.length,
            recentViolationRate: recentViolations.length / Math.max(1, activeBudgetsList.length),
            averageUtilization: activeBudgetsList.length > 0
                ? totalUtilization / activeBudgetsList.length
                : 0,
        };
    };
    /**
     * Clean up resources
     */
    BudgetEnforcer.prototype.dispose = function () {
        clearInterval(this.monitoringInterval);
        this.activeBudgets.clear();
        this.removeAllListeners();
    };
    // ===== PRIVATE METHODS =====
    BudgetEnforcer.prototype.getLoadScalingFactor = function (loadLevel) {
        switch (loadLevel) {
            case 'low':
                return this.adaptiveConfig.loadScaling.lowLoad;
            case 'medium':
                return this.adaptiveConfig.loadScaling.mediumLoad;
            case 'high':
                return this.adaptiveConfig.loadScaling.highLoad;
            case 'critical':
                return this.adaptiveConfig.loadScaling.criticalLoad;
            default:
                return 1.0;
        }
    };
    BudgetEnforcer.prototype.getOperationMultiplier = function (operation) {
        // Check QoS guarantees
        for (var _i = 0, _a = Object.entries(this.adaptiveConfig.qosGuarantees); _i < _a.length; _i++) {
            var _b = _a[_i], pattern = _b[0], qos = _b[1];
            if (operation.name.includes(pattern) ||
                operation.type.includes(pattern)) {
                return qos.budgetMultiplier;
            }
        }
        // Default multipliers based on operation type
        var operationMultipliers = {
            signal_processing: 0.8,
            routing_decision: 0.6,
            capability_execution: 1.2,
            memory_operation: 1.0,
            planning_operation: 1.5,
            llm_inference: 2.0,
            world_interaction: 1.1,
        };
        return operationMultipliers[operation.type] || 1.0;
    };
    BudgetEnforcer.prototype.getContextMultiplier = function (context) {
        var _a;
        // Apply context modifiers from adaptive config
        var contextMultipliers = (_a = {},
            _a[types_1.PerformanceContext.EMERGENCY] = 0.8,
            _a[types_1.PerformanceContext.ROUTINE] = 1.0,
            _a[types_1.PerformanceContext.DELIBERATIVE] = 1.2,
            _a);
        return contextMultipliers[context] || 1.0;
    };
    BudgetEnforcer.prototype.estimateProgress = function (session) {
        if (session.checkpoints.length === 0) {
            // Estimate based on elapsed time vs expected duration
            var elapsed = Date.now() - session.startTime;
            var expected = session.operation.expectedDuration || session.budget;
            return Math.min(1, elapsed / expected);
        }
        // Use latest checkpoint progress
        var latestCheckpoint = session.checkpoints[session.checkpoints.length - 1];
        return latestCheckpoint.progress;
    };
    BudgetEnforcer.prototype.createBudgetViolation = function (session, allocation, actualDuration) {
        var overrun = actualDuration - allocation.allocatedBudget;
        var severity = this.determineSeverity(overrun, allocation.allocatedBudget);
        var violation = {
            sessionId: allocation.sessionId,
            operationType: session.operation.type,
            budgetExceeded: overrun,
            actualDuration: actualDuration,
            allocatedBudget: allocation.allocatedBudget,
            severity: severity,
            context: allocation.context,
            timestamp: Date.now(),
        };
        return violation;
    };
    BudgetEnforcer.prototype.determineSeverity = function (overrun, allocatedBudget) {
        var ratio = overrun / allocatedBudget;
        if (ratio > 1)
            return 'critical';
        if (ratio > 0.5)
            return 'major';
        if (ratio > 0.2)
            return 'moderate';
        return 'minor';
    };
    BudgetEnforcer.prototype.handleBudgetViolation = function (violation) {
        this.violationHistory.push(violation);
        // Keep only recent violations (last 1000)
        if (this.violationHistory.length > 1000) {
            this.violationHistory = this.violationHistory.slice(-1000);
        }
        this.emit('budget-violated', violation);
        // Trigger degradation for severe violations
        if (violation.severity === 'major' || violation.severity === 'critical') {
            this.triggerDegradation(violation);
        }
    };
    BudgetEnforcer.prototype.adjustActiveBudgets = function (newSystemLoad) {
        var adjustmentReason = "System load changed from ".concat(this.currentSystemLoad.level, " to ").concat(newSystemLoad.level);
        for (var _i = 0, _a = this.activeBudgets; _i < _a.length; _i++) {
            var _b = _a[_i], sessionId = _b[0], activeBudget = _b[1];
            var oldBudget = activeBudget.allocation.allocatedBudget;
            var newScaling = this.getLoadScalingFactor(newSystemLoad.level);
            var oldScaling = this.getLoadScalingFactor(this.currentSystemLoad.level);
            var adjustmentRatio = newScaling / oldScaling;
            var newBudget = oldBudget * adjustmentRatio;
            // Update allocation
            activeBudget.allocation.allocatedBudget = newBudget;
            activeBudget.allocation.totalBudget =
                newBudget + activeBudget.allocation.reservedBuffer;
            this.emit('budget-adjusted', adjustmentReason, newBudget);
        }
    };
    BudgetEnforcer.prototype.monitorActiveBudgets = function () {
        var now = Date.now();
        var expiredBudgets = [];
        for (var _i = 0, _a = this.activeBudgets; _i < _a.length; _i++) {
            var _b = _a[_i], sessionId = _b[0], activeBudget = _b[1];
            // Remove expired budgets
            if (now > activeBudget.allocation.expiryTime) {
                expiredBudgets.push(sessionId);
                continue;
            }
            // Check for violations in long-running operations
            var elapsed = now - activeBudget.startTime;
            if (elapsed > activeBudget.allocation.allocatedBudget &&
                !activeBudget.violated) {
                activeBudget.violated = true;
                // Create synthetic session for violation reporting
                var syntheticSession = {
                    id: sessionId,
                    operation: {
                        id: sessionId,
                        type: 'signal_processing', // Will be overridden by actual operation
                        name: 'unknown_operation',
                        module: 'unknown',
                        priority: 0.5,
                    },
                    context: activeBudget.allocation.context,
                    startTime: activeBudget.startTime,
                    budget: activeBudget.allocation.allocatedBudget,
                    checkpoints: [],
                    warnings: [],
                    active: false,
                };
                var violation = this.createBudgetViolation(syntheticSession, activeBudget.allocation, elapsed);
                this.handleBudgetViolation(violation);
            }
        }
        // Clean up expired budgets
        for (var _c = 0, expiredBudgets_1 = expiredBudgets; _c < expiredBudgets_1.length; _c++) {
            var sessionId = expiredBudgets_1[_c];
            this.activeBudgets.delete(sessionId);
        }
    };
    return BudgetEnforcer;
}(events_1.EventEmitter));
exports.BudgetEnforcer = BudgetEnforcer;

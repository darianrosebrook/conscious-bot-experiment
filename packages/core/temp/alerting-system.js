"use strict";
/**
 * Alerting System - Real-time performance alerts and notifications
 *
 * Intelligent alerting system that provides real-time notifications about
 * performance issues, constraint violations, and system health.
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertingSystem = void 0;
var events_1 = require("events");
var uuid_1 = require("uuid");
var types_1 = require("./types");
/**
 * Comprehensive alerting system with intelligent escalation and notifications
 */
var AlertingSystem = /** @class */ (function (_super) {
    __extends(AlertingSystem, _super);
    function AlertingSystem(config) {
        if (config === void 0) { config = {
            evaluationIntervalMs: 5000, // Evaluate every 5 seconds
            healthCheckIntervalMs: 30000, // Health checks every 30 seconds
            alertRetentionMs: 86400000, // Keep alerts for 24 hours
            maxActiveAlerts: 100,
        }; }
        var _this = _super.call(this) || this;
        _this.config = config;
        _this.activeAlerts = new Map();
        _this.alertHistory = [];
        _this.thresholds = new Map();
        _this.notificationChannels = new Map();
        _this.escalationRules = new Map();
        _this.healthChecks = new Map();
        _this.initializeDefaultThresholds();
        _this.initializeDefaultChannels();
        _this.initializeEscalationRules();
        _this.initializeHealthChecks();
        // Start periodic evaluations
        _this.evaluationInterval = setInterval(function () {
            if (_this.lastMetrics) {
                _this.evaluateAlerts(_this.lastMetrics, Array.from(_this.thresholds.values()));
            }
        }, _this.config.evaluationIntervalMs);
        // Start health monitoring
        _this.healthCheckInterval = setInterval(function () {
            _this.performHealthChecks();
        }, _this.config.healthCheckIntervalMs);
        return _this;
    }
    /**
     * Evaluate performance metrics against alert thresholds
     */
    AlertingSystem.prototype.evaluateAlerts = function (metrics, thresholds) {
        this.lastMetrics = metrics;
        var evaluations = [];
        for (var _i = 0, thresholds_1 = thresholds; _i < thresholds_1.length; _i++) {
            var threshold = thresholds_1[_i];
            if (!threshold.enabled)
                continue;
            var evaluation = this.evaluateThreshold(metrics, threshold);
            evaluations.push(evaluation);
            if (evaluation.triggered) {
                this.handleTriggeredAlert(evaluation, threshold);
            }
            else {
                // Check if we should resolve an existing alert
                this.checkAlertResolution(threshold.name);
            }
        }
        return evaluations;
    };
    /**
     * Send alert through configured notification channels
     */
    AlertingSystem.prototype.sendAlert = function (alert) {
        return __awaiter(this, void 0, void 0, function () {
            var enabledChannels, results;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        enabledChannels = Array.from(this.notificationChannels.values()).filter(function (channel) { return channel.enabled; });
                        return [4 /*yield*/, Promise.allSettled(enabledChannels.map(function (channel) { return _this.sendToChannel(alert, channel); }))];
                    case 1:
                        results = _a.sent();
                        // Return true if at least one channel succeeded
                        return [2 /*return*/, results.some(function (result) { return result.status === 'fulfilled' && result.value; })];
                }
            });
        });
    };
    /**
     * Acknowledge alert to prevent further escalation
     */
    AlertingSystem.prototype.acknowledgeAlert = function (alertId, user, comment) {
        var alert = this.activeAlerts.get(alertId);
        if (!alert)
            return false;
        alert.acknowledgments.push({
            user: user,
            timestamp: Date.now(),
            comment: comment,
        });
        this.emit('alert-acknowledged', alert, user);
        return true;
    };
    /**
     * Get all currently active alerts
     */
    AlertingSystem.prototype.getActiveAlerts = function () {
        return Array.from(this.activeAlerts.values());
    };
    /**
     * Get alert history with optional filtering
     */
    AlertingSystem.prototype.getAlertHistory = function (filter) {
        var alerts = __spreadArray([], this.alertHistory, true);
        if (filter === null || filter === void 0 ? void 0 : filter.severity) {
            alerts = alerts.filter(function (alert) { return alert.severity === filter.severity; });
        }
        if (filter === null || filter === void 0 ? void 0 : filter.timeRange) {
            alerts = alerts.filter(function (alert) {
                return alert.triggeredAt >= filter.timeRange.start &&
                    alert.triggeredAt <= filter.timeRange.end;
            });
        }
        if (filter === null || filter === void 0 ? void 0 : filter.limit) {
            alerts = alerts.slice(-filter.limit);
        }
        return alerts;
    };
    /**
     * Add or update alert threshold
     */
    AlertingSystem.prototype.setThreshold = function (threshold) {
        this.thresholds.set(threshold.name, threshold);
        this.emit('threshold-updated', threshold);
    };
    /**
     * Remove alert threshold
     */
    AlertingSystem.prototype.removeThreshold = function (name) {
        return this.thresholds.delete(name);
    };
    /**
     * Add notification channel
     */
    AlertingSystem.prototype.addNotificationChannel = function (channel) {
        this.notificationChannels.set(channel.id, channel);
    };
    /**
     * Generate health summary for monitoring dashboards
     */
    AlertingSystem.prototype.generateHealthSummary = function () {
        var _this = this;
        var components = Array.from(this.healthChecks.keys()).map(function (component) { return ({
            name: component,
            status: _this.getComponentHealth(component),
            latency: _this.getComponentLatency(component),
            errorRate: _this.getComponentErrorRate(component),
        }); });
        var overallStatus = this.calculateOverallHealth(components);
        var activeAlerts = this.getActiveAlerts();
        var degradationLevel = this.inferDegradationLevel(activeAlerts);
        return {
            overall: overallStatus,
            components: components,
            alerts: activeAlerts,
            degradationLevel: degradationLevel,
        };
    };
    /**
     * Generate real-time dashboard metrics
     */
    AlertingSystem.prototype.generateDashboardMetrics = function () {
        var _a, _b, _c;
        var healthStatus = this.generateHealthSummary();
        // Get recent performance trends
        var trends = this.calculatePerformanceTrends();
        return {
            liveIndicators: {
                currentLatency: ((_a = this.lastMetrics) === null || _a === void 0 ? void 0 : _a.latency.mean) || 0,
                budgetUtilization: this.calculateBudgetUtilization(),
                operationsPerSecond: ((_b = this.lastMetrics) === null || _b === void 0 ? void 0 : _b.throughput.operationsPerSecond) || 0,
                errorRate: ((_c = this.lastMetrics) === null || _c === void 0 ? void 0 : _c.quality.errorRate) || 0,
            },
            trends: trends,
            healthStatus: healthStatus,
        };
    };
    /**
     * Force resolve alert (for manual intervention)
     */
    AlertingSystem.prototype.resolveAlert = function (alertId, reason) {
        var alert = this.activeAlerts.get(alertId);
        if (!alert || alert.resolved)
            return false;
        alert.resolved = true;
        alert.resolvedAt = Date.now();
        this.activeAlerts.delete(alertId);
        this.alertHistory.push(alert);
        this.emit('alert-resolved', alert);
        return true;
    };
    /**
     * Get alert statistics
     */
    AlertingSystem.prototype.getAlertStatistics = function () {
        var activeAlerts = this.getActiveAlerts();
        var allAlerts = __spreadArray(__spreadArray([], this.alertHistory, true), activeAlerts, true);
        var alertsByLevel = allAlerts.reduce(function (counts, alert) {
            counts[alert.severity] = (counts[alert.severity] || 0) + 1;
            return counts;
        }, {});
        var resolvedAlerts = this.alertHistory.filter(function (alert) { return alert.resolved; });
        var avgResolutionTime = resolvedAlerts.length > 0
            ? resolvedAlerts.reduce(function (sum, alert) {
                return sum +
                    ((alert.resolvedAt || alert.triggeredAt) - alert.triggeredAt);
            }, 0) / resolvedAlerts.length
            : 0;
        return {
            activeAlerts: activeAlerts.length,
            totalAlerts: allAlerts.length,
            alertsByLevel: alertsByLevel,
            averageResolutionTime: avgResolutionTime,
            falsePositiveRate: 0, // Would be calculated based on acknowledgments and resolutions
        };
    };
    /**
     * Clean up resources
     */
    AlertingSystem.prototype.dispose = function () {
        clearInterval(this.evaluationInterval);
        clearInterval(this.healthCheckInterval);
        this.removeAllListeners();
    };
    // ===== PRIVATE METHODS =====
    AlertingSystem.prototype.initializeDefaultThresholds = function () {
        var defaultThresholds = [
            {
                name: 'high_latency_p95',
                metric: 'latency.p95',
                operator: '>',
                value: 150,
                window: 60000, // 1 minute
                severity: 'warning',
                enabled: true,
            },
            {
                name: 'critical_latency_p95',
                metric: 'latency.p95',
                operator: '>',
                value: 300,
                window: 30000, // 30 seconds
                severity: 'critical',
                enabled: true,
            },
            {
                name: 'high_error_rate',
                metric: 'quality.errorRate',
                operator: '>',
                value: 0.05, // 5%
                window: 120000, // 2 minutes
                severity: 'warning',
                enabled: true,
            },
            {
                name: 'critical_error_rate',
                metric: 'quality.errorRate',
                operator: '>',
                value: 0.15, // 15%
                window: 60000, // 1 minute
                severity: 'critical',
                enabled: true,
            },
            {
                name: 'low_throughput',
                metric: 'throughput.operationsPerSecond',
                operator: '<',
                value: 1,
                window: 300000, // 5 minutes
                severity: 'warning',
                enabled: true,
            },
            {
                name: 'high_cpu_usage',
                metric: 'resources.cpuUtilization',
                operator: '>',
                value: 0.8, // 80%
                window: 180000, // 3 minutes
                severity: 'warning',
                enabled: true,
            },
        ];
        for (var _i = 0, defaultThresholds_1 = defaultThresholds; _i < defaultThresholds_1.length; _i++) {
            var threshold = defaultThresholds_1[_i];
            this.thresholds.set(threshold.name, threshold);
        }
    };
    AlertingSystem.prototype.initializeDefaultChannels = function () {
        this.notificationChannels.set('console', {
            id: 'console',
            type: 'console',
            enabled: true,
            config: {},
        });
        this.notificationChannels.set('dashboard', {
            id: 'dashboard',
            type: 'dashboard',
            enabled: true,
            config: {},
        });
    };
    AlertingSystem.prototype.initializeEscalationRules = function () {
        this.escalationRules.set('warning', {
            severity: 'warning',
            timeThreshold: 600000, // 10 minutes
            escalationLevels: [
                {
                    level: 1,
                    actions: ['notify_team'],
                    notificationChannels: ['dashboard'],
                },
            ],
        });
        this.escalationRules.set('critical', {
            severity: 'critical',
            timeThreshold: 300000, // 5 minutes
            escalationLevels: [
                {
                    level: 1,
                    actions: ['notify_team', 'page_oncall'],
                    notificationChannels: ['dashboard', 'webhook'],
                },
                {
                    level: 2,
                    actions: ['escalate_to_manager'],
                    notificationChannels: ['email'],
                },
            ],
        });
    };
    AlertingSystem.prototype.initializeHealthChecks = function () {
        var _this = this;
        // Add default health checks for core components
        this.healthChecks.set('performance_tracker', {
            component: 'performance_tracker',
            checkFunction: function () { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    return [2 /*return*/, ({
                            status: 'healthy',
                            latency: 5,
                            errorRate: 0,
                        })];
                });
            }); },
            interval: 30000,
            enabled: true,
        });
        this.healthChecks.set('budget_enforcer', {
            component: 'budget_enforcer',
            checkFunction: function () { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    return [2 /*return*/, ({
                            status: 'healthy',
                            latency: 3,
                            errorRate: 0,
                        })];
                });
            }); },
            interval: 30000,
            enabled: true,
        });
    };
    AlertingSystem.prototype.evaluateThreshold = function (metrics, threshold) {
        var value = this.extractMetricValue(metrics, threshold.metric);
        var triggered = this.compareValues(value, threshold.operator, threshold.value);
        return {
            thresholdName: threshold.name,
            triggered: triggered,
            currentValue: value,
            thresholdValue: threshold.value,
            severity: threshold.severity,
            message: triggered
                ? "".concat(threshold.metric, " is ").concat(value, " (threshold: ").concat(threshold.operator, " ").concat(threshold.value, ")")
                : "".concat(threshold.metric, " is within normal range"),
        };
    };
    AlertingSystem.prototype.extractMetricValue = function (metrics, metricPath) {
        var path = metricPath.split('.');
        var value = metrics;
        for (var _i = 0, path_1 = path; _i < path_1.length; _i++) {
            var key = path_1[_i];
            value = value === null || value === void 0 ? void 0 : value[key];
            if (value === undefined)
                return 0;
        }
        return typeof value === 'number' ? value : 0;
    };
    AlertingSystem.prototype.compareValues = function (actual, operator, threshold) {
        switch (operator) {
            case '>':
                return actual > threshold;
            case '<':
                return actual < threshold;
            case '>=':
                return actual >= threshold;
            case '<=':
                return actual <= threshold;
            case '==':
                return actual === threshold;
            case '!=':
                return actual !== threshold;
            default:
                return false;
        }
    };
    AlertingSystem.prototype.handleTriggeredAlert = function (evaluation, threshold) {
        // Check if alert already exists
        var existingAlert = Array.from(this.activeAlerts.values()).find(function (alert) { return alert.name === threshold.name; });
        if (existingAlert) {
            // Update existing alert
            existingAlert.currentValue = evaluation.currentValue;
            return;
        }
        // Create new alert
        var alert = {
            id: (0, uuid_1.v4)(),
            name: threshold.name,
            severity: threshold.severity,
            message: evaluation.message,
            metric: threshold.metric,
            currentValue: evaluation.currentValue,
            thresholdValue: threshold.value,
            triggeredAt: Date.now(),
            resolved: false,
            acknowledgments: [],
            escalationLevel: 0,
        };
        this.activeAlerts.set(alert.id, alert);
        this.emit('alert-triggered', alert);
        // Send immediate notification
        this.sendAlert(alert);
        // Schedule escalation if needed
        this.scheduleEscalation(alert);
    };
    AlertingSystem.prototype.checkAlertResolution = function (thresholdName) {
        var alert = Array.from(this.activeAlerts.values()).find(function (alert) { return alert.name === thresholdName; });
        if (alert && !alert.resolved) {
            this.resolveAlert(alert.id, 'Threshold condition resolved');
        }
    };
    AlertingSystem.prototype.sendToChannel = function (alert, channel) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                try {
                    switch (channel.type) {
                        case 'console':
                            console.log("[ALERT ".concat(alert.severity.toUpperCase(), "] ").concat(alert.message));
                            return [2 /*return*/, true];
                        case 'dashboard':
                            // Would integrate with actual dashboard system
                            return [2 /*return*/, true];
                        case 'webhook':
                            // Would send HTTP request to webhook URL
                            return [2 /*return*/, true];
                        case 'email':
                            // Would send email notification
                            return [2 /*return*/, true];
                        default:
                            return [2 /*return*/, false];
                    }
                }
                catch (error) {
                    console.error("Failed to send alert to ".concat(channel.type, ":"), error);
                    return [2 /*return*/, false];
                }
                return [2 /*return*/];
            });
        });
    };
    AlertingSystem.prototype.scheduleEscalation = function (alert) {
        var _this = this;
        var rule = this.escalationRules.get(alert.severity);
        if (!rule)
            return;
        setTimeout(function () {
            // Check if alert is still active and not acknowledged
            var currentAlert = _this.activeAlerts.get(alert.id);
            if (!currentAlert ||
                currentAlert.resolved ||
                currentAlert.acknowledgments.length > 0) {
                return;
            }
            // Escalate alert
            currentAlert.escalationLevel++;
            _this.emit('alert-escalated', currentAlert, currentAlert.escalationLevel);
            // Execute escalation actions
            var escalationLevel = rule.escalationLevels[currentAlert.escalationLevel - 1];
            if (escalationLevel) {
                _this.executeEscalationActions(currentAlert, escalationLevel);
            }
        }, rule.timeThreshold);
    };
    AlertingSystem.prototype.executeEscalationActions = function (alert, escalation) {
        // Implementation would execute specific escalation actions
        console.log("Escalating alert ".concat(alert.id, " to level ").concat(alert.escalationLevel));
    };
    AlertingSystem.prototype.performHealthChecks = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, _b, component, healthCheck, result, error_1;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _i = 0, _a = this.healthChecks;
                        _c.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        _b = _a[_i], component = _b[0], healthCheck = _b[1];
                        if (!healthCheck.enabled)
                            return [3 /*break*/, 5];
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, healthCheck.checkFunction()];
                    case 3:
                        result = _c.sent();
                        this.updateComponentHealth(component, result);
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _c.sent();
                        this.updateComponentHealth(component, {
                            status: 'critical',
                            latency: 0,
                            errorRate: 1,
                            details: error_1 instanceof Error ? error_1.message : 'Health check failed',
                        });
                        return [3 /*break*/, 5];
                    case 5:
                        _i++;
                        return [3 /*break*/, 1];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    AlertingSystem.prototype.updateComponentHealth = function (component, health) {
        // Would update component health in a centralized store
        this.emit('health-status-changed', component, health.status);
    };
    AlertingSystem.prototype.getComponentHealth = function (component) {
        // Would retrieve actual component health
        return 'healthy';
    };
    AlertingSystem.prototype.getComponentLatency = function (component) {
        // Would retrieve actual component latency
        return 10;
    };
    AlertingSystem.prototype.getComponentErrorRate = function (component) {
        // Would retrieve actual component error rate
        return 0;
    };
    AlertingSystem.prototype.calculateOverallHealth = function (components) {
        var criticalCount = components.filter(function (c) { return c.status === 'critical'; }).length;
        var warningCount = components.filter(function (c) { return c.status === 'warning'; }).length;
        if (criticalCount > 0)
            return 'critical';
        if (warningCount > 0)
            return 'warning';
        return 'healthy';
    };
    AlertingSystem.prototype.inferDegradationLevel = function (alerts) {
        var criticalAlerts = alerts.filter(function (a) { return a.severity === 'critical'; }).length;
        var warningAlerts = alerts.filter(function (a) { return a.severity === 'warning'; }).length;
        if (criticalAlerts >= 3)
            return types_1.DegradationLevel.CRITICAL;
        if (criticalAlerts >= 1 || warningAlerts >= 5)
            return types_1.DegradationLevel.SEVERE;
        if (warningAlerts >= 3)
            return types_1.DegradationLevel.MODERATE;
        if (warningAlerts >= 1)
            return types_1.DegradationLevel.MINIMAL;
        return types_1.DegradationLevel.NONE;
    };
    AlertingSystem.prototype.calculateBudgetUtilization = function () {
        // Would calculate actual budget utilization from budget enforcer
        return 0.6; // Placeholder
    };
    AlertingSystem.prototype.calculatePerformanceTrends = function () {
        // Would calculate actual performance trends
        return {
            latencyTrend: [],
            throughputTrend: [],
        };
    };
    return AlertingSystem;
}(events_1.EventEmitter));
exports.AlertingSystem = AlertingSystem;

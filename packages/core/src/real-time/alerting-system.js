"use strict";
/**
 * Alerting System - Real-time performance alerts and notifications
 *
 * Intelligent alerting system that provides real-time notifications about
 * performance issues, constraint violations, and system health.
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertingSystem = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const types_1 = require("./types");
/**
 * Comprehensive alerting system with intelligent escalation and notifications
 */
class AlertingSystem extends events_1.EventEmitter {
    constructor(config = {
        evaluationIntervalMs: 5000, // Evaluate every 5 seconds
        healthCheckIntervalMs: 30000, // Health checks every 30 seconds
        alertRetentionMs: 86400000, // Keep alerts for 24 hours
        maxActiveAlerts: 100,
    }) {
        super();
        this.config = config;
        this.activeAlerts = new Map();
        this.alertHistory = [];
        this.thresholds = new Map();
        this.notificationChannels = new Map();
        this.escalationRules = new Map();
        this.healthChecks = new Map();
        this.initializeDefaultThresholds();
        this.initializeDefaultChannels();
        this.initializeEscalationRules();
        this.initializeHealthChecks();
        // Start periodic evaluations
        this.evaluationInterval = setInterval(() => {
            if (this.lastMetrics) {
                this.evaluateAlerts(this.lastMetrics, Array.from(this.thresholds.values()));
            }
        }, this.config.evaluationIntervalMs);
        // Start health monitoring
        this.healthCheckInterval = setInterval(() => {
            this.performHealthChecks();
        }, this.config.healthCheckIntervalMs);
    }
    /**
     * Evaluate performance metrics against alert thresholds
     */
    evaluateAlerts(metrics, thresholds) {
        this.lastMetrics = metrics;
        const evaluations = [];
        for (const threshold of thresholds) {
            if (!threshold.enabled)
                continue;
            const evaluation = this.evaluateThreshold(metrics, threshold);
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
    }
    /**
     * Send alert through configured notification channels
     */
    async sendAlert(alert) {
        const enabledChannels = Array.from(this.notificationChannels.values()).filter((channel) => channel.enabled);
        const results = await Promise.allSettled(enabledChannels.map((channel) => this.sendToChannel(alert, channel)));
        // Return true if at least one channel succeeded
        return results.some((result) => result.status === 'fulfilled' && result.value);
    }
    /**
     * Acknowledge alert to prevent further escalation
     */
    acknowledgeAlert(alertId, user, comment) {
        const alert = this.activeAlerts.get(alertId);
        if (!alert)
            return false;
        alert.acknowledgments.push({
            user,
            timestamp: Date.now(),
            comment,
        });
        this.emit('alert-acknowledged', alert, user);
        return true;
    }
    /**
     * Get all currently active alerts
     */
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }
    /**
     * Get alert history with optional filtering
     */
    getAlertHistory(filter) {
        let alerts = [...this.alertHistory];
        if (filter?.severity) {
            alerts = alerts.filter((alert) => alert.severity === filter.severity);
        }
        if (filter?.timeRange) {
            alerts = alerts.filter((alert) => alert.triggeredAt >= filter.timeRange.start &&
                alert.triggeredAt <= filter.timeRange.end);
        }
        if (filter?.limit) {
            alerts = alerts.slice(-filter.limit);
        }
        return alerts;
    }
    /**
     * Add or update alert threshold
     */
    setThreshold(threshold) {
        this.thresholds.set(threshold.name, threshold);
        this.emit('threshold-updated', threshold);
    }
    /**
     * Remove alert threshold
     */
    removeThreshold(name) {
        return this.thresholds.delete(name);
    }
    /**
     * Add notification channel
     */
    addNotificationChannel(channel) {
        this.notificationChannels.set(channel.id, channel);
    }
    /**
     * Generate health summary for monitoring dashboards
     */
    generateHealthSummary() {
        const components = Array.from(this.healthChecks.keys()).map((component) => ({
            name: component,
            status: this.getComponentHealth(component),
            latency: this.getComponentLatency(component),
            errorRate: this.getComponentErrorRate(component),
        }));
        const overallStatus = this.calculateOverallHealth(components);
        const activeAlerts = this.getActiveAlerts();
        const degradationLevel = this.inferDegradationLevel(activeAlerts);
        return {
            overall: overallStatus,
            components,
            alerts: activeAlerts,
            degradationLevel,
        };
    }
    /**
     * Generate real-time dashboard metrics
     */
    generateDashboardMetrics() {
        const healthStatus = this.generateHealthSummary();
        // Get recent performance trends
        const trends = this.calculatePerformanceTrends();
        return {
            liveIndicators: {
                currentLatency: this.lastMetrics?.latency.mean || 0,
                budgetUtilization: this.calculateBudgetUtilization(),
                operationsPerSecond: this.lastMetrics?.throughput.operationsPerSecond || 0,
                errorRate: this.lastMetrics?.quality.errorRate || 0,
            },
            trends,
            healthStatus,
        };
    }
    /**
     * Force resolve alert (for manual intervention)
     */
    resolveAlert(alertId, reason) {
        const alert = this.activeAlerts.get(alertId);
        if (!alert || alert.resolved)
            return false;
        alert.resolved = true;
        alert.resolvedAt = Date.now();
        this.activeAlerts.delete(alertId);
        this.alertHistory.push(alert);
        this.emit('alert-resolved', alert);
        return true;
    }
    /**
     * Get alert statistics
     */
    getAlertStatistics() {
        const activeAlerts = this.getActiveAlerts();
        const allAlerts = [...this.alertHistory, ...activeAlerts];
        const alertsByLevel = allAlerts.reduce((counts, alert) => {
            counts[alert.severity] = (counts[alert.severity] || 0) + 1;
            return counts;
        }, {});
        const resolvedAlerts = this.alertHistory.filter((alert) => alert.resolved);
        const avgResolutionTime = resolvedAlerts.length > 0
            ? resolvedAlerts.reduce((sum, alert) => sum +
                ((alert.resolvedAt || alert.triggeredAt) - alert.triggeredAt), 0) / resolvedAlerts.length
            : 0;
        return {
            activeAlerts: activeAlerts.length,
            totalAlerts: allAlerts.length,
            alertsByLevel,
            averageResolutionTime: avgResolutionTime,
            falsePositiveRate: 0, // Would be calculated based on acknowledgments and resolutions
        };
    }
    /**
     * Clean up resources
     */
    dispose() {
        clearInterval(this.evaluationInterval);
        clearInterval(this.healthCheckInterval);
        this.removeAllListeners();
    }
    // ===== PRIVATE METHODS =====
    initializeDefaultThresholds() {
        const defaultThresholds = [
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
        for (const threshold of defaultThresholds) {
            this.thresholds.set(threshold.name, threshold);
        }
    }
    initializeDefaultChannels() {
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
    }
    initializeEscalationRules() {
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
    }
    initializeHealthChecks() {
        // Add default health checks for core components
        this.healthChecks.set('performance_tracker', {
            component: 'performance_tracker',
            checkFunction: async () => ({
                status: 'healthy',
                latency: 5,
                errorRate: 0,
            }),
            interval: 30000,
            enabled: true,
        });
        this.healthChecks.set('budget_enforcer', {
            component: 'budget_enforcer',
            checkFunction: async () => ({
                status: 'healthy',
                latency: 3,
                errorRate: 0,
            }),
            interval: 30000,
            enabled: true,
        });
    }
    evaluateThreshold(metrics, threshold) {
        const value = this.extractMetricValue(metrics, threshold.metric);
        const triggered = this.compareValues(value, threshold.operator, threshold.value);
        return {
            thresholdName: threshold.name,
            triggered,
            currentValue: value,
            thresholdValue: threshold.value,
            severity: threshold.severity,
            message: triggered
                ? `${threshold.metric} is ${value} (threshold: ${threshold.operator} ${threshold.value})`
                : `${threshold.metric} is within normal range`,
        };
    }
    extractMetricValue(metrics, metricPath) {
        const path = metricPath.split('.');
        let value = metrics;
        for (const key of path) {
            value = value?.[key];
            if (value === undefined)
                return 0;
        }
        return typeof value === 'number' ? value : 0;
    }
    compareValues(actual, operator, threshold) {
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
    }
    handleTriggeredAlert(evaluation, threshold) {
        // Check if alert already exists
        const existingAlert = Array.from(this.activeAlerts.values()).find((alert) => alert.name === threshold.name);
        if (existingAlert) {
            // Update existing alert
            existingAlert.currentValue = evaluation.currentValue;
            return;
        }
        // Create new alert
        const alert = {
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
    }
    checkAlertResolution(thresholdName) {
        const alert = Array.from(this.activeAlerts.values()).find((alert) => alert.name === thresholdName);
        if (alert && !alert.resolved) {
            this.resolveAlert(alert.id, 'Threshold condition resolved');
        }
    }
    async sendToChannel(alert, channel) {
        try {
            switch (channel.type) {
                case 'console':
                    console.log(`[ALERT ${alert.severity.toUpperCase()}] ${alert.message}`);
                    return true;
                case 'dashboard':
                    // Would integrate with actual dashboard system
                    return true;
                case 'webhook':
                    // Would send HTTP request to webhook URL
                    return true;
                case 'email':
                    // Would send email notification
                    return true;
                default:
                    return false;
            }
        }
        catch (error) {
            console.error(`Failed to send alert to ${channel.type}:`, error);
            return false;
        }
    }
    scheduleEscalation(alert) {
        const rule = this.escalationRules.get(alert.severity);
        if (!rule)
            return;
        setTimeout(() => {
            // Check if alert is still active and not acknowledged
            const currentAlert = this.activeAlerts.get(alert.id);
            if (!currentAlert ||
                currentAlert.resolved ||
                currentAlert.acknowledgments.length > 0) {
                return;
            }
            // Escalate alert
            currentAlert.escalationLevel++;
            this.emit('alert-escalated', currentAlert, currentAlert.escalationLevel);
            // Execute escalation actions
            const escalationLevel = rule.escalationLevels[currentAlert.escalationLevel - 1];
            if (escalationLevel) {
                this.executeEscalationActions(currentAlert, escalationLevel);
            }
        }, rule.timeThreshold);
    }
    executeEscalationActions(alert, escalation) {
        // Implementation would execute specific escalation actions
        console.log(`Escalating alert ${alert.id} to level ${alert.escalationLevel}`);
    }
    async performHealthChecks() {
        for (const [component, healthCheck] of this.healthChecks) {
            if (!healthCheck.enabled)
                continue;
            try {
                const result = await healthCheck.checkFunction();
                this.updateComponentHealth(component, result);
            }
            catch (error) {
                this.updateComponentHealth(component, {
                    status: 'critical',
                    latency: 0,
                    errorRate: 1,
                    details: error instanceof Error ? error.message : 'Health check failed',
                });
            }
        }
    }
    updateComponentHealth(component, health) {
        // Would update component health in a centralized store
        this.emit('health-status-changed', component, health.status);
    }
    getComponentHealth(component) {
        // Would retrieve actual component health
        return 'healthy';
    }
    getComponentLatency(component) {
        // Would retrieve actual component latency
        return 10;
    }
    getComponentErrorRate(component) {
        // Would retrieve actual component error rate
        return 0;
    }
    calculateOverallHealth(components) {
        const criticalCount = components.filter((c) => c.status === 'critical').length;
        const warningCount = components.filter((c) => c.status === 'warning').length;
        if (criticalCount > 0)
            return 'critical';
        if (warningCount > 0)
            return 'warning';
        return 'healthy';
    }
    inferDegradationLevel(alerts) {
        const criticalAlerts = alerts.filter((a) => a.severity === 'critical').length;
        const warningAlerts = alerts.filter((a) => a.severity === 'warning').length;
        if (criticalAlerts >= 3)
            return types_1.DegradationLevel.CRITICAL;
        if (criticalAlerts >= 1 || warningAlerts >= 5)
            return types_1.DegradationLevel.SEVERE;
        if (warningAlerts >= 3)
            return types_1.DegradationLevel.MODERATE;
        if (warningAlerts >= 1)
            return types_1.DegradationLevel.MINIMAL;
        return types_1.DegradationLevel.NONE;
    }
    calculateBudgetUtilization() {
        // Would calculate actual budget utilization from budget enforcer
        return 0.6; // Placeholder
    }
    calculatePerformanceTrends() {
        // Would calculate actual performance trends
        return {
            latencyTrend: [],
            throughputTrend: [],
        };
    }
}
exports.AlertingSystem = AlertingSystem;
//# sourceMappingURL=alerting-system.js.map
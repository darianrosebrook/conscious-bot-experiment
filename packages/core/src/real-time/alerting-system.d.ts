/**
 * Alerting System - Real-time performance alerts and notifications
 *
 * Intelligent alerting system that provides real-time notifications about
 * performance issues, constraint violations, and system health.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
import { PerformanceMetrics, AlertThreshold, Alert, AlertEvaluation, DashboardMetrics, IAlertingSystem } from './types';
export interface AlertingSystemEvents {
    'alert-triggered': [Alert];
    'alert-resolved': [Alert];
    'alert-acknowledged': [Alert, string];
    'alert-escalated': [Alert, number];
    'threshold-updated': [AlertThreshold];
    'health-status-changed': [string, string];
}
interface NotificationChannel {
    id: string;
    type: 'console' | 'dashboard' | 'webhook' | 'email';
    enabled: boolean;
    config: Record<string, any>;
}
/**
 * Comprehensive alerting system with intelligent escalation and notifications
 */
export declare class AlertingSystem extends EventEmitter<AlertingSystemEvents> implements IAlertingSystem {
    private config;
    private activeAlerts;
    private alertHistory;
    private thresholds;
    private notificationChannels;
    private escalationRules;
    private healthChecks;
    private lastMetrics?;
    private readonly evaluationInterval;
    private readonly healthCheckInterval;
    constructor(config?: {
        evaluationIntervalMs: number;
        healthCheckIntervalMs: number;
        alertRetentionMs: number;
        maxActiveAlerts: number;
    });
    /**
     * Evaluate performance metrics against alert thresholds
     */
    evaluateAlerts(metrics: PerformanceMetrics, thresholds: AlertThreshold[]): AlertEvaluation[];
    /**
     * Send alert through configured notification channels
     */
    sendAlert(alert: Alert): Promise<boolean>;
    /**
     * Acknowledge alert to prevent further escalation
     */
    acknowledgeAlert(alertId: string, user: string, comment?: string): boolean;
    /**
     * Get all currently active alerts
     */
    getActiveAlerts(): Alert[];
    /**
     * Get alert history with optional filtering
     */
    getAlertHistory(filter?: {
        severity?: Alert['severity'];
        timeRange?: {
            start: number;
            end: number;
        };
        limit?: number;
    }): Alert[];
    /**
     * Add or update alert threshold
     */
    setThreshold(threshold: AlertThreshold): void;
    /**
     * Remove alert threshold
     */
    removeThreshold(name: string): boolean;
    /**
     * Add notification channel
     */
    addNotificationChannel(channel: NotificationChannel): void;
    /**
     * Generate health summary for monitoring dashboards
     */
    generateHealthSummary(): DashboardMetrics['healthStatus'];
    /**
     * Generate real-time dashboard metrics
     */
    generateDashboardMetrics(): DashboardMetrics;
    /**
     * Force resolve alert (for manual intervention)
     */
    resolveAlert(alertId: string, reason: string): boolean;
    /**
     * Get alert statistics
     */
    getAlertStatistics(): {
        activeAlerts: number;
        totalAlerts: number;
        alertsByLevel: Record<string, number>;
        averageResolutionTime: number;
        falsePositiveRate: number;
    };
    /**
     * Clean up resources
     */
    dispose(): void;
    private initializeDefaultThresholds;
    private initializeDefaultChannels;
    private initializeEscalationRules;
    private initializeHealthChecks;
    private evaluateThreshold;
    private extractMetricValue;
    private compareValues;
    private handleTriggeredAlert;
    private checkAlertResolution;
    private sendToChannel;
    private scheduleEscalation;
    private executeEscalationActions;
    private performHealthChecks;
    private updateComponentHealth;
    private getComponentHealth;
    private getComponentLatency;
    private getComponentErrorRate;
    private calculateOverallHealth;
    private inferDegradationLevel;
    private calculateBudgetUtilization;
    private calculatePerformanceTrends;
}
export {};
//# sourceMappingURL=alerting-system.d.ts.map
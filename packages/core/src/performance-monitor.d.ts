/**
 * Performance Monitor - Real-time budget enforcement and performance tracking
 *
 * Implements latency tracking, budget enforcement, and graceful degradation
 * for maintaining real-time constraints in the conscious bot.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
import { PerformanceBudget, PerformanceMetrics, CognitiveTask, DegradationLevel, SystemEvents } from './types';
export interface PerformanceMonitorConfig {
    budgets: {
        emergency: number;
        routine: number;
        deliberative: number;
    };
    monitoringInterval: number;
    violationThreshold: number;
    degradationEnabled: boolean;
    alertingEnabled: boolean;
    historySize: number;
}
/**
 * Default performance monitoring configuration
 */
export declare const DEFAULT_PERFORMANCE_CONFIG: PerformanceMonitorConfig;
/**
 * Performance tracking session for individual operations
 */
export declare class TrackingSession {
    readonly id: string;
    readonly operation: CognitiveTask;
    readonly budget: PerformanceBudget;
    private startTime;
    private checkpoints;
    constructor(id: string, operation: CognitiveTask, budget: PerformanceBudget);
    /**
     * Record a checkpoint in the operation
     */
    checkpoint(name: string): void;
    /**
     * Get elapsed time since start
     */
    getElapsed(): number;
    /**
     * Get time between checkpoints
     */
    getCheckpointDuration(from: string, to: string): number;
    /**
     * Check if operation is within budget
     */
    isWithinBudget(): boolean;
    /**
     * Get budget utilization percentage
     */
    getBudgetUtilization(): number;
    /**
     * Get all checkpoint timings
     */
    getCheckpoints(): Record<string, number>;
}
/**
 * Real-time performance monitor that tracks latency, enforces budgets,
 * and triggers degradation when performance constraints are violated.
 */
export declare class PerformanceMonitor extends EventEmitter<SystemEvents> {
    private config;
    private activeSessions;
    private latencyTrackers;
    private consecutiveViolations;
    private currentDegradation;
    private monitoringTimer?;
    private operationCounter;
    constructor(config?: PerformanceMonitorConfig);
    /**
     * Start tracking performance for a cognitive operation
     *
     * @param operation - Operation being tracked
     * @param context - Context that affects performance expectations
     * @returns Tracking session for this operation
     */
    startTracking(operation: CognitiveTask, context?: 'emergency' | 'routine' | 'deliberative'): TrackingSession;
    /**
     * Record completion of tracked operation with metrics
     *
     * @param session - Active tracking session
     * @param success - Whether operation completed successfully
     * @returns Performance metrics for this execution
     */
    recordCompletion(session: TrackingSession, success?: boolean): PerformanceMetrics;
    /**
     * Handle budget violation
     */
    private handleBudgetViolation;
    /**
     * Trigger performance degradation
     */
    private triggerDegradation;
    /**
     * Attempt to recover from degradation
     */
    attemptRecovery(): void;
    /**
     * Get current performance statistics
     */
    getCurrentMetrics(): PerformanceMetrics;
    /**
     * Generate comprehensive performance metrics
     */
    private generateCurrentMetrics;
    /**
     * Get current degradation level
     */
    getDegradationLevel(): DegradationLevel;
    /**
     * Check if system is within performance budgets
     */
    isWithinBudgets(): boolean;
    /**
     * Get active tracking sessions
     */
    getActiveSessions(): TrackingSession[];
    /**
     * Start periodic monitoring
     */
    private startMonitoring;
    /**
     * Perform periodic health checks
     */
    private performPeriodicCheck;
    /**
     * Estimate CPU utilization (simplified)
     */
    private estimateCpuUtilization;
    /**
     * Estimate memory usage (simplified)
     */
    private estimateMemoryUsage;
    /**
     * Calculate success rate
     */
    private calculateSuccessRate;
    /**
     * Get uptime in seconds
     */
    private getUptimeSeconds;
    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<PerformanceMonitorConfig>): void;
    /**
     * Stop monitoring and cleanup
     */
    stop(): void;
    /**
     * Reset all statistics
     */
    reset(): void;
    /**
     * Get performance statistics summary
     */
    getStatistics(): {
        totalOperations: number;
        consecutiveViolations: number;
        currentDegradation: DegradationLevel;
        activeSessions: number;
        uptimeSeconds: number;
    };
}
//# sourceMappingURL=performance-monitor.d.ts.map
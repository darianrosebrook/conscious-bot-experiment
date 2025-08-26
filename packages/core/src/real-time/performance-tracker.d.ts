/**
 * Performance Tracker - High-precision performance monitoring
 *
 * Comprehensive latency and throughput monitoring system that tracks
 * performance across all cognitive modules with real-time analytics.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
import { CognitiveOperation, OperationResult, OperationType, PerformanceContext, PerformanceMetrics, PerformanceQuery, PerformanceStats, PerformanceAnomaly, TrackingSession, PerformanceBaseline, IPerformanceTracker } from './types';
export interface PerformanceTrackerEvents {
    'session-started': [TrackingSession];
    'session-completed': [TrackingSession, PerformanceMetrics];
    'anomaly-detected': [PerformanceAnomaly];
    'baseline-updated': [PerformanceBaseline];
    'performance-degraded': [OperationType, number];
}
/**
 * High-precision performance tracking system with real-time analytics
 */
export declare class PerformanceTracker extends EventEmitter<PerformanceTrackerEvents> implements IPerformanceTracker {
    private config;
    private activeSessions;
    private performanceHistory;
    private operationStats;
    private baselines;
    private anomalies;
    private readonly cleanupInterval;
    constructor(config?: {
        retentionMs: number;
        baselineUpdateInterval: number;
    });
    /**
     * Start tracking performance for a cognitive operation
     */
    startTracking(operation: CognitiveOperation, context: PerformanceContext): TrackingSession;
    /**
     * Record checkpoint during operation execution
     */
    recordCheckpoint(sessionId: string, name: string, progress: number): boolean;
    /**
     * Record completion of tracked operation with metrics
     */
    recordCompletion(session: TrackingSession, result: OperationResult): PerformanceMetrics;
    /**
     * Get real-time performance statistics
     */
    getPerformanceStats(query: PerformanceQuery): PerformanceStats;
    /**
     * Detect performance anomalies in recent data
     */
    detectAnomalies(timeWindow?: number): PerformanceAnomaly[];
    /**
     * Get current active sessions
     */
    getActiveSessions(): TrackingSession[];
    /**
     * Get recent anomalies
     */
    getRecentAnomalies(limit?: number): PerformanceAnomaly[];
    /**
     * Get performance baseline for operation type
     */
    getBaseline(operationType: OperationType): PerformanceBaseline | undefined;
    /**
     * Force update baseline for operation type
     */
    updateBaseline(operationType: OperationType): PerformanceBaseline | null;
    /**
     * Clean up resources
     */
    dispose(): void;
    private getDefaultBudget;
    private generatePerformanceMetrics;
    private updateOperationStats;
    private checkForAnomalies;
    private detectLatencyAnomalies;
    private calculateLatencyDistribution;
    private percentile;
    private getRecentLatencies;
    private calculateCurrentThroughput;
    private matchesQuery;
    private calculateThroughputStats;
    private calculateErrorStats;
    private calculateTrends;
    private getTrend;
    private getThroughputTrend;
    private getErrorTrend;
    private getEmptyStats;
    private performMaintenance;
}
//# sourceMappingURL=performance-tracker.d.ts.map
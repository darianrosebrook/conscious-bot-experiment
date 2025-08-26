"use strict";
/**
 * Performance Tracker - High-precision performance monitoring
 *
 * Comprehensive latency and throughput monitoring system that tracks
 * performance across all cognitive modules with real-time analytics.
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceTracker = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
// Simple bounded history implementation for performance records
class BoundedHistory {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.items = [];
    }
    add(item) {
        this.items.push(item);
        if (this.items.length > this.maxSize) {
            this.items = this.items.slice(-this.maxSize);
        }
    }
    getAll() {
        return [...this.items];
    }
    clear() {
        this.items = [];
    }
}
const types_1 = require("./types");
/**
 * High-precision performance tracking system with real-time analytics
 */
class PerformanceTracker extends events_1.EventEmitter {
    constructor(config = {
        retentionMs: 24 * 60 * 60 * 1000, // 24 hours
        baselineUpdateInterval: 60 * 60 * 1000, // 1 hour
    }) {
        super();
        this.config = config;
        this.activeSessions = new Map();
        this.performanceHistory = new BoundedHistory(10000);
        this.operationStats = new Map();
        this.baselines = new Map();
        this.anomalies = [];
        // Start cleanup and baseline update timer
        this.cleanupInterval = setInterval(() => {
            this.performMaintenance();
        }, 60000); // Run every minute
    }
    /**
     * Start tracking performance for a cognitive operation
     */
    startTracking(operation, context) {
        const session = {
            id: (0, uuid_1.v4)(),
            operation,
            context,
            startTime: Date.now(),
            budget: this.getDefaultBudget(context),
            checkpoints: [],
            warnings: [],
            active: true,
        };
        (0, types_1.validateTrackingSession)(session);
        this.activeSessions.set(session.id, session);
        this.emit('session-started', session);
        return session;
    }
    /**
     * Record checkpoint during operation execution
     */
    recordCheckpoint(sessionId, name, progress) {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.active)
            return false;
        session.checkpoints.push({
            name,
            timestamp: Date.now(),
            progress: Math.min(1, Math.max(0, progress)),
        });
        // Check for performance warnings
        const elapsed = Date.now() - session.startTime;
        const expectedProgress = elapsed / session.budget;
        if (progress < expectedProgress * 0.7) {
            session.warnings.push(`Slow progress: ${Math.round(progress * 100)}% complete after ${elapsed}ms`);
        }
        return true;
    }
    /**
     * Record completion of tracked operation with metrics
     */
    recordCompletion(session, result) {
        if (!this.activeSessions.has(session.id)) {
            throw new Error(`Session ${session.id} not found or already completed`);
        }
        // Mark session as completed
        session.active = false;
        const completionTime = Date.now();
        const totalDuration = completionTime - session.startTime;
        // Generate performance metrics
        const metrics = this.generatePerformanceMetrics(session, result, totalDuration);
        (0, types_1.validatePerformanceMetrics)(metrics);
        // Store performance record
        const record = {
            session,
            result,
            metrics,
            timestamp: completionTime,
        };
        this.performanceHistory.add(record);
        this.updateOperationStats(session.operation, result, totalDuration);
        // Check for anomalies
        this.checkForAnomalies(session.operation, metrics);
        // Clean up active session
        this.activeSessions.delete(session.id);
        this.emit('session-completed', session, metrics);
        return metrics;
    }
    /**
     * Get real-time performance statistics
     */
    getPerformanceStats(query) {
        const now = Date.now();
        const timeRange = query.timeRange || {
            start: now - 60 * 60 * 1000, // Default: last hour
            end: now,
        };
        // Filter records by query criteria
        const records = this.performanceHistory
            .getAll()
            .filter((record) => this.matchesQuery(record, query, timeRange));
        if (records.length === 0) {
            return this.getEmptyStats(query, timeRange);
        }
        // Calculate statistics
        const latencies = records.map((r) => r.metrics.latency.mean);
        const latencyStats = this.calculateLatencyDistribution(latencies);
        const throughputData = this.calculateThroughputStats(records, timeRange);
        const errorData = this.calculateErrorStats(records);
        const trends = this.calculateTrends(records);
        return {
            operationType: query.operationType || types_1.OperationType.SIGNAL_PROCESSING,
            context: query.context || types_1.PerformanceContext.ROUTINE,
            timeRange,
            latency: latencyStats,
            throughput: throughputData,
            errors: errorData,
            trends,
        };
    }
    /**
     * Detect performance anomalies in recent data
     */
    detectAnomalies(timeWindow = 300000) {
        const now = Date.now();
        const recentRecords = this.performanceHistory
            .getAll()
            .filter((record) => record.timestamp > now - timeWindow);
        const newAnomalies = [];
        // Group by operation type
        const recordsByType = new Map();
        for (const record of recentRecords) {
            const type = record.session.operation.type;
            if (!recordsByType.has(type)) {
                recordsByType.set(type, []);
            }
            recordsByType.get(type).push(record);
        }
        // Check each operation type for anomalies
        for (const [operationType, records] of recordsByType) {
            const baseline = this.baselines.get(operationType);
            if (!baseline || records.length < 5)
                continue;
            const anomalies = this.detectLatencyAnomalies(operationType, records, baseline);
            newAnomalies.push(...anomalies);
        }
        // Store new anomalies
        for (const anomaly of newAnomalies) {
            this.anomalies.push(anomaly);
            this.emit('anomaly-detected', anomaly);
        }
        // Clean old anomalies (keep last 100)
        if (this.anomalies.length > 100) {
            this.anomalies = this.anomalies.slice(-100);
        }
        return newAnomalies;
    }
    /**
     * Get current active sessions
     */
    getActiveSessions() {
        return Array.from(this.activeSessions.values());
    }
    /**
     * Get recent anomalies
     */
    getRecentAnomalies(limit = 50) {
        return this.anomalies.slice(-limit);
    }
    /**
     * Get performance baseline for operation type
     */
    getBaseline(operationType) {
        return this.baselines.get(operationType);
    }
    /**
     * Force update baseline for operation type
     */
    updateBaseline(operationType) {
        const records = this.performanceHistory
            .getAll()
            .filter((record) => record.session.operation.type === operationType);
        if (records.length < 50)
            return null; // Need sufficient data
        const latencies = records.map((r) => r.metrics.latency.mean);
        const statistics = this.calculateLatencyDistribution(latencies);
        const baseline = {
            operationType,
            context: types_1.PerformanceContext.ROUTINE, // Default context
            timeWindow: {
                start: Math.min(...records.map((r) => r.timestamp)),
                end: Math.max(...records.map((r) => r.timestamp)),
            },
            statistics,
            sampleSize: records.length,
            confidence: Math.min(0.95, records.length / 1000), // Higher confidence with more samples
            lastUpdated: Date.now(),
        };
        this.baselines.set(operationType, baseline);
        this.emit('baseline-updated', baseline);
        return baseline;
    }
    /**
     * Clean up resources
     */
    dispose() {
        clearInterval(this.cleanupInterval);
        this.activeSessions.clear();
        this.removeAllListeners();
    }
    // ===== PRIVATE METHODS =====
    getDefaultBudget(context) {
        switch (context) {
            case types_1.PerformanceContext.EMERGENCY:
                return 50;
            case types_1.PerformanceContext.ROUTINE:
                return 200;
            case types_1.PerformanceContext.DELIBERATIVE:
                return 1000;
            default:
                return 200;
        }
    }
    generatePerformanceMetrics(session, result, duration) {
        // Get recent latencies for this operation type
        const recentLatencies = this.getRecentLatencies(session.operation.type, 100);
        const latency = this.calculateLatencyDistribution([
            ...recentLatencies,
            duration,
        ]);
        return {
            latency,
            throughput: {
                operationsPerSecond: this.calculateCurrentThroughput(session.operation.type),
                requestsProcessed: 1,
                requestsDropped: 0,
                queueDepth: this.activeSessions.size,
            },
            resources: {
                cpuUtilization: result.resourcesUsed.cpu / 100, // Normalize to 0-1
                memoryUsage: result.resourcesUsed.memory,
                gcPressure: 0, // Would be implemented with actual GC monitoring
                threadUtilization: 0.5, // Placeholder
            },
            quality: {
                successRate: result.success ? 1 : 0,
                errorRate: result.success ? 0 : 1,
                timeoutRate: duration > session.budget ? 1 : 0,
                retryRate: 0, // Would be tracked separately
            },
            timestamp: Date.now(),
        };
    }
    updateOperationStats(operation, result, duration) {
        const key = operation.type;
        const stats = this.operationStats.get(key) || {
            count: 0,
            latencies: [],
            errors: 0,
            totalDuration: 0,
            lastSeen: 0,
        };
        stats.count++;
        stats.latencies.push(duration);
        stats.totalDuration += duration;
        stats.lastSeen = Date.now();
        if (!result.success) {
            stats.errors++;
        }
        // Keep only recent latencies (last 1000)
        if (stats.latencies.length > 1000) {
            stats.latencies = stats.latencies.slice(-1000);
        }
        this.operationStats.set(key, stats);
    }
    checkForAnomalies(operation, metrics) {
        const baseline = this.baselines.get(operation.type);
        if (!baseline)
            return;
        const currentLatency = metrics.latency.mean;
        const baselineLatency = baseline.statistics.mean;
        const threshold = baselineLatency * 2; // 2x baseline is anomalous
        if (currentLatency > threshold) {
            const anomaly = {
                id: (0, uuid_1.v4)(),
                type: 'latency_spike',
                severity: currentLatency > threshold * 2 ? 'critical' : 'high',
                operationType: operation.type,
                detectedAt: Date.now(),
                duration: 0, // Single point anomaly
                metrics: {
                    baseline: baselineLatency,
                    observed: currentLatency,
                    deviation: (currentLatency - baselineLatency) / baselineLatency,
                    confidence: baseline.confidence,
                },
                possibleCauses: [
                    'System resource contention',
                    'Network latency spike',
                    'Code path inefficiency',
                    'External service slowdown',
                ],
                recommendedActions: [
                    'Check system resource usage',
                    'Review recent code changes',
                    'Monitor external dependencies',
                ],
                resolved: false,
            };
            this.anomalies.push(anomaly);
            this.emit('anomaly-detected', anomaly);
        }
    }
    detectLatencyAnomalies(operationType, records, baseline) {
        const anomalies = [];
        const latencies = records.map((r) => r.metrics.latency.mean);
        const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
        const threshold = baseline.statistics.mean * 1.5; // 50% above baseline
        if (avgLatency > threshold) {
            anomalies.push({
                id: (0, uuid_1.v4)(),
                type: 'latency_spike',
                severity: avgLatency > threshold * 2 ? 'critical' : 'high',
                operationType,
                detectedAt: Date.now(),
                duration: Math.max(...records.map((r) => r.timestamp)) -
                    Math.min(...records.map((r) => r.timestamp)),
                metrics: {
                    baseline: baseline.statistics.mean,
                    observed: avgLatency,
                    deviation: (avgLatency - baseline.statistics.mean) / baseline.statistics.mean,
                    confidence: baseline.confidence,
                },
                possibleCauses: ['System overload', 'Resource contention'],
                recommendedActions: ['Investigate system load', 'Consider degradation'],
                resolved: false,
            });
        }
        return anomalies;
    }
    calculateLatencyDistribution(latencies) {
        if (latencies.length === 0) {
            return {
                p50: 0,
                p95: 0,
                p99: 0,
                max: 0,
                mean: 0,
                stddev: 0,
                samples: 0,
            };
        }
        const sorted = [...latencies].sort((a, b) => a - b);
        const mean = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
        const variance = latencies.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) /
            latencies.length;
        return {
            p50: this.percentile(sorted, 50),
            p95: this.percentile(sorted, 95),
            p99: this.percentile(sorted, 99),
            max: Math.max(...latencies),
            mean,
            stddev: Math.sqrt(variance),
            samples: latencies.length,
        };
    }
    percentile(sortedArray, p) {
        if (sortedArray.length === 0)
            return 0;
        const index = Math.ceil((p / 100) * sortedArray.length) - 1;
        return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
    }
    getRecentLatencies(operationType, limit) {
        return this.performanceHistory
            .getAll()
            .filter((record) => record.session.operation.type === operationType)
            .slice(-limit)
            .map((record) => record.metrics.latency.mean);
    }
    calculateCurrentThroughput(operationType) {
        const now = Date.now();
        const windowMs = 60000; // 1 minute window
        const recentCount = this.performanceHistory
            .getAll()
            .filter((record) => record.session.operation.type === operationType &&
            record.timestamp > now - windowMs).length;
        return recentCount / (windowMs / 1000); // Operations per second
    }
    matchesQuery(record, query, timeRange) {
        if (record.timestamp < timeRange.start ||
            record.timestamp > timeRange.end) {
            return false;
        }
        if (query.operationType &&
            record.session.operation.type !== query.operationType) {
            return false;
        }
        if (query.context && record.session.context !== query.context) {
            return false;
        }
        if (query.module && record.session.operation.module !== query.module) {
            return false;
        }
        return true;
    }
    calculateThroughputStats(records, timeRange) {
        const durationSeconds = (timeRange.end - timeRange.start) / 1000;
        const operationsPerSecond = records.length / durationSeconds;
        // Calculate peak operations (highest minute)
        const minuteBuckets = new Map();
        for (const record of records) {
            const minute = Math.floor(record.timestamp / 60000);
            minuteBuckets.set(minute, (minuteBuckets.get(minute) || 0) + 1);
        }
        const peakOps = Math.max(0, ...Array.from(minuteBuckets.values())) / 60;
        return {
            operationsPerSecond,
            totalOperations: records.length,
            peakOps,
        };
    }
    calculateErrorStats(records) {
        const errors = records.filter((r) => !r.result.success);
        const errorRate = records.length > 0 ? errors.length / records.length : 0;
        // Count error types
        const errorTypes = new Map();
        for (const error of errors) {
            const errorType = error.result.errorCode || 'unknown';
            errorTypes.set(errorType, (errorTypes.get(errorType) || 0) + 1);
        }
        const topErrorTypes = Array.from(errorTypes.entries())
            .map(([type, count]) => ({
            type,
            count,
            percentage: count / records.length,
        }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        return {
            totalErrors: errors.length,
            errorRate,
            topErrorTypes,
        };
    }
    calculateTrends(records) {
        if (records.length < 10) {
            return {
                latencyTrend: 'stable',
                throughputTrend: 'stable',
                errorTrend: 'stable',
            };
        }
        // Split into first and second half to detect trends
        const midpoint = Math.floor(records.length / 2);
        const firstHalf = records.slice(0, midpoint);
        const secondHalf = records.slice(midpoint);
        const firstLatency = firstHalf.reduce((sum, r) => sum + r.metrics.latency.mean, 0) /
            firstHalf.length;
        const secondLatency = secondHalf.reduce((sum, r) => sum + r.metrics.latency.mean, 0) /
            secondHalf.length;
        const firstErrors = firstHalf.filter((r) => !r.result.success).length / firstHalf.length;
        const secondErrors = secondHalf.filter((r) => !r.result.success).length / secondHalf.length;
        return {
            latencyTrend: this.getTrend(firstLatency, secondLatency, 0.1),
            throughputTrend: this.getThroughputTrend(firstHalf.length, secondHalf.length, 0.1),
            errorTrend: this.getErrorTrend(firstErrors, secondErrors, 0.05),
        };
    }
    getTrend(first, second, threshold) {
        const change = (second - first) / first;
        if (Math.abs(change) < threshold) {
            return 'stable';
        }
        // For latency and errors, higher is worse
        if (change > threshold) {
            return 'degrading';
        }
        else {
            return 'improving';
        }
    }
    getThroughputTrend(first, second, threshold) {
        const change = (second - first) / first;
        if (Math.abs(change) < threshold) {
            return 'stable';
        }
        if (change > threshold) {
            return 'increasing';
        }
        else {
            return 'decreasing';
        }
    }
    getErrorTrend(first, second, threshold) {
        const change = (second - first) / first;
        if (Math.abs(change) < threshold) {
            return 'stable';
        }
        // For errors, higher is worse
        if (change > threshold) {
            return 'worsening';
        }
        else {
            return 'improving';
        }
    }
    getEmptyStats(query, timeRange) {
        return {
            operationType: query.operationType || types_1.OperationType.SIGNAL_PROCESSING,
            context: query.context || types_1.PerformanceContext.ROUTINE,
            timeRange,
            latency: {
                p50: 0,
                p95: 0,
                p99: 0,
                max: 0,
                mean: 0,
                stddev: 0,
                samples: 0,
            },
            throughput: {
                operationsPerSecond: 0,
                totalOperations: 0,
                peakOps: 0,
            },
            errors: {
                totalErrors: 0,
                errorRate: 0,
                topErrorTypes: [],
            },
            trends: {
                latencyTrend: 'stable',
                throughputTrend: 'stable',
                errorTrend: 'stable',
            },
        };
    }
    performMaintenance() {
        const now = Date.now();
        // Clean up stale active sessions (sessions active > 10 minutes)
        for (const [sessionId, session] of this.activeSessions) {
            if (now - session.startTime > 600000) {
                // 10 minutes
                session.warnings.push('Session timeout - marked as failed');
                session.active = false;
                this.activeSessions.delete(sessionId);
            }
        }
        // Update baselines for operation types with sufficient data
        for (const operationType of Object.values(types_1.OperationType)) {
            const lastUpdate = this.baselines.get(operationType)?.lastUpdated || 0;
            if (now - lastUpdate > this.config.baselineUpdateInterval) {
                this.updateBaseline(operationType);
            }
        }
        // Clean old anomalies
        this.anomalies = this.anomalies.filter((anomaly) => now - anomaly.detectedAt < 86400000 // Keep for 24 hours
        );
    }
}
exports.PerformanceTracker = PerformanceTracker;
//# sourceMappingURL=performance-tracker.js.map
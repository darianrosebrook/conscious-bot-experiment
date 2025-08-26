"use strict";
/**
 * Performance Monitor - Real-time budget enforcement and performance tracking
 *
 * Implements latency tracking, budget enforcement, and graceful degradation
 * for maintaining real-time constraints in the conscious bot.
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceMonitor = exports.TrackingSession = exports.DEFAULT_PERFORMANCE_CONFIG = void 0;
const events_1 = require("events");
const types_1 = require("./types");
/**
 * Default performance monitoring configuration
 */
exports.DEFAULT_PERFORMANCE_CONFIG = {
    budgets: {
        emergency: 50, // 50ms for emergency responses
        routine: 200, // 200ms for routine operations
        deliberative: 1000, // 1s for complex reasoning
    },
    monitoringInterval: 1000, // Monitor every second
    violationThreshold: 3, // 3 consecutive violations trigger action
    degradationEnabled: true,
    alertingEnabled: true,
    historySize: 1000,
};
/**
 * Performance tracking session for individual operations
 */
class TrackingSession {
    constructor(id, operation, budget) {
        this.id = id;
        this.operation = operation;
        this.budget = budget;
        this.checkpoints = new Map();
        this.startTime = performance.now();
        this.checkpoint('start');
    }
    /**
     * Record a checkpoint in the operation
     */
    checkpoint(name) {
        this.checkpoints.set(name, performance.now());
    }
    /**
     * Get elapsed time since start
     */
    getElapsed() {
        return performance.now() - this.startTime;
    }
    /**
     * Get time between checkpoints
     */
    getCheckpointDuration(from, to) {
        const fromTime = this.checkpoints.get(from);
        const toTime = this.checkpoints.get(to);
        if (!fromTime || !toTime) {
            throw new Error(`Checkpoint not found: ${from} or ${to}`);
        }
        return toTime - fromTime;
    }
    /**
     * Check if operation is within budget
     */
    isWithinBudget() {
        return this.getElapsed() <= this.budget.total;
    }
    /**
     * Get budget utilization percentage
     */
    getBudgetUtilization() {
        return this.getElapsed() / this.budget.total;
    }
    /**
     * Get all checkpoint timings
     */
    getCheckpoints() {
        const result = {};
        for (const [name, time] of this.checkpoints) {
            result[name] = time - this.startTime;
        }
        return result;
    }
}
exports.TrackingSession = TrackingSession;
/**
 * Latency statistics tracker
 */
class LatencyTracker {
    constructor() {
        this.measurements = new types_1.BoundedHistory(1000);
    }
    record(latency) {
        this.measurements.add(latency);
    }
    getStatistics() {
        const recent = this.measurements.getRecent(this.measurements.size())
            .map(item => item.value)
            .sort((a, b) => a - b);
        if (recent.length === 0) {
            return { p50: 0, p95: 0, p99: 0, max: 0, mean: 0, count: 0 };
        }
        const p50Index = Math.floor(recent.length * 0.5);
        const p95Index = Math.floor(recent.length * 0.95);
        const p99Index = Math.floor(recent.length * 0.99);
        const sum = recent.reduce((a, b) => a + b, 0);
        return {
            p50: recent[p50Index] || 0,
            p95: recent[p95Index] || 0,
            p99: recent[p99Index] || 0,
            max: recent[recent.length - 1] || 0,
            mean: sum / recent.length,
            count: recent.length,
        };
    }
}
/**
 * Real-time performance monitor that tracks latency, enforces budgets,
 * and triggers degradation when performance constraints are violated.
 */
class PerformanceMonitor extends events_1.EventEmitter {
    constructor(config = exports.DEFAULT_PERFORMANCE_CONFIG) {
        super();
        this.config = config;
        this.activeSessions = new Map();
        this.latencyTrackers = new Map();
        this.consecutiveViolations = 0;
        this.currentDegradation = types_1.DegradationLevel.NONE;
        this.operationCounter = 0;
        this.startMonitoring();
    }
    /**
     * Start tracking performance for a cognitive operation
     *
     * @param operation - Operation being tracked
     * @param context - Context that affects performance expectations
     * @returns Tracking session for this operation
     */
    startTracking(operation, context = 'routine') {
        const sessionId = `session_${++this.operationCounter}_${Date.now()}`;
        // Determine appropriate budget
        const budgetTotal = this.config.budgets[context];
        const budget = {
            context,
            total: budgetTotal,
            allocated: 0,
            remaining: budgetTotal,
            breakdown: {
                signalProcessing: budgetTotal * 0.2,
                routing: budgetTotal * 0.1,
                execution: budgetTotal * 0.7,
            }
        };
        const session = new TrackingSession(sessionId, operation, budget);
        this.activeSessions.set(sessionId, session);
        return session;
    }
    /**
     * Record completion of tracked operation with metrics
     *
     * @param session - Active tracking session
     * @param success - Whether operation completed successfully
     * @returns Performance metrics for this execution
     */
    recordCompletion(session, success = true) {
        session.checkpoint('completion');
        const elapsed = session.getElapsed();
        const operationType = session.operation.type;
        // Get or create latency tracker for this operation type
        if (!this.latencyTrackers.has(operationType)) {
            this.latencyTrackers.set(operationType, new LatencyTracker());
        }
        const tracker = this.latencyTrackers.get(operationType);
        tracker.record(elapsed);
        // Check for budget violations
        if (!session.isWithinBudget()) {
            this.handleBudgetViolation(session);
        }
        else {
            // Reset consecutive violations on success
            this.consecutiveViolations = 0;
        }
        // Remove from active sessions
        this.activeSessions.delete(session.id);
        // Generate metrics
        const metrics = this.generateCurrentMetrics();
        this.emit('performance-update', metrics);
        return metrics;
    }
    /**
     * Handle budget violation
     */
    handleBudgetViolation(session) {
        this.consecutiveViolations++;
        const violation = {
            type: 'budget_exceeded',
            severity: this.consecutiveViolations >= this.config.violationThreshold ? 'high' : 'medium',
            description: `Operation ${session.operation.type} exceeded budget: ${session.getElapsed()}ms > ${session.budget.total}ms`,
            timestamp: Date.now(),
            context: {
                operationType: session.operation.type,
                budgetExceeded: session.getElapsed() - session.budget.total,
                consecutiveViolations: this.consecutiveViolations,
            },
            suggestedAction: this.consecutiveViolations >= this.config.violationThreshold ? 'trigger_degradation' : 'monitor',
        };
        this.emit('safety-violation', violation);
        // Trigger degradation if threshold exceeded
        if (this.config.degradationEnabled && this.consecutiveViolations >= this.config.violationThreshold) {
            this.triggerDegradation();
        }
    }
    /**
     * Trigger performance degradation
     */
    triggerDegradation() {
        if (this.currentDegradation >= types_1.DegradationLevel.SEVERE) {
            return; // Already severely degraded
        }
        const newLevel = Math.min(this.currentDegradation + 1, types_1.DegradationLevel.SEVERE);
        this.currentDegradation = newLevel;
        console.warn(`Performance degradation triggered: Level ${newLevel}`);
        this.emit('degradation-changed', newLevel);
    }
    /**
     * Attempt to recover from degradation
     */
    attemptRecovery() {
        if (this.currentDegradation === types_1.DegradationLevel.NONE) {
            return; // Not degraded
        }
        // Check if performance has improved
        const currentMetrics = this.generateCurrentMetrics();
        const recentP95 = currentMetrics.latency.p95;
        // Simple recovery logic - improve if p95 latency is reasonable
        const shouldRecover = recentP95 < this.config.budgets.routine * 0.8; // 80% of routine budget
        if (shouldRecover) {
            this.currentDegradation = Math.max(this.currentDegradation - 1, types_1.DegradationLevel.NONE);
            this.consecutiveViolations = 0;
            console.info(`Performance recovery: Level ${this.currentDegradation}`);
            this.emit('degradation-changed', this.currentDegradation);
        }
    }
    /**
     * Get current performance statistics
     */
    getCurrentMetrics() {
        return this.generateCurrentMetrics();
    }
    /**
     * Generate comprehensive performance metrics
     */
    generateCurrentMetrics() {
        // Aggregate latency stats from all operation types
        const allStats = Array.from(this.latencyTrackers.values()).map(tracker => tracker.getStatistics());
        if (allStats.length === 0) {
            return {
                latency: { p50: 0, p95: 0, p99: 0, max: 0, mean: 0 },
                throughput: { operationsPerSecond: 0, queueDepth: this.activeSessions.size },
                resources: { cpuUtilization: 0, memoryUsage: 0 },
                quality: { successRate: 1, errorRate: 0 },
            };
        }
        // Calculate weighted averages
        const totalCount = allStats.reduce((sum, stats) => sum + stats.count, 0);
        const weightedLatency = allStats.reduce((acc, stats) => {
            const weight = stats.count / totalCount;
            return {
                p50: acc.p50 + stats.p50 * weight,
                p95: acc.p95 + stats.p95 * weight,
                p99: acc.p99 + stats.p99 * weight,
                max: Math.max(acc.max, stats.max),
                mean: acc.mean + stats.mean * weight,
            };
        }, { p50: 0, p95: 0, p99: 0, max: 0, mean: 0 });
        // Calculate throughput (simplified)
        const opsPerSecond = totalCount / Math.max(1, this.getUptimeSeconds());
        return {
            latency: weightedLatency,
            throughput: {
                operationsPerSecond: opsPerSecond,
                queueDepth: this.activeSessions.size,
            },
            resources: {
                cpuUtilization: 0.5, // Simplified: avoid circular dependency for now
                memoryUsage: this.estimateMemoryUsage(),
            },
            quality: {
                successRate: this.calculateSuccessRate(),
                errorRate: this.consecutiveViolations / Math.max(1, this.operationCounter),
            },
        };
    }
    /**
     * Get current degradation level
     */
    getDegradationLevel() {
        return this.currentDegradation;
    }
    /**
     * Check if system is within performance budgets
     */
    isWithinBudgets() {
        const metrics = this.getCurrentMetrics();
        return metrics.latency.p95 <= this.config.budgets.routine;
    }
    /**
     * Get active tracking sessions
     */
    getActiveSessions() {
        return Array.from(this.activeSessions.values());
    }
    /**
     * Start periodic monitoring
     */
    startMonitoring() {
        this.monitoringTimer = setInterval(() => {
            this.performPeriodicCheck();
        }, this.config.monitoringInterval);
    }
    /**
     * Perform periodic health checks
     */
    performPeriodicCheck() {
        // Attempt recovery if degraded
        if (this.currentDegradation > types_1.DegradationLevel.NONE) {
            this.attemptRecovery();
        }
        // Check for stalled sessions
        const now = performance.now();
        for (const [sessionId, session] of this.activeSessions) {
            if (session.getElapsed() > session.budget.total * 2) {
                console.warn(`Session ${sessionId} appears stalled (${session.getElapsed()}ms)`);
                // Could emit timeout event here
            }
        }
        // Emit periodic metrics update
        const metrics = this.generateCurrentMetrics();
        this.emit('performance-update', metrics);
    }
    /**
     * Estimate CPU utilization (simplified)
     */
    estimateCpuUtilization() {
        // Simple heuristic based on active sessions and recent latency
        const activeSessions = this.activeSessions.size;
        const metrics = this.generateCurrentMetrics();
        // Higher utilization if many active sessions or high latency
        const sessionLoad = Math.min(activeSessions / 10, 1); // Normalize to 0-1
        const latencyLoad = Math.min(metrics.latency.p95 / this.config.budgets.routine, 1);
        return Math.max(sessionLoad, latencyLoad) * 0.8; // Cap at 80%
    }
    /**
     * Estimate memory usage (simplified)
     */
    estimateMemoryUsage() {
        // Simple estimation based on session count and history size
        const sessionMemory = this.activeSessions.size * 0.1; // 0.1MB per session
        const historyMemory = this.config.historySize * 0.001; // 1KB per history item
        return sessionMemory + historyMemory;
    }
    /**
     * Calculate success rate
     */
    calculateSuccessRate() {
        if (this.operationCounter === 0)
            return 1;
        // Success rate based on budget violations
        const violationRate = this.consecutiveViolations / this.operationCounter;
        return Math.max(0, 1 - violationRate);
    }
    /**
     * Get uptime in seconds
     */
    getUptimeSeconds() {
        return process.uptime();
    }
    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
    /**
     * Stop monitoring and cleanup
     */
    stop() {
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = undefined;
        }
        this.removeAllListeners();
    }
    /**
     * Reset all statistics
     */
    reset() {
        this.latencyTrackers.clear();
        this.activeSessions.clear();
        this.consecutiveViolations = 0;
        this.currentDegradation = types_1.DegradationLevel.NONE;
        this.operationCounter = 0;
    }
    /**
     * Get performance statistics summary
     */
    getStatistics() {
        return {
            totalOperations: this.operationCounter,
            consecutiveViolations: this.consecutiveViolations,
            currentDegradation: this.currentDegradation,
            activeSessions: this.activeSessions.size,
            uptimeSeconds: this.getUptimeSeconds(),
        };
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
//# sourceMappingURL=performance-monitor.js.map
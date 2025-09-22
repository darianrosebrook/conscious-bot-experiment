"use strict";
/**
 * Performance Tracker - High-precision performance monitoring
 *
 * Comprehensive latency and throughput monitoring system that tracks
 * performance across all cognitive modules with real-time analytics.
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
exports.PerformanceTracker = void 0;
var events_1 = require("events");
var uuid_1 = require("uuid");
// Simple bounded history implementation for performance records
var BoundedHistory = /** @class */ (function () {
    function BoundedHistory(maxSize) {
        this.maxSize = maxSize;
        this.items = [];
    }
    BoundedHistory.prototype.add = function (item) {
        this.items.push(item);
        if (this.items.length > this.maxSize) {
            this.items = this.items.slice(-this.maxSize);
        }
    };
    BoundedHistory.prototype.getAll = function () {
        return __spreadArray([], this.items, true);
    };
    BoundedHistory.prototype.clear = function () {
        this.items = [];
    };
    return BoundedHistory;
}());
var types_1 = require("./types");
/**
 * High-precision performance tracking system with real-time analytics
 */
var PerformanceTracker = /** @class */ (function (_super) {
    __extends(PerformanceTracker, _super);
    function PerformanceTracker(config) {
        if (config === void 0) { config = {
            retentionMs: 24 * 60 * 60 * 1000, // 24 hours
            baselineUpdateInterval: 60 * 60 * 1000, // 1 hour
        }; }
        var _this = _super.call(this) || this;
        _this.config = config;
        _this.activeSessions = new Map();
        _this.performanceHistory = new BoundedHistory(10000);
        _this.operationStats = new Map();
        _this.baselines = new Map();
        _this.anomalies = [];
        // Start cleanup and baseline update timer
        _this.cleanupInterval = setInterval(function () {
            _this.performMaintenance();
        }, 60000); // Run every minute
        return _this;
    }
    /**
     * Start tracking performance for a cognitive operation
     */
    PerformanceTracker.prototype.startTracking = function (operation, context) {
        var session = {
            id: (0, uuid_1.v4)(),
            operation: operation,
            context: context,
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
    };
    /**
     * Record checkpoint during operation execution
     */
    PerformanceTracker.prototype.recordCheckpoint = function (sessionId, name, progress) {
        var session = this.activeSessions.get(sessionId);
        if (!session || !session.active)
            return false;
        session.checkpoints.push({
            name: name,
            timestamp: Date.now(),
            progress: Math.min(1, Math.max(0, progress)),
        });
        // Check for performance warnings
        var elapsed = Date.now() - session.startTime;
        var expectedProgress = elapsed / session.budget;
        if (progress < expectedProgress * 0.7) {
            session.warnings.push("Slow progress: ".concat(Math.round(progress * 100), "% complete after ").concat(elapsed, "ms"));
        }
        return true;
    };
    /**
     * Record completion of tracked operation with metrics
     */
    PerformanceTracker.prototype.recordCompletion = function (session, result) {
        if (!this.activeSessions.has(session.id)) {
            throw new Error("Session ".concat(session.id, " not found or already completed"));
        }
        // Mark session as completed
        session.active = false;
        var completionTime = Date.now();
        var totalDuration = completionTime - session.startTime;
        // Generate performance metrics
        var metrics = this.generatePerformanceMetrics(session, result, totalDuration);
        (0, types_1.validatePerformanceMetrics)(metrics);
        // Store performance record
        var record = {
            session: session,
            result: result,
            metrics: metrics,
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
    };
    /**
     * Get real-time performance statistics
     */
    PerformanceTracker.prototype.getPerformanceStats = function (query) {
        var _this = this;
        var now = Date.now();
        var timeRange = query.timeRange || {
            start: now - 60 * 60 * 1000, // Default: last hour
            end: now,
        };
        // Filter records by query criteria
        var records = this.performanceHistory
            .getAll()
            .filter(function (record) { return _this.matchesQuery(record, query, timeRange); });
        if (records.length === 0) {
            return this.getEmptyStats(query, timeRange);
        }
        // Calculate statistics
        var latencies = records.map(function (r) { return r.metrics.latency.mean; });
        var latencyStats = this.calculateLatencyDistribution(latencies);
        var throughputData = this.calculateThroughputStats(records, timeRange);
        var errorData = this.calculateErrorStats(records);
        var trends = this.calculateTrends(records);
        return {
            operationType: query.operationType || types_1.OperationType.SIGNAL_PROCESSING,
            context: query.context || types_1.PerformanceContext.ROUTINE,
            timeRange: timeRange,
            latency: latencyStats,
            throughput: throughputData,
            errors: errorData,
            trends: trends,
        };
    };
    /**
     * Detect performance anomalies in recent data
     */
    PerformanceTracker.prototype.detectAnomalies = function (timeWindow) {
        if (timeWindow === void 0) { timeWindow = 300000; }
        var now = Date.now();
        var recentRecords = this.performanceHistory
            .getAll()
            .filter(function (record) { return record.timestamp > now - timeWindow; });
        var newAnomalies = [];
        // Group by operation type
        var recordsByType = new Map();
        for (var _i = 0, recentRecords_1 = recentRecords; _i < recentRecords_1.length; _i++) {
            var record = recentRecords_1[_i];
            var type = record.session.operation.type;
            if (!recordsByType.has(type)) {
                recordsByType.set(type, []);
            }
            recordsByType.get(type).push(record);
        }
        // Check each operation type for anomalies
        for (var _a = 0, recordsByType_1 = recordsByType; _a < recordsByType_1.length; _a++) {
            var _b = recordsByType_1[_a], operationType = _b[0], records = _b[1];
            var baseline = this.baselines.get(operationType);
            if (!baseline || records.length < 5)
                continue;
            var anomalies = this.detectLatencyAnomalies(operationType, records, baseline);
            newAnomalies.push.apply(newAnomalies, anomalies);
        }
        // Store new anomalies
        for (var _c = 0, newAnomalies_1 = newAnomalies; _c < newAnomalies_1.length; _c++) {
            var anomaly = newAnomalies_1[_c];
            this.anomalies.push(anomaly);
            this.emit('anomaly-detected', anomaly);
        }
        // Clean old anomalies (keep last 100)
        if (this.anomalies.length > 100) {
            this.anomalies = this.anomalies.slice(-100);
        }
        return newAnomalies;
    };
    /**
     * Get current active sessions
     */
    PerformanceTracker.prototype.getActiveSessions = function () {
        return Array.from(this.activeSessions.values());
    };
    /**
     * Get recent anomalies
     */
    PerformanceTracker.prototype.getRecentAnomalies = function (limit) {
        if (limit === void 0) { limit = 50; }
        return this.anomalies.slice(-limit);
    };
    /**
     * Get performance baseline for operation type
     */
    PerformanceTracker.prototype.getBaseline = function (operationType) {
        return this.baselines.get(operationType);
    };
    /**
     * Force update baseline for operation type
     */
    PerformanceTracker.prototype.updateBaseline = function (operationType) {
        var records = this.performanceHistory
            .getAll()
            .filter(function (record) { return record.session.operation.type === operationType; });
        if (records.length < 50)
            return null; // Need sufficient data
        var latencies = records.map(function (r) { return r.metrics.latency.mean; });
        var statistics = this.calculateLatencyDistribution(latencies);
        var baseline = {
            operationType: operationType,
            context: types_1.PerformanceContext.ROUTINE, // Default context
            timeWindow: {
                start: Math.min.apply(Math, records.map(function (r) { return r.timestamp; })),
                end: Math.max.apply(Math, records.map(function (r) { return r.timestamp; })),
            },
            statistics: statistics,
            sampleSize: records.length,
            confidence: Math.min(0.95, records.length / 1000), // Higher confidence with more samples
            lastUpdated: Date.now(),
        };
        this.baselines.set(operationType, baseline);
        this.emit('baseline-updated', baseline);
        return baseline;
    };
    /**
     * Clean up resources
     */
    PerformanceTracker.prototype.dispose = function () {
        clearInterval(this.cleanupInterval);
        this.activeSessions.clear();
        this.removeAllListeners();
    };
    // ===== PRIVATE METHODS =====
    PerformanceTracker.prototype.getDefaultBudget = function (context) {
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
    };
    PerformanceTracker.prototype.generatePerformanceMetrics = function (session, result, duration) {
        // Get recent latencies for this operation type
        var recentLatencies = this.getRecentLatencies(session.operation.type, 100);
        var latency = this.calculateLatencyDistribution(__spreadArray(__spreadArray([], recentLatencies, true), [
            duration,
        ], false));
        return {
            latency: latency,
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
    };
    PerformanceTracker.prototype.updateOperationStats = function (operation, result, duration) {
        var key = operation.type;
        var stats = this.operationStats.get(key) || {
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
    };
    PerformanceTracker.prototype.checkForAnomalies = function (operation, metrics) {
        var baseline = this.baselines.get(operation.type);
        if (!baseline)
            return;
        var currentLatency = metrics.latency.mean;
        var baselineLatency = baseline.statistics.mean;
        var threshold = baselineLatency * 2; // 2x baseline is anomalous
        if (currentLatency > threshold) {
            var anomaly = {
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
    };
    PerformanceTracker.prototype.detectLatencyAnomalies = function (operationType, records, baseline) {
        var anomalies = [];
        var latencies = records.map(function (r) { return r.metrics.latency.mean; });
        var avgLatency = latencies.reduce(function (sum, l) { return sum + l; }, 0) / latencies.length;
        var threshold = baseline.statistics.mean * 1.5; // 50% above baseline
        if (avgLatency > threshold) {
            anomalies.push({
                id: (0, uuid_1.v4)(),
                type: 'latency_spike',
                severity: avgLatency > threshold * 2 ? 'critical' : 'high',
                operationType: operationType,
                detectedAt: Date.now(),
                duration: Math.max.apply(Math, records.map(function (r) { return r.timestamp; })) - Math.min.apply(Math, records.map(function (r) { return r.timestamp; })),
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
    };
    PerformanceTracker.prototype.calculateLatencyDistribution = function (latencies) {
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
        var sorted = __spreadArray([], latencies, true).sort(function (a, b) { return a - b; });
        var mean = latencies.reduce(function (sum, l) { return sum + l; }, 0) / latencies.length;
        var variance = latencies.reduce(function (sum, l) { return sum + Math.pow(l - mean, 2); }, 0) /
            latencies.length;
        return {
            p50: this.percentile(sorted, 50),
            p95: this.percentile(sorted, 95),
            p99: this.percentile(sorted, 99),
            max: Math.max.apply(Math, latencies),
            mean: mean,
            stddev: Math.sqrt(variance),
            samples: latencies.length,
        };
    };
    PerformanceTracker.prototype.percentile = function (sortedArray, p) {
        if (sortedArray.length === 0)
            return 0;
        var index = Math.ceil((p / 100) * sortedArray.length) - 1;
        return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
    };
    PerformanceTracker.prototype.getRecentLatencies = function (operationType, limit) {
        return this.performanceHistory
            .getAll()
            .filter(function (record) { return record.session.operation.type === operationType; })
            .slice(-limit)
            .map(function (record) { return record.metrics.latency.mean; });
    };
    PerformanceTracker.prototype.calculateCurrentThroughput = function (operationType) {
        var now = Date.now();
        var windowMs = 60000; // 1 minute window
        var recentCount = this.performanceHistory
            .getAll()
            .filter(function (record) {
            return record.session.operation.type === operationType &&
                record.timestamp > now - windowMs;
        }).length;
        return recentCount / (windowMs / 1000); // Operations per second
    };
    PerformanceTracker.prototype.matchesQuery = function (record, query, timeRange) {
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
    };
    PerformanceTracker.prototype.calculateThroughputStats = function (records, timeRange) {
        var durationSeconds = (timeRange.end - timeRange.start) / 1000;
        var operationsPerSecond = records.length / durationSeconds;
        // Calculate peak operations (highest minute)
        var minuteBuckets = new Map();
        for (var _i = 0, records_1 = records; _i < records_1.length; _i++) {
            var record = records_1[_i];
            var minute = Math.floor(record.timestamp / 60000);
            minuteBuckets.set(minute, (minuteBuckets.get(minute) || 0) + 1);
        }
        var peakOps = Math.max.apply(Math, __spreadArray([0], Array.from(minuteBuckets.values()), false)) / 60;
        return {
            operationsPerSecond: operationsPerSecond,
            totalOperations: records.length,
            peakOps: peakOps,
        };
    };
    PerformanceTracker.prototype.calculateErrorStats = function (records) {
        var errors = records.filter(function (r) { return !r.result.success; });
        var errorRate = records.length > 0 ? errors.length / records.length : 0;
        // Count error types
        var errorTypes = new Map();
        for (var _i = 0, errors_1 = errors; _i < errors_1.length; _i++) {
            var error = errors_1[_i];
            var errorType = error.result.errorCode || 'unknown';
            errorTypes.set(errorType, (errorTypes.get(errorType) || 0) + 1);
        }
        var topErrorTypes = Array.from(errorTypes.entries())
            .map(function (_a) {
            var type = _a[0], count = _a[1];
            return ({
                type: type,
                count: count,
                percentage: count / records.length,
            });
        })
            .sort(function (a, b) { return b.count - a.count; })
            .slice(0, 5);
        return {
            totalErrors: errors.length,
            errorRate: errorRate,
            topErrorTypes: topErrorTypes,
        };
    };
    PerformanceTracker.prototype.calculateTrends = function (records) {
        if (records.length < 10) {
            return {
                latencyTrend: 'stable',
                throughputTrend: 'stable',
                errorTrend: 'stable',
            };
        }
        // Split into first and second half to detect trends
        var midpoint = Math.floor(records.length / 2);
        var firstHalf = records.slice(0, midpoint);
        var secondHalf = records.slice(midpoint);
        var firstLatency = firstHalf.reduce(function (sum, r) { return sum + r.metrics.latency.mean; }, 0) /
            firstHalf.length;
        var secondLatency = secondHalf.reduce(function (sum, r) { return sum + r.metrics.latency.mean; }, 0) /
            secondHalf.length;
        var firstErrors = firstHalf.filter(function (r) { return !r.result.success; }).length / firstHalf.length;
        var secondErrors = secondHalf.filter(function (r) { return !r.result.success; }).length / secondHalf.length;
        return {
            latencyTrend: this.getTrend(firstLatency, secondLatency, 0.1),
            throughputTrend: this.getThroughputTrend(firstHalf.length, secondHalf.length, 0.1),
            errorTrend: this.getErrorTrend(firstErrors, secondErrors, 0.05),
        };
    };
    PerformanceTracker.prototype.getTrend = function (first, second, threshold) {
        var change = (second - first) / first;
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
    };
    PerformanceTracker.prototype.getThroughputTrend = function (first, second, threshold) {
        var change = (second - first) / first;
        if (Math.abs(change) < threshold) {
            return 'stable';
        }
        if (change > threshold) {
            return 'increasing';
        }
        else {
            return 'decreasing';
        }
    };
    PerformanceTracker.prototype.getErrorTrend = function (first, second, threshold) {
        var change = (second - first) / first;
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
    };
    PerformanceTracker.prototype.getEmptyStats = function (query, timeRange) {
        return {
            operationType: query.operationType || types_1.OperationType.SIGNAL_PROCESSING,
            context: query.context || types_1.PerformanceContext.ROUTINE,
            timeRange: timeRange,
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
    };
    PerformanceTracker.prototype.performMaintenance = function () {
        var _a;
        var now = Date.now();
        // Clean up stale active sessions (sessions active > 10 minutes)
        for (var _i = 0, _b = this.activeSessions; _i < _b.length; _i++) {
            var _c = _b[_i], sessionId = _c[0], session = _c[1];
            if (now - session.startTime > 600000) {
                // 10 minutes
                session.warnings.push('Session timeout - marked as failed');
                session.active = false;
                this.activeSessions.delete(sessionId);
            }
        }
        // Update baselines for operation types with sufficient data
        for (var _d = 0, _e = Object.values(types_1.OperationType); _d < _e.length; _d++) {
            var operationType = _e[_d];
            var lastUpdate = ((_a = this.baselines.get(operationType)) === null || _a === void 0 ? void 0 : _a.lastUpdated) || 0;
            if (now - lastUpdate > this.config.baselineUpdateInterval) {
                this.updateBaseline(operationType);
            }
        }
        // Clean old anomalies
        this.anomalies = this.anomalies.filter(function (anomaly) { return now - anomaly.detectedAt < 86400000; } // Keep for 24 hours
        );
    };
    return PerformanceTracker;
}(events_1.EventEmitter));
exports.PerformanceTracker = PerformanceTracker;

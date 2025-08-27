"use strict";
/**
 * Task Timeframe Management - Bucket-based time management with trailers and explainable selection
 *
 * Implements bucket-based time management (Tactical, Short, Standard, Long, Expedition) with caps,
 * checkpoints, pause/resume tickets, and explainable bucket selection with decision traces.
 *
 * @author @darianrosebrook
 */
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
exports.TaskTimeframeManager = exports.DEFAULT_TIME_BUCKETS = void 0;
var node_perf_hooks_1 = require("node:perf_hooks");
/**
 * Default time bucket configurations
 */
exports.DEFAULT_TIME_BUCKETS = {
    tactical: {
        name: 'tactical',
        maxDurationMs: 30000, // 30 seconds
        checkpointIntervalMs: 5000, // 5 seconds
        description: 'Quick tactical decisions and immediate responses',
        priority: 5,
    },
    short: {
        name: 'short',
        maxDurationMs: 300000, // 5 minutes
        checkpointIntervalMs: 30000, // 30 seconds
        description: 'Short-term planning and execution',
        priority: 4,
    },
    standard: {
        name: 'standard',
        maxDurationMs: 1800000, // 30 minutes
        checkpointIntervalMs: 120000, // 2 minutes
        description: 'Standard task execution and planning',
        priority: 3,
    },
    long: {
        name: 'long',
        maxDurationMs: 7200000, // 2 hours
        checkpointIntervalMs: 600000, // 10 minutes
        description: 'Long-term projects and complex operations',
        priority: 2,
    },
    expedition: {
        name: 'expedition',
        maxDurationMs: 86400000, // 24 hours
        checkpointIntervalMs: 3600000, // 1 hour
        description: 'Extended expeditions and major undertakings',
        priority: 1,
    },
};
// ============================================================================
// Task Timeframe Manager
// ============================================================================
/**
 * Task timeframe manager with bucket-based time management
 */
var TaskTimeframeManager = /** @class */ (function () {
    function TaskTimeframeManager(bucketConfigs) {
        this.bucketConfigs = bucketConfigs || exports.DEFAULT_TIME_BUCKETS;
        this.activeTasks = new Map();
        this.resumeTickets = new Map();
        this.bucketTraces = new Map();
        this.bucketTrailers = new Map();
    }
    // ============================================================================
    // Bucket Selection (S5.2)
    // ============================================================================
    /**
     * Select appropriate time bucket for a task with explainable reasoning
     */
    TaskTimeframeManager.prototype.selectBucket = function (taskId, criteria) {
        var _this = this;
        var alternatives = [];
        var reasoning = [];
        var constraints = criteria.constraints || {};
        // Start with all available buckets
        var availableBuckets = Object.keys(this.bucketConfigs);
        // Apply constraints
        if (constraints.requiredBucket) {
            availableBuckets = [constraints.requiredBucket];
            reasoning.push("Required bucket constraint: ".concat(constraints.requiredBucket));
        }
        if (constraints.excludedBuckets) {
            availableBuckets = availableBuckets.filter(function (bucket) { return !constraints.excludedBuckets.includes(bucket); });
            reasoning.push("Excluded buckets: ".concat(constraints.excludedBuckets.join(', ')));
        }
        // Filter by duration constraints
        var durationFiltered = availableBuckets.filter(function (bucket) {
            return _this.bucketConfigs[bucket].maxDurationMs >= criteria.estimatedDurationMs;
        });
        if (durationFiltered.length === 0) {
            reasoning.push("No buckets can accommodate estimated duration: ".concat(criteria.estimatedDurationMs, "ms"));
            // Select the longest available bucket as fallback
            var fallbackBucket = availableBuckets.reduce(function (a, b) {
                return _this.bucketConfigs[a].maxDurationMs >
                    _this.bucketConfigs[b].maxDurationMs
                    ? a
                    : b;
            });
            reasoning.push("Using fallback bucket: ".concat(fallbackBucket));
            availableBuckets = [fallbackBucket];
        }
        else {
            availableBuckets = durationFiltered;
            reasoning.push("Duration-appropriate buckets: ".concat(availableBuckets.join(', ')));
        }
        // Apply priority constraints
        var priorityFiltered = availableBuckets.filter(function (bucket) { return _this.bucketConfigs[bucket].priority >= criteria.priority; });
        if (priorityFiltered.length === 0) {
            reasoning.push("No buckets meet priority requirement: ".concat(criteria.priority));
            // Select highest priority available bucket as fallback
            var fallbackBucket = availableBuckets.reduce(function (a, b) {
                return _this.bucketConfigs[a].priority > _this.bucketConfigs[b].priority ? a : b;
            });
            reasoning.push("Using fallback bucket: ".concat(fallbackBucket));
            availableBuckets = [fallbackBucket];
        }
        else {
            availableBuckets = priorityFiltered;
            reasoning.push("Priority-appropriate buckets: ".concat(availableBuckets.join(', ')));
        }
        // Select the most appropriate bucket based on complexity and resource requirements
        var selectedBucket;
        if (availableBuckets.length === 1) {
            selectedBucket = availableBuckets[0];
            reasoning.push("Single available bucket: ".concat(selectedBucket));
        }
        else {
            // Score buckets based on complexity and resource requirements
            var bucketScores = availableBuckets.map(function (bucket) {
                var config = _this.bucketConfigs[bucket];
                var score = config.priority;
                // Prefer buckets that match complexity level
                if (criteria.complexity > 3 && bucket === 'expedition')
                    score += 2;
                if (criteria.complexity <= 2 && bucket === 'tactical')
                    score += 2;
                // Prefer buckets with appropriate duration (not too much overhead)
                var durationRatio = criteria.estimatedDurationMs / config.maxDurationMs;
                if (durationRatio > 0.5 && durationRatio < 0.8)
                    score += 1;
                return { bucket: bucket, score: score };
            });
            bucketScores.sort(function (a, b) { return b.score - a.score; });
            selectedBucket = bucketScores[0].bucket;
            reasoning.push("Selected ".concat(selectedBucket, " based on complexity and resource requirements"));
        }
        // Create trace
        var trace = {
            taskId: taskId,
            selectedBucket: selectedBucket,
            alternatives: availableBuckets,
            reasoning: reasoning,
            constraints: {
                maxDuration: constraints.maxDuration,
                requiredPriority: criteria.priority,
                availableBuckets: availableBuckets,
            },
            timestamp: Date.now(),
            metadata: {
                estimatedDuration: criteria.estimatedDurationMs,
                complexity: criteria.complexity,
                resourceRequirements: criteria.resourceRequirements,
            },
        };
        // Store trace
        var traces = this.bucketTraces.get(taskId) || [];
        traces.push(trace);
        this.bucketTraces.set(taskId, traces);
        return { bucket: selectedBucket, trace: trace };
    };
    // ============================================================================
    // Task Execution Management
    // ============================================================================
    /**
     * Start a task in a specific bucket
     */
    TaskTimeframeManager.prototype.startTask = function (taskId, bucketName, metadata) {
        var config = this.bucketConfigs[bucketName];
        if (!config) {
            throw new Error("Unknown bucket: ".concat(bucketName));
        }
        var state = {
            taskId: taskId,
            bucketName: bucketName,
            startTime: node_perf_hooks_1.performance.now(),
            elapsedMs: 0,
            checkpoints: [],
            status: 'running',
            metadata: metadata,
        };
        this.activeTasks.set(taskId, state);
        return state;
    };
    /**
     * Update task execution state
     */
    TaskTimeframeManager.prototype.updateTask = function (taskId, updates) {
        var state = this.activeTasks.get(taskId);
        if (!state) {
            throw new Error("Task not found: ".concat(taskId));
        }
        Object.assign(state, updates);
        state.elapsedMs = node_perf_hooks_1.performance.now() - state.startTime;
        // Check for timeout
        var config = this.bucketConfigs[state.bucketName];
        if (state.elapsedMs >= config.maxDurationMs && state.status === 'running') {
            state.status = 'timeout';
        }
    };
    /**
     * Add checkpoint to task
     */
    TaskTimeframeManager.prototype.addCheckpoint = function (taskId, data, description) {
        var state = this.activeTasks.get(taskId);
        if (!state) {
            throw new Error("Task not found: ".concat(taskId));
        }
        state.checkpoints.push({
            timestamp: node_perf_hooks_1.performance.now(),
            data: data,
            description: description,
        });
    };
    /**
     * Pause task with resume ticket
     */
    TaskTimeframeManager.prototype.pauseTask = function (taskId, trailerOptionId, checkpointData) {
        var _a;
        var state = this.activeTasks.get(taskId);
        if (!state) {
            throw new Error("Task not found: ".concat(taskId));
        }
        if (state.status !== 'running') {
            throw new Error("Cannot pause task in status: ".concat(state.status));
        }
        // Create resume ticket
        var ticket = {
            id: "".concat(taskId, "-").concat(Date.now(), "-").concat(Math.random().toString(36).substr(2, 9)),
            taskId: taskId,
            bucketName: state.bucketName,
            trailerOptionId: trailerOptionId,
            checkpointData: checkpointData || ((_a = state.checkpoints[state.checkpoints.length - 1]) === null || _a === void 0 ? void 0 : _a.data),
            createdAt: Date.now(),
            expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        };
        // Update task state
        state.status = 'paused';
        state.resumeTicket = ticket;
        state.trailerOptionId = trailerOptionId;
        // Store ticket
        this.resumeTickets.set(ticket.id, ticket);
        // Create bucket trailer if trailer option is provided
        if (trailerOptionId) {
            var trailer = {
                taskId: taskId,
                bucketName: state.bucketName,
                trailerOptionId: trailerOptionId,
                checkpointData: ticket.checkpointData,
                resumeTicket: ticket,
            };
            this.bucketTrailers.set(taskId, trailer);
        }
        return ticket;
    };
    /**
     * Resume task from ticket
     */
    TaskTimeframeManager.prototype.resumeTask = function (ticketId) {
        var ticket = this.resumeTickets.get(ticketId);
        if (!ticket) {
            throw new Error("Resume ticket not found: ".concat(ticketId));
        }
        if (Date.now() > ticket.expiresAt) {
            throw new Error("Resume ticket expired: ".concat(ticketId));
        }
        var state = this.activeTasks.get(ticket.taskId);
        if (!state) {
            throw new Error("Task not found: ".concat(ticket.taskId));
        }
        if (state.status !== 'paused') {
            throw new Error("Task is not paused: ".concat(ticket.taskId));
        }
        // Resume task
        state.status = 'running';
        state.startTime = node_perf_hooks_1.performance.now(); // Reset start time
        state.elapsedMs = 0;
        // Remove ticket
        this.resumeTickets.delete(ticketId);
        return state;
    };
    /**
     * Complete task
     */
    TaskTimeframeManager.prototype.completeTask = function (taskId) {
        var state = this.activeTasks.get(taskId);
        if (!state) {
            throw new Error("Task not found: ".concat(taskId));
        }
        state.status = 'completed';
        state.elapsedMs = node_perf_hooks_1.performance.now() - state.startTime;
        // Clean up
        this.activeTasks.delete(taskId);
        this.bucketTrailers.delete(taskId);
    };
    /**
     * Fail task
     */
    TaskTimeframeManager.prototype.failTask = function (taskId, error) {
        var state = this.activeTasks.get(taskId);
        if (!state) {
            throw new Error("Task not found: ".concat(taskId));
        }
        state.status = 'failed';
        state.elapsedMs = node_perf_hooks_1.performance.now() - state.startTime;
        if (error) {
            state.metadata = __assign(__assign({}, state.metadata), { error: error });
        }
    };
    // ============================================================================
    // Query and Monitoring
    // ============================================================================
    /**
     * Get active tasks
     */
    TaskTimeframeManager.prototype.getActiveTasks = function () {
        return Array.from(this.activeTasks.values());
    };
    /**
     * Get task state
     */
    TaskTimeframeManager.prototype.getTaskState = function (taskId) {
        return this.activeTasks.get(taskId);
    };
    /**
     * Get bucket traces for a task
     */
    TaskTimeframeManager.prototype.getBucketTraces = function (taskId) {
        return this.bucketTraces.get(taskId) || [];
    };
    /**
     * Get bucket trailer for a task
     */
    TaskTimeframeManager.prototype.getBucketTrailer = function (taskId) {
        return this.bucketTrailers.get(taskId);
    };
    /**
     * Get valid resume tickets
     */
    TaskTimeframeManager.prototype.getValidResumeTickets = function () {
        var now = Date.now();
        return Array.from(this.resumeTickets.values()).filter(function (ticket) { return now <= ticket.expiresAt; });
    };
    /**
     * Get bucket configuration
     */
    TaskTimeframeManager.prototype.getBucketConfig = function (bucketName) {
        return this.bucketConfigs[bucketName];
    };
    /**
     * Get all bucket configurations
     */
    TaskTimeframeManager.prototype.getAllBucketConfigs = function () {
        return __assign({}, this.bucketConfigs);
    };
    /**
     * Check if task is running
     */
    TaskTimeframeManager.prototype.isTaskRunning = function (taskId) {
        var state = this.activeTasks.get(taskId);
        return (state === null || state === void 0 ? void 0 : state.status) === 'running';
    };
    /**
     * Check if task is paused
     */
    TaskTimeframeManager.prototype.isTaskPaused = function (taskId) {
        var state = this.activeTasks.get(taskId);
        return (state === null || state === void 0 ? void 0 : state.status) === 'paused';
    };
    /**
     * Get remaining time for a task
     */
    TaskTimeframeManager.prototype.getRemainingTime = function (taskId) {
        var state = this.activeTasks.get(taskId);
        if (!state || state.status !== 'running') {
            return 0;
        }
        var config = this.bucketConfigs[state.bucketName];
        var remaining = config.maxDurationMs - state.elapsedMs;
        return Math.max(0, remaining);
    };
    // ============================================================================
    // Utility Methods
    // ============================================================================
    /**
     * Clean up expired tickets
     */
    TaskTimeframeManager.prototype.cleanupExpiredTickets = function () {
        var now = Date.now();
        var cleaned = 0;
        for (var _i = 0, _a = this.resumeTickets.entries(); _i < _a.length; _i++) {
            var _b = _a[_i], ticketId = _b[0], ticket = _b[1];
            if (now > ticket.expiresAt) {
                this.resumeTickets.delete(ticketId);
                cleaned++;
            }
        }
        return cleaned;
    };
    /**
     * Get bucket statistics
     */
    TaskTimeframeManager.prototype.getBucketStatistics = function () {
        var stats = {
            tactical: { active: 0, completed: 0, failed: 0 },
            short: { active: 0, completed: 0, failed: 0 },
            standard: { active: 0, completed: 0, failed: 0 },
            long: { active: 0, completed: 0, failed: 0 },
            expedition: { active: 0, completed: 0, failed: 0 },
        };
        for (var _i = 0, _a = this.activeTasks.values(); _i < _a.length; _i++) {
            var state = _a[_i];
            if (state.status === 'running') {
                stats[state.bucketName].active++;
            }
            else if (state.status === 'completed') {
                stats[state.bucketName].completed++;
            }
            else if (state.status === 'failed') {
                stats[state.bucketName].failed++;
            }
        }
        return stats;
    };
    /**
     * Clear all data (for testing)
     */
    TaskTimeframeManager.prototype.clear = function () {
        this.activeTasks.clear();
        this.resumeTickets.clear();
        this.bucketTraces.clear();
        this.bucketTrailers.clear();
    };
    return TaskTimeframeManager;
}());
exports.TaskTimeframeManager = TaskTimeframeManager;

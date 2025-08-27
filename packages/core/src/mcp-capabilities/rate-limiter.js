"use strict";
/**
 * Rate Limiter - Prevents capability abuse through sophisticated rate limiting
 *
 * Implements sliding window rate limiting with burst allowance, adaptive limits,
 * and capability-specific controls to prevent abuse while allowing legitimate usage.
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
exports.CapabilityRateLimiter = void 0;
var events_1 = require("events");
/**
 * Sophisticated rate limiting system that prevents capability abuse
 * while allowing legitimate high-frequency actions when appropriate.
 */
var CapabilityRateLimiter = /** @class */ (function (_super) {
    __extends(CapabilityRateLimiter, _super);
    function CapabilityRateLimiter(globalConfig, defaultCapabilityConfig) {
        if (globalConfig === void 0) { globalConfig = {
            windowMs: 60000, // 1 minute
            maxRequests: 100, // 100 requests per minute globally
            burstAllowance: 20, // 20 burst requests
            cooldownMs: 5000, // 5 second cooldown after limit exceeded
        }; }
        if (defaultCapabilityConfig === void 0) { defaultCapabilityConfig = {
            windowMs: 10000, // 10 seconds
            maxRequests: 10, // 10 requests per 10 seconds per capability
            burstAllowance: 3, // 3 burst requests
            cooldownMs: 2000, // 2 second cooldown
        }; }
        var _this = _super.call(this) || this;
        _this.globalConfig = globalConfig;
        _this.defaultCapabilityConfig = defaultCapabilityConfig;
        _this.capabilityBuckets = new Map();
        _this.userBuckets = new Map();
        _this.adaptiveConfigs = new Map();
        _this.violationHistory = [];
        _this.globalBucket = _this.createBucket(globalConfig);
        _this.startCleanupTimer();
        return _this;
    }
    /**
     * Create a new rate limit bucket
     */
    CapabilityRateLimiter.prototype.createBucket = function (config) {
        return {
            config: config,
            entries: [],
            lastReset: Date.now(),
            violationCount: 0,
            totalRequests: 0,
        };
    };
    /**
     * Check if capability execution is within rate limits
     *
     * @param capability - Capability being requested
     * @param request - Execution request
     * @param context - Current execution context
     * @returns Rate limit status and time until next allowable execution
     */
    CapabilityRateLimiter.prototype.checkRateLimit = function (capability, request, context) {
        var now = Date.now();
        var cost = this.calculateRequestCost(capability, request, context);
        // Check global rate limit
        var globalStatus = this.checkBucketLimit(this.globalBucket, now, cost);
        if (!globalStatus.allowed) {
            this.recordViolation('global', 1);
            this.emit('rate-limit-exceeded', 'global', globalStatus);
            return globalStatus;
        }
        // Check capability-specific rate limit
        var capabilityBucket = this.getOrCreateCapabilityBucket(capability.id);
        var capabilityStatus = this.checkBucketLimit(capabilityBucket, now, cost);
        if (!capabilityStatus.allowed) {
            this.recordViolation(capability.id, 2);
            this.emit('rate-limit-exceeded', capability.id, capabilityStatus);
            return capabilityStatus;
        }
        // Check user-specific rate limit (if applicable)
        if (request.requestedBy) {
            var userBucket = this.getOrCreateUserBucket(request.requestedBy);
            var userStatus = this.checkBucketLimit(userBucket, now, cost);
            if (!userStatus.allowed) {
                this.recordViolation("user:".concat(request.requestedBy), 3);
                this.emit('rate-limit-exceeded', "user:".concat(request.requestedBy), userStatus);
                return userStatus;
            }
        }
        // All checks passed
        return {
            allowed: true,
            remaining: Math.min(globalStatus.remaining, capabilityStatus.remaining, request.requestedBy
                ? this.getOrCreateUserBucket(request.requestedBy).config.maxRequests
                : Infinity),
            resetTime: Math.max(globalStatus.resetTime, capabilityStatus.resetTime),
        };
    };
    /**
     * Check rate limit for a specific bucket
     */
    CapabilityRateLimiter.prototype.checkBucketLimit = function (bucket, now, cost) {
        if (cost === void 0) { cost = 1; }
        // Clean old entries
        this.cleanBucket(bucket, now);
        // Check if in cooldown period
        var timeSinceLastViolation = now - bucket.lastReset;
        if (bucket.violationCount > 0 &&
            timeSinceLastViolation < bucket.config.cooldownMs) {
            return {
                allowed: false,
                remaining: 0,
                resetTime: bucket.lastReset + bucket.config.cooldownMs,
                retryAfter: bucket.config.cooldownMs - timeSinceLastViolation,
                reason: 'In cooldown period after rate limit violation',
            };
        }
        // Calculate current usage
        var currentRequests = bucket.entries.length;
        var currentCost = bucket.entries.reduce(function (sum, entry) { return sum + entry.cost; }, 0);
        // Check against base limit
        var maxRequests = bucket.config.maxRequests;
        var remaining = maxRequests - currentRequests;
        if (currentRequests >= maxRequests) {
            // Check if burst allowance can cover this request
            var burstRemaining = bucket.config.burstAllowance -
                Math.max(0, currentRequests - maxRequests);
            if (burstRemaining >= cost) {
                this.emit('burst-allowance-used', bucket.config.windowMs.toString(), burstRemaining - cost);
                return {
                    allowed: true,
                    remaining: burstRemaining - cost,
                    resetTime: now + bucket.config.windowMs,
                };
            }
            // Rate limit exceeded
            bucket.violationCount++;
            bucket.lastReset = now;
            return {
                allowed: false,
                remaining: 0,
                resetTime: now + bucket.config.windowMs,
                retryAfter: bucket.config.windowMs,
                reason: "Rate limit exceeded: ".concat(currentRequests, "/").concat(maxRequests, " requests in window"),
            };
        }
        return {
            allowed: true,
            remaining: remaining - cost,
            resetTime: now + bucket.config.windowMs,
        };
    };
    /**
     * Record capability execution for rate limit tracking
     *
     * @param capability - Executed capability
     * @param request - Execution request
     * @param timestamp - Execution timestamp
     */
    CapabilityRateLimiter.prototype.recordExecution = function (capability, request, timestamp) {
        if (timestamp === void 0) { timestamp = Date.now(); }
        var cost = this.calculateRequestCost(capability, request, {}); // Simplified
        var entry = {
            timestamp: timestamp,
            capabilityId: capability.id,
            requestId: request.id,
            cost: cost,
        };
        // Record in global bucket
        this.globalBucket.entries.push(entry);
        this.globalBucket.totalRequests++;
        // Record in capability bucket
        var capabilityBucket = this.getOrCreateCapabilityBucket(capability.id);
        capabilityBucket.entries.push(entry);
        capabilityBucket.totalRequests++;
        // Record in user bucket (if applicable)
        if (request.requestedBy) {
            var userBucket = this.getOrCreateUserBucket(request.requestedBy);
            userBucket.entries.push(entry);
            userBucket.totalRequests++;
        }
    };
    /**
     * Calculate cost for a request (can be overridden for different cost models)
     */
    CapabilityRateLimiter.prototype.calculateRequestCost = function (capability, request, context) {
        // Base cost from capability specification
        var cost = Math.max(1, Math.floor(capability.costHint / 10));
        // Higher cost for high-risk capabilities
        if (capability.riskLevel >= 3) {
            cost *= 2;
        }
        // Higher cost during high-danger contexts
        if (context.dangerLevel > 0.7) {
            cost *= 1.5;
        }
        // Higher cost for high-priority requests
        if (request.priority > 0.8) {
            cost *= 1.2;
        }
        return Math.ceil(cost);
    };
    /**
     * Get or create capability-specific bucket
     */
    CapabilityRateLimiter.prototype.getOrCreateCapabilityBucket = function (capabilityId) {
        if (!this.capabilityBuckets.has(capabilityId)) {
            var config = this.adaptiveConfigs.get(capabilityId) || this.defaultCapabilityConfig;
            this.capabilityBuckets.set(capabilityId, this.createBucket(config));
        }
        return this.capabilityBuckets.get(capabilityId);
    };
    /**
     * Get or create user-specific bucket
     */
    CapabilityRateLimiter.prototype.getOrCreateUserBucket = function (userId) {
        if (!this.userBuckets.has(userId)) {
            this.userBuckets.set(userId, this.createBucket(this.defaultCapabilityConfig));
        }
        return this.userBuckets.get(userId);
    };
    /**
     * Clean old entries from bucket
     */
    CapabilityRateLimiter.prototype.cleanBucket = function (bucket, now) {
        var cutoff = now - bucket.config.windowMs;
        bucket.entries = bucket.entries.filter(function (entry) { return entry.timestamp > cutoff; });
    };
    /**
     * Record a rate limit violation
     */
    CapabilityRateLimiter.prototype.recordViolation = function (identifier, severity) {
        this.violationHistory.push({
            capabilityId: identifier,
            timestamp: Date.now(),
            severity: severity,
        });
        // Keep only recent violations
        if (this.violationHistory.length > 1000) {
            this.violationHistory = this.violationHistory.slice(-1000);
        }
        this.emit('rate-limit-violation', identifier, this.getViolationCount(identifier));
    };
    /**
     * Get violation count for identifier
     */
    CapabilityRateLimiter.prototype.getViolationCount = function (identifier) {
        var recentCutoff = Date.now() - 300000; // 5 minutes
        return this.violationHistory.filter(function (v) { return v.capabilityId === identifier && v.timestamp > recentCutoff; }).length;
    };
    /**
     * Implement adaptive rate limiting based on context
     *
     * @param capabilityId - Capability to adjust limits for
     * @param baseLimit - Base rate limit configuration
     * @param context - Current context that may modify limits
     * @returns Adjusted rate limit for current situation
     */
    CapabilityRateLimiter.prototype.calculateAdaptiveLimit = function (capabilityId, baseLimit, context) {
        var adjustedLimit = __assign({}, baseLimit);
        // Relax limits during emergencies
        if (context.dangerLevel > 0.8 || context.agentHealth < 0.2) {
            adjustedLimit.maxRequests *= 2;
            adjustedLimit.burstAllowance *= 2;
            adjustedLimit.cooldownMs /= 2;
        }
        // Tighten limits during stable periods
        if (context.dangerLevel < 0.2 && context.agentHealth > 0.8) {
            adjustedLimit.maxRequests = Math.floor(adjustedLimit.maxRequests * 0.8);
        }
        // Adjust based on violation history
        var recentViolations = this.getViolationCount(capabilityId);
        if (recentViolations > 3) {
            adjustedLimit.maxRequests = Math.floor(adjustedLimit.maxRequests * 0.5);
            adjustedLimit.cooldownMs *= 2;
        }
        return adjustedLimit;
    };
    /**
     * Set adaptive configuration for a capability
     *
     * @param capabilityId - Capability ID
     * @param config - New configuration
     */
    CapabilityRateLimiter.prototype.setAdaptiveConfig = function (capabilityId, config) {
        this.adaptiveConfigs.set(capabilityId, config);
        // Update existing bucket if it exists
        if (this.capabilityBuckets.has(capabilityId)) {
            this.capabilityBuckets.get(capabilityId).config = config;
        }
        this.emit('adaptive-limit-changed', capabilityId, config);
    };
    /**
     * Start cleanup timer to remove old entries periodically
     */
    CapabilityRateLimiter.prototype.startCleanupTimer = function () {
        var _this = this;
        setInterval(function () {
            var now = Date.now();
            // Clean global bucket
            _this.cleanBucket(_this.globalBucket, now);
            // Clean capability buckets
            for (var _i = 0, _a = _this.capabilityBuckets; _i < _a.length; _i++) {
                var _b = _a[_i], id = _b[0], bucket = _b[1];
                _this.cleanBucket(bucket, now);
                // Remove empty buckets that haven't been used recently
                if (bucket.entries.length === 0 && now - bucket.lastReset > 300000) {
                    _this.capabilityBuckets.delete(id);
                }
            }
            // Clean user buckets
            for (var _c = 0, _d = _this.userBuckets; _c < _d.length; _c++) {
                var _e = _d[_c], id = _e[0], bucket = _e[1];
                _this.cleanBucket(bucket, now);
                // Remove empty buckets that haven't been used recently
                if (bucket.entries.length === 0 && now - bucket.lastReset > 300000) {
                    _this.userBuckets.delete(id);
                }
            }
        }, 60000); // Clean every minute
    };
    /**
     * Get current rate limit statistics
     *
     * @returns Statistics about rate limiting
     */
    CapabilityRateLimiter.prototype.getStatistics = function () {
        var recentCutoff = Date.now() - 300000; // 5 minutes
        var recentViolations = this.violationHistory.filter(function (v) { return v.timestamp > recentCutoff; });
        // Count violations by capability
        var violationCounts = {};
        for (var _i = 0, recentViolations_1 = recentViolations; _i < recentViolations_1.length; _i++) {
            var violation = recentViolations_1[_i];
            violationCounts[violation.capabilityId] =
                (violationCounts[violation.capabilityId] || 0) + 1;
        }
        var topViolated = Object.entries(violationCounts)
            .map(function (_a) {
            var capabilityId = _a[0], violations = _a[1];
            return ({ capabilityId: capabilityId, violations: violations });
        })
            .sort(function (a, b) { return b.violations - a.violations; })
            .slice(0, 5);
        return {
            globalRequests: this.globalBucket.entries.length,
            activeCapabilityBuckets: this.capabilityBuckets.size,
            activeUserBuckets: this.userBuckets.size,
            totalViolations: this.violationHistory.length,
            recentViolations: recentViolations.length,
            topViolatedCapabilities: topViolated,
        };
    };
    /**
     * Reset rate limits for a specific capability
     *
     * @param capabilityId - Capability to reset
     */
    CapabilityRateLimiter.prototype.resetCapabilityLimits = function (capabilityId) {
        var bucket = this.capabilityBuckets.get(capabilityId);
        if (bucket) {
            bucket.entries = [];
            bucket.violationCount = 0;
            bucket.lastReset = Date.now();
        }
    };
    /**
     * Reset all rate limits
     */
    CapabilityRateLimiter.prototype.resetAllLimits = function () {
        this.globalBucket.entries = [];
        this.globalBucket.violationCount = 0;
        this.globalBucket.lastReset = Date.now();
        for (var _i = 0, _a = this.capabilityBuckets.values(); _i < _a.length; _i++) {
            var bucket = _a[_i];
            bucket.entries = [];
            bucket.violationCount = 0;
            bucket.lastReset = Date.now();
        }
        for (var _b = 0, _c = this.userBuckets.values(); _b < _c.length; _b++) {
            var bucket = _c[_b];
            bucket.entries = [];
            bucket.violationCount = 0;
            bucket.lastReset = Date.now();
        }
        this.violationHistory = [];
    };
    /**
     * Get rate limit status for a capability without checking
     *
     * @param capabilityId - Capability ID
     * @returns Current status information
     */
    CapabilityRateLimiter.prototype.getCapabilityStatus = function (capabilityId) {
        var bucket = this.capabilityBuckets.get(capabilityId);
        if (!bucket) {
            return {
                currentRequests: 0,
                maxRequests: this.defaultCapabilityConfig.maxRequests,
                windowMs: this.defaultCapabilityConfig.windowMs,
                violationCount: 0,
                inCooldown: false,
            };
        }
        var now = Date.now();
        this.cleanBucket(bucket, now);
        return {
            currentRequests: bucket.entries.length,
            maxRequests: bucket.config.maxRequests,
            windowMs: bucket.config.windowMs,
            violationCount: bucket.violationCount,
            inCooldown: bucket.violationCount > 0 &&
                now - bucket.lastReset < bucket.config.cooldownMs,
        };
    };
    return CapabilityRateLimiter;
}(events_1.EventEmitter));
exports.CapabilityRateLimiter = CapabilityRateLimiter;

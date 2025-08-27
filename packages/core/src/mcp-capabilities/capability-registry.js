"use strict";
/**
 * Capability Registry - Central management of all available capabilities
 *
 * Provides discovery, validation, execution coordination, and monitoring
 * for all registered capabilities in the MCP system.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapabilityRegistry = void 0;
var events_1 = require("events");
var uuid_1 = require("uuid");
var types_1 = require("./types");
var capability_specs_1 = require("./capability-specs");
/**
 * Central registry managing all available capabilities, their specifications,
 * and runtime state. Provides discovery, validation, and execution coordination.
 */
var CapabilityRegistry = /** @class */ (function (_super) {
    __extends(CapabilityRegistry, _super);
    function CapabilityRegistry() {
        var _this = _super.call(this) || this;
        _this.capabilities = new Map();
        _this.executors = new Map();
        _this.validators = new Map();
        _this.metrics = new Map();
        _this.activeExecutions = new Map();
        _this.executionHistory = [];
        _this.lastUsed = new Map();
        _this.initializeDefaultCapabilities();
        return _this;
    }
    /**
     * Initialize with default Minecraft capabilities
     */
    CapabilityRegistry.prototype.initializeDefaultCapabilities = function () {
        for (var _i = 0, ALL_CAPABILITIES_1 = capability_specs_1.ALL_CAPABILITIES; _i < ALL_CAPABILITIES_1.length; _i++) {
            var capability = ALL_CAPABILITIES_1[_i];
            this.registerCapability(capability);
        }
        // Register executors
        for (var _a = 0, _b = Object.entries(capability_specs_1.CAPABILITY_EXECUTORS); _a < _b.length; _a++) {
            var _c = _b[_a], capabilityId = _c[0], executor = _c[1];
            this.executors.set(capabilityId, executor);
        }
        // Register validators
        for (var _d = 0, _e = Object.entries(capability_specs_1.CAPABILITY_VALIDATORS); _d < _e.length; _d++) {
            var _f = _e[_d], capabilityId = _f[0], validator = _f[1];
            this.validators.set(capabilityId, validator);
        }
    };
    /**
     * Register new capability with full specification
     *
     * @param spec - Complete capability specification
     * @returns Registration confirmation and assigned ID
     */
    CapabilityRegistry.prototype.registerCapability = function (spec) {
        try {
            // Validate specification
            var validatedSpec = (0, types_1.validateCapabilitySpec)(spec);
            // Check for conflicts
            if (this.capabilities.has(validatedSpec.id)) {
                return {
                    success: false,
                    capabilityId: validatedSpec.id,
                    message: "Capability ".concat(validatedSpec.id, " already exists"),
                };
            }
            // Register capability
            this.capabilities.set(validatedSpec.id, validatedSpec);
            // Initialize metrics
            this.metrics.set(validatedSpec.id, {
                totalExecutions: 0,
                successfulExecutions: 0,
                failedExecutions: 0,
                averageLatency: 0,
                p95Latency: 0,
                maxLatency: 0,
                rateLimitViolations: 0,
                constitutionalViolations: 0,
                riskEventsTriggered: 0,
                firstUsed: 0,
                lastUsed: 0,
            });
            this.emit('capability-registered', validatedSpec);
            return {
                success: true,
                capabilityId: validatedSpec.id,
                message: "Successfully registered capability: ".concat(validatedSpec.name),
            };
        }
        catch (error) {
            return {
                success: false,
                capabilityId: spec.id,
                message: "Failed to register capability: ".concat(error instanceof Error ? error.message : 'Unknown error'),
            };
        }
    };
    /**
     * Register executor for a capability
     *
     * @param capabilityId - ID of capability
     * @param executor - Executor implementation
     */
    CapabilityRegistry.prototype.registerExecutor = function (capabilityId, executor) {
        this.executors.set(capabilityId, executor);
    };
    /**
     * Register validator for a capability
     *
     * @param capabilityId - ID of capability
     * @param validator - Validator implementation
     */
    CapabilityRegistry.prototype.registerValidator = function (capabilityId, validator) {
        this.validators.set(capabilityId, validator);
    };
    /**
     * Discover capabilities matching query criteria
     *
     * @param query - Search criteria for capability discovery
     * @returns Matching capabilities with current availability
     */
    CapabilityRegistry.prototype.discoverCapabilities = function (query) {
        var matches = [];
        var _loop_1 = function (id, capability) {
            if (!capability.enabled)
                return "continue";
            var score = 0;
            var reasons = [];
            // Category filter
            if (query.category && capability.category === query.category) {
                score += 0.3;
                reasons.push("matches category: ".concat(query.category));
            }
            // Risk level filter
            if (query.riskLevel !== undefined &&
                capability.riskLevel <= query.riskLevel) {
                score += 0.2;
                reasons.push("risk level acceptable: ".concat(capability.riskLevel, " <= ").concat(query.riskLevel));
            }
            // Safety tags filter
            if (query.safetyTags && query.safetyTags.length > 0) {
                var matchingTags = query.safetyTags.filter(function (tag) {
                    return capability.safetyTags.includes(tag);
                });
                if (matchingTags.length > 0) {
                    score += 0.2 * (matchingTags.length / query.safetyTags.length);
                    reasons.push("matching safety tags: ".concat(matchingTags.join(', ')));
                }
            }
            // Duration filter
            if (query.maxDuration !== undefined &&
                capability.durationMs <= query.maxDuration) {
                score += 0.15;
                reasons.push("duration within limit: ".concat(capability.durationMs, "ms <= ").concat(query.maxDuration, "ms"));
            }
            // Cost filter
            if (query.maxCost !== undefined && capability.costHint <= query.maxCost) {
                score += 0.15;
                reasons.push("cost within limit: ".concat(capability.costHint, " <= ").concat(query.maxCost));
            }
            // Text search
            if (query.searchText) {
                var searchLower = query.searchText.toLowerCase();
                if (capability.name.toLowerCase().includes(searchLower) ||
                    capability.description.toLowerCase().includes(searchLower)) {
                    score += 0.1;
                    reasons.push("matches search text: \"".concat(query.searchText, "\""));
                }
            }
            // Only include if there's some match
            if (score > 0 || Object.keys(query).length === 0) {
                matches.push({
                    capability: capability,
                    matchScore: score,
                    matchReasons: reasons,
                    available: this_1.isCapabilityAvailable(id),
                    estimatedCost: capability.costHint,
                    lastUsed: this_1.lastUsed.get(id),
                });
            }
        };
        var this_1 = this;
        for (var _i = 0, _a = this.capabilities; _i < _a.length; _i++) {
            var _b = _a[_i], id = _b[0], capability = _b[1];
            _loop_1(id, capability);
        }
        // Sort by match score (descending)
        return matches.sort(function (a, b) { return b.matchScore - a.matchScore; });
    };
    /**
     * Check if capability is currently available
     *
     * @param capabilityId - ID of capability to check
     * @returns Whether capability is available for execution
     */
    CapabilityRegistry.prototype.isCapabilityAvailable = function (capabilityId) {
        var capability = this.capabilities.get(capabilityId);
        if (!capability || !capability.enabled)
            return false;
        // Check concurrent execution limit
        var activeCount = Array.from(this.activeExecutions.values()).filter(function (req) { return req.capabilityId === capabilityId; }).length;
        if (activeCount >= capability.maxConcurrent)
            return false;
        // Check cooldown
        var lastUsed = this.lastUsed.get(capabilityId);
        if (lastUsed && Date.now() - lastUsed < capability.cooldownMs)
            return false;
        return true;
    };
    /**
     * Validate capability execution request against constraints
     *
     * @param request - Execution request to validate
     * @param context - Current environmental and agent context
     * @returns Validation result with approval/rejection reasons
     */
    CapabilityRegistry.prototype.validateExecution = function (request, context) {
        return __awaiter(this, void 0, void 0, function () {
            var capability, reasons, preconditionsPassed, constitutionalApproval, rateLimitApproval, validator, error_1, approved;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        try {
                            (0, types_1.validateExecutionRequest)(request);
                            (0, types_1.validateExecutionContext)(context);
                        }
                        catch (error) {
                            return [2 /*return*/, {
                                    approved: false,
                                    reasons: [
                                        "Invalid request or context: ".concat(error instanceof Error ? error.message : 'Unknown error'),
                                    ],
                                    preconditionsPassed: false,
                                    constitutionalApproval: false,
                                    rateLimitApproval: false,
                                    riskAssessment: {
                                        level: types_1.RiskLevel.HIGH,
                                        factors: ['validation_failed'],
                                    },
                                    timestamp: Date.now(),
                                }];
                        }
                        capability = this.capabilities.get(request.capabilityId);
                        if (!capability) {
                            return [2 /*return*/, {
                                    approved: false,
                                    reasons: ["Unknown capability: ".concat(request.capabilityId)],
                                    preconditionsPassed: false,
                                    constitutionalApproval: false,
                                    rateLimitApproval: false,
                                    riskAssessment: {
                                        level: types_1.RiskLevel.HIGH,
                                        factors: ['unknown_capability'],
                                    },
                                    timestamp: Date.now(),
                                }];
                        }
                        if (!capability.enabled) {
                            return [2 /*return*/, {
                                    approved: false,
                                    reasons: ["Capability disabled: ".concat(request.capabilityId)],
                                    preconditionsPassed: false,
                                    constitutionalApproval: false,
                                    rateLimitApproval: false,
                                    riskAssessment: {
                                        level: types_1.RiskLevel.MEDIUM,
                                        factors: ['capability_disabled'],
                                    },
                                    timestamp: Date.now(),
                                }];
                        }
                        reasons = [];
                        preconditionsPassed = true;
                        constitutionalApproval = true;
                        rateLimitApproval = true;
                        // Check availability
                        if (!this.isCapabilityAvailable(request.capabilityId)) {
                            rateLimitApproval = false;
                            reasons.push('Capability not available (cooldown, concurrent limit, or disabled)');
                        }
                        validator = this.validators.get(request.capabilityId);
                        if (!validator) return [3 /*break*/, 4];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, validator.validatePreconditions(request, context)];
                    case 2:
                        preconditionsPassed = _b.sent();
                        if (!preconditionsPassed) {
                            reasons.push('Preconditions not met');
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _b.sent();
                        preconditionsPassed = false;
                        reasons.push("Precondition validation failed: ".concat(error_1 instanceof Error ? error_1.message : 'Unknown error'));
                        return [3 /*break*/, 4];
                    case 4:
                        // Basic constitutional check (simplified)
                        if (capability.riskLevel >= types_1.RiskLevel.HIGH && !((_a = request.metadata) === null || _a === void 0 ? void 0 : _a.approved)) {
                            constitutionalApproval = false;
                            reasons.push('High risk capability requires approval');
                        }
                        // Check context safety
                        if (context.dangerLevel > 0.8 && capability.riskLevel >= types_1.RiskLevel.MEDIUM) {
                            constitutionalApproval = false;
                            reasons.push('Dangerous context prohibits medium+ risk actions');
                        }
                        approved = preconditionsPassed && constitutionalApproval && rateLimitApproval;
                        if (approved) {
                            reasons.push('All validation checks passed');
                        }
                        return [2 /*return*/, {
                                approved: approved,
                                reasons: reasons,
                                preconditionsPassed: preconditionsPassed,
                                constitutionalApproval: constitutionalApproval,
                                rateLimitApproval: rateLimitApproval,
                                riskAssessment: {
                                    level: capability.riskLevel,
                                    factors: capability.riskLevel >= types_1.RiskLevel.MEDIUM
                                        ? ['inherent_capability_risk']
                                        : [],
                                    mitigation: approved ? ['validation_passed'] : undefined,
                                },
                                timestamp: Date.now(),
                            }];
                }
            });
        });
    };
    /**
     * Execute validated capability with full monitoring
     *
     * @param request - Pre-validated execution request
     * @returns Execution result with effects and telemetry
     */
    CapabilityRegistry.prototype.executeCapability = function (request, context) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, executionId, requestWithId, executor, result, error_2, errorResult;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        executionId = (0, uuid_1.v4)();
                        requestWithId = __assign(__assign({}, request), { id: executionId });
                        // Track active execution
                        this.activeExecutions.set(executionId, requestWithId);
                        this.emit('execution-started', requestWithId);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        executor = this.executors.get(request.capabilityId);
                        if (!executor) {
                            throw new Error("No executor found for capability: ".concat(request.capabilityId));
                        }
                        return [4 /*yield*/, executor.execute(requestWithId, context)];
                    case 2:
                        result = _a.sent();
                        // Update tracking
                        this.lastUsed.set(request.capabilityId, Date.now());
                        this.updateMetrics(request.capabilityId, result);
                        this.executionHistory.push(result);
                        // Cleanup
                        this.activeExecutions.delete(executionId);
                        if (result.success) {
                            this.emit('execution-completed', result);
                        }
                        else {
                            this.emit('execution-failed', result);
                        }
                        this.emit('capability-executed', result);
                        return [2 /*return*/, result];
                    case 3:
                        error_2 = _a.sent();
                        errorResult = {
                            id: executionId,
                            requestId: request.id,
                            capabilityId: request.capabilityId,
                            success: false,
                            startTime: startTime,
                            endTime: Date.now(),
                            duration: Date.now() - startTime,
                            effects: [],
                            error: error_2 instanceof Error ? error_2.message : 'Unknown execution error',
                            retryCount: 0,
                        };
                        this.updateMetrics(request.capabilityId, errorResult);
                        this.executionHistory.push(errorResult);
                        this.activeExecutions.delete(executionId);
                        this.emit('execution-failed', errorResult);
                        this.emit('capability-executed', errorResult);
                        return [2 /*return*/, errorResult];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Update metrics for capability execution
     */
    CapabilityRegistry.prototype.updateMetrics = function (capabilityId, result) {
        var metrics = this.metrics.get(capabilityId);
        if (!metrics)
            return;
        metrics.totalExecutions++;
        if (result.success) {
            metrics.successfulExecutions++;
        }
        else {
            metrics.failedExecutions++;
        }
        // Update latency statistics
        var latency = result.duration;
        if (metrics.totalExecutions === 1) {
            metrics.averageLatency = latency;
            metrics.p95Latency = latency;
            metrics.maxLatency = latency;
            metrics.firstUsed = result.startTime;
        }
        else {
            // Update running average
            metrics.averageLatency =
                (metrics.averageLatency * (metrics.totalExecutions - 1) + latency) /
                    metrics.totalExecutions;
            // Update max
            metrics.maxLatency = Math.max(metrics.maxLatency, latency);
            // Simplified P95 calculation (would use proper percentile calculation in production)
            metrics.p95Latency = Math.max(metrics.p95Latency, latency * 0.95);
        }
        metrics.lastUsed = result.endTime;
    };
    /**
     * Get capability by ID
     *
     * @param capabilityId - ID of capability
     * @returns Capability specification or undefined
     */
    CapabilityRegistry.prototype.getCapability = function (capabilityId) {
        return this.capabilities.get(capabilityId);
    };
    /**
     * Get all registered capabilities
     *
     * @returns Array of all capability specifications
     */
    CapabilityRegistry.prototype.getAllCapabilities = function () {
        return Array.from(this.capabilities.values());
    };
    /**
     * Get metrics for a capability
     *
     * @param capabilityId - ID of capability
     * @returns Capability metrics or undefined
     */
    CapabilityRegistry.prototype.getCapabilityMetrics = function (capabilityId) {
        return this.metrics.get(capabilityId);
    };
    /**
     * Get all capability metrics
     *
     * @returns Map of capability ID to metrics
     */
    CapabilityRegistry.prototype.getAllMetrics = function () {
        return new Map(this.metrics);
    };
    /**
     * Get active executions
     *
     * @returns Array of currently executing requests
     */
    CapabilityRegistry.prototype.getActiveExecutions = function () {
        return Array.from(this.activeExecutions.values());
    };
    /**
     * Get execution history
     *
     * @param limit - Maximum number of results to return
     * @returns Recent execution results
     */
    CapabilityRegistry.prototype.getExecutionHistory = function (limit) {
        if (limit === void 0) { limit = 100; }
        return this.executionHistory.slice(-limit);
    };
    /**
     * Cancel an active execution
     *
     * @param executionId - ID of execution to cancel
     * @returns Whether cancellation was successful
     */
    CapabilityRegistry.prototype.cancelExecution = function (executionId) {
        return __awaiter(this, void 0, void 0, function () {
            var request, executor, cancelled;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        request = this.activeExecutions.get(executionId);
                        if (!request)
                            return [2 /*return*/, false];
                        executor = this.executors.get(request.capabilityId);
                        if (!(executor === null || executor === void 0 ? void 0 : executor.cancel)) return [3 /*break*/, 2];
                        return [4 /*yield*/, executor.cancel(executionId)];
                    case 1:
                        cancelled = _a.sent();
                        if (cancelled) {
                            this.activeExecutions.delete(executionId);
                        }
                        return [2 /*return*/, cancelled];
                    case 2: return [2 /*return*/, false];
                }
            });
        });
    };
    /**
     * Enable or disable a capability
     *
     * @param capabilityId - ID of capability
     * @param enabled - Whether to enable or disable
     */
    CapabilityRegistry.prototype.setCapabilityEnabled = function (capabilityId, enabled) {
        var capability = this.capabilities.get(capabilityId);
        if (!capability)
            return false;
        capability.enabled = enabled;
        return true;
    };
    /**
     * Clear all metrics and history
     */
    CapabilityRegistry.prototype.clearMetrics = function () {
        for (var _i = 0, _a = this.metrics; _i < _a.length; _i++) {
            var capabilityId = _a[_i][0];
            this.metrics.set(capabilityId, {
                totalExecutions: 0,
                successfulExecutions: 0,
                failedExecutions: 0,
                averageLatency: 0,
                p95Latency: 0,
                maxLatency: 0,
                rateLimitViolations: 0,
                constitutionalViolations: 0,
                riskEventsTriggered: 0,
                firstUsed: 0,
                lastUsed: 0,
            });
        }
        this.executionHistory = [];
        this.lastUsed.clear();
    };
    /**
     * Get system statistics
     *
     * @returns System-wide statistics
     */
    CapabilityRegistry.prototype.getSystemStats = function () {
        var capabilities = Array.from(this.capabilities.values());
        var allMetrics = Array.from(this.metrics.values());
        var totalExecutions = allMetrics.reduce(function (sum, m) { return sum + m.totalExecutions; }, 0);
        var successfulExecutions = allMetrics.reduce(function (sum, m) { return sum + m.successfulExecutions; }, 0);
        return {
            totalCapabilities: capabilities.length,
            enabledCapabilities: capabilities.filter(function (c) { return c.enabled; }).length,
            activeExecutions: this.activeExecutions.size,
            totalExecutions: totalExecutions,
            successRate: totalExecutions > 0 ? successfulExecutions / totalExecutions : 1,
        };
    };
    return CapabilityRegistry;
}(events_1.EventEmitter));
exports.CapabilityRegistry = CapabilityRegistry;

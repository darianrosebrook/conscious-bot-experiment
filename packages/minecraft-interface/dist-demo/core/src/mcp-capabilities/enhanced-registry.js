"use strict";
/**
 * Enhanced Registry - Shadow runs, separate registration paths, and health checks
 *
 * Implements separate registration paths for leaves (signed human builds) vs options (LLM-authored),
 * shadow promotion pipeline with CI gates, quota management, and health monitoring.
 *
 * @author @darianrosebrook
 */
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
exports.EnhancedRegistry = void 0;
var node_perf_hooks_1 = require("node:perf_hooks");
var leaf_factory_1 = require("./leaf-factory");
var leaf_contracts_1 = require("./leaf-contracts");
var bt_dsl_parser_1 = require("./bt-dsl-parser");
// ============================================================================
// Enhanced Registry
// ============================================================================
/**
 * Enhanced registry with shadow runs and governance
 */
var EnhancedRegistry = /** @class */ (function () {
    function EnhancedRegistry() {
        // Critical fix #1: Store option definitions
        this.optionDefs = new Map(); // id -> BT-DSL JSON
        // Critical fix #2: Circuit breaker for bad shadows
        this.cb = new Map(); // optionId -> resumeTimestamp
        // Secondary improvement: Audit log
        this.audit = [];
        // Secondary improvement: Compiled BT cache
        this.compiled = new Map();
        // Secondary improvement: Veto list and global budget
        this.veto = new Set();
        this.maxShadowActive = 10;
        this.leafFactory = new leaf_factory_1.LeafFactory();
        this.btParser = new bt_dsl_parser_1.BTDSLParser();
        this.enhancedSpecs = new Map();
        this.shadowRuns = new Map();
        this.healthChecks = new Map();
        this.quotas = new Map();
    }
    // ============================================================================
    // Leaf Registration (Signed Human Builds)
    // ============================================================================
    /**
     * Register a leaf (signed human build) with provenance
     */
    EnhancedRegistry.prototype.registerLeaf = function (leaf, provenance, status) {
        if (status === void 0) { status = 'active'; }
        // Validate provenance
        if (!this.validateProvenance(provenance)) {
            return { ok: false, error: 'invalid_provenance' };
        }
        // Register with leaf factory
        var result = this.leafFactory.register(leaf);
        if (!result.ok) {
            return result;
        }
        var leafId = result.id;
        if (!leafId) {
            return { ok: false, error: 'missing_id' };
        }
        // Critical fix #2: Check if version already exists
        if (this.enhancedSpecs.has(leafId)) {
            return { ok: false, error: 'version_exists' };
        }
        // Create enhanced spec
        var enhancedSpec = {
            name: leaf.spec.name,
            version: leaf.spec.version,
            status: status,
            provenance: provenance,
            permissions: leaf.spec.permissions,
            rateLimitPerMin: leaf.spec.rateLimitPerMin,
            maxConcurrent: leaf.spec.maxConcurrent,
        };
        this.enhancedSpecs.set(leafId, enhancedSpec);
        this.shadowRuns.set(leafId, []);
        // Secondary improvement: Audit logging
        this.log('register_leaf', leafId, provenance.author, { status: status });
        return result;
    };
    // ============================================================================
    // Option Registration (LLM-authored with Pipeline)
    // ============================================================================
    /**
     * Register an option (LLM-authored) with shadow configuration
     */
    EnhancedRegistry.prototype.registerOption = function (btDslJson, provenance, shadowConfig) {
        var _a;
        // Parse and validate BT-DSL
        var parseResult = this.btParser.parse(btDslJson, this.leafFactory);
        if (!parseResult.valid) {
            return {
                ok: false,
                error: 'invalid_bt_dsl',
                detail: (_a = parseResult.errors) === null || _a === void 0 ? void 0 : _a.join(', '),
            };
        }
        var optionId = "".concat(btDslJson.name, "@").concat(btDslJson.version);
        // Critical fix #2: Check if option already exists
        if (this.enhancedSpecs.has(optionId)) {
            return { ok: false, error: 'version_exists' };
        }
        // Secondary improvement: Check veto list and global budget
        if (this.veto.has(optionId)) {
            return { ok: false, error: 'option_vetoed' };
        }
        if (this.getShadowOptions().length >= this.maxShadowActive) {
            return { ok: false, error: 'max_shadow_active' };
        }
        // Critical fix #3: Compute real permissions from leaf composition
        var permissions = this.computeOptionPermissions(parseResult.compiled);
        // Create enhanced spec with shadow configuration
        var enhancedSpec = {
            name: btDslJson.name,
            version: btDslJson.version,
            status: 'shadow',
            provenance: provenance,
            permissions: permissions,
            shadowConfig: shadowConfig,
        };
        this.enhancedSpecs.set(optionId, enhancedSpec);
        this.shadowRuns.set(optionId, []);
        this.optionDefs.set(optionId, btDslJson); // Store definition
        // Secondary improvement: Audit logging
        this.log('register_option', optionId, provenance.author, {
            status: 'shadow',
            permissions: permissions,
            shadowConfig: shadowConfig,
        });
        return { ok: true, id: optionId };
    };
    // ============================================================================
    // Shadow Run Execution
    // ============================================================================
    /**
     * Execute a shadow run for an option
     */
    EnhancedRegistry.prototype.executeShadowRun = function (optionId, leafContext, abortSignal) {
        return __awaiter(this, void 0, void 0, function () {
            var spec, startTime, runId, compiled, result, durationMs, shadowResult, runs, error_1, durationMs, execErr, shadowResult, runs;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        spec = this.enhancedSpecs.get(optionId);
                        if (!spec || spec.status !== 'shadow') {
                            throw new Error("Option ".concat(optionId, " not found or not in shadow status"));
                        }
                        // Critical fix #6: Quota enforcement on execution
                        if (!this.checkQuota(optionId)) {
                            return [2 /*return*/, {
                                    id: "".concat(optionId, "-").concat(Date.now(), "-quota"),
                                    timestamp: Date.now(),
                                    status: 'timeout',
                                    durationMs: 0,
                                    error: {
                                        code: 'permission.denied',
                                        detail: 'quota_exceeded',
                                        retryable: true,
                                    },
                                }];
                        }
                        // Critical fix #5: Circuit breaker for bad shadows
                        if (this.inCooldown(optionId)) {
                            return [2 /*return*/, {
                                    id: "".concat(optionId, "-").concat(Date.now(), "-cooldown"),
                                    timestamp: Date.now(),
                                    status: 'timeout',
                                    durationMs: 0,
                                    error: {
                                        code: 'unknown',
                                        detail: 'circuit_open',
                                        retryable: true,
                                    },
                                }];
                        }
                        startTime = node_perf_hooks_1.performance.now();
                        runId = "".concat(optionId, "-").concat(Date.now(), "-").concat(Math.random()
                            .toString(36)
                            .substring(2, 9));
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 4, , 6]);
                        compiled = this.ensureCompiled(optionId);
                        return [4 /*yield*/, this.btParser.execute(compiled, this.leafFactory, leafContext, abortSignal)];
                    case 2:
                        result = _c.sent();
                        durationMs = node_perf_hooks_1.performance.now() - startTime;
                        shadowResult = {
                            id: runId,
                            timestamp: Date.now(),
                            status: result.status === 'success' ? 'success' : 'failure',
                            durationMs: durationMs,
                            error: result.error,
                            metrics: {
                                nodeExecutions: ((_a = result.metrics) === null || _a === void 0 ? void 0 : _a.nodeExecutions) || 0,
                                leafExecutions: ((_b = result.metrics) === null || _b === void 0 ? void 0 : _b.leafExecutions) || 0,
                            },
                        };
                        runs = this.shadowRuns.get(optionId) || [];
                        runs.push(shadowResult);
                        this.shadowRuns.set(optionId, runs);
                        // Critical fix #5: Check for failing streak and set cooldown
                        if (this.failingStreak(optionId)) {
                            this.cb.set(optionId, Date.now() + 5 * 60000); // 5 min cooldown
                        }
                        // Check for auto-promotion/retirement
                        return [4 /*yield*/, this.checkShadowPromotion(optionId)];
                    case 3:
                        // Check for auto-promotion/retirement
                        _c.sent();
                        // Secondary improvement: Audit logging
                        this.log('shadow_run', optionId, 'system', {
                            runId: runId,
                            status: shadowResult.status,
                            durationMs: durationMs,
                        });
                        return [2 /*return*/, shadowResult];
                    case 4:
                        error_1 = _c.sent();
                        durationMs = node_perf_hooks_1.performance.now() - startTime;
                        execErr = error_1 && typeof error_1 === 'object' && 'code' in error_1
                            ? error_1
                            : (0, leaf_contracts_1.createExecError)({
                                code: 'unknown',
                                detail: String(error_1),
                                retryable: false,
                            });
                        shadowResult = {
                            id: runId,
                            timestamp: Date.now(),
                            status: execErr.code === 'aborted' ? 'timeout' : 'failure',
                            durationMs: durationMs,
                            error: execErr,
                        };
                        runs = this.shadowRuns.get(optionId) || [];
                        runs.push(shadowResult);
                        this.shadowRuns.set(optionId, runs);
                        // Critical fix #5: Check for failing streak and set cooldown
                        if (this.failingStreak(optionId)) {
                            this.cb.set(optionId, Date.now() + 5 * 60000); // 5 min cooldown
                        }
                        // Check for auto-retirement
                        return [4 /*yield*/, this.checkShadowPromotion(optionId)];
                    case 5:
                        // Check for auto-retirement
                        _c.sent();
                        // Secondary improvement: Audit logging
                        this.log('shadow_run', optionId, 'system', {
                            runId: runId,
                            status: shadowResult.status,
                            durationMs: durationMs,
                            error: execErr.code,
                        });
                        return [2 /*return*/, shadowResult];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================================
    // Shadow Promotion Pipeline
    // ============================================================================
    /**
     * Check if an option should be promoted or retired based on shadow run statistics
     */
    EnhancedRegistry.prototype.checkShadowPromotion = function (optionId) {
        return __awaiter(this, void 0, void 0, function () {
            var spec, stats, _a, successThreshold, failureThreshold, maxShadowRuns, _b, minShadowRuns;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        spec = this.enhancedSpecs.get(optionId);
                        if (!spec || spec.status !== 'shadow' || !spec.shadowConfig) {
                            return [2 /*return*/];
                        }
                        stats = this.getShadowStats(optionId);
                        _a = spec.shadowConfig, successThreshold = _a.successThreshold, failureThreshold = _a.failureThreshold, maxShadowRuns = _a.maxShadowRuns, _b = _a.minShadowRuns, minShadowRuns = _b === void 0 ? 3 : _b;
                        if (!(stats.totalRuns >= minShadowRuns &&
                            stats.successRate >= successThreshold)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.promoteOption(optionId, 'auto_promotion')];
                    case 1:
                        _c.sent();
                        return [3 /*break*/, 4];
                    case 2:
                        if (!(stats.totalRuns >= maxShadowRuns &&
                            stats.successRate <= failureThreshold)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.retireOption(optionId, 'auto_retirement')];
                    case 3:
                        _c.sent();
                        _c.label = 4;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Manually promote an option from shadow to active
     */
    EnhancedRegistry.prototype.promoteOption = function (optionId, reason) {
        return __awaiter(this, void 0, void 0, function () {
            var spec, healthy;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        spec = this.enhancedSpecs.get(optionId);
                        if (!spec || spec.status !== 'shadow') {
                            return [2 /*return*/, false];
                        }
                        return [4 /*yield*/, this.performHealthCheck(optionId)];
                    case 1:
                        healthy = _a.sent();
                        if (!healthy) {
                            return [2 /*return*/, false];
                        }
                        // Critical fix #2: Enforce legal transitions
                        if (!this.legalTransition(spec.status, 'active')) {
                            return [2 /*return*/, false];
                        }
                        // Update status
                        spec.status = 'active';
                        this.enhancedSpecs.set(optionId, spec);
                        // Secondary improvement: Audit logging
                        this.log('promote_option', optionId, 'system', { reason: reason });
                        // Log promotion
                        console.log("Option ".concat(optionId, " promoted to active: ").concat(reason));
                        return [2 /*return*/, true];
                }
            });
        });
    };
    /**
     * Retire an option
     */
    EnhancedRegistry.prototype.retireOption = function (optionId, reason) {
        return __awaiter(this, void 0, void 0, function () {
            var spec;
            return __generator(this, function (_a) {
                spec = this.enhancedSpecs.get(optionId);
                if (!spec) {
                    return [2 /*return*/, false];
                }
                // Critical fix #2: Enforce legal transitions
                if (!this.legalTransition(spec.status, 'retired')) {
                    return [2 /*return*/, false];
                }
                // Update status
                spec.status = 'retired';
                this.enhancedSpecs.set(optionId, spec);
                // Secondary improvement: Audit logging
                this.log('retire_option', optionId, 'system', { reason: reason });
                // Log retirement
                console.log("Option ".concat(optionId, " retired: ").concat(reason));
                return [2 /*return*/, true];
            });
        });
    };
    // ============================================================================
    // Health Checks and Quotas (S3.2)
    // ============================================================================
    /**
     * Register a health check for an option
     */
    EnhancedRegistry.prototype.registerHealthCheck = function (optionId, checkFn) {
        this.healthChecks.set(optionId, checkFn);
    };
    /**
     * Perform health check for an option
     */
    EnhancedRegistry.prototype.performHealthCheck = function (optionId) {
        return __awaiter(this, void 0, void 0, function () {
            var checkFn, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        checkFn = this.healthChecks.get(optionId);
                        if (!checkFn) {
                            return [2 /*return*/, true]; // No health check registered
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, checkFn()];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3:
                        error_2 = _a.sent();
                        console.error("Health check failed for ".concat(optionId, ":"), error_2);
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Set quota for an option
     */
    EnhancedRegistry.prototype.setQuota = function (optionId, limit, resetIntervalMs) {
        if (resetIntervalMs === void 0) { resetIntervalMs = 60000; }
        this.quotas.set(optionId, {
            used: 0,
            limit: limit,
            resetTime: Date.now() + resetIntervalMs,
        });
    };
    /**
     * Check and update quota
     */
    EnhancedRegistry.prototype.checkQuota = function (optionId) {
        var quota = this.quotas.get(optionId);
        if (!quota) {
            return true; // No quota set
        }
        // Reset quota if interval has passed
        if (Date.now() > quota.resetTime) {
            quota.used = 0;
            quota.resetTime = Date.now() + 60000; // Reset to 1 minute from now
        }
        if (quota.used >= quota.limit) {
            return false; // Quota exceeded
        }
        quota.used++;
        return true;
    };
    // ============================================================================
    // Statistics and Monitoring
    // ============================================================================
    /**
     * Get shadow run statistics for an option
     */
    EnhancedRegistry.prototype.getShadowStats = function (optionId) {
        var runs = this.shadowRuns.get(optionId) || [];
        var totalRuns = runs.length;
        var successfulRuns = runs.filter(function (r) { return r.status === 'success'; }).length;
        var failedRuns = runs.filter(function (r) { return r.status === 'failure'; }).length;
        var timeoutRuns = runs.filter(function (r) { return r.status === 'timeout'; }).length;
        var averageDurationMs = totalRuns > 0
            ? runs.reduce(function (sum, r) { return sum + r.durationMs; }, 0) / totalRuns
            : 0;
        var successRate = totalRuns > 0 ? successfulRuns / totalRuns : 0;
        var lastRunTimestamp = totalRuns > 0 ? Math.max.apply(Math, runs.map(function (r) { return r.timestamp; })) : 0;
        return {
            totalRuns: totalRuns,
            successfulRuns: successfulRuns,
            failedRuns: failedRuns,
            timeoutRuns: timeoutRuns,
            averageDurationMs: averageDurationMs,
            successRate: successRate,
            lastRunTimestamp: lastRunTimestamp,
        };
    };
    /**
     * Get all shadow options
     */
    EnhancedRegistry.prototype.getShadowOptions = function () {
        return Array.from(this.enhancedSpecs.entries())
            .filter(function (_a) {
            var toBeNull = _a[0], spec = _a[1];
            console.log('toBeNull', toBeNull);
            return spec.status === 'shadow';
        })
            .map(function (_a) {
            var id = _a[0];
            return id;
        });
    };
    /**
     * Get all active options
     */
    EnhancedRegistry.prototype.getActiveOptions = function () {
        return Array.from(this.enhancedSpecs.entries())
            .filter(function (_a) {
            var toBeNull = _a[0], spec = _a[1];
            console.log('toBeNull', toBeNull);
            return spec.status === 'active';
        })
            .map(function (_a) {
            var id = _a[0];
            return id;
        });
    };
    /**
     * Secondary improvement #13: Make status queries return structured objects
     */
    EnhancedRegistry.prototype.getActiveOptionsDetailed = function () {
        var _this = this;
        return __spreadArray([], this.enhancedSpecs.entries(), true).filter(function (_a) {
            var toBeNull = _a[0], spec = _a[1];
            console.log('toBeNull', toBeNull);
            return spec.status === 'active';
        })
            .map(function (_a) {
            var id = _a[0], spec = _a[1];
            return ({ id: id, spec: spec, stats: _this.getShadowStats(id) });
        });
    };
    /**
     * Secondary improvement #15: Revoke an option (sticky status)
     */
    EnhancedRegistry.prototype.revokeOption = function (optionId, reason) {
        return __awaiter(this, void 0, void 0, function () {
            var spec;
            return __generator(this, function (_a) {
                spec = this.enhancedSpecs.get(optionId);
                if (!spec) {
                    return [2 /*return*/, false];
                }
                // Critical fix #2: Enforce legal transitions
                if (!this.legalTransition(spec.status, 'revoked')) {
                    return [2 /*return*/, false];
                }
                // Update status
                spec.status = 'revoked';
                this.enhancedSpecs.set(optionId, spec);
                // Secondary improvement #15: Clear compiled cache and definitions upon revoke
                this.compiled.delete(optionId);
                this.optionDefs.delete(optionId);
                // Secondary improvement: Audit logging
                this.log('revoke_option', optionId, 'system', { reason: reason });
                // Log revocation
                console.log("Option ".concat(optionId, " revoked: ").concat(reason));
                return [2 /*return*/, true];
            });
        });
    };
    /**
     * Secondary improvement: Add option to veto list
     */
    EnhancedRegistry.prototype.addToVetoList = function (optionId) {
        this.veto.add(optionId);
        this.log('add_to_veto', optionId, 'system');
    };
    /**
     * Secondary improvement: Remove option from veto list
     */
    EnhancedRegistry.prototype.removeFromVetoList = function (optionId) {
        this.veto.delete(optionId);
        this.log('remove_from_veto', optionId, 'system');
    };
    /**
     * Secondary improvement: Get audit log
     */
    EnhancedRegistry.prototype.getAuditLog = function () {
        return __spreadArray([], this.audit, true);
    };
    // ============================================================================
    // Utility Methods
    // ============================================================================
    /**
     * Validate provenance information
     */
    EnhancedRegistry.prototype.validateProvenance = function (provenance) {
        return !!(provenance.author && provenance.codeHash && provenance.createdAt);
    };
    /**
     * Critical fix #2: Enforce immutable versioning and legal status transitions
     */
    EnhancedRegistry.prototype.legalTransition = function (from, to) {
        var allowed = {
            shadow: ['active', 'retired', 'revoked'],
            active: ['retired', 'revoked'],
            retired: ['revoked'],
            revoked: [],
        };
        return allowed[from].includes(to);
    };
    /**
     * Secondary improvement: Audit logging
     */
    EnhancedRegistry.prototype.log = function (op, id, who, detail) {
        if (who === void 0) { who = 'system'; }
        this.audit.push({ ts: Date.now(), op: op, id: id, who: who, detail: detail });
    };
    /**
     * Critical fix #2: Circuit breaker for failing streaks
     */
    EnhancedRegistry.prototype.failingStreak = function (optionId, n) {
        if (n === void 0) { n = 3; }
        var runs = this.shadowRuns.get(optionId) || [];
        if (runs.length < n)
            return false;
        return runs.slice(-n).every(function (r) { return r.status !== 'success'; });
    };
    /**
     * Critical fix #2: Check if option is in cooldown
     */
    EnhancedRegistry.prototype.inCooldown = function (optionId) {
        var _a;
        var until = (_a = this.cb.get(optionId)) !== null && _a !== void 0 ? _a : 0;
        return Date.now() < until;
    };
    /**
     * Secondary improvement: Ensure compiled BT is cached
     */
    EnhancedRegistry.prototype.ensureCompiled = function (optionId) {
        var _a;
        var node = this.compiled.get(optionId);
        if (node)
            return node;
        var json = this.getOptionDefinition(optionId);
        if (!json) {
            throw new Error("Option definition not found: ".concat(optionId));
        }
        var parse = this.btParser.parse(json, this.leafFactory);
        if (!parse.valid || !parse.compiled) {
            throw new Error((_a = parse.errors) === null || _a === void 0 ? void 0 : _a.join(', '));
        }
        node = parse.compiled;
        this.compiled.set(optionId, node);
        return node;
    };
    /**
     * Critical fix #3: Compute real permissions for an option based on its leaf composition
     */
    EnhancedRegistry.prototype.computeOptionPermissions = function (rootNode) {
        var _this = this;
        var perms = new Set();
        var visit = function (n) {
            if (!n)
                return;
            if (n.type === 'Leaf' && n.name) {
                // resolve "latest" is OK in shadow; in production pin version
                var impl = _this.leafFactory.get(n.name);
                if (impl) {
                    impl.spec.permissions.forEach(function (p) { return perms.add(p); });
                }
            }
            (n.children || []).forEach(visit);
            if (n.child)
                visit(n.child);
        };
        visit(rootNode);
        return __spreadArray([], perms, true);
    };
    /**
     * Critical fix #1: Get option definition from stored definitions
     */
    EnhancedRegistry.prototype.getOptionDefinition = function (optionId) {
        return this.optionDefs.get(optionId);
    };
    /**
     * Get leaf factory for direct access
     */
    EnhancedRegistry.prototype.getLeafFactory = function () {
        return this.leafFactory;
    };
    /**
     * Get BT parser for direct access
     */
    EnhancedRegistry.prototype.getBTParser = function () {
        return this.btParser;
    };
    /**
     * Clear all data (for testing)
     */
    EnhancedRegistry.prototype.clear = function () {
        this.leafFactory.clear();
        this.enhancedSpecs.clear();
        this.shadowRuns.clear();
        this.healthChecks.clear();
        this.quotas.clear();
        this.optionDefs.clear();
        this.cb.clear();
        this.audit = [];
        this.compiled.clear();
        this.veto.clear();
    };
    // ============================================================================
    // Capability Management Methods (for API endpoints)
    // ============================================================================
    /**
     * Promote a capability from shadow to active
     */
    EnhancedRegistry.prototype.promoteCapability = function (capabilityId) {
        return __awaiter(this, void 0, void 0, function () {
            var spec, runs, successRate;
            var _a, _b;
            return __generator(this, function (_c) {
                spec = this.enhancedSpecs.get(capabilityId);
                if (!spec) {
                    return [2 /*return*/, { success: false, error: 'Capability not found' }];
                }
                if (spec.status !== 'shadow') {
                    return [2 /*return*/, { success: false, error: 'Capability is not in shadow status' }];
                }
                runs = this.shadowRuns.get(capabilityId) || [];
                if (runs.length < (((_a = spec.shadowConfig) === null || _a === void 0 ? void 0 : _a.minShadowRuns) || 3)) {
                    return [2 /*return*/, { success: false, error: 'Insufficient shadow runs for promotion' }];
                }
                successRate = runs.filter(function (r) { return r.status === 'success'; }).length / runs.length;
                if (successRate < (((_b = spec.shadowConfig) === null || _b === void 0 ? void 0 : _b.successThreshold) || 0.7)) {
                    return [2 /*return*/, { success: false, error: 'Success rate below threshold for promotion' }];
                }
                // Promote to active
                spec.status = 'active';
                this.enhancedSpecs.set(capabilityId, spec);
                this.log('promote_capability', capabilityId, 'system', { from: 'shadow', to: 'active' });
                return [2 /*return*/, { success: true }];
            });
        });
    };
    /**
     * Retire a capability
     */
    EnhancedRegistry.prototype.retireCapability = function (capabilityId) {
        return __awaiter(this, void 0, void 0, function () {
            var spec;
            return __generator(this, function (_a) {
                spec = this.enhancedSpecs.get(capabilityId);
                if (!spec) {
                    return [2 /*return*/, { success: false, error: 'Capability not found' }];
                }
                spec.status = 'retired';
                this.enhancedSpecs.set(capabilityId, spec);
                this.log('retire_capability', capabilityId, 'system', { from: spec.status, to: 'retired' });
                return [2 /*return*/, { success: true }];
            });
        });
    };
    /**
     * Get capability details
     */
    EnhancedRegistry.prototype.getCapability = function (capabilityId) {
        return __awaiter(this, void 0, void 0, function () {
            var spec, runs, successRate;
            return __generator(this, function (_a) {
                spec = this.enhancedSpecs.get(capabilityId);
                if (!spec) {
                    return [2 /*return*/, null];
                }
                runs = this.shadowRuns.get(capabilityId) || [];
                successRate = runs.length > 0
                    ? runs.filter(function (r) { return r.status === 'success'; }).length / runs.length
                    : 0;
                return [2 /*return*/, {
                        id: capabilityId,
                        name: spec.name,
                        version: spec.version,
                        status: spec.status,
                        provenance: spec.provenance,
                        permissions: spec.permissions,
                        shadowConfig: spec.shadowConfig,
                        shadowRuns: runs.length,
                        successRate: successRate,
                        lastRun: runs.length > 0 ? runs[runs.length - 1] : null,
                    }];
            });
        });
    };
    /**
     * List capabilities with optional filtering
     */
    EnhancedRegistry.prototype.listCapabilities = function (filters) {
        return __awaiter(this, void 0, void 0, function () {
            var capabilities, _i, _a, _b, id, spec, runs, successRate;
            return __generator(this, function (_c) {
                capabilities = [];
                for (_i = 0, _a = this.enhancedSpecs.entries(); _i < _a.length; _i++) {
                    _b = _a[_i], id = _b[0], spec = _b[1];
                    if ((filters === null || filters === void 0 ? void 0 : filters.status) && spec.status !== filters.status) {
                        continue;
                    }
                    runs = this.shadowRuns.get(id) || [];
                    successRate = runs.length > 0
                        ? runs.filter(function (r) { return r.status === 'success'; }).length / runs.length
                        : 0;
                    capabilities.push({
                        id: id,
                        name: spec.name,
                        version: spec.version,
                        status: spec.status,
                        permissions: spec.permissions,
                        shadowRuns: runs.length,
                        successRate: successRate,
                        lastRun: runs.length > 0 ? runs[runs.length - 1] : null,
                    });
                }
                return [2 /*return*/, capabilities];
            });
        });
    };
    /**
     * Get registry statistics
     */
    EnhancedRegistry.prototype.getStatistics = function () {
        return __awaiter(this, void 0, void 0, function () {
            var totalCapabilities, activeCapabilities, shadowCapabilities, retiredCapabilities, totalShadowRuns, successfulShadowRuns;
            return __generator(this, function (_a) {
                totalCapabilities = this.enhancedSpecs.size;
                activeCapabilities = Array.from(this.enhancedSpecs.values()).filter(function (s) { return s.status === 'active'; }).length;
                shadowCapabilities = Array.from(this.enhancedSpecs.values()).filter(function (s) { return s.status === 'shadow'; }).length;
                retiredCapabilities = Array.from(this.enhancedSpecs.values()).filter(function (s) { return s.status === 'retired'; }).length;
                totalShadowRuns = Array.from(this.shadowRuns.values()).reduce(function (sum, runs) { return sum + runs.length; }, 0);
                successfulShadowRuns = Array.from(this.shadowRuns.values()).reduce(function (sum, runs) {
                    return sum + runs.filter(function (r) { return r.status === 'success'; }).length;
                }, 0);
                return [2 /*return*/, {
                        totalCapabilities: totalCapabilities,
                        activeCapabilities: activeCapabilities,
                        shadowCapabilities: shadowCapabilities,
                        retiredCapabilities: retiredCapabilities,
                        totalShadowRuns: totalShadowRuns,
                        successfulShadowRuns: successfulShadowRuns,
                        overallSuccessRate: totalShadowRuns > 0 ? successfulShadowRuns / totalShadowRuns : 0,
                        auditLogEntries: this.audit.length,
                    }];
            });
        });
    };
    return EnhancedRegistry;
}());
exports.EnhancedRegistry = EnhancedRegistry;

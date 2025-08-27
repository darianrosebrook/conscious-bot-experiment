"use strict";
/**
 * Leaf Factory - Registry and execution for leaf implementations
 *
 * Provides centralized registration, validation, and execution of leaf implementations
 * with rate limiting, schema validation, and error handling.
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
exports.LeafFactory = void 0;
var ajv_1 = require("ajv");
var node_perf_hooks_1 = require("node:perf_hooks");
var leaf_contracts_js_1 = require("./leaf-contracts.js");
/**
 * Enhanced Leaf Factory with AJV compilation and rate limiting
 */
var LeafFactory = /** @class */ (function () {
    function LeafFactory() {
        this.ajv = new ajv_1.default({
            allErrors: true,
            useDefaults: true,
            coerceTypes: true,
        });
        this.inputValidators = new Map();
        this.outputValidators = new Map();
        this.registry = new Map();
        this.counters = new Map();
    }
    /**
     * Register a leaf implementation with schema compilation
     */
    LeafFactory.prototype.register = function (leaf) {
        (0, leaf_contracts_js_1.validateLeafImpl)(leaf);
        var key = "".concat(leaf.spec.name, "@").concat(leaf.spec.version);
        if (this.registry.has(key)) {
            return { ok: false, error: 'version_exists' };
        }
        // Compile schemas once
        try {
            this.inputValidators.set(key, this.ajv.compile(leaf.spec.inputSchema));
            if (leaf.spec.outputSchema) {
                this.outputValidators.set(key, this.ajv.compile(leaf.spec.outputSchema));
            }
        }
        catch (error) {
            return {
                ok: false,
                error: "schema_compilation_failed: ".concat(error instanceof Error ? error.message : String(error)),
            };
        }
        // Initialize rate limiter counter
        this.counters.set(key, 0);
        this.registry.set(key, leaf);
        return { ok: true, id: key };
    };
    /**
     * Get a leaf by name and optional version
     */
    LeafFactory.prototype.get = function (name, version) {
        if (version)
            return this.registry.get("".concat(name, "@").concat(version));
        // return latest by naive semver sort (replace if you add a real semver lib)
        var keys = __spreadArray([], this.registry.keys(), true).filter(function (k) { return k.startsWith("".concat(name, "@")); })
            .sort();
        var last = keys[keys.length - 1];
        return last ? this.registry.get(last) : undefined;
    };
    /**
     * List all registered leaves
     */
    LeafFactory.prototype.listLeaves = function () {
        var leaves = [];
        for (var _i = 0, _a = this.registry.entries(); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], leaf = _b[1];
            var _c = key.split('@'), name_1 = _c[0], version = _c[1];
            leaves.push({
                name: name_1,
                version: version,
                spec: leaf.spec,
            });
        }
        return leaves;
    };
    /**
     * Execute a leaf with validation and rate limiting
     */
    LeafFactory.prototype.run = function (name, version, ctx, args, opts) {
        return __awaiter(this, void 0, void 0, function () {
            var key, leaf, nowMin, counterKey, used, limit, validateIn, t0, beforeState, _a, res, validateOut, afterState, postconditionResult, e_1;
            var _b, _c;
            var _d, _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        key = "".concat(name, "@").concat(version);
                        leaf = this.registry.get(key);
                        if (!leaf) {
                            return [2 /*return*/, {
                                    status: 'failure',
                                    error: {
                                        code: 'unknown',
                                        retryable: false,
                                        detail: 'leaf_not_found',
                                    },
                                }];
                        }
                        nowMin = Math.floor(Date.now() / 60000);
                        counterKey = "".concat(key, ":").concat(nowMin);
                        used = (_d = this.counters.get(counterKey)) !== null && _d !== void 0 ? _d : 0;
                        limit = (_e = leaf.spec.rateLimitPerMin) !== null && _e !== void 0 ? _e : 60;
                        if (used >= limit) {
                            return [2 /*return*/, {
                                    status: 'failure',
                                    error: {
                                        code: 'permission.denied',
                                        retryable: true,
                                        detail: 'rate_limited',
                                    },
                                }];
                        }
                        this.counters.set(counterKey, used + 1);
                        validateIn = this.inputValidators.get(key);
                        if (!validateIn(args)) {
                            return [2 /*return*/, {
                                    status: 'failure',
                                    error: {
                                        code: 'unknown',
                                        retryable: false,
                                        detail: this.ajv.errorsText(validateIn.errors),
                                    },
                                }];
                        }
                        t0 = node_perf_hooks_1.performance.now();
                        if (!leaf.spec.postconditions) return [3 /*break*/, 3];
                        _b = {};
                        return [4 /*yield*/, ctx.inventory()];
                    case 1:
                        _b.inventory = _g.sent();
                        return [4 /*yield*/, ctx.snapshot()];
                    case 2:
                        _a = (_b.snapshot = _g.sent(),
                            _b);
                        return [3 /*break*/, 4];
                    case 3:
                        _a = null;
                        _g.label = 4;
                    case 4:
                        beforeState = _a;
                        _g.label = 5;
                    case 5:
                        _g.trys.push([5, 11, , 12]);
                        return [4 /*yield*/, leaf.run(ctx, args, opts)];
                    case 6:
                        res = _g.sent();
                        // Validate output if present
                        if (res.status === 'success' && leaf.spec.outputSchema) {
                            validateOut = this.outputValidators.get(key);
                            if (!validateOut(res.result)) {
                                return [2 /*return*/, {
                                        status: 'failure',
                                        error: {
                                            code: 'unknown',
                                            retryable: false,
                                            detail: this.ajv.errorsText(validateOut.errors),
                                        },
                                    }];
                            }
                        }
                        if (!(res.status === 'success' && leaf.spec.postconditions && beforeState)) return [3 /*break*/, 10];
                        _c = {};
                        return [4 /*yield*/, ctx.inventory()];
                    case 7:
                        _c.inventory = _g.sent();
                        return [4 /*yield*/, ctx.snapshot()];
                    case 8:
                        afterState = (_c.snapshot = _g.sent(),
                            _c);
                        return [4 /*yield*/, (0, leaf_contracts_js_1.verifyPostconditions)(leaf.spec.postconditions, beforeState, afterState, this.ajv)];
                    case 9:
                        postconditionResult = _g.sent();
                        if (!postconditionResult.ok) {
                            return [2 /*return*/, {
                                    status: 'failure',
                                    error: {
                                        code: 'unknown',
                                        retryable: false,
                                        detail: "Postcondition verification failed: ".concat(postconditionResult.detail),
                                    },
                                }];
                        }
                        _g.label = 10;
                    case 10:
                        // Ensure metrics are present
                        (_f = res.metrics) !== null && _f !== void 0 ? _f : (res.metrics = {
                            durationMs: node_perf_hooks_1.performance.now() - t0,
                            retries: 0,
                            timeouts: 0,
                        });
                        res.metrics.durationMs = node_perf_hooks_1.performance.now() - t0;
                        return [2 /*return*/, res];
                    case 11:
                        e_1 = _g.sent();
                        return [2 /*return*/, {
                                status: 'failure',
                                error: (0, leaf_contracts_js_1.createExecError)(e_1),
                            }];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Validate arguments against a leaf's input schema
     */
    LeafFactory.prototype.validateArgs = function (name, version, args) {
        var key = "".concat(name, "@").concat(version);
        var validator = this.inputValidators.get(key);
        if (!validator)
            return false;
        return validator(args);
    };
    /**
     * Get all registered leaves
     */
    LeafFactory.prototype.getAll = function () {
        return Array.from(this.registry.values());
    };
    /**
     * Get all leaf names (without versions)
     */
    LeafFactory.prototype.getNames = function () {
        var names = new Set();
        for (var _i = 0, _a = this.registry.keys(); _i < _a.length; _i++) {
            var key = _a[_i];
            var atIndex = key.indexOf('@');
            if (atIndex > 0) {
                names.add(key.substring(0, atIndex));
            }
        }
        return Array.from(names);
    };
    /**
     * Check if a leaf exists
     */
    LeafFactory.prototype.has = function (name, version) {
        return this.get(name, version) !== undefined;
    };
    /**
     * Remove a leaf from the registry
     */
    LeafFactory.prototype.remove = function (name, version) {
        if (version) {
            // Remove specific version
            var key = "".concat(name, "@").concat(version);
            var removed_1 = this.registry.delete(key) ? 1 : 0;
            if (removed_1) {
                this.inputValidators.delete(key);
                this.outputValidators.delete(key);
            }
            return removed_1;
        }
        // Remove all versions
        var removed = 0;
        var keysToRemove = [];
        for (var _i = 0, _a = this.registry.keys(); _i < _a.length; _i++) {
            var key = _a[_i];
            if (key.startsWith("".concat(name, "@"))) {
                keysToRemove.push(key);
            }
        }
        for (var _b = 0, keysToRemove_1 = keysToRemove; _b < keysToRemove_1.length; _b++) {
            var key = keysToRemove_1[_b];
            if (this.registry.delete(key)) {
                this.inputValidators.delete(key);
                this.outputValidators.delete(key);
                removed++;
            }
        }
        return removed;
    };
    /**
     * Clear all registered leaves
     */
    LeafFactory.prototype.clear = function () {
        this.registry.clear();
        this.inputValidators.clear();
        this.outputValidators.clear();
        this.counters.clear();
    };
    /**
     * Get the size of the registry
     */
    LeafFactory.prototype.size = function () {
        return this.registry.size;
    };
    /**
     * Get rate limit usage for a leaf
     */
    LeafFactory.prototype.getRateLimitUsage = function (name, version) {
        var _a, _b;
        var key = "".concat(name, "@").concat(version);
        var leaf = this.registry.get(key);
        if (!leaf)
            return { used: 0, limit: 0 };
        var nowMin = Math.floor(Date.now() / 60000);
        var counterKey = "".concat(key, ":").concat(nowMin);
        var used = (_a = this.counters.get(counterKey)) !== null && _a !== void 0 ? _a : 0;
        var limit = (_b = leaf.spec.rateLimitPerMin) !== null && _b !== void 0 ? _b : 60;
        return { used: used, limit: limit };
    };
    return LeafFactory;
}());
exports.LeafFactory = LeafFactory;

"use strict";
/**
 * Dynamic Creation Flow - Impasse detection and LLM option proposal system
 *
 * Implements impasse detection with specific thresholds and debouncing,
 * auto-retirement policies based on win rates, and rate-limited proposals
 * to prevent spam.
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
exports.DynamicCreationFlow = void 0;
var bt_dsl_parser_js_1 = require("./bt-dsl-parser.js");
var llm_integration_js_1 = require("./llm-integration.js");
// ============================================================================
// Dynamic Creation Flow
// ============================================================================
/**
 * Dynamic creation flow with impasse detection and LLM integration
 */
var DynamicCreationFlow = /** @class */ (function () {
    function DynamicCreationFlow(registry, llmInterface, impasseConfig, autoRetirementConfig) {
        this.registry = registry;
        this.btParser = new bt_dsl_parser_js_1.BTDSLParser();
        this.llmInterface = llmInterface || new llm_integration_js_1.HRMLLMInterface();
        this.impasseConfig = __assign({ failureThreshold: 3, timeWindowMs: 60000, debounceMs: 5000, maxProposalsPerHour: 10 }, impasseConfig);
        this.autoRetirementConfig = __assign({ winRateThreshold: 0.6, minRunsBeforeRetirement: 5, evaluationWindowMs: 3600000, gracePeriodMs: 300000 }, autoRetirementConfig);
        this.impasseStates = new Map();
        this.proposalHistory = new Map();
    }
    // ============================================================================
    // Impasse Detection
    // ============================================================================
    /**
     * Check if current situation constitutes an impasse
     */
    DynamicCreationFlow.prototype.checkImpasse = function (taskId, failure) {
        var now = Date.now();
        var state = this.impasseStates.get(taskId) || this.createInitialImpasseState();
        // Update failure count
        if (state.lastFailureTime === 0 ||
            now - state.lastFailureTime < this.impasseConfig.timeWindowMs) {
            state.consecutiveFailures++;
        }
        else {
            state.consecutiveFailures = 1;
        }
        state.lastFailureTime = now;
        // Check rate limiting
        if (now > state.proposalResetTime) {
            state.proposalCount = 0;
            state.proposalResetTime = now + 3600000; // 1 hour
        }
        // Determine if this is an impasse
        var isImpasse = state.consecutiveFailures >= this.impasseConfig.failureThreshold &&
            now - state.lastProposalTime >= this.impasseConfig.debounceMs &&
            state.proposalCount < this.impasseConfig.maxProposalsPerHour;
        // Update state
        this.impasseStates.set(taskId, state);
        return {
            isImpasse: isImpasse,
            reason: isImpasse
                ? "Consecutive failures: ".concat(state.consecutiveFailures)
                : undefined,
            metrics: {
                consecutiveFailures: state.consecutiveFailures,
                timeSinceLastFailure: now - state.lastFailureTime,
                timeSinceLastProposal: now - state.lastProposalTime,
                proposalsThisHour: state.proposalCount,
            },
        };
    };
    /**
     * Create initial impasse state
     */
    DynamicCreationFlow.prototype.createInitialImpasseState = function () {
        var now = Date.now();
        return {
            consecutiveFailures: 0,
            lastFailureTime: 0,
            lastProposalTime: 0,
            proposalCount: 0,
            proposalResetTime: now + 3600000, // 1 hour from now
        };
    };
    // ============================================================================
    // LLM Option Proposal
    // ============================================================================
    /**
     * Request a new option proposal from LLM
     */
    DynamicCreationFlow.prototype.requestOptionProposal = function (taskId, context, currentTask, recentFailures) {
        return __awaiter(this, void 0, void 0, function () {
            var state, request, proposal, history_1, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        state = this.impasseStates.get(taskId);
                        if (!state) {
                            return [2 /*return*/, null];
                        }
                        // Update proposal count and timestamp
                        state.proposalCount++;
                        state.lastProposalTime = Date.now();
                        this.impasseStates.set(taskId, state);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        request = {
                            taskId: taskId,
                            context: context,
                            currentTask: currentTask,
                            recentFailures: recentFailures,
                        };
                        return [4 /*yield*/, this.llmInterface.proposeOption(request)];
                    case 2:
                        proposal = _a.sent();
                        // Store proposal in history
                        if (proposal) {
                            history_1 = this.proposalHistory.get(taskId) || [];
                            history_1.push({ timestamp: Date.now(), proposal: proposal });
                            this.proposalHistory.set(taskId, history_1);
                        }
                        return [2 /*return*/, proposal];
                    case 3:
                        error_1 = _a.sent();
                        console.error('Failed to request option proposal:', error_1);
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================================
    // Option Registration and Validation
    // ============================================================================
    /**
     * Register a proposed option with shadow configuration
     */
    DynamicCreationFlow.prototype.registerProposedOption = function (proposal, author) {
        return __awaiter(this, void 0, void 0, function () {
            var parseResult, provenance, result;
            var _a;
            return __generator(this, function (_b) {
                try {
                    parseResult = this.btParser.parse(proposal.btDsl, this.registry.getLeafFactory());
                    if (!parseResult.valid) {
                        return [2 /*return*/, {
                                success: false,
                                error: "Invalid BT-DSL: ".concat((_a = parseResult.errors) === null || _a === void 0 ? void 0 : _a.join(', ')),
                            }];
                    }
                    provenance = {
                        author: author,
                        codeHash: this.computeCodeHash(proposal.btDsl),
                        createdAt: new Date().toISOString(),
                        metadata: {
                            confidence: proposal.confidence,
                            estimatedSuccessRate: proposal.estimatedSuccessRate,
                            reasoning: proposal.reasoning,
                        },
                    };
                    result = this.registry.registerOption(proposal.btDsl, provenance, {
                        successThreshold: proposal.estimatedSuccessRate * 0.8, // 80% of estimated rate
                        maxShadowRuns: 10,
                        failureThreshold: proposal.estimatedSuccessRate * 0.5, // 50% of estimated rate
                        minShadowRuns: 3,
                    });
                    if (!result.ok) {
                        return [2 /*return*/, {
                                success: false,
                                error: result.error || 'Registration failed',
                            }];
                    }
                    return [2 /*return*/, {
                            success: true,
                            optionId: result.id,
                        }];
                }
                catch (error) {
                    return [2 /*return*/, {
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error',
                        }];
                }
                return [2 /*return*/];
            });
        });
    };
    // ============================================================================
    // Auto-Retirement Evaluation
    // ============================================================================
    /**
     * Evaluate if an option should be retired based on performance
     */
    DynamicCreationFlow.prototype.evaluateRetirement = function (optionId) {
        var stats = this.registry.getShadowStats(optionId);
        var now = Date.now();
        // Check minimum runs requirement
        if (stats.totalRuns < this.autoRetirementConfig.minRunsBeforeRetirement) {
            return {
                shouldRetire: false,
                currentWinRate: stats.successRate,
                totalRuns: stats.totalRuns,
                lastRunTime: stats.lastRunTimestamp,
            };
        }
        // Check win rate threshold
        var shouldRetire = stats.successRate < this.autoRetirementConfig.winRateThreshold;
        return {
            shouldRetire: shouldRetire,
            reason: shouldRetire
                ? "Win rate ".concat((stats.successRate * 100).toFixed(1), "% below threshold ").concat((this.autoRetirementConfig.winRateThreshold * 100).toFixed(1), "%")
                : undefined,
            currentWinRate: stats.successRate,
            totalRuns: stats.totalRuns,
            lastRunTime: stats.lastRunTimestamp,
        };
    };
    /**
     * Process auto-retirement for all options
     */
    DynamicCreationFlow.prototype.processAutoRetirement = function () {
        return __awaiter(this, void 0, void 0, function () {
            var retiredOptions, shadowOptions, _i, shadowOptions_1, optionId, decision, success;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        retiredOptions = [];
                        shadowOptions = this.registry.getShadowOptions();
                        _i = 0, shadowOptions_1 = shadowOptions;
                        _a.label = 1;
                    case 1:
                        if (!(_i < shadowOptions_1.length)) return [3 /*break*/, 4];
                        optionId = shadowOptions_1[_i];
                        decision = this.evaluateRetirement(optionId);
                        if (!decision.shouldRetire) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.registry.retireOption(optionId, decision.reason || 'Auto-retirement')];
                    case 2:
                        success = _a.sent();
                        if (success) {
                            retiredOptions.push(optionId);
                        }
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, retiredOptions];
                }
            });
        });
    };
    // ============================================================================
    // Utility Methods
    // ============================================================================
    /**
     * Compute code hash for BT-DSL
     */
    DynamicCreationFlow.prototype.computeCodeHash = function (btDsl) {
        var json = JSON.stringify(btDsl, function (key, value) {
            // Sort object keys for deterministic hashing
            if (typeof value === 'object' &&
                value !== null &&
                !Array.isArray(value)) {
                return Object.keys(value)
                    .sort()
                    .reduce(function (obj, key) {
                    obj[key] = value[key];
                    return obj;
                }, {});
            }
            return value;
        });
        // Simple hash function (in production, use crypto.createHash)
        var hash = 0;
        for (var i = 0; i < json.length; i++) {
            var char = json.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    };
    /**
     * Get proposal history for a task
     */
    DynamicCreationFlow.prototype.getProposalHistory = function (taskId) {
        return this.proposalHistory.get(taskId) || [];
    };
    /**
     * Get impasse state for a task
     */
    DynamicCreationFlow.prototype.getImpasseState = function (taskId) {
        return this.impasseStates.get(taskId);
    };
    /**
     * Clear impasse state for a task
     */
    DynamicCreationFlow.prototype.clearImpasseState = function (taskId) {
        this.impasseStates.delete(taskId);
        this.proposalHistory.delete(taskId);
    };
    /**
     * Get registry for direct access
     */
    DynamicCreationFlow.prototype.getRegistry = function () {
        return this.registry;
    };
    /**
     * Clear all data (for testing)
     */
    DynamicCreationFlow.prototype.clear = function () {
        this.impasseStates.clear();
        this.proposalHistory.clear();
    };
    /**
     * Propose a new capability using LLM integration
     * This is the core method for dynamic capability creation
     */
    DynamicCreationFlow.prototype.proposeNewCapability = function (taskId, context, currentTask, recentFailures) {
        return __awaiter(this, void 0, void 0, function () {
            var impasseResult, request, proposal, parseResult, registrationResult, history_2, state, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        impasseResult = this.checkImpasse(taskId, recentFailures[0] || {
                            code: 'unknown',
                            detail: 'no_failure_data',
                            retryable: false,
                        });
                        if (!impasseResult.isImpasse) {
                            console.log("No impasse detected for task ".concat(taskId, ", skipping proposal"));
                            return [2 /*return*/, null];
                        }
                        request = {
                            taskId: taskId,
                            context: context,
                            currentTask: currentTask,
                            recentFailures: recentFailures,
                        };
                        return [4 /*yield*/, this.llmInterface.proposeOption(request)];
                    case 1:
                        proposal = _a.sent();
                        if (!proposal) {
                            console.log("LLM returned no proposal for task ".concat(taskId));
                            return [2 /*return*/, null];
                        }
                        parseResult = this.btParser.parse(proposal.btDsl, this.registry.getLeafFactory());
                        if (!parseResult.valid) {
                            console.warn("LLM proposed invalid BT-DSL for task ".concat(taskId, ":"), parseResult.errors);
                            return [2 /*return*/, null];
                        }
                        registrationResult = this.registry.registerOption(proposal.btDsl, {
                            author: 'llm',
                            createdAt: new Date().toISOString(),
                            codeHash: this.computeCodeHash(proposal.btDsl),
                        }, {
                            successThreshold: 0.8,
                            maxShadowRuns: 10,
                            failureThreshold: 0.3,
                            minShadowRuns: 3,
                        });
                        if (!registrationResult.ok) {
                            console.warn("Failed to register proposed option for task ".concat(taskId, ":"), registrationResult.error);
                            return [2 /*return*/, null];
                        }
                        history_2 = this.proposalHistory.get(taskId) || [];
                        history_2.push({
                            timestamp: Date.now(),
                            proposal: proposal,
                        });
                        this.proposalHistory.set(taskId, history_2);
                        state = this.impasseStates.get(taskId);
                        if (state) {
                            state.lastProposalTime = Date.now();
                            state.proposalCount++;
                        }
                        console.log("Successfully proposed new capability for task ".concat(taskId, ": ").concat(proposal.name));
                        return [2 /*return*/, proposal];
                    case 2:
                        error_2 = _a.sent();
                        console.error("Error proposing new capability for task ".concat(taskId, ":"), error_2);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return DynamicCreationFlow;
}());
exports.DynamicCreationFlow = DynamicCreationFlow;
// Mock LLM interface moved to test utilities
// See packages/core/src/__tests__/test-utils.ts for MockLLMInterface

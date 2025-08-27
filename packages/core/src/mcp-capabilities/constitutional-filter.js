"use strict";
/**
 * Constitutional Filter - Ethical rule enforcement for capability execution
 *
 * Evaluates capability requests against constitutional rules and safety constraints
 * before execution to ensure ethical and safe behavior.
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
exports.ConstitutionalFilter = void 0;
var events_1 = require("events");
var types_1 = require("./types");
/**
 * Constitutional filtering system that evaluates capability requests
 * against ethical rules and safety constraints before execution.
 */
var ConstitutionalFilter = /** @class */ (function (_super) {
    __extends(ConstitutionalFilter, _super);
    function ConstitutionalFilter() {
        var _this = _super.call(this) || this;
        _this.rules = new Map();
        _this.approvalCache = new Map();
        _this.violationHistory = [];
        _this.initializeDefaultRules();
        return _this;
    }
    /**
     * Initialize with default constitutional rules
     */
    ConstitutionalFilter.prototype.initializeDefaultRules = function () {
        var _this = this;
        var defaultRules = [
            {
                id: 'no_unprovoked_violence',
                name: 'No Unprovoked Violence',
                description: 'Do not attack players or friendly entities without provocation',
                priority: 100,
                enabled: true,
                appliesTo: ['attack_entity', 'use_weapon'],
                safetyTagTriggers: ['destructive'],
                riskLevelThreshold: types_1.RiskLevel.MEDIUM,
                contextConditions: [],
                evaluate: function (capability, request, context) { return __awaiter(_this, void 0, void 0, function () {
                    var _a;
                    return __generator(this, function (_b) {
                        if (capability.category === 'combat' &&
                            !((_a = request.metadata) === null || _a === void 0 ? void 0 : _a.justified)) {
                            return [2 /*return*/, {
                                    passed: false,
                                    severity: 'critical',
                                    message: 'Combat actions require justification',
                                    suggestedAction: 'Provide justification or find non-violent solution',
                                    requiresApproval: true,
                                }];
                        }
                        return [2 /*return*/, {
                                passed: true,
                                severity: 'minor',
                                message: 'No violence concerns',
                            }];
                    });
                }); },
            },
            {
                id: 'no_griefing',
                name: 'No Griefing',
                description: 'Do not destroy player-built structures or valuable resources',
                priority: 90,
                enabled: true,
                appliesTo: ['mine_block', 'break_structure', 'place_lava'],
                safetyTagTriggers: ['destructive', 'permanent_change'],
                riskLevelThreshold: types_1.RiskLevel.MEDIUM,
                contextConditions: [],
                evaluate: function (capability, request, context) { return __awaiter(_this, void 0, void 0, function () {
                    var nearPlayers;
                    return __generator(this, function (_a) {
                        nearPlayers = context.nearbyEntities.filter(function (e) { return e.type === 'player' && e.distance < 50; });
                        if (nearPlayers.length > 0 &&
                            capability.safetyTags.includes('destructive')) {
                            return [2 /*return*/, {
                                    passed: false,
                                    severity: 'major',
                                    message: 'Destructive action near player structures prohibited',
                                    suggestedAction: 'Move away from player areas or find alternative approach',
                                }];
                        }
                        return [2 /*return*/, {
                                passed: true,
                                severity: 'minor',
                                message: 'No griefing concerns',
                            }];
                    });
                }); },
            },
            {
                id: 'respect_property',
                name: 'Respect Property',
                description: 'Do not take items that belong to other players',
                priority: 80,
                enabled: true,
                appliesTo: ['pick_up_item', 'open_chest', 'mine_block'],
                safetyTagTriggers: ['affects_others'],
                riskLevelThreshold: types_1.RiskLevel.LOW,
                contextConditions: [
                    {
                        type: 'social',
                        operator: 'gt',
                        value: 0,
                        description: 'Other players nearby',
                    },
                ],
                evaluate: function (capability, request, context) { return __awaiter(_this, void 0, void 0, function () {
                    var nearPlayers;
                    return __generator(this, function (_a) {
                        nearPlayers = context.nearbyEntities.filter(function (e) { return e.type === 'player' && e.distance < 20; });
                        if (nearPlayers.length > 0 &&
                            (capability.id === 'pick_up_item' || capability.id === 'mine_block')) {
                            return [2 /*return*/, {
                                    passed: false,
                                    severity: 'moderate',
                                    message: 'Taking items near other players may violate property rights',
                                    suggestedAction: 'Ask permission or wait for players to leave area',
                                    requiresApproval: true,
                                }];
                        }
                        return [2 /*return*/, {
                                passed: true,
                                severity: 'minor',
                                message: 'No property concerns',
                            }];
                    });
                }); },
            },
            {
                id: 'avoid_self_harm',
                name: 'Avoid Self-Harm',
                description: 'Do not take actions that would likely cause self-damage',
                priority: 95,
                enabled: true,
                appliesTo: ['jump_from_height', 'enter_lava', 'touch_cactus'],
                safetyTagTriggers: [],
                riskLevelThreshold: types_1.RiskLevel.LOW,
                contextConditions: [
                    {
                        type: 'health',
                        operator: 'lt',
                        value: 0.5,
                        description: 'Low health',
                    },
                ],
                evaluate: function (capability, request, context) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        if (context.agentHealth < 0.3 &&
                            capability.riskLevel >= types_1.RiskLevel.MEDIUM) {
                            return [2 /*return*/, {
                                    passed: false,
                                    severity: 'major',
                                    message: 'Action too risky with low health',
                                    suggestedAction: 'Heal before attempting risky actions',
                                }];
                        }
                        if (context.dangerLevel > 0.7) {
                            return [2 /*return*/, {
                                    passed: false,
                                    severity: 'moderate',
                                    message: 'Environment too dangerous for this action',
                                    suggestedAction: 'Move to safer location first',
                                }];
                        }
                        return [2 /*return*/, {
                                passed: true,
                                severity: 'minor',
                                message: 'No self-harm concerns',
                            }];
                    });
                }); },
            },
            {
                id: 'preserve_environment',
                name: 'Preserve Environment',
                description: 'Minimize unnecessary environmental damage',
                priority: 60,
                enabled: true,
                appliesTo: ['burn_forest', 'drain_water', 'kill_animals'],
                safetyTagTriggers: ['destructive', 'permanent_change'],
                riskLevelThreshold: types_1.RiskLevel.LOW,
                contextConditions: [],
                evaluate: function (capability, request, context) { return __awaiter(_this, void 0, void 0, function () {
                    var _a;
                    return __generator(this, function (_b) {
                        if (capability.safetyTags.includes('destructive') &&
                            !((_a = request.metadata) === null || _a === void 0 ? void 0 : _a.necessary)) {
                            return [2 /*return*/, {
                                    passed: false,
                                    severity: 'moderate',
                                    message: 'Environmental damage requires justification',
                                    suggestedAction: 'Provide necessity justification or find alternative',
                                    requiresApproval: true,
                                }];
                        }
                        return [2 /*return*/, {
                                passed: true,
                                severity: 'minor',
                                message: 'No environmental concerns',
                            }];
                    });
                }); },
            },
            {
                id: 'emergency_override',
                name: 'Emergency Override',
                description: 'Allow normally restricted actions in emergencies',
                priority: 200, // Highest priority
                enabled: true,
                appliesTo: ['*'], // Applies to all capabilities
                safetyTagTriggers: [],
                riskLevelThreshold: types_1.RiskLevel.MINIMAL,
                contextConditions: [
                    {
                        type: 'health',
                        operator: 'lt',
                        value: 0.2,
                        description: 'Critical health',
                    },
                    {
                        type: 'danger',
                        operator: 'gt',
                        value: 0.8,
                        description: 'High danger',
                    },
                ],
                evaluate: function (capability, request, context) { return __awaiter(_this, void 0, void 0, function () {
                    var isEmergency;
                    var _a;
                    return __generator(this, function (_b) {
                        isEmergency = context.agentHealth < 0.2 || context.dangerLevel > 0.8;
                        if (isEmergency && ((_a = request.metadata) === null || _a === void 0 ? void 0 : _a.emergency)) {
                            return [2 /*return*/, {
                                    passed: true,
                                    severity: 'minor',
                                    message: 'Emergency situation allows override of normal restrictions',
                                }];
                        }
                        // This rule doesn't block anything, it just provides emergency context
                        return [2 /*return*/, {
                                passed: true,
                                severity: 'minor',
                                message: 'No emergency override needed',
                            }];
                    });
                }); },
            },
        ];
        for (var _i = 0, defaultRules_1 = defaultRules; _i < defaultRules_1.length; _i++) {
            var rule = defaultRules_1[_i];
            this.rules.set(rule.id, rule);
        }
    };
    /**
     * Evaluate capability execution against constitutional rules
     *
     * @param capability - Capability being requested
     * @param request - Specific execution request
     * @param context - Current agent and environmental context
     * @returns Constitutional approval with reasoning
     */
    ConstitutionalFilter.prototype.evaluateExecution = function (capability, request, context) {
        return __awaiter(this, void 0, void 0, function () {
            var applicableRules, violatedRules, evaluations, maxSeverity, suggestedActions, requiresHumanReview, _i, applicableRules_1, rule, evaluation, error_1, approved, reasoning, decision;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        applicableRules = this.getApplicableRules(capability, request, context);
                        violatedRules = [];
                        evaluations = [];
                        maxSeverity = 'minor';
                        suggestedActions = [];
                        requiresHumanReview = false;
                        _i = 0, applicableRules_1 = applicableRules;
                        _a.label = 1;
                    case 1:
                        if (!(_i < applicableRules_1.length)) return [3 /*break*/, 6];
                        rule = applicableRules_1[_i];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, rule.evaluate(capability, request, context)];
                    case 3:
                        evaluation = _a.sent();
                        evaluations.push(evaluation);
                        if (!evaluation.passed) {
                            violatedRules.push(rule.id);
                            this.recordViolation(rule.id, evaluation.severity);
                            this.emit('rule-violated', rule.id, evaluation);
                            // Track highest severity
                            if (this.getSeverityLevel(evaluation.severity) >
                                this.getSeverityLevel(maxSeverity)) {
                                maxSeverity = evaluation.severity;
                            }
                            if (evaluation.suggestedAction) {
                                suggestedActions.push(evaluation.suggestedAction);
                            }
                            if (evaluation.requiresApproval) {
                                requiresHumanReview = true;
                            }
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _a.sent();
                        // Rule evaluation failed - treat as violation
                        violatedRules.push(rule.id);
                        evaluations.push({
                            passed: false,
                            severity: 'critical',
                            message: "Rule evaluation failed: ".concat(error_1 instanceof Error ? error_1.message : 'Unknown error'),
                        });
                        maxSeverity = 'critical';
                        return [3 /*break*/, 5];
                    case 5:
                        _i++;
                        return [3 /*break*/, 1];
                    case 6:
                        approved = violatedRules.length === 0;
                        reasoning = approved
                            ? "All ".concat(applicableRules.length, " constitutional rules passed")
                            : "".concat(violatedRules.length, " constitutional rule(s) violated: ").concat(violatedRules.join(', '));
                        decision = {
                            approved: approved,
                            reasoning: reasoning,
                            violatedRules: violatedRules,
                            severity: maxSeverity,
                            suggestedActions: suggestedActions,
                            requiresHumanReview: requiresHumanReview,
                            timestamp: Date.now(),
                        };
                        // Emit high-risk detection
                        if (!approved && (maxSeverity === 'major' || maxSeverity === 'critical')) {
                            this.emit('high-risk-detected', request, decision);
                        }
                        // Emit approval requirement
                        if (requiresHumanReview) {
                            this.emit('approval-required', request, suggestedActions);
                        }
                        return [2 /*return*/, decision];
                }
            });
        });
    };
    /**
     * Get applicable rules for capability and context
     */
    ConstitutionalFilter.prototype.getApplicableRules = function (capability, request, context) {
        var _this = this;
        var rules = [];
        for (var _i = 0, _a = this.rules; _i < _a.length; _i++) {
            var _b = _a[_i], id = _b[0], rule = _b[1];
            if (!rule.enabled)
                continue;
            // Check if rule applies to this capability
            var appliesToCapability = rule.appliesTo.includes('*') ||
                rule.appliesTo.includes(capability.id) ||
                rule.appliesTo.some(function (pattern) { return capability.id.includes(pattern); });
            if (!appliesToCapability)
                continue;
            // Check risk level threshold
            if (capability.riskLevel < rule.riskLevelThreshold)
                continue;
            // Check safety tag triggers
            if (rule.safetyTagTriggers.length > 0) {
                var hasTriggeredTag = rule.safetyTagTriggers.some(function (tag) {
                    return capability.safetyTags.includes(tag);
                });
                if (!hasTriggeredTag)
                    continue;
            }
            // Check context conditions
            if (rule.contextConditions.length > 0) {
                var contextMatches = rule.contextConditions.some(function (condition) {
                    return _this.evaluateContextCondition(condition, context);
                });
                if (!contextMatches)
                    continue;
            }
            rules.push(rule);
        }
        // Sort by priority (descending)
        return rules.sort(function (a, b) { return b.priority - a.priority; });
    };
    /**
     * Evaluate a context condition
     */
    ConstitutionalFilter.prototype.evaluateContextCondition = function (condition, context) {
        var contextValue;
        switch (condition.type) {
            case 'health':
                contextValue = context.agentHealth;
                break;
            case 'danger':
                contextValue = context.dangerLevel;
                break;
            case 'time':
                contextValue = context.timeOfDay;
                break;
            case 'social':
                contextValue = context.nearbyEntities.filter(function (e) { return e.type === 'player'; }).length;
                break;
            default:
                return false;
        }
        switch (condition.operator) {
            case 'lt':
                return contextValue < condition.value;
            case 'lte':
                return contextValue <= condition.value;
            case 'gt':
                return contextValue > condition.value;
            case 'gte':
                return contextValue >= condition.value;
            case 'eq':
                return contextValue === condition.value;
            case 'neq':
                return contextValue !== condition.value;
            default:
                return false;
        }
    };
    /**
     * Get numeric severity level for comparison
     */
    ConstitutionalFilter.prototype.getSeverityLevel = function (severity) {
        switch (severity) {
            case 'minor':
                return 1;
            case 'moderate':
                return 2;
            case 'major':
                return 3;
            case 'critical':
                return 4;
            default:
                return 0;
        }
    };
    /**
     * Record a rule violation for tracking
     */
    ConstitutionalFilter.prototype.recordViolation = function (ruleId, severity) {
        this.violationHistory.push({
            ruleId: ruleId,
            timestamp: Date.now(),
            severity: severity,
        });
        // Keep only recent violations (last 1000)
        if (this.violationHistory.length > 1000) {
            this.violationHistory = this.violationHistory.slice(-1000);
        }
    };
    /**
     * Add a new constitutional rule
     *
     * @param rule - Rule to add
     */
    ConstitutionalFilter.prototype.addRule = function (rule) {
        this.rules.set(rule.id, rule);
    };
    /**
     * Remove a constitutional rule
     *
     * @param ruleId - ID of rule to remove
     */
    ConstitutionalFilter.prototype.removeRule = function (ruleId) {
        return this.rules.delete(ruleId);
    };
    /**
     * Enable or disable a rule
     *
     * @param ruleId - ID of rule
     * @param enabled - Whether to enable or disable
     */
    ConstitutionalFilter.prototype.setRuleEnabled = function (ruleId, enabled) {
        var rule = this.rules.get(ruleId);
        if (!rule)
            return false;
        rule.enabled = enabled;
        return true;
    };
    /**
     * Get all constitutional rules
     *
     * @returns Array of all rules
     */
    ConstitutionalFilter.prototype.getRules = function () {
        return Array.from(this.rules.values());
    };
    /**
     * Get rule by ID
     *
     * @param ruleId - ID of rule
     * @returns Rule or undefined
     */
    ConstitutionalFilter.prototype.getRule = function (ruleId) {
        return this.rules.get(ruleId);
    };
    /**
     * Get violation history
     *
     * @param limit - Maximum number of violations to return
     * @returns Recent violations
     */
    ConstitutionalFilter.prototype.getViolationHistory = function (limit) {
        if (limit === void 0) { limit = 100; }
        return this.violationHistory.slice(-limit);
    };
    /**
     * Get violation statistics
     *
     * @returns Violation statistics by rule and severity
     */
    ConstitutionalFilter.prototype.getViolationStats = function () {
        var violationsByRule = {};
        var violationsBySeverity = {};
        for (var _i = 0, _a = this.violationHistory; _i < _a.length; _i++) {
            var violation = _a[_i];
            violationsByRule[violation.ruleId] =
                (violationsByRule[violation.ruleId] || 0) + 1;
            violationsBySeverity[violation.severity] =
                (violationsBySeverity[violation.severity] || 0) + 1;
        }
        return {
            totalViolations: this.violationHistory.length,
            violationsByRule: violationsByRule,
            violationsBySeverity: violationsBySeverity,
        };
    };
    /**
     * Clear violation history
     */
    ConstitutionalFilter.prototype.clearViolationHistory = function () {
        this.violationHistory = [];
    };
    /**
     * Check if a capability would be approved (dry run)
     *
     * @param capability - Capability to check
     * @param request - Request to check
     * @param context - Context to check
     * @returns Whether it would be approved
     */
    ConstitutionalFilter.prototype.wouldApprove = function (capability, request, context) {
        return __awaiter(this, void 0, void 0, function () {
            var decision;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.evaluateExecution(capability, request, context)];
                    case 1:
                        decision = _a.sent();
                        return [2 /*return*/, decision.approved];
                }
            });
        });
    };
    return ConstitutionalFilter;
}(events_1.EventEmitter));
exports.ConstitutionalFilter = ConstitutionalFilter;

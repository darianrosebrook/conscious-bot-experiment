"use strict";
/**
 * Goal Template Manager
 *
 * Implements feasibility checking, plan sketch hints, and advanced goal template integration
 * for sophisticated goal management in the conscious bot.
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
exports.GoalTemplateManager = exports.GoalStatus = exports.RiskType = exports.RiskLevel = exports.ResourceType = exports.GoalCategory = void 0;
var events_1 = require("events");
var uuid_1 = require("uuid");
var GoalCategory;
(function (GoalCategory) {
    GoalCategory["SURVIVAL"] = "survival";
    GoalCategory["SOCIAL"] = "social";
    GoalCategory["EXPLORATION"] = "exploration";
    GoalCategory["BUILDING"] = "building";
    GoalCategory["CRAFTING"] = "crafting";
    GoalCategory["COMBAT"] = "combat";
    GoalCategory["LEARNING"] = "learning";
    GoalCategory["ACHIEVEMENT"] = "achievement";
    GoalCategory["MAINTENANCE"] = "maintenance";
    GoalCategory["EMERGENCY"] = "emergency";
})(GoalCategory || (exports.GoalCategory = GoalCategory = {}));
var ResourceType;
(function (ResourceType) {
    ResourceType["MATERIAL"] = "material";
    ResourceType["TOOL"] = "tool";
    ResourceType["WEAPON"] = "weapon";
    ResourceType["ARMOR"] = "armor";
    ResourceType["FOOD"] = "food";
    ResourceType["BLOCK"] = "block";
    ResourceType["CRAFTING_TABLE"] = "crafting_table";
    ResourceType["FURNACE"] = "furnace";
    ResourceType["SKILL"] = "skill";
    ResourceType["KNOWLEDGE"] = "knowledge";
    ResourceType["TIME"] = "time";
    ResourceType["ENERGY"] = "energy";
})(ResourceType || (exports.ResourceType = ResourceType = {}));
var RiskLevel;
(function (RiskLevel) {
    RiskLevel["NONE"] = "none";
    RiskLevel["LOW"] = "low";
    RiskLevel["MEDIUM"] = "medium";
    RiskLevel["HIGH"] = "high";
    RiskLevel["CRITICAL"] = "critical";
})(RiskLevel || (exports.RiskLevel = RiskLevel = {}));
var RiskType;
(function (RiskType) {
    RiskType["ENVIRONMENTAL"] = "environmental";
    RiskType["RESOURCE"] = "resource";
    RiskType["SOCIAL"] = "social";
    RiskType["TECHNICAL"] = "technical";
    RiskType["TEMPORAL"] = "temporal";
    RiskType["SAFETY"] = "safety";
})(RiskType || (exports.RiskType = RiskType = {}));
var GoalStatus;
(function (GoalStatus) {
    GoalStatus["PLANNING"] = "planning";
    GoalStatus["ACTIVE"] = "active";
    GoalStatus["PAUSED"] = "paused";
    GoalStatus["COMPLETED"] = "completed";
    GoalStatus["FAILED"] = "failed";
    GoalStatus["CANCELLED"] = "cancelled";
    GoalStatus["ADAPTING"] = "adapting";
})(GoalStatus || (exports.GoalStatus = GoalStatus = {}));
var DEFAULT_CONFIG = {
    maxActiveGoals: 5,
    feasibilityThreshold: 0.6,
    riskThreshold: 0.7,
    adaptationThreshold: 0.3,
    checkpointInterval: 5,
    resourceUpdateInterval: 2,
    enableAdvancedFeasibility: true,
    enablePlanSketchHints: true,
    enableRiskAssessment: true,
    enableAdaptivePlanning: true,
};
// ============================================================================
// Goal Template Manager Implementation
// ============================================================================
var GoalTemplateManager = /** @class */ (function (_super) {
    __extends(GoalTemplateManager, _super);
    function GoalTemplateManager(config) {
        if (config === void 0) { config = {}; }
        var _this = _super.call(this) || this;
        _this.templates = new Map();
        _this.activeGoals = new Map();
        _this.goalHistory = [];
        _this.config = __assign(__assign({}, DEFAULT_CONFIG), config);
        _this.resourceMonitor = new ResourceMonitor();
        _this.feasibilityAnalyzer = new FeasibilityAnalyzer();
        _this.riskAssessor = new RiskAssessor();
        _this.initializeDefaultTemplates();
        return _this;
    }
    /**
     * Create a new goal instance from a template
     */
    GoalTemplateManager.prototype.createGoalInstance = function (templateId_1, context_1) {
        return __awaiter(this, arguments, void 0, function (templateId, context, priority) {
            var template, prerequisitesMet, feasibilityScore, riskAssessment, resourceStatus, goalInstance;
            if (priority === void 0) { priority = 0.5; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        template = this.templates.get(templateId);
                        if (!template) {
                            throw new Error("Goal template not found: ".concat(templateId));
                        }
                        return [4 /*yield*/, this.checkPrerequisites(template, context)];
                    case 1:
                        prerequisitesMet = _a.sent();
                        if (!prerequisitesMet) {
                            return [2 /*return*/, null];
                        }
                        return [4 /*yield*/, this.assessFeasibility(template, context)];
                    case 2:
                        feasibilityScore = _a.sent();
                        if (feasibilityScore < this.config.feasibilityThreshold) {
                            return [2 /*return*/, null];
                        }
                        return [4 /*yield*/, this.assessRisks(template, context)];
                    case 3:
                        riskAssessment = _a.sent();
                        // Check if risk is acceptable
                        if (riskAssessment.overallRisk > this.config.riskThreshold) {
                            return [2 /*return*/, null];
                        }
                        return [4 /*yield*/, this.checkResourceAvailability(template, context)];
                    case 4:
                        resourceStatus = _a.sent();
                        goalInstance = {
                            id: (0, uuid_1.v4)(),
                            templateId: templateId,
                            template: template,
                            status: GoalStatus.PLANNING,
                            priority: priority,
                            progress: 0,
                            startTime: Date.now(),
                            estimatedEndTime: Date.now() + template.timeEstimate * 60000,
                            context: context,
                            feasibilityScore: feasibilityScore,
                            riskAssessment: riskAssessment,
                            adaptations: [],
                            checkpoints: this.createCheckpoints(template),
                            resources: resourceStatus,
                            blockers: [],
                            successMetrics: this.initializeSuccessMetrics(template),
                        };
                        // Add to active goals
                        this.activeGoals.set(goalInstance.id, goalInstance);
                        // Emit event
                        this.emit('goalCreated', goalInstance);
                        return [2 /*return*/, goalInstance];
                }
            });
        });
    };
    /**
     * Start a goal instance
     */
    GoalTemplateManager.prototype.startGoal = function (goalId) {
        return __awaiter(this, void 0, void 0, function () {
            var goal, currentFeasibility;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        goal = this.activeGoals.get(goalId);
                        if (!goal) {
                            return [2 /*return*/, false];
                        }
                        return [4 /*yield*/, this.assessFeasibility(goal.template, goal.context)];
                    case 1:
                        currentFeasibility = _a.sent();
                        if (currentFeasibility < this.config.feasibilityThreshold) {
                            goal.status = GoalStatus.FAILED;
                            this.emit('goalFailed', goal, 'Insufficient feasibility');
                            return [2 /*return*/, false];
                        }
                        // Update status
                        goal.status = GoalStatus.ACTIVE;
                        goal.startTime = Date.now();
                        // Update template usage
                        goal.template.lastUsed = Date.now();
                        goal.template.usageCount++;
                        this.emit('goalStarted', goal);
                        return [2 /*return*/, true];
                }
            });
        });
    };
    /**
     * Update goal progress and check for adaptations
     */
    GoalTemplateManager.prototype.updateGoalProgress = function (goalId, progress, context) {
        return __awaiter(this, void 0, void 0, function () {
            var goal;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        goal = this.activeGoals.get(goalId);
                        if (!goal || goal.status !== GoalStatus.ACTIVE) {
                            return [2 /*return*/];
                        }
                        // Update progress
                        goal.progress = Math.min(1.0, Math.max(0, progress));
                        // Update context
                        goal.context = __assign(__assign({}, goal.context), context);
                        // Check for adaptations
                        return [4 /*yield*/, this.checkForAdaptations(goal)];
                    case 1:
                        // Check for adaptations
                        _a.sent();
                        // Update checkpoints
                        this.updateCheckpoints(goal);
                        // Update success metrics
                        this.updateSuccessMetrics(goal);
                        // Check for completion or failure
                        return [4 /*yield*/, this.checkGoalStatus(goal)];
                    case 2:
                        // Check for completion or failure
                        _a.sent();
                        this.emit('goalProgressUpdated', goal);
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get plan sketch hints for a goal
     */
    GoalTemplateManager.prototype.getPlanSketchHints = function (goalId) {
        return __awaiter(this, void 0, void 0, function () {
            var goal, contextualHints;
            var _this = this;
            return __generator(this, function (_a) {
                goal = this.activeGoals.get(goalId);
                if (!goal) {
                    return [2 /*return*/, []];
                }
                if (!this.config.enablePlanSketchHints) {
                    return [2 /*return*/, goal.template.planSketchHints];
                }
                contextualHints = goal.template.planSketchHints.filter(function (hint) {
                    return _this.evaluateHintContext(hint, goal.context);
                });
                // Sort by priority and estimated time
                contextualHints.sort(function (a, b) {
                    var priorityDiff = b.priority - a.priority;
                    if (Math.abs(priorityDiff) > 0.1) {
                        return priorityDiff;
                    }
                    return a.estimatedTime - b.estimatedTime;
                });
                return [2 /*return*/, contextualHints];
            });
        });
    };
    /**
     * Get feasibility analysis for a goal template
     */
    GoalTemplateManager.prototype.getFeasibilityAnalysis = function (templateId, context) {
        return __awaiter(this, void 0, void 0, function () {
            var template;
            return __generator(this, function (_a) {
                template = this.templates.get(templateId);
                if (!template) {
                    throw new Error("Goal template not found: ".concat(templateId));
                }
                return [2 /*return*/, this.feasibilityAnalyzer.analyze(template, context)];
            });
        });
    };
    /**
     * Get risk assessment for a goal template
     */
    GoalTemplateManager.prototype.getRiskAssessment = function (templateId, context) {
        return __awaiter(this, void 0, void 0, function () {
            var template;
            return __generator(this, function (_a) {
                template = this.templates.get(templateId);
                if (!template) {
                    throw new Error("Goal template not found: ".concat(templateId));
                }
                return [2 /*return*/, this.riskAssessor.assess(template, context)];
            });
        });
    };
    /**
     * Add a new goal template
     */
    GoalTemplateManager.prototype.addTemplate = function (template) {
        this.templates.set(template.id, template);
        this.emit('templateAdded', template);
    };
    /**
     * Get all goal templates
     */
    GoalTemplateManager.prototype.getTemplates = function () {
        return Array.from(this.templates.values());
    };
    /**
     * Get active goals
     */
    GoalTemplateManager.prototype.getActiveGoals = function () {
        return Array.from(this.activeGoals.values());
    };
    /**
     * Get goal history
     */
    GoalTemplateManager.prototype.getGoalHistory = function () {
        return __spreadArray([], this.goalHistory, true);
    };
    // ============================================================================
    // Private Methods
    // ============================================================================
    GoalTemplateManager.prototype.checkPrerequisites = function (template, context) {
        return __awaiter(this, void 0, void 0, function () {
            var _loop_1, this_1, _i, _a, prereqId, state_1;
            return __generator(this, function (_b) {
                _loop_1 = function (prereqId) {
                    var prereqTemplate = this_1.templates.get(prereqId);
                    if (!prereqTemplate) {
                        return "continue";
                    }
                    // Check if prerequisite was recently completed
                    var recentCompletion = this_1.goalHistory.find(function (goal) {
                        return goal.templateId === prereqId &&
                            goal.status === GoalStatus.COMPLETED &&
                            Date.now() - goal.actualEndTime < 3600000;
                    } // Within last hour
                    );
                    if (!recentCompletion) {
                        return { value: false };
                    }
                };
                this_1 = this;
                for (_i = 0, _a = template.prerequisites; _i < _a.length; _i++) {
                    prereqId = _a[_i];
                    state_1 = _loop_1(prereqId);
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                }
                return [2 /*return*/, true];
            });
        });
    };
    GoalTemplateManager.prototype.assessFeasibility = function (template, context) {
        return __awaiter(this, void 0, void 0, function () {
            var analysis;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.config.enableAdvancedFeasibility) {
                            return [2 /*return*/, 0.5]; // Default feasibility
                        }
                        return [4 /*yield*/, this.feasibilityAnalyzer.analyze(template, context)];
                    case 1:
                        analysis = _a.sent();
                        return [2 /*return*/, analysis.overallFeasibility];
                }
            });
        });
    };
    GoalTemplateManager.prototype.assessRisks = function (template, context) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!this.config.enableRiskAssessment) {
                    return [2 /*return*/, {
                            overallRisk: 0.3,
                            riskFactors: [],
                            mitigationStrategies: [],
                            contingencyPlans: [],
                            acceptableRiskThreshold: 0.7,
                        }];
                }
                return [2 /*return*/, this.riskAssessor.assess(template, context)];
            });
        });
    };
    GoalTemplateManager.prototype.checkResourceAvailability = function (template, context) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, template.resourceRequirements.map(function (requirement) {
                        var available = context.availableResources.includes(requirement.name);
                        return {
                            resource: requirement,
                            available: available,
                            quantity: available ? 1 : 0,
                            quality: 1.0,
                            location: 'unknown',
                            accessibility: available ? 1.0 : 0.0,
                            estimatedDepletion: Infinity,
                        };
                    })];
            });
        });
    };
    GoalTemplateManager.prototype.createCheckpoints = function (template) {
        var checkpoints = [];
        var totalTime = template.timeEstimate;
        var interval = this.config.checkpointInterval;
        for (var i = 1; i <= Math.floor(totalTime / interval); i++) {
            var checkpointTime = i * interval;
            checkpoints.push({
                id: (0, uuid_1.v4)(),
                name: "Checkpoint ".concat(i),
                description: "Progress check at ".concat(checkpointTime, " minutes"),
                criteria: [
                    "Progress >= ".concat((i / Math.floor(totalTime / interval)) * 100, "%"),
                ],
                completed: false,
                notes: '',
            });
        }
        return checkpoints;
    };
    GoalTemplateManager.prototype.initializeSuccessMetrics = function (template) {
        return template.successCriteria.map(function (criterion) { return ({
            criterion: criterion,
            currentValue: 0,
            targetValue: criterion.threshold || 1,
            achieved: false,
            progress: 0,
            lastUpdated: Date.now(),
        }); });
    };
    GoalTemplateManager.prototype.checkForAdaptations = function (goal) {
        return __awaiter(this, void 0, void 0, function () {
            var currentFeasibility, feasibilityDrop, newBlockers, depletedResources;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.config.enableAdaptivePlanning) {
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, this.assessFeasibility(goal.template, goal.context)];
                    case 1:
                        currentFeasibility = _a.sent();
                        feasibilityDrop = goal.feasibilityScore - currentFeasibility;
                        if (!(feasibilityDrop > this.config.adaptationThreshold)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.triggerAdaptation(goal, 'feasibility_drop', "Feasibility dropped by ".concat(feasibilityDrop.toFixed(2)))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        newBlockers = this.identifyBlockers(goal);
                        if (!(newBlockers.length > 0)) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.triggerAdaptation(goal, 'blocker_detected', "New blockers: ".concat(newBlockers.map(function (b) { return b.description; }).join(', ')))];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5:
                        depletedResources = goal.resources.filter(function (r) { return r.estimatedDepletion < 5; });
                        if (!(depletedResources.length > 0)) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.triggerAdaptation(goal, 'resource_depletion', "Resources depleting: ".concat(depletedResources.map(function (r) { return r.resource.name; }).join(', ')))];
                    case 6:
                        _a.sent();
                        _a.label = 7;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    GoalTemplateManager.prototype.triggerAdaptation = function (goal, type, reason) {
        return __awaiter(this, void 0, void 0, function () {
            var adaptation;
            return __generator(this, function (_a) {
                adaptation = {
                    type: 'approach',
                    description: "Adaptation triggered: ".concat(type),
                    reason: reason,
                    timestamp: Date.now(),
                    impact: 0, // Will be calculated based on adaptation success
                    approved: true,
                };
                goal.adaptations.push(adaptation);
                goal.status = GoalStatus.ADAPTING;
                this.emit('goalAdapting', goal, adaptation);
                return [2 /*return*/];
            });
        });
    };
    GoalTemplateManager.prototype.identifyBlockers = function (goal) {
        var blockers = [];
        // Check for resource blockers
        var missingResources = goal.resources.filter(function (r) { return !r.available && r.resource.criticality > 0.7; });
        missingResources.forEach(function (resource) {
            blockers.push({
                type: 'resource',
                description: "Missing critical resource: ".concat(resource.resource.name),
                severity: resource.resource.criticality,
                impact: 0.8,
                resolvable: true,
                resolutionTime: 10, // 10 minutes to find alternative
                resolutionCost: 0.3,
                dependencies: resource.resource.alternatives,
            });
        });
        // Check for environmental blockers
        if (goal.context.constraints.length > 0) {
            blockers.push({
                type: 'environmental',
                description: "Environmental constraints: ".concat(goal.context.constraints.join(', ')),
                severity: 0.6,
                impact: 0.5,
                resolvable: false,
                dependencies: [],
            });
        }
        return blockers;
    };
    GoalTemplateManager.prototype.updateCheckpoints = function (goal) {
        var elapsedTime = (Date.now() - goal.startTime) / 60000; // minutes
        var expectedProgress = elapsedTime / goal.template.timeEstimate;
        goal.checkpoints.forEach(function (checkpoint) {
            if (!checkpoint.completed && goal.progress >= expectedProgress) {
                checkpoint.completed = true;
                checkpoint.completionTime = Date.now();
                checkpoint.notes = "Completed at ".concat(goal.progress.toFixed(2), " progress");
            }
        });
    };
    GoalTemplateManager.prototype.updateSuccessMetrics = function (goal) {
        goal.successMetrics.forEach(function (metric) {
            // Simple progress-based metric update
            metric.currentValue = goal.progress;
            metric.progress = goal.progress / metric.targetValue;
            metric.achieved = goal.progress >= metric.targetValue;
            metric.lastUpdated = Date.now();
        });
    };
    GoalTemplateManager.prototype.checkGoalStatus = function (goal) {
        return __awaiter(this, void 0, void 0, function () {
            var failureTriggered;
            var _this = this;
            return __generator(this, function (_a) {
                // Check for completion
                if (goal.progress >= 1.0) {
                    goal.status = GoalStatus.COMPLETED;
                    goal.actualEndTime = Date.now();
                    this.completeGoal(goal);
                    return [2 /*return*/];
                }
                failureTriggered = goal.template.failureConditions.some(function (condition) {
                    return _this.evaluateFailureCondition(condition, goal);
                });
                if (failureTriggered) {
                    goal.status = GoalStatus.FAILED;
                    goal.actualEndTime = Date.now();
                    this.failGoal(goal);
                    return [2 /*return*/];
                }
                // Check for timeout
                if (Date.now() > goal.estimatedEndTime) {
                    goal.status = GoalStatus.FAILED;
                    goal.actualEndTime = Date.now();
                    this.failGoal(goal, 'Timeout');
                    return [2 /*return*/];
                }
                return [2 /*return*/];
            });
        });
    };
    GoalTemplateManager.prototype.evaluateFailureCondition = function (condition, goal) {
        switch (condition.type) {
            case 'timeout':
                return (Date.now() - goal.startTime >
                    (condition.timeoutMinutes || goal.template.timeEstimate) * 60000);
            case 'resource_lack':
                return goal.resources.some(function (r) { return !r.available && r.resource.criticality > 0.8; });
            case 'environmental':
                return goal.context.constraints.some(function (constraint) {
                    return condition.condition.toLowerCase().includes(constraint.toLowerCase());
                });
            default:
                return false;
        }
    };
    GoalTemplateManager.prototype.evaluateHintContext = function (hint, context) {
        if (!hint.context || hint.context === 'always') {
            return true;
        }
        // Simple keyword matching for context evaluation
        var contextKeywords = hint.context.toLowerCase().split(' ');
        var environmentMatch = contextKeywords.some(function (keyword) {
            return context.environment.toLowerCase().includes(keyword);
        });
        var socialMatch = contextKeywords.some(function (keyword) {
            return context.socialContext.toLowerCase().includes(keyword);
        });
        return environmentMatch || socialMatch;
    };
    GoalTemplateManager.prototype.completeGoal = function (goal) {
        // Update template success rate
        var totalUses = goal.template.usageCount;
        var currentSuccessRate = goal.template.successRate;
        goal.template.successRate =
            (currentSuccessRate * (totalUses - 1) + 1) / totalUses;
        // Move to history
        this.activeGoals.delete(goal.id);
        this.goalHistory.push(goal);
        this.emit('goalCompleted', goal);
    };
    GoalTemplateManager.prototype.failGoal = function (goal, reason) {
        if (reason === void 0) { reason = 'Unknown'; }
        // Update template success rate
        var totalUses = goal.template.usageCount;
        var currentSuccessRate = goal.template.successRate;
        goal.template.successRate =
            (currentSuccessRate * (totalUses - 1)) / totalUses;
        // Move to history
        this.activeGoals.delete(goal.id);
        this.goalHistory.push(goal);
        this.emit('goalFailed', goal, reason);
    };
    GoalTemplateManager.prototype.initializeDefaultTemplates = function () {
        var _this = this;
        // Add some default goal templates
        var defaultTemplates = [
            {
                id: 'build_shelter',
                name: 'Build Shelter',
                description: 'Construct a basic shelter for protection',
                category: GoalCategory.SURVIVAL,
                priority: 0.8,
                complexity: 0.4,
                timeEstimate: 30,
                resourceRequirements: [
                    {
                        type: ResourceType.BLOCK,
                        name: 'wood',
                        quantity: 20,
                        optional: false,
                        alternatives: ['stone'],
                        criticality: 0.9,
                    },
                    {
                        type: ResourceType.TOOL,
                        name: 'axe',
                        quantity: 1,
                        optional: true,
                        alternatives: [],
                        criticality: 0.3,
                    },
                ],
                prerequisites: [],
                successCriteria: [
                    {
                        type: 'boolean',
                        description: 'Shelter constructed',
                        condition: 'shelter_exists',
                        weight: 1.0,
                        measurable: true,
                    },
                ],
                failureConditions: [
                    {
                        type: 'timeout',
                        description: 'Construction timeout',
                        condition: 'time_exceeded',
                        severity: 0.5,
                        recoverable: true,
                        timeoutMinutes: 45,
                    },
                ],
                feasibilityFactors: [
                    {
                        type: 'resource',
                        name: 'material_availability',
                        description: 'Building materials available',
                        weight: 0.8,
                        currentValue: 0.7,
                        requiredValue: 0.5,
                        dynamic: true,
                    },
                    {
                        type: 'environmental',
                        name: 'safe_location',
                        description: 'Safe location for shelter',
                        weight: 0.9,
                        currentValue: 0.6,
                        requiredValue: 0.7,
                        dynamic: false,
                    },
                ],
                planSketchHints: [
                    {
                        type: 'action',
                        description: 'Find flat ground near trees',
                        priority: 0.9,
                        context: 'forest',
                        alternatives: ['Find stone outcrop'],
                        estimatedTime: 5,
                        riskLevel: RiskLevel.LOW,
                    },
                    {
                        type: 'sequence',
                        description: 'Gather materials before building',
                        priority: 0.8,
                        context: 'always',
                        alternatives: [],
                        estimatedTime: 15,
                        riskLevel: RiskLevel.LOW,
                    },
                ],
                adaptabilityScore: 0.7,
                learningValue: 0.6,
                socialImpact: 0.3,
                riskLevel: RiskLevel.LOW,
                tags: ['survival', 'building', 'basic'],
                createdAt: Date.now(),
                lastUsed: 0,
                usageCount: 0,
                successRate: 0.8,
            },
        ];
        defaultTemplates.forEach(function (template) { return _this.addTemplate(template); });
    };
    return GoalTemplateManager;
}(events_1.EventEmitter));
exports.GoalTemplateManager = GoalTemplateManager;
// ============================================================================
// Helper Classes
// ============================================================================
var ResourceMonitor = /** @class */ (function () {
    function ResourceMonitor() {
        this.resources = new Map();
    }
    ResourceMonitor.prototype.updateResource = function (resourceId, status) {
        var current = this.resources.get(resourceId);
        if (current) {
            this.resources.set(resourceId, __assign(__assign({}, current), status));
        }
    };
    ResourceMonitor.prototype.getResourceStatus = function (resourceId) {
        return this.resources.get(resourceId);
    };
    ResourceMonitor.prototype.getAllResources = function () {
        return Array.from(this.resources.values());
    };
    return ResourceMonitor;
}());
var FeasibilityAnalyzer = /** @class */ (function () {
    function FeasibilityAnalyzer() {
    }
    FeasibilityAnalyzer.prototype.analyze = function (template, context) {
        return __awaiter(this, void 0, void 0, function () {
            var overallFeasibility, factorScores, _i, _a, factor, score;
            return __generator(this, function (_b) {
                overallFeasibility = 0;
                factorScores = new Map();
                for (_i = 0, _a = template.feasibilityFactors; _i < _a.length; _i++) {
                    factor = _a[_i];
                    score = factor.currentValue;
                    // Apply context-based adjustments
                    switch (factor.type) {
                        case 'resource':
                            score = this.assessResourceFeasibility(factor, context);
                            break;
                        case 'environmental':
                            score = this.assessEnvironmentalFeasibility(factor, context);
                            break;
                        case 'social':
                            score = this.assessSocialFeasibility(factor, context);
                            break;
                        case 'skill':
                            score = this.assessSkillFeasibility(factor, context);
                            break;
                        case 'time':
                            score = this.assessTimeFeasibility(factor, context);
                            break;
                        case 'risk':
                            score = this.assessRiskFeasibility(factor, context);
                            break;
                    }
                    factorScores.set(factor.name, score);
                    overallFeasibility += score * factor.weight;
                }
                return [2 /*return*/, {
                        overallFeasibility: Math.min(1.0, overallFeasibility),
                        factorScores: factorScores,
                        recommendations: this.generateRecommendations(template, factorScores),
                    }];
            });
        });
    };
    FeasibilityAnalyzer.prototype.assessResourceFeasibility = function (factor, context) {
        var availableResources = context.availableResources;
        var requiredResources = ['wood', 'stone', 'tools', 'food']; // Simplified
        var availableCount = requiredResources.filter(function (resource) {
            return availableResources.includes(resource);
        }).length;
        return availableCount / requiredResources.length;
    };
    FeasibilityAnalyzer.prototype.assessEnvironmentalFeasibility = function (factor, context) {
        var constraints = context.constraints;
        var opportunities = context.opportunities;
        var score = 0.5; // Base score
        // Reduce score for constraints
        constraints.forEach(function (constraint) {
            if (constraint.includes('danger') || constraint.includes('hostile')) {
                score -= 0.3;
            }
        });
        // Increase score for opportunities
        opportunities.forEach(function (opportunity) {
            if (opportunity.includes('safe') || opportunity.includes('resource')) {
                score += 0.2;
            }
        });
        return Math.max(0, Math.min(1, score));
    };
    FeasibilityAnalyzer.prototype.assessSocialFeasibility = function (factor, context) {
        if (context.socialContext.includes('alone')) {
            return 0.3; // Lower feasibility when alone
        }
        return 0.8; // Higher feasibility with others
    };
    FeasibilityAnalyzer.prototype.assessSkillFeasibility = function (factor, context) {
        var capabilities = context.currentCapabilities;
        return capabilities.length > 0 ? 0.7 : 0.3;
    };
    FeasibilityAnalyzer.prototype.assessTimeFeasibility = function (factor, context) {
        // Simple time assessment - could be enhanced with time-of-day analysis
        return 0.8;
    };
    FeasibilityAnalyzer.prototype.assessRiskFeasibility = function (factor, context) {
        var constraints = context.constraints;
        var riskFactors = constraints.filter(function (c) { return c.includes('danger') || c.includes('risk') || c.includes('hostile'); });
        return Math.max(0.2, 1 - riskFactors.length * 0.2);
    };
    FeasibilityAnalyzer.prototype.generateRecommendations = function (template, factorScores) {
        var recommendations = [];
        factorScores.forEach(function (score, factorName) {
            if (score < 0.5) {
                recommendations.push("Improve ".concat(factorName, " feasibility (current: ").concat(score.toFixed(2), ")"));
            }
        });
        return recommendations;
    };
    return FeasibilityAnalyzer;
}());
var RiskAssessor = /** @class */ (function () {
    function RiskAssessor() {
    }
    RiskAssessor.prototype.assess = function (template, context) {
        var riskFactors = [];
        var overallRisk = 0;
        // Environmental risks
        if (context.constraints.some(function (c) { return c.includes('danger'); })) {
            riskFactors.push({
                type: RiskType.ENVIRONMENTAL,
                description: 'Dangerous environment',
                probability: 0.6,
                impact: 0.8,
                severity: 0.48,
                mitigatable: true,
                mitigationCost: 0.4,
            });
            overallRisk += 0.48;
        }
        // Resource risks
        if (context.availableResources.length < 3) {
            riskFactors.push({
                type: RiskType.RESOURCE,
                description: 'Limited resources',
                probability: 0.7,
                impact: 0.5,
                severity: 0.35,
                mitigatable: true,
                mitigationCost: 0.3,
            });
            overallRisk += 0.35;
        }
        // Social risks
        if (context.socialContext.includes('conflict')) {
            riskFactors.push({
                type: RiskType.SOCIAL,
                description: 'Social conflict',
                probability: 0.4,
                impact: 0.6,
                severity: 0.24,
                mitigatable: true,
                mitigationCost: 0.5,
            });
            overallRisk += 0.24;
        }
        return {
            overallRisk: Math.min(1.0, overallRisk),
            riskFactors: riskFactors,
            mitigationStrategies: this.generateMitigationStrategies(riskFactors),
            contingencyPlans: this.generateContingencyPlans(riskFactors),
            acceptableRiskThreshold: 0.7,
        };
    };
    RiskAssessor.prototype.generateMitigationStrategies = function (riskFactors) {
        return riskFactors
            .filter(function (factor) { return factor.mitigatable; })
            .map(function (factor) { return ({
            description: "Mitigate ".concat(factor.description),
            effectiveness: 0.7,
            cost: factor.mitigationCost,
            timeRequired: 10,
            prerequisites: [],
        }); });
    };
    RiskAssessor.prototype.generateContingencyPlans = function (riskFactors) {
        return riskFactors.map(function (factor) { return ({
            trigger: factor.description,
            description: "Handle ".concat(factor.description),
            actions: [
                'Assess situation',
                'Implement backup plan',
                'Seek help if needed',
            ],
            effectiveness: 0.6,
        }); });
    };
    return RiskAssessor;
}());

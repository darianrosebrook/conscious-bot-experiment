"use strict";
/**
 * LLM Integration System - Real Ollama integration with HRM principles
 *
 * Implements real LLM integration with Ollama, incorporating HRM's dual-system
 * architecture for hierarchical reasoning and option proposal generation.
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
exports.HRMLLMInterface = exports.OllamaClient = exports.DEFAULT_HRM_CONFIG = exports.AVAILABLE_MODELS = void 0;
// ============================================================================
// Available Models Configuration
// ============================================================================
/**
 * Pre-configured models for different reasoning tasks
 */
exports.AVAILABLE_MODELS = [
    {
        name: 'deepseek-r1:14b',
        size: '14B',
        memoryGB: 9.0,
        latency: '200-500ms',
        capabilities: [
            'logical_reasoning',
            'planning_optimization',
            'code_generation',
        ],
        recommendedFor: [
            'complex_planning',
            'algorithmic_reasoning',
            'optimization_tasks',
        ],
    },
    {
        name: 'deepseek-r1:8b',
        size: '8B',
        memoryGB: 5.2,
        latency: '100-300ms',
        capabilities: ['logical_reasoning', 'planning_optimization'],
        recommendedFor: ['moderate_planning', 'tactical_reasoning'],
    },
    {
        name: 'qwen3:14b',
        size: '14B',
        memoryGB: 9.3,
        latency: '150-400ms',
        capabilities: [
            'language_understanding',
            'creative_generation',
            'narrative_construction',
        ],
        recommendedFor: [
            'narrative_tasks',
            'creative_problem_solving',
            'social_interaction',
        ],
    },
    {
        name: 'qwen3:8b',
        size: '8B',
        memoryGB: 5.2,
        latency: '80-250ms',
        capabilities: ['language_understanding', 'creative_generation'],
        recommendedFor: ['general_reasoning', 'conversation'],
    },
    {
        name: 'llama3.3:70b',
        size: '70B',
        memoryGB: 42,
        latency: '500-1500ms',
        capabilities: [
            'language_understanding',
            'logical_reasoning',
            'creative_generation',
            'mathematical_reasoning',
        ],
        recommendedFor: [
            'complex_reasoning',
            'research_tasks',
            'high_accuracy_required',
        ],
    },
];
/**
 * Default HRM reasoning configuration
 */
exports.DEFAULT_HRM_CONFIG = {
    abstractPlanner: {
        model: 'qwen3:4b', // Fastest for abstract planning based on benchmarks (2.6s avg)
        maxTokens: 1024, // Reduced for faster response
        temperature: 0.1,
        purpose: 'High-level strategic planning and goal decomposition',
        latency: '100-300ms',
    },
    detailedExecutor: {
        model: 'qwen3:4b', // Fastest for detailed execution based on benchmarks (2.6s avg)
        maxTokens: 1024,
        temperature: 0.3,
        purpose: 'Detailed tactical execution and immediate responses',
        latency: '100-300ms',
    },
    refinementLoop: {
        maxIterations: 2, // Reduced for faster response
        haltCondition: 'confidence_threshold',
        confidenceThreshold: 0.8,
        timeBudgetMs: 5000, // Increased to 5s for better quality
    },
};
// ============================================================================
// Ollama Client
// ============================================================================
/**
 * Ollama API client for model interaction
 */
var OllamaClient = /** @class */ (function () {
    function OllamaClient(baseUrl, timeout) {
        if (baseUrl === void 0) { baseUrl = 'http://localhost:11434'; }
        if (timeout === void 0) { timeout = 10000; }
        this.baseUrl = baseUrl;
        this.timeout = timeout;
    }
    /**
     * Generate response from Ollama model
     */
    OllamaClient.prototype.generate = function (model_1, prompt_1) {
        return __awaiter(this, arguments, void 0, function (model, prompt, options) {
            var _a, temperature, _b, maxTokens, systemPrompt, _c, timeout, requestBody, controller_1, timeoutId, response, error_1;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _a = options.temperature, temperature = _a === void 0 ? 0.7 : _a, _b = options.maxTokens, maxTokens = _b === void 0 ? 2048 : _b, systemPrompt = options.systemPrompt, _c = options.timeout, timeout = _c === void 0 ? this.timeout : _c;
                        requestBody = {
                            model: model,
                            prompt: prompt,
                            system: systemPrompt,
                            options: {
                                temperature: temperature,
                                num_predict: maxTokens,
                            },
                            stream: false,
                        };
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 4, , 5]);
                        controller_1 = new AbortController();
                        timeoutId = setTimeout(function () { return controller_1.abort(); }, timeout);
                        return [4 /*yield*/, fetch("".concat(this.baseUrl, "/api/generate"), {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify(requestBody),
                                signal: controller_1.signal,
                            })];
                    case 2:
                        response = _d.sent();
                        clearTimeout(timeoutId);
                        if (!response.ok) {
                            throw new Error("Ollama API error: ".concat(response.status, " ").concat(response.statusText));
                        }
                        return [4 /*yield*/, response.json()];
                    case 3: return [2 /*return*/, (_d.sent())];
                    case 4:
                        error_1 = _d.sent();
                        if (error_1 instanceof Error && error_1.name === 'AbortError') {
                            throw new Error("Ollama request timed out after ".concat(timeout, "ms"));
                        }
                        throw error_1;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * List available models
     */
    OllamaClient.prototype.listModels = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, fetch("".concat(this.baseUrl, "/api/tags"))];
                    case 1:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Ollama API error: ".concat(response.status, " ").concat(response.statusText));
                        }
                        return [4 /*yield*/, response.json()];
                    case 2: return [2 /*return*/, (_a.sent())];
                    case 3:
                        error_2 = _a.sent();
                        throw new Error("Failed to list models: ".concat(error_2));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check if model is available
     */
    OllamaClient.prototype.isModelAvailable = function (modelName) {
        return __awaiter(this, void 0, void 0, function () {
            var models, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.listModels()];
                    case 1:
                        models = _a.sent();
                        return [2 /*return*/, models.models.some(function (model) { return model.name === modelName; })];
                    case 2:
                        error_3 = _a.sent();
                        console.warn("Failed to check model availability: ".concat(error_3));
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return OllamaClient;
}());
exports.OllamaClient = OllamaClient;
// ============================================================================
// HRM-Inspired LLM Interface
// ============================================================================
/**
 * HRM-inspired LLM interface with dual-system reasoning
 */
var HRMLLMInterface = /** @class */ (function () {
    function HRMLLMInterface(config, availableModels) {
        if (config === void 0) { config = exports.DEFAULT_HRM_CONFIG; }
        if (availableModels === void 0) { availableModels = exports.AVAILABLE_MODELS; }
        this.ollamaClient = new OllamaClient();
        this.config = config;
        this.availableModels = availableModels;
    }
    /**
     * Propose new options using HRM dual-system reasoning
     */
    HRMLLMInterface.prototype.proposeOption = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, abstractPlan, detailedPlan, refinedPlan, btDsl, durationMs, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = performance.now();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 6, , 7]);
                        return [4 /*yield*/, this.generateAbstractPlan(request)];
                    case 2:
                        abstractPlan = _a.sent();
                        return [4 /*yield*/, this.generateDetailedPlan(abstractPlan, request)];
                    case 3:
                        detailedPlan = _a.sent();
                        return [4 /*yield*/, this.iterativeRefinement(detailedPlan, request)];
                    case 4:
                        refinedPlan = _a.sent();
                        return [4 /*yield*/, this.generateBTDSL(refinedPlan, request)];
                    case 5:
                        btDsl = _a.sent();
                        durationMs = performance.now() - startTime;
                        return [2 /*return*/, {
                                name: "opt.".concat(this.generateOptionName(request.currentTask)),
                                version: '1.0.0',
                                btDsl: btDsl,
                                confidence: refinedPlan.confidence,
                                estimatedSuccessRate: refinedPlan.estimatedSuccessRate,
                                reasoning: refinedPlan.reasoning.join('\n'),
                            }];
                    case 6:
                        error_4 = _a.sent();
                        console.error('Failed to propose option:', error_4);
                        return [2 /*return*/, null];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * High-level abstract planning (System 2)
     */
    HRMLLMInterface.prototype.generateAbstractPlan = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var systemPrompt, userPrompt, response;
            var _a, _b, _c, _d, _e, _f, _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        systemPrompt = "You are an expert Minecraft AI planner. Your role is to generate high-level strategic plans for solving complex problems.\n\nFocus on:\n- Breaking down complex tasks into manageable sub-goals\n- Identifying key resources and constraints\n- Considering multiple solution approaches\n- Planning for contingencies and failure modes\n\nCurrent context:\n- Task: ".concat(request.currentTask, "\n- Recent failures: ").concat(request.recentFailures.map(function (f) { return f.detail; }).join(', '), "\n- Available capabilities: movement, sensing, interaction, crafting\n- Bot position: ").concat(((_c = (_b = (_a = request.context) === null || _a === void 0 ? void 0 : _a.bot) === null || _b === void 0 ? void 0 : _b.entity) === null || _c === void 0 ? void 0 : _c.position) ? "(".concat(request.context.bot.entity.position.x.toFixed(1), ", ").concat(request.context.bot.entity.position.y.toFixed(1), ", ").concat(request.context.bot.entity.position.z.toFixed(1), ")") : 'Unknown', "\n- Bot health: ").concat(((_e = (_d = request.context) === null || _d === void 0 ? void 0 : _d.bot) === null || _e === void 0 ? void 0 : _e.health) || 'Unknown', "\n- Bot food: ").concat(((_g = (_f = request.context) === null || _f === void 0 ? void 0 : _f.bot) === null || _g === void 0 ? void 0 : _g.food) || 'Unknown', "\n\nGenerate a high-level strategic plan that addresses the core problem.");
                        userPrompt = "Analyze the current situation and create a high-level strategic plan for: ".concat(request.currentTask, "\n\nConsider the recent failures and design a robust approach that can handle similar challenges.");
                        return [4 /*yield*/, this.ollamaClient.generate(this.config.abstractPlanner.model, userPrompt, {
                                systemPrompt: systemPrompt,
                                temperature: this.config.abstractPlanner.temperature,
                                maxTokens: this.config.abstractPlanner.maxTokens,
                                timeout: 40000, // 15 seconds for demo
                            })];
                    case 1:
                        response = _h.sent();
                        return [2 /*return*/, {
                                abstractPlan: response.response,
                                confidence: 0.7, // Initial confidence
                                reasoning: ['Generated high-level strategic plan'],
                            }];
                }
            });
        });
    };
    /**
     * Low-level detailed execution planning (System 1)
     */
    HRMLLMInterface.prototype.generateDetailedPlan = function (abstractPlan, request) {
        return __awaiter(this, void 0, void 0, function () {
            var systemPrompt, userPrompt, response;
            var _a, _b, _c, _d, _e, _f, _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        systemPrompt = "You are an expert Minecraft AI executor. Your role is to convert high-level strategic plans into detailed tactical execution steps.\n\nFocus on:\n- Concrete action sequences\n- Resource requirements and availability\n- Timing and coordination\n- Error handling and recovery\n- Performance optimization\n\nWork with the provided abstract plan and create specific, actionable steps.";
                        userPrompt = "Convert this high-level plan into detailed execution steps:\n\nAbstract Plan:\n".concat(abstractPlan.abstractPlan, "\n\nCurrent context:\n- Task: ").concat(request.currentTask, "\n- Recent failures: ").concat(request.recentFailures.map(function (f) { return f.detail; }).join(', '), "\n- Bot position: ").concat(((_c = (_b = (_a = request.context) === null || _a === void 0 ? void 0 : _a.bot) === null || _b === void 0 ? void 0 : _b.entity) === null || _c === void 0 ? void 0 : _c.position) ? "(".concat(request.context.bot.entity.position.x.toFixed(1), ", ").concat(request.context.bot.entity.position.y.toFixed(1), ", ").concat(request.context.bot.entity.position.z.toFixed(1), ")") : 'Unknown', "\n- Bot health: ").concat(((_e = (_d = request.context) === null || _d === void 0 ? void 0 : _d.bot) === null || _e === void 0 ? void 0 : _e.health) || 'Unknown', "\n- Bot food: ").concat(((_g = (_f = request.context) === null || _f === void 0 ? void 0 : _f.bot) === null || _g === void 0 ? void 0 : _g.food) || 'Unknown', "\n\nGenerate specific, actionable steps that implement the abstract plan.");
                        return [4 /*yield*/, this.ollamaClient.generate(this.config.detailedExecutor.model, userPrompt, {
                                systemPrompt: systemPrompt,
                                temperature: this.config.detailedExecutor.temperature,
                                maxTokens: this.config.detailedExecutor.maxTokens,
                                timeout: 5000, // 5 seconds for faster response
                            })];
                    case 1:
                        response = _h.sent();
                        return [2 /*return*/, __assign(__assign({}, abstractPlan), { detailedPlan: response.response, confidence: Math.min(abstractPlan.confidence + 0.1, 0.9), reasoning: __spreadArray(__spreadArray([], abstractPlan.reasoning, true), [
                                    'Generated detailed execution plan',
                                ], false) })];
                }
            });
        });
    };
    /**
     * Iterative refinement loop
     */
    HRMLLMInterface.prototype.iterativeRefinement = function (plan, request) {
        return __awaiter(this, void 0, void 0, function () {
            var currentPlan, iteration;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        currentPlan = plan;
                        iteration = 0;
                        _a.label = 1;
                    case 1:
                        if (!(iteration < this.config.refinementLoop.maxIterations)) return [3 /*break*/, 3];
                        // Check halt conditions
                        if (this.shouldHalt(currentPlan, iteration)) {
                            return [3 /*break*/, 3];
                        }
                        return [4 /*yield*/, this.refinePlan(currentPlan, request)];
                    case 2:
                        // Refine the plan
                        currentPlan = _a.sent();
                        iteration++;
                        return [3 /*break*/, 1];
                    case 3: return [2 /*return*/, __assign(__assign({}, currentPlan), { iterations: iteration, reasoning: __spreadArray(__spreadArray([], currentPlan.reasoning, true), [
                                "Completed ".concat(iteration, " refinement iterations"),
                            ], false) })];
                }
            });
        });
    };
    /**
     * Check if refinement should halt
     */
    HRMLLMInterface.prototype.shouldHalt = function (plan, iteration) {
        var _a = this.config.refinementLoop, haltCondition = _a.haltCondition, confidenceThreshold = _a.confidenceThreshold, timeBudgetMs = _a.timeBudgetMs;
        switch (haltCondition) {
            case 'confidence_threshold':
                return plan.confidence >= confidenceThreshold;
            case 'time_budget':
                return iteration >= 3; // Simplified time budget check
            case 'solution_quality':
                return plan.confidence >= 0.85;
            default:
                return iteration >= this.config.refinementLoop.maxIterations;
        }
    };
    /**
     * Refine the current plan
     */
    HRMLLMInterface.prototype.refinePlan = function (plan, request) {
        return __awaiter(this, void 0, void 0, function () {
            var systemPrompt, userPrompt, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        systemPrompt = "You are an expert Minecraft AI plan refiner. Your role is to improve and optimize existing plans based on feedback and analysis.\n\nFocus on:\n- Identifying potential issues or weaknesses\n- Suggesting improvements and optimizations\n- Adding robustness and error handling\n- Improving efficiency and success probability\n\nAnalyze the current plan and provide refined improvements.";
                        userPrompt = "Refine and improve this plan:\n\nCurrent Plan:\n".concat(plan.detailedPlan, "\n\nCurrent confidence: ").concat(plan.confidence, "\nRecent failures: ").concat(request.recentFailures.map(function (f) { return f.detail; }).join(', '), "\n\nProvide specific improvements to increase the plan's success probability and robustness.");
                        return [4 /*yield*/, this.ollamaClient.generate(this.config.abstractPlanner.model, // Use abstract planner for refinement
                            userPrompt, {
                                systemPrompt: systemPrompt,
                                temperature: 0.2,
                                maxTokens: 1024,
                                timeout: 5000, // 5 seconds for faster response
                            })];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, __assign(__assign({}, plan), { detailedPlan: response.response, confidence: Math.min(plan.confidence + 0.05, 0.95), estimatedSuccessRate: Math.min(plan.confidence + 0.1, 0.9), reasoning: __spreadArray(__spreadArray([], plan.reasoning, true), ['Refined plan based on analysis'], false) })];
                }
            });
        });
    };
    /**
     * Generate BT-DSL from refined plan
     */
    HRMLLMInterface.prototype.generateBTDSL = function (plan, request) {
        return __awaiter(this, void 0, void 0, function () {
            var systemPrompt, userPrompt, response, jsonMatch;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        systemPrompt = "You are an expert in Behavior Tree Domain Specific Language (BT-DSL). Your role is to convert detailed execution plans into structured BT-DSL JSON.\n\nAvailable node types:\n- Sequence: Execute children in order, fail if any child fails\n- Selector: Execute children until one succeeds\n- Repeat.Until: Repeat child until condition is met\n- Decorator.Timeout: Add timeout to child execution\n- Decorator.FailOnTrue: Fail if child returns true\n- Leaf: Execute specific action\n\nAvailable sensor predicates:\n- distance_to, hostiles_present, light_level_safe, inventory_has_item, etc.\n\nGenerate valid BT-DSL JSON that implements the provided plan.";
                        userPrompt = "Convert this detailed plan into BT-DSL JSON:\n\nPlan:\n".concat(plan.detailedPlan, "\n\nTask: ").concat(request.currentTask, "\nRecent failures: ").concat(request.recentFailures.map(function (f) { return f.detail; }).join(', '), "\n\nGenerate a BT-DSL JSON structure that implements this plan using the available node types and sensor predicates.");
                        return [4 /*yield*/, this.ollamaClient.generate(this.config.detailedExecutor.model, userPrompt, {
                                systemPrompt: systemPrompt,
                                temperature: 0.1,
                                maxTokens: 2048,
                                timeout: 5000, // 5 seconds for faster response
                            })];
                    case 1:
                        response = _a.sent();
                        try {
                            jsonMatch = response.response.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                return [2 /*return*/, JSON.parse(jsonMatch[0])];
                            }
                            else {
                                // Fallback to a simple sequence
                                return [2 /*return*/, {
                                        type: 'sequence',
                                        children: [
                                            {
                                                type: 'leaf',
                                                name: 'wait',
                                                args: { durationMs: 1000 },
                                            },
                                        ],
                                    }];
                            }
                        }
                        catch (error) {
                            console.warn('Failed to parse BT-DSL JSON, using fallback:', error);
                            return [2 /*return*/, {
                                    type: 'sequence',
                                    children: [
                                        {
                                            type: 'leaf',
                                            name: 'wait',
                                            args: { durationMs: 1000 },
                                        },
                                    ],
                                }];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Generate option name from task description
     */
    HRMLLMInterface.prototype.generateOptionName = function (task) {
        // Convert task description to camelCase option name
        return task
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+(\w)/g, function (_, char) { return char.toUpperCase(); })
            .replace(/^(\w)/, function (char) { return char.toLowerCase(); })
            .substring(0, 30); // Limit length
    };
    /**
     * Get available models
     */
    HRMLLMInterface.prototype.getAvailableModels = function () {
        return this.availableModels.map(function (model) { return model.name; });
    };
    /**
     * Update configuration
     */
    HRMLLMInterface.prototype.updateConfig = function (config) {
        this.config = __assign(__assign({}, this.config), config);
    };
    /**
     * Test model availability
     */
    HRMLLMInterface.prototype.testModelAvailability = function (modelName) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ollamaClient.isModelAvailable(modelName)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return HRMLLMInterface;
}());
exports.HRMLLMInterface = HRMLLMInterface;

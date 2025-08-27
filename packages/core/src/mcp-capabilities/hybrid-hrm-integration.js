#!/usr/bin/env tsx
"use strict";
/**
 * Hybrid HRM Integration
 *
 * Implements the documented three-system architecture:
 * - LLM: Language/narrative/social reasoning
 * - Python HRM: Structured and quick logistical reasoning (27M parameters)
 * - GOAP: Quick reactive responses (combat, survival, emergencies)
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HybridHRMRouter = void 0;
/**
 * Hybrid HRM Router
 *
 * Routes tasks to the most appropriate reasoning system according to our documented architecture:
 * - Python HRM: Structured and quick logistical reasoning (puzzles, optimization, pathfinding)
 * - LLM: Language/narrative/social reasoning (explanations, creative tasks, social interaction)
 * - GOAP: Quick reactive responses (combat, survival, emergency responses)
 */
var HybridHRMRouter = /** @class */ (function () {
    function HybridHRMRouter(pythonHRMConfig, llmConfig, goapConfig) {
        this.isInitialized = false;
        this.pythonHRM = this.createPythonHRMInterface(pythonHRMConfig);
        this.llm = this.createLLMInterface(llmConfig);
        this.goap = this.createGOAPInterface(goapConfig);
    }
    /**
     * Initialize all three reasoning systems
     */
    HybridHRMRouter.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var pythonHRMAvailable, llmAvailable, goapAvailable, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log('🧠 Initializing Hybrid HRM System...');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.pythonHRM.initialize()];
                    case 2:
                        pythonHRMAvailable = _a.sent();
                        if (!pythonHRMAvailable) {
                            console.warn('⚠️ Python HRM not available, falling back to LLM-only mode');
                        }
                        llmAvailable = this.llm.isAvailable();
                        if (!llmAvailable) {
                            console.warn('⚠️ LLM not available, falling back to GOAP-only mode');
                        }
                        goapAvailable = this.goap.isAvailable();
                        if (!goapAvailable) {
                            console.warn('⚠️ GOAP not available, system may be limited');
                        }
                        this.isInitialized = true;
                        console.log('✅ Hybrid HRM System initialized');
                        return [2 /*return*/, true];
                    case 3:
                        error_1 = _a.sent();
                        console.error('❌ Failed to initialize Hybrid HRM System:', error_1);
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Route and execute reasoning task according to documented architecture
     */
    HybridHRMRouter.prototype.reason = function (task, context, budget) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, taskSignature;
            return __generator(this, function (_a) {
                if (!this.isInitialized) {
                    throw new Error('Hybrid HRM System not initialized');
                }
                startTime = performance.now();
                taskSignature = this.analyzeTaskSignature(task, context);
                // Debug logging
                console.log("\uD83D\uDD0D Task: \"".concat(task, "\""));
                console.log("\uD83D\uDCCA Signature:", {
                    structured: taskSignature.structuredReasoning.toFixed(2),
                    narrative: taskSignature.narrativeReasoning.toFixed(2),
                    reactive: taskSignature.reactiveResponse.toFixed(2),
                    complexity: taskSignature.complexity.toFixed(2),
                    timeCritical: taskSignature.timeCritical,
                    safetyCritical: taskSignature.safetyCritical,
                });
                // Route to appropriate system based on documented architecture
                if (this.shouldUseGOAP(taskSignature)) {
                    console.log("\u26A1 Routing to GOAP (reactive response)");
                    return [2 /*return*/, this.executeGOAP(task, context, budget)];
                }
                else if (this.shouldUsePythonHRM(taskSignature)) {
                    console.log("\uD83E\uDDE0 Routing to Python HRM (structured reasoning)");
                    return [2 /*return*/, this.executePythonHRM(task, context, budget)];
                }
                else if (this.shouldUseLLM(taskSignature)) {
                    console.log("\uD83D\uDCAC Routing to LLM (language/narrative)");
                    return [2 /*return*/, this.executeLLM(task, context)];
                }
                console.log("\u26A1 Routing to GOAP (fallback)");
                return [2 /*return*/, this.executeGOAP(task, context, budget)];
            });
        });
    };
    /**
     * Analyze task to determine optimal routing
     */
    HybridHRMRouter.prototype.analyzeTaskSignature = function (task, context) {
        console.log("TODO: Use ".concat(context, " to analyse task ").concat(task));
        var signature = {
            structuredReasoning: 0,
            narrativeReasoning: 0,
            reactiveResponse: 0,
            complexity: 0,
            timeCritical: false,
            safetyCritical: false,
        };
        var taskLower = task.toLowerCase();
        // Structured reasoning indicators (Python HRM domain)
        var structuredKeywords = [
            'puzzle',
            'solve',
            'optimize',
            'path',
            'route',
            'algorithm',
            'calculate',
            'compute',
            'find',
            'determine',
            'figure out',
            'sudoku',
            'maze',
            'logic',
            'constraint',
            'satisfaction',
            'planning',
            'strategy',
            'efficiency',
            'minimize',
            'maximize',
        ];
        var structuredMatches = structuredKeywords.filter(function (keyword) {
            return taskLower.includes(keyword);
        }).length;
        signature.structuredReasoning = Math.min(structuredMatches / 3, 1);
        // Narrative reasoning indicators (LLM domain)
        var narrativeKeywords = [
            'explain',
            'describe',
            'story',
            'narrative',
            'creative',
            'imagine',
            'social',
            'interaction',
            'conversation',
            'dialogue',
            'interpret',
            'meaning',
            'context',
            'relationship',
            'emotion',
            'feeling',
            'opinion',
            'perspective',
            'analysis',
            'reflection',
        ];
        var narrativeMatches = narrativeKeywords.filter(function (keyword) {
            return taskLower.includes(keyword);
        }).length;
        signature.narrativeReasoning = Math.min(narrativeMatches / 3, 1);
        // Reactive response indicators (GOAP domain)
        var reactiveKeywords = [
            'attack',
            'defend',
            'escape',
            'flee',
            'survive',
            'eat',
            'drink',
            'heal',
            'block',
            'dodge',
            'evade',
            'protect',
            'guard',
            'alert',
            'danger',
            'threat',
            'emergency',
            'urgent',
            'immediate',
            'quick',
            'fast',
            'reflex',
            'reaction',
        ];
        var reactiveMatches = reactiveKeywords.filter(function (keyword) {
            return taskLower.includes(keyword);
        }).length;
        signature.reactiveResponse = Math.min(reactiveMatches / 3, 1);
        // Complexity assessment
        var wordCount = task.split(' ').length;
        signature.complexity = Math.min(wordCount / 20, 1);
        // Time and safety criticality
        signature.timeCritical =
            taskLower.includes('urgent') ||
                taskLower.includes('emergency') ||
                taskLower.includes('immediate') ||
                taskLower.includes('quick') ||
                taskLower.includes('fast');
        signature.safetyCritical =
            taskLower.includes('danger') ||
                taskLower.includes('threat') ||
                taskLower.includes('attack') ||
                taskLower.includes('survive') ||
                taskLower.includes('protect');
        return signature;
    };
    /**
     * Determine if task should use GOAP (reactive responses)
     */
    HybridHRMRouter.prototype.shouldUseGOAP = function (signature) {
        return (signature.reactiveResponse > 0.4 ||
            signature.timeCritical ||
            signature.safetyCritical ||
            this.isSimpleSignal(signature));
    };
    /**
     * Determine if task should use Python HRM (structured reasoning)
     */
    HybridHRMRouter.prototype.shouldUsePythonHRM = function (signature) {
        return (signature.structuredReasoning > 0.3 &&
            signature.complexity > 0.1 &&
            !signature.timeCritical &&
            this.pythonHRM.isAvailable());
    };
    /**
     * Determine if task should use LLM (language/narrative)
     */
    HybridHRMRouter.prototype.shouldUseLLM = function (signature) {
        return (signature.narrativeReasoning > 0.3 ||
            (signature.structuredReasoning < 0.2 && signature.complexity > 0.1) ||
            this.llm.isAvailable());
    };
    /**
     * Check if task is a simple signal that should go to GOAP
     */
    HybridHRMRouter.prototype.isSimpleSignal = function (signature) {
        var simpleSignals = [
            'threatProximity',
            'health',
            'hunger',
            'fatigue',
            'playerNearby',
            'isolationTime',
            'toolDeficit',
            'questBacklog',
            'lightLevel',
            'weather',
            'timeOfDay',
            'biome',
            'position',
        ];
        return simpleSignals.some(function (signal) {
            console.log("TODO: Use ".concat(signal, " to analyse signal"));
            return signature.reactiveResponse > 0.2 || signature.timeCritical;
        });
    };
    /**
     * Execute task using GOAP (reactive responses)
     */
    HybridHRMRouter.prototype.executeGOAP = function (task, context, budget) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, result, _a, _b, error_2;
            var _c, _d;
            var _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        startTime = performance.now();
                        _f.label = 1;
                    case 1:
                        _f.trys.push([1, 4, , 5]);
                        _b = (_a = this.goap).plan;
                        _c = {
                            goal: task
                        };
                        _d = {
                            position: (_e = context.bot.entity) === null || _e === void 0 ? void 0 : _e.position,
                            health: context.bot.health,
                            hunger: context.bot.food
                        };
                        return [4 /*yield*/, context.inventory()];
                    case 2: return [4 /*yield*/, _b.apply(_a, [(_c.context = (_d.inventory = _f.sent(),
                                _d),
                                _c.urgency = this.determineUrgency(task),
                                _c)])];
                    case 3:
                        result = _f.sent();
                        return [2 /*return*/, {
                                primarySystem: 'goap',
                                result: result.actions,
                                confidence: result.confidence,
                                reasoningTrace: ["GOAP planned ".concat(result.actions.length, " actions")],
                                executionTime: performance.now() - startTime,
                                fallbackUsed: false,
                            }];
                    case 4:
                        error_2 = _f.sent();
                        console.error('❌ GOAP execution failed:', error_2);
                        return [2 /*return*/, {
                                primarySystem: 'goap',
                                result: null,
                                confidence: 0,
                                reasoningTrace: ["GOAP failed: ".concat(error_2)],
                                executionTime: performance.now() - startTime,
                                fallbackUsed: true,
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Execute task using Python HRM (structured reasoning)
     */
    HybridHRMRouter.prototype.executePythonHRM = function (task, context, budget) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, result, error_3;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        startTime = performance.now();
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.pythonHRM.infer({
                                task: task,
                                context: {
                                    position: (_a = context.bot.entity) === null || _a === void 0 ? void 0 : _a.position,
                                    inventory: ((_c = (_b = context.bot.inventory) === null || _b === void 0 ? void 0 : _b.items) === null || _c === void 0 ? void 0 : _c.call(_b)) || [],
                                    worldState: {
                                        health: context.bot.health || 20,
                                        food: context.bot.food || 20,
                                        timeOfDay: ((_d = context.bot.time) === null || _d === void 0 ? void 0 : _d.timeOfDay) || 6000,
                                        lightLevel: 15, // Default
                                    },
                                },
                                constraints: {
                                    maxTime: budget.maxTimeMs,
                                    maxComplexity: budget.maxComplexity,
                                },
                            })];
                    case 2:
                        result = _e.sent();
                        return [2 /*return*/, {
                                primarySystem: 'python-hrm',
                                result: result.solution,
                                confidence: result.confidence,
                                reasoningTrace: [
                                    "Python HRM completed in ".concat(result.reasoningSteps, " steps"),
                                ],
                                executionTime: performance.now() - startTime,
                                fallbackUsed: false,
                            }];
                    case 3:
                        error_3 = _e.sent();
                        console.error('❌ Python HRM execution failed:', error_3);
                        return [2 /*return*/, {
                                primarySystem: 'python-hrm',
                                result: null,
                                confidence: 0,
                                reasoningTrace: ["Python HRM failed: ".concat(error_3)],
                                executionTime: performance.now() - startTime,
                                fallbackUsed: true,
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Execute LLM reasoning
     */
    HybridHRMRouter.prototype.executeLLM = function (task, context) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, safeContext, result, error_4;
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        startTime = performance.now();
                        _k.label = 1;
                    case 1:
                        _k.trys.push([1, 3, , 4]);
                        safeContext = {
                            position: ((_b = (_a = context.bot) === null || _a === void 0 ? void 0 : _a.entity) === null || _b === void 0 ? void 0 : _b.position) || { x: 0, y: 64, z: 0 },
                            inventory: ((_e = (_d = (_c = context.bot) === null || _c === void 0 ? void 0 : _c.inventory) === null || _d === void 0 ? void 0 : _d.items) === null || _e === void 0 ? void 0 : _e.call(_d)) || [],
                            worldState: {
                                health: ((_f = context.bot) === null || _f === void 0 ? void 0 : _f.health) || 20,
                                food: ((_g = context.bot) === null || _g === void 0 ? void 0 : _g.food) || 20,
                                timeOfDay: ((_j = (_h = context.bot) === null || _h === void 0 ? void 0 : _h.time) === null || _j === void 0 ? void 0 : _j.timeOfDay) || 6000,
                                lightLevel: 15, // Default
                            },
                        };
                        return [4 /*yield*/, this.llm.generate({
                                prompt: task,
                                context: safeContext,
                                systemMessage: 'You are a helpful AI assistant in a Minecraft world. Provide clear, actionable advice.',
                            })];
                    case 2:
                        result = _k.sent();
                        return [2 /*return*/, {
                                primarySystem: 'llm',
                                result: result.response,
                                confidence: result.confidence,
                                reasoningTrace: ["LLM generated response in ".concat(result.executionTime, "ms")],
                                executionTime: performance.now() - startTime,
                                fallbackUsed: false,
                            }];
                    case 3:
                        error_4 = _k.sent();
                        console.error('❌ LLM execution failed:', error_4);
                        return [2 /*return*/, {
                                primarySystem: 'llm',
                                result: null,
                                confidence: 0,
                                reasoningTrace: ["LLM failed: ".concat(error_4)],
                                executionTime: performance.now() - startTime,
                                fallbackUsed: true,
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Determine urgency level for GOAP
     */
    HybridHRMRouter.prototype.determineUrgency = function (task) {
        var taskLower = task.toLowerCase();
        if (taskLower.includes('emergency') || taskLower.includes('attack')) {
            return 'emergency';
        }
        if (taskLower.includes('urgent') || taskLower.includes('danger')) {
            return 'high';
        }
        if (taskLower.includes('quick') || taskLower.includes('fast')) {
            return 'medium';
        }
        return 'low';
    };
    /**
     * Create Python HRM interface
     */
    HybridHRMRouter.prototype.createPythonHRMInterface = function (config) {
        return {
            initialize: function () {
                return __awaiter(this, void 0, void 0, function () {
                    var healthResponse, health, testResponse, inferenceError_1, error_5;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 7, , 8]);
                                return [4 /*yield*/, fetch('http://localhost:5001/health')];
                            case 1:
                                healthResponse = _a.sent();
                                if (!healthResponse.ok) {
                                    console.warn('Python HRM health check failed:', healthResponse.statusText);
                                    return [2 /*return*/, false];
                                }
                                return [4 /*yield*/, healthResponse.json()];
                            case 2:
                                health = (_a.sent());
                                // If the model is initialized, consider it available even if hrm_available is false
                                if (health.model_initialized) {
                                    console.log('✅ Python HRM model is initialized and available');
                                    return [2 /*return*/, true];
                                }
                                _a.label = 3;
                            case 3:
                                _a.trys.push([3, 5, , 6]);
                                return [4 /*yield*/, fetch('http://localhost:5001/infer', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            task: 'test',
                                            context: {},
                                        }),
                                    })];
                            case 4:
                                testResponse = _a.sent();
                                if (testResponse.ok) {
                                    console.log('✅ Python HRM inference test successful');
                                    return [2 /*return*/, true];
                                }
                                return [3 /*break*/, 6];
                            case 5:
                                inferenceError_1 = _a.sent();
                                console.warn('Python HRM inference test failed:', inferenceError_1);
                                return [3 /*break*/, 6];
                            case 6: return [2 /*return*/, false];
                            case 7:
                                error_5 = _a.sent();
                                console.warn('Python HRM bridge not available:', error_5);
                                return [2 /*return*/, false];
                            case 8: return [2 /*return*/];
                        }
                    });
                });
            },
            infer: function (input) {
                return __awaiter(this, void 0, void 0, function () {
                    var controller, timeoutId, response, error_6;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                controller = new AbortController();
                                timeoutId = setTimeout(function () { return controller.abort(); }, 3000);
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 4, , 5]);
                                return [4 /*yield*/, fetch('http://localhost:5001/infer', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(input),
                                        signal: controller.signal,
                                    })];
                            case 2:
                                response = _a.sent();
                                clearTimeout(timeoutId);
                                if (!response.ok) {
                                    throw new Error("Python HRM inference failed: ".concat(response.statusText));
                                }
                                return [4 /*yield*/, response.json()];
                            case 3: return [2 /*return*/, (_a.sent())];
                            case 4:
                                error_6 = _a.sent();
                                clearTimeout(timeoutId);
                                if (error_6 instanceof Error && error_6.name === 'AbortError') {
                                    throw new Error('Python HRM request timed out');
                                }
                                throw error_6;
                            case 5: return [2 /*return*/];
                        }
                    });
                });
            },
            isAvailable: function () {
                // This would need to be implemented with proper health checking
                return true;
            },
        };
    };
    /**
     * Create LLM interface
     */
    HybridHRMRouter.prototype.createLLMInterface = function (config) {
        // Use real Ollama API based on benchmark results
        return {
            generate: function (input) {
                return __awaiter(this, void 0, void 0, function () {
                    var startTime, timeout, timeoutId, controller_1, response, result, executionTime, error_7, executionTime;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                startTime = performance.now();
                                timeout = (config === null || config === void 0 ? void 0 : config.timeout) || 5000;
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 4, , 5]);
                                controller_1 = new AbortController();
                                timeoutId = setTimeout(function () { return controller_1.abort(); }, timeout);
                                return [4 /*yield*/, fetch('http://localhost:11434/api/generate', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            model: (config === null || config === void 0 ? void 0 : config.model) || 'qwen3:0.6b', // Use fastest model
                                            prompt: "Minecraft: ".concat(input.prompt, ". Give a brief action plan in 1 sentence."),
                                            stream: false,
                                            options: {
                                                temperature: (config === null || config === void 0 ? void 0 : config.temperature) || 0.3, // Lower temperature for more focused responses
                                                top_p: 0.9,
                                                max_tokens: (config === null || config === void 0 ? void 0 : config.maxTokens) || 50, // Much shorter responses
                                            },
                                        }),
                                        signal: controller_1.signal,
                                    })];
                            case 2:
                                response = _a.sent();
                                clearTimeout(timeoutId);
                                if (!response.ok) {
                                    throw new Error("HTTP ".concat(response.status, ": ").concat(response.statusText));
                                }
                                return [4 /*yield*/, response.json()];
                            case 3:
                                result = _a.sent();
                                executionTime = performance.now() - startTime;
                                return [2 /*return*/, {
                                        response: result.response,
                                        confidence: 0.8, // Based on benchmark success rate
                                        executionTime: executionTime,
                                    }];
                            case 4:
                                error_7 = _a.sent();
                                if (timeoutId) {
                                    clearTimeout(timeoutId);
                                }
                                executionTime = performance.now() - startTime;
                                if (error_7 instanceof Error && error_7.name === 'AbortError') {
                                    return [2 /*return*/, {
                                            response: 'LLM request timed out',
                                            confidence: 0.0,
                                            executionTime: executionTime,
                                            error: 'timeout',
                                        }];
                                }
                                return [2 /*return*/, {
                                        response: "Error: ".concat(error_7 instanceof Error ? error_7.message : String(error_7)),
                                        confidence: 0.0,
                                        executionTime: executionTime,
                                        error: error_7 instanceof Error ? error_7.message : String(error_7),
                                    }];
                            case 5: return [2 /*return*/];
                        }
                    });
                });
            },
            isAvailable: function () {
                // Check if Ollama is running
                return true; // We'll handle errors in generate()
            },
        };
    };
    /**
     * Create GOAP interface
     */
    HybridHRMRouter.prototype.createGOAPInterface = function (config) {
        // This would integrate with our existing GOAP system
        return {
            plan: function (input) {
                return __awaiter(this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        // Placeholder - would integrate with actual GOAP
                        return [2 /*return*/, {
                                actions: ["GOAP action for: ".concat(input.goal)],
                                confidence: 0.9,
                                executionTime: 10,
                            }];
                    });
                });
            },
            isAvailable: function () {
                return true;
            },
        };
    };
    return HybridHRMRouter;
}());
exports.HybridHRMRouter = HybridHRMRouter;

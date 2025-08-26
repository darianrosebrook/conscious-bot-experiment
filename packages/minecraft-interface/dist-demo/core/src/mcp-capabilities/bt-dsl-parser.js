"use strict";
/**
 * BT-DSL Parser and Compiler - Deterministic compilation for reproducible results
 *
 * Parses BT-DSL JSON into executable behavior trees with deterministic compilation
 * and named sensor predicate evaluation.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BTDSLParser = exports.SensorPredicateEvaluator = void 0;
var ajv_1 = __importDefault(require("ajv"));
var node_perf_hooks_1 = require("node:perf_hooks");
var bt_dsl_schema_1 = require("./bt-dsl-schema");
var leaf_contracts_1 = require("./leaf-contracts");
// ============================================================================
// Sensor Predicate Evaluator
// ============================================================================
/**
 * Evaluates named sensor predicates
 */
var SensorPredicateEvaluator = /** @class */ (function () {
    function SensorPredicateEvaluator() {
    }
    /**
     * Evaluate a sensor predicate
     */
    SensorPredicateEvaluator.prototype.evaluate = function (predicate, ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var name, _a, parameters;
            return __generator(this, function (_b) {
                name = predicate.name, _a = predicate.parameters, parameters = _a === void 0 ? {} : _a;
                switch (name) {
                    case 'distance_to':
                        return [2 /*return*/, this.evaluateDistanceTo(parameters, ctx)];
                    case 'hostiles_present':
                        return [2 /*return*/, this.evaluateHostilesPresent(parameters, ctx)];
                    case 'light_level_safe':
                        return [2 /*return*/, this.evaluateLightLevelSafe(parameters, ctx)];
                    case 'inventory_has_item':
                        return [2 /*return*/, this.evaluateInventoryHasItem(parameters, ctx)];
                    case 'position_reached':
                        return [2 /*return*/, this.evaluatePositionReached(parameters, ctx)];
                    case 'time_elapsed':
                        return [2 /*return*/, this.evaluateTimeElapsed(parameters, ctx)];
                    case 'health_low':
                        return [2 /*return*/, this.evaluateHealthLow(parameters, ctx)];
                    case 'hunger_low':
                        return [2 /*return*/, this.evaluateHungerLow(parameters, ctx)];
                    case 'weather_bad':
                        return [2 /*return*/, this.evaluateWeatherBad(parameters, ctx)];
                    case 'biome_safe':
                        return [2 /*return*/, this.evaluateBiomeSafe(parameters, ctx)];
                    default:
                        throw new Error("Unknown sensor predicate: ".concat(name));
                }
                return [2 /*return*/];
            });
        });
    };
    SensorPredicateEvaluator.prototype.evaluateDistanceTo = function (params, ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var target, _a, maxDistance, botPos, distance;
            var _b;
            return __generator(this, function (_c) {
                target = params.target, _a = params.maxDistance, maxDistance = _a === void 0 ? 5 : _a;
                if (!target || !target.x || !target.y || !target.z)
                    return [2 /*return*/, false];
                botPos = (_b = ctx.bot.entity) === null || _b === void 0 ? void 0 : _b.position;
                if (!botPos)
                    return [2 /*return*/, false];
                distance = Math.sqrt(Math.pow(botPos.x - target.x, 2) +
                    Math.pow(botPos.y - target.y, 2) +
                    Math.pow(botPos.z - target.z, 2));
                return [2 /*return*/, distance <= maxDistance];
            });
        });
    };
    SensorPredicateEvaluator.prototype.evaluateHostilesPresent = function (params, ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, maxDistance, snapshot;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = params.maxDistance, maxDistance = _a === void 0 ? 10 : _a;
                        return [4 /*yield*/, ctx.snapshot()];
                    case 1:
                        snapshot = _b.sent();
                        return [2 /*return*/, snapshot.nearbyHostiles.some(function (hostile) { return hostile.distance <= maxDistance; })];
                }
            });
        });
    };
    SensorPredicateEvaluator.prototype.evaluateLightLevelSafe = function (params, ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, minLight, snapshot;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = params.minLight, minLight = _a === void 0 ? 8 : _a;
                        return [4 /*yield*/, ctx.snapshot()];
                    case 1:
                        snapshot = _b.sent();
                        return [2 /*return*/, snapshot.lightLevel >= minLight];
                }
            });
        });
    };
    SensorPredicateEvaluator.prototype.evaluateInventoryHasItem = function (params, ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var itemName, _a, minCount, inventory, item;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        itemName = params.itemName, _a = params.minCount, minCount = _a === void 0 ? 1 : _a;
                        if (!itemName)
                            return [2 /*return*/, false];
                        return [4 /*yield*/, ctx.inventory()];
                    case 1:
                        inventory = _b.sent();
                        item = inventory.items.find(function (i) { return i.name === itemName; });
                        return [2 /*return*/, item ? item.count >= minCount : false];
                }
            });
        });
    };
    SensorPredicateEvaluator.prototype.evaluatePositionReached = function (params, ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var target, _a, tolerance, botPos, distance;
            var _b;
            return __generator(this, function (_c) {
                target = params.target, _a = params.tolerance, tolerance = _a === void 0 ? 1 : _a;
                if (!target)
                    return [2 /*return*/, false];
                botPos = (_b = ctx.bot.entity) === null || _b === void 0 ? void 0 : _b.position;
                if (!botPos)
                    return [2 /*return*/, false];
                distance = Math.sqrt(Math.pow(botPos.x - target.x, 2) +
                    Math.pow(botPos.y - target.y, 2) +
                    Math.pow(botPos.z - target.z, 2));
                return [2 /*return*/, distance <= tolerance];
            });
        });
    };
    SensorPredicateEvaluator.prototype.evaluateTimeElapsed = function (params, ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, minElapsedMs, elapsed;
            return __generator(this, function (_a) {
                startTime = params.startTime, minElapsedMs = params.minElapsedMs;
                if (!startTime || !minElapsedMs)
                    return [2 /*return*/, false];
                elapsed = ctx.now() - startTime;
                return [2 /*return*/, elapsed >= minElapsedMs];
            });
        });
    };
    SensorPredicateEvaluator.prototype.evaluateHealthLow = function (params, ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, threshold, health;
            return __generator(this, function (_b) {
                _a = params.threshold, threshold = _a === void 0 ? 10 : _a;
                health = ctx.bot.health || 20;
                return [2 /*return*/, health <= threshold];
            });
        });
    };
    SensorPredicateEvaluator.prototype.evaluateHungerLow = function (params, ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, threshold, food;
            return __generator(this, function (_b) {
                _a = params.threshold, threshold = _a === void 0 ? 6 : _a;
                food = ctx.bot.food || 20;
                return [2 /*return*/, food <= threshold];
            });
        });
    };
    SensorPredicateEvaluator.prototype.evaluateWeatherBad = function (params, ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var snapshot;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, ctx.snapshot()];
                    case 1:
                        snapshot = _a.sent();
                        return [2 /*return*/, snapshot.weather === 'rain' || snapshot.weather === 'thunder'];
                }
            });
        });
    };
    SensorPredicateEvaluator.prototype.evaluateBiomeSafe = function (params, ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, safeBiomes, snapshot;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = params.safeBiomes, safeBiomes = _a === void 0 ? ['plains', 'forest', 'desert'] : _a;
                        return [4 /*yield*/, ctx.snapshot()];
                    case 1:
                        snapshot = _b.sent();
                        return [2 /*return*/, safeBiomes.includes(snapshot.biome)];
                }
            });
        });
    };
    return SensorPredicateEvaluator;
}());
exports.SensorPredicateEvaluator = SensorPredicateEvaluator;
// ============================================================================
// Compiled Node Implementations
// ============================================================================
/**
 * Compiled leaf node
 */
var CompiledLeafNode = /** @class */ (function () {
    function CompiledLeafNode(node, leafFactory) {
        this.node = node;
        this.leafFactory = leafFactory;
    }
    Object.defineProperty(CompiledLeafNode.prototype, "type", {
        get: function () {
            return this.node.type;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(CompiledLeafNode.prototype, "name", {
        get: function () {
            return this.node.name;
        },
        enumerable: false,
        configurable: true
    });
    CompiledLeafNode.prototype.execute = function (ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, leaf, result, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = node_perf_hooks_1.performance.now();
                        ctx.leafExecutions++;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        leaf = this.leafFactory.get(this.node.leafName, this.node.leafVersion);
                        if (!leaf) {
                            return [2 /*return*/, {
                                    status: 'failure',
                                    error: {
                                        code: 'unknown',
                                        retryable: false,
                                        detail: "Leaf not found: ".concat(this.node.leafName),
                                    },
                                }];
                        }
                        return [4 /*yield*/, this.leafFactory.run(this.node.leafName, this.node.leafVersion || '1.0.0', ctx.leafContext, this.node.args || {}, { traceId: "bt-".concat(this.node.name || this.node.leafName) })];
                    case 2:
                        result = _a.sent();
                        return [2 /*return*/, {
                                status: result.status,
                                result: result.result,
                                error: result.error,
                                metrics: {
                                    durationMs: node_perf_hooks_1.performance.now() - startTime,
                                    nodeExecutions: 1,
                                    leafExecutions: 1,
                                },
                            }];
                    case 3:
                        error_1 = _a.sent();
                        return [2 /*return*/, {
                                status: 'failure',
                                error: (0, leaf_contracts_1.createExecError)(error_1),
                                metrics: {
                                    durationMs: node_perf_hooks_1.performance.now() - startTime,
                                    nodeExecutions: 1,
                                    leafExecutions: 1,
                                },
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return CompiledLeafNode;
}());
/**
 * Compiled sequence node
 */
var CompiledSequenceNode = /** @class */ (function () {
    function CompiledSequenceNode(node, children) {
        this.node = node;
        this.children = children;
    }
    Object.defineProperty(CompiledSequenceNode.prototype, "type", {
        get: function () {
            return this.node.type;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(CompiledSequenceNode.prototype, "name", {
        get: function () {
            return this.node.name;
        },
        enumerable: false,
        configurable: true
    });
    CompiledSequenceNode.prototype.execute = function (ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, totalNodeExecutions, totalLeafExecutions, _i, _a, child, result;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        startTime = node_perf_hooks_1.performance.now();
                        ctx.nodeExecutions++;
                        totalNodeExecutions = 0;
                        totalLeafExecutions = 0;
                        _i = 0, _a = this.children;
                        _d.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        child = _a[_i];
                        return [4 /*yield*/, child.execute(ctx)];
                    case 2:
                        result = _d.sent();
                        totalNodeExecutions += ((_b = result.metrics) === null || _b === void 0 ? void 0 : _b.nodeExecutions) || 0;
                        totalLeafExecutions += ((_c = result.metrics) === null || _c === void 0 ? void 0 : _c.leafExecutions) || 0;
                        if (result.status === 'failure') {
                            return [2 /*return*/, {
                                    status: 'failure',
                                    error: result.error,
                                    metrics: {
                                        durationMs: node_perf_hooks_1.performance.now() - startTime,
                                        nodeExecutions: totalNodeExecutions,
                                        leafExecutions: totalLeafExecutions,
                                    },
                                }];
                        }
                        _d.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, {
                            status: 'success',
                            metrics: {
                                durationMs: node_perf_hooks_1.performance.now() - startTime,
                                nodeExecutions: totalNodeExecutions,
                                leafExecutions: totalLeafExecutions,
                            },
                        }];
                }
            });
        });
    };
    return CompiledSequenceNode;
}());
/**
 * Compiled selector node
 */
var CompiledSelectorNode = /** @class */ (function () {
    function CompiledSelectorNode(node, children) {
        this.node = node;
        this.children = children;
    }
    Object.defineProperty(CompiledSelectorNode.prototype, "type", {
        get: function () {
            return this.node.type;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(CompiledSelectorNode.prototype, "name", {
        get: function () {
            return this.node.name;
        },
        enumerable: false,
        configurable: true
    });
    CompiledSelectorNode.prototype.execute = function (ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, totalNodeExecutions, totalLeafExecutions, lastError, _i, _a, child, result;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        startTime = node_perf_hooks_1.performance.now();
                        ctx.nodeExecutions++;
                        totalNodeExecutions = 0;
                        totalLeafExecutions = 0;
                        _i = 0, _a = this.children;
                        _d.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        child = _a[_i];
                        return [4 /*yield*/, child.execute(ctx)];
                    case 2:
                        result = _d.sent();
                        totalNodeExecutions += ((_b = result.metrics) === null || _b === void 0 ? void 0 : _b.nodeExecutions) || 0;
                        totalLeafExecutions += ((_c = result.metrics) === null || _c === void 0 ? void 0 : _c.leafExecutions) || 0;
                        if (result.status === 'success') {
                            return [2 /*return*/, {
                                    status: 'success',
                                    result: result.result,
                                    metrics: {
                                        durationMs: node_perf_hooks_1.performance.now() - startTime,
                                        nodeExecutions: totalNodeExecutions,
                                        leafExecutions: totalLeafExecutions,
                                    },
                                }];
                        }
                        if (result.error) {
                            lastError = result.error;
                        }
                        _d.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, {
                            status: 'failure',
                            error: lastError || {
                                code: 'unknown',
                                retryable: false,
                                detail: 'All selector children failed',
                            },
                            metrics: {
                                durationMs: node_perf_hooks_1.performance.now() - startTime,
                                nodeExecutions: totalNodeExecutions,
                                leafExecutions: totalLeafExecutions,
                            },
                        }];
                }
            });
        });
    };
    return CompiledSelectorNode;
}());
/**
 * Compiled repeat until node
 */
var CompiledRepeatUntilNode = /** @class */ (function () {
    function CompiledRepeatUntilNode(node, child, condition, evaluator) {
        this.node = node;
        this.child = child;
        this.condition = condition;
        this.evaluator = evaluator;
    }
    Object.defineProperty(CompiledRepeatUntilNode.prototype, "type", {
        get: function () {
            return this.node.type;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(CompiledRepeatUntilNode.prototype, "name", {
        get: function () {
            return this.node.name;
        },
        enumerable: false,
        configurable: true
    });
    CompiledRepeatUntilNode.prototype.execute = function (ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, totalNodeExecutions, totalLeafExecutions, maxIterations, iterations, conditionMet, result;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        startTime = node_perf_hooks_1.performance.now();
                        ctx.nodeExecutions++;
                        totalNodeExecutions = 0;
                        totalLeafExecutions = 0;
                        maxIterations = this.node.maxIterations || 100;
                        iterations = 0;
                        _c.label = 1;
                    case 1:
                        if (!(iterations < maxIterations)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.evaluator.evaluate(this.condition, ctx.leafContext)];
                    case 2:
                        conditionMet = _c.sent();
                        if (conditionMet) {
                            return [2 /*return*/, {
                                    status: 'success',
                                    metrics: {
                                        durationMs: node_perf_hooks_1.performance.now() - startTime,
                                        nodeExecutions: totalNodeExecutions,
                                        leafExecutions: totalLeafExecutions,
                                    },
                                }];
                        }
                        return [4 /*yield*/, this.child.execute(ctx)];
                    case 3:
                        result = _c.sent();
                        totalNodeExecutions += ((_a = result.metrics) === null || _a === void 0 ? void 0 : _a.nodeExecutions) || 0;
                        totalLeafExecutions += ((_b = result.metrics) === null || _b === void 0 ? void 0 : _b.leafExecutions) || 0;
                        if (result.status === 'failure') {
                            return [2 /*return*/, {
                                    status: 'failure',
                                    error: result.error,
                                    metrics: {
                                        durationMs: node_perf_hooks_1.performance.now() - startTime,
                                        nodeExecutions: totalNodeExecutions,
                                        leafExecutions: totalLeafExecutions,
                                    },
                                }];
                        }
                        iterations++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, {
                            status: 'failure',
                            error: {
                                code: 'unknown',
                                retryable: false,
                                detail: "Repeat.Until exceeded max iterations: ".concat(maxIterations),
                            },
                            metrics: {
                                durationMs: node_perf_hooks_1.performance.now() - startTime,
                                nodeExecutions: totalNodeExecutions,
                                leafExecutions: totalLeafExecutions,
                            },
                        }];
                }
            });
        });
    };
    return CompiledRepeatUntilNode;
}());
/**
 * Compiled timeout decorator node
 */
var CompiledTimeoutDecoratorNode = /** @class */ (function () {
    function CompiledTimeoutDecoratorNode(node, child) {
        this.node = node;
        this.child = child;
    }
    Object.defineProperty(CompiledTimeoutDecoratorNode.prototype, "type", {
        get: function () {
            return this.node.type;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(CompiledTimeoutDecoratorNode.prototype, "name", {
        get: function () {
            return this.node.name;
        },
        enumerable: false,
        configurable: true
    });
    CompiledTimeoutDecoratorNode.prototype.execute = function (ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, timeoutPromise, result, error_2;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = node_perf_hooks_1.performance.now();
                        ctx.nodeExecutions++;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        timeoutPromise = new Promise(function (_, reject) {
                            setTimeout(function () {
                                reject(new Error("Timeout after ".concat(_this.node.timeoutMs, "ms")));
                            }, _this.node.timeoutMs);
                        });
                        return [4 /*yield*/, Promise.race([
                                this.child.execute(ctx),
                                timeoutPromise,
                            ])];
                    case 2:
                        result = _a.sent();
                        return [2 /*return*/, result];
                    case 3:
                        error_2 = _a.sent();
                        return [2 /*return*/, {
                                status: 'failure',
                                error: (0, leaf_contracts_1.createExecError)(error_2),
                                metrics: {
                                    durationMs: node_perf_hooks_1.performance.now() - startTime,
                                    nodeExecutions: 1,
                                    leafExecutions: 0,
                                },
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return CompiledTimeoutDecoratorNode;
}());
/**
 * Compiled fail on true decorator node
 */
var CompiledFailOnTrueDecoratorNode = /** @class */ (function () {
    function CompiledFailOnTrueDecoratorNode(node, child, condition, evaluator) {
        this.node = node;
        this.child = child;
        this.condition = condition;
        this.evaluator = evaluator;
    }
    Object.defineProperty(CompiledFailOnTrueDecoratorNode.prototype, "type", {
        get: function () {
            return this.node.type;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(CompiledFailOnTrueDecoratorNode.prototype, "name", {
        get: function () {
            return this.node.name;
        },
        enumerable: false,
        configurable: true
    });
    CompiledFailOnTrueDecoratorNode.prototype.execute = function (ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, conditionTrue, result;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        startTime = node_perf_hooks_1.performance.now();
                        ctx.nodeExecutions++;
                        return [4 /*yield*/, this.evaluator.evaluate(this.condition, ctx.leafContext)];
                    case 1:
                        conditionTrue = _c.sent();
                        if (conditionTrue) {
                            return [2 /*return*/, {
                                    status: 'failure',
                                    error: {
                                        code: 'unknown',
                                        retryable: false,
                                        detail: 'FailOnTrue condition was true',
                                    },
                                    metrics: {
                                        durationMs: node_perf_hooks_1.performance.now() - startTime,
                                        nodeExecutions: 1,
                                        leafExecutions: 0,
                                    },
                                }];
                        }
                        return [4 /*yield*/, this.child.execute(ctx)];
                    case 2:
                        result = _c.sent();
                        return [2 /*return*/, __assign(__assign({}, result), { metrics: {
                                    durationMs: node_perf_hooks_1.performance.now() - startTime,
                                    nodeExecutions: (((_a = result.metrics) === null || _a === void 0 ? void 0 : _a.nodeExecutions) || 0) + 1,
                                    leafExecutions: ((_b = result.metrics) === null || _b === void 0 ? void 0 : _b.leafExecutions) || 0,
                                } })];
                }
            });
        });
    };
    return CompiledFailOnTrueDecoratorNode;
}());
// ============================================================================
// BT-DSL Parser and Compiler
// ============================================================================
/**
 * BT-DSL Parser with deterministic compilation
 */
var BTDSLParser = /** @class */ (function () {
    function BTDSLParser() {
        this.ajv = new ajv_1.default({ allErrors: true });
        this.validate = this.ajv.compile(bt_dsl_schema_1.BT_DSL_SCHEMA);
        this.evaluator = new SensorPredicateEvaluator();
    }
    /**
     * Parse and compile BT-DSL JSON into executable tree
     * Deterministic compilation for reproducible results (S2.2)
     */
    BTDSLParser.prototype.parse = function (btDslJson, leafFactory) {
        // Validate JSON schema
        if (!this.validate(btDslJson)) {
            return {
                valid: false,
                errors: this.ajv.errorsText(this.validate.errors).split(', '),
            };
        }
        // Validate BT-DSL structure
        var validation = (0, bt_dsl_schema_1.validateBTDSL)(btDslJson.root);
        if (!validation.valid) {
            return {
                valid: false,
                errors: validation.errors,
            };
        }
        // Check that all referenced leaves exist
        var leafNames = (0, bt_dsl_schema_1.getLeafNames)(btDslJson.root);
        var missingLeaves = leafNames.filter(function (name) { return !leafFactory.has(name); });
        if (missingLeaves.length > 0) {
            return {
                valid: false,
                errors: ["Missing leaves: ".concat(missingLeaves.join(', '))],
            };
        }
        // Compile the tree
        try {
            var compiled = this.compileNode(btDslJson.root, leafFactory);
            var treeHash = this.computeTreeHash(btDslJson.root);
            return {
                valid: true,
                compiled: compiled,
                treeHash: treeHash,
            };
        }
        catch (error) {
            return {
                valid: false,
                errors: [error instanceof Error ? error.message : 'Compilation failed'],
            };
        }
    };
    /**
     * Compile a BT node into executable form
     */
    BTDSLParser.prototype.compileNode = function (node, leafFactory) {
        var _this = this;
        if ((0, bt_dsl_schema_1.isLeafNode)(node)) {
            return new CompiledLeafNode(node, leafFactory);
        }
        else if ((0, bt_dsl_schema_1.isSequenceNode)(node)) {
            var children = node.children.map(function (child) {
                return _this.compileNode(child, leafFactory);
            });
            return new CompiledSequenceNode(node, children);
        }
        else if ((0, bt_dsl_schema_1.isSelectorNode)(node)) {
            var children = node.children.map(function (child) {
                return _this.compileNode(child, leafFactory);
            });
            return new CompiledSelectorNode(node, children);
        }
        else if ((0, bt_dsl_schema_1.isRepeatUntilNode)(node)) {
            var child = this.compileNode(node.child, leafFactory);
            return new CompiledRepeatUntilNode(node, child, node.condition, this.evaluator);
        }
        else if ((0, bt_dsl_schema_1.isTimeoutDecoratorNode)(node)) {
            var child = this.compileNode(node.child, leafFactory);
            return new CompiledTimeoutDecoratorNode(node, child);
        }
        else if ((0, bt_dsl_schema_1.isFailOnTrueDecoratorNode)(node)) {
            var child = this.compileNode(node.child, leafFactory);
            return new CompiledFailOnTrueDecoratorNode(node, child, node.condition, this.evaluator);
        }
        else {
            throw new Error("Unknown node type: ".concat(node.type));
        }
    };
    /**
     * Compute deterministic hash of BT tree for caching
     */
    BTDSLParser.prototype.computeTreeHash = function (node) {
        var json = JSON.stringify(node, function (key, value) {
            // Sort object keys for deterministic ordering
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
        // Simple hash function for deterministic results
        var hash = 0;
        for (var i = 0; i < json.length; i++) {
            var char = json.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    };
    /**
     * Execute a compiled BT tree
     */
    BTDSLParser.prototype.execute = function (compiled, leafFactory, leafContext, abortSignal) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, ctx, result, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = node_perf_hooks_1.performance.now();
                        ctx = {
                            leafFactory: leafFactory,
                            leafContext: leafContext,
                            startTime: startTime,
                            nodeExecutions: 0,
                            leafExecutions: 0,
                            abortSignal: abortSignal || new AbortController().signal,
                        };
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, compiled.execute(ctx)];
                    case 2:
                        result = _a.sent();
                        return [2 /*return*/, __assign(__assign({}, result), { metrics: {
                                    durationMs: node_perf_hooks_1.performance.now() - startTime,
                                    nodeExecutions: ctx.nodeExecutions,
                                    leafExecutions: ctx.leafExecutions,
                                } })];
                    case 3:
                        error_3 = _a.sent();
                        return [2 /*return*/, {
                                status: 'failure',
                                error: (0, leaf_contracts_1.createExecError)(error_3),
                                metrics: {
                                    durationMs: node_perf_hooks_1.performance.now() - startTime,
                                    nodeExecutions: ctx.nodeExecutions,
                                    leafExecutions: ctx.leafExecutions,
                                },
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return BTDSLParser;
}());
exports.BTDSLParser = BTDSLParser;

"use strict";
/**
 * Capability Specifications - Predefined Minecraft action capabilities
 *
 * Defines all available Minecraft actions as structured capabilities with
 * preconditions, effects, safety constraints, and execution metadata.
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
exports.CAPABILITY_VALIDATORS = exports.CAPABILITY_EXECUTORS = exports.ALL_CAPABILITIES = exports.SOCIAL_CAPABILITIES = exports.INVENTORY_CAPABILITIES = exports.BLOCK_CAPABILITIES = exports.MOVEMENT_CAPABILITIES = void 0;
var types_1 = require("./types");
// ===== BASE EXECUTORS =====
/**
 * Base executor for Minecraft capabilities
 */
var BaseMinecraftExecutor = /** @class */ (function () {
    function BaseMinecraftExecutor() {
    }
    BaseMinecraftExecutor.prototype.estimateCost = function (request, context) {
        // Default cost estimation - can be overridden
        return 10;
    };
    BaseMinecraftExecutor.prototype.canExecute = function (request, context) {
        // Basic health and safety checks
        return context.agentHealth > 0.1 && context.dangerLevel < 0.8;
    };
    return BaseMinecraftExecutor;
}());
/**
 * Base validator for Minecraft capabilities
 */
var BaseMinecraftValidator = /** @class */ (function () {
    function BaseMinecraftValidator() {
    }
    BaseMinecraftValidator.prototype.validateContext = function (context) {
        // Basic context validation
        return (context.agentHealth > 0 &&
            context.agentPosition.y > -64 &&
            context.agentPosition.y < 320);
    };
    return BaseMinecraftValidator;
}());
// ===== MOVEMENT CAPABILITIES =====
var MoveForwardExecutor = /** @class */ (function (_super) {
    __extends(MoveForwardExecutor, _super);
    function MoveForwardExecutor() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    MoveForwardExecutor.prototype.execute = function (request, context) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        // Simulate movement execution
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 100); })];
                    case 2:
                        // Simulate movement execution
                        _a.sent();
                        return [2 /*return*/, {
                                id: "exec_".concat(Date.now()),
                                requestId: request.id,
                                capabilityId: request.capabilityId,
                                success: true,
                                startTime: startTime,
                                endTime: Date.now(),
                                duration: Date.now() - startTime,
                                effects: [
                                    {
                                        type: 'entity',
                                        change: 'position_updated',
                                        location: 'agent',
                                        metadata: { direction: 'forward', distance: 1 },
                                    },
                                ],
                                actualCost: 5,
                                retryCount: 0,
                            }];
                    case 3:
                        error_1 = _a.sent();
                        return [2 /*return*/, {
                                id: "exec_".concat(Date.now()),
                                requestId: request.id,
                                capabilityId: request.capabilityId,
                                success: false,
                                startTime: startTime,
                                endTime: Date.now(),
                                duration: Date.now() - startTime,
                                effects: [],
                                error: error_1 instanceof Error ? error_1.message : 'Unknown error',
                                retryCount: 0,
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return MoveForwardExecutor;
}(BaseMinecraftExecutor));
var MoveForwardValidator = /** @class */ (function (_super) {
    __extends(MoveForwardValidator, _super);
    function MoveForwardValidator() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    MoveForwardValidator.prototype.validatePreconditions = function (request, context) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Check if path is clear and agent can move
                return [2 /*return*/, context.agentHealth > 0.1 && context.dangerLevel < 0.5];
            });
        });
    };
    MoveForwardValidator.prototype.predictEffects = function (request, context) {
        return [
            {
                type: 'entity',
                change: 'position_updated',
                location: 'agent',
                metadata: { direction: 'forward', distance: 1 },
            },
        ];
    };
    return MoveForwardValidator;
}(BaseMinecraftValidator));
// ===== BLOCK MANIPULATION CAPABILITIES =====
var PlaceBlockExecutor = /** @class */ (function (_super) {
    __extends(PlaceBlockExecutor, _super);
    function PlaceBlockExecutor() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    PlaceBlockExecutor.prototype.execute = function (request, context) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, blockType, error_2;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        startTime = Date.now();
                        blockType = request.parameters.blockType || 'torch';
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        // Simulate block placement
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 200); })];
                    case 2:
                        // Simulate block placement
                        _b.sent();
                        return [2 /*return*/, {
                                id: "exec_".concat(Date.now()),
                                requestId: request.id,
                                capabilityId: request.capabilityId,
                                success: true,
                                startTime: startTime,
                                endTime: Date.now(),
                                duration: Date.now() - startTime,
                                effects: [
                                    {
                                        type: 'world',
                                        change: 'block_placed',
                                        location: 'target',
                                        item: blockType,
                                        quantity: 1,
                                    },
                                    {
                                        type: 'inventory',
                                        change: 'item_consumed',
                                        item: blockType,
                                        quantity: 1,
                                    },
                                ],
                                actualCost: 12,
                                resourcesUsed: (_a = {}, _a[blockType] = 1, _a),
                                retryCount: 0,
                            }];
                    case 3:
                        error_2 = _b.sent();
                        return [2 /*return*/, {
                                id: "exec_".concat(Date.now()),
                                requestId: request.id,
                                capabilityId: request.capabilityId,
                                success: false,
                                startTime: startTime,
                                endTime: Date.now(),
                                duration: Date.now() - startTime,
                                effects: [],
                                error: error_2 instanceof Error ? error_2.message : 'Unknown error',
                                retryCount: 0,
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    PlaceBlockExecutor.prototype.estimateCost = function (request, context) {
        return 12; // Standard block placement cost
    };
    return PlaceBlockExecutor;
}(BaseMinecraftExecutor));
var PlaceBlockValidator = /** @class */ (function (_super) {
    __extends(PlaceBlockValidator, _super);
    function PlaceBlockValidator() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    PlaceBlockValidator.prototype.validatePreconditions = function (request, context) {
        return __awaiter(this, void 0, void 0, function () {
            var blockType, hasItem;
            return __generator(this, function (_a) {
                blockType = request.parameters.blockType || 'torch';
                hasItem = context.inventory.some(function (item) { return item.item === blockType && item.quantity > 0; });
                // Check if within reach (simplified)
                return [2 /*return*/, hasItem && context.agentHealth > 0.1];
            });
        });
    };
    PlaceBlockValidator.prototype.predictEffects = function (request, context) {
        var blockType = request.parameters.blockType || 'torch';
        var effects = [
            {
                type: 'world',
                change: 'block_placed',
                location: 'target',
                item: blockType,
                quantity: 1,
            },
            {
                type: 'inventory',
                change: 'item_consumed',
                item: blockType,
                quantity: 1,
            },
        ];
        // Add lighting effect for torches
        if (blockType === 'torch') {
            effects.push({
                type: 'lighting',
                change: 'light_level_increased',
                area: 'target.radius(8)',
                metadata: { lightLevel: 14 },
            });
        }
        return effects;
    };
    return PlaceBlockValidator;
}(BaseMinecraftValidator));
// ===== MINING CAPABILITIES =====
var MineBlockExecutor = /** @class */ (function (_super) {
    __extends(MineBlockExecutor, _super);
    function MineBlockExecutor() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    MineBlockExecutor.prototype.execute = function (request, context) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, blockType, tool, miningTime_1, drops, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        blockType = request.parameters.blockType || 'stone';
                        tool = request.parameters.tool || 'hand';
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        miningTime_1 = this.calculateMiningTime(blockType, tool);
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, miningTime_1); })];
                    case 2:
                        _a.sent();
                        drops = this.calculateDrops(blockType, tool);
                        return [2 /*return*/, {
                                id: "exec_".concat(Date.now()),
                                requestId: request.id,
                                capabilityId: request.capabilityId,
                                success: true,
                                startTime: startTime,
                                endTime: Date.now(),
                                duration: Date.now() - startTime,
                                effects: [
                                    {
                                        type: 'world',
                                        change: 'block_removed',
                                        location: 'target',
                                        item: blockType,
                                        quantity: 1,
                                    },
                                    {
                                        type: 'inventory',
                                        change: 'items_gained',
                                        metadata: { drops: drops },
                                    },
                                ],
                                actualCost: 25,
                                resourcesUsed: { durability: 1 },
                                retryCount: 0,
                            }];
                    case 3:
                        error_3 = _a.sent();
                        return [2 /*return*/, {
                                id: "exec_".concat(Date.now()),
                                requestId: request.id,
                                capabilityId: request.capabilityId,
                                success: false,
                                startTime: startTime,
                                endTime: Date.now(),
                                duration: Date.now() - startTime,
                                effects: [],
                                error: error_3 instanceof Error ? error_3.message : 'Unknown error',
                                retryCount: 0,
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    MineBlockExecutor.prototype.calculateMiningTime = function (blockType, tool) {
        // Simplified mining time calculation
        var baseTimes = {
            dirt: 100,
            stone: 800,
            iron_ore: 1200,
            diamond_ore: 2000,
        };
        var toolMultipliers = {
            hand: 1.0,
            wooden_pickaxe: 0.5,
            stone_pickaxe: 0.3,
            iron_pickaxe: 0.2,
            diamond_pickaxe: 0.15,
        };
        var baseTime = baseTimes[blockType] || 500;
        var multiplier = toolMultipliers[tool] || 1.0;
        return Math.floor(baseTime * multiplier);
    };
    MineBlockExecutor.prototype.calculateDrops = function (blockType, tool) {
        // Simplified drop calculation
        var drops = {
            stone: [{ item: 'cobblestone', quantity: 1 }],
            iron_ore: [{ item: 'raw_iron', quantity: 1 }],
            coal_ore: [{ item: 'coal', quantity: 1 }],
            dirt: [{ item: 'dirt', quantity: 1 }],
        };
        return drops[blockType] || [{ item: blockType, quantity: 1 }];
    };
    MineBlockExecutor.prototype.estimateCost = function (request, context) {
        var blockType = request.parameters.blockType || 'stone';
        var tool = request.parameters.tool || 'hand';
        return this.calculateMiningTime(blockType, tool) / 10; // Cost roughly proportional to time
    };
    return MineBlockExecutor;
}(BaseMinecraftExecutor));
var MineBlockValidator = /** @class */ (function (_super) {
    __extends(MineBlockValidator, _super);
    function MineBlockValidator() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    MineBlockValidator.prototype.validatePreconditions = function (request, context) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Check if agent has appropriate tool and is within reach
                return [2 /*return*/, context.agentHealth > 0.2 && context.dangerLevel < 0.6];
            });
        });
    };
    MineBlockValidator.prototype.predictEffects = function (request, context) {
        var blockType = request.parameters.blockType || 'stone';
        return [
            {
                type: 'world',
                change: 'block_removed',
                location: 'target',
                item: blockType,
                quantity: 1,
            },
            {
                type: 'inventory',
                change: 'items_gained',
                metadata: { estimated: true },
            },
        ];
    };
    return MineBlockValidator;
}(BaseMinecraftValidator));
// ===== CAPABILITY SPECIFICATIONS =====
exports.MOVEMENT_CAPABILITIES = [
    {
        id: 'move_forward',
        name: 'Move Forward',
        description: 'Move the agent one block forward',
        category: 'movement',
        preconditions: [
            {
                type: 'spatial',
                condition: 'path_clear',
                args: { direction: 'forward', distance: 1 },
                description: 'Path ahead must be clear',
            },
            {
                type: 'environmental',
                condition: 'stable_ground',
                args: {},
                description: 'Agent must be on stable ground',
            },
        ],
        effects: [
            {
                type: 'entity',
                change: 'position_updated',
                location: 'agent',
                metadata: { direction: 'forward', distance: 1 },
            },
        ],
        costHint: 5,
        durationMs: 100,
        energyCost: 1,
        safetyTags: ['reversible', 'no_grief'],
        constitutionalRules: ['avoid_dangerous_areas'],
        riskLevel: types_1.RiskLevel.MINIMAL,
        cooldownMs: 0,
        maxConcurrent: 1,
        requiresApproval: false,
        enabled: true,
    },
    {
        id: 'turn_left',
        name: 'Turn Left',
        description: 'Rotate the agent 90 degrees to the left',
        category: 'movement',
        preconditions: [],
        effects: [
            {
                type: 'entity',
                change: 'orientation_updated',
                location: 'agent',
                metadata: { rotation: -90 },
            },
        ],
        costHint: 2,
        durationMs: 50,
        energyCost: 0,
        safetyTags: ['reversible', 'no_grief'],
        constitutionalRules: [],
        riskLevel: types_1.RiskLevel.MINIMAL,
        cooldownMs: 0,
        maxConcurrent: 1,
        requiresApproval: false,
        enabled: true,
    },
    {
        id: 'jump',
        name: 'Jump',
        description: 'Make the agent jump',
        category: 'movement',
        preconditions: [
            {
                type: 'environmental',
                condition: 'on_ground',
                args: {},
                description: 'Agent must be on ground to jump',
            },
        ],
        effects: [
            {
                type: 'entity',
                change: 'position_updated',
                location: 'agent',
                metadata: { action: 'jump', height: 1.25 },
            },
        ],
        costHint: 8,
        durationMs: 200,
        energyCost: 2,
        safetyTags: ['reversible'],
        constitutionalRules: ['avoid_fall_damage'],
        riskLevel: types_1.RiskLevel.LOW,
        cooldownMs: 100,
        maxConcurrent: 1,
        requiresApproval: false,
        enabled: true,
    },
];
exports.BLOCK_CAPABILITIES = [
    {
        id: 'place_block',
        name: 'Place Block',
        description: 'Place a block at the specified coordinates',
        category: 'block_manipulation',
        preconditions: [
            {
                type: 'inventory',
                condition: 'has_item',
                args: { item: 'parameter.blockType', min: 1 },
                description: 'Must have block in inventory',
            },
            {
                type: 'spatial',
                condition: 'within_reach',
                args: { distance: 4 },
                description: 'Target must be within reach',
            },
            {
                type: 'spatial',
                condition: 'block_placeable',
                args: {},
                description: 'Target location must allow block placement',
            },
        ],
        effects: [
            {
                type: 'world',
                change: 'block_placed',
                location: 'target',
                item: 'parameter.blockType',
                quantity: 1,
            },
            {
                type: 'inventory',
                change: 'item_consumed',
                item: 'parameter.blockType',
                quantity: 1,
            },
        ],
        costHint: 12,
        durationMs: 200,
        energyCost: 1,
        safetyTags: ['reversible', 'constructive'],
        constitutionalRules: ['no_destructive_placement', 'respect_property'],
        riskLevel: types_1.RiskLevel.LOW,
        cooldownMs: 50,
        maxConcurrent: 1,
        requiresApproval: false,
        enabled: true,
    },
    {
        id: 'mine_block',
        name: 'Mine Block',
        description: 'Mine a block at the specified coordinates',
        category: 'block_manipulation',
        preconditions: [
            {
                type: 'spatial',
                condition: 'within_reach',
                args: { distance: 4 },
                description: 'Target must be within reach',
            },
            {
                type: 'inventory',
                condition: 'has_appropriate_tool',
                args: {},
                description: 'Must have appropriate mining tool',
            },
            {
                type: 'spatial',
                condition: 'block_minable',
                args: {},
                description: 'Target block must be minable',
            },
        ],
        effects: [
            {
                type: 'world',
                change: 'block_removed',
                location: 'target',
                item: 'parameter.blockType',
                quantity: 1,
            },
            {
                type: 'inventory',
                change: 'items_gained',
                metadata: { drops: 'calculated' },
            },
            { type: 'inventory', change: 'durability_decreased', quantity: 1 },
        ],
        costHint: 25,
        durationMs: 800,
        energyCost: 3,
        safetyTags: ['potentially_destructive', 'resource_gain'],
        constitutionalRules: ['no_grief_mining', 'respect_structures'],
        riskLevel: types_1.RiskLevel.MEDIUM,
        cooldownMs: 100,
        maxConcurrent: 1,
        requiresApproval: false,
        enabled: true,
    },
];
exports.INVENTORY_CAPABILITIES = [
    {
        id: 'pick_up_item',
        name: 'Pick Up Item',
        description: 'Pick up an item from the ground',
        category: 'inventory',
        preconditions: [
            {
                type: 'spatial',
                condition: 'item_nearby',
                args: { distance: 2 },
                description: 'Item must be within pickup range',
            },
            {
                type: 'inventory',
                condition: 'has_space',
                args: {},
                description: 'Must have inventory space',
            },
        ],
        effects: [
            {
                type: 'inventory',
                change: 'item_added',
                item: 'parameter.itemType',
                quantity: 1,
            },
            {
                type: 'world',
                change: 'item_removed',
                location: 'parameter.itemLocation',
            },
        ],
        costHint: 8,
        durationMs: 100,
        energyCost: 1,
        safetyTags: ['reversible', 'resource_gain'],
        constitutionalRules: ['respect_property'],
        riskLevel: types_1.RiskLevel.LOW,
        cooldownMs: 50,
        maxConcurrent: 1,
        requiresApproval: false,
        enabled: true,
    },
];
exports.SOCIAL_CAPABILITIES = [
    {
        id: 'send_chat',
        name: 'Send Chat Message',
        description: 'Send a message in the chat',
        category: 'social',
        preconditions: [
            {
                type: 'permission',
                condition: 'chat_allowed',
                args: {},
                description: 'Chat must be enabled',
            },
        ],
        effects: [
            {
                type: 'sound',
                change: 'message_sent',
                metadata: {
                    message: 'parameter.message',
                    recipient: 'parameter.recipient',
                },
            },
        ],
        costHint: 5,
        durationMs: 50,
        energyCost: 0,
        safetyTags: ['affects_others', 'reversible'],
        constitutionalRules: ['no_harmful_speech', 'respectful_communication'],
        riskLevel: types_1.RiskLevel.LOW,
        cooldownMs: 1000, // Prevent spam
        maxConcurrent: 1,
        dailyLimit: 1000,
        requiresApproval: false,
        enabled: true,
    },
];
// ===== CAPABILITY REGISTRY =====
exports.ALL_CAPABILITIES = __spreadArray(__spreadArray(__spreadArray(__spreadArray([], exports.MOVEMENT_CAPABILITIES, true), exports.BLOCK_CAPABILITIES, true), exports.INVENTORY_CAPABILITIES, true), exports.SOCIAL_CAPABILITIES, true);
// ===== EXECUTOR REGISTRY =====
exports.CAPABILITY_EXECUTORS = {
    move_forward: new MoveForwardExecutor(),
    place_block: new PlaceBlockExecutor(),
    mine_block: new MineBlockExecutor(),
};
exports.CAPABILITY_VALIDATORS = {
    move_forward: new MoveForwardValidator(),
    place_block: new PlaceBlockValidator(),
    mine_block: new MineBlockValidator(),
};

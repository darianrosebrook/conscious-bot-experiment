"use strict";
/**
 * Leaf Contract System - Core types for primitive Mineflayer operations
 *
 * Defines the strict contracts for leaves (primitive operations) that touch Mineflayer,
 * ensuring safety, validation, and consistent execution patterns.
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
exports.validateLeafSpec = validateLeafSpec;
exports.validateLeafImpl = validateLeafImpl;
exports.mapExceptionToErrorCode = mapExceptionToErrorCode;
exports.isRetryableError = isRetryableError;
exports.createExecError = createExecError;
exports.createLeafContext = createLeafContext;
exports.hasPermission = hasPermission;
exports.hasAnyPermission = hasAnyPermission;
exports.hasAllPermissions = hasAllPermissions;
exports.getPermissionIntersection = getPermissionIntersection;
exports.verifyPostconditions = verifyPostconditions;
var vec3_1 = require("vec3");
var node_perf_hooks_1 = require("node:perf_hooks");
// ============================================================================
// Helper Functions (No Recursion)
// ============================================================================
/**
 * Read inventory state without creating nested contexts
 */
function readInventory(bot) {
    return __awaiter(this, void 0, void 0, function () {
        var items;
        var _a;
        return __generator(this, function (_b) {
            items = bot.inventory.items().map(function (item) { return ({
                name: item.name,
                count: item.count,
                slot: item.slot, // true slot index
                metadata: { metadata: item.metadata },
            }); });
            return [2 /*return*/, {
                    items: items,
                    selectedSlot: Math.max(0, (_a = bot.quickBarSlot) !== null && _a !== void 0 ? _a : 0),
                    totalSlots: bot.inventory.slots.length,
                    freeSlots: bot.inventory.emptySlotCount(),
                }];
        });
    });
}
/**
 * Predicate to identify hostile entities
 */
function hostilePredicate(e) {
    // tune this list; Mineflayer entity types vary by version
    var hostileNames = new Set([
        'zombie',
        'skeleton',
        'creeper',
        'spider',
        'witch',
        'enderman',
        'husk',
        'drowned',
        'pillager',
    ]);
    return e && hostileNames.has(e.name || e.type);
}
/**
 * Calculate distance between two Vec3 positions
 */
function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
// ============================================================================
// Validation Functions
// ============================================================================
/**
 * Validate a leaf specification with enhanced checks
 */
function validateLeafSpec(spec) {
    if (!spec.name || typeof spec.name !== 'string') {
        throw new Error('Leaf spec must have a valid name');
    }
    if (!spec.version || typeof spec.version !== 'string') {
        throw new Error('Leaf spec must have a valid version');
    }
    if (!spec.inputSchema || typeof spec.inputSchema !== 'object') {
        throw new Error('Leaf spec must have a valid inputSchema');
    }
    if (spec.timeoutMs <= 0) {
        throw new Error('Leaf spec must have a positive timeoutMs');
    }
    if (spec.retries < 0) {
        throw new Error('Leaf spec must have non-negative retries');
    }
    if (!Array.isArray(spec.permissions) || spec.permissions.length === 0) {
        throw new Error('Leaf spec must have at least one permission');
    }
    // Validate permission values
    var validPermissions = [
        'movement',
        'dig',
        'place',
        'craft',
        'sense',
        'container.read',
        'container.write',
        'chat',
    ];
    for (var _i = 0, _a = spec.permissions; _i < _a.length; _i++) {
        var permission = _a[_i];
        if (!validPermissions.includes(permission)) {
            throw new Error("Invalid permission: ".concat(permission));
        }
    }
    // Validate rate limits and concurrency
    if (spec.rateLimitPerMin !== undefined && spec.rateLimitPerMin <= 0) {
        throw new Error('rateLimitPerMin must be positive');
    }
    if (spec.maxConcurrent !== undefined && spec.maxConcurrent <= 0) {
        throw new Error('maxConcurrent must be positive');
    }
}
/**
 * Validate leaf implementation
 */
function validateLeafImpl(impl) {
    if (!impl.spec) {
        throw new Error('Leaf implementation must have a spec');
    }
    if (typeof impl.run !== 'function') {
        throw new Error('Leaf implementation must have a run function');
    }
    validateLeafSpec(impl.spec);
}
// ============================================================================
// Error Mapping Functions
// ============================================================================
/**
 * Map Mineflayer exceptions to deterministic error codes
 */
function mapExceptionToErrorCode(error) {
    if (error instanceof Error) {
        var message = error.message.toLowerCase();
        // Pathfinding errors
        if (message.includes('no path') || message.includes('unreachable')) {
            return 'path.unreachable';
        }
        if (message.includes('stuck') || message.includes('blocked')) {
            return 'path.stuck';
        }
        if (message.includes('unloaded') || message.includes('chunk')) {
            return 'path.unloaded';
        }
        // Digging errors
        if (message.includes('block changed') ||
            message.includes('already broken')) {
            return 'dig.blockChanged';
        }
        if (message.includes('tool') || message.includes('pickaxe')) {
            return 'dig.toolInvalid';
        }
        if (message.includes('timeout') && message.includes('dig')) {
            return 'dig.timeout';
        }
        // Placement errors
        if (message.includes('invalid face') || message.includes('cannot place')) {
            return 'place.invalidFace';
        }
        if (message.includes('fall') || message.includes('void')) {
            return 'place.fallRisk';
        }
        if (message.includes('timeout') && message.includes('place')) {
            return 'place.timeout';
        }
        // Crafting errors
        if (message.includes('missing') || message.includes('not found')) {
            return 'craft.missingInput';
        }
        if (message.includes('ui') || message.includes('interface')) {
            return 'craft.uiTimeout';
        }
        if (message.includes('container') || message.includes('chest')) {
            return 'craft.containerBusy';
        }
        // Movement errors
        if (message.includes('timeout') && message.includes('move')) {
            return 'movement.timeout';
        }
        if (message.includes('collision') || message.includes('blocked')) {
            return 'movement.collision';
        }
        // Inventory errors
        if (message.includes('full') || message.includes('no space')) {
            return 'inventory.full';
        }
        if (message.includes('missing') || message.includes('not found')) {
            return 'inventory.missingItem';
        }
        // World errors
        if (message.includes('unloaded') || message.includes('chunk')) {
            return 'world.unloaded';
        }
        if (message.includes('invalid position') ||
            message.includes('out of bounds')) {
            return 'world.invalidPosition';
        }
        // Permission errors
        if (message.includes('permission') || message.includes('denied')) {
            return 'permission.denied';
        }
        // Abort errors
        if (message.includes('abort') || message.includes('cancel')) {
            return 'aborted';
        }
    }
    return 'unknown';
}
/**
 * Check if an error code is retryable
 */
function isRetryableError(code) {
    var retryableCodes = [
        'path.stuck',
        'dig.timeout',
        'place.timeout',
        'craft.uiTimeout',
        'movement.timeout',
        'sense.apiError',
        'permission.denied', // Rate limiting is retryable
    ];
    return retryableCodes.includes(code);
}
/**
 * Create an ExecError from an exception
 */
function createExecError(error) {
    var code = mapExceptionToErrorCode(error);
    return {
        code: code,
        detail: error instanceof Error ? error.message : String(error),
        retryable: isRetryableError(code),
    };
}
// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Create a basic leaf context with enhanced safety
 */
function createLeafContext(bot, abortSignal) {
    var _this = this;
    var signal = abortSignal !== null && abortSignal !== void 0 ? abortSignal : new AbortController().signal;
    return {
        bot: bot,
        abortSignal: signal,
        now: function () { return node_perf_hooks_1.performance.now(); },
        snapshot: function () { return __awaiter(_this, void 0, void 0, function () {
            var position, biomeName, biome, _a, lightLevel, weather, me, hostiles;
            var _b;
            var _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
            return __generator(this, function (_p) {
                switch (_p.label) {
                    case 0:
                        position = (_d = (_c = bot.entity) === null || _c === void 0 ? void 0 : _c.position) !== null && _d !== void 0 ? _d : new vec3_1.Vec3(0, 64, 0);
                        biomeName = 'unknown';
                        _p.label = 1;
                    case 1:
                        _p.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, ((_f = (_e = bot.world).getBiome) === null || _f === void 0 ? void 0 : _f.call(_e, position))];
                    case 2:
                        biome = _p.sent();
                        biomeName =
                            typeof biome === 'string' ? biome : ((_g = biome === null || biome === void 0 ? void 0 : biome.name) !== null && _g !== void 0 ? _g : 'unknown');
                        return [3 /*break*/, 4];
                    case 3:
                        _a = _p.sent();
                        return [3 /*break*/, 4];
                    case 4:
                        lightLevel = 15;
                        try {
                            lightLevel = (_k = (_j = (_h = bot.world).getLight) === null || _j === void 0 ? void 0 : _j.call(_h, position)) !== null && _k !== void 0 ? _k : 15;
                        }
                        catch (_q) {
                            /* noop */
                        }
                        weather = bot.isThundering && bot.isThundering()
                            ? 'thunder'
                            : bot.isRaining && bot.isRaining()
                                ? 'rain'
                                : 'clear';
                        me = position;
                        hostiles = Object.values((_l = bot.entities) !== null && _l !== void 0 ? _l : {})
                            .filter(hostilePredicate)
                            .map(function (e) {
                            var _a, _b;
                            return ({
                                id: e.id,
                                type: (_b = (_a = e.name) !== null && _a !== void 0 ? _a : e.type) !== null && _b !== void 0 ? _b : 'unknown',
                                position: e.position,
                                distance: dist(me, e.position),
                            });
                        })
                            .sort(function (a, b) { return a.distance - b.distance; })
                            .slice(0, 16);
                        _b = {
                            position: position,
                            biome: biomeName,
                            time: (_o = (_m = bot.time) === null || _m === void 0 ? void 0 : _m.timeOfDay) !== null && _o !== void 0 ? _o : 0,
                            lightLevel: lightLevel,
                            nearbyHostiles: hostiles,
                            weather: weather
                        };
                        return [4 /*yield*/, readInventory(bot)];
                    case 5: // cap
                    return [2 /*return*/, (_b.inventory = _p.sent(),
                            _b.toolDurability = {},
                            _b.waypoints = [],
                            _b)];
                }
            });
        }); },
        inventory: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/, readInventory(bot)];
        }); }); },
        emitMetric: function (name, value, tags) {
            // Replace with your telemetry bus; keep since this is critical in early bring-up
            // e.g., metrics.emit({ name, value, tags, ts: Date.now() })
            // console.log is fine for first iteration but gate behind NODE_ENV
            if (process.env.NODE_ENV !== 'production') {
                // eslint-disable-next-line no-console
                console.log("METRIC ".concat(name, "=").concat(value), tags);
            }
        },
        emitError: function (error) {
            // TODO: Implement error emission
            if (process.env.NODE_ENV !== 'production') {
                // eslint-disable-next-line no-console
                console.log("ERROR: ".concat(error.code, " - ").concat(error.detail), {
                    retryable: error.retryable,
                });
            }
        },
    };
}
/**
 * Check if a leaf has a specific permission
 */
function hasPermission(leaf, permission) {
    return leaf.spec.permissions.includes(permission);
}
/**
 * Check if a leaf has any of the specified permissions
 */
function hasAnyPermission(leaf, permissions) {
    return permissions.some(function (permission) { return hasPermission(leaf, permission); });
}
/**
 * Check if a leaf has all of the specified permissions
 */
function hasAllPermissions(leaf, permissions) {
    return permissions.every(function (permission) { return hasPermission(leaf, permission); });
}
/**
 * Get the intersection of permissions from multiple leaves (C1)
 */
function getPermissionIntersection(leaves) {
    if (leaves.length === 0)
        return [];
    var allPermissions = leaves.map(function (leaf) { return leaf.spec.permissions; });
    var intersection = allPermissions.reduce(function (acc, permissions) {
        return acc.filter(function (permission) { return permissions.includes(permission); });
    });
    return intersection;
}
/**
 * Postcondition verifier helper (thin but useful)
 */
function verifyPostconditions(postSchema, before, after, ajv) {
    return __awaiter(this, void 0, void 0, function () {
        var diff, countByName, b, a, names, _i, names_1, n, validate, ok;
        var _a, _b;
        return __generator(this, function (_c) {
            if (!postSchema)
                return [2 /*return*/, { ok: true }];
            diff = {};
            countByName = function (inv) {
                return inv.items.reduce(function (acc, it) { var _a; return ((acc[it.name] = ((_a = acc[it.name]) !== null && _a !== void 0 ? _a : 0) + it.count), acc); }, {});
            };
            b = countByName(before.inventory);
            a = countByName(after.inventory);
            names = new Set(__spreadArray(__spreadArray([], Object.keys(b), true), Object.keys(a), true));
            for (_i = 0, names_1 = names; _i < names_1.length; _i++) {
                n = names_1[_i];
                diff[n] = ((_a = a[n]) !== null && _a !== void 0 ? _a : 0) - ((_b = b[n]) !== null && _b !== void 0 ? _b : 0);
            }
            validate = ajv.compile(postSchema);
            ok = validate({ diff: diff, after: after.snapshot, before: before.snapshot });
            return [2 /*return*/, ok
                    ? { ok: true }
                    : { ok: false, detail: ajv.errorsText(validate.errors) }];
        });
    });
}

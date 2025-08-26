"use strict";
/**
 * Leaf Contract System - Core types for primitive Mineflayer operations
 *
 * Defines the strict contracts for leaves (primitive operations) that touch Mineflayer,
 * ensuring safety, validation, and consistent execution patterns.
 *
 * @author @darianrosebrook
 */
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
const vec3_1 = require("vec3");
const node_perf_hooks_1 = require("node:perf_hooks");
// ============================================================================
// Helper Functions (No Recursion)
// ============================================================================
/**
 * Read inventory state without creating nested contexts
 */
async function readInventory(bot) {
    const items = bot.inventory.items().map((item) => ({
        name: item.name,
        count: item.count,
        slot: item.slot, // true slot index
        metadata: { metadata: item.metadata },
    }));
    return {
        items,
        selectedSlot: Math.max(0, bot.quickBarSlot ?? 0),
        totalSlots: bot.inventory.slots.length,
        freeSlots: bot.inventory.emptySlotCount(),
    };
}
/**
 * Predicate to identify hostile entities
 */
function hostilePredicate(e) {
    // tune this list; Mineflayer entity types vary by version
    const hostileNames = new Set([
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
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
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
    const validPermissions = [
        'movement',
        'dig',
        'place',
        'craft',
        'sense',
        'container.read',
        'container.write',
        'chat',
    ];
    for (const permission of spec.permissions) {
        if (!validPermissions.includes(permission)) {
            throw new Error(`Invalid permission: ${permission}`);
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
        const message = error.message.toLowerCase();
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
    const retryableCodes = [
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
    const code = mapExceptionToErrorCode(error);
    return {
        code,
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
    const signal = abortSignal ?? new AbortController().signal;
    return {
        bot,
        abortSignal: signal,
        now: () => node_perf_hooks_1.performance.now(),
        snapshot: async () => {
            const position = bot.entity?.position ?? new vec3_1.Vec3(0, 64, 0);
            // biome: guard object→string
            let biomeName = 'unknown';
            try {
                const biome = await bot.world.getBiome?.(position);
                biomeName =
                    typeof biome === 'string' ? biome : (biome?.name ?? 'unknown');
            }
            catch {
                /* noop */
            }
            // light
            let lightLevel = 15;
            try {
                lightLevel = bot.world.getLight?.(position) ?? 15;
            }
            catch {
                /* noop */
            }
            // weather
            const weather = bot.isThundering && bot.isThundering()
                ? 'thunder'
                : bot.isRaining && bot.isRaining()
                    ? 'rain'
                    : 'clear';
            // hostiles (bounded radius)
            const me = position;
            const hostiles = Object.values(bot.entities ?? {})
                .filter(hostilePredicate)
                .map((e) => ({
                id: e.id,
                type: e.name ?? e.type ?? 'unknown',
                position: e.position,
                distance: dist(me, e.position),
            }))
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 16); // cap
            return {
                position,
                biome: biomeName,
                time: bot.time?.timeOfDay ?? 0,
                lightLevel,
                nearbyHostiles: hostiles,
                weather,
                inventory: await readInventory(bot),
                toolDurability: {}, // optional: fill from item NBT if needed
                waypoints: [], // filled by your waypoint subsystem
            };
        },
        inventory: async () => readInventory(bot),
        emitMetric: (name, value, tags) => {
            // Replace with your telemetry bus; keep since this is critical in early bring-up
            // e.g., metrics.emit({ name, value, tags, ts: Date.now() })
            // console.log is fine for first iteration but gate behind NODE_ENV
            if (process.env.NODE_ENV !== 'production') {
                // eslint-disable-next-line no-console
                console.log(`METRIC ${name}=${value}`, tags);
            }
        },
        emitError: (error) => {
            // TODO: Implement error emission
            if (process.env.NODE_ENV !== 'production') {
                // eslint-disable-next-line no-console
                console.log(`ERROR: ${error.code} - ${error.detail}`, {
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
    return permissions.some((permission) => hasPermission(leaf, permission));
}
/**
 * Check if a leaf has all of the specified permissions
 */
function hasAllPermissions(leaf, permissions) {
    return permissions.every((permission) => hasPermission(leaf, permission));
}
/**
 * Get the intersection of permissions from multiple leaves (C1)
 */
function getPermissionIntersection(leaves) {
    if (leaves.length === 0)
        return [];
    const allPermissions = leaves.map((leaf) => leaf.spec.permissions);
    const intersection = allPermissions.reduce((acc, permissions) => acc.filter((permission) => permissions.includes(permission)));
    return intersection;
}
/**
 * Postcondition verifier helper (thin but useful)
 */
async function verifyPostconditions(postSchema, before, after, ajv) {
    if (!postSchema)
        return { ok: true };
    // Example: compute inventory diff and inject into a context the schema checks
    const diff = {};
    const countByName = (inv) => inv.items.reduce((acc, it) => ((acc[it.name] = (acc[it.name] ?? 0) + it.count), acc), {});
    const b = countByName(before.inventory);
    const a = countByName(after.inventory);
    const names = new Set([...Object.keys(b), ...Object.keys(a)]);
    for (const n of names)
        diff[n] = (a[n] ?? 0) - (b[n] ?? 0);
    const validate = ajv.compile(postSchema);
    const ok = validate({ diff, after: after.snapshot, before: before.snapshot });
    return ok
        ? { ok: true }
        : { ok: false, detail: ajv.errorsText(validate.errors) };
}
//# sourceMappingURL=leaf-contracts.js.map
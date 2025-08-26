"use strict";
/**
 * Leaf Factory - Registry and execution for leaf implementations
 *
 * Provides centralized registration, validation, and execution of leaf implementations
 * with rate limiting, schema validation, and error handling.
 *
 * @author @darianrosebrook
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeafFactory = void 0;
const ajv_1 = __importDefault(require("ajv"));
const node_perf_hooks_1 = require("node:perf_hooks");
const leaf_contracts_1 = require("./leaf-contracts");
/**
 * Enhanced Leaf Factory with AJV compilation and rate limiting
 */
class LeafFactory {
    constructor() {
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
    register(leaf) {
        (0, leaf_contracts_1.validateLeafImpl)(leaf);
        const key = `${leaf.spec.name}@${leaf.spec.version}`;
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
                error: `schema_compilation_failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
        // Initialize rate limiter counter
        this.counters.set(key, 0);
        this.registry.set(key, leaf);
        return { ok: true, id: key };
    }
    /**
     * Get a leaf by name and optional version
     */
    get(name, version) {
        if (version)
            return this.registry.get(`${name}@${version}`);
        // return latest by naive semver sort (replace if you add a real semver lib)
        const keys = [...this.registry.keys()]
            .filter((k) => k.startsWith(`${name}@`))
            .sort();
        const last = keys[keys.length - 1];
        return last ? this.registry.get(last) : undefined;
    }
    /**
     * Execute a leaf with validation and rate limiting
     */
    async run(name, version, ctx, args, opts) {
        const key = `${name}@${version}`;
        const leaf = this.registry.get(key);
        if (!leaf) {
            return {
                status: 'failure',
                error: {
                    code: 'unknown',
                    retryable: false,
                    detail: 'leaf_not_found',
                },
            };
        }
        // Rate limit
        const nowMin = Math.floor(Date.now() / 60000);
        const counterKey = `${key}:${nowMin}`;
        const used = this.counters.get(counterKey) ?? 0;
        const limit = leaf.spec.rateLimitPerMin ?? 60;
        if (used >= limit) {
            return {
                status: 'failure',
                error: {
                    code: 'permission.denied',
                    retryable: true,
                    detail: 'rate_limited',
                },
            };
        }
        this.counters.set(counterKey, used + 1);
        // Validate args
        const validateIn = this.inputValidators.get(key);
        if (!validateIn(args)) {
            return {
                status: 'failure',
                error: {
                    code: 'unknown',
                    retryable: false,
                    detail: this.ajv.errorsText(validateIn.errors),
                },
            };
        }
        const t0 = node_perf_hooks_1.performance.now();
        // Capture initial state for postcondition verification
        const beforeState = leaf.spec.postconditions
            ? {
                inventory: await ctx.inventory(),
                snapshot: await ctx.snapshot(),
            }
            : null;
        try {
            const res = await leaf.run(ctx, args, opts);
            // Validate output if present
            if (res.status === 'success' && leaf.spec.outputSchema) {
                const validateOut = this.outputValidators.get(key);
                if (!validateOut(res.result)) {
                    return {
                        status: 'failure',
                        error: {
                            code: 'unknown',
                            retryable: false,
                            detail: this.ajv.errorsText(validateOut.errors),
                        },
                    };
                }
            }
            // Verify postconditions if present
            if (res.status === 'success' && leaf.spec.postconditions && beforeState) {
                const afterState = {
                    inventory: await ctx.inventory(),
                    snapshot: await ctx.snapshot(),
                };
                const postconditionResult = await (0, leaf_contracts_1.verifyPostconditions)(leaf.spec.postconditions, beforeState, afterState, this.ajv);
                if (!postconditionResult.ok) {
                    return {
                        status: 'failure',
                        error: {
                            code: 'unknown',
                            retryable: false,
                            detail: `Postcondition verification failed: ${postconditionResult.detail}`,
                        },
                    };
                }
            }
            // Ensure metrics are present
            res.metrics ?? (res.metrics = {
                durationMs: node_perf_hooks_1.performance.now() - t0,
                retries: 0,
                timeouts: 0,
            });
            res.metrics.durationMs = node_perf_hooks_1.performance.now() - t0;
            return res;
        }
        catch (e) {
            return {
                status: 'failure',
                error: (0, leaf_contracts_1.createExecError)(e),
            };
        }
    }
    /**
     * Validate arguments against a leaf's input schema
     */
    validateArgs(name, version, args) {
        const key = `${name}@${version}`;
        const validator = this.inputValidators.get(key);
        if (!validator)
            return false;
        return validator(args);
    }
    /**
     * Get all registered leaves
     */
    getAll() {
        return Array.from(this.registry.values());
    }
    /**
     * Get all leaf names (without versions)
     */
    getNames() {
        const names = new Set();
        for (const key of this.registry.keys()) {
            const atIndex = key.indexOf('@');
            if (atIndex > 0) {
                names.add(key.substring(0, atIndex));
            }
        }
        return Array.from(names);
    }
    /**
     * Check if a leaf exists
     */
    has(name, version) {
        return this.get(name, version) !== undefined;
    }
    /**
     * Remove a leaf from the registry
     */
    remove(name, version) {
        if (version) {
            // Remove specific version
            const key = `${name}@${version}`;
            const removed = this.registry.delete(key) ? 1 : 0;
            if (removed) {
                this.inputValidators.delete(key);
                this.outputValidators.delete(key);
            }
            return removed;
        }
        // Remove all versions
        let removed = 0;
        const keysToRemove = [];
        for (const key of this.registry.keys()) {
            if (key.startsWith(`${name}@`)) {
                keysToRemove.push(key);
            }
        }
        for (const key of keysToRemove) {
            if (this.registry.delete(key)) {
                this.inputValidators.delete(key);
                this.outputValidators.delete(key);
                removed++;
            }
        }
        return removed;
    }
    /**
     * Clear all registered leaves
     */
    clear() {
        this.registry.clear();
        this.inputValidators.clear();
        this.outputValidators.clear();
        this.counters.clear();
    }
    /**
     * Get the size of the registry
     */
    size() {
        return this.registry.size;
    }
    /**
     * Get rate limit usage for a leaf
     */
    getRateLimitUsage(name, version) {
        const key = `${name}@${version}`;
        const leaf = this.registry.get(key);
        if (!leaf)
            return { used: 0, limit: 0 };
        const nowMin = Math.floor(Date.now() / 60000);
        const counterKey = `${key}:${nowMin}`;
        const used = this.counters.get(counterKey) ?? 0;
        const limit = leaf.spec.rateLimitPerMin ?? 60;
        return { used, limit };
    }
}
exports.LeafFactory = LeafFactory;
//# sourceMappingURL=leaf-factory.js.map
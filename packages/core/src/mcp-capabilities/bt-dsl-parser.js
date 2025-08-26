"use strict";
/**
 * BT-DSL Parser and Compiler - Deterministic compilation for reproducible results
 *
 * Parses BT-DSL JSON into executable behavior trees with deterministic compilation
 * and named sensor predicate evaluation.
 *
 * @author @darianrosebrook
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BTDSLParser = exports.SensorPredicateEvaluator = void 0;
const ajv_1 = __importDefault(require("ajv"));
const node_perf_hooks_1 = require("node:perf_hooks");
const bt_dsl_schema_1 = require("./bt-dsl-schema");
const leaf_contracts_1 = require("./leaf-contracts");
// ============================================================================
// Sensor Predicate Evaluator
// ============================================================================
/**
 * Evaluates named sensor predicates
 */
class SensorPredicateEvaluator {
    /**
     * Evaluate a sensor predicate
     */
    async evaluate(predicate, ctx) {
        const { name, parameters = {} } = predicate;
        switch (name) {
            case 'distance_to':
                return this.evaluateDistanceTo(parameters, ctx);
            case 'hostiles_present':
                return this.evaluateHostilesPresent(parameters, ctx);
            case 'light_level_safe':
                return this.evaluateLightLevelSafe(parameters, ctx);
            case 'inventory_has_item':
                return this.evaluateInventoryHasItem(parameters, ctx);
            case 'position_reached':
                return this.evaluatePositionReached(parameters, ctx);
            case 'time_elapsed':
                return this.evaluateTimeElapsed(parameters, ctx);
            case 'health_low':
                return this.evaluateHealthLow(parameters, ctx);
            case 'hunger_low':
                return this.evaluateHungerLow(parameters, ctx);
            case 'weather_bad':
                return this.evaluateWeatherBad(parameters, ctx);
            case 'biome_safe':
                return this.evaluateBiomeSafe(parameters, ctx);
            default:
                throw new Error(`Unknown sensor predicate: ${name}`);
        }
    }
    async evaluateDistanceTo(params, ctx) {
        const { target, maxDistance = 5 } = params;
        if (!target || !target.x || !target.y || !target.z)
            return false;
        const botPos = ctx.bot.entity?.position;
        if (!botPos)
            return false;
        const distance = Math.sqrt(Math.pow(botPos.x - target.x, 2) +
            Math.pow(botPos.y - target.y, 2) +
            Math.pow(botPos.z - target.z, 2));
        return distance <= maxDistance;
    }
    async evaluateHostilesPresent(params, ctx) {
        const { maxDistance = 10 } = params;
        const snapshot = await ctx.snapshot();
        return snapshot.nearbyHostiles.some((hostile) => hostile.distance <= maxDistance);
    }
    async evaluateLightLevelSafe(params, ctx) {
        const { minLight = 8 } = params;
        const snapshot = await ctx.snapshot();
        return snapshot.lightLevel >= minLight;
    }
    async evaluateInventoryHasItem(params, ctx) {
        const { itemName, minCount = 1 } = params;
        if (!itemName)
            return false;
        const inventory = await ctx.inventory();
        const item = inventory.items.find((i) => i.name === itemName);
        return item ? item.count >= minCount : false;
    }
    async evaluatePositionReached(params, ctx) {
        const { target, tolerance = 1 } = params;
        if (!target)
            return false;
        const botPos = ctx.bot.entity?.position;
        if (!botPos)
            return false;
        const distance = Math.sqrt(Math.pow(botPos.x - target.x, 2) +
            Math.pow(botPos.y - target.y, 2) +
            Math.pow(botPos.z - target.z, 2));
        return distance <= tolerance;
    }
    async evaluateTimeElapsed(params, ctx) {
        const { startTime, minElapsedMs } = params;
        if (!startTime || !minElapsedMs)
            return false;
        const elapsed = ctx.now() - startTime;
        return elapsed >= minElapsedMs;
    }
    async evaluateHealthLow(params, ctx) {
        const { threshold = 10 } = params;
        const health = ctx.bot.health || 20;
        return health <= threshold;
    }
    async evaluateHungerLow(params, ctx) {
        const { threshold = 6 } = params;
        const food = ctx.bot.food || 20;
        return food <= threshold;
    }
    async evaluateWeatherBad(params, ctx) {
        const snapshot = await ctx.snapshot();
        return snapshot.weather === 'rain' || snapshot.weather === 'thunder';
    }
    async evaluateBiomeSafe(params, ctx) {
        const { safeBiomes = ['plains', 'forest', 'desert'] } = params;
        const snapshot = await ctx.snapshot();
        return safeBiomes.includes(snapshot.biome);
    }
}
exports.SensorPredicateEvaluator = SensorPredicateEvaluator;
// ============================================================================
// Compiled Node Implementations
// ============================================================================
/**
 * Compiled leaf node
 */
class CompiledLeafNode {
    constructor(node, leafFactory) {
        this.node = node;
        this.leafFactory = leafFactory;
    }
    get type() {
        return this.node.type;
    }
    get name() {
        return this.node.name;
    }
    async execute(ctx) {
        const startTime = node_perf_hooks_1.performance.now();
        ctx.leafExecutions++;
        try {
            const leaf = this.leafFactory.get(this.node.leafName, this.node.leafVersion);
            if (!leaf) {
                return {
                    status: 'failure',
                    error: {
                        code: 'unknown',
                        retryable: false,
                        detail: `Leaf not found: ${this.node.leafName}`,
                    },
                };
            }
            const result = await this.leafFactory.run(this.node.leafName, this.node.leafVersion || '1.0.0', ctx.leafContext, this.node.args || {}, { traceId: `bt-${this.node.name || this.node.leafName}` });
            return {
                status: result.status,
                result: result.result,
                error: result.error,
                metrics: {
                    durationMs: node_perf_hooks_1.performance.now() - startTime,
                    nodeExecutions: 1,
                    leafExecutions: 1,
                },
            };
        }
        catch (error) {
            return {
                status: 'failure',
                error: (0, leaf_contracts_1.createExecError)(error),
                metrics: {
                    durationMs: node_perf_hooks_1.performance.now() - startTime,
                    nodeExecutions: 1,
                    leafExecutions: 1,
                },
            };
        }
    }
}
/**
 * Compiled sequence node
 */
class CompiledSequenceNode {
    constructor(node, children) {
        this.node = node;
        this.children = children;
    }
    get type() {
        return this.node.type;
    }
    get name() {
        return this.node.name;
    }
    async execute(ctx) {
        const startTime = node_perf_hooks_1.performance.now();
        ctx.nodeExecutions++;
        let totalNodeExecutions = 0;
        let totalLeafExecutions = 0;
        for (const child of this.children) {
            const result = await child.execute(ctx);
            totalNodeExecutions += result.metrics?.nodeExecutions || 0;
            totalLeafExecutions += result.metrics?.leafExecutions || 0;
            if (result.status === 'failure') {
                return {
                    status: 'failure',
                    error: result.error,
                    metrics: {
                        durationMs: node_perf_hooks_1.performance.now() - startTime,
                        nodeExecutions: totalNodeExecutions,
                        leafExecutions: totalLeafExecutions,
                    },
                };
            }
        }
        return {
            status: 'success',
            metrics: {
                durationMs: node_perf_hooks_1.performance.now() - startTime,
                nodeExecutions: totalNodeExecutions,
                leafExecutions: totalLeafExecutions,
            },
        };
    }
}
/**
 * Compiled selector node
 */
class CompiledSelectorNode {
    constructor(node, children) {
        this.node = node;
        this.children = children;
    }
    get type() {
        return this.node.type;
    }
    get name() {
        return this.node.name;
    }
    async execute(ctx) {
        const startTime = node_perf_hooks_1.performance.now();
        ctx.nodeExecutions++;
        let totalNodeExecutions = 0;
        let totalLeafExecutions = 0;
        let lastError;
        for (const child of this.children) {
            const result = await child.execute(ctx);
            totalNodeExecutions += result.metrics?.nodeExecutions || 0;
            totalLeafExecutions += result.metrics?.leafExecutions || 0;
            if (result.status === 'success') {
                return {
                    status: 'success',
                    result: result.result,
                    metrics: {
                        durationMs: node_perf_hooks_1.performance.now() - startTime,
                        nodeExecutions: totalNodeExecutions,
                        leafExecutions: totalLeafExecutions,
                    },
                };
            }
            if (result.error) {
                lastError = result.error;
            }
        }
        return {
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
        };
    }
}
/**
 * Compiled repeat until node
 */
class CompiledRepeatUntilNode {
    constructor(node, child, condition, evaluator) {
        this.node = node;
        this.child = child;
        this.condition = condition;
        this.evaluator = evaluator;
    }
    get type() {
        return this.node.type;
    }
    get name() {
        return this.node.name;
    }
    async execute(ctx) {
        const startTime = node_perf_hooks_1.performance.now();
        ctx.nodeExecutions++;
        let totalNodeExecutions = 0;
        let totalLeafExecutions = 0;
        const maxIterations = this.node.maxIterations || 100;
        let iterations = 0;
        while (iterations < maxIterations) {
            // Check condition first
            const conditionMet = await this.evaluator.evaluate(this.condition, ctx.leafContext);
            if (conditionMet) {
                return {
                    status: 'success',
                    metrics: {
                        durationMs: node_perf_hooks_1.performance.now() - startTime,
                        nodeExecutions: totalNodeExecutions,
                        leafExecutions: totalLeafExecutions,
                    },
                };
            }
            // Execute child
            const result = await this.child.execute(ctx);
            totalNodeExecutions += result.metrics?.nodeExecutions || 0;
            totalLeafExecutions += result.metrics?.leafExecutions || 0;
            if (result.status === 'failure') {
                return {
                    status: 'failure',
                    error: result.error,
                    metrics: {
                        durationMs: node_perf_hooks_1.performance.now() - startTime,
                        nodeExecutions: totalNodeExecutions,
                        leafExecutions: totalLeafExecutions,
                    },
                };
            }
            iterations++;
        }
        return {
            status: 'failure',
            error: {
                code: 'unknown',
                retryable: false,
                detail: `Repeat.Until exceeded max iterations: ${maxIterations}`,
            },
            metrics: {
                durationMs: node_perf_hooks_1.performance.now() - startTime,
                nodeExecutions: totalNodeExecutions,
                leafExecutions: totalLeafExecutions,
            },
        };
    }
}
/**
 * Compiled timeout decorator node
 */
class CompiledTimeoutDecoratorNode {
    constructor(node, child) {
        this.node = node;
        this.child = child;
    }
    get type() {
        return this.node.type;
    }
    get name() {
        return this.node.name;
    }
    async execute(ctx) {
        const startTime = node_perf_hooks_1.performance.now();
        ctx.nodeExecutions++;
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Timeout after ${this.node.timeoutMs}ms`));
                }, this.node.timeoutMs);
            });
            const result = await Promise.race([
                this.child.execute(ctx),
                timeoutPromise,
            ]);
            return result;
        }
        catch (error) {
            return {
                status: 'failure',
                error: (0, leaf_contracts_1.createExecError)(error),
                metrics: {
                    durationMs: node_perf_hooks_1.performance.now() - startTime,
                    nodeExecutions: 1,
                    leafExecutions: 0,
                },
            };
        }
    }
}
/**
 * Compiled fail on true decorator node
 */
class CompiledFailOnTrueDecoratorNode {
    constructor(node, child, condition, evaluator) {
        this.node = node;
        this.child = child;
        this.condition = condition;
        this.evaluator = evaluator;
    }
    get type() {
        return this.node.type;
    }
    get name() {
        return this.node.name;
    }
    async execute(ctx) {
        const startTime = node_perf_hooks_1.performance.now();
        ctx.nodeExecutions++;
        // Check condition first
        const conditionTrue = await this.evaluator.evaluate(this.condition, ctx.leafContext);
        if (conditionTrue) {
            return {
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
            };
        }
        // Execute child
        const result = await this.child.execute(ctx);
        return {
            ...result,
            metrics: {
                durationMs: node_perf_hooks_1.performance.now() - startTime,
                nodeExecutions: (result.metrics?.nodeExecutions || 0) + 1,
                leafExecutions: result.metrics?.leafExecutions || 0,
            },
        };
    }
}
// ============================================================================
// BT-DSL Parser and Compiler
// ============================================================================
/**
 * BT-DSL Parser with deterministic compilation
 */
class BTDSLParser {
    constructor() {
        this.ajv = new ajv_1.default({ allErrors: true });
        this.validate = this.ajv.compile(bt_dsl_schema_1.BT_DSL_SCHEMA);
        this.evaluator = new SensorPredicateEvaluator();
    }
    /**
     * Parse and compile BT-DSL JSON into executable tree
     * Deterministic compilation for reproducible results (S2.2)
     */
    parse(btDslJson, leafFactory) {
        // Validate JSON schema
        if (!this.validate(btDslJson)) {
            return {
                valid: false,
                errors: this.ajv.errorsText(this.validate.errors).split(', '),
            };
        }
        // Validate BT-DSL structure
        const validation = (0, bt_dsl_schema_1.validateBTDSL)(btDslJson.root);
        if (!validation.valid) {
            return {
                valid: false,
                errors: validation.errors,
            };
        }
        // Check that all referenced leaves exist
        const leafNames = (0, bt_dsl_schema_1.getLeafNames)(btDslJson.root);
        const missingLeaves = leafNames.filter((name) => !leafFactory.has(name));
        if (missingLeaves.length > 0) {
            return {
                valid: false,
                errors: [`Missing leaves: ${missingLeaves.join(', ')}`],
            };
        }
        // Compile the tree
        try {
            const compiled = this.compileNode(btDslJson.root, leafFactory);
            const treeHash = this.computeTreeHash(btDslJson.root);
            return {
                valid: true,
                compiled,
                treeHash,
            };
        }
        catch (error) {
            return {
                valid: false,
                errors: [error instanceof Error ? error.message : 'Compilation failed'],
            };
        }
    }
    /**
     * Compile a BT node into executable form
     */
    compileNode(node, leafFactory) {
        if ((0, bt_dsl_schema_1.isLeafNode)(node)) {
            return new CompiledLeafNode(node, leafFactory);
        }
        else if ((0, bt_dsl_schema_1.isSequenceNode)(node)) {
            const children = node.children.map((child) => this.compileNode(child, leafFactory));
            return new CompiledSequenceNode(node, children);
        }
        else if ((0, bt_dsl_schema_1.isSelectorNode)(node)) {
            const children = node.children.map((child) => this.compileNode(child, leafFactory));
            return new CompiledSelectorNode(node, children);
        }
        else if ((0, bt_dsl_schema_1.isRepeatUntilNode)(node)) {
            const child = this.compileNode(node.child, leafFactory);
            return new CompiledRepeatUntilNode(node, child, node.condition, this.evaluator);
        }
        else if ((0, bt_dsl_schema_1.isTimeoutDecoratorNode)(node)) {
            const child = this.compileNode(node.child, leafFactory);
            return new CompiledTimeoutDecoratorNode(node, child);
        }
        else if ((0, bt_dsl_schema_1.isFailOnTrueDecoratorNode)(node)) {
            const child = this.compileNode(node.child, leafFactory);
            return new CompiledFailOnTrueDecoratorNode(node, child, node.condition, this.evaluator);
        }
        else {
            throw new Error(`Unknown node type: ${node.type}`);
        }
    }
    /**
     * Compute deterministic hash of BT tree for caching
     */
    computeTreeHash(node) {
        const json = JSON.stringify(node, (key, value) => {
            // Sort object keys for deterministic ordering
            if (typeof value === 'object' &&
                value !== null &&
                !Array.isArray(value)) {
                return Object.keys(value)
                    .sort()
                    .reduce((obj, key) => {
                    obj[key] = value[key];
                    return obj;
                }, {});
            }
            return value;
        });
        // Simple hash function for deterministic results
        let hash = 0;
        for (let i = 0; i < json.length; i++) {
            const char = json.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }
    /**
     * Execute a compiled BT tree
     */
    async execute(compiled, leafFactory, leafContext, abortSignal) {
        const startTime = node_perf_hooks_1.performance.now();
        const ctx = {
            leafFactory,
            leafContext,
            startTime,
            nodeExecutions: 0,
            leafExecutions: 0,
            abortSignal: abortSignal || new AbortController().signal,
        };
        try {
            const result = await compiled.execute(ctx);
            return {
                ...result,
                metrics: {
                    durationMs: node_perf_hooks_1.performance.now() - startTime,
                    nodeExecutions: ctx.nodeExecutions,
                    leafExecutions: ctx.leafExecutions,
                },
            };
        }
        catch (error) {
            return {
                status: 'failure',
                error: (0, leaf_contracts_1.createExecError)(error),
                metrics: {
                    durationMs: node_perf_hooks_1.performance.now() - startTime,
                    nodeExecutions: ctx.nodeExecutions,
                    leafExecutions: ctx.leafExecutions,
                },
            };
        }
    }
}
exports.BTDSLParser = BTDSLParser;
//# sourceMappingURL=bt-dsl-parser.js.map
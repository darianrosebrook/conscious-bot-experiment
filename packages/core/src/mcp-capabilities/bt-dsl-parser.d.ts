/**
 * BT-DSL Parser and Compiler - Deterministic compilation for reproducible results
 *
 * Parses BT-DSL JSON into executable behavior trees with deterministic compilation
 * and named sensor predicate evaluation.
 *
 * @author @darianrosebrook
 */
import { SensorPredicate } from './bt-dsl-schema';
import { LeafContext, ExecError } from './leaf-contracts';
import { LeafFactory } from './leaf-factory';
/**
 * Execution status for BT nodes
 */
export type BTStatus = 'success' | 'failure' | 'running';
/**
 * Result from BT node execution
 */
export interface BTResult {
    status: BTStatus;
    result?: any;
    error?: ExecError;
    metrics?: {
        durationMs: number;
        nodeExecutions: number;
        leafExecutions: number;
    };
}
/**
 * Compiled BT node ready for execution
 */
export interface CompiledBTNode {
    type: string;
    name?: string;
    execute(ctx: BTExecutionContext): Promise<BTResult>;
}
/**
 * Execution context for BT nodes
 */
export interface BTExecutionContext {
    leafFactory: LeafFactory;
    leafContext: LeafContext;
    startTime: number;
    nodeExecutions: number;
    leafExecutions: number;
    abortSignal: AbortSignal;
}
/**
 * Evaluates named sensor predicates
 */
export declare class SensorPredicateEvaluator {
    /**
     * Evaluate a sensor predicate
     */
    evaluate(predicate: SensorPredicate, ctx: LeafContext): Promise<boolean>;
    private evaluateDistanceTo;
    private evaluateHostilesPresent;
    private evaluateLightLevelSafe;
    private evaluateInventoryHasItem;
    private evaluatePositionReached;
    private evaluateTimeElapsed;
    private evaluateHealthLow;
    private evaluateHungerLow;
    private evaluateWeatherBad;
    private evaluateBiomeSafe;
}
/**
 * BT-DSL Parser with deterministic compilation
 */
export declare class BTDSLParser {
    private ajv;
    private validate;
    private evaluator;
    constructor();
    /**
     * Parse and compile BT-DSL JSON into executable tree
     * Deterministic compilation for reproducible results (S2.2)
     */
    parse(btDslJson: any, leafFactory: LeafFactory): {
        valid: boolean;
        errors?: string[];
        compiled?: CompiledBTNode;
        treeHash?: string;
    };
    /**
     * Compile a BT node into executable form
     */
    private compileNode;
    /**
     * Compute deterministic hash of BT tree for caching
     */
    private computeTreeHash;
    /**
     * Execute a compiled BT tree
     */
    execute(compiled: CompiledBTNode, leafFactory: LeafFactory, leafContext: LeafContext, abortSignal?: AbortSignal): Promise<BTResult>;
}
//# sourceMappingURL=bt-dsl-parser.d.ts.map
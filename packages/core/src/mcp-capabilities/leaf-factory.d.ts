/**
 * Leaf Factory - Registry and execution for leaf implementations
 *
 * Provides centralized registration, validation, and execution of leaf implementations
 * with rate limiting, schema validation, and error handling.
 *
 * @author @darianrosebrook
 */
import { LeafImpl, LeafContext, LeafResult, LeafRunOptions, RegistrationResult } from './leaf-contracts';
/**
 * Enhanced Leaf Factory with AJV compilation and rate limiting
 */
export declare class LeafFactory {
    private ajv;
    private inputValidators;
    private outputValidators;
    private registry;
    private counters;
    constructor();
    /**
     * Register a leaf implementation with schema compilation
     */
    register(leaf: LeafImpl): RegistrationResult;
    /**
     * Get a leaf by name and optional version
     */
    get(name: string, version?: string): LeafImpl | undefined;
    /**
     * Execute a leaf with validation and rate limiting
     */
    run(name: string, version: string, ctx: LeafContext, args: unknown, opts?: LeafRunOptions): Promise<LeafResult>;
    /**
     * Validate arguments against a leaf's input schema
     */
    validateArgs(name: string, version: string, args: unknown): boolean;
    /**
     * Get all registered leaves
     */
    getAll(): LeafImpl[];
    /**
     * Get all leaf names (without versions)
     */
    getNames(): string[];
    /**
     * Check if a leaf exists
     */
    has(name: string, version?: string): boolean;
    /**
     * Remove a leaf from the registry
     */
    remove(name: string, version?: string): number;
    /**
     * Clear all registered leaves
     */
    clear(): void;
    /**
     * Get the size of the registry
     */
    size(): number;
    /**
     * Get rate limit usage for a leaf
     */
    getRateLimitUsage(name: string, version: string): {
        used: number;
        limit: number;
    };
}
export type { LeafImpl, RegistrationResult } from './leaf-contracts';
//# sourceMappingURL=leaf-factory.d.ts.map
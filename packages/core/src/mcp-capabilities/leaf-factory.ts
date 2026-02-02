/**
 * Leaf Factory - Registry and execution for leaf implementations
 *
 * Provides centralized registration, validation, and execution of leaf implementations
 * with rate limiting, schema validation, and error handling.
 *
 * @author @darianrosebrook
 */

import Ajv, { ValidateFunction } from 'ajv';
import { performance } from 'node:perf_hooks';
import {
  LeafImpl,
  LeafSpec,
  LeafContext,
  LeafResult,
  LeafRunOptions,
  RegistrationResult,
  validateLeafImpl,
  createExecError,
  ExecErrorCode,
  verifyPostconditions,
} from './leaf-contracts.js';

/**
 * Enhanced Leaf Factory with AJV compilation and rate limiting
 */
export class LeafFactory {
  private ajv: Ajv;
  private inputValidators: Map<string, ValidateFunction>;
  private outputValidators: Map<string, ValidateFunction>;
  private registry: Map<string, LeafImpl>; // key: name@version
  private counters: Map<string, number>; // simple rate limiter

  constructor() {
    this.ajv = new Ajv({
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
  register(leaf: LeafImpl): RegistrationResult {
    validateLeafImpl(leaf);

    const key = `${leaf.spec.name}@${leaf.spec.version}`;
    if (this.registry.has(key)) {
      return { ok: false, error: 'version_exists' };
    }

    // Compile schemas once
    try {
      this.inputValidators.set(key, this.ajv.compile(leaf.spec.inputSchema));
      if (leaf.spec.outputSchema) {
        this.outputValidators.set(
          key,
          this.ajv.compile(leaf.spec.outputSchema)
        );
      }
    } catch (error) {
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
  get(name: string, version?: string): LeafImpl | undefined {
    if (version) {
      const key = `${name}@${version}`;
      return this.registry.get(key);
    }

    // return latest by naive semver sort (replace if you add a real semver lib)
    const keys = Array.from(this.registry.keys())
      .filter((k) => k.startsWith(`${name}@`))
      .sort();
    const last = keys[keys.length - 1];
    return last ? this.registry.get(last) : undefined;
  }

  /**
   * Check if a leaf is registered AND implemented (not a placeholder stub).
   * Use this instead of checking spec.placeholder directly.
   */
  isRoutable(name: string): boolean {
    const leaf = this.get(name);
    if (!leaf) return false;
    return (leaf as any)?.spec?.placeholder !== true;
  }

  /**
   * List all registered leaves
   */
  listLeaves(): Array<{ name: string; version: string; spec: LeafSpec }> {
    console.log('DEBUG: listLeaves() called');
    console.log('DEBUG: registry size:', this.registry.size);
    console.log('DEBUG: registry keys:', Array.from(this.registry.keys()));

    // WORKAROUND: Use the working manual implementation
    const leaves: Array<{ name: string; version: string; spec: LeafSpec }> = [];

    // Direct access to registry - this works
    const registry = this.registry;
    for (const [key, leaf] of registry.entries()) {
      console.log('DEBUG: Processing key:', key);
      const atIndex = key.indexOf('@');
      if (atIndex >= 0) {
        const name = key.substring(0, atIndex);
        const version = key.substring(atIndex + 1);
        console.log('DEBUG: Adding leaf:', name, version);
        leaves.push({
          name,
          version,
          spec: leaf.spec,
        });
      }
    }

    console.log('DEBUG: Final leaves array:', leaves);
    return leaves;
  }

  /**
   * Execute a leaf with validation and rate limiting
   */
  async run(
    name: string,
    version: string,
    ctx: LeafContext,
    args: unknown,
    opts?: LeafRunOptions
  ): Promise<LeafResult> {
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
    const validateIn = this.inputValidators.get(key)!;
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

    const t0 = performance.now();

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
        const validateOut = this.outputValidators.get(key)!;
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

        const postconditionResult = await verifyPostconditions(
          leaf.spec.postconditions,
          beforeState,
          afterState,
          this.ajv
        );

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
      res.metrics ??= {
        durationMs: performance.now() - t0,
        retries: 0,
        timeouts: 0,
      };
      res.metrics.durationMs = performance.now() - t0;
      return res;
    } catch (e: any) {
      return {
        status: 'failure',
        error: createExecError(e),
      };
    }
  }

  /**
   * Validate arguments against a leaf's input schema
   */
  validateArgs(name: string, version: string, args: unknown): boolean {
    const key = `${name}@${version}`;
    const validator = this.inputValidators.get(key);
    if (!validator) return false;
    return validator(args) as boolean;
  }

  /**
   * Get all registered leaves
   */
  getAll(): LeafImpl[] {
    return Array.from(this.registry.values());
  }

  /**
   * Get all leaf names (without versions)
   */
  getNames(): string[] {
    const names = new Set<string>();

    for (const key of this.registry.keys()) {
      const atIndex = key.indexOf('@');
      if (atIndex >= 0) {
        names.add(key.substring(0, atIndex));
      }
    }

    return Array.from(names);
  }

  /**
   * Check if a leaf exists
   */
  has(name: string, version?: string): boolean {
    return this.get(name, version) !== undefined;
  }

  /**
   * Remove a leaf from the registry
   */
  remove(name: string, version?: string): number {
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
    const keysToRemove: string[] = [];

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
  clear(): void {
    this.registry.clear();
    this.inputValidators.clear();
    this.outputValidators.clear();
    this.counters.clear();
  }

  /**
   * Get the size of the registry
   */
  size(): number {
    return this.registry.size;
  }

  /**
   * Get rate limit usage for a leaf
   */
  getRateLimitUsage(
    name: string,
    version: string
  ): { used: number; limit: number } {
    const key = `${name}@${version}`;
    const leaf = this.registry.get(key);
    if (!leaf) return { used: 0, limit: 0 };

    const nowMin = Math.floor(Date.now() / 60000);
    const counterKey = `${key}:${nowMin}`;
    const used = this.counters.get(counterKey) ?? 0;
    const limit = leaf.spec.rateLimitPerMin ?? 60;

    return { used, limit };
  }
}

// Re-export types for convenience
export type { LeafImpl, RegistrationResult } from './leaf-contracts.js';

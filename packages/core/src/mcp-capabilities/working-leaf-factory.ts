/**
 * Working LeafFactory Implementation
 * Implements high-priority fixes (semver latest, consistent rate limiting, validator guards).
 */

import Ajv, { type ValidateFunction } from 'ajv';
import { rcompare, valid, coerce } from 'semver';
import { performance } from 'node:perf_hooks';
import {
  LeafImpl,
  LeafSpec,
  RegistrationResult,
  LeafContext,
  LeafResult,
  LeafRunOptions,
  validateLeafImpl,
  createExecError,
  ExecErrorCode,
  verifyPostconditions,
} from './leaf-contracts';

// Node ≥18 has structuredClone; Cursor/TS may not have ambient types depending on tsconfig.
const safeClone = <T>(v: T): T => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).structuredClone
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (structuredClone as any)(v)
    : JSON.parse(JSON.stringify(v));
};

/**
 * Working LeafFactory implementation with all fixes applied
 */
export class WorkingLeafFactory {
  private ajv: Ajv;
  private inputValidators: Map<string, ValidateFunction>;
  private outputValidators: Map<string, ValidateFunction>;
  private registry = new Map<string, LeafImpl>();
  private counters = new Map<string, number>();

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      useDefaults: true,
      coerceTypes: true,
    });
    this.inputValidators = new Map();
    this.outputValidators = new Map();
  }

  /**
   * Register a leaf
   */
  register(leaf: LeafImpl): RegistrationResult {
    validateLeafImpl(leaf);

    // Fix 1: Disallow @ in names to prevent key delimiter collisions
    if (leaf.spec.name.includes('@')) {
      return { ok: false, error: 'invalid_name_char:@' };
    }

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

    // Fix 3: Remove unused counter initialization
    // this.counters.set(key, 0); // <-- removed this line

    this.registry.set(key, leaf);
    return { ok: true, id: key };
  }

  /**
   * Get the number of registered leaves
   */
  size(): number {
    return this.registry.size;
  }

  /**
   * Check if a leaf exists
   */
  has(name: string, version?: string): boolean {
    return this.get(name, version) !== undefined;
  }

  /**
   * Get a leaf by name and optional version
   */
  get(name: string, version?: string): LeafImpl | undefined {
    if (version) {
      const key = `${name}@${version}`;
      return this.registry.get(key);
    }

    // Fix 2: Use proper semver sorting instead of lexicographic
    const versions = Array.from(this.registry.keys())
      .filter((k) => k.startsWith(`${name}@`))
      .map((k) => k.slice(name.length + 1))
      .filter((v) => valid(v) || valid(coerce(v) || ''));

    if (versions.length === 0) return undefined;

    // Prefer exact valid semver; fall back to coerced
    const latest = versions
      .map((v) => (valid(v) ? v : (coerce(v)?.version ?? v)))
      .sort(rcompare)[0];
    return this.registry.get(`${name}@${latest}`);
  }

  /**
   * List all registered leaves
   */
  listLeaves(): Array<{ name: string; version: string; spec: LeafSpec }> {
    const leaves: Array<{ name: string; version: string; spec: LeafSpec }> = [];

    for (const [key, leaf] of this.registry.entries()) {
      const atIndex = key.indexOf('@');
      if (atIndex >= 0) {
        const name = key.substring(0, atIndex);
        const version = key.substring(atIndex + 1);
        leaves.push({
          name,
          version,
          spec: leaf.spec,
        });
      }
    }

    return leaves;
  }

  /**
   * Helper for rate limiting - generate minute-based key
   */
  private minuteKey(name: string, version: string): string {
    const nowMin = Math.floor(Date.now() / 60000);
    return `${name}@${version}:${nowMin}`;
  }

  /**
   * Optional small GC to keep counters map bounded
   */
  private gcCounters(name: string, version: string, keep = 5) {
    const prefix = `${name}@${version}:`;
    const entries: Array<[string, number]> = [];

    for (const [k, v] of this.counters.entries()) {
      if (k.startsWith(prefix)) entries.push([k, v]);
    }

    // Sort by minute asc, drop older ones
    entries.sort(
      (a, b) => Number(a[0].split(':').pop()!) - Number(b[0].split(':').pop()!)
    );
    while (entries.length > keep) {
      const [oldKey] = entries.shift()!;
      this.counters.delete(oldKey);
    }
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

    // Fix 3: Use consistent rate limiting with pruning
    const counterKey = this.minuteKey(name, version);
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
    this.gcCounters(name, version);

    // Fix 4: Guard missing validators
    const validateIn = this.inputValidators.get(key);
    if (!validateIn) {
      return {
        status: 'failure',
        error: {
          code: 'unknown',
          retryable: false,
          detail: 'input_validator_missing',
        },
      };
    }

    // Fix 6: Optional: avoid mutating caller args
    const safeArgs =
      args && typeof args === 'object' ? safeClone(args as any) : args;

    if (!validateIn(safeArgs)) {
      return {
        status: 'failure',
        error: {
          code: 'invalid_input',
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
      const res = await leaf.run(ctx, safeArgs, opts);

      // Validate output if present
      if (res.status === 'success' && leaf.spec.outputSchema) {
        const validateOut = this.outputValidators.get(key);
        if (!validateOut) {
          return {
            status: 'failure',
            error: {
              code: 'unknown',
              retryable: false,
              detail: 'output_validator_missing',
            },
          };
        }

        if (!validateOut(res.result)) {
          return {
            status: 'failure',
            error: {
              code: 'invalid_output',
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
              code: 'postcondition_failed',
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
   * Clear all registered leaves
   */
  clear(): void {
    this.registry.clear();
    this.inputValidators.clear();
    this.outputValidators.clear();
    this.counters.clear();
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
   * Get rate limit usage for a leaf
   */
  getRateLimitUsage(
    name: string,
    version: string
  ): { used: number; limit: number } {
    const key = `${name}@${version}`;
    const leaf = this.registry.get(key);
    if (!leaf) return { used: 0, limit: 0 };

    const counterKey = this.minuteKey(name, version);
    const used = this.counters.get(counterKey) ?? 0;
    const limit = leaf.spec.rateLimitPerMin ?? 60;

    return { used, limit };
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
}

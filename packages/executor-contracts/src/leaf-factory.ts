/**
 * Simple Leaf Factory for MCP Integration
 *
 * A minimal leaf factory that provides the interface needed by mcp-server
 * without creating circular dependencies with the core package.
 *
 * @author @darianrosebrook
 */

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
} from './leaf-interfaces';

/**
 * Simple leaf factory that can register and execute leaf implementations
 */
export class LeafFactory {
  private leaves: Map<string, LeafImpl> = new Map();
  private specs: Map<string, LeafSpec> = new Map();

  /**
   * Register a leaf implementation
   */
  register(spec: LeafSpec): RegistrationResult {
    try {
      if (!spec?.name || !spec.version) {
        return {
          ok: false,
          error: 'Invalid leaf spec: name and version are required',
        };
      }

      if (!spec.implementation) {
        return {
          ok: false,
          error: 'Invalid leaf spec: implementation is required',
        };
      }

      if (!validateLeafImpl(spec.implementation)) {
        return {
          ok: false,
          error: 'Invalid leaf implementation',
        };
      }

      const key = `${spec.name}@${spec.version}`;
      if (this.leaves.has(key)) {
        return {
          ok: false,
          error: `Leaf ${spec.name}@${spec.version} is already registered`,
        };
      }

      this.leaves.set(key, spec.implementation);
      this.specs.set(key, {
        ...spec,
        implementation: spec.implementation,
      });

      return {
        ok: true,
        leafName: spec.name,
        id: key,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute a leaf by name
   */
  async execute(
    leafName: string,
    context: LeafContext,
    args: Record<string, any>,
    options?: LeafRunOptions
  ): Promise<LeafResult> {
    // Try to find leaf by name (look for versioned keys)
    const leaf = this.get(leafName);
    if (!leaf) {
      return createExecError(
        `Leaf ${leafName} not found`,
        ExecErrorCode.EXECUTION_FAILED
      );
    }

    try {
      if (typeof leaf.execute === 'function') {
        return await leaf.execute(context, args, options);
      }

      if (typeof leaf.run === 'function') {
        return await leaf.run(context, args, options);
      }

      return createExecError(
        `Leaf ${leafName} missing execute/run handler`,
        ExecErrorCode.EXECUTION_FAILED
      );
    } catch (error) {
      return createExecError(
        `Leaf execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ExecErrorCode.EXECUTION_FAILED
      );
    }
  }

  /**
   * Get registered leaf names
   */
  getRegisteredLeaves(): string[] {
    return Array.from(this.leaves.keys()).map((key) => key.split('@')[0]);
  }

  /**
   * Check if a leaf is registered
   */
  hasLeaf(leafName: string): boolean {
    return this.get(leafName) !== undefined;
  }

  /**
   * Get a leaf implementation by name
   */
  getLeaf(leafName: string): LeafImpl | undefined {
    return this.get(leafName);
  }

  /**
   * Clear all registered leaves
   */
  clear(): void {
    this.leaves.clear();
    this.specs.clear();
  }

  /**
   * Get a leaf by name and optional version (core compatibility)
   */
  get(name: string, version?: string): LeafImpl | undefined {
    if (version) {
      const key = `${name}@${version}`;
      return this.leaves.get(key);
    }

    // Return latest by name (simplified - just get first match)
    const keys = Array.from(this.leaves.keys())
      .filter((k) => k.startsWith(`${name}@`))
      .sort();
    const latest = keys[keys.length - 1];
    return latest ? this.leaves.get(latest) : undefined;
  }

  /**
   * List all registered leaves (core compatibility)
   */
  listLeaves(): Array<{ name: string; version: string; spec: LeafSpec }> {
    const leaves: Array<{ name: string; version: string; spec: LeafSpec }> = [];

    for (const [key, spec] of this.specs.entries()) {
      const separator = key.indexOf('@');
      if (separator === -1) continue;
      const name = key.slice(0, separator);
      const version = key.slice(separator + 1);
      leaves.push({
        name,
        version,
        spec,
      });
    }

    return leaves;
  }

  /**
   * Execute a leaf with validation (core compatibility)
   */
  async run(
    name: string,
    version: string,
    ctx: LeafContext,
    args: unknown,
    opts?: LeafRunOptions
  ): Promise<LeafResult> {
    const key = `${name}@${version}`;
    const leaf = this.leaves.get(key);

    if (!leaf) {
      return createExecError(
        `Leaf ${name}@${version} not found`,
        ExecErrorCode.EXECUTION_FAILED
      );
    }

    try {
      if (typeof leaf.execute === 'function') {
        return await leaf.execute(ctx, args as Record<string, any>, opts);
      }
      if (typeof leaf.run === 'function') {
        return await leaf.run(ctx, args as Record<string, any>, opts);
      }
      return createExecError(
        `Leaf ${name}@${version} missing execute/run handler`,
        ExecErrorCode.EXECUTION_FAILED
      );
    } catch (error) {
      return createExecError(
        `Leaf execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ExecErrorCode.EXECUTION_FAILED
      );
    }
  }
}

/**
 * Create a new leaf factory instance
 */
export function createLeafFactory(): LeafFactory {
  return new LeafFactory();
}

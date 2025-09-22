/**
 * Capability Registry
 *
 * MCP-style capability discipline for BT execution. This registry ensures
 * that only registered capabilities can be executed, providing the "table
 * of contents" between planning and execution.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';
import {
  CapabilitySpec,
  ExecutionContext,
  ActionResult,
  WorldSnapshot,
  PBIError,
  PBIErrorCode,
  CANONICAL_VERBS,
} from './types';

// ============================================================================
// Capability Registry Implementation
// ============================================================================

/**
 * Registry for executable capabilities
 */
export class CapabilityRegistry {
  private capabilities = new Map<string, CapabilitySpec>();
  private versions = new Map<string, string[]>();

  /**
   * Register a capability
   */
  register(capability: CapabilitySpec): void {
    if (this.capabilities.has(capability.name)) {
      throw new PBIError(
        PBIErrorCode.CAPABILITY_UNAVAILABLE,
        `Capability '${capability.name}' already registered`,
        undefined,
        capability.name
      );
    }

    this.capabilities.set(capability.name, capability);

    // Track versions
    const existingVersions = this.versions.get(capability.name) || [];
    if (!existingVersions.includes(capability.version)) {
      existingVersions.push(capability.version);
      this.versions.set(capability.name, existingVersions);
    }
  }

  /**
   * Get a capability by name
   */
  get(name: string): CapabilitySpec | undefined {
    return this.capabilities.get(name);
  }

  /**
   * Check if a capability exists
   */
  has(name: string): boolean {
    return this.capabilities.has(name);
  }

  /**
   * Get all registered capability names
   */
  getAllNames(): string[] {
    return Array.from(this.capabilities.keys());
  }

  /**
   * Get capability by name and version
   */
  getByVersion(name: string, version: string): CapabilitySpec | undefined {
    const capability = this.capabilities.get(name);
    if (capability && capability.version === version) {
      return capability;
    }
    return undefined;
  }

  /**
   * Get all versions of a capability
   */
  getVersions(name: string): string[] {
    return this.versions.get(name) || [];
  }

  /**
   * Check if a capability name is canonical
   */
  isCanonicalVerb(name: string): boolean {
    return CANONICAL_VERBS.includes(name as any);
  }

  /**
   * Validate that all canonical verbs have registrations
   */
  validateCanonicalCoverage(): { missing: string[]; extra: string[] } {
    const registered = new Set(this.getAllNames());
    const canonical = new Set(CANONICAL_VERBS);

    const missing = CANONICAL_VERBS.filter((verb) => !registered.has(verb));
    const extra = Array.from(registered).filter(
      (name) => !canonical.has(name as any)
    );

    return { missing, extra };
  }

  /**
   * Get registry health metrics
   */
  getHealthMetrics() {
    const capabilities = Array.from(this.capabilities.values());
    const totalCapabilities = capabilities.length;

    const slaCompliance = capabilities.filter(
      (cap) =>
        cap.sla && cap.sla.successRate >= 0.95 && cap.sla.p95DurationMs <= 5000
    ).length;

    const versionHealth = capabilities.filter((cap) => {
      const versions = this.versions.get(cap.name) || [];
      return versions.length <= 3; // Max 3 versions per capability
    }).length;

    return {
      totalCapabilities,
      canonicalCoverage: this.validateCanonicalCoverage(),
      slaCompliance: slaCompliance / totalCapabilities,
      versionHealth: versionHealth / totalCapabilities,
      averageVersions:
        capabilities.reduce(
          (sum, cap) => sum + (this.versions.get(cap.name)?.length || 0),
          0
        ) / totalCapabilities,
    };
  }

  /**
   * Clear all capabilities (for testing)
   */
  clear(): void {
    this.capabilities.clear();
    this.versions.clear();
  }
}

// ============================================================================
// Built-in Capability Definitions
// ============================================================================

/**
 * Built-in capability definitions for common Minecraft actions
 */
export const BUILT_IN_CAPABILITIES: Record<
  string,
  Omit<CapabilitySpec, 'name' | 'version'>
> = {
  navigate: {
    inputSchema: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      timeoutMs: z.number().optional(),
      avoidHazards: z.boolean().optional(),
    }),
    guard: (ctx: ExecutionContext) => {
      // Can navigate if not in immediate danger
      return ctx.threatLevel < 0.8 && !ctx.nearLava;
    },
    runner: async (ctx: ExecutionContext, args: any): Promise<ActionResult> => {
      const startTime = Date.now();
      // Implementation would call actual navigation system
      // For now, simulate success
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        ok: true,
        startedAt: startTime,
        endedAt: Date.now(),
        observables: {
          pathLength: Math.sqrt(
            Math.pow(args.x, 2) + Math.pow(args.y, 2) + Math.pow(args.z, 2)
          ),
        },
      };
    },
    acceptance: (pre: WorldSnapshot, post: WorldSnapshot) => {
      // Check if we're within 2 blocks of target
      const preDistance = Math.sqrt(
        Math.pow(pre.position.x - (pre as any).targetX || 0, 2) +
          Math.pow(pre.position.y - (pre as any).targetY || 0, 2) +
          Math.pow(pre.position.z - (pre as any).targetZ || 0, 2)
      );

      const postDistance = Math.sqrt(
        Math.pow(post.position.x - (post as any).targetX || 0, 2) +
          Math.pow(post.position.y - (post as any).targetY || 0, 2) +
          Math.pow(post.position.z - (post as any).targetZ || 0, 2)
      );

      return postDistance < preDistance * 0.5; // Moved at least 50% closer
    },
    sla: {
      p95DurationMs: 3000,
      successRate: 0.95,
      maxRetries: 2,
    },
  },

  craft_item: {
    inputSchema: z.object({
      item: z.string(),
      quantity: z.number().min(1).max(64).optional(),
      recipe: z.string().optional(),
    }),
    guard: (ctx: ExecutionContext) => {
      // Can craft if we have necessary materials and access to crafting table
      return ctx.resourceValue > 0.1; // Basic check - would be more sophisticated
    },
    runner: async (ctx: ExecutionContext, args: any): Promise<ActionResult> => {
      const startTime = Date.now();
      // Implementation would call actual crafting system
      // For now, simulate crafting delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      return {
        ok: true,
        startedAt: startTime,
        endedAt: Date.now(),
        observables: {
          itemCrafted: args.item,
          quantity: args.quantity || 1,
          craftingTimeMs: Date.now() - startTime,
        },
      };
    },
    acceptance: (pre: WorldSnapshot, post: WorldSnapshot) => {
      // Check if item was added to inventory
      const preQuantity = pre.inventory[pre as any] || 0;
      const postQuantity = post.inventory[post as any] || 0;
      return postQuantity > preQuantity;
    },
    sla: {
      p95DurationMs: 2000,
      successRate: 0.9,
      maxRetries: 1,
    },
  },

  dig_block: {
    inputSchema: z.object({
      block: z.string(),
      position: z
        .object({
          x: z.number(),
          y: z.number(),
          z: z.number(),
        })
        .optional(),
      tool: z.string().optional(),
    }),
    guard: (ctx: ExecutionContext) => {
      // Can dig if not in immediate danger and block is reachable
      return ctx.threatLevel < 0.6 && !ctx.nearLava;
    },
    runner: async (ctx: ExecutionContext, args: any): Promise<ActionResult> => {
      const startTime = Date.now();
      // Implementation would call actual mining system
      // For now, simulate digging delay
      await new Promise((resolve) => setTimeout(resolve, 300));

      return {
        ok: true,
        startedAt: startTime,
        endedAt: Date.now(),
        observables: {
          blockType: args.block,
          position: args.position,
          toolUsed: args.tool || 'hand',
        },
      };
    },
    acceptance: (pre: WorldSnapshot, post: WorldSnapshot) => {
      // Check if block was removed from nearby blocks
      const preBlockCount = pre.nearbyBlocks.filter(
        (block: any) => block.type === (pre as any).targetBlock
      ).length;

      const postBlockCount = post.nearbyBlocks.filter(
        (block: any) => block.type === (post as any).targetBlock
      ).length;

      return postBlockCount < preBlockCount;
    },
    sla: {
      p95DurationMs: 1500,
      successRate: 0.95,
      maxRetries: 3,
    },
  },
};

// ============================================================================
// Registry Builder
// ============================================================================

/**
 * Builder for creating capability registries with built-in capabilities
 */
export class CapabilityRegistryBuilder {
  private registry = new CapabilityRegistry();

  /**
   * Add a built-in capability
   */
  addBuiltIn(name: string, version: string = '1.0.0'): this {
    const definition = BUILT_IN_CAPABILITIES[name];
    if (!definition) {
      throw new Error(`No built-in capability definition for '${name}'`);
    }

    this.registry.register({
      name,
      version,
      ...definition,
    });

    return this;
  }

  /**
   * Add all built-in capabilities
   */
  addAllBuiltIns(versions?: Record<string, string>): this {
    Object.keys(BUILT_IN_CAPABILITIES).forEach((name) => {
      const version = versions?.[name] || '1.0.0';
      this.addBuiltIn(name, version);
    });

    return this;
  }

  /**
   * Add a custom capability
   */
  addCustom(capability: CapabilitySpec): this {
    this.registry.register(capability);
    return this;
  }

  /**
   * Build the registry
   */
  build(): CapabilityRegistry {
    return this.registry;
  }
}

// ============================================================================
// Default Registry Instance
// ============================================================================

/**
 * Default capability registry with built-in capabilities
 */
export const createDefaultRegistry = (): CapabilityRegistry => {
  return new CapabilityRegistryBuilder().addAllBuiltIns().build();
};

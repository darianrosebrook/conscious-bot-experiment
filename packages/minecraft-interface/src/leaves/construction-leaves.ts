/**
 * Construction Leaves - P0 stub leaves for building domain
 *
 * These leaves implement the building execution pipeline but do NOT mutate
 * inventory or world state. They check material presence (read-only) and
 * emit telemetry via `wouldConsume` / `stub: true` fields.
 *
 * Integrity constraints:
 * - No inventory mutation in leaves
 * - No world mutation (no block placement/clearing)
 * - Results report what WOULD happen, not what DID happen
 *
 * @author @darianrosebrook
 */

import {
  LeafImpl,
  LeafContext,
  LeafResult,
  LeafSpec,
} from '@conscious-bot/core';

// ============================================================================
// Prepare Site Leaf
// ============================================================================

/**
 * Stub leaf for site preparation. Logs intent but does not clear blocks
 * or modify world state.
 */
export class PrepareSiteLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'prepare_site',
    version: '1.0.0',
    description: 'Prepare a building site (P0 stub — no world mutation)',
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Module ID for site preparation',
        },
      },
      required: ['moduleId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        moduleId: { type: 'string' },
        cleared: { type: 'boolean' },
        stub: { type: 'boolean' },
      },
    },
    timeoutMs: 5000,
    retries: 0,
    permissions: ['sense'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { moduleId } = args;

    if (!moduleId || typeof moduleId !== 'string') {
      return {
        status: 'failure',
        error: {
          code: 'invalid_input',
          retryable: false,
          detail: 'moduleId is required and must be a string',
        },
        metrics: {
          durationMs: ctx.now() - startTime,
          retries: 0,
          timeouts: 0,
        },
      };
    }

    console.log(`[Building] prepare_site stub: moduleId=${moduleId} (no world mutation)`);

    const durationMs = ctx.now() - startTime;
    ctx.emitMetric('prepare_site_duration', durationMs);

    return {
      status: 'success',
      result: {
        moduleId,
        cleared: true,
        stub: true,
      },
      metrics: {
        durationMs,
        retries: 0,
        timeouts: 0,
      },
    };
  }
}

// ============================================================================
// Build Module Leaf
// ============================================================================

/**
 * Stub leaf for building a module. Checks inventory for required materials
 * (read-only) and emits wouldConsume telemetry. Does NOT decrement inventory.
 */
export class BuildModuleLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'build_module',
    version: '1.0.0',
    description: 'Build a structural module (P0 stub — no inventory mutation)',
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Module ID to build',
        },
        moduleType: {
          type: 'string',
          description: 'Type of module (apply_module, etc.)',
        },
        materials: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              count: { type: 'number' },
            },
          },
          description: 'Required materials for this module',
        },
      },
      required: ['moduleId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        moduleId: { type: 'string' },
        materialsPresent: { type: 'boolean' },
        wouldConsume: { type: 'object' },
        stub: { type: 'boolean' },
      },
    },
    timeoutMs: 10000,
    retries: 0, // Not 2 — avoids double-consume trap when stubs graduate
    permissions: ['sense', 'container.read'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { moduleId, materials } = args;

    if (!moduleId || typeof moduleId !== 'string') {
      return {
        status: 'failure',
        error: {
          code: 'invalid_input',
          retryable: false,
          detail: 'moduleId is required and must be a string',
        },
        metrics: {
          durationMs: ctx.now() - startTime,
          retries: 0,
          timeouts: 0,
        },
      };
    }

    // Check inventory for materials (read-only)
    const wouldConsume: Record<string, number> = {};
    const missing: Array<{ name: string; have: number; need: number }> = [];

    if (Array.isArray(materials) && materials.length > 0) {
      const bot = ctx.bot;
      const inventoryItems = bot.inventory.items();

      for (const mat of materials) {
        if (!mat?.name || typeof mat.count !== 'number') continue;
        const have = inventoryItems
          .filter((item: any) => item.name === mat.name)
          .reduce((sum: number, item: any) => sum + item.count, 0);

        wouldConsume[mat.name] = mat.count;

        if (have < mat.count) {
          missing.push({ name: mat.name, have, need: mat.count });
        }
      }
    }

    const durationMs = ctx.now() - startTime;
    ctx.emitMetric('build_module_duration', durationMs);

    // P0 pragmatic: stubs always succeed. The solver's needsMaterials path is
    // the sole deficit mechanism — don't introduce a competing failure here.
    // Log missing materials as telemetry only.
    if (missing.length > 0) {
      console.log(
        `[Building] build_module stub: moduleId=${moduleId} MISSING materials (telemetry only):`,
        missing
      );
    } else {
      console.log(
        `[Building] build_module stub: moduleId=${moduleId} materials present (no mutation)`,
        wouldConsume
      );
    }

    return {
      status: 'success',
      result: {
        moduleId,
        materialsPresent: missing.length === 0,
        wouldConsume,
        ...(missing.length > 0 ? { missing } : {}),
        stub: true,
      },
      metrics: {
        durationMs,
        retries: 0,
        timeouts: 0,
      },
    };
  }
}

// ============================================================================
// Place Feature Leaf
// ============================================================================

/**
 * Stub leaf for placing a feature (door, torch, bed, etc.). Checks
 * inventory for required materials (read-only) and emits telemetry.
 * Does NOT mutate inventory or world state.
 */
export class PlaceFeatureLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'place_feature',
    version: '1.0.0',
    description: 'Place a building feature (P0 stub — no inventory mutation)',
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Module ID for the feature',
        },
        materials: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              count: { type: 'number' },
            },
          },
          description: 'Required materials for this feature',
        },
      },
      required: ['moduleId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        moduleId: { type: 'string' },
        featurePlaced: { type: 'boolean' },
        wouldConsume: { type: 'object' },
        stub: { type: 'boolean' },
      },
    },
    timeoutMs: 8000,
    retries: 0,
    permissions: ['sense', 'container.read'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { moduleId, materials } = args;

    if (!moduleId || typeof moduleId !== 'string') {
      return {
        status: 'failure',
        error: {
          code: 'invalid_input',
          retryable: false,
          detail: 'moduleId is required and must be a string',
        },
        metrics: {
          durationMs: ctx.now() - startTime,
          retries: 0,
          timeouts: 0,
        },
      };
    }

    // Check inventory for materials (read-only)
    const wouldConsume: Record<string, number> = {};
    const missing: Array<{ name: string; have: number; need: number }> = [];

    if (Array.isArray(materials) && materials.length > 0) {
      const bot = ctx.bot;
      const inventoryItems = bot.inventory.items();

      for (const mat of materials) {
        if (!mat?.name || typeof mat.count !== 'number') continue;
        const have = inventoryItems
          .filter((item: any) => item.name === mat.name)
          .reduce((sum: number, item: any) => sum + item.count, 0);

        wouldConsume[mat.name] = mat.count;

        if (have < mat.count) {
          missing.push({ name: mat.name, have, need: mat.count });
        }
      }
    }

    const durationMs = ctx.now() - startTime;
    ctx.emitMetric('place_feature_duration', durationMs);

    // P0 pragmatic: stubs always succeed. The solver's needsMaterials path is
    // the sole deficit mechanism — don't introduce a competing failure here.
    if (missing.length > 0) {
      console.log(
        `[Building] place_feature stub: moduleId=${moduleId} MISSING materials (telemetry only):`,
        missing
      );
    } else {
      console.log(
        `[Building] place_feature stub: moduleId=${moduleId} materials present (no mutation)`,
        wouldConsume
      );
    }

    return {
      status: 'success',
      result: {
        moduleId,
        featurePlaced: missing.length === 0,
        wouldConsume,
        ...(missing.length > 0 ? { missing } : {}),
        stub: true,
      },
      metrics: {
        durationMs,
        retries: 0,
        timeouts: 0,
      },
    };
  }
}

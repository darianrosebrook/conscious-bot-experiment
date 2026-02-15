/**
 * Extract executable leaf + args from a Sterling-generated task step's meta.
 * Used by the executor to convert Sterling steps into tool calls.
 *
 * @author @darianrosebrook
 */

export type ArgsSource = 'explicit' | 'derived';

export type StepToLeafResult = {
  leafName: string;
  args: Record<string, unknown>;
  /** Option A: Sterling supplied executor-native args. Derived: TS inferred from produces/consumes; not certifiable in live. */
  argsSource: ArgsSource;
  /** When step meta.leaf was rewritten (e.g. dig_block -> acquire_material). Preserved for artifact evidence. */
  originalLeaf?: string;
};

/** Plain object only (no Array, Date, or subclass). Null-proto objects (Object.create(null)) count as explicit. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Extract executable leaf + args from a Sterling-generated task step's meta.
 * Returns null if the step has no machine-readable meta.
 *
 * - Explicit args (Option A): When meta.args exists and is a plain object, pass through; argsSource = 'explicit'.
 * - Derived (legacy): Derive args from meta.produces/consumes; argsSource = 'derived'. Not allowed in live mode.
 */
export function stepToLeafExecution(step: {
  meta?: Record<string, unknown>;
}): StepToLeafResult | null {
  const meta = step.meta;
  if (!meta?.leaf) return null;

  if (isPlainObject(meta.args)) {
    return {
      leafName: meta.leaf as string,
      args: meta.args as Record<string, unknown>,
      argsSource: 'explicit',
    };
  }

  // Legacy fallback: derive args from produces/consumes (non-certifiable in live)
  const leaf = meta.leaf as string;
  const produces =
    (meta.produces as Array<{ name: string; count: number }>) || [];
  const consumes =
    (meta.consumes as Array<{ name: string; count: number }>) || [];

  switch (leaf) {
    case 'dig_block': {
      // Legacy remap: dig_block → acquire_material.
      // Gated: emit diagnostic so we can track usage and remove once counter hits zero.
      console.warn(
        '[stepToLeafExecution] Legacy dig_block → acquire_material rewrite fired. ' +
          'This path should not be hit by Sterling-resolved steps (they use explicit args). ' +
          'If you see this in production, a producer is still emitting derived dig_block steps.'
      );
      const item = produces[0];
      return {
        leafName: 'acquire_material',
        args: { item: item?.name || 'oak_log', count: item?.count || 1 },
        argsSource: 'derived',
        originalLeaf: 'dig_block',
      };
    }
    case 'craft_recipe': {
      const output = produces[0];
      return {
        leafName: 'craft_recipe',
        args: { recipe: output?.name || 'unknown', qty: output?.count || 1 },
        argsSource: 'derived',
      };
    }
    case 'smelt': {
      const consumed = consumes[0];
      return {
        leafName: 'smelt',
        args: { input: consumed?.name || 'unknown' },
        argsSource: 'derived',
      };
    }
    case 'place_workstation': {
      const workstation = (meta.workstation as string) || 'crafting_table';
      return {
        leafName: 'place_workstation',
        args: { workstation },
        argsSource: 'derived',
      };
    }
    case 'place_block': {
      const consumed = consumes[0];
      return {
        leafName: 'place_block',
        args: { item: consumed?.name || 'crafting_table' },
        argsSource: 'derived',
      };
    }
    case 'acquire_material': {
      const acquireItem =
        (meta.item as string) ||
        produces[0]?.name ||
        (meta.blockType as string) ||
        'oak_log';
      const acquireCount = (meta.count as number) || produces[0]?.count || 1;
      return {
        leafName: 'acquire_material',
        args: { item: acquireItem, count: acquireCount },
        argsSource: 'derived',
      };
    }
    case 'prepare_site':
    case 'build_module':
    case 'place_feature':
    case 'building_step': {
      return {
        leafName: leaf,
        args: {
          moduleId: meta.moduleId,
          item: meta.item,
          count: meta.count,
          ...((meta.args as Record<string, unknown>) || {}),
        },
        argsSource: 'derived',
      };
    }
    case 'sterling_navigate': {
      const metaAny = meta as Record<string, unknown>;
      const argsAny = metaAny.args as Record<string, unknown> | undefined;
      return {
        leafName: 'sterling_navigate',
        args: {
          target: meta.target || argsAny?.target,
          toleranceXZ: meta.toleranceXZ ?? argsAny?.toleranceXZ ?? 1,
          toleranceY: meta.toleranceY ?? argsAny?.toleranceY ?? 0,
          ...(argsAny || {}),
        },
        argsSource: 'derived',
      };
    }
    case 'explore_for_resources': {
      const resourceTags = meta.resource_tags as string[] | undefined;
      const goalItem = meta.goal_item as string | undefined;
      const reason = meta.reason as string | undefined;
      return {
        leafName: 'explore_for_resources',
        args: {
          resource_tags: resourceTags ?? [],
          goal_item: goalItem,
          reason: reason,
        },
        argsSource: 'derived',
      };
    }
    default:
      return null;
  }
}

/** Sentinel values that indicate derived/fallback args; invalid for live dispatch. */
export const SENTINEL_RECIPE = 'unknown';
export const SENTINEL_INPUT = 'unknown';

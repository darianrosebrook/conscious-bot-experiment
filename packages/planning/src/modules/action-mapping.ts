import { logOptimizer } from './logging';
import { InventoryItem, findWoodPrefix, nextToolUpgrade, bestToolName } from './inventory-helpers';
import {
  deriveLeafActionMappings,
  type LeafActionMapping,
} from '@conscious-bot/executor-contracts';

/** Nav lease metadata injected via reserved __nav namespace. */
export interface NavLeaseNav {
  scope?: string;
  holder?: string;
  priority?: 'normal' | 'high' | 'emergency';
}

/** Minecraft action with optional nav lease routing metadata. */
export interface MinecraftActionWithNav {
  type: string;
  parameters: Record<string, any> & { __nav?: NavLeaseNav };
  timeout?: number;
}

/**
 * Inject nav lease scope into an action's parameters.
 * Uses the reserved __nav namespace to avoid collisions with action semantics.
 * Merges with existing __nav to preserve holder/priority if already set.
 */
export function withNavLeaseScope<
  A extends {
    type: string;
    parameters?: Record<string, any>;
    timeout?: number;
  } | null,
>(action: A, taskId: string): A {
  if (!action) return action;
  const existingNav = action.parameters?.__nav as NavLeaseNav | undefined;
  return {
    ...action,
    parameters: {
      ...(action.parameters ?? {}),
      __nav: { ...existingNav, scope: taskId },
    },
  } as A;
}

export function extractItemFromTask(task: any, inv?: InventoryItem[]): string {
  const title = (task.title || '').toLowerCase();
  const description = (task.description || '').toLowerCase();
  const text = `${title} ${description}`;
  const wood = inv ? findWoodPrefix(inv) : 'oak';

  // Detect explicit tier mentions ("stone pickaxe", "iron sword", etc.)
  const tierMatch = text.match(/\b(wooden|stone|iron|diamond|netherite)[_ ](pickaxe|axe|sword|shovel|hoe)\b/);
  if (tierMatch) return `${tierMatch[1]}_${tierMatch[2]}`;

  // Tool mentions without tier → infer next upgrade from inventory
  if (text.includes('pickaxe')) return inv ? nextToolUpgrade(inv, 'pickaxe') : 'wooden_pickaxe';
  if (text.includes('axe'))     return inv ? nextToolUpgrade(inv, 'axe') : 'wooden_axe';
  if (text.includes('sword'))   return inv ? nextToolUpgrade(inv, 'sword') : 'wooden_sword';
  if (text.includes('shovel'))  return inv ? nextToolUpgrade(inv, 'shovel') : 'wooden_shovel';
  if (text.includes('hoe'))     return inv ? nextToolUpgrade(inv, 'hoe') : 'wooden_hoe';
  if (text.includes('stick'))   return 'stick';
  if (text.includes('plank'))   return `${wood}_planks`;
  if (text.includes('crafting table')) return 'crafting_table';
  if (text.includes('torch'))   return 'torch';
  if (text.includes('door'))    return `${wood}_door`;
  if (text.includes('fence'))   return `${wood}_fence`;
  if (text.includes('chest'))   return 'chest';
  if (text.includes('furnace')) return 'furnace';
  if (text.includes('tool'))    return inv ? nextToolUpgrade(inv, 'pickaxe') : 'wooden_pickaxe';
  if (text.includes('item'))    return `${wood}_planks`;
  return `${wood}_planks`;
}

export function mapTaskTypeToMinecraftAction(task: any) {
  switch (task.type) {
    case 'social': {
      const message =
        task.parameters?.message ||
        (task.description || task.title || 'Hello').slice(0, 256);
      return {
        type: 'chat',
        parameters: { message },
        timeout: 5000,
      };
    }
    case 'general': {
      const title = (task.title || '').toLowerCase();
      const desc = (task.description || '').toLowerCase();
      const text = `${title} ${desc}`;
      // Heuristic mapping so we don't stall on unknown types
      if (text.includes('craft') || text.includes('plank')) {
        return {
          type: 'craft',
          parameters: {
            item: extractItemFromTask(task) || 'oak_planks',
            quantity: 1,
          },
          timeout: 15000,
        };
      }
      if (
        text.includes('wood') ||
        text.includes('log') ||
        text.includes('tree') ||
        text.includes('gather') ||
        text.includes('collect')
      ) {
        return {
          type: 'gather',
          parameters: { resource: 'wood', amount: 3, target: 'tree' },
          timeout: 15000,
        };
      }
      // Default to exploration to emulate a flood-fill reposition
      return {
        type: 'navigate',
        parameters: {
          target: task.parameters?.target || 'exploration_target',
          distance: task.parameters?.distance || 10,
        },
        timeout: 15000,
      };
    }
    case 'movement':
      return {
        type: 'move_to',
        parameters: {
          pos: task.parameters?.pos || task.parameters?.target || undefined,
          // Fallback small step if no target provided
          distance: task.parameters?.distance || 1,
        },
        timeout: 15000,
      };
    case 'gathering':
      return {
        type: 'gather',
        parameters: {
          resource: task.title.toLowerCase().includes('wood')
            ? 'wood'
            : 'resource',
          amount: 3,
          target: task.title.toLowerCase().includes('wood')
            ? 'tree'
            : 'resource',
        },
        timeout: 15000,
      };
    case 'gather':
      return {
        type: 'gather',
        parameters: {
          resource:
            task.parameters?.resource ||
            (task.title.toLowerCase().includes('wood') ? 'wood' : 'resource'),
          amount: task.parameters?.amount || 3,
          target: task.parameters?.target || 'tree',
        },
        timeout: 15000,
      };
    case 'crafting':
      return {
        type: 'craft',
        parameters: { item: extractItemFromTask(task), quantity: 1 },
        timeout: 15000,
      };
    case 'mining': {
      const mineTitle = task.title?.toLowerCase() || '';
      // If task mentions a specific ore, use it; otherwise infer from title
      const mineBlock = task.parameters?.blockType
        || (mineTitle.includes('diamond') ? 'diamond_ore' : undefined)
        || (mineTitle.includes('iron') ? 'iron_ore' : undefined)
        || (mineTitle.includes('gold') ? 'gold_ore' : undefined)
        || (mineTitle.includes('coal') ? 'coal_ore' : undefined)
        || 'stone';
      return {
        type: 'mine_block',
        parameters: {
          blockType: mineBlock,
          position: { x: 0, y: 0, z: 0 },
        },
        timeout: 15000,
      };
    }
    case 'exploration':
    case 'explore':
      return {
        type: 'navigate',
        parameters: {
          target: task.parameters?.target || 'exploration_target',
          distance: task.parameters?.distance || 10,
        },
        timeout: 15000,
      };
    case 'placement':
      return {
        type: 'place_block',
        parameters: {
          block_type: task.parameters?.itemType || 'crafting_table',
          count: task.parameters?.quantity || 1,
          placement: 'around_player',
        },
        timeout: 15000,
      };
    case 'building':
      return {
        type: 'place_block',
        parameters: {
          block_type: extractItemFromTask(task),
          count: task.parameters?.quantity || 1,
          placement: 'around_player',
        },
        timeout: 15000,
      };
    default:
      logOptimizer.warn(
        `⚠️ No action mapping for task type: ${task.type}`,
        `no-action-mapping-${task.type}`
      );
      return null;
  }
}

export type MapBTActionOptions = {
  /** When true, unmapped tools return null instead of a generic action (fail-closed for executor). */
  strict?: boolean;
};

/**
 * Emit a warning when action-mapping intentionally changes the action type.
 * Every type remap MUST call this — unlisted remaps are bugs.
 * See: scan_for_trees → scan_environment, pathfind → move_forward, etc.
 */
function warnTypeRemap(from: string, to: string): void {
  console.warn(
    `[ActionMapping] Intentional type remap: ${from} → ${to}`
  );
}

/** Valid Minecraft item/recipe identifier: lowercase alphanumeric + underscores.
 *  Rejects solver-internal formats like "crafting_table:v9" or "minecraft:oak_planks". */
const VALID_MC_ID = /^[a-z0-9_]+$/;

/**
 * Normalize a recipe identifier at the action-mapping boundary.
 * Strips solver-internal suffixes (`:v9`, `:variant_2`) and namespace prefixes (`minecraft:`).
 * Returns the normalized ID, or null if the result is empty/invalid.
 * Records the raw value for diagnostics when normalization changes it.
 */
function normalizeRecipeId(raw: string | undefined): { id: string | null; raw?: string } {
  if (!raw || typeof raw !== 'string') return { id: null };
  let normalized = raw.trim().toLowerCase();
  // Strip namespace prefix: "minecraft:oak_planks" → "oak_planks"
  if (normalized.includes(':')) {
    const beforeColon = normalized.split(':')[0];
    const afterColon = normalized.split(':').slice(1).join(':');
    // If afterColon matches a version/variant pattern (v9, variant_2), strip it
    if (/^v\d+$/.test(afterColon) || /^variant_\d+$/.test(afterColon)) {
      normalized = beforeColon;
    }
    // If beforeColon is "minecraft", use afterColon as the ID
    else if (beforeColon === 'minecraft') {
      normalized = afterColon;
    }
    // Otherwise log and strip — unknown namespace
    else {
      console.warn(
        `[ActionMapping] recipe_id normalization: unknown format "${raw}" → using "${beforeColon}"`
      );
      normalized = beforeColon;
    }
  }
  if (!VALID_MC_ID.test(normalized) || normalized.length === 0) {
    console.warn(
      `[ActionMapping] recipe_id rejected: "${raw}" → "${normalized}" does not match ${VALID_MC_ID}`
    );
    return { id: null, raw };
  }
  if (normalized !== raw) {
    return { id: normalized, raw };
  }
  return { id: normalized };
}

// ============================================================================
// Leaf dispatch — derived from the shared leaf manifest
// ============================================================================

/** Planning-side action mappings keyed by leaf name (from the manifest). */
const LEAF_ACTION_MAPPINGS: ReadonlyMap<string, LeafActionMapping> =
  deriveLeafActionMappings();

/** Input aliases accepted at the mapping boundary (legacy spellings). */
const LEAF_NAME_ALIASES: Record<string, string> = {
  dig_blocks: 'dig_block',
};

interface LeafTransformResult {
  parameters: Record<string, any>;
  debug?: unknown;
}

/**
 * Custom per-leaf arg transforms. The manifest declares *that* a leaf maps
 * (and to what type/timeout); these functions own *how* args become action
 * parameters. Leaves without an entry pass args through as-is.
 */
const LEAF_ARG_TRANSFORMS: Record<
  string,
  (args: Record<string, any>, debugInfo: object) => LeafTransformResult
> = {
  // dig_block is a position-required primitive: "dig this specific block."
  // If you want search+pathfind+dig+collect, use acquire_material directly.
  // Fail closed on missing pos — no silent behavior substitution.
  dig_block: (args, debugInfo) => {
    const pos = args.position || args.pos;
    if (!pos || typeof pos !== 'object') {
      return { parameters: { _error: 'missing_required_arg:pos' }, debug: debugInfo };
    }
    return {
      parameters: {
        pos,
        tool: args.tool || 'axe',
        blockType: args.blockType,
      },
    };
  },
  // No remap — collect_items routes to CollectItemsLeaf (dropped-item pickup).
  // Previously remapped to collect_items_enhanced with exploreOnFail, which
  // triggered a handler-path spiral scan. Leaf dispatch is now the canonical path.
  collect_items: (args) => ({
    parameters: {
      itemName: args.itemName || args.item || args.blockType,
      radius: args.radius || 16,
      maxItems: args.maxItems || 10,
      timeout: args.timeout || args.maxSearchTime || 15000,
    },
  }),
  acquire_material: (args, debugInfo) => {
    const item = args.itemName || args.item || args.blockType;
    if (!item || typeof item !== 'string') {
      return { parameters: { _error: 'missing_required_arg:item' }, debug: debugInfo };
    }
    return {
      parameters: {
        item,
        count: args.count ?? args.quantity ?? 1,
      },
    };
  },
  place_block: (args) => ({
    parameters: {
      block_type: args.blockType || args.block_type || args.item || 'stone',
      count: args.count || 1,
      placement: args.placement || 'around_player',
      position: args.position || args.pos,
    },
  }),
  move_to: (args) => ({
    parameters: {
      target: args.target || args.pos || 'exploration_target',
      distance: args.distance || 10,
    },
  }),
  // No remap — craft_recipe routes directly to CraftRecipeLeaf via contract.
  // Previously remapped to 'craft' which forced handler dispatch (executeCraftItem),
  // bypassing the leaf and its toolDiagnostics.
  craft_recipe: (args, debugInfo) => {
    const { id: recipeId, raw: recipeRaw } = normalizeRecipeId(
      args.recipe || args.item
    );
    if (!recipeId) {
      return {
        parameters: { _error: `invalid_recipe_id:${recipeRaw ?? 'missing'}` },
        debug: debugInfo,
      };
    }
    return {
      parameters: {
        recipe: recipeId,
        qty: args.qty || args.quantity || 1,
        ...(recipeRaw ? { _recipe_raw: recipeRaw } : {}),
      },
    };
  },
  smelt: (args) => ({
    parameters: {
      item: args.item || args.recipe || args.input,
      quantity: args.qty || args.quantity || 1,
      fuel: args.fuel || 'coal',
    },
  }),
  place_workstation: (args) => ({
    parameters: { workstation: args.workstation || 'crafting_table' },
  }),
  chat: (args) => ({
    parameters: { message: (args.message || 'Hello!').slice(0, 256) },
  }),
  wait: (args) => ({
    parameters: { duration: args.duration || 2000 },
  }),
  step_forward_safely: (args) => ({
    parameters: { distance: args.distance || 1 },
  }),
};

/**
 * Build the minecraft action for a leaf from its manifest mapping, applying
 * the custom arg transform when one is registered.
 */
function mapLeafAction(
  leafName: string,
  args: Record<string, any>,
  debugInfo: object
): { type: string; parameters: Record<string, any>; debug?: unknown; timeout?: number } | null {
  const mapping = LEAF_ACTION_MAPPINGS.get(leafName);
  if (!mapping) return null;
  const type = mapping.type ?? leafName;
  const timeout =
    mapping.timeout !== undefined ? { timeout: mapping.timeout } : {};
  const transform = LEAF_ARG_TRANSFORMS[leafName];
  if (!transform) {
    // Passthrough: parameters pass through as-is; the action-contract-registry
    // owns defaults, aliases, and required-key enforcement at runtime.
    return { type, parameters: { ...args }, ...timeout };
  }
  const { parameters, debug } = transform(args, debugInfo);
  return {
    type,
    parameters,
    ...(debug !== undefined ? { debug } : {}),
    ...timeout,
  };
}

export function mapBTActionToMinecraft(
  tool: string,
  args: Record<string, any>,
  options?: MapBTActionOptions
): {
  type: string;
  parameters: Record<string, any>;
  debug?: unknown;
  timeout?: number;
} | null {
  const strict = options?.strict === true;
  // Strip "minecraft." prefix if present to normalize the action name
  const normalizedTool = tool.replace(/^minecraft\./, '');

  const debugInfo = { originalAction: tool, normalizedTool, args: args };

  switch (normalizedTool) {
    // ── Legacy BT / cognitive-reflection actions (not leaf vocabulary) ──
    // These remap to canonical minecraft action types. Every case that changes
    // the action type MUST call warnTypeRemap() before returning.
    case 'scan_for_trees':
      warnTypeRemap('scan_for_trees', 'scan_environment');
      return {
        type: 'scan_environment',
        parameters: {
          radius: args.radius || 50,
          targetBlock: args.blockType || '_log',
          action: 'find_nearest_block',
        },
        timeout: 10000, // Give enough time for scanning
      };
    case 'pathfind':
      warnTypeRemap('pathfind', 'move_forward');
      return {
        type: 'move_forward',
        parameters: { distance: args.distance || 1 },
      };
    case 'scan_tree_structure':
      warnTypeRemap('scan_tree_structure', 'scan_environment');
      return {
        type: 'scan_environment',
        parameters: {
          radius: 10,
          targetBlock: '_log',
          action: 'analyze_tree_structure',
        },
        timeout: 3000,
      };
    case 'execute_bt':
      warnTypeRemap('execute_bt', 'execute_behavior_tree');
      return {
        type: 'execute_behavior_tree',
        parameters: {
          btId: args.bt_id,
        },
        timeout: 30000,
      };
    case 'clear_3x3_area':
      warnTypeRemap('clear_3x3_area', 'mine_block');
      return {
        type: 'mine_block',
        parameters: {
          position: args.position || 'current',
          tool: args.tool || 'pickaxe',
          area: { x: 3, y: 2, z: 3 },
        },
        debug: debugInfo,
      };
    case 'place_blocks': {
      const pattern = args.pattern || 'single';
      const blockType = args.block || 'stone';
      if (pattern === '3x3_floor') {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 9,
            placement: 'pattern_3x3_floor',
          },
        };
      } else if (pattern === '3x3_walls_2_high') {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 12,
            placement: 'pattern_3x3_walls',
          },
        };
      } else if (pattern === '3x3_roof') {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 9,
            placement: 'pattern_3x3_roof',
          },
        };
      } else {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 1,
            placement: 'around_player',
          },
        };
      }
    }
    case 'place_door':
      warnTypeRemap('place_door', 'place_block');
      return {
        type: 'place_block',
        parameters: {
          block_type: 'oak_door',
          count: 1,
          placement: 'specific_position',
          position: args.position || 'front_center',
        },
      };

    // Cognitive reflection generated actions — all remap to canonical types
    case 'move_and_gather':
      warnTypeRemap('move_and_gather', 'gather_resources');
      return {
        type: 'gather_resources',
        parameters: {
          resource: args.resource || 'wood',
          quantity: args.quantity || 5,
          searchRadius: args.searchRadius || 20,
        },
      };
    case 'move_and_mine':
      warnTypeRemap('move_and_mine', 'mine_block');
      return {
        type: 'mine_block',
        parameters: {
          blockType: args.resource === 'iron' ? 'iron_ore' : 'stone',
          searchRadius: args.searchRadius || 20,
          quantity: args.quantity || 3,
        },
      };
    case 'explore_area':
      warnTypeRemap('explore_area', 'move_random');
      return {
        type: 'move_random',
        parameters: {
          radius: args.radius || 25,
          duration: args.duration || 15000,
        },
      };
    case 'assess_safety':
      warnTypeRemap('assess_safety', 'scan_environment');
      return {
        type: 'scan_environment',
        parameters: {
          radius: args.checkRadius || 20,
          action: 'assess_threats',
        },
      };
  }

  // ── Leaf dispatch: manifest mapping + optional custom arg transform ──
  // Which leaves map, to what action type, and with what timeout derive from
  // the shared leaf manifest. Shadow-only leaves have no mapping here.
  const leafName = LEAF_NAME_ALIASES[normalizedTool] ?? normalizedTool;
  const leafAction = mapLeafAction(leafName, args, debugInfo);
  if (leafAction) return leafAction;

  if (strict) return null;
  return { type: normalizedTool, parameters: args, debug: debugInfo };
}

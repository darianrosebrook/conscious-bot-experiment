/**
 * Action Contract Registry — single source of truth for action→leaf routing,
 * parameter aliasing, and deprecated key warnings.
 *
 * Data-driven — no switch statements, no drift. All normalization is
 * table-driven from ACTION_CONTRACTS.
 */

export interface ActionContract {
  /** Canonical leaf name this action routes to */
  leafName: string;
  /** Parameter renames: { fromKey: toKey } */
  aliases: Record<string, string>;
  /** Keys to silently strip (leaf doesn't support them) */
  stripKeys?: string[];
  /** Keys that are deprecated — log a warning if present */
  deprecatedKeys?: string[];
  /** Default values to inject if missing */
  defaults?: Record<string, unknown>;
}

export const ACTION_CONTRACTS: Record<string, ActionContract> = {
  // --- Pattern 2 actions (currently bypass leaves) ---
  acquire_material: {
    leafName: 'acquire_material',
    aliases: { blockType: 'item' },
    defaults: { count: 1 },
  },
  place_block: {
    leafName: 'place_block',
    aliases: { block_type: 'item' },
    stripKeys: ['placement', 'count'],
    deprecatedKeys: ['placement'],
  },
  consume_food: {
    leafName: 'consume_food',
    aliases: {},
    defaults: { food_type: 'any', amount: 1 },
  },
  collect_items_enhanced: {
    leafName: 'collect_items',
    aliases: { item: 'itemName', maxSearchTime: 'timeout' },
    stripKeys: ['exploreOnFail'],
    deprecatedKeys: ['exploreOnFail'],
  },
  // --- Existing routed actions (document their contracts) ---
  craft: { leafName: 'craft_recipe', aliases: {}, defaults: {} },
  craft_item: { leafName: 'craft_recipe', aliases: {}, defaults: {} },
  smelt: { leafName: 'smelt', aliases: {}, defaults: {} },
  smelt_item: { leafName: 'smelt', aliases: {}, defaults: {} },
  collect_items: {
    leafName: 'collect_items',
    aliases: { item: 'itemName' },
    defaults: {},
  },
  sleep: { leafName: 'sleep', aliases: {}, defaults: {} },
  find_resource: { leafName: 'find_resource', aliases: {}, defaults: {} },
  equip_tool: { leafName: 'equip_tool', aliases: {}, defaults: {} },
  introspect_recipe: {
    leafName: 'introspect_recipe',
    aliases: {},
    defaults: {},
  },
  place_workstation: {
    leafName: 'place_workstation',
    aliases: {},
    defaults: {},
  },
  prepare_site: { leafName: 'prepare_site', aliases: {}, defaults: {} },
  build_module: { leafName: 'build_module', aliases: {}, defaults: {} },
  place_feature: { leafName: 'place_feature', aliases: {}, defaults: {} },
};

/**
 * Resolve an action type to its canonical leaf name.
 * Returns undefined if not in the registry (action uses legacy handler).
 */
export function resolveLeafName(actionType: string): string | undefined {
  return ACTION_CONTRACTS[actionType]?.leafName;
}

/**
 * Normalize action parameters using the contract's alias map.
 * Data-driven — no switch statement, no drift.
 *
 * Returns { params, warnings } where warnings lists any deprecated keys found.
 */
export function normalizeActionParams(
  actionType: string,
  params: Record<string, any>
): { params: Record<string, any>; warnings: string[] } {
  const contract = ACTION_CONTRACTS[actionType];
  if (!contract) return { params: { ...params }, warnings: [] };

  const normalized = { ...params };
  const warnings: string[] = [];

  // Apply aliases (only if target key isn't already set)
  for (const [fromKey, toKey] of Object.entries(contract.aliases)) {
    if (normalized[fromKey] !== undefined && normalized[toKey] === undefined) {
      normalized[toKey] = normalized[fromKey];
      delete normalized[fromKey];
    }
  }

  // Warn on deprecated keys before stripping
  for (const key of contract.deprecatedKeys ?? []) {
    if (normalized[key] !== undefined) {
      warnings.push(
        `deprecated param '${key}' for ${actionType} → ${contract.leafName}`
      );
    }
  }

  // Strip unsupported keys
  for (const key of contract.stripKeys ?? []) {
    delete normalized[key];
  }

  // Apply defaults
  for (const [key, value] of Object.entries(contract.defaults ?? {})) {
    if (normalized[key] === undefined) {
      normalized[key] = value;
    }
  }

  return { params: normalized, warnings };
}

/**
 * Generate the ACTION_TYPE_TO_LEAF mapping from the registry.
 * This replaces the hand-maintained const in action-translator.ts.
 */
export function buildActionTypeToLeafMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [actionType, contract] of Object.entries(ACTION_CONTRACTS)) {
    map[actionType] = contract.leafName;
  }
  return map;
}

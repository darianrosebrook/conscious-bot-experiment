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
  /**
   * How Phase 1 should dispatch this action:
   * - 'leaf': Route directly to leaf via dispatchToLeaf (default)
   * - 'handler': Always route to dedicated handler method (skips generic leaf dispatch)
   * - 'guarded': Route to leaf unless a semantic guard redirects to handler
   */
  dispatchMode?: 'leaf' | 'handler' | 'guarded';
  /**
   * Keys that must be present (non-null) after normalization.
   * Enforced in all dispatch paths (Phase 1, Phase 2 legacy, handler-mode).
   * Missing keys cause immediate fail-closed rejection before the leaf runs.
   */
  requiredKeys?: string[];
}

export const ACTION_CONTRACTS: Record<string, ActionContract> = {
  // --- Pattern 2 actions (currently bypass leaves) ---
  acquire_material: {
    leafName: 'acquire_material',
    aliases: { blockType: 'item' },
    defaults: { count: 1, radius: 32 },
    requiredKeys: ['item'],
  },
  place_block: {
    leafName: 'place_block',
    aliases: { block_type: 'item' },
    stripKeys: ['placement', 'count'],
    deprecatedKeys: ['placement'],
    dispatchMode: 'guarded',
    requiredKeys: ['item'],
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
    dispatchMode: 'guarded',
    // DEPRECATED: No Sterling step emits collect_items_enhanced. action-mapping
    // no longer remaps anything to it. This contract only exists for raw /action
    // endpoint callers. Track handler hits via the deprecation log in
    // executeCollectItemsEnhanced; remove contract + handler when hits reach zero.
  },
  // --- Existing routed actions (document their contracts) ---
  // craft_recipe is the canonical crafting action. Routes to CraftRecipeLeaf.
  craft_recipe: {
    leafName: 'craft_recipe',
    aliases: { item: 'recipe', quantity: 'qty' },
    defaults: { qty: 1 },
    requiredKeys: ['recipe'],
  },
  // Legacy synonyms — route to handler for backward compat with non-Sterling callers.
  // Sterling pipeline uses craft_recipe directly (no remap).
  craft: {
    leafName: 'craft_recipe',
    aliases: { item: 'recipe', quantity: 'qty' },
    defaults: { qty: 1 },
    dispatchMode: 'handler',
  },
  craft_item: {
    leafName: 'craft_recipe',
    aliases: { item: 'recipe', quantity: 'qty' },
    defaults: { qty: 1 },
    dispatchMode: 'handler',
  },
  smelt: {
    leafName: 'smelt',
    aliases: { item: 'input', quantity: 'qty' },
    defaults: { fuel: 'coal' },
    dispatchMode: 'handler',
  },
  smelt_item: {
    leafName: 'smelt',
    aliases: { item: 'input', quantity: 'qty' },
    defaults: { fuel: 'coal' },
    dispatchMode: 'handler',
  },
  collect_items: {
    leafName: 'collect_items',
    aliases: { item: 'itemName' },
    defaults: {},
  },
  sleep: { leafName: 'sleep', aliases: {}, defaults: {} },
  find_resource: { leafName: 'find_resource', aliases: {}, defaults: { radius: 32 } },
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

  // ── Sensing / read-only ──
  sense_hostiles: {
    leafName: 'sense_hostiles',
    aliases: {},
    defaults: { radius: 16 },
  },
  get_light_level: {
    leafName: 'get_light_level',
    aliases: {},
    defaults: {},
  },
  get_block_at: {
    leafName: 'get_block_at',
    aliases: {},
    defaults: {},
    requiredKeys: ['position'],
  },

  // ── Movement / liveness ──
  chat: { leafName: 'chat', aliases: {}, defaults: {} },
  wait: { leafName: 'wait', aliases: {}, defaults: {} },
  step_forward_safely: {
    leafName: 'step_forward_safely',
    aliases: {},
    defaults: { distance: 1 },
  },

  // ── Combat ──
  attack_entity: {
    leafName: 'attack_entity',
    aliases: {},
    defaults: { radius: 16, duration: 30000 },
  },
  equip_weapon: {
    leafName: 'equip_weapon',
    aliases: {},
    defaults: { preferredType: 'any' },
  },
  retreat_from_threat: {
    leafName: 'retreat_from_threat',
    aliases: {},
    defaults: { retreatDistance: 16 },
  },
  retreat_and_block: {
    leafName: 'retreat_and_block',
    aliases: {},
    defaults: { retreatDistance: 10 },
  },

  // ── Items / inventory ──
  use_item: {
    leafName: 'use_item',
    aliases: {},
    defaults: { quantity: 1 },
    requiredKeys: ['item'],
  },
  manage_inventory: {
    leafName: 'manage_inventory',
    aliases: {},
    defaults: {},
    requiredKeys: ['action'],
  },

  // ── Torch / lighting ──
  place_torch_if_needed: {
    leafName: 'place_torch_if_needed',
    aliases: {},
    defaults: { lightThreshold: 7 },
  },
  place_torch: {
    leafName: 'place_torch',
    aliases: {},
    defaults: {},
  },

  // ── Farming ──
  till_soil: {
    leafName: 'till_soil',
    aliases: {},
    defaults: { radius: 8 },
  },
  manage_farm: {
    leafName: 'manage_farm',
    aliases: {},
    defaults: { radius: 16 },
  },
  harvest_crop: {
    leafName: 'harvest_crop',
    aliases: {},
    defaults: { radius: 8 },
  },

  // ── World interaction ──
  interact_with_block: {
    leafName: 'interact_with_block',
    aliases: {},
    defaults: {},
    requiredKeys: ['position'],
  },

  // ── Phase 2 handler-mode actions (registry entries for validation + routing trace) ──
  // These use dedicated handler methods; the registry entry ensures they participate
  // in parameter normalization and routing trace instrumentation.
  dig_block: {
    leafName: 'dig_block',
    aliases: { position: 'pos' },
    defaults: { tool: 'axe' },
    // dig_block is remapped to acquire_material at the Sterling pipeline level
    // (stepToLeafExecution). This contract only applies to raw /action endpoint
    // callers. Handler is kept for backward compat with non-Sterling callers.
    dispatchMode: 'handler',
  },
  navigate: {
    leafName: 'sterling_navigate',
    aliases: {},
    defaults: {},
    dispatchMode: 'handler',
  },
  move_to: {
    leafName: 'sterling_navigate',
    aliases: {},
    defaults: {},
    dispatchMode: 'handler',
  },
  mine_block: {
    leafName: 'mine_block',
    aliases: {},
    defaults: { tool: 'pickaxe' },
    dispatchMode: 'handler',
  },
  gather_resources: {
    leafName: 'gather_resources',
    aliases: {},
    defaults: {},
    dispatchMode: 'handler',
  },
  scan_environment: {
    leafName: 'scan_environment',
    aliases: {},
    defaults: {},
    dispatchMode: 'handler',
  },
  // Emitted by Sterling solver when no observed mine targets match the goal's
  // dependency chain. The bot should explore to find the needed resources,
  // then the task will be re-planned with updated observations.
  explore_for_resources: {
    leafName: 'explore_for_resources',
    aliases: {},
    defaults: { radius: 64 },
    dispatchMode: 'handler',
  },
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
 * Semantics:
 * - **Aliases**: Source keys are renamed to canonical target keys. Source keys
 *   are always deleted from the output, even if their value is null/undefined.
 *   If both source and target are meaningfully set (non-null), the target wins
 *   and a warning is emitted.
 * - **Null-as-absent**: `null` and `undefined` are treated identically as
 *   "not provided" for alias targets and defaults injection. This means
 *   callers cannot use `null` to intentionally clear a value — it will be
 *   overwritten by aliases or defaults. Falsy-but-intentional values (`0`,
 *   `''`, `false`) are preserved.
 * - **Defaults**: Applied after aliases, only when the canonical key is
 *   null or undefined.
 * - **requiredKeys**: Checked after aliases and defaults. Every call site
 *   that consumes normalizeActionParams must check `missingKeys` and
 *   fail-closed if non-empty.
 *
 * Returns { params, warnings, missingKeys }.
 */
export function normalizeActionParams(
  actionType: string,
  params: Record<string, any>
): { params: Record<string, any>; warnings: string[]; missingKeys: string[] } {
  const contract = ACTION_CONTRACTS[actionType];
  if (!contract) return { params: { ...params }, warnings: [], missingKeys: [] };

  const normalized = { ...params };
  const warnings: string[] = [];

  // Apply aliases: rename fromKey → toKey.
  // Treat null the same as undefined (both mean "not meaningfully set").
  // If target key is meaningfully set, warn about the conflict and delete
  // the source key so only the canonical key reaches the leaf.
  for (const [fromKey, toKey] of Object.entries(contract.aliases)) {
    if (normalized[fromKey] != null) {
      if (normalized[toKey] == null) {
        normalized[toKey] = normalized[fromKey];
      } else {
        const cap = (v: unknown): string => {
          try {
            const s = typeof v === 'bigint' ? v.toString() : JSON.stringify(v);
            return s.length > 200 ? s.slice(0, 200) + '…' : s;
          } catch {
            return String(v);
          }
        };
        warnings.push(
          `alias conflict for ${actionType}: both '${fromKey}' and '${toKey}' present; using '${toKey}' = ${cap(normalized[toKey])}, dropping '${fromKey}' = ${cap(normalized[fromKey])}`
        );
      }
      delete normalized[fromKey];
    } else if (fromKey in normalized) {
      // Source key is null/undefined — can't alias from it, but delete the
      // non-canonical key so only canonical keys reach the leaf.
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

  // Apply defaults (null treated as "not provided", same as undefined)
  for (const [key, value] of Object.entries(contract.defaults ?? {})) {
    if (normalized[key] == null) {
      normalized[key] = value;
    }
  }

  // Enforce required keys (fail-closed for world-mutating actions)
  const missingKeys: string[] = [];
  for (const key of contract.requiredKeys ?? []) {
    if (normalized[key] === undefined || normalized[key] === null) {
      missingKeys.push(key);
    }
  }

  return { params: normalized, warnings, missingKeys };
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

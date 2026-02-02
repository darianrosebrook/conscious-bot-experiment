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
    defaults: { count: 1 },
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
  },
  // --- Existing routed actions (document their contracts) ---
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

/**
 * Action Contract Registry — single source of truth for action→leaf routing,
 * parameter aliasing, and deprecated key warnings.
 *
 * Per-leaf contracts (aliases, defaults, required keys, dispatch mode) derive
 * from the shared leaf manifest in `@conscious-bot/executor-contracts`.
 * This file keeps only the entries that are NOT leaf identity:
 * - raw /action endpoint legacy synonyms whose data diverges from the leaf's
 *   own contract (craft, craft_item, collect_items_enhanced), and
 * - non-leaf handler actions that never were Sterling leaves
 *   (mine_block, gather_resources, scan_environment).
 * A collision between the two sections fails fast at module load.
 */

import {
  deriveActionContracts,
  type DerivedActionContract,
} from '@conscious-bot/executor-contracts';

export type ActionContract = DerivedActionContract;

/**
 * Legacy raw /action endpoint entries that are not manifest leaf identity.
 * - craft / craft_item: legacy synonyms routing to the handler for
 *   backward compat with non-Sterling callers (the Sterling pipeline uses
 *   craft_recipe directly, which dispatches as a leaf).
 * - collect_items_enhanced: DEPRECATED — no Sterling step emits it. Only for
 *   raw /action endpoint callers. Track handler hits via the deprecation log
 *   in executeCollectItemsEnhanced; remove when hits reach zero.
 * - mine_block / gather_resources / scan_environment: handler-mode actions
 *   outside the leaf vocabulary (registry entries exist for parameter
 *   normalization and routing trace instrumentation).
 */
const LEGACY_ACTION_CONTRACTS: Record<string, ActionContract> = {
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
  collect_items_enhanced: {
    leafName: 'collect_items',
    aliases: { item: 'itemName', maxSearchTime: 'timeout' },
    stripKeys: ['exploreOnFail'],
    deprecatedKeys: ['exploreOnFail'],
    dispatchMode: 'guarded',
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
};

const MANIFEST_DERIVED_CONTRACTS = deriveActionContracts();

// Fail fast if a legacy entry shadows a manifest-derived key — the legacy
// section must only hold non-leaf action types.
for (const key of Object.keys(LEGACY_ACTION_CONTRACTS)) {
  if (key in MANIFEST_DERIVED_CONTRACTS) {
    throw new Error(
      `[action-contract-registry] legacy entry "${key}" collides with a manifest-derived contract`
    );
  }
}

/**
 * Action → contract registry. Manifest-derived leaf contracts first, then the
 * non-overlapping legacy section (raw /action endpoint synonyms + non-leaf
 * handler actions).
 */
export const ACTION_CONTRACTS: Record<string, ActionContract> = {
  ...MANIFEST_DERIVED_CONTRACTS,
  ...LEGACY_ACTION_CONTRACTS,
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

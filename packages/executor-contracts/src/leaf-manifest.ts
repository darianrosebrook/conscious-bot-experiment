/**
 * Leaf Manifest — single source of truth for capability *declarative* metadata.
 *
 * Every leaf (executable capability) and intent leaf is declared here once.
 * The registries in `planning` and `minecraft-interface` are *derived* from
 * this manifest (or cross-checked against it) so that adding a leaf is a
 * one-place edit and drift fails fast.
 *
 * Per-leaf declarative axes:
 * - `fields`   — arg contract descriptor (hashed into the leaf contract
 *                digest; validated by predicates registered in planning).
 * - `action`   — planning-side mapping: the minecraft action type emitted
 *                (default: the leaf name) and the planning poll timeout.
 *                Absent ⇒ the leaf is shadow-only (valid for arg validation,
 *                not dispatchable in live mode).
 * - `contract` — minecraft-interface registry entry: param aliases, defaults,
 *                required keys, dispatch mode. Absent ⇒ the action type is
 *                not registered on the raw /action endpoint seam.
 *
 * Execution logic (leaf implementations, custom arg transforms, legacy
 * action remaps) stays code — the manifest holds only declarative facts.
 *
 * @author @darianrosebrook
 */

export interface LeafActionMapping {
  /**
   * Action type emitted to minecraft-interface. Defaults to the leaf name.
   * Set only when the emitted type intentionally differs (e.g.
   * step_forward_safely → move_forward).
   */
  type?: string;
  /** Planning-side poll timeout (ms). Omit when the leaf's custom transform sets none. */
  timeout?: number;
}

export interface LeafActionContract {
  /**
   * Raw /action endpoint synonyms that are exact data duplicates of this
   * leaf's registry entry (e.g. smelt_item for smelt). Generated alongside
   * the leaf's own key.
   */
  legacyAliases?: string[];
  /** Parameter renames: { fromKey: toKey }. */
  aliases?: Record<string, string>;
  /** Keys to silently strip (leaf doesn't support them). */
  stripKeys?: string[];
  /** Keys that are deprecated — log a warning if present. */
  deprecatedKeys?: string[];
  /** Default values to inject if missing. */
  defaults?: Record<string, unknown>;
  /**
   * How minecraft-interface Phase 1 should dispatch this action:
   * - 'leaf': Route directly to leaf via dispatchToLeaf (default)
   * - 'handler': Always route to dedicated handler method (skips generic leaf dispatch)
   * - 'guarded': Route to leaf unless a semantic guard redirects to handler
   */
  dispatchMode?: 'leaf' | 'handler' | 'guarded';
  /**
   * Keys that must be present (non-null) after normalization.
   * Missing keys cause immediate fail-closed rejection before the leaf runs.
   */
  requiredKeys?: string[];
  /**
   * minecraft-interface routing target when the action type does not dispatch
   * to a same-named leaf (e.g. move_to routes to the sterling_navigate handler).
   */
  routesTo?: string;
}

/** Registry entry shape derived from the manifest (consumed by minecraft-interface). */
export interface DerivedActionContract {
  /** Routing target: the leaf name, or `routesTo` when overridden. */
  leafName: string;
  aliases: Record<string, string>;
  stripKeys?: string[];
  deprecatedKeys?: string[];
  defaults?: Record<string, unknown>;
  dispatchMode?: 'leaf' | 'handler' | 'guarded';
  requiredKeys?: string[];
}

export interface LeafManifestEntry {
  /** Leaf name, e.g. "hunt_animal". */
  name: string;
  /** True for `task_type_*` intent leaves (Sterling expand-by-digest). */
  intent?: boolean;
  /** Arg contract fields descriptor: `["fieldName:type", ...]`, '?' = optional. */
  fields?: string[];
  /** Planning-side action mapping. Absent ⇒ shadow-only. */
  action?: LeafActionMapping;
  /** minecraft-interface registry entry. Absent ⇒ not registered on /action seam. */
  contract?: LeafActionContract;
}

/**
 * Canonical leaf manifest.
 *
 * Executable leaves: `intent` is unset; `fields` is required; `action` present
 * iff dispatchable (otherwise shadow-only). Intent leaves set `intent: true`
 * and carry no fields/action/contract.
 */
export const LEAF_MANIFEST: readonly LeafManifestEntry[] = [
  // ── Intent leaves (non-executable, Sterling expand-by-digest) ────────────
  { name: 'task_type_craft', intent: true },
  { name: 'task_type_mine', intent: true },
  { name: 'task_type_explore', intent: true },
  { name: 'task_type_navigate', intent: true },
  { name: 'task_type_build', intent: true },
  { name: 'task_type_collect', intent: true },
  { name: 'task_type_gather', intent: true },
  { name: 'task_type_attack', intent: true },
  { name: 'task_type_find', intent: true },
  { name: 'task_type_check', intent: true },

  // ── Executable leaves ────────────────────────────────────────────────────
  {
    name: 'acquire_material',
    fields: ['item:string', '?count:number'],
    action: {},
    contract: {
      aliases: { blockType: 'item' },
      defaults: { count: 1, radius: 32 },
      requiredKeys: ['item'],
    },
  },
  {
    name: 'attack_entity',
    fields: [
      '?entityId:string',
      '?radius:number',
      '?duration:number',
      '?retreatHealth:number',
    ],
    action: { timeout: 60_000 },
    contract: { defaults: { radius: 16, duration: 30_000 } },
  },
  {
    name: 'build_module',
    fields: ['moduleId:string'],
    contract: {},
  },
  {
    name: 'building_step',
    fields: ['moduleId:string'],
  },
  {
    name: 'chat',
    fields: ['?message:string'],
    action: { timeout: 5000 },
    contract: {},
  },
  {
    name: 'collect_items',
    fields: ['?itemName:string'],
    action: {},
    contract: { aliases: { item: 'itemName' } },
  },
  {
    name: 'consume_food',
    fields: ['?food_type:string', '?amount:number'],
    action: { timeout: 15_000 },
    contract: { defaults: { food_type: 'any', amount: 1 } },
  },
  {
    name: 'craft_recipe',
    fields: ['recipe:string', '?qty:number'],
    action: {},
    contract: {
      aliases: { item: 'recipe', quantity: 'qty' },
      defaults: { qty: 1 },
      requiredKeys: ['recipe'],
    },
  },
  {
    name: 'dig_block',
    fields: ['?blockType:string', '?pos:any'],
    action: {},
    contract: {
      aliases: { position: 'pos' },
      defaults: { tool: 'axe' },
      // dig_block is remapped to acquire_material at the Sterling pipeline level
      // (stepToLeafExecution). The handler contract only applies to raw /action
      // endpoint callers, kept for backward compat with non-Sterling callers.
      dispatchMode: 'handler',
    },
  },
  {
    name: 'equip_tool',
    fields: ['?material:string', '?toolType:string', '?fallbackToHand:any'],
    action: { timeout: 5000 },
    contract: {},
  },
  {
    name: 'equip_weapon',
    fields: ['?preferredType:string', '?fallbackToHand:any'],
    action: { timeout: 5000 },
    contract: { defaults: { preferredType: 'any' } },
  },
  {
    name: 'explore_for_resources',
    fields: ['?resource_tags:any', '?goal_item:string', '?reason:string'],
    action: { timeout: 30_000 },
    contract: { defaults: { radius: 64 }, dispatchMode: 'handler' },
  },
  {
    name: 'find_resource',
    fields: [
      'blockType:string',
      '?radius:number',
      '?maxResults:number',
      '?partialMatch:any',
    ],
    action: { timeout: 10_000 },
    contract: { defaults: { radius: 32 } },
  },
  {
    name: 'get_block_at',
    fields: ['position:any'],
    action: { timeout: 10_000 },
    contract: { requiredKeys: ['position'] },
  },
  {
    name: 'get_light_level',
    fields: ['?position:any'],
    action: { timeout: 10_000 },
    contract: {},
  },
  {
    name: 'harvest_crop',
    fields: ['?position:any', '?radius:number'],
    action: { timeout: 15_000 },
    contract: { defaults: { radius: 8 } },
  },
  {
    name: 'hunt_animal',
    fields: ['?animal_type:string', '?radius:number'],
    action: { timeout: 60_000 },
    contract: { defaults: { animal_type: 'any', radius: 32 } },
  },
  {
    name: 'interact_with_block',
    fields: ['position:any', '?interactionType:string', '?radius:number'],
    action: { timeout: 10_000 },
    contract: { requiredKeys: ['position'] },
  },
  {
    name: 'interact_with_entity',
    fields: ['entityType:string', '?entityId:string', '?entityPosition:any'],
  },
  {
    name: 'introspect_recipe',
    fields: ['output:string'],
    action: { timeout: 10_000 },
    contract: {},
  },
  {
    name: 'manage_farm',
    fields: ['?action:string', '?cropType:string', '?radius:number'],
    action: { timeout: 30_000 },
    contract: { defaults: { radius: 16 } },
  },
  {
    name: 'manage_inventory',
    fields: ['action:string', '?keepItems:any'],
    action: { timeout: 15_000 },
    contract: { requiredKeys: ['action'] },
  },
  {
    name: 'move_to',
    fields: ['?target:any', '?pos:any', '?distance:number'],
    action: {},
    contract: { routesTo: 'sterling_navigate', legacyAliases: ['navigate'], dispatchMode: 'handler' },
  },
  {
    name: 'open_container',
    fields: ['?containerType:string', '?position:any'],
    action: { timeout: 10_000 },
  },
  {
    name: 'place_block',
    fields: ['item:string'],
    action: {},
    contract: {
      aliases: { block_type: 'item' },
      stripKeys: ['placement', 'count'],
      deprecatedKeys: ['placement'],
      dispatchMode: 'guarded',
      requiredKeys: ['item'],
    },
  },
  {
    name: 'place_feature',
    fields: ['moduleId:string'],
    contract: {},
  },
  {
    name: 'place_torch',
    fields: ['?position:any'],
    action: { timeout: 5000 },
    contract: {},
  },
  {
    name: 'place_torch_if_needed',
    fields: ['?lightThreshold:number', '?position:any'],
    action: { timeout: 15_000 },
    contract: { defaults: { lightThreshold: 7 } },
  },
  {
    name: 'place_workstation',
    fields: ['workstation:string'],
    action: {},
    contract: {},
  },
  {
    name: 'prepare_site',
    fields: ['moduleId:string'],
    contract: {},
  },
  {
    name: 'replan_building',
    fields: ['templateId:string'],
  },
  {
    name: 'replan_exhausted',
    fields: ['templateId:string'],
  },
  {
    name: 'retreat_and_block',
    fields: ['?retreatDistance:number', '?blockType:string'],
    action: { timeout: 15_000 },
    contract: { defaults: { retreatDistance: 10 } },
  },
  {
    name: 'retreat_from_threat',
    fields: ['?retreatDistance:number', '?safeRadius:number'],
    action: { timeout: 15_000 },
    contract: { defaults: { retreatDistance: 16 } },
  },
  {
    name: 'sense_hostiles',
    fields: ['?radius:number', '?includePassive:any'],
    action: { timeout: 10_000 },
    contract: { defaults: { radius: 16 } },
  },
  {
    name: 'sleep',
    fields: [],
    action: { timeout: 15_000 },
    contract: {},
  },
  {
    name: 'smelt',
    fields: ['input:string'],
    action: {},
    contract: {
      aliases: { item: 'input', quantity: 'qty' },
      defaults: { fuel: 'coal' },
      dispatchMode: 'handler',
      legacyAliases: ['smelt_item'],
    },
  },
  {
    name: 'step_forward_safely',
    fields: ['?distance:number'],
    action: { type: 'move_forward', timeout: 5000 },
    contract: { defaults: { distance: 1 } },
  },
  {
    name: 'till_soil',
    fields: ['?position:any', '?radius:number'],
    action: { timeout: 15_000 },
    contract: { defaults: { radius: 8 } },
  },
  {
    name: 'use_item',
    fields: ['item:string', '?quantity:number', '?hand:string'],
    action: { timeout: 10_000 },
    contract: { defaults: { quantity: 1 }, requiredKeys: ['item'] },
  },
  {
    name: 'verify_module',
    fields: ['moduleId:string', 'witness:object'],
  },
  {
    name: 'wait',
    fields: ['?duration:number'],
    action: {},
    contract: {},
  },
];

/** Executable (non-intent) leaf names. */
export function deriveKnownLeaves(): ReadonlySet<string> {
  return new Set(
    LEAF_MANIFEST.filter((e) => !e.intent).map((e) => e.name)
  );
}

/** Intent leaf names (`task_type_*`). */
export function deriveIntentLeaves(): ReadonlySet<string> {
  return new Set(
    LEAF_MANIFEST.filter((e) => e.intent).map((e) => e.name)
  );
}

/**
 * Executable leaves that have a contract but no action mapping yet
 * (shadow-only: valid for arg validation, not dispatchable in live mode).
 * Derived: an executable leaf is shadow-only iff it has no `action` entry.
 */
export function deriveShadowOnlyLeaves(): ReadonlySet<string> {
  return new Set(
    LEAF_MANIFEST.filter((e) => !e.intent && !e.action).map((e) => e.name)
  );
}

/**
 * Leaf contract entries as `[leafName, fields]` pairs for digest computation.
 * The fields array is the structural descriptor used by computeLeafContractDigest
 * to detect contract changes (not just leaf name changes).
 */
export function deriveLeafContractEntries(): Array<[string, string[]]> {
  return LEAF_MANIFEST.filter((e) => !e.intent && e.fields).map(
    (e) => [e.name, e.fields as string[]] as [string, string[]]
  );
}

/** Planning-side action mappings keyed by leaf name (dispatchable leaves only). */
export function deriveLeafActionMappings(): ReadonlyMap<string, LeafActionMapping> {
  const map = new Map<string, LeafActionMapping>();
  for (const entry of LEAF_MANIFEST) {
    if (!entry.intent && entry.action) map.set(entry.name, entry.action);
  }
  return map;
}

/**
 * minecraft-interface registry entries derived from the manifest, keyed by
 * action type (leaf name + declared legacyAliases). Entries for leaves without
 * a `contract` are omitted — those action types are not registered on the
 * raw /action endpoint seam.
 */
export function deriveActionContracts(): Record<string, DerivedActionContract> {
  const registry: Record<string, DerivedActionContract> = {};
  for (const entry of LEAF_MANIFEST) {
    if (entry.intent || !entry.contract) continue;
    const derived: DerivedActionContract = {
      leafName: entry.contract.routesTo ?? entry.name,
      aliases: entry.contract.aliases ?? {},
      ...(entry.contract.stripKeys ? { stripKeys: entry.contract.stripKeys } : {}),
      ...(entry.contract.deprecatedKeys
        ? { deprecatedKeys: entry.contract.deprecatedKeys }
        : {}),
      ...(entry.contract.defaults ? { defaults: entry.contract.defaults } : {}),
      ...(entry.contract.dispatchMode
        ? { dispatchMode: entry.contract.dispatchMode }
        : {}),
      ...(entry.contract.requiredKeys
        ? { requiredKeys: entry.contract.requiredKeys }
        : {}),
    };
    registry[entry.name] = derived;
    for (const alias of entry.contract.legacyAliases ?? []) {
      registry[alias] = derived;
    }
  }
  return registry;
}

/**
 * Self-consistency checks for the manifest.
 * Returns a list of violations (empty = valid).
 */
export function validateLeafManifest(): string[] {
  const violations: string[] = [];
  const seen = new Set<string>();

  for (const entry of LEAF_MANIFEST) {
    if (!entry.name) {
      violations.push('manifest entry with empty name');
      continue;
    }
    if (seen.has(entry.name)) {
      violations.push(`duplicate leaf "${entry.name}"`);
    }
    seen.add(entry.name);

    if (entry.intent) {
      if (entry.fields) {
        violations.push(`intent leaf "${entry.name}" must not carry fields`);
      }
      if (entry.action) {
        violations.push(`intent leaf "${entry.name}" must not carry an action mapping`);
      }
      if (entry.contract) {
        violations.push(`intent leaf "${entry.name}" must not carry a contract`);
      }
      continue;
    }

    if (!entry.fields) {
      violations.push(`executable leaf "${entry.name}" is missing its fields descriptor`);
    } else if (
      !Array.isArray(entry.fields) ||
      entry.fields.some((f) => typeof f !== 'string')
    ) {
      violations.push(`leaf "${entry.name}" has a malformed fields descriptor`);
    }

    if (entry.action) {
      if (entry.action.type !== undefined && entry.action.type !== '') {
        if (typeof entry.action.type !== 'string') {
          violations.push(`leaf "${entry.name}" action.type must be a string`);
        }
      }
      if (
        entry.action.timeout !== undefined &&
        (typeof entry.action.timeout !== 'number' ||
          !Number.isFinite(entry.action.timeout) ||
          entry.action.timeout <= 0)
      ) {
        violations.push(`leaf "${entry.name}" action.timeout must be a positive number`);
      }
    }
  }

  return violations;
}

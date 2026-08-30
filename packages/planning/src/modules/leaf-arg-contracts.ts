/**
 * Canonical leaf arg contracts — validates args shape before execution.
 *
 * The `fields` descriptors live in the shared leaf manifest
 * (`@conscious-bot/executor-contracts`); this module registers the custom
 * `validate()` predicates, which stay code because their error messages and
 * cross-field rules are behavioral. A leaf must be declared in the manifest;
 * the cross-check test fails if the predicate registry and the manifest
 * disagree.
 */

import { mapBTActionToMinecraft } from './action-mapping';
import {
  deriveKnownLeaves,
  deriveIntentLeaves,
  deriveLeafContractEntries,
  LEAF_MANIFEST,
} from '@conscious-bot/executor-contracts';

/** Registered args validator: null if valid, error string if invalid. */
export type LeafArgsValidator = (args: Record<string, unknown>) => string | null;

export interface LeafArgContract {
  leafName: string;
  /** Validates args shape. Returns null if valid, error string if invalid. */
  validate: LeafArgsValidator;
  /**
   * Structural descriptor of required/optional fields for contract hashing.
 * Used by computeLeafRegistryDigest to detect contract changes.
   * Format: `["fieldName:type", ...]` where type is 'string' | 'number' | 'any'.
   * Prefix with '?' for optional: `"?fieldName:type"`.
   * Derived from the shared leaf manifest.
   */
  fields: string[];
}

/**
 * Args validators keyed by leaf name. Every executable manifest leaf must
 * appear here exactly once — enforced by validateArgContractCoverage().
 */
const LEAF_ARG_VALIDATORS: Record<string, LeafArgsValidator> = {
  dig_block: (args) => {
    if (!args.blockType && !args.pos)
      return 'dig_block requires blockType or pos';
    return null;
  },
  craft_recipe: (args) => {
    if (!args.recipe || typeof args.recipe !== 'string')
      return 'craft_recipe requires recipe (string)';
    return null;
  },
  smelt: (args) => {
    if (!args.input || typeof args.input !== 'string')
      return 'smelt requires input (string)';
    return null;
  },
  place_block: (args) => {
    if (!args.item || typeof args.item !== 'string')
      return 'place_block requires item (string)';
    return null;
  },
  place_workstation: (args) => {
    if (!args.workstation || typeof args.workstation !== 'string')
      return 'place_workstation requires workstation (string)';
    const valid = ['crafting_table', 'furnace', 'blast_furnace'];
    if (!valid.includes(args.workstation as string))
      return `place_workstation: unknown workstation '${args.workstation}'`;
    return null;
  },
  build_module: (args) => {
    if (!args.moduleId || typeof args.moduleId !== 'string')
      return 'build_module requires moduleId (string)';
    return null;
  },
  acquire_material: (args) => {
    if (!args.item || typeof args.item !== 'string')
      return 'acquire_material requires item (string)';
    return null;
  },
  replan_building: (args) => {
    if (!args.templateId || typeof args.templateId !== 'string')
      return 'replan_building requires templateId (string)';
    return null;
  },
  replan_exhausted: (args) => {
    if (!args.templateId || typeof args.templateId !== 'string')
      return 'replan_exhausted requires templateId (string)';
    return null;
  },
  prepare_site: (args) => {
    if (!args.moduleId || typeof args.moduleId !== 'string')
      return 'prepare_site requires moduleId (string)';
    return null;
  },
  place_feature: (args) => {
    if (!args.moduleId || typeof args.moduleId !== 'string')
      return 'place_feature requires moduleId (string)';
    return null;
  },
  verify_module: (args) => {
    if (!args.moduleId || typeof args.moduleId !== 'string')
      return 'verify_module requires moduleId (string)';
    if (!args.witness || typeof args.witness !== 'object')
      return 'verify_module requires witness (object with expectedPlacements)';
    return null;
  },
  building_step: (args) => {
    if (!args.moduleId || typeof args.moduleId !== 'string')
      return 'building_step requires moduleId (string)';
    return null;
  },
  collect_items: (args) => {
    if (args.itemName !== undefined && typeof args.itemName !== 'string')
      return 'collect_items: itemName must be a string if provided';
    return null;
  },
  interact_with_entity: (args) => {
    if (!args.entityType || typeof args.entityType !== 'string')
      return 'interact_with_entity requires entityType (string)';
    // entityId/entityPosition optional — leaf resolves nearest matching entity at runtime.
    // At planning time (acquisition solver), only entityType is known.
    return null;
  },
  open_container: (_args) => {
    // containerType and position both optional — leaf resolves nearest container at runtime.
    // If neither provided, defaults to containerType='chest'.
    return null;
  },

  // ── Smoke-test / liveness leaves ──
  chat: (args) => {
    if (args.message !== undefined && typeof args.message !== 'string')
      return 'chat: message must be a string';
    if (typeof args.message === 'string' && args.message.length > 256)
      return 'chat: message exceeds 256 characters';
    return null;
  },
  wait: (args) => {
    if (args.duration !== undefined) {
      if (typeof args.duration !== 'number')
        return 'wait: duration must be a number';
      if (args.duration < 0 || args.duration > 30_000)
        return 'wait: duration must be 0-30000 ms';
    }
    return null;
  },
  step_forward_safely: (args) => {
    if (args.distance !== undefined) {
      if (typeof args.distance !== 'number')
        return 'step_forward_safely: distance must be a number';
      if (args.distance < 0 || args.distance > 20)
        return 'step_forward_safely: distance must be 0-20 blocks';
    }
    return null;
  },
  move_to: (_args) => {
    // move_to accepts target OR pos OR just distance for relative movement
    // action-mapping falls back to 'exploration_target' if neither provided
    return null;
  },

  // ── Sensing / read-only leaves ──
  sense_hostiles: () => null,
  get_light_level: () => null,
  get_block_at: (args) => (args.position ? null : 'get_block_at requires position'),
  find_resource: (args) => {
    if (!args.blockType || typeof args.blockType !== 'string')
      return 'find_resource requires blockType (string)';
    return null;
  },
  introspect_recipe: (args) => {
    if (!args.output || typeof args.output !== 'string')
      return 'introspect_recipe requires output (string)';
    return null;
  },

  // ── Survival / consumable leaves ──
  consume_food: () => null,
  sleep: () => null,

  // ── Torch / lighting ──
  place_torch_if_needed: () => null,
  place_torch: () => null,

  // ── Combat leaves ──
  attack_entity: () => null,
  hunt_animal: () => null,
  equip_weapon: () => null,
  retreat_from_threat: () => null,
  retreat_and_block: () => null,

  // ── Equipment leaves ──
  equip_tool: () => null,

  // ── Item / inventory leaves ──
  use_item: (args) => {
    if (!args.item || typeof args.item !== 'string')
      return 'use_item requires item (string)';
    return null;
  },
  manage_inventory: (args) => {
    if (!args.action || typeof args.action !== 'string')
      return 'manage_inventory requires action (string)';
    const validActions = ['sort', 'compact', 'drop_unwanted', 'keep_essentials', 'organize'];
    if (!validActions.includes(args.action as string))
      return `manage_inventory: action must be one of ${validActions.join(', ')}`;
    return null;
  },

  // ── Farming leaves ──
  till_soil: () => null,
  manage_farm: () => null,
  harvest_crop: () => null,

  // ── World interaction ──
  interact_with_block: (args) => {
    if (args.position === undefined || args.position === null)
      return 'interact_with_block requires position';
    return null;
  },

  // ── Perception-driven exploration ──
  // Emitted by the solver when no observed mine targets match the goal's
  // dependency chain. The bot must explore/look to find the needed resources
  // before re-planning.
  explore_for_resources: () => null,
};

/** Manifest-derived fields descriptors keyed by leaf name (built once). */
const FIELDS_BY_LEAF: ReadonlyMap<string, string[]> = new Map(
  deriveLeafContractEntries()
);

/** Assembled contract for a leaf: manifest fields + registered validator. */
function assembleContract(leafName: string): LeafArgContract | null {
  const fields = FIELDS_BY_LEAF.get(leafName);
  const validate = LEAF_ARG_VALIDATORS[leafName];
  if (!fields || !validate) return null;
  return { leafName, validate, fields };
}

/**
 * Canonical set of executable leaves the executor may dispatch.
 * Derived from the shared leaf manifest (single source of truth); intent-level
 * leaves (task_type_*) are NOT in this set — see INTENT_LEAVES.
 */
export const KNOWN_LEAVES: Set<string> = new Set(deriveKnownLeaves());

/**
 * Returns leaf contract entries as `[leafName, fields]` pairs for digest computation.
 * Derived from the shared leaf manifest; the fields array is the structural
 * descriptor used by computeLeafRegistryDigest to detect contract changes
 * (not just leaf name changes).
 */
export function getLeafContractEntries(): Array<[string, string[]]> {
  return deriveLeafContractEntries();
}

/**
 * Cross-checks the args validator registry against the shared leaf manifest.
 * Returns a list of violations (empty = consistent).
 * - every executable manifest leaf must have a registered validator
 * - every registered validator must belong to an executable manifest leaf
 */
export function validateArgContractCoverage(): string[] {
  const violations: string[] = [];
  for (const entry of LEAF_MANIFEST) {
    if (entry.intent) continue;
    if (!LEAF_ARG_VALIDATORS[entry.name]) {
      violations.push(`executable leaf "${entry.name}" has no registered args validator`);
    }
  }
  const executable = deriveKnownLeaves();
  for (const leafName of Object.keys(LEAF_ARG_VALIDATORS)) {
    if (!executable.has(leafName)) {
      violations.push(`args validator "${leafName}" is not an executable manifest leaf`);
    }
  }
  return violations;
}

// ============================================================================
// Intent Leaves (non-executable, audit/shadow only)
// ============================================================================

/**
 * Intent-level leaves from Sterling expand-by-digest. These carry proposition
 * metadata (lemma, proposition_id, routing_domain) and are NOT dispatchable
 * by the executor. They exist for shadow recording and audit trail only.
 *
 * Structurally separate from KNOWN_LEAVES to prevent intent labels from
 * masquerading as executable leaves in the executor pipeline.
 */
/** Intent leaves (task_type_*) — derived from the shared leaf manifest. */
export const INTENT_LEAVES: Set<string> = new Set(deriveIntentLeaves());

/** Returns true if the leaf is a recognized intent leaf (not executable). */
export function isIntentLeaf(leafName: string): boolean {
  return INTENT_LEAVES.has(leafName);
}

/** Normalize legacy arg shapes to canonical form before validation.
 *  Mutates the args object in place. Call before validateLeafArgs. */
export function normalizeLeafArgs(
  leafName: string,
  args: Record<string, unknown>
): void {
  // smelt: item → input (legacy Sterling output)
  if (leafName === 'smelt' && !args.input && typeof args.item === 'string') {
    args.input = args.item;
    delete args.item;
  }
  // collect_items: item → itemName (aligns with action-contract-registry)
  if (
    leafName === 'collect_items' &&
    !args.itemName &&
    typeof args.item === 'string'
  ) {
    args.itemName = args.item;
    delete args.item;
  }
}

/** Returns null if leaf+args are valid, error string otherwise.
 *  strictMode=true rejects unknown leaves (use at execution boundary). */
export function validateLeafArgs(
  leafName: string,
  args: Record<string, unknown>,
  strictMode = false
): string | null {
  const contract = assembleContract(leafName);
  if (!contract) {
    if (strictMode) {
      if (INTENT_LEAVES.has(leafName)) {
        return `intent leaf '${leafName}' is not executable — intent leaves (task_type_*) cannot be dispatched; they require translation to an executable leaf`;
      }
      return `unknown leaf '${leafName}' — no execution contract registered (strict mode). Declare the leaf in the executor-contracts leaf manifest and register its args validator in leaf-arg-contracts.ts`;
    }
    return null;
  }
  return contract.validate(args);
}

/**
 * Checks if a step would dispatch successfully in live-mode executor.
 * Runs the same validation chain as sterling-step-executor gates 9-16:
 *   1. Intent leaf check (gate 9)
 *   2. Arg normalization + validation (gate 9, strict mode)
 *   3. Action mapping (gate 16, strict mode)
 *
 * Used by materializeSterlingIrSteps to validate post-resolution steps
 * at ingest time, ensuring `outcome: 'ok'` only when ALL steps would
 * dispatch successfully in live mode.
 */
export function isStepDispatchable(
  leaf: string,
  args: Record<string, unknown>
): { ok: true } | { ok: false; reason: string } {
  // Gate 9: intent leaf check — intent leaves are not executable
  if (isIntentLeaf(leaf)) {
    return { ok: false, reason: `intent leaf '${leaf}' is not executable` };
  }

  // Gate 9: arg validation (with normalization, same as executor)
  const argsCopy = { ...args };
  normalizeLeafArgs(leaf, argsCopy);
  const validationError = validateLeafArgs(leaf, argsCopy, true);
  if (validationError) {
    return { ok: false, reason: validationError };
  }

  // Gate 16: action mapping (executor's toolExecutor.execute uses this)
  const mapped = mapBTActionToMinecraft(`minecraft.${leaf}`, argsCopy, { strict: true });
  if (!mapped) {
    return { ok: false, reason: `no action mapping for leaf '${leaf}'` };
  }

  return { ok: true };
}

/** Maps requirement → validated leaf step metadata. Returns null if no valid mapping exists. */
export function requirementToLeafMeta(requirement: {
  kind: string;
  patterns?: string[];
  outputPattern?: string;
  structure?: string;
  quantity?: number;
}): { leaf: string; args: Record<string, unknown> } | null {
  switch (requirement.kind) {
    case 'collect':
    case 'mine': {
      const blockType = requirement.patterns?.[0];
      if (!blockType) return null;
      const args = { item: blockType, count: requirement.quantity || 1 };
      const err = validateLeafArgs('acquire_material', args);
      return err ? null : { leaf: 'acquire_material', args };
    }
    case 'craft': {
      const recipe = requirement.outputPattern;
      if (!recipe) return null;
      const args = { recipe, qty: requirement.quantity || 1 };
      const err = validateLeafArgs('craft_recipe', args);
      return err ? null : { leaf: 'craft_recipe', args };
    }
    case 'build': {
      const moduleId = requirement.structure;
      if (!moduleId) return null;
      const args = { moduleId };
      const err = validateLeafArgs('build_module', args);
      return err ? null : { leaf: 'build_module', args };
    }
    default:
      return null;
  }
}

/** Maps requirement → fallback plan steps. Returns null if no valid mapping exists.
 *  Collect/mine plans emit acquire_material steps (atomic dig + pickup).
 *  Craft plans are single-step (craft only); the executor's prereq injection
 *  handles missing materials via recipe introspection at execution time. */
export function requirementToFallbackPlan(requirement: {
  kind: string;
  patterns?: string[];
  outputPattern?: string;
  structure?: string;
  quantity?: number;
}): Array<{
  leaf: string;
  args: Record<string, unknown>;
  label: string;
}> | null {
  if (requirement.kind === 'collect' || requirement.kind === 'mine') {
    const blockType = requirement.patterns?.[0];
    if (!blockType) return null;
    const maxSteps = 8;
    const desired = requirement.quantity || 1;
    const count = Math.max(1, Math.min(desired, maxSteps));
    const acquireArgs = { item: blockType, count: 1 };
    if (validateLeafArgs('acquire_material', acquireArgs)) return null;
    const verb = requirement.kind === 'mine' ? 'Mine' : 'Gather';
    const steps: Array<{
      leaf: string;
      args: Record<string, unknown>;
      label: string;
    }> = [];
    for (let idx = 0; idx < count; idx++) {
      const suffix = count > 1 ? ` (${idx + 1}/${count})` : '';
      steps.push({
        leaf: 'acquire_material',
        args: { item: blockType, count: 1 },
        label: `${verb} ${blockType}${suffix}`,
      });
    }
    return steps;
  }

  if (requirement.kind === 'craft') {
    const recipe = requirement.outputPattern;
    if (!recipe) return null;
    const craftArgs = { recipe, qty: requirement.quantity || 1 };
    if (validateLeafArgs('craft_recipe', craftArgs)) return null;
    return [
      { leaf: 'craft_recipe', args: craftArgs, label: `Craft ${recipe}` },
    ];
  }

  if (requirement.kind === 'build') {
    const moduleId = requirement.structure;
    if (!moduleId) return null;
    const args = { moduleId };
    if (validateLeafArgs('build_module', args)) return null;
    return [{ leaf: 'build_module', args, label: `Build ${moduleId}` }];
  }

  return null;
}

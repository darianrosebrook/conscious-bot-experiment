/**
 * Canonical leaf arg contracts — single source of truth for fallback planning.
 *
 * Validates args shape before execution and maps resolved requirements
 * to valid leaf step metadata.
 */

import { mapBTActionToMinecraft } from './action-mapping';

export interface LeafArgContract {
  leafName: string;
  /** Validates args shape. Returns null if valid, error string if invalid. */
  validate(args: Record<string, unknown>): string | null;
  /**
   * Structural descriptor of required/optional fields for contract hashing.
   * Used by computeLeafRegistryDigest to detect contract changes.
   * Format: `["fieldName:type", ...]` where type is 'string' | 'number' | 'any'.
   * Prefix with '?' for optional: `"?fieldName:type"`.
   */
  fields: string[];
}

const CONTRACTS: Record<string, LeafArgContract> = {
  dig_block: {
    leafName: 'dig_block',
    fields: ['?blockType:string', '?pos:any'],
    validate: (args) => {
      if (!args.blockType && !args.pos)
        return 'dig_block requires blockType or pos';
      return null;
    },
  },
  craft_recipe: {
    leafName: 'craft_recipe',
    fields: ['recipe:string', '?qty:number'],
    validate: (args) => {
      if (!args.recipe || typeof args.recipe !== 'string')
        return 'craft_recipe requires recipe (string)';
      return null;
    },
  },
  smelt: {
    leafName: 'smelt',
    fields: ['input:string'],
    validate: (args) => {
      if (!args.input || typeof args.input !== 'string')
        return 'smelt requires input (string)';
      return null;
    },
  },
  place_block: {
    leafName: 'place_block',
    fields: ['item:string'],
    validate: (args) => {
      if (!args.item || typeof args.item !== 'string')
        return 'place_block requires item (string)';
      return null;
    },
  },
  place_workstation: {
    leafName: 'place_workstation',
    fields: ['workstation:string'],
    validate: (args) => {
      if (!args.workstation || typeof args.workstation !== 'string')
        return 'place_workstation requires workstation (string)';
      const valid = ['crafting_table', 'furnace', 'blast_furnace'];
      if (!valid.includes(args.workstation as string))
        return `place_workstation: unknown workstation '${args.workstation}'`;
      return null;
    },
  },
  build_module: {
    leafName: 'build_module',
    fields: ['moduleId:string'],
    validate: (args) => {
      if (!args.moduleId || typeof args.moduleId !== 'string')
        return 'build_module requires moduleId (string)';
      return null;
    },
  },
  acquire_material: {
    leafName: 'acquire_material',
    fields: ['item:string', '?count:number'],
    validate: (args) => {
      if (!args.item || typeof args.item !== 'string')
        return 'acquire_material requires item (string)';
      return null;
    },
  },
  replan_building: {
    leafName: 'replan_building',
    fields: ['templateId:string'],
    validate: (args) => {
      if (!args.templateId || typeof args.templateId !== 'string')
        return 'replan_building requires templateId (string)';
      return null;
    },
  },
  replan_exhausted: {
    leafName: 'replan_exhausted',
    fields: ['templateId:string'],
    validate: (args) => {
      if (!args.templateId || typeof args.templateId !== 'string')
        return 'replan_exhausted requires templateId (string)';
      return null;
    },
  },
  prepare_site: {
    leafName: 'prepare_site',
    fields: ['moduleId:string'],
    validate: (args) => {
      if (!args.moduleId || typeof args.moduleId !== 'string')
        return 'prepare_site requires moduleId (string)';
      return null;
    },
  },
  place_feature: {
    leafName: 'place_feature',
    fields: ['moduleId:string'],
    validate: (args) => {
      if (!args.moduleId || typeof args.moduleId !== 'string')
        return 'place_feature requires moduleId (string)';
      return null;
    },
  },
  building_step: {
    leafName: 'building_step',
    fields: ['moduleId:string'],
    validate: (args) => {
      if (!args.moduleId || typeof args.moduleId !== 'string')
        return 'building_step requires moduleId (string)';
      return null;
    },
  },
  collect_items: {
    leafName: 'collect_items',
    fields: ['?itemName:string'],
    validate: (args) => {
      if (args.itemName !== undefined && typeof args.itemName !== 'string')
        return 'collect_items: itemName must be a string if provided';
      return null;
    },
  },
  interact_with_entity: {
    leafName: 'interact_with_entity',
    fields: ['entityType:string', '?entityId:string', '?entityPosition:any'],
    validate: (args) => {
      if (!args.entityType || typeof args.entityType !== 'string')
        return 'interact_with_entity requires entityType (string)';
      if (!args.entityId && !args.entityPosition)
        return 'interact_with_entity requires entityId or entityPosition';
      return null;
    },
  },
  open_container: {
    leafName: 'open_container',
    fields: ['?containerType:string', '?position:any'],
    validate: (args) => {
      if (!args.containerType && !args.position)
        return 'open_container requires containerType or position';
      return null;
    },
  },

  // ── Smoke-test / liveness leaves ──
  // These have action mappings and are used for basic executor proofs.
  chat: {
    leafName: 'chat',
    fields: ['?message:string'],
    validate: (args) => {
      if (args.message !== undefined && typeof args.message !== 'string')
        return 'chat: message must be a string';
      if (typeof args.message === 'string' && args.message.length > 256)
        return 'chat: message exceeds 256 characters';
      return null;
    },
  },
  wait: {
    leafName: 'wait',
    fields: ['?duration:number'],
    validate: (args) => {
      if (args.duration !== undefined) {
        if (typeof args.duration !== 'number')
          return 'wait: duration must be a number';
        if (args.duration < 0 || args.duration > 30_000)
          return 'wait: duration must be 0-30000 ms';
      }
      return null;
    },
  },
  step_forward_safely: {
    leafName: 'step_forward_safely',
    fields: ['?distance:number'],
    validate: (args) => {
      if (args.distance !== undefined) {
        if (typeof args.distance !== 'number')
          return 'step_forward_safely: distance must be a number';
        if (args.distance < 0 || args.distance > 20)
          return 'step_forward_safely: distance must be 0-20 blocks';
      }
      return null;
    },
  },
  move_to: {
    leafName: 'move_to',
    fields: ['?target:any', '?pos:any', '?distance:number'],
    validate: (args) => {
      // move_to accepts target OR pos OR just distance for relative movement
      // action-mapping falls back to 'exploration_target' if neither provided
      return null;
    },
  },
};

/** Canonical set of executable leaves the executor may dispatch. Unknown leaves are rejected in strict mode.
 *  Intent-level leaves (task_type_*) are NOT in this set — see INTENT_LEAVES. */
export const KNOWN_LEAVES = new Set(Object.keys(CONTRACTS));

/**
 * Returns leaf contract entries as `[leafName, fields]` pairs for digest computation.
 * The fields array is the structural descriptor used by computeLeafRegistryDigest
 * to detect contract changes (not just leaf name changes).
 */
export function getLeafContractEntries(): Array<[string, string[]]> {
  return Object.entries(CONTRACTS).map(([name, contract]) => [name, contract.fields]);
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
export const INTENT_LEAVES = new Set<string>([
  'task_type_craft',
  'task_type_mine',
  'task_type_explore',
  'task_type_navigate',
  'task_type_build',
  'task_type_collect',
  'task_type_gather',
  'task_type_attack',
  'task_type_find',
  'task_type_check',
]);

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
  const contract = CONTRACTS[leafName];
  if (!contract) {
    if (strictMode) {
      if (INTENT_LEAVES.has(leafName)) {
        return `intent leaf '${leafName}' is not executable — intent leaves (task_type_*) cannot be dispatched; they require translation to an executable leaf`;
      }
      return `unknown leaf '${leafName}' — no execution contract registered (strict mode). Add a LeafArgContract entry in leaf-arg-contracts.ts`;
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

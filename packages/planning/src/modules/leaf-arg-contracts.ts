/**
 * Canonical leaf arg contracts — single source of truth for fallback planning.
 *
 * Validates args shape before execution and maps resolved requirements
 * to valid leaf step metadata.
 */

export interface LeafArgContract {
  leafName: string;
  /** Validates args shape. Returns null if valid, error string if invalid. */
  validate(args: Record<string, unknown>): string | null;
}

const CONTRACTS: Record<string, LeafArgContract> = {
  dig_block: {
    leafName: 'dig_block',
    validate: (args) => {
      if (!args.blockType && !args.pos) return 'dig_block requires blockType or pos';
      return null;
    },
  },
  craft_recipe: {
    leafName: 'craft_recipe',
    validate: (args) => {
      if (!args.recipe || typeof args.recipe !== 'string') return 'craft_recipe requires recipe (string)';
      return null;
    },
  },
  smelt: {
    leafName: 'smelt',
    validate: (args) => {
      if (!args.input || typeof args.input !== 'string') return 'smelt requires input (string)';
      return null;
    },
  },
  place_block: {
    leafName: 'place_block',
    validate: (args) => {
      if (!args.item || typeof args.item !== 'string') return 'place_block requires item (string)';
      return null;
    },
  },
  place_workstation: {
    leafName: 'place_workstation',
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
    validate: (args) => {
      if (!args.moduleId || typeof args.moduleId !== 'string') return 'build_module requires moduleId (string)';
      return null;
    },
  },
  acquire_material: {
    leafName: 'acquire_material',
    validate: (args) => {
      if (!args.item || typeof args.item !== 'string') return 'acquire_material requires item (string)';
      return null;
    },
  },
  replan_building: {
    leafName: 'replan_building',
    validate: (args) => {
      if (!args.templateId || typeof args.templateId !== 'string') return 'replan_building requires templateId (string)';
      return null;
    },
  },
  replan_exhausted: {
    leafName: 'replan_exhausted',
    validate: (args) => {
      if (!args.templateId || typeof args.templateId !== 'string') return 'replan_exhausted requires templateId (string)';
      return null;
    },
  },
  prepare_site: {
    leafName: 'prepare_site',
    validate: (args) => {
      if (!args.moduleId || typeof args.moduleId !== 'string') return 'prepare_site requires moduleId (string)';
      return null;
    },
  },
  place_feature: {
    leafName: 'place_feature',
    validate: (args) => {
      if (!args.moduleId || typeof args.moduleId !== 'string') return 'place_feature requires moduleId (string)';
      return null;
    },
  },
  building_step: {
    leafName: 'building_step',
    validate: (args) => {
      if (!args.moduleId || typeof args.moduleId !== 'string') return 'building_step requires moduleId (string)';
      return null;
    },
  },
};

/** Canonical set of leaves the executor may run. Unknown leaves are rejected in strict mode. */
export const KNOWN_LEAVES = new Set(Object.keys(CONTRACTS));

/** Normalize legacy arg shapes to canonical form before validation.
 *  Mutates the args object in place. Call before validateLeafArgs. */
export function normalizeLeafArgs(leafName: string, args: Record<string, unknown>): void {
  if (leafName === 'smelt' && !args.input && typeof args.item === 'string') {
    args.input = args.item;
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
    return strictMode ? `unknown leaf '${leafName}' — not in KNOWN_LEAVES allowlist` : null;
  }
  return contract.validate(args);
}

/** Maps requirement → validated leaf step metadata. Returns null if no valid mapping exists. */
export function requirementToLeafMeta(
  requirement: { kind: string; patterns?: string[]; outputPattern?: string; structure?: string; quantity?: number }
): { leaf: string; args: Record<string, unknown> } | null {
  switch (requirement.kind) {
    case 'collect':
    case 'mine': {
      const blockType = requirement.patterns?.[0];
      if (!blockType) return null;
      const args = { blockType };
      const err = validateLeafArgs('dig_block', args);
      return err ? null : { leaf: 'dig_block', args };
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
 *  Collect/mine plans emit repeated dig_block steps (capped) for quantity.
 *  Craft plans are single-step (craft only); the executor's prereq injection
 *  handles missing materials via recipe introspection at execution time. */
export function requirementToFallbackPlan(
  requirement: { kind: string; patterns?: string[]; outputPattern?: string;
    structure?: string; quantity?: number }
): Array<{ leaf: string; args: Record<string, unknown>; label: string }> | null {
  if (requirement.kind === 'collect' || requirement.kind === 'mine') {
    const blockType = requirement.patterns?.[0];
    if (!blockType) return null;
    const maxSteps = 8;
    const desired = requirement.quantity || 1;
    const count = Math.max(1, Math.min(desired, maxSteps));
    const args = { blockType };
    if (validateLeafArgs('dig_block', args)) return null; // invalid args
    return Array.from({ length: count }, (_, idx) => ({
      leaf: 'dig_block',
      args: { blockType },
      label: `${requirement.kind === 'mine' ? 'Mine' : 'Collect'} ${blockType}${count > 1 ? ` (${idx + 1}/${count})` : ''}`,
    }));
  }

  if (requirement.kind === 'craft') {
    const recipe = requirement.outputPattern;
    if (!recipe) return null;
    const craftArgs = { recipe, qty: requirement.quantity || 1 };
    if (validateLeafArgs('craft_recipe', craftArgs)) return null;
    return [{ leaf: 'craft_recipe', args: craftArgs,
      label: `Craft ${recipe}` }];
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

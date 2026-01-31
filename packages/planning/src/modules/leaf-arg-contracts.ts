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
  build_module: {
    leafName: 'build_module',
    validate: (args) => {
      if (!args.moduleId || typeof args.moduleId !== 'string') return 'build_module requires moduleId (string)';
      return null;
    },
  },
};

/** Returns null if leaf+args are valid, error string otherwise. */
export function validateLeafArgs(leafName: string, args: Record<string, unknown>): string | null {
  const contract = CONTRACTS[leafName];
  if (!contract) return null; // Unknown leaves pass through — only known leaves are validated
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
      const args = { blockType, count: requirement.quantity || 1 };
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

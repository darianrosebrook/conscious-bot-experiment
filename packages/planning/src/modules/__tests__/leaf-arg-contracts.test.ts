import { describe, it, expect } from 'vitest';
import {
  validateLeafArgs,
  normalizeLeafArgs,
  requirementToLeafMeta,
  requirementToFallbackPlan,
  KNOWN_LEAVES,
  INTENT_LEAVES,
  isIntentLeaf,
  isStepDispatchable,
  getLeafContractEntries,
} from '../leaf-arg-contracts';
import { mapBTActionToMinecraft } from '../action-mapping';
import { isExecStepMeta, isIntentStepMeta } from '../../types/task-step';

describe('validateLeafArgs', () => {
  it('accepts valid dig_block args with blockType', () => {
    expect(
      validateLeafArgs('dig_block', { blockType: 'oak_log', count: 1 })
    ).toBeNull();
  });

  it('accepts valid dig_block args with pos', () => {
    expect(
      validateLeafArgs('dig_block', { pos: { x: 1, y: 2, z: 3 } })
    ).toBeNull();
  });

  it('rejects dig_block with neither blockType nor pos', () => {
    expect(validateLeafArgs('dig_block', {})).toBe(
      'dig_block requires blockType or pos'
    );
  });

  it('accepts valid craft_recipe args', () => {
    expect(
      validateLeafArgs('craft_recipe', { recipe: 'wooden_pickaxe', qty: 1 })
    ).toBeNull();
  });

  it('rejects craft_recipe without recipe', () => {
    expect(validateLeafArgs('craft_recipe', {})).toBe(
      'craft_recipe requires recipe (string)'
    );
  });

  it('rejects craft_recipe with non-string recipe', () => {
    expect(validateLeafArgs('craft_recipe', { recipe: 42 })).toBe(
      'craft_recipe requires recipe (string)'
    );
  });

  it('accepts valid smelt args', () => {
    expect(validateLeafArgs('smelt', { input: 'iron_ore' })).toBeNull();
  });

  it('rejects smelt without input', () => {
    expect(validateLeafArgs('smelt', {})).toBe('smelt requires input (string)');
  });

  it('rejects smelt with item instead of input (pre-normalization)', () => {
    expect(validateLeafArgs('smelt', { item: 'iron_ore' })).toBe(
      'smelt requires input (string)'
    );
  });

  it('accepts valid place_block args', () => {
    expect(
      validateLeafArgs('place_block', { item: 'crafting_table' })
    ).toBeNull();
  });

  it('rejects place_block without item', () => {
    expect(validateLeafArgs('place_block', {})).toBe(
      'place_block requires item (string)'
    );
  });

  it('accepts valid place_workstation args', () => {
    expect(
      validateLeafArgs('place_workstation', { workstation: 'crafting_table' })
    ).toBeNull();
  });

  it('accepts place_workstation with furnace', () => {
    expect(
      validateLeafArgs('place_workstation', { workstation: 'furnace' })
    ).toBeNull();
  });

  it('accepts place_workstation with blast_furnace', () => {
    expect(
      validateLeafArgs('place_workstation', { workstation: 'blast_furnace' })
    ).toBeNull();
  });

  it('rejects place_workstation without workstation', () => {
    expect(validateLeafArgs('place_workstation', {})).toBe(
      'place_workstation requires workstation (string)'
    );
  });

  it('rejects place_workstation with unknown workstation', () => {
    expect(
      validateLeafArgs('place_workstation', { workstation: 'diamond_block' })
    ).toBe("place_workstation: unknown workstation 'diamond_block'");
  });

  it('accepts valid build_module args', () => {
    expect(
      validateLeafArgs('build_module', { moduleId: 'basic_shelter_5x5' })
    ).toBeNull();
  });

  it('rejects build_module without moduleId', () => {
    expect(validateLeafArgs('build_module', {})).toBe(
      'build_module requires moduleId (string)'
    );
  });

  it('passes through unknown leaf names in non-strict mode (default)', () => {
    expect(validateLeafArgs('unknown_leaf', {})).toBeNull();
    expect(validateLeafArgs('unknown_leaf', {}, false)).toBeNull();
  });

  it('rejects unknown leaf names in strict mode', () => {
    const error = validateLeafArgs('unknown_leaf', {}, true);
    expect(error).toContain('unknown leaf');
    expect(error).toContain('no execution contract registered');
  });

  it('accepts valid acquire_material args', () => {
    expect(
      validateLeafArgs('acquire_material', { item: 'oak_log' })
    ).toBeNull();
  });

  it('rejects acquire_material without item', () => {
    expect(validateLeafArgs('acquire_material', {})).toBe(
      'acquire_material requires item (string)'
    );
  });

  it('accepts valid replan_building args', () => {
    expect(
      validateLeafArgs('replan_building', { templateId: 'basic_shelter' })
    ).toBeNull();
  });

  it('rejects replan_building without templateId', () => {
    expect(validateLeafArgs('replan_building', {})).toBe(
      'replan_building requires templateId (string)'
    );
  });

  it('accepts valid replan_exhausted args', () => {
    expect(
      validateLeafArgs('replan_exhausted', { templateId: 'basic_shelter' })
    ).toBeNull();
  });

  it('rejects replan_exhausted without templateId', () => {
    expect(validateLeafArgs('replan_exhausted', {})).toBe(
      'replan_exhausted requires templateId (string)'
    );
  });

  it('accepts valid prepare_site args', () => {
    expect(
      validateLeafArgs('prepare_site', { moduleId: 'basic_shelter_5x5' })
    ).toBeNull();
  });

  it('rejects prepare_site without moduleId', () => {
    expect(validateLeafArgs('prepare_site', {})).toBe(
      'prepare_site requires moduleId (string)'
    );
  });

  it('accepts valid place_feature args', () => {
    expect(
      validateLeafArgs('place_feature', { moduleId: 'door_oak' })
    ).toBeNull();
  });

  it('rejects place_feature without moduleId', () => {
    expect(validateLeafArgs('place_feature', {})).toBe(
      'place_feature requires moduleId (string)'
    );
  });

  it('accepts valid building_step args', () => {
    expect(
      validateLeafArgs('building_step', { moduleId: 'custom_step' })
    ).toBeNull();
  });

  it('rejects building_step without moduleId', () => {
    expect(validateLeafArgs('building_step', {})).toBe(
      'building_step requires moduleId (string)'
    );
  });

  it('accepts valid collect_items args with itemName', () => {
    expect(
      validateLeafArgs('collect_items', { itemName: 'oak_log', radius: 8 })
    ).toBeNull();
  });

  it('accepts collect_items with no args (all optional)', () => {
    expect(validateLeafArgs('collect_items', {})).toBeNull();
  });

  it('rejects collect_items with non-string itemName', () => {
    expect(validateLeafArgs('collect_items', { itemName: 42 })).toBe(
      'collect_items: itemName must be a string if provided'
    );
  });
});

describe('normalizeLeafArgs', () => {
  it('converts smelt { item } to { input }', () => {
    const args: Record<string, unknown> = { item: 'iron_ore' };
    normalizeLeafArgs('smelt', args);
    expect(args).toEqual({ input: 'iron_ore' });
  });

  it('does not overwrite existing smelt { input }', () => {
    const args: Record<string, unknown> = {
      input: 'iron_ore',
      item: 'gold_ore',
    };
    normalizeLeafArgs('smelt', args);
    expect(args.input).toBe('iron_ore');
  });

  it('is a no-op for smelt with correct args', () => {
    const args: Record<string, unknown> = { input: 'iron_ore' };
    normalizeLeafArgs('smelt', args);
    expect(args).toEqual({ input: 'iron_ore' });
  });

  it('is a no-op for non-smelt leaves', () => {
    const args: Record<string, unknown> = { item: 'oak_log' };
    normalizeLeafArgs('place_block', args);
    expect(args).toEqual({ item: 'oak_log' });
  });

  it('smelt with legacy { item } passes validation after normalization', () => {
    const args: Record<string, unknown> = { item: 'iron_ore' };
    normalizeLeafArgs('smelt', args);
    expect(validateLeafArgs('smelt', args)).toBeNull();
  });
});

describe('requirementToLeafMeta', () => {
  it('maps collect requirement to acquire_material', () => {
    const result = requirementToLeafMeta({
      kind: 'collect',
      patterns: ['oak_log'],
      quantity: 8,
    });
    expect(result).toEqual({
      leaf: 'acquire_material',
      args: { item: 'oak_log', count: 8 },
    });
  });

  it('maps mine requirement to acquire_material', () => {
    const result = requirementToLeafMeta({
      kind: 'mine',
      patterns: ['iron_ore'],
      quantity: 3,
    });
    expect(result).toEqual({
      leaf: 'acquire_material',
      args: { item: 'iron_ore', count: 3 },
    });
  });

  it('maps craft requirement to craft_recipe', () => {
    const result = requirementToLeafMeta({
      kind: 'craft',
      outputPattern: 'wooden_pickaxe',
      quantity: 1,
    });
    expect(result).toEqual({
      leaf: 'craft_recipe',
      args: { recipe: 'wooden_pickaxe', qty: 1 },
    });
  });

  it('maps build requirement to build_module', () => {
    const result = requirementToLeafMeta({
      kind: 'build',
      structure: 'basic_shelter_5x5',
      quantity: 1,
    });
    expect(result).toEqual({
      leaf: 'build_module',
      args: { moduleId: 'basic_shelter_5x5' },
    });
  });

  it('returns null for collect with empty patterns', () => {
    expect(
      requirementToLeafMeta({ kind: 'collect', patterns: [], quantity: 1 })
    ).toBeNull();
  });

  it('returns null for craft without outputPattern', () => {
    expect(requirementToLeafMeta({ kind: 'craft', quantity: 1 })).toBeNull();
  });

  it('returns null for build without structure', () => {
    expect(requirementToLeafMeta({ kind: 'build', quantity: 1 })).toBeNull();
  });

  it('returns null for unknown requirement kind', () => {
    expect(requirementToLeafMeta({ kind: 'teleport', quantity: 1 })).toBeNull();
  });

  it('defaults quantity to 1 when not provided', () => {
    const result = requirementToLeafMeta({
      kind: 'collect',
      patterns: ['oak_log'],
    });
    expect(result).toEqual({
      leaf: 'acquire_material',
      args: { item: 'oak_log', count: 1 },
    });
  });
});

describe('KNOWN_LEAVES', () => {
  it('contains all expected executable leaf names', () => {
    const expected = [
      'dig_block',
      'craft_recipe',
      'smelt',
      'place_block',
      'place_workstation',
      'build_module',
      'acquire_material',
      'replan_building',
      'replan_exhausted',
      'prepare_site',
      'place_feature',
      'building_step',
      'collect_items',
      'interact_with_entity',
      'open_container',
      // Smoke-test / liveness leaves (have action mappings)
      'chat',
      'wait',
      'step_forward_safely',
      'move_to',
      // Sensing / read-only
      'sense_hostiles',
      'get_light_level',
      'get_block_at',
      'find_resource',
      'introspect_recipe',
      // Survival / consumable
      'consume_food',
      'sleep',
      // Torch / lighting
      'place_torch_if_needed',
      'place_torch',
      // Combat
      'attack_entity',
      'equip_weapon',
      'retreat_from_threat',
      'retreat_and_block',
      // Equipment
      'equip_tool',
      // Item / inventory
      'use_item',
      'manage_inventory',
      // Farming
      'till_soil',
      'manage_farm',
      'harvest_crop',
      // World interaction
      'interact_with_block',
    ];
    expect(KNOWN_LEAVES.size).toBe(expected.length);
    for (const leaf of expected) {
      expect(KNOWN_LEAVES.has(leaf)).toBe(true);
    }
  });

  it('does NOT contain intent leaves (task_type_*)', () => {
    for (const intentLeaf of INTENT_LEAVES) {
      expect(KNOWN_LEAVES.has(intentLeaf)).toBe(false);
    }
  });
});

describe('INTENT_LEAVES', () => {
  it('contains all expected intent leaf names from Sterling expand-by-digest', () => {
    const expected = [
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
    ];
    expect(INTENT_LEAVES.size).toBe(10);
    for (const leaf of expected) {
      expect(INTENT_LEAVES.has(leaf)).toBe(true);
    }
  });

  it('has zero overlap with KNOWN_LEAVES', () => {
    for (const leaf of INTENT_LEAVES) {
      expect(KNOWN_LEAVES.has(leaf)).toBe(false);
    }
    for (const leaf of KNOWN_LEAVES) {
      expect(INTENT_LEAVES.has(leaf)).toBe(false);
    }
  });

  it('isIntentLeaf returns true for intent leaves and false for executable leaves', () => {
    expect(isIntentLeaf('task_type_craft')).toBe(true);
    expect(isIntentLeaf('task_type_mine')).toBe(true);
    expect(isIntentLeaf('craft_recipe')).toBe(false);
    expect(isIntentLeaf('acquire_material')).toBe(false);
    expect(isIntentLeaf('unknown_random')).toBe(false);
  });
});

describe('validateLeafArgs strict mode with intent leaves', () => {
  it('rejects intent leaves with specific error in strict mode', () => {
    const error = validateLeafArgs('task_type_craft', {}, true);
    expect(error).toContain('intent leaf');
    expect(error).toContain('not executable');
  });

  it('passes intent leaves in non-strict mode (shadow/audit)', () => {
    expect(validateLeafArgs('task_type_craft', {})).toBeNull();
    expect(validateLeafArgs('task_type_mine', {})).toBeNull();
  });
});

// ============================================================================
// Step Meta Type Guards
// ============================================================================

describe('isExecStepMeta', () => {
  it('returns true for valid executable step meta', () => {
    expect(isExecStepMeta({
      leaf: 'craft_recipe',
      args: { recipe: 'oak_planks', qty: 4 },
      executable: true,
    })).toBe(true);
  });

  it('returns false when executable is not true', () => {
    expect(isExecStepMeta({
      leaf: 'craft_recipe',
      args: { recipe: 'oak_planks' },
      executable: false,
    })).toBe(false);
  });

  it('returns false when leaf is missing', () => {
    expect(isExecStepMeta({
      args: { recipe: 'oak_planks' },
      executable: true,
    })).toBe(false);
  });

  it('returns false when args is not a plain object', () => {
    expect(isExecStepMeta({
      leaf: 'craft_recipe',
      args: [1, 2, 3],
      executable: true,
    })).toBe(false);
  });

  it('returns false for undefined meta', () => {
    expect(isExecStepMeta(undefined)).toBe(false);
  });
});

describe('isIntentStepMeta', () => {
  it('returns true for valid intent step meta', () => {
    expect(isIntentStepMeta({
      intent: {
        leafName: 'task_type_craft',
        lemma: 'craft',
        propositionId: 'p1',
        routingDomain: 'planning',
      },
      source: 'expand_by_digest',
    })).toBe(true);
  });

  it('returns false when intent is missing', () => {
    expect(isIntentStepMeta({
      leaf: 'task_type_craft',
      source: 'expand_by_digest',
    })).toBe(false);
  });

  it('returns false when intent.leafName is missing', () => {
    expect(isIntentStepMeta({
      intent: { lemma: 'craft', propositionId: 'p1' },
      source: 'expand_by_digest',
    })).toBe(false);
  });

  it('returns false when intent.lemma is missing', () => {
    expect(isIntentStepMeta({
      intent: { leafName: 'task_type_craft', propositionId: 'p1' },
      source: 'expand_by_digest',
    })).toBe(false);
  });

  it('returns false for undefined meta', () => {
    expect(isIntentStepMeta(undefined)).toBe(false);
  });

  it('ExecStepMeta and IntentStepMeta do not overlap', () => {
    const execMeta = {
      leaf: 'craft_recipe',
      args: { recipe: 'oak_planks' },
      executable: true,
    };
    const intentMeta = {
      intent: { leafName: 'task_type_craft', lemma: 'craft', propositionId: 'p1' },
      source: 'expand_by_digest',
    };
    // exec is not intent
    expect(isIntentStepMeta(execMeta)).toBe(false);
    // intent is not exec (no executable: true)
    expect(isExecStepMeta(intentMeta)).toBe(false);
  });
});

describe('requirementToFallbackPlan', () => {
  it('maps collect requirement to acquire_material steps', () => {
    const result = requirementToFallbackPlan({
      kind: 'collect',
      patterns: ['oak_log'],
      quantity: 8,
    });
    expect(result).toHaveLength(8);
    expect(result![0]).toEqual({
      leaf: 'acquire_material',
      args: { item: 'oak_log', count: 1 },
      label: 'Gather oak_log (1/8)',
    });
    expect(result![7]).toEqual({
      leaf: 'acquire_material',
      args: { item: 'oak_log', count: 1 },
      label: 'Gather oak_log (8/8)',
    });
  });

  it('maps mine requirement to acquire_material steps', () => {
    const result = requirementToFallbackPlan({
      kind: 'mine',
      patterns: ['iron_ore'],
      quantity: 3,
    });
    expect(result).toHaveLength(3);
    expect(result![0]).toEqual({
      leaf: 'acquire_material',
      args: { item: 'iron_ore', count: 1 },
      label: 'Mine iron_ore (1/3)',
    });
    expect(result![2]).toEqual({
      leaf: 'acquire_material',
      args: { item: 'iron_ore', count: 1 },
      label: 'Mine iron_ore (3/3)',
    });
  });

  it('emits only acquire_material leaves for collect plans', () => {
    const result = requirementToFallbackPlan({
      kind: 'collect',
      patterns: ['oak_log'],
      quantity: 3,
    });
    expect(result).toHaveLength(3);
    const leafSequence = result!.map((s) => s.leaf);
    expect(leafSequence).toEqual([
      'acquire_material',
      'acquire_material',
      'acquire_material',
    ]);
  });

  it('maps craft requirement to 1-step craft plan (prereq injection handles materials)', () => {
    const result = requirementToFallbackPlan({
      kind: 'craft',
      outputPattern: 'wooden_pickaxe',
    });
    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({
      leaf: 'craft_recipe',
      args: { recipe: 'wooden_pickaxe', qty: 1 },
      label: 'Craft wooden_pickaxe',
    });
  });

  it('maps craft with quantity to 1-step craft plan', () => {
    const result = requirementToFallbackPlan({
      kind: 'craft',
      outputPattern: 'crafting_table',
      quantity: 2,
    });
    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({
      leaf: 'craft_recipe',
      args: { recipe: 'crafting_table', qty: 2 },
      label: 'Craft crafting_table',
    });
  });

  it('maps build requirement to 1-step build_module plan', () => {
    const result = requirementToFallbackPlan({
      kind: 'build',
      structure: 'basic_shelter_5x5',
    });
    expect(result).toEqual([
      {
        leaf: 'build_module',
        args: { moduleId: 'basic_shelter_5x5' },
        label: 'Build basic_shelter_5x5',
      },
    ]);
  });

  it('returns null for unknown requirement kind', () => {
    expect(requirementToFallbackPlan({ kind: 'unknown' })).toBeNull();
  });

  it('returns null for collect with empty patterns', () => {
    expect(
      requirementToFallbackPlan({ kind: 'collect', patterns: [], quantity: 1 })
    ).toBeNull();
  });

  it('returns null for craft without outputPattern', () => {
    expect(requirementToFallbackPlan({ kind: 'craft' })).toBeNull();
  });

  it('returns null for build without structure', () => {
    expect(requirementToFallbackPlan({ kind: 'build' })).toBeNull();
  });

  it('defaults quantity to 1 when not provided', () => {
    const result = requirementToFallbackPlan({
      kind: 'collect',
      patterns: ['oak_log'],
    });
    expect(result).toEqual([
      {
        leaf: 'acquire_material',
        args: { item: 'oak_log', count: 1 },
        label: 'Gather oak_log',
      },
    ]);
  });
});

// ============================================================================
// fields[] ↔ validate() coherence harness
// ============================================================================
//
// Proves that the `fields` descriptor on each LeafArgContract accurately
// reflects what `validate()` enforces. If they drift, the leaf registry
// digest becomes meaningless.

/** Generate a minimal valid value for a field type descriptor. */
function stubValue(fieldType: string, fieldName: string): unknown {
  // Value-constrained fields need domain-valid stubs
  if (fieldName === 'workstation') return 'crafting_table';
  if (fieldName === 'action') return 'sort'; // manage_inventory enum
  switch (fieldType) {
    case 'string': return 'test_value';
    case 'number': return 1;
    case 'any': return { x: 0, y: 64, z: 0 }; // position-like
    default: return 'fallback';
  }
}

/** Parse a field descriptor like "recipe:string" or "?qty:number" */
function parseField(descriptor: string): { name: string; type: string; required: boolean } {
  const required = !descriptor.startsWith('?');
  const clean = required ? descriptor : descriptor.slice(1);
  const [name, type] = clean.split(':');
  return { name, type: type || 'any', required };
}

/** Build minimal args from required fields only. */
function buildMinimalArgs(fields: string[]): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const f of fields) {
    const { name, type, required } = parseField(f);
    if (required) {
      args[name] = stubValue(type, name);
    }
  }
  return args;
}

/** Build args with ALL fields (required + optional) populated. */
function buildFullArgs(fields: string[]): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const f of fields) {
    const { name, type } = parseField(f);
    args[name] = stubValue(type, name);
  }
  return args;
}

/**
 * Contracts with OR constraints: all fields are optional individually
 * but at least one is required by validate(). These need special handling.
 */
const OR_CONSTRAINT_LEAVES = new Set(['dig_block', 'open_container']);

/**
 * Contracts with mixed AND+OR constraints: some fields are required (AND),
 * and additionally at least one of several optional fields is required (OR).
 * Minimal valid args must include all required fields PLUS one optional.
 */
const MIXED_AND_OR_LEAVES = new Set(['interact_with_entity']);

describe('fields[] ↔ validate() coherence (contract invariant)', () => {
  const entries = getLeafContractEntries();

  it('every leaf in KNOWN_LEAVES has a fields descriptor', () => {
    for (const [leafName, fields] of entries) {
      expect(KNOWN_LEAVES.has(leafName)).toBe(true);
      expect(Array.isArray(fields)).toBe(true);
    }
    // And every KNOWN_LEAF has an entry
    expect(entries.length).toBe(KNOWN_LEAVES.size);
  });

  // For each contract, generate coherence tests
  for (const [leafName, fields] of entries) {
    describe(`${leafName}`, () => {
      const allParsed = fields.map(parseField);
      const requiredFields = allParsed.filter(f => f.required);
      const optionalFields = allParsed.filter(f => !f.required);
      const isOrConstraint = OR_CONSTRAINT_LEAVES.has(leafName);

      if (isOrConstraint) {
        // OR-constraint: all fields optional individually, but need at least one
        it('validate() rejects when NO fields are provided', () => {
          const result = validateLeafArgs(leafName, {});
          expect(result).not.toBeNull();
        });

        for (const field of optionalFields) {
          it(`validate() accepts when only '${field.name}' is provided`, () => {
            const args = { [field.name]: stubValue(field.type, field.name) };
            const result = validateLeafArgs(leafName, args);
            expect(result).toBeNull();
          });
        }

        it('validate() accepts when ALL fields are provided', () => {
          const result = validateLeafArgs(leafName, buildFullArgs(fields));
          expect(result).toBeNull();
        });
      } else if (MIXED_AND_OR_LEAVES.has(leafName)) {
        // Mixed AND+OR: required fields + at least one optional
        it('validate() accepts all fields populated', () => {
          const result = validateLeafArgs(leafName, buildFullArgs(fields));
          expect(result).toBeNull();
        });

        it('validate() accepts required fields + first optional', () => {
          const args = buildMinimalArgs(fields);
          // Add first optional field to satisfy OR constraint
          if (optionalFields.length > 0) {
            args[optionalFields[0].name] = stubValue(optionalFields[0].type, optionalFields[0].name);
          }
          const result = validateLeafArgs(leafName, args);
          expect(result).toBeNull();
        });

        it('validate() rejects when only required fields present (OR group unsatisfied)', () => {
          const args = buildMinimalArgs(fields);
          const result = validateLeafArgs(leafName, args);
          expect(result).not.toBeNull();
        });

        // Removing a required field should still fail
        for (const field of requiredFields) {
          it(`validate() rejects when required field '${field.name}' is removed`, () => {
            const args = buildFullArgs(fields);
            delete args[field.name];
            const result = validateLeafArgs(leafName, args);
            expect(result).not.toBeNull();
          });
        }
      } else {
        // Standard AND-constraint: required fields must be present
        it('validate() accepts args built from all fields', () => {
          const args = buildFullArgs(fields);
          const result = validateLeafArgs(leafName, args);
          expect(result).toBeNull();
        });

        if (requiredFields.length > 0) {
          it('validate() accepts minimal args (required fields only)', () => {
            const args = buildMinimalArgs(fields);
            const result = validateLeafArgs(leafName, args);
            expect(result).toBeNull();
          });
        }

        // Removing a required field should cause failure
        for (const field of requiredFields) {
          it(`validate() rejects when required field '${field.name}' is removed`, () => {
            const args = buildFullArgs(fields);
            delete args[field.name];
            const result = validateLeafArgs(leafName, args);
            expect(result).not.toBeNull();
          });
        }
      }

      // Type coherence: for required string fields, wrong type should fail
      for (const field of requiredFields) {
        if (field.type === 'string') {
          it(`validate() rejects '${field.name}' as wrong type (number instead of string)`, () => {
            const args = buildFullArgs(fields);
            args[field.name] = 12345;
            const result = validateLeafArgs(leafName, args);
            expect(result).not.toBeNull();
          });
        }
      }
    });
  }
});

// ============================================================================
// Regression: KNOWN_LEAVES ↔ action-mapping alignment
// ============================================================================
//
// Prevents the "two registries" drift: a leaf that has a contract (and is thus
// in KNOWN_LEAVES) but has no action mapping would pass strict validation yet
// fail at dispatch time. This test catches that gap at build time.

describe('KNOWN_LEAVES ↔ action-mapping alignment', () => {
  // Leaves that intentionally have NO action mapping. They are valid in
  // CONTRACTS for arg validation in shadow mode but cannot dispatch in live
  // mode yet. Reasons:
  //   - replan_*: trigger replanning, not bot actions
  //   - build_module/prepare_site/place_feature/building_step: building
  //     system not yet wired to bot action layer
  //   - interact_with_entity/open_container: entity interaction not yet wired
  //
  // When action mappings are added for these, remove them from this set —
  // the test will start asserting they're dispatchable.
  const NO_MAPPING_LEAVES = new Set([
    'replan_building',
    'replan_exhausted',
    'build_module',
    'prepare_site',
    'place_feature',
    'building_step',
    'interact_with_entity',
  ]);

  for (const leaf of KNOWN_LEAVES) {
    if (NO_MAPPING_LEAVES.has(leaf)) {
      it(`${leaf} has a contract but no action mapping (shadow-only)`, () => {
        // Should still have a valid contract for arg validation
        const minimalArgs = getMinimalValidArgs(leaf);
        const error = validateLeafArgs(leaf, minimalArgs, true);
        expect(error).toBeNull();
        // But should NOT have an action mapping (yet)
        const mapped = mapBTActionToMinecraft(`minecraft.${leaf}`, minimalArgs, { strict: true });
        expect(mapped).toBeNull();
      });
      continue;
    }

    it(`${leaf} has an action mapping (dispatchable in live mode)`, () => {
      // Use isStepDispatchable which runs the full executor contract:
      // normalizeLeafArgs → validateLeafArgs(strict) → mapBTActionToMinecraft(strict)
      //
      // We provide minimal valid args for each leaf. The point is not to test
      // every arg combo — that's done in the per-leaf tests above. The point
      // is to prove the mapping exists.
      const minimalArgs = getMinimalValidArgs(leaf);
      const result = isStepDispatchable(leaf, minimalArgs);
      expect(result).toEqual({ ok: true });
    });
  }
});

/** Returns minimal args that pass validation for a given leaf. */
function getMinimalValidArgs(leaf: string): Record<string, unknown> {
  const table: Record<string, Record<string, unknown>> = {
    dig_block: { blockType: 'dirt' },
    craft_recipe: { recipe: 'oak_planks' },
    smelt: { input: 'raw_iron' },
    place_block: { item: 'cobblestone' },
    place_workstation: { workstation: 'crafting_table' },
    build_module: { moduleId: 'wall_north' },
    acquire_material: { item: 'oak_log' },
    prepare_site: { moduleId: 'foundation' },
    place_feature: { moduleId: 'door' },
    building_step: { moduleId: 'roof' },
    replan_building: { templateId: 'test' },
    replan_exhausted: { templateId: 'test' },
    collect_items: {},
    interact_with_entity: { entityType: 'villager', entityId: 'v1' },
    open_container: { containerType: 'chest' },
    chat: { message: 'hello' },
    wait: { duration: 1000 },
    step_forward_safely: { distance: 1 },
    move_to: { target: { x: 0, y: 64, z: 0 } },
    // Sensing / read-only
    sense_hostiles: {},
    get_light_level: {},
    get_block_at: { position: { x: 0, y: 64, z: 0 } },
    find_resource: { blockType: 'oak_log' },
    introspect_recipe: { output: 'crafting_table' },
    // Survival / consumable
    consume_food: {},
    sleep: {},
    // Torch / lighting
    place_torch_if_needed: {},
    place_torch: {},
    // Combat
    attack_entity: {},
    equip_weapon: {},
    retreat_from_threat: {},
    retreat_and_block: {},
    // Equipment
    equip_tool: {},
    // Item / inventory
    use_item: { item: 'bread' },
    manage_inventory: { action: 'sort' },
    open_container: { containerType: 'chest' },
    // Farming
    till_soil: {},
    manage_farm: {},
    harvest_crop: {},
    // World interaction
    interact_with_block: { position: { x: 0, y: 64, z: 0 } },
  };
  return table[leaf] ?? {};
}

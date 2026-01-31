import { describe, it, expect } from 'vitest';
import { validateLeafArgs, normalizeLeafArgs, requirementToLeafMeta, requirementToFallbackPlan, KNOWN_LEAVES } from '../leaf-arg-contracts';

describe('validateLeafArgs', () => {
  it('accepts valid dig_block args with blockType', () => {
    expect(validateLeafArgs('dig_block', { blockType: 'oak_log', count: 1 })).toBeNull();
  });

  it('accepts valid dig_block args with pos', () => {
    expect(validateLeafArgs('dig_block', { pos: { x: 1, y: 2, z: 3 } })).toBeNull();
  });

  it('rejects dig_block with neither blockType nor pos', () => {
    expect(validateLeafArgs('dig_block', {})).toBe('dig_block requires blockType or pos');
  });

  it('accepts valid craft_recipe args', () => {
    expect(validateLeafArgs('craft_recipe', { recipe: 'wooden_pickaxe', qty: 1 })).toBeNull();
  });

  it('rejects craft_recipe without recipe', () => {
    expect(validateLeafArgs('craft_recipe', {})).toBe('craft_recipe requires recipe (string)');
  });

  it('rejects craft_recipe with non-string recipe', () => {
    expect(validateLeafArgs('craft_recipe', { recipe: 42 })).toBe('craft_recipe requires recipe (string)');
  });

  it('accepts valid smelt args', () => {
    expect(validateLeafArgs('smelt', { input: 'iron_ore' })).toBeNull();
  });

  it('rejects smelt without input', () => {
    expect(validateLeafArgs('smelt', {})).toBe('smelt requires input (string)');
  });

  it('rejects smelt with item instead of input (pre-normalization)', () => {
    expect(validateLeafArgs('smelt', { item: 'iron_ore' })).toBe('smelt requires input (string)');
  });

  it('accepts valid place_block args', () => {
    expect(validateLeafArgs('place_block', { item: 'crafting_table' })).toBeNull();
  });

  it('rejects place_block without item', () => {
    expect(validateLeafArgs('place_block', {})).toBe('place_block requires item (string)');
  });

  it('accepts valid build_module args', () => {
    expect(validateLeafArgs('build_module', { moduleId: 'basic_shelter_5x5' })).toBeNull();
  });

  it('rejects build_module without moduleId', () => {
    expect(validateLeafArgs('build_module', {})).toBe('build_module requires moduleId (string)');
  });

  it('passes through unknown leaf names in non-strict mode (default)', () => {
    expect(validateLeafArgs('unknown_leaf', {})).toBeNull();
    expect(validateLeafArgs('unknown_leaf', {}, false)).toBeNull();
  });

  it('rejects unknown leaf names in strict mode', () => {
    const error = validateLeafArgs('unknown_leaf', {}, true);
    expect(error).toContain('unknown leaf');
    expect(error).toContain('KNOWN_LEAVES');
  });

  it('accepts valid acquire_material args', () => {
    expect(validateLeafArgs('acquire_material', { item: 'oak_log' })).toBeNull();
  });

  it('rejects acquire_material without item', () => {
    expect(validateLeafArgs('acquire_material', {})).toBe('acquire_material requires item (string)');
  });

  it('accepts valid replan_building args', () => {
    expect(validateLeafArgs('replan_building', { templateId: 'basic_shelter' })).toBeNull();
  });

  it('rejects replan_building without templateId', () => {
    expect(validateLeafArgs('replan_building', {})).toBe('replan_building requires templateId (string)');
  });

  it('accepts valid replan_exhausted args', () => {
    expect(validateLeafArgs('replan_exhausted', { templateId: 'basic_shelter' })).toBeNull();
  });

  it('rejects replan_exhausted without templateId', () => {
    expect(validateLeafArgs('replan_exhausted', {})).toBe('replan_exhausted requires templateId (string)');
  });

  it('accepts valid prepare_site args', () => {
    expect(validateLeafArgs('prepare_site', { moduleId: 'basic_shelter_5x5' })).toBeNull();
  });

  it('rejects prepare_site without moduleId', () => {
    expect(validateLeafArgs('prepare_site', {})).toBe('prepare_site requires moduleId (string)');
  });

  it('accepts valid place_feature args', () => {
    expect(validateLeafArgs('place_feature', { moduleId: 'door_oak' })).toBeNull();
  });

  it('rejects place_feature without moduleId', () => {
    expect(validateLeafArgs('place_feature', {})).toBe('place_feature requires moduleId (string)');
  });

  it('accepts valid building_step args', () => {
    expect(validateLeafArgs('building_step', { moduleId: 'custom_step' })).toBeNull();
  });

  it('rejects building_step without moduleId', () => {
    expect(validateLeafArgs('building_step', {})).toBe('building_step requires moduleId (string)');
  });
});

describe('normalizeLeafArgs', () => {
  it('converts smelt { item } to { input }', () => {
    const args: Record<string, unknown> = { item: 'iron_ore' };
    normalizeLeafArgs('smelt', args);
    expect(args).toEqual({ input: 'iron_ore' });
  });

  it('does not overwrite existing smelt { input }', () => {
    const args: Record<string, unknown> = { input: 'iron_ore', item: 'gold_ore' };
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
  it('maps collect requirement to dig_block', () => {
    const result = requirementToLeafMeta({ kind: 'collect', patterns: ['oak_log'], quantity: 8 });
    expect(result).toEqual({ leaf: 'dig_block', args: { blockType: 'oak_log' } });
  });

  it('maps mine requirement to dig_block', () => {
    const result = requirementToLeafMeta({ kind: 'mine', patterns: ['iron_ore'], quantity: 3 });
    expect(result).toEqual({ leaf: 'dig_block', args: { blockType: 'iron_ore' } });
  });

  it('maps craft requirement to craft_recipe', () => {
    const result = requirementToLeafMeta({ kind: 'craft', outputPattern: 'wooden_pickaxe', quantity: 1 });
    expect(result).toEqual({ leaf: 'craft_recipe', args: { recipe: 'wooden_pickaxe', qty: 1 } });
  });

  it('maps build requirement to build_module', () => {
    const result = requirementToLeafMeta({ kind: 'build', structure: 'basic_shelter_5x5', quantity: 1 });
    expect(result).toEqual({ leaf: 'build_module', args: { moduleId: 'basic_shelter_5x5' } });
  });

  it('returns null for collect with empty patterns', () => {
    expect(requirementToLeafMeta({ kind: 'collect', patterns: [], quantity: 1 })).toBeNull();
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
    const result = requirementToLeafMeta({ kind: 'collect', patterns: ['oak_log'] });
    expect(result).toEqual({ leaf: 'dig_block', args: { blockType: 'oak_log' } });
  });
});

describe('KNOWN_LEAVES', () => {
  it('contains all 11 expected leaf names', () => {
    const expected = [
      'dig_block', 'craft_recipe', 'smelt', 'place_block', 'build_module',
      'acquire_material', 'replan_building', 'replan_exhausted',
      'prepare_site', 'place_feature', 'building_step',
    ];
    expect(KNOWN_LEAVES.size).toBe(11);
    for (const leaf of expected) {
      expect(KNOWN_LEAVES.has(leaf)).toBe(true);
    }
  });
});

describe('requirementToFallbackPlan', () => {
  it('maps collect requirement to multi-step dig_block plan', () => {
    const result = requirementToFallbackPlan({ kind: 'collect', patterns: ['oak_log'], quantity: 8 });
    expect(result).toHaveLength(8);
    expect(result![0]).toEqual({
      leaf: 'dig_block',
      args: { blockType: 'oak_log' },
      label: 'Collect oak_log (1/8)',
    });
  });

  it('maps mine requirement to multi-step dig_block plan', () => {
    const result = requirementToFallbackPlan({ kind: 'mine', patterns: ['iron_ore'], quantity: 3 });
    expect(result).toHaveLength(3);
    expect(result![0]).toEqual({
      leaf: 'dig_block',
      args: { blockType: 'iron_ore' },
      label: 'Mine iron_ore (1/3)',
    });
  });

  it('maps craft requirement to 1-step craft plan (prereq injection handles materials)', () => {
    const result = requirementToFallbackPlan({ kind: 'craft', outputPattern: 'wooden_pickaxe' });
    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({
      leaf: 'craft_recipe', args: { recipe: 'wooden_pickaxe', qty: 1 }, label: 'Craft wooden_pickaxe',
    });
  });

  it('maps craft with quantity to 1-step craft plan', () => {
    const result = requirementToFallbackPlan({ kind: 'craft', outputPattern: 'crafting_table', quantity: 2 });
    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({
      leaf: 'craft_recipe', args: { recipe: 'crafting_table', qty: 2 }, label: 'Craft crafting_table',
    });
  });

  it('maps build requirement to 1-step build_module plan', () => {
    const result = requirementToFallbackPlan({ kind: 'build', structure: 'basic_shelter_5x5' });
    expect(result).toEqual([
      { leaf: 'build_module', args: { moduleId: 'basic_shelter_5x5' }, label: 'Build basic_shelter_5x5' },
    ]);
  });

  it('returns null for unknown requirement kind', () => {
    expect(requirementToFallbackPlan({ kind: 'unknown' })).toBeNull();
  });

  it('returns null for collect with empty patterns', () => {
    expect(requirementToFallbackPlan({ kind: 'collect', patterns: [], quantity: 1 })).toBeNull();
  });

  it('returns null for craft without outputPattern', () => {
    expect(requirementToFallbackPlan({ kind: 'craft' })).toBeNull();
  });

  it('returns null for build without structure', () => {
    expect(requirementToFallbackPlan({ kind: 'build' })).toBeNull();
  });

  it('defaults quantity to 1 when not provided', () => {
    const result = requirementToFallbackPlan({ kind: 'collect', patterns: ['oak_log'] });
    expect(result).toEqual([
      { leaf: 'dig_block', args: { blockType: 'oak_log' }, label: 'Collect oak_log' },
    ]);
  });
});

import { describe, it, expect } from 'vitest';
import { validateLeafArgs, requirementToLeafMeta } from '../leaf-arg-contracts';

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

  it('passes through unknown leaf names (no contract to validate)', () => {
    expect(validateLeafArgs('unknown_leaf', {})).toBeNull();
  });
});

describe('requirementToLeafMeta', () => {
  it('maps collect requirement to dig_block', () => {
    const result = requirementToLeafMeta({ kind: 'collect', patterns: ['oak_log'], quantity: 8 });
    expect(result).toEqual({ leaf: 'dig_block', args: { blockType: 'oak_log', count: 8 } });
  });

  it('maps mine requirement to dig_block', () => {
    const result = requirementToLeafMeta({ kind: 'mine', patterns: ['iron_ore'], quantity: 3 });
    expect(result).toEqual({ leaf: 'dig_block', args: { blockType: 'iron_ore', count: 3 } });
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
    expect(result).toEqual({ leaf: 'dig_block', args: { blockType: 'oak_log', count: 1 } });
  });
});

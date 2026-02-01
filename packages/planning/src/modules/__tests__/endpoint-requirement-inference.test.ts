/**
 * Tests for /task endpoint requirement inference.
 *
 * Verifies inferRequirementFromEndpointParams covers legacy parameter shapes
 * and returns null for uninferrable cases.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { inferRequirementFromEndpointParams } from '../planning-endpoints';

describe('inferRequirementFromEndpointParams', () => {
  it('type:crafting + item → kind:craft', () => {
    const result = inferRequirementFromEndpointParams({
      type: 'crafting',
      parameters: { item: 'oak_planks', quantity: 4 },
    });
    expect(result).toEqual({ kind: 'craft', outputPattern: 'oak_planks', quantity: 4 });
  });

  it('type:gathering + item → kind:collect', () => {
    const result = inferRequirementFromEndpointParams({
      type: 'gathering',
      parameters: { item: 'oak_log' },
    });
    expect(result).toEqual({ kind: 'collect', outputPattern: 'oak_log', quantity: 1 });
  });

  it('type:mining + blockType → kind:mine', () => {
    const result = inferRequirementFromEndpointParams({
      type: 'mining',
      parameters: { blockType: 'iron_ore' },
    });
    expect(result).toEqual({ kind: 'mine', outputPattern: 'iron_ore', quantity: 1 });
  });

  it('recipe parameter → kind:craft', () => {
    const result = inferRequirementFromEndpointParams({
      parameters: { recipe: 'crafting_table' },
    });
    expect(result).toEqual({ kind: 'craft', outputPattern: 'crafting_table', quantity: 1 });
  });

  it('recipe parameter with qty', () => {
    const result = inferRequirementFromEndpointParams({
      parameters: { recipe: 'stick', qty: 4 },
    });
    expect(result).toEqual({ kind: 'craft', outputPattern: 'stick', quantity: 4 });
  });

  it('resourceType:wood → kind:collect, outputPattern:_log (any wood)', () => {
    const result = inferRequirementFromEndpointParams({
      parameters: { resourceType: 'wood' },
    });
    expect(result).toEqual({ kind: 'collect', outputPattern: '_log', quantity: 1 });
  });

  it('resourceType:stone → kind:collect, outputPattern:stone', () => {
    const result = inferRequirementFromEndpointParams({
      parameters: { resourceType: 'stone' },
    });
    expect(result).toEqual({ kind: 'collect', outputPattern: 'stone', quantity: 1 });
  });

  it('resourceType with targetQuantity', () => {
    const result = inferRequirementFromEndpointParams({
      parameters: { resourceType: 'wood', targetQuantity: 8 },
    });
    expect(result).toEqual({ kind: 'collect', outputPattern: '_log', quantity: 8 });
  });

  it('type:crafting + empty parameters → null (400 path)', () => {
    const result = inferRequirementFromEndpointParams({
      type: 'crafting',
      parameters: {},
    });
    expect(result).toBeNull();
  });

  it('type:general → null (allowed through)', () => {
    const result = inferRequirementFromEndpointParams({
      type: 'general',
    });
    expect(result).toBeNull();
  });

  it('no parameters at all → null', () => {
    const result = inferRequirementFromEndpointParams({});
    expect(result).toBeNull();
  });

  it('blockType without type → defaults to collect', () => {
    const result = inferRequirementFromEndpointParams({
      parameters: { blockType: 'oak_log' },
    });
    expect(result).toEqual({ kind: 'collect', outputPattern: 'oak_log', quantity: 1 });
  });

  it('item without known type → null (no type mapping)', () => {
    const result = inferRequirementFromEndpointParams({
      type: 'exploration',
      parameters: { item: 'oak_log' },
    });
    // exploration is not in the kindFromType map
    expect(result).toBeNull();
  });

  it('recipe takes priority over item', () => {
    const result = inferRequirementFromEndpointParams({
      type: 'crafting',
      parameters: { recipe: 'stick', item: 'oak_log' },
    });
    // recipe checked first
    expect(result?.kind).toBe('craft');
    expect(result?.outputPattern).toBe('stick');
  });
});

/**
 * Acquisition Leaf Routing Tests
 *
 * Verifies acq:* action prefix → leaf name mapping.
 */

import { describe, it, expect } from 'vitest';
import { actionTypeToLeaf, actionToAcquisitionLeaf } from '../leaf-routing';

describe('actionToAcquisitionLeaf', () => {
  it('acq:trade:iron_ingot → interact_with_entity', () => {
    expect(actionToAcquisitionLeaf('acq:trade:iron_ingot')).toBe('interact_with_entity');
  });

  it('acq:loot:diamond → open_container', () => {
    expect(actionToAcquisitionLeaf('acq:loot:diamond')).toBe('open_container');
  });

  it('acq:salvage:iron_ingot:from:iron_sword → craft_recipe', () => {
    expect(actionToAcquisitionLeaf('acq:salvage:iron_ingot:from:iron_sword')).toBe('craft_recipe');
  });

  it('unknown acq:* prefix → blocked', () => {
    expect(actionToAcquisitionLeaf('acq:unknown:thing')).toBe('blocked');
  });
});

describe('actionTypeToLeaf with acq: actions', () => {
  it('craft actionType with acq:trade action → interact_with_entity', () => {
    expect(actionTypeToLeaf('craft', 'acq:trade:iron_ingot')).toBe('interact_with_entity');
  });

  it('craft actionType with acq:loot action → open_container', () => {
    expect(actionTypeToLeaf('craft', 'acq:loot:diamond')).toBe('open_container');
  });

  it('craft actionType with acq:salvage action → craft_recipe', () => {
    expect(actionTypeToLeaf('craft', 'acq:salvage:iron_ingot:from:iron_sword')).toBe('craft_recipe');
  });

  it('craft actionType without acq: prefix → craft_recipe (normal path)', () => {
    expect(actionTypeToLeaf('craft', 'craft:oak_planks')).toBe('craft_recipe');
  });

  it('mine actionType without acq: prefix → acquire_material (normal path)', () => {
    expect(actionTypeToLeaf('mine')).toBe('acquire_material');
  });
});

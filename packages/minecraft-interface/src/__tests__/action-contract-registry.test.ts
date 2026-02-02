import { describe, it, expect } from 'vitest';
import {
  ACTION_CONTRACTS,
  resolveLeafName,
  normalizeActionParams,
  buildActionTypeToLeafMap,
} from '../action-contract-registry';

describe('resolveLeafName', () => {
  it('resolves acquire_material to acquire_material', () => {
    expect(resolveLeafName('acquire_material')).toBe('acquire_material');
  });

  it('resolves collect_items_enhanced to collect_items', () => {
    expect(resolveLeafName('collect_items_enhanced')).toBe('collect_items');
  });

  it('resolves craft to craft_recipe', () => {
    expect(resolveLeafName('craft')).toBe('craft_recipe');
  });

  it('returns undefined for unknown action', () => {
    expect(resolveLeafName('unknown_action')).toBeUndefined();
  });
});

describe('normalizeActionParams', () => {
  it('applies alias: place_block block_type → item', () => {
    const { params } = normalizeActionParams('place_block', {
      block_type: 'stone',
    });
    expect(params.item).toBe('stone');
    expect(params.block_type).toBeUndefined();
  });

  it('preserves existing key when alias source also present', () => {
    const { params } = normalizeActionParams('place_block', {
      item: 'stone',
      block_type: 'dirt',
    });
    expect(params.item).toBe('stone');
  });

  it('warns on deprecated placement key for place_block', () => {
    const { params, warnings } = normalizeActionParams('place_block', {
      block_type: 'stone',
      placement: 'around_player',
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('placement');
    // placement should be stripped
    expect(params.placement).toBeUndefined();
  });

  it('applies alias: collect_items_enhanced item → itemName', () => {
    const { params } = normalizeActionParams('collect_items_enhanced', {
      item: 'oak_log',
    });
    expect(params.itemName).toBe('oak_log');
    expect(params.item).toBeUndefined();
  });

  it('strips exploreOnFail from collect_items_enhanced and warns', () => {
    const { params, warnings } = normalizeActionParams(
      'collect_items_enhanced',
      { item: 'oak_log', exploreOnFail: true }
    );
    expect(params.exploreOnFail).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('exploreOnFail');
  });

  it('applies alias: acquire_material blockType → item', () => {
    const { params } = normalizeActionParams('acquire_material', {
      blockType: 'oak_log',
    });
    expect(params.item).toBe('oak_log');
    expect(params.blockType).toBeUndefined();
  });

  it('injects defaults for acquire_material count', () => {
    const { params } = normalizeActionParams('acquire_material', {
      item: 'oak_log',
    });
    expect(params.count).toBe(1);
  });

  it('does not override existing values with defaults', () => {
    const { params } = normalizeActionParams('acquire_material', {
      item: 'oak_log',
      count: 5,
    });
    expect(params.count).toBe(5);
  });

  it('returns params unchanged for unknown action type', () => {
    const input = { foo: 'bar', baz: 42 };
    const { params, warnings } = normalizeActionParams('unknown_action', input);
    expect(params).toEqual(input);
    expect(warnings).toHaveLength(0);
  });

  it('normalization is idempotent', () => {
    const input = { block_type: 'stone', placement: 'around_player' };
    const first = normalizeActionParams('place_block', input);
    const second = normalizeActionParams('place_block', first.params);
    expect(second.params).toEqual(first.params);
  });

  it('applies alias: collect_items item → itemName', () => {
    const { params } = normalizeActionParams('collect_items', {
      item: 'oak_log',
    });
    expect(params.itemName).toBe('oak_log');
    expect(params.item).toBeUndefined();
  });

  it('injects defaults for consume_food', () => {
    const { params } = normalizeActionParams('consume_food', {});
    expect(params.food_type).toBe('any');
    expect(params.amount).toBe(1);
  });
});

describe('buildActionTypeToLeafMap', () => {
  it('matches ACTION_CONTRACTS entries', () => {
    const map = buildActionTypeToLeafMap();
    for (const [actionType, contract] of Object.entries(ACTION_CONTRACTS)) {
      expect(map[actionType]).toBe(contract.leafName);
    }
  });

  it('has an entry for every key in ACTION_CONTRACTS', () => {
    const map = buildActionTypeToLeafMap();
    expect(Object.keys(map).length).toBe(Object.keys(ACTION_CONTRACTS).length);
  });
});

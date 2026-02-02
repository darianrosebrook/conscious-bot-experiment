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

  it('preserves target key when alias source also present, warns and deletes source', () => {
    const { params, warnings } = normalizeActionParams('place_block', {
      item: 'stone',
      block_type: 'dirt',
    });
    // Target key 'item' wins, source key 'block_type' is deleted
    expect(params.item).toBe('stone');
    expect(params.block_type).toBeUndefined();
    // Should warn about the conflict
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.some(w => w.includes('alias conflict'))).toBe(true);
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

  it('applies smelt aliases: item → input, quantity → qty', () => {
    const { params } = normalizeActionParams('smelt', {
      item: 'raw_iron',
      quantity: 3,
    });
    expect(params.input).toBe('raw_iron');
    expect(params.qty).toBe(3);
    expect(params.item).toBeUndefined();
    expect(params.quantity).toBeUndefined();
  });

  it('applies smelt_item aliases identically', () => {
    const { params } = normalizeActionParams('smelt_item', {
      item: 'raw_gold',
      quantity: 1,
    });
    expect(params.input).toBe('raw_gold');
    expect(params.qty).toBe(1);
  });

  it('smelt defaults fuel to coal', () => {
    const { params } = normalizeActionParams('smelt', { input: 'raw_iron' });
    expect(params.fuel).toBe('coal');
  });

  it('reports missing required keys for acquire_material without item', () => {
    const { missingKeys } = normalizeActionParams('acquire_material', {});
    expect(missingKeys).toContain('item');
  });

  it('reports missing required keys for place_block without item', () => {
    const { missingKeys } = normalizeActionParams('place_block', {});
    expect(missingKeys).toContain('item');
  });

  it('no missing keys when required keys are present', () => {
    const { missingKeys } = normalizeActionParams('acquire_material', {
      item: 'oak_log',
    });
    expect(missingKeys).toHaveLength(0);
  });

  it('required keys check happens after alias application', () => {
    // blockType should be aliased to item, satisfying the requiredKeys check
    const { missingKeys } = normalizeActionParams('acquire_material', {
      blockType: 'oak_log',
    });
    expect(missingKeys).toHaveLength(0);
  });

  it('alias conflict: source key deleted even when target already set', () => {
    // If both block_type and item are present, target wins and source is deleted
    const { params } = normalizeActionParams('place_block', {
      item: 'stone',
      block_type: 'dirt',
    });
    expect(params.item).toBe('stone');
    expect(params.block_type).toBeUndefined();
  });

  it('alias conflict: warning includes both key names and values', () => {
    const { warnings } = normalizeActionParams('place_block', {
      item: 'stone',
      block_type: 'dirt',
    });
    const conflict = warnings.find(w => w.includes('alias conflict'));
    expect(conflict).toBeDefined();
    expect(conflict).toContain('block_type');
    expect(conflict).toContain('item');
  });

  it('alias conflict: no conflict when only source key present', () => {
    const { warnings } = normalizeActionParams('place_block', {
      block_type: 'stone',
    });
    expect(warnings.filter(w => w.includes('alias conflict'))).toHaveLength(0);
  });

  it('alias: null target treated as absent — alias fills from source', () => {
    const { params, warnings } = normalizeActionParams('place_block', {
      item: null,
      block_type: 'stone',
    });
    // item was null, so block_type fills it
    expect(params.item).toBe('stone');
    expect(params.block_type).toBeUndefined();
    // No conflict warning — null target is treated as absent
    expect(warnings.filter(w => w.includes('alias conflict'))).toHaveLength(0);
  });

  it('alias: null source key is ignored (not aliased)', () => {
    const { params } = normalizeActionParams('place_block', {
      block_type: null,
    });
    // block_type was null, so alias doesn't fire
    expect(params.block_type).toBeUndefined();
    expect(params.item).toBeUndefined();
  });

  it('defaults: null key filled by default', () => {
    const { params } = normalizeActionParams('acquire_material', {
      item: 'oak_log',
      count: null,
    });
    // count was null → default of 1 applied
    expect(params.count).toBe(1);
  });

  it('defaults: explicit value not overridden (only null/undefined filled)', () => {
    const { params } = normalizeActionParams('acquire_material', {
      item: 'oak_log',
      count: 0,
    });
    // count is 0 (falsy but not null/undefined) — default should NOT override
    expect(params.count).toBe(0);
  });

  it('craft aliases: item → recipe, quantity → qty', () => {
    const { params } = normalizeActionParams('craft', {
      item: 'stick',
      quantity: 4,
    });
    expect(params.recipe).toBe('stick');
    expect(params.qty).toBe(4);
    expect(params.item).toBeUndefined();
    expect(params.quantity).toBeUndefined();
  });

  it('craft defaults: qty defaults to 1', () => {
    const { params } = normalizeActionParams('craft', {
      item: 'stick',
    });
    expect(params.qty).toBe(1);
  });

  it('craft_item aliases identical to craft', () => {
    const { params } = normalizeActionParams('craft_item', {
      item: 'wooden_pickaxe',
      quantity: 1,
    });
    expect(params.recipe).toBe('wooden_pickaxe');
    expect(params.qty).toBe(1);
  });
});

describe('dispatchMode', () => {
  it('craft has dispatchMode: handler', () => {
    expect(ACTION_CONTRACTS['craft'].dispatchMode).toBe('handler');
  });

  it('smelt has dispatchMode: handler', () => {
    expect(ACTION_CONTRACTS['smelt'].dispatchMode).toBe('handler');
  });

  it('place_block has dispatchMode: guarded', () => {
    expect(ACTION_CONTRACTS['place_block'].dispatchMode).toBe('guarded');
  });

  it('collect_items_enhanced has dispatchMode: guarded', () => {
    expect(ACTION_CONTRACTS['collect_items_enhanced'].dispatchMode).toBe('guarded');
  });

  it('acquire_material defaults to leaf (no dispatchMode)', () => {
    expect(ACTION_CONTRACTS['acquire_material'].dispatchMode).toBeUndefined();
  });

  it('consume_food defaults to leaf (no dispatchMode)', () => {
    expect(ACTION_CONTRACTS['consume_food'].dispatchMode).toBeUndefined();
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

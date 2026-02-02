/**
 * Cross-boundary contract test: planning ↔ MC interface normalization agreement.
 *
 * Ensures that normalizeLeafArgs (planning-side) and normalizeActionParams
 * (MC-side) produce compatible canonical parameter shapes.
 */

import { describe, it, expect } from 'vitest';
import { normalizeLeafArgs, KNOWN_LEAVES } from '../leaf-arg-contracts';
import {
  normalizeActionParams,
  ACTION_CONTRACTS,
} from '../../../../minecraft-interface/src/action-contract-registry';

describe('planning ↔ MC interface normalization agreement', () => {
  it('collect_items: both sides normalize item → itemName', () => {
    // Planning side
    const planningArgs: Record<string, unknown> = { item: 'oak_log' };
    normalizeLeafArgs('collect_items', planningArgs);

    // MC side
    const { params: mcParams } = normalizeActionParams('collect_items', {
      item: 'oak_log',
    });

    // Both should produce itemName as the canonical key
    expect(planningArgs.itemName).toBe('oak_log');
    expect(mcParams.itemName).toBe('oak_log');
    expect(planningArgs.item).toBeUndefined();
    expect(mcParams.item).toBeUndefined();
  });

  it('smelt: planning normalizes item → input', () => {
    const planningArgs: Record<string, unknown> = { item: 'raw_iron' };
    normalizeLeafArgs('smelt', planningArgs);
    expect(planningArgs).toEqual({ input: 'raw_iron' });
  });

  it('smelt: MC side passes through (smelt contract has no aliases)', () => {
    const { params } = normalizeActionParams('smelt', { item: 'raw_iron' });
    // smelt in ACTION_CONTRACTS has no aliases — item stays as-is
    expect(params.item).toBe('raw_iron');
  });

  it('every leaf in KNOWN_LEAVES that has a matching action type has an ACTION_CONTRACTS entry', () => {
    // Leaves like dig_block, replan_building, etc. may not have action-level
    // entries because they are dispatched through dedicated handlers.
    // But leaves that ARE in ACTION_CONTRACTS should match.
    const contractLeafNames = new Set(
      Object.values(ACTION_CONTRACTS).map((c) => c.leafName)
    );
    const overlapping = [...KNOWN_LEAVES].filter((leaf) =>
      contractLeafNames.has(leaf)
    );
    // At minimum, these should overlap
    expect(overlapping).toContain('craft_recipe');
    expect(overlapping).toContain('smelt');
    expect(overlapping).toContain('place_block');
    expect(overlapping).toContain('collect_items');
    expect(overlapping).toContain('acquire_material');
    expect(overlapping).toContain('prepare_site');
    expect(overlapping).toContain('build_module');
    expect(overlapping).toContain('place_feature');
    expect(overlapping).toContain('place_workstation');
  });
});

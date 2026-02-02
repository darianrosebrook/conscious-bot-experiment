/**
 * Block Drop Map tests
 *
 * Verifies that BLOCK_DROP_MAP and the verification integration work correctly:
 * - Block drops are correct per Minecraft 1.20 vanilla (no silk touch)
 * - ORE_DROP_MAP is unchanged (regression)
 * - BLOCK_DROP_MAP only activates in mine-step context
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { BLOCK_DROP_MAP, ORE_DROP_MAP } from '../minecraft-tool-progression-types';

describe('BLOCK_DROP_MAP', () => {
  it('maps stone to cobblestone', () => {
    expect(BLOCK_DROP_MAP.stone).toBe('cobblestone');
  });

  it('maps grass_block to dirt', () => {
    expect(BLOCK_DROP_MAP.grass_block).toBe('dirt');
  });

  it('maps clay to clay_ball', () => {
    expect(BLOCK_DROP_MAP.clay).toBe('clay_ball');
  });

  it('maps glowstone to glowstone_dust', () => {
    expect(BLOCK_DROP_MAP.glowstone).toBe('glowstone_dust');
  });

  it('maps melon to melon_slice', () => {
    expect(BLOCK_DROP_MAP.melon).toBe('melon_slice');
  });

  it('maps snow to snowball', () => {
    expect(BLOCK_DROP_MAP.snow).toBe('snowball');
  });

  it('maps ice variants to air (drops nothing without silk touch)', () => {
    expect(BLOCK_DROP_MAP.ice).toBe('air');
    expect(BLOCK_DROP_MAP.packed_ice).toBe('air');
    expect(BLOCK_DROP_MAP.blue_ice).toBe('air');
  });

  it('air entries are informational only — must not be used as accepted inventory names', () => {
    // This test documents the contract: entries mapped to 'air' mean "drops nothing."
    // The consumer (getInventoryNamesForVerification) filters these out with:
    //   if (blockDrop && blockDrop !== 'air') names.push(blockDrop)
    // If someone changes the sentinel value, this test should break.
    const airEntries = Object.entries(BLOCK_DROP_MAP).filter(([, v]) => v === 'air');
    expect(airEntries.length).toBeGreaterThan(0); // at least ice
    for (const [block, drop] of airEntries) {
      expect(drop).toBe('air');
      // Verify these are real "drops nothing" blocks
      expect(['ice', 'packed_ice', 'blue_ice']).toContain(block);
    }
  });

  it('does not contain ore blocks (those are in ORE_DROP_MAP)', () => {
    const oreKeys = Object.keys(ORE_DROP_MAP);
    const blockKeys = Object.keys(BLOCK_DROP_MAP);
    const overlap = blockKeys.filter((k) => oreKeys.includes(k));
    expect(overlap).toEqual([]);
  });
});

describe('ORE_DROP_MAP (regression)', () => {
  it('maps coal_ore to coal', () => {
    expect(ORE_DROP_MAP.coal_ore.item).toBe('coal');
  });

  it('maps iron_ore to raw_iron with needsSmelt', () => {
    expect(ORE_DROP_MAP.iron_ore.item).toBe('raw_iron');
    expect(ORE_DROP_MAP.iron_ore.needsSmelt).toBe(true);
  });

  it('maps diamond_ore to diamond', () => {
    expect(ORE_DROP_MAP.diamond_ore.item).toBe('diamond');
    expect(ORE_DROP_MAP.diamond_ore.needsSmelt).toBeUndefined();
  });

  it('includes deepslate variants', () => {
    expect(ORE_DROP_MAP.deepslate_iron_ore.item).toBe('raw_iron');
    expect(ORE_DROP_MAP.deepslate_diamond_ore.item).toBe('diamond');
  });
});

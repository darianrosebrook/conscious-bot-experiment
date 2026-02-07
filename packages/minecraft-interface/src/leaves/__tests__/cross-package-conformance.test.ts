/**
 * Cross-Package Conformance Test
 *
 * Verifies that parsePlaceAction and WORKSTATION_TYPES in crafting-leaves.ts
 * (minecraft-interface) produce identical results to the copies in leaf-routing.ts
 * (planning). This catches drift between the two packages.
 *
 * The planning package can't import from minecraft-interface, so the
 * conformance test lives here (minecraft-interface depends on planning).
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  parsePlaceAction as interfaceParsePlaceAction,
  WORKSTATION_TYPES as interfaceWorkstationTypes,
  WORKSTATION_SEARCH_RADIUS,
  MAX_NEARBY_WORKSTATIONS,
} from '../crafting-leaves';
import {
  parsePlaceAction as planningParsePlaceAction,
  WORKSTATION_TYPES as planningWorkstationTypes,
} from '@conscious-bot/planning';

/**
 * Canonical test vectors for parsePlaceAction. If you add a case here,
 * also add it to leaf-routing-conformance.test.ts to keep the planning-
 * side test in sync.
 */
const PARSE_VECTORS: Array<[string | undefined, string | null]> = [
  // Valid
  ['place:crafting_table', 'crafting_table'],
  ['place:furnace', 'furnace'],
  ['place:blast_furnace', 'blast_furnace'],
  ['place:stone', 'stone'],
  ['place:oak_planks', 'oak_planks'],
  // Invalid — null expected
  ['place:', null],
  [undefined, null],
  ['mine:stone', null],
  ['tp:craft:furnace', null],
  ['', null],
  ['place', null],
  ['place:a:b', null],
  ['Place:stone', null], // case-sensitive prefix
  [' place:stone', null], // leading space
  ['place: stone', ' stone'], // space in item — parser preserves it (Minecraft has no such item)
];

describe('Cross-Package Conformance: parsePlaceAction', () => {
  for (const [input, expected] of PARSE_VECTORS) {
    it(`parsePlaceAction(${JSON.stringify(input)}) — both packages agree → ${JSON.stringify(expected)}`, () => {
      const interfaceResult = interfaceParsePlaceAction(input);
      const planningResult = planningParsePlaceAction(input);

      // Both must produce the expected value
      expect(interfaceResult).toBe(expected);
      expect(planningResult).toBe(expected);

      // Both must agree with each other
      expect(interfaceResult).toBe(planningResult);
    });
  }
});

describe('Cross-Package Conformance: WORKSTATION_TYPES', () => {
  it('both packages have the same workstation types', () => {
    const interfaceTypes = [...interfaceWorkstationTypes].sort();
    const planningTypes = [...planningWorkstationTypes].sort();
    expect(interfaceTypes).toEqual(planningTypes);
  });

  it('both sets have the same size', () => {
    expect(interfaceWorkstationTypes.size).toBe(planningWorkstationTypes.size);
  });

  it('membership agrees for all canonical types', () => {
    const allTypes = [
      'crafting_table',
      'furnace',
      'blast_furnace',
      'stone',
      'diamond_block',
    ];
    for (const t of allTypes) {
      expect(interfaceWorkstationTypes.has(t)).toBe(
        planningWorkstationTypes.has(t)
      );
    }
  });
});

describe('Cross-Package Conformance: Constants', () => {
  it('WORKSTATION_SEARCH_RADIUS is a positive integer', () => {
    expect(WORKSTATION_SEARCH_RADIUS).toBeGreaterThan(0);
    expect(Number.isInteger(WORKSTATION_SEARCH_RADIUS)).toBe(true);
  });

  it('MAX_NEARBY_WORKSTATIONS is a positive integer > 1', () => {
    expect(MAX_NEARBY_WORKSTATIONS).toBeGreaterThan(1);
    expect(Number.isInteger(MAX_NEARBY_WORKSTATIONS)).toBe(true);
  });
});

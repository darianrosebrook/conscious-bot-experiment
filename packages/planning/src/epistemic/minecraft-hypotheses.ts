/**
 * Minecraft Hypothesis Definitions — Domain-Specific P11 Content
 *
 * Defines hypothesis sets for Minecraft epistemic planning tasks:
 *   - Structure localization (villages, temples, bastions)
 *   - Resource localization (diamond layer, biome-specific resources)
 *
 * Uses P11 capsule types only — no Sterling or solver imports.
 */

import type { P11HypothesisV1 } from '../sterling/primitives/p11/p11-capsule-types';

// -- Direction Constants -----------------------------------------------------

export const DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
export type Direction = (typeof DIRECTIONS)[number];

// -- Structure Localization Hypotheses ---------------------------------------

/**
 * Village search hypotheses: one per cardinal direction + "no village."
 *
 * Each hypothesis has features that probes can discriminate against:
 *   - biome: what biome the village is in (plains, desert, savanna, taiga)
 *   - expected_mobs: what entities indicate proximity
 *   - region: which direction to search
 */
export const VILLAGE_HYPOTHESES: P11HypothesisV1[] = [
  {
    id: 'village_north',
    description: 'Village to the north in plains biome',
    features: { region: 'north', biome: 'plains', expected_mobs: 'villager' },
  },
  {
    id: 'village_south',
    description: 'Village to the south in savanna biome',
    features: { region: 'south', biome: 'savanna', expected_mobs: 'villager' },
  },
  {
    id: 'village_east',
    description: 'Village to the east in desert biome',
    features: { region: 'east', biome: 'desert', expected_mobs: 'villager' },
  },
  {
    id: 'village_west',
    description: 'Village to the west in taiga biome',
    features: { region: 'west', biome: 'taiga', expected_mobs: 'villager' },
  },
  {
    id: 'no_village',
    description: 'No village within search range',
    features: { region: 'none', biome: 'any', expected_mobs: 'none' },
  },
];

/**
 * Temple search hypotheses: one per cardinal direction + "no temple."
 */
export const TEMPLE_HYPOTHESES: P11HypothesisV1[] = [
  {
    id: 'temple_north',
    description: 'Temple to the north',
    features: { region: 'north', biome: 'desert', structure_type: 'temple' },
  },
  {
    id: 'temple_south',
    description: 'Temple to the south',
    features: { region: 'south', biome: 'jungle', structure_type: 'temple' },
  },
  {
    id: 'temple_east',
    description: 'Temple to the east',
    features: { region: 'east', biome: 'desert', structure_type: 'temple' },
  },
  {
    id: 'no_temple',
    description: 'No temple within search range',
    features: { region: 'none', biome: 'any', structure_type: 'none' },
  },
];

// -- Resource Localization Hypotheses ----------------------------------------

/**
 * Diamond layer depth hypotheses.
 * In Minecraft, diamonds spawn between y=-64 and y=16 with peak at y=-59.
 */
export const DIAMOND_DEPTH_HYPOTHESES: P11HypothesisV1[] = [
  {
    id: 'diamond_deep',
    description: 'Best diamond yield at deep levels (y < -50)',
    features: { depth_range: 'deep', ore_type: 'diamond', y_indicator: -59 },
  },
  {
    id: 'diamond_mid',
    description: 'Moderate diamond yield at mid levels (-50 < y < -20)',
    features: { depth_range: 'mid', ore_type: 'diamond', y_indicator: -35 },
  },
  {
    id: 'diamond_shallow',
    description: 'Low diamond yield at shallow levels (y > -20)',
    features: { depth_range: 'shallow', ore_type: 'diamond', y_indicator: -10 },
  },
];

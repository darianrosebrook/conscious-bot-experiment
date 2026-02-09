/**
 * Minecraft Farm Layout Specifications
 *
 * Defines behavioral specifications for farm synthesis.
 * Uses the domain-agnostic P08 types.
 */

import type {
  P08BehavioralSpecV1,
  P08DesignOperatorV1,
} from '../sterling/primitives/p08/p08-capsule-types.js';

/**
 * Minecraft farm design operators.
 *
 * These represent the atomic design actions for farm layout synthesis:
 * - water: Water source block (irrigates farmland within 4 blocks)
 * - farmland: Tilled soil for crops
 * - torch: Light source (prevents mob spawning, helps growth)
 * - path: Walking path (for harvesting access)
 */
export const MINECRAFT_FARM_OPERATORS: readonly P08DesignOperatorV1[] = [
  {
    id: 'place_water_source',
    name: 'Place water source',
    cellType: 'water',
    cost: 5,
  },
  {
    id: 'place_farmland',
    name: 'Place farmland block',
    cellType: 'farmland',
    cost: 1,
  },
  {
    id: 'place_torch',
    name: 'Place torch',
    cellType: 'torch',
    cost: 2,
  },
  {
    id: 'place_path',
    name: 'Place walking path',
    cellType: 'path',
    cost: 1,
  },
];

/**
 * Standard Minecraft farm specs.
 *
 * Water irrigates farmland within 4 blocks (Manhattan distance).
 * Torches provide light level 14 at source, dropping 1 per block.
 * Minimum light level 9 needed for crop growth.
 */
export const MINECRAFT_FARM_SPECS: readonly P08BehavioralSpecV1[] = [
  {
    id: 'mc_basic_9x9_farm',
    name: 'Basic 9x9 Minecraft Farm',
    params: {
      water: 1,       // Central water source
      farmland: 16,   // 16 farmland blocks minimum
      torch: 4,       // 4 corner torches
    },
    maxFootprint: { width: 9, depth: 9 },
  },
  {
    id: 'mc_compact_5x5_farm',
    name: 'Compact 5x5 Minecraft Farm',
    params: {
      water: 1,
      farmland: 8,
    },
    maxFootprint: { width: 5, depth: 5 },
  },
  {
    id: 'mc_double_farm',
    name: 'Double Water Source Farm',
    params: {
      water: 2,       // Two water sources
      farmland: 24,
      torch: 6,
    },
    maxFootprint: { width: 9, depth: 18 },
  },
];

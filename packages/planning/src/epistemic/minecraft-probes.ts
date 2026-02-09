/**
 * Minecraft Probe Operator Definitions — Domain-Specific P11 Content
 *
 * Defines probe operators that map to Minecraft sensing actions.
 * Each probe has a cost vector and produces evidence for hypothesis discrimination.
 *
 * Uses P11 capsule types only — no Sterling or solver imports.
 */

import type { P11ProbeOperatorV1 } from '../sterling/primitives/p11/p11-capsule-types';

// -- Minecraft Probe Operators -----------------------------------------------

/**
 * Probe operators for structure localization tasks.
 *
 * Ordered by information-density: cheaper probes first,
 * though the P11 adapter selects by information gain, not order.
 */
export const MINECRAFT_STRUCTURE_PROBES: P11ProbeOperatorV1[] = [
  {
    id: 'biome_sample',
    name: 'Sample biome features',
    description: 'Check local blocks and vegetation to identify biome type',
    cost: { timeTicks: 50, risk: 0.1, resource: 0 },
  },
  {
    id: 'mob_mix_sample',
    name: 'Observe mob types',
    description: 'Check which mobs spawn in the current area',
    cost: { timeTicks: 80, risk: 0.3, resource: 0 },
  },
  {
    id: 'travel_to_vantage',
    name: 'Travel to vantage point',
    description: 'Move to high ground for extended visibility',
    cost: { timeTicks: 100, risk: 0.2, resource: 0 },
  },
  {
    id: 'terrain_follow',
    name: 'Follow terrain feature',
    description: 'Follow a river or path toward expected structure location',
    cost: { timeTicks: 200, risk: 0.2, resource: 0 },
  },
];

/**
 * Probe operators for resource localization tasks (mining depth selection).
 */
export const MINECRAFT_MINING_PROBES: P11ProbeOperatorV1[] = [
  {
    id: 'dig_test_shaft',
    name: 'Dig test shaft',
    description: 'Dig a short vertical shaft to sample ore density at this depth',
    cost: { timeTicks: 120, risk: 0.1, resource: 0.2 },
  },
  {
    id: 'branch_sample',
    name: 'Branch mine sample',
    description: 'Mine a short branch to observe ore frequency',
    cost: { timeTicks: 200, risk: 0.15, resource: 0.3 },
  },
  {
    id: 'check_y_level',
    name: 'Check Y level',
    description: 'Verify current depth against known ore distribution tables',
    cost: { timeTicks: 10, risk: 0, resource: 0 },
  },
];

/**
 * All Minecraft probe operators (combined).
 */
export const ALL_MINECRAFT_PROBES: P11ProbeOperatorV1[] = [
  ...MINECRAFT_STRUCTURE_PROBES,
  ...MINECRAFT_MINING_PROBES,
];

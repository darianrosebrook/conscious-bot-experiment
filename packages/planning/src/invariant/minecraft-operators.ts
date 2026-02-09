/**
 * Minecraft Maintenance Operators — Restore actions for survival metrics
 *
 * Maps Minecraft actions to P12 maintenance operators.
 * Each operator targets a specific metric slot and restores it.
 */

import type { P12MaintenanceOperatorV1 } from '../sterling/primitives/p12/p12-capsule-types.js';

/**
 * Minecraft maintenance operators.
 *
 * These represent actions the bot can take to restore depleted metrics:
 * - eat_food: Consume food to restore hunger
 * - heal_up: Use golden apple or regeneration to restore health
 * - repair_tool: Craft or switch to a fresh tool
 * - place_torches: Illuminate the area
 * - retreat_to_safety: Move away from threats
 * - seek_shelter: Find or build shelter before nightfall
 */
export const MINECRAFT_MAINTENANCE_OPERATORS: readonly P12MaintenanceOperatorV1[] = [
  {
    id: 'eat_food',
    name: 'Eat food',
    targetSlotId: 'food_level',
    restoreAmount: 2,
    cost: { resource: 0.1, disruption: 0.1, risk: 0 },
  },
  {
    id: 'heal_up',
    name: 'Heal up',
    targetSlotId: 'health_level',
    restoreAmount: 2,
    cost: { resource: 0.2, disruption: 0.1, risk: 0 },
  },
  {
    id: 'repair_tool',
    name: 'Repair/replace tool',
    targetSlotId: 'tool_durability',
    restoreAmount: 4,
    cost: { resource: 0.3, disruption: 0.3, risk: 0 },
  },
  {
    id: 'place_torches',
    name: 'Place torches for light',
    targetSlotId: 'light_coverage',
    restoreAmount: 2,
    cost: { resource: 0.2, disruption: 0.2, risk: 0.1 },
  },
  {
    id: 'retreat_to_safety',
    name: 'Retreat to safe zone',
    targetSlotId: 'threat_exposure',
    restoreAmount: 4,
    cost: { resource: 0, disruption: 0.5, risk: 0.1 },
  },
  {
    id: 'seek_shelter',
    name: 'Seek shelter before night',
    targetSlotId: 'time_to_night',
    restoreAmount: 0, // Time doesn't restore; action is preventive
    cost: { resource: 0, disruption: 0.4, risk: 0.2 },
  },
];

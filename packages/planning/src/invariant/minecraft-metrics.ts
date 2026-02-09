/**
 * Minecraft Invariant Metrics — Concrete metric slot definitions
 *
 * Maps Minecraft survival mechanics to P12 metric slots.
 * Uses the domain-agnostic P12 capsule types.
 */

import type {
  P12DriftRateV1,
  P12MetricSlotV1,
} from '../sterling/primitives/p12/p12-capsule-types.js';

/**
 * Minecraft survival metric slots.
 *
 * 6 metrics track the bot's survival state:
 * - food_level: Hunger bar (0-20), depletes with activity
 * - health_level: Hearts (0-20), depletes from damage/starvation
 * - tool_durability: Normalized (0-1), depletes with use
 * - light_coverage: Normalized (0-1), decreases away from torches
 * - threat_exposure: Normalized (0-1), set by hazard summary (no drift)
 * - time_to_night: Ticks (0-12000), linear countdown
 */
export const MINECRAFT_METRIC_SLOTS: readonly P12MetricSlotV1[] = [
  {
    id: 'food_level',
    name: 'Food Level',
    warnThreshold: 2,
    criticalThreshold: 1,
    range: { min: 0, max: 20 },
    drifts: true,
  },
  {
    id: 'health_level',
    name: 'Health Level',
    warnThreshold: 2,
    criticalThreshold: 1,
    range: { min: 0, max: 20 },
    drifts: true,
  },
  {
    id: 'tool_durability',
    name: 'Tool Durability',
    warnThreshold: 1,
    criticalThreshold: 0,
    range: { min: 0, max: 1 },
    drifts: true,
  },
  {
    id: 'light_coverage',
    name: 'Light Coverage',
    warnThreshold: 2,
    criticalThreshold: 1,
    range: { min: 0, max: 1 },
    drifts: true,
  },
  {
    id: 'threat_exposure',
    name: 'Threat Exposure',
    warnThreshold: 3,
    criticalThreshold: 4,
    range: { min: 0, max: 1 },
    drifts: false, // Set externally by I-ext hazard summary
  },
  {
    id: 'time_to_night',
    name: 'Time to Night',
    warnThreshold: 1,
    criticalThreshold: 0,
    range: { min: 0, max: 12000 },
    drifts: true,
  },
];

/**
 * Minecraft drift rates.
 *
 * Rates are in bucket-fraction units per game tick:
 * - food_level: ~1 bucket per 1000 ticks (~50 seconds)
 * - health_level: ~1 bucket per 5000 ticks (~4 minutes, passive)
 * - tool_durability: ~1 bucket per 2000 ticks (depends on use)
 * - light_coverage: ~1 bucket per 3333 ticks (movement-based)
 * - threat_exposure: 0 (external; set by hazard summary)
 * - time_to_night: linear countdown (~1 bucket per 2400 ticks)
 */
export const MINECRAFT_DRIFT_RATES: readonly P12DriftRateV1[] = [
  { slotId: 'food_level', decayPerTick: 0.001 },
  { slotId: 'health_level', decayPerTick: 0.0002 },
  { slotId: 'tool_durability', decayPerTick: 0.0005 },
  { slotId: 'light_coverage', decayPerTick: 0.0003 },
  { slotId: 'threat_exposure', decayPerTick: 0 },
  { slotId: 'time_to_night', decayPerTick: 1 / 2400 },
];

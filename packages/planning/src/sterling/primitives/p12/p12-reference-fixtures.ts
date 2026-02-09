/**
 * P12 Reference Fixtures — Two-Domain Portability Proof
 *
 * Domain 1: Minecraft Survival — food, health, tool durability, light, threat, night
 * Domain 2: Vehicle Maintenance — fuel, oil, tire pressure, engine temp
 *
 * Both domains use the same P12 capsule contract, proving domain-agnosticism.
 *
 * Zero Minecraft runtime imports. Zero vitest imports.
 */

import type {
  P12DriftRateV1,
  P12MaintenanceOperatorV1,
  P12MetricSlotV1,
} from './p12-capsule-types.js';

// ── Domain 1: Minecraft Survival ─────────────────────────────────────

export const SURVIVAL_SLOTS: readonly P12MetricSlotV1[] = [
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
    drifts: false, // Set externally by hazard summary
  },
  {
    id: 'time_to_night',
    name: 'Time to Night',
    warnThreshold: 1,
    criticalThreshold: 0,
    range: { min: 0, max: 12000 },
    drifts: true,
  },
] as const;

export const SURVIVAL_DRIFT_RATES: readonly P12DriftRateV1[] = [
  { slotId: 'food_level', decayPerTick: 0.001 },
  { slotId: 'health_level', decayPerTick: 0.0002 },
  { slotId: 'tool_durability', decayPerTick: 0.0005 },
  { slotId: 'light_coverage', decayPerTick: 0.0003 },
  { slotId: 'threat_exposure', decayPerTick: 0 }, // No drift; external
  { slotId: 'time_to_night', decayPerTick: 1 / 2400 },
];

export const SURVIVAL_OPERATORS: readonly P12MaintenanceOperatorV1[] = [
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

// ── Domain 2: Vehicle Maintenance ────────────────────────────────────

export const VEHICLE_SLOTS: readonly P12MetricSlotV1[] = [
  {
    id: 'fuel_level',
    name: 'Fuel Level',
    warnThreshold: 1,
    criticalThreshold: 0,
    range: { min: 0, max: 100 },
    drifts: true,
  },
  {
    id: 'oil_quality',
    name: 'Oil Quality',
    warnThreshold: 2,
    criticalThreshold: 1,
    range: { min: 0, max: 1 },
    drifts: true,
  },
  {
    id: 'tire_pressure',
    name: 'Tire Pressure',
    warnThreshold: 2,
    criticalThreshold: 1,
    range: { min: 0, max: 45 },
    drifts: true,
  },
  {
    id: 'engine_temp',
    name: 'Engine Temperature',
    warnThreshold: 3,
    criticalThreshold: 4,
    range: { min: 0, max: 120 },
    drifts: false, // Set by driving conditions
  },
];

export const VEHICLE_DRIFT_RATES: readonly P12DriftRateV1[] = [
  { slotId: 'fuel_level', decayPerTick: 0.002 },
  { slotId: 'oil_quality', decayPerTick: 0.0001 },
  { slotId: 'tire_pressure', decayPerTick: 0.0003 },
  { slotId: 'engine_temp', decayPerTick: 0 }, // External
];

export const VEHICLE_OPERATORS: readonly P12MaintenanceOperatorV1[] = [
  {
    id: 'refuel',
    name: 'Refuel vehicle',
    targetSlotId: 'fuel_level',
    restoreAmount: 4,
    cost: { resource: 0.3, disruption: 0.4, risk: 0 },
  },
  {
    id: 'change_oil',
    name: 'Change oil',
    targetSlotId: 'oil_quality',
    restoreAmount: 4,
    cost: { resource: 0.4, disruption: 0.6, risk: 0 },
  },
  {
    id: 'inflate_tires',
    name: 'Inflate tires',
    targetSlotId: 'tire_pressure',
    restoreAmount: 3,
    cost: { resource: 0.1, disruption: 0.3, risk: 0 },
  },
  {
    id: 'cool_engine',
    name: 'Cool down engine',
    targetSlotId: 'engine_temp',
    restoreAmount: 3,
    cost: { resource: 0, disruption: 0.5, risk: 0.1 },
  },
];

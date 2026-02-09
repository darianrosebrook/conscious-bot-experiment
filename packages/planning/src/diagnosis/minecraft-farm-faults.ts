/**
 * Minecraft Farm Faults — P15 Domain Module
 *
 * Maps Minecraft farm failure modes to the P15 fault diagnosis contract.
 * Pure configuration — no adapter classes, no logic.
 *
 * Fault model: a farm can fail because soil is dry, light is too low,
 * the wrong crop was planted, or farmland was trampled by entities.
 * Each fault has diagnostic probes, repair actions, and validation checks.
 *
 * Zero vitest imports.
 */

import type {
  P11HypothesisV1,
  P11ProbeOperatorV1,
  P15RepairActionV1,
  P15ValidationProbeV1,
  P15DiagnosisParamsV1,
} from '../sterling/primitives/p15/p15-capsule-types.js';

import {
  DEFAULT_DIAGNOSIS_THRESHOLD,
  DEFAULT_MIN_INFO_GAIN,
  MAX_DIAGNOSIS_STEPS,
} from '../sterling/primitives/p15/p15-capsule-types.js';

// -- Fault Hypotheses --------------------------------------------------------

export const MINECRAFT_FARM_FAULT_HYPOTHESES: readonly P11HypothesisV1[] = [
  {
    id: 'fault_dry_soil',
    description: 'Farmland is not hydrated — no water source within 4 blocks',
    features: { soil_moisture: 'dry', light_level: 'adequate', crop_type: 'wheat' },
  },
  {
    id: 'fault_low_light',
    description: 'Light level below 8 — crops cannot grow',
    features: { soil_moisture: 'wet', light_level: 'dark', crop_type: 'wheat' },
  },
  {
    id: 'fault_wrong_crop',
    description: 'Crop type incompatible with biome or soil',
    features: { soil_moisture: 'wet', light_level: 'adequate', crop_type: 'cactus' },
  },
  {
    id: 'fault_trampled',
    description: 'Farmland block converted to dirt by entity jump',
    features: { soil_moisture: 'wet', light_level: 'adequate', crop_type: 'wheat' },
  },
] as const;

// -- Diagnostic Probes -------------------------------------------------------

export const MINECRAFT_FARM_FAULT_PROBES: readonly P11ProbeOperatorV1[] = [
  {
    id: 'check_moisture',
    name: 'Check soil moisture',
    description: 'Inspect farmland block hydration state (wet/dry)',
    cost: { timeTicks: 5, risk: 0, resource: 0 },
  },
  {
    id: 'check_light',
    name: 'Check light level',
    description: 'Measure block light level above crop position',
    cost: { timeTicks: 3, risk: 0, resource: 0 },
  },
  {
    id: 'check_crop_type',
    name: 'Identify planted crop',
    description: 'Inspect crop block to determine variety',
    cost: { timeTicks: 2, risk: 0, resource: 0 },
  },
  {
    id: 'check_blockstate',
    name: 'Inspect block state',
    description: 'Check whether block is farmland or reverted to dirt',
    cost: { timeTicks: 3, risk: 0, resource: 0 },
  },
] as const;

// -- Repair Actions ----------------------------------------------------------

export const MINECRAFT_FARM_FAULT_REPAIRS: readonly P15RepairActionV1[] = [
  {
    id: 'repair_add_water',
    name: 'Place water source block',
    cost: 2,
    applicableHypothesisIds: ['fault_dry_soil'],
  },
  {
    id: 'repair_add_torch',
    name: 'Place torch for lighting',
    cost: 1,
    applicableHypothesisIds: ['fault_low_light'],
  },
  {
    id: 'repair_replant',
    name: 'Replant with correct crop',
    cost: 1,
    applicableHypothesisIds: ['fault_wrong_crop'],
  },
  {
    id: 'repair_retill',
    name: 'Hoe dirt back to farmland and replant',
    cost: 3,
    applicableHypothesisIds: ['fault_trampled'],
  },
  {
    id: 'repair_fence',
    name: 'Build fence perimeter to prevent trampling',
    cost: 5,
    applicableHypothesisIds: ['fault_trampled'],
  },
] as const;

// -- Validation Probes -------------------------------------------------------

export const MINECRAFT_FARM_FAULT_VALIDATIONS: readonly P15ValidationProbeV1[] = [
  {
    id: 'validate_water',
    repairId: 'repair_add_water',
    asP11Probe: {
      id: 'validate_moisture_probe',
      name: 'Post-repair moisture check',
      description: 'Re-check soil moisture after water placement',
      cost: { timeTicks: 3, risk: 0, resource: 0 },
    },
    expectedSuccessValue: 'wet',
    evidenceType: 'soil_moisture',
  },
  {
    id: 'validate_torch',
    repairId: 'repair_add_torch',
    asP11Probe: {
      id: 'validate_light_probe',
      name: 'Post-repair light check',
      description: 'Re-measure light level after torch placement',
      cost: { timeTicks: 2, risk: 0, resource: 0 },
    },
    expectedSuccessValue: 'adequate',
    evidenceType: 'light_level',
  },
  {
    id: 'validate_replant',
    repairId: 'repair_replant',
    asP11Probe: {
      id: 'validate_crop_probe',
      name: 'Post-replant crop check',
      description: 'Verify correct crop is planted and growing',
      cost: { timeTicks: 5, risk: 0, resource: 0 },
    },
    expectedSuccessValue: 'wheat',
    evidenceType: 'crop_type',
  },
  {
    id: 'validate_retill',
    repairId: 'repair_retill',
    asP11Probe: {
      id: 'validate_soil_probe',
      name: 'Post-retill soil check',
      description: 'Verify farmland block is restored',
      cost: { timeTicks: 3, risk: 0, resource: 0 },
    },
    expectedSuccessValue: 'farmland',
    evidenceType: 'block_type',
  },
  {
    id: 'validate_fence',
    repairId: 'repair_fence',
    asP11Probe: {
      id: 'validate_fence_probe',
      name: 'Post-fence perimeter check',
      description: 'Verify fence fully encloses farm area',
      cost: { timeTicks: 8, risk: 0, resource: 0 },
    },
    expectedSuccessValue: 'enclosed',
    evidenceType: 'enclosure_status',
  },
] as const;

// -- Default Parameters ------------------------------------------------------

export const MINECRAFT_FARM_DIAGNOSIS_PARAMS: P15DiagnosisParamsV1 = {
  maxSteps: MAX_DIAGNOSIS_STEPS,
  confidenceThreshold: DEFAULT_DIAGNOSIS_THRESHOLD,
  minInfoGain: DEFAULT_MIN_INFO_GAIN,
};

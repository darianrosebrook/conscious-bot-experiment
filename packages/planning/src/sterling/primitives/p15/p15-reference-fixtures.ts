/**
 * P15 Reference Fixtures — Multi-Domain Test Data
 *
 * Provides fixture data for two domains to prove P15 portability:
 *   1. CI Pipeline Faults (reuses P11 fault diagnosis hypotheses/probes)
 *   2. Farm Hydration Faults (Minecraft-flavored: crop failure diagnosis)
 *
 * P15 fixtures extend P11 fixtures by adding:
 *   - Repair actions (fix the diagnosed fault)
 *   - Validation probes (confirm the repair worked)
 *   - Observation providers (deterministic oracles for tests)
 *
 * Zero Minecraft imports. Zero vitest imports.
 */

import type {
  P11HypothesisV1,
  P11ProbeOperatorV1,
  P11ObservedEvidenceV1,
} from '../p11/p11-capsule-types.js';

import type {
  P15RepairActionV1,
  P15ValidationProbeV1,
  P15DiagnosisParamsV1,
  P15ObservationProvider,
} from './p15-capsule-types.js';

import {
  MAX_DIAGNOSIS_STEPS,
  DEFAULT_DIAGNOSIS_THRESHOLD,
  DEFAULT_MIN_INFO_GAIN,
} from './p15-capsule-types.js';

// ============================================================================
// Domain 1: CI Pipeline Faults
// Reuses P11 FAULT_HYPOTHESES and FAULT_PROBES — adds repairs + validations
// ============================================================================

// -- Hypotheses (reused from P11, re-declared for self-containment) ----------

export const CI_FAULT_HYPOTHESES: P11HypothesisV1[] = [
  {
    id: 'fault_auth',
    description: 'Authentication module is failing',
    features: { component: 'auth', test_result: 'auth_fail', log_entry: 'auth_error' },
  },
  {
    id: 'fault_db',
    description: 'Database connection is failing',
    features: { component: 'database', test_result: 'db_fail', log_entry: 'db_timeout' },
  },
  {
    id: 'fault_network',
    description: 'Network layer is failing',
    features: { component: 'network', test_result: 'net_fail', log_entry: 'conn_refused' },
  },
  {
    id: 'fault_config',
    description: 'Configuration is invalid',
    features: { component: 'config', test_result: 'config_pass', log_entry: 'invalid_config' },
  },
];

// -- Diagnostic Probes (reused from P11) -------------------------------------

export const CI_FAULT_PROBES: P11ProbeOperatorV1[] = [
  {
    id: 'run_unit_test',
    name: 'Run unit tests',
    description: 'Execute component unit tests to isolate failure',
    cost: { timeTicks: 30, risk: 0, resource: 0.1 },
  },
  {
    id: 'check_error_log',
    name: 'Check error logs',
    description: 'Inspect error logs for diagnostic messages',
    cost: { timeTicks: 10, risk: 0, resource: 0 },
  },
  {
    id: 'inspect_config',
    name: 'Inspect configuration',
    description: 'Check if configuration is valid',
    cost: { timeTicks: 5, risk: 0, resource: 0 },
  },
  {
    id: 'network_probe',
    name: 'Network connectivity check',
    description: 'Test network connectivity to dependencies',
    cost: { timeTicks: 15, risk: 0, resource: 0.05 },
  },
];

// -- Repairs -----------------------------------------------------------------

export const CI_FAULT_REPAIRS: P15RepairActionV1[] = [
  {
    id: 'repair_auth_token',
    name: 'Regenerate auth token',
    cost: 1,
    applicableHypothesisIds: ['fault_auth'],
  },
  {
    id: 'repair_auth_module',
    name: 'Restart auth module',
    cost: 3,
    applicableHypothesisIds: ['fault_auth'],
  },
  {
    id: 'repair_db_reconnect',
    name: 'Reconnect database',
    cost: 2,
    applicableHypothesisIds: ['fault_db'],
  },
  {
    id: 'repair_db_restart',
    name: 'Restart database service',
    cost: 5,
    applicableHypothesisIds: ['fault_db'],
  },
  {
    id: 'repair_network_reset',
    name: 'Reset network interface',
    cost: 2,
    applicableHypothesisIds: ['fault_network'],
  },
  {
    id: 'repair_config_reload',
    name: 'Reload configuration',
    cost: 1,
    applicableHypothesisIds: ['fault_config'],
  },
];

// -- Validation Probes -------------------------------------------------------

export const CI_FAULT_VALIDATIONS: P15ValidationProbeV1[] = [
  {
    id: 'validate_auth_token',
    repairId: 'repair_auth_token',
    asP11Probe: {
      id: 'validate_auth_probe',
      name: 'Auth health check',
      description: 'Check that auth module responds correctly',
      cost: { timeTicks: 5, risk: 0, resource: 0 },
    },
    expectedSuccessValue: 'healthy',
    evidenceType: 'health_check',
  },
  {
    id: 'validate_auth_module',
    repairId: 'repair_auth_module',
    asP11Probe: {
      id: 'validate_auth_module_probe',
      name: 'Auth module health check',
      description: 'Check that restarted auth module responds',
      cost: { timeTicks: 5, risk: 0, resource: 0 },
    },
    expectedSuccessValue: 'healthy',
    evidenceType: 'health_check',
  },
  {
    id: 'validate_db_reconnect',
    repairId: 'repair_db_reconnect',
    asP11Probe: {
      id: 'validate_db_probe',
      name: 'Database health check',
      description: 'Check that database responds to queries',
      cost: { timeTicks: 5, risk: 0, resource: 0 },
    },
    expectedSuccessValue: 'connected',
    evidenceType: 'db_status',
  },
  {
    id: 'validate_db_restart',
    repairId: 'repair_db_restart',
    asP11Probe: {
      id: 'validate_db_restart_probe',
      name: 'Database service health check',
      description: 'Check that restarted database is operational',
      cost: { timeTicks: 10, risk: 0, resource: 0 },
    },
    expectedSuccessValue: 'connected',
    evidenceType: 'db_status',
  },
  {
    id: 'validate_network_reset',
    repairId: 'repair_network_reset',
    asP11Probe: {
      id: 'validate_network_probe',
      name: 'Network health check',
      description: 'Check that network connectivity is restored',
      cost: { timeTicks: 5, risk: 0, resource: 0 },
    },
    expectedSuccessValue: 'reachable',
    evidenceType: 'network_status',
  },
  {
    id: 'validate_config_reload',
    repairId: 'repair_config_reload',
    asP11Probe: {
      id: 'validate_config_probe',
      name: 'Config validation check',
      description: 'Check that reloaded config passes validation',
      cost: { timeTicks: 2, risk: 0, resource: 0 },
    },
    expectedSuccessValue: 'valid',
    evidenceType: 'config_status',
  },
];

// -- Observation Providers ---------------------------------------------------

/**
 * Deterministic observation provider for CI faults.
 * Always returns evidence consistent with `targetFault`.
 * Used by tests to simulate a specific ground-truth fault.
 */
export function makeCIObservationProvider(
  targetFault: string,
  repairSucceeds: boolean = true,
): P15ObservationProvider {
  return (probeId: string, hypotheses: readonly P11HypothesisV1[]): P11ObservedEvidenceV1 => {
    const hyp = hypotheses.find((h) => h.id === targetFault);

    // Validation probes
    if (probeId.startsWith('validate_')) {
      return {
        probeId,
        payload: {
          type: getValidationEvidenceType(probeId),
          value: repairSucceeds ? getValidationSuccessValue(probeId) : 'still_broken',
          confidence: 0.95,
        },
        observedAtTick: 0,
      };
    }

    // Diagnostic probes — return evidence consistent with the target fault
    if (!hyp) {
      return {
        probeId,
        payload: { type: 'unknown', value: 'none', confidence: 0.5 },
        observedAtTick: 0,
      };
    }

    switch (probeId) {
      case 'run_unit_test':
        return {
          probeId,
          payload: {
            type: 'test_result',
            value: hyp.features.test_result as string,
            confidence: 0.9,
          },
          observedAtTick: 0,
        };
      case 'check_error_log':
        return {
          probeId,
          payload: {
            type: 'log_entry',
            value: hyp.features.log_entry as string,
            confidence: 0.8,
          },
          observedAtTick: 0,
        };
      case 'inspect_config':
        return {
          probeId,
          payload: {
            type: 'component',
            value: hyp.features.component as string,
            confidence: 0.7,
          },
          observedAtTick: 0,
        };
      case 'network_probe':
        return {
          probeId,
          payload: {
            type: 'component',
            value: hyp.features.component as string,
            confidence: 0.85,
          },
          observedAtTick: 0,
        };
      default:
        return {
          probeId,
          payload: { type: 'unknown', value: 'none', confidence: 0.5 },
          observedAtTick: 0,
        };
    }
  };
}

/** Map validation probe ID to its evidence type. */
function getValidationEvidenceType(probeId: string): string {
  const map: Record<string, string> = {
    validate_auth_probe: 'health_check',
    validate_auth_module_probe: 'health_check',
    validate_db_probe: 'db_status',
    validate_db_restart_probe: 'db_status',
    validate_network_probe: 'network_status',
    validate_config_probe: 'config_status',
  };
  return map[probeId] ?? 'unknown';
}

/** Map validation probe ID to its expected success value. */
function getValidationSuccessValue(probeId: string): string {
  const map: Record<string, string> = {
    validate_auth_probe: 'healthy',
    validate_auth_module_probe: 'healthy',
    validate_db_probe: 'connected',
    validate_db_restart_probe: 'connected',
    validate_network_probe: 'reachable',
    validate_config_probe: 'valid',
  };
  return map[probeId] ?? 'unknown';
}

// -- Default Params ----------------------------------------------------------

/**
 * CI domain fixture override: confidenceThreshold 0.7 (not the capsule
 * default 0.8). This is a domain parameterization choice, not a P15
 * capability limitation. P11's ProbBucket discretization (0.1 increments)
 * limits achievable confidence with this fixture's 4 hypotheses and 4
 * probes. Farm domain (below) uses the full 0.8 default. Both thresholds
 * exercise the diagnose-repair-validate sequencing invariant.
 */
export const CI_DEFAULT_PARAMS: P15DiagnosisParamsV1 = {
  maxSteps: MAX_DIAGNOSIS_STEPS,
  confidenceThreshold: 0.7,
  minInfoGain: DEFAULT_MIN_INFO_GAIN,
};

// ============================================================================
// Domain 2: Farm Hydration Faults
// Minecraft-flavored but domain-agnostic — crop failure diagnosis
// ============================================================================

export const FARM_FAULT_HYPOTHESES: P11HypothesisV1[] = [
  {
    id: 'fault_dry_soil',
    description: 'Soil is too dry — no water source nearby',
    features: { soil_moisture: 'dry', light_level: 'adequate', crop_type: 'wheat' },
  },
  {
    id: 'fault_low_light',
    description: 'Light level too low for crop growth',
    features: { soil_moisture: 'wet', light_level: 'dark', crop_type: 'wheat' },
  },
  {
    id: 'fault_wrong_crop',
    description: 'Crop type incompatible with biome',
    features: { soil_moisture: 'wet', light_level: 'adequate', crop_type: 'cactus' },
  },
  {
    id: 'fault_trampled',
    description: 'Farmland was trampled by entity',
    features: { soil_moisture: 'wet', light_level: 'adequate', crop_type: 'wheat' },
  },
];

export const FARM_FAULT_PROBES: P11ProbeOperatorV1[] = [
  {
    id: 'check_moisture',
    name: 'Check soil moisture',
    description: 'Inspect farmland block for hydration state',
    cost: { timeTicks: 5, risk: 0, resource: 0 },
  },
  {
    id: 'check_light',
    name: 'Check light level',
    description: 'Measure light level above crop',
    cost: { timeTicks: 3, risk: 0, resource: 0 },
  },
  {
    id: 'check_crop_type',
    name: 'Identify crop variety',
    description: 'Inspect what crop is planted',
    cost: { timeTicks: 2, risk: 0, resource: 0 },
  },
  {
    id: 'check_blockstate',
    name: 'Inspect block state',
    description: 'Check if farmland block is intact vs dirt',
    cost: { timeTicks: 3, risk: 0, resource: 0 },
  },
];

export const FARM_FAULT_REPAIRS: P15RepairActionV1[] = [
  {
    id: 'repair_add_water',
    name: 'Place water source',
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
    name: 'Replant correct crop',
    cost: 1,
    applicableHypothesisIds: ['fault_wrong_crop'],
  },
  {
    id: 'repair_retill',
    name: 'Re-till and replant farmland',
    cost: 3,
    applicableHypothesisIds: ['fault_trampled'],
  },
  {
    id: 'repair_fence',
    name: 'Build fence to prevent trampling',
    cost: 5,
    applicableHypothesisIds: ['fault_trampled'],
  },
];

export const FARM_FAULT_VALIDATIONS: P15ValidationProbeV1[] = [
  {
    id: 'validate_water',
    repairId: 'repair_add_water',
    asP11Probe: {
      id: 'validate_moisture_probe',
      name: 'Post-repair moisture check',
      description: 'Check soil moisture after water placement',
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
      description: 'Check light level after torch placement',
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
      description: 'Check that correct crop is growing',
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
      description: 'Check that farmland is intact and growing',
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
      description: 'Check that fence fully encloses farmland',
      cost: { timeTicks: 8, risk: 0, resource: 0 },
    },
    expectedSuccessValue: 'enclosed',
    evidenceType: 'enclosure_status',
  },
];

/**
 * Deterministic observation provider for farm faults.
 * Always returns evidence consistent with `targetFault`.
 */
export function makeFarmObservationProvider(
  targetFault: string,
  repairSucceeds: boolean = true,
): P15ObservationProvider {
  return (probeId: string, hypotheses: readonly P11HypothesisV1[]): P11ObservedEvidenceV1 => {
    const hyp = hypotheses.find((h) => h.id === targetFault);

    // Validation probes
    if (probeId.startsWith('validate_')) {
      return {
        probeId,
        payload: {
          type: getFarmValidationEvidenceType(probeId),
          value: repairSucceeds ? getFarmValidationSuccessValue(probeId) : 'still_broken',
          confidence: 0.95,
        },
        observedAtTick: 0,
      };
    }

    // Diagnostic probes
    if (!hyp) {
      return {
        probeId,
        payload: { type: 'unknown', value: 'none', confidence: 0.5 },
        observedAtTick: 0,
      };
    }

    switch (probeId) {
      case 'check_moisture':
        return {
          probeId,
          payload: {
            type: 'soil_moisture',
            value: hyp.features.soil_moisture as string,
            confidence: 0.9,
          },
          observedAtTick: 0,
        };
      case 'check_light':
        return {
          probeId,
          payload: {
            type: 'light_level',
            value: hyp.features.light_level as string,
            confidence: 0.85,
          },
          observedAtTick: 0,
        };
      case 'check_crop_type':
        return {
          probeId,
          payload: {
            type: 'crop_type',
            value: hyp.features.crop_type as string,
            confidence: 0.95,
          },
          observedAtTick: 0,
        };
      case 'check_blockstate':
        return {
          probeId,
          payload: {
            type: 'block_type',
            value: targetFault === 'fault_trampled' ? 'dirt' : 'farmland',
            confidence: 0.9,
          },
          observedAtTick: 0,
        };
      default:
        return {
          probeId,
          payload: { type: 'unknown', value: 'none', confidence: 0.5 },
          observedAtTick: 0,
        };
    }
  };
}

function getFarmValidationEvidenceType(probeId: string): string {
  const map: Record<string, string> = {
    validate_moisture_probe: 'soil_moisture',
    validate_light_probe: 'light_level',
    validate_crop_probe: 'crop_type',
    validate_soil_probe: 'block_type',
    validate_fence_probe: 'enclosure_status',
  };
  return map[probeId] ?? 'unknown';
}

function getFarmValidationSuccessValue(probeId: string): string {
  const map: Record<string, string> = {
    validate_moisture_probe: 'wet',
    validate_light_probe: 'adequate',
    validate_crop_probe: 'wheat',
    validate_soil_probe: 'farmland',
    validate_fence_probe: 'enclosed',
  };
  return map[probeId] ?? 'unknown';
}

export const FARM_DEFAULT_PARAMS: P15DiagnosisParamsV1 = {
  maxSteps: MAX_DIAGNOSIS_STEPS,
  confidenceThreshold: DEFAULT_DIAGNOSIS_THRESHOLD,
  minInfoGain: DEFAULT_MIN_INFO_GAIN,
};

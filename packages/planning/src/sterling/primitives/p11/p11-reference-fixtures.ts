/**
 * P11 Reference Fixtures — Multi-Domain Test Data
 *
 * Provides fixture data for two domains to prove P11 portability:
 *   1. Structure Localization (Minecraft-flavored: find a village)
 *   2. Fault Diagnosis (CI-flavored: locate a failing component)
 *
 * Zero Minecraft imports. Zero vitest imports.
 */

import type {
  P11HypothesisV1,
  P11ProbeOperatorV1,
  P11ObservedEvidenceV1,
} from './p11-capsule-types';

// ============================================================================
// Domain 1: Structure Localization
// ============================================================================

export const STRUCTURE_HYPOTHESES: P11HypothesisV1[] = [
  {
    id: 'village_north',
    description: 'Village to the north',
    features: { region: 'north', biome: 'plains', expected_mobs: 'villager' },
  },
  {
    id: 'village_south',
    description: 'Village to the south',
    features: { region: 'south', biome: 'savanna', expected_mobs: 'villager' },
  },
  {
    id: 'village_east',
    description: 'Village to the east',
    features: { region: 'east', biome: 'desert', expected_mobs: 'villager' },
  },
  {
    id: 'no_village',
    description: 'No village in range',
    features: { region: 'none', biome: 'any', expected_mobs: 'none' },
  },
];

export const STRUCTURE_PROBES: P11ProbeOperatorV1[] = [
  {
    id: 'travel_to_vantage',
    name: 'Travel to vantage point',
    description: 'Move to high ground for better visibility',
    cost: { timeTicks: 100, risk: 0.2, resource: 0 },
  },
  {
    id: 'biome_sample',
    name: 'Sample biome features',
    description: 'Check blocks/mobs for biome identification',
    cost: { timeTicks: 50, risk: 0.1, resource: 0 },
  },
  {
    id: 'mob_mix_sample',
    name: 'Observe mob types',
    description: 'Check which mobs spawn in area',
    cost: { timeTicks: 80, risk: 0.3, resource: 0 },
  },
  {
    id: 'terrain_follow',
    name: 'Follow terrain feature',
    description: 'Follow river/path toward expected structure',
    cost: { timeTicks: 200, risk: 0.2, resource: 0 },
  },
];

/**
 * Create evidence consistent with a specific structure hypothesis.
 */
export function makeStructureEvidence(
  probeId: string,
  consistentWith: string,
  tick: number,
): P11ObservedEvidenceV1 {
  const hyp = STRUCTURE_HYPOTHESES.find((h) => h.id === consistentWith);
  if (!hyp) {
    return {
      probeId,
      payload: { type: 'unknown', value: 'none', confidence: 0.5 },
      observedAtTick: tick,
    };
  }

  switch (probeId) {
    case 'biome_sample':
      return {
        probeId,
        payload: {
          type: 'biome',
          value: hyp.features.biome as string,
          confidence: 0.8,
        },
        observedAtTick: tick,
      };
    case 'mob_mix_sample':
      return {
        probeId,
        payload: {
          type: 'expected_mobs',
          value: hyp.features.expected_mobs as string,
          confidence: 0.7,
        },
        observedAtTick: tick,
      };
    case 'travel_to_vantage':
      return {
        probeId,
        payload: {
          type: 'region',
          value: hyp.features.region as string,
          confidence: 0.9,
        },
        observedAtTick: tick,
      };
    case 'terrain_follow':
      return {
        probeId,
        payload: {
          type: 'region',
          value: hyp.features.region as string,
          confidence: 0.6,
        },
        observedAtTick: tick,
      };
    default:
      return {
        probeId,
        payload: { type: 'unknown', value: 'none', confidence: 0.5 },
        observedAtTick: tick,
      };
  }
}

// ============================================================================
// Domain 2: Fault Diagnosis
// ============================================================================

export const FAULT_HYPOTHESES: P11HypothesisV1[] = [
  {
    id: 'fault_auth',
    description: 'Authentication module is failing',
    features: { component: 'auth', test_result: 'fail', log_entry: 'auth_error' },
  },
  {
    id: 'fault_db',
    description: 'Database connection is failing',
    features: { component: 'database', test_result: 'fail', log_entry: 'db_timeout' },
  },
  {
    id: 'fault_network',
    description: 'Network layer is failing',
    features: { component: 'network', test_result: 'fail', log_entry: 'conn_refused' },
  },
  {
    id: 'fault_config',
    description: 'Configuration is invalid',
    features: { component: 'config', test_result: 'pass', log_entry: 'invalid_config' },
  },
];

export const FAULT_PROBES: P11ProbeOperatorV1[] = [
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

/**
 * Create evidence consistent with a specific fault hypothesis.
 */
export function makeFaultEvidence(
  probeId: string,
  consistentWith: string,
  tick: number,
): P11ObservedEvidenceV1 {
  const hyp = FAULT_HYPOTHESES.find((h) => h.id === consistentWith);
  if (!hyp) {
    return {
      probeId,
      payload: { type: 'unknown', value: 'none', confidence: 0.5 },
      observedAtTick: tick,
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
        observedAtTick: tick,
      };
    case 'check_error_log':
      return {
        probeId,
        payload: {
          type: 'log_entry',
          value: hyp.features.log_entry as string,
          confidence: 0.8,
        },
        observedAtTick: tick,
      };
    case 'inspect_config':
      return {
        probeId,
        payload: {
          type: 'component',
          value: hyp.features.component as string,
          confidence: 0.7,
        },
        observedAtTick: tick,
      };
    case 'network_probe':
      return {
        probeId,
        payload: {
          type: 'component',
          value: hyp.features.component as string,
          confidence: 0.85,
        },
        observedAtTick: tick,
      };
    default:
      return {
        probeId,
        payload: { type: 'unknown', value: 'none', confidence: 0.5 },
        observedAtTick: tick,
      };
  }
}

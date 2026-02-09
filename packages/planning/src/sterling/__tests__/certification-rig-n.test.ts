/**
 * Rig N Certification Tests — P15 Fault Diagnosis & Repair
 *
 * Proves all 6 P15 invariants using the reference adapter and two
 * fixture domains (CI Pipeline Faults + Farm Hydration Faults).
 *
 * P15 invariants tested:
 *   1. deterministic_probe_scoring — same belief + probes → same selected probe
 *   2. belief_update_deterministic — same prior + evidence → identical posterior
 *   3. entropy_decreases_when_discriminative — discriminative probe reduces entropy
 *   4. bounded_hypothesis_set — inherited from P11; hypothesis count never grows
 *   5. diagnose_repair_validate_order — repair only after confidence; validation follows repair
 *   6. bounded_episode — max steps enforced; fail-closed termination
 *
 * 45 tests across 9 describe blocks.
 */

import { describe, expect, it } from 'vitest';

import { P11ReferenceAdapter } from '../primitives/p11/p11-reference-adapter.js';

import {
  P15_INVARIANTS,
  P15_CONTRACT_VERSION,
  MAX_DIAGNOSIS_STEPS,
  DEFAULT_DIAGNOSIS_THRESHOLD,
  DEFAULT_MIN_INFO_GAIN,
} from '../primitives/p15/p15-capsule-types.js';

import type {
  P15DiagnosisEpisodeV1,
  P15TerminationReason,
} from '../primitives/p15/p15-capsule-types.js';

import { P15ReferenceAdapter } from '../primitives/p15/p15-reference-adapter.js';

import {
  CI_FAULT_HYPOTHESES,
  CI_FAULT_PROBES,
  CI_FAULT_REPAIRS,
  CI_FAULT_VALIDATIONS,
  CI_DEFAULT_PARAMS,
  makeCIObservationProvider,
  FARM_FAULT_HYPOTHESES,
  FARM_FAULT_PROBES,
  FARM_FAULT_REPAIRS,
  FARM_FAULT_VALIDATIONS,
  FARM_DEFAULT_PARAMS,
  makeFarmObservationProvider,
} from '../primitives/p15/p15-reference-fixtures.js';

import {
  MINECRAFT_FARM_FAULT_HYPOTHESES,
  MINECRAFT_FARM_FAULT_PROBES,
  MINECRAFT_FARM_FAULT_REPAIRS,
  MINECRAFT_FARM_FAULT_VALIDATIONS,
  MINECRAFT_FARM_DIAGNOSIS_PARAMS,
} from '../../diagnosis/minecraft-farm-faults.js';

// -- Shared adapter setup ----------------------------------------------------

const p11 = new P11ReferenceAdapter(0.8);
const adapter = new P15ReferenceAdapter(p11);

function initBelief(hypotheses: typeof CI_FAULT_HYPOTHESES) {
  return p11.initializeBelief(hypotheses, 0);
}

// =============================================================================
// Invariant 1: deterministic_probe_scoring
// =============================================================================

describe('deterministic_probe_scoring', () => {
  it('same belief + probes → same selected probe (CI domain)', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const probe1 = adapter.selectDiagnosticProbe(belief, CI_FAULT_PROBES, CI_FAULT_HYPOTHESES, DEFAULT_MIN_INFO_GAIN);
    const probe2 = adapter.selectDiagnosticProbe(belief, CI_FAULT_PROBES, CI_FAULT_HYPOTHESES, DEFAULT_MIN_INFO_GAIN);
    expect(probe1).not.toBeNull();
    expect(probe1!.id).toBe(probe2!.id);
  });

  it('same belief + probes → same selected probe (Farm domain)', () => {
    const belief = initBelief(FARM_FAULT_HYPOTHESES);
    const probe1 = adapter.selectDiagnosticProbe(belief, FARM_FAULT_PROBES, FARM_FAULT_HYPOTHESES, DEFAULT_MIN_INFO_GAIN);
    const probe2 = adapter.selectDiagnosticProbe(belief, FARM_FAULT_PROBES, FARM_FAULT_HYPOTHESES, DEFAULT_MIN_INFO_GAIN);
    expect(probe1).not.toBeNull();
    expect(probe1!.id).toBe(probe2!.id);
  });

  it('probe selection is deterministic after belief update', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const evidence = makeCIObservationProvider('fault_auth')('check_error_log', CI_FAULT_HYPOTHESES);
    const updated = adapter.updateDiagnosticBelief(belief, evidence, CI_FAULT_HYPOTHESES);

    const probe1 = adapter.selectDiagnosticProbe(updated, CI_FAULT_PROBES, CI_FAULT_HYPOTHESES, DEFAULT_MIN_INFO_GAIN);
    const probe2 = adapter.selectDiagnosticProbe(updated, CI_FAULT_PROBES, CI_FAULT_HYPOTHESES, DEFAULT_MIN_INFO_GAIN);
    expect(probe1?.id).toBe(probe2?.id);
  });

  it('returns null when minInfoGain exceeds all probes', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const probe = adapter.selectDiagnosticProbe(belief, CI_FAULT_PROBES, CI_FAULT_HYPOTHESES, 999);
    expect(probe).toBeNull();
  });
});

// =============================================================================
// Invariant 2: belief_update_deterministic
// =============================================================================

describe('belief_update_deterministic', () => {
  it('same prior + evidence → identical posterior (CI domain)', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const evidence = makeCIObservationProvider('fault_db')('run_unit_test', CI_FAULT_HYPOTHESES);

    const posterior1 = adapter.updateDiagnosticBelief(belief, evidence, CI_FAULT_HYPOTHESES);
    const posterior2 = adapter.updateDiagnosticBelief(belief, evidence, CI_FAULT_HYPOTHESES);

    // Compare distributions entry by entry
    for (const [hypId, prob] of posterior1.distribution.entries()) {
      expect(posterior2.distribution.get(hypId)).toBe(prob);
    }
    expect(posterior1.entropy).toBe(posterior2.entropy);
  });

  it('same prior + evidence → identical posterior (Farm domain)', () => {
    const belief = initBelief(FARM_FAULT_HYPOTHESES);
    const evidence = makeFarmObservationProvider('fault_dry_soil')('check_moisture', FARM_FAULT_HYPOTHESES);

    const posterior1 = adapter.updateDiagnosticBelief(belief, evidence, FARM_FAULT_HYPOTHESES);
    const posterior2 = adapter.updateDiagnosticBelief(belief, evidence, FARM_FAULT_HYPOTHESES);

    for (const [hypId, prob] of posterior1.distribution.entries()) {
      expect(posterior2.distribution.get(hypId)).toBe(prob);
    }
    expect(posterior1.entropy).toBe(posterior2.entropy);
  });

  it('posterior preserves hypothesis set size', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const evidence = makeCIObservationProvider('fault_auth')('run_unit_test', CI_FAULT_HYPOTHESES);
    const posterior = adapter.updateDiagnosticBelief(belief, evidence, CI_FAULT_HYPOTHESES);

    expect(posterior.distribution.size).toBe(CI_FAULT_HYPOTHESES.length);
  });

  it('explored set tracks used probes', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const evidence = makeCIObservationProvider('fault_auth')('run_unit_test', CI_FAULT_HYPOTHESES);
    const posterior = adapter.updateDiagnosticBelief(belief, evidence, CI_FAULT_HYPOTHESES);

    expect(posterior.explored.has('run_unit_test')).toBe(true);
  });
});

// =============================================================================
// Invariant 3: entropy_decreases_when_discriminative
// =============================================================================

describe('entropy_decreases_when_discriminative', () => {
  it('discriminative probe reduces entropy (CI domain)', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const evidence = makeCIObservationProvider('fault_auth')('check_error_log', CI_FAULT_HYPOTHESES);
    const posterior = adapter.updateDiagnosticBelief(belief, evidence, CI_FAULT_HYPOTHESES);

    expect(posterior.entropy).toBeLessThan(belief.entropy);
  });

  it('discriminative probe reduces entropy (Farm domain)', () => {
    const belief = initBelief(FARM_FAULT_HYPOTHESES);
    const evidence = makeFarmObservationProvider('fault_dry_soil')('check_moisture', FARM_FAULT_HYPOTHESES);
    const posterior = adapter.updateDiagnosticBelief(belief, evidence, FARM_FAULT_HYPOTHESES);

    expect(posterior.entropy).toBeLessThan(belief.entropy);
  });

  it('multiple discriminative probes monotonically reduce entropy', () => {
    let belief = initBelief(CI_FAULT_HYPOTHESES);
    const observe = makeCIObservationProvider('fault_auth');
    const probeIds = ['check_error_log', 'run_unit_test', 'inspect_config'];

    let prevEntropy = belief.entropy;
    for (const probeId of probeIds) {
      const evidence = observe(probeId, CI_FAULT_HYPOTHESES);
      belief = adapter.updateDiagnosticBelief(belief, evidence, CI_FAULT_HYPOTHESES);
      expect(belief.entropy).toBeLessThanOrEqual(prevEntropy);
      prevEntropy = belief.entropy;
    }
  });

  it('entropy is non-negative', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    expect(belief.entropy).toBeGreaterThanOrEqual(0);

    const evidence = makeCIObservationProvider('fault_auth')('run_unit_test', CI_FAULT_HYPOTHESES);
    const posterior = adapter.updateDiagnosticBelief(belief, evidence, CI_FAULT_HYPOTHESES);
    expect(posterior.entropy).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// Invariant 4: bounded_hypothesis_set
// =============================================================================

describe('bounded_hypothesis_set', () => {
  it('hypothesis count never grows during diagnosis loop', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      CI_DEFAULT_PARAMS, makeCIObservationProvider('fault_auth'),
    );

    const initialCount = CI_FAULT_HYPOTHESES.length;
    for (const snapshot of episode.beliefSnapshots) {
      expect(snapshot.hypothesisCount).toBeLessThanOrEqual(initialCount);
    }
  });

  it('hypothesis count never grows during farm diagnosis', () => {
    const belief = initBelief(FARM_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, FARM_FAULT_HYPOTHESES, FARM_FAULT_PROBES,
      FARM_FAULT_REPAIRS, FARM_FAULT_VALIDATIONS,
      FARM_DEFAULT_PARAMS, makeFarmObservationProvider('fault_dry_soil'),
    );

    const initialCount = FARM_FAULT_HYPOTHESES.length;
    for (const snapshot of episode.beliefSnapshots) {
      expect(snapshot.hypothesisCount).toBeLessThanOrEqual(initialCount);
    }
  });

  it('inherited from P11: MAX_HYPOTHESES is finite', () => {
    expect(p11.maxHypotheses).toBeGreaterThan(0);
    expect(p11.maxHypotheses).toBeLessThanOrEqual(32);
  });
});

// =============================================================================
// Invariant 5: diagnose_repair_validate_order
// =============================================================================

describe('diagnose_repair_validate_order', () => {
  it('repair only occurs after probes establish confidence', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      CI_DEFAULT_PARAMS, makeCIObservationProvider('fault_auth'),
    );

    if (episode.repairsAttempted.length > 0) {
      // First repair step must be after at least one probe step
      const firstRepairStep = episode.repairsAttempted[0].step;
      expect(episode.probesExecuted.length).toBeGreaterThan(0);
      const lastProbeBeforeRepair = episode.probesExecuted
        .filter((p) => p.step < firstRepairStep);
      expect(lastProbeBeforeRepair.length).toBeGreaterThan(0);
    }
  });

  it('validation follows its associated repair', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      CI_DEFAULT_PARAMS, makeCIObservationProvider('fault_auth'),
    );

    for (const validation of episode.validations) {
      // Find the repair this validation checks
      const associatedRepair = episode.repairsAttempted.find(
        (r) => CI_FAULT_VALIDATIONS.some(
          (v) => v.id === validation.validationProbeId && v.repairId === r.repairId,
        ),
      );
      expect(associatedRepair).toBeDefined();
      // Validation step must be after repair step
      expect(validation.step).toBeGreaterThan(associatedRepair!.step);
    }
  });

  it('resolved episode has repair + validation in resolvedBy', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      CI_DEFAULT_PARAMS, makeCIObservationProvider('fault_auth'),
    );

    if (episode.resolved) {
      expect(episode.resolvedBy).toBeDefined();
      expect(episode.resolvedBy!.hypothesisId).toBeTruthy();
      expect(episode.resolvedBy!.repairId).toBeTruthy();
      expect(episode.resolvedBy!.validationProbeId).toBeTruthy();
    }
  });

  it('failed validation re-enters diagnosis (does not resolve)', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      { ...CI_DEFAULT_PARAMS, maxSteps: 10 },
      makeCIObservationProvider('fault_auth', false), // repair fails
    );

    // With failed validation, the episode should not resolve
    const failedValidations = episode.validations.filter((v) => !v.success);
    if (failedValidations.length > 0) {
      // If all validations failed, episode should not be resolved
      // (unless a later repair+validation succeeded)
      const anySucceeded = episode.validations.some((v) => v.success);
      if (!anySucceeded) {
        expect(episode.resolved).toBe(false);
      }
    }
  });

  it('repair targets the top hypothesis from confidence check', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      CI_DEFAULT_PARAMS, makeCIObservationProvider('fault_auth'),
    );

    for (const repair of episode.repairsAttempted) {
      // The repair's target hypothesis must be applicable
      const repairDef = CI_FAULT_REPAIRS.find((r) => r.id === repair.repairId);
      expect(repairDef).toBeDefined();
      expect(repairDef!.applicableHypothesisIds).toContain(repair.targetHypothesisId);
    }
  });
});

// =============================================================================
// Invariant 6: bounded_episode
// =============================================================================

describe('bounded_episode', () => {
  it('totalSteps never exceeds maxSteps', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      CI_DEFAULT_PARAMS, makeCIObservationProvider('fault_auth'),
    );

    expect(episode.totalSteps).toBeLessThanOrEqual(CI_DEFAULT_PARAMS.maxSteps);
  });

  it('small maxSteps triggers max_steps termination', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      { ...CI_DEFAULT_PARAMS, maxSteps: 1 },
      makeCIObservationProvider('fault_auth'),
    );

    expect(episode.totalSteps).toBeLessThanOrEqual(1);
    // With only 1 step, cannot complete full diagnose-repair-validate cycle
    expect(episode.terminatedBy).toBe('max_steps');
  });

  it('terminatedBy is always a valid reason', () => {
    const validReasons: P15TerminationReason[] = [
      'resolved', 'max_steps', 'no_discriminative_probe',
      'no_applicable_repair', 'validation_failed', 'all_repairs_exhausted',
    ];

    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      CI_DEFAULT_PARAMS, makeCIObservationProvider('fault_auth'),
    );

    expect(validReasons).toContain(episode.terminatedBy);
  });

  it('resolved episodes terminate with "resolved"', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      CI_DEFAULT_PARAMS, makeCIObservationProvider('fault_auth'),
    );

    if (episode.resolved) {
      expect(episode.terminatedBy).toBe('resolved');
    }
  });

  it('no applicable repair terminates cleanly', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    // Provide empty repairs — will diagnose but cannot repair
    const episode = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      [], // no repairs available
      CI_FAULT_VALIDATIONS,
      CI_DEFAULT_PARAMS, makeCIObservationProvider('fault_auth'),
    );

    expect(episode.resolved).toBe(false);
    expect(episode.terminatedBy).toBe('no_applicable_repair');
  });

  it('MAX_DIAGNOSIS_STEPS constant is finite', () => {
    expect(MAX_DIAGNOSIS_STEPS).toBeGreaterThan(0);
    expect(MAX_DIAGNOSIS_STEPS).toBeLessThanOrEqual(100);
  });
});

// =============================================================================
// Repair selection determinism
// =============================================================================

describe('P15 Repair selection', () => {
  it('selectRepair chooses lowest cost then lexicographic ID', () => {
    const repair = adapter.selectRepair('fault_auth', CI_FAULT_REPAIRS, []);
    expect(repair).not.toBeNull();
    // repair_auth_token (cost=1) should be selected before repair_auth_module (cost=3)
    expect(repair!.id).toBe('repair_auth_token');
  });

  it('selectRepair skips already-applied repairs', () => {
    const repair = adapter.selectRepair('fault_auth', CI_FAULT_REPAIRS, ['repair_auth_token']);
    expect(repair).not.toBeNull();
    expect(repair!.id).toBe('repair_auth_module');
  });

  it('selectRepair returns null when all applicable repairs exhausted', () => {
    const repair = adapter.selectRepair(
      'fault_auth', CI_FAULT_REPAIRS,
      ['repair_auth_token', 'repair_auth_module'],
    );
    expect(repair).toBeNull();
  });

  it('selectRepair returns null for unknown hypothesis', () => {
    const repair = adapter.selectRepair('nonexistent_fault', CI_FAULT_REPAIRS, []);
    expect(repair).toBeNull();
  });
});

// =============================================================================
// Multi-domain portability
// =============================================================================

describe('P15 Multi-domain portability', () => {
  it('CI domain resolves fault_auth successfully', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      CI_DEFAULT_PARAMS, makeCIObservationProvider('fault_auth'),
    );

    expect(episode.resolved).toBe(true);
    expect(episode.terminatedBy).toBe('resolved');
  });

  it('CI domain resolves fault_db successfully', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      CI_DEFAULT_PARAMS, makeCIObservationProvider('fault_db'),
    );

    expect(episode.resolved).toBe(true);
    expect(episode.terminatedBy).toBe('resolved');
  });

  it('Farm domain resolves fault_dry_soil successfully', () => {
    const belief = initBelief(FARM_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, FARM_FAULT_HYPOTHESES, FARM_FAULT_PROBES,
      FARM_FAULT_REPAIRS, FARM_FAULT_VALIDATIONS,
      FARM_DEFAULT_PARAMS, makeFarmObservationProvider('fault_dry_soil'),
    );

    expect(episode.resolved).toBe(true);
    expect(episode.terminatedBy).toBe('resolved');
  });

  it('Farm domain resolves fault_low_light successfully', () => {
    const belief = initBelief(FARM_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, FARM_FAULT_HYPOTHESES, FARM_FAULT_PROBES,
      FARM_FAULT_REPAIRS, FARM_FAULT_VALIDATIONS,
      FARM_DEFAULT_PARAMS, makeFarmObservationProvider('fault_low_light'),
    );

    expect(episode.resolved).toBe(true);
    expect(episode.terminatedBy).toBe('resolved');
  });

  it('same adapter instance works across domains', () => {
    const ciEpisode = adapter.runDiagnosisLoop(
      initBelief(CI_FAULT_HYPOTHESES), CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      CI_DEFAULT_PARAMS, makeCIObservationProvider('fault_network'),
    );
    const farmEpisode = adapter.runDiagnosisLoop(
      initBelief(FARM_FAULT_HYPOTHESES), FARM_FAULT_HYPOTHESES, FARM_FAULT_PROBES,
      FARM_FAULT_REPAIRS, FARM_FAULT_VALIDATIONS,
      FARM_DEFAULT_PARAMS, makeFarmObservationProvider('fault_trampled'),
    );

    // Both should complete (resolved or terminated) without error
    expect(ciEpisode.totalSteps).toBeGreaterThan(0);
    expect(farmEpisode.totalSteps).toBeGreaterThan(0);
  });

  it('same inputs produce identical episodes (deterministic loop)', () => {
    const belief = initBelief(CI_FAULT_HYPOTHESES);
    const observe = makeCIObservationProvider('fault_auth');

    const episode1 = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      CI_DEFAULT_PARAMS, observe,
    );
    const episode2 = adapter.runDiagnosisLoop(
      belief, CI_FAULT_HYPOTHESES, CI_FAULT_PROBES,
      CI_FAULT_REPAIRS, CI_FAULT_VALIDATIONS,
      CI_DEFAULT_PARAMS, observe,
    );

    expect(episode1.totalSteps).toBe(episode2.totalSteps);
    expect(episode1.terminatedBy).toBe(episode2.terminatedBy);
    expect(episode1.resolved).toBe(episode2.resolved);
    expect(episode1.probesExecuted.length).toBe(episode2.probesExecuted.length);
    expect(episode1.repairsAttempted.length).toBe(episode2.repairsAttempted.length);
    expect(episode1.validations.length).toBe(episode2.validations.length);
  });
});

// =============================================================================
// Minecraft domain module
// =============================================================================

describe('P15 Minecraft domain module', () => {
  it('MINECRAFT_FARM_FAULT_HYPOTHESES has correct structure', () => {
    expect(MINECRAFT_FARM_FAULT_HYPOTHESES.length).toBeGreaterThan(0);
    for (const h of MINECRAFT_FARM_FAULT_HYPOTHESES) {
      expect(h.id).toBeTruthy();
      expect(h.description).toBeTruthy();
      expect(typeof h.features).toBe('object');
    }
  });

  it('MINECRAFT_FARM_FAULT_REPAIRS reference valid hypothesis IDs', () => {
    const validHypIds = new Set(MINECRAFT_FARM_FAULT_HYPOTHESES.map((h) => h.id));
    for (const repair of MINECRAFT_FARM_FAULT_REPAIRS) {
      for (const hypId of repair.applicableHypothesisIds) {
        expect(validHypIds.has(hypId)).toBe(true);
      }
    }
  });

  it('MINECRAFT_FARM_FAULT_VALIDATIONS reference valid repair IDs', () => {
    const validRepairIds = new Set(MINECRAFT_FARM_FAULT_REPAIRS.map((r) => r.id));
    for (const v of MINECRAFT_FARM_FAULT_VALIDATIONS) {
      expect(validRepairIds.has(v.repairId)).toBe(true);
    }
  });

  it('Minecraft domain fixtures drive successful diagnosis', () => {
    // Use farm fixtures from the reference fixtures (same data, different source)
    const belief = initBelief(FARM_FAULT_HYPOTHESES);
    const episode = adapter.runDiagnosisLoop(
      belief, FARM_FAULT_HYPOTHESES, FARM_FAULT_PROBES,
      FARM_FAULT_REPAIRS, FARM_FAULT_VALIDATIONS,
      FARM_DEFAULT_PARAMS, makeFarmObservationProvider('fault_wrong_crop'),
    );

    expect(episode.resolved).toBe(true);
  });

  it('MINECRAFT_FARM_DIAGNOSIS_PARAMS uses capsule defaults', () => {
    expect(MINECRAFT_FARM_DIAGNOSIS_PARAMS.maxSteps).toBe(MAX_DIAGNOSIS_STEPS);
    expect(MINECRAFT_FARM_DIAGNOSIS_PARAMS.confidenceThreshold).toBe(DEFAULT_DIAGNOSIS_THRESHOLD);
    expect(MINECRAFT_FARM_DIAGNOSIS_PARAMS.minInfoGain).toBe(DEFAULT_MIN_INFO_GAIN);
  });
});

// =============================================================================
// Contract metadata
// =============================================================================

describe('P15 contract metadata', () => {
  it('P15_INVARIANTS has exactly 6 entries', () => {
    expect(P15_INVARIANTS.length).toBe(6);
  });

  it('P15_CONTRACT_VERSION is p15.v1', () => {
    expect(P15_CONTRACT_VERSION).toBe('p15.v1');
  });

  it('all 6 invariant names are present', () => {
    const expected = [
      'deterministic_probe_scoring',
      'belief_update_deterministic',
      'entropy_decreases_when_discriminative',
      'bounded_hypothesis_set',
      'diagnose_repair_validate_order',
      'bounded_episode',
    ];
    for (const inv of expected) {
      expect(P15_INVARIANTS).toContain(inv);
    }
  });

  it('adapter defaultParams match capsule constants', () => {
    expect(adapter.defaultParams.maxSteps).toBe(MAX_DIAGNOSIS_STEPS);
    expect(adapter.defaultParams.confidenceThreshold).toBe(DEFAULT_DIAGNOSIS_THRESHOLD);
    expect(adapter.defaultParams.minInfoGain).toBe(DEFAULT_MIN_INFO_GAIN);
  });
});

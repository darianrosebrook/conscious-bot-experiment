/**
 * P15 Reference Adapter — Domain-Agnostic Implementation
 *
 * A clean, portable implementation of P15FaultDiagnosisAdapter that wraps
 * a P11ReferenceAdapter via constructor injection. All epistemic computation
 * (entropy, information gain, belief updates, probe selection) is delegated
 * to P11. P15 adds only repair/validation sequencing and episode control.
 *
 * Zero vitest imports. Zero domain imports.
 */

import type { P11EpistemicAdapter } from '../p11/p11-capsule-types.js';
import type {
  P11BeliefStateV1,
  P11HypothesisV1,
  P11ProbeOperatorV1,
  P11ObservedEvidenceV1,
} from '../p11/p11-capsule-types.js';

import type {
  P15FaultDiagnosisAdapter,
  P15RepairActionV1,
  P15ValidationProbeV1,
  P15DiagnosisParamsV1,
  P15DiagnosisEpisodeV1,
  P15ObservationProvider,
  P15ProbeRecordV1,
  P15BeliefSnapshotV1,
  P15RepairRecordV1,
  P15ValidationRecordV1,
  P15TerminationReason,
} from './p15-capsule-types.js';

import {
  MAX_DIAGNOSIS_STEPS,
  DEFAULT_DIAGNOSIS_THRESHOLD,
  DEFAULT_MIN_INFO_GAIN,
} from './p15-capsule-types.js';

// -- Reference Adapter -------------------------------------------------------

export class P15ReferenceAdapter implements P15FaultDiagnosisAdapter {
  private readonly p11: P11EpistemicAdapter;
  readonly defaultParams: P15DiagnosisParamsV1;

  constructor(
    p11Adapter: P11EpistemicAdapter,
    defaultParams?: Partial<P15DiagnosisParamsV1>,
  ) {
    this.p11 = p11Adapter;
    this.defaultParams = {
      maxSteps: defaultParams?.maxSteps ?? MAX_DIAGNOSIS_STEPS,
      confidenceThreshold: defaultParams?.confidenceThreshold ?? DEFAULT_DIAGNOSIS_THRESHOLD,
      minInfoGain: defaultParams?.minInfoGain ?? DEFAULT_MIN_INFO_GAIN,
    };
  }

  // -- Delegated to P11 -------------------------------------------------------

  selectDiagnosticProbe(
    belief: P11BeliefStateV1,
    probes: readonly P11ProbeOperatorV1[],
    hypotheses: readonly P11HypothesisV1[],
    minInfoGain: number,
  ): P11ProbeOperatorV1 | null {
    // Delegate probe selection to P11
    const selected = this.p11.selectProbe(probes, belief, hypotheses);
    if (!selected) return null;

    // Check that the selected probe exceeds minInfoGain
    const igResult = this.p11.expectedInfoGain(selected, belief, hypotheses);
    if (igResult.expectedGain < minInfoGain) return null;

    return selected;
  }

  updateDiagnosticBelief(
    belief: P11BeliefStateV1,
    evidence: P11ObservedEvidenceV1,
    hypotheses: readonly P11HypothesisV1[],
  ): P11BeliefStateV1 {
    // Delegate to P11 and unwrap the result
    const result = this.p11.updateBelief(belief, evidence, hypotheses);
    return result.belief;
  }

  // -- P15-specific (repair/validation sequencing) ----------------------------

  selectRepair(
    topHypothesisId: string,
    repairs: readonly P15RepairActionV1[],
    appliedRepairs: readonly string[],
  ): P15RepairActionV1 | null {
    const appliedSet = new Set(appliedRepairs);

    // Filter to applicable repairs that haven't been tried
    const candidates = repairs.filter(
      (r) =>
        r.applicableHypothesisIds.includes(topHypothesisId) &&
        !appliedSet.has(r.id),
    );

    if (candidates.length === 0) return null;

    // Deterministic: sort by cost ASC, then lexicographic ID ASC
    candidates.sort((a, b) => {
      const costCmp = a.cost - b.cost;
      if (costCmp !== 0) return costCmp;
      return a.id.localeCompare(b.id);
    });

    return candidates[0];
  }

  requiresValidation(
    repairId: string,
    validations: readonly P15ValidationProbeV1[],
  ): P15ValidationProbeV1 | null {
    // Enforce 1:1 mapping — find the validation for this repair
    const match = validations.find((v) => v.repairId === repairId);
    return match ?? null;
  }

  evaluateValidation(
    observation: P11ObservedEvidenceV1,
    validation: P15ValidationProbeV1,
  ): boolean {
    // Check that the observation type matches and the value equals expected
    if (observation.payload.type !== validation.evidenceType) return false;
    return observation.payload.value === validation.expectedSuccessValue;
  }

  // -- Diagnosis Loop ---------------------------------------------------------

  runDiagnosisLoop(
    initialBelief: P11BeliefStateV1,
    hypotheses: readonly P11HypothesisV1[],
    diagnosticProbes: readonly P11ProbeOperatorV1[],
    repairs: readonly P15RepairActionV1[],
    validations: readonly P15ValidationProbeV1[],
    params: P15DiagnosisParamsV1,
    observe: P15ObservationProvider,
  ): P15DiagnosisEpisodeV1 {
    let belief = initialBelief;
    let step = 0;

    const probesExecuted: P15ProbeRecordV1[] = [];
    const beliefSnapshots: P15BeliefSnapshotV1[] = [];
    const repairsAttempted: P15RepairRecordV1[] = [];
    const validationsPerformed: P15ValidationRecordV1[] = [];
    const appliedRepairIds: string[] = [];

    // Record initial belief snapshot
    beliefSnapshots.push(this.takeSnapshot(belief, step));

    while (step < params.maxSteps) {
      // Phase 1: Check confidence
      const confidence = this.p11.checkConfidence(belief, params.confidenceThreshold);

      if (confidence.reached && confidence.bestHypothesis !== null) {
        // Phase 2: Attempt repair
        const repair = this.selectRepair(
          confidence.bestHypothesis,
          repairs,
          appliedRepairIds,
        );

        if (!repair) {
          // No applicable repair — check if all have been exhausted
          const allApplicable = repairs.filter((r) =>
            r.applicableHypothesisIds.includes(confidence.bestHypothesis!),
          );
          const reason: P15TerminationReason =
            allApplicable.length > 0 && allApplicable.every((r) => appliedRepairIds.includes(r.id))
              ? 'all_repairs_exhausted'
              : 'no_applicable_repair';

          return this.buildEpisode(
            probesExecuted,
            beliefSnapshots,
            repairsAttempted,
            validationsPerformed,
            false,
            undefined,
            reason,
            step,
          );
        }

        // Execute repair
        step++;
        appliedRepairIds.push(repair.id);
        repairsAttempted.push({
          step,
          repairId: repair.id,
          targetHypothesisId: confidence.bestHypothesis,
          reason: `confidence ${confidence.confidence} >= ${params.confidenceThreshold}`,
        });

        if (step >= params.maxSteps) {
          return this.buildEpisode(
            probesExecuted,
            beliefSnapshots,
            repairsAttempted,
            validationsPerformed,
            false,
            undefined,
            'max_steps',
            step,
          );
        }

        // Phase 3: Validate repair
        const validationProbe = this.requiresValidation(repair.id, validations);
        if (validationProbe) {
          step++;
          const validationObs = observe(validationProbe.asP11Probe.id, hypotheses);
          const success = this.evaluateValidation(validationObs, validationProbe);

          validationsPerformed.push({
            step,
            validationProbeId: validationProbe.id,
            observedValue: validationObs.payload.value,
            expectedValue: validationProbe.expectedSuccessValue,
            success,
          });

          if (success) {
            // Update belief with validation evidence
            belief = this.updateDiagnosticBelief(belief, validationObs, hypotheses);
            beliefSnapshots.push(this.takeSnapshot(belief, step));

            return this.buildEpisode(
              probesExecuted,
              beliefSnapshots,
              repairsAttempted,
              validationsPerformed,
              true,
              {
                hypothesisId: confidence.bestHypothesis,
                repairId: repair.id,
                validationProbeId: validationProbe.id,
              },
              'resolved',
              step,
            );
          }

          // Validation failed — update belief and re-enter diagnosis loop
          belief = this.updateDiagnosticBelief(belief, validationObs, hypotheses);
          beliefSnapshots.push(this.takeSnapshot(belief, step));

          // Continue loop to try more probes or repairs
          continue;
        }

        // No validation probe for this repair — treat as resolved
        // (repair without validation is a valid configuration)
        return this.buildEpisode(
          probesExecuted,
          beliefSnapshots,
          repairsAttempted,
          validationsPerformed,
          true,
          {
            hypothesisId: confidence.bestHypothesis,
            repairId: repair.id,
            validationProbeId: '__none__',
          },
          'resolved',
          step,
        );
      }

      // Phase 0: Not confident enough — probe to gather more evidence
      const probe = this.selectDiagnosticProbe(
        belief,
        diagnosticProbes,
        hypotheses,
        params.minInfoGain,
      );

      if (!probe) {
        return this.buildEpisode(
          probesExecuted,
          beliefSnapshots,
          repairsAttempted,
          validationsPerformed,
          false,
          undefined,
          'no_discriminative_probe',
          step,
        );
      }

      step++;
      const evidence = observe(probe.id, hypotheses);
      const igResult = this.p11.expectedInfoGain(probe, belief, hypotheses);

      probesExecuted.push({
        step,
        probeId: probe.id,
        observedValue: evidence.payload.value,
        infoGain: igResult.expectedGain,
      });

      belief = this.updateDiagnosticBelief(belief, evidence, hypotheses);
      beliefSnapshots.push(this.takeSnapshot(belief, step));
    }

    // Max steps exhausted
    return this.buildEpisode(
      probesExecuted,
      beliefSnapshots,
      repairsAttempted,
      validationsPerformed,
      false,
      undefined,
      'max_steps',
      step,
    );
  }

  // -- Helpers ----------------------------------------------------------------

  private takeSnapshot(belief: P11BeliefStateV1, step: number): P15BeliefSnapshotV1 {
    let topId: string | null = null;
    let topProb = 0;

    for (const [hypId, prob] of belief.distribution.entries()) {
      if (prob > topProb || (prob === topProb && (topId === null || hypId < topId))) {
        topProb = prob;
        topId = hypId;
      }
    }

    // Use ProbBucket via the P11 toProbBucket (we import the type, not the function)
    // We cast since the value from the distribution is already a ProbBucket
    return {
      step,
      entropy: belief.entropy,
      topHypothesisId: topId,
      topProbBucket: topProb as import('../p11/p11-capsule-types.js').ProbBucket,
      hypothesisCount: belief.distribution.size,
    };
  }

  private buildEpisode(
    probesExecuted: readonly P15ProbeRecordV1[],
    beliefSnapshots: readonly P15BeliefSnapshotV1[],
    repairsAttempted: readonly P15RepairRecordV1[],
    validations: readonly P15ValidationRecordV1[],
    resolved: boolean,
    resolvedBy:
      | { hypothesisId: string; repairId: string; validationProbeId: string }
      | undefined,
    terminatedBy: P15TerminationReason,
    totalSteps: number,
  ): P15DiagnosisEpisodeV1 {
    return {
      probesExecuted,
      beliefSnapshots,
      repairsAttempted,
      validations,
      resolved,
      ...(resolvedBy ? { resolvedBy } : {}),
      terminatedBy,
      totalSteps,
    };
  }
}

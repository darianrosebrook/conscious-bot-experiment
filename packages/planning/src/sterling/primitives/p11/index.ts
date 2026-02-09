/**
 * P11 Primitive Capsule — Epistemic Planning (Belief-State + Active Sensing)
 */

// Capsule types
export {
  P11_CONTRACT_VERSION,
  P11_INVARIANTS,
  PROB_BUCKETS,
  MAX_HYPOTHESES,
  toProbBucket,
} from './p11-capsule-types';

export type {
  P11ContractVersion,
  ProbBucket,
  P11HypothesisV1,
  P11BeliefStateV1,
  P11EvidencePayloadV1,
  P11ObservedEvidenceV1,
  P11ProbeOperatorV1,
  P11ProbeCostV1,
  P11InfoGainResultV1,
  P11ConfidenceCheckV1,
  P11BeliefUpdateResultV1,
  P11EpistemicAdapter,
  P11Invariant,
  P11ClaimId,
  P11CapabilityDescriptor,
} from './p11-capsule-types';

// Reference fixtures
export {
  // Structure localization domain
  STRUCTURE_HYPOTHESES,
  STRUCTURE_PROBES,
  makeStructureEvidence,
  // Fault diagnosis domain
  FAULT_HYPOTHESES,
  FAULT_PROBES,
  makeFaultEvidence,
} from './p11-reference-fixtures';

// Reference adapter
export { P11ReferenceAdapter } from './p11-reference-adapter';

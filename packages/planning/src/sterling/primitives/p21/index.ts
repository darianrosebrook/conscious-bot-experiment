// P21 Primitive Capsule — contract entrypoint (runtime-safe)
// Conformance suites live in @conscious-bot/testkits.
// Import them from '@conscious-bot/testkits/src/p21' in test files.

export type {
  P21EvidenceItem,
  P21EvidenceBatch,
  P21TrackSummary,
  P21Visibility,
  P21Snapshot,
  P21SaliencyDelta,
  P21DeltaType,
  P21Envelope,
  P21RiskLevel,
  P21RiskClassifier,
  P21ImplementationAdapter,
  P21EmissionAdapter,
  P21Invariant,
  P21AInvariant,
  P21BInvariant,
  P21BeliefMode,
  P21RiskDetail,
  P21Extension,
  P21ClaimId,
  P21ACapabilityDescriptor,
  P21BCapabilityDescriptor,
  P21CapabilityDescriptor,
} from './p21-capsule-types';

export {
  P21_INVARIANTS,
  P21A_INVARIANTS,
  P21B_INVARIANTS,
  RISK_LEVEL_ORDER,
} from './p21-capsule-types';

export {
  MOB_DOMAIN_CLASSIFIER,
  SECURITY_DOMAIN_CLASSIFIER,
  MOB_DOMAIN_STREAM,
  SECURITY_DOMAIN_STREAM,
} from './p21-reference-fixtures';

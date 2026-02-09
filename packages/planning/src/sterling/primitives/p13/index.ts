/**
 * P13 Primitive — Irreversibility and Commitment Planning
 *
 * Barrel export for all P13 capsule types, reference adapter, and fixtures.
 */

// Capsule types and constants
export {
  DEFAULT_CONFIDENCE_THRESHOLD,
  OPTION_VALUE_MAX,
  P13_CONTRACT_VERSION,
  P13_INVARIANTS,
} from './p13-capsule-types.js';

export type {
  P13CapabilityDescriptor,
  P13ClaimId,
  P13CommitCheckResultV1,
  P13CommitmentAdapter,
  P13CommitmentConstraintV1,
  P13CommitmentCostV1,
  P13CommitmentStateV1,
  P13ContractVersion,
  P13Invariant,
  P13IrreversibilityTagV1,
  P13OptionValueStateV1,
  P13ReversibilityClass,
  P13VerificationOperatorV1,
  P13VerificationStateV1,
} from './p13-capsule-types.js';

// Reference adapter
export { P13ReferenceAdapter } from './p13-reference-adapter.js';

// Reference fixtures — two domains for portability proof
export {
  DEPLOYMENT_CONSTRAINTS,
  DEPLOYMENT_IRREVERSIBILITY_TAGS,
  DEPLOYMENT_VERIFICATIONS,
  TRADING_CONSTRAINTS,
  TRADING_IRREVERSIBILITY_TAGS,
  TRADING_VERIFICATIONS,
} from './p13-reference-fixtures.js';

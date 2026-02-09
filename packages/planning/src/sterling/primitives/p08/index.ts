/**
 * P08 Primitive — Systems Synthesis (Design-Space Search)
 *
 * Barrel export for all P08 capsule types, reference adapter, and fixtures.
 */

// Capsule types and constants
export {
  MAX_DESIGN_NODES,
  MAX_MOTIFS,
  P08_CONTRACT_VERSION,
  P08_INVARIANTS,
} from './p08-capsule-types.js';

export type {
  P08BehavioralSpecV1,
  P08CapabilityDescriptor,
  P08ClaimId,
  P08ContractVersion,
  P08DesignOperatorV1,
  P08DesignStateV1,
  P08GridCellV1,
  P08Invariant,
  P08MotifV1,
  P08SpecResultV1,
  P08SynthesisAdapter,
} from './p08-capsule-types.js';

// Reference adapter
export { P08ReferenceAdapter } from './p08-reference-adapter.js';

// Reference fixtures — two domains for portability proof
export {
  CIRCUIT_OPERATORS,
  CIRCUIT_SPEC,
  FARM_OPERATORS,
  FARM_SPEC,
  SMALL_FARM_SPEC,
} from './p08-reference-fixtures.js';

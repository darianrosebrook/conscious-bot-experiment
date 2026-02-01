/**
 * Temporal Planning — Integration Seam
 *
 * Capsule-driven temporal utilities for Rig C. All temporal logic
 * delegates to an injected P03TemporalAdapter — the same adapter
 * proven by conformance tests.
 *
 * No new temporal types are invented here. All state representations
 * use P03 capsule types from sterling/primitives/p03/.
 */

// Time state construction
export {
  MINECRAFT_BUCKET_SIZE_TICKS,
  HORIZON_BUCKETS,
  MAX_WAIT_BUCKETS,
  DEFAULT_HORIZON_BUCKETS,
  MINECRAFT_SLOT_TYPES,
  inferSlotsFromBlocks,
  toTickBucket,
  makeTemporalState,
} from './time-state';
export type { MinecraftSlotType, MakeTemporalStateInput } from './time-state';

// Duration model
export {
  OPERATOR_DURATIONS,
  findDuration,
  computeDurationTicks,
  annotateRuleWithDuration,
} from './duration-model';
export type { OperatorDuration, DurationAnnotation } from './duration-model';

// Capacity management
export {
  canonicalizeState,
  findSlot,
  reserveSlot,
  getEarliestAvailableBucket,
} from './capacity-manager';

// Deadlock prevention
export {
  deriveSlotNeeds,
  checkDeadlockForRules,
  checkDeadlock,
} from './deadlock-prevention';

// Batch operators
export {
  MINECRAFT_BATCH_OPERATORS,
  getBatchHint,
} from './batch-operators';
export type { BatchHint } from './batch-operators';

// Makespan objective
export {
  computeMakespan,
  computeTemporalCost,
} from './makespan-objective';
export type { TemporalCost } from './makespan-objective';

// Orchestration entrypoint
export {
  computeTemporalEnrichment,
} from './temporal-enrichment';
export type {
  TemporalMode,
  TemporalEnrichment,
  EnrichedCraftingRule,
  ComputeEnrichmentInput,
} from './temporal-enrichment';

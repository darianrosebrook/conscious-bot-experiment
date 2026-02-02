/**
 * Hierarchical Planning Module — Macro/Micro Planning (Rig E)
 *
 * @author @darianrosebrook
 */

// Macro state types
export {
  MACRO_STATE_SCHEMA_VERSION,
  MAX_MACRO_DEPTH,
  DEFAULT_REPLAN_THRESHOLD,
  COST_LEARNING_RATE,
  ContextRegistry,
  computeEdgeId,
  computeMacroPlanDigest,
  createMacroEdgeSession,
  finalizeSession,
} from './macro-state';
export type {
  ContextDefinition,
  MacroEdge,
  MacroPlan,
  MacroStateGraph,
  MicroOutcome,
  MacroEdgeSession,
} from './macro-state';

// Macro planner
export { MacroPlanner, buildDefaultMinecraftGraph } from './macro-planner';

// Feedback store
export { FeedbackStore } from './feedback';
export type {
  CostUpdate,
  ReplanDecision,
  PlanningViolation,
} from './feedback';

// Signals
export { collectRigESignals } from './signals';
export type { RigESignals, CollectRigESignalsInput } from './signals';

// World graph builder (E.1)
export { buildWorldGraph } from './world-graph-builder';
export type {
  BiomeRegion,
  StructureLocation,
  ResourceZone,
  MinecraftWorldGraphInput,
} from './world-graph-builder';

// Edge decomposer (E.2)
export {
  decomposeEdge,
  registerDecomposition,
  DECOMPOSITION_REGISTRY,
} from './edge-decomposer';
export type { MicroStep, BotState, DecomposeFn } from './edge-decomposer';

// Feedback integration (E.3)
export { FeedbackIntegration } from './feedback-integration';
export type { EdgeSession, EdgeCompletionResult } from './feedback-integration';

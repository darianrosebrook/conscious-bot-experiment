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

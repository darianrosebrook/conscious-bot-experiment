/**
 * Eval Types — Shared Type Definitions
 *
 * Common type definitions used across the eval system.
 *
 * @author @darianrosebrook
 */

// Re-export from harness for convenience
export type {
  // Scenario types
  EvalScenario,
  SuiteLoadResult,
  ValidationError,

  // Metrics types
  ScenarioResult,
  EvalMetrics,
  EvalPassCriteria,
  ScenarioSummary,

  // Config types
  EvalConfig,
  EvalRunResult,
  LLMConfig,

  // Profile types
  FrameProfileName,
  FrameProfileSummary,
  SamplerProfile,
  SamplerProfileName,
  SamplerProfileSummary,

  // Event types
  EvalEventType,
  EvalRunContext,
  EvalEvent,

  // Bundle types
  EvalSummary,
  ResultBundle,
} from './harness';

// ============================================================================
// Additional Shared Types
// ============================================================================

/**
 * Stimulus kinds supported by the eval system.
 */
export type StimulusKind =
  | 'low_stimulus_stable'
  | 'nightfall'
  | 'hunger_drop'
  | 'health_drop'
  | 'damage_event'
  | 'threat_delta'
  | 'novel_entity'
  | 'resource_discovery'
  | 'task_completion_idle'
  | 'eval_poke';

/**
 * Action affordance labels from oracle.
 */
export type ActionAffordance = 'discouraged' | 'allowed' | 'expected';

/**
 * Time of day values.
 */
export type TimeOfDay = 'dawn' | 'day' | 'sunset' | 'night' | 'unknown';

/**
 * Threat level values.
 */
export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Delta types for state changes.
 */
export type DeltaType =
  | 'threat_delta'
  | 'damage_taken'
  | 'hunger_change'
  | 'health_change'
  | 'new_entity'
  | 'lost_entity'
  | 'time_advanced'
  | 'item_gained'
  | 'item_lost'
  | 'other';

/**
 * Eval run mode.
 */
export type EvalMode = 'thought_only' | 'end_to_end';

/**
 * Frame profile for eval configuration.
 */
export type FrameProfile = 'minimal' | 'balanced' | 'rich';

/**
 * Sampler profile for eval configuration.
 */
export type SamplerProfileType = 'low-variance' | 'standard' | 'creative';

/**
 * Eval Harness — Main Entry Point
 *
 * This module provides the complete eval harness infrastructure for
 * evaluating thought generation against scenario suites.
 *
 * @author @darianrosebrook
 */

// Orchestrator
export { runEval, SURFACE_VERSION, SURFACE_DIGESTS } from './eval-orchestrator';
export type { EvalConfig, EvalRunResult, LLMConfig } from './eval-orchestrator';

// Scenario Loading
export { ScenarioLoader, discoverSuites, getSuiteId } from './scenario-loader';
export type { EvalScenario, SuiteLoadResult, ValidationError } from './scenario-loader';

// Metrics
export { MetricsCollector, countAvailableFacts } from './metrics-collector';
export type { ScenarioResult, EvalMetrics, EvalPassCriteria, ScenarioSummary } from './metrics-collector';

// Frame Profiles
export { FRAME_PROFILES, getFrameProfile, isValidFrameProfile, getFrameProfileNames, getFrameProfileSummary } from './frame-profiles';
export type { FrameProfileName, FrameProfileSummary } from './frame-profiles';

// Sampler Profiles
export { SAMPLER_PROFILES, getSamplerProfile, isValidSamplerProfile, getSamplerProfileNames, getSamplerProfileSummary, getDefaultSamplerProfile } from './sampler-profiles';
export type { SamplerProfile, SamplerProfileName, SamplerProfileSummary } from './sampler-profiles';

// Event Emitter
export { EvalEventEmitter, buildSuiteLoadedPayload, buildSuiteInvalidPayload, buildProductionSurfacePayload, buildScenarioStartedPayload, buildScenarioResultPayload, buildModePayload } from './event-emitter';
export type { EvalEventType, EvalRunContext, EvalEvent } from './event-emitter';

// Result Bundle
export { computeBundleId, createResultBundle, generateRunId, buildOutputDir } from './result-bundle';
export type { EvalSummary, ResultBundle } from './result-bundle';

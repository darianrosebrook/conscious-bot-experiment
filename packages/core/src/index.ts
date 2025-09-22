/**
 * @conscious-bot/core - Foundational signal-driven control architecture
 *
 * Exports all core components for building cognitive agents with
 * real-time constraints and signal-driven behavior.
 *
 * @author @darianrosebrook
 */

// Main classes
export { Arbiter, ReflexModule } from './arbiter';
export { SignalProcessor } from './signal-processor';
export { PerformanceMonitor } from './performance-monitor';
export type { TrackingSession } from './performance-monitor';

// Hybrid HRM Integration
export { HybridHRMArbiter } from './hybrid-hrm-arbiter';
export type {
  HRMSignal,
  NeedScore,
  HRMGoalTemplate,
  HRMGoalCandidate,
  HRMPerformanceBudgets,
  CachedResult,
  SignalBatch,
  OptimizationStats,
} from './hybrid-hrm-arbiter';

// Advanced Components
export { AdvancedNeedGenerator } from './advanced-need-generator';
export { GoalTemplateManager } from './goal-template-manager';
export { AdvancedSignalProcessor } from './advanced-signal-processor';
export { PriorityRanker } from './priority-ranker';

// MCP Capabilities
export { CapabilityRegistry, ConstitutionalFilter } from './mcp-capabilities';
export { CapabilityRateLimiter } from './mcp-capabilities/rate-limiter';
export { createLeafContext } from './mcp-capabilities/leaf-contracts';
export { LeafFactory } from './mcp-capabilities/leaf-factory';
export { DynamicCreationFlow } from './mcp-capabilities';
export type {
  ShadowRunResult,
  ImpasseResult,
  RegistryStatus,
} from './mcp-capabilities';

// Leaf Contract Types
export type {
  LeafImpl,
  LeafContext,
  LeafResult,
  LeafSpec,
  LeafStatus,
  LeafPermission,
  LeafRunOptions,
  RegistrationResult,
  ExecError,
  ExecErrorCode,
  WorldSnapshot,
  InventoryState,
  InventoryItem,
  Entity,
  JSONSchema7,
} from './mcp-capabilities/leaf-contracts';

// Leaf Implementations
export * from './leaves/movement-leaves';
export * from './leaves/interaction-leaves';
export * from './leaves/sensing-leaves';
export * from './leaves/crafting-leaves';

// Real-Time Performance Monitoring
export {
  PerformanceTracker,
  BudgetEnforcer,
  DegradationManager,
  AlertingSystem,
} from './real-time';

// Types and interfaces
export * from './types';
export * from './mcp-capabilities/types';
// LLM
export { OllamaClient } from './llm/ollama-client';

// Logging configuration
export * from './logging/config';

// Advanced component types - explicit exports to avoid conflicts
export type {
  Need,
  NeedContext,
  NeedHistoryEntry,
  TrendAnalysis,
  TrendPrediction,
  EnhancedNeed,
  MemorySignal,
  ContextGate,
  NeedType,
  TrendDirection,
  TimeOfDay,
  LocationType,
  SocialContext,
  EnvironmentalFactor,
  AdvancedNeedGeneratorConfig,
} from './advanced-need-generator';

export type {
  GoalTemplate,
  ResourceRequirement,
  SuccessCriterion,
  FailureCondition,
  FeasibilityFactor,
  PlanSketchHint,
  GoalInstance,
  GoalContext,
  RiskAssessment,
  RiskFactor,
  MitigationStrategy,
  ContingencyPlan,
  GoalAdaptation,
  GoalCheckpoint,
  ResourceStatus,
  Blocker,
  SuccessMetric,
  GoalCategory,
  ResourceType,
  RiskLevel,
  RiskType,
  GoalStatus,
  GoalTemplateManagerConfig,
} from './goal-template-manager';

export type {
  Signal,
  SignalData,
  SignalMetadata,
  FusedSignal,
  IntrusionSignal,
  MemorySignal as AdvancedMemorySignal,
  SocialSignal,
  SignalFusion,
  FusionMetadata,
  RedundancyAnalysis,
  ConfidenceFactor,
  SignalPattern,
  ThreatAssessment,
  MitigationStrategy as SignalMitigationStrategy,
  SignalType,
  SignalSource,
  SignalDirection,
  FusionMethod,
  ThreatLevel,
  ThreatType,
  MemoryType,
  SocialSignalType,
  CommunicationIntent,
  AdvancedSignalProcessorConfig,
} from './advanced-signal-processor';

export type {
  PriorityTask,
  PrioritizedTask,
  TaskContext,
  TaskMetadata,
  PriorityFactor,
  Commitment,
  Opportunity,
  PriorityRanking,
  RankingMetadata,
  PriorityDistribution,
  RiskLevel as PriorityRiskLevel,
  CommitmentType,
  OpportunityType,
  RankingMethod,
  PriorityRankerConfig,
} from './priority-ranker';
// Re-export real-time types with explicit naming to avoid conflicts
export type {
  PerformanceMetrics as RealTimePerformanceMetrics,
  PerformanceMetricsSchema as RealTimePerformanceMetricsSchema,
  DegradationLevel as RealTimeDegradationLevel,
} from './real-time/types';

// Export remaining real-time types that don't conflict
export type {
  PerformanceQuery,
  PerformanceStats,
  PerformanceBaseline,
  PerformanceAnomaly,
  OperationType,
  PerformanceContext,
} from './real-time/types';

// Cognitive module interface
export type { CognitiveModule } from './arbiter';

// Configuration defaults
export { DEFAULT_ARBITER_CONFIG } from './arbiter';
export { DEFAULT_SIGNAL_CONFIG } from './signal-processor';
export { DEFAULT_PERFORMANCE_CONFIG } from './performance-monitor';

// Version info
export const VERSION = '0.1.0';

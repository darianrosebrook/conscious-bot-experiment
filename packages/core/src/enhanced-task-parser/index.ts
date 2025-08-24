/**
 * Enhanced Task Parser Module - Main Export
 *
 * Provides sophisticated task parsing and environmental immersion capabilities
 * for the conscious bot, incorporating proven patterns from successful
 * autonomous Minecraft bot implementations.
 *
 * @author @darianrosebrook
 */

// Core components
export { TaskParser } from './task-parser';
export { EnvironmentalImmersion } from './environmental-immersion';

// Cognitive integration components
export {
  CognitiveTaskParser,
  CognitiveTaskIntegration,
} from './cognitive-integration';
export {
  VibeCodedCognitiveIntegration,
  VibeCodedTaskExecutor,
} from './vibe-coded-integration';

// Types and interfaces
export * from './types';

// Re-export commonly used types for convenience
export type {
  TaskDefinition,
  TaskExecution,
  EnvironmentalContext,
  TaskValidationResult,
  TaskFeasibility,
  TaskParsingResult,
  TaskParserConfig,
  TaskPerformanceMetrics,
  ChatMessage,
  Command,
  EntityInfo,
  ResourceMap,
  SocialContext,
} from './types';

// Re-export schemas for validation
export {
  TaskDefinitionSchema,
  TaskExecutionSchema,
  EnvironmentalContextSchema,
  TaskValidationResultSchema,
  TaskFeasibilitySchema,
  ChatMessageSchema,
  CommandSchema,
  EntityInfoSchema,
  ResourceMapSchema,
  SocialContextSchema,
  TaskParserConfigSchema,
  DEFAULT_TASK_PARSER_CONFIG,
} from './types';

// Re-export error types
export { TaskParserError } from './types';

export type { TaskParserErrorInfo } from './types';

// Re-export utility types
export type { TaskExecutionContext, RecoveryStrategy } from './types';

// Re-export WorldState from environmental-immersion
export type { WorldState } from './environmental-immersion';

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

// Enhanced task parser components
export { EnhancedTaskParser } from './enhanced-task-parser';
export type { 
  EnhancedTaskParserConfig,
  EnhancedTaskParsingResult,
  UserInteractionContext,
  SchemaValidationResult,
} from './enhanced-task-parser';

// Dual-channel prompting components
export { DualChannelPrompting } from './dual-channel-prompting';
export type {
  ChannelType,
  PromptConfig,
  DualChannelConfig,
  ChannelSelectionCriteria,
  PromptResult,
  TaskParaphraseResult,
} from './dual-channel-prompting';

// Creative paraphrasing components
export { CreativeParaphrasing } from './creative-paraphrasing';
export type {
  ParaphrasingStyle,
  ContextAdaptation,
  CreativeParaphrasingConfig,
  ParaphrasingContext,
  EnhancedParaphraseResult,
  LanguageGenerationRequest,
} from './creative-paraphrasing';

// Cognitive integration components
export { CognitiveTaskParser } from './cognitive-integration';
export type { CognitiveTaskIntegration } from './cognitive-integration';
export { TaskOrientedCognitiveIntegration } from './task-oriented-integration';
export type { TaskExecutor } from './task-oriented-integration';

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

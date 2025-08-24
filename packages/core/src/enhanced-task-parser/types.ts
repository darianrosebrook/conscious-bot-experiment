/**
 * Enhanced Task Parser Types and Interfaces
 *
 * Provides sophisticated task parsing and environmental immersion capabilities
 * for the conscious bot, incorporating proven patterns from successful
 * autonomous Minecraft bot implementations.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ===== TASK DEFINITION SCHEMAS =====

/**
 * Task type enumeration for different Minecraft activities
 */
export const TaskTypeSchema = z.enum([
  'gathering',
  'processing',
  'farming',
  'crafting',
  'exploration',
  'social',
  'construction',
  'combat',
  'navigation',
  'survival',
]);

export type TaskType = z.infer<typeof TaskTypeSchema>;

/**
 * Safety level for task execution
 */
export const SafetyLevelSchema = z.enum(['safe', 'risky', 'dangerous']);

export type SafetyLevel = z.infer<typeof SafetyLevelSchema>;

/**
 * Task execution status
 */
export const TaskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'failed',
  'paused',
  'cancelled',
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Structured task definition with comprehensive metadata
 */
export const TaskDefinitionSchema = z.object({
  id: z.string(),
  type: TaskTypeSchema,
  parameters: z.record(z.any()),
  priority: z.number().min(0).max(1).optional(),
  timeout: z.number().positive().optional(),
  safety_level: SafetyLevelSchema.optional(),
  estimated_duration: z.number().positive().optional(),
  dependencies: z.array(z.string()).optional(),
  fallback_actions: z.array(z.string()).optional(),
  created_at: z.number(),
  updated_at: z.number(),
  metadata: z.record(z.any()).optional(),
});

export type TaskDefinition = z.infer<typeof TaskDefinitionSchema>;

/**
 * Task execution progress and state
 */
export const TaskExecutionSchema = z.object({
  task: TaskDefinitionSchema,
  status: TaskStatusSchema,
  progress: z.number().min(0).max(1),
  current_step: z.string(),
  attempts: z.number().nonnegative(),
  last_attempt: z.number(),
  error_history: z.array(
    z.object({
      error: z.string(),
      timestamp: z.number(),
      context: z.record(z.any()).optional(),
    })
  ),
  recovery_strategies: z.array(z.string()),
  started_at: z.number().optional(),
  completed_at: z.number().optional(),
});

export type TaskExecution = z.infer<typeof TaskExecutionSchema>;

// ===== ENVIRONMENTAL CONTEXT SCHEMAS =====

/**
 * Time of day enumeration
 */
export const TimeOfDaySchema = z.enum(['dawn', 'day', 'dusk', 'night']);

export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

/**
 * Weather conditions
 */
export const WeatherSchema = z.enum(['clear', 'rain', 'storm', 'snow']);

export type Weather = z.infer<typeof WeatherSchema>;

/**
 * Entity information for environmental context
 */
export const EntityInfoSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  distance: z.number(),
  is_hostile: z.boolean(),
  is_friendly: z.boolean(),
  health: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

export type EntityInfo = z.infer<typeof EntityInfoSchema>;

/**
 * Resource availability mapping
 */
export const ResourceMapSchema = z.record(
  z.object({
    available: z.boolean(),
    quantity: z.number().optional(),
    location: z.string().optional(),
    last_seen: z.number().optional(),
    confidence: z.number().min(0).max(1),
  })
);

export type ResourceMap = z.infer<typeof ResourceMapSchema>;

/**
 * Social context information
 */
export const SocialContextSchema = z.object({
  nearby_players: z.array(z.string()),
  nearby_villagers: z.array(z.string()),
  chat_activity: z.boolean(),
  last_interaction: z.number().optional(),
  social_mood: z.enum(['friendly', 'neutral', 'hostile']).optional(),
});

export type SocialContext = z.infer<typeof SocialContextSchema>;

/**
 * Comprehensive environmental context
 */
export const EnvironmentalContextSchema = z.object({
  time_of_day: TimeOfDaySchema,
  weather: WeatherSchema,
  biome: z.string(),
  light_level: z.number().min(0).max(15),
  threat_level: z.number().min(0).max(1),
  nearby_entities: z.array(EntityInfoSchema),
  resource_availability: ResourceMapSchema,
  social_context: SocialContextSchema,
  timestamp: z.number(),
});

export type EnvironmentalContext = z.infer<typeof EnvironmentalContextSchema>;

// ===== TASK VALIDATION SCHEMAS =====

/**
 * Task validation result
 */
export const TaskValidationResultSchema = z.object({
  is_valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  suggestions: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type TaskValidationResult = z.infer<typeof TaskValidationResultSchema>;

/**
 * Task feasibility analysis
 */
export const TaskFeasibilitySchema = z.object({
  is_feasible: z.boolean(),
  confidence: z.number().min(0).max(1),
  missing_resources: z.array(z.string()),
  missing_skills: z.array(z.string()),
  environmental_constraints: z.array(z.string()),
  estimated_cost: z.number().positive(),
  risk_assessment: z.object({
    level: SafetyLevelSchema,
    factors: z.array(z.string()),
    mitigation_strategies: z.array(z.string()),
  }),
});

export type TaskFeasibility = z.infer<typeof TaskFeasibilitySchema>;

// ===== MINEflayer INTEGRATION SCHEMAS =====

/**
 * Result of block gathering operation
 */
export const GatherResultSchema = z.object({
  success: z.boolean(),
  gathered: z.number().nonnegative(),
  results: z.array(
    z.object({
      success: z.boolean(),
      block: z.any().optional(),
      position: z.any().optional(),
      error: z.string().optional(),
    })
  ),
  duration: z.number().positive(),
});

export type GatherResult = z.infer<typeof GatherResultSchema>;

/**
 * Task storage interface for persistence
 */
export const TaskStorageSchema = z.object({
  task_id: z.string(),
  progress: z.any(),
  timestamp: z.number(),
});

export type TaskStorage = z.infer<typeof TaskStorageSchema>;

// ===== CHAT PROCESSING SCHEMAS =====

/**
 * Message type classification
 */
export const MessageTypeSchema = z.enum([
  'command',
  'question',
  'statement',
  'greeting',
  'farewell',
  'request',
  'response',
]);

export type MessageType = z.infer<typeof MessageTypeSchema>;

/**
 * Emotion classification for chat messages
 */
export const EmotionSchema = z.enum([
  'neutral',
  'friendly',
  'hostile',
  'curious',
  'helpful',
  'frustrated',
  'excited',
]);

export type Emotion = z.infer<typeof EmotionSchema>;

/**
 * Enhanced chat message with classification
 */
export const ChatMessageSchema = z.object({
  id: z.string(),
  sender: z.string(),
  content: z.string(),
  timestamp: z.number(),
  is_own_message: z.boolean(),
  message_type: MessageTypeSchema,
  intent: z.string(),
  emotion: EmotionSchema,
  requires_response: z.boolean(),
  response_priority: z.number().min(0).max(1),
  metadata: z.record(z.any()).optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * Extracted command from chat message
 */
export const CommandSchema = z.object({
  type: z.string(),
  parameters: z.record(z.any()),
  confidence: z.number().min(0).max(1),
  source: z.string(),
  timestamp: z.number(),
  original_message: z.string(),
});

export type Command = z.infer<typeof CommandSchema>;

// ===== PARSER CONFIGURATION SCHEMAS =====

/**
 * Task parser configuration
 */
export const TaskParserConfigSchema = z.object({
  enable_validation: z.boolean(),
  enable_feasibility_check: z.boolean(),
  enable_progress_persistence: z.boolean(),
  enable_chat_processing: z.boolean(),
  max_task_history: z.number().positive(),
  validation_timeout: z.number().positive(),
  feasibility_timeout: z.number().positive(),
  chat_processing_timeout: z.number().positive(),
  debug_mode: z.boolean(),
});

export type TaskParserConfig = z.infer<typeof TaskParserConfigSchema>;

/**
 * Default task parser configuration
 */
export const DEFAULT_TASK_PARSER_CONFIG: TaskParserConfig = {
  enable_validation: true,
  enable_feasibility_check: true,
  enable_progress_persistence: true,
  enable_chat_processing: true,
  max_task_history: 1000,
  validation_timeout: 5000,
  feasibility_timeout: 10000,
  chat_processing_timeout: 3000,
  debug_mode: false,
};

// ===== ERROR TYPES =====

/**
 * Task parsing error types
 */
export enum TaskParserError {
  INVALID_TASK_DEFINITION = 'INVALID_TASK_DEFINITION',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  FEASIBILITY_CHECK_FAILED = 'FEASIBILITY_CHECK_FAILED',
  RESOURCE_UNAVAILABLE = 'RESOURCE_UNAVAILABLE',
  ENVIRONMENTAL_CONSTRAINT = 'ENVIRONMENTAL_CONSTRAINT',
  SKILL_MISSING = 'SKILL_MISSING',
  TIMEOUT = 'TIMEOUT',
  PARSING_ERROR = 'PARSING_ERROR',
}

/**
 * Task parser error with context
 */
export interface TaskParserErrorInfo {
  type: TaskParserError;
  message: string;
  context?: Record<string, any>;
  timestamp: number;
}

// ===== UTILITY TYPES =====

/**
 * Task parsing result with validation and feasibility
 */
export interface TaskParsingResult {
  task: TaskDefinition;
  validation: TaskValidationResult;
  feasibility: TaskFeasibility;
  environmental_context: EnvironmentalContext;
  parsing_time: number;
}

/**
 * Task execution context with environmental information
 */
export interface TaskExecutionContext {
  task: TaskDefinition;
  environmental_context: EnvironmentalContext;
  available_resources: ResourceMap;
  current_skills: string[];
  social_context: SocialContext;
  timestamp: number;
}

/**
 * Recovery strategy for failed tasks
 */
export interface RecoveryStrategy {
  name: string;
  description: string;
  conditions: string[];
  actions: string[];
  success_probability: number;
  cost: number;
}

/**
 * Task performance metrics
 */
export interface TaskPerformanceMetrics {
  parsing_time: number;
  validation_time: number;
  feasibility_time: number;
  execution_time: number;
  success_rate: number;
  error_rate: number;
  recovery_rate: number;
}

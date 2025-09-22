/**
 * Core types and interfaces for the conscious bot architecture
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ===== COGNITIVE TASK SYSTEM =====

/**
 * Module type enumeration
 */
export enum ModuleType {
  PLANNING = 'planning',
  REASONING = 'reasoning',
  SOCIAL = 'social',
  REACTIVE = 'reactive',
  EXPLORATION = 'exploration',
}

// ===== SIGNAL SYSTEM =====

/**
 * Normalized signal from various sources (body, environment, social, etc.)
 */
export const SignalSchema = z.object({
  type: z.enum([
    'health',
    'hunger',
    'fatigue',
    'threat',
    'social',
    'memory',
    'intrusion',
    'safety',
    'nutrition',
    'progress', // Add missing types for tests
  ]),
  intensity: z.number().min(0).max(1),
  urgency: z.number().min(0).max(1), // Add urgency field for tests
  trend: z.number().min(-1).max(1), // Rate of change
  confidence: z.number().min(0).max(1),
  timestamp: z.number(),
  source: z.string(),
  metadata: z.record(z.any()).optional(),
});

export type Signal = z.infer<typeof SignalSchema>;

/**
 * Aggregated need scores computed from signals
 */
export const NeedScoreSchema = z.object({
  type: z.enum([
    'safety',
    'nutrition',
    'progress',
    'social',
    'curiosity',
    'integrity',
  ]),
  score: z.number().min(0).max(1),
  trend: z.number().min(-1).max(1),
  urgency: z.number().min(0).max(1),
  lastUpdated: z.number(),
});

export type NeedScore = z.infer<typeof NeedScoreSchema>;

// ===== COGNITIVE TASKS =====

/**
 * Task that requires cognitive processing
 */
export const CognitiveTaskSchema = z.object({
  id: z.string(),
  type: z.enum(['planning', 'reasoning', 'social', 'reactive', 'exploration']),
  priority: z.number().min(0).max(1),
  urgency: z.number().min(0).max(1),
  complexity: z.enum(['simple', 'moderate', 'complex']),
  context: z.record(z.any()),
  deadline: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

export type CognitiveTask = z.infer<typeof CognitiveTaskSchema>;

/**
 * Signature of a task for routing decisions
 */
export const TaskSignatureSchema = z.object({
  type: z.string(),
  complexity: z.string(),
  requirements: z.array(z.string()),
  timeConstraint: z.number().optional(),
  symbolicPreconditions: z.array(z.string()).optional(),
  requiresPlanning: z.boolean().optional(),
  socialContent: z.boolean().optional(),
  ambiguousContext: z.boolean().optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

export type TaskSignature = z.infer<typeof TaskSignatureSchema>;

/**
 * Routing decision for task processing
 */
export const RoutingDecisionSchema = z.object({
  selectedModule: z.nativeEnum(ModuleType),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  alternatives: z.array(
    z.object({
      module: z.nativeEnum(ModuleType),
      score: z.number().min(0).max(1),
      reason: z.string(),
    })
  ),
  processingTime: z.number().optional(),
  riskAssessment: z.enum(['low', 'medium', 'high']).optional(),
  timestamp: z.number(),
});

export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

// ===== PERFORMANCE BUDGETS =====

/**
 * Performance budget for operations
 */
export const PerformanceBudgetSchema = z.object({
  context: z.enum(['emergency', 'routine', 'deliberative']),
  total: z.number().positive(), // Total budget in ms
  allocated: z.number().nonnegative(), // Already allocated time
  remaining: z.number().nonnegative(), // Remaining time
  breakdown: z.object({
    signalProcessing: z.number().nonnegative(),
    routing: z.number().nonnegative(),
    execution: z.number().nonnegative(),
  }),
});

export type PerformanceBudget = z.infer<typeof PerformanceBudgetSchema>;

/**
 * Performance metrics for monitoring
 */
export const PerformanceMetricsSchema = z.object({
  latency: z.object({
    p50: z.number().nonnegative(),
    p95: z.number().nonnegative(),
    p99: z.number().nonnegative(),
    max: z.number().nonnegative(),
    mean: z.number().nonnegative(),
  }),
  throughput: z.object({
    operationsPerSecond: z.number().nonnegative(),
    queueDepth: z.number().nonnegative(),
  }),
  resources: z.object({
    cpuUtilization: z.number().min(0).max(1),
    memoryUsage: z.number().nonnegative(), // MB
  }),
  quality: z.object({
    successRate: z.number().min(0).max(1),
    errorRate: z.number().min(0).max(1),
  }),
});

export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;

// ===== MODULE SYSTEM =====

/**
 * Available cognitive modules for task processing
 */
export enum ModuleType {
  HRM = 'hrm', // Hierarchical Reasoning Model
  LLM = 'llm', // Large Language Model
  GOAP = 'goap', // Goal-Oriented Action Planning
  REFLEX = 'reflex', // Immediate reflexes
}

// ===== PREEMPTION SYSTEM =====

/**
 * Preemption priorities for task interruption
 */
export enum PreemptionPriority {
  EMERGENCY_REFLEX = 0, // Immediate danger (fall, lava, attack)
  SAFETY_INTERRUPT = 1, // Safety violations, health critical
  GOAL_COMPLETION = 2, // Active goal execution
  EXPLORATION = 3, // Curiosity-driven behavior
  IDLE_PROCESSING = 4, // Background tasks, memory consolidation
}

/**
 * Preemption decision and execution plan
 */
export const PreemptionDecisionSchema = z.object({
  shouldPreempt: z.boolean(),
  priority: z.nativeEnum(PreemptionPriority),
  currentTask: CognitiveTaskSchema.optional(),
  incomingTask: CognitiveTaskSchema,
  preservationRequired: z.boolean(),
  reasoning: z.string(),
  estimatedCost: z.number().nonnegative(), // ms
});

export type PreemptionDecision = z.infer<typeof PreemptionDecisionSchema>;

// ===== SAFETY & DEGRADATION =====

/**
 * Safety violation types
 */
export const SafetyViolationSchema = z.object({
  type: z.enum([
    'budget_exceeded',
    'infinite_loop',
    'memory_leak',
    'unsafe_operation',
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string(),
  timestamp: z.number(),
  context: z.record(z.any()),
  suggestedAction: z.string(),
});

export type SafetyViolation = z.infer<typeof SafetyViolationSchema>;

/**
 * System degradation levels
 */
export enum DegradationLevel {
  NONE = 0, // Full functionality
  MINIMAL = 1, // Minor feature reduction
  MODERATE = 2, // Significant capability reduction
  SEVERE = 3, // Emergency functionality only
  CRITICAL = 4, // Safety-only operation
}

/**
 * Health assessment result
 */
export const HealthAssessmentSchema = z.object({
  overall: z.enum(['healthy', 'degraded', 'critical']),
  degradationLevel: z.nativeEnum(DegradationLevel),
  violations: z.array(SafetyViolationSchema),
  recommendations: z.array(z.string()),
  timestamp: z.number(),
});

export type HealthAssessment = z.infer<typeof HealthAssessmentSchema>;

// ===== NEED SYSTEM TYPES =====

export enum NeedType {
  SAFETY = 'safety',
  NUTRITION = 'nutrition',
  PROGRESS = 'progress',
  SOCIAL = 'social',
  CURIOSITY = 'curiosity',
  INTEGRITY = 'integrity',
  ACHIEVEMENT = 'achievement',
  BELONGING = 'belonging',
}

export enum TrendDirection {
  INCREASING = 'increasing',
  DECREASING = 'decreasing',
  STABLE = 'stable',
  OSCILLATING = 'oscillating',
  VOLATILE = 'volatile',
  UNKNOWN = 'unknown',
}

export enum TimeOfDay {
  DAWN = 'dawn',
  MORNING = 'morning',
  NOON = 'noon',
  AFTERNOON = 'afternoon',
  DUSK = 'dusk',
  NIGHT = 'night',
  MIDNIGHT = 'midnight',
  UNKNOWN = 'unknown',
}

export enum LocationType {
  VILLAGE = 'village',
  WILDERNESS = 'wilderness',
  CAVE = 'cave',
  OCEAN = 'ocean',
  NETHER = 'nether',
  END = 'end',
  UNKNOWN = 'unknown',
}

export enum SocialContext {
  ALONE = 'alone',
  WITH_PLAYERS = 'with_players',
  WITH_NPCS = 'with_npcs',
  IN_GROUP = 'in_group',
  IN_CONFLICT = 'in_conflict',
  LEADING = 'leading',
  FOLLOWING = 'following',
}

export interface EnvironmentalFactor {
  type: string;
  intensity: number;
  impact: number;
  description: string;
}

export interface NeedContext {
  timeOfDay: TimeOfDay;
  location: LocationType;
  socialContext: SocialContext;
  environmentalFactors: EnvironmentalFactor[];
  recentEvents: string[];
  currentGoals: string[];
  availableResources: string[];
}

export interface NeedHistoryEntry {
  timestamp: number;
  intensity: number;
  urgency: number;
  context: Partial<NeedContext>;
  triggers: string[];
  satisfaction: number; // 0-1, how well the need was met
}

export interface Need {
  id: string;
  type: NeedType;
  intensity: number; // 0-1
  urgency: number; // 0-1
  trend: TrendDirection;
  trendStrength: number; // 0-1
  context: NeedContext;
  memoryInfluence: number; // 0-1
  noveltyScore: number; // 0-1
  commitmentBoost: number; // 0-1
  timestamp: number;
  history: NeedHistoryEntry[];
}

// ===== TASK SYSTEM TYPES =====

export enum TaskType {
  MAINTENANCE = 'maintenance',
  GOAL_PURSUIT = 'goal_pursuit',
  SOCIAL = 'social',
  EXPLORATION = 'exploration',
  EMERGENCY = 'emergency',
  LEARNING = 'learning',
}

export enum ResourceType {
  TIME = 'time',
  ENERGY = 'energy',
  TOOLS = 'tools',
  MATERIALS = 'materials',
  ATTENTION = 'attention',
}

export interface ResourceRequirement {
  type: ResourceType;
  name: string;
  quantity: number;
  criticality: number; // 0-1, how critical this resource is
  alternatives: string[];
}

export interface TaskContext {
  environment: string;
  socialContext: string;
  currentGoals: string[];
  recentEvents: string[];
  availableResources: string[];
  constraints: string[];
  opportunities: string[];
  timeOfDay: string;
  energyLevel: number; // 0-1
  stressLevel: number; // 0-1
}

export interface TaskMetadata {
  category: string;
  tags: string[];
  difficulty: number; // 0-1
  skillRequirements: string[];
  emotionalImpact: number; // -1 to 1
  satisfaction: number; // 0-1, expected satisfaction
  novelty: number; // 0-1, how novel the task is
  socialValue: number; // 0-1, value to social relationships
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface PriorityTask {
  id: string;
  name: string;
  description: string;
  type: TaskType;
  basePriority: number; // 0-1
  urgency: number; // 0-1
  importance: number; // 0-1
  complexity: number; // 0-1
  estimatedDuration: number; // minutes
  deadline?: number; // timestamp
  dependencies: string[]; // task IDs
  resources: ResourceRequirement[];
  context: TaskContext;
  metadata: TaskMetadata;
  createdAt: number;
  lastUpdated: number;
}

export interface PriorityFactor {
  name: string;
  value: number; // 0-1
  weight: number; // 0-1
  description: string;
}

export interface PrioritizedTask extends PriorityTask {
  calculatedPriority: number; // 0-1, final priority score
  commitmentBoost: number; // 0-1, boost from commitments
  noveltyBoost: number; // 0-1, boost from novelty
  opportunityCostBoost: number; // 0-1, boost from opportunity cost
  deadlinePressure: number; // 0-1, pressure from approaching deadline
  resourceAvailability: number; // 0-1, how available resources are
  socialImpact: number; // 0-1, impact on social relationships
  learningValue: number; // 0-1, potential learning value
  riskLevel: RiskLevel;
  feasibility: number; // 0-1, how feasible the task is
  priorityFactors: PriorityFactor[];
  rankingReason: string;
}

// ===== CONFIGURATION =====

/**
 * Arbiter configuration
 */
export const ArbiterConfigSchema = z.object({
  performanceBudgets: z.object({
    emergency: z.number().positive(), // ms
    routine: z.number().positive(), // ms
    deliberative: z.number().positive(), // ms
  }),
  preemptionEnabled: z.boolean(),
  safeModeEnabled: z.boolean(),
  monitoringEnabled: z.boolean(),
  debugMode: z.boolean(),
});

export type ArbiterConfig = z.infer<typeof ArbiterConfigSchema>;

// ===== EVENTS =====

/**
 * System events for module communication
 */
export interface SystemEvents {
  'signal-received': [Signal];
  'needs-updated': [NeedScore[]];
  'task-routed': [{ task: CognitiveTask; decision: RoutingDecision }];
  'preemption-triggered': [PreemptionDecision];
  'safety-violation': [SafetyViolation];
  'degradation-changed': [DegradationLevel];
  'performance-update': [PerformanceMetrics];
  urgentNeedProcessed: [
    { need: string; urgency: number; result: any; timestamp: number },
  ];
  urgentNeedFailed: [
    { need: string; urgency: number; error: string; timestamp: number },
  ];
}

// ===== UTILITY TYPES =====

/**
 * Result wrapper for operations that can fail
 */
export type Result<T, E = Error> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: E;
    };

/**
 * Timestamped value for historical tracking
 */
export interface Timestamped<T> {
  value: T;
  timestamp: number;
}

/**
 * Bounded history for performance-sensitive collections
 */
export class BoundedHistory<T> {
  private items: Timestamped<T>[] = [];

  constructor(private maxSize: number = 1000) {}

  add(value: T): void {
    this.items.push({ value, timestamp: Date.now() });
    if (this.items.length > this.maxSize) {
      this.items.shift();
    }
  }

  getRecent(count: number = 10): Timestamped<T>[] {
    return this.items.slice(-count);
  }

  getSince(timestamp: number): Timestamped<T>[] {
    return this.items.filter((item) => item.timestamp >= timestamp);
  }

  clear(): void {
    this.items = [];
  }

  size(): number {
    return this.items.length;
  }
}

// Export validation functions
export const validateSignal = (data: unknown): Signal =>
  SignalSchema.parse(data);
export const validateCognitiveTask = (data: unknown): CognitiveTask =>
  CognitiveTaskSchema.parse(data);
export const validatePerformanceBudget = (data: unknown): PerformanceBudget =>
  PerformanceBudgetSchema.parse(data);
export const validateArbiterConfig = (data: unknown): ArbiterConfig =>
  ArbiterConfigSchema.parse(data);

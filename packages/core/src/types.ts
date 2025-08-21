/**
 * Core types and interfaces for the conscious bot architecture
 * 
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ===== SIGNAL SYSTEM =====

/**
 * Normalized signal from various sources (body, environment, social, etc.)
 */
export const SignalSchema = z.object({
  type: z.enum(['health', 'hunger', 'fatigue', 'threat', 'social', 'memory', 'intrusion']),
  intensity: z.number().min(0).max(1),
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
  type: z.enum(['safety', 'nutrition', 'progress', 'social', 'curiosity', 'integrity']),
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
  symbolicPreconditions: z.number().min(0).max(1),
  socialContent: z.boolean(),
  ambiguousContext: z.boolean(),
  requiresPlanning: z.boolean(),
  timeConstraint: z.number(), // ms
  riskLevel: z.enum(['low', 'medium', 'high']),
});

export type TaskSignature = z.infer<typeof TaskSignatureSchema>;

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
  HRM = 'hrm',           // Hierarchical Reasoning Model
  LLM = 'llm',           // Large Language Model
  GOAP = 'goap',         // Goal-Oriented Action Planning
  REFLEX = 'reflex',     // Immediate reflexes
}

/**
 * Routing decision for cognitive tasks
 */
export const RoutingDecisionSchema = z.object({
  selectedModule: z.nativeEnum(ModuleType),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  alternatives: z.array(z.object({
    module: z.nativeEnum(ModuleType),
    score: z.number().min(0).max(1),
    reason: z.string(),
  })),
  timestamp: z.number(),
});

export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

// ===== PREEMPTION SYSTEM =====

/**
 * Preemption priorities for task interruption
 */
export enum PreemptionPriority {
  EMERGENCY_REFLEX = 0,    // Immediate danger (fall, lava, attack)
  SAFETY_INTERRUPT = 1,    // Safety violations, health critical
  GOAL_COMPLETION = 2,     // Active goal execution
  EXPLORATION = 3,         // Curiosity-driven behavior
  IDLE_PROCESSING = 4,     // Background tasks, memory consolidation
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
  type: z.enum(['budget_exceeded', 'infinite_loop', 'memory_leak', 'unsafe_operation']),
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
  NONE = 0,           // Full functionality
  MINIMAL = 1,        // Minor feature reduction
  MODERATE = 2,       // Significant capability reduction  
  SEVERE = 3,         // Emergency functionality only
  CRITICAL = 4,       // Safety-only operation
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

// ===== CONFIGURATION =====

/**
 * Arbiter configuration
 */
export const ArbiterConfigSchema = z.object({
  performanceBudgets: z.object({
    emergency: z.number().positive(),    // ms
    routine: z.number().positive(),      // ms
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
}

// ===== UTILITY TYPES =====

/**
 * Result wrapper for operations that can fail
 */
export type Result<T, E = Error> = {
  success: true;
  data: T;
} | {
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
    return this.items.filter(item => item.timestamp >= timestamp);
  }
  
  clear(): void {
    this.items = [];
  }
  
  size(): number {
    return this.items.length;
  }
}

// Export validation functions
export const validateSignal = (data: unknown): Signal => SignalSchema.parse(data);
export const validateCognitiveTask = (data: unknown): CognitiveTask => CognitiveTaskSchema.parse(data);
export const validatePerformanceBudget = (data: unknown): PerformanceBudget => PerformanceBudgetSchema.parse(data);
export const validateArbiterConfig = (data: unknown): ArbiterConfig => ArbiterConfigSchema.parse(data);

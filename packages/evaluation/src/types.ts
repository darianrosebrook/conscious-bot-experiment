/**
 * Core types for evaluation framework
 *
 * Defines scenarios, metrics, and evaluation results for complex
 * multi-step reasoning assessment
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// Scenario complexity levels
export const ComplexityLevelSchema = z.enum([
  'basic', // Single-step tasks
  'intermediate', // 2-3 step tasks
  'advanced', // 4-6 step tasks
  'expert', // 7+ step tasks with interdependencies
  'emergent', // Open-ended scenarios without predefined solutions
]);

export type ComplexityLevel = z.infer<typeof ComplexityLevelSchema>;

// Reasoning domains
export const ReasoningDomainSchema = z.enum([
  'spatial', // Navigation, pathfinding, spatial relationships
  'logical', // Puzzle solving, deduction, pattern recognition
  'causal', // Cause-effect reasoning, prediction
  'social', // Multi-agent interaction, cooperation
  'resource', // Optimization, allocation, planning
  'temporal', // Time-based planning, sequencing
  'creative', // Novel problem solving, adaptation
  'ethical', // Moral reasoning, value conflicts
  'meta_cognitive', // Reasoning about reasoning, self-reflection
  'hybrid', // Multi-domain scenarios
]);

export type ReasoningDomain = z.infer<typeof ReasoningDomainSchema>;

// Scenario definition
export const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  domain: ReasoningDomainSchema,
  complexity: ComplexityLevelSchema,
  expectedDuration: z.number(), // milliseconds

  // Scenario parameters
  initialState: z.record(z.any()),
  goalConditions: z.array(z.string()),
  constraints: z.array(z.string()),
  resources: z.record(z.number()),

  // Evaluation criteria
  successCriteria: z.array(
    z.object({
      metric: z.string(),
      threshold: z.number(),
      weight: z.number(), // Importance weight 0-1
    })
  ),

  // Metadata
  tags: z.array(z.string()),
  difficulty: z.number().min(1).max(10),
  estimatedSteps: z.number(),
  requiresMemory: z.boolean(),
  requiresPlanning: z.boolean(),
  requiresLearning: z.boolean(),

  // Scenario configuration
  timeLimit: z.number().optional(),
  maxAttempts: z.number().default(3),
  allowPartialCredit: z.boolean().default(true),
  randomSeed: z.number().optional(),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

// Evaluation session
export const EvaluationSessionSchema = z.object({
  id: z.string(),
  scenarioId: z.string(),
  agentId: z.string(),
  startTime: z.number(),
  endTime: z.number().optional(),
  status: z.enum(['running', 'completed', 'failed', 'timeout', 'error']),

  // Results
  success: z.boolean().optional(),
  score: z.number().min(0).max(1).optional(),
  metrics: z.record(z.number()),

  // Execution trace
  steps: z.array(
    z.object({
      timestamp: z.number(),
      action: z.string(),
      parameters: z.record(z.any()),
      result: z.any(),
      reasoning: z.string().optional(),
      confidence: z.number().optional(),
    })
  ),

  // Performance data
  totalLatency: z.number().optional(),
  planningLatency: z.number().optional(),
  executionLatency: z.number().optional(),
  memoryUsage: z.number().optional(),

  // Error information
  errors: z.array(
    z.object({
      timestamp: z.number(),
      type: z.string(),
      message: z.string(),
      context: z.record(z.any()).optional(),
    })
  ),
});

export type EvaluationSession = z.infer<typeof EvaluationSessionSchema>;

// Metrics
export const MetricTypeSchema = z.enum([
  'success_rate', // Binary success/failure
  'efficiency', // Resource utilization
  'latency', // Time to completion
  'accuracy', // Correctness of solution
  'complexity', // Solution complexity
  'creativity', // Novelty of approach
  'robustness', // Performance under variation
  'consistency', // Repeatability
  'coherence', // Logical flow
  'completeness', // Goal achievement
  'adaptability', // Response to change
  'memory_usage', // Cognitive load
  'planning_quality', // Plan structure
  'reasoning_depth', // Inference chains
  'social_awareness', // Multi-agent considerations
]);

export type MetricType = z.infer<typeof MetricTypeSchema>;

export const MetricResultSchema = z.object({
  type: MetricTypeSchema,
  value: z.number(),
  weight: z.number(),
  description: z.string(),
  metadata: z.record(z.any()).optional(),
});

export type MetricResult = z.infer<typeof MetricResultSchema>;

// Evaluation results aggregation
export const EvaluationResultsSchema = z.object({
  sessionId: z.string(),
  scenarioId: z.string(),
  agentConfiguration: z.record(z.any()),

  // Overall performance
  overallScore: z.number().min(0).max(1),
  success: z.boolean(),

  // Detailed metrics
  metrics: z.array(MetricResultSchema),

  // Performance breakdown
  planningPerformance: z.object({
    latency: z.number(),
    qualityScore: z.number(),
    refinementCount: z.number(),
    routingDecisions: z.array(z.string()),
  }),

  executionPerformance: z.object({
    latency: z.number(),
    accuracyScore: z.number(),
    adaptationCount: z.number(),
    errorRate: z.number(),
  }),

  cognitivePerformance: z.object({
    memoryUtilization: z.number(),
    reasoningDepth: z.number(),
    coherenceScore: z.number(),
    creativityScore: z.number(),
  }),

  // Comparative analysis
  comparison: z
    .object({
      baseline: z.string().optional(),
      improvement: z.number().optional(),
      ranking: z.number().optional(),
    })
    .optional(),

  // Qualitative assessment
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),

  timestamp: z.number(),
});

export type EvaluationResults = z.infer<typeof EvaluationResultsSchema>;

// Curriculum progression
export const CurriculumLevelSchema = z.object({
  level: z.number(),
  name: z.string(),
  description: z.string(),
  scenarios: z.array(z.string()), // scenario IDs

  // Progression requirements
  passingScore: z.number().min(0).max(1),
  requiredSuccesses: z.number(),
  maxAttempts: z.number(),

  // Prerequisites
  prerequisites: z.array(z.number()), // level numbers
  unlocks: z.array(z.number()), // level numbers

  // Adaptive parameters
  difficultyModifiers: z.record(z.number()),
  timeMultipliers: z.record(z.number()),
});

export type CurriculumLevel = z.infer<typeof CurriculumLevelSchema>;

// Agent configuration for evaluation
export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),

  // Component configuration
  planningConfig: z.record(z.any()),
  memoryConfig: z.record(z.any()),
  cognitionConfig: z.record(z.any()),

  // Feature flags
  enabledFeatures: z.array(z.string()),
  disabledFeatures: z.array(z.string()),

  // Performance constraints
  maxLatency: z.number().optional(),
  maxMemoryUsage: z.number().optional(),

  // Experimental parameters
  experimentalSettings: z.record(z.any()).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// Stress testing parameters
export const StressTestConfigSchema = z.object({
  type: z.enum([
    'latency_injection', // Add artificial delays
    'memory_pressure', // Limit available memory
    'noise_injection', // Add random perturbations
    'partial_failure', // Simulate component failures
    'concurrent_load', // Multiple simultaneous tasks
    'temporal_pressure', // Reduced time limits
    'resource_scarcity', // Limited resources
    'information_occlusion', // Partial state visibility
  ]),

  intensity: z.number().min(0).max(1), // Stress intensity
  duration: z.number(), // Duration in milliseconds
  parameters: z.record(z.any()),

  // Recovery testing
  allowRecovery: z.boolean(),
  recoveryTime: z.number().optional(),
});

export type StressTestConfig = z.infer<typeof StressTestConfigSchema>;

// Evaluation event for real-time monitoring
export const EvaluationEventSchema = z.object({
  timestamp: z.number(),
  sessionId: z.string(),
  eventType: z.enum([
    'session_start',
    'session_end',
    'step_complete',
    'error_occurred',
    'metric_updated',
    'planning_complete',
    'execution_complete',
    'adaptation_triggered',
  ]),
  data: z.record(z.any()),
  severity: z.enum(['info', 'warning', 'error', 'critical']).optional(),
});

export type EvaluationEvent = z.infer<typeof EvaluationEventSchema>;

// Batch evaluation configuration
export const BatchEvaluationConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  scenarios: z.array(z.string()), // scenario IDs
  agents: z.array(z.string()), // agent config IDs

  // Execution parameters
  parallelism: z.number().default(1),
  timeout: z.number().default(300000), // 5 minutes
  retryAttempts: z.number().default(1),

  // Analysis configuration
  comparativeAnalysis: z.boolean().default(true),
  generateReport: z.boolean().default(true),

  // Output configuration
  outputFormat: z.enum(['json', 'csv', 'html']).default('json'),
  includeTraces: z.boolean().default(false),
});

export type BatchEvaluationConfig = z.infer<typeof BatchEvaluationConfigSchema>;

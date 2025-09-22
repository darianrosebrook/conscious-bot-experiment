/**
 * Core types for memory systems
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Memory Versioning Types
// ============================================================================

/**
 * Memory context for versioning and isolation
 */
export interface MemoryContext {
  worldSeed?: string; // World seed for memory isolation
  worldName?: string; // World name for identification
  sessionId: string; // Unique session identifier
  timestamp: number; // Context creation timestamp
  version: string; // Memory system version
}

/**
 * Memory namespace for organizing memories by context
 */
export interface MemoryNamespace {
  context: MemoryContext;
  id: string; // Unique namespace identifier
  createdAt: number;
  lastAccessed: number;
  memoryCount: number;
  isActive: boolean;
}

/**
 * Memory versioning configuration
 */
export interface MemoryVersioningConfig {
  enableVersioning: boolean;
  defaultNamespace: string;
  autoCreateNamespaces: boolean;
  namespaceCleanupInterval: number; // milliseconds
  maxInactiveNamespaces: number;
  seedBasedIsolation: boolean; // Use seed for memory isolation
}

// ============================================================================
// Episodic Memory Types
// ============================================================================

/**
 * Represents a significant experience or event
 */
export interface Experience {
  id: string;
  type: ExperienceType;
  description: string;
  location?: Location;
  timestamp: number;
  duration: number;
  participants: string[];
  actions: Action[];
  outcomes: Outcome[];
  emotions: EmotionalState;
  salienceScore: number;
  tags: string[];
  metadata: Record<string, any>;
}

export enum ExperienceType {
  GOAL_ACHIEVEMENT = 'goal_achievement',
  GOAL_FAILURE = 'goal_failure',
  SOCIAL_INTERACTION = 'social_interaction',
  EXPLORATION = 'exploration',
  DANGER_ENCOUNTER = 'danger_encounter',
  LEARNING = 'learning',
  SKILL_IMPROVEMENT = 'skill_improvement',
  CREATIVE_ACTIVITY = 'creative_activity',
  ROUTINE_ACTION = 'routine_action',
  // Reflection on task/process outcomes and reasoning
  TASK_REFLECTION = 'task_reflection',
}

export interface Outcome {
  id: string;
  type: OutcomeType;
  description: string;
  impact: number; // -1 to 1
  duration: number;
  relatedGoals: string[];
}

export enum OutcomeType {
  POSITIVE = 'positive',
  NEGATIVE = 'negative',
  NEUTRAL = 'neutral',
  UNEXPECTED = 'unexpected',
}

export interface EmotionalState {
  satisfaction: number; // 0-1
  frustration: number; // 0-1
  excitement: number; // 0-1
  curiosity: number; // 0-1
  confidence: number; // 0-1
  timestamp: number;
  [key: string]: number; // Allow dynamic emotion access
}

// ============================================================================
// Semantic Memory Types
// ============================================================================

/**
 * Knowledge graph entity
 */
export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  properties: Record<string, any>;
  relationships: Relationship[];
  confidence: number;
  lastUpdated: number;
  source: string;
}

export enum EntityType {
  OBJECT = 'object',
  LOCATION = 'location',
  CONCEPT = 'concept',
  ACTION = 'action',
  AGENT = 'agent',
  GOAL = 'goal',
  SKILL = 'skill',
  RESOURCE = 'resource',
}

export interface Relationship {
  id: string;
  type: RelationshipType;
  sourceId: string;
  targetId: string;
  properties: Record<string, any>;
  strength: number; // 0-1
  confidence: number; // 0-1
  createdAt: number;
  lastReinforced: number;
}

export enum RelationshipType {
  IS_A = 'is_a',
  PART_OF = 'part_of',
  LOCATED_AT = 'located_at',
  USED_FOR = 'used_for',
  ENABLES = 'enables',
  REQUIRES = 'requires',
  SIMILAR_TO = 'similar_to',
  OPPOSITE_OF = 'opposite_of',
  CAUSES = 'causes',
  FOLLOWS = 'follows',
}

/**
 * Graph-based retrieval augmented generation query
 */
export interface GraphRAGQuery {
  id: string;
  query: string;
  entityTypes: EntityType[];
  relationshipTypes: RelationshipType[];
  maxDepth: number;
  confidenceThreshold: number;
  timestamp: number;
}

export interface GraphRAGResult {
  queryId: string;
  entities: Entity[];
  relationships: Relationship[];
  subgraph: KnowledgeSubgraph;
  relevanceScore: number;
  confidence: number;
  retrievalTime: number;
}

export interface KnowledgeSubgraph {
  nodes: Entity[];
  edges: Relationship[];
  centralNodes: string[];
  pathways: EntityPathway[];
}

export interface EntityPathway {
  entities: string[];
  relationships: string[];
  pathStrength: number;
  semanticMeaning: string;
}

// ============================================================================
// Working Memory Types
// ============================================================================

/**
 * Current cognitive context and active information
 */
export interface WorkingMemoryState {
  id: string;
  currentGoals: string[];
  activeContext: ContextFrame[];
  attentionFocus: AttentionState;
  cognitiveLoad: number; // 0-1
  workingSet: WorkingSet;
  timestamp: number;
}

export interface ContextFrame {
  id: string;
  type: ContextType;
  content: any;
  relevance: number; // 0-1
  priority: number; // 0-1
  expiresAt: number;
  source: string;
}

export enum ContextType {
  GOAL_CONTEXT = 'goal_context',
  LOCATION_CONTEXT = 'location_context',
  SOCIAL_CONTEXT = 'social_context',
  TASK_CONTEXT = 'task_context',
  EMOTIONAL_CONTEXT = 'emotional_context',
  KNOWLEDGE_CONTEXT = 'knowledge_context',
}

export interface AttentionState {
  primaryFocus: string;
  secondaryFoci: string[];
  distractions: string[];
  focusStrength: number; // 0-1
  focusDuration: number;
  lastShift: number;
}

export interface WorkingSet {
  maxCapacity: number;
  currentItems: WorkingItem[];
  overflowBuffer: WorkingItem[];
  consolidationQueue: WorkingItem[];
}

export interface WorkingItem {
  id: string;
  type: WorkingItemType;
  content: any;
  importance: number; // 0-1
  lastAccessed: number;
  accessCount: number;
  decayRate: number;
}

export enum WorkingItemType {
  GOAL = 'goal',
  PLAN = 'plan',
  OBSERVATION = 'observation',
  THOUGHT = 'thought',
  EMOTION = 'emotion',
  MEMORY = 'memory',
  EXPECTATION = 'expectation',
}

// ============================================================================
// Provenance Types
// ============================================================================

/**
 * Decision justification and audit trail
 */
export interface DecisionProvenance {
  id: string;
  decisionId: string;
  decisionType: DecisionType;
  timestamp: number;
  context: ProvenanceContext;
  reasoning: ReasoningChain;
  evidence: Evidence[];
  confidence: number;
  outcome?: DecisionOutcome;
}

export enum DecisionType {
  GOAL_SELECTION = 'goal_selection',
  ACTION_CHOICE = 'action_choice',
  PLAN_MODIFICATION = 'plan_modification',
  RESOURCE_ALLOCATION = 'resource_allocation',
  SOCIAL_RESPONSE = 'social_response',
  EXPLORATION_TARGET = 'exploration_target',
}

export interface ProvenanceContext {
  activeGoals: string[];
  currentState: any;
  availableActions: string[];
  constraints: string[];
  timeConstraints: number;
  socialContext?: any;
}

export interface ReasoningChain {
  steps: ReasoningStep[];
  premises: string[];
  inferences: string[];
  conclusion: string;
  confidenceTrace: number[];
}

export interface ReasoningStep {
  id: string;
  type: ReasoningType;
  description: string;
  inputs: string[];
  outputs: string[];
  method: string;
  confidence: number;
}

export enum ReasoningType {
  DEDUCTION = 'deduction',
  INDUCTION = 'induction',
  ABDUCTION = 'abduction',
  ANALOGY = 'analogy',
  CASE_BASED = 'case_based',
  HEURISTIC = 'heuristic',
}

export interface Evidence {
  id: string;
  type: EvidenceType;
  source: string;
  content: any;
  reliability: number; // 0-1
  relevance: number; // 0-1
  timestamp: number;
}

export enum EvidenceType {
  OBSERVATION = 'observation',
  MEMORY = 'memory',
  INFERENCE = 'inference',
  EXPERT_KNOWLEDGE = 'expert_knowledge',
  STATISTICAL = 'statistical',
  ANALOGICAL = 'analogical',
}

export interface DecisionOutcome {
  actualResult: any;
  expectedResult: any;
  success: boolean;
  satisfaction: number; // 0-1
  learningPoints: string[];
  timestamp: number;
}

// ============================================================================
// Common Types
// ============================================================================

export interface Location {
  x: number;
  y: number;
  z: number;
  dimension: string;
  description?: string;
}

export interface Action {
  id: string;
  name: string;
  type: string;
  parameters: Record<string, any>;
  timestamp: number;
  duration: number;
  target?: string;
  success: boolean;
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const ExperienceSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(ExperienceType),
  description: z.string(),
  location: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      dimension: z.string(),
      description: z.string().optional(),
    })
    .optional(),
  timestamp: z.number(),
  duration: z.number(),
  participants: z.array(z.string()),
  actions: z.array(z.any()),
  outcomes: z.array(z.any()),
  emotions: z.object({
    satisfaction: z.number().min(0).max(1),
    frustration: z.number().min(0).max(1),
    excitement: z.number().min(0).max(1),
    curiosity: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    timestamp: z.number(),
  }),
  salienceScore: z.number().min(0).max(1),
  tags: z.array(z.string()),
  metadata: z.record(z.any()),
});

export const EntitySchema = z.object({
  id: z.string(),
  type: z.nativeEnum(EntityType),
  name: z.string(),
  properties: z.record(z.any()),
  relationships: z.array(z.any()),
  confidence: z.number().min(0).max(1),
  lastUpdated: z.number(),
  source: z.string(),
});

export const WorkingMemoryStateSchema = z.object({
  id: z.string(),
  currentGoals: z.array(z.string()),
  activeContext: z.array(z.any()),
  attentionFocus: z.object({
    primaryFocus: z.string(),
    secondaryFoci: z.array(z.string()),
    distractions: z.array(z.string()),
    focusStrength: z.number().min(0).max(1),
    focusDuration: z.number(),
    lastShift: z.number(),
  }),
  cognitiveLoad: z.number().min(0).max(1),
  workingSet: z.any(),
  timestamp: z.number(),
});

export const DecisionProvenanceSchema = z.object({
  id: z.string(),
  decisionId: z.string(),
  decisionType: z.nativeEnum(DecisionType),
  timestamp: z.number(),
  context: z.any(),
  reasoning: z.any(),
  evidence: z.array(z.any()),
  confidence: z.number().min(0).max(1),
  outcome: z.any().optional(),
});

// =========================================================================
// HTN Memory Integration Types
// =========================================================================

/**
 * HTN Task effectiveness memory entry
 */
export interface HTNTaskMemory {
  id: string;
  taskId: string;
  executionId: string;
  outcome: 'success' | 'failure' | 'partial' | 'abandoned';
  effectiveness: number; // 0-1
  duration: number; // milliseconds
  reward: number; // utility gained/lost
  context: Record<string, any>;
  methodUsed: string;
  subtasksCompleted: number;
  subtasksTotal: number;
  errors: string[];
  preconditionsMet: number;
  preconditionsTotal: number;
  resourceUtilization: number; // 0-1
  timestamp: number;
  sessionId: string;
  worldState?: any;
  emotionalState?: EmotionalState;
  tags: string[];
  metadata: Record<string, any>;
}

/**
 * HTN Method effectiveness tracking
 */
export interface HTNMethodMemory {
  id: string;
  taskId: string;
  methodId: string;
  effectiveness: number; // 0-1
  successRate: number; // 0-1
  averageDuration: number;
  averageReward: number;
  usageCount: number;
  lastUsed: number;
  contextSensitivity: Record<string, number>; // Factor -> effectiveness impact
  failurePatterns: FailurePattern[];
  optimizationHistory: MethodOptimization[];
  confidence: number; // 0-1
  timestamp: number;
}

/**
 * Failure pattern analysis
 */
export interface FailurePattern {
  id: string;
  pattern: string;
  frequency: number;
  context: Record<string, any>;
  suggestedAlternatives: string[];
  avoidanceScore: number; // 0-1
  lastOccurred: number;
  severity: number; // 0-1
}

/**
 * Method optimization events
 */
export interface MethodOptimization {
  timestamp: number;
  type:
    | 'parameter_adjustment'
    | 'ordering_change'
    | 'resource_reallocation'
    | 'context_adaptation';
  description: string;
  impact: number; // -1 to 1
  methodId: string;
  taskId: string;
}

/**
 * HTN Network effectiveness memory
 */
export interface HTNNetworkMemory {
  id: string;
  networkId: string;
  overallEffectiveness: number;
  taskCompletionRate: number;
  averageExecutionTime: number;
  riskProfile: number;
  adaptabilityScore: number;
  crossTaskPatterns: CrossTaskPattern[];
  preferenceEvolution: PreferenceEvolution[];
  optimizationEvents: NetworkOptimization[];
  timestamp: number;
  sessionId: string;
}

/**
 * Cross-task pattern that affects multiple tasks
 */
export interface CrossTaskPattern {
  id: string;
  pattern: string;
  involvedTasks: string[];
  effectiveness: number;
  frequency: number;
  lastOccurred: number;
  context: Record<string, any>;
  suggestedOptimizations: string[];
}

/**
 * Evolution of method preferences over time
 */
export interface PreferenceEvolution {
  taskId: string;
  methodId: string;
  preferenceScore: number; // 0-1
  evolutionRate: number; // Rate of change over time
  lastUpdated: number;
  factors: Record<string, number>; // Factor -> impact on preference
}

/**
 * Network optimization events
 */
export interface NetworkOptimization {
  timestamp: number;
  type:
    | 'method_replacement'
    | 'ordering_change'
    | 'resource_reallocation'
    | 'structural_change';
  description: string;
  impact: number; // -1 to 1
  tasksAffected: string[];
  networkId: string;
}

/**
 * HTN Memory query interface
 */
export interface HTNMemoryQuery {
  taskId?: string;
  methodId?: string;
  outcome?: 'success' | 'failure' | 'partial' | 'abandoned';
  effectiveness?: { min?: number; max?: number };
  timeRange?: { start: number; end: number };
  context?: Record<string, any>;
  tags?: string[];
  limit?: number;
  sortBy?: 'effectiveness' | 'timestamp' | 'frequency';
  sortOrder?: 'asc' | 'desc';
}

/**
 * HTN Memory statistics
 */
export interface HTNMemoryStats {
  totalExecutions: number;
  successRate: number;
  averageEffectiveness: number;
  averageDuration: number;
  averageReward: number;
  methodCount: number;
  taskCount: number;
  failurePatternCount: number;
  optimizationCount: number;
  timeRange: { start: number; end: number };
  mostEffectiveMethod: string;
  leastEffectiveMethod: string;
  emergingPatterns: string[];
  decliningPatterns: string[];
}

/**
 * HTN Learning update
 */
export interface HTNLearningUpdate {
  taskId: string;
  methodId: string;
  effectivenessChange: number;
  confidenceChange: number;
  patternUpdates: PatternUpdate[];
  optimizationSuggestions: OptimizationSuggestion[];
  timestamp: number;
}

/**
 * Pattern update for learning
 */
export interface PatternUpdate {
  patternId: string;
  frequencyChange: number;
  effectivenessChange: number;
  confidenceChange: number;
  newContext?: Record<string, any>;
}

/**
 * Optimization suggestion
 */
export interface OptimizationSuggestion {
  type:
    | 'method_switch'
    | 'parameter_adjustment'
    | 'ordering_change'
    | 'resource_reallocation';
  target: string;
  suggestion: string;
  expectedImpact: number;
  confidence: number;
  reasoning: string;
}

// =========================================================================
// HTN Memory Zod Schemas
// =========================================================================

export const HTNTaskMemorySchema = z.object({
  id: z.string(),
  taskId: z.string(),
  executionId: z.string(),
  outcome: z.enum(['success', 'failure', 'partial', 'abandoned']),
  effectiveness: z.number().min(0).max(1),
  duration: z.number(),
  reward: z.number(),
  context: z.record(z.any()),
  methodUsed: z.string(),
  subtasksCompleted: z.number(),
  subtasksTotal: z.number(),
  errors: z.array(z.string()),
  preconditionsMet: z.number(),
  preconditionsTotal: z.number(),
  resourceUtilization: z.number().min(0).max(1),
  timestamp: z.number(),
  sessionId: z.string(),
  worldState: z.any(),
  emotionalState: z.any(),
  tags: z.array(z.string()),
  metadata: z.record(z.any()),
});

export const HTNMethodMemorySchema = z.object({
  id: z.string(),
  taskId: z.string(),
  methodId: z.string(),
  effectiveness: z.number().min(0).max(1),
  successRate: z.number().min(0).max(1),
  averageDuration: z.number(),
  averageReward: z.number(),
  usageCount: z.number(),
  lastUsed: z.number(),
  contextSensitivity: z.record(z.number()),
  failurePatterns: z.array(z.any()),
  optimizationHistory: z.array(z.any()),
  confidence: z.number().min(0).max(1),
  timestamp: z.number(),
});

export const HTNNetworkMemorySchema = z.object({
  id: z.string(),
  networkId: z.string(),
  overallEffectiveness: z.number(),
  taskCompletionRate: z.number(),
  averageExecutionTime: z.number(),
  riskProfile: z.number(),
  adaptabilityScore: z.number(),
  crossTaskPatterns: z.array(z.any()),
  preferenceEvolution: z.array(z.any()),
  optimizationEvents: z.array(z.any()),
  timestamp: z.number(),
  sessionId: z.string(),
});

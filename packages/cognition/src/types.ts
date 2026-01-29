/**
 * Core types for cognition systems
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// LLM Interface Types
// ============================================================================

/**
 * LLM provider configuration
 */
export interface LLMConfig {
  provider: 'ollama' | 'openai' | 'anthropic' | 'mlx';
  model: string;
  fallbackModel?: string;
  host?: string;
  port?: number;
  maxTokens: number;
  temperature: number;
  timeout: number;
  retries: number;
}

/**
 * LLM request context
 */
export interface LLMContext {
  currentGoals?: string[];
  recentMemories?: any[];
  currentLocation?: any;
  socialContext?: any;
  agentState?: any;
  conversationHistory?: Message[];
  systemPrompt?: string;
  temperature?: number;
  messages?: any[];
  maxTokens?: number;
}

/**
 * LLM response with metadata
 */
export interface LLMResponse {
  id: string;
  text: string;
  model: string;
  tokensUsed: number;
  latency: number;
  confidence: number;
  metadata: {
    finishReason: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    reasoning?: string[];
    citations?: string[];
    retryAttempt?: number;
  };
  timestamp: number;
}

/**
 * Prompt template definition
 */
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  variables: string[];
  category: PromptCategory;
  examples: PromptExample[];
}

export enum PromptCategory {
  INTERNAL_DIALOGUE = 'internal_dialogue',
  DECISION_MAKING = 'decision_making',
  SOCIAL_COMMUNICATION = 'social_communication',
  GOAL_REASONING = 'goal_reasoning',
  ETHICAL_REASONING = 'ethical_reasoning',
  REFLECTION = 'reflection',
  PLANNING = 'planning',
}

export interface PromptExample {
  input: Record<string, any>;
  expectedOutput: string;
  explanation: string;
}

// ============================================================================
// Internal Dialogue Types
// ============================================================================

/**
 * Internal thought or dialogue
 */
export interface InternalThought {
  id: string;
  type: ThoughtType;
  content: string;
  context: ThoughtContext;
  confidence: number;
  timestamp: number;
  followUp?: string[];
  relatedThoughts?: string[];
}

export enum ThoughtType {
  OBSERVATION = 'observation',
  DECISION_REASONING = 'decision_reasoning',
  GOAL_REFLECTION = 'goal_reflection',
  PROBLEM_SOLVING = 'problem_solving',
  EMOTIONAL_PROCESSING = 'emotional_processing',
  MEMORY_RECALL = 'memory_recall',
  FUTURE_PLANNING = 'future_planning',
  SELF_EVALUATION = 'self_evaluation',
}

export interface ThoughtContext {
  trigger: string;
  currentGoals: string[];
  currentState: any;
  recentEvents: string[];
  emotionalState: any;
  urgency: number; // 0-1
}

/**
 * Dialogue trigger configuration
 */
export interface DialogueTrigger {
  id: string;
  name: string;
  condition: string;
  thoughtType: ThoughtType;
  priority: number;
  cooldown: number;
  enabled: boolean;
}

// ============================================================================
// Constitutional Filtering Types
// ============================================================================

/**
 * Constitutional rule for filtering thoughts and actions
 */
export interface ConstitutionalRule {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  condition: string;
  action: RuleAction;
  priority: number;
  enabled: boolean;
}

export enum RuleCategory {
  SAFETY = 'safety',
  ETHICS = 'ethics',
  SOCIAL_NORMS = 'social_norms',
  GOAL_ALIGNMENT = 'goal_alignment',
  RESOURCE_LIMITS = 'resource_limits',
  COMMUNICATION = 'communication',
}

export enum RuleAction {
  ALLOW = 'allow',
  DENY = 'deny',
  MODIFY = 'modify',
  FLAG = 'flag',
  ESCALATE = 'escalate',
}

/**
 * Constitutional evaluation result
 */
export interface ConstitutionalEvaluation {
  id: string;
  input: string;
  result: RuleAction;
  triggeredRules: ConstitutionalRule[];
  confidence: number;
  explanation: string;
  suggestedModifications?: string[];
  timestamp: number;
}

// ============================================================================
// Reasoning Types
// ============================================================================

/**
 * Reasoning request for complex decisions
 */
export interface ReasoningRequest {
  id: string;
  type: ReasoningType;
  context: any;
  question: string;
  constraints: string[];
  timeLimit?: number;
  requiredConfidence?: number;
}

export enum ReasoningType {
  LOGICAL = 'logical',
  ETHICAL = 'ethical',
  CREATIVE = 'creative',
  PRACTICAL = 'practical',
  SOCIAL = 'social',
  STRATEGIC = 'strategic',
}

/**
 * Reasoning result with chain of thought
 */
export interface ReasoningResult {
  requestId: string;
  conclusion: string;
  reasoning: ReasoningChain;
  confidence: number;
  alternatives: Alternative[];
  assumptions: string[];
  risks: string[];
  timestamp: number;
}

export interface ReasoningChain {
  steps: ReasoningStep[];
  premises: string[];
  inferences: string[];
  conclusion: string;
}

export interface ReasoningStep {
  id: string;
  description: string;
  type: string;
  inputs: string[];
  outputs: string[];
  confidence: number;
}

export interface Alternative {
  id: string;
  description: string;
  pros: string[];
  cons: string[];
  confidence: number;
  feasibility: number;
}

// ============================================================================
// Creative Problem Solving Types
// ============================================================================

/**
 * Problem definition for creative solving
 */
export interface Problem {
  id: string;
  description: string;
  type: string;
  constraints: string[];
  context?: any;
  priority: number; // 0-1
  complexity: number; // 0-1
}

/**
 * Solution to a problem
 */
export interface Solution {
  id: string;
  description?: string;
  solution?: string;
  analogy?: string;
  confidence: number;
  reasoning?: string;
  timestamp: number;
  noveltyScore?: NoveltyScore;
}

/**
 * Constraint for problem solving
 */
export interface Constraint {
  id: string;
  description: string;
  strength: number; // 0-1, how strict the constraint is
  type: 'hard' | 'soft' | 'preference';
  category: string;
}

/**
 * Domain knowledge for analogical reasoning
 */
export interface Domain {
  name: string;
  description: string;
  principles: string[];
  examples: string[];
  relevanceScore?: number;
}

/**
 * Analogical solution from another domain
 */
export interface AnalogicalSolution extends Solution {
  sourceDomain: string;
  analogy: string;
  solution: string;
  confidence: number;
  reasoning: string;
  timestamp: number;
}

/**
 * Solution with relaxed constraints
 */
export interface RelaxedSolution extends Solution {
  relaxationLevel: number;
  originalConstraints: string[];
  relaxedConstraints: string[];
  solution: string;
  confidence: number;
  reasoning: string;
  timestamp: number;
}

/**
 * Novelty evaluation of a solution
 */
export interface NoveltyScore {
  score: number; // 0-1
  reasoning: string;
  dimensions: {
    originality: number; // 0-1
    usefulness: number; // 0-1
    surprise: number; // 0-1
  };
}

/**
 * Creative solution combining multiple approaches
 */
export interface CreativeSolution extends Solution {
  type: 'analogical' | 'relaxed' | 'alternative';
  noveltyScore: NoveltyScore;
  implementationSteps?: string[];
  risks?: string[];
  benefits?: string[];
}

// ============================================================================
// Advanced Reflection Types
// ============================================================================

/**
 * Experience for reflection and analysis
 */
export interface Experience {
  id: string;
  description: string;
  outcome: string;
  timestamp: number;
  context?: any;
  emotionalState?: any;
  participants?: string[];
  location?: string;
  duration?: number;
  success?: boolean;
  learningValue?: number; // 0-1
}

/**
 * Experience analysis result
 */
export interface ExperienceAnalysis {
  id: string;
  experiences: Experience[];
  patterns: Pattern[];
  insights: Insight[];
  learningSynthesis?: LearningSynthesis;
  timestamp: number;
  confidence: number;
}

/**
 * Pattern identified in experiences
 */
export interface Pattern {
  id: string;
  name: string;
  description: string;
  type: string;
  significance: number; // 0-1
  frequency: number;
  evidence: string[];
  timestamp: number;
}

/**
 * Learning synthesis from experiences
 */
export interface LearningSynthesis {
  id: string;
  timestamp: number;
  insights: string[];
  skills: string[];
  improvements: string[];
  knowledge: string[];
  behavioralChanges: string[];
  learningGoals: string[];
  experienceCount: number;
  patternCount: number;
  confidence: number;
}

/**
 * Insight generated from analysis
 */
export interface Insight {
  id: string;
  description: string;
  evidence: string[];
  recommendations: string[];
  impact: number; // 0-1
  priority: number; // 0-1
  timestamp: number;
}

/**
 * Improvement plan based on insights
 */
export interface Plan {
  id: string;
  insightId: string;
  goals: string[];
  steps: string[];
  timeline: string;
  successMetrics: string[];
  obstacles: string[];
  resources: string[];
  priority: number; // 0-1
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  timestamp: number;
}

/**
 * Reflection trigger configuration
 */
export interface ReflectionTrigger {
  id: string;
  type: string;
  condition: string;
  frequency?: number; // milliseconds
  enabled: boolean;
  priority: number; // 0-1
}

/**
 * Reflection insight with metadata
 */
export interface ReflectionInsight {
  id: string;
  type: string;
  description: string;
  evidence: string[];
  confidence: number;
  actionableItems: string[];
  relatedExperiences: string[];
  timestamp: number;
}

/**
 * Performance metrics for reflection
 */
export interface PerformanceMetrics {
  id: string;
  metric: string;
  value: number;
  unit: string;
  timestamp: number;
  context?: any;
}

/**
 * Learning outcome from reflection
 */
export interface LearningOutcome {
  id: string;
  description: string;
  type: 'skill' | 'knowledge' | 'behavior' | 'attitude';
  confidence: number;
  evidence: string[];
  timestamp: number;
}

// ============================================================================
// Context Optimization Types
// ============================================================================

/**
 * Memory for context retrieval
 */
export interface Memory {
  id: string;
  content: string;
  type: string;
  timestamp: number;
  source: string;
  relevanceScore?: number;
}

/**
 * Context query for memory retrieval
 */
export interface ContextQuery {
  query: string;
  filters?: {
    type?: string[];
    timeRange?: [number, number];
    source?: string[];
  };
  limit?: number;
  relevanceThreshold?: number;
}

/**
 * Optimized context for LLM interactions
 */
export interface OptimizedContext {
  id: string;
  task: string;
  originalContext: LLMContext;
  retrievedMemories: MemoryRetrieval[];
  synthesizedContext: ContextSynthesis;
  tokenCount: number;
  relevanceScore: number;
  optimizationLevel: number; // 0-1, how much optimization was applied
  timestamp: number;
}

/**
 * Relevance score for context evaluation
 */
export interface RelevanceScore {
  score: number; // 0-1
  reasoning: string;
  dimensions: {
    taskAlignment: number; // 0-1
    informationValue: number; // 0-1
    timeliness: number; // 0-1
  };
}

/**
 * Memory retrieval result
 */
export interface MemoryRetrieval {
  id: string;
  content: string;
  type: string;
  relevanceScore: number;
  timestamp: number;
  source: string;
}

/**
 * Context synthesis from multiple modules
 */
export interface ContextSynthesis {
  goals: string[];
  plans: string[];
  relationships: string[];
  constraints: string[];
  opportunities: string[];
  risks: string[];
}

/**
 * Token optimization configuration
 */
export interface TokenOptimization {
  maxTokens: number;
  compressionRatio: number; // 0-1
  priorityOrder: string[];
  preserveKeywords: string[];
}

// ============================================================================
// Communication Types
// ============================================================================

/**
 * Message in conversation
 */
export interface Message {
  id: string;
  sender: string;
  recipient: string;
  content: string;
  type: MessageType;
  timestamp: number;
  context?: any;
  intent?: string;
  emotion?: string;
}

export enum MessageType {
  CHAT = 'chat',
  COMMAND = 'command',
  QUESTION = 'question',
  RESPONSE = 'response',
  NOTIFICATION = 'notification',
  INTERNAL = 'internal',
}

/**
 * Conversation context
 */
export interface ConversationContext {
  conversationId: string;
  participants: string[];
  topic?: string;
  history: Message[];
  relationship: string;
  formality: number; // 0-1
  emotionalTone: string;
}

// ============================================================================
// Conversation Management Types
// ============================================================================

/**
 * Conversation state tracking
 */
export interface ConversationState {
  conversationId: string;
  participants: string[];
  currentTopic?: string;
  topicHistory: TopicModel[];
  relationshipStatus: Map<string, Relationship>;
  communicationStyle: CommunicationStyle;
  emotionalTone: string;
  formalityLevel: number; // 0-1
  engagementLevel: number; // 0-1
  lastActivity: number;
  messageCount: number;
}

/**
 * Topic model for conversation tracking
 */
export interface TopicModel {
  id: string;
  name: string;
  description: string;
  startTime: number;
  endTime?: number;
  messageCount: number;
  participants: string[];
  keywords: string[];
  sentiment: number; // -1 to 1
  importance: number; // 0-1
}

/**
 * Relationship tracking
 */
export interface Relationship {
  participantId: string;
  relationshipType: string;
  familiarity: number; // 0-1
  trustLevel: number; // 0-1
  communicationHistory: number;
  lastInteraction: number;
  preferences: string[];
  communicationStyle: CommunicationStyle;
}

/**
 * Communication style configuration
 */
export interface CommunicationStyle {
  formality: number; // 0-1
  verbosity: number; // 0-1
  emotionalExpressiveness: number; // 0-1
  technicalLevel: number; // 0-1
  humorLevel: number; // 0-1
  directness: number; // 0-1
}

/**
 * Style adapter for communication
 */
export interface StyleAdapter {
  adaptStyle(context: ConversationContext): CommunicationStyle;
  learnFromInteraction(style: CommunicationStyle, outcome: string): void;
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const LLMConfigSchema = z.object({
  provider: z.enum(['ollama', 'openai', 'anthropic', 'mlx']),
  model: z.string(),
  fallbackModel: z.string().optional(),
  host: z.string().optional(),
  port: z.number().optional(),
  maxTokens: z.number().positive(),
  temperature: z.number().min(0).max(2),
  timeout: z.number().positive(),
  retries: z.number().min(0).max(5),
});

export const InternalThoughtSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(ThoughtType),
  content: z.string(),
  context: z.any(),
  confidence: z.number().min(0).max(1),
  timestamp: z.number(),
  followUp: z.array(z.string()).optional(),
  relatedThoughts: z.array(z.string()).optional(),
});

export const ConstitutionalRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.nativeEnum(RuleCategory),
  condition: z.string(),
  action: z.nativeEnum(RuleAction),
  priority: z.number(),
  enabled: z.boolean(),
});

export const ReasoningRequestSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(ReasoningType),
  context: z.any(),
  question: z.string(),
  constraints: z.array(z.string()),
  timeLimit: z.number().optional(),
  requiredConfidence: z.number().min(0).max(1).optional(),
});

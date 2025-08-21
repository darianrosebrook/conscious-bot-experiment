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
  provider: 'ollama' | 'openai' | 'anthropic';
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
// Zod Schemas
// ============================================================================

export const LLMConfigSchema = z.object({
  provider: z.enum(['ollama', 'openai', 'anthropic']),
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

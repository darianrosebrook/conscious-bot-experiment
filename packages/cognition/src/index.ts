/**
 * Cognition Package
 *
 * Core cognitive capabilities including reasoning, internal dialogue,
 * creative problem solving, conversation management, reflection,
 * context optimization, and self-modeling.
 *
 * @author @darianrosebrook
 */

// Cognitive Core
export { LLMInterface } from './cognitive-core/llm-interface';
export { InternalDialogue } from './cognitive-core/internal-dialogue';
export { CreativeProblemSolver } from './cognitive-core/creative-solver';
export { ConversationManager } from './cognitive-core/conversation-manager';
export { AdvancedReflectionEngine } from './cognitive-core/reflection-engine';
export { ContextOptimizer } from './cognitive-core/context-optimizer';

// Constitutional Filter
export { ConstitutionalFilter } from './constitutional-filter';

// Enhanced Thought Generator
export { EnhancedThoughtGenerator } from './thought-generator';

// Event-Driven Thought Generator
export {
  eventDrivenThoughtGenerator,
  EventDrivenThoughtGenerator,
} from './event-driven-thought-generator';
export type { BotLifecycleEvent } from './event-driven-thought-generator';

// Self-Model
export {
  IdentityTracker,
  NarrativeManager,
  ContractSystem,
} from './self-model';

// Social Cognition
export { AgentModeler } from './social-cognition/agent-modeler';
export { RelationshipManager } from './social-cognition/relationship-manager';
export { SocialLearner } from './social-cognition/social-learner';
export { TheoryOfMindEngine } from './social-cognition/theory-of-mind-engine';

// Audit Logger
export {
  auditLogger,
  ThoughtActionAuditLogger,
} from './audit/thought-action-audit-logger';
export type {
  AuditEntry,
  AuditStage,
  AuditSession,
  AuditSummary,
} from './audit/thought-action-audit-logger';

// LLM Output Sanitizer (shared boundary — downstream code imports from here)
export {
  extractGoalTag,
  extractIntent,
  normalizeGoalAction,
  canonicalGoalKey,
  sanitizeLLMOutput,
  isUsableContent,
  hasCodeLikeDensity,
  CANONICAL_ACTIONS,
  NORMALIZE_MAP_VERSION,
} from './llm-output-sanitizer';
export type {
  GoalTag,
  GoalTagV1,
  GoalTagFailReason,
  IntentLabel,
  IntentParse,
  SanitizedOutput,
  SanitizationFlags,
} from './llm-output-sanitizer';

// Core Types (specific exports to avoid conflicts)
export type {
  LLMConfig,
  LLMContext,
  LLMResponse,
  Message,
  InternalThought,
  ConversationState as CognitiveConversationState,
  CommunicationStyle as CognitiveCommunicationStyle,
  Relationship as CognitiveRelationship,
} from './types';

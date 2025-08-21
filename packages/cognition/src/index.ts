/**
 * High-level reasoning, self-awareness, and social modeling systems
 * 
 * This package provides:
 * - Cognitive core with LLM-based reasoning and internal dialogue
 * - Self-model for identity and narrative continuity
 * - Social cognition for theory of mind and social interaction
 * - Constitutional filtering for ethical behavior
 * 
 * @author @darianrosebrook
 */

// Cognitive Core
export * from './cognitive-core/llm-interface';
export * from './cognitive-core/internal-dialogue';

// Self Model
export * from './self-model/identity-tracker';
export * from './self-model/narrative-manager';

// Constitutional Filter
export * from './constitutional-filter';

// Types
export type {
  InternalThought,
  ThoughtType,
  ThoughtContext,
  DialogueTrigger,
  ReasoningStep,
  ReasoningChain,
  ReasoningResult,
  ReasoningRequest,
  ReasoningType,
  LLMConfig,
  LLMContext,
  LLMResponse,
} from './types';

export type {
  IdentityCore,
  PersonalityTrait,
  CoreValue,
  Capability,
  CapabilityDevelopment,
  NarrativeStory,
  NarrativeChapter,
  ExperienceIntegration,
  IdentityImpact,
} from './self-model/types';

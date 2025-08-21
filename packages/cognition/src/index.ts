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

// Types
export * from './types';
export * from './self-model/types';

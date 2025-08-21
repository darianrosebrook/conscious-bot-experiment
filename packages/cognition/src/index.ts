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
export * from './cognitive-core/reasoning-engine';
export * from './cognitive-core/constitutional-filter';

// Self Model
export * from './self-model/identity-tracker';
export * from './self-model/narrative-manager';
export * from './self-model/contract-system';
export * from './self-model/self-monitor';

// Social Cognition
export * from './social-cognition/agent-modeler';
export * from './social-cognition/theory-of-mind';
export * from './social-cognition/social-learner';
export * from './social-cognition/norm-tracker';

// Types
export * from './types';

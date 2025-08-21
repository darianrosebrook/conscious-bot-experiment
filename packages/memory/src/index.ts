/**
 * Multi-store memory system with provenance tracking and GraphRAG-first retrieval
 * 
 * This package provides:
 * - Episodic memory for experience storage and retrieval
 * - Semantic memory with knowledge graph and GraphRAG
 * - Working memory for active cognitive state
 * - Provenance tracking for decision justification
 * 
 * @author @darianrosebrook
 */

// Episodic Memory
export * from './episodic/event-logger';
export * from './episodic/salience-scorer';

// Working Memory
export * from './working';

// Semantic Memory
export * from './semantic';

// Export only episodic memory types from base types
export type {
  Experience,
  Outcome,
  EmotionalState
} from './types';

export {
  ExperienceType,
  OutcomeType,
  ExperienceSchema
} from './types';

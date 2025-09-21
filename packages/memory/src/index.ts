/**
 * Enhanced Memory System with Vector Search + GraphRAG
 *
 * This package provides a comprehensive memory system combining:
 * - Enhanced vector search with PostgreSQL + pgvector
 * - GraphRAG for structured knowledge retrieval
 * - Hybrid search combining both approaches
 * - Intelligent chunking for optimal memory storage
 * - Multi-modal retrieval (temporal, spatial, semantic)
 *
 * Plus all existing components:
 * - Episodic memory for experience storage and retrieval
 * - Working memory for active cognitive state
 * - Provenance tracking for decision justification
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Enhanced Memory System (New Vector Search + GraphRAG)
// ============================================================================

// Core enhanced memory system
export * from './memory-system';

// Vector database and storage
export * from './vector-database';

// Embedding generation service
export * from './embedding-service';

// Intelligent chunking service
export * from './chunking-service';

// Hybrid search combining vector and graph approaches
export * from './hybrid-search-service';

// ============================================================================
// Enhanced Memory System Components
// ============================================================================

// Memory Signal Generation for Core Integration
export * from './memory-signal-generator';

// Memory Decay Management (Use it or Lose it)
export * from './memory-decay-manager';

// Tool Efficiency and Learning
export * from './tool-efficiency-memory';

// Social Memory
export * from './social-memory-manager';

// Spatial Memory
export * from './spatial-memory-manager';

// Emotional Memory
export * from './emotional-memory-manager';

// Identity Memory System
export * from './identity-memory-guardian';
export * from './self-narrative-constructor';
export * from './memory-system-coordinator';

// Cognitive Task Memory Enhancement
export * from './cognitive-task-memory';

// Reflection and Learning Memory
export * from './reflection-memory';

// Tool Efficiency and Learning Examples
// Temporarily disabled due to build issues
// export * from './tool-efficiency-examples';

// ============================================================================
// Existing Memory System Components (Backward Compatibility)
// ============================================================================

// Episodic Memory
export * from './episodic/event-logger';
export * from './episodic/salience-scorer';

// Working Memory
export * from './working';

// Semantic Memory
export * from './semantic';

// Provenance Memory
export * from './provenance';

// Skills
export * from './skills';

// Memory versioning
export * from './memory-versioning-manager';

// Export only episodic memory types from base types
export type { Experience, Outcome, EmotionalState } from './types';

export { ExperienceType, OutcomeType, ExperienceSchema } from './types';

// ============================================================================
// Quick Start Functions
// ============================================================================

/**
 * Create and initialize an enhanced memory system with default configuration
 */
export async function createDefaultMemorySystem() {
  const { createEnhancedMemorySystem, DEFAULT_MEMORY_CONFIG } = await import(
    './memory-system'
  );

  const memorySystem = createEnhancedMemorySystem(DEFAULT_MEMORY_CONFIG);
  await memorySystem.initialize();

  return memorySystem;
}

/**
 * Create a memory system with custom configuration
 */
export async function createCustomMemorySystem(
  config: Partial<import('./memory-system').EnhancedMemorySystemConfig>
) {
  const { createEnhancedMemorySystem, DEFAULT_MEMORY_CONFIG } = await import(
    './memory-system'
  );

  const finalConfig = { ...DEFAULT_MEMORY_CONFIG, ...config };
  const memorySystem = createEnhancedMemorySystem(finalConfig);
  await memorySystem.initialize();

  return memorySystem;
}

// ============================================================================
// Integration Examples
// ============================================================================

// Comprehensive integration examples showing how to use the enhanced memory system
// Note: Exported types may conflict with local definitions above
// export * from './integration-examples';

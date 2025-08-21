/**
 * Working memory system exports.
 *
 * Provides working memory functionality including central executive,
 * context management, goal tracking, and attention management.
 *
 * @author @darianrosebrook
 */

export { CentralExecutive } from './central-executive';
export { ContextManager } from './context-manager';
export { GoalTracker } from './goal-tracker';
export {
  AttentionManager,
  type AttentionFocus,
  type FocusType,
  type AttentionStrategy,
  type CognitiveLoadMetrics,
  type AttentionState as AttentionManagerState,
  type AttentionEvent,
  type AttentionPerformance,
} from './attention-manager';
export { MemoryIntegration } from './memory-integration';

// Export enums (values, not just types)
export {
  WorkingItemType,
  ItemFormat,
  ContextType,
  GoalStatus,
  ProcessingType,
  ProcessingStatus,
} from './types';

// Export interfaces as types
export type {
  WorkingMemoryState,
  WorkingItem,
  ActiveGoal,
  ContextFrame,
  AttentionState,
  PhonologicalItem,
  VisuospatialItem,
  EpisodicItem,
  ProcessingStage,
  MemoryOperationResult,
} from './types';

// Re-export types for convenience
export type { Experience, ExperienceType } from '../types';

import { CentralExecutive } from './central-executive';
import { ContextManager } from './context-manager';
import { GoalTracker } from './goal-tracker';
import { AttentionManager } from './attention-manager';
import { MemoryIntegration } from './memory-integration';

/**
 * Create a complete working memory system
 */
export function createWorkingMemory() {
  const centralExecutive = new CentralExecutive();
  const contextManager = new ContextManager(centralExecutive);
  const goalTracker = new GoalTracker(centralExecutive);
  const attentionManager = new AttentionManager();
  const memoryIntegration = new MemoryIntegration(
    centralExecutive,
    contextManager,
    goalTracker
  );

  return {
    centralExecutive,
    contextManager,
    goalTracker,
    attentionManager,
    memoryIntegration,
  };
}

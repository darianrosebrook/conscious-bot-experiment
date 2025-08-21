/**
 * Working Memory System
 * 
 * Provides a cognitive workspace for active information processing,
 * attention management, and goal tracking.
 * 
 * @author @darianrosebrook
 */

export * from './central-executive';
export * from './context-manager';
export * from './goal-tracker';
export * from './memory-integration';
export * from './types';

import { CentralExecutive } from './central-executive';
import { ContextManager } from './context-manager';
import { GoalTracker } from './goal-tracker';
import { MemoryIntegration } from './memory-integration';

/**
 * Create a complete working memory system
 */
export function createWorkingMemory() {
  const centralExecutive = new CentralExecutive();
  const contextManager = new ContextManager(centralExecutive);
  const goalTracker = new GoalTracker(centralExecutive);
  const memoryIntegration = new MemoryIntegration(
    centralExecutive, 
    contextManager, 
    goalTracker
  );
  
  return {
    centralExecutive,
    contextManager,
    goalTracker,
    memoryIntegration,
  };
}

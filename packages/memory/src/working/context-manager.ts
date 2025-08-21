/**
 * Context management for working memory.
 *
 * Manages the active context frames that provide situational awareness
 * and background for cognitive operations.
 *
 * @author @darianrosebrook
 */

import { ContextFrame, ContextType, MemoryOperationResult } from './types';
import { CentralExecutive } from './central-executive';

/**
 * Context manager for working memory
 */
export class ContextManager {
  private centralExecutive: CentralExecutive;

  constructor(centralExecutive: CentralExecutive) {
    this.centralExecutive = centralExecutive;
  }

  /**
   * Get all active context frames
   */
  getAllContexts(): ContextFrame[] {
    const state = this.centralExecutive.getState();
    return [...state.contextFrames];
  }

  /**
   * Get context frames by type
   */
  getContextByType(type: ContextType): ContextFrame | undefined {
    const state = this.centralExecutive.getState();
    return state.contextFrames.find(frame => frame.type === type);
  }

  /**
   * Get most relevant context frames
   */
  getMostRelevantContexts(count: number = 3): ContextFrame[] {
    const state = this.centralExecutive.getState();
    return [...state.contextFrames]
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, count);
  }

  /**
   * Update spatial context (location, environment)
   */
  updateSpatialContext(
    location: any,
    options: {
      relevance?: number;
      expiresAt?: number;
    } = {}
  ): MemoryOperationResult {
    return this.centralExecutive.addContextFrame(
      ContextType.SPATIAL,
      location,
      {
        relevance: options.relevance || 0.7, // Spatial context is usually important
        expiresAt: options.expiresAt,
        source: 'perception',
      }
    );
  }

  /**
   * Update temporal context (time awareness)
   */
  updateTemporalContext(
    temporalInfo: {
      currentTime: number;
      dayPhase?: string;
      duration?: number;
      timePressure?: number;
    },
    options: {
      relevance?: number;
      expiresAt?: number;
    } = {}
  ): MemoryOperationResult {
    return this.centralExecutive.addContextFrame(
      ContextType.TEMPORAL,
      temporalInfo,
      {
        relevance: options.relevance || 0.5,
        expiresAt: options.expiresAt,
        source: 'time_awareness',
      }
    );
  }

  /**
   * Update social context (entities, interactions)
   */
  updateSocialContext(
    socialInfo: {
      entities: any[];
      relationships?: any[];
      socialDynamics?: any;
      expectations?: any;
    },
    options: {
      relevance?: number;
      expiresAt?: number;
    } = {}
  ): MemoryOperationResult {
    return this.centralExecutive.addContextFrame(
      ContextType.SOCIAL,
      socialInfo,
      {
        relevance: options.relevance || 0.6,
        expiresAt: options.expiresAt,
        source: 'social_perception',
      }
    );
  }

  /**
   * Update task context (current activity)
   */
  updateTaskContext(
    taskInfo: {
      activity: string;
      progress?: number;
      requirements?: string[];
      constraints?: string[];
    },
    options: {
      relevance?: number;
      expiresAt?: number;
    } = {}
  ): MemoryOperationResult {
    return this.centralExecutive.addContextFrame(
      ContextType.TASK,
      taskInfo,
      {
        relevance: options.relevance || 0.8, // Task context is highly relevant
        expiresAt: options.expiresAt,
        source: 'task_manager',
      }
    );
  }

  /**
   * Update emotional context (agent's emotional state)
   */
  updateEmotionalContext(
    emotionalState: {
      primary: string;
      intensity: number;
      valence: number;
      secondaryEmotions?: string[];
      triggers?: string[];
    },
    options: {
      relevance?: number;
      expiresAt?: number;
    } = {}
  ): MemoryOperationResult {
    return this.centralExecutive.addContextFrame(
      ContextType.EMOTIONAL,
      emotionalState,
      {
        relevance: options.relevance || 0.5,
        expiresAt: options.expiresAt,
        source: 'emotional_system',
      }
    );
  }

  /**
   * Update environmental context (conditions, resources)
   */
  updateEnvironmentalContext(
    environmentInfo: {
      conditions: any;
      resources?: any[];
      threats?: any[];
      opportunities?: any[];
    },
    options: {
      relevance?: number;
      expiresAt?: number;
    } = {}
  ): MemoryOperationResult {
    return this.centralExecutive.addContextFrame(
      ContextType.ENVIRONMENTAL,
      environmentInfo,
      {
        relevance: options.relevance || 0.6,
        expiresAt: options.expiresAt,
        source: 'environment_perception',
      }
    );
  }

  /**
   * Get integrated context summary
   */
  getContextSummary(): any {
    const contexts = this.getAllContexts();
    const summary: Record<string, any> = {};
    
    // Extract key information from each context type
    for (const context of contexts) {
      switch (context.type) {
        case ContextType.SPATIAL:
          summary.location = context.content;
          break;
        case ContextType.TEMPORAL:
          summary.time = context.content;
          break;
        case ContextType.SOCIAL:
          summary.social = {
            entities: context.content.entities,
            relationships: context.content.relationships,
          };
          break;
        case ContextType.TASK:
          summary.task = {
            activity: context.content.activity,
            progress: context.content.progress,
          };
          break;
        case ContextType.EMOTIONAL:
          summary.emotion = {
            primary: context.content.primary,
            intensity: context.content.intensity,
          };
          break;
        case ContextType.ENVIRONMENTAL:
          summary.environment = {
            conditions: context.content.conditions,
            resources: context.content.resources,
          };
          break;
        case ContextType.GOAL:
          if (!summary.goals) summary.goals = [];
          summary.goals.push({
            description: context.content.description,
            priority: context.content.priority,
          });
          break;
      }
    }
    
    return summary;
  }

  /**
   * Remove context frame by ID
   */
  removeContext(contextId: string): MemoryOperationResult {
    return this.centralExecutive.removeItem(contextId);
  }

  /**
   * Remove all contexts of a specific type
   */
  clearContextType(type: ContextType): MemoryOperationResult {
    const state = this.centralExecutive.getState();
    const contextsToRemove = state.contextFrames
      .filter(frame => frame.type === type)
      .map(frame => frame.id);
    
    if (contextsToRemove.length === 0) {
      return {
        success: false,
        message: `No context frames of type ${type} found`,
        affectedItems: [],
        timestamp: Date.now(),
      };
    }
    
    // Remove each context
    let success = true;
    for (const id of contextsToRemove) {
      const result = this.centralExecutive.removeItem(id);
      if (!result.success) {
        success = false;
      }
    }
    
    return {
      success,
      message: `Removed ${contextsToRemove.length} context frames of type ${type}`,
      affectedItems: contextsToRemove,
      timestamp: Date.now(),
    };
  }

  /**
   * Get context statistics
   */
  getStats() {
    const contexts = this.getAllContexts();
    
    return {
      totalContexts: contexts.length,
      byType: Object.values(ContextType).reduce(
        (acc, type) => {
          acc[type] = contexts.filter(c => c.type === type).length;
          return acc;
        },
        {} as Record<ContextType, number>
      ),
      averageRelevance: contexts.length > 0 ?
        contexts.reduce((sum, c) => sum + c.relevance, 0) / contexts.length :
        0,
    };
  }
}

/**
 * Working memory integration with other memory systems.
 *
 * Coordinates information flow between working memory, episodic memory,
 * and semantic memory to maintain a coherent cognitive workspace.
 *
 * @author @darianrosebrook
 */

import {
  WorkingItem,
  WorkingItemType,
  ItemFormat,
  ContextType,
  GoalStatus,
  MemoryOperationResult,
} from './types';
import { CentralExecutive } from './central-executive';
import { ContextManager } from './context-manager';
import { GoalTracker } from './goal-tracker';

/**
 * Memory integration for working memory
 */
export class MemoryIntegration {
  private centralExecutive: CentralExecutive;
  private contextManager: ContextManager;
  private goalTracker: GoalTracker;

  constructor(
    centralExecutive: CentralExecutive,
    contextManager: ContextManager,
    goalTracker: GoalTracker
  ) {
    this.centralExecutive = centralExecutive;
    this.contextManager = contextManager;
    this.goalTracker = goalTracker;
  }

  /**
   * Add episodic memory to working memory
   */
  addEpisodicMemory(
    episodicMemory: any,
    options: {
      importance?: number;
      associations?: string[];
    } = {}
  ): MemoryOperationResult {
    if (!episodicMemory) {
      return {
        success: false,
        message: 'Episodic memory is required',
        affectedItems: [],
        timestamp: Date.now(),
      };
    }

    // Add as working item
    const result = this.centralExecutive.addItem(
      WorkingItemType.OBSERVATION,
      episodicMemory,
      {
        format: ItemFormat.TEXT,
        importance: options.importance || 0.6,
        associations: options.associations || [],
        source: 'episodic_memory',
      }
    );

    if (!result.success) {
      return result;
    }

    // Add to episodic buffer
    const state = this.centralExecutive.getState();
    const bufferItem = {
      id: result.affectedItems[0],
      experience: episodicMemory,
      timestamp: Date.now(),
      salience: options.importance || 0.6,
      associations: options.associations || [],
      decayRate: 0.05,
    };

    state.buffers.episodic.push(bufferItem);

    // Limit buffer size
    if (state.buffers.episodic.length > 5) {
      state.buffers.episodic.shift();
    }

    return result;
  }

  /**
   * Add semantic knowledge to working memory
   */
  addSemanticKnowledge(
    knowledge: any,
    options: {
      importance?: number;
      associations?: string[];
      format?: ItemFormat;
    } = {}
  ): MemoryOperationResult {
    if (!knowledge) {
      return {
        success: false,
        message: 'Semantic knowledge is required',
        affectedItems: [],
        timestamp: Date.now(),
      };
    }

    // Add as working item
    return this.centralExecutive.addItem(
      WorkingItemType.FACT,
      knowledge,
      {
        format: options.format || ItemFormat.TEXT,
        importance: options.importance || 0.5,
        associations: options.associations || [],
        source: 'semantic_memory',
      }
    );
  }

  /**
   * Add perception to working memory
   */
  addPerception(
    perception: any,
    options: {
      type?: WorkingItemType;
      importance?: number;
      associations?: string[];
      format?: ItemFormat;
    } = {}
  ): MemoryOperationResult {
    if (!perception) {
      return {
        success: false,
        message: 'Perception data is required',
        affectedItems: [],
        timestamp: Date.now(),
      };
    }

    const itemType = options.type || WorkingItemType.OBSERVATION;
    const itemFormat = options.format || ItemFormat.VISUAL;

    // Add as working item
    const result = this.centralExecutive.addItem(
      itemType,
      perception,
      {
        format: itemFormat,
        importance: options.importance || 0.7, // Perceptions are important by default
        associations: options.associations || [],
        source: 'perception',
      }
    );

    if (!result.success) {
      return result;
    }

    // If it's visual, add to visuospatial buffer
    if (itemFormat === ItemFormat.VISUAL || itemFormat === ItemFormat.SPATIAL) {
      const state = this.centralExecutive.getState();
      const bufferItem = {
        id: result.affectedItems[0],
        content: perception,
        type: itemFormat === ItemFormat.VISUAL ? 'image' as const : 'spatial' as const,
        timestamp: Date.now(),
        complexity: 0.5,
        decayRate: 0.1,
      };

      state.buffers.visuospatial.push(bufferItem);

      // Limit buffer size
      if (state.buffers.visuospatial.length > 4) {
        state.buffers.visuospatial.shift();
      }
    }

    return result;
  }

  /**
   * Add verbal information to working memory
   */
  addVerbalInfo(
    text: string,
    options: {
      importance?: number;
      associations?: string[];
    } = {}
  ): MemoryOperationResult {
    if (!text) {
      return {
        success: false,
        message: 'Text is required',
        affectedItems: [],
        timestamp: Date.now(),
      };
    }

    // Add as working item
    const result = this.centralExecutive.addItem(
      WorkingItemType.FACT,
      text,
      {
        format: ItemFormat.TEXT,
        importance: options.importance || 0.5,
        associations: options.associations || [],
        source: 'verbal',
      }
    );

    if (!result.success) {
      return result;
    }

    // Add to phonological buffer
    const state = this.centralExecutive.getState();
    const bufferItem = {
      id: result.affectedItems[0],
      content: text,
      timestamp: Date.now(),
      duration: text.length * 100, // Longer text stays longer
      rehearsals: 0,
      decayRate: 0.1,
    };

    state.buffers.phonological.push(bufferItem);

    // Limit buffer size
    if (state.buffers.phonological.length > 5) {
      state.buffers.phonological.shift();
    }

    return result;
  }

  /**
   * Rehearse item in phonological loop
   */
  rehearseVerbalInfo(itemId: string): MemoryOperationResult {
    const state = this.centralExecutive.getState();
    const phonoItem = state.buffers.phonological.find(item => item.id === itemId);
    
    if (!phonoItem) {
      return {
        success: false,
        message: `Item '${itemId}' not found in phonological buffer`,
        affectedItems: [],
        timestamp: Date.now(),
      };
    }

    // Increase rehearsals and reset timestamp
    phonoItem.rehearsals++;
    phonoItem.timestamp = Date.now();
    
    // Reduce decay rate with rehearsal
    phonoItem.decayRate = Math.max(0.01, phonoItem.decayRate * 0.8);

    // Focus attention on the item
    this.centralExecutive.focusAttention(itemId, 'rehearsal');

    return {
      success: true,
      message: `Rehearsed verbal item ${itemId} (rehearsals: ${phonoItem.rehearsals})`,
      affectedItems: [itemId],
      timestamp: Date.now(),
    };
  }

  /**
   * Create inference from items in working memory
   */
  createInference(
    sourceItems: string[],
    inference: string,
    options: {
      importance?: number;
      confidence?: number;
    } = {}
  ): MemoryOperationResult {
    if (!inference) {
      return {
        success: false,
        message: 'Inference content is required',
        affectedItems: [],
        timestamp: Date.now(),
      };
    }

    const state = this.centralExecutive.getState();
    
    // Verify source items exist
    const validSources = sourceItems.filter(id => 
      state.workingItems.some(item => item.id === id)
    );
    
    if (validSources.length === 0) {
      return {
        success: false,
        message: 'No valid source items provided for inference',
        affectedItems: [],
        timestamp: Date.now(),
      };
    }

    // Add inference as working item
    const result = this.centralExecutive.addItem(
      WorkingItemType.INFERENCE,
      {
        content: inference,
        sources: validSources,
        confidence: options.confidence || 0.7,
      },
      {
        format: ItemFormat.LOGICAL,
        importance: options.importance || 0.6,
        associations: validSources,
        source: 'reasoning',
      }
    );

    return result;
  }

  /**
   * Create a decision in working memory
   */
  createDecision(
    decision: string,
    options: {
      alternatives?: string[];
      reasoning?: string;
      confidence?: number;
      importance?: number;
    } = {}
  ): MemoryOperationResult {
    if (!decision) {
      return {
        success: false,
        message: 'Decision content is required',
        affectedItems: [],
        timestamp: Date.now(),
      };
    }

    // Add decision as working item
    const result = this.centralExecutive.addItem(
      WorkingItemType.DECISION,
      {
        decision,
        alternatives: options.alternatives || [],
        reasoning: options.reasoning || '',
        confidence: options.confidence || 0.7,
        timestamp: Date.now(),
      },
      {
        format: ItemFormat.LOGICAL,
        importance: options.importance || 0.8, // Decisions are important
        source: 'decision_making',
      }
    );

    if (!result.success) {
      return result;
    }

    // Focus attention on the decision
    this.centralExecutive.focusAttention(result.affectedItems[0], 'decision');

    return result;
  }

  /**
   * Update working memory with current situation
   */
  updateSituation(
    situation: {
      location?: any;
      time?: any;
      entities?: any[];
      activity?: string;
      environment?: any;
      emotional?: any;
    }
  ): MemoryOperationResult {
    const now = Date.now();
    const updatedContexts: string[] = [];

    // Update each context type if provided
    if (situation.location) {
      const result = this.contextManager.updateSpatialContext(situation.location);
      if (result.success) {
        updatedContexts.push(...result.affectedItems);
      }
    }

    if (situation.time) {
      const result = this.contextManager.updateTemporalContext({
        currentTime: now,
        ...situation.time,
      });
      if (result.success) {
        updatedContexts.push(...result.affectedItems);
      }
    }

    if (situation.entities) {
      const result = this.contextManager.updateSocialContext({
        entities: situation.entities,
      });
      if (result.success) {
        updatedContexts.push(...result.affectedItems);
      }
    }

    if (situation.activity) {
      const result = this.contextManager.updateTaskContext({
        activity: situation.activity,
      });
      if (result.success) {
        updatedContexts.push(...result.affectedItems);
      }
    }

    if (situation.environment) {
      const result = this.contextManager.updateEnvironmentalContext({
        conditions: situation.environment,
      });
      if (result.success) {
        updatedContexts.push(...result.affectedItems);
      }
    }

    if (situation.emotional) {
      const result = this.contextManager.updateEmotionalContext({
        ...situation.emotional,
        primary: situation.emotional.primary || 'neutral',
        intensity: situation.emotional.intensity || 0.5,
        valence: situation.emotional.valence || 0,
      });
      if (result.success) {
        updatedContexts.push(...result.affectedItems);
      }
    }

    return {
      success: true,
      message: `Updated ${updatedContexts.length} context frames with current situation`,
      affectedItems: updatedContexts,
      timestamp: now,
    };
  }

  /**
   * Get current cognitive workspace snapshot
   */
  getCognitiveWorkspace(): any {
    const state = this.centralExecutive.getState();
    const contextSummary = this.contextManager.getContextSummary();
    
    return {
      attention: {
        focus: state.attentionFocus.primaryFocus,
        strength: state.attentionFocus.focusStrength,
        distractions: state.attentionFocus.distractions
          .filter(d => !d.handled)
          .length,
      },
      context: contextSummary,
      goals: this.goalTracker.getGoalsByStatus(GoalStatus.ACTIVE)
        .map(g => ({
          description: g.description,
          priority: g.priority,
          progress: g.progress,
        })),
      items: state.workingItems
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 5)
        .map(i => ({
          type: i.type,
          content: i.content,
          importance: i.importance,
        })),
      cognitiveLoad: state.cognitiveLoad,
      timestamp: state.timestamp,
    };
  }

  /**
   * Get working memory statistics
   */
  getStats() {
    const state = this.centralExecutive.getState();
    
    return {
      ...this.centralExecutive.getStats(),
      contextStats: this.contextManager.getStats(),
      goalStats: this.goalTracker.getStats(),
      buffers: {
        phonological: state.buffers.phonological.length,
        visuospatial: state.buffers.visuospatial.length,
        episodic: state.buffers.episodic.length,
      },
    };
  }
}

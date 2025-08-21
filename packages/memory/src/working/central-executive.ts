/**
 * Central executive for working memory control.
 *
 * Manages attention allocation, cognitive resources, and coordinates
 * information flow within the working memory system.
 *
 * @author @darianrosebrook
 */

import {
  WorkingMemoryState,
  AttentionState,
  WorkingItem,
  ContextFrame,
  ActiveGoal,
  ProcessingStage,
  WorkingItemType,
  ContextType,
  GoalStatus,
  ProcessingType,
  ProcessingStatus,
  ResourceType,
  ItemFormat,
  WorkingMemoryConfig,
  MemoryOperationResult,
  WorkingMemoryStateSchema,
} from './types';

/**
 * Default working memory configuration
 */
const DEFAULT_CONFIG: WorkingMemoryConfig = {
  maxCapacity: 7, // Classic "7 plus or minus 2" capacity
  decayRate: 0.05, // Base decay rate per update cycle
  rehearsalStrength: 0.2, // How much rehearsal reinforces items
  distractionThreshold: 0.4, // Minimum strength to cause distraction
  attentionInertia: 0.3, // Resistance to attention shifts
  goalCapacity: 3, // Maximum active goals
  bufferSizes: {
    phonological: 5,
    visuospatial: 4,
    episodic: 3,
  },
};

/**
 * Central executive for working memory management
 */
export class CentralExecutive {
  private state: WorkingMemoryState;
  private config: WorkingMemoryConfig;
  private lastUpdateTime: number;
  private updateInterval: number = 1000; // 1 second update interval

  constructor(config: Partial<WorkingMemoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.lastUpdateTime = Date.now();
    this.state = this.initializeWorkingMemory();
  }

  /**
   * Get current working memory state
   */
  getState(): WorkingMemoryState {
    // Apply decay and update state before returning
    this.updateWorkingMemory();
    return { ...this.state };
  }

  /**
   * Focus attention on a specific item or goal
   */
  focusAttention(target: string, source: string = 'deliberate'): MemoryOperationResult {
    if (!target) {
      return {
        success: false,
        message: 'Focus target is required',
        affectedItems: [],
        timestamp: Date.now(),
      };
    }

    this.updateWorkingMemory();

    const now = Date.now();
    const previousFocus = this.state.attentionFocus.primaryFocus;
    
    // Find the target in working items or goals
    const targetItem = this.state.workingItems.find(i => i.id === target) ||
                      this.state.activeGoals.find(g => g.id === target);
    
    if (!targetItem) {
      return {
        success: false,
        message: `Focus target '${target}' not found in working memory`,
        affectedItems: [],
        timestamp: now,
      };
    }

    // Update attention state
    if (previousFocus && previousFocus !== target) {
      // Move previous focus to secondary
      if (!this.state.attentionFocus.secondaryFoci.includes(previousFocus)) {
        this.state.attentionFocus.secondaryFoci.unshift(previousFocus);
        
        // Limit secondary foci
        if (this.state.attentionFocus.secondaryFoci.length > 3) {
          this.state.attentionFocus.secondaryFoci.pop();
        }
      }
    }

    // Set new primary focus
    this.state.attentionFocus.primaryFocus = target;
    this.state.attentionFocus.lastShift = now;
    this.state.attentionFocus.sustainedDuration = 0;
    
    // Adjust focus strength based on cognitive load and distractions
    const distractionPenalty = this.calculateDistractionPenalty();
    const loadPenalty = this.state.cognitiveLoad * 0.3;
    this.state.attentionFocus.focusStrength = Math.max(0.1, 
      Math.min(1.0, 0.9 - distractionPenalty - loadPenalty));

    // Update the accessed item
    if (targetItem) {
      if ('accessCount' in targetItem) {
        (targetItem as WorkingItem).accessCount++;
        (targetItem as WorkingItem).lastAccessed = now;
      } else if ('attention' in targetItem) {
        (targetItem as ActiveGoal).attention = Math.min(1.0, (targetItem as ActiveGoal).attention + 0.3);
      }
    }

    return {
      success: true,
      message: `Attention focused on '${target}'`,
      affectedItems: [target, ...(previousFocus ? [previousFocus] : [])],
      timestamp: now,
    };
  }

  /**
   * Add a new item to working memory
   */
  addItem(
    type: WorkingItemType,
    content: any,
    options: {
      format?: ItemFormat;
      importance?: number;
      associations?: string[];
      source?: string;
      expiresAt?: number;
    } = {}
  ): MemoryOperationResult {
    this.updateWorkingMemory();

    const now = Date.now();
    const id = `wm-${type}-${now}-${Math.random().toString(36).substring(2, 9)}`;
    
    const item: WorkingItem = {
      id,
      type,
      content,
      format: options.format || ItemFormat.TEXT,
      importance: options.importance !== undefined ? options.importance : 0.5,
      createdAt: now,
      updatedAt: now,
      accessCount: 1,
      lastAccessed: now,
      expiresAt: options.expiresAt,
      associations: options.associations || [],
      source: options.source || 'system',
    };

    // Check capacity and make room if needed
    if (this.state.workingItems.length >= this.config.maxCapacity) {
      this.makeRoomForNewItem();
    }

    this.state.workingItems.push(item);
    
    // Increase cognitive load
    this.state.cognitiveLoad = Math.min(1.0, 
      this.state.cognitiveLoad + (item.importance * 0.1));

    // Add as distraction if important enough
    if (item.importance > this.config.distractionThreshold) {
      this.state.attentionFocus.distractions.push({
        source: id,
        strength: item.importance,
        timestamp: now,
        handled: false,
      });
    }

    return {
      success: true,
      message: `Added ${type} item to working memory`,
      affectedItems: [id],
      timestamp: now,
    };
  }

  /**
   * Add context frame to working memory
   */
  addContextFrame(
    type: ContextType,
    content: any,
    options: {
      relevance?: number;
      expiresAt?: number;
      source?: string;
    } = {}
  ): MemoryOperationResult {
    this.updateWorkingMemory();

    const now = Date.now();
    const id = `ctx-${type}-${now}-${Math.random().toString(36).substring(2, 9)}`;
    
    const frame: ContextFrame = {
      id,
      type,
      content,
      relevance: options.relevance !== undefined ? options.relevance : 0.5,
      timestamp: now,
      expiresAt: options.expiresAt,
      source: options.source || 'system',
    };

    // Replace existing frame of same type if present
    const existingIndex = this.state.contextFrames.findIndex(f => f.type === type);
    if (existingIndex >= 0) {
      this.state.contextFrames[existingIndex] = frame;
    } else {
      this.state.contextFrames.push(frame);
    }

    // Update cognitive load
    this.state.cognitiveLoad = Math.min(1.0, 
      this.state.cognitiveLoad + (frame.relevance * 0.05));

    return {
      success: true,
      message: `Added ${type} context frame to working memory`,
      affectedItems: [id],
      timestamp: now,
    };
  }

  /**
   * Add active goal to working memory
   */
  addActiveGoal(
    description: string,
    options: {
      priority?: number;
      deadline?: number;
      subgoals?: string[];
      dependsOn?: string[];
      resources?: string[];
    } = {}
  ): MemoryOperationResult {
    this.updateWorkingMemory();

    const now = Date.now();
    const id = `goal-${now}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Check goal capacity
    if (this.state.activeGoals.filter(g => 
        g.status === GoalStatus.ACTIVE || 
        g.status === GoalStatus.PAUSED).length >= this.config.goalCapacity) {
      return {
        success: false,
        message: 'Working memory goal capacity reached',
        affectedItems: [],
        timestamp: now,
      };
    }
    
    const goal: ActiveGoal = {
      id,
      description,
      priority: options.priority !== undefined ? options.priority : 0.5,
      progress: 0,
      deadline: options.deadline,
      subgoals: options.subgoals || [],
      dependsOn: options.dependsOn || [],
      resources: options.resources || [],
      status: GoalStatus.ACTIVE,
      attention: 0.5,
    };

    this.state.activeGoals.push(goal);
    
    // Add goal context
    this.addContextFrame(ContextType.GOAL, {
      goalId: id,
      description,
      priority: goal.priority,
    }, {
      relevance: goal.priority,
      source: 'goal_management',
    });

    // Increase cognitive load
    this.state.cognitiveLoad = Math.min(1.0, 
      this.state.cognitiveLoad + (goal.priority * 0.15));

    return {
      success: true,
      message: `Added active goal to working memory`,
      affectedItems: [id],
      timestamp: now,
    };
  }

  /**
   * Update goal status
   */
  updateGoalStatus(
    goalId: string,
    status: GoalStatus,
    progress?: number
  ): MemoryOperationResult {
    this.updateWorkingMemory();

    const goal = this.state.activeGoals.find(g => g.id === goalId);
    if (!goal) {
      return {
        success: false,
        message: `Goal '${goalId}' not found`,
        affectedItems: [],
        timestamp: Date.now(),
      };
    }

    goal.status = status;
    if (progress !== undefined) {
      goal.progress = Math.max(0, Math.min(1, progress));
    }

    // Update goal context if present
    const goalContext = this.state.contextFrames.find(
      f => f.type === ContextType.GOAL && 
      f.content?.goalId === goalId
    );
    
    if (goalContext) {
      goalContext.content.status = status;
      goalContext.content.progress = goal.progress;
    }

    // Adjust cognitive load based on completion
    if (status === GoalStatus.COMPLETED || status === GoalStatus.FAILED) {
      this.state.cognitiveLoad = Math.max(0, 
        this.state.cognitiveLoad - (goal.priority * 0.1));
    }

    return {
      success: true,
      message: `Updated goal status to ${status}`,
      affectedItems: [goalId],
      timestamp: Date.now(),
    };
  }

  /**
   * Start cognitive processing stage
   */
  startProcessing(
    type: ProcessingType,
    inputs: string[],
    options: {
      priority?: number;
      deadline?: number;
    } = {}
  ): MemoryOperationResult {
    this.updateWorkingMemory();

    const now = Date.now();
    const id = `proc-${type}-${now}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Check if we have available resources
    if (this.state.cognitiveLoad > 0.8) {
      return {
        success: false,
        message: 'Insufficient cognitive resources for new processing',
        affectedItems: [],
        timestamp: now,
      };
    }
    
    const stage: ProcessingStage = {
      id,
      type,
      status: ProcessingStatus.ACTIVE,
      priority: options.priority !== undefined ? options.priority : 0.5,
      inputs,
      outputs: [],
      progress: 0,
      startTime: now,
      deadline: options.deadline,
      resources: [
        { type: ResourceType.ATTENTION, amount: 0.3, reserved: true },
        { type: ResourceType.PROCESSING, amount: 0.4, reserved: true },
      ],
    };

    this.state.processingStages.push(stage);
    
    // Increase cognitive load
    this.state.cognitiveLoad = Math.min(1.0, 
      this.state.cognitiveLoad + (stage.priority * 0.2));

    return {
      success: true,
      message: `Started ${type} processing`,
      affectedItems: [id, ...inputs],
      timestamp: now,
    };
  }

  /**
   * Complete processing stage with outputs
   */
  completeProcessing(
    processingId: string,
    outputs: string[]
  ): MemoryOperationResult {
    this.updateWorkingMemory();

    const stage = this.state.processingStages.find(p => p.id === processingId);
    if (!stage) {
      return {
        success: false,
        message: `Processing stage '${processingId}' not found`,
        affectedItems: [],
        timestamp: Date.now(),
      };
    }

    stage.status = ProcessingStatus.COMPLETED;
    stage.progress = 1.0;
    stage.outputs = outputs;
    
    // Release resources
    stage.resources.forEach(r => r.reserved = false);
    
    // Reduce cognitive load
    this.state.cognitiveLoad = Math.max(0, 
      this.state.cognitiveLoad - (stage.priority * 0.15));

    return {
      success: true,
      message: `Completed processing with ${outputs.length} outputs`,
      affectedItems: [processingId, ...outputs],
      timestamp: Date.now(),
    };
  }

  /**
   * Remove item from working memory
   */
  removeItem(itemId: string): MemoryOperationResult {
    this.updateWorkingMemory();

    // Check if it's a working item
    const itemIndex = this.state.workingItems.findIndex(i => i.id === itemId);
    if (itemIndex >= 0) {
      const item = this.state.workingItems[itemIndex];
      this.state.workingItems.splice(itemIndex, 1);
      
      // Reduce cognitive load
      this.state.cognitiveLoad = Math.max(0, 
        this.state.cognitiveLoad - (item.importance * 0.05));
      
      return {
        success: true,
        message: `Removed item from working memory`,
        affectedItems: [itemId],
        timestamp: Date.now(),
      };
    }
    
    // Check if it's a context frame
    const frameIndex = this.state.contextFrames.findIndex(f => f.id === itemId);
    if (frameIndex >= 0) {
      const frame = this.state.contextFrames[frameIndex];
      this.state.contextFrames.splice(frameIndex, 1);
      
      // Reduce cognitive load
      this.state.cognitiveLoad = Math.max(0, 
        this.state.cognitiveLoad - (frame.relevance * 0.03));
      
      return {
        success: true,
        message: `Removed context frame from working memory`,
        affectedItems: [itemId],
        timestamp: Date.now(),
      };
    }
    
    // Check if it's a goal
    const goalIndex = this.state.activeGoals.findIndex(g => g.id === itemId);
    if (goalIndex >= 0) {
      const goal = this.state.activeGoals[goalIndex];
      this.state.activeGoals.splice(goalIndex, 1);
      
      // Reduce cognitive load
      this.state.cognitiveLoad = Math.max(0, 
        this.state.cognitiveLoad - (goal.priority * 0.1));
      
      return {
        success: true,
        message: `Removed goal from working memory`,
        affectedItems: [itemId],
        timestamp: Date.now(),
      };
    }

    return {
      success: false,
      message: `Item '${itemId}' not found in working memory`,
      affectedItems: [],
      timestamp: Date.now(),
    };
  }

  /**
   * Handle distraction
   */
  handleDistraction(distractionSource: string): MemoryOperationResult {
    this.updateWorkingMemory();

    const distraction = this.state.attentionFocus.distractions.find(
      d => d.source === distractionSource && !d.handled
    );
    
    if (!distraction) {
      return {
        success: false,
        message: `Distraction '${distractionSource}' not found or already handled`,
        affectedItems: [],
        timestamp: Date.now(),
      };
    }

    distraction.handled = true;
    
    // Improve focus strength as distraction is handled
    this.state.attentionFocus.focusStrength = Math.min(1.0, 
      this.state.attentionFocus.focusStrength + 0.1);

    return {
      success: true,
      message: `Handled distraction from ${distractionSource}`,
      affectedItems: [distractionSource],
      timestamp: Date.now(),
    };
  }

  /**
   * Clear working memory (for testing or reset)
   */
  clear(): MemoryOperationResult {
    const now = Date.now();
    this.state = this.initializeWorkingMemory();
    
    return {
      success: true,
      message: 'Working memory cleared',
      affectedItems: [],
      timestamp: now,
    };
  }

  /**
   * Get working memory statistics
   */
  getStats() {
    this.updateWorkingMemory();
    
    return {
      itemCount: this.state.workingItems.length,
      maxCapacity: this.config.maxCapacity,
      utilizationRatio: this.state.workingItems.length / this.config.maxCapacity,
      cognitiveLoad: this.state.cognitiveLoad,
      activeGoals: this.state.activeGoals.filter(g => g.status === GoalStatus.ACTIVE).length,
      contextFrameCount: this.state.contextFrames.length,
      focusStrength: this.state.attentionFocus.focusStrength,
      distractionCount: this.state.attentionFocus.distractions.filter(d => !d.handled).length,
    };
  }

  /**
   * Initialize working memory state
   */
  private initializeWorkingMemory(): WorkingMemoryState {
    const now = Date.now();
    
    const state: WorkingMemoryState = {
      id: `wm-${now}`,
      timestamp: now,
      cognitiveLoad: 0.1,
      attentionFocus: {
        primaryFocus: null,
        secondaryFoci: [],
        distractions: [],
        focusStrength: 0.8,
        lastShift: now,
        sustainedDuration: 0,
      },
      activeGoals: [],
      contextFrames: [],
      workingItems: [],
      buffers: {
        phonological: [],
        visuospatial: [],
        episodic: [],
      },
      processingStages: [],
    };

    // Validate state
    const validation = WorkingMemoryStateSchema.safeParse(state);
    if (!validation.success) {
      console.warn('Working memory state validation failed:', validation.error);
    }

    return state;
  }

  /**
   * Update working memory state (decay, cleanup)
   */
  private updateWorkingMemory(): void {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTime;
    
    // Only update if enough time has passed
    if (timeSinceLastUpdate < this.updateInterval) {
      return;
    }
    
    this.lastUpdateTime = now;
    this.state.timestamp = now;
    
    // Update attention duration
    if (this.state.attentionFocus.primaryFocus) {
      this.state.attentionFocus.sustainedDuration += timeSinceLastUpdate;
    }
    
    // Apply decay to items
    this.applyWorkingItemDecay(timeSinceLastUpdate);
    
    // Clean up expired items
    this.cleanupExpiredItems();
    
    // Update processing stages
    this.updateProcessingStages(timeSinceLastUpdate);
    
    // Update cognitive load
    this.updateCognitiveLoad();
    
    // Clean up handled distractions
    this.state.attentionFocus.distractions = this.state.attentionFocus.distractions
      .filter(d => !d.handled || now - d.timestamp < 10000); // Keep handled distractions for 10 seconds
  }

  /**
   * Apply decay to working memory items
   */
  private applyWorkingItemDecay(elapsedMs: number): void {
    // Calculate decay factor based on time
    const decayFactor = (elapsedMs / 1000) * this.config.decayRate;
    
    // Apply decay to working items importance
    this.state.workingItems.forEach(item => {
      // Items decay based on recency of access and importance
      const timeSinceAccess = this.state.timestamp - item.lastAccessed;
      const accessRecency = Math.min(1, timeSinceAccess / (60 * 1000)); // 1 minute max
      
      // More important items decay slower
      const itemDecay = decayFactor * (1 - item.importance * 0.5) * accessRecency;
      item.importance = Math.max(0, item.importance - itemDecay);
    });
    
    // Apply decay to context frames relevance
    this.state.contextFrames.forEach(frame => {
      const frameDecay = decayFactor * 0.5; // Context decays slower
      frame.relevance = Math.max(0, frame.relevance - frameDecay);
    });
    
    // Apply decay to goal attention
    this.state.activeGoals.forEach(goal => {
      if (goal.status === GoalStatus.ACTIVE) {
        const attentionDecay = decayFactor * 0.3; // Goals decay slower
        goal.attention = Math.max(0.1, goal.attention - attentionDecay);
      }
    });
  }

  /**
   * Clean up expired items
   */
  private cleanupExpiredItems(): void {
    const now = this.state.timestamp;
    
    // Remove expired working items
    this.state.workingItems = this.state.workingItems.filter(item => 
      !item.expiresAt || item.expiresAt > now
    );
    
    // Remove expired context frames
    this.state.contextFrames = this.state.contextFrames.filter(frame => 
      !frame.expiresAt || frame.expiresAt > now
    );
    
    // Remove completely decayed items
    this.state.workingItems = this.state.workingItems.filter(item => 
      item.importance > 0.05
    );
    
    // Remove irrelevant context frames
    this.state.contextFrames = this.state.contextFrames.filter(frame => 
      frame.relevance > 0.1
    );
  }

  /**
   * Update processing stages
   */
  private updateProcessingStages(elapsedMs: number): void {
    const progressIncrement = elapsedMs / 10000; // Full processing in 10 seconds
    
    this.state.processingStages.forEach(stage => {
      if (stage.status === ProcessingStatus.ACTIVE) {
        // Progress based on priority (higher priority = faster progress)
        stage.progress = Math.min(1.0, 
          stage.progress + (progressIncrement * (0.5 + stage.priority * 0.5)));
        
        // Check for completion or deadline
        if (stage.progress >= 1.0) {
          stage.status = ProcessingStatus.COMPLETED;
          stage.resources.forEach(r => r.reserved = false);
        } else if (stage.deadline && this.state.timestamp > stage.deadline) {
          stage.status = ProcessingStatus.FAILED;
          stage.resources.forEach(r => r.reserved = false);
        }
      }
    });
    
    // Remove completed/failed stages after some time
    this.state.processingStages = this.state.processingStages.filter(stage => 
      stage.status === ProcessingStatus.ACTIVE ||
      stage.status === ProcessingStatus.PAUSED ||
      this.state.timestamp - stage.startTime < 30000 // Keep for 30 seconds after completion
    );
  }

  /**
   * Update cognitive load
   */
  private updateCognitiveLoad(): void {
    // Base load from item count
    const itemRatio = this.state.workingItems.length / this.config.maxCapacity;
    
    // Processing load
    const processingLoad = this.state.processingStages
      .filter(p => p.status === ProcessingStatus.ACTIVE)
      .reduce((sum, p) => sum + p.resources
        .filter(r => r.type === ResourceType.PROCESSING)
        .reduce((rSum, r) => rSum + r.amount, 0), 0);
    
    // Goal load
    const goalLoad = this.state.activeGoals
      .filter(g => g.status === GoalStatus.ACTIVE)
      .reduce((sum, g) => sum + g.priority * 0.1, 0);
    
    // Distraction load
    const distractionLoad = this.state.attentionFocus.distractions
      .filter(d => !d.handled)
      .reduce((sum, d) => sum + d.strength * 0.05, 0);
    
    // Calculate new load
    const newLoad = 0.1 + // Base load
                   (itemRatio * 0.3) + 
                   processingLoad + 
                   goalLoad + 
                   distractionLoad;
    
    // Apply with smoothing
    this.state.cognitiveLoad = (this.state.cognitiveLoad * 0.7) + (newLoad * 0.3);
    this.state.cognitiveLoad = Math.max(0.1, Math.min(1.0, this.state.cognitiveLoad));
  }

  /**
   * Calculate distraction penalty to focus
   */
  private calculateDistractionPenalty(): number {
    return this.state.attentionFocus.distractions
      .filter(d => !d.handled)
      .reduce((sum, d) => sum + d.strength * 0.2, 0);
  }

  /**
   * Make room for new item by removing least important
   */
  private makeRoomForNewItem(): void {
    // Sort by importance and last accessed
    const sortedItems = [...this.state.workingItems]
      .sort((a, b) => {
        // First by importance
        const importanceDiff = a.importance - b.importance;
        if (Math.abs(importanceDiff) > 0.1) {
          return importanceDiff;
        }
        // Then by last accessed time (older first)
        return a.lastAccessed - b.lastAccessed;
      });
    
    // Remove least important item
    if (sortedItems.length > 0) {
      const toRemove = sortedItems[0];
      this.state.workingItems = this.state.workingItems
        .filter(i => i.id !== toRemove.id);
      
      console.log(`Removed item ${toRemove.id} to make room (importance: ${toRemove.importance.toFixed(2)})`);
    }
  }
}

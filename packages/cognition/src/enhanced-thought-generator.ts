/**
 * Enhanced Thought Generator
 * 
 * Generates context-aware thoughts that reflect the bot's actual state,
 * eliminating "No content available" messages and providing meaningful insights.
 * 
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

export interface ThoughtContext {
  currentState?: {
    position?: { x: number; y: number; z: number };
    health?: number;
    food?: number;
    inventory?: Array<{
      name: string;
      count: number;
      displayName: string;
    }>;
    timeOfDay?: number;
    weather?: string;
    biome?: string;
  };
  currentTasks?: Array<{
    id: string;
    title: string;
    progress: number;
    status: string;
    type: string;
  }>;
  recentEvents?: Array<{
    id: string;
    type: string;
    timestamp: number;
    data: any;
  }>;
  emotionalState?: string;
  memoryContext?: {
    recentMemories?: Array<{
      id: string;
      content: string;
      type: string;
      timestamp: number;
    }>;
  };
}

export interface CognitiveThought {
  id: string;
  type: 'reflection' | 'observation' | 'planning' | 'decision' | 'memory' | 'intrusive' | 'emotional' | 'sensory';
  content: string;
  timestamp: number;
  context: {
    emotionalState?: string;
    confidence?: number;
    cognitiveSystem?: string;
    taskId?: string;
    eventId?: string;
    memoryId?: string;
    position?: { x: number; y: number; z: number };
    health?: number;
    inventory?: Array<{
      name: string;
      count: number;
      displayName: string;
    }>;
    step?: number;
    completed?: boolean;
  };
  metadata: {
    thoughtType: string;
    trigger?: string;
    context?: string;
    duration?: number;
    intensity?: number;
    relatedThoughts?: string[];
    taskType?: string;
    priority?: string;
    currentStep?: string;
    damageAmount?: number;
    source?: string;
    resourceType?: string;
    amount?: number;
    entityType?: string;
    hostile?: boolean;
    distance?: number;
    itemType?: string;
    purpose?: string;
    biomeType?: string;
    eventType?: string;
  };
  category?: 'task-related' | 'environmental' | 'survival' | 'exploration' | 'crafting' | 'combat' | 'social' | 'idle' | 'meta-cognitive';
  tags?: string[];
  priority?: 'low' | 'medium' | 'high';
}

export interface EnhancedThoughtGeneratorConfig {
  thoughtInterval: number;
  maxThoughtsPerCycle: number;
  enableIdleThoughts: boolean;
  enableContextualThoughts: boolean;
  enableEventDrivenThoughts: boolean;
}

const DEFAULT_CONFIG: EnhancedThoughtGeneratorConfig = {
  thoughtInterval: 30000, // 30 seconds between thoughts
  maxThoughtsPerCycle: 3,
  enableIdleThoughts: true,
  enableContextualThoughts: true,
  enableEventDrivenThoughts: true,
};

/**
 * Enhanced thought generator with context-aware content
 * @author @darianrosebrook
 */
export class EnhancedThoughtGenerator extends EventEmitter {
  private config: EnhancedThoughtGeneratorConfig;
  private lastThoughtTime: number = 0;
  private thoughtHistory: CognitiveThought[] = [];
  private isGenerating: boolean = false;

  constructor(config: Partial<EnhancedThoughtGeneratorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a thought based on current context
   */
  async generateThought(context: ThoughtContext): Promise<CognitiveThought | null> {
    const now = Date.now();
    
    // Prevent too frequent thoughts
    if (now - this.lastThoughtTime < this.config.thoughtInterval) {
      return null;
    }
    
    // Prevent concurrent generation
    if (this.isGenerating) {
      return null;
    }
    
    this.isGenerating = true;
    this.lastThoughtTime = now;
    
    try {
      let thought: CognitiveThought | null = null;
      
      // Prioritize contextual thoughts
      if (this.config.enableContextualThoughts && context.currentTasks && context.currentTasks.length > 0) {
        thought = await this.generateTaskThought(context.currentTasks[0], context);
      } else if (this.config.enableEventDrivenThoughts && context.recentEvents && context.recentEvents.length > 0) {
        thought = await this.generateEventThought(context.recentEvents[0], context);
      } else if (this.config.enableIdleThoughts) {
        thought = this.generateIdleThought(context);
      }
      
      if (thought) {
        this.thoughtHistory.push(thought);
        
        // Keep only last 100 thoughts to prevent memory leaks
        if (this.thoughtHistory.length > 100) {
          this.thoughtHistory = this.thoughtHistory.slice(-100);
        }
        
        this.emit('thoughtGenerated', thought);
      }
      
      return thought;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Generate idle thoughts when no active tasks or events
   */
  private generateIdleThought(context: ThoughtContext): CognitiveThought {
    const idleThoughts = [
      "Monitoring environment for opportunities and potential threats...",
      "Processing recent experiences and updating survival strategies...",
      "Maintaining awareness of surroundings while conserving energy...",
      "Consolidating memories and planning next exploration phase...",
      "Evaluating current position and considering resource needs...",
      "Scanning for nearby resources and safe locations...",
      "Reflecting on recent decisions and their outcomes...",
      "Preparing for potential encounters or environmental changes...",
      "Analyzing current biome conditions and resource availability...",
      "Considering long-term survival goals and immediate priorities...",
      "Assessing current equipment and identifying improvement needs...",
      "Planning efficient routes for future exploration and gathering...",
      "Evaluating shelter options and defensive positioning...",
      "Contemplating resource management and crafting priorities...",
      "Monitoring health and energy levels for optimal performance..."
    ];
    
    const selectedThought = idleThoughts[Math.floor(Math.random() * idleThoughts.length)];
    
    return {
      id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'reflection',
      content: selectedThought,
      timestamp: Date.now(),
      context: {
        emotionalState: context.emotionalState || 'neutral',
        confidence: 0.6,
        cognitiveSystem: 'idle-monitoring',
        health: context.currentState?.health,
        position: context.currentState?.position,
        inventory: context.currentState?.inventory
      },
      metadata: {
        thoughtType: 'idle-reflection',
        trigger: 'time-based',
        context: 'environmental-monitoring',
        intensity: 0.4
      },
      category: 'idle',
      tags: ['monitoring', 'environmental', 'survival'],
      priority: 'low'
    };
  }

  /**
   * Generate task-related thoughts
   */
  private async generateTaskThought(task: any, context: ThoughtContext): Promise<CognitiveThought> {
    const progress = task.progress || 0;
    const steps = task.steps || [];
    
    if (progress === 0) {
      return {
        id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'planning',
        content: `Starting task: ${task.title}. Breaking down into ${steps.length} steps.`,
        timestamp: Date.now(),
        context: {
          taskId: task.id,
          step: 0,
          emotionalState: context.emotionalState || 'focused',
          confidence: 0.7,
          health: context.currentState?.health,
          position: context.currentState?.position
        },
        metadata: {
          thoughtType: 'task-initiation',
          taskType: task.type,
          priority: task.priority,
          trigger: 'task-start'
        },
        category: 'task-related',
        tags: ['planning', 'task-start', task.type],
        priority: 'medium'
      };
    }
    
    if (progress === 1) {
      return {
        id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'reflection',
        content: `Completed task: ${task.title}. Evaluating results and planning next actions.`,
        timestamp: Date.now(),
        context: {
          taskId: task.id,
          completed: true,
          emotionalState: context.emotionalState || 'satisfied',
          confidence: 0.8,
          health: context.currentState?.health,
          position: context.currentState?.position
        },
        metadata: {
          thoughtType: 'task-completion',
          taskType: task.type,
          duration: task.duration,
          trigger: 'task-complete'
        },
        category: 'task-related',
        tags: ['completion', 'evaluation', task.type],
        priority: 'medium'
      };
    }
    
    const currentStep = steps.find((s: any) => !s.done);
    const completedSteps = steps.filter((s: any) => s.done).length;
    
    return {
      id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'observation',
      content: `Working on: ${currentStep?.label || task.title}. Progress: ${Math.round(progress * 100)}% (${completedSteps}/${steps.length} steps)`,
      timestamp: Date.now(),
      context: {
        taskId: task.id,
        step: completedSteps,
        emotionalState: context.emotionalState || 'focused',
        confidence: 0.6,
        health: context.currentState?.health,
        position: context.currentState?.position
      },
      metadata: {
        thoughtType: 'task-progress',
        taskType: task.type,
        currentStep: currentStep?.id,
        trigger: 'task-progress'
      },
      category: 'task-related',
      tags: ['progress', 'execution', task.type],
      priority: 'medium'
    };
  }

  /**
   * Generate event-related thoughts
   */
  private async generateEventThought(event: any, context: ThoughtContext): Promise<CognitiveThought> {
    const eventType = event.type;
    const eventData = event.data;
    
    switch (eventType) {
      case 'damage_taken':
        return {
          id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'reflection',
          content: `Took damage from ${eventData.source}. Need to be more careful and find safety.`,
          timestamp: Date.now(),
          context: {
            eventId: event.id,
            emotionalState: 'cautious',
            confidence: 0.8,
            health: context.currentState?.health
          },
          metadata: {
            thoughtType: 'damage-reflection',
            damageAmount: eventData.amount,
            source: eventData.source,
            trigger: 'damage-event'
          },
          category: 'survival',
          tags: ['damage', 'safety', 'defense'],
          priority: 'high'
        };
        
      case 'resource_gathered':
        return {
          id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'observation',
          content: `Gathered ${eventData.amount} ${eventData.resource}. This will be useful for ${eventData.usage || 'survival'}.`,
          timestamp: Date.now(),
          context: {
            eventId: event.id,
            emotionalState: 'satisfied',
            confidence: 0.7,
            inventory: context.currentState?.inventory
          },
          metadata: {
            thoughtType: 'resource-gathering',
            resourceType: eventData.resource,
            amount: eventData.amount,
            trigger: 'gathering-event'
          },
          category: 'crafting',
          tags: ['gathering', 'resources', eventData.resource],
          priority: 'medium'
        };
        
      case 'entity_encountered':
        return {
          id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'observation',
          content: `Encountered ${eventData.entityType} at distance ${eventData.distance}. ${eventData.hostile ? 'Need to be cautious.' : 'Could be useful.'}`,
          timestamp: Date.now(),
          context: {
            eventId: event.id,
            emotionalState: eventData.hostile ? 'alert' : 'curious',
            confidence: 0.6,
            position: context.currentState?.position
          },
          metadata: {
            thoughtType: 'entity-encounter',
            entityType: eventData.entityType,
            hostile: eventData.hostile,
            distance: eventData.distance,
            trigger: 'entity-event'
          },
          category: 'environmental',
          tags: ['entity', 'encounter', eventData.entityType],
          priority: eventData.hostile ? 'high' : 'medium'
        };
        
      case 'crafting_completed':
        return {
          id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'reflection',
          content: `Successfully crafted ${eventData.item}. This improves my capabilities for ${eventData.purpose || 'survival'}.`,
          timestamp: Date.now(),
          context: {
            eventId: event.id,
            emotionalState: 'accomplished',
            confidence: 0.8,
            inventory: context.currentState?.inventory
          },
          metadata: {
            thoughtType: 'crafting-success',
            itemType: eventData.item,
            purpose: eventData.purpose,
            trigger: 'crafting-event'
          },
          category: 'crafting',
          tags: ['crafting', 'success', eventData.item],
          priority: 'medium'
        };
        
      case 'biome_changed':
        return {
          id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'observation',
          content: `Entered ${eventData.biome} biome. This environment offers different resources and challenges.`,
          timestamp: Date.now(),
          context: {
            eventId: event.id,
            emotionalState: 'curious',
            confidence: 0.7,
            position: context.currentState?.position
          },
          metadata: {
            thoughtType: 'biome-change',
            biomeType: eventData.biome,
            trigger: 'biome-event'
          },
          category: 'environmental',
          tags: ['biome', 'exploration', eventData.biome],
          priority: 'medium'
        };
        
      default:
        return {
          id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'observation',
          content: `Noticed ${eventType}: ${eventData.description || 'Something happened'}.`,
          timestamp: Date.now(),
          context: {
            eventId: event.id,
            emotionalState: 'neutral',
            confidence: 0.5,
            position: context.currentState?.position
          },
          metadata: {
            thoughtType: 'general-event',
            eventType: eventType,
            trigger: 'general-event'
          },
          category: 'environmental',
          tags: ['event', eventType],
          priority: 'low'
        };
    }
  }

  /**
   * Get thought history
   */
  getThoughtHistory(limit: number = 50): CognitiveThought[] {
    return this.thoughtHistory.slice(-limit);
  }

  /**
   * Clear thought history
   */
  clearThoughtHistory(): void {
    this.thoughtHistory = [];
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<EnhancedThoughtGeneratorConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): EnhancedThoughtGeneratorConfig {
    return { ...this.config };
  }
}

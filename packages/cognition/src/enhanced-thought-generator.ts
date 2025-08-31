/**
 * Enhanced Thought Generator
 *
 * Generates context-aware thoughts that reflect the bot's actual state,
 * eliminating "No content available" messages and providing meaningful insights.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { LLMInterface } from './cognitive-core/llm-interface';

/**
 * Thought Deduplicator - Prevents repetitive thoughts to improve performance
 * @author @darianrosebrook
 */
class ThoughtDeduplicator {
  private recentThoughts: Map<string, number> = new Map();
  private cooldownMs: number;
  private maxRecentThoughts: number;

  constructor(config: { cooldownMs: number; maxRecentThoughts: number }) {
    this.cooldownMs = config.cooldownMs;
    this.maxRecentThoughts = config.maxRecentThoughts;
  }

  shouldGenerateThought(content: string): boolean {
    const hash = this.hashContent(content);
    const lastGenerated = this.recentThoughts.get(hash);
    const now = Date.now();

    if (!lastGenerated || now - lastGenerated > this.cooldownMs) {
      this.recentThoughts.set(hash, now);

      // Clean up old entries to prevent memory leaks
      if (this.recentThoughts.size > this.maxRecentThoughts) {
        const oldestEntries = Array.from(this.recentThoughts.entries())
          .sort(([, a], [, b]) => a - b)
          .slice(0, this.recentThoughts.size - this.maxRecentThoughts);

        oldestEntries.forEach(([key]) => this.recentThoughts.delete(key));
      }

      return true;
    }
    return false;
  }

  private hashContent(content: string): string {
    // Simple hash function for thought content
    return content.toLowerCase().replace(/\s+/g, ' ').trim();
  }
}

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
  type:
    | 'reflection'
    | 'observation'
    | 'planning'
    | 'decision'
    | 'memory'
    | 'intrusive'
    | 'emotional'
    | 'sensory';
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
    llmConfidence?: number;
    model?: string;
    error?: string;
  };
  category?:
    | 'task-related'
    | 'environmental'
    | 'survival'
    | 'exploration'
    | 'crafting'
    | 'combat'
    | 'social'
    | 'idle'
    | 'meta-cognitive';
  tags?: string[];
  priority?: 'low' | 'medium' | 'high';
}

export interface EnhancedThoughtGeneratorConfig {
  thoughtInterval: number;
  maxThoughtsPerCycle: number;
  enableIdleThoughts: boolean;
  enableContextualThoughts: boolean;
  enableEventDrivenThoughts: boolean;
  thoughtDeduplicationCooldown?: number; // Cooldown period for similar thoughts in milliseconds
}

const DEFAULT_CONFIG: EnhancedThoughtGeneratorConfig = {
  thoughtInterval: 60000, // 60 seconds between thoughts to reduce spam
  maxThoughtsPerCycle: 1,
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
  private thoughtHistory: CognitiveThought[] = [];
  private lastThoughtTime: number = Date.now() - 10000; // Initialize to 10 seconds ago
  private isGenerating: boolean = false;
  private llm: LLMInterface;
  private thoughtDeduplicator: ThoughtDeduplicator;

  constructor(config: Partial<EnhancedThoughtGeneratorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize LLM interface for dynamic thought generation
    this.llm = new LLMInterface({
      model: 'qwen2.5:7b', // Optimal model from benchmark results
      temperature: 0.8,
      maxTokens: 512,
      timeout: 60000, // Increased timeout for better reliability
      retries: 2,
    });

    // Initialize thought deduplicator to prevent repetitive thoughts
    this.thoughtDeduplicator = new ThoughtDeduplicator({
      cooldownMs: this.config.thoughtDeduplicationCooldown || 30000, // 30 seconds default
      maxRecentThoughts: 50,
    });
  }

  /**
   * Generate a thought based on current context
   */
  async generateThought(
    context: ThoughtContext
  ): Promise<CognitiveThought | null> {
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
      if (
        this.config.enableContextualThoughts &&
        context.currentTasks &&
        context.currentTasks.length > 0
      ) {
        thought = await this.generateTaskThought(
          context.currentTasks[0],
          context
        );
      } else if (
        this.config.enableEventDrivenThoughts &&
        context.recentEvents &&
        context.recentEvents.length > 0
      ) {
        thought = await this.generateEventThought(
          context.recentEvents[0],
          context
        );
      } else if (this.config.enableIdleThoughts) {
        thought = await this.generateIdleThought(context);
      }

      if (thought) {
        // Check if this thought is too similar to recent thoughts
        if (!this.thoughtDeduplicator.shouldGenerateThought(thought.content)) {
          console.log(
            '🚫 Skipping repetitive thought:',
            thought.content.substring(0, 50) + '...'
          );
          return null;
        }

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
   * Generate idle thoughts when no active tasks or events using LLM
   */
  private async generateIdleThought(
    context: ThoughtContext
  ): Promise<CognitiveThought> {
    try {
      const situation = this.buildIdleSituation(context);

      // Add timeout wrapper to prevent hanging
      const response = await Promise.race([
        this.llm.generateInternalThought(situation, {
          currentGoals: context.currentTasks?.map((task) => task.title) || [],
          recentMemories:
            context.recentEvents?.map((event) => ({ description: event })) ||
            [],
          agentState: context.currentState,
        }),
        new Promise<never>(
          (_, reject) =>
            setTimeout(() => reject(new Error('LLM timeout')), 45000) // 45s timeout
        ),
      ]);

      return {
        id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'reflection',
        content: response.text.trim(),
        timestamp: Date.now(),
        context: {
          emotionalState: context.emotionalState || 'neutral',
          confidence: response.confidence,
          cognitiveSystem: 'llm-core',
          health: context.currentState?.health,
          position: context.currentState?.position,
          inventory: context.currentState?.inventory,
        },
        metadata: {
          thoughtType: 'idle-reflection',
          trigger: 'time-based',
          context: 'environmental-monitoring',
          intensity: 0.4,
          llmConfidence: response.confidence,
          model: response.model,
        },
        category: 'idle',
        tags: ['monitoring', 'environmental', 'survival'],
        priority: 'low',
      };
    } catch (error) {
      console.error('Failed to generate idle thought with LLM:', error);

      // Fallback to contextually aware thought if LLM fails
      const fallbackContent = this.generateFallbackThought(context);

      return {
        id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'reflection',
        content: fallbackContent,
        timestamp: Date.now(),
        context: {
          emotionalState: context.emotionalState || 'neutral',
          confidence: 0.3,
          cognitiveSystem: 'fallback',
          health: context.currentState?.health,
          position: context.currentState?.position,
          inventory: context.currentState?.inventory,
        },
        metadata: {
          thoughtType: 'idle-reflection',
          trigger: 'time-based',
          context: 'environmental-monitoring',
          intensity: 0.2,
          error: 'llm-generation-failed',
        },
        category: 'idle',
        tags: ['monitoring', 'fallback'],
        priority: 'low',
      };
    }
  }

  /**
   * Build situation description for idle thought generation
   */
  private buildIdleSituation(context: ThoughtContext): string {
    const health = context.currentState?.health || 20;
    const inventory = context.currentState?.inventory || [];
    const position = context.currentState?.position;
    const biome = context.currentState?.biome || 'unknown';
    const timeOfDay = context.currentState?.timeOfDay || 0;

    let situation = '';

    // Health status
    if (health < 10) {
      situation += `Low health (${health}/20). `;
    } else if (health < 15) {
      situation += `Moderate health (${health}/20). `;
    }

    // Inventory status
    if (inventory.length === 0) {
      situation += `Empty inventory. `;
    } else {
      const itemCount = inventory.length;
      situation += `Carrying ${itemCount} items. `;
    }

    // Environmental context
    if (biome !== 'unknown') {
      situation += `In ${biome} biome. `;
    }

    if (timeOfDay < 12000 || timeOfDay > 24000) {
      situation += `Night time. `;
    }

    // Recent events
    if (context.recentEvents && context.recentEvents.length > 0) {
      const recentEvent = context.recentEvents[context.recentEvents.length - 1];
      situation += `Recently: ${recentEvent}. `;
    }

    // Position if available
    if (position) {
      situation += `At (${Math.round(position.x)}, ${Math.round(position.y)}, ${Math.round(position.z)}). `;
    }

    return situation || 'Idle with no clear context.';
  }

  /**
   * Generate task-related thoughts using LLM
   */
  private async generateTaskThought(
    task: any,
    context: ThoughtContext
  ): Promise<CognitiveThought> {
    try {
      const progress = task.progress || 0;
      const steps = task.steps || [];

      let situation = `Working on task: ${task.title}. `;

      if (progress === 0) {
        situation += `Just starting, need to break down into ${steps.length} steps. `;
      } else if (progress === 1) {
        situation += `Task completed successfully. `;
      } else {
        const completedSteps = steps.filter((s: any) => s.done).length;
        const currentStep = steps.find((s: any) => !s.done);
        situation += `Progress: ${Math.round(progress * 100)}% (${completedSteps}/${steps.length} steps). `;
        if (currentStep) {
          situation += `Current step: ${currentStep.label}. `;
        }
      }

      const health = context.currentState?.health || 20;
      situation += `Health: ${health}/20. `;

      if (context.currentState?.position) {
        const pos = context.currentState.position;
        situation += `Position: (${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)}). `;
      }

      // Add environmental context for task thoughts
      const biome = context.currentState?.biome;
      if (biome) {
        situation += `In ${biome} biome. `;
      }

      situation += 'What should I focus on for this task?';

      // Add timeout wrapper to prevent hanging
      const response = await Promise.race([
        this.llm.generateInternalThought(situation, {
          currentGoals: context.currentTasks?.map((task) => task.title) || [],
          recentMemories:
            context.recentEvents?.map((event) => ({ description: event })) ||
            [],
          agentState: context.currentState,
        }),
        new Promise<never>(
          (_, reject) =>
            setTimeout(() => reject(new Error('LLM timeout')), 45000) // 45s timeout
        ),
      ]);

      return {
        id: `thought-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type:
          progress === 0
            ? 'planning'
            : progress === 1
              ? 'reflection'
              : 'observation',
        content: response.text.trim(),
        timestamp: Date.now(),
        context: {
          taskId: task.id,
          step:
            progress === 1
              ? undefined
              : steps.filter((s: any) => s.done).length,
          completed: progress === 1,
          emotionalState:
            context.emotionalState ||
            (progress === 1 ? 'satisfied' : 'focused'),
          confidence: response.confidence,
          health: context.currentState?.health,
          position: context.currentState?.position,
        },
        metadata: {
          thoughtType:
            progress === 0
              ? 'task-initiation'
              : progress === 1
                ? 'task-completion'
                : 'task-progress',
          taskType: task.type,
          priority: task.priority,
          trigger:
            progress === 0
              ? 'task-start'
              : progress === 1
                ? 'task-complete'
                : 'task-progress',
          llmConfidence: response.confidence,
          model: response.model,
        },
        category: 'task-related',
        tags: [
          progress === 0
            ? 'planning'
            : progress === 1
              ? 'completion'
              : 'progress',
          'execution',
          task.type,
        ],
        priority: 'medium',
      };
    } catch (error) {
      console.error('Failed to generate task thought with LLM:', error);

      // Fallback to basic task thought
      const progress = task.progress || 0;
      return {
        id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type:
          progress === 0
            ? 'planning'
            : progress === 1
              ? 'reflection'
              : 'observation',
        content:
          progress === 0
            ? `Starting task: ${task.title}`
            : progress === 1
              ? `Completed task: ${task.title}`
              : `Working on task: ${task.title}`,
        timestamp: Date.now(),
        context: {
          taskId: task.id,
          step:
            progress === 1
              ? undefined
              : task.steps?.filter((s: any) => s.done).length || 0,
          completed: progress === 1,
          emotionalState:
            context.emotionalState ||
            (progress === 1 ? 'satisfied' : 'focused'),
          confidence: 0.5,
          health: context.currentState?.health,
          position: context.currentState?.position,
        },
        metadata: {
          thoughtType:
            progress === 0
              ? 'task-initiation'
              : progress === 1
                ? 'task-completion'
                : 'task-progress',
          taskType: task.type,
          priority: task.priority,
          trigger:
            progress === 0
              ? 'task-start'
              : progress === 1
                ? 'task-complete'
                : 'task-progress',
          error: 'llm-generation-failed',
        },
        category: 'task-related',
        tags: [
          progress === 0
            ? 'planning'
            : progress === 1
              ? 'completion'
              : 'progress',
          'execution',
          task.type,
        ],
        priority: 'medium',
      };
    }
  }

  /**
   * Generate event-related thoughts using LLM
   */
  private async generateEventThought(
    event: any,
    context: ThoughtContext
  ): Promise<CognitiveThought> {
    try {
      const eventType = event.type;
      const eventData = event.data;

      let situation = `Experienced event: ${eventType}. `;

      if (eventData) {
        if (eventType === 'damage_taken') {
          situation += `Took ${eventData.amount} damage from ${eventData.source}. `;
        } else if (eventType === 'resource_gathered') {
          situation += `Gathered ${eventData.amount} ${eventData.resource}. `;
        } else if (eventType === 'entity_encountered') {
          situation += `Encountered ${eventData.entityType} at distance ${eventData.distance}. `;
          if (eventData.hostile) {
            situation += `Entity is hostile. `;
          }
        } else {
          situation += `Event data: ${JSON.stringify(eventData)}. `;
        }
      }

      situation += `Current health: ${context.currentState?.health || 20}/20. `;

      if (context.currentState?.position) {
        const pos = context.currentState.position;
        situation += `Position: (${pos.x}, ${pos.y}, ${pos.z}). `;
      }

      situation += 'How should I respond to this event?';

      // Add timeout wrapper to prevent hanging
      const response = await Promise.race([
        this.llm.generateInternalThought(situation, {
          currentGoals: context.currentTasks?.map((task) => task.title) || [],
          recentMemories:
            context.recentEvents?.map((event) => ({ description: event })) ||
            [],
          agentState: context.currentState,
        }),
        new Promise<never>(
          (_, reject) =>
            setTimeout(() => reject(new Error('LLM timeout')), 45000) // 45s timeout
        ),
      ]);

      return {
        id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: eventType === 'damage_taken' ? 'reflection' : 'observation',
        content: response.text.trim(),
        timestamp: Date.now(),
        context: {
          eventId: event.id,
          emotionalState: eventType === 'damage_taken' ? 'cautious' : 'alert',
          confidence: response.confidence,
          health: context.currentState?.health,
        },
        metadata: {
          thoughtType: `${eventType}-reflection`,
          eventType,
          trigger: 'event-occurred',
          llmConfidence: response.confidence,
          model: response.model,
          ...eventData,
        },
        category: eventType === 'damage_taken' ? 'survival' : 'environmental',
        tags: [
          eventType,
          eventType === 'damage_taken' ? 'safety' : 'observation',
        ],
        priority: eventType === 'damage_taken' ? 'high' : 'medium',
      };
    } catch (error) {
      console.error('Failed to generate event thought with LLM:', error);

      // Fallback to basic event thought
      const eventType = event.type;
      const eventData = event.data;

      let content = `Event: ${eventType}`;
      if (eventData) {
        if (eventType === 'damage_taken') {
          content = `Took damage from ${eventData.source}. Need to be more careful.`;
        } else if (eventType === 'resource_gathered') {
          content = `Gathered ${eventData.amount} ${eventData.resource}.`;
        } else if (eventType === 'entity_encountered') {
          content = `Encountered ${eventData.entityType}.`;
        }
      }

      return {
        id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: eventType === 'damage_taken' ? 'reflection' : 'observation',
        content,
        timestamp: Date.now(),
        context: {
          eventId: event.id,
          emotionalState: eventType === 'damage_taken' ? 'cautious' : 'alert',
          confidence: 0.6,
          health: context.currentState?.health,
        },
        metadata: {
          thoughtType: `${eventType}-reflection`,
          eventType,
          trigger: 'event-occurred',
          error: 'llm-generation-failed',
          ...eventData,
        },
        category: eventType === 'damage_taken' ? 'survival' : 'environmental',
        tags: [
          eventType,
          eventType === 'damage_taken' ? 'safety' : 'observation',
        ],
        priority: eventType === 'damage_taken' ? 'high' : 'medium',
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
   * Generate fallback thought when LLM fails
   */
  private generateFallbackThought(context: ThoughtContext): string {
    const health = context.currentState?.health || 20;
    const position = context.currentState?.position;
    const inventory = context.currentState?.inventory || [];
    const currentTasks = context.currentTasks || [];

    let thought = 'Processing current situation...';

    // Health-based thoughts
    if (health < 10) {
      thought =
        'Health is critically low. Need to prioritize survival and healing.';
    } else if (health < 15) {
      thought =
        'Health is moderate. Should consider finding food or healing items.';
    }

    // Task-based thoughts
    if (currentTasks.length > 0) {
      const task = currentTasks[0];
      thought = `Currently working on: ${task.title}. Focusing on task completion.`;
    }

    // Position-based thoughts
    if (position) {
      thought += ` Located at (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}).`;
    }

    // Inventory-based thoughts
    if (inventory.length > 0) {
      const itemCount = inventory.length;
      thought += ` Carrying ${itemCount} different items.`;
    }

    return thought;
  }

  /**
   * Get current configuration
   */
  getConfig(): EnhancedThoughtGeneratorConfig {
    return { ...this.config };
  }
}

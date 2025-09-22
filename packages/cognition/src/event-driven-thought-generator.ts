/**
 * Event-Driven Thought Generator
 *
 * Generates thoughts based on bot lifecycle events rather than rapid firing.
 * Provides contextual, meaningful self-reflection at appropriate moments.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

export interface BotLifecycleEvent {
  type:
    | 'task_completed'
    | 'task_started'
    | 'task_failed'
    | 'idle_period'
    | 'day_start'
    | 'day_end'
    | 'task_switch'
    | 'goal_achieved';
  timestamp: number;
  data: {
    taskId?: string;
    taskTitle?: string;
    previousTask?: string;
    activeTasksCount?: number;
    currentGoal?: string;
    worldState?: any;
    emotionalState?: string;
    memoryContext?: string;
  };
  context?: {
    urgency: 'low' | 'medium' | 'high';
    situation: string;
    trigger: string;
  };
}

export interface ContextualThought {
  type: 'reflection' | 'observation' | 'planning' | 'internal_dialogue';
  content: string;
  attribution: 'self';
  context: {
    emotionalState:
      | 'thoughtful'
      | 'focused'
      | 'curious'
      | 'reflective'
      | 'proactive';
    confidence: number;
    cognitiveSystem: 'event-driven';
  };
  metadata: {
    thoughtType: string;
    trigger: string;
    context: string;
    intensity: number;
    llmConfidence: number;
    eventType: string;
    eventData: any;
  };
  id: string;
  timestamp: number;
  processed: false;
}

export class EventDrivenThoughtGenerator extends EventEmitter {
  private lastThoughtTime: Map<string, number> = new Map();
  private lastTaskReflectionTime: number = 0;
  private idleThoughtCooldown: number = 300_000; // 5 minutes between idle thoughts
  private taskReflectionCooldown: number = 120_000; // 2 minutes between task reflections

  constructor() {
    super();
  }

  /**
   * Generate a contextual thought based on a bot lifecycle event
   */
  async generateThoughtForEvent(
    event: BotLifecycleEvent
  ): Promise<ContextualThought | null> {
    const now = Date.now();

    // Check cooldowns for different event types
    if (!this.shouldGenerateThought(event, now)) {
      return null;
    }

    const thought = await this.createContextualThought(event);
    if (thought) {
      this.updateLastThoughtTime(event.type, now);
      this.emit('thoughtGenerated', { thought, event });
    }

    return thought;
  }

  /**
   * Check if we should generate a thought for this event based on cooldowns
   */
  private shouldGenerateThought(
    event: BotLifecycleEvent,
    now: number
  ): boolean {
    const lastTime = this.lastThoughtTime.get(event.type) || 0;

    switch (event.type) {
      case 'task_completed':
      case 'task_failed':
      case 'goal_achieved':
        return now - lastTime > this.taskReflectionCooldown;

      case 'idle_period':
        return now - lastTime > this.idleThoughtCooldown;

      case 'task_started':
      case 'task_switch':
        // Allow these more frequently but not too rapidly
        return now - lastTime > 30_000; // 30 seconds

      case 'day_start':
      case 'day_end':
        // Always allow these
        return true;

      default:
        return true;
    }
  }

  /**
   * Create a contextual thought based on the event
   */
  private async createContextualThought(
    event: BotLifecycleEvent
  ): Promise<ContextualThought | null> {
    const baseThought = await this.generateBaseThought(event);
    if (!baseThought) return null;
    const now = Date.now();
    return {
      type: baseThought.type,
      content: baseThought.content,
      attribution: 'self',
      context: {
        emotionalState: this.getEmotionalStateForEvent(event),
        confidence: baseThought.confidence,
        cognitiveSystem: 'event-driven',
      },
      metadata: {
        thoughtType: baseThought.type,
        trigger: event.type,
        context: event.context?.situation || 'bot-lifecycle',
        intensity: this.getIntensityForEvent(event),
        llmConfidence: baseThought.confidence,
        eventType: event.type,
        eventData: event.data,
      },
      id: `thought-${now}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: now,
      processed: false,
    };
  }

  /**
   * Generate the base thought content and type
   */
  private async generateBaseThought(event: BotLifecycleEvent): Promise<{
    type: ContextualThought['type'];
    content: string;
    confidence: number;
  } | null> {
    switch (event.type) {
      case 'task_completed':
        return {
          type: 'reflection',
          content: this.generateTaskCompletionThought(event),
          confidence: 0.8,
        };

      case 'task_failed':
        return {
          type: 'internal_dialogue',
          content: this.generateTaskFailureThought(event),
          confidence: 0.7,
        };

      case 'idle_period':
        return {
          type: 'planning',
          content: this.generateIdleThought(event),
          confidence: 0.6,
        };

      case 'task_switch':
        return {
          type: 'observation',
          content: this.generateTaskSwitchThought(event),
          confidence: 0.7,
        };

      case 'day_start':
        return {
          type: 'planning',
          content: this.generateDayStartThought(event),
          confidence: 0.8,
        };

      case 'day_end':
        return {
          type: 'reflection',
          content: this.generateDayEndThought(event),
          confidence: 0.8,
        };

      default:
        return null;
    }
  }

  /**
   * Generate thought content for task completion
   */
  private generateTaskCompletionThought(event: BotLifecycleEvent): string {
    const { taskTitle, activeTasksCount } = event.data;

    if (activeTasksCount === 0) {
      return `I completed ${taskTitle}. Now I have some time to think about what to do next.`;
    } else if (activeTasksCount === 1) {
      return `Done with ${taskTitle}. I should focus on my remaining task.`;
    } else {
      return `${taskTitle} is complete. I have ${activeTasksCount} other tasks to consider.`;
    }
  }

  /**
   * Generate thought content for task failure
   */
  private generateTaskFailureThought(event: BotLifecycleEvent): string {
    const { taskTitle } = event.data;

    return `I couldn't complete ${taskTitle}. I should reflect on why that happened and adjust my approach.`;
  }

  /**
   * Generate thought content for idle periods
   */
  private generateIdleThought(event: BotLifecycleEvent): string {
    const thoughts = [
      'I have some time now. What should I work on next?',
      'I should check my progress and see if there are any resources I need.',
      "Maybe I should explore a bit and see what's around here.",
      'I could use this time to organize my thoughts and plan ahead.',
    ];

    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }

  /**
   * Generate thought content for task switching
   */
  private generateTaskSwitchThought(event: BotLifecycleEvent): string {
    const { previousTask, currentGoal } = event.data;

    if (previousTask && currentGoal) {
      return `Switching from ${previousTask} to focus on ${currentGoal}.`;
    } else if (previousTask) {
      return `Moving on from ${previousTask} to the next priority.`;
    } else {
      return `Focusing on my current goals and priorities.`;
    }
  }

  /**
   * Generate thought content for day start
   */
  private generateDayStartThought(event: BotLifecycleEvent): string {
    const thoughts = [
      'A new day begins. What should I accomplish today?',
      'I should start by assessing my current situation and resources.',
      'Time to get organized and plan my activities for today.',
      'I have a fresh start. Let me think about my priorities.',
    ];

    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }

  /**
   * Generate thought content for day end
   */
  private generateDayEndThought(event: BotLifecycleEvent): string {
    const thoughts = [
      'The day is ending. I should reflect on what I accomplished.',
      "Time to rest and process what I've learned today.",
      'I should think about my progress and what I can do better tomorrow.',
      'Another day completed. What did I learn from my experiences?',
    ];

    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }

  /**
   * Get emotional state based on event type
   */
  private getEmotionalStateForEvent(
    event: BotLifecycleEvent
  ): ContextualThought['context']['emotionalState'] {
    switch (event.type) {
      case 'task_completed':
      case 'goal_achieved':
        return 'thoughtful';
      case 'task_failed':
        return 'reflective';
      case 'idle_period':
        return 'curious';
      case 'task_switch':
        return 'focused';
      case 'day_start':
        return 'proactive';
      case 'day_end':
        return 'thoughtful';
      default:
        return 'thoughtful';
    }
  }

  /**
   * Get intensity based on event type
   */
  private getIntensityForEvent(event: BotLifecycleEvent): number {
    switch (event.type) {
      case 'task_completed':
      case 'goal_achieved':
        return 0.6; // Medium intensity reflection
      case 'task_failed':
        return 0.7; // Higher intensity for failures
      case 'idle_period':
        return 0.3; // Low intensity idle thoughts
      case 'task_switch':
        return 0.5; // Medium intensity for transitions
      case 'day_start':
      case 'day_end':
        return 0.8; // High intensity for major transitions
      default:
        return 0.5;
    }
  }

  /**
   * Update last thought time for cooldown tracking
   */
  private updateLastThoughtTime(eventType: string, timestamp: number): void {
    this.lastThoughtTime.set(eventType, timestamp);
  }

  /**
   * Get last thought time for a specific event type
   */
  getLastThoughtTime(eventType: string): number {
    return this.lastThoughtTime.get(eventType) || 0;
  }

  /**
   * Force generate a thought for a specific event (bypassing cooldowns)
   */
  async forceGenerateThought(
    event: BotLifecycleEvent
  ): Promise<ContextualThought | null> {
    const thought = await this.createContextualThought(event);
    if (thought) {
      this.updateLastThoughtTime(event.type, Date.now());
      this.emit('thoughtGenerated', { thought, event, forced: true });
    }
    return thought;
  }
}

// Export singleton instance
export const eventDrivenThoughtGenerator = new EventDrivenThoughtGenerator();

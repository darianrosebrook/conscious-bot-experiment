/**
 * Cognition Types for Planning Integration
 *
 * Exports types from cognition package for use in planning
 * @author @darianrosebrook
 */

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

export interface EventDrivenThoughtGenerator {
  generateThoughtForEvent(
    event: BotLifecycleEvent
  ): Promise<ContextualThought | null>;
  forceGenerateThought(
    event: BotLifecycleEvent
  ): Promise<ContextualThought | null>;
  getLastThoughtTime(eventType: string): number;
  on(event: string, listener: Function): void;
}

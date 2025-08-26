/**
 * Enhanced Intrusive Thought Processor
 *
 * Processes intrusive thoughts and converts them into actionable tasks
 * that actually influence bot behavior through the planning system.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

export interface Action {
  type: string;
  target: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: 'low' | 'medium' | 'high';
  source: string;
  progress: number;
  status: string;
  steps: TaskStep[];
  createdAt: number;
  updatedAt: number;
  metadata: {
    originalThought: string;
    action: Action;
    confidence: number;
  };
}

export interface TaskStep {
  id: string;
  label: string;
  done: boolean;
  order: number;
}

export interface BotResponse {
  accepted: boolean;
  response: string;
  taskId?: string;
  task?: Task;
  recorded?: boolean;
  error?: string;
}

export interface IntrusiveThoughtProcessorConfig {
  enableActionParsing: boolean;
  enableTaskCreation: boolean;
  enablePlanningIntegration: boolean;
  enableMinecraftIntegration: boolean;
  planningEndpoint: string;
  minecraftEndpoint: string;
}

const DEFAULT_CONFIG: IntrusiveThoughtProcessorConfig = {
  enableActionParsing: true,
  enableTaskCreation: true,
  enablePlanningIntegration: true,
  enableMinecraftIntegration: true,
  planningEndpoint: 'http://localhost:3002',
  minecraftEndpoint: 'http://localhost:3005',
};

/**
 * Enhanced intrusive thought processing with action parsing
 * @author @darianrosebrook
 */
export class IntrusiveThoughtProcessor extends EventEmitter {
  private config: IntrusiveThoughtProcessorConfig;

  constructor(config: Partial<IntrusiveThoughtProcessorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process an intrusive thought and convert it to actionable content
   */
  async processIntrusiveThought(thought: string): Promise<BotResponse> {
    try {
      console.log(`Processing intrusive thought: "${thought}"`);

      // Parse the thought for actionable content
      const action = this.parseActionFromThought(thought);

      if (action && this.config.enableTaskCreation) {
        // Create a new task from the intrusive thought
        const task = await this.createTaskFromThought(thought, action);

        // Update the planning system
        if (this.config.enablePlanningIntegration) {
          await this.updatePlanningSystem(task);
        }

        this.emit('taskCreated', { thought, task, action });

        return {
          accepted: true,
          response: `Processing thought: "${thought}". Creating task: ${task.title}`,
          taskId: task.id,
          task: task,
        };
      }

      // Even if no action, record the thought
      this.emit('thoughtRecorded', { thought, action: null });

      return {
        accepted: true,
        response: `Thought recorded: "${thought}". No immediate action required.`,
        recorded: true,
      };
    } catch (error) {
      console.error('Failed to process intrusive thought:', error);
      this.emit('processingError', { thought, error });

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        accepted: false,
        response: `Failed to process thought: "${thought}". Error: ${errorMessage}`,
        error: errorMessage,
      };
    }
  }

  /**
   * Parse actionable content from a thought
   */
  private parseActionFromThought(thought: string): Action | null {
    const actionPatterns = {
      craft: {
        pattern: /craft\s+(.+)/i,
        priority: 'high' as const,
        category: 'crafting',
      },
      mine: {
        pattern: /mine\s+(.+)/i,
        priority: 'medium' as const,
        category: 'mining',
      },
      explore: {
        pattern: /explore\s+(.+)/i,
        priority: 'medium' as const,
        category: 'exploration',
      },
      build: {
        pattern: /build\s+(.+)/i,
        priority: 'high' as const,
        category: 'building',
      },
      gather: {
        pattern: /gather\s+(.+)/i,
        priority: 'medium' as const,
        category: 'gathering',
      },
      find: {
        pattern: /find\s+(.+)/i,
        priority: 'medium' as const,
        category: 'search',
      },
      go: {
        pattern: /go\s+(.+)/i,
        priority: 'medium' as const,
        category: 'movement',
      },
      move: {
        pattern: /move\s+(.+)/i,
        priority: 'medium' as const,
        category: 'movement',
      },
      collect: {
        pattern: /collect\s+(.+)/i,
        priority: 'medium' as const,
        category: 'gathering',
      },
      search: {
        pattern: /search\s+(.+)/i,
        priority: 'medium' as const,
        category: 'search',
      },
      create: {
        pattern: /create\s+(.+)/i,
        priority: 'high' as const,
        category: 'crafting',
      },
      make: {
        pattern: /make\s+(.+)/i,
        priority: 'high' as const,
        category: 'crafting',
      },
      dig: {
        pattern: /dig\s+(.+)/i,
        priority: 'medium' as const,
        category: 'mining',
      },
      chop: {
        pattern: /chop\s+(.+)/i,
        priority: 'medium' as const,
        category: 'gathering',
      },
      cut: {
        pattern: /cut\s+(.+)/i,
        priority: 'medium' as const,
        category: 'gathering',
      },
      place: {
        pattern: /place\s+(.+)/i,
        priority: 'medium' as const,
        category: 'building',
      },
      put: {
        pattern: /put\s+(.+)/i,
        priority: 'medium' as const,
        category: 'building',
      },
    };

    for (const [actionType, config] of Object.entries(actionPatterns)) {
      const match = thought.match(config.pattern);
      if (match) {
        return {
          type: actionType,
          target: match[1].trim(),
          priority: config.priority,
          category: config.category,
        };
      }
    }

    return null;
  }

  /**
   * Create a task from an intrusive thought and action
   */
  private async createTaskFromThought(
    thought: string,
    action: Action
  ): Promise<Task> {
    const taskTitle = this.generateTaskTitle(action);
    const taskDescription = this.generateTaskDescription(action, thought);

    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: taskTitle,
      description: taskDescription,
      type: action.category,
      priority: action.priority,
      source: 'intrusive-thought',
      progress: 0,
      status: 'active',
      steps: this.generateTaskSteps(action),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        originalThought: thought,
        action: action,
        confidence: 0.7,
      },
    };

    return task;
  }

  /**
   * Generate a task title from an action
   */
  private generateTaskTitle(action: Action): string {
    const titles: Record<string, string> = {
      craft: `Craft ${action.target}`,
      mine: `Mine ${action.target}`,
      explore: `Explore ${action.target}`,
      build: `Build ${action.target}`,
      gather: `Gather ${action.target}`,
      find: `Find ${action.target}`,
      go: `Go to ${action.target}`,
      move: `Move ${action.target}`,
      collect: `Collect ${action.target}`,
      search: `Search for ${action.target}`,
      create: `Create ${action.target}`,
      make: `Make ${action.target}`,
      dig: `Dig ${action.target}`,
      chop: `Chop ${action.target}`,
      cut: `Cut ${action.target}`,
      place: `Place ${action.target}`,
      put: `Put ${action.target}`,
    };

    return titles[action.type] || `Perform ${action.type} on ${action.target}`;
  }

  /**
   * Generate a task description from an action and original thought
   */
  private generateTaskDescription(
    action: Action,
    originalThought: string
  ): string {
    return `Task created from intrusive thought: "${originalThought}". ${action.type} ${action.target}.`;
  }

  /**
   * Generate task steps for an action
   */
  private generateTaskSteps(action: Action): TaskStep[] {
    const baseSteps = [
      {
        id: `step-${Date.now()}-1`,
        label: `Prepare for ${action.type}`,
        done: false,
        order: 1,
      },
      {
        id: `step-${Date.now()}-2`,
        label: `Locate ${action.target}`,
        done: false,
        order: 2,
      },
      {
        id: `step-${Date.now()}-3`,
        label: `Perform ${action.type} on ${action.target}`,
        done: false,
        order: 3,
      },
      {
        id: `step-${Date.now()}-4`,
        label: `Complete ${action.type} task`,
        done: false,
        order: 4,
      },
    ];

    return baseSteps;
  }

  /**
   * Update the planning system with a new task
   */
  private async updatePlanningSystem(task: Task): Promise<void> {
    try {
      const response = await fetch(`${this.config.planningEndpoint}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          type: task.type,
          priority: task.priority,
          source: task.source,
          steps: task.steps,
          metadata: task.metadata,
        }),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Planning system responded with ${response.status}`);
      }

      const result = await response.json();
      console.log(`Task created in planning system:`, result);

      this.emit('planningSystemUpdated', { task, result });
    } catch (error) {
      console.error('Failed to update planning system:', error);
      this.emit('planningSystemError', { task, error });
      throw error;
    }
  }

  /**
   * Execute a direct action on the Minecraft bot
   */
  async executeDirectAction(action: Action): Promise<BotResponse> {
    try {
      const response = await fetch(`${this.config.minecraftEndpoint}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: action.type,
          parameters: {
            target: action.target,
            priority: action.priority,
          },
        }),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Minecraft bot responded with ${response.status}`);
      }

      const result = await response.json();
      console.log(`Direct action executed:`, result);

      this.emit('directActionExecuted', { action, result });

      return {
        accepted: true,
        response: `Direct action executed: ${action.type} ${action.target}`,
        taskId: (result as any).taskId,
      };
    } catch (error) {
      console.error('Failed to execute direct action:', error);
      this.emit('directActionError', { action, error });

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        accepted: false,
        response: `Failed to execute action: ${action.type} ${action.target}. Error: ${errorMessage}`,
        error: errorMessage,
      };
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<IntrusiveThoughtProcessorConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): IntrusiveThoughtProcessorConfig {
    return { ...this.config };
  }
}

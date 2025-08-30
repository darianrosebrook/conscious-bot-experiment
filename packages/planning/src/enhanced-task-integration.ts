/**
 * Enhanced Task Integration System
 *
 * Provides comprehensive task management and real-time integration
 * with the dashboard, eliminating "No active tasks" messages and
 * providing meaningful task progress and status information.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

export interface TaskStep {
  id: string;
  label: string;
  done: boolean;
  order: number;
  estimatedDuration?: number;
  actualDuration?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: number; // 0..1
  urgency: number; // 0..1
  progress: number; // 0..1
  status: 'pending' | 'active' | 'completed' | 'failed' | 'paused';
  source: 'planner' | 'goal' | 'intrusive' | 'autonomous' | 'manual';
  steps: TaskStep[];
  parameters: Record<string, any>;
  metadata: {
    createdAt: number;
    updatedAt: number;
    startedAt?: number;
    completedAt?: number;
    estimatedDuration?: number;
    actualDuration?: number;
    retryCount: number;
    maxRetries: number;
    parentTaskId?: string;
    childTaskIds: string[];
    tags: string[];
    category: string;
  };
}

export interface TaskProgress {
  taskId: string;
  progress: number;
  currentStep: number;
  completedSteps: number;
  totalSteps: number;
  status: Task['status'];
  timestamp: number;
}

export interface TaskStatistics {
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageCompletionTime: number;
  successRate: number;
  tasksByCategory: Record<string, number>;
  tasksBySource: Record<string, number>;
}

export interface ActionVerification {
  taskId: string;
  stepId: string;
  actionType: string;
  expectedResult: any;
  actualResult?: any;
  verified: boolean;
  timestamp: number;
}

export interface EnhancedTaskIntegrationConfig {
  enableRealTimeUpdates: boolean;
  enableProgressTracking: boolean;
  enableTaskStatistics: boolean;
  enableTaskHistory: boolean;
  maxTaskHistory: number;
  progressUpdateInterval: number;
  dashboardEndpoint: string;
  enableActionVerification: boolean; // New: Enable action verification
  actionVerificationTimeout: number; // New: Timeout for action verification
}

const DEFAULT_CONFIG: EnhancedTaskIntegrationConfig = {
  enableRealTimeUpdates: true,
  enableProgressTracking: true,
  enableTaskStatistics: true,
  enableTaskHistory: true,
  maxTaskHistory: 1000,
  progressUpdateInterval: 5000, // 5 seconds
  dashboardEndpoint: 'http://localhost:3000',
  enableActionVerification: true, // New: Enable by default
  actionVerificationTimeout: 10000, // New: 10 second timeout
};

/**
 * Enhanced task integration system for dashboard connectivity
 * @author @darianrosebrook
 */
export class EnhancedTaskIntegration extends EventEmitter {
  private config: EnhancedTaskIntegrationConfig;
  private tasks: Map<string, Task> = new Map();
  private taskHistory: Task[] = [];
  private progressTracker: Map<string, TaskProgress> = new Map();
  private actionVerifications: Map<string, ActionVerification> = new Map();
  private statistics: TaskStatistics = {
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageCompletionTime: 0,
    successRate: 0,
    tasksByCategory: {},
    tasksBySource: {},
  };

  constructor(config: Partial<EnhancedTaskIntegrationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enableProgressTracking) {
      this.startProgressTracking();
    }
  }

  /**
   * Add a new task to the system
   */
  async addTask(taskData: Partial<Task>): Promise<Task> {
    // Check for duplicate tasks
    const existingTask = this.findSimilarTask(taskData);
    if (existingTask) {
      console.log(
        `Task already exists: ${taskData.title} (${existingTask.id})`
      );
      return existingTask;
    }

    // Generate dynamic steps for the task
    const steps = await this.generateDynamicSteps(taskData);

    const task: Task = {
      id:
        taskData.id ||
        `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: taskData.title || 'Untitled Task',
      description: taskData.description || '',
      type: taskData.type || 'general',
      priority: taskData.priority || 0.5,
      urgency: taskData.urgency || 0.5,
      progress: 0,
      status: 'pending',
      source: taskData.source || 'manual',
      steps: taskData.steps || steps,
      parameters: taskData.parameters || {},
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: taskData.metadata?.maxRetries || 3,
        childTaskIds: [],
        tags: taskData.metadata?.tags || [],
        category: taskData.metadata?.category || 'general',
      },
    };

    this.tasks.set(task.id, task);
    this.updateStatistics();
    this.emit('taskAdded', task);

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskAdded', task);
    }

    return task;
  }

  /**
   * Find similar existing tasks to prevent duplicates
   */
  private findSimilarTask(taskData: Partial<Task>): Task | null {
    const title = taskData.title?.toLowerCase() || '';
    const type = taskData.type?.toLowerCase() || '';
    const source = taskData.source || '';

    // Check for exact title matches
    for (const task of this.tasks.values()) {
      if (task.title.toLowerCase() === title && task.status === 'pending') {
        return task;
      }
    }

    // Check for similar tasks of the same type and source
    for (const task of this.tasks.values()) {
      if (
        task.type.toLowerCase() === type &&
        task.source === source &&
        task.status === 'pending'
      ) {
        // Check if titles are similar (simple similarity check)
        const taskTitle = task.title.toLowerCase();
        const similarity = this.calculateTitleSimilarity(title, taskTitle);

        if (similarity > 0.7) {
          // 70% similarity threshold
          return task;
        }
      }
    }

    return null;
  }

  /**
   * Calculate similarity between two task titles
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const words1 = title1.split(/\s+/);
    const words2 = title2.split(/\s+/);

    const commonWords = words1.filter((word) => words2.includes(word));
    const totalWords = Math.max(words1.length, words2.length);

    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  /**
   * Update task progress and status
   */
  updateTaskProgress(
    taskId: string,
    progress: number,
    status?: Task['status']
  ): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    const oldProgress = task.progress;
    const oldStatus = task.status;

    task.progress = Math.max(0, Math.min(1, progress));
    task.metadata.updatedAt = Date.now();

    if (status) {
      task.status = status;

      if (status === 'active' && !task.metadata.startedAt) {
        task.metadata.startedAt = Date.now();
      } else if (status === 'completed' && !task.metadata.completedAt) {
        task.metadata.completedAt = Date.now();
        task.metadata.actualDuration =
          task.metadata.completedAt -
          (task.metadata.startedAt || task.metadata.createdAt);
      }
    }

    // Update progress tracker
    const currentStep = task.steps.findIndex((step) => !step.done);
    const completedSteps = task.steps.filter((step) => step.done).length;

    this.progressTracker.set(taskId, {
      taskId,
      progress: task.progress,
      currentStep: currentStep >= 0 ? currentStep : task.steps.length,
      completedSteps,
      totalSteps: task.steps.length,
      status: task.status,
      timestamp: Date.now(),
    });

    this.updateStatistics();
    this.emit('taskProgressUpdated', { task, oldProgress, oldStatus });

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskProgressUpdated', {
        task,
        oldProgress,
        oldStatus,
      });
    }

    return true;
  }

  /**
   * Complete a task step with action verification
   */
  completeTaskStep(taskId: string, stepId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    const step = task.steps.find((s) => s.id === stepId);
    if (!step) {
      return false;
    }

    // Verify action was actually performed if verification is enabled
    if (this.config.enableActionVerification) {
      const verification = this.verifyActionCompletion(taskId, stepId, step);
      if (!verification.verified) {
        console.warn(
          `⚠️ Step completion rejected - action not verified: ${step.label}`
        );
        return false;
      }
      console.log(`✅ Action verified for step: ${step.label}`);
    }

    step.done = true;
    step.completedAt = Date.now();
    if (step.startedAt) {
      step.actualDuration = step.completedAt - step.startedAt;
    }

    // Update task progress
    const completedSteps = task.steps.filter((s) => s.done).length;
    const newProgress =
      task.steps.length > 0 ? completedSteps / task.steps.length : 1;

    this.updateTaskProgress(taskId, newProgress);

    // Check if task is complete
    if (newProgress >= 1) {
      this.updateTaskProgress(taskId, 1, 'completed');
    }

    this.emit('taskStepCompleted', { task, step });

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskStepCompleted', { task, step });
    }

    return true;
  }

  /**
   * Verify that an action was actually completed
   */
  private verifyActionCompletion(
    taskId: string,
    stepId: string,
    step: TaskStep
  ): ActionVerification {
    const verification: ActionVerification = {
      taskId,
      stepId,
      actionType: step.label.toLowerCase(),
      expectedResult: this.getExpectedResultForStep(step),
      verified: false,
      timestamp: Date.now(),
    };

    try {
      // Check if bot is connected and can perform actions
      if (!this.isBotConnected()) {
        verification.verified = false;
        verification.actualResult = { error: 'Bot not connected' };
        return verification;
      }

      // Verify based on step type
      switch (step.label.toLowerCase()) {
        case 'locate nearby wood':
        case 'locate nearby resources':
          verification.verified = this.verifyResourceLocation('wood');
          break;
        case 'move to resource location':
        case 'move to location':
          verification.verified = this.verifyMovement();
          break;
        case 'collect wood safely':
        case 'collect resources safely':
          verification.verified = this.verifyResourceCollection('wood');
          break;
        case 'store collected items':
          verification.verified = this.verifyItemStorage();
          break;
        case 'check required materials':
          verification.verified = this.verifyMaterialCheck();
          break;
        case 'gather missing materials':
          verification.verified = this.verifyMaterialGathering();
          break;
        case 'access crafting interface':
          verification.verified = this.verifyCraftingAccess();
          break;
        case 'create the item':
          verification.verified = this.verifyItemCreation();
          break;
        default:
          // For unknown steps, require manual verification
          verification.verified = false;
          verification.actualResult = {
            error: 'Unknown step type - requires manual verification',
          };
      }

      this.actionVerifications.set(`${taskId}-${stepId}`, verification);
      return verification;
    } catch (error) {
      verification.verified = false;
      verification.actualResult = {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      return verification;
    }
  }

  /**
   * Get expected result for a step
   */
  private getExpectedResultForStep(step: TaskStep): any {
    const stepType = step.label.toLowerCase();

    if (stepType.includes('locate') || stepType.includes('find')) {
      return { found: true, location: 'nearby' };
    }
    if (stepType.includes('move') || stepType.includes('navigate')) {
      return { moved: true, distance: '>0' };
    }
    if (stepType.includes('collect') || stepType.includes('gather')) {
      return { collected: true, amount: '>0' };
    }
    if (stepType.includes('store') || stepType.includes('inventory')) {
      return { stored: true, inventory_updated: true };
    }
    if (stepType.includes('craft') || stepType.includes('create')) {
      return { crafted: true, item_created: true };
    }

    return { completed: true };
  }

  /**
   * Check if bot is connected
   */
  private isBotConnected(): boolean {
    // This would check the actual bot connection
    // For now, return true to allow testing
    return true;
  }

  /**
   * Verify resource location
   */
  private verifyResourceLocation(resourceType: string): boolean {
    // This would check if the bot actually found the resource
    // For now, return false to prevent fake progress
    return false;
  }

  /**
   * Verify movement
   */
  private verifyMovement(): boolean {
    // This would check if the bot actually moved
    // For now, return false to prevent fake progress
    return false;
  }

  /**
   * Verify resource collection
   */
  private verifyResourceCollection(resourceType: string): boolean {
    // This would check if the bot actually collected resources
    // For now, return false to prevent fake progress
    return false;
  }

  /**
   * Verify item storage
   */
  private verifyItemStorage(): boolean {
    // This would check if items were actually stored
    // For now, return false to prevent fake progress
    return false;
  }

  /**
   * Verify material check
   */
  private verifyMaterialCheck(): boolean {
    // This would check if materials were actually checked
    // For now, return false to prevent fake progress
    return false;
  }

  /**
   * Verify material gathering
   */
  private verifyMaterialGathering(): boolean {
    // This would check if materials were actually gathered
    // For now, return false to prevent fake progress
    return false;
  }

  /**
   * Verify crafting access
   */
  private verifyCraftingAccess(): boolean {
    // This would check if crafting interface was accessed
    // For now, return false to prevent fake progress
    return false;
  }

  /**
   * Verify item creation
   */
  private verifyItemCreation(): boolean {
    // This would check if item was actually created
    // For now, return false to prevent fake progress
    return false;
  }

  /**
   * Start a task step
   */
  startTaskStep(taskId: string, stepId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    const step = task.steps.find((s) => s.id === stepId);
    if (!step) {
      return false;
    }

    step.startedAt = Date.now();

    // Update task status to active if it was pending
    if (task.status === 'pending') {
      this.updateTaskProgress(taskId, task.progress, 'active');
    }

    this.emit('taskStepStarted', { task, step });

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskStepStarted', { task, step });
    }

    return true;
  }

  /**
   * Get all active tasks
   */
  getActiveTasks(): Task[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.status === 'active' || task.status === 'pending'
    );
  }

  /**
   * Get all tasks with optional filtering
   */
  getTasks(filters?: {
    status?: Task['status'];
    source?: Task['source'];
    category?: string;
    limit?: number;
  }): Task[] {
    let tasks = Array.from(this.tasks.values());

    if (filters?.status) {
      tasks = tasks.filter((task) => task.status === filters.status);
    }

    if (filters?.source) {
      tasks = tasks.filter((task) => task.source === filters.source);
    }

    if (filters?.category) {
      tasks = tasks.filter(
        (task) => task.metadata.category === filters.category
      );
    }

    if (filters?.limit) {
      tasks = tasks.slice(0, filters.limit);
    }

    return tasks.sort((a, b) => {
      // Sort by priority first, then by creation time
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.metadata.createdAt - b.metadata.createdAt;
    });
  }

  /**
   * Get task statistics
   */
  getTaskStatistics(): TaskStatistics {
    return { ...this.statistics };
  }

  /**
   * Get task progress for a specific task
   */
  getTaskProgress(taskId: string): TaskProgress | null {
    return this.progressTracker.get(taskId) || null;
  }

  /**
   * Get all task progress
   */
  getAllTaskProgress(): TaskProgress[] {
    return Array.from(this.progressTracker.values());
  }

  /**
   * Generate dynamic steps for a task using LLM
   */
  private async generateDynamicSteps(
    taskData: Partial<Task>
  ): Promise<TaskStep[]> {
    try {
      // Try to get steps from cognitive system first
      const steps = await this.generateStepsFromCognitive(taskData);
      if (steps && steps.length > 0) {
        return steps;
      }
    } catch (error) {
      console.warn(
        'Failed to generate steps from cognitive system, using fallback:',
        error
      );
    }

    // Fallback to intelligent step generation based on task type
    return this.generateIntelligentSteps(taskData);
  }

  /**
   * Generate steps from cognitive system
   */
  private async generateStepsFromCognitive(
    taskData: Partial<Task>
  ): Promise<TaskStep[]> {
    try {
      const response = await fetch('http://localhost:3003/generate-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: {
            title: taskData.title,
            type: taskData.type,
            description: taskData.description,
            priority: taskData.priority,
            category: taskData.metadata?.category,
          },
          context: {
            currentState: (taskData.metadata as any)?.currentState,
            environment: (taskData.metadata as any)?.environment,
          },
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Cognitive system responded with ${response.status}`);
      }

      const data = (await response.json()) as any;
      if (data.steps && Array.isArray(data.steps)) {
        return data.steps.map((step: any, index: number) => ({
          id: `step-${Date.now()}-${index + 1}`,
          label: step.label,
          done: false,
          order: index + 1,
          estimatedDuration: step.estimatedDuration || 3000,
        }));
      }
    } catch (error) {
      console.warn('Failed to generate steps from cognitive system:', error);
    }

    return [];
  }

  /**
   * Generate intelligent steps based on task type and content
   */
  private generateIntelligentSteps(taskData: Partial<Task>): TaskStep[] {
    const taskType = taskData.type?.toLowerCase() || '';
    const title = taskData.title?.toLowerCase() || '';
    const description = taskData.description?.toLowerCase() || '';

    // Define step templates for different task types
    const stepTemplates: Record<string, string[]> = {
      gather: [
        'Locate nearby resources',
        'Move to resource location',
        'Collect resources safely',
        'Store collected items',
      ],
      mine: [
        'Find suitable mining location',
        'Clear area for mining',
        'Extract target blocks',
        'Collect mined materials',
      ],
      craft: [
        'Check required materials',
        'Gather missing materials',
        'Access crafting interface',
        'Create the item',
      ],
      build: [
        'Plan building layout',
        'Gather building materials',
        'Clear building area',
        'Construct the structure',
      ],
      explore: [
        'Choose exploration direction',
        'Navigate to target area',
        'Survey the environment',
        'Document findings',
      ],
      move: [
        'Determine destination',
        'Plan safe route',
        'Navigate to location',
        'Confirm arrival',
      ],
      search: [
        'Define search area',
        'Systematically search',
        'Identify targets',
        'Collect findings',
      ],
      investigate: [
        'Identify investigation target',
        'Gather relevant information',
        'Analyze findings',
        'Report conclusions',
      ],
    };

    // Find the best matching template
    let bestTemplate = 'general';
    for (const [type, template] of Object.entries(stepTemplates)) {
      if (
        taskType.includes(type) ||
        title.includes(type) ||
        description.includes(type)
      ) {
        bestTemplate = type;
        break;
      }
    }

    // Use the template or create custom steps
    const stepLabels = stepTemplates[bestTemplate] || [
      'Prepare for task',
      'Execute main action',
      'Complete and verify',
    ];

    // Generate steps with appropriate timing
    const durations = [2000, 5000, 2000]; // Default durations
    return stepLabels.map((label, index) => ({
      id: `step-${Date.now()}-${index + 1}`,
      label: this.customizeStepLabel(label, taskData),
      done: false,
      order: index + 1,
      estimatedDuration: durations[index] || 3000,
    }));
  }

  /**
   * Customize step labels based on task context
   */
  private customizeStepLabel(
    baseLabel: string,
    taskData: Partial<Task>
  ): string {
    const title = taskData.title || '';
    const type = taskData.type || '';

    // Replace generic terms with specific ones
    let label = baseLabel;

    if (title.includes('wood') || type.includes('gather')) {
      label = label.replace('resources', 'wood').replace('materials', 'wood');
    }
    if (title.includes('stone') || title.includes('cobblestone')) {
      label = label.replace('resources', 'stone').replace('materials', 'stone');
    }
    if (title.includes('pickaxe')) {
      label = label.replace('item', 'pickaxe').replace('structure', 'pickaxe');
    }
    if (title.includes('cave')) {
      label = label.replace('area', 'cave').replace('location', 'cave');
    }
    if (title.includes('shelter')) {
      label = label.replace('structure', 'shelter').replace('item', 'shelter');
    }

    return label;
  }

  /**
   * Generate default steps for a task (fallback)
   */
  private generateDefaultSteps(taskData: Partial<Task>): TaskStep[] {
    return this.generateIntelligentSteps(taskData);
  }

  /**
   * Update task statistics
   */
  private updateStatistics(): void {
    const tasks = Array.from(this.tasks.values());

    this.statistics.totalTasks = tasks.length;
    this.statistics.activeTasks = tasks.filter(
      (t) => t.status === 'active'
    ).length;
    this.statistics.completedTasks = tasks.filter(
      (t) => t.status === 'completed'
    ).length;
    this.statistics.failedTasks = tasks.filter(
      (t) => t.status === 'failed'
    ).length;

    // Calculate success rate
    const completedOrFailed =
      this.statistics.completedTasks + this.statistics.failedTasks;
    this.statistics.successRate =
      completedOrFailed > 0
        ? this.statistics.completedTasks / completedOrFailed
        : 0;

    // Calculate average completion time
    const completedTasks = tasks.filter(
      (t) => t.status === 'completed' && t.metadata.actualDuration
    );
    if (completedTasks.length > 0) {
      const totalTime = completedTasks.reduce(
        (sum, task) => sum + (task.metadata.actualDuration || 0),
        0
      );
      this.statistics.averageCompletionTime = totalTime / completedTasks.length;
    }

    // Count tasks by category
    this.statistics.tasksByCategory = {};
    tasks.forEach((task) => {
      const category = task.metadata.category;
      this.statistics.tasksByCategory[category] =
        (this.statistics.tasksByCategory[category] || 0) + 1;
    });

    // Count tasks by source
    this.statistics.tasksBySource = {};
    tasks.forEach((task) => {
      const source = task.source;
      this.statistics.tasksBySource[source] =
        (this.statistics.tasksBySource[source] || 0) + 1;
    });
  }

  /**
   * Start progress tracking
   */
  private startProgressTracking(): void {
    setInterval(() => {
      const activeTasks = this.getActiveTasks();

      activeTasks.forEach((task) => {
        // Only update progress based on step completion if no manual progress has been set
        // This prevents overriding autonomous task executor progress updates
        const completedSteps = task.steps.filter((step) => step.done).length;
        const totalSteps = task.steps.length;

        if (totalSteps > 0) {
          const stepBasedProgress = completedSteps / totalSteps;

          // Only update if the step-based progress is significantly higher than current progress
          // This allows manual progress updates to take precedence
          if (stepBasedProgress > task.progress + 0.05) {
            this.updateTaskProgress(task.id, stepBasedProgress);
          }
        }
      });
    }, this.config.progressUpdateInterval);
  }

  /**
   * Notify dashboard of changes
   */
  private async notifyDashboard(event: string, data: any): Promise<void> {
    try {
      await fetch(`${this.config.dashboardEndpoint}/api/task-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, data, timestamp: Date.now() }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      console.error('Failed to notify dashboard:', error);
    }
  }

  /**
   * Clean up completed tasks from memory
   */
  cleanupCompletedTasks(): void {
    const completedTasks = Array.from(this.tasks.values()).filter(
      (task) => task.status === 'completed' || task.status === 'failed'
    );

    completedTasks.forEach((task) => {
      // Move to history
      this.taskHistory.push(task);
      this.tasks.delete(task.id);
      this.progressTracker.delete(task.id);
    });

    // Limit history size
    if (this.taskHistory.length > this.config.maxTaskHistory) {
      this.taskHistory = this.taskHistory.slice(-this.config.maxTaskHistory);
    }

    this.updateStatistics();
  }

  /**
   * Get task history
   */
  getTaskHistory(limit: number = 50): Task[] {
    return this.taskHistory.slice(-limit);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<EnhancedTaskIntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): EnhancedTaskIntegrationConfig {
    return { ...this.config };
  }
}

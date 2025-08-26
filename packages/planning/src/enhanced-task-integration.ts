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

export interface EnhancedTaskIntegrationConfig {
  enableRealTimeUpdates: boolean;
  enableProgressTracking: boolean;
  enableTaskStatistics: boolean;
  enableTaskHistory: boolean;
  maxTaskHistory: number;
  progressUpdateInterval: number;
  dashboardEndpoint: string;
}

const DEFAULT_CONFIG: EnhancedTaskIntegrationConfig = {
  enableRealTimeUpdates: true,
  enableProgressTracking: true,
  enableTaskStatistics: true,
  enableTaskHistory: true,
  maxTaskHistory: 1000,
  progressUpdateInterval: 5000, // 5 seconds
  dashboardEndpoint: 'http://localhost:3000',
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
  addTask(taskData: Partial<Task>): Task {
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
      steps: taskData.steps || this.generateDefaultSteps(taskData),
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
   * Complete a task step
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
   * Generate default steps for a task
   */
  private generateDefaultSteps(taskData: Partial<Task>): TaskStep[] {
    const steps: TaskStep[] = [
      {
        id: `step-${Date.now()}-1`,
        label: `Prepare for ${taskData.type || 'task'}`,
        done: false,
        order: 1,
        estimatedDuration: 2000,
      },
      {
        id: `step-${Date.now()}-2`,
        label: `Execute ${taskData.type || 'task'}`,
        done: false,
        order: 2,
        estimatedDuration: 5000,
      },
      {
        id: `step-${Date.now()}-3`,
        label: `Complete ${taskData.type || 'task'}`,
        done: false,
        order: 3,
        estimatedDuration: 1000,
      },
    ];

    return steps;
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
        // Update progress based on step completion
        const completedSteps = task.steps.filter((step) => step.done).length;
        const totalSteps = task.steps.length;

        if (totalSteps > 0) {
          const newProgress = completedSteps / totalSteps;
          if (Math.abs(newProgress - task.progress) > 0.01) {
            this.updateTaskProgress(task.id, newProgress);
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

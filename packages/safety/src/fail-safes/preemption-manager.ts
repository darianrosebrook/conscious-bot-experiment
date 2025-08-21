/**
 * Preemption Manager - Priority-Based Task Scheduling and Resource Management
 *
 * Implements preemption hierarchy to ensure time-critical operations take priority
 * @author @darianrosebrook
 */

import { EventEmitter } from 'eventemitter3';
import {
  Task,
  PreemptionPriority,
  ExecutionGrant,
  PreemptionEvent,
  validateTask,
  validateExecutionGrant,
} from './types';

/**
 * Resource allocation tracker
 */
interface ResourceAllocation {
  cpu: number; // 0-1
  memory: number; // bytes
  network: boolean;
  storage: boolean;
}

/**
 * Running task manager
 */
class RunningTaskManager {
  private runningTasks: Map<string, Task>;
  private taskGrants: Map<string, ExecutionGrant>;
  private resourceUsage: ResourceAllocation;

  constructor() {
    this.runningTasks = new Map();
    this.taskGrants = new Map();
    this.resourceUsage = {
      cpu: 0,
      memory: 0,
      network: false,
      storage: false,
    };
  }

  /**
   * Add running task
   */
  addTask(task: Task, grant: ExecutionGrant): void {
    this.runningTasks.set(task.taskId, { ...task, startedAt: Date.now() });
    this.taskGrants.set(task.taskId, grant);
    this.updateResourceUsage();
  }

  /**
   * Remove running task
   */
  removeTask(taskId: string): Task | null {
    const task = this.runningTasks.get(taskId);
    if (task) {
      this.runningTasks.delete(taskId);
      this.taskGrants.delete(taskId);
      this.updateResourceUsage();
    }
    return task || null;
  }

  /**
   * Get all running tasks
   */
  getAllTasks(): Task[] {
    return Array.from(this.runningTasks.values());
  }

  /**
   * Get tasks by priority level
   */
  getTasksByPriority(priority: PreemptionPriority): Task[] {
    return this.getAllTasks().filter(task => task.priority === priority);
  }

  /**
   * Get tasks lower than priority
   */
  getTasksLowerThan(priority: PreemptionPriority): Task[] {
    return this.getAllTasks().filter(task => task.priority > priority);
  }

  /**
   * Get current resource usage
   */
  getCurrentResourceUsage(): ResourceAllocation {
    return { ...this.resourceUsage };
  }

  /**
   * Check if resources are available
   */
  canAllocateResources(required: ResourceAllocation): boolean {
    return (
      this.resourceUsage.cpu + required.cpu <= 1.0 &&
      this.resourceUsage.memory + required.memory <= this.getMaxMemory() &&
      (!required.network || !this.resourceUsage.network) &&
      (!required.storage || !this.resourceUsage.storage)
    );
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): Task | null {
    return this.runningTasks.get(taskId) || null;
  }

  /**
   * Get grant by task ID
   */
  getGrant(taskId: string): ExecutionGrant | null {
    return this.taskGrants.get(taskId) || null;
  }

  private updateResourceUsage(): void {
    this.resourceUsage = {
      cpu: 0,
      memory: 0,
      network: false,
      storage: false,
    };

    for (const task of this.runningTasks.values()) {
      this.resourceUsage.cpu += task.resourceRequirements.cpu;
      this.resourceUsage.memory += task.resourceRequirements.memory;
      this.resourceUsage.network = this.resourceUsage.network || task.resourceRequirements.network;
      this.resourceUsage.storage = this.resourceUsage.storage || task.resourceRequirements.storage;
    }
  }

  private getMaxMemory(): number {
    // In a real implementation, this would query actual system memory
    return 2 * 1024 * 1024 * 1024; // 2GB
  }
}

/**
 * Preemption policy manager
 */
class PreemptionPolicy {
  private maxPreemptionDepth: number;
  private overheadBudgetMs: number;
  private restorationDelayMs: number;

  constructor(
    maxPreemptionDepth: number = 3,
    overheadBudgetMs: number = 5,
    restorationDelayMs: number = 100
  ) {
    this.maxPreemptionDepth = maxPreemptionDepth;
    this.overheadBudgetMs = overheadBudgetMs;
    this.restorationDelayMs = restorationDelayMs;
  }

  /**
   * Check if task can be preempted
   */
  canPreempt(task: Task, incomingPriority: PreemptionPriority): boolean {
    // Cannot preempt higher or equal priority tasks
    if (task.priority <= incomingPriority) {
      return false;
    }

    // Check if task is marked as non-preemptable
    if (!task.preemptable) {
      return false;
    }

    // Safety reflexes cannot be preempted
    if (task.priority === PreemptionPriority.SAFETY_REFLEX) {
      return false;
    }

    return true;
  }

  /**
   * Calculate preemption overhead
   */
  calculatePreemptionOverhead(
    preemptedTasks: Task[],
    incomingTask: Task
  ): number {
    // Base overhead for context switching
    let overhead = this.overheadBudgetMs;

    // Additional overhead per preempted task
    overhead += preemptedTasks.length * 2;

    // Additional overhead for complex tasks
    if (incomingTask.resourceRequirements.cpu > 0.5) {
      overhead += 3;
    }

    return overhead;
  }

  /**
   * Check if preemption is worth the overhead
   */
  isPreemptionWorthwhile(
    incomingTask: Task,
    preemptedTasks: Task[],
    overhead: number
  ): boolean {
    // Always allow safety reflexes
    if (incomingTask.priority === PreemptionPriority.SAFETY_REFLEX) {
      return true;
    }

    // Emergency protocols are usually worth it
    if (incomingTask.priority === PreemptionPriority.EMERGENCY_PROTOCOL) {
      return overhead < 20; // Allow up to 20ms overhead
    }

    // For other tasks, check if overhead is reasonable
    const estimatedBenefit = this.calculatePreemptionBenefit(incomingTask, preemptedTasks);
    return estimatedBenefit > overhead;
  }

  private calculatePreemptionBenefit(incomingTask: Task, preemptedTasks: Task[]): number {
    // Simple heuristic: benefit is proportional to priority difference
    const priorityGap = Math.max(...preemptedTasks.map(t => t.priority)) - incomingTask.priority;
    return priorityGap * 10; // 10ms benefit per priority level
  }

  getRestorationDelayMs(): number {
    return this.restorationDelayMs;
  }

  getMaxPreemptionDepth(): number {
    return this.maxPreemptionDepth;
  }
}

/**
 * Preempted task queue
 */
class PreemptedTaskQueue {
  private preemptedTasks: Map<string, { task: Task; grant: ExecutionGrant; preemptedAt: number }>;
  private restorationQueue: string[];

  constructor() {
    this.preemptedTasks = new Map();
    this.restorationQueue = [];
  }

  /**
   * Add preempted task
   */
  addPreemptedTask(task: Task, grant: ExecutionGrant): void {
    this.preemptedTasks.set(task.taskId, {
      task,
      grant,
      preemptedAt: Date.now(),
    });
    
    // Add to restoration queue in priority order
    this.insertInRestorationOrder(task.taskId);
  }

  /**
   * Get next task for restoration
   */
  getNextTaskForRestoration(): { task: Task; grant: ExecutionGrant } | null {
    while (this.restorationQueue.length > 0) {
      const taskId = this.restorationQueue.shift()!;
      const entry = this.preemptedTasks.get(taskId);
      
      if (entry) {
        this.preemptedTasks.delete(taskId);
        return { task: entry.task, grant: entry.grant };
      }
    }
    
    return null;
  }

  /**
   * Remove preempted task (if it was cancelled)
   */
  removePreemptedTask(taskId: string): boolean {
    const removed = this.preemptedTasks.delete(taskId);
    const queueIndex = this.restorationQueue.indexOf(taskId);
    
    if (queueIndex >= 0) {
      this.restorationQueue.splice(queueIndex, 1);
    }
    
    return removed;
  }

  /**
   * Get all preempted tasks
   */
  getAllPreemptedTasks(): Task[] {
    return Array.from(this.preemptedTasks.values()).map(entry => entry.task);
  }

  /**
   * Get preemption wait time for task
   */
  getWaitTime(taskId: string): number | null {
    const entry = this.preemptedTasks.get(taskId);
    return entry ? Date.now() - entry.preemptedAt : null;
  }

  private insertInRestorationOrder(taskId: string): void {
    const newEntry = this.preemptedTasks.get(taskId);
    if (!newEntry) return;

    // Insert in priority order (higher priority first)
    let insertIndex = 0;
    
    for (let i = 0; i < this.restorationQueue.length; i++) {
      const existingTaskId = this.restorationQueue[i];
      const existingEntry = this.preemptedTasks.get(existingTaskId);
      
      if (existingEntry && newEntry.task.priority < existingEntry.task.priority) {
        insertIndex = i;
        break;
      }
      insertIndex = i + 1;
    }
    
    this.restorationQueue.splice(insertIndex, 0, taskId);
  }
}

/**
 * Main Preemption Manager
 */
export class PreemptionManager extends EventEmitter {
  private runningTasks: RunningTaskManager;
  private preemptedTasks: PreemptedTaskQueue;
  private preemptionPolicy: PreemptionPolicy;
  private preemptionHistory: PreemptionEvent[];
  private enabled: boolean;
  private restorationTimer?: NodeJS.Timeout;

  constructor(config: {
    enabled?: boolean;
    maxPreemptionDepth?: number;
    overheadBudgetMs?: number;
    restorationDelayMs?: number;
  } = {}) {
    super();
    
    this.enabled = config.enabled ?? true;
    this.runningTasks = new RunningTaskManager();
    this.preemptedTasks = new PreemptedTaskQueue();
    this.preemptionPolicy = new PreemptionPolicy(
      config.maxPreemptionDepth,
      config.overheadBudgetMs,
      config.restorationDelayMs
    );
    this.preemptionHistory = [];
    
    this.startRestorationLoop();
  }

  /**
   * Request execution slot for task
   */
  requestExecution(task: Task): ExecutionGrant {
    const validatedTask = validateTask(task);
    
    if (!this.enabled) {
      return this.createGrant(validatedTask, false, 'Preemption disabled');
    }

    // Check if resources are immediately available
    if (this.runningTasks.canAllocateResources(validatedTask.resourceRequirements)) {
      const grant = this.createGrant(validatedTask, true, 'Resources available');
      this.runningTasks.addTask(validatedTask, grant);
      
      this.emit('task-granted', {
        task: validatedTask,
        grant,
        timestamp: Date.now(),
      });
      
      return grant;
    }

    // Check if preemption is possible
    const preemptionResult = this.evaluatePreemption(validatedTask);
    
    if (preemptionResult.possible) {
      this.executePreemption(validatedTask, preemptionResult.tasksToPreempt);
      const grant = this.createGrant(validatedTask, true, 'Granted via preemption');
      this.runningTasks.addTask(validatedTask, grant);
      
      this.emit('task-granted', {
        task: validatedTask,
        grant,
        preempted: preemptionResult.tasksToPreempt.map(t => t.taskId),
        timestamp: Date.now(),
      });
      
      return grant;
    }

    // Cannot grant execution
    return this.createGrant(
      validatedTask, 
      false, 
      'Insufficient resources and cannot preempt'
    );
  }

  /**
   * Complete task execution
   */
  completeTask(taskId: string): boolean {
    const task = this.runningTasks.removeTask(taskId);
    
    if (task) {
      this.emit('task-completed', {
        task,
        timestamp: Date.now(),
        duration: task.startedAt ? Date.now() - task.startedAt : 0,
      });
      
      // Trigger restoration attempt
      this.attemptTaskRestoration();
      return true;
    }
    
    return false;
  }

  /**
   * Cancel task execution
   */
  cancelTask(taskId: string): boolean {
    // Check running tasks
    const runningTask = this.runningTasks.removeTask(taskId);
    if (runningTask) {
      this.emit('task-cancelled', {
        task: runningTask,
        timestamp: Date.now(),
        source: 'running',
      });
      
      this.attemptTaskRestoration();
      return true;
    }

    // Check preempted tasks
    const removed = this.preemptedTasks.removePreemptedTask(taskId);
    if (removed) {
      this.emit('task-cancelled', {
        taskId,
        timestamp: Date.now(),
        source: 'preempted',
      });
      return true;
    }

    return false;
  }

  /**
   * Get current system status
   */
  getSystemStatus(): {
    runningTasks: Task[];
    preemptedTasks: Task[];
    resourceUsage: ResourceAllocation;
    preemptionCount: number;
    averageWaitTime: number;
  } {
    const preemptedTasks = this.preemptedTasks.getAllPreemptedTasks();
    const totalWaitTime = preemptedTasks.reduce((sum, task) => {
      const waitTime = this.preemptedTasks.getWaitTime(task.taskId) || 0;
      return sum + waitTime;
    }, 0);

    return {
      runningTasks: this.runningTasks.getAllTasks(),
      preemptedTasks,
      resourceUsage: this.runningTasks.getCurrentResourceUsage(),
      preemptionCount: this.preemptionHistory.length,
      averageWaitTime: preemptedTasks.length > 0 ? totalWaitTime / preemptedTasks.length : 0,
    };
  }

  /**
   * Get preemption statistics
   */
  getPreemptionStatistics(): {
    totalPreemptions: number;
    preemptionsByPriority: Record<PreemptionPriority, number>;
    averageOverhead: number;
    restorationSuccessRate: number;
  } {
    const preemptionsByPriority: Record<PreemptionPriority, number> = {
      [PreemptionPriority.SAFETY_REFLEX]: 0,
      [PreemptionPriority.EMERGENCY_PROTOCOL]: 0,
      [PreemptionPriority.CONSTITUTIONAL]: 0,
      [PreemptionPriority.CRITICAL_OPERATION]: 0,
      [PreemptionPriority.HIGH_PRIORITY]: 0,
      [PreemptionPriority.NORMAL_OPERATION]: 0,
      [PreemptionPriority.LOW_PRIORITY]: 0,
      [PreemptionPriority.MAINTENANCE]: 0,
    };

    let totalOverhead = 0;
    let restoredTasks = 0;

    for (const event of this.preemptionHistory) {
      preemptionsByPriority[event.preemptingPriority]++;
      totalOverhead += event.overhead;
      
      if (event.restorationTime) {
        restoredTasks++;
      }
    }

    return {
      totalPreemptions: this.preemptionHistory.length,
      preemptionsByPriority,
      averageOverhead: this.preemptionHistory.length > 0 ? totalOverhead / this.preemptionHistory.length : 0,
      restorationSuccessRate: this.preemptionHistory.length > 0 ? restoredTasks / this.preemptionHistory.length : 0,
    };
  }

  /**
   * Enable or disable preemption
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    
    this.emit('preemption-config-changed', {
      enabled,
      timestamp: Date.now(),
    });
  }

  private evaluatePreemption(incomingTask: Task): {
    possible: boolean;
    tasksToPreempt: Task[];
    estimatedOverhead: number;
  } {
    const tasksToPreempt: Task[] = [];
    let availableResources = this.runningTasks.getCurrentResourceUsage();

    // Find tasks that can be preempted
    const candidateTasks = this.runningTasks.getTasksLowerThan(incomingTask.priority)
      .filter(task => this.preemptionPolicy.canPreempt(task, incomingTask.priority))
      .sort((a, b) => b.priority - a.priority); // Start with lowest priority

    for (const task of candidateTasks) {
      tasksToPreempt.push(task);
      
      // Calculate what resources would be freed
      availableResources.cpu -= task.resourceRequirements.cpu;
      availableResources.memory -= task.resourceRequirements.memory;
      
      if (task.resourceRequirements.network) {
        availableResources.network = false;
      }
      if (task.resourceRequirements.storage) {
        availableResources.storage = false;
      }

      // Check if we now have enough resources
      const wouldFitAfterPreemption = 
        availableResources.cpu + incomingTask.resourceRequirements.cpu <= 1.0 &&
        availableResources.memory + incomingTask.resourceRequirements.memory <= this.getMaxMemory() &&
        (!incomingTask.resourceRequirements.network || !availableResources.network) &&
        (!incomingTask.resourceRequirements.storage || !availableResources.storage);

      if (wouldFitAfterPreemption) {
        break;
      }
    }

    const estimatedOverhead = this.preemptionPolicy.calculatePreemptionOverhead(
      tasksToPreempt,
      incomingTask
    );

    const possible = 
      tasksToPreempt.length > 0 &&
      this.preemptionPolicy.isPreemptionWorthwhile(incomingTask, tasksToPreempt, estimatedOverhead);

    return {
      possible,
      tasksToPreempt,
      estimatedOverhead,
    };
  }

  private executePreemption(incomingTask: Task, tasksToPreempt: Task[]): void {
    const startTime = Date.now();

    for (const task of tasksToPreempt) {
      const grant = this.runningTasks.getGrant(task.taskId);
      if (grant) {
        this.runningTasks.removeTask(task.taskId);
        this.preemptedTasks.addPreemptedTask(task, grant);

        const preemptionEvent: PreemptionEvent = {
          eventId: `preemption_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          preemptedTask: task.taskId,
          preemptingTask: incomingTask.taskId,
          preemptedPriority: task.priority,
          preemptingPriority: incomingTask.priority,
          reason: `Higher priority task (${incomingTask.priority}) preempting lower priority (${task.priority})`,
          overhead: Date.now() - startTime,
        };

        this.preemptionHistory.push(preemptionEvent);
        
        // Keep only last 1000 events
        if (this.preemptionHistory.length > 1000) {
          this.preemptionHistory.splice(0, this.preemptionHistory.length - 1000);
        }

        this.emit('task-preempted', {
          preemptedTask: task,
          preemptingTask: incomingTask,
          event: preemptionEvent,
          timestamp: Date.now(),
        });
      }
    }
  }

  private createGrant(task: Task, granted: boolean, reason?: string): ExecutionGrant {
    const grant: ExecutionGrant = {
      grantId: `grant_${task.taskId}_${Date.now()}`,
      taskId: task.taskId,
      granted,
      grantedAt: Date.now(),
      resourceAllocation: {
        cpu: granted ? task.resourceRequirements.cpu : 0,
        memory: granted ? task.resourceRequirements.memory : 0,
        priority: task.priority,
      },
      restrictions: granted ? [] : ['resource_unavailable'],
      reason,
    };

    return validateExecutionGrant(grant);
  }

  private startRestorationLoop(): void {
    this.restorationTimer = setTimeout(() => {
      this.attemptTaskRestoration();
      this.startRestorationLoop();
    }, this.preemptionPolicy.getRestorationDelayMs());
  }

  private attemptTaskRestoration(): void {
    const nextTask = this.preemptedTasks.getNextTaskForRestoration();
    
    if (nextTask && this.runningTasks.canAllocateResources(nextTask.task.resourceRequirements)) {
      this.runningTasks.addTask(nextTask.task, nextTask.grant);
      
      // Update preemption history with restoration time
      const relevantEvent = this.preemptionHistory.find(
        event => event.preemptedTask === nextTask.task.taskId && !event.restorationTime
      );
      
      if (relevantEvent) {
        relevantEvent.restorationTime = Date.now();
      }

      this.emit('task-restored', {
        task: nextTask.task,
        grant: nextTask.grant,
        waitTime: this.preemptedTasks.getWaitTime(nextTask.task.taskId) || 0,
        timestamp: Date.now(),
      });
    }
  }

  private getMaxMemory(): number {
    // In a real implementation, this would query actual system memory
    return 2 * 1024 * 1024 * 1024; // 2GB
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.restorationTimer) {
      clearTimeout(this.restorationTimer);
      this.restorationTimer = undefined;
    }
    
    this.removeAllListeners();
  }
}

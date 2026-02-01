/**
 * In-memory task store: CRUD, progress tracking, findSimilarTask, task history.
 *
 * @author @darianrosebrook
 */

import {
  resolveRequirement,
  requirementsEquivalent,
} from '../modules/requirements';
import type { Task, TaskProgress, TaskStatistics } from '../types/task';

function calculateTitleSimilarity(title1: string, title2: string): number {
  const words1 = title1.split(/\s+/);
  const words2 = title2.split(/\s+/);
  const commonWords = words1.filter((word) => words2.includes(word));
  const totalWords = Math.max(words1.length, words2.length);
  return totalWords > 0 ? commonWords.length / totalWords : 0;
}

function createEmptyStatistics(): TaskStatistics {
  return {
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageCompletionTime: 0,
    successRate: 0,
    tasksByCategory: {},
    tasksBySource: {},
  };
}

export class TaskStore {
  private tasks = new Map<string, Task>();
  private taskHistory: Task[] = [];
  private progressTracker = new Map<string, TaskProgress>();
  private statistics: TaskStatistics = createEmptyStatistics();

  setTask(task: Task): void {
    this.tasks.set(task.id, task);
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  hasTask(taskId: string): boolean {
    return this.tasks.has(taskId);
  }

  deleteTask(taskId: string): boolean {
    const deleted = this.tasks.delete(taskId);
    if (deleted) {
      this.progressTracker.delete(taskId);
    }
    return deleted;
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getTasks(filters?: {
    status?: Task['status'] | Task['status'][];
    type?: string;
    source?: Task['source'];
    limit?: number;
  }): Task[] {
    let tasks = this.getAllTasks();
    if (filters?.status) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      tasks = tasks.filter((t) => statuses.includes(t.status));
    }
    if (filters?.type) {
      tasks = tasks.filter(
        (t) => t.type.toLowerCase() === filters!.type!.toLowerCase()
      );
    }
    if (filters?.source) {
      tasks = tasks.filter((t) => t.source === filters!.source);
    }
    if (filters?.limit !== undefined) {
      tasks = tasks.slice(0, filters.limit);
    }
    return tasks.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.metadata.createdAt - b.metadata.createdAt;
    });
  }

  findSimilarTask(taskData: Partial<Task>): Task | null {
    const title = taskData.title?.toLowerCase() || '';
    const type = taskData.type?.toLowerCase() || '';
    const source = taskData.source || '';

    for (const task of this.tasks.values()) {
      if (
        task.title.toLowerCase() === title &&
        (task.status === 'pending' || task.status === 'active')
      ) {
        return task;
      }
    }

    for (const task of this.tasks.values()) {
      if (
        task.type.toLowerCase() === type &&
        task.source === source &&
        (task.status === 'pending' || task.status === 'active')
      ) {
        const taskTitle = task.title.toLowerCase();
        if (calculateTitleSimilarity(title, taskTitle) > 0.7) {
          return task;
        }
      }
    }

    const incomingReq = resolveRequirement(taskData);
    if (incomingReq) {
      for (const task of this.tasks.values()) {
        if (task.status !== 'pending' && task.status !== 'active') continue;
        const existingReq =
          task.metadata?.requirement ?? resolveRequirement(task);
        if (requirementsEquivalent(incomingReq, existingReq)) {
          return task;
        }
      }
    }

    return null;
  }

  pushHistory(task: Task): void {
    this.taskHistory.push(task);
  }

  getTaskHistory(limit: number = 50): Task[] {
    return this.taskHistory.slice(-limit);
  }

  trimHistory(maxLength: number): void {
    if (this.taskHistory.length > maxLength) {
      this.taskHistory = this.taskHistory.slice(-maxLength);
    }
  }

  setProgress(taskId: string, progress: TaskProgress): void {
    this.progressTracker.set(taskId, progress);
  }

  getTaskProgress(taskId: string): TaskProgress | null {
    return this.progressTracker.get(taskId) ?? null;
  }

  getAllTaskProgress(): TaskProgress[] {
    return Array.from(this.progressTracker.values());
  }

  deleteProgress(taskId: string): void {
    this.progressTracker.delete(taskId);
  }

  getStatistics(): TaskStatistics {
    return { ...this.statistics };
  }

  updateStatistics(): void {
    const tasks = this.getAllTasks();
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

    const completedOrFailed =
      this.statistics.completedTasks + this.statistics.failedTasks;
    this.statistics.successRate =
      completedOrFailed > 0
        ? this.statistics.completedTasks / completedOrFailed
        : 0;

    const completedWithDuration = tasks.filter(
      (t) => t.status === 'completed' && t.metadata.actualDuration
    );
    if (completedWithDuration.length > 0) {
      this.statistics.averageCompletionTime =
        completedWithDuration.reduce(
          (sum, task) => sum + (task.metadata.actualDuration || 0),
          0
        ) / completedWithDuration.length;
    }

    this.statistics.tasksByCategory = {};
    tasks.forEach((task) => {
      const category = task.metadata.category;
      this.statistics.tasksByCategory[category] =
        (this.statistics.tasksByCategory[category] || 0) + 1;
    });

    this.statistics.tasksBySource = {};
    tasks.forEach((task) => {
      const source = task.source;
      this.statistics.tasksBySource[source] =
        (this.statistics.tasksBySource[source] || 0) + 1;
    });
  }

  /**
   * Move completed/failed tasks from active map to history and trim progress.
   */
  cleanupCompleted(maxHistory: number): void {
    const completedTasks = this.getAllTasks().filter(
      (task) => task.status === 'completed' || task.status === 'failed'
    );
    completedTasks.forEach((task) => {
      this.taskHistory.push(task);
      this.tasks.delete(task.id);
      this.progressTracker.delete(task.id);
    });
    if (this.taskHistory.length > maxHistory) {
      this.taskHistory = this.taskHistory.slice(-maxHistory);
    }
  }
}

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

/**
 * Atomicity contract: this store is reference-based, NOT copy-on-write.
 *
 * - `getTask()` returns a direct reference to the stored Task object.
 *   Mutations to the returned object are immediately visible to all
 *   holders of that reference and to subsequent `getTask()` calls.
 * - `setTask()` stores the reference as-is (no cloning).
 * - `setTask()` is the commit boundary for store-driven observers (code
 *   that discovers tasks via `getAllTasks()` / `getTasks()`). Reference
 *   holders from prior `getTask()` calls see mutations immediately —
 *   there is no isolation between reads.
 *
 * Callers that need atomic multi-field updates (e.g., status + hold state)
 * should mutate all fields on the in-memory Task object BEFORE calling
 * `setTask()`. See TaskIntegration.updateTaskStatus for the canonical
 * example of this pattern.
 */
export class TaskStore {
  private tasks = new Map<string, Task>();
  private sterlingIndex = new Map<string, Task>();
  private sterlingReservations = new Map<string, number>();
  private taskHistory: Task[] = [];
  private progressTracker = new Map<string, TaskProgress>();
  private statistics: TaskStatistics = createEmptyStatistics();

  setTask(
    task: Task,
    opts?: { allowUnfinalized?: boolean; note?: string },
  ): void {
    // ── Persist-without-finalize detection ──
    // When PLANNING_STRICT_FINALIZE=1, detect new tasks being stored
    // without going through TaskIntegration.finalizeNewTask() (which
    // stamps metadata.origin). Existing tasks (updates) are exempt.
    //
    // Callers that intentionally persist before finalization (e.g., the
    // GoalResolver skeleton persist) pass { allowUnfinalized: true } to
    // suppress the warning. All other new-task persists without origin
    // are flagged as potential bypass paths.
    if (
      process.env.PLANNING_STRICT_FINALIZE === '1' &&
      !this.tasks.has(task.id) &&
      !task.metadata?.origin &&
      !opts?.allowUnfinalized
    ) {
      console.warn(
        `[TaskStore] STRICT: New task ${task.id} persisted without origin. ` +
        `This may indicate a persistence path that bypasses finalizeNewTask().`
      );
    }
    this.tasks.set(task.id, task);
    const dedupeKey = this.getSterlingDedupeKey(task);
    if (dedupeKey) {
      this.sterlingIndex.set(dedupeKey, task);
      this.sterlingReservations.delete(dedupeKey);
    }
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  hasTask(taskId: string): boolean {
    return this.tasks.has(taskId);
  }

  deleteTask(taskId: string): boolean {
    const existing = this.tasks.get(taskId);
    const deleted = this.tasks.delete(taskId);
    if (deleted) {
      this.progressTracker.delete(taskId);
      const dedupeKey = existing ? this.getSterlingDedupeKey(existing) : null;
      if (dedupeKey && this.sterlingIndex.get(dedupeKey)?.id === taskId) {
        this.sterlingIndex.delete(dedupeKey);
        this.sterlingReservations.delete(dedupeKey);
      }
    }
    return deleted;
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  findBySterlingDedupeKey(dedupeKey: string): Task | null {
    const indexed = this.sterlingIndex.get(dedupeKey);
    if (indexed) {
      if (this.tasks.has(indexed.id)) return indexed;
      // Stale index entry: remove and fall through to history scan.
      this.sterlingIndex.delete(dedupeKey);
    }
    // Fall back to history scan (most recent wins)
    for (let i = this.taskHistory.length - 1; i >= 0; i--) {
      const task = this.taskHistory[i];
      if (this.getSterlingDedupeKey(task) === dedupeKey) {
        return task;
      }
    }
    return null;
  }

  reserveSterlingDedupeKey(dedupeKey: string): boolean {
    if (this.sterlingIndex.has(dedupeKey) || this.sterlingReservations.has(dedupeKey)) {
      return false;
    }
    this.sterlingReservations.set(dedupeKey, Date.now());
    return true;
  }

  releaseSterlingDedupeKey(dedupeKey: string): void {
    this.sterlingReservations.delete(dedupeKey);
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
    if (taskData.type === 'sterling_ir') {
      const dedupeKey = this.getSterlingDedupeKey(taskData);
      if (!dedupeKey) return null;
      return this.findBySterlingDedupeKey(dedupeKey);
    }
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

  private getSterlingDedupeKey(task: Partial<Task>): string | null {
    const sterling = task.metadata?.sterling as
      | { committedIrDigest?: string; schemaVersion?: string | null; dedupeNamespace?: string | null }
      | undefined;
    const digest = sterling?.committedIrDigest;
    if (!digest) return null;
    const namespace = sterling?.dedupeNamespace ?? sterling?.schemaVersion ?? 'unknown';
    return `${namespace}:${digest}`;
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

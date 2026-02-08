/**
 * Task integration interface for dependency injection
 *
 * @author @darianrosebrook
 */

export type MutationOrigin = 'runtime' | 'protocol';

export interface MutationOptions {
  origin?: MutationOrigin;
}

export interface ITaskIntegration {
  addTask(taskData: Partial<any>): Promise<any>;
  getActiveTasks(): any[];
  getTasks(filters?: { status?: string }): any[];
  updateTaskMetadata(taskId: string, metadata: Record<string, any>): void;
  updateTaskProgress(taskId: string, progress: number, status?: string, options?: MutationOptions): void;
  updateTaskStatus(taskId: string, status: string, options?: MutationOptions): Promise<void>;
  /**
   * Ensure a task is activated before dispatch.
   * If status is 'pending', transitions to 'active'.
   * Returns true if activation occurred, false if already active/terminal.
   */
  ensureActivated(taskId: string): Promise<boolean>;
  completeTaskStep(taskId: string, stepId: string, opts?: { skipVerification?: boolean }): Promise<boolean>;
  startTaskStep(taskId: string, stepId: string, options?: { dryRun?: boolean }): Promise<boolean>;
  regenerateSteps(taskId: string, options?: any): Promise<any>;
  addStepsBeforeCurrent(taskId: string, steps: any[]): void;
  annotateCurrentStepWithLeaf(taskId: string, leaf: string, args?: any): void;
  annotateCurrentStepWithOption(
    taskId: string,
    optionName: string,
    args?: Record<string, any>
  ): boolean;
  registerSolver(solver: any): void;
  setInventoryProvider?(provider: () => { items: any[]; ts: number } | undefined): void;
  configureHierarchicalPlanner(overrides?: {
    macroPlanner?: any;
    feedbackStore?: any;
  }): void;
  readonly isHierarchicalPlannerConfigured: boolean;
  enableGoalResolver(resolver?: any): void;
  readonly isGoalResolverConfigured: boolean;
  getMcDataPublic(): any;
  retryExpansion(taskId: string): Promise<
    | { outcome: 'ok'; steps: any[] }
    | { outcome: 'blocked'; reason: string }
    | { outcome: 'error'; error: string }
    | { outcome: 'skipped'; reason: string }
  >;
  on(event: string, listener: (...args: any[]) => void): this;
  emit(event: string, ...args: any[]): boolean;
  readonly outbox: { enqueue: (url: string, payload: any) => void };
}

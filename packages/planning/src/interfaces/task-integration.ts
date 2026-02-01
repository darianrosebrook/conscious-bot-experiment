/**
 * Task integration interface for dependency injection
 *
 * @author @darianrosebrook
 */

export interface ITaskIntegration {
  addTask(taskData: Partial<any>): Promise<any>;
  getActiveTasks(): any[];
  getTasks(filters?: { status?: string }): any[];
  updateTaskMetadata(taskId: string, metadata: Record<string, any>): void;
  updateTaskProgress(taskId: string, progress: number, status?: string): void;
  updateTaskStatus(taskId: string, status: string): Promise<void>;
  completeTaskStep(taskId: string, stepId: string): Promise<boolean>;
  startTaskStep(taskId: string, stepId: string): Promise<boolean>;
  regenerateSteps(taskId: string, options?: any): Promise<any>;
  addStepsBeforeCurrent(taskId: string, steps: any[]): void;
  annotateCurrentStepWithLeaf(taskId: string, leaf: string, args?: any): void;
  annotateCurrentStepWithOption(
    taskId: string,
    optionName: string,
    args?: Record<string, any>
  ): boolean;
  registerSolver(solver: any): void;
  getMcDataPublic(): any;
  on(event: string, listener: (...args: any[]) => void): this;
  readonly outbox: { enqueue: (url: string, payload: any) => void };
}

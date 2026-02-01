/**
 * Reactive executor interface for dependency injection
 *
 * @author @darianrosebrook
 */

export interface IReactiveExecutor {
  executeTask(task: any): Promise<any>;
}

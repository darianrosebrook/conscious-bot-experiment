/**
 * Goal manager interface for dependency injection
 *
 * @author @darianrosebrook
 */

export interface IGoalManager {
  listGoals(): any[];
  getGoalsByStatus(status: any): any[];
  upsert(goal: any): void;
  reprioritize(goalId: string, priority?: number, urgency?: number): boolean;
  cancel(goalId: string, reason?: string): boolean;
  pause(goalId: string): boolean;
  resume(goalId: string): boolean;
  complete(goalId: string): boolean;
}

/**
 * Goal tracking for working memory.
 *
 * Manages active goals, their priorities, dependencies, and progress
 * within the working memory system.
 *
 * @author @darianrosebrook
 */

import { ActiveGoal, GoalStatus, MemoryOperationResult } from './types';
import { CentralExecutive } from './central-executive';

/**
 * Goal tracker for working memory
 */
export class GoalTracker {
  private centralExecutive: CentralExecutive;

  constructor(centralExecutive: CentralExecutive) {
    this.centralExecutive = centralExecutive;
  }

  /**
   * Get all active goals
   */
  getAllGoals(): ActiveGoal[] {
    const state = this.centralExecutive.getState();
    return [...state.activeGoals];
  }

  /**
   * Get goals by status
   */
  getGoalsByStatus(status: GoalStatus): ActiveGoal[] {
    const state = this.centralExecutive.getState();
    return state.activeGoals.filter(goal => goal.status === status);
  }

  /**
   * Get highest priority active goal
   */
  getHighestPriorityGoal(): ActiveGoal | undefined {
    const activeGoals = this.getGoalsByStatus(GoalStatus.ACTIVE);
    if (activeGoals.length === 0) return undefined;
    
    return activeGoals.reduce((highest, current) => 
      current.priority > highest.priority ? current : highest, 
      activeGoals[0]
    );
  }

  /**
   * Add new goal to working memory
   */
  addGoal(
    description: string,
    options: {
      priority?: number;
      deadline?: number;
      subgoals?: string[];
      dependsOn?: string[];
      resources?: string[];
    } = {}
  ): MemoryOperationResult {
    return this.centralExecutive.addActiveGoal(
      description,
      options
    );
  }

  /**
   * Update goal progress
   */
  updateGoalProgress(
    goalId: string,
    progress: number
  ): MemoryOperationResult {
    const state = this.centralExecutive.getState();
    const goal = state.activeGoals.find(g => g.id === goalId);
    
    if (!goal) {
      return {
        success: false,
        message: `Goal '${goalId}' not found`,
        affectedItems: [],
        timestamp: Date.now(),
      };
    }
    
    return this.centralExecutive.updateGoalStatus(
      goalId,
      goal.status,
      Math.max(0, Math.min(1, progress))
    );
  }

  /**
   * Mark goal as completed
   */
  completeGoal(goalId: string): MemoryOperationResult {
    return this.centralExecutive.updateGoalStatus(
      goalId,
      GoalStatus.COMPLETED
    );
  }

  /**
   * Mark goal as failed
   */
  failGoal(goalId: string): MemoryOperationResult {
    return this.centralExecutive.updateGoalStatus(
      goalId,
      GoalStatus.FAILED
    );
  }

  /**
   * Pause goal
   */
  pauseGoal(goalId: string): MemoryOperationResult {
    return this.centralExecutive.updateGoalStatus(
      goalId,
      GoalStatus.PAUSED
    );
  }

  /**
   * Resume paused goal
   */
  resumeGoal(goalId: string): MemoryOperationResult {
    const state = this.centralExecutive.getState();
    const goal = state.activeGoals.find(g => g.id === goalId);
    
    if (!goal) {
      return {
        success: false,
        message: `Goal '${goalId}' not found`,
        affectedItems: [],
        timestamp: Date.now(),
      };
    }
    
    if (goal.status !== GoalStatus.PAUSED) {
      return {
        success: false,
        message: `Goal '${goalId}' is not paused (current status: ${goal.status})`,
        affectedItems: [],
        timestamp: Date.now(),
      };
    }
    
    return this.centralExecutive.updateGoalStatus(
      goalId,
      GoalStatus.ACTIVE
    );
  }

  /**
   * Add subgoal to existing goal
   */
  addSubgoal(
    parentGoalId: string,
    subgoalDescription: string,
    options: {
      priority?: number;
    } = {}
  ): MemoryOperationResult {
    const state = this.centralExecutive.getState();
    const parentGoal = state.activeGoals.find(g => g.id === parentGoalId);
    
    if (!parentGoal) {
      return {
        success: false,
        message: `Parent goal '${parentGoalId}' not found`,
        affectedItems: [],
        timestamp: Date.now(),
      };
    }
    
    // Create subgoal
    const result = this.addGoal(
      subgoalDescription,
      {
        priority: options.priority || parentGoal.priority * 0.9,
        dependsOn: [parentGoalId],
      }
    );
    
    if (!result.success) {
      return result;
    }
    
    // Add subgoal reference to parent
    const subgoalId = result.affectedItems[0];
    parentGoal.subgoals.push(subgoalId);
    
    return {
      success: true,
      message: `Added subgoal to '${parentGoalId}'`,
      affectedItems: [parentGoalId, subgoalId],
      timestamp: Date.now(),
    };
  }

  /**
   * Check for goal dependencies and update status
   */
  updateGoalDependencies(): MemoryOperationResult {
    const state = this.centralExecutive.getState();
    const updatedGoals: string[] = [];
    
    // Check each active goal for dependencies
    for (const goal of state.activeGoals) {
      if (goal.status === GoalStatus.ACTIVE && goal.dependsOn.length > 0) {
        // Check if any dependency is not completed
        const hasBlockingDependency = goal.dependsOn.some(depId => {
          const dep = state.activeGoals.find(g => g.id === depId);
          return dep && dep.status !== GoalStatus.COMPLETED;
        });
        
        if (hasBlockingDependency) {
          // Block goal if dependencies not met
          this.centralExecutive.updateGoalStatus(
            goal.id,
            GoalStatus.BLOCKED
          );
          updatedGoals.push(goal.id);
        }
      } else if (goal.status === GoalStatus.BLOCKED) {
        // Check if blocked goal can be unblocked
        const canUnblock = !goal.dependsOn.some(depId => {
          const dep = state.activeGoals.find(g => g.id === depId);
          return dep && dep.status !== GoalStatus.COMPLETED;
        });
        
        if (canUnblock) {
          // Unblock goal if dependencies now met
          this.centralExecutive.updateGoalStatus(
            goal.id,
            GoalStatus.ACTIVE
          );
          updatedGoals.push(goal.id);
        }
      }
    }
    
    return {
      success: true,
      message: `Updated ${updatedGoals.length} goals based on dependencies`,
      affectedItems: updatedGoals,
      timestamp: Date.now(),
    };
  }

  /**
   * Focus attention on a specific goal
   */
  focusOnGoal(goalId: string): MemoryOperationResult {
    const state = this.centralExecutive.getState();
    const goal = state.activeGoals.find(g => g.id === goalId);
    
    if (!goal) {
      return {
        success: false,
        message: `Goal '${goalId}' not found`,
        affectedItems: [],
        timestamp: Date.now(),
      };
    }
    
    return this.centralExecutive.focusAttention(goalId, 'goal_tracker');
  }

  /**
   * Remove goal from working memory
   */
  removeGoal(goalId: string): MemoryOperationResult {
    const state = this.centralExecutive.getState();
    const goal = state.activeGoals.find(g => g.id === goalId);
    
    if (!goal) {
      return {
        success: false,
        message: `Goal '${goalId}' not found`,
        affectedItems: [],
        timestamp: Date.now(),
      };
    }
    
    // Remove from parent goals if this is a subgoal
    for (const potentialParent of state.activeGoals) {
      if (potentialParent.subgoals.includes(goalId)) {
        potentialParent.subgoals = potentialParent.subgoals
          .filter(id => id !== goalId);
      }
    }
    
    return this.centralExecutive.removeItem(goalId);
  }

  /**
   * Clean up completed and failed goals
   */
  cleanupGoals(
    options: {
      removeCompleted?: boolean;
      removeFailed?: boolean;
      olderThan?: number;
    } = {}
  ): MemoryOperationResult {
    const state = this.centralExecutive.getState();
    const now = Date.now();
    const removedGoals: string[] = [];
    
    for (const goal of state.activeGoals) {
      let shouldRemove = false;
      
      // Check if goal should be removed based on status and age
      if ((options.removeCompleted && goal.status === GoalStatus.COMPLETED) ||
          (options.removeFailed && goal.status === GoalStatus.FAILED)) {
        
        if (!options.olderThan) {
          shouldRemove = true;
        } else {
          // Only remove if older than specified time
          const goalAge = now - state.timestamp; // Approximate age
          if (goalAge > options.olderThan) {
            shouldRemove = true;
          }
        }
      }
      
      if (shouldRemove) {
        const result = this.removeGoal(goal.id);
        if (result.success) {
          removedGoals.push(goal.id);
        }
      }
    }
    
    return {
      success: true,
      message: `Removed ${removedGoals.length} completed/failed goals`,
      affectedItems: removedGoals,
      timestamp: now,
    };
  }

  /**
   * Get goal statistics
   */
  getStats() {
    const goals = this.getAllGoals();
    
    return {
      totalGoals: goals.length,
      byStatus: Object.values(GoalStatus).reduce(
        (acc, status) => {
          acc[status] = goals.filter(g => g.status === status).length;
          return acc;
        },
        {} as Record<GoalStatus, number>
      ),
      averagePriority: goals.length > 0 ?
        goals.reduce((sum, g) => sum + g.priority, 0) / goals.length :
        0,
      averageProgress: goals.length > 0 ?
        goals.reduce((sum, g) => sum + g.progress, 0) / goals.length :
        0,
    };
  }
}

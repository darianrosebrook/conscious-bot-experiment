/**
 * GOAP (Goal-Oriented Action Planning) Planner
 *
 * Implements reactive planning for real-time opportunistic action selection
 * Provides fast planning for emergency situations and plan repair
 *
 * @author @darianrosebrook
 */

import {
  Plan,
  PlanStep,
  PlanStatus,
  Action,
  Resource,
  Goal,
  ActionType,
  PlanStepStatus,
} from '../types';

export interface GOAPAction {
  id: string;
  name: string;
  cost: number;
  preconditions: Record<string, any>;
  effects: Record<string, any>;
  duration: number;
  resources: Record<string, number>;
  isAvailable?: (worldState: Record<string, any>) => boolean;
}

export interface GOAPGoal {
  id: string;
  conditions: Record<string, any>;
  priority: number;
  deadline?: number;
}

export interface GOAPWorldState {
  [key: string]: any;
}

export interface GOAPNode {
  id: string;
  worldState: GOAPWorldState;
  action: GOAPAction | null;
  gCost: number; // Cost from start
  hCost: number; // Heuristic cost to goal
  fCost: number; // Total cost
  parent: GOAPNode | null;
  path: GOAPAction[];
}

export interface GOAPPlannerConfig {
  maxPlanLength: number;
  planningBudgetMs: number;
  heuristicWeight: number;
  repairThreshold: number;
  enablePlanCaching: boolean;
}

/**
 * GOAP Planner using A* search for optimal action sequences
 */
export class GOAPPlanner {
  private config: GOAPPlannerConfig;
  private availableActions: Map<string, GOAPAction> = new Map();
  private planCache: Map<string, Plan> = new Map();

  constructor(config: Partial<GOAPPlannerConfig> = {}) {
    this.config = {
      maxPlanLength: 10,
      planningBudgetMs: 20,
      heuristicWeight: 1.0,
      repairThreshold: 0.8,
      enablePlanCaching: true,
      ...config,
    };

    this.initializeDefaultActions();
  }

  /**
   * Main planning method - finds action sequence to achieve goal
   */
  async plan(goal: GOAPGoal, worldState: GOAPWorldState): Promise<Plan> {
    const startTime = Date.now();

    // Check cache first
    const cacheKey = this.generateCacheKey(goal, worldState);
    if (this.config.enablePlanCaching && this.planCache.has(cacheKey)) {
      const cachedPlan = this.planCache.get(cacheKey)!;
      return this.refreshPlan(cachedPlan);
    }

    try {
      const actionSequence = await this.searchForPlan(
        goal,
        worldState,
        startTime
      );

      const plan: Plan = {
        id: `goap-plan-${Date.now()}`,
        goalId: goal.id,
        steps: this.convertActionsToSteps(actionSequence),
        status: PlanStatus.PENDING,
        priority: goal.priority,
        estimatedDuration: actionSequence.reduce(
          (sum, action) => sum + action.duration,
          0
        ),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        successProbability: this.estimateSuccessProbability(
          actionSequence,
          goal,
          worldState
        ),
      };

      // Cache the plan
      if (this.config.enablePlanCaching) {
        this.planCache.set(cacheKey, plan);
      }

      return plan;
    } catch (error) {
      // Return empty plan on failure
      return this.createEmptyPlan(goal, `GOAP planning failed: ${error}`);
    }
  }

  /**
   * Repair an existing plan when execution conditions change
   */
  async repairPlan(
    originalPlan: Plan,
    currentWorldState: GOAPWorldState,
    newGoal?: GOAPGoal
  ): Promise<Plan> {
    // Find the first failed step
    const failurePoint = this.findFailurePoint(originalPlan, currentWorldState);

    if (failurePoint === -1) {
      // Plan is still valid
      return originalPlan;
    }

    // Extract remaining goal conditions
    const remainingGoal =
      newGoal || this.extractRemainingGoal(originalPlan, failurePoint);

    // Plan from current state to complete the goal
    const repairPlan = await this.plan(remainingGoal, currentWorldState);

    // Merge executed steps with repair plan
    return this.mergePlans(originalPlan, repairPlan, failurePoint);
  }

  /**
   * A* search implementation for GOAP planning
   */
  private async searchForPlan(
    goal: GOAPGoal,
    startState: GOAPWorldState,
    startTime: number
  ): Promise<GOAPAction[]> {
    const openSet: GOAPNode[] = [];
    const closedSet: Set<string> = new Set();

    // Initialize start node
    const startNode: GOAPNode = {
      id: 'start',
      worldState: { ...startState },
      action: null,
      gCost: 0,
      hCost: this.calculateHeuristic(startState, goal),
      fCost: 0,
      parent: null,
      path: [],
    };
    startNode.fCost = startNode.gCost + startNode.hCost;

    openSet.push(startNode);

    while (openSet.length > 0) {
      // Check time budget
      if (Date.now() - startTime > this.config.planningBudgetMs) {
        throw new Error('Planning time budget exceeded');
      }

      // Get node with lowest fCost
      openSet.sort((a, b) => a.fCost - b.fCost);
      const currentNode = openSet.shift()!;

      // Check if goal is achieved
      if (this.isGoalAchieved(currentNode.worldState, goal)) {
        return currentNode.path;
      }

      // Mark as explored
      const stateKey = this.generateStateKey(currentNode.worldState);
      closedSet.add(stateKey);

      // Check path length limit
      if (currentNode.path.length >= this.config.maxPlanLength) {
        continue;
      }

      // Generate successor nodes
      const successors = this.generateSuccessors(currentNode, goal);

      for (const successor of successors) {
        const successorStateKey = this.generateStateKey(successor.worldState);

        // Skip if already explored
        if (closedSet.has(successorStateKey)) {
          continue;
        }

        // Check if this path to successor is better
        const existingNode = openSet.find(
          (node) => this.generateStateKey(node.worldState) === successorStateKey
        );

        if (!existingNode || successor.gCost < existingNode.gCost) {
          if (existingNode) {
            openSet.splice(openSet.indexOf(existingNode), 1);
          }
          openSet.push(successor);
        }
      }
    }

    throw new Error('No plan found to achieve goal');
  }

  /**
   * Generate successor nodes by applying available actions
   */
  private generateSuccessors(
    currentNode: GOAPNode,
    goal: GOAPGoal
  ): GOAPNode[] {
    const successors: GOAPNode[] = [];

    for (const action of Array.from(this.availableActions.values())) {
      // Check if action is applicable
      if (!this.isActionApplicable(action, currentNode.worldState)) {
        continue;
      }

      // Apply action to get new world state
      const newWorldState = this.applyAction(action, currentNode.worldState);

      // Create successor node
      const successor: GOAPNode = {
        id: `${currentNode.id}-${action.id}`,
        worldState: newWorldState,
        action,
        gCost: currentNode.gCost + action.cost,
        hCost: this.calculateHeuristic(newWorldState, goal),
        fCost: 0,
        parent: currentNode,
        path: [...currentNode.path, action],
      };
      successor.fCost =
        successor.gCost + this.config.heuristicWeight * successor.hCost;

      successors.push(successor);
    }

    return successors;
  }

  /**
   * Calculate heuristic cost to goal (Manhattan distance-like)
   */
  private calculateHeuristic(
    worldState: GOAPWorldState,
    goal: GOAPGoal
  ): number {
    let heuristic = 0;

    for (const [key, targetValue] of Object.entries(goal.conditions)) {
      const currentValue = worldState[key];

      if (currentValue !== targetValue) {
        // Simple binary difference - could be more sophisticated
        heuristic += 1;
      }
    }

    return heuristic;
  }

  /**
   * Check if action preconditions are met
   */
  private isActionApplicable(
    action: GOAPAction,
    worldState: GOAPWorldState
  ): boolean {
    // Check custom availability function
    if (action.isAvailable && !action.isAvailable(worldState)) {
      return false;
    }

    // Check preconditions
    for (const [key, requiredValue] of Object.entries(action.preconditions)) {
      if (worldState[key] !== requiredValue) {
        return false;
      }
    }

    return true;
  }

  /**
   * Apply action effects to world state
   */
  private applyAction(
    action: GOAPAction,
    worldState: GOAPWorldState
  ): GOAPWorldState {
    const newState = { ...worldState };

    // Apply effects
    for (const [key, newValue] of Object.entries(action.effects)) {
      newState[key] = newValue;
    }

    return newState;
  }

  /**
   * Check if goal conditions are satisfied
   */
  private isGoalAchieved(worldState: GOAPWorldState, goal: GOAPGoal): boolean {
    for (const [key, targetValue] of Object.entries(goal.conditions)) {
      if (worldState[key] !== targetValue) {
        return false;
      }
    }
    return true;
  }

  /**
   * Convert action sequence to plan steps
   */
  private convertActionsToSteps(actions: GOAPAction[]): PlanStep[] {
    return actions.map((action, index) => ({
      id: `step-${index + 1}`,
      planId: 'goap-plan',
      action: {
        id: action.id,
        type: this.mapActionNameToType(action.name),
        name: action.name,
        description: `Execute ${action.name}`,
        parameters: {},
        preconditions: this.convertToConditionArray(action.preconditions),
        effects: this.convertToEffectArray(action.effects),
        cost: action.cost,
        duration: action.duration,
        estimatedDuration: action.duration,
        successProbability: 0.8,
      },
      status: PlanStepStatus.PENDING,
      dependencies: index > 0 ? [`step-${index}`] : [],
      estimatedDuration: action.duration,
      preconditions: this.convertToConditionArray(action.preconditions),
      effects: this.convertToEffectArray(action.effects),
      order: index,
      resources: Object.entries(action.resources).map(([type, amount]) => ({
        type,
        amount,
        availability: 'available' as const,
      })),
    }));
  }

  /**
   * Convert record to Precondition array
   */
  private convertToConditionArray(conditions: Record<string, any>): any[] {
    return Object.entries(conditions).map(([key, value]) => ({
      id: key,
      type: typeof value,
      value,
      operator: '=',
    }));
  }

  /**
   * Convert record to Effect array
   */
  private convertToEffectArray(effects: Record<string, any>): any[] {
    return Object.entries(effects).map(([key, value]) => ({
      id: key,
      type: typeof value,
      value,
      operator: 'set',
    }));
  }

  /**
   * Map action names to ActionType enum values
   */
  private mapActionNameToType(actionName: string): ActionType {
    const name = actionName.toLowerCase();

    if (
      name.includes('move') ||
      name.includes('navigate') ||
      name.includes('travel')
    ) {
      return ActionType.MOVEMENT;
    }
    if (
      name.includes('craft') ||
      name.includes('build') ||
      name.includes('make')
    ) {
      return ActionType.CRAFTING;
    }
    if (
      name.includes('attack') ||
      name.includes('fight') ||
      name.includes('defend')
    ) {
      return ActionType.COMBAT;
    }
    if (
      name.includes('talk') ||
      name.includes('communicate') ||
      name.includes('trade')
    ) {
      return ActionType.SOCIAL;
    }
    if (
      name.includes('explore') ||
      name.includes('search') ||
      name.includes('scout')
    ) {
      return ActionType.EXPLORATION;
    }
    // Default to interaction for anything else
    return ActionType.INTERACTION;
  }

  /**
   * Initialize default actions for basic behaviors
   */
  private initializeDefaultActions(): void {
    const defaultActions: GOAPAction[] = [
      {
        id: 'move',
        name: 'Move',
        cost: 1,
        preconditions: {},
        effects: { moved: true },
        duration: 100,
        resources: { energy: 1 },
      },
      {
        id: 'collect',
        name: 'Collect Resource',
        cost: 2,
        preconditions: { nearResource: true },
        effects: { hasResource: true },
        duration: 200,
        resources: { energy: 2 },
      },
      {
        id: 'use_tool',
        name: 'Use Tool',
        cost: 1,
        preconditions: { hasTool: true },
        effects: { toolUsed: true },
        duration: 150,
        resources: { energy: 1 },
      },
      {
        id: 'wait',
        name: 'Wait',
        cost: 0.1,
        preconditions: {},
        effects: { waited: true },
        duration: 50,
        resources: {},
      },
    ];

    defaultActions.forEach((action) => {
      this.availableActions.set(action.id, action);
    });
  }

  /**
   * Add custom action to the planner
   */
  addAction(action: GOAPAction): void {
    this.availableActions.set(action.id, action);
  }

  /**
   * Remove action from the planner
   */
  removeAction(actionId: string): void {
    this.availableActions.delete(actionId);
  }

  // Helper methods for plan management
  private generateCacheKey(goal: GOAPGoal, worldState: GOAPWorldState): string {
    return `${goal.id}-${JSON.stringify(worldState)}`;
  }

  private generateStateKey(worldState: GOAPWorldState): string {
    return JSON.stringify(worldState);
  }

  private refreshPlan(plan: Plan): Plan {
    return {
      ...plan,
      updatedAt: Date.now(),
    };
  }

  private createEmptyPlan(goal: GOAPGoal, reason: string): Plan {
    return {
      id: `empty-plan-${Date.now()}`,
      goalId: goal.id,
      steps: [],
      status: PlanStatus.FAILED,
      priority: goal.priority,
      estimatedDuration: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      successProbability: 0,
    };
  }

  private estimateSuccessProbability(
    actions: GOAPAction[],
    goal: GOAPGoal,
    worldState: GOAPWorldState
  ): number {
    // Simple heuristic based on plan length and action costs
    const totalCost = actions.reduce((sum, action) => sum + action.cost, 0);
    const avgCost = totalCost / Math.max(actions.length, 1);

    // Lower costs and shorter plans = higher success probability
    return Math.max(
      0.1,
      Math.min(0.95, 1.0 - avgCost / 10 - actions.length / 20)
    );
  }

  private findFailurePoint(
    plan: Plan,
    currentWorldState: GOAPWorldState
  ): number {
    // Simulate plan execution to find where it would fail
    let simulatedState = { ...currentWorldState };

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const action = this.availableActions.get(step.action.id);

      if (!action || !this.isActionApplicable(action, simulatedState)) {
        return i;
      }

      simulatedState = this.applyAction(action, simulatedState);
    }

    return -1; // Plan is valid
  }

  private extractRemainingGoal(plan: Plan, failurePoint: number): GOAPGoal {
    // Extract goal from the original plan's final effects
    const remainingSteps = plan.steps.slice(failurePoint);
    const conditions: Record<string, any> = {};

    // Aggregate effects from remaining steps
    remainingSteps.forEach((step) => {
      Object.assign(conditions, step.action.effects);
    });

    return {
      id: `remaining-goal-${Date.now()}`,
      conditions,
      priority: plan.priority,
    };
  }

  private mergePlans(
    originalPlan: Plan,
    repairPlan: Plan,
    failurePoint: number
  ): Plan {
    const executedSteps = originalPlan.steps.slice(0, failurePoint);
    const newSteps = [...executedSteps, ...repairPlan.steps];

    return {
      ...originalPlan,
      id: `repaired-${originalPlan.id}`,
      steps: newSteps,
      status: PlanStatus.PENDING,
      estimatedDuration: newSteps.reduce(
        (sum, step) => sum + step.estimatedDuration,
        0
      ),
      updatedAt: Date.now(),
      successProbability: repairPlan.successProbability * 0.9, // Slight penalty for repair
    };
  }

  /**
   * Get planner statistics
   */
  getStatistics(): any {
    return {
      availableActions: this.availableActions.size,
      cachedPlans: this.planCache.size,
      config: this.config,
    };
  }

  /**
   * Clear plan cache
   */
  clearCache(): void {
    this.planCache.clear();
  }
}

/**
 * Factory function for creating GOAP planner
 */
export function createGOAPPlanner(
  config?: Partial<GOAPPlannerConfig>
): GOAPPlanner {
  return new GOAPPlanner(config);
}

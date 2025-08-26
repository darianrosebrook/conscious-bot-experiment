"use strict";
/**
 * GOAP (Goal-Oriented Action Planning) Planner
 *
 * Implements reactive planning for real-time opportunistic action selection
 * Provides fast planning for emergency situations and plan repair
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOAPPlanner = void 0;
exports.createGOAPPlanner = createGOAPPlanner;
const types_1 = require("../types");
/**
 * GOAP Planner using A* search for optimal action sequences
 */
class GOAPPlanner {
    constructor(config = {}) {
        this.availableActions = new Map();
        this.planCache = new Map();
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
    async plan(goal, worldState) {
        const startTime = Date.now();
        // Check cache first
        const cacheKey = this.generateCacheKey(goal, worldState);
        if (this.config.enablePlanCaching && this.planCache.has(cacheKey)) {
            const cachedPlan = this.planCache.get(cacheKey);
            return this.refreshPlan(cachedPlan);
        }
        try {
            const actionSequence = await this.searchForPlan(goal, worldState, startTime);
            const plan = {
                id: `goap-plan-${Date.now()}`,
                goalId: goal.id,
                steps: this.convertActionsToSteps(actionSequence),
                status: types_1.PlanStatus.PENDING,
                priority: goal.priority,
                estimatedDuration: actionSequence.reduce((sum, action) => sum + action.duration, 0),
                createdAt: Date.now(),
                updatedAt: Date.now(),
                successProbability: this.estimateSuccessProbability(actionSequence, goal, worldState),
            };
            // Cache the plan
            if (this.config.enablePlanCaching) {
                this.planCache.set(cacheKey, plan);
            }
            return plan;
        }
        catch (error) {
            // Return empty plan on failure
            return this.createEmptyPlan(goal, `GOAP planning failed: ${error}`);
        }
    }
    /**
     * Repair an existing plan when execution conditions change
     */
    async repairPlan(originalPlan, currentWorldState, newGoal) {
        // Find the first failed step
        const failurePoint = this.findFailurePoint(originalPlan, currentWorldState);
        if (failurePoint === -1) {
            // Plan is still valid
            return originalPlan;
        }
        // Extract remaining goal conditions
        const remainingGoal = newGoal || this.extractRemainingGoal(originalPlan, failurePoint);
        // Plan from current state to complete the goal
        const repairPlan = await this.plan(remainingGoal, currentWorldState);
        // Merge executed steps with repair plan
        return this.mergePlans(originalPlan, repairPlan, failurePoint);
    }
    /**
     * A* search implementation for GOAP planning
     */
    async searchForPlan(goal, startState, startTime) {
        const openSet = [];
        const closedSet = new Set();
        // Initialize start node
        const startNode = {
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
            const currentNode = openSet.shift();
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
                const existingNode = openSet.find((node) => this.generateStateKey(node.worldState) === successorStateKey);
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
    generateSuccessors(currentNode, goal) {
        const successors = [];
        for (const action of this.availableActions.values()) {
            // Check if action is applicable
            if (!this.isActionApplicable(action, currentNode.worldState)) {
                continue;
            }
            // Apply action to get new world state
            const newWorldState = this.applyAction(action, currentNode.worldState);
            // Create successor node
            const successor = {
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
    calculateHeuristic(worldState, goal) {
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
    isActionApplicable(action, worldState) {
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
    applyAction(action, worldState) {
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
    isGoalAchieved(worldState, goal) {
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
    convertActionsToSteps(actions) {
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
            status: types_1.PlanStepStatus.PENDING,
            dependencies: index > 0 ? [`step-${index}`] : [],
            estimatedDuration: action.duration,
            preconditions: this.convertToConditionArray(action.preconditions),
            effects: this.convertToEffectArray(action.effects),
            order: index,
            resources: Object.entries(action.resources).map(([type, amount]) => ({
                type,
                amount,
                availability: 'available',
            })),
        }));
    }
    /**
     * Convert record to Precondition array
     */
    convertToConditionArray(conditions) {
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
    convertToEffectArray(effects) {
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
    mapActionNameToType(actionName) {
        const name = actionName.toLowerCase();
        if (name.includes('move') ||
            name.includes('navigate') ||
            name.includes('travel')) {
            return types_1.ActionType.MOVEMENT;
        }
        if (name.includes('craft') ||
            name.includes('build') ||
            name.includes('make')) {
            return types_1.ActionType.CRAFTING;
        }
        if (name.includes('attack') ||
            name.includes('fight') ||
            name.includes('defend')) {
            return types_1.ActionType.COMBAT;
        }
        if (name.includes('talk') ||
            name.includes('communicate') ||
            name.includes('trade')) {
            return types_1.ActionType.SOCIAL;
        }
        if (name.includes('explore') ||
            name.includes('search') ||
            name.includes('scout')) {
            return types_1.ActionType.EXPLORATION;
        }
        // Default to interaction for anything else
        return types_1.ActionType.INTERACTION;
    }
    /**
     * Initialize default actions for basic behaviors
     */
    initializeDefaultActions() {
        const defaultActions = [
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
    addAction(action) {
        this.availableActions.set(action.id, action);
    }
    /**
     * Remove action from the planner
     */
    removeAction(actionId) {
        this.availableActions.delete(actionId);
    }
    // Helper methods for plan management
    generateCacheKey(goal, worldState) {
        return `${goal.id}-${JSON.stringify(worldState)}`;
    }
    generateStateKey(worldState) {
        return JSON.stringify(worldState);
    }
    refreshPlan(plan) {
        return {
            ...plan,
            updatedAt: Date.now(),
        };
    }
    createEmptyPlan(goal, reason) {
        return {
            id: `empty-plan-${Date.now()}`,
            goalId: goal.id,
            steps: [],
            status: types_1.PlanStatus.FAILED,
            priority: goal.priority,
            estimatedDuration: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            successProbability: 0,
        };
    }
    estimateSuccessProbability(actions, goal, worldState) {
        // Simple heuristic based on plan length and action costs
        const totalCost = actions.reduce((sum, action) => sum + action.cost, 0);
        const avgCost = totalCost / Math.max(actions.length, 1);
        // Lower costs and shorter plans = higher success probability
        return Math.max(0.1, Math.min(0.95, 1.0 - avgCost / 10 - actions.length / 20));
    }
    findFailurePoint(plan, currentWorldState) {
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
    extractRemainingGoal(plan, failurePoint) {
        // Extract goal from the original plan's final effects
        const remainingSteps = plan.steps.slice(failurePoint);
        const conditions = {};
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
    mergePlans(originalPlan, repairPlan, failurePoint) {
        const executedSteps = originalPlan.steps.slice(0, failurePoint);
        const newSteps = [...executedSteps, ...repairPlan.steps];
        return {
            ...originalPlan,
            id: `repaired-${originalPlan.id}`,
            steps: newSteps,
            status: types_1.PlanStatus.PENDING,
            estimatedDuration: newSteps.reduce((sum, step) => sum + step.estimatedDuration, 0),
            updatedAt: Date.now(),
            successProbability: repairPlan.successProbability * 0.9, // Slight penalty for repair
        };
    }
    /**
     * Get planner statistics
     */
    getStatistics() {
        return {
            availableActions: this.availableActions.size,
            cachedPlans: this.planCache.size,
            config: this.config,
        };
    }
    /**
     * Clear plan cache
     */
    clearCache() {
        this.planCache.clear();
    }
}
exports.GOAPPlanner = GOAPPlanner;
/**
 * Factory function for creating GOAP planner
 */
function createGOAPPlanner(config) {
    return new GOAPPlanner(config);
}
//# sourceMappingURL=goap-planner.js.map
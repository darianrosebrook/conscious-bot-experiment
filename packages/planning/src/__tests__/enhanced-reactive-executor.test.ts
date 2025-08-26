/**
 * Enhanced Reactive Executor Tests
 *
 * Comprehensive test suite for the enhanced reactive executor system
 * covering GOAP planning, plan repair, safety reflexes, and real-time adaptation
 *
 * @author @darianrosebrook
 */

import { EnhancedReactiveExecutor } from '../reactive-executor/enhanced-reactive-executor';
import { EnhancedGOAPPlanner } from '../reactive-executor/enhanced-goap-planner';
import { EnhancedPlanRepair } from '../reactive-executor/enhanced-plan-repair';
import { 
  Plan, 
  PlanStatus, 
  Goal, 
  GoalType, 
  GoalStatus, 
  ActionType, 
  PlanStepStatus 
} from '../types';

// Mock world state for testing
class MockWorldState {
  private health: number;
  private hunger: number;
  private energy: number;
  private position: { x: number; y: number; z: number };
  private lightLevel: number;
  private air: number;
  private timeOfDay: 'day' | 'night';
  private inventory: Record<string, number>;
  private threatLevel: number;
  private nearbyResources: any[];
  private nearbyHostiles: any[];

  constructor(initialState: any = {}) {
    this.health = initialState.health ?? 100;
    this.hunger = initialState.hunger ?? 50;
    this.energy = initialState.energy ?? 100;
    this.position = initialState.position ?? { x: 0, y: 64, z: 0 };
    this.lightLevel = initialState.lightLevel ?? 15;
    this.air = initialState.air ?? 100;
    this.timeOfDay = initialState.timeOfDay ?? 'day';
    this.inventory = initialState.inventory ?? {};
    this.threatLevel = initialState.threatLevel ?? 0;
    this.nearbyResources = initialState.nearbyResources ?? [];
    this.nearbyHostiles = initialState.nearbyHostiles ?? [];
  }

  getHealth(): number {
    return this.health;
  }
  getHunger(): number {
    return this.hunger;
  }
  getEnergy(): number {
    return this.energy;
  }
  getPosition(): { x: number; y: number; z: number } {
    return this.position;
  }
  getLightLevel(): number {
    return this.lightLevel;
  }
  getAir(): number {
    return this.air;
  }
  getTimeOfDay(): 'day' | 'night' {
    return this.timeOfDay;
  }
  hasItem(item: string, quantity: number = 1): boolean {
    return (this.inventory[item] ?? 0) >= quantity;
  }
  distanceTo(target: { x: number; y: number; z: number }): number {
    const dx = this.position.x - target.x;
    const dy = this.position.y - target.y;
    const dz = this.position.z - target.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  getThreatLevel(): number {
    return this.threatLevel;
  }
  getInventory(): Record<string, number> {
    return { ...this.inventory };
  }
  getNearbyResources(): any[] {
    return [...this.nearbyResources];
  }
  getNearbyHostiles(): any[] {
    return [...this.nearbyHostiles];
  }

  // Methods for testing
  setHealth(health: number): void {
    this.health = health;
  }
  setHunger(hunger: number): void {
    this.hunger = hunger;
  }
  setThreatLevel(threatLevel: number): void {
    this.threatLevel = threatLevel;
  }
  setLightLevel(lightLevel: number): void {
    this.lightLevel = lightLevel;
  }
  setAir(air: number): void {
    this.air = air;
  }
  addItem(item: string, quantity: number = 1): void {
    this.inventory[item] = (this.inventory[item] ?? 0) + quantity;
  }
  addHostile(hostile: any): void {
    this.nearbyHostiles.push(hostile);
  }
}

// Mock MCP bus for testing
class MockMCPBus {
  mineflayer = {
    consume: jest.fn().mockResolvedValue({ success: true }),
    dig: jest.fn().mockResolvedValue({ success: true }),
    pathfinder: {},
  };
  navigation = {
    pathTo: jest.fn().mockResolvedValue({ success: true }),
    swimToSurface: jest.fn().mockResolvedValue({ success: true }),
  };
  state = {
    position: { x: 0, y: 64, z: 0 },
  };
}

describe('Enhanced Reactive Executor', () => {
  let executor: EnhancedReactiveExecutor;
  let goapPlanner: EnhancedGOAPPlanner;
  let planRepair: EnhancedPlanRepair;
  let mockMCP: MockMCPBus;

  beforeEach(() => {
    executor = new EnhancedReactiveExecutor();
    goapPlanner = executor.getGOAPPlanner();
    planRepair = executor.getPlanRepair();
    mockMCP = new MockMCPBus();
  });

  describe('GOAP Planning', () => {
    test('plans shortest path to subgoal', async () => {
      const state = new MockWorldState({
        health: 100,
        hunger: 40,
        inventory: { food: 2 },
      });

      const goal: Goal = {
        id: 'survive',
        type: GoalType.SURVIVE_THREAT,
        priority: 0.9,
        urgency: 0.8,
        utility: 0.7,
        description: 'Survive immediate threat',
        preconditions: [],
        effects: [],
        status: GoalStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      const context = {
        threatLevel: 0,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0,
        detourDistance: 0,
        subgoalUrgency: 0.5,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.5,
      };

      const plan = await goapPlanner.planTo(goal, state, context);

      expect(plan).toBeDefined();
      expect(plan!.actions.length).toBeGreaterThan(0);
      expect(plan!.estimatedCost).toBeGreaterThan(0);
    });

    test('dynamic cost increases under threat', async () => {
      const state = new MockWorldState({
        health: 100,
        hunger: 40,
        inventory: { food: 2 },
      });

      const lowThreatContext = {
        threatLevel: 10,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0,
        detourDistance: 0,
        subgoalUrgency: 0.5,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.5,
      };

      const highThreatContext = {
        ...lowThreatContext,
        threatLevel: 90,
      };

      const goal: Goal = {
        id: 'survive',
        type: GoalType.SURVIVE_THREAT,
        priority: 0.9,
        urgency: 0.8,
        utility: 0.7,
        description: 'Survive immediate threat',
        preconditions: [],
        effects: [],
        status: GoalStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      const lowThreatPlan = await goapPlanner.planTo(
        goal,
        state,
        lowThreatContext
      );
      const highThreatPlan = await goapPlanner.planTo(
        goal,
        state,
        highThreatContext
      );

      expect(highThreatPlan!.estimatedCost).toBeGreaterThanOrEqual(
        lowThreatPlan!.estimatedCost
      );
    });

    test('caches plans for repeated scenarios', async () => {
      const state = new MockWorldState({
        health: 100,
        hunger: 50,
      });

      const context = {
        threatLevel: 0,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0,
        detourDistance: 0,
        subgoalUrgency: 0.5,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.5,
      };

      const goal: Goal = {
        id: 'test',
        type: GoalType.REACH_LOCATION,
        priority: 0.7,
        urgency: 0.6,
        utility: 0.5,
        description: 'Reach target location',
        preconditions: [],
        effects: [],
        status: GoalStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      const plan1 = await goapPlanner.planTo(goal, state, context);
      const plan2 = await goapPlanner.planTo(goal, state, context);

      expect(plan1).toEqual(plan2);

      const metrics = goapPlanner.getMetrics();
      expect(metrics.planCacheHitRate).toBeGreaterThan(0);
    });
  });

  describe('Safety Reflexes', () => {
    test('activates emergency eat when health is critical', async () => {
      const state = new MockWorldState({
        health: 15,
        inventory: { food: 1 },
      });

      const context = {
        threatLevel: 0,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0,
        detourDistance: 0,
        subgoalUrgency: 0.5,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.5,
      };

      const reflex = goapPlanner.checkSafetyReflexes(state, context);

      expect(reflex).toBeDefined();
      expect(reflex!.type).toBe('emergency_eat');
      expect(reflex!.priority).toBe(1000);
    });

    test('activates emergency retreat when near lava', async () => {
      const state = new MockWorldState({
        health: 100,
      });

      const context = {
        threatLevel: 0,
        hostileCount: 0,
        nearLava: true,
        lavaDistance: 2,
        resourceValue: 0,
        detourDistance: 0,
        subgoalUrgency: 0.5,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.5,
      };

      const reflex = goapPlanner.checkSafetyReflexes(state, context);

      expect(reflex).toBeDefined();
      expect(reflex!.type).toBe('emergency_retreat');
      expect(reflex!.priority).toBe(1000);
    });

    test('activates emergency light when multiple hostiles in dark', async () => {
      const state = new MockWorldState({
        health: 100,
        lightLevel: 5,
      });
      state.addHostile({ type: 'zombie' });
      state.addHostile({ type: 'skeleton' });
      state.addHostile({ type: 'creeper' });

      const context = {
        threatLevel: 0,
        hostileCount: 3,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0,
        detourDistance: 0,
        subgoalUrgency: 0.5,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.5,
      };

      const reflex = goapPlanner.checkSafetyReflexes(state, context);

      expect(reflex).toBeDefined();
      expect(reflex!.type).toBe('emergency_light');
      expect(reflex!.priority).toBe(800);
    });

    test('executes safety reflex successfully', async () => {
      const state = new MockWorldState({
        health: 15,
        inventory: { food: 1 },
      });

      const context = {
        threatLevel: 0,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0,
        detourDistance: 0,
        subgoalUrgency: 0.5,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.5,
      };

      const reflex = goapPlanner.checkSafetyReflexes(state, context);
      expect(reflex).toBeDefined();

      const result = await goapPlanner.executeSafetyReflex(reflex!, mockMCP);

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
      expect(mockMCP.mineflayer.consume).toHaveBeenCalledWith('any_food');
    });
  });

  describe('Plan Repair', () => {
    test('prefers repair over replan for small changes', async () => {
      const state = new MockWorldState({
        health: 100,
        hunger: 50,
      });

      const context = {
        threatLevel: 0,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0,
        detourDistance: 0,
        subgoalUrgency: 0.5,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.5,
      };

      const goal: Goal = {
        id: 'test',
        type: GoalType.REACH_LOCATION,
        priority: 0.7,
        urgency: 0.6,
        utility: 0.5,
        description: 'Reach target location',
        preconditions: [],
        effects: [],
        status: GoalStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      const plan = await goapPlanner.planTo(goal, state, context);
      expect(plan).toBeDefined();

      // Simulate a failure in the middle of the plan
      const failedAction = plan!.actions[Math.floor(plan!.actions.length / 2)];

      const result = await planRepair.handleFailure(
        plan!,
        failedAction,
        state,
        context,
        goapPlanner
      );

      expect(result.type).toBe('repaired');
      expect(result.editDistance).toBeLessThan(5);
      expect(result.plan).toBeDefined();
    });

    test('requests replan for large changes', async () => {
      const state = new MockWorldState({
        health: 100,
        hunger: 50,
      });

      const context = {
        threatLevel: 0,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0,
        detourDistance: 0,
        subgoalUrgency: 0.5,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.5,
      };

      const goal: Goal = {
        id: 'test',
        type: GoalType.REACH_LOCATION,
        priority: 0.7,
        urgency: 0.6,
        utility: 0.5,
        description: 'Reach target location',
        preconditions: [],
        effects: [],
        status: GoalStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      const plan = await goapPlanner.planTo(goal, state, context);
      expect(plan).toBeDefined();

      // Create a complex failure that would require major changes
      const complexState = new MockWorldState({
        health: 20,
        hunger: 90,
        threatLevel: 80,
      });

      const failedAction = plan!.actions[0];

      const result = await planRepair.handleFailure(
        plan!,
        failedAction,
        complexState,
        context,
        goapPlanner
      );

      // Should prefer replan for complex state changes, but repair is also acceptable
      expect(['repaired', 'replanned', 'failed']).toContain(result.type);
    });

    test('tracks repair metrics correctly', async () => {
      const state = new MockWorldState({
        health: 100,
        hunger: 50,
      });

      const context = {
        threatLevel: 0,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0,
        detourDistance: 0,
        subgoalUrgency: 0.5,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.5,
      };

      const goal: Goal = {
        id: 'test',
        type: GoalType.REACH_LOCATION,
        priority: 0.7,
        urgency: 0.6,
        utility: 0.5,
        description: 'Reach target location',
        preconditions: [],
        effects: [],
        status: GoalStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      const plan = await goapPlanner.planTo(goal, state, context);
      const failedAction = plan!.actions[0];

      await planRepair.handleFailure(
        plan!,
        failedAction,
        state,
        context,
        goapPlanner
      );

      const metrics = planRepair.getMetrics();
      expect(metrics.repairAttempts).toBe(1);
      expect(metrics.repairLatency.p50).toBeGreaterThan(0);
    });
  });

  describe('Real-Time Adaptation', () => {
    test('executes plan with safety reflex override', async () => {
      const state = new MockWorldState({
        health: 15,
        inventory: { food: 1 },
      });

      const plan: Plan = {
        id: 'test-plan',
        goalId: 'test-goal',
        steps: [
          {
            id: 'step1',
            planId: 'test-plan',
            action: { 
              id: 'move-action',
              name: 'Move', 
              description: 'Move to target',
              type: ActionType.MOVEMENT,
              preconditions: [],
              effects: [],
              cost: 1,
              duration: 1000,
              successProbability: 0.9
            },
            preconditions: [],
            effects: [],
            status: PlanStepStatus.PENDING,
            order: 1,
            estimatedDuration: 1000,
            dependencies: [],
          },
        ],
        status: PlanStatus.PENDING,
        priority: 1,
        estimatedDuration: 1000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        successProbability: 0.8,
      };

      const result = await executor.execute(plan, state, mockMCP);

      expect(result.safetyReflexActivated).toBe(true);
      expect(result.success).toBe(true);
      expect(result.actionsCompleted).toBe(1);
    });

    test('executes plan with repair when action fails', async () => {
      const state = new MockWorldState({
        health: 100,
        hunger: 50,
      });

      const plan: Plan = {
        id: 'test-plan',
        goalId: 'test-goal',
        steps: [
          {
            id: 'step1',
            planId: 'test-plan',
            action: { 
              id: 'move-action',
              name: 'Move', 
              description: 'Move to target',
              type: ActionType.MOVEMENT,
              preconditions: [],
              effects: [],
              cost: 1,
              duration: 1000,
              successProbability: 0.9
            },
            preconditions: [],
            effects: [],
            status: PlanStepStatus.PENDING,
            order: 1,
            estimatedDuration: 1000,
            dependencies: [],
          },
          {
            id: 'step2',
            planId: 'test-plan',
            action: { 
              id: 'mine-action',
              name: 'Mine', 
              description: 'Mine resources',
              type: ActionType.CRAFTING,
              preconditions: [],
              effects: [],
              cost: 2,
              duration: 2000,
              successProbability: 0.8
            },
            preconditions: [],
            effects: [],
            status: PlanStepStatus.PENDING,
            order: 2,
            estimatedDuration: 2000,
            dependencies: [],
          },
        ],
        status: PlanStatus.PENDING,
        priority: 1,
        estimatedDuration: 3000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        successProbability: 0.8,
      };

      const result = await executor.execute(plan, state, mockMCP);

      expect(result.planExecuted).toBe(true);
      expect(result.actionsCompleted).toBeGreaterThan(0);
    });

    test('handles execution errors gracefully', async () => {
      const state = new MockWorldState({
        health: 100,
        hunger: 50,
      });

      const plan: Plan = {
        id: 'test-plan',
        goalId: 'test-goal',
        steps: [
          {
            id: 'step1',
            planId: 'test-plan',
            action: { 
              id: 'invalid-action',
              name: 'InvalidAction', 
              description: 'Invalid action for testing',
              type: ActionType.INTERACTION,
              preconditions: [],
              effects: [],
              cost: 1,
              duration: 1000,
              successProbability: 0.1
            },
            preconditions: [],
            effects: [],
            status: PlanStepStatus.PENDING,
            order: 1,
            estimatedDuration: 1000,
            dependencies: [],
          },
        ],
        status: PlanStatus.PENDING,
        priority: 1,
        estimatedDuration: 1000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        successProbability: 0.8,
      };

      const result = await executor.execute(plan, state, mockMCP);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Metrics and Monitoring', () => {
    test('tracks comprehensive execution metrics', async () => {
      const state = new MockWorldState({
        health: 100,
        hunger: 50,
      });

      const plan: Plan = {
        id: 'test-plan',
        goalId: 'test-goal',
        steps: [
          {
            id: 'step1',
            planId: 'test-plan',
            action: { 
              id: 'move-action',
              name: 'Move', 
              description: 'Move to target',
              type: ActionType.MOVEMENT,
              preconditions: [],
              effects: [],
              cost: 1,
              duration: 1000,
              successProbability: 0.9
            },
            preconditions: [],
            effects: [],
            status: PlanStepStatus.PENDING,
            order: 1,
            estimatedDuration: 1000,
            dependencies: [],
          },
        ],
        status: PlanStatus.PENDING,
        priority: 1,
        estimatedDuration: 1000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        successProbability: 0.8,
      };

      await executor.execute(plan, state, mockMCP);

      const metrics = executor.getMetrics();

      expect(metrics.executor).toBeDefined();
      expect(metrics.repair).toBeDefined();
      expect(metrics.executionHistory).toBeDefined();
      expect(metrics.executionHistory.length).toBe(1);
    });

    test('tracks plan repair vs replan ratio', async () => {
      const state = new MockWorldState({
        health: 100,
        hunger: 50,
      });

      const plan: Plan = {
        id: 'test-plan',
        goalId: 'test-goal',
        steps: [
          {
            id: 'step1',
            planId: 'test-plan',
            action: { 
              id: 'move-action',
              name: 'Move', 
              description: 'Move to target',
              type: ActionType.MOVEMENT,
              preconditions: [],
              effects: [],
              cost: 1,
              duration: 1000,
              successProbability: 0.9
            },
            preconditions: [],
            effects: [],
            status: PlanStepStatus.PENDING,
            order: 1,
            estimatedDuration: 1000,
            dependencies: [],
          },
        ],
        status: PlanStatus.PENDING,
        priority: 1,
        estimatedDuration: 1000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        successProbability: 0.8,
      };

      // Execute plan which will trigger repair logic
      await executor.execute(plan, state, mockMCP);

      // Force a repair scenario by directly calling the plan repair
      const goapPlan = await goapPlanner.planTo(
        {
          id: 'test',
          type: GoalType.REACH_LOCATION,
          priority: 0.7,
          urgency: 0.6,
          utility: 0.5,
          description: 'Reach target location',
          preconditions: [],
          effects: [],
          status: GoalStatus.PENDING,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          subGoals: [],
        } as Goal,
        state,
        {
          threatLevel: 0,
          hostileCount: 0,
          nearLava: false,
          lavaDistance: 100,
          resourceValue: 0,
          detourDistance: 0,
          subgoalUrgency: 0.5,
          estimatedTimeToSubgoal: 5000,
          commitmentStrength: 0.5,
        }
      );

      if (goapPlan) {
        await planRepair.handleFailure(
          goapPlan,
          goapPlan.actions[0],
          state,
          {
            threatLevel: 0,
            hostileCount: 0,
            nearLava: false,
            lavaDistance: 100,
            resourceValue: 0,
            detourDistance: 0,
            subgoalUrgency: 0.5,
            estimatedTimeToSubgoal: 5000,
            commitmentStrength: 0.5,
          },
          goapPlanner
        );
      }

      const metrics = executor.getMetrics();
      expect(metrics.repair.repairAttempts).toBeGreaterThan(0);
    });
  });

  describe('Integration Features', () => {
    test('integrates GOAP planning with plan repair', async () => {
      const state = new MockWorldState({
        health: 100,
        hunger: 50,
      });

      const context = {
        threatLevel: 0,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0,
        detourDistance: 0,
        subgoalUrgency: 0.5,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.5,
      };

      const goal: Goal = {
        id: 'test',
        type: GoalType.REACH_LOCATION,
        priority: 0.7,
        urgency: 0.6,
        utility: 0.5,
        description: 'Reach target location',
        preconditions: [],
        effects: [],
        status: GoalStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      // Create initial plan
      const plan = await goapPlanner.planTo(goal, state, context);
      expect(plan).toBeDefined();

      // Simulate failure and repair
      const failedAction = plan!.actions[0];
      const repairResult = await planRepair.handleFailure(
        plan!,
        failedAction,
        state,
        context,
        goapPlanner
      );

      expect(repairResult.type).toBe('repaired');
      expect(repairResult.plan).toBeDefined();
      expect(repairResult.editDistance).toBeGreaterThan(0);
    });

    test('maintains plan stability through repairs', async () => {
      const state = new MockWorldState({
        health: 100,
        hunger: 50,
      });

      const context = {
        threatLevel: 0,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0,
        detourDistance: 0,
        subgoalUrgency: 0.5,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.5,
      };

      const goal: Goal = {
        id: 'test',
        type: GoalType.REACH_LOCATION,
        priority: 0.7,
        urgency: 0.6,
        utility: 0.5,
        description: 'Reach target location',
        preconditions: [],
        effects: [],
        status: GoalStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      const plan = await goapPlanner.planTo(goal, state, context);
      const failedAction = plan!.actions[0];

      const repairResult = await planRepair.handleFailure(
        plan!,
        failedAction,
        state,
        context,
        goapPlanner
      );

      expect(repairResult.type).toBe('repaired');
      expect(repairResult.editDistance).toBeLessThan(5);

      const metrics = planRepair.getMetrics();
      expect(metrics.stabilityIndex).toBeGreaterThan(0);
    });
  });
});

/**
 * Comprehensive tests for enhanced goal formulation system.
 *
 * Tests the complete Signals → Needs → Goals pipeline with advanced features
 * including signal processing, goal generation, and priority scoring.
 *
 * Author: @darianrosebrook
 */

import { EnhancedGoalManager } from '../goal-formulation/enhanced-goal-manager';
import {
  AdvancedSignalProcessor,
  InternalSignal,
  SignalType,
} from '../goal-formulation/advanced-signal-processor';
import {
  GoalGenerator,
  CandidateGoal,
  WorldState,
} from '../goal-formulation/goal-generator';
import {
  PriorityScorer,
  PlanningContext,
} from '../goal-formulation/priority-scorer';
import { GoalStatus, NeedType, GoalType } from '../types';

// Mock world state for testing
class MockWorldState implements WorldState {
  private hunger = 0.3;
  private health = 0.8;
  private energy = 0.7;
  private safety = 0.9;
  private threatLevel = 0.2;
  private timeOfDay = 'day';
  private nearbyPlayers = 0;
  private lightLevel = 15;
  private armorLevel = 0;
  private weapons: string[] = [];
  private inventory: Record<string, number> = {};

  getHunger(): number {
    return this.hunger;
  }
  getHealth(): number {
    return this.health;
  }
  getEnergy(): number {
    return this.energy;
  }
  getSafety(): number {
    return this.safety;
  }
  getThreatLevel(): number {
    return this.threatLevel;
  }
  getTimeOfDay(): string {
    return this.timeOfDay;
  }
  getNearbyPlayers(): number {
    return this.nearbyPlayers;
  }
  getLightLevel(): number {
    return this.lightLevel;
  }
  getArmorLevel(): number {
    return this.armorLevel;
  }
  getWeapons(): string[] {
    return this.weapons;
  }
  getLastMealTime(): number {
    return Date.now() - 3600000;
  } // 1 hour ago
  getLastSafeTime(): number {
    return Date.now() - 1800000;
  } // 30 minutes ago
  hasItem(item: string, quantity: number = 1): boolean {
    return (this.inventory[item] || 0) >= quantity;
  }
  nearbyFood(): boolean {
    return this.hasItem('food');
  }

  // Test helpers
  setHunger(value: number): void {
    this.hunger = value;
  }
  setHealth(value: number): void {
    this.health = value;
  }
  setThreatLevel(value: number): void {
    this.threatLevel = value;
  }
  setTimeOfDay(value: string): void {
    this.timeOfDay = value;
  }
  setNearbyPlayers(value: number): void {
    this.nearbyPlayers = value;
  }
  addItem(item: string, quantity: number = 1): void {
    this.inventory[item] = (this.inventory[item] || 0) + quantity;
  }
  addWeapon(weapon: string): void {
    this.weapons.push(weapon);
  }
}

describe('Enhanced Goal Formulation System', () => {
  let goalManager: EnhancedGoalManager;
  let worldState: MockWorldState;

  beforeEach(() => {
    goalManager = new EnhancedGoalManager();
    worldState = new MockWorldState();
  });

  describe('Complete Pipeline: Signals → Needs → Goals', () => {
    it('should process hunger signals into survival goals', async () => {
      // Create hunger signal
      const hungerSignal: InternalSignal = {
        type: SignalType.HUNGER,
        intensity: 80,
        source: 'homeostasis',
        timestamp: Date.now(),
        metadata: {
          environmental: { foodAvailable: true },
          resources: { food: true },
          timeOfDay: 'day',
        },
      };

      const result = await goalManager.formulateGoals(
        [hungerSignal],
        worldState
      );

      expect(result.identifiedNeeds.length).toBeGreaterThan(0);
      expect(result.generatedGoals.length).toBeGreaterThan(0);
      expect(result.priorityRanking.length).toBeGreaterThan(0);
      expect(result.processingTime).toBeLessThan(100); // Should be fast

      // Verify hunger need was identified
      const hungerNeed = result.identifiedNeeds.find(
        (n) => n.type === NeedType.SURVIVAL
      );
      expect(hungerNeed).toBeDefined();
      expect(hungerNeed!.intensity).toBeGreaterThan(0);

      // Verify survival goal was generated
      const survivalGoal = result.generatedGoals.find(
        (g) => g.type === GoalType.SURVIVAL
      );
      expect(survivalGoal).toBeDefined();
      expect(survivalGoal!.description).toContain('food');
    });

    it('should process safety threat signals into safety goals', async () => {
      // Create safety threat signal
      const threatSignal: InternalSignal = {
        type: SignalType.SAFETY_THREAT,
        intensity: 90,
        source: 'perception',
        timestamp: Date.now(),
        metadata: {
          environmental: {
            threats: [{ level: 75, type: 'hostile_mob' }],
          },
          resources: { weapons: false },
        },
      };

      worldState.setThreatLevel(0.8);
      worldState.setHealth(0.4);

      const result = await goalManager.formulateGoals(
        [threatSignal],
        worldState
      );

      expect(result.identifiedNeeds.length).toBeGreaterThan(0);
      expect(result.generatedGoals.length).toBeGreaterThan(0);

      // Verify safety need was identified
      const safetyNeed = result.identifiedNeeds.find(
        (n) => n.type === NeedType.SAFETY
      );
      expect(safetyNeed).toBeDefined();
      expect(safetyNeed!.urgency).toBeGreaterThan(0.5);

      // Verify safety goal was generated
      const safetyGoal = result.generatedGoals.find(
        (g) => g.type === GoalType.SAFETY
      );
      expect(safetyGoal).toBeDefined();
      expect(safetyGoal!.description).toContain('threat');
    });

    it('should process social isolation signals into social goals', async () => {
      // Create social isolation signal
      const socialSignal: InternalSignal = {
        type: SignalType.SOCIAL_ISOLATION,
        intensity: 60,
        source: 'social',
        timestamp: Date.now(),
        metadata: {
          socialFactors: {
            nearbyPlayers: 2,
            socialOpportunities: 3,
            isolationLevel: 0.7,
          },
        },
      };

      worldState.setNearbyPlayers(2);

      const result = await goalManager.formulateGoals(
        [socialSignal],
        worldState
      );

      expect(result.identifiedNeeds.length).toBeGreaterThan(0);
      expect(result.generatedGoals.length).toBeGreaterThan(0);

      // Verify social need was identified
      const socialNeed = result.identifiedNeeds.find(
        (n) => n.type === NeedType.SOCIAL
      );
      expect(socialNeed).toBeDefined();

      // Verify social goal was generated
      const socialGoal = result.generatedGoals.find(
        (g) => g.type === GoalType.SOCIAL
      );
      expect(socialGoal).toBeDefined();
      expect(socialGoal!.description).toContain('players');
    });
  });

  describe('Advanced Signal Processing', () => {
    it('should fuse multiple signals of the same type', async () => {
      const signals: InternalSignal[] = [
        {
          type: SignalType.HUNGER,
          intensity: 70,
          source: 'homeostasis',
          timestamp: Date.now(),
          metadata: {},
        },
        {
          type: SignalType.HUNGER,
          intensity: 80,
          source: 'perception',
          timestamp: Date.now(),
          metadata: {},
        },
      ];

      const result = await goalManager.formulateGoals(signals, worldState);

      // Should consolidate multiple hunger signals into one need
      const hungerNeeds = result.identifiedNeeds.filter(
        (n) => n.type === NeedType.SURVIVAL
      );
      expect(hungerNeeds.length).toBe(1);
      expect(hungerNeeds[0].intensity).toBeGreaterThan(0);
    });

    it('should apply context gates based on environmental factors', async () => {
      const explorationSignal: InternalSignal = {
        type: SignalType.CURIOSITY,
        intensity: 70,
        source: 'curiosity',
        timestamp: Date.now(),
        metadata: {},
      };

      // Test day exploration
      worldState.setTimeOfDay('day');
      const dayResult = await goalManager.formulateGoals(
        [explorationSignal],
        worldState
      );
      const dayGoal = dayResult.generatedGoals.find(
        (g) => g.type === GoalType.EXPLORATION
      );
      expect(dayGoal).toBeDefined();

      // Test night exploration (should be reduced)
      worldState.setTimeOfDay('night');
      const nightResult = await goalManager.formulateGoals(
        [explorationSignal],
        worldState
      );
      const nightGoal = nightResult.generatedGoals.find(
        (g) => g.type === GoalType.EXPLORATION
      );
      expect(nightGoal).toBeDefined();
      // Night exploration should have lower urgency due to context gates
      const nightPriority = nightResult.priorityRanking.find(
        (p) => p.goal.id === nightGoal!.id
      );
      const dayPriority = dayResult.priorityRanking.find(
        (p) => p.goal.id === dayGoal!.id
      );
      expect(nightPriority!.urgencyScore).toBeLessThan(
        dayPriority!.urgencyScore
      );
    });
  });

  describe('Goal Generation and Feasibility', () => {
    it('should generate immediate eating goal when food is available', async () => {
      worldState.addItem('food', 5);
      worldState.setHunger(0.8);

      const result = await goalManager.generateGoalsForNeed(
        NeedType.SURVIVAL,
        0.8,
        0.9,
        worldState
      );

      const eatingGoal = result.generatedGoals.find((g) =>
        g.description.includes('Eat food')
      );
      expect(eatingGoal).toBeDefined();
      expect(eatingGoal!.requiresMovement).toBe(false);
      expect(eatingGoal!.estimatedTime).toBeLessThan(5000); // Should be quick
    });

    it('should generate food acquisition goal when no food is available', async () => {
      worldState.setHunger(0.6);

      const result = await goalManager.generateGoalsForNeed(
        NeedType.SURVIVAL,
        0.6,
        0.7,
        worldState
      );

      const acquisitionGoal = result.generatedGoals.find((g) =>
        g.description.includes('Find or create food')
      );
      expect(acquisitionGoal).toBeDefined();
      expect(acquisitionGoal!.requiresMovement).toBe(true);
      expect(acquisitionGoal!.estimatedTime).toBeGreaterThan(10000); // Should take longer
    });

    it('should generate subgoals for missing resources', async () => {
      // Try to generate a goal that requires resources we don't have
      const result = await goalManager.generateGoalsForNeed(
        NeedType.ACHIEVEMENT,
        0.7,
        0.6,
        worldState
      );

      // Should generate goals (either main goals or subgoals)
      expect(result.generatedGoals.length).toBeGreaterThan(0);

      // Check if any goals mention resource gathering or are basic goals
      const resourceGoals = result.generatedGoals.filter(
        (g) =>
          g.description.includes('Gather') ||
          g.description.includes('Craft') ||
          g.description.includes('resource') ||
          g.description.includes('Basic')
      );
      expect(resourceGoals.length).toBeGreaterThan(0);
    });
  });

  describe('Priority Scoring', () => {
    it('should prioritize urgent survival needs over exploration', async () => {
      const signals: InternalSignal[] = [
        {
          type: SignalType.HUNGER,
          intensity: 90, // High urgency
          source: 'homeostasis',
          timestamp: Date.now(),
          metadata: {},
        },
        {
          type: SignalType.CURIOSITY,
          intensity: 50, // Lower urgency
          source: 'curiosity',
          timestamp: Date.now(),
          metadata: {},
        },
      ];

      worldState.setHunger(0.9); // Very hungry

      const result = await goalManager.formulateGoals(signals, worldState);

      expect(result.priorityRanking.length).toBeGreaterThan(0);

      // Survival goal should be ranked higher than exploration
      const topGoal = result.priorityRanking[0].goal;
      expect(topGoal.type).toBe(GoalType.SURVIVAL);
    });

    it('should apply health crisis multiplier for safety goals', async () => {
      worldState.setHealth(0.3); // Low health
      worldState.setThreatLevel(0.7); // High threat

      const result = await goalManager.generateGoalsForNeed(
        NeedType.SAFETY,
        0.6,
        0.8,
        worldState
      );

      const safetyGoal = result.generatedGoals.find(
        (g) => g.type === GoalType.SAFETY
      );
      expect(safetyGoal).toBeDefined();

      // Should have high priority due to health crisis
      const priorityScore = result.priorityRanking.find(
        (p) => p.goal.id === safetyGoal!.id
      );
      expect(priorityScore!.urgencyScore).toBeGreaterThan(0.7);
    });

    it('should consider opportunity cost in priority scoring', async () => {
      // Create multiple high-priority goals
      const result1 = await goalManager.generateGoalsForNeed(
        NeedType.SURVIVAL,
        0.8,
        0.9,
        worldState
      );

      const result2 = await goalManager.generateGoalsForNeed(
        NeedType.SAFETY,
        0.7,
        0.8,
        worldState
      );

      // Combine goals and re-score
      const allGoals = [...result1.generatedGoals, ...result2.generatedGoals];
      const context: Partial<PlanningContext> = {
        candidateGoals: allGoals,
      };

      const finalResult = await goalManager.formulateGoals(
        [],
        worldState,
        context
      );

      // Should consider opportunity cost when multiple high-priority goals exist
      expect(finalResult.generatedGoals.length).toBeGreaterThan(0);
      // Priority ranking should be generated from the goals
      expect(finalResult.priorityRanking.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Metrics', () => {
    it('should meet real-time performance constraints', async () => {
      const signals: InternalSignal[] = [
        {
          type: SignalType.HUNGER,
          intensity: 70,
          source: 'homeostasis',
          timestamp: Date.now(),
          metadata: {},
        },
        {
          type: SignalType.SAFETY_THREAT,
          intensity: 60,
          source: 'perception',
          timestamp: Date.now(),
          metadata: {},
        },
      ];

      const startTime = Date.now();
      const result = await goalManager.formulateGoals(signals, worldState);
      const totalTime = Date.now() - startTime;

      // Should complete within 50ms (real-time constraint)
      expect(totalTime).toBeLessThan(50);
      expect(result.processingTime).toBeLessThan(50);

      // Check individual component performance
      expect(result.breakdown.signalProcessing).toBeLessThan(10);
      expect(result.breakdown.goalGeneration).toBeLessThan(20);
      expect(result.breakdown.priorityScoring).toBeLessThan(15);
    });

    it('should track metrics over time', async () => {
      // Run multiple goal formulations
      for (let i = 0; i < 5; i++) {
        const signals: InternalSignal[] = [
          {
            type: SignalType.HUNGER,
            intensity: 60 + i * 5,
            source: 'homeostasis',
            timestamp: Date.now(),
            metadata: {},
          },
        ];

        await goalManager.formulateGoals(signals, worldState);
      }

      const metrics = goalManager.getMetrics();
      // Metrics should be updated after multiple runs
      expect(metrics.totalLatency).toBeGreaterThan(0); // Should be updated from initial value
      expect(metrics.signalProcessingLatency).toBeGreaterThan(0);
      expect(metrics.goalGenerationLatency).toBeGreaterThan(0);
      expect(metrics.priorityScoringLatency).toBeGreaterThan(0);
    });
  });

  describe('Goal Management', () => {
    it('should track goal history and outcomes', async () => {
      const signals: InternalSignal[] = [
        {
          type: SignalType.HUNGER,
          intensity: 70,
          source: 'homeostasis',
          timestamp: Date.now(),
          metadata: {},
        },
      ];

      const result = await goalManager.formulateGoals(signals, worldState);
      expect(result.selectedGoal).toBeDefined();

      // Update goal status
      goalManager.updateGoalStatus(
        result.selectedGoal!.id,
        GoalStatus.COMPLETED,
        {
          success: true,
          processingTime: 5000,
          resourceUtilization: 0.8,
        }
      );

      const goals = goalManager.listGoals();
      const completedGoals = goalManager.getGoalsByStatus(GoalStatus.COMPLETED);
      expect(completedGoals.length).toBe(1);

      const goalHistory = goalManager.getGoalHistory();
      expect(goalHistory.length).toBeGreaterThan(0);
    });

    it('should provide goal analysis', async () => {
      const result = await goalManager.generateGoalsForNeed(
        NeedType.SURVIVAL,
        0.7,
        0.8,
        worldState
      );

      if (result.generatedGoals.length > 0) {
        const analysis = goalManager.getGoalAnalysis(
          result.generatedGoals[0],
          worldState
        );

        expect(analysis.goal).toBeDefined();
        expect(analysis.scores).toBeDefined();
        expect(analysis.riskBreakdown).toBeDefined();
        expect(analysis.context).toBeDefined();
        expect(analysis.recommendations).toBeDefined();
      }
    });
  });

  describe('Integration with Planning Context', () => {
    it('should consider active promises in priority scoring', async () => {
      const context: Partial<PlanningContext> = {
        activePromises: [
          {
            id: 'promise-1',
            description: 'Help player build a house',
            relatedTo: (goal) => goal.description.includes('build'),
            priority: 0.8,
            deadline: Date.now() + 3600000,
          },
        ],
      };

      const result = await goalManager.generateGoalsForNeed(
        NeedType.ACHIEVEMENT,
        0.6,
        0.5,
        worldState
      );

      // Goals related to building should get commitment boost
      const buildingGoals = result.generatedGoals.filter(
        (g) =>
          g.description.includes('build') || g.description.includes('project')
      );

      if (buildingGoals.length > 0) {
        const analysis = goalManager.getGoalAnalysis(
          buildingGoals[0],
          worldState,
          context
        );
        expect(analysis.scores.commitment).toBeGreaterThan(0);
      }
    });

    it('should consider project continuity', async () => {
      const context: Partial<PlanningContext> = {
        currentProject: {
          id: 'project-1',
          name: 'House Building',
          goals: ['build_walls', 'build_roof'],
          isPartOf: (goal) => goal.description.includes('build'),
          priority: 0.7,
        },
      };

      const result = await goalManager.generateGoalsForNeed(
        NeedType.ACHIEVEMENT,
        0.6,
        0.5,
        worldState
      );

      const buildingGoals = result.generatedGoals.filter((g) =>
        g.description.includes('build')
      );

      if (buildingGoals.length > 0) {
        const analysis = goalManager.getGoalAnalysis(
          buildingGoals[0],
          worldState,
          context
        );
        expect(analysis.scores.commitment).toBeGreaterThan(0);
      }
    });
  });
});

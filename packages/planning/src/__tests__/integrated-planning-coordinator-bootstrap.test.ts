import { afterEach, describe, expect, it, vi } from 'vitest';

import { IntegratedPlanningCoordinator } from '../integrated-planning-coordinator';
import type { PlanningContext } from '../integrated-planning-coordinator';
import { PlanStatus, GoalStatus, GoalType, type Plan } from '../types';
import type { RoutingDecision } from '../hierarchical-planner/cognitive-router';

function createPlanningContext(): PlanningContext {
  const timestamp = Date.now();
  return {
    worldState: { position: { x: 0, y: 64, z: 0 } },
    currentState: {
      health: 0.9,
      hunger: 0.8,
      energy: 0.7,
      safety: 0.8,
      curiosity: 0.6,
      social: 0.3,
      achievement: 0.5,
      creativity: 0.4,
      resourceManagement: 0.5,
      shelterStability: 0.5,
      farmHealth: 0.4,
      inventoryOrganization: 0.4,
      worldKnowledge: 0.6,
      redstoneProficiency: 0.2,
      constructionSkill: 0.3,
      environmentalComfort: 0.4,
      mechanicalAptitude: 0.2,
      agriculturalKnowledge: 0.3,
      defensiveReadiness: 0.5,
      timestamp,
    },
    activeGoals: [],
    availableResources: [],
    timeConstraints: {
      urgency: 'medium',
      maxPlanningTime: 200,
    },
    situationalFactors: {
      threatLevel: 0.1,
      opportunityLevel: 0.5,
      socialContext: [],
      environmentalFactors: [],
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IntegratedPlanningCoordinator task bootstrap integration', () => {
  it('prefers bootstrap goals over new goal formulation', async () => {
    const coordinator = new IntegratedPlanningCoordinator();
    const bootstrapGoal = {
      id: 'memory-task-1',
      type: GoalType.EXPLORATION,
      priority: 0.75,
      urgency: 0.6,
      utility: 0.8,
      description: 'Resume scouting unfinished area',
      preconditions: [],
      effects: [],
      status: GoalStatus.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      subGoals: [],
      metadata: { origin: 'memory' },
    };

    const bootstrapSpy = vi
      .spyOn((coordinator as any).taskBootstrapper, 'bootstrap')
      .mockResolvedValue({
        goals: [bootstrapGoal],
        source: 'memory',
        diagnostics: {
          latencyMs: 12,
          memoryConsidered: 1,
          llmConsidered: 0,
          errors: [],
        },
      });

    const goalFormulationSpy = vi
      .spyOn(coordinator as any, 'performGoalFormulation')
      .mockResolvedValue({
        identifiedNeeds: [],
        generatedGoals: [],
        priorityRanking: [],
      });

    const routingDecision: RoutingDecision = {
      taskType: 'navigation',
      confidence: 0.9,
      router: 'hrm_structured',
      reasoning: 'bootstrap-test',
      expectedLatency: 100,
      complexity: 3,
    };

    vi.spyOn(coordinator as any, 'performCognitiveRouting').mockResolvedValue(
      routingDecision
    );

    const plan: Plan = {
      id: 'plan-1',
      goalId: bootstrapGoal.id,
      steps: [],
      status: PlanStatus.PENDING,
      priority: 0.5,
      estimatedDuration: 5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      successProbability: 0.9,
    };

    vi.spyOn(coordinator as any, 'performPlanGeneration').mockResolvedValue({
      selectedPlan: plan,
      selectionReasoning: 'bootstrap-test',
    });

    vi.spyOn(coordinator as any, 'assessPlanQuality').mockResolvedValue({
      feasibilityScore: 0.8,
      optimalityScore: 0.7,
      coherenceScore: 0.75,
      riskScore: 0.2,
    });

    vi.spyOn(coordinator as any, 'preparePlanExecution').mockResolvedValue(
      undefined
    );
    vi.spyOn(coordinator as any, 'generateAlternativePlans').mockReturnValue(
      []
    );
    vi.spyOn(coordinator as any, 'determinePlanningApproach').mockReturnValue(
      'hrm'
    );

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await coordinator.planAndExecute([], createPlanningContext());

    expect(bootstrapSpy).toHaveBeenCalledOnce();
    expect(goalFormulationSpy).not.toHaveBeenCalled();
    expect(result.goalFormulation.generatedGoals[0].id).toBe(bootstrapGoal.id);
    expect(result.goalFormulation.priorityRanking[0].reasoning).toBe('memory');

    consoleSpy.mockRestore();
  });
});

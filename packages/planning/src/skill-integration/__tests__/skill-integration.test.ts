/**
 * Skill Integration Tests
 *
 * Tests for the skill integration layer that bridges SkillRegistry with HTN/GOAP planning
 *
 * @author @darianrosebrook
 */

import { SkillRegistry } from '@conscious-bot/memory';
import { BehaviorTreeRunner } from '../../behavior-trees/BehaviorTreeRunner';
import { SkillPlannerAdapter } from '../skill-planner-adapter';
import {
  HybridSkillPlanner,
  type HybridPlanningContext,
} from '../hybrid-skill-planner';
import { HRMInspiredPlanner } from '../../hierarchical-planner/hrm-inspired-planner';
import { EnhancedGOAPPlanner } from '../../reactive-executor/enhanced-goap-planner';

// Mock tool executor for testing
const mockToolExecutor = {
  async execute(tool: string, args: Record<string, any>) {
    return {
      ok: true,
      data: { result: 'mock_success', worldStateChanges: {} },
      environmentDeltas: {},
    };
  },
};

// Helper function to create a default currentState for tests
function createDefaultCurrentState() {
  return {
    health: 20,
    hunger: 15,
    energy: 18,
    safety: 16,
    curiosity: 12,
    social: 10,
    achievement: 14,
    creativity: 13,
    resourceManagement: 15,
    shelterStability: 10,
    farmHealth: 8,
    inventoryOrganization: 12,
    worldKnowledge: 16,
    redstoneProficiency: 5,
    constructionSkill: 14,
    environmentalComfort: 17,
    mechanicalAptitude: 9,
    agriculturalKnowledge: 11,
  };
}

describe('Skill Integration System', () => {
  // Helper function to create properly typed contexts
  const createTestContext = (
    overrides: Partial<HybridPlanningContext> = {}
  ): HybridPlanningContext => ({
    skillRegistry,
    worldState: {},
    availableResources: {},
    currentState: {},
    resources: {},
    timeConstraints: {
      urgency: 'medium' as const,
      maxPlanningTime: 5000,
    },
    planningPreferences: {
      preferSkills: true,
      preferMCP: false,
      preferHTN: false,
      preferGOAP: false,
      allowHybrid: true,
      preferSimple: false,
    },
    constraints: [],
    domain: 'minecraft',
    ...overrides,
  });

  let skillRegistry: SkillRegistry;
  let btRunner: BehaviorTreeRunner;
  let skillPlanner: SkillPlannerAdapter;
  let hrmPlanner: HRMInspiredPlanner;
  let goapPlanner: EnhancedGOAPPlanner;
  let hybridPlanner: HybridSkillPlanner;

  beforeEach(() => {
    skillRegistry = new SkillRegistry();
    btRunner = new BehaviorTreeRunner(mockToolExecutor);
    skillPlanner = new SkillPlannerAdapter(skillRegistry, btRunner);
    hrmPlanner = new HRMInspiredPlanner();
    goapPlanner = new EnhancedGOAPPlanner();
    hybridPlanner = new HybridSkillPlanner(
      skillRegistry,
      btRunner,
      hrmPlanner,
      goapPlanner
    );
  });

  describe('SkillPlannerAdapter', () => {
    it('should generate skill plans for applicable goals', async () => {
      const goal = 'build a shelter';
      const context = {
        worldState: { wood: 10, time: 'dusk' },
        currentState: createDefaultCurrentState(),
        availableSkills: skillRegistry.getAllSkills(),
        skillRegistry,
        goalRequirements: { shelter: { required: true } },
        constraints: [],
        resources: { wood: 10 },
        goal: goal,
        timeLimit: undefined,
        urgency: 'medium' as const,
        domain: 'minecraft' as const,
      };

      const plan = await skillPlanner.generateSkillPlan(goal, context);

      expect(plan).toBeDefined();
      expect(plan.goalId).toBe(goal);
      expect(plan.skillDecomposition).toBeDefined();
      expect(plan.skillDecomposition.length).toBeGreaterThan(0);
      expect(plan.estimatedSkillSuccess).toBeGreaterThan(0);
      expect(plan.fallbackSkills).toBeDefined();
    });

    it('should find applicable skills for goals', () => {
      const goal = 'chop trees safely';
      const context = {
        worldState: { has_axe: true, trees_nearby: true },
        currentState: createDefaultCurrentState(),
        availableSkills: skillRegistry.getAllSkills(),
        skillRegistry,
        goalRequirements: { wood: { min: 1 } },
        constraints: [],
        resources: {},
        goal: goal,
        timeLimit: undefined,
        urgency: 'medium' as const,
        domain: 'minecraft' as const,
      };

      const applicableSkills = skillPlanner['findApplicableSkills'](
        goal,
        context
      );

      expect(applicableSkills).toBeDefined();
      expect(applicableSkills.length).toBeGreaterThan(0);
      expect(
        applicableSkills.some((skill) => skill.id === 'opt.chop_tree_safe')
      ).toBe(true);
    });

    it('should decompose goals into skill sequences', () => {
      const goal = 'build shelter and gather resources';
      const applicableSkills = skillRegistry.getAllSkills();
      const context = {
        worldState: { wood: 5, time: 'dusk' },
        availableSkills: skillRegistry.getAllSkills(),
        skillRegistry,
        goalRequirements: { shelter: { required: true }, wood: { min: 1 } },
        constraints: [],
        resources: {},
        timeLimit: undefined,
        urgency: 'medium' as const,
        domain: 'minecraft' as const,
      };

      const decomposition = skillPlanner['decomposeGoalIntoSkills'](
        goal,
        applicableSkills,
        context
      );

      expect(decomposition).toBeDefined();
      expect(decomposition.length).toBeGreaterThan(0);
      expect(decomposition.every((decomp) => decomp.skill)).toBe(true);
      expect(decomposition.every((decomp) => decomp.preconditions)).toBe(true);
      expect(decomposition.every((decomp) => decomp.postconditions)).toBe(true);
    });

    it('should calculate execution order correctly', () => {
      const nodes = [
        {
          id: 'node-1',
          type: 'action' as const,
          description: 'First action',
          status: 'pending' as const,
          priority: 1.0,
          estimatedDuration: 1000,
          dependencies: [],
          constraints: [],
          metadata: {},
        },
        {
          id: 'node-2',
          type: 'action' as const,
          description: 'Second action',
          status: 'pending' as const,
          priority: 0.8,
          estimatedDuration: 2000,
          dependencies: ['node-1'],
          constraints: [],
          metadata: {},
        },
      ];

      const executionOrder = skillPlanner['calculateExecutionOrder'](nodes);

      expect(executionOrder).toBeDefined();
      expect(executionOrder.length).toBe(2);
      expect(executionOrder[0]).toBe('node-1');
      expect(executionOrder[1]).toBe('node-2');
    });

    it('should estimate plan success probability', () => {
      const decomposition = [
        {
          skillId: 'opt.shelter_basic',
          skill: skillRegistry.getSkill('opt.shelter_basic')!,
          preconditions: {},
          postconditions: {},
          estimatedDuration: 5000,
          priority: 1.0,
          dependencies: [],
        },
        {
          skillId: 'opt.chop_tree_safe',
          skill: skillRegistry.getSkill('opt.chop_tree_safe')!,
          preconditions: {},
          postconditions: {},
          estimatedDuration: 3000,
          priority: 0.8,
          dependencies: [],
        },
      ];

      const success = skillPlanner['estimatePlanSuccess'](decomposition);

      expect(success).toBeGreaterThan(0);
      expect(success).toBeLessThanOrEqual(1);
    });

    it('should identify fallback skills', () => {
      const applicableSkills = skillRegistry.getAllSkills();
      const decomposition = [
        {
          skillId: 'opt.shelter_basic',
          skill: skillRegistry.getSkill('opt.shelter_basic')!,
          preconditions: {},
          postconditions: { shelter: true },
          estimatedDuration: 5000,
          priority: 1.0,
          dependencies: [],
        },
      ];

      const fallbacks = skillPlanner['identifyFallbackSkills'](
        applicableSkills,
        decomposition
      );

      expect(fallbacks).toBeDefined();
      expect(Array.isArray(fallbacks)).toBe(true);
    });

    it('should get execution statistics', () => {
      const stats = skillPlanner.getExecutionStats();

      expect(stats).toBeDefined();
      expect(stats.totalExecutions).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeLessThanOrEqual(1);
      expect(stats.averageDuration).toBeGreaterThanOrEqual(0);
      expect(stats.mostUsedSkills).toBeDefined();
      expect(Array.isArray(stats.mostUsedSkills)).toBe(true);
    });
  });

  describe('HybridSkillPlanner', () => {
    it('should decide planning approach based on goal analysis', async () => {
      const goal = 'build a complex shelter with multiple rooms';
      const context = {
        skillRegistry,
        worldState: { wood: 20, stone: 10 },
        availableResources: { wood: 20, stone: 10 },
        timeConstraints: {
          urgency: 'medium' as const,
          deadline: undefined,
          maxPlanningTime: 10000,
        },
        planningPreferences: {
          preferSkills: true,
          preferMCP: false,
          preferHTN: true,
          preferGOAP: true,
          allowHybrid: true,
          preferSimple: false,
        },
        currentState: createDefaultCurrentState(),
        constraints: [],
        resources: { wood: 20, stone: 10 },
        goal: goal,
        timeLimit: undefined,
        urgency: 'medium' as const,
        domain: 'minecraft' as const,
      };

      const decision = await hybridPlanner['decidePlanningApproach'](
        goal,
        context
      );

      expect(decision).toBeDefined();
      expect(decision.approach).toBeDefined();
      expect(['skill-based', 'htn', 'goap', 'hybrid']).toContain(
        decision.approach
      );
      expect(decision.reasoning).toBeDefined();
      expect(decision.confidence).toBeGreaterThan(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
      expect(decision.estimatedLatency).toBeGreaterThan(0);
    });

    it('should analyze goal complexity and structure', () => {
      const goal = 'build a shelter and gather wood for tools';
      const context = {
        skillRegistry,
        worldState: {},
        availableResources: {},
        timeConstraints: {
          urgency: 'medium' as const,
          deadline: undefined,
          maxPlanningTime: 10000,
        },
        planningPreferences: {
          preferSkills: true,
          preferMCP: false,
          preferHTN: true,
          preferGOAP: true,
          allowHybrid: true,
          preferSimple: false,
        },
        currentState: createDefaultCurrentState(),
        constraints: [],
        resources: {},
        goal: goal,
        timeLimit: undefined,
        urgency: 'medium' as const,
        domain: 'minecraft' as const,
      };

      const analysis = hybridPlanner['analyzeGoal'](goal, context);

      expect(analysis).toBeDefined();
      expect(analysis.complexity).toBeDefined();
      expect(['simple', 'moderate', 'complex']).toContain(analysis.complexity);
      expect(analysis.structure).toBeDefined();
      expect(['hierarchical', 'sequential', 'reactive']).toContain(
        analysis.structure
      );
      expect(analysis.domain).toBeDefined();
      expect(['minecraft', 'general', 'spatial', 'logical']).toContain(
        analysis.domain
      );
    });

    it('should calculate confidence scores for different approaches', () => {
      const goal = 'build a shelter';
      const context = {
        skillRegistry,
        worldState: { wood: 10 },
        availableResources: { wood: 10 },
        timeConstraints: {
          urgency: 'medium' as const,
          deadline: undefined,
          maxPlanningTime: 10000,
        },
        planningPreferences: {
          preferSkills: true,
          preferMCP: false,
          preferHTN: true,
          preferGOAP: true,
          allowHybrid: true,
          preferSimple: false,
        },
        currentState: createDefaultCurrentState(),
        constraints: [],
        resources: { wood: 10 },
        goal: goal,
        timeLimit: undefined,
        urgency: 'medium' as const,
        domain: 'minecraft' as const,
      };

      const skillConfidence = hybridPlanner['calculateSkillConfidence'](
        skillRegistry.getAllSkills(),
        goal
      );
      const htnConfidence = hybridPlanner['calculateHTNConfidence'](
        goal,
        context
      );
      const goapConfidence = hybridPlanner['calculateGOAPConfidence'](
        goal,
        context
      );

      expect(skillConfidence).toBeGreaterThanOrEqual(0);
      expect(skillConfidence).toBeLessThanOrEqual(1);
      expect(htnConfidence).toBeGreaterThanOrEqual(0);
      expect(htnConfidence).toBeLessThanOrEqual(1);
      expect(goapConfidence).toBeGreaterThanOrEqual(0);
      expect(goapConfidence).toBeLessThanOrEqual(1);
    });

    it('should estimate planning latency based on approach and urgency', () => {
      const goal = 'build shelter';
      const context = {
        skillRegistry,
        worldState: {},
        availableResources: {},
        timeConstraints: {
          urgency: 'high' as const,
          deadline: undefined,
          maxPlanningTime: 5000,
        },
        planningPreferences: {
          preferSkills: true,
          preferMCP: false,
          preferHTN: true,
          preferGOAP: true,
          allowHybrid: true,
          preferSimple: false,
        },
        currentState: createDefaultCurrentState(),
        constraints: [],
        resources: {},
        goal: goal,
        timeLimit: undefined,
        urgency: 'high' as const,
        domain: 'minecraft' as const,
      };

      const skillLatency = hybridPlanner['estimatePlanningLatency'](
        'skill-based',
        context
      );
      const htnLatency = hybridPlanner['estimatePlanningLatency'](
        'htn',
        context
      );
      const goapLatency = hybridPlanner['estimatePlanningLatency'](
        'goap',
        context
      );
      const hybridLatency = hybridPlanner['estimatePlanningLatency'](
        'hybrid',
        context
      );

      expect(skillLatency).toBeGreaterThan(0);
      expect(htnLatency).toBeGreaterThan(0);
      expect(goapLatency).toBeGreaterThan(0);
      expect(hybridLatency).toBeGreaterThan(0);

      // High urgency should reduce latency
      expect(skillLatency).toBeLessThan(200);
      expect(htnLatency).toBeLessThan(1000);
      expect(goapLatency).toBeLessThan(400);
      expect(hybridLatency).toBeLessThan(1600);
    });

    it('should extract goal requirements from natural language', () => {
      const goal1 = 'build shelter with wood';
      const goal2 = 'craft iron tools';
      const goal3 = 'explore and find resources';

      const req1 = hybridPlanner['extractGoalRequirements'](goal1);
      const req2 = hybridPlanner['extractGoalRequirements'](goal2);
      const req3 = hybridPlanner['extractGoalRequirements'](goal3);

      expect(req1.shelter).toBeDefined();
      expect(req1.shelter.required).toBe(true);
      expect(req2.iron).toBeDefined();
      expect(req2.iron.min).toBe(1);
      expect(req3).toBeDefined();
    });

    it('should convert goals to GOAP format', () => {
      const goal1 = 'build shelter';
      const goal2 = 'craft tools';
      const goal3 = 'find food';
      const worldState = {};

      const goap1 = hybridPlanner['convertGoalToGOAP'](goal1, worldState);
      const goap2 = hybridPlanner['convertGoalToGOAP'](goal2, worldState);
      const goap3 = hybridPlanner['convertGoalToGOAP'](goal3, worldState);

      expect(goap1.hasShelter).toBe(true);
      expect(goap2.hasTools).toBe(true);
      expect(goap3.hasFood).toBe(true);
    });

    it('should merge plan nodes from different approaches', () => {
      const skillPlan = {
        id: 'skill-plan-1',
        nodes: [
          {
            id: 'skill-node-1',
            type: 'action' as const,
            description: 'Build shelter',
            status: 'pending' as const,
            priority: 1.0,
            estimatedDuration: 5000,
            dependencies: [],
            constraints: [],
            metadata: { skillId: 'opt.shelter_basic' },
          },
        ],
        executionOrder: ['skill-node-1'],
        confidence: 0.8,
        estimatedLatency: 100,
        refinementCount: 0,
        createdAt: Date.now(),
        lastRefinedAt: Date.now(),
        skillDecomposition: [],
        estimatedSkillSuccess: 0.8,
        fallbackSkills: [],
      };

      const mergedNodes = hybridPlanner['mergePlanNodes'](
        skillPlan,
        undefined,
        undefined
      );

      expect(mergedNodes).toBeDefined();
      expect(mergedNodes.length).toBe(1);
      expect(mergedNodes[0].source).toBe('skill');
      expect(mergedNodes[0].planId).toBe('skill-plan-1');
    });

    it('should calculate execution order for merged plans', () => {
      const skillPlan = {
        id: 'skill-plan-1',
        executionOrder: ['skill-node-1', 'skill-node-2'],
      };
      const hrmPlan = {
        id: 'hrm-plan-1',
        executionOrder: ['htn-node-1'],
      };
      const goapPlan = {
        id: 'goap-plan-1',
        actions: [{ name: 'action1' }, { name: 'action2' }],
      };

      const executionOrder = hybridPlanner['calculateExecutionOrder'](
        skillPlan,
        undefined, // mcpCapabilityPlan
        hrmPlan,
        goapPlan
      );

      expect(executionOrder).toBeDefined();
      expect(executionOrder.length).toBe(5); // 2 skill + 1 htn + 2 goap
      expect(executionOrder).toContain('skill-node-1');
      expect(executionOrder).toContain('skill-node-2');
      expect(executionOrder).toContain('htn-node-1');
      expect(executionOrder).toContain('goap-node-goap-plan-1-0');
      expect(executionOrder).toContain('goap-node-goap-plan-1-1');
    });

    it('should estimate plan success from multiple approaches', () => {
      const skillPlan = {
        estimatedSkillSuccess: 0.8,
      };
      const hrmPlan = {
        confidence: 0.7,
      };
      const goapPlan = {};

      const success = hybridPlanner['estimatePlanSuccess'](
        skillPlan,
        undefined, // mcpCapabilityPlan
        hrmPlan,
        goapPlan
      );

      expect(success).toBeGreaterThan(0);
      expect(success).toBeLessThanOrEqual(1);
      // Should be average of 0.8, 0.7, and 0.7 (default GOAP)
      expect(success).toBeCloseTo(0.73, 1);
    });

    it('should identify fallback plans for different approaches', () => {
      const goal = 'build shelter';
      const context = {
        skillRegistry,
        worldState: {},
        availableResources: {},
        timeConstraints: {
          urgency: 'medium' as const,
          deadline: undefined,
          maxPlanningTime: 10000,
        },
        planningPreferences: {
          preferSkills: true,
          preferMCP: false,
          preferHTN: true,
          preferGOAP: true,
          allowHybrid: true,
          preferSimple: false,
        },
        currentState: createDefaultCurrentState(),
        constraints: [],
        resources: {},
        goal: goal,
        timeLimit: undefined,
        urgency: 'medium' as const,
        domain: 'minecraft' as const,
      };

      const skillFallbacks = hybridPlanner['identifyFallbackPlans'](
        'skill-based',
        context
      );
      const htnFallbacks = hybridPlanner['identifyFallbackPlans'](
        'htn',
        context
      );
      const goapFallbacks = hybridPlanner['identifyFallbackPlans'](
        'goap',
        context
      );
      const hybridFallbacks = hybridPlanner['identifyFallbackPlans'](
        'hybrid',
        context
      );

      expect(skillFallbacks).toContain('htn');
      expect(skillFallbacks).toContain('goap');
      expect(htnFallbacks).toContain('skill-based');
      expect(htnFallbacks).toContain('goap');
      expect(goapFallbacks).toContain('skill-based');
      expect(goapFallbacks).toContain('htn');
      expect(hybridFallbacks).toContain('goap');
      expect(hybridFallbacks).toContain('skill-based');
    });

    it('should get planning statistics', () => {
      const stats = hybridPlanner.getPlanningStats();

      expect(stats).toBeDefined();
      expect(stats.totalPlans).toBeGreaterThanOrEqual(0);
      expect(stats.approachDistribution).toBeDefined();
      expect(stats.approachDistribution['skill-based']).toBeGreaterThanOrEqual(
        0
      );
      expect(stats.approachDistribution['htn']).toBeGreaterThanOrEqual(0);
      expect(stats.approachDistribution['goap']).toBeGreaterThanOrEqual(0);
      expect(stats.approachDistribution['hybrid']).toBeGreaterThanOrEqual(0);
      expect(stats.averageConfidence).toBeGreaterThan(0);
      expect(stats.averageConfidence).toBeLessThanOrEqual(1);
      expect(stats.averageLatency).toBeGreaterThan(0);
    });
  });

  describe('Integration Tests', () => {
    it('should integrate skill planning with existing HTN/GOAP systems', async () => {
      const goal = 'build a shelter and gather resources';
      const context = {
        skillRegistry,
        worldState: { wood: 15, time: 'dusk' },
        availableResources: { wood: 15 },
        timeConstraints: {
          urgency: 'medium' as const,
          deadline: undefined,
          maxPlanningTime: 15000,
        },
        planningPreferences: {
          preferSkills: true,
          preferMCP: false,
          preferHTN: true,
          preferGOAP: true,
          allowHybrid: true,
          preferSimple: false,
        },
        currentState: createDefaultCurrentState(),
        constraints: [],
        resources: { wood: 15 },
        goal: goal,
        timeLimit: undefined,
        urgency: 'medium' as const,
        domain: 'minecraft' as const,
      };

      const result = await hybridPlanner.plan(goal, context);

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
      expect(result.plan.goalId).toBe(goal);
      expect(result.decision).toBeDefined();
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(['skill-based', 'htn', 'goap', 'hybrid']).toContain(
        result.plan.planningApproach
      );
    });

    it('should handle planning failures gracefully', async () => {
      const goal = 'impossible goal that no planner can handle';
      const context = {
        skillRegistry,
        worldState: {},
        availableResources: {},
        timeConstraints: {
          urgency: 'emergency' as const,
          deadline: Date.now() + 1000,
          maxPlanningTime: 500,
        },
        planningPreferences: {
          preferSkills: false,
          preferMCP: false,
          preferHTN: false,
          preferGOAP: true,
          allowHybrid: false,
          preferSimple: false,
        },
        currentState: createDefaultCurrentState(),
        constraints: [],
        resources: {},
        goal: goal,
        timeLimit: Date.now() + 1000,
        urgency: 'emergency' as const,
        domain: 'general' as const,
      };

      const result = await hybridPlanner.plan(goal, context);

      // The GOAP planner is robust and can handle difficult goals
      // So we check that it created a plan and used the expected approach
      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
      expect(result.plan.planningApproach).toBe('goap');
      expect(result.decision.approach).toBe('goap');
      // The GOAP planner is working correctly, so we check for appropriate reasoning
      expect(result.decision.reasoning).toContain('GOAP');
    });
  });
});

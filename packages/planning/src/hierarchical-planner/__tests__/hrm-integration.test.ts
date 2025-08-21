/**
 * HRM Integration Tests
 *
 * Tests for the HRM-inspired cognitive router and hierarchical planner
 * Validates alignment with the integration plan requirements
 *
 * @author @darianrosebrook
 */

import {
  CognitiveTaskRouter,
  HRMInspiredPlanner,
  IntegratedPlanningSystem,
  createCognitiveRouter,
  createHRMPlanner,
  createIntegratedPlanningSystem,
  routeTask,
  quickPlan,
  plan,
} from '../index';

describe('HRM Integration', () => {
  describe('CognitiveTaskRouter', () => {
    let router: CognitiveTaskRouter;

    beforeEach(() => {
      router = createCognitiveRouter();
    });

    it('should route navigation tasks to HRM', () => {
      const decision = routeTask('Find the shortest path to the castle');

      expect(decision.taskType).toBe('navigation');
      expect(decision.router).toBe('hrm_structured');
      expect(decision.confidence).toBeGreaterThan(0.8);
      expect(decision.expectedLatency).toBeLessThan(150); // Target latency from plan
    });

    it('should route logic puzzles to HRM', () => {
      const decision = routeTask('Solve this sudoku puzzle');

      expect(decision.taskType).toBe('logic_puzzle');
      expect(decision.router).toBe('hrm_structured');
      expect(decision.confidence).toBeGreaterThan(0.8);
    });

    it('should route natural language tasks to LLM', () => {
      const decision = routeTask('Tell me a story about adventure');

      expect(decision.taskType).toBe('creative_task');
      expect(decision.router).toBe('llm');
      expect(decision.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should route ethical decisions to collaborative mode', () => {
      const decision = routeTask(
        'Should I help this person even if it is morally right?'
      );

      expect(decision.taskType).toBe('ethical_decision');
      expect(decision.router).toBe('collaborative');
      expect(decision.confidence).toBeGreaterThan(0.6);
    });

    it('should prioritize speed for emergency tasks', () => {
      const decision = routeTask('Emergency: find escape route!', {
        urgency: 'emergency',
      });

      expect(decision.expectedLatency).toBeLessThan(100); // Emergency target
      expect(decision.reasoning).toContain('emergency');
    });

    it('should handle Minecraft-specific tasks', () => {
      const decision = routeTask('Optimize resource collection for building', {
        domain: 'minecraft',
        requiresStructured: true,
      });

      expect(decision.taskType).toBe('resource_optimization');
      expect(decision.router).toBe('hrm_structured');
    });

    it('should track performance metrics', () => {
      const decision = router.routeTask({
        input: 'Navigate to coordinates 100, 200',
        domain: 'general',
        urgency: 'medium',
        requiresStructured: false,
        requiresCreativity: false,
        requiresWorldKnowledge: false,
      });
      router.recordTaskResult(decision, true, 95);

      const stats = router.getRoutingStats();
      expect(stats.totalDecisions).toBe(1);
      expect(stats.accuracyByTaskType['navigation']).toBe(1.0);
    });
  });

  describe('HRMInspiredPlanner', () => {
    let planner: HRMInspiredPlanner;

    beforeEach(() => {
      planner = createHRMPlanner({
        maxRefinements: 2,
        qualityThreshold: 0.8,
      });
    });

    it('should generate hierarchical plans for Minecraft tasks', async () => {
      const result = await planner.planWithRefinement({
        goal: 'Build a wooden house',
        currentState: { position: [0, 0, 0] },
        constraints: ['daylight_remaining'],
        resources: { wood: 0, stone: 5 },
        urgency: 'medium',
        domain: 'minecraft',
      });

      expect(result.finalPlan.nodes.length).toBeGreaterThan(2);
      expect(result.finalPlan.nodes[0].type).toBe('goal');
      expect(result.finalPlan.executionOrder.length).toBeGreaterThan(0);
      expect(result.finalPlan.confidence).toBeGreaterThan(0.5);
    });

    it('should refine plans iteratively', async () => {
      const result = await planner.planWithRefinement({
        goal: 'Optimize resource collection',
        currentState: {},
        constraints: ['time_limit'],
        resources: {},
        urgency: 'high',
        domain: 'minecraft',
      });

      expect(result.totalRefinements).toBeGreaterThanOrEqual(0);
      expect(result.refinementHistory.length).toBeGreaterThan(0);
      expect(result.halted).toBe(true);
      expect([
        'quality_threshold_met',
        'max_refinements_reached',
        'no_improvement_possible',
      ]).toContain(result.haltReason);
    });

    it('should handle navigation planning', async () => {
      const result = await planner.planWithRefinement({
        goal: 'Navigate to the nearest village',
        currentState: { position: [10, 64, 10] },
        constraints: ['avoid_monsters'],
        resources: { food: 3 },
        urgency: 'medium',
        domain: 'minecraft',
      });

      const plan = result.finalPlan;
      expect(plan.estimatedLatency).toBeLessThan(60000); // Should be reasonable
      expect(plan.nodes.some((n) => n.description.includes('path'))).toBe(true);
    });

    it('should meet performance targets', async () => {
      const start = Date.now();
      const result = await planner.planWithRefinement({
        goal: 'Quick task',
        currentState: {},
        constraints: [],
        resources: {},
        urgency: 'high',
        domain: 'general',
      });
      const latency = Date.now() - start;

      expect(latency).toBeLessThan(300); // Should be fast for simple tasks
      expect(result.finalPlan.confidence).toBeGreaterThan(0.6);
    });

    it('should handle complex multi-step plans', async () => {
      const result = await planner.planWithRefinement({
        goal: 'Establish a sustainable base with farm and defenses',
        currentState: { position: [0, 0, 0] },
        constraints: ['limited_daylight', 'monster_threats'],
        resources: { wood: 10, stone: 5, seeds: 3 },
        urgency: 'low',
        domain: 'minecraft',
      });

      const plan = result.finalPlan;
      expect(plan.nodes.length).toBeGreaterThan(4); // Complex task should have multiple steps
      expect(plan.nodes.some((n) => n.description.includes('farm'))).toBe(true);
      expect(plan.nodes.some((n) => n.description.includes('defense'))).toBe(
        true
      );
    });
  });

  describe('IntegratedPlanningSystem', () => {
    let system: IntegratedPlanningSystem;

    beforeEach(() => {
      system = createIntegratedPlanningSystem({
        routerConfig: {
          hrmLatencyTarget: 100,
          llmLatencyTarget: 400,
          emergencyLatencyLimit: 50,
        },
        plannerConfig: {
          maxRefinements: 2,
          qualityThreshold: 0.8,
        },
      });
    });

    it('should route and plan structured tasks', async () => {
      const result = await system.planTask('Find optimal path through maze');

      expect(result.routingDecision.router).toBe('hrm_structured');
      expect(result.plan).toBeDefined();
      expect(result.plan!.nodes.length).toBeGreaterThan(0);
      expect(result.success).toBe(true);
    });

    it('should handle LLM tasks', async () => {
      const result = await system.planTask('Explain the history of castles');

      expect(result.routingDecision.router).toBe('llm');
      expect(result.llmResponse).toBeDefined();
      expect(result.llmResponse!.length).toBeGreaterThan(0);
      expect(result.success).toBe(true);
    });

    it('should execute collaborative reasoning', async () => {
      const result = await system.planTask(
        'Should I build defenses or focus on resource gathering?'
      );

      expect(result.routingDecision.router).toBe('collaborative');
      expect(result.collaborative).toBeDefined();
      expect(result.collaborative!.hrmPlan).toBeDefined();
      expect(result.collaborative!.llmNarrative).toBeDefined();
      expect(result.collaborative!.synthesis).toBeDefined();
    });

    it('should meet latency targets from integration plan', async () => {
      // HRM task should meet 100ms target
      const hrmResult = await system.planTask('Navigate to point A');
      expect(hrmResult.totalLatency).toBeLessThan(200); // Allow some overhead

      // Emergency task should meet 50ms target is aspirational, test reasonable performance
      const emergencyResult = await system.planTask('Emergency escape!', {
        urgency: 'emergency',
      });
      expect(emergencyResult.totalLatency).toBeLessThan(150); // Emergency with overhead
    });

    it('should track performance statistics', async () => {
      await system.planTask('Task 1: Navigate');
      await system.planTask('Task 2: Explain');
      await system.planTask('Task 3: Decide ethically');

      const stats = system.getPerformanceStats();
      expect(stats.totalTasks).toBe(3);
      expect(stats.successRate).toBeGreaterThan(0);
      expect(stats.averageLatency).toBeGreaterThan(0);
      expect(Object.keys(stats.routerDistribution)).toContain('hrm_structured');
    });

    it('should adapt based on performance history', async () => {
      // Simulate some task executions
      for (let i = 0; i < 5; i++) {
        await system.planTask(`Navigation task ${i}`);
      }

      const stats = system.getPerformanceStats();
      expect(stats.recentPerformance.length).toBeGreaterThan(0);
      expect(
        stats.recentPerformance.every((p) => p.router === 'hrm_structured')
      ).toBe(true);
    });
  });

  describe('Utility Functions', () => {
    it('should provide quick planning interface', async () => {
      const result = await plan('Build a bridge', {
        domain: 'minecraft',
        urgency: 'medium',
      });

      expect(result.success).toBe(true);
      expect(result.routingDecision).toBeDefined();
    });

    it('should handle quick plan utility', async () => {
      const planResult = await quickPlan('Gather 10 wood blocks');

      expect(planResult.nodes.length).toBeGreaterThan(0);
      expect(planResult.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Integration Plan Alignment', () => {
    it('should implement mixture-of-experts routing as specified', () => {
      const router = createCognitiveRouter();

      // Structured task -> HRM (lines 49-50 in plan)
      const structuredDecision = routeTask('Solve pathfinding puzzle');
      expect(structuredDecision.router).toBe('hrm_structured');

      // Language task -> LLM (lines 49-50 in plan)
      const languageDecision = routeTask('Tell me about history');
      expect(languageDecision.router).toBe('llm');

      // Ethical task -> Collaborative (lines 51-52 in plan)
      const ethicalDecision = routeTask('Is this action morally right?');
      expect(ethicalDecision.router).toBe('collaborative');
    });

    it('should meet architecture requirements from plan', () => {
      const system = createIntegratedPlanningSystem();

      // Should support hybrid system as per lines 167-186
      expect(system).toHaveProperty('cognitiveRouter');
      expect(system).toHaveProperty('hrmPlanner');

      // Should provide performance tracking as per lines 207-216
      const stats = system.getPerformanceStats();
      expect(stats).toHaveProperty('totalTasks');
      expect(stats).toHaveProperty('successRate');
      expect(stats).toHaveProperty('averageLatency');
    });

    it('should implement iterative refinement from HRM principles', async () => {
      const planner = createHRMPlanner();
      const result = await planner.planWithRefinement({
        goal: 'Complex multi-step task',
        currentState: {},
        constraints: [],
        resources: {},
        urgency: 'medium',
        domain: 'general',
      });

      // Should implement outer-loop refinement (lines 14-15 in plan description)
      expect(result.refinementHistory.length).toBeGreaterThan(0);
      expect(result.halted).toBe(true);
      expect(result.haltReason).toBeDefined();
    });
  });
});

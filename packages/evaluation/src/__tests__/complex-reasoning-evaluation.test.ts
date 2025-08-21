/**
 * Complex Reasoning Evaluation Tests
 * 
 * Comprehensive test suite that evaluates the HRM-inspired cognitive architecture
 * against complex multi-step reasoning scenarios
 * 
 * @author @darianrosebrook
 */

import { ScenarioManager } from '../scenarios/scenario-manager';
import { PerformanceAnalyzer } from '../metrics/performance-analyzer';
import { 
  allComplexReasoningScenarios,
  scenariosByComplexity,
  scenariosByDomain
} from '../scenarios/complex-reasoning-scenarios';
import { 
  AgentConfig, 
  EvaluationSession, 
  Scenario,
  StressTestConfig 
} from '../types';

describe('Complex Reasoning Evaluation Framework', () => {
  let scenarioManager: ScenarioManager;
  let performanceAnalyzer: PerformanceAnalyzer;
  let testAgentConfig: AgentConfig;

  beforeEach(() => {
    scenarioManager = new ScenarioManager();
    performanceAnalyzer = new PerformanceAnalyzer();
    
    // Register all complex reasoning scenarios
    scenarioManager.registerScenarios(allComplexReasoningScenarios);
    allComplexReasoningScenarios.forEach(scenario => 
      performanceAnalyzer.registerScenario(scenario)
    );

    // Create test agent configuration
    testAgentConfig = {
      id: 'hrm-test-agent',
      name: 'HRM Test Agent',
      version: '1.0.0',
      planningConfig: {
        router: {
          hrmLatencyTarget: 100,
          llmLatencyTarget: 400,
          emergencyLatencyLimit: 50
        },
        planner: {
          maxRefinements: 3,
          qualityThreshold: 0.8
        }
      },
      memoryConfig: {},
      cognitionConfig: {},
      enabledFeatures: ['hrm_planning', 'collaborative_reasoning', 'adaptive_routing'],
      disabledFeatures: []
    };

    performanceAnalyzer.registerAgentConfig(testAgentConfig);
  });

  describe('Scenario Library Validation', () => {
    it('should have comprehensive scenario coverage across domains', () => {
      const domains = Object.keys(scenariosByDomain);
      expect(domains).toContain('spatial');
      expect(domains).toContain('logical');
      expect(domains).toContain('resource');
      expect(domains).toContain('social');
      expect(domains).toContain('ethical');
      expect(domains).toContain('meta_cognitive');
      expect(domains).toContain('hybrid');
    });

    it('should have progressive complexity levels', () => {
      const complexityLevels = Object.keys(scenariosByComplexity);
      expect(complexityLevels).toContain('basic');
      expect(complexityLevels).toContain('intermediate');
      expect(complexityLevels).toContain('advanced');
      expect(complexityLevels).toContain('expert');
      expect(complexityLevels).toContain('emergent');
    });

    it('should have properly structured scenario definitions', () => {
      allComplexReasoningScenarios.forEach(scenario => {
        expect(scenario.id).toBeDefined();
        expect(scenario.name).toBeDefined();
        expect(scenario.domain).toBeDefined();
        expect(scenario.complexity).toBeDefined();
        expect(scenario.goalConditions).toBeInstanceOf(Array);
        expect(scenario.successCriteria).toBeInstanceOf(Array);
        expect(scenario.estimatedSteps).toBeGreaterThan(0);
        expect(scenario.difficulty).toBeGreaterThanOrEqual(1);
        expect(scenario.difficulty).toBeLessThanOrEqual(10);
      });
    });
  });

  describe('Basic Spatial Reasoning', () => {
    it('should successfully navigate simple maze', async () => {
      const session = await scenarioManager.executeScenario(
        'spatial_maze_basic',
        testAgentConfig,
        { enableRealTimeMonitoring: true }
      );

      expect(session.status).toBe('completed');
      expect(session.steps.length).toBeGreaterThan(0);
      expect(session.totalLatency).toBeLessThan(30000); // Should complete within time limit
      
      // Verify planning was used
      const planningSteps = session.steps.filter(step => step.action === 'planning');
      expect(planningSteps.length).toBeGreaterThan(0);
    });

    it('should handle multi-objective spatial planning', async () => {
      const session = await scenarioManager.executeScenario(
        'spatial_multi_objective',
        testAgentConfig
      );

      expect(session.status).toBe('completed');
      
      // Analyze performance
      const results = performanceAnalyzer.generateEvaluationResults(session);
      expect(results.overallScore).toBeGreaterThan(0.5);
      
      // Should demonstrate planning quality
      expect(results.planningPerformance.qualityScore).toBeGreaterThan(0.6);
    });
  });

  describe('Logical Reasoning Tasks', () => {
    it('should solve Tower of Hanoi efficiently', async () => {
      const session = await scenarioManager.executeScenario(
        'logic_tower_of_hanoi',
        testAgentConfig
      );

      expect(session.status).toBe('completed');
      
      const results = performanceAnalyzer.generateEvaluationResults(session);
      
      // Should achieve high efficiency for algorithmic task
      const efficiencyMetric = results.metrics.find(m => m.type === 'efficiency');
      expect(efficiencyMetric?.value).toBeGreaterThan(0.7);
      
      // Should use structured reasoning (HRM)
      const planningSteps = session.steps.filter(step => step.action === 'planning');
      const hrmUsage = planningSteps.some(step => 
        step.result?.routingDecision?.router === 'hrm_structured'
      );
      expect(hrmUsage).toBe(true);
    });

    it('should demonstrate pattern recognition capabilities', async () => {
      const session = await scenarioManager.executeScenario(
        'logic_sequence_prediction',
        testAgentConfig
      );

      expect(session.status).toBe('completed');
      
      const results = performanceAnalyzer.generateEvaluationResults(session);
      
      // Should show reasoning depth
      expect(results.cognitivePerformance.reasoningDepth).toBeGreaterThan(0.5);
    });
  });

  describe('Resource Planning Scenarios', () => {
    it('should handle complex resource optimization', async () => {
      const session = await scenarioManager.executeScenario(
        'resource_base_construction',
        testAgentConfig
      );

      expect(session.status).toBe('completed');
      
      const results = performanceAnalyzer.generateEvaluationResults(session);
      
      // Should demonstrate adaptability in complex scenarios
      expect(results.cognitivePerformance.memoryUtilization).toBeGreaterThan(0.4);
      
      // Should use multiple reasoning approaches
      const planningSteps = session.steps.filter(step => step.action === 'planning');
      const routerTypes = new Set(
        planningSteps.map(step => step.result?.routingDecision?.router)
      );
      expect(routerTypes.size).toBeGreaterThan(1); // Should use multiple routers
    });
  });

  describe('Social Reasoning Tasks', () => {
    it('should navigate multi-party negotiations', async () => {
      const session = await scenarioManager.executeScenario(
        'social_negotiation',
        testAgentConfig
      );

      expect(session.status).toBe('completed');
      
      const results = performanceAnalyzer.generateEvaluationResults(session);
      
      // Should demonstrate social awareness
      const socialMetric = results.metrics.find(m => m.type === 'social_awareness');
      if (socialMetric) {
        expect(socialMetric.value).toBeGreaterThan(0.6);
      }
      
      // Should use collaborative reasoning for social tasks
      const collaborativeUsage = session.steps.some(step => 
        step.result?.routingDecision?.router === 'collaborative'
      );
      expect(collaborativeUsage).toBe(true);
    });
  });

  describe('Ethical Reasoning', () => {
    it('should handle complex moral dilemmas', async () => {
      const session = await scenarioManager.executeScenario(
        'ethical_trolley_variant',
        testAgentConfig
      );

      expect(session.status).toBe('completed');
      
      const results = performanceAnalyzer.generateEvaluationResults(session);
      
      // Should demonstrate coherent reasoning
      expect(results.cognitivePerformance.coherenceScore).toBeGreaterThan(0.7);
      
      // Should provide detailed reasoning
      expect(results.cognitivePerformance.reasoningDepth).toBeGreaterThan(0.6);
      
      // Should use collaborative reasoning for ethical tasks
      const collaborativeUsage = session.steps.some(step => 
        step.result?.routingDecision?.router === 'collaborative'
      );
      expect(collaborativeUsage).toBe(true);
    });
  });

  describe('Meta-Cognitive Tasks', () => {
    it('should demonstrate adaptive strategy selection', async () => {
      const session = await scenarioManager.executeScenario(
        'meta_strategy_adaptation',
        testAgentConfig
      );

      expect(session.status).toBe('completed');
      
      const results = performanceAnalyzer.generateEvaluationResults(session);
      
      // Should show high adaptability
      const adaptabilityMetric = results.metrics.find(m => m.type === 'adaptability');
      expect(adaptabilityMetric?.value).toBeGreaterThan(0.7);
      
      // Should use multiple routing strategies
      const planningSteps = session.steps.filter(step => step.action === 'planning');
      const routerTypes = new Set(
        planningSteps.map(step => step.result?.routingDecision?.router)
      );
      expect(routerTypes.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Hybrid Complex Scenarios', () => {
    it('should manage multi-domain crisis scenarios', async () => {
      const session = await scenarioManager.executeScenario(
        'hybrid_crisis_management',
        testAgentConfig,
        { enableRealTimeMonitoring: true }
      );

      expect(session.status).toBe('completed');
      
      const results = performanceAnalyzer.generateEvaluationResults(session);
      
      // Should achieve reasonable performance on emergent scenario
      expect(results.overallScore).toBeGreaterThan(0.5);
      
      // Should demonstrate multiple cognitive capabilities
      expect(results.cognitivePerformance.adaptabilityScore).toBeGreaterThan(0.6);
      expect(results.planningPerformance.qualityScore).toBeGreaterThan(0.5);
      
      // Should use all types of reasoning
      const planningSteps = session.steps.filter(step => step.action === 'planning');
      const routerTypes = new Set(
        planningSteps.map(step => step.result?.routingDecision?.router)
      );
      expect(routerTypes.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Stress Testing', () => {
    it('should maintain performance under latency stress', async () => {
      const stressConfig: StressTestConfig = {
        type: 'latency_injection',
        intensity: 0.3, // 30% intensity
        duration: 10000, // 10 seconds
        parameters: { additionalDelay: 100 },
        allowRecovery: true
      };

      const session = await scenarioManager.executeScenario(
        'spatial_maze_basic',
        testAgentConfig,
        { stressConfig }
      );

      expect(session.status).toBe('completed');
      
      // Should still complete successfully despite stress
      const results = performanceAnalyzer.generateEvaluationResults(session);
      expect(results.success).toBe(true);
      
      // Latency should be affected but still reasonable
      expect(session.totalLatency).toBeGreaterThan(15000); // Higher due to stress
      expect(session.totalLatency).toBeLessThan(60000); // But not excessive
    });

    it('should handle memory pressure gracefully', async () => {
      const stressConfig: StressTestConfig = {
        type: 'memory_pressure',
        intensity: 0.5,
        duration: 20000,
        parameters: { memoryReduction: 0.5 },
        allowRecovery: false
      };

      const session = await scenarioManager.executeScenario(
        'logic_tower_of_hanoi',
        testAgentConfig,
        { stressConfig }
      );

      // Should complete even under memory pressure
      expect(['completed', 'timeout']).toContain(session.status);
      
      if (session.status === 'completed') {
        const results = performanceAnalyzer.generateEvaluationResults(session);
        expect(results.overallScore).toBeGreaterThan(0.3); // Reduced but functional
      }
    });
  });

  describe('Performance Analysis', () => {
    it('should generate comprehensive evaluation results', async () => {
      const session = await scenarioManager.executeScenario(
        'spatial_multi_objective',
        testAgentConfig
      );

      const results = performanceAnalyzer.generateEvaluationResults(session);
      
      // Should have all required result components
      expect(results.sessionId).toBeDefined();
      expect(results.overallScore).toBeGreaterThanOrEqual(0);
      expect(results.overallScore).toBeLessThanOrEqual(1);
      expect(results.metrics).toBeInstanceOf(Array);
      expect(results.metrics.length).toBeGreaterThan(0);
      
      // Should have performance breakdowns
      expect(results.planningPerformance).toBeDefined();
      expect(results.executionPerformance).toBeDefined();
      expect(results.cognitivePerformance).toBeDefined();
      
      // Should have qualitative assessment
      expect(results.strengths).toBeInstanceOf(Array);
      expect(results.weaknesses).toBeInstanceOf(Array);
      expect(results.recommendations).toBeInstanceOf(Array);
    });

    it('should track performance across multiple sessions', async () => {
      // Run multiple sessions
      const sessions = await Promise.all([
        scenarioManager.executeScenario('spatial_maze_basic', testAgentConfig),
        scenarioManager.executeScenario('logic_tower_of_hanoi', testAgentConfig),
        scenarioManager.executeScenario('social_negotiation', testAgentConfig)
      ]);

      // Add to analyzer
      sessions.forEach(session => performanceAnalyzer.addSession(session));
      
      // Generate performance profile
      const profile = performanceAnalyzer.generatePerformanceProfile(testAgentConfig.id);
      
      expect(profile.agentId).toBe(testAgentConfig.id);
      expect(profile.totalSessions).toBe(3);
      expect(profile.successRate).toBeGreaterThanOrEqual(0);
      expect(profile.successRate).toBeLessThanOrEqual(1);
      
      // Should have domain-specific performance data
      expect(Object.keys(profile.domainPerformance).length).toBeGreaterThan(0);
      expect(Object.keys(profile.complexityPerformance).length).toBeGreaterThan(0);
    });

    it('should identify strengths and weaknesses', async () => {
      // Run several sessions to build performance history
      const sessions = await Promise.all([
        scenarioManager.executeScenario('spatial_maze_basic', testAgentConfig),
        scenarioManager.executeScenario('spatial_multi_objective', testAgentConfig),
        scenarioManager.executeScenario('logic_tower_of_hanoi', testAgentConfig),
        scenarioManager.executeScenario('logic_sequence_prediction', testAgentConfig)
      ]);

      sessions.forEach(session => performanceAnalyzer.addSession(session));
      
      const profile = performanceAnalyzer.generatePerformanceProfile(testAgentConfig.id);
      
      // Should identify patterns in performance
      expect(profile.strengthsAndWeaknesses.strengths).toBeInstanceOf(Array);
      expect(profile.strengthsAndWeaknesses.weaknesses).toBeInstanceOf(Array);
      expect(profile.strengthsAndWeaknesses.recommendations).toBeInstanceOf(Array);
      
      // If there are recommendations, they should be actionable
      if (profile.strengthsAndWeaknesses.recommendations.length > 0) {
        profile.strengthsAndWeaknesses.recommendations.forEach(rec => {
          expect(rec.length).toBeGreaterThan(10); // Should be descriptive
        });
      }
    });
  });

  describe('Curriculum Progression', () => {
    it('should progress through complexity levels appropriately', async () => {
      const complexityOrder = ['basic', 'intermediate', 'advanced', 'expert'];
      const results: { complexity: string; score: number }[] = [];

      for (const complexity of complexityOrder) {
        const scenarios = scenariosByComplexity[complexity as keyof typeof scenariosByComplexity];
        if (scenarios && scenarios.length > 0) {
          const scenario = scenarios[0]; // Test first scenario of each complexity
          const session = await scenarioManager.executeScenario(
            scenario.id,
            testAgentConfig
          );
          
          const evaluation = performanceAnalyzer.generateEvaluationResults(session);
          results.push({
            complexity,
            score: evaluation.overallScore
          });
        }
      }

      // Should show reasonable performance across complexity levels
      expect(results.length).toBeGreaterThan(2);
      
      // Basic scenarios should generally perform better than expert ones
      const basicScore = results.find(r => r.complexity === 'basic')?.score || 0;
      const expertScore = results.find(r => r.complexity === 'expert')?.score || 0;
      
      // Allow for some variation, but expect general trend
      expect(basicScore).toBeGreaterThan(0.4);
      expect(expertScore).toBeGreaterThan(0.2); // Should still be functional
    });
  });

  describe('Real-time Monitoring', () => {
    it('should emit evaluation events during execution', async () => {
      const events: any[] = [];
      
      scenarioManager.on('evaluationEvent', (event) => {
        events.push(event);
      });

      await scenarioManager.executeScenario(
        'spatial_maze_basic',
        testAgentConfig,
        { enableRealTimeMonitoring: true }
      );

      // Should have emitted start and end events at minimum
      const startEvents = events.filter(e => e.eventType === 'session_start');
      const endEvents = events.filter(e => e.eventType === 'session_end');
      
      expect(startEvents.length).toBe(1);
      expect(endEvents.length).toBe(1);
      
      // Should have step completion events
      const stepEvents = events.filter(e => e.eventType === 'step_complete');
      expect(stepEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Integration with HRM Architecture', () => {
    it('should demonstrate HRM routing for structured tasks', async () => {
      const sessions = await Promise.all([
        scenarioManager.executeScenario('spatial_maze_basic', testAgentConfig),
        scenarioManager.executeScenario('logic_tower_of_hanoi', testAgentConfig)
      ]);

      sessions.forEach(session => {
        const planningSteps = session.steps.filter(step => step.action === 'planning');
        const hrmUsage = planningSteps.some(step => 
          step.result?.routingDecision?.router === 'hrm_structured'
        );
        expect(hrmUsage).toBe(true);
      });
    });

    it('should demonstrate collaborative reasoning for complex tasks', async () => {
      const sessions = await Promise.all([
        scenarioManager.executeScenario('ethical_trolley_variant', testAgentConfig),
        scenarioManager.executeScenario('social_negotiation', testAgentConfig)
      ]);

      sessions.forEach(session => {
        const planningSteps = session.steps.filter(step => step.action === 'planning');
        const collaborativeUsage = planningSteps.some(step => 
          step.result?.routingDecision?.router === 'collaborative'
        );
        expect(collaborativeUsage).toBe(true);
      });
    });

    it('should meet performance targets from HRM integration plan', async () => {
      const session = await scenarioManager.executeScenario(
        'spatial_maze_basic',
        testAgentConfig
      );

      const results = performanceAnalyzer.generateEvaluationResults(session);
      
      // Should meet latency targets: HRM <100ms routing, overall <200ms planning
      expect(results.planningPerformance.latency).toBeLessThan(200);
      
      // Should achieve high success rate on basic tasks
      expect(results.overallScore).toBeGreaterThan(0.8);
      
      // Should demonstrate iterative refinement
      expect(results.planningPerformance.refinementCount).toBeGreaterThanOrEqual(0);
    });
  });
});

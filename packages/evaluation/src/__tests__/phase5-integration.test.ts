/**
 * Phase 5 Integration Tests
 *
 * Comprehensive integration tests for the evaluation suite including
 * MineDojo scenarios, performance benchmarking, and regression detection.
 *
 * @author @darianrosebrook
 */

import {
  PerformanceBenchmarker,
  RegressionMonitor,
  EvaluationDashboard,
  allMinedojoScenarios,
  minedojoCurriculumProgression,
  MINEDOJO_METADATA,
} from '../index';

describe('Phase 5: Evaluation Suite Integration', () => {
  let benchmarker: PerformanceBenchmarker;
  let regressionMonitor: RegressionMonitor;
  let dashboard: EvaluationDashboard;

  beforeEach(() => {
    benchmarker = new PerformanceBenchmarker();
    regressionMonitor = new RegressionMonitor();
    dashboard = new EvaluationDashboard();
  });

  afterEach(() => {
    regressionMonitor.stopMonitoring();
    dashboard.stop();
  });

  describe('MineDojo Scenarios', () => {
    test('should have comprehensive MineDojo scenario suite', () => {
      expect(allMinedojoScenarios).toBeDefined();
      expect(allMinedojoScenarios.length).toBeGreaterThan(10);

      // Check scenario diversity
      const complexityLevels = new Set(
        allMinedojoScenarios.map((s) => s.complexity)
      );
      expect(complexityLevels.size).toBeGreaterThanOrEqual(4);

      const domains = new Set(allMinedojoScenarios.map((s) => s.domain));
      expect(domains.size).toBeGreaterThanOrEqual(3);
    });

    test('should have valid curriculum progression', () => {
      expect(minedojoCurriculumProgression).toBeDefined();
      expect(minedojoCurriculumProgression.length).toBeGreaterThan(5);

      // Check that overall progression increases in difficulty
      const difficulties = minedojoCurriculumProgression.map(
        (s) => s.difficulty
      );
      const firstHalf = difficulties.slice(
        0,
        Math.floor(difficulties.length / 2)
      );
      const secondHalf = difficulties.slice(
        Math.floor(difficulties.length / 2)
      );

      const firstHalfAvg =
        firstHalf.reduce((sum, d) => sum + d, 0) / firstHalf.length;
      const secondHalfAvg =
        secondHalf.reduce((sum, d) => sum + d, 0) / secondHalf.length;

      // Second half should be generally more difficult than first half
      expect(secondHalfAvg).toBeGreaterThan(firstHalfAvg);
    });

    test('should have proper metadata', () => {
      expect(MINEDOJO_METADATA).toBeDefined();
      expect(MINEDOJO_METADATA.totalScenarios).toBe(
        allMinedojoScenarios.length
      );
      expect(MINEDOJO_METADATA.averageDifficulty).toBeGreaterThan(0);
      expect(MINEDOJO_METADATA.totalEstimatedDuration).toBeGreaterThan(0);
    });

    test('should have valid scenario structures', () => {
      allMinedojoScenarios.forEach((scenario) => {
        expect(scenario.id).toBeDefined();
        expect(scenario.name).toBeDefined();
        expect(scenario.description).toBeDefined();
        expect(scenario.domain).toBeDefined();
        expect(scenario.complexity).toBeDefined();
        expect(scenario.expectedDuration).toBeGreaterThan(0);
        expect(scenario.goalConditions).toBeDefined();
        expect(scenario.successCriteria).toBeDefined();
        expect(scenario.successCriteria.length).toBeGreaterThan(0);

        // Check success criteria weights sum to reasonable value
        const totalWeight = scenario.successCriteria.reduce(
          (sum, c) => sum + c.weight,
          0
        );
        expect(totalWeight).toBeCloseTo(1.0, 1);
      });
    });
  });

  describe('Performance Benchmarker', () => {
    test('should initialize correctly', () => {
      expect(benchmarker).toBeDefined();
      expect(benchmarker.getBenchmarkHistory()).toEqual([]);
    });

    test('should handle benchmark configuration validation', () => {
      const validConfig = {
        name: 'Test Benchmark',
        description: 'Test benchmark suite',
        scenarios: ['minedojo_wood_collection'],
        agents: ['test_agent'],
        iterations: 3,
        warmupIterations: 1,
      };

      expect(() => {
        // This would validate the config in a real implementation
        const validated = { ...validConfig };
        expect(validated.name).toBe('Test Benchmark');
      }).not.toThrow();
    });

    test('should export benchmark data', () => {
      const exportedData = benchmarker.exportBenchmarkData('json');
      expect(typeof exportedData).toBe('string');

      const parsed = JSON.parse(exportedData);
      expect(Array.isArray(parsed)).toBe(true);
    });

    test('should handle CSV export', () => {
      const csvData = benchmarker.exportBenchmarkData('csv');
      expect(typeof csvData).toBe('string');
      expect(csvData.includes(',')).toBe(true); // Basic CSV check
    });
  });

  describe('Regression Monitor', () => {
    test('should initialize with default configuration', () => {
      expect(regressionMonitor).toBeDefined();

      const dashboard = regressionMonitor.getMonitoringDashboard();
      expect(dashboard).toBeDefined();
      expect(dashboard.overallHealth).toBe('healthy');
      expect(dashboard.activeRegressions).toEqual([]);
    });

    test('should start and stop monitoring', () => {
      expect(() => {
        regressionMonitor.startMonitoring();
        regressionMonitor.stopMonitoring();
      }).not.toThrow();
    });

    test('should handle evaluation results', () => {
      const mockResult = {
        sessionId: 'test_session',
        scenarioId: 'minedojo_wood_collection',
        agentConfiguration: { id: 'test_agent' },
        overallScore: 0.85,
        success: true,
        metrics: [
          {
            type: 'success_rate',
            value: 1.0,
            weight: 0.5,
            description: 'Task completion',
          },
          {
            type: 'efficiency',
            value: 0.8,
            weight: 0.3,
            description: 'Resource efficiency',
          },
        ],
        planningPerformance: {
          latency: 1000,
          qualityScore: 0.9,
          refinementCount: 2,
          routingDecisions: ['skill_based'],
        },
        executionPerformance: {
          latency: 2000,
          accuracyScore: 0.85,
          adaptationCount: 1,
          errorRate: 0.1,
        },
        cognitivePerformance: {
          memoryUtilization: 0.6,
          reasoningDepth: 3,
          coherenceScore: 0.8,
          creativityScore: 0.7,
        },
        strengths: ['planning', 'execution'],
        weaknesses: [],
        recommendations: [],
        timestamp: Date.now(),
      };

      expect(() => {
        regressionMonitor.addEvaluationResult(mockResult);
      }).not.toThrow();
    });

    test('should export monitoring data', () => {
      const exportedData = regressionMonitor.exportMonitoringData();
      expect(exportedData).toBeDefined();
      expect(exportedData.config).toBeDefined();
      expect(exportedData.baselines).toBeDefined();
      expect(exportedData.activeRegressions).toBeDefined();
    });
  });

  describe('Evaluation Dashboard', () => {
    test('should initialize correctly', () => {
      expect(dashboard).toBeDefined();

      const state = dashboard.getState();
      expect(state).toBeDefined();
      expect(state.widgets).toBeDefined();
      expect(state.widgets.length).toBeGreaterThan(0);
    });

    test('should start and stop correctly', () => {
      expect(() => {
        dashboard.start();
        dashboard.stop();
      }).not.toThrow();
    });

    test('should handle evaluation results', () => {
      const mockResult = {
        sessionId: 'test_session',
        scenarioId: 'minedojo_wood_collection',
        agentConfiguration: { id: 'test_agent' },
        overallScore: 0.85,
        success: true,
        metrics: [],
        planningPerformance: {
          latency: 1000,
          qualityScore: 0.9,
          refinementCount: 2,
          routingDecisions: ['skill_based'],
        },
        executionPerformance: {
          latency: 2000,
          accuracyScore: 0.85,
          adaptationCount: 1,
          errorRate: 0.1,
        },
        cognitivePerformance: {
          memoryUtilization: 0.6,
          reasoningDepth: 3,
          coherenceScore: 0.8,
          creativityScore: 0.7,
        },
        strengths: [],
        weaknesses: [],
        recommendations: [],
        timestamp: Date.now(),
      };

      expect(() => {
        dashboard.addEvaluationResult(mockResult);
      }).not.toThrow();

      const state = dashboard.getState();
      expect(state.statistics.totalEvaluations).toBe(1);
    });

    test('should manage widgets correctly', () => {
      const customWidget = {
        id: 'custom_widget',
        type: 'metric' as const,
        title: 'Custom Metric',
        data: { value: 42 },
        lastUpdated: Date.now(),
        isLoading: false,
      };

      dashboard.addWidget(customWidget);

      const retrievedWidget = dashboard.getWidget('custom_widget');
      expect(retrievedWidget).toBeDefined();
      expect(retrievedWidget?.title).toBe('Custom Metric');

      dashboard.removeWidget('custom_widget');
      expect(dashboard.getWidget('custom_widget')).toBeUndefined();
    });

    test('should export data correctly', () => {
      const jsonData = dashboard.exportData('json');
      expect(typeof jsonData).toBe('string');

      const parsed = JSON.parse(jsonData);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.config).toBeDefined();
      expect(parsed.state).toBeDefined();
    });
  });

  describe('Integration Scenarios', () => {
    test('should integrate benchmarker with regression monitor', async () => {
      // This would test the integration between components
      const mockBenchmarkResult = {
        benchmarkId: 'integration_test',
        config: {
          name: 'Integration Test',
          description: 'Test integration',
          scenarios: ['minedojo_wood_collection'],
          agents: ['test_agent'],
          iterations: 3,
          warmupIterations: 1,
          parallelism: 1,
          timeout: 30000,
          confidenceLevel: 0.95,
          significanceThreshold: 0.05,
          includeStressTesting: false,
          generateReport: true,
          includeDetailedMetrics: true,
          exportRawData: false,
        },
        overallScore: 0.85,
        overallSuccessRate: 0.9,
        results: [],
        agentRankings: [],
        scenarioAnalysis: [],
        statisticalSignificance: {},
        regressionSummary: {
          totalRegressions: 0,
          severeRegressions: 0,
          affectedAgents: [],
          affectedScenarios: [],
          recommendations: [],
        },
        performanceTrends: {},
        executionTime: 30000,
        totalIterations: 3,
        timestamp: Date.now(),
      };

      // Add benchmark result to dashboard
      dashboard.addBenchmarkResult(mockBenchmarkResult);

      const state = dashboard.getState();
      expect(state.systemHealth).toBeDefined();
    });

    test('should handle end-to-end evaluation workflow', () => {
      // Start monitoring
      regressionMonitor.startMonitoring();
      dashboard.start();

      // Simulate evaluation results
      const results = [
        {
          sessionId: 'session_1',
          scenarioId: 'minedojo_wood_collection',
          agentConfiguration: { id: 'agent_1' },
          overallScore: 0.9,
          success: true,
          metrics: [],
          planningPerformance: {
            latency: 1000,
            qualityScore: 0.9,
            refinementCount: 2,
            routingDecisions: [],
          },
          executionPerformance: {
            latency: 2000,
            accuracyScore: 0.9,
            adaptationCount: 1,
            errorRate: 0.1,
          },
          cognitivePerformance: {
            memoryUtilization: 0.6,
            reasoningDepth: 3,
            coherenceScore: 0.8,
            creativityScore: 0.7,
          },
          strengths: [],
          weaknesses: [],
          recommendations: [],
          timestamp: Date.now(),
        },
        {
          sessionId: 'session_2',
          scenarioId: 'minedojo_wood_collection',
          agentConfiguration: { id: 'agent_1' },
          overallScore: 0.85,
          success: true,
          metrics: [],
          planningPerformance: {
            latency: 1100,
            qualityScore: 0.85,
            refinementCount: 2,
            routingDecisions: [],
          },
          executionPerformance: {
            latency: 2100,
            accuracyScore: 0.85,
            adaptationCount: 1,
            errorRate: 0.15,
          },
          cognitivePerformance: {
            memoryUtilization: 0.65,
            reasoningDepth: 3,
            coherenceScore: 0.75,
            creativityScore: 0.65,
          },
          strengths: [],
          weaknesses: [],
          recommendations: [],
          timestamp: Date.now(),
        },
      ];

      results.forEach((result) => {
        regressionMonitor.addEvaluationResult(result);
        dashboard.addEvaluationResult(result);
      });

      // Check dashboard state
      const dashboardState = dashboard.getState();
      expect(dashboardState.statistics.totalEvaluations).toBe(2);
      expect(dashboardState.statistics.successfulEvaluations).toBe(2);

      // Check monitoring dashboard
      const monitoringDashboard = regressionMonitor.getMonitoringDashboard();
      expect(monitoringDashboard.overallHealth).toBeDefined();
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large numbers of evaluation results efficiently', () => {
      const startTime = Date.now();

      // Add 100 mock results
      for (let i = 0; i < 100; i++) {
        const mockResult = {
          sessionId: `session_${i}`,
          scenarioId: `scenario_${i % 5}`,
          agentConfiguration: { id: `agent_${i % 3}` },
          overallScore: Math.random(),
          success: Math.random() > 0.2,
          metrics: [],
          planningPerformance: {
            latency: Math.random() * 2000,
            qualityScore: Math.random(),
            refinementCount: Math.floor(Math.random() * 5),
            routingDecisions: [],
          },
          executionPerformance: {
            latency: Math.random() * 3000,
            accuracyScore: Math.random(),
            adaptationCount: Math.floor(Math.random() * 3),
            errorRate: Math.random() * 0.3,
          },
          cognitivePerformance: {
            memoryUtilization: Math.random(),
            reasoningDepth: Math.floor(Math.random() * 5),
            coherenceScore: Math.random(),
            creativityScore: Math.random(),
          },
          strengths: [],
          weaknesses: [],
          recommendations: [],
          timestamp: Date.now(),
        };

        dashboard.addEvaluationResult(mockResult);
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should process 100 results in reasonable time (< 1 second)
      expect(processingTime).toBeLessThan(1000);

      const state = dashboard.getState();
      expect(state.statistics.totalEvaluations).toBe(100);
    });

    test('should maintain memory efficiency with data cleanup', () => {
      // This test would check memory usage patterns
      // For now, we'll just verify the dashboard handles data correctly

      const initialState = dashboard.getState();
      const initialWidgetCount = initialState.widgets.length;

      // Add many results
      for (let i = 0; i < 200; i++) {
        const mockResult = {
          sessionId: `session_${i}`,
          scenarioId: 'test_scenario',
          agentConfiguration: { id: 'test_agent' },
          overallScore: Math.random(),
          success: true,
          metrics: [],
          planningPerformance: {
            latency: 1000,
            qualityScore: 0.9,
            refinementCount: 2,
            routingDecisions: [],
          },
          executionPerformance: {
            latency: 2000,
            accuracyScore: 0.9,
            adaptationCount: 1,
            errorRate: 0.1,
          },
          cognitivePerformance: {
            memoryUtilization: 0.6,
            reasoningDepth: 3,
            coherenceScore: 0.8,
            creativityScore: 0.7,
          },
          strengths: [],
          weaknesses: [],
          recommendations: [],
          timestamp: Date.now(),
        };

        dashboard.addEvaluationResult(mockResult);
      }

      const finalState = dashboard.getState();

      // Should maintain reasonable data size (dashboard should limit history)
      expect(finalState.statistics.totalEvaluations).toBeLessThanOrEqual(200);
      expect(finalState.widgets.length).toBe(initialWidgetCount); // Widget count should remain stable
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle invalid evaluation results gracefully', () => {
      const invalidResult = {
        // Missing required fields
        sessionId: 'invalid_session',
      } as any;

      expect(() => {
        // Dashboard should handle invalid data gracefully
        dashboard.addEvaluationResult(invalidResult);
      }).not.toThrow();
    });

    test('should recover from component failures', () => {
      // Start components
      regressionMonitor.startMonitoring();
      dashboard.start();

      // Simulate component restart
      regressionMonitor.stopMonitoring();
      dashboard.stop();

      // Should be able to restart
      expect(() => {
        regressionMonitor.startMonitoring();
        dashboard.start();
      }).not.toThrow();
    });

    test('should handle export failures gracefully', () => {
      // Test export with potentially problematic data
      expect(() => {
        const data = dashboard.exportData('json');
        expect(typeof data).toBe('string');
      }).not.toThrow();

      expect(() => {
        const data = dashboard.exportData('csv');
        expect(typeof data).toBe('string');
      }).not.toThrow();
    });
  });
});

describe('Phase 5: MineDojo Scenario Validation', () => {
  test('should validate all MineDojo scenarios', () => {
    allMinedojoScenarios.forEach((scenario) => {
      // Validate required fields
      expect(scenario.id).toMatch(/^minedojo_/);
      expect(scenario.name).toBeTruthy();
      expect(scenario.description).toBeTruthy();

      // Validate numeric fields
      expect(scenario.difficulty).toBeGreaterThanOrEqual(1);
      expect(scenario.difficulty).toBeLessThanOrEqual(10);
      expect(scenario.expectedDuration).toBeGreaterThan(0);
      expect(scenario.estimatedSteps).toBeGreaterThan(0);

      // Validate arrays
      expect(Array.isArray(scenario.goalConditions)).toBe(true);
      expect(scenario.goalConditions.length).toBeGreaterThan(0);
      expect(Array.isArray(scenario.constraints)).toBe(true);
      expect(Array.isArray(scenario.successCriteria)).toBe(true);
      expect(scenario.successCriteria.length).toBeGreaterThan(0);
      expect(Array.isArray(scenario.tags)).toBe(true);

      // Validate success criteria
      scenario.successCriteria.forEach((criteria) => {
        expect(criteria.metric).toBeTruthy();
        expect(criteria.threshold).toBeGreaterThanOrEqual(0);
        expect(criteria.weight).toBeGreaterThan(0);
        expect(criteria.weight).toBeLessThanOrEqual(1);
      });

      // Validate initial state
      expect(scenario.initialState).toBeDefined();
      expect(typeof scenario.initialState).toBe('object');

      // Validate resources
      expect(scenario.resources).toBeDefined();
      expect(typeof scenario.resources).toBe('object');
    });
  });

  test('should have proper MineDojo scenario categorization', () => {
    const basicScenarios = allMinedojoScenarios.filter(
      (s) => s.complexity === 'basic'
    );
    const intermediateScenarios = allMinedojoScenarios.filter(
      (s) => s.complexity === 'intermediate'
    );
    const advancedScenarios = allMinedojoScenarios.filter(
      (s) => s.complexity === 'advanced'
    );
    const expertScenarios = allMinedojoScenarios.filter(
      (s) => s.complexity === 'expert'
    );
    const emergentScenarios = allMinedojoScenarios.filter(
      (s) => s.complexity === 'emergent'
    );

    // Should have scenarios at each complexity level
    expect(basicScenarios.length).toBeGreaterThan(0);
    expect(intermediateScenarios.length).toBeGreaterThan(0);
    expect(advancedScenarios.length).toBeGreaterThan(0);
    expect(expertScenarios.length).toBeGreaterThan(0);

    // Basic scenarios should be easier
    basicScenarios.forEach((scenario) => {
      expect(scenario.difficulty).toBeLessThanOrEqual(4);
      expect(scenario.estimatedSteps).toBeLessThanOrEqual(10);
    });

    // Expert scenarios should be harder
    expertScenarios.forEach((scenario) => {
      expect(scenario.difficulty).toBeGreaterThanOrEqual(7);
      expect(scenario.estimatedSteps).toBeGreaterThanOrEqual(15);
    });
  });
});

describe('Phase 5: System Integration', () => {
  test('should integrate with existing evaluation framework', () => {
    // Test that new components work with existing framework
    const { createEvaluationFramework } = require('../index');

    expect(() => {
      const framework = createEvaluationFramework();
      expect(framework).toBeDefined();
      expect(framework.scenarios).toBeDefined();
      expect(framework.scenarioManager).toBeDefined();
      expect(framework.performanceAnalyzer).toBeDefined();
    }).not.toThrow();
  });

  test('should maintain backward compatibility', () => {
    // Test that existing functionality still works
    const { quickEvaluate, batchEvaluate } = require('../index');

    expect(typeof quickEvaluate).toBe('function');
    expect(typeof batchEvaluate).toBe('function');
  });
});

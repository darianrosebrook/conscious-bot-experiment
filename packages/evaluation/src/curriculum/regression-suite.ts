/**
 * Regression Suite
 *
 * Handles automated regression testing, performance validation, and quality gate
 * management for curriculum validation and capability verification.
 *
 * @author @darianrosebrook
 */

import {
  RegressionSuite,
  RegressionTest,
  TestSchedule,
  QualityGate,
  QualityCriterion,
  TestResult,
  TestType,
  CurriculumConfig,
  DEFAULT_CURRICULUM_CONFIG,
} from './types';

/**
 * Result of regression test execution
 */
export interface RegressionTestResult {
  suiteId: string;
  executionId: string;
  results: TestResult[];
  summary: TestSummary;
  qualityGateResults: QualityGateResult[];
  recommendations: string[];
  metadata: Record<string, any>;
}

/**
 * Summary of test execution
 */
export interface TestSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  errorTests: number;
  passRate: number; // 0-1
  averageDuration: number; // seconds
  totalDuration: number; // seconds
  performanceDegradation: number; // percentage
  criticalFailures: string[];
}

/**
 * Result of quality gate evaluation
 */
export interface QualityGateResult {
  gateId: string;
  gateName: string;
  status: 'passed' | 'failed' | 'warning';
  severity: 'low' | 'medium' | 'high' | 'critical';
  criteriaResults: CriterionResult[];
  overallScore: number; // 0-1
  action: 'pass' | 'fail' | 'warn';
  recommendations: string[];
}

/**
 * Result of individual quality criterion
 */
export interface CriterionResult {
  criterionId: string;
  metric: string;
  actualValue: number;
  threshold: number;
  operator: 'gte' | 'lte' | 'eq' | 'gt' | 'lt';
  passed: boolean;
  weight: number;
  contribution: number; // Weighted contribution to overall score
}

/**
 * Regression suite manager for capability validation
 */
export class RegressionSuiteManager {
  private config: CurriculumConfig;
  private suites: Map<string, RegressionSuite> = new Map();
  private testResults: Map<string, TestResult[]> = new Map();
  private qualityGateResults: Map<string, QualityGateResult[]> = new Map();

  constructor(config: Partial<CurriculumConfig> = {}) {
    this.config = { ...DEFAULT_CURRICULUM_CONFIG, ...config };
  }

  /**
   * Create regression test suite
   */
  createRegressionSuite(
    name: string,
    description: string,
    tests: RegressionTest[],
    schedule: TestSchedule,
    qualityGates: QualityGate[]
  ): string {
    const suiteId = `regression_suite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const suite: RegressionSuite = {
      id: suiteId,
      name,
      description,
      tests,
      schedule,
      qualityGates,
      metadata: {
        createdAt: Date.now(),
        version: '1.0.0',
      },
    };

    this.suites.set(suiteId, suite);
    return suiteId;
  }

  /**
   * Execute regression test suite
   */
  async executeRegressionSuite(suiteId: string): Promise<RegressionTestResult> {
    const suite = this.suites.get(suiteId);
    if (!suite) {
      throw new Error(`Regression suite ${suiteId} not found`);
    }

    const executionId = `execution_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const results: TestResult[] = [];
    const startTime = Date.now();

    try {
      // Execute all tests in the suite
      for (const test of suite.tests) {
        const testResult = await this.executeTest(test);
        results.push(testResult);
      }

      // Calculate summary
      const summary = this.calculateTestSummary(results);

      // Evaluate quality gates
      const qualityGateResults = this.evaluateQualityGates(suite.qualityGates, results);

      // Generate recommendations
      const recommendations = this.generateRecommendations(summary, qualityGateResults);

      const totalDuration = Date.now() - startTime;

      const testResult: RegressionTestResult = {
        suiteId,
        executionId,
        results,
        summary: {
          ...summary,
          totalDuration: totalDuration / 1000, // Convert to seconds
        },
        qualityGateResults,
        recommendations,
        metadata: {
          executedAt: Date.now(),
          suiteVersion: suite.metadata.version,
        },
      };

      // Store results
      this.testResults.set(executionId, results);
      this.qualityGateResults.set(executionId, qualityGateResults);

      return testResult;
    } catch (error) {
      console.error('Error executing regression suite:', error);
      throw new Error(`Failed to execute regression suite ${suiteId}: ${error}`);
    }
  }

  /**
   * Execute individual test
   */
  private async executeTest(test: RegressionTest): Promise<TestResult> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: string | undefined;

    while (attempts < test.retryCount + 1) {
      try {
        attempts++;
        
        // Simulate test execution based on test type
        const result = await this.simulateTestExecution(test);
        
        const duration = Date.now() - startTime;
        
        return {
          testId: test.id,
          status: result.status,
          score: result.score,
          metrics: result.metrics,
          duration: duration / 1000, // Convert to seconds
          attempts,
          timestamp: Date.now(),
          metadata: {
            testType: test.testType,
            weight: test.weight,
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        
        if (attempts > test.retryCount) {
          const duration = Date.now() - startTime;
          
          return {
            testId: test.id,
            status: 'error',
            score: 0,
            metrics: {},
            duration: duration / 1000,
            attempts,
            error: lastError,
            timestamp: Date.now(),
            metadata: {
              testType: test.testType,
              weight: test.weight,
            },
          };
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error('Test execution failed after all retries');
  }

  /**
   * Simulate test execution based on test type
   */
  private async simulateTestExecution(test: RegressionTest): Promise<{
    status: 'passed' | 'failed' | 'skipped';
    score: number;
    metrics: Record<string, number>;
  }> {
    // Simulate different test types
    switch (test.testType) {
      case TestType.FUNCTIONAL:
        return this.simulateFunctionalTest(test);
      case TestType.PERFORMANCE:
        return this.simulatePerformanceTest(test);
      case TestType.STRESS:
        return this.simulateStressTest(test);
      case TestType.INTEGRATION:
        return this.simulateIntegrationTest(test);
      case TestType.REGRESSION:
        return this.simulateRegressionTest(test);
      case TestType.ABLATION:
        return this.simulateAblationTest(test);
      default:
        throw new Error(`Unknown test type: ${test.testType}`);
    }
  }

  /**
   * Simulate functional test execution
   */
  private async simulateFunctionalTest(test: RegressionTest): Promise<{
    status: 'passed' | 'failed' | 'skipped';
    score: number;
    metrics: Record<string, number>;
  }> {
    // Simulate functional test with 90% success rate
    const success = Math.random() > 0.1;
    const score = success ? 0.9 + Math.random() * 0.1 : 0.3 + Math.random() * 0.3;
    
    return {
      status: success ? 'passed' : 'failed',
      score,
      metrics: {
        functional_success_rate: score,
        response_time: 100 + Math.random() * 200,
        error_rate: success ? 0 : 0.1 + Math.random() * 0.2,
      },
    };
  }

  /**
   * Simulate performance test execution
   */
  private async simulatePerformanceTest(test: RegressionTest): Promise<{
    status: 'passed' | 'failed' | 'skipped';
    score: number;
    metrics: Record<string, number>;
  }> {
    const baselineMetrics = test.baselineMetrics;
    const currentMetrics: Record<string, number> = {};
    
    // Simulate performance metrics with some variation
    for (const [metric, baseline] of Object.entries(baselineMetrics)) {
      const variation = 0.8 + Math.random() * 0.4; // ±20% variation
      currentMetrics[metric] = baseline * variation;
    }
    
    // Calculate performance degradation
    const degradation = this.calculatePerformanceDegradation(baselineMetrics, currentMetrics);
    const acceptable = degradation <= test.acceptableDegradation;
    const score = acceptable ? 0.8 + Math.random() * 0.2 : 0.3 + Math.random() * 0.4;
    
    return {
      status: acceptable ? 'passed' : 'failed',
      score,
      metrics: {
        ...currentMetrics,
        performance_degradation: degradation,
        acceptable_degradation: test.acceptableDegradation,
      },
    };
  }

  /**
   * Simulate stress test execution
   */
  private async simulateStressTest(test: RegressionTest): Promise<{
    status: 'passed' | 'failed' | 'skipped';
    score: number;
    metrics: Record<string, number>;
  }> {
    // Simulate stress test with load and stability metrics
    const loadLevel = test.parameters.loadLevel || 100;
    const success = Math.random() > 0.15; // 85% success rate
    const score = success ? 0.7 + Math.random() * 0.3 : 0.2 + Math.random() * 0.3;
    
    return {
      status: success ? 'passed' : 'failed',
      score,
      metrics: {
        load_level: loadLevel,
        stability_score: score,
        error_rate_under_stress: success ? 0.05 + Math.random() * 0.1 : 0.3 + Math.random() * 0.4,
        response_time_under_stress: 200 + Math.random() * 500,
      },
    };
  }

  /**
   * Simulate integration test execution
   */
  private async simulateIntegrationTest(test: RegressionTest): Promise<{
    status: 'passed' | 'failed' | 'skipped';
    score: number;
    metrics: Record<string, number>;
  }> {
    // Simulate integration test with component interaction metrics
    const components = test.parameters.components || ['component1', 'component2'];
    const success = Math.random() > 0.12; // 88% success rate
    const score = success ? 0.8 + Math.random() * 0.2 : 0.4 + Math.random() * 0.3;
    
    return {
      status: success ? 'passed' : 'failed',
      score,
      metrics: {
        integration_success_rate: score,
        component_interaction_count: components.length,
        data_flow_success_rate: score * 0.9,
        error_propagation_rate: success ? 0.02 + Math.random() * 0.05 : 0.2 + Math.random() * 0.3,
      },
    };
  }

  /**
   * Simulate regression test execution
   */
  private async simulateRegressionTest(test: RegressionTest): Promise<{
    status: 'passed' | 'failed' | 'skipped';
    score: number;
    metrics: Record<string, number>;
  }> {
    // Simulate regression test comparing against baseline
    const baselineMetrics = test.baselineMetrics;
    const currentMetrics: Record<string, number> = {};
    
    // Simulate current metrics with regression detection
    for (const [metric, baseline] of Object.entries(baselineMetrics)) {
      const regression = Math.random() > 0.85; // 15% chance of regression
      const variation = regression ? 0.5 + Math.random() * 0.3 : 0.9 + Math.random() * 0.2;
      currentMetrics[metric] = baseline * variation;
    }
    
    const regressionDetected = Object.values(currentMetrics).some(value => 
      value < Object.values(baselineMetrics)[0] * 0.8
    );
    
    const score = regressionDetected ? 0.3 + Math.random() * 0.4 : 0.8 + Math.random() * 0.2;
    
    return {
      status: regressionDetected ? 'failed' : 'passed',
      score,
      metrics: {
        ...currentMetrics,
        regression_detected: regressionDetected ? 1 : 0,
        baseline_comparison_score: score,
      },
    };
  }

  /**
   * Simulate ablation test execution
   */
  private async simulateAblationTest(test: RegressionTest): Promise<{
    status: 'passed' | 'failed' | 'skipped';
    score: number;
    metrics: Record<string, number>;
  }> {
    // Simulate ablation test with component impact analysis
    const components = test.parameters.components || ['component1'];
    const ablatedComponent = test.parameters.ablatedComponent || components[0];
    const success = Math.random() > 0.2; // 80% success rate
    const score = success ? 0.7 + Math.random() * 0.3 : 0.4 + Math.random() * 0.3;
    
    return {
      status: success ? 'passed' : 'failed',
      score,
      metrics: {
        ablation_impact_score: score,
        ablated_component: ablatedComponent,
        performance_impact: success ? 0.1 + Math.random() * 0.2 : 0.4 + Math.random() * 0.4,
        functionality_impact: success ? 0.05 + Math.random() * 0.1 : 0.3 + Math.random() * 0.4,
      },
    };
  }

  /**
   * Calculate performance degradation
   */
  private calculatePerformanceDegradation(
    baseline: Record<string, number>,
    current: Record<string, number>
  ): number {
    let totalDegradation = 0;
    let metricCount = 0;
    
    for (const [metric, baselineValue] of Object.entries(baseline)) {
      const currentValue = current[metric];
      if (currentValue !== undefined) {
        const degradation = ((baselineValue - currentValue) / baselineValue) * 100;
        totalDegradation += Math.max(0, degradation); // Only count performance losses
        metricCount++;
      }
    }
    
    return metricCount > 0 ? totalDegradation / metricCount : 0;
  }

  /**
   * Calculate test summary
   */
  private calculateTestSummary(results: TestResult[]): TestSummary {
    const totalTests = results.length;
    const passedTests = results.filter(r => r.status === 'passed').length;
    const failedTests = results.filter(r => r.status === 'failed').length;
    const skippedTests = results.filter(r => r.status === 'skipped').length;
    const errorTests = results.filter(r => r.status === 'error').length;
    
    const passRate = totalTests > 0 ? passedTests / totalTests : 0;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const averageDuration = totalTests > 0 ? totalDuration / totalTests : 0;
    
    // Calculate performance degradation
    const performanceTests = results.filter(r => 
      r.metadata.testType === TestType.PERFORMANCE || r.metadata.testType === TestType.REGRESSION
    );
    const degradation = performanceTests.length > 0 
      ? performanceTests.reduce((sum, r) => sum + (r.metrics.performance_degradation || 0), 0) / performanceTests.length
      : 0;
    
    // Identify critical failures
    const criticalFailures = results
      .filter(r => r.status === 'failed' && r.metadata.weight > 0.7)
      .map(r => r.testId);
    
    return {
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      errorTests,
      passRate,
      averageDuration,
      totalDuration,
      performanceDegradation: degradation,
      criticalFailures,
    };
  }

  /**
   * Evaluate quality gates
   */
  private evaluateQualityGates(gates: QualityGate[], results: TestResult[]): QualityGateResult[] {
    const gateResults: QualityGateResult[] = [];
    
    for (const gate of gates) {
      const criteriaResults: CriterionResult[] = [];
      let totalScore = 0;
      let totalWeight = 0;
      
      for (const criterion of gate.criteria) {
        const actualValue = this.calculateMetricValue(criterion.metric, results);
        const passed = this.evaluateCriterion(criterion, actualValue);
        const contribution = passed ? criterion.weight : 0;
        
        criteriaResults.push({
          criterionId: criterion.id || `criterion_${criterion.metric}`,
          metric: criterion.metric,
          actualValue,
          threshold: criterion.threshold,
          operator: criterion.operator,
          passed,
          weight: criterion.weight,
          contribution,
        });
        
        totalScore += contribution;
        totalWeight += criterion.weight;
      }
      
      const overallScore = totalWeight > 0 ? totalScore / totalWeight : 0;
      const status = this.determineGateStatus(gate, overallScore, criteriaResults);
      const recommendations = this.generateGateRecommendations(gate, criteriaResults);
      
      gateResults.push({
        gateId: gate.id,
        gateName: gate.name,
        status,
        severity: gate.severity,
        criteriaResults,
        overallScore,
        action: gate.action,
        recommendations,
      });
    }
    
    return gateResults;
  }

  /**
   * Calculate metric value from test results
   */
  private calculateMetricValue(metric: string, results: TestResult[]): number {
    const values: number[] = [];
    
    for (const result of results) {
      if (result.metrics[metric] !== undefined) {
        values.push(result.metrics[metric]);
      }
    }
    
    if (values.length === 0) {
      return 0;
    }
    
    // Return average value
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Evaluate individual criterion
   */
  private evaluateCriterion(criterion: QualityCriterion, actualValue: number): boolean {
    switch (criterion.operator) {
      case 'gte':
        return actualValue >= criterion.threshold;
      case 'lte':
        return actualValue <= criterion.threshold;
      case 'eq':
        return Math.abs(actualValue - criterion.threshold) < 0.01;
      case 'gt':
        return actualValue > criterion.threshold;
      case 'lt':
        return actualValue < criterion.threshold;
      default:
        return false;
    }
  }

  /**
   * Determine gate status
   */
  private determineGateStatus(
    gate: QualityGate,
    overallScore: number,
    criteriaResults: CriterionResult[]
  ): 'passed' | 'failed' | 'warning' {
    const failedCriteria = criteriaResults.filter(c => !c.passed);
    const criticalFailures = failedCriteria.filter(c => 
      gate.severity === 'critical' || gate.severity === 'high'
    );
    
    if (criticalFailures.length > 0) {
      return 'failed';
    }
    
    if (overallScore >= 0.8) {
      return 'passed';
    } else if (overallScore >= 0.6) {
      return 'warning';
    } else {
      return 'failed';
    }
  }

  /**
   * Generate gate recommendations
   */
  private generateGateRecommendations(
    gate: QualityGate,
    criteriaResults: CriterionResult[]
  ): string[] {
    const recommendations: string[] = [];
    const failedCriteria = criteriaResults.filter(c => !c.passed);
    
    for (const criterion of failedCriteria) {
      recommendations.push(
        `Improve ${criterion.metric} from ${criterion.actualValue.toFixed(2)} to at least ${criterion.threshold}`
      );
    }
    
    if (failedCriteria.length > 0) {
      recommendations.push(
        `Review and optimize components affecting ${failedCriteria.map(c => c.metric).join(', ')}`
      );
    }
    
    return recommendations;
  }

  /**
   * Generate overall recommendations
   */
  private generateRecommendations(
    summary: TestSummary,
    qualityGateResults: QualityGateResult[]
  ): string[] {
    const recommendations: string[] = [];
    
    // Test pass rate recommendations
    if (summary.passRate < 0.8) {
      recommendations.push(
        `Improve test pass rate from ${(summary.passRate * 100).toFixed(1)}% to at least 80%`
      );
    }
    
    // Performance degradation recommendations
    if (summary.performanceDegradation > 10) {
      recommendations.push(
        `Address performance degradation of ${summary.performanceDegradation.toFixed(1)}%`
      );
    }
    
    // Critical failures recommendations
    if (summary.criticalFailures.length > 0) {
      recommendations.push(
        `Fix critical failures in tests: ${summary.criticalFailures.join(', ')}`
      );
    }
    
    // Quality gate recommendations
    const failedGates = qualityGateResults.filter(g => g.status === 'failed');
    for (const gate of failedGates) {
      recommendations.push(
        `Address quality gate "${gate.gateName}" failures: ${gate.recommendations.join('; ')}`
      );
    }
    
    return recommendations;
  }

  /**
   * Get regression suite by ID
   */
  getSuite(suiteId: string): RegressionSuite | undefined {
    return this.suites.get(suiteId);
  }

  /**
   * Get all regression suites
   */
  getAllSuites(): RegressionSuite[] {
    return Array.from(this.suites.values());
  }

  /**
   * Get test results by execution ID
   */
  getTestResults(executionId: string): TestResult[] | undefined {
    return this.testResults.get(executionId);
  }

  /**
   * Get quality gate results by execution ID
   */
  getQualityGateResults(executionId: string): QualityGateResult[] | undefined {
    return this.qualityGateResults.get(executionId);
  }

  /**
   * Clear all data
   */
  clearData(): void {
    this.suites.clear();
    this.testResults.clear();
    this.qualityGateResults.clear();
  }
}

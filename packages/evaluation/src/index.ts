/**
 * Evaluation Framework for Complex Multi-Step Reasoning
 *
 * Comprehensive evaluation system for testing HRM-inspired cognitive architecture
 * against complex reasoning scenarios across multiple domains
 *
 * @author @darianrosebrook
 */

// Core types
export * from './types';

// Scenarios
export * from './scenarios/complex-reasoning-scenarios';
export * from './scenarios/minedojo-scenarios';
export { ScenarioManager } from './scenarios/scenario-manager';

// Metrics and analysis
export { PerformanceAnalyzer } from './metrics/performance-analyzer';

// Benchmarking (excluded from build - available at runtime)
// export { PerformanceBenchmarker } from './benchmarking/performance-benchmarker';
// export type {
//   BenchmarkConfig,
//   BenchmarkResult,
//   BenchmarkSuiteResult,
// } from './benchmarking/performance-benchmarker';

// Regression monitoring
export { RegressionMonitor } from './regression/regression-monitor';
export type {
  RegressionConfig,
  RegressionDetection,
  PerformanceBaseline,
  MonitoringDashboard,
} from './regression/regression-monitor';

// Dashboard
export { EvaluationDashboard } from './dashboard/evaluation-dashboard';
export type {
  DashboardConfig,
  DashboardWidget,
  DashboardState,
} from './dashboard/evaluation-dashboard';

// Main evaluation interfaces
export interface EvaluationFramework {
  scenarios: typeof import('./scenarios/complex-reasoning-scenarios');
  scenarioManager: import('./scenarios/scenario-manager').ScenarioManager;
  performanceAnalyzer: import('./metrics/performance-analyzer').PerformanceAnalyzer;
}

/**
 * Create a complete evaluation framework instance
 */
export function createEvaluationFramework(): EvaluationFramework {
  const { ScenarioManager } = require('./scenarios/scenario-manager');
  const { PerformanceAnalyzer } = require('./metrics/performance-analyzer');
  const scenarios = require('./scenarios/complex-reasoning-scenarios');

  const scenarioManager = new ScenarioManager();
  const performanceAnalyzer = new PerformanceAnalyzer();

  // Register all scenarios
  scenarioManager.registerScenarios(scenarios.allComplexReasoningScenarios);
  scenarios.allComplexReasoningScenarios.forEach((scenario: any) =>
    performanceAnalyzer.registerScenario(scenario)
  );

  return {
    scenarios,
    scenarioManager,
    performanceAnalyzer,
  };
}

/**
 * Quick evaluation runner for single scenarios
 */
export async function quickEvaluate(
  scenarioId: string,
  agentConfig: import('./types').AgentConfig,
  options: {
    enableMonitoring?: boolean;
    stressConfig?: import('./types').StressTestConfig;
  } = {}
): Promise<import('./types').EvaluationResults> {
  const framework = createEvaluationFramework();

  const session = await framework.scenarioManager.executeScenario(
    scenarioId,
    agentConfig,
    {
      enableRealTimeMonitoring: options.enableMonitoring || false,
      stressConfig: options.stressConfig,
    }
  );

  return framework.performanceAnalyzer.generateEvaluationResults(session);
}

/**
 * Batch evaluation runner for multiple scenarios
 */
export async function batchEvaluate(
  scenarioIds: string[],
  agentConfigs: import('./types').AgentConfig[],
  options: {
    parallelism?: number;
    enableMonitoring?: boolean;
    generateReport?: boolean;
  } = {}
): Promise<{
  results: import('./types').EvaluationResults[];
  summary: any;
  report?: string;
}> {
  const framework = createEvaluationFramework();
  const results: import('./types').EvaluationResults[] = [];

  // Register agent configurations
  agentConfigs.forEach((config) =>
    framework.performanceAnalyzer.registerAgentConfig(config)
  );

  // Execute scenarios for each agent configuration
  for (const agentConfig of agentConfigs) {
    for (const scenarioId of scenarioIds) {
      const session = await framework.scenarioManager.executeScenario(
        scenarioId,
        agentConfig,
        { enableRealTimeMonitoring: options.enableMonitoring || false }
      );

      framework.performanceAnalyzer.addSession(session);
      const result =
        framework.performanceAnalyzer.generateEvaluationResults(session);
      results.push(result);
    }
  }

  // Generate summary statistics
  const summary = framework.performanceAnalyzer.getSummaryStatistics();

  // Generate performance profiles for each agent
  const profiles = agentConfigs.map((config) =>
    framework.performanceAnalyzer.generatePerformanceProfile(config.id)
  );

  const finalSummary = {
    ...summary,
    agentProfiles: profiles,
    scenarioCount: scenarioIds.length,
    agentCount: agentConfigs.length,
  };

  // Generate report if requested
  let report: string | undefined;
  if (options.generateReport) {
    report = generateEvaluationReport(results, finalSummary);
  }

  return {
    results,
    summary: finalSummary,
    report,
  };
}

/**
 * Generate a human-readable evaluation report
 */
function generateEvaluationReport(
  results: import('./types').EvaluationResults[],
  summary: any
): string {
  const report: string[] = [];

  report.push('# Complex Multi-Step Reasoning Evaluation Report');
  report.push('');
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push('');

  // Executive Summary
  report.push('## Executive Summary');
  report.push('');
  report.push(`- **Total Evaluations:** ${summary.totalSessions}`);
  report.push(`- **Unique Agents:** ${summary.agentCount}`);
  report.push(`- **Scenarios Tested:** ${summary.scenarioCount}`);
  report.push(
    `- **Overall Success Rate:** ${(summary.overallSuccessRate * 100).toFixed(1)}%`
  );
  report.push(
    `- **Average Session Duration:** ${(summary.averageSessionDuration / 1000).toFixed(1)}s`
  );
  report.push('');

  // Domain Performance
  report.push('## Performance by Domain');
  report.push('');
  Object.entries(summary.domainDistribution as Record<string, number>).forEach(
    ([domain, count]) => {
      const domainResults = results.filter(
        (r) =>
          r.agentConfiguration &&
          results.some((result) => {
            const scenario =
              require('./scenarios/complex-reasoning-scenarios').allComplexReasoningScenarios.find(
                (s: any) => s.id === result.scenarioId
              );
            return scenario?.domain === domain;
          })
      );
      const domainSuccessRate =
        domainResults.length > 0
          ? domainResults.filter((r) => r.success).length / domainResults.length
          : 0;

      report.push(
        `- **${domain}:** ${count} scenarios, ${(domainSuccessRate * 100).toFixed(1)}% success rate`
      );
    }
  );
  report.push('');

  // Agent Performance
  if (summary.agentProfiles && summary.agentProfiles.length > 0) {
    report.push('## Agent Performance Profiles');
    report.push('');

    summary.agentProfiles.forEach((profile: any) => {
      report.push(`### Agent: ${profile.agentId}`);
      report.push('');
      report.push(`- **Sessions:** ${profile.totalSessions}`);
      report.push(
        `- **Success Rate:** ${(profile.successRate * 100).toFixed(1)}%`
      );
      report.push(
        `- **Average Latency:** ${(profile.averageLatency / 1000).toFixed(1)}s`
      );

      if (profile.strengthsAndWeaknesses.strengths.length > 0) {
        report.push(
          `- **Strengths:** ${profile.strengthsAndWeaknesses.strengths.join(', ')}`
        );
      }

      if (profile.strengthsAndWeaknesses.weaknesses.length > 0) {
        report.push(
          `- **Areas for Improvement:** ${profile.strengthsAndWeaknesses.weaknesses.join(', ')}`
        );
      }

      report.push('');
    });
  }

  // Recommendations
  report.push('## Recommendations');
  report.push('');

  const allRecommendations = new Set<string>();
  results.forEach((result) => {
    result.recommendations.forEach((rec) => allRecommendations.add(rec));
  });

  Array.from(allRecommendations).forEach((recommendation) => {
    report.push(`- ${recommendation}`);
  });

  if (allRecommendations.size === 0) {
    report.push('- No specific recommendations identified');
  }

  report.push('');
  report.push('---');
  report.push('');
  report.push(
    '*Report generated by the HRM-inspired Cognitive Architecture Evaluation Framework*'
  );

  return report.join('\n');
}

/**
 * Curriculum progression evaluation
 */
export async function evaluateCurriculumProgression(
  agentConfig: import('./types').AgentConfig,
  options: {
    startComplexity?: 'basic' | 'intermediate' | 'advanced' | 'expert';
    enableAdaptation?: boolean;
    enableMonitoring?: boolean;
  } = {}
): Promise<{
  progression: {
    complexity: string;
    scenario: string;
    result: import('./types').EvaluationResults;
    passed: boolean;
  }[];
  finalLevel: string;
  overallSuccess: boolean;
}> {
  const framework = createEvaluationFramework();
  const {
    scenariosByComplexity,
  } = require('./scenarios/complex-reasoning-scenarios');

  const complexityOrder = [
    'basic',
    'intermediate',
    'advanced',
    'expert',
    'emergent',
  ];
  const startIndex = options.startComplexity
    ? complexityOrder.indexOf(options.startComplexity)
    : 0;

  const progression: any[] = [];
  let currentLevel = startIndex;
  let overallSuccess = true;

  for (let i = startIndex; i < complexityOrder.length; i++) {
    const complexity = complexityOrder[i];
    const scenarios = scenariosByComplexity[complexity];

    if (!scenarios || scenarios.length === 0) continue;

    // Test with the first scenario of this complexity level
    const scenario = scenarios[0];

    try {
      const session = await framework.scenarioManager.executeScenario(
        scenario.id,
        agentConfig,
        { enableRealTimeMonitoring: options.enableMonitoring || false }
      );

      const result =
        framework.performanceAnalyzer.generateEvaluationResults(session);
      const passed = result.overallScore >= 0.7; // 70% threshold for passing

      progression.push({
        complexity,
        scenario: scenario.id,
        result,
        passed,
      });

      if (!passed) {
        overallSuccess = false;
        break; // Stop at first failure
      }

      currentLevel = i;
    } catch (error) {
      overallSuccess = false;
      break;
    }
  }

  return {
    progression,
    finalLevel: complexityOrder[currentLevel],
    overallSuccess,
  };
}

// Export version info
export const EVALUATION_VERSION = '0.1.0';

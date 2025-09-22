/**
 * Performance Benchmarking System
 *
 * Comprehensive benchmarking framework for evaluating conscious bot performance
 * across multiple dimensions with statistical analysis and regression detection.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import {
  Scenario,
  EvaluationSession,
  EvaluationResults,
  AgentConfig,
  MetricType,
  StressTestConfig,
} from '../types';

/**
 * Benchmark configuration
 */
export const BenchmarkConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  scenarios: z.array(z.string()), // Scenario IDs
  agents: z.array(z.string()), // Agent config IDs

  // Execution parameters
  iterations: z.number().default(5),
  warmupIterations: z.number().default(2),
  parallelism: z.number().default(1),
  timeout: z.number().default(300000),

  // Statistical analysis
  confidenceLevel: z.number().default(0.95),
  significanceThreshold: z.number().default(0.05),

  // Stress testing
  includeStressTesting: z.boolean().default(false),
  stressConfigs: z.array(z.any()).optional(),

  // Regression detection
  baselineVersion: z.string().optional(),
  regressionThreshold: z.number().default(0.05), // 5% degradation threshold

  // Output configuration
  generateReport: z.boolean().default(true),
  includeDetailedMetrics: z.boolean().default(true),
  exportRawData: z.boolean().default(false),
});

export type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>;

/**
 * Benchmark result for a single scenario-agent combination
 */
export const BenchmarkResultSchema = z.object({
  scenarioId: z.string(),
  agentId: z.string(),
  iterations: z.number(),

  // Performance metrics
  metrics: z.record(
    z.object({
      mean: z.number(),
      median: z.number(),
      stdDev: z.number(),
      min: z.number(),
      max: z.number(),
      percentile95: z.number(),
      percentile99: z.number(),
    })
  ),

  // Success metrics
  successRate: z.number(),
  completionRate: z.number(),
  errorRate: z.number(),

  // Timing analysis
  totalDuration: z.number(),
  averageDuration: z.number(),
  durationVariability: z.number(),

  // Resource utilization
  memoryUsage: z.object({
    peak: z.number(),
    average: z.number(),
    efficiency: z.number(),
  }),

  // Quality metrics
  planningQuality: z.number(),
  executionQuality: z.number(),
  adaptabilityScore: z.number(),

  // Regression analysis
  regressionAnalysis: z
    .object({
      hasRegression: z.boolean(),
      regressionSeverity: z.enum(['none', 'minor', 'moderate', 'severe']),
      affectedMetrics: z.array(z.string()),
      confidenceLevel: z.number(),
    })
    .optional(),

  // Raw data
  rawResults: z.array(z.any()).optional(),

  timestamp: z.number(),
});

export type BenchmarkResult = z.infer<typeof BenchmarkResultSchema>;

/**
 * Comprehensive benchmark suite result
 */
export const BenchmarkSuiteResultSchema = z.object({
  benchmarkId: z.string(),
  config: BenchmarkConfigSchema,

  // Overall performance
  overallScore: z.number(),
  overallSuccessRate: z.number(),

  // Individual results
  results: z.array(BenchmarkResultSchema),

  // Comparative analysis
  agentRankings: z.array(
    z.object({
      agentId: z.string(),
      rank: z.number(),
      score: z.number(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
    })
  ),

  scenarioAnalysis: z.array(
    z.object({
      scenarioId: z.string(),
      difficulty: z.number(),
      discriminativePower: z.number(),
      averagePerformance: z.number(),
      performanceVariance: z.number(),
    })
  ),

  // Statistical analysis
  statisticalSignificance: z.record(
    z.object({
      pValue: z.number(),
      effectSize: z.number(),
      isSignificant: z.boolean(),
    })
  ),

  // Regression detection
  regressionSummary: z.object({
    totalRegressions: z.number(),
    severeRegressions: z.number(),
    affectedAgents: z.array(z.string()),
    affectedScenarios: z.array(z.string()),
    recommendations: z.array(z.string()),
  }),

  // Performance trends
  performanceTrends: z.record(
    z.object({
      trend: z.enum(['improving', 'stable', 'declining']),
      slope: z.number(),
      confidence: z.number(),
      projectedPerformance: z.number(),
    })
  ),

  // Execution metadata
  executionTime: z.number(),
  totalIterations: z.number(),
  timestamp: z.number(),

  // Report
  report: z.string().optional(),
});

export type BenchmarkSuiteResult = z.infer<typeof BenchmarkSuiteResultSchema>;

/**
 * Performance benchmarking system
 */
export class PerformanceBenchmarker extends EventEmitter {
  private benchmarkHistory: Map<string, BenchmarkSuiteResult[]> = new Map();
  private baselineResults: Map<string, BenchmarkResult> = new Map();
  private statisticalAnalyzer: StatisticalAnalyzer;
  private regressionDetector: RegressionDetector;

  constructor() {
    super();
    this.statisticalAnalyzer = new StatisticalAnalyzer();
    this.regressionDetector = new RegressionDetector();
  }

  /**
   * Execute a comprehensive benchmark suite
   */
  async executeBenchmarkSuite(
    config: BenchmarkConfig,
    scenarioManager: any,
    performanceAnalyzer: any
  ): Promise<BenchmarkSuiteResult> {
    const benchmarkId = `benchmark_${Date.now()}`;
    const startTime = Date.now();

    this.emit('benchmark_started', { benchmarkId, config });

    try {
      // Load baseline if specified
      if (config.baselineVersion) {
        await this.loadBaseline(config.baselineVersion);
      }

      // Execute all scenario-agent combinations
      const results: BenchmarkResult[] = [];
      let totalIterations = 0;

      for (const agentId of config.agents) {
        for (const scenarioId of config.scenarios) {
          this.emit('benchmark_combination_started', { agentId, scenarioId });

          const result = await this.executeBenchmarkCombination(
            scenarioId,
            agentId,
            config,
            scenarioManager,
            performanceAnalyzer
          );

          results.push(result);
          totalIterations += result.iterations;

          this.emit('benchmark_combination_completed', {
            agentId,
            scenarioId,
            result,
          });
        }
      }

      // Perform statistical analysis
      const statisticalSignificance =
        this.statisticalAnalyzer.analyzeSignificance(results);

      // Detect regressions
      const regressionSummary = await this.regressionDetector.detectRegressions(
        results,
        this.baselineResults,
        config.regressionThreshold
      );

      // Generate rankings and analysis
      const agentRankings = this.generateAgentRankings(results);
      const scenarioAnalysis = this.generateScenarioAnalysis(results);
      const performanceTrends = this.analyzePerformanceTrends(results);

      // Calculate overall metrics
      const overallScore = this.calculateOverallScore(results);
      const overallSuccessRate =
        results.reduce((sum, r) => sum + r.successRate, 0) / results.length;

      const suiteResult: BenchmarkSuiteResult = {
        benchmarkId,
        config,
        overallScore,
        overallSuccessRate,
        results,
        agentRankings,
        scenarioAnalysis,
        statisticalSignificance,
        regressionSummary,
        performanceTrends,
        executionTime: Date.now() - startTime,
        totalIterations,
        timestamp: Date.now(),
      };

      // Generate report if requested
      if (config.generateReport) {
        suiteResult.report = this.generateBenchmarkReport(suiteResult);
      }

      // Store in history
      this.storeBenchmarkResult(benchmarkId, suiteResult);

      this.emit('benchmark_completed', { benchmarkId, suiteResult });
      return suiteResult;
    } catch (error) {
      this.emit('benchmark_error', { benchmarkId, error });
      throw error;
    }
  }

  /**
   * Execute benchmark for a single scenario-agent combination
   */
  private async executeBenchmarkCombination(
    scenarioId: string,
    agentId: string,
    config: BenchmarkConfig,
    scenarioManager: any,
    performanceAnalyzer: any
  ): Promise<BenchmarkResult> {
    const iterations = config.warmupIterations + config.iterations;
    const rawResults: EvaluationResults[] = [];
    const metrics: Record<string, number[]> = {};
    const durations: number[] = [];
    const memoryUsages: number[] = [];

    // Execute iterations
    for (let i = 0; i < iterations; i++) {
      const isWarmup = i < config.warmupIterations;

      try {
        // Execute scenario
        const session = await scenarioManager.executeScenario(
          scenarioId,
          { id: agentId },
          {
            enableRealTimeMonitoring: true,
            timeout: config.timeout,
          }
        );

        const result = performanceAnalyzer.generateEvaluationResults(session);

        // Skip warmup iterations for analysis
        if (!isWarmup) {
          rawResults.push(result);
          durations.push(session.totalLatency || 0);
          memoryUsages.push(session.memoryUsage || 0);

          // Collect metrics
          result.metrics.forEach((metric: any) => {
            if (!metrics[metric.type]) {
              metrics[metric.type] = [];
            }
            metrics[metric.type].push(metric.value);
          });
        }

        this.emit('benchmark_iteration_completed', {
          scenarioId,
          agentId,
          iteration: i + 1,
          isWarmup,
          success: result.success,
        });
      } catch (error) {
        this.emit('benchmark_iteration_error', {
          scenarioId,
          agentId,
          iteration: i + 1,
          error,
        });

        // Record failed iteration
        if (!isWarmup) {
          rawResults.push({
            sessionId: `failed_${i}`,
            scenarioId,
            agentConfiguration: { id: agentId },
            overallScore: 0,
            success: false,
            metrics: [],
            planningPerformance: {
              latency: 0,
              qualityScore: 0,
              refinementCount: 0,
              routingDecisions: [],
            },
            executionPerformance: {
              latency: 0,
              accuracyScore: 0,
              adaptationCount: 0,
              errorRate: 1,
            },
            cognitivePerformance: {
              memoryUtilization: 0,
              reasoningDepth: 0,
              coherenceScore: 0,
              creativityScore: 0,
            },
            strengths: [],
            weaknesses: ['execution_failure'],
            recommendations: ['investigate_failure_cause'],
            timestamp: Date.now(),
          });
        }
      }
    }

    // Calculate statistical metrics
    const processedMetrics: Record<string, any> = {};
    Object.entries(metrics).forEach(([metricType, values]) => {
      processedMetrics[metricType] = this.calculateStatistics(values);
    });

    // Calculate success rates
    const successfulResults = rawResults.filter((r) => r.success);
    const successRate = successfulResults.length / rawResults.length;
    const completionRate =
      rawResults.filter((r) => r.overallScore > 0).length / rawResults.length;
    const errorRate = 1 - completionRate;

    // Calculate quality metrics
    const planningQuality = this.calculateAverageMetric(
      rawResults,
      'planningPerformance.qualityScore'
    );
    const executionQuality = this.calculateAverageMetric(
      rawResults,
      'executionPerformance.accuracyScore'
    );
    const adaptabilityScore =
      this.calculateAverageMetric(
        rawResults,
        'executionPerformance.adaptationCount'
      ) / 10; // Normalize

    // Memory analysis
    const memoryStats = this.calculateStatistics(memoryUsages);

    // Regression analysis
    const baselineKey = `${scenarioId}_${agentId}`;
    const regressionAnalysis = this.baselineResults.has(baselineKey)
      ? this.regressionDetector.analyzeRegression(
          rawResults,
          this.baselineResults.get(baselineKey)!,
          config.regressionThreshold
        )
      : undefined;

    return {
      scenarioId,
      agentId,
      iterations: config.iterations,
      metrics: processedMetrics,
      successRate,
      completionRate,
      errorRate,
      totalDuration: durations.reduce((sum, d) => sum + d, 0),
      averageDuration:
        durations.reduce((sum, d) => sum + d, 0) / durations.length,
      durationVariability: this.calculateStatistics(durations).stdDev,
      memoryUsage: {
        peak: memoryStats.max,
        average: memoryStats.mean,
        efficiency: 1 / (memoryStats.mean + 1), // Simple efficiency metric
      },
      planningQuality,
      executionQuality,
      adaptabilityScore,
      regressionAnalysis,
      rawResults: config.exportRawData ? rawResults : undefined,
      timestamp: Date.now(),
    };
  }

  /**
   * Calculate statistical measures for a set of values
   */
  private calculateStatistics(values: number[]): {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    percentile95: number;
    percentile99: number;
  } {
    if (values.length === 0) {
      return {
        mean: 0,
        median: 0,
        stdDev: 0,
        min: 0,
        max: 0,
        percentile95: 0,
        percentile99: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      median: sorted[Math.floor(sorted.length / 2)],
      stdDev,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      percentile95: sorted[Math.floor(sorted.length * 0.95)],
      percentile99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  /**
   * Calculate average metric from results
   */
  private calculateAverageMetric(
    results: EvaluationResults[],
    metricPath: string
  ): number {
    const values = results.map((result) => {
      const pathParts = metricPath.split('.');
      let value: any = result;
      for (const part of pathParts) {
        value = value?.[part];
      }
      return typeof value === 'number' ? value : 0;
    });

    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Generate agent rankings based on performance
   */
  private generateAgentRankings(results: BenchmarkResult[]): any[] {
    const agentScores = new Map<string, number>();
    const agentCounts = new Map<string, number>();
    const agentStrengths = new Map<string, Set<string>>();
    const agentWeaknesses = new Map<string, Set<string>>();

    // Aggregate scores by agent
    results.forEach((result) => {
      const currentScore = agentScores.get(result.agentId) || 0;
      const currentCount = agentCounts.get(result.agentId) || 0;

      agentScores.set(result.agentId, currentScore + result.successRate);
      agentCounts.set(result.agentId, currentCount + 1);

      // Collect strengths and weaknesses
      if (!agentStrengths.has(result.agentId)) {
        agentStrengths.set(result.agentId, new Set());
        agentWeaknesses.set(result.agentId, new Set());
      }

      // Determine strengths (high performance areas)
      if (result.successRate > 0.8) {
        agentStrengths.get(result.agentId)!.add(result.scenarioId);
      }
      if (result.successRate < 0.5) {
        agentWeaknesses.get(result.agentId)!.add(result.scenarioId);
      }
    });

    // Calculate average scores and rank
    const rankings = Array.from(agentScores.entries())
      .map(([agentId, totalScore]) => ({
        agentId,
        score: totalScore / agentCounts.get(agentId)!,
        strengths: Array.from(agentStrengths.get(agentId) || []),
        weaknesses: Array.from(agentWeaknesses.get(agentId) || []),
      }))
      .sort((a, b) => b.score - a.score)
      .map((agent, index) => ({
        ...agent,
        rank: index + 1,
      }));

    return rankings;
  }

  /**
   * Generate scenario analysis
   */
  private generateScenarioAnalysis(results: BenchmarkResult[]): any[] {
    const scenarioStats = new Map<
      string,
      { scores: number[]; difficulties: number[] }
    >();

    results.forEach((result) => {
      if (!scenarioStats.has(result.scenarioId)) {
        scenarioStats.set(result.scenarioId, { scores: [], difficulties: [] });
      }
      scenarioStats.get(result.scenarioId)!.scores.push(result.successRate);
    });

    return Array.from(scenarioStats.entries()).map(([scenarioId, stats]) => {
      const avgPerformance =
        stats.scores.reduce((sum, s) => sum + s, 0) / stats.scores.length;
      const variance =
        stats.scores.reduce(
          (sum, s) => sum + Math.pow(s - avgPerformance, 2),
          0
        ) / stats.scores.length;

      return {
        scenarioId,
        difficulty: 1 - avgPerformance, // Lower performance = higher difficulty
        discriminativePower: Math.sqrt(variance), // Higher variance = better discrimination
        averagePerformance: avgPerformance,
        performanceVariance: variance,
      };
    });
  }

  /**
   * Analyze performance trends
   */
  private analyzePerformanceTrends(
    results: BenchmarkResult[]
  ): Record<string, any> {
    // This would typically analyze historical data
    // For now, return placeholder trends
    const trends: Record<string, any> = {};

    results.forEach((result) => {
      const key = `${result.agentId}_${result.scenarioId}`;
      trends[key] = {
        trend: 'stable' as const,
        slope: 0,
        confidence: 0.5,
        projectedPerformance: result.successRate,
      };
    });

    return trends;
  }

  /**
   * Calculate overall benchmark score
   */
  private calculateOverallScore(results: BenchmarkResult[]): number {
    if (results.length === 0) return 0;

    const totalScore = results.reduce((sum, result) => {
      // Weighted combination of success rate, quality metrics, and efficiency
      const score =
        result.successRate * 0.4 +
        result.planningQuality * 0.2 +
        result.executionQuality * 0.2 +
        result.adaptabilityScore * 0.2;
      return sum + score;
    }, 0);

    return totalScore / results.length;
  }

  /**
   * Generate comprehensive benchmark report
   */
  private generateBenchmarkReport(suiteResult: BenchmarkSuiteResult): string {
    const report: string[] = [];

    report.push('# Performance Benchmark Report');
    report.push('');
    report.push(`**Benchmark ID:** ${suiteResult.benchmarkId}`);
    report.push(
      `**Generated:** ${new Date(suiteResult.timestamp).toISOString()}`
    );
    report.push(
      `**Execution Time:** ${(suiteResult.executionTime / 1000).toFixed(1)}s`
    );
    report.push('');

    // Executive Summary
    report.push('## Executive Summary');
    report.push('');
    report.push(
      `- **Overall Score:** ${(suiteResult.overallScore * 100).toFixed(1)}%`
    );
    report.push(
      `- **Success Rate:** ${(suiteResult.overallSuccessRate * 100).toFixed(1)}%`
    );
    report.push(`- **Total Iterations:** ${suiteResult.totalIterations}`);
    report.push(`- **Agents Tested:** ${suiteResult.config.agents.length}`);
    report.push(
      `- **Scenarios Tested:** ${suiteResult.config.scenarios.length}`
    );
    report.push('');

    // Agent Rankings
    report.push('## Agent Performance Rankings');
    report.push('');
    suiteResult.agentRankings.forEach((ranking) => {
      report.push(`### ${ranking.rank}. Agent: ${ranking.agentId}`);
      report.push(`- **Score:** ${(ranking.score * 100).toFixed(1)}%`);
      report.push(
        `- **Strengths:** ${ranking.strengths.join(', ') || 'None identified'}`
      );
      report.push(
        `- **Weaknesses:** ${ranking.weaknesses.join(', ') || 'None identified'}`
      );
      report.push('');
    });

    // Regression Analysis
    if (suiteResult.regressionSummary.totalRegressions > 0) {
      report.push('## Regression Analysis');
      report.push('');
      report.push(
        `- **Total Regressions:** ${suiteResult.regressionSummary.totalRegressions}`
      );
      report.push(
        `- **Severe Regressions:** ${suiteResult.regressionSummary.severeRegressions}`
      );
      report.push(
        `- **Affected Agents:** ${suiteResult.regressionSummary.affectedAgents.join(', ')}`
      );
      report.push(
        `- **Affected Scenarios:** ${suiteResult.regressionSummary.affectedScenarios.join(', ')}`
      );
      report.push('');
      report.push('### Recommendations:');
      suiteResult.regressionSummary.recommendations.forEach((rec) => {
        report.push(`- ${rec}`);
      });
      report.push('');
    }

    // Scenario Analysis
    report.push('## Scenario Analysis');
    report.push('');
    suiteResult.scenarioAnalysis
      .sort((a, b) => b.difficulty - a.difficulty)
      .forEach((analysis) => {
        report.push(`### ${analysis.scenarioId}`);
        report.push(
          `- **Difficulty:** ${(analysis.difficulty * 10).toFixed(1)}/10`
        );
        report.push(
          `- **Average Performance:** ${(analysis.averagePerformance * 100).toFixed(1)}%`
        );
        report.push(
          `- **Discriminative Power:** ${(analysis.discriminativePower * 100).toFixed(1)}%`
        );
        report.push('');
      });

    report.push('---');
    report.push(
      '*Report generated by the Conscious Bot Performance Benchmarking System*'
    );

    return report.join('\n');
  }

  /**
   * Store benchmark result in history
   */
  private storeBenchmarkResult(
    benchmarkId: string,
    result: BenchmarkSuiteResult
  ): void {
    if (!this.benchmarkHistory.has(benchmarkId)) {
      this.benchmarkHistory.set(benchmarkId, []);
    }
    this.benchmarkHistory.get(benchmarkId)!.push(result);
  }

  /**
   * Load baseline results for regression detection
   */
  private async loadBaseline(version: string): Promise<void> {
    // Implementation would load baseline from storage
    // For now, this is a placeholder
    this.emit('baseline_loaded', { version });
  }

  /**
   * Get benchmark history
   */
  getBenchmarkHistory(benchmarkId?: string): BenchmarkSuiteResult[] {
    if (benchmarkId) {
      return this.benchmarkHistory.get(benchmarkId) || [];
    }

    const allResults: BenchmarkSuiteResult[] = [];
    this.benchmarkHistory.forEach((results) => {
      allResults.push(...results);
    });

    return allResults.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Export benchmark data
   */
  exportBenchmarkData(format: 'json' | 'csv' = 'json'): string {
    const history = this.getBenchmarkHistory();

    if (format === 'json') {
      return JSON.stringify(history, null, 2);
    } 
      // CSV export implementation
      return this.convertToCSV(history);
    
  }

  /**
   * Convert benchmark data to CSV format
   */
  private convertToCSV(data: BenchmarkSuiteResult[]): string {
    // Implementation for CSV conversion
    const headers = [
      'Benchmark ID',
      'Timestamp',
      'Overall Score',
      'Success Rate',
      'Execution Time',
    ];
    const rows = data.map((result) => [
      result.benchmarkId,
      new Date(result.timestamp).toISOString(),
      result.overallScore.toString(),
      result.overallSuccessRate.toString(),
      result.executionTime.toString(),
    ]);

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }
}

/**
 * Statistical analysis helper
 */
class StatisticalAnalyzer {
  analyzeSignificance(results: BenchmarkResult[]): Record<string, any> {
    // Placeholder for statistical significance analysis
    // Would implement t-tests, ANOVA, etc.
    return {};
  }
}

/**
 * Regression detection helper
 */
class RegressionDetector {
  async detectRegressions(
    currentResults: BenchmarkResult[],
    baselineResults: Map<string, BenchmarkResult>,
    threshold: number
  ): Promise<any> {
    const regressions: string[] = [];
    const severeRegressions: string[] = [];
    const affectedAgents = new Set<string>();
    const affectedScenarios = new Set<string>();

    currentResults.forEach((result) => {
      const baselineKey = `${result.scenarioId}_${result.agentId}`;
      const baseline = baselineResults.get(baselineKey);

      if (baseline) {
        const degradation =
          (baseline.successRate - result.successRate) / baseline.successRate;

        if (degradation > threshold) {
          regressions.push(baselineKey);
          affectedAgents.add(result.agentId);
          affectedScenarios.add(result.scenarioId);

          if (degradation > threshold * 2) {
            severeRegressions.push(baselineKey);
          }
        }
      }
    });

    return {
      totalRegressions: regressions.length,
      severeRegressions: severeRegressions.length,
      affectedAgents: Array.from(affectedAgents),
      affectedScenarios: Array.from(affectedScenarios),
      recommendations: this.generateRegressionRecommendations(
        regressions,
        severeRegressions
      ),
    };
  }

  analyzeRegression(
    currentResults: EvaluationResults[],
    baseline: BenchmarkResult,
    threshold: number
  ): any {
    const currentSuccessRate =
      currentResults.filter((r) => r.success).length / currentResults.length;
    const degradation =
      (baseline.successRate - currentSuccessRate) / baseline.successRate;

    let severity: 'none' | 'minor' | 'moderate' | 'severe' = 'none';
    if (degradation > threshold * 3) severity = 'severe';
    else if (degradation > threshold * 2) severity = 'moderate';
    else if (degradation > threshold) severity = 'minor';

    return {
      hasRegression: degradation > threshold,
      regressionSeverity: severity,
      affectedMetrics: degradation > threshold ? ['success_rate'] : [],
      confidenceLevel: 0.95,
    };
  }

  private generateRegressionRecommendations(
    regressions: string[],
    severeRegressions: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (severeRegressions.length > 0) {
      recommendations.push(
        'Investigate severe performance regressions immediately'
      );
      recommendations.push('Consider rolling back recent changes');
    }

    if (regressions.length > 0) {
      recommendations.push('Review recent code changes for performance impact');
      recommendations.push('Run additional diagnostic tests');
    }

    return recommendations;
  }
}

/**
 * Default benchmark configurations
 */
export const DEFAULT_BENCHMARK_CONFIGS = {
  quick: {
    name: 'Quick Performance Check',
    description: 'Fast benchmark for continuous integration',
    iterations: 3,
    warmupIterations: 1,
    timeout: 60000,
    includeStressTesting: false,
  },

  comprehensive: {
    name: 'Comprehensive Performance Evaluation',
    description: 'Thorough benchmark for release validation',
    iterations: 10,
    warmupIterations: 3,
    timeout: 300000,
    includeStressTesting: true,
    includeDetailedMetrics: true,
  },

  regression: {
    name: 'Regression Detection Suite',
    description: 'Focused on detecting performance regressions',
    iterations: 5,
    warmupIterations: 2,
    timeout: 180000,
    regressionThreshold: 0.03, // 3% threshold
    includeStressTesting: false,
  },
};

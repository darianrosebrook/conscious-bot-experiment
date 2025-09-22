/**
 * Evaluation Dashboard
 *
 * Real-time dashboard for monitoring evaluation progress, performance metrics,
 * and system health with interactive visualizations and reporting.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import {
  EvaluationResults,
  EvaluationSession,
  Scenario,
  AgentConfig,
} from '../types';
import { BenchmarkSuiteResult } from '../benchmarking/performance-benchmarker';
import {
  RegressionDetection,
  MonitoringDashboard,
} from '../regression/regression-monitor';

/**
 * Dashboard configuration
 */
export const DashboardConfigSchema = z.object({
  // Display settings
  refreshInterval: z.number().default(5000), // 5 seconds
  maxHistoryPoints: z.number().default(100),
  autoRefresh: z.boolean().default(true),

  // Visualization settings
  chartTypes: z
    .array(z.enum(['line', 'bar', 'scatter', 'heatmap']))
    .default(['line', 'bar']),
  colorScheme: z.enum(['light', 'dark', 'auto']).default('auto'),

  // Data settings
  metricsToDisplay: z
    .array(z.string())
    .default([
      'overallScore',
      'successRate',
      'planningLatency',
      'executionLatency',
    ]),
  scenariosToMonitor: z.array(z.string()).default([]),
  agentsToMonitor: z.array(z.string()).default([]),

  // Alert settings
  showAlerts: z.boolean().default(true),
  alertSeverityFilter: z
    .array(z.string())
    .default(['warning', 'critical', 'emergency']),

  // Export settings
  enableExport: z.boolean().default(true),
  exportFormats: z
    .array(z.enum(['json', 'csv', 'pdf']))
    .default(['json', 'csv']),
});

export type DashboardConfig = z.infer<typeof DashboardConfigSchema>;

/**
 * Dashboard widget data
 */
export const DashboardWidgetSchema = z.object({
  id: z.string(),
  type: z.enum(['metric', 'chart', 'table', 'alert', 'status', 'progress']),
  title: z.string(),
  data: z.any(),
  config: z.record(z.any()).optional(),
  lastUpdated: z.number(),
  isLoading: z.boolean().default(false),
  error: z.string().optional(),
});

export type DashboardWidget = z.infer<typeof DashboardWidgetSchema>;

/**
 * Dashboard state
 */
export const DashboardStateSchema = z.object({
  timestamp: z.number(),
  isConnected: z.boolean(),
  isLoading: z.boolean(),

  // Widgets
  widgets: z.array(DashboardWidgetSchema),

  // Current data
  activeEvaluations: z.array(z.any()),
  recentResults: z.array(z.any()),
  performanceMetrics: z.record(z.any()),

  // System status
  systemHealth: z.enum(['healthy', 'degraded', 'critical', 'emergency']),
  activeAlerts: z.array(z.any()),

  // Statistics
  statistics: z.object({
    totalEvaluations: z.number(),
    successfulEvaluations: z.number(),
    averageScore: z.number(),
    averageDuration: z.number(),
    activeScenarios: z.number(),
    activeAgents: z.number(),
  }),
});

export type DashboardState = z.infer<typeof DashboardStateSchema>;

/**
 * Real-time evaluation dashboard
 */
export class EvaluationDashboard extends EventEmitter {
  private config: DashboardConfig;
  private state: DashboardState;
  private widgets: Map<string, DashboardWidget> = new Map();
  private dataHistory: Map<string, any[]> = new Map();
  private refreshTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;

  // Data sources
  private evaluationResults: EvaluationResults[] = [];
  private benchmarkResults: BenchmarkSuiteResult[] = [];
  private regressionData: RegressionDetection[] = [];
  private monitoringData?: MonitoringDashboard;

  constructor(config: Partial<DashboardConfig> = {}) {
    super();
    this.config = { ...this.getDefaultConfig(), ...config };
    this.state = this.initializeState();
    this.setupDefaultWidgets();
  }

  /**
   * Start the dashboard
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.state.isConnected = true;

    if (this.config.autoRefresh) {
      this.refreshTimer = setInterval(() => {
        this.refreshData();
      }, this.config.refreshInterval);
    }

    this.emit('dashboard_started');
  }

  /**
   * Stop the dashboard
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.state.isConnected = false;

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    this.emit('dashboard_stopped');
  }

  /**
   * Add evaluation result
   */
  addEvaluationResult(result: EvaluationResults): void {
    // Validate result has minimum required fields
    if (!result?.sessionId || !result.scenarioId) {
      console.warn('Invalid evaluation result provided, skipping');
      return;
    }

    this.evaluationResults.push(result);

    // Keep only recent results
    if (this.evaluationResults.length > this.config.maxHistoryPoints) {
      this.evaluationResults = this.evaluationResults.slice(
        -this.config.maxHistoryPoints
      );
    }

    this.updateDataHistory('evaluationResults', result);
    this.updateStatistics(); // Update statistics immediately
    this.updateWidgets();
    this.emit('evaluation_result_added', result);
  }

  /**
   * Add benchmark result
   */
  addBenchmarkResult(result: BenchmarkSuiteResult): void {
    this.benchmarkResults.push(result);

    // Keep only recent results
    if (this.benchmarkResults.length > this.config.maxHistoryPoints) {
      this.benchmarkResults = this.benchmarkResults.slice(
        -this.config.maxHistoryPoints
      );
    }

    this.updateDataHistory('benchmarkResults', result);
    this.updateWidgets();
    this.emit('benchmark_result_added', result);
  }

  /**
   * Add regression detection
   */
  addRegressionDetection(regression: RegressionDetection): void {
    this.regressionData.push(regression);
    this.updateWidgets();
    this.emit('regression_added', regression);
  }

  /**
   * Update monitoring data
   */
  updateMonitoringData(data: MonitoringDashboard): void {
    this.monitoringData = data;
    this.updateWidgets();
    this.emit('monitoring_data_updated', data);
  }

  /**
   * Get current dashboard state
   */
  getState(): DashboardState {
    return { ...this.state };
  }

  /**
   * Get widget by ID
   */
  getWidget(id: string): DashboardWidget | undefined {
    return this.widgets.get(id);
  }

  /**
   * Add custom widget
   */
  addWidget(widget: DashboardWidget): void {
    this.widgets.set(widget.id, widget);
    this.state.widgets = Array.from(this.widgets.values());
    this.emit('widget_added', widget);
  }

  /**
   * Remove widget
   */
  removeWidget(id: string): void {
    if (this.widgets.delete(id)) {
      this.state.widgets = Array.from(this.widgets.values());
      this.emit('widget_removed', { id });
    }
  }

  /**
   * Update widget data
   */
  updateWidget(id: string, data: any, config?: any): void {
    const widget = this.widgets.get(id);
    if (widget) {
      widget.data = data;
      widget.lastUpdated = Date.now();
      if (config) {
        widget.config = { ...widget.config, ...config };
      }
      this.emit('widget_updated', widget);
    }
  }

  /**
   * Refresh all dashboard data
   */
  private async refreshData(): Promise<void> {
    this.state.isLoading = true;
    this.state.timestamp = Date.now();

    try {
      // Update statistics
      this.updateStatistics();

      // Update system health
      this.updateSystemHealth();

      // Update all widgets
      this.updateWidgets();

      this.state.isLoading = false;
      this.emit('data_refreshed');
    } catch (error) {
      this.state.isLoading = false;
      this.emit('refresh_error', error);
    }
  }

  /**
   * Update dashboard statistics
   */
  private updateStatistics(): void {
    const totalEvaluations = this.evaluationResults.length;
    const successfulEvaluations = this.evaluationResults.filter(
      (r) => r.success
    ).length;
    const averageScore =
      totalEvaluations > 0
        ? this.evaluationResults.reduce((sum, r) => sum + r.overallScore, 0) /
          totalEvaluations
        : 0;

    // Calculate average duration from recent results
    const recentResults = this.evaluationResults.slice(-20);
    const averageDuration =
      recentResults.length > 0
        ? recentResults.reduce(
            (sum, r) =>
              sum +
              (r.planningPerformance.latency + r.executionPerformance.latency),
            0
          ) / recentResults.length
        : 0;

    const activeScenarios = new Set(
      this.evaluationResults.map((r) => r.scenarioId)
    ).size;
    const activeAgents = new Set(
      this.evaluationResults.map((r) => r.agentConfiguration.id || 'unknown')
    ).size;

    this.state.statistics = {
      totalEvaluations,
      successfulEvaluations,
      averageScore,
      averageDuration,
      activeScenarios,
      activeAgents,
    };
  }

  /**
   * Update system health status
   */
  private updateSystemHealth(): void {
    if (this.monitoringData) {
      this.state.systemHealth = this.monitoringData.overallHealth;
      this.state.activeAlerts = this.monitoringData.activeRegressions.map(
        (r) => ({
          id: r.id,
          severity: r.severity,
          message: `${r.metricType} regression in ${r.scenarioId}`,
          timestamp: r.timestamp,
        })
      );
    } else {
      // Determine health from recent results
      const recentResults = this.evaluationResults.slice(-10);
      const recentSuccessRate =
        recentResults.length > 0
          ? recentResults.filter((r) => r.success).length / recentResults.length
          : 1;

      if (recentSuccessRate >= 0.9) {
        this.state.systemHealth = 'healthy';
      } else if (recentSuccessRate >= 0.7) {
        this.state.systemHealth = 'degraded';
      } else if (recentSuccessRate >= 0.5) {
        this.state.systemHealth = 'critical';
      } else {
        this.state.systemHealth = 'emergency';
      }
    }
  }

  /**
   * Update all widgets with current data
   */
  private updateWidgets(): void {
    // Update performance metrics widget
    this.updateWidget(
      'performance_metrics',
      this.generatePerformanceMetricsData()
    );

    // Update success rate chart
    this.updateWidget(
      'success_rate_chart',
      this.generateSuccessRateChartData()
    );

    // Update latency chart
    this.updateWidget('latency_chart', this.generateLatencyChartData());

    // Update scenario performance table
    this.updateWidget(
      'scenario_performance',
      this.generateScenarioPerformanceData()
    );

    // Update agent comparison
    this.updateWidget('agent_comparison', this.generateAgentComparisonData());

    // Update alerts widget
    this.updateWidget('alerts', this.generateAlertsData());

    // Update system status
    this.updateWidget('system_status', this.generateSystemStatusData());

    this.state.widgets = Array.from(this.widgets.values());
  }

  /**
   * Generate performance metrics data
   */
  private generatePerformanceMetricsData(): any {
    const recentResults = this.evaluationResults.slice(-20);

    if (recentResults.length === 0) {
      return { metrics: [], message: 'No recent evaluation data' };
    }

    // Filter out invalid results
    const validResults = recentResults.filter(
      (r) =>
        r?.overallScore !== undefined &&
        r.success !== undefined &&
        r.planningPerformance?.latency !== undefined &&
        r.executionPerformance?.latency !== undefined
    );

    if (validResults.length === 0) {
      return { metrics: [], message: 'No valid evaluation data' };
    }

    const metrics = [
      {
        name: 'Overall Score',
        value: (
          (validResults.reduce((sum, r) => sum + (r.overallScore || 0), 0) /
            validResults.length) *
          100
        ).toFixed(1),
        unit: '%',
        trend: this.calculateTrend(
          validResults.map((r) => r.overallScore || 0)
        ),
        color: 'blue',
      },
      {
        name: 'Success Rate',
        value: (
          (validResults.filter((r) => r.success).length / validResults.length) *
          100
        ).toFixed(1),
        unit: '%',
        trend: this.calculateTrend(
          validResults.map((r) => (r.success ? 1 : 0))
        ),
        color: 'green',
      },
      {
        name: 'Avg Planning Time',
        value: (
          validResults.reduce(
            (sum, r) => sum + (r.planningPerformance?.latency || 0),
            0
          ) /
          validResults.length /
          1000
        ).toFixed(2),
        unit: 's',
        trend: this.calculateTrend(
          validResults.map((r) => r.planningPerformance?.latency || 0)
        ),
        color: 'orange',
      },
      {
        name: 'Avg Execution Time',
        value: (
          validResults.reduce(
            (sum, r) => sum + (r.executionPerformance?.latency || 0),
            0
          ) /
          validResults.length /
          1000
        ).toFixed(2),
        unit: 's',
        trend: this.calculateTrend(
          validResults.map((r) => r.executionPerformance?.latency || 0)
        ),
        color: 'purple',
      },
    ];

    return { metrics };
  }

  /**
   * Generate success rate chart data
   */
  private generateSuccessRateChartData(): any {
    const data = this.evaluationResults.slice(-50).map((result, index) => ({
      x: index,
      y: result.success ? 1 : 0,
      timestamp: result.timestamp,
      scenarioId: result.scenarioId,
    }));

    // Calculate moving average
    const windowSize = 5;
    const movingAverage = data.map((point, index) => {
      const start = Math.max(0, index - windowSize + 1);
      const window = data.slice(start, index + 1);
      const avg = window.reduce((sum, p) => sum + p.y, 0) / window.length;
      return { x: point.x, y: avg };
    });

    return {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Success Rate',
            data: data,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
          },
          {
            label: 'Moving Average',
            data: movingAverage,
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
          },
        ],
      },
    };
  }

  /**
   * Generate latency chart data
   */
  private generateLatencyChartData(): any {
    const data = this.evaluationResults.slice(-50).map((result, index) => ({
      x: index,
      planning: result.planningPerformance.latency / 1000,
      execution: result.executionPerformance.latency / 1000,
      total:
        (result.planningPerformance.latency +
          result.executionPerformance.latency) /
        1000,
      timestamp: result.timestamp,
    }));

    return {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Planning Latency (s)',
            data: data.map((d) => ({ x: d.x, y: d.planning })),
            borderColor: 'rgb(255, 159, 64)',
            backgroundColor: 'rgba(255, 159, 64, 0.2)',
          },
          {
            label: 'Execution Latency (s)',
            data: data.map((d) => ({ x: d.x, y: d.execution })),
            borderColor: 'rgb(153, 102, 255)',
            backgroundColor: 'rgba(153, 102, 255, 0.2)',
          },
          {
            label: 'Total Latency (s)',
            data: data.map((d) => ({ x: d.x, y: d.total })),
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
          },
        ],
      },
    };
  }

  /**
   * Generate scenario performance data
   */
  private generateScenarioPerformanceData(): any {
    const scenarioStats = new Map<
      string,
      {
        total: number;
        successful: number;
        avgScore: number;
        avgLatency: number;
      }
    >();

    this.evaluationResults.forEach((result) => {
      const scenarioId = result.scenarioId;
      if (!scenarioStats.has(scenarioId)) {
        scenarioStats.set(scenarioId, {
          total: 0,
          successful: 0,
          avgScore: 0,
          avgLatency: 0,
        });
      }

      const stats = scenarioStats.get(scenarioId)!;
      stats.total++;
      if (result.success) stats.successful++;
      stats.avgScore += result.overallScore;
      stats.avgLatency +=
        result.planningPerformance.latency +
        result.executionPerformance.latency;
    });

    const tableData = Array.from(scenarioStats.entries()).map(
      ([scenarioId, stats]) => ({
        scenario: scenarioId,
        total: stats.total,
        successRate: ((stats.successful / stats.total) * 100).toFixed(1) + '%',
        avgScore: ((stats.avgScore / stats.total) * 100).toFixed(1) + '%',
        avgLatency: (stats.avgLatency / stats.total / 1000).toFixed(2) + 's',
      })
    );

    return {
      columns: [
        'Scenario',
        'Total',
        'Success Rate',
        'Avg Score',
        'Avg Latency',
      ],
      data: tableData,
    };
  }

  /**
   * Generate agent comparison data
   */
  private generateAgentComparisonData(): any {
    const agentStats = new Map<
      string,
      {
        total: number;
        successful: number;
        avgScore: number;
        scenarios: Set<string>;
      }
    >();

    this.evaluationResults.forEach((result) => {
      const agentId = result.agentConfiguration.id || 'unknown';
      if (!agentStats.has(agentId)) {
        agentStats.set(agentId, {
          total: 0,
          successful: 0,
          avgScore: 0,
          scenarios: new Set(),
        });
      }

      const stats = agentStats.get(agentId)!;
      stats.total++;
      if (result.success) stats.successful++;
      stats.avgScore += result.overallScore;
      stats.scenarios.add(result.scenarioId);
    });

    const comparisonData = Array.from(agentStats.entries()).map(
      ([agentId, stats]) => ({
        agent: agentId,
        successRate: (stats.successful / stats.total) * 100,
        avgScore: (stats.avgScore / stats.total) * 100,
        scenarios: stats.scenarios.size,
        evaluations: stats.total,
      })
    );

    return {
      type: 'bar',
      data: comparisonData.sort((a, b) => b.avgScore - a.avgScore),
    };
  }

  /**
   * Generate alerts data
   */
  private generateAlertsData(): any {
    const alerts = [
      ...this.state.activeAlerts,
      ...this.regressionData.slice(-10).map((r) => ({
        id: r.id,
        severity: r.severity,
        message: `Regression: ${r.metricType} degraded by ${r.degradationPercentage.toFixed(1)}%`,
        timestamp: r.timestamp,
        type: 'regression',
      })),
    ];

    return {
      alerts: alerts.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20),
    };
  }

  /**
   * Generate system status data
   */
  private generateSystemStatusData(): any {
    return {
      health: this.state.systemHealth,
      uptime: this.isRunning
        ? Date.now() - (this.state.timestamp - this.config.refreshInterval)
        : 0,
      lastUpdate: this.state.timestamp,
      components: {
        evaluation: this.evaluationResults.length > 0 ? 'operational' : 'idle',
        benchmarking: this.benchmarkResults.length > 0 ? 'operational' : 'idle',
        monitoring: this.monitoringData ? 'operational' : 'idle',
        regression: this.regressionData.length > 0 ? 'active' : 'idle',
      },
    };
  }

  /**
   * Calculate trend for a series of values
   */
  private calculateTrend(values: number[]): 'up' | 'down' | 'stable' {
    if (values.length < 2) return 'stable';

    const recent = values.slice(-5);
    const older = values.slice(-10, -5);

    if (recent.length === 0 || older.length === 0) return 'stable';

    const recentAvg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
    const olderAvg = older.reduce((sum, v) => sum + v, 0) / older.length;

    const change = (recentAvg - olderAvg) / olderAvg;

    if (Math.abs(change) < 0.05) return 'stable';
    return change > 0 ? 'up' : 'down';
  }

  /**
   * Update data history
   */
  private updateDataHistory(key: string, data: any): void {
    if (!this.dataHistory.has(key)) {
      this.dataHistory.set(key, []);
    }

    const history = this.dataHistory.get(key)!;
    history.push({
      timestamp: Date.now(),
      data,
    });

    // Keep only recent history
    if (history.length > this.config.maxHistoryPoints) {
      history.splice(0, history.length - this.config.maxHistoryPoints);
    }
  }

  /**
   * Export dashboard data
   */
  exportData(format: 'json' | 'csv' = 'json'): string {
    const exportData = {
      timestamp: Date.now(),
      config: this.config,
      state: this.state,
      evaluationResults: this.evaluationResults,
      benchmarkResults: this.benchmarkResults,
      regressionData: this.regressionData,
      monitoringData: this.monitoringData,
    };

    if (format === 'json') {
      return JSON.stringify(exportData, null, 2);
    } 
      // CSV export would be implemented here
      return this.convertToCSV(exportData);
    
  }

  /**
   * Convert data to CSV format
   */
  private convertToCSV(data: any): string {
    // Simplified CSV conversion
    const headers = ['Timestamp', 'Scenario', 'Agent', 'Success', 'Score'];
    const rows = this.evaluationResults.map((result) => [
      new Date(result.timestamp).toISOString(),
      result.scenarioId,
      result.agentConfiguration.id || 'unknown',
      result.success.toString(),
      result.overallScore.toString(),
    ]);

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }

  /**
   * Initialize dashboard state
   */
  private initializeState(): DashboardState {
    return {
      timestamp: Date.now(),
      isConnected: false,
      isLoading: false,
      widgets: [],
      activeEvaluations: [],
      recentResults: [],
      performanceMetrics: {},
      systemHealth: 'healthy',
      activeAlerts: [],
      statistics: {
        totalEvaluations: 0,
        successfulEvaluations: 0,
        averageScore: 0,
        averageDuration: 0,
        activeScenarios: 0,
        activeAgents: 0,
      },
    };
  }

  /**
   * Setup default widgets
   */
  private setupDefaultWidgets(): void {
    const defaultWidgets: DashboardWidget[] = [
      {
        id: 'performance_metrics',
        type: 'metric',
        title: 'Performance Metrics',
        data: {},
        lastUpdated: Date.now(),
        isLoading: false,
      },
      {
        id: 'success_rate_chart',
        type: 'chart',
        title: 'Success Rate Over Time',
        data: {},
        lastUpdated: Date.now(),
        isLoading: false,
      },
      {
        id: 'latency_chart',
        type: 'chart',
        title: 'Latency Trends',
        data: {},
        lastUpdated: Date.now(),
        isLoading: false,
      },
      {
        id: 'scenario_performance',
        type: 'table',
        title: 'Scenario Performance',
        data: {},
        lastUpdated: Date.now(),
        isLoading: false,
      },
      {
        id: 'agent_comparison',
        type: 'chart',
        title: 'Agent Comparison',
        data: {},
        lastUpdated: Date.now(),
        isLoading: false,
      },
      {
        id: 'alerts',
        type: 'alert',
        title: 'Active Alerts',
        data: {},
        lastUpdated: Date.now(),
        isLoading: false,
      },
      {
        id: 'system_status',
        type: 'status',
        title: 'System Status',
        data: {},
        lastUpdated: Date.now(),
        isLoading: false,
      },
    ];

    defaultWidgets.forEach((widget) => {
      this.widgets.set(widget.id, widget);
    });

    this.state.widgets = defaultWidgets;
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): DashboardConfig {
    return {
      refreshInterval: 5000,
      maxHistoryPoints: 100,
      autoRefresh: true,
      chartTypes: ['line', 'bar'],
      colorScheme: 'auto',
      metricsToDisplay: [
        'overallScore',
        'successRate',
        'planningLatency',
        'executionLatency',
      ],
      scenariosToMonitor: [],
      agentsToMonitor: [],
      showAlerts: true,
      alertSeverityFilter: ['warning', 'critical', 'emergency'],
      enableExport: true,
      exportFormats: ['json', 'csv'],
    };
  }
}

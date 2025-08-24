/**
 * Regression Detection and Monitoring System
 * 
 * Continuous monitoring system for detecting performance regressions,
 * capability degradation, and system health issues in the conscious bot.
 * 
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import { 
  EvaluationResults, 
  EvaluationSession, 
  AgentConfig,
  Scenario,
  MetricType 
} from '../types';

/**
 * Regression alert severity levels
 */
export enum RegressionSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
  EMERGENCY = 'emergency'
}

/**
 * Regression detection configuration
 */
export const RegressionConfigSchema = z.object({
  // Detection thresholds
  warningThreshold: z.number().default(0.05), // 5% degradation
  criticalThreshold: z.number().default(0.15), // 15% degradation
  emergencyThreshold: z.number().default(0.30), // 30% degradation
  
  // Statistical parameters
  minimumSamples: z.number().default(5),
  confidenceLevel: z.number().default(0.95),
  windowSize: z.number().default(20), // Number of recent results to consider
  
  // Monitoring settings
  continuousMonitoring: z.boolean().default(true),
  alertingEnabled: z.boolean().default(true),
  autoRecoveryEnabled: z.boolean().default(false),
  
  // Baseline management
  baselineUpdateFrequency: z.enum(['never', 'daily', 'weekly', 'monthly']).default('weekly'),
  baselineMinimumSamples: z.number().default(10),
  
  // Metric-specific settings
  metricWeights: z.record(z.number()).default({}),
  ignoredMetrics: z.array(z.string()).default([]),
  
  // Notification settings
  notificationChannels: z.array(z.string()).default(['console', 'log']),
  escalationRules: z.array(z.object({
    severity: z.nativeEnum(RegressionSeverity),
    delay: z.number(), // minutes
    channels: z.array(z.string())
  })).default([])
});

export type RegressionConfig = z.infer<typeof RegressionConfigSchema>;

/**
 * Regression detection result
 */
export const RegressionDetectionSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  
  // Detection details
  scenarioId: z.string(),
  agentId: z.string(),
  metricType: z.string(),
  
  // Regression analysis
  severity: z.nativeEnum(RegressionSeverity),
  degradationPercentage: z.number(),
  confidenceLevel: z.number(),
  
  // Statistical data
  currentValue: z.number(),
  baselineValue: z.number(),
  historicalMean: z.number(),
  historicalStdDev: z.number(),
  
  // Context
  affectedCapabilities: z.array(z.string()),
  potentialCauses: z.array(z.string()),
  recommendations: z.array(z.string()),
  
  // Metadata
  sampleSize: z.number(),
  detectionMethod: z.string(),
  additionalData: z.record(z.any()).optional()
});

export type RegressionDetection = z.infer<typeof RegressionDetectionSchema>;

/**
 * Performance baseline for comparison
 */
export const PerformanceBaselineSchema = z.object({
  id: z.string(),
  scenarioId: z.string(),
  agentId: z.string(),
  
  // Baseline metrics
  metrics: z.record(z.object({
    mean: z.number(),
    stdDev: z.number(),
    median: z.number(),
    percentile95: z.number(),
    sampleSize: z.number(),
    lastUpdated: z.number()
  })),
  
  // Baseline metadata
  version: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  isActive: z.boolean(),
  
  // Quality indicators
  stability: z.number(), // 0-1, how stable the baseline is
  reliability: z.number(), // 0-1, how reliable the baseline is
  coverage: z.number() // 0-1, how much of the metric space is covered
});

export type PerformanceBaseline = z.infer<typeof PerformanceBaselineSchema>;

/**
 * Regression monitoring dashboard data
 */
export const MonitoringDashboardSchema = z.object({
  timestamp: z.number(),
  
  // Overall health
  overallHealth: z.enum(['healthy', 'degraded', 'critical', 'emergency']),
  healthScore: z.number(), // 0-1
  
  // Active regressions
  activeRegressions: z.array(RegressionDetectionSchema),
  recentRegressions: z.array(RegressionDetectionSchema),
  resolvedRegressions: z.array(RegressionDetectionSchema),
  
  // Performance trends
  performanceTrends: z.record(z.object({
    trend: z.enum(['improving', 'stable', 'declining']),
    slope: z.number(),
    confidence: z.number(),
    recentChange: z.number()
  })),
  
  // System metrics
  systemMetrics: z.object({
    totalScenarios: z.number(),
    totalAgents: z.number(),
    monitoredMetrics: z.number(),
    baselinesCurrent: z.number(),
    baselinesOutdated: z.number()
  }),
  
  // Alerts and notifications
  pendingAlerts: z.array(z.object({
    id: z.string(),
    severity: z.nativeEnum(RegressionSeverity),
    message: z.string(),
    timestamp: z.number(),
    acknowledged: z.boolean()
  }))
});

export type MonitoringDashboard = z.infer<typeof MonitoringDashboardSchema>;

/**
 * Regression monitoring system
 */
export class RegressionMonitor extends EventEmitter {
  private config: RegressionConfig;
  private baselines: Map<string, PerformanceBaseline> = new Map();
  private recentResults: Map<string, EvaluationResults[]> = new Map();
  private activeRegressions: Map<string, RegressionDetection> = new Map();
  private regressionHistory: RegressionDetection[] = [];
  private isMonitoring: boolean = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: Partial<RegressionConfig> = {}) {
    super();
    this.config = { ...this.getDefaultConfig(), ...config };
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.emit('monitoring_started');

    if (this.config.continuousMonitoring) {
      // Check for regressions every 5 minutes
      this.monitoringInterval = setInterval(() => {
        this.performRoutineCheck();
      }, 5 * 60 * 1000);
    }
  }

  /**
   * Stop continuous monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.emit('monitoring_stopped');
  }

  /**
   * Add evaluation result for monitoring
   */
  addEvaluationResult(result: EvaluationResults): void {
    const key = `${result.scenarioId}_${result.agentConfiguration.id || 'unknown'}`;
    
    if (!this.recentResults.has(key)) {
      this.recentResults.set(key, []);
    }

    const results = this.recentResults.get(key)!;
    results.push(result);

    // Keep only recent results within window size
    if (results.length > this.config.windowSize) {
      results.splice(0, results.length - this.config.windowSize);
    }

    // Check for regressions if we have enough samples
    if (results.length >= this.config.minimumSamples) {
      this.checkForRegressions(key, results);
    }

    this.emit('result_added', { key, result });
  }

  /**
   * Check for regressions in recent results
   */
  private async checkForRegressions(key: string, results: EvaluationResults[]): Promise<void> {
    const baseline = this.baselines.get(key);
    if (!baseline) {
      // Create baseline if it doesn't exist
      await this.createBaseline(key, results);
      return;
    }

    const [scenarioId, agentId] = key.split('_');
    const detections: RegressionDetection[] = [];

    // Check each metric for regressions
    const metricValues = this.extractMetricValues(results);
    
    for (const [metricType, values] of Object.entries(metricValues)) {
      if (this.config.ignoredMetrics.includes(metricType)) {
        continue;
      }

      const baselineMetric = baseline.metrics[metricType];
      if (!baselineMetric) {
        continue;
      }

      const detection = await this.detectMetricRegression(
        scenarioId,
        agentId,
        metricType,
        values,
        baselineMetric
      );

      if (detection) {
        detections.push(detection);
      }
    }

    // Process detections
    for (const detection of detections) {
      await this.processRegressionDetection(detection);
    }
  }

  /**
   * Detect regression for a specific metric
   */
  private async detectMetricRegression(
    scenarioId: string,
    agentId: string,
    metricType: string,
    currentValues: number[],
    baseline: any
  ): Promise<RegressionDetection | null> {
    if (currentValues.length < this.config.minimumSamples) {
      return null;
    }

    const currentMean = currentValues.reduce((sum, v) => sum + v, 0) / currentValues.length;
    const degradation = (baseline.mean - currentMean) / baseline.mean;

    // Determine severity
    let severity: RegressionSeverity;
    if (Math.abs(degradation) >= this.config.emergencyThreshold) {
      severity = RegressionSeverity.EMERGENCY;
    } else if (Math.abs(degradation) >= this.config.criticalThreshold) {
      severity = RegressionSeverity.CRITICAL;
    } else if (Math.abs(degradation) >= this.config.warningThreshold) {
      severity = RegressionSeverity.WARNING;
    } else {
      return null; // No significant regression
    }

    // Statistical analysis
    const currentStdDev = this.calculateStandardDeviation(currentValues, currentMean);
    const confidenceLevel = this.calculateConfidenceLevel(
      currentValues,
      baseline.mean,
      baseline.stdDev
    );

    // Generate detection
    const detection: RegressionDetection = {
      id: `regression_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      scenarioId,
      agentId,
      metricType,
      severity,
      degradationPercentage: Math.abs(degradation) * 100,
      confidenceLevel,
      currentValue: currentMean,
      baselineValue: baseline.mean,
      historicalMean: baseline.mean,
      historicalStdDev: baseline.stdDev,
      affectedCapabilities: this.identifyAffectedCapabilities(scenarioId, metricType),
      potentialCauses: this.identifyPotentialCauses(scenarioId, metricType, degradation),
      recommendations: this.generateRecommendations(severity, metricType, degradation),
      sampleSize: currentValues.length,
      detectionMethod: 'statistical_comparison'
    };

    return detection;
  }

  /**
   * Process a regression detection
   */
  private async processRegressionDetection(detection: RegressionDetection): Promise<void> {
    const key = `${detection.scenarioId}_${detection.agentId}_${detection.metricType}`;
    
    // Check if this is a new regression or update to existing
    const existingRegression = this.activeRegressions.get(key);
    
    if (existingRegression) {
      // Update existing regression
      if (detection.severity !== existingRegression.severity) {
        this.emit('regression_severity_changed', { 
          previous: existingRegression, 
          current: detection 
        });
      }
      this.activeRegressions.set(key, detection);
    } else {
      // New regression detected
      this.activeRegressions.set(key, detection);
      this.emit('regression_detected', detection);
    }

    // Add to history
    this.regressionHistory.push(detection);

    // Send alerts if enabled
    if (this.config.alertingEnabled) {
      await this.sendAlert(detection);
    }

    // Trigger auto-recovery if enabled and severity is high
    if (this.config.autoRecoveryEnabled && 
        (detection.severity === RegressionSeverity.CRITICAL || 
         detection.severity === RegressionSeverity.EMERGENCY)) {
      await this.triggerAutoRecovery(detection);
    }
  }

  /**
   * Create performance baseline
   */
  private async createBaseline(key: string, results: EvaluationResults[]): Promise<void> {
    if (results.length < this.config.baselineMinimumSamples) {
      return;
    }

    const [scenarioId, agentId] = key.split('_');
    const metricValues = this.extractMetricValues(results);
    const metrics: Record<string, any> = {};

    for (const [metricType, values] of Object.entries(metricValues)) {
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const stdDev = this.calculateStandardDeviation(values, mean);
      const sorted = [...values].sort((a, b) => a - b);

      metrics[metricType] = {
        mean,
        stdDev,
        median: sorted[Math.floor(sorted.length / 2)],
        percentile95: sorted[Math.floor(sorted.length * 0.95)],
        sampleSize: values.length,
        lastUpdated: Date.now()
      };
    }

    const baseline: PerformanceBaseline = {
      id: `baseline_${key}_${Date.now()}`,
      scenarioId,
      agentId,
      metrics,
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: true,
      stability: this.calculateStability(metricValues),
      reliability: this.calculateReliability(results),
      coverage: this.calculateCoverage(metricValues)
    };

    this.baselines.set(key, baseline);
    this.emit('baseline_created', { key, baseline });
  }

  /**
   * Extract metric values from evaluation results
   */
  private extractMetricValues(results: EvaluationResults[]): Record<string, number[]> {
    const metricValues: Record<string, number[]> = {};

    results.forEach(result => {
      // Overall score
      if (!metricValues.overallScore) metricValues.overallScore = [];
      metricValues.overallScore.push(result.overallScore);

      // Individual metrics
      result.metrics.forEach(metric => {
        if (!metricValues[metric.type]) metricValues[metric.type] = [];
        metricValues[metric.type].push(metric.value);
      });

      // Performance metrics
      if (!metricValues.planningLatency) metricValues.planningLatency = [];
      metricValues.planningLatency.push(result.planningPerformance.latency);

      if (!metricValues.executionLatency) metricValues.executionLatency = [];
      metricValues.executionLatency.push(result.executionPerformance.latency);

      if (!metricValues.memoryUtilization) metricValues.memoryUtilization = [];
      metricValues.memoryUtilization.push(result.cognitivePerformance.memoryUtilization);
    });

    return metricValues;
  }

  /**
   * Calculate standard deviation
   */
  private calculateStandardDeviation(values: number[], mean: number): number {
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate confidence level for regression detection
   */
  private calculateConfidenceLevel(
    currentValues: number[],
    baselineMean: number,
    baselineStdDev: number
  ): number {
    // Simplified t-test calculation
    const currentMean = currentValues.reduce((sum, v) => sum + v, 0) / currentValues.length;
    const currentStdDev = this.calculateStandardDeviation(currentValues, currentMean);
    
    const pooledStdDev = Math.sqrt((baselineStdDev ** 2 + currentStdDev ** 2) / 2);
    const tStatistic = Math.abs(currentMean - baselineMean) / 
                      (pooledStdDev * Math.sqrt(2 / currentValues.length));
    
    // Simplified confidence calculation (would use proper t-distribution in real implementation)
    return Math.min(0.99, tStatistic / 3);
  }

  /**
   * Calculate baseline stability
   */
  private calculateStability(metricValues: Record<string, number[]>): number {
    const coefficientsOfVariation = Object.values(metricValues).map(values => {
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const stdDev = this.calculateStandardDeviation(values, mean);
      return stdDev / mean;
    });

    const avgCoV = coefficientsOfVariation.reduce((sum, cov) => sum + cov, 0) / coefficientsOfVariation.length;
    return Math.max(0, 1 - avgCoV); // Lower CoV = higher stability
  }

  /**
   * Calculate baseline reliability
   */
  private calculateReliability(results: EvaluationResults[]): number {
    const successRate = results.filter(r => r.success).length / results.length;
    return successRate;
  }

  /**
   * Calculate baseline coverage
   */
  private calculateCoverage(metricValues: Record<string, number[]>): number {
    // Simple coverage based on number of metrics
    const expectedMetrics = ['overallScore', 'planningLatency', 'executionLatency', 'memoryUtilization'];
    const actualMetrics = Object.keys(metricValues);
    const coverage = actualMetrics.filter(m => expectedMetrics.includes(m)).length / expectedMetrics.length;
    return coverage;
  }

  /**
   * Identify affected capabilities
   */
  private identifyAffectedCapabilities(scenarioId: string, metricType: string): string[] {
    const capabilities: string[] = [];

    // Map metrics to capabilities
    if (metricType.includes('planning')) {
      capabilities.push('planning', 'reasoning');
    }
    if (metricType.includes('execution')) {
      capabilities.push('execution', 'motor_control');
    }
    if (metricType.includes('memory')) {
      capabilities.push('memory', 'learning');
    }
    if (metricType.includes('social')) {
      capabilities.push('social_interaction', 'communication');
    }

    // Add scenario-specific capabilities
    if (scenarioId.includes('spatial')) {
      capabilities.push('spatial_reasoning', 'navigation');
    }
    if (scenarioId.includes('resource')) {
      capabilities.push('resource_management', 'optimization');
    }

    return [...new Set(capabilities)];
  }

  /**
   * Identify potential causes
   */
  private identifyPotentialCauses(scenarioId: string, metricType: string, degradation: number): string[] {
    const causes: string[] = [];

    if (degradation > 0.2) {
      causes.push('major_code_change', 'configuration_change', 'environment_change');
    } else if (degradation > 0.1) {
      causes.push('algorithm_modification', 'parameter_tuning', 'dependency_update');
    } else {
      causes.push('minor_optimization', 'data_drift', 'system_load');
    }

    // Metric-specific causes
    if (metricType.includes('latency')) {
      causes.push('performance_bottleneck', 'resource_contention');
    }
    if (metricType.includes('accuracy')) {
      causes.push('model_degradation', 'training_data_issue');
    }

    return causes;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    severity: RegressionSeverity,
    metricType: string,
    degradation: number
  ): string[] {
    const recommendations: string[] = [];

    switch (severity) {
      case RegressionSeverity.EMERGENCY:
        recommendations.push('Immediate investigation required');
        recommendations.push('Consider system rollback');
        recommendations.push('Escalate to senior team');
        break;
      case RegressionSeverity.CRITICAL:
        recommendations.push('High priority investigation');
        recommendations.push('Review recent changes');
        recommendations.push('Run diagnostic tests');
        break;
      case RegressionSeverity.WARNING:
        recommendations.push('Monitor closely');
        recommendations.push('Schedule investigation');
        recommendations.push('Check system resources');
        break;
    }

    // Metric-specific recommendations
    if (metricType.includes('latency')) {
      recommendations.push('Profile performance bottlenecks');
      recommendations.push('Check system resource usage');
    }
    if (metricType.includes('accuracy')) {
      recommendations.push('Validate model performance');
      recommendations.push('Check training data quality');
    }

    return recommendations;
  }

  /**
   * Send alert for regression
   */
  private async sendAlert(detection: RegressionDetection): Promise<void> {
    const alert = {
      id: `alert_${detection.id}`,
      severity: detection.severity,
      message: `Regression detected: ${detection.metricType} degraded by ${detection.degradationPercentage.toFixed(1)}% in ${detection.scenarioId}`,
      timestamp: Date.now(),
      detection
    };

    // Send to configured channels
    for (const channel of this.config.notificationChannels) {
      await this.sendToChannel(channel, alert);
    }

    this.emit('alert_sent', alert);
  }

  /**
   * Send alert to specific channel
   */
  private async sendToChannel(channel: string, alert: any): Promise<void> {
    switch (channel) {
      case 'console':
        console.warn(`[REGRESSION ALERT] ${alert.message}`);
        break;
      case 'log':
        // Would integrate with logging system
        break;
      case 'email':
        // Would integrate with email system
        break;
      case 'slack':
        // Would integrate with Slack
        break;
    }
  }

  /**
   * Trigger auto-recovery
   */
  private async triggerAutoRecovery(detection: RegressionDetection): Promise<void> {
    this.emit('auto_recovery_triggered', detection);
    
    // Implementation would depend on the specific recovery mechanisms available
    // For example: restart services, rollback configurations, etc.
  }

  /**
   * Perform routine monitoring check
   */
  private async performRoutineCheck(): Promise<void> {
    this.emit('routine_check_started');

    // Update baselines if needed
    await this.updateBaselines();

    // Check for resolved regressions
    await this.checkResolvedRegressions();

    // Clean up old data
    this.cleanupOldData();

    this.emit('routine_check_completed');
  }

  /**
   * Update baselines based on configuration
   */
  private async updateBaselines(): Promise<void> {
    // Implementation would update baselines based on frequency setting
  }

  /**
   * Check if any regressions have been resolved
   */
  private async checkResolvedRegressions(): Promise<void> {
    const resolvedKeys: string[] = [];

    for (const [key, regression] of this.activeRegressions.entries()) {
      const recentResults = this.recentResults.get(key.replace(`_${regression.metricType}`, ''));
      
      if (recentResults && recentResults.length >= this.config.minimumSamples) {
        const metricValues = this.extractMetricValues(recentResults);
        const currentValues = metricValues[regression.metricType];
        
        if (currentValues) {
          const currentMean = currentValues.reduce((sum, v) => sum + v, 0) / currentValues.length;
          const degradation = Math.abs((regression.baselineValue - currentMean) / regression.baselineValue);
          
          if (degradation < this.config.warningThreshold) {
            resolvedKeys.push(key);
            this.emit('regression_resolved', regression);
          }
        }
      }
    }

    // Remove resolved regressions
    resolvedKeys.forEach(key => {
      this.activeRegressions.delete(key);
    });
  }

  /**
   * Clean up old data
   */
  private cleanupOldData(): void {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days

    // Clean up old regression history
    this.regressionHistory = this.regressionHistory.filter(
      r => r.timestamp > cutoffTime
    );

    // Clean up old results
    for (const [key, results] of this.recentResults.entries()) {
      const filteredResults = results.filter(r => r.timestamp > cutoffTime);
      if (filteredResults.length > 0) {
        this.recentResults.set(key, filteredResults);
      } else {
        this.recentResults.delete(key);
      }
    }
  }

  /**
   * Get monitoring dashboard data
   */
  getMonitoringDashboard(): MonitoringDashboard {
    const activeRegressions = Array.from(this.activeRegressions.values());
    const recentRegressions = this.regressionHistory
      .filter(r => r.timestamp > Date.now() - (24 * 60 * 60 * 1000))
      .slice(0, 10);

    // Calculate overall health
    let overallHealth: 'healthy' | 'degraded' | 'critical' | 'emergency' = 'healthy';
    let healthScore = 1.0;

    if (activeRegressions.some(r => r.severity === RegressionSeverity.EMERGENCY)) {
      overallHealth = 'emergency';
      healthScore = 0.2;
    } else if (activeRegressions.some(r => r.severity === RegressionSeverity.CRITICAL)) {
      overallHealth = 'critical';
      healthScore = 0.4;
    } else if (activeRegressions.length > 0) {
      overallHealth = 'degraded';
      healthScore = 0.7;
    }

    // Generate performance trends
    const performanceTrends: Record<string, any> = {};
    for (const [key, results] of this.recentResults.entries()) {
      if (results.length >= 5) {
        const recentScores = results.slice(-5).map(r => r.overallScore);
        const trend = this.calculateTrend(recentScores);
        performanceTrends[key] = trend;
      }
    }

    return {
      timestamp: Date.now(),
      overallHealth,
      healthScore,
      activeRegressions,
      recentRegressions,
      resolvedRegressions: [], // Would track resolved regressions
      performanceTrends,
      systemMetrics: {
        totalScenarios: new Set(Array.from(this.recentResults.keys()).map(k => k.split('_')[0])).size,
        totalAgents: new Set(Array.from(this.recentResults.keys()).map(k => k.split('_')[1])).size,
        monitoredMetrics: this.baselines.size,
        baselinesCurrent: Array.from(this.baselines.values()).filter(b => b.isActive).length,
        baselinesOutdated: Array.from(this.baselines.values()).filter(b => !b.isActive).length
      },
      pendingAlerts: [] // Would track pending alerts
    };
  }

  /**
   * Calculate trend for a series of values
   */
  private calculateTrend(values: number[]): any {
    if (values.length < 3) {
      return { trend: 'stable', slope: 0, confidence: 0, recentChange: 0 };
    }

    // Simple linear regression
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * values[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Determine trend direction
    let trend: 'improving' | 'stable' | 'declining';
    if (Math.abs(slope) < 0.01) {
      trend = 'stable';
    } else if (slope > 0) {
      trend = 'improving';
    } else {
      trend = 'declining';
    }

    // Calculate confidence (R-squared)
    const yMean = sumY / n;
    const ssRes = values.reduce((sum, val, i) => {
      const predicted = slope * i + intercept;
      return sum + Math.pow(val - predicted, 2);
    }, 0);
    const ssTot = values.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
    const confidence = 1 - (ssRes / ssTot);

    const recentChange = values[values.length - 1] - values[0];

    return {
      trend,
      slope,
      confidence: Math.max(0, Math.min(1, confidence)),
      recentChange
    };
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): RegressionConfig {
    return {
      warningThreshold: 0.05,
      criticalThreshold: 0.15,
      emergencyThreshold: 0.30,
      minimumSamples: 5,
      confidenceLevel: 0.95,
      windowSize: 20,
      continuousMonitoring: true,
      alertingEnabled: true,
      autoRecoveryEnabled: false,
      baselineUpdateFrequency: 'weekly',
      baselineMinimumSamples: 10,
      metricWeights: {},
      ignoredMetrics: [],
      notificationChannels: ['console', 'log'],
      escalationRules: []
    };
  }

  /**
   * Export monitoring data
   */
  exportMonitoringData(): any {
    return {
      config: this.config,
      baselines: Array.from(this.baselines.entries()),
      activeRegressions: Array.from(this.activeRegressions.entries()),
      regressionHistory: this.regressionHistory,
      recentResults: Array.from(this.recentResults.entries()).map(([key, results]) => ({
        key,
        resultCount: results.length,
        latestTimestamp: Math.max(...results.map(r => r.timestamp))
      }))
    };
  }
}

/**
 * Default regression monitoring configurations
 */
export const DEFAULT_REGRESSION_CONFIGS = {
  strict: {
    warningThreshold: 0.02,
    criticalThreshold: 0.05,
    emergencyThreshold: 0.10,
    minimumSamples: 10,
    confidenceLevel: 0.99
  },
  
  moderate: {
    warningThreshold: 0.05,
    criticalThreshold: 0.15,
    emergencyThreshold: 0.30,
    minimumSamples: 5,
    confidenceLevel: 0.95
  },
  
  lenient: {
    warningThreshold: 0.10,
    criticalThreshold: 0.25,
    emergencyThreshold: 0.50,
    minimumSamples: 3,
    confidenceLevel: 0.90
  }
};

/**
 * Safety Monitoring System Types - Comprehensive telemetry and health monitoring
 *
 * Implements real-time safety monitoring with telemetry collection, anomaly detection,
 * health assessment, and alerting for conscious bot safety assurance.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ===== CORE MONITORING TYPES =====

/**
 * System health status levels
 */
export const HealthStatusSchema = z.enum([
  'healthy',
  'warning',
  'degraded',
  'critical',
  'offline',
]);

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

/**
 * Monitoring priority levels
 */
export const PriorityLevelSchema = z.enum([
  'low',
  'medium',
  'high',
  'critical',
  'emergency',
]);

export type PriorityLevel = z.infer<typeof PriorityLevelSchema>;

/**
 * Component type classification
 */
export const ComponentTypeSchema = z.enum([
  'core',
  'world',
  'memory',
  'planning',
  'interfaces',
  'safety',
  'external',
]);

export type ComponentType = z.infer<typeof ComponentTypeSchema>;

/**
 * Metric data types
 */
export const MetricTypeSchema = z.enum([
  'counter',
  'gauge',
  'histogram',
  'timer',
  'rate',
  'percentage',
  'boolean',
  'text',
]);

export type MetricType = z.infer<typeof MetricTypeSchema>;

// ===== TELEMETRY TYPES =====

/**
 * Telemetry data point
 */
export const TelemetryDataSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  source: z.string(),
  componentType: ComponentTypeSchema,
  metricName: z.string(),
  metricType: MetricTypeSchema,
  value: z.union([z.number(), z.string(), z.boolean()]),
  unit: z.string().optional(),
  tags: z.record(z.string()).default({}),
  metadata: z.record(z.any()).optional(),
});

export type TelemetryData = z.infer<typeof TelemetryDataSchema>;

/**
 * Telemetry aggregation period
 */
export const AggregationPeriodSchema = z.enum([
  '1s',
  '5s',
  '30s',
  '1m',
  '5m',
  '15m',
  '1h',
  '24h',
]);

export type AggregationPeriod = z.infer<typeof AggregationPeriodSchema>;

/**
 * Aggregated telemetry metrics
 */
export const AggregatedMetricsSchema = z.object({
  metricName: z.string(),
  period: AggregationPeriodSchema,
  startTime: z.number(),
  endTime: z.number(),
  count: z.number(),
  sum: z.number().optional(),
  average: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  p50: z.number().optional(),
  p95: z.number().optional(),
  p99: z.number().optional(),
  stddev: z.number().optional(),
});

export type AggregatedMetrics = z.infer<typeof AggregatedMetricsSchema>;

// ===== HEALTH MONITORING TYPES =====

/**
 * Health check definition
 */
export const HealthCheckSchema = z.object({
  id: z.string(),
  name: z.string(),
  componentType: ComponentTypeSchema,
  description: z.string(),
  checkInterval: z.number().positive(), // ms
  timeout: z.number().positive(), // ms
  enabled: z.boolean().default(true),
  critical: z.boolean().default(false),
  tags: z.record(z.string()).default({}),
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;

/**
 * Health check result
 */
export const HealthCheckResultSchema = z.object({
  checkId: z.string(),
  timestamp: z.number(),
  status: HealthStatusSchema,
  responseTime: z.number().nonnegative(), // ms
  message: z.string().optional(),
  details: z.record(z.any()).optional(),
  error: z.string().optional(),
});

export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;

/**
 * Component health status
 */
export const ComponentHealthSchema = z.object({
  componentId: z.string(),
  componentType: ComponentTypeSchema,
  status: HealthStatusSchema,
  lastUpdated: z.number(),
  checkResults: z.array(HealthCheckResultSchema),
  metrics: z.record(z.number()).default({}),
  uptime: z.number().nonnegative().default(0), // ms
  issueCount: z.number().nonnegative().default(0),
  criticalIssues: z.number().nonnegative().default(0),
});

export type ComponentHealth = z.infer<typeof ComponentHealthSchema>;

// ===== ANOMALY DETECTION TYPES =====

/**
 * Anomaly detection algorithm types
 */
export const AnomalyAlgorithmSchema = z.enum([
  'threshold',
  'statistical',
  'moving_average',
  'exponential_smoothing',
  'isolation_forest',
  'clustering',
]);

export type AnomalyAlgorithm = z.infer<typeof AnomalyAlgorithmSchema>;

/**
 * Anomaly detection configuration
 */
export const AnomalyDetectionConfigSchema = z.object({
  id: z.string(),
  metricName: z.string(),
  algorithm: AnomalyAlgorithmSchema,
  sensitivity: z.number().min(0).max(1).default(0.5),
  windowSize: z.number().positive().default(100),
  thresholds: z
    .object({
      warning: z.number().optional(),
      critical: z.number().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  enabled: z.boolean().default(true),
});

export type AnomalyDetectionConfig = z.infer<
  typeof AnomalyDetectionConfigSchema
>;

/**
 * Detected anomaly
 */
export const DetectedAnomalySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  metricName: z.string(),
  algorithm: AnomalyAlgorithmSchema,
  severity: PriorityLevelSchema,
  score: z.number().min(0).max(1), // Anomaly confidence score
  value: z.number(),
  expectedValue: z.number().optional(),
  deviation: z.number().optional(),
  context: z.record(z.any()).default({}),
  description: z.string(),
});

export type DetectedAnomaly = z.infer<typeof DetectedAnomalySchema>;

// ===== ALERTING TYPES =====

/**
 * Alert condition types
 */
export const AlertConditionSchema = z.enum([
  'threshold_exceeded',
  'threshold_below',
  'anomaly_detected',
  'health_check_failed',
  'component_offline',
  'rate_limit_exceeded',
  'resource_exhausted',
  'error_rate_high',
]);

export type AlertCondition = z.infer<typeof AlertConditionSchema>;

/**
 * Alert severity levels
 */
export const AlertSeveritySchema = z.enum([
  'info',
  'warning',
  'error',
  'critical',
  'emergency',
]);

export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

/**
 * Alert definition
 */
export const AlertRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  condition: AlertConditionSchema,
  severity: AlertSeveritySchema,
  metricName: z.string().optional(),
  componentType: ComponentTypeSchema.optional(),
  threshold: z.number().optional(),
  evaluationWindow: z.number().positive().default(60000), // ms
  cooldownPeriod: z.number().positive().default(300000), // ms
  enabled: z.boolean().default(true),
  tags: z.record(z.string()).default({}),
});

export type AlertRule = z.infer<typeof AlertRuleSchema>;

/**
 * Alert instance
 */
export const AlertInstanceSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  timestamp: z.number(),
  severity: AlertSeveritySchema,
  title: z.string(),
  message: z.string(),
  source: z.string(),
  componentType: ComponentTypeSchema.optional(),
  value: z.number().optional(),
  threshold: z.number().optional(),
  context: z.record(z.any()).default({}),
  resolved: z.boolean().default(false),
  resolvedAt: z.number().optional(),
  acknowledgedBy: z.string().optional(),
  acknowledgedAt: z.number().optional(),
});

export type AlertInstance = z.infer<typeof AlertInstanceSchema>;

// ===== CONFIGURATION =====

/**
 * Safety monitoring configuration
 */
export const SafetyMonitoringConfigSchema = z.object({
  telemetry: z.object({
    collectionEnabled: z.boolean().default(true),
    bufferSize: z.number().positive().default(10000),
    flushInterval: z.number().positive().default(5000), // ms
    retentionPeriod: z.number().positive().default(86400000), // 24 hours in ms
    compression: z.boolean().default(true),
    sampling: z.object({
      enabled: z.boolean().default(false),
      rate: z.number().min(0).max(1).default(0.1), // 10% sampling
    }),
  }),

  healthChecks: z.object({
    enabled: z.boolean().default(true),
    defaultInterval: z.number().positive().default(30000), // 30 seconds
    defaultTimeout: z.number().positive().default(5000), // 5 seconds
    maxConcurrent: z.number().positive().default(10),
    retryAttempts: z.number().nonnegative().default(3),
    retryDelay: z.number().positive().default(1000), // ms
  }),

  anomalyDetection: z.object({
    enabled: z.boolean().default(true),
    evaluationInterval: z.number().positive().default(60000), // 1 minute
    defaultSensitivity: z.number().min(0).max(1).default(0.7),
    maxAnomaliesPerMinute: z.number().positive().default(100),
    retentionPeriod: z.number().positive().default(604800000), // 7 days
  }),

  alerting: z.object({
    enabled: z.boolean().default(true),
    evaluationInterval: z.number().positive().default(30000), // 30 seconds
    maxAlertsPerMinute: z.number().positive().default(50),
    defaultCooldown: z.number().positive().default(300000), // 5 minutes
    escalationEnabled: z.boolean().default(true),
    escalationDelay: z.number().positive().default(900000), // 15 minutes
  }),

  performance: z.object({
    maxMemoryUsage: z
      .number()
      .positive()
      .default(100 * 1024 * 1024), // 100MB
    maxCpuUsage: z.number().min(0).max(1).default(0.8), // 80%
    maxLatency: z.number().positive().default(1000), // 1 second
    monitoringOverhead: z.number().min(0).max(1).default(0.05), // 5%
  }),

  storage: z.object({
    provider: z.enum(['memory', 'file', 'database']).default('memory'),
    maxSize: z
      .number()
      .positive()
      .default(1024 * 1024 * 1024), // 1GB
    archiveEnabled: z.boolean().default(true),
    archiveThreshold: z.number().min(0).max(1).default(0.8), // 80% full
    compressionLevel: z.number().min(0).max(9).default(6),
  }),
});

export type SafetyMonitoringConfig = z.infer<
  typeof SafetyMonitoringConfigSchema
>;

// ===== PERFORMANCE METRICS =====

/**
 * Monitoring system performance metrics
 */
export const MonitoringMetricsSchema = z.object({
  telemetry: z.object({
    dataPointsCollected: z.number().nonnegative(),
    dataPointsDropped: z.number().nonnegative(),
    collectionLatency: z.object({
      mean: z.number().nonnegative(),
      p95: z.number().nonnegative(),
      p99: z.number().nonnegative(),
    }),
    bufferUtilization: z.number().min(0).max(1),
    throughput: z.number().nonnegative(), // data points per second
  }),

  healthChecks: z.object({
    totalChecks: z.number().nonnegative(),
    failedChecks: z.number().nonnegative(),
    averageResponseTime: z.number().nonnegative(),
    timeoutRate: z.number().min(0).max(1),
    successRate: z.number().min(0).max(1),
  }),

  anomalyDetection: z.object({
    anomaliesDetected: z.number().nonnegative(),
    falsePositiveRate: z.number().min(0).max(1),
    detectionLatency: z.number().nonnegative(),
    algorithmPerformance: z.record(
      z.object({
        accuracy: z.number().min(0).max(1),
        precision: z.number().min(0).max(1),
        recall: z.number().min(0).max(1),
      })
    ),
  }),

  alerting: z.object({
    alertsGenerated: z.number().nonnegative(),
    alertsResolved: z.number().nonnegative(),
    averageResolutionTime: z.number().nonnegative(),
    alertRate: z.number().nonnegative(), // alerts per hour
    escalationRate: z.number().min(0).max(1),
  }),

  system: z.object({
    memoryUsage: z.number().nonnegative(),
    cpuUsage: z.number().min(0).max(1),
    diskUsage: z.number().nonnegative(),
    networkIO: z.object({
      bytesIn: z.number().nonnegative(),
      bytesOut: z.number().nonnegative(),
    }),
    uptime: z.number().nonnegative(),
  }),
});

export type MonitoringMetrics = z.infer<typeof MonitoringMetricsSchema>;

// ===== INTERFACES =====

/**
 * Telemetry collector interface
 */
export interface ITelemetryCollector {
  collect(data: TelemetryData): Promise<void>;
  collectBatch(data: TelemetryData[]): Promise<void>;
  getMetrics(metricName: string): Promise<TelemetryData[]>;
  getAggregatedMetrics(
    metricName: string,
    period: AggregationPeriod
  ): Promise<AggregatedMetrics[]>;
  flush(): Promise<void>;
  getCollectionStats(): {
    collected: number;
    dropped: number;
    bufferSize: number;
    lastFlush: number;
  };
}

/**
 * Health monitor interface
 */
export interface IHealthMonitor {
  registerCheck(check: HealthCheck): void;
  unregisterCheck(checkId: string): void;
  executeCheck(checkId: string): Promise<HealthCheckResult>;
  executeAllChecks(): Promise<HealthCheckResult[]>;
  getComponentHealth(componentId: string): ComponentHealth | null;
  getSystemHealth(): {
    status: HealthStatus;
    components: ComponentHealth[];
    summary: {
      total: number;
      healthy: number;
      warning: number;
      critical: number;
      offline: number;
    };
  };
}

/**
 * Anomaly detector interface
 */
export interface IAnomalyDetector {
  addDetectionRule(config: AnomalyDetectionConfig): void;
  removeDetectionRule(configId: string): void;
  detectAnomalies(metricName: string, data: number[]): DetectedAnomaly[];
  trainModel(metricName: string, historicalData: number[]): Promise<void>;
  getDetectionStats(): {
    rulesActive: number;
    anomaliesDetected: number;
    falsePositiveRate: number;
    lastEvaluation: number;
  };
}

/**
 * Alert manager interface
 */
export interface IAlertManager {
  addRule(rule: AlertRule): void;
  removeRule(ruleId: string): void;
  evaluateRules(): Promise<void>;
  triggerAlert(
    ruleId: string,
    context: Record<string, any>
  ): Promise<AlertInstance>;
  resolveAlert(alertId: string, resolvedBy?: string): Promise<void>;
  acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void>;
  getActiveAlerts(): AlertInstance[];
  getAlertHistory(startTime: number, endTime: number): AlertInstance[];
}

// ===== UTILITY FUNCTIONS =====

/**
 * Create telemetry data point
 */
export function createTelemetryData(
  source: string,
  componentType: ComponentType,
  metricName: string,
  metricType: MetricType,
  value: number | string | boolean,
  options?: {
    unit?: string;
    tags?: Record<string, string>;
    metadata?: Record<string, any>;
  }
): TelemetryData {
  return {
    id: `tel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    source,
    componentType,
    metricName,
    metricType,
    value,
    unit: options?.unit,
    tags: options?.tags || {},
    metadata: options?.metadata,
  };
}

/**
 * Calculate health status from check results
 */
export function calculateHealthStatus(
  results: HealthCheckResult[]
): HealthStatus {
  if (results.length === 0) return 'offline';

  const statusCounts = results.reduce(
    (acc, result) => {
      acc[result.status]++;
      return acc;
    },
    { healthy: 0, warning: 0, degraded: 0, critical: 0, offline: 0 }
  );

  // Determine overall status based on worst case
  if (statusCounts.critical > 0) return 'critical';
  if (statusCounts.offline > 0) return 'degraded';
  if (statusCounts.degraded > 0) return 'degraded';
  if (statusCounts.warning > 0) return 'warning';
  return 'healthy';
}

/**
 * Format alert message
 */
export function formatAlertMessage(
  rule: AlertRule,
  context: Record<string, any>
): string {
  let message = `Alert: ${rule.name}`;

  if (context.value !== undefined) {
    message += ` - Current value: ${context.value}`;
  }

  if (rule.threshold !== undefined) {
    message += ` (Threshold: ${rule.threshold})`;
  }

  if (context.component) {
    message += ` - Component: ${context.component}`;
  }

  return message;
}

/**
 * Check if value exceeds threshold
 */
export function checkThreshold(
  value: number,
  threshold: number,
  condition: 'above' | 'below' | 'equals'
): boolean {
  switch (condition) {
    case 'above':
      return value > threshold;
    case 'below':
      return value < threshold;
    case 'equals':
      return Math.abs(value - threshold) < 0.0001; // Account for floating point precision
    default:
      return false;
  }
}

/**
 * Calculate statistical properties
 */
export function calculateStatistics(values: number[]): {
  count: number;
  sum: number;
  mean: number;
  min: number;
  max: number;
  median: number;
  p95: number;
  p99: number;
  stddev: number;
} {
  if (values.length === 0) {
    return {
      count: 0,
      sum: 0,
      mean: 0,
      min: 0,
      max: 0,
      median: 0,
      p95: 0,
      p99: 0,
      stddev: 0,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = values.length;
  const sum = values.reduce((acc, val) => acc + val, 0);
  const mean = sum / count;

  const variance =
    values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
  const stddev = Math.sqrt(variance);

  return {
    count,
    sum,
    mean,
    min: sorted[0],
    max: sorted[count - 1],
    median: sorted[Math.floor(count / 2)],
    p95: sorted[Math.floor(count * 0.95)] || sorted[count - 1],
    p99: sorted[Math.floor(count * 0.99)] || sorted[count - 1],
    stddev,
  };
}

// Export validation functions
export const validateTelemetryData = (data: unknown): TelemetryData =>
  TelemetryDataSchema.parse(data);

export const validateHealthCheck = (data: unknown): HealthCheck =>
  HealthCheckSchema.parse(data);

export const validateAnomalyDetectionConfig = (
  data: unknown
): AnomalyDetectionConfig => AnomalyDetectionConfigSchema.parse(data);

export const validateAlertRule = (data: unknown): AlertRule =>
  AlertRuleSchema.parse(data);

export const validateSafetyMonitoringConfig = (
  data: unknown
): SafetyMonitoringConfig => SafetyMonitoringConfigSchema.parse(data);

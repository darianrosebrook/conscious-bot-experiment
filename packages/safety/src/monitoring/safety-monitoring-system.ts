/**
 * Safety Monitoring System - Integrated safety monitoring and alerting
 *
 * Main coordination system that integrates telemetry collection, health monitoring,
 * anomaly detection, and alerting for comprehensive safety assurance.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { TelemetryCollector } from './telemetry-collector';
import { HealthMonitor } from './health-monitor';
import {
  TelemetryData,
  HealthCheck,
  SafetyMonitoringConfig,
  MonitoringMetrics,
  ComponentHealth,
  HealthStatus,
  PriorityLevel,
  createTelemetryData,
  validateSafetyMonitoringConfig,
} from './types';

export interface SafetyMonitoringSystemEvents {
  'telemetry-collected': [TelemetryData];
  'health-check-completed': [{ checkId: string; status: HealthStatus }];
  'system-health-changed': [
    { oldStatus: HealthStatus; newStatus: HealthStatus },
  ];
  'performance-warning': [{ metric: string; value: number; threshold: number }];
  'safety-alert': [
    { level: PriorityLevel; message: string; component?: string },
  ];
  'monitoring-error': [{ error: string; component: string }];
}

/**
 * Safety monitoring configuration with defaults
 */
const DEFAULT_MONITORING_CONFIG: SafetyMonitoringConfig = {
  telemetry: {
    collectionEnabled: true,
    bufferSize: 10000,
    flushInterval: 5000,
    retentionPeriod: 86400000,
    compression: true,
    sampling: {
      enabled: false,
      rate: 0.1,
    },
  },
  healthChecks: {
    enabled: true,
    defaultInterval: 30000,
    defaultTimeout: 5000,
    maxConcurrent: 10,
    retryAttempts: 3,
    retryDelay: 1000,
  },
  anomalyDetection: {
    enabled: true,
    evaluationInterval: 60000,
    defaultSensitivity: 0.7,
    maxAnomaliesPerMinute: 100,
    retentionPeriod: 604800000,
  },
  alerting: {
    enabled: true,
    evaluationInterval: 30000,
    maxAlertsPerMinute: 50,
    defaultCooldown: 300000,
    escalationEnabled: true,
    escalationDelay: 900000,
  },
  performance: {
    maxMemoryUsage: 100 * 1024 * 1024,
    maxCpuUsage: 0.8,
    maxLatency: 1000,
    monitoringOverhead: 0.05,
  },
  storage: {
    provider: 'memory',
    maxSize: 1024 * 1024 * 1024,
    archiveEnabled: true,
    archiveThreshold: 0.8,
    compressionLevel: 6,
  },
};

/**
 * Comprehensive safety monitoring system
 */
export class SafetyMonitoringSystem extends EventEmitter<SafetyMonitoringSystemEvents> {
  private telemetryCollector: TelemetryCollector;
  private healthMonitor: HealthMonitor;
  private isInitialized = false;
  private startTime = Date.now();

  // Performance tracking
  private metrics: MonitoringMetrics = {
    telemetry: {
      dataPointsCollected: 0,
      dataPointsDropped: 0,
      collectionLatency: { mean: 0, p95: 0, p99: 0 },
      bufferUtilization: 0,
      throughput: 0,
    },
    healthChecks: {
      totalChecks: 0,
      failedChecks: 0,
      averageResponseTime: 0,
      timeoutRate: 0,
      successRate: 1,
    },
    anomalyDetection: {
      anomaliesDetected: 0,
      falsePositiveRate: 0,
      detectionLatency: 0,
      algorithmPerformance: {},
    },
    alerting: {
      alertsGenerated: 0,
      alertsResolved: 0,
      averageResolutionTime: 0,
      alertRate: 0,
      escalationRate: 0,
    },
    system: {
      memoryUsage: 0,
      cpuUsage: 0,
      diskUsage: 0,
      networkIO: { bytesIn: 0, bytesOut: 0 },
      uptime: 0,
    },
  };

  constructor(config?: Partial<SafetyMonitoringConfig>) {
    super();

    // Merge config with defaults
    const fullConfig = this.mergeConfig(config || {});

    try {
      validateSafetyMonitoringConfig(fullConfig);
    } catch (error) {
      throw new Error(
        `Invalid safety monitoring configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Initialize components
    this.telemetryCollector = new TelemetryCollector(fullConfig);
    this.healthMonitor = new HealthMonitor(fullConfig);

    this.setupEventHandlers();
    this.startPerformanceMonitoring();

    this.isInitialized = true;

    console.log('Safety monitoring system initialized');
  }

  /**
   * Initialize with standard health checks
   */
  async initializeStandardMonitoring(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('System not initialized');
    }

    // Register standard health checks
    const standardChecks: HealthCheck[] = [
      {
        id: 'system_memory',
        name: 'memory_usage',
        componentType: 'safety',
        description: 'Monitor system memory usage',
        checkInterval: 30000,
        timeout: 5000,
        enabled: true,
        critical: true,
      },
      {
        id: 'system_cpu',
        name: 'cpu_usage',
        componentType: 'safety',
        description: 'Monitor system CPU usage',
        checkInterval: 30000,
        timeout: 5000,
        enabled: true,
        critical: false,
      },
      {
        id: 'system_disk',
        name: 'disk_space',
        componentType: 'safety',
        description: 'Monitor disk space usage',
        checkInterval: 60000,
        timeout: 5000,
        enabled: true,
        critical: true,
      },
      {
        id: 'network_connectivity',
        name: 'network_connectivity',
        componentType: 'external',
        description: 'Monitor network connectivity',
        checkInterval: 45000,
        timeout: 10000,
        enabled: true,
        critical: false,
      },
    ];

    for (const check of standardChecks) {
      this.healthMonitor.registerCheck(check);
    }

    // Start collecting system telemetry
    this.startSystemTelemetry();

    console.log(
      'Standard monitoring initialized with',
      standardChecks.length,
      'health checks'
    );
  }

  /**
   * Collect telemetry data
   */
  async collectTelemetry(data: TelemetryData): Promise<void> {
    try {
      await this.telemetryCollector.collect(data);
      this.metrics.telemetry.dataPointsCollected++;
      this.emit('telemetry-collected', data);
    } catch (error) {
      this.metrics.telemetry.dataPointsDropped++;
      this.emit('monitoring-error', {
        error: `Telemetry collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        component: 'telemetry',
      });
    }
  }

  /**
   * Collect batch telemetry data
   */
  async collectTelemetryBatch(data: TelemetryData[]): Promise<void> {
    try {
      await this.telemetryCollector.collectBatch(data);
      this.metrics.telemetry.dataPointsCollected += data.length;

      for (const item of data) {
        this.emit('telemetry-collected', item);
      }
    } catch (error) {
      this.metrics.telemetry.dataPointsDropped += data.length;
      this.emit('monitoring-error', {
        error: `Batch telemetry collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        component: 'telemetry',
      });
    }
  }

  /**
   * Register a health check
   */
  registerHealthCheck(check: HealthCheck): void {
    try {
      this.healthMonitor.registerCheck(check);
      console.log(`Health check registered: ${check.name}`);
    } catch (error) {
      this.emit('monitoring-error', {
        error: `Health check registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        component: 'health_monitor',
      });
    }
  }

  /**
   * Execute all health checks
   */
  async executeHealthChecks(): Promise<void> {
    try {
      const results = await this.healthMonitor.executeAllChecks();

      for (const result of results) {
        this.emit('health-check-completed', {
          checkId: result.checkId,
          status: result.status,
        });

        if (result.status === 'critical') {
          this.emit('safety-alert', {
            level: 'critical',
            message: `Critical health check failed: ${result.checkId}`,
            component: result.checkId,
          });
        }
      }

      this.metrics.healthChecks.totalChecks += results.length;
      this.metrics.healthChecks.failedChecks += results.filter(
        (r) => r.status !== 'healthy'
      ).length;
    } catch (error) {
      this.emit('monitoring-error', {
        error: `Health check execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        component: 'health_monitor',
      });
    }
  }

  /**
   * Get system health status
   */
  getSystemHealth(): {
    status: HealthStatus;
    components: ComponentHealth[];
    uptime: number;
    summary: {
      total: number;
      healthy: number;
      warning: number;
      critical: number;
      offline: number;
    };
  } {
    const health = this.healthMonitor.getSystemHealth();

    return {
      ...health,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Get monitoring metrics
   */
  getMetrics(): MonitoringMetrics {
    // Update telemetry metrics
    const telemetryStats = this.telemetryCollector.getCollectionStats();
    const throughputMetrics = this.telemetryCollector.getThroughputMetrics();

    this.metrics.telemetry.bufferUtilization =
      throughputMetrics.bufferUtilization;
    this.metrics.telemetry.throughput = throughputMetrics.collectionRate;

    // Update health check metrics
    const healthStats = this.healthMonitor.getMonitoringStats();
    this.metrics.healthChecks = {
      totalChecks: healthStats.totalChecks,
      failedChecks: healthStats.failedChecks,
      averageResponseTime: healthStats.averageResponseTime,
      timeoutRate: healthStats.timeoutRate,
      successRate: healthStats.successRate,
    };

    // Update system metrics
    this.metrics.system.uptime = Date.now() - this.startTime;
    this.updateSystemMetrics();

    return { ...this.metrics };
  }

  /**
   * Get comprehensive system status
   */
  getSystemStatus(): {
    isHealthy: boolean;
    overallStatus: HealthStatus;
    uptime: number;
    components: ComponentHealth[];
    telemetryStats: ReturnType<TelemetryCollector['getCollectionStats']>;
    healthStats: ReturnType<HealthMonitor['getMonitoringStats']>;
    alerts: Array<{ level: PriorityLevel; message: string; timestamp: number }>;
  } {
    const health = this.getSystemHealth();
    const telemetryStats = this.telemetryCollector.getCollectionStats();
    const healthStats = this.healthMonitor.getMonitoringStats();

    return {
      isHealthy: health.status === 'healthy',
      overallStatus: health.status,
      uptime: health.uptime,
      components: health.components,
      telemetryStats,
      healthStats,
      alerts: [], // Would be populated from alert manager
    };
  }

  /**
   * Create and collect system performance telemetry
   */
  recordPerformanceMetric(
    metricName: string,
    value: number,
    component: string,
    tags?: Record<string, string>
  ): void {
    const telemetryData = createTelemetryData(
      component,
      'safety',
      metricName,
      'gauge',
      value,
      {
        unit: this.getMetricUnit(metricName),
        tags: tags || {},
      }
    );

    // Async collection, don't await
    this.collectTelemetry(telemetryData).catch((error) => {
      console.error('Failed to record performance metric:', error);
    });
  }

  /**
   * Check if monitoring system is healthy
   */
  isMonitoringHealthy(): boolean {
    const health = this.getSystemHealth();
    const telemetryStats = this.telemetryCollector.getCollectionStats();

    // Check if critical components are working
    const hasRecentTelemetry = Date.now() - telemetryStats.lastFlush < 60000; // Within 1 minute
    const hasHealthyComponents = health.summary.critical === 0;

    return (
      health.status !== 'critical' && hasRecentTelemetry && hasHealthyComponents
    );
  }

  /**
   * Shutdown monitoring system gracefully
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down safety monitoring system...');

    try {
      // Stop components gracefully
      await Promise.all([
        this.telemetryCollector.shutdown(),
        this.healthMonitor.shutdown(),
      ]);

      // Remove all listeners
      this.removeAllListeners();

      console.log('Safety monitoring system shutdown complete');
    } catch (error) {
      console.error('Error during monitoring system shutdown:', error);
      throw error;
    }
  }

  // ===== PRIVATE METHODS =====

  private mergeConfig(
    userConfig: Partial<SafetyMonitoringConfig>
  ): SafetyMonitoringConfig {
    return {
      telemetry: {
        ...DEFAULT_MONITORING_CONFIG.telemetry,
        ...userConfig.telemetry,
      },
      healthChecks: {
        ...DEFAULT_MONITORING_CONFIG.healthChecks,
        ...userConfig.healthChecks,
      },
      anomalyDetection: {
        ...DEFAULT_MONITORING_CONFIG.anomalyDetection,
        ...userConfig.anomalyDetection,
      },
      alerting: {
        ...DEFAULT_MONITORING_CONFIG.alerting,
        ...userConfig.alerting,
      },
      performance: {
        ...DEFAULT_MONITORING_CONFIG.performance,
        ...userConfig.performance,
      },
      storage: { ...DEFAULT_MONITORING_CONFIG.storage, ...userConfig.storage },
    };
  }

  private setupEventHandlers(): void {
    // Telemetry events
    this.telemetryCollector.on('data-collected', (data) => {
      this.emit('telemetry-collected', data);
    });

    this.telemetryCollector.on('data-dropped', ({ reason, count }) => {
      this.emit('monitoring-error', {
        error: `Telemetry data dropped: ${reason} (${count} items)`,
        component: 'telemetry',
      });
    });

    this.telemetryCollector.on('buffer-full', ({ size, capacity }) => {
      this.emit('performance-warning', {
        metric: 'telemetry_buffer_utilization',
        value: size / capacity,
        threshold: 0.9,
      });
    });

    // Health monitor events
    this.healthMonitor.on('health-check-completed', (result) => {
      this.emit('health-check-completed', {
        checkId: result.checkId,
        status: result.status,
      });
    });

    this.healthMonitor.on(
      'system-status-changed',
      ({ oldStatus, newStatus }) => {
        this.emit('system-health-changed', { oldStatus, newStatus });

        if (newStatus === 'critical') {
          this.emit('safety-alert', {
            level: 'critical',
            message: `System health critical: ${newStatus}`,
          });
        }
      }
    );

    this.healthMonitor.on('critical-health-issue', ({ componentId, issue }) => {
      this.emit('safety-alert', {
        level: 'critical',
        message: `Critical health issue: ${issue}`,
        component: componentId,
      });
    });
  }

  private startPerformanceMonitoring(): void {
    // Monitor performance every 30 seconds
    setInterval(() => {
      this.updateMetrics();
      this.checkPerformanceThresholds();
    }, 30000);
  }

  private startSystemTelemetry(): void {
    // Collect system metrics every 10 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 10000);
  }

  private updateMetrics(): void {
    // Update telemetry metrics
    const telemetryStats = this.telemetryCollector.getCollectionStats();
    this.metrics.telemetry.dataPointsCollected = telemetryStats.collected;
    this.metrics.telemetry.dataPointsDropped = telemetryStats.dropped;

    // Update system metrics
    this.updateSystemMetrics();
  }

  private updateSystemMetrics(): void {
    // Update memory usage
    const memUsage = process.memoryUsage();
    this.metrics.system.memoryUsage = memUsage.heapUsed;

    // Update uptime
    this.metrics.system.uptime = Date.now() - this.startTime;

    // CPU usage would be calculated here in a real implementation
    // For now, use a placeholder
    this.metrics.system.cpuUsage = 0.1; // 10% placeholder
  }

  private collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();

    // Memory metrics
    this.recordPerformanceMetric(
      'memory_heap_used',
      memUsage.heapUsed,
      'system',
      { unit: 'bytes' }
    );

    this.recordPerformanceMetric(
      'memory_heap_total',
      memUsage.heapTotal,
      'system',
      { unit: 'bytes' }
    );

    // Uptime metric
    this.recordPerformanceMetric(
      'uptime',
      Date.now() - this.startTime,
      'system',
      { unit: 'milliseconds' }
    );

    // Telemetry metrics
    const telemetryStats = this.telemetryCollector.getCollectionStats();
    this.recordPerformanceMetric(
      'telemetry_buffer_utilization',
      this.telemetryCollector.getBufferUtilization(),
      'telemetry',
      { unit: 'percent' }
    );

    this.recordPerformanceMetric(
      'telemetry_data_collected',
      telemetryStats.collected,
      'telemetry',
      { unit: 'count' }
    );
  }

  private checkPerformanceThresholds(): void {
    const config = DEFAULT_MONITORING_CONFIG.performance;

    // Check memory usage
    if (this.metrics.system.memoryUsage > config.maxMemoryUsage) {
      this.emit('performance-warning', {
        metric: 'memory_usage',
        value: this.metrics.system.memoryUsage,
        threshold: config.maxMemoryUsage,
      });
    }

    // Check CPU usage
    if (this.metrics.system.cpuUsage > config.maxCpuUsage) {
      this.emit('performance-warning', {
        metric: 'cpu_usage',
        value: this.metrics.system.cpuUsage,
        threshold: config.maxCpuUsage,
      });
    }

    // Check telemetry buffer utilization
    const bufferUtilization = this.telemetryCollector.getBufferUtilization();
    if (bufferUtilization > 0.9) {
      this.emit('performance-warning', {
        metric: 'telemetry_buffer_utilization',
        value: bufferUtilization,
        threshold: 0.9,
      });
    }
  }

  private getMetricUnit(metricName: string): string {
    const unitMap: Record<string, string> = {
      memory_heap_used: 'bytes',
      memory_heap_total: 'bytes',
      cpu_usage: 'percent',
      uptime: 'milliseconds',
      telemetry_buffer_utilization: 'percent',
      telemetry_data_collected: 'count',
      response_time: 'milliseconds',
      throughput: 'ops/sec',
    };

    return unitMap[metricName] || 'unknown';
  }
}

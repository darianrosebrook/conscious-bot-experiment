/**
 * Health Monitor - Comprehensive system health monitoring
 *
 * Implements real-time health checking with automated monitoring,
 * status aggregation, and health trend analysis for safety assurance.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  IHealthMonitor,
  HealthCheck,
  HealthCheckResult,
  ComponentHealth,
  HealthStatus,
  SafetyMonitoringConfig,
  calculateHealthStatus,
  validateHealthCheck,
} from './types';

export interface HealthMonitorEvents {
  'health-check-completed': [HealthCheckResult];
  'health-check-failed': [{ checkId: string; error: string }];
  'component-status-changed': [
    { componentId: string; oldStatus: HealthStatus; newStatus: HealthStatus },
  ];
  'system-status-changed': [
    { oldStatus: HealthStatus; newStatus: HealthStatus },
  ];
  'critical-health-issue': [{ componentId: string; issue: string }];
  'health-recovered': [{ componentId: string; downtime: number }];
}

/**
 * Health check execution context
 */
interface HealthCheckExecution {
  check: HealthCheck;
  lastExecution: number;
  nextExecution: number;
  consecutiveFailures: number;
  isRunning: boolean;
  lastResult?: HealthCheckResult;
}

/**
 * Component health tracking
 */
interface ComponentHealthTracker {
  componentId: string;
  componentType: ComponentHealth['componentType'];
  checks: Map<string, HealthCheckExecution>;
  status: HealthStatus;
  lastStatusChange: number;
  issueHistory: Array<{ timestamp: number; issue: string; resolved?: number }>;
  startTime: number;
}

/**
 * Comprehensive health monitoring system
 */
export class HealthMonitor
  extends EventEmitter<HealthMonitorEvents>
  implements IHealthMonitor
{
  private checks = new Map<string, HealthCheckExecution>();
  private components = new Map<string, ComponentHealthTracker>();
  private systemStatus: HealthStatus = 'healthy';
  private lastSystemStatusChange = Date.now();

  private monitoringTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private isShuttingDown = false;

  // Performance tracking
  private executionStats = {
    totalChecks: 0,
    failedChecks: 0,
    totalResponseTime: 0,
    timeouts: 0,
  };

  constructor(private config: SafetyMonitoringConfig) {
    super();

    if (config.healthChecks.enabled) {
      this.startHealthMonitoring();
      this.startPeriodicCleanup();
    }
  }

  /**
   * Register a new health check
   */
  registerCheck(check: HealthCheck): void {
    try {
      validateHealthCheck(check);

      const execution: HealthCheckExecution = {
        check,
        lastExecution: 0,
        nextExecution: Date.now(),
        consecutiveFailures: 0,
        isRunning: false,
      };

      this.checks.set(check.id, execution);

      // Ensure component tracker exists
      this.ensureComponentTracker(check.id, check.componentType);

      console.log(`Health check registered: ${check.name} (${check.id})`);
    } catch (error) {
      throw new Error(
        `Failed to register health check: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Unregister a health check
   */
  unregisterCheck(checkId: string): void {
    const execution = this.checks.get(checkId);
    if (!execution) {
      throw new Error(`Health check not found: ${checkId}`);
    }

    this.checks.delete(checkId);

    // Remove from component tracker
    for (const [componentId, tracker] of this.components) {
      if (tracker.checks.has(checkId)) {
        tracker.checks.delete(checkId);

        // If no more checks for this component, remove tracker
        if (tracker.checks.size === 0) {
          this.components.delete(componentId);
        }
        break;
      }
    }

    console.log(`Health check unregistered: ${checkId}`);
  }

  /**
   * Execute a specific health check
   */
  async executeCheck(checkId: string): Promise<HealthCheckResult> {
    const execution = this.checks.get(checkId);
    if (!execution) {
      throw new Error(`Health check not found: ${checkId}`);
    }

    if (execution.isRunning) {
      throw new Error(`Health check is already running: ${checkId}`);
    }

    return this.performHealthCheck(execution);
  }

  /**
   * Execute all registered health checks
   */
  async executeAllChecks(): Promise<HealthCheckResult[]> {
    const executions = Array.from(this.checks.values()).filter(
      (exec) => exec.check.enabled && !exec.isRunning
    );

    const results = await Promise.allSettled(
      executions.map((exec) => this.performHealthCheck(exec))
    );

    const healthCheckResults: HealthCheckResult[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        healthCheckResults.push(result.value);
      } else {
        console.error('Health check execution failed:', result.reason);
      }
    }

    return healthCheckResults;
  }

  /**
   * Get health status for a specific component
   */
  getComponentHealth(componentId: string): ComponentHealth | null {
    const tracker = this.components.get(componentId);
    if (!tracker) {
      return null;
    }

    const checkResults: HealthCheckResult[] = [];
    const metrics: Record<string, number> = {};

    for (const execution of tracker.checks.values()) {
      if (execution.lastResult) {
        checkResults.push(execution.lastResult);
        metrics[`${execution.check.name}_response_time`] =
          execution.lastResult.responseTime;
      }
    }

    return {
      componentId: tracker.componentId,
      componentType: tracker.componentType,
      status: tracker.status,
      lastUpdated: Date.now(),
      checkResults,
      metrics,
      uptime: Date.now() - tracker.startTime,
      issueCount: tracker.issueHistory.length,
      criticalIssues: tracker.issueHistory.filter(
        (issue) => !issue.resolved && issue.issue.includes('critical')
      ).length,
    };
  }

  /**
   * Get overall system health
   */
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
  } {
    const components: ComponentHealth[] = [];
    const summary = {
      total: 0,
      healthy: 0,
      warning: 0,
      degraded: 0,
      critical: 0,
      offline: 0,
    };

    for (const componentId of this.components.keys()) {
      const health = this.getComponentHealth(componentId);
      if (health) {
        components.push(health);
        summary.total++;
        summary[health.status]++;
      }
    }

    return {
      status: this.systemStatus,
      components,
      summary,
    };
  }

  /**
   * Get health monitoring statistics
   */
  getMonitoringStats(): {
    totalChecks: number;
    failedChecks: number;
    averageResponseTime: number;
    timeoutRate: number;
    successRate: number;
    activeChecks: number;
    componentsMonitored: number;
  } {
    const averageResponseTime =
      this.executionStats.totalChecks > 0
        ? this.executionStats.totalResponseTime /
          this.executionStats.totalChecks
        : 0;

    const timeoutRate =
      this.executionStats.totalChecks > 0
        ? this.executionStats.timeouts / this.executionStats.totalChecks
        : 0;

    const successRate =
      this.executionStats.totalChecks > 0
        ? (this.executionStats.totalChecks - this.executionStats.failedChecks) /
          this.executionStats.totalChecks
        : 1;

    return {
      totalChecks: this.executionStats.totalChecks,
      failedChecks: this.executionStats.failedChecks,
      averageResponseTime,
      timeoutRate,
      successRate,
      activeChecks: Array.from(this.checks.values()).filter(
        (exec) => exec.check.enabled
      ).length,
      componentsMonitored: this.components.size,
    };
  }

  /**
   * Enable or disable a health check
   */
  setCheckEnabled(checkId: string, enabled: boolean): void {
    const execution = this.checks.get(checkId);
    if (!execution) {
      throw new Error(`Health check not found: ${checkId}`);
    }

    execution.check.enabled = enabled;
    console.log(`Health check ${enabled ? 'enabled' : 'disabled'}: ${checkId}`);
  }

  /**
   * Update health check interval
   */
  updateCheckInterval(checkId: string, interval: number): void {
    const execution = this.checks.get(checkId);
    if (!execution) {
      throw new Error(`Health check not found: ${checkId}`);
    }

    execution.check.checkInterval = interval;
    execution.nextExecution = Date.now() + interval;

    console.log(`Health check interval updated: ${checkId} -> ${interval}ms`);
  }

  /**
   * Shutdown health monitor gracefully
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Stop timers
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Wait for any running checks to complete
    const runningChecks = Array.from(this.checks.values()).filter(
      (exec) => exec.isRunning
    );

    if (runningChecks.length > 0) {
      console.log(
        `Waiting for ${runningChecks.length} health checks to complete...`
      );

      // Give checks time to complete gracefully
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Remove all listeners
    this.removeAllListeners();

    console.log('Health monitor shutdown complete');
  }

  // ===== PRIVATE METHODS =====

  private async performHealthCheck(
    execution: HealthCheckExecution
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();
    execution.isRunning = true;

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Health check timeout'));
        }, execution.check.timeout);
      });

      // Execute the actual health check
      const checkPromise = this.executeHealthCheckLogic(execution.check);

      // Race between check and timeout
      const result = await Promise.race([checkPromise, timeoutPromise]);

      const responseTime = Date.now() - startTime;

      const healthResult: HealthCheckResult = {
        checkId: execution.check.id,
        timestamp: Date.now(),
        status: result.status,
        responseTime,
        message: result.message,
        details: result.details,
      };

      // Update execution tracking
      execution.lastExecution = Date.now();
      execution.nextExecution = Date.now() + execution.check.checkInterval;
      execution.lastResult = healthResult;

      if (result.status === 'healthy') {
        execution.consecutiveFailures = 0;
      } else {
        execution.consecutiveFailures++;
      }

      // Update statistics
      this.executionStats.totalChecks++;
      this.executionStats.totalResponseTime += responseTime;

      if (result.status !== 'healthy') {
        this.executionStats.failedChecks++;
      }

      // Update component health
      this.updateComponentHealth(execution.check.id, healthResult);

      this.emit('health-check-completed', healthResult);

      return healthResult;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const isTimeout =
        error instanceof Error && error.message === 'Health check timeout';

      if (isTimeout) {
        this.executionStats.timeouts++;
      }

      this.executionStats.totalChecks++;
      this.executionStats.failedChecks++;
      this.executionStats.totalResponseTime += responseTime;

      const errorResult: HealthCheckResult = {
        checkId: execution.check.id,
        timestamp: Date.now(),
        status: 'critical' as const,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      execution.lastExecution = Date.now();
      execution.nextExecution = Date.now() + execution.check.checkInterval;
      execution.lastResult = errorResult;
      execution.consecutiveFailures++;

      this.updateComponentHealth(execution.check.id, errorResult);

      this.emit('health-check-failed', {
        checkId: execution.check.id,
        error: errorResult.error || 'Unknown error occurred',
      });

      return errorResult;
    } finally {
      execution.isRunning = false;
    }
  }

  private async executeHealthCheckLogic(check: HealthCheck): Promise<{
    status: HealthStatus;
    message?: string;
    details?: Record<string, any>;
  }> {
    // This is a simplified health check implementation
    // In a real system, this would perform actual health checks based on check type

    try {
      // Simulate different types of health checks
      switch (check.name) {
        case 'memory_usage':
          return this.checkMemoryUsage();
        case 'cpu_usage':
          return this.checkCpuUsage();
        case 'disk_space':
          return this.checkDiskSpace();
        case 'network_connectivity':
          return this.checkNetworkConnectivity();
        case 'service_endpoint':
          return this.checkServiceEndpoint();
        default:
          return this.checkGenericHealth(check);
      }
    } catch (error) {
      return {
        status: 'critical',
        message: `Health check error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private checkMemoryUsage(): {
    status: HealthStatus;
    message: string;
    details: Record<string, any>;
  } {
    const usage = process.memoryUsage();
    const usedMB = usage.heapUsed / 1024 / 1024;
    const totalMB = usage.heapTotal / 1024 / 1024;
    const utilizationPercent = (usedMB / totalMB) * 100;

    let status: HealthStatus = 'healthy';
    if (utilizationPercent > 90) {
      status = 'critical';
    } else if (utilizationPercent > 80) {
      status = 'warning';
    }

    return {
      status,
      message: `Memory usage: ${utilizationPercent.toFixed(1)}%`,
      details: {
        usedMB: Math.round(usedMB),
        totalMB: Math.round(totalMB),
        utilizationPercent: Math.round(utilizationPercent),
      },
    };
  }

  private checkCpuUsage(): { status: HealthStatus; message: string } {
    // Simplified CPU check - in real implementation, would measure actual CPU usage
    const usage = Math.random() * 100; // Simulate CPU usage

    let status: HealthStatus = 'healthy';
    if (usage > 95) {
      status = 'critical';
    } else if (usage > 80) {
      status = 'warning';
    }

    return {
      status,
      message: `CPU usage: ${usage.toFixed(1)}%`,
    };
  }

  private checkDiskSpace(): { status: HealthStatus; message: string } {
    // Simplified disk check - in real implementation, would check actual disk usage
    const usage = Math.random() * 100; // Simulate disk usage

    let status: HealthStatus = 'healthy';
    if (usage > 95) {
      status = 'critical';
    } else if (usage > 85) {
      status = 'warning';
    }

    return {
      status,
      message: `Disk usage: ${usage.toFixed(1)}%`,
    };
  }

  private checkNetworkConnectivity(): {
    status: HealthStatus;
    message: string;
  } {
    // Simplified network check - in real implementation, would ping external services
    const isConnected = Math.random() > 0.1; // 90% success rate

    return {
      status: isConnected ? 'healthy' : 'critical',
      message: isConnected
        ? 'Network connectivity OK'
        : 'Network connectivity failed',
    };
  }

  private checkServiceEndpoint(): { status: HealthStatus; message: string } {
    // Simplified service check - in real implementation, would check actual endpoints
    const isResponding = Math.random() > 0.05; // 95% success rate

    return {
      status: isResponding ? 'healthy' : 'degraded',
      message: isResponding
        ? 'Service endpoint responding'
        : 'Service endpoint not responding',
    };
  }

  private checkGenericHealth(check: HealthCheck): {
    status: HealthStatus;
    message: string;
  } {
    // Generic health check with high success rate
    const isHealthy = Math.random() > 0.02; // 98% success rate

    return {
      status: isHealthy ? 'healthy' : 'warning',
      message: `${check.name}: ${isHealthy ? 'OK' : 'Warning'}`,
    };
  }

  private ensureComponentTracker(
    checkId: string,
    componentType: ComponentHealth['componentType']
  ): void {
    // Use checkId as componentId for simplicity
    const componentId = checkId;

    if (!this.components.has(componentId)) {
      this.components.set(componentId, {
        componentId,
        componentType,
        checks: new Map(),
        status: 'healthy',
        lastStatusChange: Date.now(),
        issueHistory: [],
        startTime: Date.now(),
      });
    }

    const tracker = this.components.get(componentId);
    const check = this.checks.get(checkId);

    if (!tracker || !check) {
      console.error(`Component or check not found: ${componentId}, ${checkId}`);
      return;
    }

    tracker.checks.set(checkId, check);
  }

  private updateComponentHealth(
    checkId: string,
    result: HealthCheckResult
  ): void {
    // Find component containing this check
    for (const [componentId, tracker] of this.components) {
      if (tracker.checks.has(checkId)) {
        const oldStatus = tracker.status;

        // Calculate new status based on all check results
        const allResults: HealthCheckResult[] = [];
        for (const execution of tracker.checks.values()) {
          if (execution.lastResult) {
            allResults.push(execution.lastResult);
          }
        }

        const newStatus = calculateHealthStatus(allResults);

        if (newStatus !== oldStatus) {
          tracker.status = newStatus;
          tracker.lastStatusChange = Date.now();

          this.emit('component-status-changed', {
            componentId,
            oldStatus,
            newStatus,
          });

          // Record issue if status degraded
          if (newStatus !== 'healthy' && oldStatus === 'healthy') {
            tracker.issueHistory.push({
              timestamp: Date.now(),
              issue: `Component status changed to ${newStatus}`,
            });

            if (newStatus === 'critical') {
              this.emit('critical-health-issue', {
                componentId,
                issue:
                  result.error ||
                  result.message ||
                  'Critical health check failed',
              });
            }
          }

          // Mark issue resolved if status improved
          if (newStatus === 'healthy' && oldStatus !== 'healthy') {
            const lastIssue =
              tracker.issueHistory[tracker.issueHistory.length - 1];
            if (lastIssue && !lastIssue.resolved) {
              lastIssue.resolved = Date.now();

              this.emit('health-recovered', {
                componentId,
                downtime: Date.now() - lastIssue.timestamp,
              });
            }
          }

          // Update system status
          this.updateSystemStatus();
        }
        break;
      }
    }
  }

  private updateSystemStatus(): void {
    const componentStatuses = Array.from(this.components.values()).map(
      (t) => t.status
    );
    const overallStatus = calculateHealthStatus(
      componentStatuses.map((status) => ({
        checkId: 'system',
        timestamp: Date.now(),
        status,
        responseTime: 0,
      }))
    );

    if (overallStatus !== this.systemStatus) {
      const oldStatus = this.systemStatus;
      this.systemStatus = overallStatus;
      this.lastSystemStatusChange = Date.now();

      this.emit('system-status-changed', {
        oldStatus,
        newStatus: overallStatus,
      });
    }
  }

  private startHealthMonitoring(): void {
    // Check for due health checks every second
    this.monitoringTimer = setInterval(async () => {
      if (this.isShuttingDown) return;

      const now = Date.now();
      const dueChecks = Array.from(this.checks.values()).filter(
        (exec) =>
          exec.check.enabled && !exec.isRunning && now >= exec.nextExecution
      );

      // Respect max concurrent checks
      const maxConcurrent = this.config.healthChecks.maxConcurrent;
      const runningCount = Array.from(this.checks.values()).filter(
        (exec) => exec.isRunning
      ).length;
      const availableSlots = maxConcurrent - runningCount;

      const checksToRun = dueChecks.slice(0, availableSlots);

      // Execute checks in parallel
      const checkPromises = checksToRun.map((exec) =>
        this.performHealthCheck(exec).catch((error) => {
          console.error(
            `Health check execution failed: ${exec.check.id}`,
            error
          );
        })
      );

      if (checkPromises.length > 0) {
        await Promise.allSettled(checkPromises);
      }
    }, 1000);
  }

  private startPeriodicCleanup(): void {
    // Cleanup old data every hour
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      for (const tracker of this.components.values()) {
        // Clean up old issue history
        tracker.issueHistory = tracker.issueHistory.filter(
          (issue) => now - issue.timestamp < maxAge
        );
      }
    }, 3600000); // 1 hour
  }
}

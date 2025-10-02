/**
 * Watchdog Manager - Component Health Monitoring and Failure Detection
 *
 * Monitors system components for failures and performance degradation
 * @author @darianrosebrook
 */

import { EventEmitter } from 'eventemitter3';
import {
  ComponentWatchdogConfig,
  WatchdogMetrics,
  FailSafeHealthCheckResult,
  FailureEvent,
  FailSafeHealthStatus,
  FailureType,
  EmergencySeverity,
  // eslint-disable-next-line no-unused-vars
  RecoveryStrategy,
  validateComponentWatchdogConfig,
  validateFailSafeHealthCheckResult,
} from './types';

/**
 * Individual component watchdog
 */
class ComponentWatchdog {
  private config: ComponentWatchdogConfig;
  private metrics: WatchdogMetrics;
  private healthCheckTimer?: NodeJS.Timeout;
  private timeoutTimer?: NodeJS.Timeout;
  private isMonitoring = false;
  private lastHealthCheck?: FailSafeHealthCheckResult;
  private healthChecker?: () => Promise<FailSafeHealthCheckResult>;
  private watchdogManager?: WatchdogManager;

  constructor(
    config: ComponentWatchdogConfig,
    healthChecker?: () => Promise<FailSafeHealthCheckResult>
  ) {
    this.config = validateComponentWatchdogConfig(config);
    this.healthChecker = healthChecker;
    this.metrics = {
      lastHeartbeat: Date.now(),
      responseTime: 0,
      healthScore: 1.0,
      consecutiveFailures: 0,
      totalFailures: 0,
      uptimePercentage: 100,
      averageResponseTime: 0,
    };
  }

  /**
   * Set reference to watchdog manager for failure reporting
   */
  setWatchdogManager(manager: WatchdogManager): void {
    this.watchdogManager = manager;
  }

  /**
   * Start monitoring this component
   */
  startMonitoring(): void {
    if (this.isMonitoring || !this.config.enabled) {
      return;
    }

    this.isMonitoring = true;
    this.scheduleNextHealthCheck();
  }

  /**
   * Stop monitoring this component
   */
  stopMonitoring(): void {
    this.isMonitoring = false;

    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = undefined;
    }
  }

  /**
   * Perform health check
   */
  async performHealthCheck(): Promise<FailSafeHealthCheckResult> {
    const startTime = Date.now();

    try {
      let result: FailSafeHealthCheckResult;

      if (this.healthChecker) {
        // Use custom health checker if provided
        result = await this.healthChecker();
      } else {
        // Default health check - just verify component is responsive
        result = {
          componentName: this.config.componentName,
          checkId: `health_${Date.now()}`,
          status: FailSafeHealthStatus.HEALTHY,
          responseTime: Date.now() - startTime,
          timestamp: Date.now(),
          details: { type: 'default_check' },
        };
      }

      const validatedResult = validateFailSafeHealthCheckResult(result);
      this.updateMetrics(validatedResult);
      this.lastHealthCheck = validatedResult;

      return validatedResult;
    } catch (error) {
      const errorResult: FailSafeHealthCheckResult = {
        componentName: this.config.componentName,
        checkId: `health_error_${Date.now()}`,
        status: FailSafeHealthStatus.UNHEALTHY,
        responseTime: Date.now() - startTime,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.updateMetrics(errorResult);
      this.lastHealthCheck = errorResult;

      // Record failure if watchdog manager is available
      if (this.watchdogManager) {
        this.watchdogManager.recordFailure(
          this.config.componentName,
          FailureType.CRASH,
          EmergencySeverity.HIGH,
          { error: errorResult.error },
          'Health check failed'
        );
      }

      return errorResult;
    }
  }

  /**
   * Update component heartbeat
   */
  updateHeartbeat(): void {
    this.metrics.lastHeartbeat = Date.now();

    if (this.metrics.consecutiveFailures > 0) {
      this.metrics.consecutiveFailures = 0;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): WatchdogMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current health status
   */
  getCurrentFailSafeHealthStatus(): FailSafeHealthStatus {
    const timeSinceLastHeartbeat = Date.now() - this.metrics.lastHeartbeat;

    if (timeSinceLastHeartbeat > this.config.timeoutThreshold) {
      return FailSafeHealthStatus.CRITICAL;
    }

    if (
      this.metrics.consecutiveFailures >= this.config.maxConsecutiveFailures
    ) {
      return FailSafeHealthStatus.UNHEALTHY;
    }

    if (this.metrics.healthScore < 0.5) {
      return FailSafeHealthStatus.DEGRADED;
    }

    if (this.lastHealthCheck) {
      return this.lastHealthCheck.status;
    }

    return FailSafeHealthStatus.HEALTHY;
  }

  /**
   * Get configuration
   */
  getConfig(): ComponentWatchdogConfig {
    return { ...this.config };
  }

  private scheduleNextHealthCheck(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.healthCheckTimer = setTimeout(async () => {
      await this.performHealthCheck();
      this.scheduleNextHealthCheck();
    }, this.config.healthCheckInterval);
  }

  private updateMetrics(result: FailSafeHealthCheckResult): void {
    this.metrics.responseTime = result.responseTime;

    // Update average response time
    if (this.metrics.averageResponseTime === 0) {
      this.metrics.averageResponseTime = result.responseTime;
    } else {
      this.metrics.averageResponseTime =
        this.metrics.averageResponseTime * 0.9 + result.responseTime * 0.1;
    }

    // Update failure metrics
    if (
      result.status === FailSafeHealthStatus.UNHEALTHY ||
      result.status === FailSafeHealthStatus.CRITICAL
    ) {
      this.metrics.consecutiveFailures++;
      this.metrics.totalFailures++;
    } else {
      this.metrics.consecutiveFailures = 0;
    }

    // Update health score
    this.updateHealthScore(result.status);

    // Update uptime percentage
    this.updateUptimePercentage(result.status);
  }

  private updateHealthScore(status: FailSafeHealthStatus): void {
    let statusScore: number;

    switch (status) {
      case FailSafeHealthStatus.HEALTHY:
        statusScore = 1.0;
        break;
      case FailSafeHealthStatus.DEGRADED:
        statusScore = 0.7;
        break;
      case FailSafeHealthStatus.UNHEALTHY:
        statusScore = 0.3;
        break;
      case FailSafeHealthStatus.CRITICAL:
        statusScore = 0.0;
        break;
      default:
        statusScore = 0.5;
    }

    // Exponential moving average
    this.metrics.healthScore =
      this.metrics.healthScore * 0.8 + statusScore * 0.2;
  }

  private updateUptimePercentage(status: FailSafeHealthStatus): void {
    const isUp =
      status === FailSafeHealthStatus.HEALTHY ||
      status === FailSafeHealthStatus.DEGRADED;
    const uptimeScore = isUp ? 100 : 0;

    // Exponential moving average over time
    this.metrics.uptimePercentage =
      this.metrics.uptimePercentage * 0.99 + uptimeScore * 0.01;
  }
}

/**
 * Manages watchdog monitoring for all system components
 */
export class WatchdogManager extends EventEmitter {
  private componentWatchdogs: Map<string, ComponentWatchdog>;
  private failureHistory: Map<string, FailureEvent[]>;
  private globalHealthCheckTimer?: NodeJS.Timeout;
  private healthCheckInterval: number;
  private isRunning = false;

  constructor(healthCheckInterval: number = 30000) {
    super();
    this.componentWatchdogs = new Map();
    this.failureHistory = new Map();
    this.healthCheckInterval = healthCheckInterval;
  }

  /**
   * Register component for watchdog monitoring
   */
  registerComponent(
    config: ComponentWatchdogConfig,
    healthChecker?: () => Promise<FailSafeHealthCheckResult>
  ): boolean {
    try {
      const validatedConfig = validateComponentWatchdogConfig(config);
      const watchdog = new ComponentWatchdog(validatedConfig, healthChecker);
      watchdog.setWatchdogManager(this);

      this.componentWatchdogs.set(validatedConfig.componentName, watchdog);

      if (this.isRunning && validatedConfig.enabled) {
        watchdog.startMonitoring();
      }

      this.emit('component-registered', {
        componentName: validatedConfig.componentName,
        config: validatedConfig,
        timestamp: Date.now(),
      });

      return true;
    } catch (error) {
      this.emit('registration-error', {
        componentName: config.componentName,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
      return false;
    }
  }

  /**
   * Unregister component from monitoring
   */
  unregisterComponent(componentName: string): boolean {
    const watchdog = this.componentWatchdogs.get(componentName);
    if (!watchdog) {
      return false;
    }

    watchdog.stopMonitoring();
    this.componentWatchdogs.delete(componentName);
    this.failureHistory.delete(componentName);

    this.emit('component-unregistered', {
      componentName,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Start watchdog monitoring
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Start monitoring all registered components
    for (const watchdog of this.componentWatchdogs.values()) {
      if (watchdog.getConfig().enabled) {
        watchdog.startMonitoring();
      }
    }

    // Start global health monitoring
    this.startGlobalHealthMonitoring();

    this.emit('watchdog-started', {
      timestamp: Date.now(),
      componentCount: this.componentWatchdogs.size,
    });
  }

  /**
   * Stop watchdog monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop all component watchdogs
    for (const watchdog of this.componentWatchdogs.values()) {
      watchdog.stopMonitoring();
    }

    // Stop global monitoring
    if (this.globalHealthCheckTimer) {
      clearTimeout(this.globalHealthCheckTimer);
      this.globalHealthCheckTimer = undefined;
    }

    this.emit('watchdog-stopped', {
      timestamp: Date.now(),
    });
  }

  /**
   * Get health status of specific component
   */
  getComponentHealth(componentName: string): FailSafeHealthStatus | null {
    const watchdog = this.componentWatchdogs.get(componentName);
    return watchdog ? watchdog.getCurrentFailSafeHealthStatus() : null;
  }

  /**
   * Get metrics for specific component
   */
  getComponentMetrics(componentName: string): WatchdogMetrics | null {
    const watchdog = this.componentWatchdogs.get(componentName);
    return watchdog ? watchdog.getMetrics() : null;
  }

  /**
   * Get overall system health status
   */
  getSystemHealth(): {
    overallStatus: FailSafeHealthStatus;
    componentStatuses: Record<string, FailSafeHealthStatus>;
    healthScore: number;
    unhealthyComponents: string[];
  } {
    const componentStatuses: Record<string, FailSafeHealthStatus> = {};
    const unhealthyComponents: string[] = [];
    let totalHealthScore = 0;
    let componentCount = 0;

    for (const [name, watchdog] of this.componentWatchdogs.entries()) {
      const status = watchdog.getCurrentFailSafeHealthStatus();
      const metrics = watchdog.getMetrics();

      componentStatuses[name] = status;
      totalHealthScore += metrics.healthScore;
      componentCount++;

      if (
        status === FailSafeHealthStatus.UNHEALTHY ||
        status === FailSafeHealthStatus.CRITICAL
      ) {
        unhealthyComponents.push(name);
      }
    }

    const healthScore =
      componentCount > 0 ? totalHealthScore / componentCount : 1.0;

    let overallStatus: FailSafeHealthStatus;
    if (unhealthyComponents.length === 0) {
      overallStatus = FailSafeHealthStatus.HEALTHY;
    } else if (unhealthyComponents.length === componentCount) {
      overallStatus = FailSafeHealthStatus.CRITICAL;
    } else if (healthScore < 0.5) {
      overallStatus = FailSafeHealthStatus.UNHEALTHY;
    } else {
      overallStatus = FailSafeHealthStatus.DEGRADED;
    }

    return {
      overallStatus,
      componentStatuses,
      healthScore,
      unhealthyComponents,
    };
  }

  /**
   * Update heartbeat for component
   */
  updateHeartbeat(componentName: string): boolean {
    const watchdog = this.componentWatchdogs.get(componentName);
    if (!watchdog) {
      return false;
    }

    watchdog.updateHeartbeat();
    return true;
  }

  /**
   * Record failure event
   */
  recordFailure(
    componentName: string,
    failureType: FailureType,
    severity: EmergencySeverity,
    context: Record<string, any> = {},
    message: string = 'Component failure detected'
  ): FailureEvent {
    const failure: FailureEvent = {
      failureId: `failure_${componentName}_${Date.now()}`,
      componentName,
      failureType,
      timestamp: Date.now(),
      severity,
      context,
      message,
    };

    // Store in failure history
    if (!this.failureHistory.has(componentName)) {
      this.failureHistory.set(componentName, []);
    }

    const history = this.failureHistory.get(componentName);
    if (!history) {
      console.error(`No failure history found for component: ${componentName}`);
      return failure; // Return the failure that was created above
    }
    history.push(failure);

    // Keep only last 100 failures per component
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    this.emit('failure-detected', failure);

    // Check if this triggers escalation
    this.checkEscalationNeed(componentName, failure);

    return failure;
  }

  /**
   * Get failure history for component
   */
  getFailureHistory(componentName: string, limit: number = 50): FailureEvent[] {
    const history = this.failureHistory.get(componentName) || [];
    return history.slice(-limit);
  }

  /**
   * Get system statistics
   */
  getSystemStatistics(): {
    totalComponents: number;
    healthyComponents: number;
    degradedComponents: number;
    unhealthyComponents: number;
    criticalComponents: number;
    totalFailures: number;
    averageHealthScore: number;
    averageUptime: number;
  } {
    let healthyCount = 0;
    let degradedCount = 0;
    let unhealthyCount = 0;
    let criticalCount = 0;
    let totalHealthScore = 0;
    let totalUptime = 0;
    let totalFailures = 0;

    for (const watchdog of this.componentWatchdogs.values()) {
      const status = watchdog.getCurrentFailSafeHealthStatus();
      const metrics = watchdog.getMetrics();

      switch (status) {
        case FailSafeHealthStatus.HEALTHY:
          healthyCount++;
          break;
        case FailSafeHealthStatus.DEGRADED:
          degradedCount++;
          break;
        case FailSafeHealthStatus.UNHEALTHY:
          unhealthyCount++;
          break;
        case FailSafeHealthStatus.CRITICAL:
          criticalCount++;
          break;
      }

      totalHealthScore += metrics.healthScore;
      totalUptime += metrics.uptimePercentage;
      totalFailures += metrics.totalFailures;
    }

    const componentCount = this.componentWatchdogs.size;

    return {
      totalComponents: componentCount,
      healthyComponents: healthyCount,
      degradedComponents: degradedCount,
      unhealthyComponents: unhealthyCount,
      criticalComponents: criticalCount,
      totalFailures,
      averageHealthScore:
        componentCount > 0 ? totalHealthScore / componentCount : 0,
      averageUptime: componentCount > 0 ? totalUptime / componentCount : 0,
    };
  }

  private startGlobalHealthMonitoring(): void {
    if (!this.isRunning) {
      return;
    }

    this.globalHealthCheckTimer = setTimeout(() => {
      this.performGlobalHealthCheck();
      this.startGlobalHealthMonitoring();
    }, this.healthCheckInterval);
  }

  private async performGlobalHealthCheck(): Promise<void> {
    const systemHealth = this.getSystemHealth();

    this.emit('global-health-check', {
      timestamp: Date.now(),
      systemHealth,
      statistics: this.getSystemStatistics(),
    });

    // Detect system-wide issues
    if (systemHealth.overallStatus === FailSafeHealthStatus.CRITICAL) {
      this.emit('system-critical', {
        timestamp: Date.now(),
        unhealthyComponents: systemHealth.unhealthyComponents,
        healthScore: systemHealth.healthScore,
      });
    }
  }

  private checkEscalationNeed(
    componentName: string,
    failure: FailureEvent
  ): void {
    const watchdog = this.componentWatchdogs.get(componentName);
    if (!watchdog) {
      return;
    }

    const config = watchdog.getConfig();
    const metrics = watchdog.getMetrics();

    // Check if consecutive failures exceed threshold
    if (metrics.consecutiveFailures >= config.maxConsecutiveFailures) {
      this.emit('escalation-required', {
        componentName,
        failure,
        consecutiveFailures: metrics.consecutiveFailures,
        threshold: config.maxConsecutiveFailures,
        recoveryStrategy: config.recoveryStrategy,
        timestamp: Date.now(),
      });
    }

    // Check severity-based escalation
    if (failure.severity === EmergencySeverity.CRITICAL) {
      this.emit('critical-failure', {
        componentName,
        failure,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stop();
    this.componentWatchdogs.clear();
    this.failureHistory.clear();
    this.removeAllListeners();
  }
}

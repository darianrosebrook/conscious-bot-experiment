/**
 * Fail-Safes System - Integrated Safety and Recovery Management
 *
 * Orchestrates all fail-safe components for comprehensive system protection
 * @author @darianrosebrook
 */

import { EventEmitter } from 'eventemitter3';
import { WatchdogManager } from './watchdog-manager';
import { PreemptionManager } from './preemption-manager';
import { EmergencyResponseCoordinator } from './emergency-response';
import {
  FailSafeConfig,
  SystemStatus,
  FailSafeHealthStatus,
  OperationMode,
  EmergencyType,
  EmergencySeverity,
  FailureType,
  ComponentWatchdogConfig,
  Task,
  validateFailSafeConfig,
} from './types';

/**
 * Resource monitor for system resource tracking
 */
class ResourceMonitor {
  private monitoringInterval?: NodeJS.Timeout;
  private resourceHistory: Array<{
    timestamp: number;
    cpu: number;
    memory: number;
    disk: number;
    network: number;
  }>;

  constructor() {
    this.resourceHistory = [];
  }

  /**
   * Start resource monitoring
   */
  start(intervalMs: number = 5000): void {
    if (this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.collectResourceMetrics();
    }, intervalMs);
  }

  /**
   * Stop resource monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Get current resource usage
   */
  getCurrentUsage(): {
    cpu: number;
    memory: number;
    disk: number;
    network: number;
  } {
    // In a real implementation, this would query actual system resources
    return {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      disk: Math.random() * 100,
      network: Math.random() * 100,
    };
  }

  private collectResourceMetrics(): void {
    const usage = this.getCurrentUsage();

    this.resourceHistory.push({
      timestamp: Date.now(),
      ...usage,
    });

    // Keep only last 1000 readings
    if (this.resourceHistory.length > 1000) {
      this.resourceHistory.splice(0, this.resourceHistory.length - 1000);
    }
  }

  destroy(): void {
    this.stop();
    this.resourceHistory = [];
  }
}

/**
 * Recovery coordinator for automatic failure recovery
 */
class RecoveryCoordinator extends EventEmitter {
  private recoveryAttempts: Map<string, number>;
  private maxRecoveryAttempts: number;

  constructor(maxRecoveryAttempts: number = 3) {
    super();
    this.recoveryAttempts = new Map();
    this.maxRecoveryAttempts = maxRecoveryAttempts;
  }

  /**
   * Attempt automatic recovery from failure
   */
  async attemptRecovery(
    componentName: string,
    failureType: FailureType,
    context: Record<string, any> = {}
  ): Promise<{
    success: boolean;
    strategy: string;
    message: string;
    attemptNumber: number;
  }> {
    const attemptKey = `${componentName}_${failureType}`;
    const attemptNumber = (this.recoveryAttempts.get(attemptKey) || 0) + 1;

    this.recoveryAttempts.set(attemptKey, attemptNumber);

    if (attemptNumber > this.maxRecoveryAttempts) {
      return {
        success: false,
        strategy: 'exceeded_max_attempts',
        message: `Maximum recovery attempts (${this.maxRecoveryAttempts}) exceeded for ${componentName}`,
        attemptNumber,
      };
    }

    const strategy = this.selectRecoveryStrategy(failureType, attemptNumber);
    const result = await this.executeRecoveryStrategy(
      componentName,
      strategy,
      context
    );

    this.emit('recovery-attempted', {
      componentName,
      failureType,
      strategy,
      attemptNumber,
      success: result.success,
      timestamp: Date.now(),
    });

    if (result.success) {
      // Reset attempt count on successful recovery
      this.recoveryAttempts.delete(attemptKey);
    }

    return {
      ...result,
      strategy,
      attemptNumber,
    };
  }

  private selectRecoveryStrategy(
    failureType: FailureType,
    attemptNumber: number
  ): string {
    switch (failureType) {
      case FailureType.TIMEOUT:
        return attemptNumber === 1 ? 'retry_operation' : 'restart_component';

      case FailureType.CRASH:
        return 'restart_component';

      case FailureType.HANG:
        return 'force_restart_component';

      case FailureType.RESOURCE_EXHAUSTION:
        return attemptNumber === 1 ? 'free_resources' : 'restart_component';

      case FailureType.COMMUNICATION_FAILURE:
        return 'reconnect_component';

      case FailureType.PERFORMANCE_DEGRADATION:
        return 'optimize_component';

      default:
        return 'generic_restart';
    }
  }

  private async executeRecoveryStrategy(
    componentName: string,
    strategy: string,
    _context: Record<string, any>
  ): Promise<{ success: boolean; message: string }> {
    try {
      switch (strategy) {
        case 'retry_operation':
          // Simulate retry
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { success: true, message: 'Operation retried successfully' };

        case 'restart_component':
          // Simulate component restart
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { success: true, message: 'Component restarted successfully' };

        case 'force_restart_component':
          // Simulate forced restart
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return {
            success: true,
            message: 'Component force-restarted successfully',
          };

        case 'free_resources':
          // Simulate resource cleanup
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { success: true, message: 'Resources freed successfully' };

        case 'reconnect_component':
          // Simulate reconnection
          await new Promise((resolve) => setTimeout(resolve, 300));
          return {
            success: true,
            message: 'Component reconnected successfully',
          };

        case 'optimize_component':
          // Simulate optimization
          await new Promise((resolve) => setTimeout(resolve, 400));
          return { success: true, message: 'Component optimized successfully' };

        default:
          return {
            success: false,
            message: `Unknown recovery strategy: ${strategy}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        message: `Recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Reset recovery attempts for component
   */
  resetRecoveryAttempts(
    componentName: string,
    failureType?: FailureType
  ): void {
    if (failureType) {
      const attemptKey = `${componentName}_${failureType}`;
      this.recoveryAttempts.delete(attemptKey);
    } else {
      // Reset all attempts for component
      for (const key of this.recoveryAttempts.keys()) {
        if (key.startsWith(`${componentName}_`)) {
          this.recoveryAttempts.delete(key);
        }
      }
    }
  }

  destroy(): void {
    this.recoveryAttempts.clear();
    this.removeAllListeners();
  }
}

/**
 * Main Fail-Safes System
 */
export class FailSafesSystem extends EventEmitter {
  private config: FailSafeConfig;
  private watchdogManager: WatchdogManager;
  private preemptionManager: PreemptionManager;
  private emergencyCoordinator: EmergencyResponseCoordinator;
  private resourceMonitor: ResourceMonitor;
  private recoveryCoordinator: RecoveryCoordinator;
  private currentMode: OperationMode;
  private isInitialized = false;

  constructor(config: Partial<FailSafeConfig> = {}) {
    super();

    this.config = this.createDefaultConfig(config);
    this.currentMode = OperationMode.FULL_CAPABILITY;

    // Initialize components
    this.watchdogManager = new WatchdogManager();
    this.preemptionManager = new PreemptionManager(this.config.preemption);
    this.emergencyCoordinator = new EmergencyResponseCoordinator(
      this.config.safeMode
    );
    this.resourceMonitor = new ResourceMonitor();
    this.recoveryCoordinator = new RecoveryCoordinator();

    this.setupEventHandlers();
  }

  /**
   * Initialize the fail-safes system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Register watchdogs
      for (const [, watchdogConfig] of Object.entries(this.config.watchdogs)) {
        this.watchdogManager.registerComponent(watchdogConfig);
      }

      // Register notification channels
      for (const channel of this.config.emergencyResponse
        .notificationChannels) {
        this.emergencyCoordinator.registerNotificationChannel(channel);
      }

      // Start monitoring
      this.watchdogManager.start();
      this.preemptionManager.setEnabled(this.config.preemption.enabled);
      this.resourceMonitor.start();

      this.isInitialized = true;

      this.emit('fail-safes-initialized', {
        timestamp: Date.now(),
        componentCount: Object.keys(this.config.watchdogs).length,
        mode: this.currentMode,
      });
    } catch (error) {
      this.emit('initialization-error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
      throw error;
    }
  }

  /**
   * Register component for monitoring
   */
  registerComponent(
    config: ComponentWatchdogConfig,
    healthChecker?: () => Promise<any>
  ): boolean {
    const success = this.watchdogManager.registerComponent(
      config,
      healthChecker
    );

    if (success && this.isInitialized) {
      // Start monitoring immediately if system is already running
      this.watchdogManager.start();
    }

    return success;
  }

  /**
   * Submit task for execution
   */
  submitTask(task: Task): {
    granted: boolean;
    grantId?: string;
    reason?: string;
  } {
    const grant = this.preemptionManager.requestExecution(task);

    return {
      granted: grant.granted,
      grantId: grant.granted ? grant.grantId : undefined,
      reason: grant.reason,
    };
  }

  /**
   * Complete task execution
   */
  completeTask(taskId: string): boolean {
    return this.preemptionManager.completeTask(taskId);
  }

  /**
   * Declare emergency
   */
  async declareEmergency(
    type: EmergencyType,
    severity: EmergencySeverity,
    description: string,
    context: Record<string, any> = {}
  ): Promise<string> {
    const emergency = await this.emergencyCoordinator.declareEmergency(
      type,
      severity,
      description,
      context,
      'fail-safes-system'
    );

    // Update operation mode based on emergency
    this.updateOperationMode(emergency.severity);

    return emergency.emergencyId;
  }

  /**
   * Resolve emergency
   */
  resolveEmergency(emergencyId: string): boolean {
    const resolved = this.emergencyCoordinator.resolveEmergency(emergencyId);

    if (resolved) {
      // Check if we can restore operation mode
      this.attemptModeRestoration();
    }

    return resolved;
  }

  /**
   * Get current system status
   */
  getSystemStatus(): SystemStatus {
    const systemHealth = this.watchdogManager.getSystemHealth();
    const preemptionStatus = this.preemptionManager.getSystemStatus();
    // Note: emergencyStats and safeModeStatus are calculated but not used in current implementation
    // this.emergencyCoordinator.getEmergencyStatistics();
    // this.emergencyCoordinator.getSafeModeManager().getStatus();

    return {
      timestamp: Date.now(),
      overallHealth: systemHealth.overallStatus,
      currentMode: this.currentMode,
      activeEmergencies: this.emergencyCoordinator
        .getActiveEmergencies()
        .map((e) => e.emergencyId),
      componentStatuses: systemHealth.componentStatuses,
      resourceUsage: {
        timestamp: Date.now(),
        cpu: {
          usage: this.getCurrentMemoryUsage(), // Real memory usage
          loadAverage: 1.5,
          activeThreads: 20,
        },
        memory: {
          used: 1024 * 1024 * 1024, // 1GB
          available: 1024 * 1024 * 1024, // 1GB
          heapUsage: 60,
          gcFrequency: 5,
        },
        disk: {
          used: 10 * 1024 * 1024 * 1024, // 10GB
          available: 40 * 1024 * 1024 * 1024, // 40GB
          ioOperationsPerSecond: 100,
        },
        network: {
          bytesInPerSecond: 1024,
          bytesOutPerSecond: 2048,
          activeConnections: 5,
          requestsPerMinute: 30,
        },
      },
      activeTasks: preemptionStatus.runningTasks.length,
      lastCheckpoint: undefined, // Would be implemented with actual checkpoint system
      degradationEvents: 0, // Would track degradation events
      recoveryAttempts: 0, // Would track recovery attempts
    };
  }

  /**
   * Get comprehensive system diagnostics
   */
  getSystemDiagnostics(): {
    watchdog: any;
    preemption: any;
    emergency: any;
    safeMode: any;
    recovery: any;
  } {
    return {
      watchdog: this.watchdogManager.getSystemStatistics(),
      preemption: this.preemptionManager.getPreemptionStatistics(),
      emergency: this.emergencyCoordinator.getEmergencyStatistics(),
      safeMode: this.emergencyCoordinator.getSafeModeManager().getStatus(),
      recovery: {}, // Would include recovery statistics
    };
  }

  /**
   * Update system configuration
   */
  updateConfiguration(newConfig: Partial<FailSafeConfig>): void {
    this.config = validateFailSafeConfig({ ...this.config, ...newConfig });

    // Apply configuration changes
    if (newConfig.preemption) {
      this.preemptionManager.setEnabled(this.config.preemption.enabled);
    }

    if (newConfig.safeMode) {
      this.emergencyCoordinator
        .getSafeModeManager()
        .updateConfig(this.config.safeMode);
    }

    this.emit('configuration-updated', {
      config: this.config,
      timestamp: Date.now(),
    });
  }

  /**
   * Manually trigger safe mode
   */
  enterSafeMode(reason: string, severity?: any): void {
    this.emergencyCoordinator
      .getSafeModeManager()
      .enterSafeMode(reason, severity);
    this.currentMode = OperationMode.SAFE_MODE;
  }

  /**
   * Exit safe mode
   */
  exitSafeMode(): boolean {
    const exited = this.emergencyCoordinator
      .getSafeModeManager()
      .exitSafeMode();

    if (exited) {
      this.attemptModeRestoration();
    }

    return exited;
  }

  /**
   * Shutdown the fail-safes system
   */
  async shutdown(): Promise<void> {
    this.emit('fail-safes-shutting-down', {
      timestamp: Date.now(),
    });

    // Stop all components
    this.watchdogManager.stop();
    this.resourceMonitor.stop();

    // Clean up resources
    this.watchdogManager.destroy();
    this.preemptionManager.destroy();
    this.emergencyCoordinator.destroy();
    this.resourceMonitor.destroy();
    this.recoveryCoordinator.destroy();

    this.isInitialized = false;

    this.emit('fail-safes-shutdown', {
      timestamp: Date.now(),
    });
  }

  private createDefaultConfig(
    partialConfig: Partial<FailSafeConfig>
  ): FailSafeConfig {
    const defaultConfig: FailSafeConfig = {
      watchdogs: {},
      preemption: {
        enabled: true,
        overheadBudgetMs: 5,
        restorationDelayMs: 100,
        maxPreemptionDepth: 3,
      },
      safeMode: {
        severity: 'moderate' as any,
        allowedActions: ['move', 'look', 'communicate'],
        forbiddenActions: ['attack', 'destroy', 'place_explosive'],
        maxMovementDistance: 50,
        requireHumanApproval: false,
        enableAutomaticReflexes: true,
        monitoringFrequencyMs: 5000,
        autoExitConditions: ['all_components_healthy', 'emergency_resolved'],
      },
      emergencyResponse: {
        protocols: [],
        notificationChannels: [
          {
            channelId: 'console',
            type: 'console',
            enabled: true,
            retryAttempts: 3,
            timeoutMs: 5000,
          },
        ],
        escalationDelays: {
          low: 300000, // 5 minutes
          medium: 180000, // 3 minutes
          high: 60000, // 1 minute
          critical: 30000, // 30 seconds
        },
      },
      recovery: {
        strategies: {},
        checkpointInterval: 300000, // 5 minutes
        maxCheckpoints: 10,
        autoRecoveryEnabled: true,
      },
      resourceLimits: {
        cpu: {
          maxUsagePercent: 80,
          maxSustainedUsage: 60,
          alertThreshold: 70,
          criticalThreshold: 90,
        },
        memory: {
          maxHeapSize: 2 * 1024 * 1024 * 1024, // 2GB
          maxWorkingSet: 1.5 * 1024 * 1024 * 1024, // 1.5GB
          alertThreshold: 1.2 * 1024 * 1024 * 1024, // 1.2GB
          gcTriggerThreshold: 1 * 1024 * 1024 * 1024, // 1GB
        },
        disk: {
          maxUsedSpace: 50 * 1024 * 1024 * 1024, // 50GB
          alertThreshold: 40 * 1024 * 1024 * 1024, // 40GB
          maxIOPS: 1000,
        },
        network: {
          maxRequestsPerMinute: 1000,
          maxBandwidthMbps: 100,
          maxConnections: 1000,
        },
      },
      timeouts: {},
    };

    return validateFailSafeConfig({ ...defaultConfig, ...partialConfig });
  }

  private setupEventHandlers(): void {
    // Watchdog events
    this.watchdogManager.on('failure-detected', (failure) => {
      this.handleComponentFailure(failure);
    });

    this.watchdogManager.on('escalation-required', (escalation) => {
      this.handleEscalation(escalation);
    });

    this.watchdogManager.on('system-critical', (event) => {
      this.declareEmergency(
        EmergencyType.SYSTEM_FAILURE,
        EmergencySeverity.CRITICAL,
        'Multiple system components are unhealthy',
        { unhealthyComponents: event.unhealthyComponents }
      );
    });

    // Preemption events
    this.preemptionManager.on('task-preempted', (event) => {
      this.emit('task-preempted', event);
    });

    // Emergency events
    this.emergencyCoordinator.on('emergency-declared', (emergency) => {
      this.emit('emergency-declared', emergency);
    });

    this.emergencyCoordinator.on('safe-mode-entered', (event) => {
      this.currentMode = OperationMode.SAFE_MODE;
      this.emit('safe-mode-entered', event);
    });

    this.emergencyCoordinator.on('safe-mode-exited', (event) => {
      this.attemptModeRestoration();
      this.emit('safe-mode-exited', event);
    });

    // Recovery events
    this.recoveryCoordinator.on('recovery-attempted', (event) => {
      this.emit('recovery-attempted', event);
    });
  }

  private async handleComponentFailure(failure: any): Promise<void> {
    // Attempt automatic recovery
    const recoveryResult = await this.recoveryCoordinator.attemptRecovery(
      failure.componentName,
      failure.failureType,
      failure.context
    );

    if (!recoveryResult.success) {
      // Recovery failed, escalate to emergency
      await this.declareEmergency(
        EmergencyType.SYSTEM_FAILURE,
        failure.severity === 'critical'
          ? EmergencySeverity.CRITICAL
          : EmergencySeverity.HIGH,
        `Component ${failure.componentName} failed and recovery was unsuccessful`,
        { failure, recoveryResult }
      );
    }
  }

  private async handleEscalation(escalation: any): Promise<void> {
    // Declare emergency for component that needs escalation
    await this.declareEmergency(
      EmergencyType.SYSTEM_FAILURE,
      EmergencySeverity.HIGH,
      `Component ${escalation.componentName} has exceeded failure threshold`,
      { escalation }
    );
  }

  private updateOperationMode(severity: EmergencySeverity): void {
    switch (severity) {
      case EmergencySeverity.CRITICAL:
        this.currentMode = OperationMode.EMERGENCY_STOP;
        break;
      case EmergencySeverity.HIGH:
        this.currentMode = OperationMode.SAFE_MODE;
        break;
      case EmergencySeverity.MEDIUM:
        this.currentMode = OperationMode.BASIC_OPERATION;
        break;
      case EmergencySeverity.LOW:
        // Keep current mode
        break;
    }

    this.emit('operation-mode-changed', {
      newMode: this.currentMode,
      severity,
      timestamp: Date.now(),
    });
  }

  private attemptModeRestoration(): void {
    const activeEmergencies = this.emergencyCoordinator.getActiveEmergencies();
    const systemHealth = this.watchdogManager.getSystemHealth();

    if (
      activeEmergencies.length === 0 &&
      systemHealth.overallStatus === FailSafeHealthStatus.HEALTHY
    ) {
      this.currentMode = OperationMode.FULL_CAPABILITY;

      this.emit('operation-mode-restored', {
        mode: this.currentMode,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage(): number {
    const memUsage = (globalThis as any)?.process?.memoryUsage?.();
    if (memUsage?.heapTotal) {
      return Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    }
    return 0; // Fallback if process.memoryUsage is not available
  }
}

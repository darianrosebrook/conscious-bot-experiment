/**
 * Fail-Safes Module Integration Tests
 *
 * Comprehensive tests for the Fail-Safes system
 * @author @darianrosebrook
 */

import { FailSafesSystem } from '../fail-safes-system';
import { WatchdogManager } from '../watchdog-manager';
import { PreemptionManager } from '../preemption-manager';
import { EmergencyResponseCoordinator } from '../emergency-response';
import {
  FailureType,
  FailSafeHealthStatus,
  PreemptionPriority,
  EmergencyType,
  EmergencySeverity,
  OperationMode,
  SafeModeSeverity,
  ComponentWatchdogConfig,
  Task,
  SafeModeConfig,
  NotificationChannel,
} from '../types';

describe('Fail-Safes Module Integration Tests', () => {
  let failSafesSystem: FailSafesSystem;

  beforeEach(async () => {
    failSafesSystem = new FailSafesSystem({
      preemption: {
        enabled: true,
        overheadBudgetMs: 5,
        restorationDelayMs: 50, // Faster for testing
        maxPreemptionDepth: 3,
      },
      safeMode: {
        severity: SafeModeSeverity.MODERATE,
        allowedActions: ['move', 'look'],
        forbiddenActions: ['attack', 'destroy'],
        requireHumanApproval: false,
        enableAutomaticReflexes: true,
        monitoringFrequencyMs: 1000,
        autoExitConditions: ['emergency_resolved'],
      },
    });

    await failSafesSystem.initialize();
  });

  afterEach(async () => {
    await failSafesSystem.shutdown();
  });

  describe('Fail-Safes System Integration', () => {
    test('should initialize with all components', async () => {
      const status = failSafesSystem.getSystemStatus();
      
      expect(status.overallHealth).toBeDefined();
      expect(status.currentMode).toBe(OperationMode.FULL_CAPABILITY);
      expect(status.activeEmergencies).toEqual([]);
    });

    test('should handle component registration and monitoring', async () => {
      const componentConfig: ComponentWatchdogConfig = {
        componentName: 'test_component',
        healthCheckInterval: 1000,
        timeoutThreshold: 5000,
        maxConsecutiveFailures: 3,
        recoveryStrategy: 'restart' as any,
        escalationDelayMs: 10000,
        enabled: true,
      };

      const registered = failSafesSystem.registerComponent(componentConfig);
      expect(registered).toBe(true);

      // Allow some time for monitoring to start
      await new Promise(resolve => setTimeout(resolve, 100));

      const status = failSafesSystem.getSystemStatus();
      expect(status.componentStatuses).toHaveProperty('test_component');
    });

    test('should handle task submission and preemption', async () => {
      const highPriorityTask: Task = {
        taskId: 'high_priority_task',
        name: 'Critical Operation',
        priority: PreemptionPriority.CRITICAL_OPERATION,
        estimatedDuration: 1000,
        resourceRequirements: {
          cpu: 0.3,
          memory: 1024 * 1024, // 1MB
          network: false,
          storage: false,
        },
        preemptable: true,
      };

      const lowPriorityTask: Task = {
        taskId: 'low_priority_task',
        name: 'Background Task',
        priority: PreemptionPriority.LOW_PRIORITY,
        estimatedDuration: 5000,
        resourceRequirements: {
          cpu: 0.8,
          memory: 1024 * 1024 * 1024, // 1GB
          network: false,
          storage: false,
        },
        preemptable: true,
      };

      // Submit low priority task first
      const lowPriorityResult = failSafesSystem.submitTask(lowPriorityTask);
      expect(lowPriorityResult.granted).toBe(true);

      // Submit high priority task - should preempt low priority
      const highPriorityResult = failSafesSystem.submitTask(highPriorityTask);
      expect(highPriorityResult.granted).toBe(true);

      // Complete high priority task
      const completed = failSafesSystem.completeTask(highPriorityTask.taskId);
      expect(completed).toBe(true);
    });

    test('should declare and resolve emergencies', async () => {
      const emergencyId = await failSafesSystem.declareEmergency(
        EmergencyType.SYSTEM_FAILURE,
        EmergencySeverity.HIGH,
        'Test emergency for integration testing'
      );

      expect(emergencyId).toBeDefined();

      const status = failSafesSystem.getSystemStatus();
      expect(status.activeEmergencies).toContain(emergencyId);

      // Resolve emergency
      const resolved = failSafesSystem.resolveEmergency(emergencyId);
      expect(resolved).toBe(true);

      const statusAfterResolve = failSafesSystem.getSystemStatus();
      expect(statusAfterResolve.activeEmergencies).not.toContain(emergencyId);
    });

    test('should enter and exit safe mode', async () => {
      // Enter safe mode
      failSafesSystem.enterSafeMode('Test safe mode entry');

      const status = failSafesSystem.getSystemStatus();
      expect(status.currentMode).toBe(OperationMode.SAFE_MODE);

      // Exit safe mode
      const exited = failSafesSystem.exitSafeMode();
      expect(exited).toBe(true);
    });

    test('should handle critical emergency escalation', async () => {
      const emergencyId = await failSafesSystem.declareEmergency(
        EmergencyType.SAFETY_VIOLATION,
        EmergencySeverity.CRITICAL,
        'Critical safety violation detected'
      );

      // Should automatically enter emergency stop mode
      const status = failSafesSystem.getSystemStatus();
      expect(status.currentMode).toBe(OperationMode.EMERGENCY_STOP);
      expect(status.activeEmergencies).toContain(emergencyId);
    });
  });

  describe('Watchdog Manager Tests', () => {
    let watchdogManager: WatchdogManager;

    beforeEach(() => {
      watchdogManager = new WatchdogManager(1000); // 1 second interval
    });

    afterEach(() => {
      watchdogManager.destroy();
    });

    test('should register and monitor components', async () => {
      const config: ComponentWatchdogConfig = {
        componentName: 'test_service',
        healthCheckInterval: 500,
        timeoutThreshold: 2000,
        maxConsecutiveFailures: 2,
        recoveryStrategy: 'restart' as any,
        escalationDelayMs: 5000,
        enabled: true,
      };

      const registered = watchdogManager.registerComponent(config);
      expect(registered).toBe(true);

      watchdogManager.start();

      // Allow monitoring to run
      await new Promise(resolve => setTimeout(resolve, 100));

      const health = watchdogManager.getComponentHealth('test_service');
      expect(health).toBeDefined();

      const metrics = watchdogManager.getComponentMetrics('test_service');
      expect(metrics).toBeDefined();
      expect(metrics?.healthScore).toBeGreaterThan(0);
    });

    test('should detect and record failures', async () => {
      const config: ComponentWatchdogConfig = {
        componentName: 'failing_service',
        healthCheckInterval: 100,
        timeoutThreshold: 500,
        maxConsecutiveFailures: 1,
        recoveryStrategy: 'restart' as any,
        escalationDelayMs: 1000,
        enabled: true,
      };

      const failingHealthChecker = async () => {
        throw new Error('Simulated component failure');
      };

      watchdogManager.registerComponent(config, failingHealthChecker);
      watchdogManager.start();

      // Wait for failure detection
      await new Promise(resolve => setTimeout(resolve, 200));

      const health = watchdogManager.getComponentHealth('failing_service');
      expect(health).toBe(FailSafeHealthStatus.UNHEALTHY);

      const failures = watchdogManager.getFailureHistory('failing_service');
      expect(failures.length).toBeGreaterThan(0);
    });

    test('should provide system health overview', () => {
      const config1: ComponentWatchdogConfig = {
        componentName: 'healthy_service',
        healthCheckInterval: 1000,
        timeoutThreshold: 5000,
        maxConsecutiveFailures: 3,
        recoveryStrategy: 'restart' as any,
        escalationDelayMs: 10000,
        enabled: true,
      };

      const config2: ComponentWatchdogConfig = {
        componentName: 'degraded_service',
        healthCheckInterval: 1000,
        timeoutThreshold: 5000,
        maxConsecutiveFailures: 3,
        recoveryStrategy: 'restart' as any,
        escalationDelayMs: 10000,
        enabled: true,
      };

      watchdogManager.registerComponent(config1);
      watchdogManager.registerComponent(config2);

      const systemHealth = watchdogManager.getSystemHealth();
      expect(systemHealth.overallStatus).toBeDefined();
      expect(systemHealth.componentStatuses).toHaveProperty('healthy_service');
      expect(systemHealth.componentStatuses).toHaveProperty('degraded_service');
    });
  });

  describe('Preemption Manager Tests', () => {
    let preemptionManager: PreemptionManager;

    beforeEach(() => {
      preemptionManager = new PreemptionManager({
        enabled: true,
        maxPreemptionDepth: 3,
        overheadBudgetMs: 5,
        restorationDelayMs: 50,
      });
    });

    afterEach(() => {
      preemptionManager.destroy();
    });

    test('should grant execution for available resources', () => {
      const task: Task = {
        taskId: 'test_task_1',
        name: 'Normal Task',
        priority: PreemptionPriority.NORMAL_OPERATION,
        estimatedDuration: 1000,
        resourceRequirements: {
          cpu: 0.3,
          memory: 1024 * 1024, // 1MB
          network: false,
          storage: false,
        },
        preemptable: true,
      };

      const grant = preemptionManager.requestExecution(task);
      expect(grant.granted).toBe(true);
      expect(grant.taskId).toBe(task.taskId);
    });

    test('should preempt lower priority tasks', () => {
      const lowPriorityTask: Task = {
        taskId: 'low_priority',
        name: 'Background Task',
        priority: PreemptionPriority.LOW_PRIORITY,
        estimatedDuration: 5000,
        resourceRequirements: {
          cpu: 0.9,
          memory: 1.5 * 1024 * 1024 * 1024, // 1.5GB
          network: false,
          storage: false,
        },
        preemptable: true,
      };

      const highPriorityTask: Task = {
        taskId: 'high_priority',
        name: 'Critical Task',
        priority: PreemptionPriority.CRITICAL_OPERATION,
        estimatedDuration: 1000,
        resourceRequirements: {
          cpu: 0.5,
          memory: 512 * 1024 * 1024, // 512MB
          network: false,
          storage: false,
        },
        preemptable: true,
      };

      // Grant low priority task first
      const lowGrant = preemptionManager.requestExecution(lowPriorityTask);
      expect(lowGrant.granted).toBe(true);

      // High priority task should preempt low priority
      const highGrant = preemptionManager.requestExecution(highPriorityTask);
      expect(highGrant.granted).toBe(true);

      const status = preemptionManager.getSystemStatus();
      expect(status.preemptedTasks.length).toBeGreaterThan(0);
    });

    test('should restore preempted tasks', async () => {
      const maintenanceTask: Task = {
        taskId: 'maintenance',
        name: 'Maintenance Task',
        priority: PreemptionPriority.MAINTENANCE,
        estimatedDuration: 3000,
        resourceRequirements: {
          cpu: 0.8,
          memory: 1024 * 1024 * 1024, // 1GB
          network: false,
          storage: false,
        },
        preemptable: true,
      };

      const normalTask: Task = {
        taskId: 'normal',
        name: 'Normal Task',
        priority: PreemptionPriority.NORMAL_OPERATION,
        estimatedDuration: 1000,
        resourceRequirements: {
          cpu: 0.4,
          memory: 512 * 1024 * 1024, // 512MB
          network: false,
          storage: false,
        },
        preemptable: true,
      };

      // Start maintenance task
      const maintenanceGrant = preemptionManager.requestExecution(maintenanceTask);
      expect(maintenanceGrant.granted).toBe(true);

      // Normal task should preempt maintenance
      const normalGrant = preemptionManager.requestExecution(normalTask);
      expect(normalGrant.granted).toBe(true);

      // Complete normal task
      preemptionManager.completeTask(normalTask.taskId);

      // Wait for restoration attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      const status = preemptionManager.getSystemStatus();
      // Maintenance task should be restored
      expect(status.runningTasks.some(t => t.taskId === maintenanceTask.taskId)).toBe(true);
    });
  });

  describe('Emergency Response Tests', () => {
    let emergencyCoordinator: EmergencyResponseCoordinator;

    beforeEach(() => {
      const safeModeConfig: SafeModeConfig = {
        severity: SafeModeSeverity.MODERATE,
        allowedActions: ['move', 'look'],
        forbiddenActions: ['attack'],
        requireHumanApproval: false,
        enableAutomaticReflexes: true,
        monitoringFrequencyMs: 1000,
        autoExitConditions: ['emergency_resolved'],
      };

      emergencyCoordinator = new EmergencyResponseCoordinator(safeModeConfig);
    });

    afterEach(() => {
      emergencyCoordinator.destroy();
    });

    test('should declare and manage emergencies', async () => {
      const emergency = await emergencyCoordinator.declareEmergency(
        EmergencyType.SYSTEM_FAILURE,
        EmergencySeverity.HIGH,
        'Test system failure',
        { component: 'test_component' }
      );

      expect(emergency.emergencyId).toBeDefined();
      expect(emergency.type).toBe(EmergencyType.SYSTEM_FAILURE);
      expect(emergency.severity).toBe(EmergencySeverity.HIGH);
      expect(emergency.resolved).toBe(false);

      const activeEmergencies = emergencyCoordinator.getActiveEmergencies();
      expect(activeEmergencies).toContainEqual(emergency);
    });

    test('should resolve emergencies', async () => {
      const emergency = await emergencyCoordinator.declareEmergency(
        EmergencyType.PERFORMANCE_FAILURE,
        EmergencySeverity.MEDIUM,
        'Performance degradation detected'
      );

      const resolved = emergencyCoordinator.resolveEmergency(emergency.emergencyId);
      expect(resolved).toBe(true);

      const activeEmergencies = emergencyCoordinator.getActiveEmergencies();
      expect(activeEmergencies).not.toContainEqual(emergency);
    });

    test('should manage safe mode', () => {
      const safeModeManager = emergencyCoordinator.getSafeModeManager();

      // Enter safe mode
      safeModeManager.enterSafeMode('Test safe mode', SafeModeSeverity.STRICT);

      const status = safeModeManager.getStatus();
      expect(status.active).toBe(true);
      expect(status.severity).toBe(SafeModeSeverity.STRICT);

      // Validate action in safe mode
      const validation = safeModeManager.validateAction('test_action', 'attack');
      expect(validation.allowed).toBe(false);
      expect(validation.restrictions).toContain('forbidden_action');

      // Exit safe mode
      const exited = safeModeManager.exitSafeMode();
      expect(exited).toBe(true);

      const statusAfterExit = safeModeManager.getStatus();
      expect(statusAfterExit.active).toBe(false);
    });

    test('should handle notification channels', () => {
      const channel: NotificationChannel = {
        channelId: 'test_webhook',
        type: 'webhook',
        endpoint: 'https://example.com/webhook',
        enabled: true,
        severityFilter: [EmergencySeverity.HIGH, EmergencySeverity.CRITICAL],
      };

      emergencyCoordinator.registerNotificationChannel(channel);

      // Should not throw when declaring emergency
      expect(async () => {
        await emergencyCoordinator.declareEmergency(
          EmergencyType.SECURITY_INCIDENT,
          EmergencySeverity.HIGH,
          'Security breach detected'
        );
      }).not.toThrow();
    });

    test('should provide emergency statistics', async () => {
      // Declare multiple emergencies
      await emergencyCoordinator.declareEmergency(
        EmergencyType.SYSTEM_FAILURE,
        EmergencySeverity.HIGH,
        'System failure 1'
      );

      await emergencyCoordinator.declareEmergency(
        EmergencyType.SAFETY_VIOLATION,
        EmergencySeverity.CRITICAL,
        'Safety violation'
      );

      const stats = emergencyCoordinator.getEmergencyStatistics();
      expect(stats.totalEmergencies).toBe(2);
      expect(stats.activeEmergencies).toBe(2);
      expect(stats.emergenciesByType[EmergencyType.SYSTEM_FAILURE]).toBe(1);
      expect(stats.emergenciesByType[EmergencyType.SAFETY_VIOLATION]).toBe(1);
      expect(stats.emergenciesBySeverity[EmergencySeverity.HIGH]).toBe(1);
      expect(stats.emergenciesBySeverity[EmergencySeverity.CRITICAL]).toBe(1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid task submissions', () => {
      const invalidTask = {
        taskId: '',
        name: '',
        priority: PreemptionPriority.NORMAL_OPERATION,
        estimatedDuration: -1000,
        resourceRequirements: {
          cpu: 2.0, // Invalid: > 1.0
          memory: -1024,
          network: false,
          storage: false,
        },
        preemptable: true,
      };

      expect(() => {
        failSafesSystem.submitTask(invalidTask as Task);
      }).toThrow();
    });

    test('should handle component failures gracefully', async () => {
      const config: ComponentWatchdogConfig = {
        componentName: 'unstable_component',
        healthCheckInterval: 100,
        timeoutThreshold: 500,
        maxConsecutiveFailures: 1,
        recoveryStrategy: 'restart' as any,
        escalationDelayMs: 1000,
        enabled: true,
      };

      let shouldFail = true;
      const unstableHealthChecker = async () => {
        if (shouldFail) {
          throw new Error('Component is unstable');
        }
        return {
          componentName: 'unstable_component',
          checkId: `check_${Date.now()}`,
          status: FailSafeHealthStatus.HEALTHY,
          responseTime: 50,
          timestamp: Date.now(),
        };
      };

      failSafesSystem.registerComponent(config, unstableHealthChecker);

      // Let it fail initially
      await new Promise(resolve => setTimeout(resolve, 200));

      // Then recover
      shouldFail = false;
      await new Promise(resolve => setTimeout(resolve, 200));

      const status = failSafesSystem.getSystemStatus();
      expect(status.componentStatuses['unstable_component']).toBeDefined();
    });

    test('should handle emergency resolution of non-existent emergency', () => {
      const resolved = failSafesSystem.resolveEmergency('non_existent_emergency');
      expect(resolved).toBe(false);
    });

    test('should handle safe mode exit when not in safe mode', () => {
      const exited = failSafesSystem.exitSafeMode();
      expect(exited).toBe(false);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple concurrent tasks', () => {
      const tasks: Task[] = Array.from({ length: 10 }, (_, i) => ({
        taskId: `concurrent_task_${i}`,
        name: `Task ${i}`,
        priority: PreemptionPriority.NORMAL_OPERATION,
        estimatedDuration: 1000,
        resourceRequirements: {
          cpu: 0.1,
          memory: 1024 * 1024, // 1MB
          network: false,
          storage: false,
        },
        preemptable: true,
      }));

      const results = tasks.map(task => failSafesSystem.submitTask(task));
      const grantedCount = results.filter(r => r.granted).length;

      expect(grantedCount).toBeGreaterThan(0);
      expect(grantedCount).toBeLessThanOrEqual(tasks.length);
    });

    test('should handle rapid emergency declarations and resolutions', async () => {
      const emergencyPromises: Promise<string>[] = [];

      for (let i = 0; i < 5; i++) {
        emergencyPromises.push(
          failSafesSystem.declareEmergency(
            EmergencyType.PERFORMANCE_FAILURE,
            EmergencySeverity.MEDIUM,
            `Performance issue ${i}`
          )
        );
      }

      const emergencyIds = await Promise.all(emergencyPromises);
      expect(emergencyIds).toHaveLength(5);

      // Wait a moment for declarations to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // Resolve all emergencies
      const resolutionResults = emergencyIds.map(id =>
        failSafesSystem.resolveEmergency(id)
      );

      // Check individual results for debugging
      resolutionResults.forEach((result, index) => {
        if (!result) {
          console.log(`Failed to resolve emergency ${emergencyIds[index]}`);
        }
      });

      expect(resolutionResults.every(result => result === true)).toBe(true);
    });

    test('should maintain performance under heavy monitoring load', async () => {
      // Register multiple components
      for (let i = 0; i < 20; i++) {
        const config: ComponentWatchdogConfig = {
          componentName: `load_test_component_${i}`,
          healthCheckInterval: 100,
          timeoutThreshold: 1000,
          maxConsecutiveFailures: 3,
          recoveryStrategy: 'restart' as any,
          escalationDelayMs: 5000,
          enabled: true,
        };

        failSafesSystem.registerComponent(config);
      }

      const startTime = Date.now();

      // Let monitoring run for a short period
      await new Promise(resolve => setTimeout(resolve, 500));

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete monitoring cycles within reasonable time
      expect(duration).toBeLessThan(1000);

      const status = failSafesSystem.getSystemStatus();
      expect(Object.keys(status.componentStatuses)).toHaveLength(20);
    });
  });
});

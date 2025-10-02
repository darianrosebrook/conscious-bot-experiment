/**
 * Safety System Integration Test Setup with Testcontainers
 *
 * Provides PostgreSQL containers for integration testing
 * of the safety system components including fail-safes,
 * monitoring, and emergency response.
 *
 * @author @darianrosebrook
 */

import { randomUUID } from 'crypto';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  FailSafesSystem,
  FailSafeConfig,
  EmergencyDeclaration,
  EmergencyProtocol,
  NotificationChannel,
  SafeModeConfig,
} from '../fail-safes/fail-safes-system';
import {
  RecoveryStrategy,
  SafeModeSeverity,
  EmergencyType,
  EmergencySeverity,
} from '../fail-safes/types';

interface SafetySeed {
  emergencies?: EmergencyDeclaration[];
  protocols?: EmergencyProtocol[];
  channels?: NotificationChannel[];
  config?: Partial<FailSafeConfig>;
}

interface SafetyFixture {
  container: StartedPostgreSqlContainer;
  failSafesSystem: FailSafesSystem;
  config: FailSafeConfig;
  stop: () => Promise<void>;
}

export async function createSafetyIntegrationFixture(
  seeds: SafetySeed = {}
): Promise<SafetyFixture> {
  // Start PostgreSQL container
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('safety_system_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .withEnvironment({
      POSTGRES_DB: 'safety_system_test',
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
    })
    .start();

  // Create default safety configuration
  const defaultConfig: FailSafeConfig = {
    watchdogs: {
      'test-component': {
        componentName: 'test-component',
        healthCheckInterval: 5000,
        timeoutThreshold: 10000,
        maxConsecutiveFailures: 3,
        recoveryStrategy: RecoveryStrategy.RESTART_COMPONENT,
        escalationDelayMs: 30000,
        enabled: true,
      },
    },
    preemption: {
      enabled: true,
      overheadBudgetMs: 5,
      restorationDelayMs: 100,
      maxPreemptionDepth: 3,
    },
    safeMode: {
      severity: SafeModeSeverity.MINIMAL,
      allowedActions: ['read', 'status'],
      forbiddenActions: ['write', 'delete', 'admin'],
      requireHumanApproval: false,
      enableAutomaticReflexes: true,
      monitoringFrequencyMs: 5000,
      autoExitConditions: ['all_components_healthy'],
    },
    emergencyResponse: {
      protocols: seeds.protocols ?? [
        {
          protocolId: 'test-emergency-protocol',
          emergencyType: EmergencyType.SYSTEM_FAILURE,
          severity: EmergencySeverity.MEDIUM,
          immediateActions: ['log_incident', 'isolate_component'],
          notificationTargets: ['admin'],
          escalationTimeoutMs: 30000,
          requiredApprovals: [],
          rollbackActions: ['restart_component'],
        },
      ],
      notificationChannels: seeds.channels ?? [
        {
          channelId: 'test-console',
          type: 'console' as const,
          enabled: true,
          severityFilter: [
            EmergencySeverity.LOW,
            EmergencySeverity.MEDIUM,
            EmergencySeverity.HIGH,
            EmergencySeverity.CRITICAL,
          ],
          retryAttempts: 3,
          timeoutMs: 10000,
        },
      ],
      escalationDelays: {
        low: 30000,
        medium: 15000,
        high: 5000,
        critical: 1000,
      },
    },
    recovery: {
      strategies: {
        restart: RecoveryStrategy.RESTART_COMPONENT,
        rollback: RecoveryStrategy.ROLLBACK_CONFIGURATION,
        human: RecoveryStrategy.HUMAN_INTERVENTION,
      },
      checkpointInterval: 300000,
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
        maxHeapSize: 1024 * 1024 * 1024, // 1GB
        maxWorkingSet: 512 * 1024 * 1024, // 512MB
        alertThreshold: 70,
        gcTriggerThreshold: 80,
      },
      disk: {
        maxUsedSpace: 10 * 1024 * 1024 * 1024, // 10GB
        alertThreshold: 80,
        maxIOPS: 1000,
      },
      network: {
        maxRequestsPerMinute: 1000,
        maxBandwidthMbps: 100,
        maxConnections: 1000,
      },
    },
    timeouts: {
      database: {
        operationType: 'database',
        defaultTimeoutMs: 10000,
        maxTimeoutMs: 30000,
        retryAttempts: 3,
        backoffMultiplier: 1.5,
        escalationDelayMs: 5000,
      },
      network: {
        operationType: 'network',
        defaultTimeoutMs: 5000,
        maxTimeoutMs: 15000,
        retryAttempts: 2,
        backoffMultiplier: 1.2,
        escalationDelayMs: 2000,
      },
    },
  };

  // Merge with provided config
  const config: FailSafeConfig = {
    ...defaultConfig,
    ...seeds.config,
    emergencyResponse: {
      ...defaultConfig.emergencyResponse,
      ...seeds.config?.emergencyResponse,
      protocols: seeds.protocols ?? defaultConfig.emergencyResponse.protocols,
      notificationChannels:
        seeds.channels ?? defaultConfig.emergencyResponse.notificationChannels,
    },
  };

  // Create safety system
  const failSafesSystem = new FailSafesSystem(config);

  // Initialize the safety system
  await failSafesSystem.initialize();

  // Seed with emergency declarations if provided
  if (seeds.emergencies) {
    for (const emergency of seeds.emergencies) {
      await failSafesSystem.declareEmergency(
        emergency.type,
        emergency.severity,
        emergency.description,
        emergency.context
      );
    }
  }

  return {
    container,
    failSafesSystem,
    config,
    stop: async () => {
      await failSafesSystem.shutdown();
      await container.stop();
    },
  };
}

export function createEmergencyDeclaration(
  type: EmergencyType,
  severity: EmergencySeverity,
  description: string,
  context: Record<string, any> = {}
): EmergencyDeclaration {
  return {
    emergencyId: `emergency-${randomUUID()}`,
    type,
    severity,
    declaredAt: Date.now(),
    declaredBy: 'integration-test',
    description,
    context,
    estimatedResolutionTime: Date.now() + 3600000, // 1 hour from now
    resolved: false,
  };
}

export function createNotificationChannel(
  type: 'webhook' | 'email' | 'console' | 'dashboard',
  endpoint?: string,
  severityFilter?: EmergencySeverity[]
): NotificationChannel {
  return {
    channelId: `channel-${randomUUID()}`,
    type,
    endpoint,
    enabled: true,
    severityFilter,
    retryAttempts: 3,
    timeoutMs: 30000,
  };
}

export function createSafeModeConfig(
  severity: SafeModeSeverity,
  allowedActions: string[],
  forbiddenActions: string[]
): SafeModeConfig {
  return {
    severity,
    allowedActions,
    forbiddenActions,
    requireHumanApproval: false,
    enableAutomaticReflexes: true,
    monitoringFrequencyMs: 5000,
    autoExitConditions: ['system_stable'],
  };
}

/**
 * Fail-Safes Types and Interfaces
 *
 * Defines data structures for watchdogs, preemption, graceful degradation,
 * and emergency response systems
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Core Enums and Constants
// ============================================================================

export enum FailureType {
  TIMEOUT = 'timeout',
  CRASH = 'crash',
  HANG = 'hang',
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  COMMUNICATION_FAILURE = 'communication_failure',
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  VALIDATION_FAILURE = 'validation_failure',
  EXTERNAL_SERVICE_FAILURE = 'external_service_failure',
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  CRITICAL = 'critical',
  UNKNOWN = 'unknown',
}

export enum PreemptionPriority {
  SAFETY_REFLEX = 1,
  EMERGENCY_PROTOCOL = 2,
  CONSTITUTIONAL = 3,
  CRITICAL_OPERATION = 4,
  HIGH_PRIORITY = 5,
  NORMAL_OPERATION = 6,
  LOW_PRIORITY = 7,
  MAINTENANCE = 8,
}

export enum OperationMode {
  FULL_CAPABILITY = 'full',
  LLM_DEGRADED = 'llm_degraded',
  PLANNING_DEGRADED = 'plan_degraded',
  BASIC_OPERATION = 'basic',
  SAFE_MODE = 'safe',
  EMERGENCY_STOP = 'emergency',
}

export enum EmergencyType {
  SYSTEM_FAILURE = 'system_failure',
  SAFETY_VIOLATION = 'safety_violation',
  ENVIRONMENTAL_THREAT = 'environmental_threat',
  PERFORMANCE_FAILURE = 'performance_failure',
  SECURITY_INCIDENT = 'security_incident',
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
}

export enum EmergencySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum RecoveryStrategy {
  RESTART_COMPONENT = 'restart',
  RESTORE_FROM_CHECKPOINT = 'restore',
  FALLBACK_TO_BACKUP = 'fallback',
  CLEAR_AND_REINITIALIZE = 'clear',
  ROLLBACK_CONFIGURATION = 'rollback',
  HUMAN_INTERVENTION = 'human',
}

export enum SafeModeSeverity {
  MINIMAL = 'minimal',
  MODERATE = 'moderate',
  STRICT = 'strict',
  LOCKDOWN = 'lockdown',
}

// ============================================================================
// Watchdog Types
// ============================================================================

export const ComponentWatchdogConfigSchema = z.object({
  componentName: z.string(),
  healthCheckInterval: z.number(), // milliseconds
  timeoutThreshold: z.number(), // milliseconds
  maxConsecutiveFailures: z.number(),
  recoveryStrategy: z.nativeEnum(RecoveryStrategy),
  escalationDelayMs: z.number().default(60000), // 1 minute
  enabled: z.boolean().default(true),
});

export const WatchdogMetricsSchema = z.object({
  lastHeartbeat: z.number(),
  responseTime: z.number(),
  healthScore: z.number().min(0).max(1),
  consecutiveFailures: z.number(),
  totalFailures: z.number(),
  uptimePercentage: z.number().min(0).max(100),
  averageResponseTime: z.number(),
});

export const HealthCheckResultSchema = z.object({
  componentName: z.string(),
  checkId: z.string(),
  status: z.nativeEnum(HealthStatus),
  responseTime: z.number(),
  timestamp: z.number(),
  details: z.record(z.any()).optional(),
  error: z.string().optional(),
});

export const FailureEventSchema = z.object({
  failureId: z.string(),
  componentName: z.string(),
  failureType: z.nativeEnum(FailureType),
  timestamp: z.number(),
  severity: z.nativeEnum(EmergencySeverity),
  context: z.record(z.any()),
  message: z.string(),
  stackTrace: z.string().optional(),
});

// ============================================================================
// Preemption Types
// ============================================================================

export const TaskSchema = z.object({
  taskId: z.string(),
  name: z.string(),
  priority: z.nativeEnum(PreemptionPriority),
  estimatedDuration: z.number(), // milliseconds
  resourceRequirements: z.object({
    cpu: z.number().min(0).max(1),
    memory: z.number(), // bytes
    network: z.boolean().default(false),
    storage: z.boolean().default(false),
  }),
  preemptable: z.boolean().default(true),
  startedAt: z.number().optional(),
  context: z.record(z.any()).optional(),
});

export const PreemptionEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.number(),
  preemptedTask: z.string(),
  preemptingTask: z.string(),
  preemptedPriority: z.nativeEnum(PreemptionPriority),
  preemptingPriority: z.nativeEnum(PreemptionPriority),
  reason: z.string(),
  restorationTime: z.number().optional(),
  overhead: z.number(), // milliseconds
});

export const ExecutionGrantSchema = z.object({
  grantId: z.string(),
  taskId: z.string(),
  granted: z.boolean(),
  grantedAt: z.number(),
  expiresAt: z.number().optional(),
  resourceAllocation: z.object({
    cpu: z.number(),
    memory: z.number(),
    priority: z.nativeEnum(PreemptionPriority),
  }),
  restrictions: z.array(z.string()).default([]),
  reason: z.string().optional(),
});

// ============================================================================
// Degradation Types
// ============================================================================

export const DegradationTriggerSchema = z.object({
  triggerId: z.string(),
  name: z.string(),
  condition: z.string(), // condition expression
  threshold: z.number().optional(),
  consecutiveOccurrences: z.number().default(1),
  enabled: z.boolean().default(true),
});

export const DegradationPathSchema = z.object({
  pathId: z.string(),
  fromMode: z.nativeEnum(OperationMode),
  toMode: z.nativeEnum(OperationMode),
  triggers: z.array(DegradationTriggerSchema),
  fallbackImplementation: z.string(),
  restorationCondition: z.string(),
  autoRestore: z.boolean().default(true),
  estimatedPerformanceImpact: z.number().min(0).max(1),
});

export const DegradationEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.number(),
  fromMode: z.nativeEnum(OperationMode),
  toMode: z.nativeEnum(OperationMode),
  triggerReason: z.string(),
  automatic: z.boolean(),
  estimatedDuration: z.number().optional(), // milliseconds
  affectedComponents: z.array(z.string()),
});

export const SystemCapabilitySchema = z.object({
  capabilityName: z.string(),
  available: z.boolean(),
  performanceLevel: z.number().min(0).max(1),
  mode: z.nativeEnum(OperationMode),
  fallbacksAvailable: z.array(z.string()),
  lastUpdated: z.number(),
});

// ============================================================================
// Emergency Response Types
// ============================================================================

export const EmergencyDeclarationSchema = z.object({
  emergencyId: z.string(),
  type: z.nativeEnum(EmergencyType),
  severity: z.nativeEnum(EmergencySeverity),
  declaredAt: z.number(),
  declaredBy: z.string(), // component or user
  description: z.string(),
  context: z.record(z.any()),
  estimatedResolutionTime: z.number().optional(),
  resolved: z.boolean().default(false),
  resolvedAt: z.number().optional(),
});

export const EmergencyProtocolSchema = z.object({
  protocolId: z.string(),
  emergencyType: z.nativeEnum(EmergencyType),
  severity: z.nativeEnum(EmergencySeverity),
  immediateActions: z.array(z.string()),
  notificationTargets: z.array(z.string()),
  escalationTimeoutMs: z.number(),
  requiredApprovals: z.array(z.string()).default([]),
  rollbackActions: z.array(z.string()).default([]),
});

export const NotificationChannelSchema = z.object({
  channelId: z.string(),
  type: z.enum(['webhook', 'email', 'console', 'dashboard']),
  endpoint: z.string().optional(),
  enabled: z.boolean().default(true),
  severityFilter: z.array(z.nativeEnum(EmergencySeverity)).optional(),
  retryAttempts: z.number().default(3),
  timeoutMs: z.number().default(30000),
});

// ============================================================================
// Safe Mode Types
// ============================================================================

export const SafeModeConfigSchema = z.object({
  severity: z.nativeEnum(SafeModeSeverity),
  allowedActions: z.array(z.string()),
  forbiddenActions: z.array(z.string()),
  maxMovementDistance: z.number().optional(),
  requireHumanApproval: z.boolean().default(false),
  enableAutomaticReflexes: z.boolean().default(true),
  monitoringFrequencyMs: z.number().default(5000),
  autoExitConditions: z.array(z.string()).default([]),
  timeoutMs: z.number().optional(), // auto-exit after timeout
});

export const SafeModeValidationSchema = z.object({
  actionId: z.string(),
  actionType: z.string(),
  allowed: z.boolean(),
  reason: z.string(),
  requiresApproval: z.boolean(),
  restrictions: z.array(z.string()),
  validatedAt: z.number(),
});

export const SafeModeEventSchema = z.object({
  eventId: z.string(),
  type: z.enum(['enter', 'exit', 'action_blocked', 'approval_requested']),
  timestamp: z.number(),
  severity: z.nativeEnum(SafeModeSeverity),
  triggerReason: z.string(),
  actionContext: z.record(z.any()).optional(),
  userContext: z.string().optional(),
});

// ============================================================================
// Recovery Types
// ============================================================================

export const CheckpointSchema = z.object({
  checkpointId: z.string(),
  type: z.enum(['automatic', 'manual', 'emergency']),
  createdAt: z.number(),
  expiresAt: z.number().optional(),
  size: z.number(), // bytes
  componentStates: z.record(z.any()),
  systemConfig: z.record(z.any()),
  metadata: z.record(z.any()).optional(),
  verified: z.boolean().default(false),
});

export const RecoveryAttemptSchema = z.object({
  attemptId: z.string(),
  failureId: z.string(),
  strategy: z.nativeEnum(RecoveryStrategy),
  startTime: z.number(),
  endTime: z.number().optional(),
  success: z.boolean().optional(),
  errorMessage: z.string().optional(),
  stateBefore: z.record(z.any()),
  stateAfter: z.record(z.any()).optional(),
  rollbackRequired: z.boolean().default(false),
});

export const StateValidationSchema = z.object({
  validationId: z.string(),
  timestamp: z.number(),
  componentName: z.string(),
  valid: z.boolean(),
  issues: z.array(z.string()),
  integrityScore: z.number().min(0).max(1),
  repairActions: z.array(z.string()).default([]),
});

// ============================================================================
// Resource Monitoring Types
// ============================================================================

export const ResourceUsageSchema = z.object({
  timestamp: z.number(),
  cpu: z.object({
    usage: z.number().min(0).max(100), // percentage
    loadAverage: z.number(),
    activeThreads: z.number(),
  }),
  memory: z.object({
    used: z.number(), // bytes
    available: z.number(), // bytes
    heapUsage: z.number(), // percentage
    gcFrequency: z.number(), // per minute
  }),
  disk: z.object({
    used: z.number(), // bytes
    available: z.number(), // bytes
    ioOperationsPerSecond: z.number(),
  }),
  network: z.object({
    bytesInPerSecond: z.number(),
    bytesOutPerSecond: z.number(),
    activeConnections: z.number(),
    requestsPerMinute: z.number(),
  }),
});

export const ResourceLimitsSchema = z.object({
  cpu: z.object({
    maxUsagePercent: z.number().default(80),
    maxSustainedUsage: z.number().default(60),
    alertThreshold: z.number().default(70),
    criticalThreshold: z.number().default(90),
  }),
  memory: z.object({
    maxHeapSize: z.number(), // bytes
    maxWorkingSet: z.number(), // bytes
    alertThreshold: z.number(),
    gcTriggerThreshold: z.number(),
  }),
  disk: z.object({
    maxUsedSpace: z.number(), // bytes
    alertThreshold: z.number(), // bytes
    maxIOPS: z.number(),
  }),
  network: z.object({
    maxRequestsPerMinute: z.number().default(1000),
    maxBandwidthMbps: z.number().default(100),
    maxConnections: z.number().default(1000),
  }),
});

export const ResourceViolationSchema = z.object({
  violationId: z.string(),
  timestamp: z.number(),
  resourceType: z.enum(['cpu', 'memory', 'disk', 'network']),
  currentValue: z.number(),
  threshold: z.number(),
  severity: z.nativeEnum(EmergencySeverity),
  duration: z.number(), // milliseconds
  actionsTaken: z.array(z.string()),
});

// ============================================================================
// Timeout Management Types
// ============================================================================

export const TimeoutConfigSchema = z.object({
  operationType: z.string(),
  defaultTimeoutMs: z.number(),
  maxTimeoutMs: z.number(),
  retryAttempts: z.number().default(0),
  backoffMultiplier: z.number().default(1.5),
  escalationDelayMs: z.number().default(30000),
});

export const TimeoutEventSchema = z.object({
  eventId: z.string(),
  operationId: z.string(),
  operationType: z.string(),
  timeoutMs: z.number(),
  actualDuration: z.number(),
  timestamp: z.number(),
  context: z.record(z.any()).optional(),
  retryAttempt: z.number().default(0),
  escalated: z.boolean().default(false),
});

// ============================================================================
// System Integration Types
// ============================================================================

export const FailSafeConfigSchema = z.object({
  watchdogs: z.record(ComponentWatchdogConfigSchema),
  preemption: z.object({
    enabled: z.boolean().default(true),
    overheadBudgetMs: z.number().default(5),
    restorationDelayMs: z.number().default(100),
    maxPreemptionDepth: z.number().default(3),
  }),
  safeMode: SafeModeConfigSchema,
  emergencyResponse: z.object({
    protocols: z.array(EmergencyProtocolSchema),
    notificationChannels: z.array(NotificationChannelSchema),
    escalationDelays: z.record(z.number()),
  }),
  recovery: z.object({
    strategies: z.record(z.nativeEnum(RecoveryStrategy)),
    checkpointInterval: z.number().default(300000), // 5 minutes
    maxCheckpoints: z.number().default(10),
    autoRecoveryEnabled: z.boolean().default(true),
  }),
  resourceLimits: ResourceLimitsSchema,
  timeouts: z.record(TimeoutConfigSchema),
});

export const SystemStatusSchema = z.object({
  timestamp: z.number(),
  overallHealth: z.nativeEnum(HealthStatus),
  currentMode: z.nativeEnum(OperationMode),
  activeEmergencies: z.array(z.string()),
  componentStatuses: z.record(z.nativeEnum(HealthStatus)),
  resourceUsage: ResourceUsageSchema,
  activeTasks: z.number(),
  lastCheckpoint: z.string().optional(),
  degradationEvents: z.number(),
  recoveryAttempts: z.number(),
});

// ============================================================================
// Export Types
// ============================================================================

export type ComponentWatchdogConfig = z.infer<typeof ComponentWatchdogConfigSchema>;
export type WatchdogMetrics = z.infer<typeof WatchdogMetricsSchema>;
export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;
export type FailureEvent = z.infer<typeof FailureEventSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type PreemptionEvent = z.infer<typeof PreemptionEventSchema>;
export type ExecutionGrant = z.infer<typeof ExecutionGrantSchema>;
export type DegradationTrigger = z.infer<typeof DegradationTriggerSchema>;
export type DegradationPath = z.infer<typeof DegradationPathSchema>;
export type DegradationEvent = z.infer<typeof DegradationEventSchema>;
export type SystemCapability = z.infer<typeof SystemCapabilitySchema>;
export type EmergencyDeclaration = z.infer<typeof EmergencyDeclarationSchema>;
export type EmergencyProtocol = z.infer<typeof EmergencyProtocolSchema>;
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
export type SafeModeConfig = z.infer<typeof SafeModeConfigSchema>;
export type SafeModeValidation = z.infer<typeof SafeModeValidationSchema>;
export type SafeModeEvent = z.infer<typeof SafeModeEventSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type RecoveryAttempt = z.infer<typeof RecoveryAttemptSchema>;
export type StateValidation = z.infer<typeof StateValidationSchema>;
export type ResourceUsage = z.infer<typeof ResourceUsageSchema>;
export type ResourceLimits = z.infer<typeof ResourceLimitsSchema>;
export type ResourceViolation = z.infer<typeof ResourceViolationSchema>;
export type TimeoutConfig = z.infer<typeof TimeoutConfigSchema>;
export type TimeoutEvent = z.infer<typeof TimeoutEventSchema>;
export type FailSafeConfig = z.infer<typeof FailSafeConfigSchema>;
export type SystemStatus = z.infer<typeof SystemStatusSchema>;

// ============================================================================
// Validation Functions
// ============================================================================

export const validateComponentWatchdogConfig = (data: unknown): ComponentWatchdogConfig =>
  ComponentWatchdogConfigSchema.parse(data);
export const validateWatchdogMetrics = (data: unknown): WatchdogMetrics =>
  WatchdogMetricsSchema.parse(data);
export const validateHealthCheckResult = (data: unknown): HealthCheckResult =>
  HealthCheckResultSchema.parse(data);
export const validateFailureEvent = (data: unknown): FailureEvent =>
  FailureEventSchema.parse(data);
export const validateTask = (data: unknown): Task => TaskSchema.parse(data);
export const validatePreemptionEvent = (data: unknown): PreemptionEvent =>
  PreemptionEventSchema.parse(data);
export const validateExecutionGrant = (data: unknown): ExecutionGrant =>
  ExecutionGrantSchema.parse(data);
export const validateDegradationPath = (data: unknown): DegradationPath =>
  DegradationPathSchema.parse(data);
export const validateEmergencyDeclaration = (data: unknown): EmergencyDeclaration =>
  EmergencyDeclarationSchema.parse(data);
export const validateSafeModeConfig = (data: unknown): SafeModeConfig =>
  SafeModeConfigSchema.parse(data);
export const validateCheckpoint = (data: unknown): Checkpoint =>
  CheckpointSchema.parse(data);
export const validateRecoveryAttempt = (data: unknown): RecoveryAttempt =>
  RecoveryAttemptSchema.parse(data);
export const validateResourceUsage = (data: unknown): ResourceUsage =>
  ResourceUsageSchema.parse(data);
export const validateResourceLimits = (data: unknown): ResourceLimits =>
  ResourceLimitsSchema.parse(data);
export const validateTimeoutConfig = (data: unknown): TimeoutConfig =>
  TimeoutConfigSchema.parse(data);
export const validateFailSafeConfig = (data: unknown): FailSafeConfig =>
  FailSafeConfigSchema.parse(data);
export const validateSystemStatus = (data: unknown): SystemStatus =>
  SystemStatusSchema.parse(data);

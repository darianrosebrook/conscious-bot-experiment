/**
 * Privacy Protection Types and Interfaces
 * 
 * Defines data structures for data protection, anonymization, and privacy compliance
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Core Data Types
// ============================================================================

export const LocationSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  world: z.string().optional(),
});

export const PlayerDataSchema = z.object({
  playerId: z.string(),
  username: z.string(),
  location: LocationSchema,
  actions: z.array(z.string()),
  interactions: z.array(z.string()),
  timestamp: z.number(),
});

export const ChatMessageSchema = z.object({
  messageId: z.string(),
  playerId: z.string(),
  content: z.string(),
  timestamp: z.number(),
  channel: z.string().optional(),
});

// ============================================================================
// Anonymization Types
// ============================================================================

export const AnonymizationConfigSchema = z.object({
  locationPrecision: z.number().default(10), // blocks
  saltRotationSchedule: z.string().default('weekly'),
  piiPatterns: z.array(z.string()).default(['email', 'phone', 'address']),
  temporalGranularity: z.enum(['hour', 'day', 'week']).default('hour'),
});

export const AnonymizedPlayerDataSchema = z.object({
  playerHash: z.string(),
  pseudonym: z.string(),
  fuzzedLocation: LocationSchema,
  actionPatterns: z.array(z.string()),
  interactionCount: z.number(),
  timestamp: z.number(),
});

export const AnonymizedMessageSchema = z.object({
  messageHash: z.string(),
  playerPseudonym: z.string(),
  filteredContent: z.string(),
  communicationPattern: z.string(),
  timestamp: z.number(),
});

// ============================================================================
// Data Classification
// ============================================================================

export enum DataSensitivityLevel {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted',
  SECRET = 'secret',
}

export const DataClassificationSchema = z.object({
  sensitivityLevel: z.nativeEnum(DataSensitivityLevel),
  retentionPeriod: z.number(), // milliseconds
  encryptionRequired: z.boolean(),
  accessRestrictions: z.array(z.string()),
  anonymizationRequired: z.boolean(),
  auditLogging: z.boolean(),
});

export const ClassifiedDataSchema = z.object({
  dataId: z.string(),
  classification: DataClassificationSchema,
  originalData: z.any(),
  processedData: z.any().optional(),
  processingTimestamp: z.number(),
});

// ============================================================================
// Consent Management
// ============================================================================

export enum ConsentType {
  BASIC_INTERACTION = 'basic_interaction',
  BEHAVIOR_ANALYSIS = 'behavior_analysis',
  COMMUNICATION_LOG = 'communication_log',
  LOCATION_TRACKING = 'location_tracking',
  SOCIAL_MODELING = 'social_modeling',
  PERFORMANCE_ANALYTICS = 'performance_analytics',
}

export const ConsentRecordSchema = z.object({
  playerId: z.string(),
  consentType: z.nativeEnum(ConsentType),
  granted: z.boolean(),
  timestamp: z.number(),
  purpose: z.string(),
  retentionPeriod: z.number().optional(),
  revocationMethod: z.string(),
  renewalRequired: z.boolean(),
});

export const ConsentRequestSchema = z.object({
  playerId: z.string(),
  consentType: z.nativeEnum(ConsentType),
  purpose: z.string(),
  retentionPeriod: z.number().optional(),
  benefits: z.array(z.string()).optional(),
  consequences: z.array(z.string()).optional(),
});

// ============================================================================
// Geofencing
// ============================================================================

export const GeofenceSchema = z.object({
  geofenceId: z.string(),
  name: z.string(),
  type: z.enum(['private_area', 'protected_region', 'restricted_resource', 'social_space']),
  coordinates: z.object({
    minX: z.number(),
    minY: z.number(),
    minZ: z.number(),
    maxX: z.number(),
    maxY: z.number(),
    maxZ: z.number(),
  }),
  owner: z.string().optional(),
  permissions: z.object({
    entry: z.enum(['allowed', 'owner_only', 'prohibited']),
    building: z.enum(['allowed', 'limited', 'prohibited']),
    resourceExtraction: z.enum(['allowed', 'limited', 'prohibited']),
    observation: z.enum(['full', 'limited', 'prohibited']),
  }),
  privacySettings: z.object({
    anonymizeActivities: z.boolean(),
    logRetention: z.string(),
    detailedLogging: z.boolean(),
  }),
});

export const AccessPermissionSchema = z.object({
  allowed: z.boolean(),
  restrictions: z.array(z.string()),
  reason: z.string(),
  privacyRequirements: z.array(z.string()),
});

// ============================================================================
// Rate Limiting
// ============================================================================

export const RateLimitConfigSchema = z.object({
  actionType: z.string(),
  limit: z.number(),
  windowMs: z.number(),
  burstAllowance: z.number().optional(),
  cooldownMs: z.number().optional(),
  adaptive: z.boolean().default(false),
});

export const UsageStatisticsSchema = z.object({
  actionType: z.string(),
  actor: z.string(),
  currentCount: z.number(),
  windowStart: z.number(),
  remainingQuota: z.number(),
  nextResetTime: z.number(),
});

export const RateLimitResultSchema = z.object({
  allowed: z.boolean(),
  remainingQuota: z.number(),
  resetTime: z.number(),
  retryAfter: z.number().optional(),
  reason: z.string().optional(),
});

// ============================================================================
// Data Retention and Lifecycle
// ============================================================================

export const RetentionPolicySchema = z.object({
  dataType: z.string(),
  retentionPeriod: z.number(), // milliseconds
  archiveBeforeDeletion: z.boolean(),
  consentBased: z.boolean(),
  anonymizeBeforeStorage: z.boolean(),
  requiresOngoingConsent: z.boolean(),
  purgeOnPlayerRequest: z.boolean(),
});

export const DataItemSchema = z.object({
  itemId: z.string(),
  dataType: z.string(),
  data: z.any(),
  classification: DataClassificationSchema,
  createdAt: z.number(),
  expiresAt: z.number().optional(),
  playerId: z.string().optional(),
  purpose: z.string(),
});

export const RetentionPlanSchema = z.object({
  itemId: z.string(),
  retentionPolicy: RetentionPolicySchema,
  scheduledDeletion: z.number(),
  archiveRequired: z.boolean(),
  anonymizationRequired: z.boolean(),
});

// ============================================================================
// Revert Journal
// ============================================================================

export enum ActionType {
  BLOCK_PLACEMENT = 'block_place',
  BLOCK_DESTRUCTION = 'block_break',
  ITEM_TRANSFER = 'item_transfer',
  INFORMATION_DISCLOSURE = 'info_disclosure',
  SOCIAL_INTERACTION = 'social_interaction',
  KNOWLEDGE_UPDATE = 'knowledge_update',
}

export const ReversibleActionSchema = z.object({
  actionId: z.string(),
  actionType: z.nativeEnum(ActionType),
  timestamp: z.number(),
  location: LocationSchema,
  affectedEntities: z.array(z.string()),
  stateChanges: z.array(z.object({
    entity: z.string(),
    property: z.string(),
    oldValue: z.any(),
    newValue: z.any(),
  })),
  revertInstructions: z.object({
    steps: z.array(z.string()),
    dependencies: z.array(z.string()),
    timeLimit: z.number(),
  }),
  feasibilityWindow: z.number(), // milliseconds
  privacyImplications: z.array(z.string()),
});

export const RevertFeasibilitySchema = z.object({
  feasible: z.boolean(),
  reason: z.string(),
  remainingWindow: z.number(),
  dependencies: z.array(z.string()),
  riskAssessment: z.string(),
});

// ============================================================================
// Privacy Incidents
// ============================================================================

export enum IncidentSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export const PrivacyIncidentSchema = z.object({
  incidentId: z.string(),
  severity: z.nativeEnum(IncidentSeverity),
  incidentType: z.string(),
  description: z.string(),
  affectedPlayers: z.array(z.string()),
  dataInvolved: z.array(z.string()),
  detectionTime: z.number(),
  potentialImpact: z.string(),
  immediateActions: z.array(z.string()),
  longTermActions: z.array(z.string()),
  resolved: z.boolean(),
  resolutionTime: z.number().optional(),
});

// ============================================================================
// Export Types
// ============================================================================

export type Location = z.infer<typeof LocationSchema>;
export type PlayerData = z.infer<typeof PlayerDataSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type AnonymizationConfig = z.infer<typeof AnonymizationConfigSchema>;
export type AnonymizedPlayerData = z.infer<typeof AnonymizedPlayerDataSchema>;
export type AnonymizedMessage = z.infer<typeof AnonymizedMessageSchema>;
export type DataClassification = z.infer<typeof DataClassificationSchema>;
export type ClassifiedData = z.infer<typeof ClassifiedDataSchema>;
export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;
export type ConsentRequest = z.infer<typeof ConsentRequestSchema>;
export type Geofence = z.infer<typeof GeofenceSchema>;
export type AccessPermission = z.infer<typeof AccessPermissionSchema>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
export type UsageStatistics = z.infer<typeof UsageStatisticsSchema>;
export type RateLimitResult = z.infer<typeof RateLimitResultSchema>;
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;
export type DataItem = z.infer<typeof DataItemSchema>;
export type RetentionPlan = z.infer<typeof RetentionPlanSchema>;
export type ReversibleAction = z.infer<typeof ReversibleActionSchema>;
export type RevertFeasibility = z.infer<typeof RevertFeasibilitySchema>;
export type PrivacyIncident = z.infer<typeof PrivacyIncidentSchema>;

// ============================================================================
// Validation Functions
// ============================================================================

export const validateLocation = (data: unknown): Location => LocationSchema.parse(data);
export const validatePlayerData = (data: unknown): PlayerData => PlayerDataSchema.parse(data);
export const validateChatMessage = (data: unknown): ChatMessage => ChatMessageSchema.parse(data);
export const validateAnonymizationConfig = (data: unknown): AnonymizationConfig => AnonymizationConfigSchema.parse(data);
export const validateAnonymizedPlayerData = (data: unknown): AnonymizedPlayerData => AnonymizedPlayerDataSchema.parse(data);
export const validateAnonymizedMessage = (data: unknown): AnonymizedMessage => AnonymizedMessageSchema.parse(data);
export const validateDataClassification = (data: unknown): DataClassification => DataClassificationSchema.parse(data);
export const validateClassifiedData = (data: unknown): ClassifiedData => ClassifiedDataSchema.parse(data);
export const validateConsentRecord = (data: unknown): ConsentRecord => ConsentRecordSchema.parse(data);
export const validateConsentRequest = (data: unknown): ConsentRequest => ConsentRequestSchema.parse(data);
export const validateGeofence = (data: unknown): Geofence => GeofenceSchema.parse(data);
export const validateAccessPermission = (data: unknown): AccessPermission => AccessPermissionSchema.parse(data);
export const validateRateLimitConfig = (data: unknown): RateLimitConfig => RateLimitConfigSchema.parse(data);
export const validateUsageStatistics = (data: unknown): UsageStatistics => UsageStatisticsSchema.parse(data);
export const validateRateLimitResult = (data: unknown): RateLimitResult => RateLimitResultSchema.parse(data);
export const validateRetentionPolicy = (data: unknown): RetentionPolicy => RetentionPolicySchema.parse(data);
export const validateDataItem = (data: unknown): DataItem => DataItemSchema.parse(data);
export const validateRetentionPlan = (data: unknown): RetentionPlan => RetentionPlanSchema.parse(data);
export const validateReversibleAction = (data: unknown): ReversibleAction => ReversibleActionSchema.parse(data);
export const validateRevertFeasibility = (data: unknown): RevertFeasibility => RevertFeasibilitySchema.parse(data);
export const validatePrivacyIncident = (data: unknown): PrivacyIncident => PrivacyIncidentSchema.parse(data);

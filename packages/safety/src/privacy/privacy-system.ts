/**
 * Privacy System - Integrated Privacy Protection System
 *
 * Orchestrates all privacy protection components for comprehensive data protection
 * @author @darianrosebrook
 */

import { EventEmitter } from 'eventemitter3';
import {
  DataAnonymizer,
  DEFAULT_ANONYMIZATION_CONFIG,
} from './data-anonymizer';
import { GeofenceManager } from './geofence-manager';
import {
  ConsentManager,
  DEFAULT_CONSENT_RETENTION_PERIODS,
} from './consent-manager';
import { RateLimiter } from './rate-limiter';
import {
  AnonymizationConfig,
  PlayerData,
  ChatMessage,
  Location,
  ConsentType,
  Geofence,
  RateLimitConfig,
  validateAnonymizationConfig,
  validatePlayerData,
  validateChatMessage,
  validateLocation,
} from './types';

/**
 * Privacy System Configuration
 */
export interface PrivacySystemConfig {
  anonymization?: Partial<AnonymizationConfig>;
  enableGeofencing?: boolean;
  enableConsentManagement?: boolean;
  enableRateLimiting?: boolean;
  defaultConsentRetentionPeriods?: Partial<Record<ConsentType, number>>;
  debugMode?: boolean;
}

/**
 * Privacy System Metrics
 */
export interface PrivacyMetrics {
  anonymization: {
    totalDataAnonymized: number;
    totalMessagesFiltered: number;
    averageFuzzingDistance: number;
    piiDetectionRate: number;
  };
  geofencing: {
    totalGeofences: number;
    violationsDetected: number;
    restrictedAreas: number;
  };
  consent: {
    totalPlayers: number;
    consentRates: Record<ConsentType, number>;
    pendingRenewals: number;
    recentRevocations: number;
  };
  rateLimiting: {
    actionTypes: string[];
    totalActions: number;
    violations: number;
    activeActors: number;
  };
}

/**
 * Data Processing Request for privacy validation
 */
export interface DataProcessingRequest {
  playerId: string;
  operation: string;
  dataType: string;
  data: any;
  location?: Location;
  purpose: string;
}

/**
 * Data Processing Result with privacy compliance status
 */
export interface DataProcessingResult {
  allowed: boolean;
  processedData?: any;
  restrictions: string[];
  privacyRequirements: string[];
  consentStatus: {
    hasRequiredConsents: boolean;
    missingConsents: ConsentType[];
  };
  rateLimitStatus: {
    allowed: boolean;
    remainingQuota: number;
    retryAfter?: number;
  };
  reason: string;
}

/**
 * Main Privacy Protection System
 */
export class PrivacySystem extends EventEmitter {
  private readonly dataAnonymizer: DataAnonymizer;
  private readonly geofenceManager: GeofenceManager;
  private readonly consentManager: ConsentManager;
  private readonly rateLimiter: RateLimiter;
  private readonly config: Required<PrivacySystemConfig>;

  constructor(config: PrivacySystemConfig = {}) {
    super();

    this.config = {
      anonymization: {
        ...DEFAULT_ANONYMIZATION_CONFIG,
        ...config.anonymization,
      },
      enableGeofencing: config.enableGeofencing ?? true,
      enableConsentManagement: config.enableConsentManagement ?? true,
      enableRateLimiting: config.enableRateLimiting ?? true,
      defaultConsentRetentionPeriods: {
        ...DEFAULT_CONSENT_RETENTION_PERIODS,
        ...config.defaultConsentRetentionPeriods,
      },
      debugMode: config.debugMode ?? false,
    };

    // Initialize components
    this.dataAnonymizer = new DataAnonymizer(
      validateAnonymizationConfig(this.config.anonymization)
    );
    this.geofenceManager = new GeofenceManager();
    this.consentManager = new ConsentManager();
    this.rateLimiter = new RateLimiter();

    this.setupEventHandlers();
    this.initializeDefaultConfigurations();
  }

  // ========================================================================
  // Public API Methods
  // ========================================================================

  /**
   * Process data with comprehensive privacy protection
   */
  async processData(
    request: DataProcessingRequest
  ): Promise<DataProcessingResult> {
    try {
      // Step 1: Check consent requirements
      const consentStatus = this.checkConsentRequirements(request);
      if (!consentStatus.hasRequiredConsents) {
        return {
          allowed: false,
          restrictions: ['consent_required'],
          privacyRequirements: [],
          consentStatus,
          rateLimitStatus: { allowed: true, remainingQuota: 0 },
          reason: `Missing required consents: ${consentStatus.missingConsents.join(', ')}`,
        };
      }

      // Step 2: Check rate limits
      const rateLimitStatus = this.checkRateLimits(request);
      if (!rateLimitStatus.allowed) {
        return {
          allowed: false,
          restrictions: ['rate_limited'],
          privacyRequirements: [],
          consentStatus,
          rateLimitStatus,
          reason: 'Rate limit exceeded',
        };
      }

      // Step 3: Check geofence restrictions
      const geofenceRestrictions = this.checkGeofenceRestrictions(request);
      if (geofenceRestrictions.restrictions.includes('prohibited')) {
        return {
          allowed: false,
          restrictions: geofenceRestrictions.restrictions,
          privacyRequirements: geofenceRestrictions.privacyRequirements,
          consentStatus,
          rateLimitStatus,
          reason: 'Geofence restrictions prohibit this operation',
        };
      }

      // Step 4: Apply privacy protections to data
      const processedData = await this.applyPrivacyProtections(
        request,
        geofenceRestrictions.privacyRequirements
      );

      // Step 5: Record the action for rate limiting
      this.rateLimiter.recordAction(request.operation, request.playerId, {
        dataType: request.dataType,
        purpose: request.purpose,
      });

      return {
        allowed: true,
        processedData,
        restrictions: geofenceRestrictions.restrictions,
        privacyRequirements: geofenceRestrictions.privacyRequirements,
        consentStatus,
        rateLimitStatus,
        reason: 'Data processing completed with privacy protections applied',
      };
    } catch (error) {
      this.emit('privacy-processing-error', {
        request,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });

      return {
        allowed: false,
        restrictions: ['processing_error'],
        privacyRequirements: [],
        consentStatus: { hasRequiredConsents: false, missingConsents: [] },
        rateLimitStatus: { allowed: false, remainingQuota: 0 },
        reason: 'Error during privacy processing',
      };
    }
  }

  /**
   * Anonymize player data
   */
  anonymizePlayerData(playerData: PlayerData) {
    return this.dataAnonymizer.anonymizePlayerData(playerData);
  }

  /**
   * Anonymize chat message
   */
  anonymizeChatMessage(message: ChatMessage) {
    return this.dataAnonymizer.anonymizeChatMessage(message);
  }

  /**
   * Request consent from player
   */
  async requestConsent(
    playerId: string,
    consentType: ConsentType,
    purpose: string,
    options?: {
      retentionPeriod?: number;
      benefits?: string[];
      consequences?: string[];
    }
  ) {
    return this.consentManager.requestConsent(
      playerId,
      consentType,
      purpose,
      options
    );
  }

  /**
   * Record consent decision
   */
  async recordConsentDecision(
    playerId: string,
    consentType: ConsentType,
    granted: boolean,
    options?: {
      purpose?: string;
      retentionPeriod?: number;
      revocationMethod?: string;
    }
  ) {
    return this.consentManager.recordConsentDecision(
      playerId,
      consentType,
      granted,
      options
    );
  }

  /**
   * Register geofenced area
   */
  registerGeofence(geofence: Geofence, owner?: string): boolean {
    return this.geofenceManager.registerGeofence(geofence, owner);
  }

  /**
   * Configure rate limits for action type
   */
  configureRateLimits(actionType: string, config: RateLimitConfig): void {
    this.rateLimiter.configureLimits(actionType, config);
  }

  /**
   * Check if player has required consent for operation
   */
  hasRequiredConsent(playerId: string, operation: string): boolean {
    const status = this.consentManager.checkConsentStatus(playerId, operation);
    return status.allowed;
  }

  /**
   * Get privacy metrics
   */
  getPrivacyMetrics(): PrivacyMetrics {
    return {
      anonymization: this.dataAnonymizer.getAnonymizationStats(),
      geofencing: this.geofenceManager.getViolationStats(),
      consent: this.consentManager.getConsentStatistics(),
      rateLimiting: this.rateLimiter.getRateLimitStatistics(),
    };
  }

  /**
   * Remove all data for player (for GDPR compliance)
   */
  async removePlayerData(playerId: string): Promise<{
    consentRemoved: boolean;
    rateLimitRemoved: boolean;
    anonymizationPurged: boolean;
  }> {
    const results = {
      consentRemoved: this.consentManager.removePlayerConsents(playerId),
      rateLimitRemoved: this.rateLimiter.removeActor(playerId),
      anonymizationPurged: true, // Anonymized data doesn't need removal
    };

    this.emit('player-data-removed', {
      playerId,
      results,
      timestamp: Date.now(),
    });

    return results;
  }

  /**
   * Auto-detect private areas from building patterns
   */
  autoDetectPrivateAreas(
    buildingData: Array<{
      location: Location;
      builder: string;
      timestamp: number;
    }>
  ): Geofence[] {
    const detectedGeofences =
      this.geofenceManager.autoDetectPrivateAreas(buildingData);

    // Auto-register detected geofences
    for (const geofence of detectedGeofences) {
      this.geofenceManager.registerGeofence(geofence, geofence.owner);
    }

    this.emit('private-areas-detected', {
      count: detectedGeofences.length,
      geofences: detectedGeofences,
      timestamp: Date.now(),
    });

    return detectedGeofences;
  }

  /**
   * Update privacy system configuration
   */
  updateConfiguration(newConfig: Partial<PrivacySystemConfig>): void {
    Object.assign(this.config, newConfig);

    if (newConfig.anonymization) {
      this.dataAnonymizer.updateConfig(newConfig.anonymization);
    }

    this.emit('configuration-updated', {
      newConfig,
      timestamp: Date.now(),
    });
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  private checkConsentRequirements(request: DataProcessingRequest): {
    hasRequiredConsents: boolean;
    missingConsents: ConsentType[];
  } {
    if (!this.config.enableConsentManagement) {
      return { hasRequiredConsents: true, missingConsents: [] };
    }

    const consentStatus = this.consentManager.checkConsentStatus(
      request.playerId,
      request.operation
    );
    return {
      hasRequiredConsents: consentStatus.allowed,
      missingConsents: consentStatus.missingConsents,
    };
  }

  private checkRateLimits(request: DataProcessingRequest): {
    allowed: boolean;
    remainingQuota: number;
    retryAfter?: number;
  } {
    if (!this.config.enableRateLimiting) {
      return { allowed: true, remainingQuota: Infinity };
    }

    const rateLimitResult = this.rateLimiter.checkRateLimit(
      request.operation,
      request.playerId
    );
    return {
      allowed: rateLimitResult.allowed,
      remainingQuota: rateLimitResult.remainingQuota,
      retryAfter: rateLimitResult.retryAfter,
    };
  }

  private checkGeofenceRestrictions(request: DataProcessingRequest): {
    restrictions: string[];
    privacyRequirements: string[];
  } {
    if (!this.config.enableGeofencing || !request.location) {
      return { restrictions: [], privacyRequirements: [] };
    }

    const locationRestrictions = this.geofenceManager.getLocationRestrictions(
      request.location
    );
    const accessPermission = this.geofenceManager.checkAccessPermission(
      request.location,
      request.operation,
      request.playerId
    );

    return {
      restrictions: accessPermission.allowed
        ? locationRestrictions.restrictions
        : ['prohibited'],
      privacyRequirements: [
        ...locationRestrictions.privacyRequirements,
        ...accessPermission.privacyRequirements,
      ],
    };
  }

  private async applyPrivacyProtections(
    request: DataProcessingRequest,
    privacyRequirements: string[]
  ): Promise<any> {
    let processedData = request.data;

    // Apply anonymization if required
    if (
      privacyRequirements.includes('anonymize_activity') ||
      privacyRequirements.includes('anonymize_activities')
    ) {
      if (request.dataType === 'player_data') {
        processedData = this.dataAnonymizer.anonymizePlayerData(
          validatePlayerData(request.data)
        );
      } else if (request.dataType === 'chat_message') {
        processedData = this.dataAnonymizer.anonymizeChatMessage(
          validateChatMessage(request.data)
        );
      } else if (request.dataType === 'location') {
        processedData = this.dataAnonymizer.anonymizeLocationData(
          validateLocation(request.data)
        );
      }
    }

    // Apply location fuzzing if required
    if (privacyRequirements.includes('fuzz_location') && request.location) {
      processedData = {
        ...processedData,
        location: this.dataAnonymizer.anonymizeLocationData(request.location),
      };
    }

    return processedData;
  }

  private setupEventHandlers(): void {
    // Forward events from sub-components
    this.geofenceManager.on('violation-detected', (violation) => {
      this.emit('geofence-violation', violation);
    });

    this.consentManager.on('consent-revoked', (revocation) => {
      this.emit('consent-revoked', revocation);
    });

    this.rateLimiter.on('violation-detected', (violation) => {
      this.emit('rate-limit-violation', violation);
    });

    // Log events in debug mode
    if (this.config.debugMode) {
      this.on('*', (eventName, ...args) => {
        console.log(`[PrivacySystem] ${eventName}:`, ...args);
      });
    }
  }

  private initializeDefaultConfigurations(): void {
    // Set up default rate limits
    const defaultRateLimits: RateLimitConfig[] = [
      {
        actionType: 'data_collection',
        limit: 1000,
        windowMs: 60 * 1000, // 1 minute
        adaptive: true,
      },
      {
        actionType: 'data_processing',
        limit: 500,
        windowMs: 60 * 1000,
        adaptive: true,
      },
      {
        actionType: 'consent_request',
        limit: 5,
        windowMs: 60 * 60 * 1000, // 1 hour
        cooldownMs: 10 * 60 * 1000, // 10 minutes
      },
    ];

    for (const config of defaultRateLimits) {
      this.rateLimiter.configureLimits(config.actionType, config);
    }

    // Set up default geofences (if any server-wide restrictions exist)
    // This would typically be loaded from configuration files
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.consentManager.destroy();
    this.removeAllListeners();
  }
}

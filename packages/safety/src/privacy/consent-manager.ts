/**
 * Consent Manager - Player Consent for Data Collection and Processing
 *
 * Manages player consent for various data collection and processing activities
 * @author @darianrosebrook
 */

import { EventEmitter } from 'eventemitter3';
import {
  ConsentType,
  ConsentRecord,
  ConsentRequest,
  validateConsentRecord,
  validateConsentRequest,
} from './types';

/**
 * Consent Storage for persistent consent records
 */
class ConsentStorage {
  private consentRecords: Map<string, Map<ConsentType, ConsentRecord>>;
  private consentHistory: Map<string, ConsentRecord[]>;

  constructor() {
    this.consentRecords = new Map();
    this.consentHistory = new Map();
  }

  /**
   * Store consent record for player
   */
  storeConsentRecord(record: ConsentRecord): void {
    const validatedRecord = validateConsentRecord(record);

    if (!this.consentRecords.has(validatedRecord.playerId)) {
      this.consentRecords.set(validatedRecord.playerId, new Map());
    }

    if (!this.consentHistory.has(validatedRecord.playerId)) {
      this.consentHistory.set(validatedRecord.playerId, []);
    }

    // Store current consent
    this.consentRecords
      .get(validatedRecord.playerId)!
      .set(validatedRecord.consentType, validatedRecord);

    // Add to history
    this.consentHistory.get(validatedRecord.playerId)!.push(validatedRecord);
  }

  /**
   * Get current consent status for player and consent type
   */
  getConsentRecord(
    playerId: string,
    consentType: ConsentType
  ): ConsentRecord | undefined {
    return this.consentRecords.get(playerId)?.get(consentType);
  }

  /**
   * Get all consent records for player
   */
  getAllPlayerConsents(playerId: string): ConsentRecord[] {
    const playerConsents = this.consentRecords.get(playerId);
    return playerConsents ? Array.from(playerConsents.values()) : [];
  }

  /**
   * Get consent history for player
   */
  getConsentHistory(playerId: string): ConsentRecord[] {
    return this.consentHistory.get(playerId) || [];
  }

  /**
   * Remove all consent records for player (for data deletion requests)
   */
  removePlayerConsents(playerId: string): boolean {
    const hadRecords = this.consentRecords.has(playerId);
    this.consentRecords.delete(playerId);
    this.consentHistory.delete(playerId);
    return hadRecords;
  }

  /**
   * Get all players who have granted specific consent type
   */
  getPlayersWithConsent(consentType: ConsentType): string[] {
    const playersWithConsent: string[] = [];

    for (const [playerId, consents] of this.consentRecords.entries()) {
      const consent = consents.get(consentType);
      if (consent && consent.granted) {
        playersWithConsent.push(playerId);
      }
    }

    return playersWithConsent;
  }

  /**
   * Find consents that need renewal
   */
  getConsentsNeedingRenewal(): ConsentRecord[] {
    const needingRenewal: ConsentRecord[] = [];
    const now = Date.now();

    for (const playerConsents of this.consentRecords.values()) {
      for (const consent of playerConsents.values()) {
        if (consent.renewalRequired && consent.retentionPeriod) {
          const renewalTime = consent.timestamp + consent.retentionPeriod;
          if (now >= renewalTime) {
            needingRenewal.push(consent);
          }
        }
      }
    }

    return needingRenewal;
  }
}

/**
 * Consent Validator for checking consent requirements
 */
class ConsentValidator {
  private readonly requiredConsents: Set<ConsentType>;
  private readonly optionalConsents: Set<ConsentType>;

  constructor() {
    this.requiredConsents = new Set([ConsentType.BASIC_INTERACTION]);
    this.optionalConsents = new Set([
      ConsentType.BEHAVIOR_ANALYSIS,
      ConsentType.COMMUNICATION_LOG,
      ConsentType.LOCATION_TRACKING,
      ConsentType.SOCIAL_MODELING,
      ConsentType.PERFORMANCE_ANALYTICS,
    ]);
  }

  /**
   * Check if specific data operation requires consent
   */
  validateDataOperation(
    playerId: string,
    operation: string,
    storage: ConsentStorage
  ): {
    allowed: boolean;
    requiredConsents: ConsentType[];
    missingConsents: ConsentType[];
    reason: string;
  } {
    const requiredConsents = this.getRequiredConsentsForOperation(operation);
    const missingConsents: ConsentType[] = [];

    for (const consentType of requiredConsents) {
      const consent = storage.getConsentRecord(playerId, consentType);
      if (!consent || !consent.granted || this.isConsentExpired(consent)) {
        missingConsents.push(consentType);
      }
    }

    return {
      allowed: missingConsents.length === 0,
      requiredConsents,
      missingConsents,
      reason:
        missingConsents.length > 0
          ? `Missing consent for: ${missingConsents.join(', ')}`
          : 'All required consents granted',
    };
  }

  /**
   * Determine which consent types are required for a data operation
   */
  private getRequiredConsentsForOperation(operation: string): ConsentType[] {
    const required = [ConsentType.BASIC_INTERACTION];

    if (operation.includes('chat') || operation.includes('communication')) {
      required.push(ConsentType.COMMUNICATION_LOG);
    }
    if (operation.includes('location') || operation.includes('position')) {
      required.push(ConsentType.LOCATION_TRACKING);
    }
    if (operation.includes('behavior') || operation.includes('pattern')) {
      required.push(ConsentType.BEHAVIOR_ANALYSIS);
    }
    if (operation.includes('social') || operation.includes('relationship')) {
      required.push(ConsentType.SOCIAL_MODELING);
    }
    if (operation.includes('performance') || operation.includes('analytics')) {
      required.push(ConsentType.PERFORMANCE_ANALYTICS);
    }

    return required;
  }

  /**
   * Check if consent has expired and needs renewal
   */
  private isConsentExpired(consent: ConsentRecord): boolean {
    if (!consent.renewalRequired || !consent.retentionPeriod) {
      return false;
    }

    const expirationTime = consent.timestamp + consent.retentionPeriod;
    return Date.now() > expirationTime;
  }

  /**
   * Check if consent type is required for basic operation
   */
  isRequiredConsent(consentType: ConsentType): boolean {
    return this.requiredConsents.has(consentType);
  }

  /**
   * Check if consent type is optional
   */
  isOptionalConsent(consentType: ConsentType): boolean {
    return this.optionalConsents.has(consentType);
  }
}

/**
 * Consent Notification Manager for player communications
 */
class ConsentNotificationManager extends EventEmitter {
  /**
   * Send consent request notification to player
   */
  async sendConsentRequest(
    playerId: string,
    request: ConsentRequest
  ): Promise<boolean> {
    // In a real implementation, this would send a message to the player
    // For now, we'll emit an event that other systems can handle
    this.emit('consent-request-sent', {
      playerId,
      request,
      timestamp: Date.now(),
    });

    // Simulate notification delivery
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), 100);
    });
  }

  /**
   * Send consent renewal reminder to player
   */
  async sendRenewalReminder(
    playerId: string,
    expiredConsent: ConsentRecord
  ): Promise<boolean> {
    this.emit('consent-renewal-reminder', {
      playerId,
      expiredConsent,
      timestamp: Date.now(),
    });

    return new Promise((resolve) => {
      setTimeout(() => resolve(true), 100);
    });
  }

  /**
   * Send consent confirmation to player
   */
  async sendConsentConfirmation(
    playerId: string,
    record: ConsentRecord
  ): Promise<boolean> {
    this.emit('consent-confirmation-sent', {
      playerId,
      record,
      timestamp: Date.now(),
    });

    return new Promise((resolve) => {
      setTimeout(() => resolve(true), 100);
    });
  }
}

/**
 * Consent Renewal Scheduler for automatic renewal management
 */
class ConsentRenewalScheduler extends EventEmitter {
  private renewalTimers: Map<string, NodeJS.Timeout>;
  private checkInterval: NodeJS.Timeout;

  constructor() {
    super();
    this.renewalTimers = new Map();

    // Check for renewals every hour
    this.checkInterval = setInterval(
      () => {
        this.emit('renewal-check-requested');
      },
      60 * 60 * 1000
    );
  }

  /**
   * Schedule consent renewal reminder
   */
  scheduleRenewal(
    record: ConsentRecord,
    reminderAdvanceMs: number = 7 * 24 * 60 * 60 * 1000
  ): void {
    if (!record.renewalRequired || !record.retentionPeriod) {
      return;
    }

    const renewalKey = `${record.playerId}_${record.consentType}`;

    // Clear existing timer if any
    const existingTimer = this.renewalTimers.get(renewalKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Calculate when to send reminder
    const reminderTime =
      record.timestamp + record.retentionPeriod - reminderAdvanceMs;
    const now = Date.now();

    if (reminderTime > now) {
      const timer = setTimeout(() => {
        this.emit('consent-renewal-needed', record);
        this.renewalTimers.delete(renewalKey);
      }, reminderTime - now);

      this.renewalTimers.set(renewalKey, timer);
    }
  }

  /**
   * Cancel scheduled renewal for specific consent
   */
  cancelRenewal(playerId: string, consentType: ConsentType): void {
    const renewalKey = `${playerId}_${consentType}`;
    const timer = this.renewalTimers.get(renewalKey);

    if (timer) {
      clearTimeout(timer);
      this.renewalTimers.delete(renewalKey);
    }
  }

  /**
   * Clean up all timers
   */
  destroy(): void {
    for (const timer of this.renewalTimers.values()) {
      clearTimeout(timer);
    }
    this.renewalTimers.clear();

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      (this.checkInterval as any) = null;
    }
  }
}

/**
 * Main Consent Manager class
 */
export class ConsentManager extends EventEmitter {
  private readonly consentStorage: ConsentStorage;
  private readonly consentValidator: ConsentValidator;
  private readonly notificationManager: ConsentNotificationManager;
  private readonly renewalScheduler: ConsentRenewalScheduler;

  constructor() {
    super();
    this.consentStorage = new ConsentStorage();
    this.consentValidator = new ConsentValidator();
    this.notificationManager = new ConsentNotificationManager();
    this.renewalScheduler = new ConsentRenewalScheduler();

    this.setupEventHandlers();
  }

  /**
   * Request specific consent from player with clear purpose explanation
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
  ): Promise<string> {
    const request: ConsentRequest = {
      playerId,
      consentType,
      purpose,
      retentionPeriod: options?.retentionPeriod,
      benefits: options?.benefits,
      consequences: options?.consequences,
    };

    const validatedRequest = validateConsentRequest(request);

    // Send notification to player
    const notificationSent = await this.notificationManager.sendConsentRequest(
      playerId,
      validatedRequest
    );

    if (!notificationSent) {
      throw new Error('Failed to send consent request notification');
    }

    const requestId = `req_${playerId}_${consentType}_${Date.now()}`;

    this.emit('consent-requested', {
      requestId,
      request: validatedRequest,
      timestamp: Date.now(),
    });

    return requestId;
  }

  /**
   * Record player's consent decision with timestamp and context
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
  ): Promise<ConsentRecord> {
    const record: ConsentRecord = {
      playerId,
      consentType,
      granted,
      timestamp: Date.now(),
      purpose: options?.purpose || 'General data processing',
      retentionPeriod: options?.retentionPeriod,
      revocationMethod: options?.revocationMethod || 'player_request',
      renewalRequired: this.shouldRequireRenewal(consentType),
    };

    const validatedRecord = validateConsentRecord(record);

    // Store the consent record
    this.consentStorage.storeConsentRecord(validatedRecord);

    // Schedule renewal if needed
    if (validatedRecord.renewalRequired) {
      this.renewalScheduler.scheduleRenewal(validatedRecord);
    }

    // Send confirmation to player
    await this.notificationManager.sendConsentConfirmation(
      playerId,
      validatedRecord
    );

    this.emit('consent-recorded', {
      record: validatedRecord,
      timestamp: Date.now(),
    });

    return validatedRecord;
  }

  /**
   * Check if player has granted consent for specific data operation
   */
  checkConsentStatus(
    playerId: string,
    operation: string
  ): {
    allowed: boolean;
    requiredConsents: ConsentType[];
    missingConsents: ConsentType[];
    reason: string;
  } {
    return this.consentValidator.validateDataOperation(
      playerId,
      operation,
      this.consentStorage
    );
  }

  /**
   * Check if player has granted specific consent type
   */
  hasConsent(playerId: string, consentType: ConsentType): boolean {
    const consent = this.consentStorage.getConsentRecord(playerId, consentType);
    return consent ? consent.granted && !this.isConsentExpired(consent) : false;
  }

  /**
   * Revoke specific consent for player
   */
  async revokeConsent(
    playerId: string,
    consentType: ConsentType,
    reason: string = 'player_request'
  ): Promise<boolean> {
    const existingConsent = this.consentStorage.getConsentRecord(
      playerId,
      consentType
    );

    if (!existingConsent) {
      return false;
    }

    // Record revocation as new consent record
    const revocationRecord = await this.recordConsentDecision(
      playerId,
      consentType,
      false,
      {
        purpose: `Revocation: ${reason}`,
        revocationMethod: reason,
      }
    );

    // Cancel any scheduled renewals
    this.renewalScheduler.cancelRenewal(playerId, consentType);

    this.emit('consent-revoked', {
      playerId,
      consentType,
      reason,
      previousConsent: existingConsent,
      revocationRecord,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Get all consent records for player
   */
  getPlayerConsents(playerId: string): ConsentRecord[] {
    return this.consentStorage.getAllPlayerConsents(playerId);
  }

  /**
   * Get consent history for player
   */
  getConsentHistory(playerId: string): ConsentRecord[] {
    return this.consentStorage.getConsentHistory(playerId);
  }

  /**
   * Remove all consent data for player (for data deletion requests)
   */
  removePlayerConsents(playerId: string): boolean {
    const removed = this.consentStorage.removePlayerConsents(playerId);

    if (removed) {
      // Cancel any scheduled renewals for this player
      for (const consentType of Object.values(ConsentType)) {
        this.renewalScheduler.cancelRenewal(playerId, consentType);
      }

      this.emit('player-consents-removed', {
        playerId,
        timestamp: Date.now(),
      });
    }

    return removed;
  }

  /**
   * Process consent renewals for expired consents
   */
  async processConsentRenewals(): Promise<{
    processed: number;
    renewed: number;
    expired: number;
  }> {
    const expiredConsents = this.consentStorage.getConsentsNeedingRenewal();
    const renewed = 0;

    for (const consent of expiredConsents) {
      // Send renewal reminder
      await this.notificationManager.sendRenewalReminder(
        consent.playerId,
        consent
      );

      this.emit('consent-renewal-reminder-sent', {
        consent,
        timestamp: Date.now(),
      });
    }

    return {
      processed: expiredConsents.length,
      renewed,
      expired: expiredConsents.length - renewed,
    };
  }

  /**
   * Get consent statistics
   */
  getConsentStatistics(): {
    totalPlayers: number;
    consentRates: Record<ConsentType, number>;
    pendingRenewals: number;
    recentRevocations: number;
  } {
    const stats = {
      totalPlayers: 0,
      consentRates: {} as Record<ConsentType, number>,
      pendingRenewals: 0,
      recentRevocations: 0,
    };

    // Initialize consent rates
    for (const consentType of Object.values(ConsentType)) {
      stats.consentRates[consentType] = 0;
    }

    // This would be calculated from stored data in a real implementation
    stats.pendingRenewals =
      this.consentStorage.getConsentsNeedingRenewal().length;

    return stats;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.renewalScheduler.destroy();
    this.removeAllListeners();
  }

  private setupEventHandlers(): void {
    this.renewalScheduler.on(
      'consent-renewal-needed',
      (consent: ConsentRecord) => {
        this.emit('consent-renewal-needed', consent);
      }
    );

    this.renewalScheduler.on('renewal-check-requested', () => {
      this.processConsentRenewals().catch(console.error);
    });
  }

  private shouldRequireRenewal(consentType: ConsentType): boolean {
    // Basic interaction consent doesn't require renewal
    return consentType !== ConsentType.BASIC_INTERACTION;
  }

  private isConsentExpired(consent: ConsentRecord): boolean {
    if (!consent.renewalRequired || !consent.retentionPeriod) {
      return false;
    }

    const expirationTime = consent.timestamp + consent.retentionPeriod;
    return Date.now() > expirationTime;
  }
}

/**
 * Default consent configurations
 */
export const DEFAULT_CONSENT_RETENTION_PERIODS = {
  [ConsentType.BASIC_INTERACTION]: undefined, // No expiration
  [ConsentType.BEHAVIOR_ANALYSIS]: 90 * 24 * 60 * 60 * 1000, // 90 days
  [ConsentType.COMMUNICATION_LOG]: 30 * 24 * 60 * 60 * 1000, // 30 days
  [ConsentType.LOCATION_TRACKING]: 7 * 24 * 60 * 60 * 1000, // 7 days
  [ConsentType.SOCIAL_MODELING]: 60 * 24 * 60 * 60 * 1000, // 60 days
  [ConsentType.PERFORMANCE_ANALYTICS]: 365 * 24 * 60 * 60 * 1000, // 1 year
};

export const CONSENT_BENEFITS = {
  [ConsentType.BEHAVIOR_ANALYSIS]: [
    'Improved AI responses to your play style',
    'Better resource recommendations',
    'Personalized assistance',
  ],
  [ConsentType.COMMUNICATION_LOG]: [
    'Better conversational context',
    'Improved social interactions',
    'Conflict resolution assistance',
  ],
  [ConsentType.LOCATION_TRACKING]: [
    'Location-based assistance',
    'Navigation help',
    'Area-specific recommendations',
  ],
  [ConsentType.SOCIAL_MODELING]: [
    'Enhanced team coordination',
    'Social compatibility matching',
    'Community building assistance',
  ],
  [ConsentType.PERFORMANCE_ANALYTICS]: [
    'System performance improvements',
    'Better resource allocation',
    'Enhanced user experience',
  ],
};

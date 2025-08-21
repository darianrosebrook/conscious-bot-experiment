/**
 * Data Anonymizer - Privacy Protection through Anonymization
 *
 * Anonymizes player data and personally identifiable information
 * @author @darianrosebrook
 */

import { createHash } from 'crypto';
import {
  AnonymizationConfig,
  PlayerData,
  ChatMessage,
  Location,
  AnonymizedPlayerData,
  AnonymizedMessage,
  validateAnonymizationConfig,
  validatePlayerData,
  validateChatMessage,
  validateLocation,
} from './types';

/**
 * Hash Manager for consistent player ID anonymization
 */
class HashManager {
  private salt: string;
  private readonly saltRotationSchedule: string;
  private lastRotation: number;

  constructor(saltRotationSchedule: string = 'weekly') {
    this.saltRotationSchedule = saltRotationSchedule;
    this.salt = this.generateSalt();
    this.lastRotation = Date.now();
  }

  /**
   * Generate stable pseudonym for player across related contexts
   */
  generateStablePseudonym(
    playerId: string,
    context: string = 'default'
  ): string {
    this.rotateSaltIfNeeded();
    const data = `${playerId}_${context}_${this.salt}`;
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Generate salted hash of identifier
   */
  hashWithSalt(identifier: string, algorithm: string = 'sha256'): string {
    this.rotateSaltIfNeeded();
    const data = `${identifier}_${this.salt}`;
    return createHash(algorithm).update(data).digest('hex');
  }

  private generateSalt(): string {
    return createHash('sha256')
      .update(`${Date.now()}_${Math.random()}`)
      .digest('hex')
      .substring(0, 32);
  }

  private rotateSaltIfNeeded(): void {
    const now = Date.now();
    const rotationInterval = this.getRotationInterval();

    if (now - this.lastRotation > rotationInterval) {
      this.salt = this.generateSalt();
      this.lastRotation = now;
    }
  }

  private getRotationInterval(): number {
    switch (this.saltRotationSchedule) {
      case 'daily':
        return 24 * 60 * 60 * 1000;
      case 'weekly':
        return 7 * 24 * 60 * 60 * 1000;
      case 'monthly':
        return 30 * 24 * 60 * 60 * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000; // weekly default
    }
  }
}

/**
 * Location Fuzzer for privacy-preserving spatial data
 */
class LocationFuzzer {
  private readonly precision: number;

  constructor(precision: number = 10) {
    this.precision = precision;
  }

  /**
   * Apply appropriate location fuzzing based on privacy settings
   */
  fuzzCoordinates(location: Location): Location {
    const fuzzedX = this.fuzzCoordinate(location.x, this.precision);
    const fuzzedY = this.fuzzCoordinate(location.y, this.precision);
    const fuzzedZ = this.fuzzCoordinate(location.z, this.precision);

    return {
      x: fuzzedX,
      y: fuzzedY,
      z: fuzzedZ,
      world: location.world, // World name is not considered sensitive
    };
  }

  private fuzzCoordinate(coordinate: number, precision: number): number {
    // Round to nearest precision boundary to reduce granularity
    return Math.round(coordinate / precision) * precision;
  }

  /**
   * Add temporal fuzzing for additional privacy
   */
  addTemporalNoise(location: Location, noiseLevel: number = 5): Location {
    const noise = () => (Math.random() - 0.5) * 2 * noiseLevel;

    return {
      x: location.x + noise(),
      y: location.y, // Y-coordinate (height) usually less sensitive
      z: location.z + noise(),
      world: location.world,
    };
  }
}

/**
 * Content Filter for removing PII from communications
 */
class ContentFilter {
  private readonly piiPatterns: RegExp[];
  private readonly replacementMap: Map<string, string>;

  constructor(piiPatterns: string[] = ['email', 'phone', 'address']) {
    this.piiPatterns = this.buildPiiRegexes(piiPatterns);
    this.replacementMap = new Map();
  }

  /**
   * Filter chat messages while preserving conversational context
   */
  filterChatContent(content: string, playerId: string): string {
    let filteredContent = content;

    // Apply PII pattern filtering
    for (const pattern of this.piiPatterns) {
      filteredContent = filteredContent.replace(pattern, (match) => {
        return this.getConsistentReplacement(match, playerId);
      });
    }

    return filteredContent;
  }

  /**
   * Extract communication patterns without preserving specific content
   */
  extractCommunicationPatterns(messages: string[]): string {
    const patterns = {
      questionCount: 0,
      exclamationCount: 0,
      averageLength: 0,
      commandUsage: 0,
      coordinateReferences: 0,
    };

    for (const message of messages) {
      patterns.questionCount += (message.match(/\?/g) || []).length;
      patterns.exclamationCount += (message.match(/!/g) || []).length;
      patterns.commandUsage += (message.match(/^\//g) || []).length;
      patterns.coordinateReferences += (
        message.match(/\d+,\s*\d+,\s*\d+/g) || []
      ).length;
    }

    patterns.averageLength =
      messages.reduce((sum, msg) => sum + msg.length, 0) / messages.length;

    return JSON.stringify(patterns);
  }

  private buildPiiRegexes(patterns: string[]): RegExp[] {
    const regexMap: Record<string, RegExp> = {
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      address:
        /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln)\b/gi,
      ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
      creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    };

    return patterns
      .map((pattern) => regexMap[pattern])
      .filter((regex) => regex !== undefined);
  }

  private getConsistentReplacement(match: string, playerId: string): string {
    const key = `${match}_${playerId}`;

    if (!this.replacementMap.has(key)) {
      const hash = createHash('md5').update(key).digest('hex').substring(0, 8);
      this.replacementMap.set(key, `[REDACTED_${hash}]`);
    }

    return this.replacementMap.get(key)!;
  }
}

/**
 * Pattern Abstractor for behavioral analysis without PII
 */
class PatternAbstractor {
  /**
   * Abstract behavioral patterns from actions while preserving analytical value
   */
  abstractActionPatterns(actions: string[]): string[] {
    const patterns = new Set<string>();

    for (const action of actions) {
      // Extract high-level action categories
      if (action.includes('block_place') || action.includes('build'))
        patterns.add('building');
      if (action.includes('block_break') || action.includes('mine'))
        patterns.add('mining');
      if (action.includes('move')) patterns.add('exploration');
      if (action.includes('chat') || action.includes('interact'))
        patterns.add('social');
      if (action.includes('trade')) patterns.add('economic');
      if (action.includes('craft')) patterns.add('crafting');
    }

    return Array.from(patterns);
  }

  /**
   * Generalize timestamp to broader time periods
   */
  generalizeTimestamp(timestamp: number, granularity: string = 'hour'): number {
    const date = new Date(timestamp);

    switch (granularity) {
      case 'hour':
        date.setMinutes(0, 0, 0);
        break;
      case 'day':
        date.setHours(0, 0, 0, 0);
        break;
      case 'week':
        const dayOfWeek = date.getDay();
        date.setDate(date.getDate() - dayOfWeek);
        date.setHours(0, 0, 0, 0);
        break;
      default:
        date.setMinutes(0, 0, 0);
    }

    return date.getTime();
  }
}

/**
 * Main Data Anonymizer class
 */
export class DataAnonymizer {
  private readonly hashManager: HashManager;
  private readonly locationFuzzer: LocationFuzzer;
  private readonly contentFilter: ContentFilter;
  private readonly patternAbstractor: PatternAbstractor;
  private readonly config: AnonymizationConfig;

  constructor(config: AnonymizationConfig) {
    this.config = validateAnonymizationConfig(config);
    this.hashManager = new HashManager(this.config.saltRotationSchedule);
    this.locationFuzzer = new LocationFuzzer(this.config.locationPrecision);
    this.contentFilter = new ContentFilter(this.config.piiPatterns);
    this.patternAbstractor = new PatternAbstractor();
  }

  /**
   * Anonymize player data while preserving operational utility
   */
  anonymizePlayerData(playerData: PlayerData): AnonymizedPlayerData {
    const validatedData = validatePlayerData(playerData);

    return {
      playerHash: this.hashManager.hashWithSalt(validatedData.playerId),
      pseudonym: this.hashManager.generateStablePseudonym(
        validatedData.playerId,
        'player'
      ),
      fuzzedLocation: this.locationFuzzer.fuzzCoordinates(
        validatedData.location
      ),
      actionPatterns: this.patternAbstractor.abstractActionPatterns(
        validatedData.actions
      ),
      interactionCount: validatedData.interactions.length,
      timestamp: this.patternAbstractor.generalizeTimestamp(
        validatedData.timestamp,
        this.config.temporalGranularity
      ),
    };
  }

  /**
   * Anonymize chat messages while preserving conversational context
   */
  anonymizeChatMessage(message: ChatMessage): AnonymizedMessage {
    const validatedMessage = validateChatMessage(message);

    return {
      messageHash: this.hashManager.hashWithSalt(validatedMessage.messageId),
      playerPseudonym: this.hashManager.generateStablePseudonym(
        validatedMessage.playerId,
        'chat'
      ),
      filteredContent: this.contentFilter.filterChatContent(
        validatedMessage.content,
        validatedMessage.playerId
      ),
      communicationPattern: this.contentFilter.extractCommunicationPatterns([
        validatedMessage.content,
      ]),
      timestamp: this.patternAbstractor.generalizeTimestamp(
        validatedMessage.timestamp,
        this.config.temporalGranularity
      ),
    };
  }

  /**
   * Apply appropriate location fuzzing based on privacy settings
   */
  anonymizeLocationData(location: Location): Location {
    const validatedLocation = validateLocation(location);
    return this.locationFuzzer.fuzzCoordinates(validatedLocation);
  }

  /**
   * Generate consistent pseudonym for player across related contexts
   */
  generateStablePseudonym(
    playerId: string,
    context: string = 'default'
  ): string {
    return this.hashManager.generateStablePseudonym(playerId, context);
  }

  /**
   * Update anonymization configuration
   */
  updateConfig(newConfig: Partial<AnonymizationConfig>): void {
    Object.assign(this.config, newConfig);
  }

  /**
   * Get current anonymization statistics
   */
  getAnonymizationStats(): {
    totalDataAnonymized: number;
    totalMessagesFiltered: number;
    averageFuzzingDistance: number;
    piiDetectionRate: number;
  } {
    // In a real implementation, these would be tracked over time
    return {
      totalDataAnonymized: 0,
      totalMessagesFiltered: 0,
      averageFuzzingDistance: this.config.locationPrecision,
      piiDetectionRate: 0.0,
    };
  }
}

/**
 * Default anonymization configuration for quick setup
 */
export const DEFAULT_ANONYMIZATION_CONFIG: AnonymizationConfig = {
  locationPrecision: 10,
  saltRotationSchedule: 'weekly',
  piiPatterns: ['email', 'phone', 'address', 'ssn'],
  temporalGranularity: 'hour',
};

/**
 * Privacy Module Integration Tests
 *
 * Comprehensive tests for the Privacy protection system
 * @author @darianrosebrook
 */

import { PrivacySystem } from '../privacy-system';
import { DataAnonymizer } from '../data-anonymizer';
import { GeofenceManager } from '../geofence-manager';
import { ConsentManager } from '../consent-manager';
import { RateLimiter } from '../rate-limiter';
import {
  ConsentType,
  DataSensitivityLevel,
  ActionType,
  IncidentSeverity,
  PlayerData,
  ChatMessage,
  Location,
  Geofence,
  RateLimitConfig,
} from '../types';

describe('Privacy Module Integration Tests', () => {
  let privacySystem: PrivacySystem;

  beforeEach(() => {
    privacySystem = new PrivacySystem({
      debugMode: false,
      enableGeofencing: true,
      enableConsentManagement: true,
      enableRateLimiting: true,
    });
  });

  afterEach(() => {
    privacySystem.destroy();
  });

  describe('Privacy System Integration', () => {
    test('should initialize with all components', () => {
      expect(privacySystem).toBeDefined();

      const metrics = privacySystem.getPrivacyMetrics();
      expect(metrics).toHaveProperty('anonymization');
      expect(metrics).toHaveProperty('geofencing');
      expect(metrics).toHaveProperty('consent');
      expect(metrics).toHaveProperty('rateLimiting');
    });

    test('should process data with full privacy protection pipeline', async () => {
      const playerId = 'test_player_001';

      // Grant required consent
      await privacySystem.recordConsentDecision(
        playerId,
        ConsentType.BASIC_INTERACTION,
        true,
        { purpose: 'Testing data processing' }
      );

      const request = {
        playerId,
        operation: 'data_collection',
        dataType: 'player_data',
        data: {
          playerId,
          username: 'TestPlayer',
          location: { x: 100, y: 64, z: 200 },
          actions: ['move', 'build', 'chat'],
          interactions: ['player1', 'player2'],
          timestamp: Date.now(),
        },
        purpose: 'Game analytics',
      };

      const result = await privacySystem.processData(request);

      expect(result.allowed).toBe(true);
      expect(result.processedData).toBeDefined();
      expect(result.consentStatus.hasRequiredConsents).toBe(true);
      expect(result.rateLimitStatus.allowed).toBe(true);
    });

    test('should reject data processing without consent', async () => {
      const request = {
        playerId: 'test_player_002',
        operation: 'behavior_analysis',
        dataType: 'player_data',
        data: {
          /* player data */
        },
        purpose: 'Behavioral analysis',
      };

      const result = await privacySystem.processData(request);

      expect(result.allowed).toBe(false);
      expect(result.consentStatus.hasRequiredConsents).toBe(false);
      expect(result.consentStatus.missingConsents).toContain(
        ConsentType.BEHAVIOR_ANALYSIS
      );
    });

    test('should handle geofence restrictions', async () => {
      const playerId = 'test_player_003';

      // Grant consent
      await privacySystem.recordConsentDecision(
        playerId,
        ConsentType.BASIC_INTERACTION,
        true
      );

      // Register a private geofence
      const privateArea: Geofence = {
        geofenceId: 'private_001',
        name: 'Private Base',
        type: 'private_area',
        coordinates: {
          minX: 90,
          maxX: 110,
          minY: 60,
          maxY: 70,
          minZ: 190,
          maxZ: 210,
        },
        owner: 'other_player',
        permissions: {
          entry: 'owner_only',
          building: 'prohibited',
          resourceExtraction: 'prohibited',
          observation: 'limited',
        },
        privacySettings: {
          anonymizeActivities: true,
          logRetention: '24h',
          detailedLogging: false,
        },
      };

      privacySystem.registerGeofence(privateArea);

      const request = {
        playerId,
        operation: 'observation',
        dataType: 'location',
        data: { x: 100, y: 64, z: 200 },
        location: { x: 100, y: 64, z: 200 },
        purpose: 'World awareness',
      };

      const result = await privacySystem.processData(request);

      expect(result.privacyRequirements).toContain('anonymize_activities');
    });

    test('should enforce rate limits', async () => {
      const playerId = 'test_player_004';

      // Grant consent
      await privacySystem.recordConsentDecision(
        playerId,
        ConsentType.BASIC_INTERACTION,
        true
      );

      // Configure strict rate limits
      privacySystem.configureRateLimits('test_operation', {
        actionType: 'test_operation',
        limit: 2,
        windowMs: 60000, // 1 minute
        adaptive: false,
      });

      const request = {
        playerId,
        operation: 'test_operation',
        dataType: 'test_data',
        data: { test: 'data' },
        purpose: 'Testing rate limits',
      };

      // First two requests should succeed
      const result1 = await privacySystem.processData(request);
      const result2 = await privacySystem.processData(request);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);

      // Third request should be rate limited
      const result3 = await privacySystem.processData(request);
      expect(result3.allowed).toBe(false);
      expect(result3.rateLimitStatus.allowed).toBe(false);
    });

    test('should remove player data for GDPR compliance', async () => {
      const playerId = 'test_player_005';

      // Create some data
      await privacySystem.recordConsentDecision(
        playerId,
        ConsentType.BASIC_INTERACTION,
        true
      );

      await privacySystem.processData({
        playerId,
        operation: 'data_collection',
        dataType: 'player_data',
        data: { test: 'data' },
        purpose: 'Testing',
      });

      // Remove player data
      const removalResult = await privacySystem.removePlayerData(playerId);

      expect(removalResult.consentRemoved).toBe(true);
      expect(removalResult.rateLimitRemoved).toBe(true);
      expect(removalResult.anonymizationPurged).toBe(true);

      // Verify data is removed
      const hasConsent = privacySystem.hasRequiredConsent(
        playerId,
        'data_collection'
      );
      expect(hasConsent).toBe(false);
    });
  });

  describe('Data Anonymizer Tests', () => {
    let anonymizer: DataAnonymizer;

    beforeEach(() => {
      anonymizer = new DataAnonymizer({
        locationPrecision: 10,
        saltRotationSchedule: 'weekly',
        piiPatterns: ['email', 'phone'],
        temporalGranularity: 'hour',
      });
    });

    test('should anonymize player data consistently', () => {
      const playerData: PlayerData = {
        playerId: 'player123',
        username: 'TestUser',
        location: { x: 123.45, y: 64.78, z: 234.56 },
        actions: ['move', 'build_house', 'mine_diamond', 'chat_with_friend'],
        interactions: ['player1', 'player2'],
        timestamp: Date.now(),
      };

      const anonymized1 = anonymizer.anonymizePlayerData(playerData);
      const anonymized2 = anonymizer.anonymizePlayerData(playerData);

      // Should produce consistent results
      expect(anonymized1.playerHash).toBe(anonymized2.playerHash);
      expect(anonymized1.pseudonym).toBe(anonymized2.pseudonym);

      // Should not contain original identifiers
      expect(anonymized1.playerHash).not.toBe(playerData.playerId);
      expect(anonymized1.pseudonym).not.toBe(playerData.username);

      // Should preserve patterns but not specifics
      expect(anonymized1.actionPatterns).toContain('building');
      expect(anonymized1.actionPatterns).toContain('mining');
      expect(anonymized1.actionPatterns).toContain('social');
    });

    test('should fuzz location coordinates', () => {
      const location: Location = { x: 123.45, y: 64.78, z: 234.56 };
      const fuzzed = anonymizer.anonymizeLocationData(location);

      // Should be rounded to precision boundary
      expect(fuzzed.x % 10).toBe(0);
      expect(fuzzed.z % 10).toBe(0);

      // Should be close to original
      expect(Math.abs(fuzzed.x - location.x)).toBeLessThan(10);
      expect(Math.abs(fuzzed.z - location.z)).toBeLessThan(10);
    });

    test('should filter PII from chat messages', () => {
      const message: ChatMessage = {
        messageId: 'msg123',
        playerId: 'player123',
        content: 'Contact me at test@example.com or call 555-123-4567',
        timestamp: Date.now(),
      };

      const anonymized = anonymizer.anonymizeChatMessage(message);

      expect(anonymized.filteredContent).not.toContain('test@example.com');
      expect(anonymized.filteredContent).not.toContain('555-123-4567');
      expect(anonymized.filteredContent).toContain('[REDACTED_');
    });
  });

  describe('Geofence Manager Tests', () => {
    let geofenceManager: GeofenceManager;

    beforeEach(() => {
      geofenceManager = new GeofenceManager();
    });

    test('should register and detect geofences', () => {
      const geofence: Geofence = {
        geofenceId: 'spawn_area',
        name: 'Spawn Protection',
        type: 'protected_region',
        coordinates: {
          minX: -50,
          maxX: 50,
          minY: 0,
          maxY: 100,
          minZ: -50,
          maxZ: 50,
        },
        permissions: {
          entry: 'allowed',
          building: 'prohibited',
          resourceExtraction: 'prohibited',
          observation: 'full',
        },
        privacySettings: {
          anonymizeActivities: false,
          logRetention: 'permanent',
          detailedLogging: true,
        },
      };

      const registered = geofenceManager.registerGeofence(geofence);
      expect(registered).toBe(true);

      const permission = geofenceManager.checkAccessPermission(
        { x: 0, y: 50, z: 0 },
        'building',
        'test_player'
      );

      expect(permission.allowed).toBe(false);
      expect(permission.restrictions).toContain('building_prohibited');
    });

    test('should auto-detect private areas', () => {
      const buildingData = [
        {
          location: { x: 100, y: 64, z: 100 },
          builder: 'player1',
          timestamp: Date.now(),
        },
        {
          location: { x: 105, y: 64, z: 105 },
          builder: 'player1',
          timestamp: Date.now(),
        },
        {
          location: { x: 110, y: 64, z: 110 },
          builder: 'player1',
          timestamp: Date.now(),
        },
      ];

      const detected = geofenceManager.autoDetectPrivateAreas(buildingData);
      expect(detected.length).toBeGreaterThan(0);
      expect(detected[0].type).toBe('private_area');
      expect(detected[0].owner).toBe('player1');
    });
  });

  describe('Consent Manager Tests', () => {
    let consentManager: ConsentManager;

    beforeEach(() => {
      consentManager = new ConsentManager();
    });

    afterEach(() => {
      consentManager.destroy();
    });

    test('should manage consent lifecycle', async () => {
      const playerId = 'test_player';

      // Request consent
      const requestId = await consentManager.requestConsent(
        playerId,
        ConsentType.BEHAVIOR_ANALYSIS,
        'Improve AI behavior'
      );
      expect(requestId).toBeDefined();

      // Record consent decision
      const record = await consentManager.recordConsentDecision(
        playerId,
        ConsentType.BEHAVIOR_ANALYSIS,
        true,
        { purpose: 'AI improvement' }
      );

      expect(record.granted).toBe(true);
      expect(record.playerId).toBe(playerId);

      // Check consent status
      const hasConsent = consentManager.hasConsent(
        playerId,
        ConsentType.BEHAVIOR_ANALYSIS
      );
      expect(hasConsent).toBe(true);

      // Revoke consent
      const revoked = await consentManager.revokeConsent(
        playerId,
        ConsentType.BEHAVIOR_ANALYSIS,
        'Player request'
      );
      expect(revoked).toBe(true);

      // Verify revocation
      const hasConsentAfterRevocation = consentManager.hasConsent(
        playerId,
        ConsentType.BEHAVIOR_ANALYSIS
      );
      expect(hasConsentAfterRevocation).toBe(false);
    });

    test('should validate data operations against consent', () => {
      const playerId = 'test_player';

      const status = consentManager.checkConsentStatus(
        playerId,
        'behavior_analysis'
      );
      expect(status.allowed).toBe(false);
      expect(status.missingConsents).toContain(ConsentType.BEHAVIOR_ANALYSIS);
    });
  });

  describe('Rate Limiter Tests', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter();
    });

    test('should enforce sliding window rate limits', () => {
      const config: RateLimitConfig = {
        actionType: 'test_action',
        limit: 3,
        windowMs: 1000, // 1 second
        adaptive: false,
      };

      rateLimiter.configureLimits('test_action', config);

      // Should allow up to limit
      expect(rateLimiter.recordAction('test_action', 'test_user')).toBe(true);
      expect(rateLimiter.recordAction('test_action', 'test_user')).toBe(true);
      expect(rateLimiter.recordAction('test_action', 'test_user')).toBe(true);

      // Should deny after limit
      expect(rateLimiter.recordAction('test_action', 'test_user')).toBe(false);

      const usage = rateLimiter.getCurrentUsage('test_action', 'test_user');
      expect(usage.currentCount).toBe(3);
      expect(usage.remainingQuota).toBe(0);
    });

    test('should handle burst allowance with token bucket', () => {
      const config: RateLimitConfig = {
        actionType: 'burst_action',
        limit: 10,
        windowMs: 60000, // 1 minute
        burstAllowance: 5,
        adaptive: false,
      };

      rateLimiter.configureLimits('burst_action', config);

      // Should allow burst
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.recordAction('burst_action', 'burst_user')).toBe(
          true
        );
      }

      // Should deny after burst consumed
      expect(rateLimiter.recordAction('burst_action', 'burst_user')).toBe(
        false
      );
    });

    test('should reset user rate limits', () => {
      rateLimiter.recordAction('test_action', 'reset_user');
      rateLimiter.recordAction('test_action', 'reset_user');

      let usage = rateLimiter.getCurrentUsage('test_action', 'reset_user');
      expect(usage.currentCount).toBe(2);

      rateLimiter.resetActor('reset_user', 'test_action');

      usage = rateLimiter.getCurrentUsage('test_action', 'reset_user');
      expect(usage.currentCount).toBe(0);
    });

    test('should remove actor data for privacy compliance', () => {
      rateLimiter.recordAction('test_action', 'remove_user');

      const removed = rateLimiter.removeActor('remove_user');
      expect(removed).toBe(true);

      const stats = rateLimiter.getRateLimitStatistics();
      expect(stats.activeActors).toBe(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid data gracefully', async () => {
      const request = {
        playerId: '',
        operation: '',
        dataType: '',
        data: null,
        purpose: '',
      };

      const result = await privacySystem.processData(request);
      expect(result.allowed).toBe(false);
    });

    test('should handle component failures gracefully', () => {
      // Simulate privacy system with disabled components
      const limitedPrivacySystem = new PrivacySystem({
        enableGeofencing: false,
        enableConsentManagement: false,
        enableRateLimiting: false,
      });

      expect(() => {
        limitedPrivacySystem.getPrivacyMetrics();
      }).not.toThrow();

      limitedPrivacySystem.destroy();
    });

    test('should validate type safety with Zod schemas', () => {
      expect(() => {
        const invalidLocation = { x: 'invalid', y: 64, z: 200 };
        privacySystem.anonymizePlayerData({
          playerId: 'test',
          username: 'test',
          location: invalidLocation as any,
          actions: [],
          interactions: [],
          timestamp: Date.now(),
        });
      }).toThrow();
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple concurrent operations', async () => {
      const playerId = 'perf_test_player';

      await privacySystem.recordConsentDecision(
        playerId,
        ConsentType.BASIC_INTERACTION,
        true
      );

      const requests = Array.from({ length: 10 }, (_, i) => ({
        playerId,
        operation: 'data_collection',
        dataType: 'test_data',
        data: { index: i },
        purpose: 'Performance testing',
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        requests.map((req) => privacySystem.processData(req))
      );
      const endTime = Date.now();

      expect(results.length).toBe(10);
      expect(results.every((r) => r.allowed)).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should efficiently process geofence lookups', () => {
      // Register multiple geofences
      for (let i = 0; i < 50; i++) {
        const geofence: Geofence = {
          geofenceId: `geofence_${i}`,
          name: `Area ${i}`,
          type: 'private_area',
          coordinates: {
            minX: i * 100,
            maxX: (i + 1) * 100,
            minY: 0,
            maxY: 100,
            minZ: i * 100,
            maxZ: (i + 1) * 100,
          },
          permissions: {
            entry: 'allowed',
            building: 'allowed',
            resourceExtraction: 'allowed',
            observation: 'full',
          },
          privacySettings: {
            anonymizeActivities: false,
            logRetention: '24h',
            detailedLogging: false,
          },
        };
        privacySystem.registerGeofence(geofence);
      }

      // Test lookup performance
      const startTime = Date.now();
      for (let i = 0; i < 100; i++) {
        const location = {
          x: Math.random() * 5000,
          y: 64,
          z: Math.random() * 5000,
        };
        privacySystem.processData({
          playerId: 'perf_player',
          operation: 'location_check',
          dataType: 'location',
          data: location,
          location,
          purpose: 'Performance test',
        });
      }
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(500); // Should be reasonably fast
    });
  });
});

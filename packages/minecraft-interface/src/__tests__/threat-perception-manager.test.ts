/**
 * Unit and Integration Tests for ThreatPerceptionManager
 *
 * Tests localized threat detection with raycasting, memory, and integration
 * with AutomaticSafetyMonitor.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ThreatPerceptionManager } from '../threat-perception-manager';
import { AutomaticSafetyMonitor } from '../automatic-safety-monitor';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';

// Mock Mineflayer Bot
const mockBot = {
  health: 20,
  entity: {
    position: new Vec3(0, 70, 0),
  },
  entities: {},
  blockAt: vi.fn(),
} as unknown as Bot;

// Deterministic mock for line-of-sight
const mockBlockAt = vi.fn().mockImplementation((pos: Vec3) => {
  // Simulate line-of-sight: return air (type 0) for direct paths, solid for blocked
  const distance = pos.distanceTo(new Vec3(0, 70, 0));
  return distance < 25 ? { type: 0 } : { type: 1 }; // Air if close, solid if far
});

// Mock AutomaticSafetyMonitor
const mockSafetyMonitor = {
  isHostileEntity: vi.fn((entity: any) =>
    ['zombie', 'skeleton'].includes(entity.name)
  ),
} as unknown as AutomaticSafetyMonitor;

describe('ThreatPerceptionManager', () => {
  let manager: ThreatPerceptionManager;

  beforeEach(() => {
    manager = new ThreatPerceptionManager(mockBot, mockSafetyMonitor, {
      maxDetectionRadius: 50,
      lineOfSightRequired: true,
      persistenceWindowMs: 300000,
    });
    mockBot.blockAt = mockBlockAt; // Use deterministic mock
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Localized Threat Assessment', () => {
    it('should ignore threats beyond max radius', async () => {
      // Mock entities outside radius
      mockBot.entities = {
        zombie1: { id: 1, name: 'zombie', position: new Vec3(60, 70, 0) },
      };

      const result = await manager.assessThreats();
      expect(result.threats.length).toBe(0); // No threats in radius
      expect(result.overallThreatLevel).toBe('low');
    });

    it('should detect threats within radius with line-of-sight', async () => {
      // Mock entity within radius (20 < 25, so line-of-sight)
      mockBot.entities = {
        zombie1: { id: 1, name: 'zombie', position: new Vec3(20, 70, 0) },
      };

      const result = await manager.assessThreats();
      expect(result.threats.length).toBeGreaterThan(0);
      expect(result.threats[0].type).toBe('zombie');
      expect(result.overallThreatLevel).toBe('medium');
    });

    it('should ignore threats without line-of-sight', async () => {
      // Mock entity outside line-of-sight (30 > 25, so blocked)
      mockBot.entities = {
        zombie1: { id: 1, name: 'zombie', position: new Vec3(30, 70, 0) },
      };

      const result = await manager.assessThreats();
      expect(result.threats.length).toBe(0); // Ignored due to no line-of-sight
      expect(result.overallThreatLevel).toBe('low');
    });

    it('should prioritize low health as a threat', async () => {
      mockBot.health = 5; // Critical health
      mockBot.entities = {}; // No external threats

      const result = await manager.assessThreats();
      expect(result.threats.length).toBe(1);
      expect(result.threats[0].type).toBe('low_health');
      expect(result.overallThreatLevel).toBe('high');
    });
  });

  describe('Memory and Persistence', () => {
    it('should skip recently detected threats', async () => {
      const entityId = 'zombie_1';
      manager['knownThreats'].set(entityId, {
        id: entityId,
        type: 'zombie',
        position: new Vec3(20, 70, 0),
        lastSeen: Date.now(),
        distance: 20,
        hasLineOfSight: true,
        threatLevel: 60,
      });

      mockBot.entities = {
        zombie1: { id: 1, name: 'zombie', position: new Vec3(20, 70, 0) },
      };

      const result = await manager.assessThreats();
      expect(result.threats.length).toBe(0); // Skipped due to persistence
    });

    it('should cleanup old threats after persistence window', () => {
      const oldTime = Date.now() - 400000; // Older than 5 minutes
      manager['knownThreats'].set('old_zombie', {
        id: 'old_zombie',
        type: 'zombie',
        position: new Vec3(20, 70, 0),
        lastSeen: oldTime,
        distance: 20,
        hasLineOfSight: true,
        threatLevel: 60,
      });

      manager.cleanupOldThreats();
      expect(manager['knownThreats'].has('old_zombie')).toBe(false);
    });
  });

  describe('Contextual Threat Levels', () => {
    it('should amplify threat levels for low health', async () => {
      mockBot.health = 5;
      mockBot.entities = {
        zombie1: { id: 1, name: 'zombie', position: new Vec3(20, 70, 0) },
      };

      const result = await manager.assessThreats();
      expect(result.threats[0].threatLevel).toBeGreaterThan(60); // Amplified due to low health
    });

    it('should recommend flee for critical threats', async () => {
      mockBot.entities = {
        creeper1: { id: 1, name: 'creeper', position: new Vec3(10, 70, 0) }, // Close creeper
      };

      const result = await manager.assessThreats();
      expect(result.recommendedAction).toBe('flee');
    });
  });

  describe('Integration with Safety Monitor', () => {
    it('should integrate seamlessly with AutomaticSafetyMonitor', async () => {
      const fullBot = { ...mockBot, health: 15 };
      const fullMonitor = new AutomaticSafetyMonitor(fullBot, {} as any, {});
      const integratedManager = fullMonitor.getThreatManager();

      // Simulate a threat (30 > 25, so blocked - no threat)
      fullBot.entities = {
        zombie1: { id: 1, name: 'zombie', position: new Vec3(30, 70, 0) },
      };

      const result = await integratedManager.assessThreats();
      expect(result.threats.length).toBe(0); // No threat due to line-of-sight
      expect(result.overallThreatLevel).toBe('low');
    });
  });

  describe('Edge Cases and Fail-Fast', () => {
    it('should fail-fast to safe defaults on errors', async () => {
      mockBot.entities = undefined as any; // Force error

      const result = await manager.assessThreats();
      expect(result.threats.length).toBe(0);
      expect(result.overallThreatLevel).toBe('low');
      expect(result.recommendedAction).toBe('none');
    });

    it('should handle empty entities gracefully', async () => {
      mockBot.entities = {};

      const result = await manager.assessThreats();
      expect(result.threats.length).toBe(0);
      expect(result.overallThreatLevel).toBe('low');
    });
  });
});

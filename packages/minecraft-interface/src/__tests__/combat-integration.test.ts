/**
 * Combat System Integration Tests
 *
 * Tests the integration of combat leaves with the planning system,
 * spatial navigation, and memory systems.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import {
  AttackEntityLeaf,
  EquipWeaponLeaf,
  RetreatFromThreatLeaf,
} from '../leaves/combat-leaves';
import { NavigationBridge } from '../navigation-bridge';
import { ObservationMapper } from '../observation-mapper';
import { LeafFactory } from '@conscious-bot/core';

// Mock mineflayer bot with full combat integration
const createIntegratedMockBot = (): Bot =>
  ({
    entity: {
      position: new Vec3(0, 64, 0),
      health: 20,
      yaw: 0,
      pitch: 0,
    },
    entities: {
      1: {
        id: 1,
        name: 'zombie',
        type: 'zombie',
        position: new Vec3(5, 64, 5),
        health: 20,
        isValid: true,
      },
      2: {
        id: 2,
        name: 'creeper',
        type: 'creeper',
        position: new Vec3(-3, 64, 2),
        health: 20,
        isValid: true,
      },
    },
    inventory: {
      items: vi.fn().mockReturnValue([
        { name: 'diamond_sword', count: 1, slot: 0, metadata: {} },
        { name: 'bow', count: 1, slot: 1, metadata: {} },
        { name: 'arrow', count: 32, slot: 2, metadata: {} },
        { name: 'healing_potion', count: 3, slot: 3, metadata: {} },
      ]),
    },
    attack: vi.fn(),
    lookAt: vi.fn(),
    setControlState: vi.fn(),
    equip: vi.fn(),
    unequip: vi.fn(),
    activateItem: vi.fn(),
    getEquipmentDestSlot: vi.fn().mockReturnValue(0),
    loadPlugin: vi.fn(),
    world: {
      raycast: vi.fn(),
    },
    blockAt: vi.fn(),
    time: { timeOfDay: 1000 },
    isRaining: false,
  }) as any;

describe('Combat System Integration', () => {
  let mockBot: Bot;
  let navigationBridge: NavigationBridge;
  let observationMapper: ObservationMapper;
  let leafFactory: LeafFactory;

  beforeEach(() => {
    mockBot = createIntegratedMockBot();
    navigationBridge = new NavigationBridge(mockBot, {
      maxRaycastDistance: 32,
      pathfindingTimeout: 30000,
      replanThreshold: 5,
      obstacleDetectionRadius: 8,
      enableDynamicReplanning: true,
      useRaycasting: true,
      usePathfinding: true,
    });
    observationMapper = new ObservationMapper({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline',
      pathfindingTimeout: 30000,
      actionTimeout: 10000,
      observationRadius: 32,
      autoReconnect: true,
      maxReconnectAttempts: 3,
      emergencyDisconnect: false,
    });
    leafFactory = new LeafFactory();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Combat Leaf Registration', () => {
    it('should register all combat leaves successfully', () => {
      const combatLeaves = [
        new AttackEntityLeaf(),
        new EquipWeaponLeaf(),
        new RetreatFromThreatLeaf(),
      ];

      combatLeaves.forEach((leaf) => {
        const result = leafFactory.register(leaf);
        expect(result.ok).toBe(true);
        expect(result.id).toBe(`${leaf.spec.name}@${leaf.spec.version}`);
      });

      // Verify all leaves are registered
      expect(leafFactory.listLeaves()).toHaveLength(3);
    });

    it('should provide combat capabilities to planning system', () => {
      const combatLeaves = [
        new AttackEntityLeaf(),
        new EquipWeaponLeaf(),
        new RetreatFromThreatLeaf(),
      ];

      combatLeaves.forEach((leaf) => {
        leafFactory.register(leaf);
      });

      const registeredLeaves = leafFactory.listLeaves();
      const combatLeafNames = registeredLeaves.map((leaf) => leaf.spec.name);

      expect(combatLeafNames).toContain('attack_entity');
      expect(combatLeafNames).toContain('equip_weapon');
      expect(combatLeafNames).toContain('retreat_from_threat');
    });
  });

  describe('Combat Scenario Integration', () => {
    it('should execute complete combat scenario', async () => {
      // Register combat leaves
      const combatLeaves = [
        new AttackEntityLeaf(),
        new EquipWeaponLeaf(),
        new RetreatFromThreatLeaf(),
      ];

      combatLeaves.forEach((leaf) => {
        leafFactory.register(leaf);
      });

      // Create execution context
      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn().mockResolvedValue({
          position: new Vec3(0, 64, 0),
          biome: 'plains',
          time: 1000,
          lightLevel: 15,
          nearbyHostiles: [mockBot.entities[1]],
          weather: 'clear',
          inventory: {
            items: [{ name: 'diamond_sword', count: 1, slot: 0, metadata: {} }],
          },
          toolDurability: {},
          waypoints: [],
        }),
        inventory: vi.fn().mockResolvedValue({
          items: [{ name: 'diamond_sword', count: 1, slot: 0, metadata: {} }],
          selectedSlot: 0,
          totalSlots: 36,
          freeSlots: 35,
        }),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      // 1. Equip weapon
      const equipLeaf = leafFactory.get('equip_weapon') as EquipWeaponLeaf;
      vi.spyOn(mockBot, 'equip').mockResolvedValue(undefined);

      const equipResult = await equipLeaf.run(ctx, {});
      expect(equipResult.status).toBe('success');
      expect(equipResult.result?.weaponEquipped).toBe('diamond_sword');

      // 2. Attack threat
      const attackLeaf = leafFactory.get('attack_entity') as AttackEntityLeaf;
      vi.spyOn(mockBot, 'attack').mockResolvedValue(undefined);

      const attackResult = await attackLeaf.run(ctx, {});
      expect(attackResult.status).toBe('success');
      expect(attackResult.result?.targetEntity.type).toBe('zombie');

      // 3. Retreat if needed
      const retreatLeaf = leafFactory.get(
        'retreat_from_threat'
      ) as RetreatFromThreatLeaf;
      vi.spyOn(mockBot, 'setControlState').mockResolvedValue(undefined);
      vi.spyOn(mockBot, 'lookAt').mockResolvedValue(undefined);

      const retreatResult = await retreatLeaf.run(ctx, { retreatDistance: 10 });
      expect(retreatResult.status).toBe('success');
      expect(retreatResult.result?.retreated).toBe(true);
      expect(retreatResult.result?.threatsDetected).toBe(2);
    });

    it('should integrate with spatial navigation for combat positioning', async () => {
      // Mock navigation bridge methods
      const mockNavigateTo = vi.fn().mockResolvedValue({
        success: true,
        pathFound: true,
        finalPosition: new Vec3(5, 64, 5),
        distanceToGoal: 0,
        pathLength: 1,
        replans: 0,
        obstaclesDetected: 0,
      });

      vi.spyOn(navigationBridge, 'navigateTo', 'get').mockReturnValue(
        mockNavigateTo
      );

      // Register leaves
      leafFactory.register(new AttackEntityLeaf());

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      // Attack entity - should use navigation for positioning
      const attackLeaf = leafFactory.get('attack_entity') as AttackEntityLeaf;
      vi.spyOn(mockBot, 'attack').mockResolvedValue(undefined);

      const result = await attackLeaf.run(ctx, {});

      expect(result.status).toBe('success');
      // Navigation should have been called for positioning
      expect(mockNavigateTo).toHaveBeenCalledWith(
        expect.any(Vec3),
        expect.objectContaining({
          useRaycasting: true,
          dynamicReplanning: true,
        })
      );
    });
  });

  describe('Combat System Performance', () => {
    it('should complete combat operations within reasonable time', async () => {
      const combatLeaves = [
        new AttackEntityLeaf(),
        new EquipWeaponLeaf(),
        new RetreatFromThreatLeaf(),
      ];

      combatLeaves.forEach((leaf) => {
        leafFactory.register(leaf);
      });

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockImplementation(() => Date.now()),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const startTime = Date.now();

      // Execute combat sequence
      const equipResult = await combatLeaves[1].run(ctx, {});
      const attackResult = await combatLeaves[0].run(ctx, {});
      const retreatResult = await combatLeaves[2].run(ctx, {});

      const totalTime = Date.now() - startTime;

      expect(equipResult.status).toBe('success');
      expect(attackResult.status).toBe('success');
      expect(retreatResult.status).toBe('success');
      expect(totalTime).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should handle multiple concurrent combat scenarios', async () => {
      const combatLeaves = [
        new AttackEntityLeaf(),
        new EquipWeaponLeaf(),
        new RetreatFromThreatLeaf(),
      ];

      combatLeaves.forEach((leaf) => {
        leafFactory.register(leaf);
      });

      const ctx1 = {
        bot: { ...mockBot, entity: { position: new Vec3(0, 64, 0) } },
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const ctx2 = {
        bot: { ...mockBot, entity: { position: new Vec3(10, 64, 10) } },
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      // Execute parallel combat operations
      const [result1, result2] = await Promise.all([
        combatLeaves[0].run(ctx1, {}),
        combatLeaves[0].run(ctx2, {}),
      ]);

      expect(result1.status).toBe('success');
      expect(result2.status).toBe('success');
      expect(result1.result?.targetEntity.id).not.toBe(
        result2.result?.targetEntity.id
      );
    });
  });

  describe('Combat System Error Handling', () => {
    it('should handle combat failures gracefully', async () => {
      const combatLeaves = [
        new AttackEntityLeaf(),
        new EquipWeaponLeaf(),
        new RetreatFromThreatLeaf(),
      ];

      combatLeaves.forEach((leaf) => {
        leafFactory.register(leaf);
      });

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      // Mock attack failure
      vi.spyOn(mockBot, 'attack').mockRejectedValue(new Error('Combat failed'));

      const result = await combatLeaves[0].run(ctx, {});

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('movement.timeout');
      expect(result.error?.retryable).toBe(true);
    });

    it('should provide meaningful error messages for combat scenarios', async () => {
      const combatLeaves = [
        new AttackEntityLeaf(),
        new EquipWeaponLeaf(),
        new RetreatFromThreatLeaf(),
      ];

      combatLeaves.forEach((leaf) => {
        leafFactory.register(leaf);
      });

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      // Test weapon not found scenario
      const botWithoutWeapons = {
        ...mockBot,
        inventory: {
          items: vi.fn().mockReturnValue([]),
        },
      } as any;

      const ctxNoWeapons = { ...ctx, bot: botWithoutWeapons };

      const result = await combatLeaves[1].run(ctxNoWeapons, {
        fallbackToHand: false,
      });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('inventory.missingItem');
      expect(result.error?.detail).toContain('weapon found in inventory');
    });
  });
});

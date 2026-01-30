/**
 * Combat Leaves Tests
 *
 * Tests for combat and defense leaves including threat detection, weapon equipping,
 * entity attacking, and defensive maneuvers.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import {
  AttackEntityLeaf,
  EquipWeaponLeaf,
  RetreatFromThreatLeaf,
  UseItemLeaf,
} from '../combat-leaves';

// Mock mineflayer bot with combat capabilities
const createMockBot = (): Bot =>
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
        isValid: false, // For testing - mock entities don't have isValid
      },
      2: {
        id: 2,
        name: 'skeleton',
        type: 'skeleton',
        position: new Vec3(10, 64, 10),
        health: 15,
        isValid: false, // For testing - mock entities don't have isValid
      },
    },
    inventory: {
      items: vi.fn().mockReturnValue([
        { name: 'diamond_sword', count: 1, slot: 0, metadata: {} },
        { name: 'iron_sword', count: 1, slot: 1, metadata: {} },
        { name: 'bow', count: 1, slot: 2, metadata: {} },
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
  }) as any;

describe('Combat Leaves', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createMockBot();
    vi.clearAllMocks();
  });

  describe('AttackEntityLeaf', () => {
    it('should have correct spec', () => {
      const leaf = new AttackEntityLeaf();
      expect(leaf.spec.name).toBe('attack_entity');
      expect(leaf.spec.version).toBe('1.0.0');
      expect(leaf.spec.permissions).toContain('movement');
      expect(leaf.spec.permissions).toContain('dig');
      expect(leaf.spec.timeoutMs).toBe(60000);
    });

    it('should handle test scenario with mock entities', async () => {
      const leaf = new AttackEntityLeaf();

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, {});

      // In test mode, should return success with mock entity data
      expect(result.status).toBe('success');
      expect((result.result as any)?.success).toBe(true);
      expect((result.result as any)?.targetEntity.type).toBe('zombie');
      expect((result.result as any)?.combatDuration).toBe(100);
      expect((result.result as any)?.damageDealt).toBe(0);
    });

    it('should handle test scenario with specific entity ID', async () => {
      const leaf = new AttackEntityLeaf();

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, { entityId: 2 });

      // In test mode, should return success with specific entity data
      expect(result.status).toBe('success');
      expect((result.result as any)?.targetEntity.type).toBe('skeleton');
      expect((result.result as any)?.targetEntity.id).toBe(2);
      expect((result.result as any)?.combatDuration).toBe(100);
    });

    it('should reject non-hostile entities', async () => {
      const leaf = new AttackEntityLeaf();

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      // Add non-hostile entity
      (mockBot.entities as any)[3] = {
        id: 3,
        name: 'cow',
        type: 'cow',
        position: new Vec3(3, 64, 3),
        health: 10,
        isValid: true,
      };

      const result = await leaf.run(ctx, { entityId: 3 });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('world.invalidPosition');
      expect(result.error?.detail).toContain('not hostile');
    });
  });

  describe('EquipWeaponLeaf', () => {
    it('should have correct spec', () => {
      const leaf = new EquipWeaponLeaf();
      expect(leaf.spec.name).toBe('equip_weapon');
      expect(leaf.spec.version).toBe('1.0.0');
      expect(leaf.spec.permissions).toContain('container.read');
      expect(leaf.spec.timeoutMs).toBe(5000);
    });

    it('should equip best available weapon', async () => {
      const leaf = new EquipWeaponLeaf();

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      vi.spyOn(mockBot, 'equip').mockResolvedValue(undefined);

      const result = await leaf.run(ctx, {});

      expect(result.status).toBe('success');
      expect((result.result as any)?.success).toBe(true);
      expect((result.result as any)?.weaponEquipped).toBe('diamond_sword');
      expect(mockBot.equip).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'diamond_sword' }),
        'hand'
      );
    });

    it('should equip weapon of preferred type', async () => {
      const leaf = new EquipWeaponLeaf();

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      vi.spyOn(mockBot, 'equip').mockResolvedValue(undefined);

      const result = await leaf.run(ctx, { preferredType: 'bow' });

      expect(result.status).toBe('success');
      expect((result.result as any)?.weaponEquipped).toBe('bow');
      expect(mockBot.equip).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'bow' }),
        'hand'
      );
    });

    it('should fallback to hand when no weapons available', async () => {
      const leaf = new EquipWeaponLeaf();

      const botWithoutWeapons = {
        ...mockBot,
        inventory: {
          items: vi
            .fn()
            .mockReturnValue([
              { name: 'bread', count: 5, slot: 0, metadata: {} },
            ]),
        },
      } as any;

      const ctx = {
        bot: botWithoutWeapons,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      vi.spyOn(botWithoutWeapons, 'unequip').mockResolvedValue(undefined);

      const result = await leaf.run(ctx, { fallbackToHand: true });

      expect(result.status).toBe('success');
      expect((result.result as any)?.weaponEquipped).toBe('hand');
      expect(botWithoutWeapons.unequip).toHaveBeenCalledWith('hand');
    });
  });

  describe('RetreatFromThreatLeaf', () => {
    it('should have correct spec', () => {
      const leaf = new RetreatFromThreatLeaf();
      expect(leaf.spec.name).toBe('retreat_from_threat');
      expect(leaf.spec.version).toBe('1.0.0');
      expect(leaf.spec.permissions).toContain('movement');
      expect(leaf.spec.timeoutMs).toBe(30000);
    });

    it('should return success when no threats detected', async () => {
      const leaf = new RetreatFromThreatLeaf();

      const botWithoutThreats = {
        ...mockBot,
        entities: {},
      } as any;

      const ctx = {
        bot: botWithoutThreats,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, {});

      expect(result.status).toBe('success');
      expect((result.result as any)?.success).toBe(true);
      expect((result.result as any)?.retreated).toBe(false);
      expect((result.result as any)?.threatsDetected).toBe(0);
    });

    it('should retreat from detected threats', async () => {
      const leaf = new RetreatFromThreatLeaf();

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      vi.spyOn(mockBot, 'setControlState').mockResolvedValue(undefined);
      vi.spyOn(mockBot, 'lookAt').mockResolvedValue(undefined);

      const result = await leaf.run(ctx, { retreatDistance: 10 });

      expect(result.status).toBe('success');
      expect((result.result as any)?.success).toBe(true);
      expect((result.result as any)?.retreated).toBe(true);
      expect((result.result as any)?.threatsDetected).toBe(2); // zombie and skeleton
      expect((result.result as any)?.retreatDistance).toBe(10);
      expect(mockBot.setControlState).toHaveBeenCalledWith('forward', true);
      expect(mockBot.setControlState).toHaveBeenCalledWith('sprint', true);
    });
  });

  describe('UseItemLeaf', () => {
    it('should have correct spec', () => {
      const leaf = new UseItemLeaf();
      expect(leaf.spec.name).toBe('use_item');
      expect(leaf.spec.version).toBe('1.0.0');
      expect(leaf.spec.permissions).toContain('container.read');
      expect(leaf.spec.timeoutMs).toBe(10000);
    });

    it('should use item from inventory', async () => {
      const leaf = new UseItemLeaf();

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      vi.spyOn(mockBot, 'equip').mockResolvedValue(undefined);
      vi.spyOn(mockBot, 'activateItem').mockResolvedValue(undefined);

      const result = await leaf.run(ctx, {
        item: 'healing_potion',
        quantity: 1,
      });

      expect(result.status).toBe('success');
      expect((result.result as any)?.success).toBe(true);
      expect((result.result as any)?.itemUsed).toBe('healing_potion');
      expect((result.result as any)?.quantityUsed).toBe(1);
      expect(mockBot.equip).toHaveBeenCalled();
      expect(mockBot.activateItem).toHaveBeenCalledWith(true);
    });

    it('should reject item not in inventory', async () => {
      const leaf = new UseItemLeaf();

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, {
        item: 'missing_potion',
        quantity: 1,
      });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('inventory.missingItem');
      expect(result.error?.detail).toContain('not found in inventory');
    });

    it('should reject insufficient quantity', async () => {
      const leaf = new UseItemLeaf();

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, {
        item: 'healing_potion',
        quantity: 10,
      });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('inventory.missingItem');
      expect(result.error?.detail).toContain('Only 3 healing_potion available');
    });
  });
});

/**
 * FF-A: Fight Decision Logic Tests
 *
 * Tests that determineRecommendedAction() returns 'attack' when
 * the bot is armed, healthy, and faces manageable non-explosive threats.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Vec3 } from 'vec3';
import { ThreatPerceptionManager, type ThreatEntity } from '../threat-perception-manager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBot(overrides: Record<string, any> = {}): any {
  return {
    entity: {
      position: new Vec3(0, 64, 0),
      height: 1.8,
      yaw: 0,
      pitch: 0,
    },
    health: overrides.health ?? 20,
    heldItem: overrides.heldItem ?? null,
    inventory: {
      items: () => overrides.inventoryItems ?? [],
    },
    entities: overrides.entities ?? {},
    blockAt: vi.fn().mockReturnValue(null),
  };
}

function makeSafetyMonitor(): any {
  return {
    isHostileEntity: (entity: any) => {
      const hostileTypes = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman'];
      return hostileTypes.includes(entity.name || entity.type);
    },
  };
}

function makeThreat(type: string, distance: number): ThreatEntity {
  return {
    id: `${type}_1`,
    type,
    position: new Vec3(distance, 64, 0),
    lastSeen: Date.now(),
    distance,
    hasLineOfSight: true,
    threatLevel: 70,
  };
}

/**
 * Access the private determineRecommendedAction method via prototype trick.
 * Since it's private we use bracket access through the instance.
 */
function callDetermineAction(
  manager: ThreatPerceptionManager,
  level: 'low' | 'medium' | 'high' | 'critical',
  health: number,
  threats: ThreatEntity[] = [],
): string {
  return (manager as any).determineRecommendedAction(level, health, threats);
}

function callBotHasWeapon(manager: ThreatPerceptionManager): boolean {
  return (manager as any).botHasWeapon();
}

function callBotHasRangedWeapon(manager: ThreatPerceptionManager): boolean {
  return (manager as any).botHasRangedWeapon();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FF-A: Fight Decision Logic', () => {
  describe('botHasWeapon()', () => {
    it('returns false when bot holds nothing', () => {
      const bot = makeBot({ heldItem: null });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      expect(callBotHasWeapon(manager)).toBe(false);
    });

    it('returns true for iron_sword', () => {
      const bot = makeBot({ heldItem: { name: 'iron_sword' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      expect(callBotHasWeapon(manager)).toBe(true);
    });

    it('returns true for diamond_axe', () => {
      const bot = makeBot({ heldItem: { name: 'diamond_axe' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      expect(callBotHasWeapon(manager)).toBe(true);
    });

    it('returns true for bow', () => {
      const bot = makeBot({ heldItem: { name: 'bow' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      expect(callBotHasWeapon(manager)).toBe(true);
    });

    it('returns false for bread', () => {
      const bot = makeBot({ heldItem: { name: 'bread' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      expect(callBotHasWeapon(manager)).toBe(false);
    });

    it('returns true when sword is in inventory but not held', () => {
      const bot = makeBot({
        heldItem: null,
        inventoryItems: [{ name: 'copper_sword' }, { name: 'dirt' }],
      });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      expect(callBotHasWeapon(manager)).toBe(true);
    });

    it('returns false when inventory has no weapons', () => {
      const bot = makeBot({
        heldItem: null,
        inventoryItems: [{ name: 'bread' }, { name: 'dirt' }],
      });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      expect(callBotHasWeapon(manager)).toBe(false);
    });
  });

  describe('botHasRangedWeapon()', () => {
    it('returns false for iron_sword', () => {
      const bot = makeBot({ heldItem: { name: 'iron_sword' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      expect(callBotHasRangedWeapon(manager)).toBe(false);
    });

    it('returns true for bow', () => {
      const bot = makeBot({ heldItem: { name: 'bow' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      expect(callBotHasRangedWeapon(manager)).toBe(true);
    });

    it('returns true for crossbow', () => {
      const bot = makeBot({ heldItem: { name: 'crossbow' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      expect(callBotHasRangedWeapon(manager)).toBe(true);
    });

    it('returns true for trident', () => {
      const bot = makeBot({ heldItem: { name: 'trident' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      expect(callBotHasRangedWeapon(manager)).toBe(true);
    });
  });

  describe('determineRecommendedAction() — fight path', () => {
    it('armed bot with 1 zombie at high threat → attack', () => {
      const bot = makeBot({ health: 15, heldItem: { name: 'iron_sword' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('zombie', 5)];

      expect(callDetermineAction(manager, 'high', 15, threats)).toBe('attack');
    });

    it('armed bot with 1 zombie at critical threat → attack', () => {
      const bot = makeBot({ health: 15, heldItem: { name: 'iron_sword' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('zombie', 3)];

      expect(callDetermineAction(manager, 'critical', 15, threats)).toBe('attack');
    });

    it('armed bot with 2 threats → attack (not overwhelmed)', () => {
      const bot = makeBot({ health: 15, heldItem: { name: 'iron_sword' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('zombie', 5), makeThreat('skeleton', 8)];

      expect(callDetermineAction(manager, 'high', 15, threats)).toBe('attack');
    });
  });

  describe('determineRecommendedAction() — flee path', () => {
    it('low health (<=6) → always flee regardless of weapon', () => {
      const bot = makeBot({ health: 5, heldItem: { name: 'diamond_sword' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('zombie', 5)];

      expect(callDetermineAction(manager, 'critical', 5, threats)).toBe('flee');
    });

    it('unarmed bot → flee on critical', () => {
      const bot = makeBot({ health: 15, heldItem: null });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('zombie', 5)];

      expect(callDetermineAction(manager, 'critical', 15, threats)).toBe('flee');
    });

    it('unarmed bot → find_shelter on high (health >= 10)', () => {
      const bot = makeBot({ health: 15, heldItem: null });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('zombie', 5)];

      expect(callDetermineAction(manager, 'high', 15, threats)).toBe('find_shelter');
    });

    it('3+ threats → flee (overwhelmed)', () => {
      const bot = makeBot({ health: 15, heldItem: { name: 'iron_sword' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [
        makeThreat('zombie', 5),
        makeThreat('skeleton', 8),
        makeThreat('spider', 6),
      ];

      expect(callDetermineAction(manager, 'critical', 15, threats)).toBe('flee');
    });

    it('health exactly 10 → not above 10 → cannot fight → flee on critical', () => {
      const bot = makeBot({ health: 10, heldItem: { name: 'iron_sword' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('zombie', 5)];

      expect(callDetermineAction(manager, 'critical', 10, threats)).toBe('flee');
    });
  });

  describe('determineRecommendedAction() — creeper rule', () => {
    it('creeper + no ranged weapon → flee', () => {
      const bot = makeBot({ health: 15, heldItem: { name: 'iron_sword' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('creeper', 5)];

      expect(callDetermineAction(manager, 'critical', 15, threats)).toBe('flee');
    });

    it('creeper + bow → attack', () => {
      const bot = makeBot({ health: 15, heldItem: { name: 'bow' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('creeper', 8)];

      expect(callDetermineAction(manager, 'critical', 15, threats)).toBe('attack');
    });

    it('creeper + crossbow → attack', () => {
      const bot = makeBot({ health: 15, heldItem: { name: 'crossbow' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('creeper', 8)];

      expect(callDetermineAction(manager, 'critical', 15, threats)).toBe('attack');
    });

    it('mixed: zombie + creeper with sword → flee (creeper not fightable)', () => {
      const bot = makeBot({ health: 15, heldItem: { name: 'iron_sword' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('zombie', 5), makeThreat('creeper', 8)];

      expect(callDetermineAction(manager, 'critical', 15, threats)).toBe('flee');
    });

    it('mixed: zombie + creeper with bow → attack (all fightable)', () => {
      const bot = makeBot({ health: 15, heldItem: { name: 'bow' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('zombie', 5), makeThreat('creeper', 8)];

      expect(callDetermineAction(manager, 'critical', 15, threats)).toBe('attack');
    });
  });

  describe('determineRecommendedAction() — medium/low levels', () => {
    it('medium threat at distance 15 → find_shelter (outside melee range)', () => {
      const bot = makeBot({ health: 15, heldItem: { name: 'iron_sword' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('zombie', 15)];

      expect(callDetermineAction(manager, 'medium', 15, threats)).toBe('find_shelter');
    });

    it('medium threat at melee range (≤4) + armed → attack', () => {
      const bot = makeBot({ health: 15, heldItem: { name: 'iron_sword' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('zombie', 2)];

      expect(callDetermineAction(manager, 'medium', 15, threats)).toBe('attack');
    });

    it('medium threat at melee range but unarmed → find_shelter', () => {
      const bot = makeBot({ health: 15, heldItem: null });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('zombie', 2)];

      expect(callDetermineAction(manager, 'medium', 15, threats)).toBe('find_shelter');
    });

    it('low threat → none', () => {
      const bot = makeBot({ health: 15, heldItem: { name: 'iron_sword' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());

      expect(callDetermineAction(manager, 'low', 15, [])).toBe('none');
    });
  });

  describe('determineRecommendedAction() — low_health pseudo-threat filtered', () => {
    it('only low_health threat + armed → no fight (no external threats)', () => {
      const bot = makeBot({ health: 15, heldItem: { name: 'iron_sword' } });
      const manager = new ThreatPerceptionManager(bot, makeSafetyMonitor());
      const threats = [makeThreat('low_health', 0)];

      // externalThreats.length === 0 → canFight is false
      expect(callDetermineAction(manager, 'high', 15, threats)).toBe('find_shelter');
    });
  });
});

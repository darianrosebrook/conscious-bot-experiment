import { describe, it, expect } from 'vitest';
import {
  computeStressAxes,
  blendAxes,
  buildStressContext,
  buildWorldStateSnapshot,
  type WorldStateSnapshot,
} from '../stress-axis-computer';
import type { StressAxes } from '../interoception-store';

/**
 * Tests for stress-axis-computer: axis computation, blending, context builder,
 * and world state snapshot builder.
 *
 * @author @darianrosebrook
 */

function makeSnapshot(overrides: Partial<WorldStateSnapshot> = {}): WorldStateSnapshot {
  return {
    health: 20,
    food: 20,
    position: { x: 0, y: 64, z: 0 },
    dimension: 'overworld',
    timeOfDay: 6000,
    isNight: false,
    isRaining: false,
    nearbyHostileCount: 0,
    inventoryItems: [
      { type: 'stone_pickaxe', count: 1 },
      { type: 'bread', count: 5 },
    ],
    usedSlots: 2,
    totalSlots: 36,
    armorPieceCount: 4,
    hasShelterNearby: true,
    spawnPosition: { x: 0, y: 64, z: 0 },
    safety: 90,
    msSinceLastRest: 0,
    msSinceLastProgress: 0,
    ...overrides,
  };
}

describe('stress-axis-computer', () => {
  describe('computeStressAxes', () => {
    it('returns low stress for a well-equipped, safe state', () => {
      const axes = computeStressAxes(makeSnapshot());
      expect(axes.time).toBeLessThanOrEqual(5);
      expect(axes.situational).toBeLessThanOrEqual(10);
      expect(axes.healthHunger).toBe(0);
      expect(axes.resource).toBeLessThanOrEqual(5);
      expect(axes.protection).toBe(0); // full armor, day, shelter
      expect(axes.locationDistance).toBe(0); // at spawn
    });

    describe('time axis', () => {
      it('ramps with msSinceLastRest', () => {
        const snap = makeSnapshot({ msSinceLastRest: 10 * 60 * 1000 }); // 10 min
        const axes = computeStressAxes(snap);
        expect(axes.time).toBeGreaterThan(10);
        expect(axes.time).toBeLessThan(60);
      });

      it('hits ~60 at 20 minutes', () => {
        const snap = makeSnapshot({ msSinceLastRest: 20 * 60 * 1000 });
        const axes = computeStressAxes(snap);
        expect(axes.time).toBeGreaterThanOrEqual(55);
        expect(axes.time).toBeLessThanOrEqual(65);
      });

      it('adds 15 for no progress in 10+ min', () => {
        const noProgress = makeSnapshot({ msSinceLastProgress: 11 * 60 * 1000 });
        const withProgress = makeSnapshot({ msSinceLastProgress: 5 * 60 * 1000 });
        const axesNo = computeStressAxes(noProgress);
        const axesWith = computeStressAxes(withProgress);
        expect(axesNo.time - axesWith.time).toBeGreaterThanOrEqual(10);
      });

      it('caps at 100', () => {
        const snap = makeSnapshot({ msSinceLastRest: 60 * 60 * 1000, msSinceLastProgress: 60 * 60 * 1000 });
        expect(computeStressAxes(snap).time).toBe(100);
      });
    });

    describe('situational axis', () => {
      it('increases with low safety', () => {
        const axes = computeStressAxes(makeSnapshot({ safety: 20 }));
        expect(axes.situational).toBeGreaterThan(40);
      });

      it('increases with nearby hostiles', () => {
        const axes = computeStressAxes(makeSnapshot({ nearbyHostileCount: 3 }));
        expect(axes.situational).toBeGreaterThan(20);
      });

      it('stacks safety and hostiles', () => {
        const axes = computeStressAxes(makeSnapshot({ safety: 10, nearbyHostileCount: 3 }));
        expect(axes.situational).toBeGreaterThan(70);
      });
    });

    describe('healthHunger axis', () => {
      it('is 0 at full health and food', () => {
        expect(computeStressAxes(makeSnapshot()).healthHunger).toBe(0);
      });

      it('rises with low health', () => {
        const axes = computeStressAxes(makeSnapshot({ health: 4 }));
        expect(axes.healthHunger).toBeGreaterThan(40);
      });

      it('rises with low food', () => {
        const axes = computeStressAxes(makeSnapshot({ food: 2 }));
        expect(axes.healthHunger).toBeGreaterThan(50);
      });

      it('max component weighs more (0.7 vs 0.3)', () => {
        // Both low: combined should be higher than just one low
        const bothLow = computeStressAxes(makeSnapshot({ health: 4, food: 4 }));
        const oneLow = computeStressAxes(makeSnapshot({ health: 4, food: 20 }));
        expect(bothLow.healthHunger).toBeGreaterThan(oneLow.healthHunger);
      });
    });

    describe('resource axis', () => {
      it('low when has food and tools', () => {
        expect(computeStressAxes(makeSnapshot()).resource).toBeLessThan(10);
      });

      it('rises with no food items', () => {
        const snap = makeSnapshot({
          inventoryItems: [{ type: 'stone_pickaxe', count: 1 }],
        });
        expect(computeStressAxes(snap).resource).toBeGreaterThan(15);
      });

      it('rises with no tools', () => {
        const snap = makeSnapshot({
          inventoryItems: [{ type: 'bread', count: 5 }],
        });
        expect(computeStressAxes(snap).resource).toBeGreaterThan(10);
      });

      it('rises with high inventory fullness', () => {
        const snap = makeSnapshot({ usedSlots: 34, totalSlots: 36 });
        expect(computeStressAxes(snap).resource).toBeGreaterThan(30);
      });
    });

    describe('protection axis', () => {
      it('0 with full armor, day, shelter', () => {
        expect(computeStressAxes(makeSnapshot()).protection).toBe(0);
      });

      it('rises without armor', () => {
        const axes = computeStressAxes(makeSnapshot({ armorPieceCount: 0 }));
        expect(axes.protection).toBeGreaterThanOrEqual(48);
      });

      it('rises at night', () => {
        const axes = computeStressAxes(makeSnapshot({ isNight: true }));
        expect(axes.protection).toBeGreaterThan(15);
      });

      it('rises at night without shelter', () => {
        const axes = computeStressAxes(makeSnapshot({ isNight: true, hasShelterNearby: false }));
        expect(axes.protection).toBeGreaterThan(30);
      });

      it('rises in nether', () => {
        const axes = computeStressAxes(makeSnapshot({ dimension: 'the_nether' }));
        expect(axes.protection).toBeGreaterThan(10);
      });
    });

    describe('locationDistance axis', () => {
      it('0 when at spawn', () => {
        expect(computeStressAxes(makeSnapshot()).locationDistance).toBe(0);
      });

      it('rises with distance from spawn', () => {
        const snap = makeSnapshot({ position: { x: 500, y: 64, z: 0 } });
        expect(computeStressAxes(snap).locationDistance).toBe(100);
      });

      it('returns 40 when no spawn known', () => {
        const snap = makeSnapshot({ spawnPosition: null });
        expect(computeStressAxes(snap).locationDistance).toBe(40);
      });

      it('multiplied in nether', () => {
        const overworld = makeSnapshot({ position: { x: 100, y: 64, z: 0 } });
        const nether = makeSnapshot({ position: { x: 100, y: 64, z: 0 }, dimension: 'the_nether' });
        expect(computeStressAxes(nether).locationDistance).toBeGreaterThan(
          computeStressAxes(overworld).locationDistance
        );
      });
    });
  });

  describe('blendAxes', () => {
    it('blends at 30/70 general, 20/80 situational', () => {
      const current: StressAxes = { time: 100, situational: 100, healthHunger: 100, resource: 100, protection: 100, locationDistance: 100 };
      const computed: StressAxes = { time: 0, situational: 0, healthHunger: 0, resource: 0, protection: 0, locationDistance: 0 };
      const blended = blendAxes(current, computed);
      expect(blended.time).toBe(70);         // 100*0.7 + 0*0.3
      expect(blended.situational).toBe(80);   // 100*0.8 + 0*0.2
      expect(blended.healthHunger).toBe(70);
      expect(blended.resource).toBe(70);
      expect(blended.protection).toBe(70);
      expect(blended.locationDistance).toBe(70);
    });

    it('converges toward computed over multiple blends', () => {
      let current: StressAxes = { time: 100, situational: 100, healthHunger: 100, resource: 100, protection: 100, locationDistance: 100 };
      const target: StressAxes = { time: 0, situational: 0, healthHunger: 0, resource: 0, protection: 0, locationDistance: 0 };
      for (let i = 0; i < 20; i++) {
        current = blendAxes(current, target);
      }
      expect(current.time).toBeLessThan(5);
      expect(current.situational).toBeLessThan(15); // slower blend
    });
  });

  describe('buildStressContext', () => {
    it('returns empty string when all axes are low', () => {
      const axes: StressAxes = { time: 10, situational: 5, healthHunger: 10, resource: 15, protection: 10, locationDistance: 10 };
      expect(buildStressContext(axes)).toBe('');
    });

    it('never contains the word "stress"', () => {
      const axes: StressAxes = { time: 80, situational: 90, healthHunger: 80, resource: 80, protection: 80, locationDistance: 80 };
      const ctx = buildStressContext(axes);
      expect(ctx.toLowerCase()).not.toContain('stress');
    });

    it('includes time fragment when time > 60', () => {
      const axes: StressAxes = { time: 70, situational: 0, healthHunger: 0, resource: 0, protection: 0, locationDistance: 0 };
      expect(buildStressContext(axes)).toContain('without rest');
    });

    it('includes situational fragment when situational > 70', () => {
      const axes: StressAxes = { time: 0, situational: 80, healthHunger: 0, resource: 0, protection: 0, locationDistance: 0 };
      expect(buildStressContext(axes)).toContain('on edge');
    });

    it('includes healthHunger fragment when > 70', () => {
      const axes: StressAxes = { time: 0, situational: 0, healthHunger: 80, resource: 0, protection: 0, locationDistance: 0 };
      expect(buildStressContext(axes)).toContain('health or hunger');
    });

    it('includes resource fragment when > 70', () => {
      const axes: StressAxes = { time: 0, situational: 0, healthHunger: 0, resource: 80, protection: 0, locationDistance: 0 };
      expect(buildStressContext(axes)).toContain('supplies');
    });

    it('includes protection fragment when > 70', () => {
      const axes: StressAxes = { time: 0, situational: 0, healthHunger: 0, resource: 0, protection: 80, locationDistance: 0 };
      expect(buildStressContext(axes)).toContain('exposed');
    });

    it('includes location fragment when > 70', () => {
      const axes: StressAxes = { time: 0, situational: 0, healthHunger: 0, resource: 0, protection: 0, locationDistance: 80 };
      expect(buildStressContext(axes)).toContain('far from');
    });

    it('includes moderate fragments in 45-70 range', () => {
      const axes: StressAxes = { time: 50, situational: 50, healthHunger: 50, resource: 50, protection: 50, locationDistance: 50 };
      const ctx = buildStressContext(axes);
      expect(ctx).toContain('break');
      expect(ctx).toContain('alert');
      expect(ctx).toContain('not in the best shape');
      expect(ctx).toContain('restocking');
      expect(ctx).toContain('wise');
      expect(ctx).toContain('wandered');
    });

    it('combines multiple fragments with spaces', () => {
      const axes: StressAxes = { time: 80, situational: 0, healthHunger: 80, resource: 0, protection: 0, locationDistance: 0 };
      const ctx = buildStressContext(axes);
      expect(ctx).toContain('rest');
      expect(ctx).toContain('health or hunger');
    });
  });

  describe('buildWorldStateSnapshot', () => {
    it('extracts health and food from data', () => {
      const snap = buildWorldStateSnapshot(
        { data: { health: 12, food: 8 } },
        null,
        { msSinceLastRest: 0, msSinceLastProgress: 0 }
      );
      expect(snap.health).toBe(12);
      expect(snap.food).toBe(8);
    });

    it('extracts position', () => {
      const snap = buildWorldStateSnapshot(
        { data: { position: { x: 10, y: 65, z: -20 } } },
        null,
        { msSinceLastRest: 0, msSinceLastProgress: 0 }
      );
      expect(snap.position).toEqual({ x: 10, y: 65, z: -20 });
    });

    it('passes through spawn position', () => {
      const spawn = { x: 100, y: 64, z: 200 };
      const snap = buildWorldStateSnapshot(
        { data: {} },
        spawn,
        { msSinceLastRest: 0, msSinceLastProgress: 0 }
      );
      expect(snap.spawnPosition).toEqual(spawn);
    });

    it('passes through counters', () => {
      const snap = buildWorldStateSnapshot(
        { data: {} },
        null,
        { msSinceLastRest: 5000, msSinceLastProgress: 12000 }
      );
      expect(snap.msSinceLastRest).toBe(5000);
      expect(snap.msSinceLastProgress).toBe(12000);
    });

    it('counts armor pieces from inventory', () => {
      const snap = buildWorldStateSnapshot(
        {
          data: {
            inventory: {
              items: [
                { type: 'iron_helmet', count: 1 },
                { type: 'iron_chestplate', count: 1 },
                { type: 'bread', count: 10 },
              ],
            },
          },
        },
        null,
        { msSinceLastRest: 0, msSinceLastProgress: 0 }
      );
      expect(snap.armorPieceCount).toBe(2);
    });

    it('counts hostile entities', () => {
      const snap = buildWorldStateSnapshot(
        {
          data: {
            entities: [
              { name: 'zombie', kind: 'hostile' },
              { name: 'skeleton', threatLevel: 'hostile' },
              { name: 'cow', kind: 'passive' },
            ],
          },
        },
        null,
        { msSinceLastRest: 0, msSinceLastProgress: 0 }
      );
      expect(snap.nearbyHostileCount).toBe(2);
    });

    it('defaults gracefully with empty/null state', () => {
      const snap = buildWorldStateSnapshot(null, null, { msSinceLastRest: 0, msSinceLastProgress: 0 });
      expect(snap.health).toBe(20);
      expect(snap.food).toBe(20);
      expect(snap.nearbyHostileCount).toBe(0);
      expect(snap.inventoryItems).toEqual([]);
    });

    it('detects shelter from nearby blocks', () => {
      const snap = buildWorldStateSnapshot(
        {
          data: {
            nearbyBlocks: [
              { type: 'oak_door' },
              { type: 'stone' },
            ],
          },
        },
        null,
        { msSinceLastRest: 0, msSinceLastProgress: 0 }
      );
      expect(snap.hasShelterNearby).toBe(true);
    });

    it('detects night from timeOfDay', () => {
      const snap = buildWorldStateSnapshot(
        { data: { timeOfDay: 15000 } },
        null,
        { msSinceLastRest: 0, msSinceLastProgress: 0 }
      );
      expect(snap.isNight).toBe(true);
    });
  });
});

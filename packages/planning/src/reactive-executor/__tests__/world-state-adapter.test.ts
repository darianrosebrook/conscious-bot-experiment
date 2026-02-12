/**
 * Tests for world-state-adapter.ts
 *
 * Validates:
 * - Adapter reads from WorldStateManager snapshot
 * - Adapter returns safe defaults when snapshot fields are missing
 * - hasItem correctly aggregates inventory counts
 * - distanceTo computes Euclidean distance
 * - timeOfDay correctly maps tick ranges
 * - getNearbyHostiles filters hostile mobs
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi } from 'vitest';
import { createWorldStateFromManager } from '../world-state-adapter';
import type { WorldStateManager, WorldStateSnapshot } from '../../world-state/world-state-manager';

function createMockManager(
  snapshot: Partial<WorldStateSnapshot> = {}
): WorldStateManager {
  const fullSnapshot: WorldStateSnapshot = {
    ts: Date.now(),
    connected: true,
    ...snapshot,
  };

  return {
    getSnapshot: vi.fn(() => ({ ...fullSnapshot })),
    getInventory: vi.fn(() => fullSnapshot.inventory),
  } as unknown as WorldStateManager;
}

describe('createWorldStateFromManager', () => {
  it('reads health from snapshot', () => {
    const ws = createWorldStateFromManager(
      createMockManager({ agentHealth: 16 })
    );
    expect(ws.getHealth()).toBe(16);
  });

  it('returns 0 health when snapshot has no health', () => {
    const ws = createWorldStateFromManager(createMockManager({}));
    expect(ws.getHealth()).toBe(0);
  });

  it('reads position from snapshot', () => {
    const ws = createWorldStateFromManager(
      createMockManager({ agentPosition: { x: 10, y: 64, z: -20 } })
    );
    expect(ws.getPosition()).toEqual({ x: 10, y: 64, z: -20 });
  });

  it('returns origin when no position available', () => {
    const ws = createWorldStateFromManager(createMockManager({}));
    expect(ws.getPosition()).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('maps timeOfDay ticks to day/night', () => {
    const dayWs = createWorldStateFromManager(
      createMockManager({ timeOfDay: 6000 })
    );
    expect(dayWs.getTimeOfDay()).toBe('day');

    const nightWs = createWorldStateFromManager(
      createMockManager({ timeOfDay: 18000 })
    );
    expect(nightWs.getTimeOfDay()).toBe('night');

    const duskWs = createWorldStateFromManager(
      createMockManager({ timeOfDay: 12001 })
    );
    expect(duskWs.getTimeOfDay()).toBe('night');
  });

  it('hasItem aggregates across inventory slots', () => {
    const ws = createWorldStateFromManager(
      createMockManager({
        inventory: [
          { name: 'oak_planks', count: 32, slot: 0 },
          { name: 'oak_planks', count: 16, slot: 1 },
          { name: 'stone', count: 5, slot: 2 },
        ],
      })
    );
    expect(ws.hasItem('oak_planks', 48)).toBe(true);
    expect(ws.hasItem('oak_planks', 49)).toBe(false);
    expect(ws.hasItem('stone', 5)).toBe(true);
    expect(ws.hasItem('diamond', 1)).toBe(false);
  });

  it('hasItem returns false when no inventory', () => {
    const ws = createWorldStateFromManager(createMockManager({}));
    expect(ws.hasItem('stone')).toBe(false);
  });

  it('distanceTo computes Euclidean distance', () => {
    const ws = createWorldStateFromManager(
      createMockManager({ agentPosition: { x: 0, y: 0, z: 0 } })
    );
    expect(ws.distanceTo({ x: 3, y: 4, z: 0 })).toBeCloseTo(5);
  });

  it('distanceTo returns Infinity when no position', () => {
    const ws = createWorldStateFromManager(createMockManager({}));
    expect(ws.distanceTo({ x: 10, y: 10, z: 10 })).toBe(Infinity);
  });

  it('getThreatLevel reads dangerLevel', () => {
    const ws = createWorldStateFromManager(
      createMockManager({ dangerLevel: 0.7 })
    );
    expect(ws.getThreatLevel()).toBe(0.7);
  });

  it('getInventory builds name→count map', () => {
    const ws = createWorldStateFromManager(
      createMockManager({
        inventory: [
          { name: 'cobblestone', count: 64, slot: 0 },
          { name: 'cobblestone', count: 32, slot: 1 },
          { name: 'torch', count: 12, slot: 2 },
        ],
      })
    );
    expect(ws.getInventory()).toEqual({
      cobblestone: 96,
      torch: 12,
    });
  });

  it('getNearbyHostiles filters hostile entities', () => {
    const ws = createWorldStateFromManager(
      createMockManager({
        nearbyEntities: [
          { type: 'zombie', position: { x: 5, y: 64, z: 5 }, distance: 7 },
          { type: 'cow', position: { x: 10, y: 64, z: 10 }, distance: 14 },
          { type: 'creeper', position: { x: 3, y: 64, z: 3 }, distance: 4 },
          { type: 'player', position: { x: 20, y: 64, z: 20 }, distance: 28 },
        ],
      })
    );

    const hostiles = ws.getNearbyHostiles();
    expect(hostiles).toHaveLength(2);
    expect(hostiles.map((h: any) => h.type)).toEqual(['zombie', 'creeper']);
  });

  it('getNearbyHostiles returns empty when no entities', () => {
    const ws = createWorldStateFromManager(createMockManager({}));
    expect(ws.getNearbyHostiles()).toEqual([]);
  });

  it('always reads fresh snapshot (not cached)', () => {
    let health = 20;
    const manager = {
      getSnapshot: vi.fn(() => ({
        ts: Date.now(),
        connected: true,
        agentHealth: health,
      })),
      getInventory: vi.fn(() => undefined),
    } as unknown as WorldStateManager;

    const ws = createWorldStateFromManager(manager);
    expect(ws.getHealth()).toBe(20);

    health = 10; // Simulate damage
    expect(ws.getHealth()).toBe(10);

    expect(manager.getSnapshot).toHaveBeenCalledTimes(2);
  });
});

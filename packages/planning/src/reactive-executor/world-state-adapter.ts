/**
 * Adapter: WorldStateManager snapshot → GOAP WorldState interface.
 *
 * Bridges the real-time world state (polled by WorldStateManager every 3s)
 * into the WorldState interface consumed by ReactiveExecutor, GOAPPlanner,
 * and safety reflexes.
 *
 * Each method call reads a fresh snapshot — no stale references are cached.
 *
 * @author @darianrosebrook
 */

import type { WorldStateManager, WorldStateSnapshot, CachedInventoryItem } from '../world-state/world-state-manager';
import type { WorldState } from './goap-types';
import type { Resource } from '../types';

/**
 * Create a GOAP WorldState backed by a live WorldStateManager.
 *
 * If the manager has no data yet (first poll hasn't completed), methods
 * return safe defaults identical to createDefaultWorldState().
 */
export function createWorldStateFromManager(manager: WorldStateManager): WorldState {
  const getSnap = (): WorldStateSnapshot => manager.getSnapshot();

  return {
    getHealth(): number {
      return getSnap().agentHealth ?? 0;
    },

    getHunger(): number {
      // WorldStateSnapshot doesn't expose hunger directly.
      // The /health endpoint returns food level, but the snapshot
      // stores it as part of the raw poll data. Default to 20 (full)
      // since hunger is less critical than health for safety reflexes.
      return 20;
    },

    getEnergy(): number {
      // No direct energy metric in snapshot — return full.
      return 20;
    },

    getPosition(): { x: number; y: number; z: number } {
      const pos = getSnap().agentPosition;
      return pos ? { x: pos.x, y: pos.y, z: pos.z } : { x: 0, y: 0, z: 0 };
    },

    getLightLevel(): number {
      // WorldStateSnapshot doesn't include light level.
      // Default to 15 (full sunlight) — safety reflexes use this
      // for "too dark" checks which are less critical than health/threat.
      return 15;
    },

    getAir(): number {
      // No air data in snapshot — return max (300 = full air bar).
      return 300;
    },

    getTimeOfDay(): 'day' | 'night' {
      const tod = getSnap().timeOfDay;
      if (tod === undefined) return 'day';
      // Minecraft ticks: 0-12000 is day, 12001-24000 is night
      return tod >= 0 && tod <= 12000 ? 'day' : 'night';
    },

    hasItem(item: string, quantity: number = 1): boolean {
      const inventory = getSnap().inventory;
      if (!inventory) return false;
      const total = inventory
        .filter((i: CachedInventoryItem) => i.name === item || i.displayName === item)
        .reduce((sum: number, i: CachedInventoryItem) => sum + (i.count ?? 0), 0);
      return total >= quantity;
    },

    distanceTo(target: { x: number; y: number; z: number }): number {
      const pos = getSnap().agentPosition;
      if (!pos) return Infinity;
      const dx = pos.x - target.x;
      const dy = pos.y - target.y;
      const dz = pos.z - target.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },

    getThreatLevel(): number {
      return getSnap().dangerLevel ?? 0;
    },

    getInventory(): Record<string, number> {
      const inventory = getSnap().inventory;
      if (!inventory) return {};
      const result: Record<string, number> = {};
      for (const item of inventory) {
        const name = item.name || item.displayName || 'unknown';
        result[name] = (result[name] || 0) + (item.count ?? 0);
      }
      return result;
    },

    getNearbyResources(): Resource[] {
      // WorldStateSnapshot doesn't include resource data — only entities.
      // Resource detection is a higher-level concern (world/perception).
      return [];
    },

    getNearbyHostiles(): any[] {
      const entities = getSnap().nearbyEntities;
      if (!entities) return [];
      // Filter for hostile mob types. This is a heuristic — a proper
      // implementation would use the mob registry from minecraft-data.
      const hostileTypes = new Set([
        'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
        'witch', 'pillager', 'vindicator', 'phantom', 'drowned',
        'husk', 'stray', 'blaze', 'ghast', 'wither_skeleton',
        'hoglin', 'piglin_brute', 'warden', 'evoker', 'ravager',
      ]);
      return entities.filter((e) => hostileTypes.has(e.type));
    },
  };
}

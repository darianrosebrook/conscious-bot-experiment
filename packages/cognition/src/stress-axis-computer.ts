/**
 * Stress Axis Computer
 *
 * Computes 6-axis stress values from real Minecraft world state. Each axis
 * returns 0-100. Blending smooths values to avoid jitter. A context builder
 * converts axes to natural-language situational fragments for LLM prompts
 * (never uses the word "stress").
 *
 * @author @darianrosebrook
 */

import type { StressAxes } from './interoception-store';

export interface WorldStateSnapshot {
  health: number;            // 0-20
  food: number;              // 0-20
  position: { x: number; y: number; z: number };
  dimension: string;
  timeOfDay: number;         // 0-24000 ticks
  isNight: boolean;
  isRaining: boolean;
  nearbyHostileCount: number;
  inventoryItems: Array<{ type: string; count: number }>;
  usedSlots: number;
  totalSlots: number;
  armorPieceCount: number;   // 0-4
  hasShelterNearby: boolean;
  spawnPosition: { x: number; y: number; z: number } | null;
  safety: number;            // 0-100 from signal processor
  msSinceLastRest: number;
  msSinceLastProgress: number;
}

function clamp100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

// ---------------------------------------------------------------------------
// Individual axis computations (each returns 0-100)
// ---------------------------------------------------------------------------

function computeTime(snap: WorldStateSnapshot): number {
  const MS_20_MIN = 20 * 60 * 1000;
  const MS_10_MIN = 10 * 60 * 1000;
  let value = (snap.msSinceLastRest / MS_20_MIN) * 60;
  if (snap.msSinceLastProgress > MS_10_MIN) value += 15;
  return clamp100(value);
}

function computeSituational(snap: WorldStateSnapshot): number {
  const threatBase = (1 - snap.safety / 100) * 70;
  const hostileBonus = Math.min(30, snap.nearbyHostileCount * 10);
  return clamp100(threatBase + hostileBonus);
}

function computeHealthHunger(snap: WorldStateSnapshot): number {
  const healthPct = (1 - snap.health / 20) * 100;
  const hungerPct = (1 - snap.food / 20) * 100;
  const hi = Math.max(healthPct, hungerPct);
  const lo = Math.min(healthPct, hungerPct);
  return clamp100(hi * 0.7 + lo * 0.3);
}

function computeResource(snap: WorldStateSnapshot): number {
  const fullness = snap.totalSlots > 0
    ? (snap.usedSlots / snap.totalSlots) * 40
    : 0;
  const items = snap.inventoryItems;
  const hasFood = items.some(
    (i) =>
      i.type.includes('apple') ||
      i.type.includes('bread') ||
      i.type.includes('cooked') ||
      i.type.includes('steak') ||
      i.type.includes('porkchop') ||
      i.type.includes('carrot') ||
      i.type.includes('potato') ||
      i.type.includes('melon') ||
      i.type.includes('berry') ||
      i.type.includes('mushroom_stew') ||
      i.type.includes('rabbit_stew') ||
      i.type.includes('beetroot_soup') ||
      i.type.includes('cake') ||
      i.type.includes('cookie')
  );
  const hasTools = items.some(
    (i) =>
      i.type.includes('pickaxe') ||
      i.type.includes('axe') ||
      i.type.includes('shovel') ||
      i.type.includes('sword') ||
      i.type.includes('hoe')
  );
  let value = fullness;
  if (!hasFood) value += 20;
  if (!hasTools) value += 15;
  return clamp100(value);
}

function computeProtection(snap: WorldStateSnapshot): number {
  let value = (4 - snap.armorPieceCount) * 12;
  if (snap.isNight) value += 20;
  if (snap.isNight && !snap.hasShelterNearby) value += 15;
  if (snap.dimension === 'the_nether' || snap.dimension === 'the_end') {
    value += 15;
  }
  return clamp100(value);
}

function computeLocationDistance(snap: WorldStateSnapshot): number {
  if (!snap.spawnPosition) return 40;
  const dx = snap.position.x - snap.spawnPosition.x;
  const dy = snap.position.y - snap.spawnPosition.y;
  const dz = snap.position.z - snap.spawnPosition.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  let value = dist / 5;
  if (snap.dimension === 'the_nether') value *= 1.5;
  return clamp100(value);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute raw stress axes from a world state snapshot.
 */
export function computeStressAxes(snap: WorldStateSnapshot): StressAxes {
  return {
    time: computeTime(snap),
    situational: computeSituational(snap),
    healthHunger: computeHealthHunger(snap),
    resource: computeResource(snap),
    protection: computeProtection(snap),
    locationDistance: computeLocationDistance(snap),
  };
}

/**
 * Blend newly computed axes with current axes to smooth transitions.
 * General: 30% new, 70% current. Situational: 20% new, 80% current
 * (preserves intrusion-driven updates).
 */
export function blendAxes(current: StressAxes, computed: StressAxes): StressAxes {
  return {
    time: clamp100(current.time * 0.7 + computed.time * 0.3),
    situational: clamp100(current.situational * 0.8 + computed.situational * 0.2),
    healthHunger: clamp100(current.healthHunger * 0.7 + computed.healthHunger * 0.3),
    resource: clamp100(current.resource * 0.7 + computed.resource * 0.3),
    protection: clamp100(current.protection * 0.7 + computed.protection * 0.3),
    locationDistance: clamp100(current.locationDistance * 0.7 + computed.locationDistance * 0.3),
  };
}

/**
 * Build natural-language situational context from stress axes for LLM prompts.
 * Never uses the word "stress". Returns empty string when all axes are low.
 */
export function buildStressContext(axes: StressAxes): string {
  const fragments: string[] = [];

  if (axes.time > 60) {
    fragments.push("I've been at this for a while without rest.");
  } else if (axes.time > 40) {
    fragments.push("It's been a while since I last took a break.");
  }

  if (axes.situational > 70) {
    fragments.push('I feel on edge — something nearby is making me uneasy.');
  } else if (axes.situational > 45) {
    fragments.push("I should stay alert; the area doesn't feel entirely safe.");
  }

  if (axes.healthHunger > 70) {
    fragments.push('I need to address my health or hunger soon.');
  } else if (axes.healthHunger > 45) {
    fragments.push("I'm not in the best shape; food or healing would help.");
  }

  if (axes.resource > 70) {
    fragments.push("I'm running low on essential supplies.");
  } else if (axes.resource > 45) {
    fragments.push('My inventory could use some restocking.');
  }

  if (axes.protection > 70) {
    fragments.push("I'm quite exposed — better armor or shelter would help.");
  } else if (axes.protection > 45) {
    fragments.push('Some additional protection would be wise.');
  }

  if (axes.locationDistance > 70) {
    fragments.push("I'm far from anywhere familiar or safe.");
  } else if (axes.locationDistance > 45) {
    fragments.push("I've wandered a good distance from home.");
  }

  return fragments.join(' ');
}

// ---------------------------------------------------------------------------
// Armor piece names used for counting equipped armor from inventory
// ---------------------------------------------------------------------------

const ARMOR_PIECES = [
  'helmet', 'chestplate', 'leggings', 'boots',
];

/**
 * Build a WorldStateSnapshot from raw minecraft /state response data.
 */
export function buildWorldStateSnapshot(
  minecraftState: any,
  spawnPos: { x: number; y: number; z: number } | null,
  counters: { msSinceLastRest: number; msSinceLastProgress: number }
): WorldStateSnapshot {
  const data = minecraftState?.data ?? minecraftState ?? {};
  const health = data.health ?? data.worldState?.player?.health ?? 20;
  const food = data.food ?? data.worldState?.player?.food ?? 20;
  const rawPos = data.position ?? data.worldState?.player?.position ?? { x: 0, y: 64, z: 0 };
  const position = typeof rawPos === 'object' && rawPos !== null
    ? { x: rawPos.x ?? 0, y: rawPos.y ?? 64, z: rawPos.z ?? 0 }
    : { x: 0, y: 64, z: 0 };

  const dimension: string = data.dimension ?? data.worldState?.dimension ?? 'overworld';
  const timeOfDay: number = data.timeOfDay ?? data.worldState?.timeOfDay ?? 6000;
  const isNight = timeOfDay >= 13000 && timeOfDay < 23000;
  const isRaining: boolean = data.isRaining ?? data.worldState?.isRaining ?? false;

  // Entities
  const entities: any[] = data.entities ?? data.worldState?.entities ?? data.nearbyEntities ?? [];
  const nearbyHostileCount = entities.filter(
    (e: any) => e.threatLevel === 'hostile' || e.kind === 'hostile' || e.hostile === true
  ).length;

  // Inventory
  const rawInventory: any[] =
    data.inventory?.items ?? data.worldState?.inventory?.items ?? data.inventory ?? [];
  const inventoryItems = rawInventory
    .filter((i: any) => i && (i.type || i.name))
    .map((i: any) => ({
      type: String(i.type ?? i.name ?? '').toLowerCase(),
      count: typeof i.count === 'number' ? i.count : 1,
    }));
  const usedSlots = inventoryItems.length;
  const totalSlots = 36;

  // Armor count
  const armorPieceCount = Math.min(
    4,
    inventoryItems.filter((i) =>
      ARMOR_PIECES.some((piece) => i.type.includes(piece))
    ).length
  );

  // Shelter detection: check for nearby blocks that suggest enclosure
  const nearbyBlocks: any[] = data.nearbyBlocks ?? data.worldState?.nearbyBlocks ?? [];
  const hasShelterNearby =
    nearbyBlocks.some(
      (b: any) => {
        const name = String(b.type ?? b.name ?? '').toLowerCase();
        return name.includes('door') || name.includes('bed') || name.includes('crafting_table');
      }
    ) || (data.hasShelter === true);

  const safety: number = data.safety ?? data.worldState?.safety ?? 80;

  return {
    health,
    food,
    position,
    dimension,
    timeOfDay,
    isNight,
    isRaining,
    nearbyHostileCount,
    inventoryItems,
    usedSlots,
    totalSlots,
    armorPieceCount,
    hasShelterNearby,
    spawnPosition: spawnPos,
    safety,
    msSinceLastRest: counters.msSinceLastRest,
    msSinceLastProgress: counters.msSinceLastProgress,
  };
}

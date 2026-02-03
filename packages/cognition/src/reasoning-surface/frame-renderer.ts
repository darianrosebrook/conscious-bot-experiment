/**
 * Frame Renderer — Production Reasoning Surface
 *
 * Renders situation frames from bot context for thought generation.
 * A frame is a factual-only representation of the current state,
 * containing NO suggested goals or candidate actions.
 *
 * This implements invariant I-1: No goal injection.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Frame profile controls how much information is included in the rendered frame.
 * These are orthogonal to sampler profiles (LF-1: FG-1 fix).
 */
export interface FrameProfile {
  /** Profile identifier */
  name: 'minimal' | 'balanced' | 'rich';
  /** Maximum number of facts to include */
  factsBudget: number;
  /** Maximum number of memory items to include */
  memoryBudget: number;
  /** Whether to include recent state deltas */
  includeDeltas: boolean;
  /** Maximum number of deltas to include */
  deltasBudget: number;
}

/**
 * Predefined frame profiles.
 */
export const FRAME_PROFILES: Record<FrameProfile['name'], FrameProfile> = {
  minimal: {
    name: 'minimal',
    factsBudget: 5,
    memoryBudget: 0,
    includeDeltas: false,
    deltasBudget: 0,
  },
  balanced: {
    name: 'balanced',
    factsBudget: 10,
    memoryBudget: 3,
    includeDeltas: false,
    deltasBudget: 0,
  },
  rich: {
    name: 'rich',
    factsBudget: 20,
    memoryBudget: 8,
    includeDeltas: true,
    deltasBudget: 5,
  },
};

/**
 * Bot state facts for frame rendering.
 */
export interface BotFacts {
  position: { x: number; y: number; z: number };
  health: number;
  hunger: number;
  inventory: Array<{ item: string; count: number }>;
  timeOfDay: 'dawn' | 'day' | 'sunset' | 'night' | 'unknown';
  threatLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

/**
 * World state facts for frame rendering.
 */
export interface WorldFacts {
  biome: string;
  nearbyEntities: Array<{ kind: string; count: number; distanceMin?: number; hostile?: boolean }>;
  nearbyBlocks?: Array<{ type: string; count: number }>;
  weather?: string;
  dimension?: string;
}

/**
 * State delta representing a recent change.
 */
export interface StateDelta {
  type: 'threat_delta' | 'damage_taken' | 'hunger_change' | 'health_change' | 'new_entity' | 'lost_entity' | 'time_advanced' | 'item_gained' | 'item_lost' | 'other';
  value: string | number | object;
  timestampMs?: number;
}

/**
 * Memory item for context.
 */
export interface MemoryItem {
  type: 'episodic' | 'semantic';
  key?: string;
  text: string;
  timestampMs?: number;
}

/**
 * Full frame context for rendering.
 */
export interface FrameContext {
  bot: BotFacts;
  world: WorldFacts;
  deltas?: StateDelta[];
  memory?: MemoryItem[];
}

/**
 * Rendered situation frame (the output).
 */
export interface SituationFrame {
  /** The rendered text representation */
  text: string;
  /** Frame profile used for rendering */
  profile: FrameProfile['name'];
  /** Number of facts included */
  factCount: number;
  /** Number of memory items included */
  memoryCount: number;
  /** Number of deltas included */
  deltaCount: number;
  /** Whether this frame is factual-only (should always be true) */
  factualOnly: true;
  /** Digest of the frame content for verification */
  contentDigest: string;
}

// ============================================================================
// Frame Rendering
// ============================================================================

/**
 * Render a situation frame from context.
 *
 * This produces a FACTUAL-ONLY frame with NO suggested goals (I-1).
 * The frame contains only observations about current state.
 *
 * @param context - The bot and world context
 * @param profile - The frame profile to use
 * @returns Rendered situation frame
 */
export function renderSituationFrame(
  context: FrameContext,
  profile: FrameProfile = FRAME_PROFILES.balanced
): SituationFrame {
  const sections: string[] = [];
  let factCount = 0;
  let memoryCount = 0;
  let deltaCount = 0;

  // === Bot State Section ===
  const botLines: string[] = [];

  // Always include core vitals (high priority)
  botLines.push(`Health: ${context.bot.health}/20`);
  botLines.push(`Hunger: ${context.bot.hunger}/20`);
  factCount += 2;

  // Position (medium priority)
  if (factCount < profile.factsBudget) {
    const pos = context.bot.position;
    botLines.push(`Position: (${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})`);
    factCount++;
  }

  // Time of day (medium priority)
  if (factCount < profile.factsBudget) {
    botLines.push(`Time: ${formatTimeOfDay(context.bot.timeOfDay)}`);
    factCount++;
  }

  // Threat level (high priority if elevated)
  if (context.bot.threatLevel && context.bot.threatLevel !== 'none') {
    if (factCount < profile.factsBudget) {
      botLines.push(`Threat Level: ${context.bot.threatLevel}`);
      factCount++;
    }
  }

  // Inventory summary (variable priority based on budget)
  if (context.bot.inventory.length > 0 && factCount < profile.factsBudget) {
    const invItems = context.bot.inventory.slice(0, profile.factsBudget - factCount);
    const invSummary = invItems.map(i => `${i.item} x${i.count}`).join(', ');
    botLines.push(`Inventory: ${invSummary}`);
    factCount += Math.min(invItems.length, 3); // Count as 1-3 facts depending on size
  } else if (context.bot.inventory.length === 0 && factCount < profile.factsBudget) {
    botLines.push(`Inventory: empty`);
    factCount++;
  }

  if (botLines.length > 0) {
    sections.push(`[Bot State]\n${botLines.join('\n')}`);
  }

  // === World State Section ===
  const worldLines: string[] = [];

  // Biome (medium priority)
  if (factCount < profile.factsBudget) {
    worldLines.push(`Biome: ${context.world.biome}`);
    factCount++;
  }

  // Dimension (low priority)
  if (context.world.dimension && factCount < profile.factsBudget) {
    worldLines.push(`Dimension: ${context.world.dimension}`);
    factCount++;
  }

  // Weather (low priority)
  if (context.world.weather && factCount < profile.factsBudget) {
    worldLines.push(`Weather: ${context.world.weather}`);
    factCount++;
  }

  // Nearby entities (variable priority)
  if (context.world.nearbyEntities.length > 0 && factCount < profile.factsBudget) {
    // Prioritize hostile entities
    const hostiles = context.world.nearbyEntities.filter(e => e.hostile);
    const passives = context.world.nearbyEntities.filter(e => !e.hostile);

    const entitiesToShow = [...hostiles, ...passives].slice(0, profile.factsBudget - factCount);

    for (const entity of entitiesToShow) {
      const distStr = entity.distanceMin ? ` (${Math.round(entity.distanceMin)}m)` : '';
      const hostileStr = entity.hostile ? ' [hostile]' : '';
      worldLines.push(`Nearby: ${entity.count}x ${entity.kind}${distStr}${hostileStr}`);
      factCount++;
    }
  }

  if (worldLines.length > 0) {
    sections.push(`[World State]\n${worldLines.join('\n')}`);
  }

  // === Recent Changes Section (if profile includes deltas) ===
  if (profile.includeDeltas && context.deltas && context.deltas.length > 0) {
    const deltaLines: string[] = [];
    const deltasToShow = context.deltas.slice(0, profile.deltasBudget);

    for (const delta of deltasToShow) {
      deltaLines.push(formatDelta(delta));
      deltaCount++;
    }

    if (deltaLines.length > 0) {
      sections.push(`[Recent Changes]\n${deltaLines.join('\n')}`);
    }
  }

  // === Memory Section (if profile includes memory) ===
  if (profile.memoryBudget > 0 && context.memory && context.memory.length > 0) {
    const memoryLines: string[] = [];
    const memoriesToShow = context.memory.slice(0, profile.memoryBudget);

    for (const mem of memoriesToShow) {
      const prefix = mem.type === 'episodic' ? '[Recent]' : `[${mem.key || 'Knowledge'}]`;
      memoryLines.push(`${prefix} ${mem.text}`);
      memoryCount++;
    }

    if (memoryLines.length > 0) {
      sections.push(`[Memory]\n${memoryLines.join('\n')}`);
    }
  }

  // Combine all sections
  const text = sections.join('\n\n');

  // Compute content digest for verification
  const contentDigest = computeFrameDigest(text);

  return {
    text,
    profile: profile.name,
    factCount,
    memoryCount,
    deltaCount,
    factualOnly: true,
    contentDigest,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format time of day for display.
 */
function formatTimeOfDay(time: BotFacts['timeOfDay']): string {
  switch (time) {
    case 'dawn': return 'Dawn (early morning)';
    case 'day': return 'Day (safe)';
    case 'sunset': return 'Sunset (evening approaching)';
    case 'night': return 'Night (hostiles active)';
    default: return 'Unknown';
  }
}

/**
 * Format a state delta for display.
 */
function formatDelta(delta: StateDelta): string {
  switch (delta.type) {
    case 'damage_taken':
      return `Took ${delta.value} damage`;
    case 'health_change':
      return `Health changed by ${delta.value}`;
    case 'hunger_change':
      return `Hunger changed by ${delta.value}`;
    case 'threat_delta':
      return `Threat level: ${delta.value}`;
    case 'new_entity':
      return `New entity appeared: ${JSON.stringify(delta.value)}`;
    case 'lost_entity':
      return `Entity left: ${JSON.stringify(delta.value)}`;
    case 'time_advanced':
      return `Time advanced to ${delta.value}`;
    case 'item_gained':
      return `Gained item: ${JSON.stringify(delta.value)}`;
    case 'item_lost':
      return `Lost item: ${JSON.stringify(delta.value)}`;
    default:
      return `Change: ${JSON.stringify(delta.value)}`;
  }
}

/**
 * Compute a simple digest of frame content.
 * Uses a fast hash suitable for verification (not cryptographic).
 */
function computeFrameDigest(text: string): string {
  // Simple FNV-1a hash
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Convert a ThoughtContext to FrameContext for rendering.
 */
export function thoughtContextToFrameContext(thoughtContext: {
  currentState?: {
    position?: { x: number; y: number; z: number };
    health?: number;
    food?: number;
    inventory?: Array<{ name: string; count: number; displayName?: string }>;
    timeOfDay?: number;
    weather?: string;
    biome?: string;
    dimension?: string;
    nearbyHostiles?: number;
    nearbyPassives?: number;
  };
  recentEvents?: Array<{
    type: string;
    timestamp: number;
    data: unknown;
  }>;
  memoryContext?: {
    recentMemories?: Array<{
      content: string;
      type: string;
      timestamp: number;
    }>;
  };
}): FrameContext {
  const state = thoughtContext.currentState ?? {};

  // Convert time of day from Minecraft ticks to category
  const timeOfDay = ticksToTimeOfDay(state.timeOfDay ?? 6000);

  // Convert inventory format
  const inventory = (state.inventory ?? []).map(i => ({
    item: i.displayName || i.name,
    count: i.count,
  }));

  // Estimate threat level from nearby hostiles
  const threatLevel = estimateThreatLevel(state.nearbyHostiles ?? 0);

  // Build nearby entities from hostile/passive counts
  const nearbyEntities: WorldFacts['nearbyEntities'] = [];
  if (state.nearbyHostiles && state.nearbyHostiles > 0) {
    nearbyEntities.push({ kind: 'hostile mobs', count: state.nearbyHostiles, hostile: true });
  }
  if (state.nearbyPassives && state.nearbyPassives > 0) {
    nearbyEntities.push({ kind: 'passive mobs', count: state.nearbyPassives, hostile: false });
  }

  // Convert recent events to deltas
  const deltas: StateDelta[] = (thoughtContext.recentEvents ?? [])
    .slice(0, 10)
    .map(event => ({
      type: eventTypeToDeltaType(event.type),
      value: event.data as string | number | object,
      timestampMs: event.timestamp,
    }));

  // Convert memories
  const memory: MemoryItem[] = (thoughtContext.memoryContext?.recentMemories ?? [])
    .slice(0, 10)
    .map(mem => ({
      type: 'episodic' as const,
      text: mem.content,
      timestampMs: mem.timestamp,
    }));

  return {
    bot: {
      position: state.position ?? { x: 0, y: 64, z: 0 },
      health: state.health ?? 20,
      hunger: state.food ?? 20,
      inventory,
      timeOfDay,
      threatLevel,
    },
    world: {
      biome: state.biome ?? 'unknown',
      nearbyEntities,
      weather: state.weather,
      dimension: state.dimension,
    },
    deltas,
    memory,
  };
}

/**
 * Convert Minecraft ticks to time of day category.
 */
function ticksToTimeOfDay(ticks: number): BotFacts['timeOfDay'] {
  const normalizedTicks = ticks % 24000;
  if (normalizedTicks >= 0 && normalizedTicks < 1000) return 'dawn';
  if (normalizedTicks >= 1000 && normalizedTicks < 12000) return 'day';
  if (normalizedTicks >= 12000 && normalizedTicks < 13000) return 'sunset';
  if (normalizedTicks >= 13000 && normalizedTicks < 23000) return 'night';
  return 'dawn'; // 23000-24000 is also dawn
}

/**
 * Estimate threat level from hostile count.
 */
function estimateThreatLevel(hostileCount: number): BotFacts['threatLevel'] {
  if (hostileCount === 0) return 'none';
  if (hostileCount <= 2) return 'low';
  if (hostileCount <= 5) return 'medium';
  if (hostileCount <= 10) return 'high';
  return 'critical';
}

/**
 * Convert event type to delta type.
 */
function eventTypeToDeltaType(eventType: string): StateDelta['type'] {
  const mapping: Record<string, StateDelta['type']> = {
    'damage': 'damage_taken',
    'health_change': 'health_change',
    'hunger_change': 'hunger_change',
    'entity_spawn': 'new_entity',
    'entity_despawn': 'lost_entity',
    'item_pickup': 'item_gained',
    'item_drop': 'item_lost',
  };
  return mapping[eventType] ?? 'other';
}

/**
 * Fixtures for explore-for-resources tests.
 *
 * Data shapes match the real APIs:
 * - World perception API (packages/world/src/server.ts POST /api/perception/visual-field)
 * - executeExplore parameters from planning (resource_tags, goal_item, reason)
 * - Minecraft observation-mapper block format (type, position)
 *
 * @author @darianrosebrook
 */

/** Shape returned by world server POST /api/perception/visual-field */
export interface PerceptionObservation {
  type: string;
  name?: string;
  itemId?: string | number | null;
  pos: { x: number; y: number; z: number };
  distance: number;
  confidence?: number;
}

export interface PerceptionVisualFieldResponse {
  observations: PerceptionObservation[];
  observerPosition: { x: number; y: number; z: number };
  radius: number;
  perceptionQuality?: number;
  timestamp?: number;
}

/** executeExplore action parameters (from explore_for_resources step) */
export interface ExecuteExploreParams {
  resource_tags?: string[];
  goal_item?: string;
  reason?: string;
  radius?: number;
  distance?: number;
}

// ---------------------------------------------------------------------------
// Block observation fixtures (from recognizedObjects in world state)
// ---------------------------------------------------------------------------

export const BLOCK_OBS_STONE: PerceptionObservation = {
  type: 'block',
  name: 'stone',
  itemId: null,
  pos: { x: 5, y: 64, z: 5 },
  distance: 5,
  confidence: 0.5,
};

export const BLOCK_OBS_COBBLESTONE: PerceptionObservation = {
  type: 'block',
  name: 'cobblestone',
  itemId: 4,
  pos: { x: 3, y: 63, z: 4 },
  distance: 4.2,
  confidence: 0.5,
};

export const BLOCK_OBS_IRON_ORE: PerceptionObservation = {
  type: 'block',
  name: 'iron_ore',
  itemId: 15,
  pos: { x: 10, y: 32, z: 8 },
  distance: 12,
  confidence: 0.5,
};

export const BLOCK_OBS_DIRT: PerceptionObservation = {
  type: 'block',
  name: 'dirt',
  itemId: 3,
  pos: { x: 1, y: 64, z: 1 },
  distance: 2,
  confidence: 0.5,
};

// ---------------------------------------------------------------------------
// Item observation fixtures (from visibleEntities / dropped items)
// ---------------------------------------------------------------------------

export const ITEM_OBS_STICK: PerceptionObservation = {
  type: 'item',
  name: 'stick',
  itemId: 280,
  pos: { x: 3, y: 64, z: 3 },
  distance: 4,
  confidence: 0.5,
};

/** itemId as string (matches some real responses) */
export const ITEM_OBS_STICK_STRING_ID: PerceptionObservation = {
  type: 'item',
  name: 'stick',
  itemId: '280',
  pos: { x: 3, y: 64, z: 3 },
  distance: 4,
  confidence: 0.5,
};

// ---------------------------------------------------------------------------
// Full response fixtures
// ---------------------------------------------------------------------------

export const PERCEPTION_RESPONSE_BLOCKS_FOUND: PerceptionVisualFieldResponse = {
  observations: [BLOCK_OBS_STONE],
  observerPosition: { x: 0, y: 64, z: 0 },
  radius: 64,
  perceptionQuality: 0.5,
  timestamp: Date.now(),
};

export const PERCEPTION_RESPONSE_MIXED_BLOCKS: PerceptionVisualFieldResponse = {
  observations: [BLOCK_OBS_DIRT, BLOCK_OBS_STONE],
  observerPosition: { x: 0, y: 64, z: 0 },
  radius: 64,
  perceptionQuality: 0.5,
  timestamp: Date.now(),
};

export const PERCEPTION_RESPONSE_ITEM_FOUND: PerceptionVisualFieldResponse = {
  observations: [ITEM_OBS_STICK],
  observerPosition: { x: 0, y: 64, z: 0 },
  radius: 64,
  perceptionQuality: 0.5,
  timestamp: Date.now(),
};

export const PERCEPTION_RESPONSE_EMPTY: PerceptionVisualFieldResponse = {
  observations: [],
  observerPosition: { x: 0, y: 64, z: 0 },
  radius: 64,
  perceptionQuality: 0.5,
  timestamp: Date.now(),
};

// ---------------------------------------------------------------------------
// executeExplore params (from needsBlocks step)
// ---------------------------------------------------------------------------

export const EXPLORE_PARAMS_STONE_PICKAXE: ExecuteExploreParams = {
  resource_tags: ['stone'],
  goal_item: 'stone_pickaxe',
  reason: 'needs_blocks',
  radius: 64,
};

export const EXPLORE_PARAMS_OAK_LOG: ExecuteExploreParams = {
  resource_tags: ['oak_log'],
  goal_item: 'wooden_pickaxe',
  reason: 'needs_blocks',
  radius: 64,
};

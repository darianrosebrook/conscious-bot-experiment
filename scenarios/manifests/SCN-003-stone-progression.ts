/**
 * SCN-003: Stone Acquisition After Tool Progression
 *
 * Validates: acquire_material(stone→cobblestone), craft_recipe with
 * table navigation, full wooden→stone pickaxe chain
 *
 * Environment: flat terrain, bot starts with wooden_pickaxe and a
 * crafting_table in inventory. Stone is 2 blocks below the surface.
 * Must mine stone (getting cobblestone), craft stone_pickaxe.
 *
 * Success: bot has stone_pickaxe in inventory.
 */

import type { ScenarioManifest } from '../lib/types';

export const SCN_003: ScenarioManifest = {
  id: 'SCN-003',
  name: 'Stone Progression — Stone Pickaxe',
  description:
    'Bot starts with wooden_pickaxe. Must mine exposed stone (getting ' +
    'cobblestone). Isolates the stone mining + pickup chain.',
  capabilities: ['acquire_material', 'stone_drop_alias', 'pickup_after_dig'],

  baseline: 'flat',

  fixture: {
    clearRegions: [
      { block: 'minecraft:air', from: { x: -8, y: 64, z: -8 }, to: { x: 8, y: 74, z: 8 } },
    ],
    fillRegions: [
      // Flat grass platform
      { block: 'minecraft:grass_block', from: { x: -8, y: 63, z: -8 }, to: { x: 8, y: 63, z: 8 } },
      // Dirt layer
      { block: 'minecraft:dirt', from: { x: -8, y: 62, z: -8 }, to: { x: 8, y: 62, z: 8 } },
      // Stone layer — accessible by digging 1 block of dirt
      { block: 'minecraft:stone', from: { x: -8, y: 59, z: -8 }, to: { x: 8, y: 61, z: 8 } },
    ],
    blocks: [
      // Exposed stone ring around spawn — impossible to miss from any direction.
      // Each stone has air above it so the exposed-first scan will find it.
      // Placed at Y=63 (ground level) directly adjacent to spawn (0, 64, 0).
      { block: 'minecraft:stone', pos: { x: 1, y: 63, z: 0 } },
      { block: 'minecraft:stone', pos: { x: -1, y: 63, z: 0 } },
      { block: 'minecraft:stone', pos: { x: 0, y: 63, z: 1 } },
      { block: 'minecraft:stone', pos: { x: 0, y: 63, z: -1 } },
      { block: 'minecraft:stone', pos: { x: 1, y: 63, z: 1 } },
      { block: 'minecraft:stone', pos: { x: -1, y: 63, z: -1 } },
      { block: 'minecraft:stone', pos: { x: 2, y: 63, z: 0 } },
      { block: 'minecraft:stone', pos: { x: -2, y: 63, z: 0 } },
      { block: 'minecraft:stone', pos: { x: 0, y: 63, z: 2 } },
      { block: 'minecraft:stone', pos: { x: 0, y: 63, z: -2 } },
      // Clear air above all exposed stone (should already be air from clear region, but explicit)
      { block: 'minecraft:air', pos: { x: 1, y: 64, z: 0 } },
      { block: 'minecraft:air', pos: { x: -1, y: 64, z: 0 } },
      { block: 'minecraft:air', pos: { x: 0, y: 64, z: 1 } },
      { block: 'minecraft:air', pos: { x: 0, y: 64, z: -1 } },
      { block: 'minecraft:air', pos: { x: 1, y: 64, z: 1 } },
      { block: 'minecraft:air', pos: { x: -1, y: 64, z: -1 } },
      { block: 'minecraft:air', pos: { x: 2, y: 64, z: 0 } },
      { block: 'minecraft:air', pos: { x: -2, y: 64, z: 0 } },
      { block: 'minecraft:air', pos: { x: 0, y: 64, z: 2 } },
      { block: 'minecraft:air', pos: { x: 0, y: 64, z: -2 } },
    ],
    commands: [],
  },

  rules: {
    difficulty: 'peaceful',
    doDaylightCycle: false,
    doMobSpawning: false,
    doWeatherCycle: false,
    time: 6000,
    weather: 'clear',
  },

  bot: {
    position: { x: 0, y: 64, z: 0 },
    gameMode: 'survival',
    health: 20,
    food: 20,
    inventory: [
      { item: 'wooden_pickaxe', count: 1 },
    ],
  },

  preRunInvariants: [
    {
      type: 'block_present',
      description: 'Exposed stone at (1, 63, 0) — adjacent to spawn',
      params: { pos: { x: 1, y: 63, z: 0 }, block: 'stone' },
    },
    {
      type: 'inventory_contains',
      description: 'Bot has wooden_pickaxe',
      params: { item: 'wooden_pickaxe', count: 1 },
    },
    {
      type: 'inventory_contains',
      description: 'Bot has crafting_table',
      params: { item: 'crafting_table', count: 1 },
    },
  ],

  acceptance: [
    {
      id: 'AC-1',
      description: 'Bot inventory contains stone_pickaxe',
      type: 'inventory_has',
      params: { item: 'stone_pickaxe', minCount: 1 },
    },
    {
      id: 'AC-2',
      description: 'acquire_material collected cobblestone (stone drop alias)',
      type: 'log_contains',
      params: { pattern: 'acquire_material.*status=success' },
    },
    {
      id: 'AC-3',
      description: 'pickup_diag shows nearbyItemEntities > 0 (entity type fix validated)',
      type: 'log_absent',
      params: { pattern: 'nearbyItemEntities=0.*invDelta=none' },
    },
    {
      id: 'AC-4',
      description: 'craft_recipe navigated to crafting table (no 15s timeout)',
      type: 'log_absent',
      params: { pattern: 'craft_recipe.*reason=craft_aborted' },
    },
  ],

  maxDurationSeconds: 180,
  tags: ['stone', 'tool-progression', 'pickup', 'tier-1', 'certification'],
};

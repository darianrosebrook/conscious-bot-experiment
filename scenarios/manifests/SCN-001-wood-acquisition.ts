/**
 * SCN-001: Wood Acquisition on Flat Terrain
 *
 * Validates: explore_for_resources, acquire_material, pickup after dig
 *
 * Environment: flat grass platform, 3 oak trees within 8 blocks,
 * empty inventory, survival mode, peaceful, daytime.
 *
 * Success: bot acquires at least 1 oak_log in inventory.
 */

import type { ScenarioManifest } from '../lib/types';

export const SCN_001: ScenarioManifest = {
  id: 'SCN-001',
  name: 'Wood Acquisition — Flat Terrain',
  description:
    'Bot spawns on flat ground with visible oak trees within 8 blocks. ' +
    'Must locate, navigate to, dig, and collect at least one log.',
  capabilities: ['explore_for_resources', 'acquire_material', 'pickup_after_dig'],

  baseline: 'flat',

  fixture: {
    // Clear a 20x20x20 area at spawn for clean flat terrain
    clearRegions: [
      { block: 'minecraft:air', from: { x: -10, y: 64, z: -10 }, to: { x: 10, y: 84, z: 10 } },
    ],
    fillRegions: [
      // Flat grass platform
      { block: 'minecraft:grass_block', from: { x: -10, y: 63, z: -10 }, to: { x: 10, y: 63, z: 10 } },
      // Dirt below
      { block: 'minecraft:dirt', from: { x: -10, y: 60, z: -10 }, to: { x: 10, y: 62, z: 10 } },
      // Bedrock floor
      { block: 'minecraft:bedrock', from: { x: -10, y: 59, z: -10 }, to: { x: 10, y: 59, z: 10 } },
    ],
    blocks: [],
    commands: [
      // Plant oak trees at known positions
      // Tree 1: 5 blocks east of spawn
      'setblock 5 64 0 minecraft:oak_log',
      'setblock 5 65 0 minecraft:oak_log',
      'setblock 5 66 0 minecraft:oak_log',
      'setblock 5 67 0 minecraft:oak_log',
      'fill 3 67 -2 7 68 2 minecraft:oak_leaves',
      'fill 4 69 -1 6 69 1 minecraft:oak_leaves',
      'setblock 5 67 0 minecraft:oak_log',

      // Tree 2: 7 blocks north of spawn
      'setblock 0 64 -7 minecraft:oak_log',
      'setblock 0 65 -7 minecraft:oak_log',
      'setblock 0 66 -7 minecraft:oak_log',
      'setblock 0 67 -7 minecraft:oak_log',
      'fill -2 67 -9 2 68 -5 minecraft:oak_leaves',
      'fill -1 69 -8 1 69 -6 minecraft:oak_leaves',
      'setblock 0 67 -7 minecraft:oak_log',

      // Tree 3: 6 blocks south-west
      'setblock -6 64 5 minecraft:oak_log',
      'setblock -6 65 5 minecraft:oak_log',
      'setblock -6 66 5 minecraft:oak_log',
      'setblock -6 67 5 minecraft:oak_log',
      'fill -8 67 3 -4 68 7 minecraft:oak_leaves',
      'fill -7 69 4 -5 69 6 minecraft:oak_leaves',
      'setblock -6 67 5 minecraft:oak_log',
    ],
  },

  rules: {
    difficulty: 'peaceful',
    doDaylightCycle: false,
    doMobSpawning: false,
    doWeatherCycle: false,
    time: 6000,    // noon
    weather: 'clear',
  },

  bot: {
    position: { x: 0, y: 64, z: 0 },
    gameMode: 'survival',
    health: 20,
    food: 20,
    inventory: [],
  },

  preRunInvariants: [
    {
      type: 'block_present',
      description: 'Oak log at (5, 64, 0) — tree 1 trunk base',
      params: { pos: { x: 5, y: 64, z: 0 }, block: 'oak_log' },
    },
    {
      type: 'block_present',
      description: 'Oak log at (0, 64, -7) — tree 2 trunk base',
      params: { pos: { x: 0, y: 64, z: -7 }, block: 'oak_log' },
    },
    {
      type: 'block_present',
      description: 'Oak log at (-6, 64, 5) — tree 3 trunk base',
      params: { pos: { x: -6, y: 64, z: 5 }, block: 'oak_log' },
    },
    {
      type: 'inventory_empty',
      description: 'Bot starts with empty inventory',
      params: {},
    },
  ],

  acceptance: [
    {
      id: 'AC-1',
      description: 'Bot inventory contains at least 1 oak_log',
      type: 'inventory_has',
      params: { item: 'oak_log', minCount: 1 },
    },
    {
      id: 'AC-2',
      description: 'acquire_material reported success at least once',
      type: 'log_contains',
      params: { pattern: 'acquire_material.*status=success' },
    },
    {
      id: 'AC-3',
      description: 'No reconnect storms occurred',
      type: 'log_absent',
      params: { pattern: 'duplicate_login|logged in from another location' },
    },
  ],

  maxDurationSeconds: 120,
  tags: ['wood', 'acquisition', 'tier-0', 'certification'],
};

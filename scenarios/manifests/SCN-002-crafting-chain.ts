/**
 * SCN-002: Crafting Chain — Planks, Sticks, Table, Pickaxe
 *
 * Validates: craft_recipe, place_workstation, full tool progression tier 0
 *
 * Environment: flat terrain, bot starts with 4 oak_log in inventory,
 * no crafting table in the world. Must craft planks, sticks, place a
 * crafting table, and craft a wooden pickaxe.
 *
 * Success: bot has wooden_pickaxe in inventory.
 */

import type { ScenarioManifest } from '../lib/types';

export const SCN_002: ScenarioManifest = {
  id: 'SCN-002',
  name: 'Crafting Chain — Wooden Pickaxe',
  description:
    'Bot starts with 4 oak_log. Must craft planks, sticks, crafting table, ' +
    'place the table on flat ground, and craft a wooden pickaxe.',
  capabilities: ['craft_recipe', 'place_workstation', 'tool_progression'],

  baseline: 'flat',

  fixture: {
    clearRegions: [
      { block: 'minecraft:air', from: { x: -5, y: 64, z: -5 }, to: { x: 5, y: 74, z: 5 } },
    ],
    fillRegions: [
      { block: 'minecraft:grass_block', from: { x: -5, y: 63, z: -5 }, to: { x: 5, y: 63, z: 5 } },
      { block: 'minecraft:dirt', from: { x: -5, y: 60, z: -5 }, to: { x: 5, y: 62, z: 5 } },
    ],
    blocks: [],
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
    inventory: [{ item: 'oak_log', count: 4 }],
  },

  preRunInvariants: [
    {
      type: 'block_absent',
      description: 'No crafting table near spawn (bot must place one)',
      params: { pos: { x: 0, y: 64, z: 0 }, block: 'crafting_table', radius: 8 },
    },
    {
      type: 'inventory_contains',
      description: 'Bot has 4 oak_log',
      params: { item: 'oak_log', count: 4 },
    },
  ],

  acceptance: [
    {
      id: 'AC-1',
      description: 'Bot inventory contains wooden_pickaxe',
      type: 'inventory_has',
      params: { item: 'wooden_pickaxe', minCount: 1 },
    },
    {
      id: 'AC-2',
      description: 'place_workstation succeeded',
      type: 'log_contains',
      params: { pattern: 'place_workstation.*status=success' },
    },
    {
      id: 'AC-3',
      description: 'craft_recipe succeeded for wooden_pickaxe',
      type: 'log_contains',
      params: { pattern: 'craft_recipe.*status=success' },
    },
  ],

  maxDurationSeconds: 180,
  tags: ['crafting', 'placement', 'tier-0', 'certification'],
};

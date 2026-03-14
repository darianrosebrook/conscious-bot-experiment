/**
 * SCN-004: Forced Prerequisite Failure — Craft Without Workstation
 *
 * Validates: M3.5 negative path — executor prereq injection from toolDiagnostics
 *
 * Environment: flat terrain, bot starts with planks + sticks in inventory
 * (enough to craft a wooden_pickaxe), but NO crafting table in inventory
 * and NO crafting table placed in the world. The bot will try craft_recipe
 * for wooden_pickaxe, fail with requires_workstation=true + crafting_table_nearby=false,
 * and the executor must inject a workstation/material prereq.
 *
 * The difference from SCN-002: SCN-002 starts from logs and Sterling plans
 * the full chain including place_workstation. SCN-004 starts with materials
 * already present but forces the negative path by having no table and no
 * table in inventory — the bot must discover it needs to craft + place one.
 *
 * Success: prereq injection fires (observable via logs), and eventually
 * the bot obtains a wooden_pickaxe.
 */

import type { ScenarioManifest } from '../lib/types';

export const SCN_004: ScenarioManifest = {
  id: 'SCN-004',
  name: 'Forced Prereq Failure — Workstation Missing',
  description:
    'Bot has planks + sticks but no crafting table anywhere. ' +
    'Craft wooden_pickaxe must fail with toolDiagnostics, triggering prereq injection.',
  capabilities: ['craft_recipe', 'place_workstation', 'prerequisite_injection'],

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
    // Enough materials for pickaxe but NO crafting table
    inventory: [
      { item: 'oak_planks', count: 8 },
      { item: 'stick', count: 4 },
    ],
  },

  preRunInvariants: [
    {
      type: 'block_absent',
      description: 'No crafting table near spawn',
      params: { pos: { x: 0, y: 64, z: 0 }, block: 'crafting_table', radius: 16 },
    },
  ],

  postRunInvariants: [
    {
      type: 'inventory_contains',
      description: 'Bot has wooden_pickaxe',
      params: { item: 'wooden_pickaxe', minCount: 1 },
    },
  ],

  timeoutMs: 120_000,
};

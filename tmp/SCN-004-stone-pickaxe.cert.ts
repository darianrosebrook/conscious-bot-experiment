import type { ScenarioManifest } from './types';

export const SCN_004: ScenarioManifest = {
  id: 'SCN-004',
  name: 'Stone Pickaxe Progression — Certification Arena',
  description:
    'Bot starts with wooden_pickaxe, crafting_table, and sticks. Surface stone is available on the south pad. ' +
    'Must mine enough stone to obtain cobblestone, then craft a stone_pickaxe. This extends SCN-003 after pickup is stable.',
  capabilities: ['acquire_material', 'stone_drop_alias', 'craft_recipe', 'tool_progression'],
  baseline: 'custom',
  fixture: {
    commands: ['# Use ./scripts/cert-arena.sh reset scn-004 before run'],
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
    position: { x: 1000, y: 64, z: 1000 },
    gameMode: 'survival',
    health: 20,
    food: 20,
    inventory: [
      { item: 'wooden_pickaxe', count: 1 },
      { item: 'crafting_table', count: 1 },
      { item: 'stick', count: 2 },
    ],
  },
  preRunInvariants: [
    {
      type: 'block_present',
      description: 'Surface stone exists on south pad',
      params: { pos: { x: 1001, y: 63, z: 1010 }, block: 'stone' },
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
    {
      type: 'inventory_contains',
      description: 'Bot has stick x2',
      params: { item: 'stick', count: 2 },
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
      description: 'Bot inventory contains cobblestone at some point or acquired stone successfully',
      type: 'log_contains',
      params: { pattern: 'pickup_diag: target=stone.*nearbyItemEntities=[1-9]|acquire_material status=success.*harvest_complete' },
    },
    {
      id: 'AC-3',
      description: 'No reconnect storms occurred',
      type: 'log_absent',
      params: { pattern: 'duplicate_login|logged in from another location' },
    },
  ],
  maxDurationSeconds: 180,
  tags: ['stone-pickaxe', 'tool-progression', 'cert-arena', 'tier-1', 'certification'],
};

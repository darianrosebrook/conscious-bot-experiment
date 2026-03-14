import type { ScenarioManifest } from './types';

export const SCN_003: ScenarioManifest = {
  id: 'SCN-003',
  name: 'Stone Mining + Pickup — Certification Arena',
  description:
    'Bot starts with a wooden_pickaxe at arena center. Exposed surface stone is placed on the south pad. ' +
    'Scenario isolates mining and pickup only: acquire stone, collect cobblestone, do not require crafting.',
  capabilities: ['acquire_material', 'stone_drop_alias', 'pickup_after_dig'],
  baseline: 'custom',
  fixture: {
    commands: ['# Use ./scripts/cert-arena.sh reset scn-003 before run'],
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
    inventory: [{ item: 'wooden_pickaxe', count: 1 }],
  },
  preRunInvariants: [
    {
      type: 'block_present',
      description: 'Surface stone exists on south pad adjacent pattern',
      params: { pos: { x: 1001, y: 63, z: 1010 }, block: 'stone' },
    },
    {
      type: 'inventory_contains',
      description: 'Bot has wooden_pickaxe',
      params: { item: 'wooden_pickaxe', count: 1 },
    },
    {
      type: 'bot_at_position',
      description: 'Bot starts on arena center pad',
      params: { pos: { x: 1000, y: 64, z: 1000 }, maxDistance: 1.0 },
    },
  ],
  acceptance: [
    {
      id: 'AC-1',
      description: 'Bot inventory contains cobblestone',
      type: 'inventory_has',
      params: { item: 'cobblestone', minCount: 1 },
    },
    {
      id: 'AC-2',
      description: 'Stone acquire_material step succeeded',
      type: 'log_contains',
      params: { pattern: 'acquire_material status=success.*harvest_complete|harvest_complete' },
    },
    {
      id: 'AC-3',
      description: 'Pickup diagnostics observed nearby item entities for stone',
      type: 'log_contains',
      params: { pattern: 'pickup_diag: target=stone.*nearbyItemEntities=[1-9]' },
    },
    {
      id: 'AC-4',
      description: 'No reconnect storms occurred',
      type: 'log_absent',
      params: { pattern: 'duplicate_login|logged in from another location' },
    },
  ],
  maxDurationSeconds: 180,
  tags: ['stone', 'pickup', 'cert-arena', 'tier-1', 'certification'],
};

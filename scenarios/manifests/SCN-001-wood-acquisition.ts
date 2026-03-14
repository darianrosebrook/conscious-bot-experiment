import type { ScenarioManifest } from './types';

export const SCN_001: ScenarioManifest = {
  id: 'SCN-001',
  name: 'Wood Acquisition — Certification Arena',
  description:
    'Bot spawns at arena center with three oak-log columns on the north pad. ' +
    'Must acquire at least one oak_log without terrain ambiguity or natural-world spillover.',
  capabilities: ['explore_for_resources', 'acquire_material', 'pickup_after_dig'],
  baseline: 'custom',
  fixture: {
    commands: ['# Use ./scripts/cert-arena.sh reset scn-001 before run'],
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
    inventory: [],
  },
  preRunInvariants: [
    {
      type: 'block_present',
      description: 'North pad center log column exists',
      params: { pos: { x: 1000, y: 64, z: 990 }, block: 'oak_log' },
    },
    {
      type: 'block_present',
      description: 'North pad west log column exists',
      params: { pos: { x: 996, y: 64, z: 990 }, block: 'oak_log' },
    },
    {
      type: 'block_present',
      description: 'North pad east log column exists',
      params: { pos: { x: 1004, y: 64, z: 990 }, block: 'oak_log' },
    },
    {
      type: 'inventory_empty',
      description: 'Bot starts with empty inventory',
      params: {},
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
      description: 'Bot inventory contains at least 1 oak_log',
      type: 'inventory_has',
      params: { item: 'oak_log', minCount: 1 },
    },
    {
      id: 'AC-2',
      description: 'acquire_material reported success at least once',
      type: 'log_contains',
      params: { pattern: 'acquire_material status=success' },
    },
    {
      id: 'AC-3',
      description: 'No reconnect storms occurred',
      type: 'log_absent',
      params: { pattern: 'duplicate_login|logged in from another location' },
    },
  ],
  maxDurationSeconds: 120,
  tags: ['wood', 'cert-arena', 'tier-0', 'certification'],
};

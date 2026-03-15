import type { ScenarioManifest } from './types';

export const SCN_002: ScenarioManifest = {
  id: 'SCN-002',
  name: 'Crafting Chain — Certification Arena',
  description:
    'Bot starts at arena center with 4 oak_log and no crafting table placed in the world. ' +
    'Must craft planks, sticks, a crafting table, place it on the workstation pad, and craft a wooden_pickaxe.',
  capabilities: ['craft_recipe', 'place_workstation', 'tool_progression'],
  baseline: 'custom',
  fixture: {
    commands: ['# Use ./scripts/cert-arena.sh reset scn-002 before run'],
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
    inventory: [{ item: 'oak_log', count: 4 }],
  },
  preRunInvariants: [
    {
      type: 'inventory_contains',
      description: 'Bot has 4 oak_log',
      params: { item: 'oak_log', count: 4 },
    },
    {
      type: 'block_absent',
      description: 'No crafting table already placed on workstation pad center',
      params: { pos: { x: 1012, y: 64, z: 1000 }, block: 'crafting_table', radius: 2 },
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
      description: 'Bot inventory contains wooden_pickaxe',
      type: 'inventory_has',
      params: { item: 'wooden_pickaxe', minCount: 1 },
    },
    {
      id: 'AC-2',
      description: 'place_workstation succeeded',
      type: 'log_contains',
      params: { pattern: 'place_workstation status=success' },
    },
    {
      id: 'AC-3',
      description: 'Plan dispatched wooden_pickaxe craft step',
      type: 'log_contains',
      params: { pattern: 'recipe":"wooden_pickaxe:v11' },
    },
    {
      id: 'AC-4',
      description: 'No reconnect storms occurred',
      type: 'log_absent',
      params: { pattern: 'duplicate_login|logged in from another location' },
    },
  ],
  maxDurationSeconds: 180,
  tags: ['crafting', 'workstation', 'cert-arena', 'tier-0', 'certification'],
};

import type { ScenarioManifest } from './types';

/**
 * SCN-004: Forced Prerequisite Injection — Negative Path Proof
 *
 * Bot starts with materials for wooden_pickaxe (planks + sticks) but
 * NO crafting table in inventory or world. The craft_recipe leaf MUST
 * fail with requires_workstation=true, crafting_table_nearby=false,
 * and the M3.5 prereq injection MUST fire to spawn a workstation
 * placement or crafting subtask.
 *
 * This scenario validates the RECOVERY path, not the proactive path.
 * SCN-002 proved the solver plans the full chain; SCN-004 proves the
 * executor recovers when the plan is incomplete.
 */
export const SCN_004: ScenarioManifest = {
  id: 'SCN-004',
  name: 'Forced Prereq Injection — Workstation Missing',
  description:
    'Bot has planks + sticks for wooden_pickaxe but no crafting table. ' +
    'craft_recipe must fail, prereq injection must fire.',
  capabilities: ['craft_recipe', 'place_workstation', 'prereq_injection'],
  baseline: 'custom',
  fixture: {
    commands: [
      // Clear any crafting tables from previous scenarios in the arena area
      'fill 984 63 984 1016 66 1016 minecraft:air replace minecraft:crafting_table',
    ],
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
      { item: 'oak_planks', count: 7 },
      { item: 'stick', count: 4 },
    ],
  },
  preRunInvariants: [
    {
      type: 'inventory_contains',
      description: 'Bot has enough planks for table + pickaxe',
      params: { item: 'oak_planks', count: 7 },
    },
    {
      type: 'inventory_contains',
      description: 'Bot has sticks for pickaxe',
      params: { item: 'stick', count: 4 },
    },
    {
      type: 'block_absent',
      description: 'No crafting table anywhere near bot',
      params: { pos: { x: 1000, y: 64, z: 1000 }, block: 'crafting_table', radius: 16 },
    },
  ],
  acceptance: [
    {
      id: 'AC-1',
      description: 'craft_recipe failed with workstation diagnostics',
      type: 'log_contains',
      params: { pattern: 'workstation=true' },
    },
    {
      id: 'AC-2',
      description: 'Prereq injection fired from executor failure path',
      type: 'log_contains',
      params: { pattern: 'executor_craft_prereq\\|executor_explore_subtask.*craft\\|waiting_on_prereq' },
    },
    {
      id: 'AC-3',
      description: 'Bot eventually has wooden_pickaxe (recovery succeeded)',
      type: 'inventory_has',
      params: { item: 'wooden_pickaxe', minCount: 1 },
    },
  ],
  maxDurationSeconds: 180,
  tags: ['crafting', 'prereq-injection', 'negative-path', 'M3.5'],
};

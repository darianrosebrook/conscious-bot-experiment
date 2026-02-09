/**
 * Minecraft Contingency Definitions
 *
 * Defines forced transitions, triggers, chosen actions, and safety
 * invariants for Minecraft contingency planning scenarios.
 * Uses the domain-agnostic P09 capsule types.
 *
 * Pure configuration — no adapter classes, no side effects.
 */

import type {
  P09ChosenActionEdgeV1,
  P09ForcedTransitionEdgeV1,
  P09SafetyInvariantV1,
  P09TimeIndexedStateV1,
  P09TriggerConditionV1,
} from '../sterling/primitives/p09/p09-capsule-types.js';

// ── Minecraft Forced Transitions ─────────────────────────────────────

/**
 * Exogenous events the bot cannot decline.
 *
 * Minecraft forced transitions:
 *   - Hunger drain: food depletes every ~80 game ticks
 *   - Nightfall: light drops, hostile mobs spawn (every 12000 ticks in-game,
 *     scaled to 200 ticks in the planning model)
 *   - Mob damage: health loss when exposed at night without shelter
 *   - Starvation: health loss when food reaches 0
 */
export const MINECRAFT_FORCED_TRANSITIONS: readonly P09ForcedTransitionEdgeV1[] = [
  {
    edgeKind: 'forced',
    id: 'mc_hunger_tick',
    name: 'Hunger tick',
    triggerId: 'mc_trigger_hunger',
    effects: { food: -1 },
  },
  {
    edgeKind: 'forced',
    id: 'mc_nightfall',
    name: 'Nightfall',
    triggerId: 'mc_trigger_nightfall',
    effects: { light_level: -15 },
  },
  {
    edgeKind: 'forced',
    id: 'mc_mob_damage',
    name: 'Mob attack damage',
    triggerId: 'mc_trigger_mob_spawn',
    effects: { health: -4 },
  },
  {
    edgeKind: 'forced',
    id: 'mc_starvation',
    name: 'Starvation damage',
    triggerId: 'mc_trigger_starvation',
    effects: { health: -1 },
  },
];

// ── Minecraft Triggers ───────────────────────────────────────────────

export const MINECRAFT_TRIGGERS: readonly P09TriggerConditionV1[] = [
  {
    id: 'mc_trigger_hunger',
    name: 'Hunger drain every 80 ticks',
    mode: 'tick_interval',
    intervalTicks: 80,
    offsetTicks: 80,
    watchProperty: '',
    thresholdValue: 0,
    activatesTransitionId: 'mc_hunger_tick',
  },
  {
    id: 'mc_trigger_nightfall',
    name: 'Nightfall at tick 200 (repeats every 400)',
    mode: 'tick_interval',
    intervalTicks: 400,
    offsetTicks: 200,
    watchProperty: '',
    thresholdValue: 0,
    activatesTransitionId: 'mc_nightfall',
  },
  {
    id: 'mc_trigger_mob_spawn',
    name: 'Mobs spawn when light level reaches 0',
    mode: 'threshold',
    intervalTicks: 0,
    offsetTicks: 0,
    watchProperty: 'light_level',
    thresholdValue: 0,
    activatesTransitionId: 'mc_mob_damage',
  },
  {
    id: 'mc_trigger_starvation',
    name: 'Starvation when food reaches 0',
    mode: 'threshold',
    intervalTicks: 0,
    offsetTicks: 0,
    watchProperty: 'food',
    thresholdValue: 0,
    activatesTransitionId: 'mc_starvation',
  },
];

// ── Minecraft Chosen Actions ─────────────────────────────────────────

/**
 * Actions the bot can choose during a mining trip:
 *   - mine_ore: gather resources (the primary goal)
 *   - eat_bread: restore food level
 *   - build_shelter: protect from nighttime mobs
 *   - craft_torch: restore light level locally
 *   - return_home: retreat to safety (gives up on mining)
 */
export const MINECRAFT_CONTINGENCY_ACTIONS: readonly P09ChosenActionEdgeV1[] = [
  {
    edgeKind: 'chosen',
    id: 'mc_mine_ore',
    name: 'Mine ore',
    durationTicks: 40,
    cost: 2,
    effects: { ore: 3 },
    preconditions: { health: 1 },
  },
  {
    edgeKind: 'chosen',
    id: 'mc_eat_bread',
    name: 'Eat bread',
    durationTicks: 10,
    cost: 1,
    effects: { food: 5 },
    preconditions: {},
  },
  {
    edgeKind: 'chosen',
    id: 'mc_build_shelter',
    name: 'Build dirt shelter',
    durationTicks: 60,
    cost: 5,
    effects: { has_shelter: 1 },
    preconditions: { health: 1 },
  },
  {
    edgeKind: 'chosen',
    id: 'mc_craft_torch',
    name: 'Craft and place torch',
    durationTicks: 20,
    cost: 2,
    effects: { light_level: 14 },
    preconditions: {},
  },
  {
    edgeKind: 'chosen',
    id: 'mc_return_home',
    name: 'Return home (safe retreat)',
    durationTicks: 50,
    cost: 8,
    effects: { light_level: 15, has_shelter: 1 },
    preconditions: {},
  },
];

// ── Minecraft Safety Invariants ──────────────────────────────────────

export const MINECRAFT_SAFETY_INVARIANTS: readonly P09SafetyInvariantV1[] = [
  {
    id: 'mc_stay_alive',
    name: 'Health must remain above 0',
    minimums: { health: 1 },
  },
  {
    id: 'mc_no_starvation',
    name: 'Food must remain above 0',
    minimums: { food: 1 },
  },
];

// ── Minecraft Initial State ──────────────────────────────────────────

export const MINECRAFT_MINING_TRIP_INITIAL: P09TimeIndexedStateV1 = {
  tick: 0,
  properties: {
    health: 20,
    food: 20,
    ore: 0,
    light_level: 15,
    has_shelter: 0,
  },
};

// ── Minecraft Contingency Parameters ─────────────────────────────────

export const MINECRAFT_CONTINGENCY_PARAMS = {
  /** Plan horizon for a mining trip (covers nightfall + hunger). */
  horizonTicks: 300,
  /** Ore collection goal. */
  oreGoal: 6,
} as const;

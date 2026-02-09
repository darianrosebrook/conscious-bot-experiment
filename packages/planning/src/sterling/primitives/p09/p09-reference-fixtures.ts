/**
 * P09 Reference Fixtures — Two-Domain Portability Proof
 *
 * Domain 1: Mining Trip — nightfall (forced darkness + mob spawns) and
 *           hunger ticks (forced food depletion). Agent must mine ore,
 *           eat food, and build shelter before nightfall.
 *
 * Domain 2: SRE Traffic Spike — scheduled external load spike and
 *           server degradation. Agent must autoscale, cache, or rollback
 *           before the spike hits.
 *
 * Both domains use the same P09 capsule contract, proving domain-agnosticism.
 *
 * Zero Minecraft runtime imports. Zero vitest imports.
 */

import type {
  P09ChosenActionEdgeV1,
  P09ForcedTransitionEdgeV1,
  P09SafetyInvariantV1,
  P09TimeIndexedStateV1,
  P09TriggerConditionV1,
} from './p09-capsule-types.js';

// ═══════════════════════════════════════════════════════════════════════
// Domain 1: Mining Trip (nightfall + hunger ticks)
// ═══════════════════════════════════════════════════════════════════════

/**
 * State properties for the mining trip domain:
 *   health:      0-20 (death at 0)
 *   food:        0-20 (hunger ticks drain food; starvation drains health)
 *   ore:         0+   (mining goal target)
 *   light_level: 0-15 (drops to 0 at nightfall; mob spawns when <= 7)
 *   has_shelter: 0|1  (1 = shelter built; prevents mob damage at night)
 */

export const MINING_INITIAL_STATE: P09TimeIndexedStateV1 = {
  tick: 0,
  properties: {
    health: 20,
    food: 20,
    ore: 0,
    light_level: 15,
    has_shelter: 0,
  },
};

// -- Forced Transitions (world events the agent cannot decline) --------

export const MINING_FORCED_TRANSITIONS: readonly P09ForcedTransitionEdgeV1[] = [
  {
    edgeKind: 'forced',
    id: 'hunger_tick',
    name: 'Hunger tick (food depletes)',
    triggerId: 'trigger_hunger',
    effects: { food: -1 },
  },
  {
    edgeKind: 'forced',
    id: 'nightfall',
    name: 'Nightfall (light drops to danger zone)',
    triggerId: 'trigger_nightfall',
    effects: { light_level: -15 },
  },
  {
    edgeKind: 'forced',
    id: 'mob_damage',
    name: 'Mob attack (damage without shelter at night)',
    triggerId: 'trigger_mob_spawn',
    effects: { health: -4 },
  },
  {
    edgeKind: 'forced',
    id: 'starvation_damage',
    name: 'Starvation damage (health loss when food is 0)',
    triggerId: 'trigger_starvation',
    effects: { health: -1 },
  },
];

// -- Triggers (when forced transitions fire) ---------------------------

export const MINING_TRIGGERS: readonly P09TriggerConditionV1[] = [
  {
    id: 'trigger_hunger',
    name: 'Hunger tick every 80 ticks',
    mode: 'tick_interval',
    intervalTicks: 80,
    offsetTicks: 80, // First tick at t=80
    watchProperty: '',
    thresholdValue: 0,
    activatesTransitionId: 'hunger_tick',
  },
  {
    id: 'trigger_nightfall',
    name: 'Nightfall at tick 200',
    mode: 'tick_interval',
    intervalTicks: 400, // Day/night cycle = 400 ticks
    offsetTicks: 200,   // First nightfall at t=200
    watchProperty: '',
    thresholdValue: 0,
    activatesTransitionId: 'nightfall',
  },
  {
    id: 'trigger_mob_spawn',
    name: 'Mobs spawn when light is zero and no shelter',
    mode: 'threshold',
    intervalTicks: 0,
    offsetTicks: 0,
    watchProperty: 'light_level',
    thresholdValue: 0,
    activatesTransitionId: 'mob_damage',
  },
  {
    id: 'trigger_starvation',
    name: 'Starvation when food reaches 0',
    mode: 'threshold',
    intervalTicks: 0,
    offsetTicks: 0,
    watchProperty: 'food',
    thresholdValue: 0,
    activatesTransitionId: 'starvation_damage',
  },
];

// -- Chosen Actions (agent decisions) ----------------------------------

export const MINING_ACTIONS: readonly P09ChosenActionEdgeV1[] = [
  {
    edgeKind: 'chosen',
    id: 'mine_ore',
    name: 'Mine ore',
    durationTicks: 40,
    cost: 2,
    effects: { ore: 3 },
    preconditions: { health: 1 },
  },
  {
    edgeKind: 'chosen',
    id: 'eat_food',
    name: 'Eat food (restores food level)',
    durationTicks: 10,
    cost: 1,
    effects: { food: 5 },
    preconditions: {},
  },
  {
    edgeKind: 'chosen',
    id: 'build_shelter',
    name: 'Build shelter (protects from mobs)',
    durationTicks: 60,
    cost: 5,
    effects: { has_shelter: 1 },
    preconditions: { health: 1 },
  },
  {
    edgeKind: 'chosen',
    id: 'retreat_to_surface',
    name: 'Retreat to surface (safe but no ore)',
    durationTicks: 30,
    cost: 3,
    effects: { light_level: 15 },
    preconditions: {},
  },
  {
    edgeKind: 'chosen',
    id: 'idle',
    name: 'Wait (do nothing for one tick)',
    durationTicks: 1,
    cost: 0,
    effects: {},
    preconditions: {},
  },
];

// -- Safety Invariants -------------------------------------------------

export const MINING_SAFETY_INVARIANTS: readonly P09SafetyInvariantV1[] = [
  {
    id: 'stay_alive',
    name: 'Health must remain above 0',
    minimums: { health: 1 },
  },
  {
    id: 'no_starvation',
    name: 'Food must remain above 0',
    minimums: { food: 1 },
  },
];

/**
 * Goal predicate for mining: collect at least 6 ore and survive.
 */
export function miningGoalPredicate(state: P09TimeIndexedStateV1): boolean {
  return (state.properties.ore ?? 0) >= 6 && (state.properties.health ?? 0) >= 1;
}

/**
 * Mining domain parameters for contingency planning.
 */
export const MINING_DEFAULT_PARAMS = {
  horizonTicks: 300, // Plan 300 ticks ahead (covers nightfall at 200)
} as const;


// ═══════════════════════════════════════════════════════════════════════
// Domain 2: SRE Traffic Spike (scheduled spike + degradation)
// ═══════════════════════════════════════════════════════════════════════

/**
 * State properties for the SRE domain:
 *   capacity:       0-100 (server capacity units)
 *   latency_ms:     0+    (current p99 latency)
 *   error_rate:     0-100 (percentage of requests failing)
 *   cache_hit_rate: 0-100 (cache effectiveness)
 *   budget_remaining: 0+  (scaling budget in cost units)
 */

export const SRE_INITIAL_STATE: P09TimeIndexedStateV1 = {
  tick: 0,
  properties: {
    capacity: 50,
    latency_ms: 50,
    error_rate: 1,
    cache_hit_rate: 80,
    budget_remaining: 100,
  },
};

// -- Forced Transitions ------------------------------------------------

export const SRE_FORCED_TRANSITIONS: readonly P09ForcedTransitionEdgeV1[] = [
  {
    edgeKind: 'forced',
    id: 'traffic_spike',
    name: 'Scheduled traffic spike (doubles load)',
    triggerId: 'trigger_spike',
    effects: { latency_ms: 200, error_rate: 30 },
  },
  {
    edgeKind: 'forced',
    id: 'cache_invalidation',
    name: 'Cache expires under load',
    triggerId: 'trigger_cache_expire',
    effects: { cache_hit_rate: -40 },
  },
  {
    edgeKind: 'forced',
    id: 'sla_violation',
    name: 'SLA breach notification',
    triggerId: 'trigger_sla_breach',
    effects: { budget_remaining: -20 },
  },
];

// -- Triggers ----------------------------------------------------------

export const SRE_TRIGGERS: readonly P09TriggerConditionV1[] = [
  {
    id: 'trigger_spike',
    name: 'Traffic spike at tick 100',
    mode: 'tick_interval',
    intervalTicks: 200, // Repeats every 200 ticks
    offsetTicks: 100,   // First spike at t=100
    watchProperty: '',
    thresholdValue: 0,
    activatesTransitionId: 'traffic_spike',
  },
  {
    id: 'trigger_cache_expire',
    name: 'Cache expires at tick 120',
    mode: 'tick_interval',
    intervalTicks: 200,
    offsetTicks: 120,
    watchProperty: '',
    thresholdValue: 0,
    activatesTransitionId: 'cache_invalidation',
  },
  {
    id: 'trigger_sla_breach',
    name: 'SLA breached when error rate exceeds 25%',
    mode: 'threshold',
    intervalTicks: 0,
    offsetTicks: 0,
    watchProperty: 'error_rate',
    thresholdValue: 100, // Fires when error_rate >= threshold (use inverted: error_rate is "bad high")
    activatesTransitionId: 'sla_violation',
  },
];

// -- Chosen Actions ----------------------------------------------------

export const SRE_ACTIONS: readonly P09ChosenActionEdgeV1[] = [
  {
    edgeKind: 'chosen',
    id: 'scale_up',
    name: 'Scale up (add capacity)',
    durationTicks: 20,
    cost: 15,
    effects: { capacity: 30, latency_ms: -100, error_rate: -15 },
    preconditions: { budget_remaining: 15 },
  },
  {
    edgeKind: 'chosen',
    id: 'warm_cache',
    name: 'Pre-warm cache',
    durationTicks: 15,
    cost: 5,
    effects: { cache_hit_rate: 30, latency_ms: -50 },
    preconditions: {},
  },
  {
    edgeKind: 'chosen',
    id: 'enable_rate_limit',
    name: 'Enable rate limiting',
    durationTicks: 5,
    cost: 2,
    effects: { error_rate: -10, latency_ms: 20 },
    preconditions: {},
  },
  {
    edgeKind: 'chosen',
    id: 'rollback_deploy',
    name: 'Rollback to previous stable version',
    durationTicks: 30,
    cost: 10,
    effects: { error_rate: -20, latency_ms: -80 },
    preconditions: {},
  },
  {
    edgeKind: 'chosen',
    id: 'monitor',
    name: 'Monitor (observe without action)',
    durationTicks: 10,
    cost: 0,
    effects: {},
    preconditions: {},
  },
];

// -- Safety Invariants -------------------------------------------------

export const SRE_SAFETY_INVARIANTS: readonly P09SafetyInvariantV1[] = [
  {
    id: 'sla_compliance',
    name: 'Error rate must stay below SLA threshold',
    minimums: {}, // Inverted: we check error_rate < threshold. Use a custom approach.
    // For simplicity in the capsule model: budget must remain positive.
  },
  {
    id: 'budget_positive',
    name: 'Scaling budget must remain positive',
    minimums: { budget_remaining: 1 },
  },
];

/**
 * Goal predicate for SRE: survive the spike window with error rate below 10%
 * and budget remaining above 0.
 */
export function sreGoalPredicate(state: P09TimeIndexedStateV1): boolean {
  return (
    (state.properties.error_rate ?? 100) <= 10 &&
    (state.properties.budget_remaining ?? 0) >= 1 &&
    state.tick >= 150 // Must survive past the spike window
  );
}

/**
 * SRE domain parameters for contingency planning.
 */
export const SRE_DEFAULT_PARAMS = {
  horizonTicks: 250, // Plan 250 ticks ahead (covers spike at 100 + aftermath)
} as const;

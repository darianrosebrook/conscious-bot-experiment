/**
 * Minecraft Risk Planning Definitions
 *
 * Defines stochastic actions, risk model, safety invariants, and
 * planning config for Minecraft risk-aware planning scenarios.
 * Uses the domain-agnostic P10 capsule types.
 *
 * Pure configuration — no adapter classes, no side effects.
 */

import type {
  P10PlanningConfigV1,
  P10RiskAwareStateV1,
  P10RiskModelV1,
  P10SafetyInvariantV1,
  P10StochasticActionV1,
} from '../sterling/primitives/p10/p10-capsule-types.js';

// Re-export the type for consumers that need it alongside the config
export type { P10RiskAwareStateV1 } from '../sterling/primitives/p10/p10-capsule-types.js';

// ── Minecraft Stochastic Actions ────────────────────────────────────

/**
 * Stochastic actions for Minecraft lava mining:
 *   - mine_lava_edge: high ore yield, risk of lava damage or death
 *   - mine_safe_tunnel: low ore yield, minimal risk
 *   - use_fire_resistance: drink potion for protection
 *   - retreat_to_base: no progress but safe
 */
export const MINECRAFT_RISK_ACTIONS: readonly P10StochasticActionV1[] = [
  {
    id: 'mc_mine_lava_edge',
    name: 'Mine at lava edge',
    cost: 2,
    preconditions: { health: 1 },
    outcomes: [
      {
        outcomeId: 'success',
        effects: [{ property: 'ore', op: 'add', value: 4 }],
        lossPpm: 0,
        durationTicks: 10,
      },
      {
        outcomeId: 'lava_splash',
        effects: [
          { property: 'ore', op: 'add', value: 2 },
          { property: 'health', op: 'add', value: -6 },
        ],
        lossPpm: 100,
        durationTicks: 10,
      },
      {
        outcomeId: 'lava_fall',
        effects: [{ property: 'health', op: 'set', value: 0 }],
        lossPpm: 1000,
        durationTicks: 10,
      },
    ],
  },
  {
    id: 'mc_mine_safe_tunnel',
    name: 'Mine in safe tunnel',
    cost: 1,
    preconditions: { health: 1 },
    outcomes: [
      {
        outcomeId: 'success',
        effects: [{ property: 'ore', op: 'add', value: 1 }],
        lossPpm: 0,
        durationTicks: 10,
      },
      {
        outcomeId: 'cave_in',
        effects: [{ property: 'health', op: 'add', value: -3 }],
        lossPpm: 50,
        durationTicks: 10,
      },
    ],
  },
  {
    id: 'mc_use_fire_resistance',
    name: 'Use fire resistance potion',
    cost: 3,
    preconditions: {},
    outcomes: [
      {
        outcomeId: 'success',
        effects: [{ property: 'has_fire_resist', op: 'set', value: 1 }],
        lossPpm: 0,
        durationTicks: 5,
      },
    ],
  },
  {
    id: 'mc_retreat_to_base',
    name: 'Retreat to base',
    cost: 0,
    preconditions: {},
    outcomes: [
      {
        outcomeId: 'success',
        effects: [],
        lossPpm: 0,
        durationTicks: 5,
      },
    ],
  },
];

// ── Minecraft Risk Model ────────────────────────────────────────────

export const MINECRAFT_RISK_MODEL: P10RiskModelV1 = {
  getOutcomeMasses: (_state, actionId) => {
    switch (actionId) {
      case 'mc_mine_lava_edge':
        return [
          { outcomeId: 'success', massPpm: 700_000 },
          { outcomeId: 'lava_splash', massPpm: 250_000 },
          { outcomeId: 'lava_fall', massPpm: 50_000 },
        ];
      case 'mc_mine_safe_tunnel':
        return [
          { outcomeId: 'success', massPpm: 950_000 },
          { outcomeId: 'cave_in', massPpm: 50_000 },
        ];
      case 'mc_use_fire_resistance':
        return [{ outcomeId: 'success', massPpm: 1_000_000 }];
      case 'mc_retreat_to_base':
        return [{ outcomeId: 'success', massPpm: 1_000_000 }];
      default:
        return [];
    }
  },
};

// ── Minecraft Safety Invariants ─────────────────────────────────────

export const MINECRAFT_RISK_SAFETY_INVARIANTS: readonly P10SafetyInvariantV1[] = [
  {
    id: 'mc_stay_alive',
    name: 'Health must remain above 0',
    minimums: { health: 1 },
    riskKind: 'death',
  },
];

// ── Minecraft Initial State ─────────────────────────────────────────

export const MINECRAFT_RISK_INITIAL_STATE: P10RiskAwareStateV1 = {
  worldState: {
    health: 20,
    ore: 0,
    has_fire_resist: 0,
    gear_value: 100,
  },
  riskLedger: {
    death: 100_000,
  },
};

// ── Minecraft Risk Planning Config ──────────────────────────────────

export const MINECRAFT_RISK_CONFIG: P10PlanningConfigV1 = {
  riskMeasure: { kind: 'chance_constraint', epsilonPpm: 100_000 },
  riskAggregation: 'union_bound',
  horizonDepth: 20,
};

// ── Minecraft Risk Goal Predicate ────────────────────────────────────

/** Goal: collect at least 8 ore while staying alive. */
export const minecraftRiskGoalPredicate = (state: P10RiskAwareStateV1): boolean =>
  (state.worldState.ore ?? 0) >= 8 && (state.worldState.health ?? 0) >= 1;

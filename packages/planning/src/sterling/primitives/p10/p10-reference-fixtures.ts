/**
 * P10 Reference Fixtures — Two-Domain Portability Proof
 *
 * Domain 1: Lava Mining — stochastic mining near lava with risk of death.
 *           Agent must gather ore while staying alive under chance constraints.
 *
 * Domain 2: Security Patch Deployment — stochastic patching with risk of
 *           outage. Agent must eliminate vulnerabilities while maintaining SLA.
 *
 * Both domains use the same P10 capsule contract, proving domain-agnosticism.
 *
 * Zero Minecraft runtime imports. Zero vitest imports.
 */

import type {
  P10PlanningConfigV1,
  P10RiskAwareStateV1,
  P10RiskModelV1,
  P10SafetyInvariantV1,
  P10StochasticActionV1,
} from './p10-capsule-types.js';

// ═══════════════════════════════════════════════════════════════════════
// Domain 1: Lava Mining
// ═══════════════════════════════════════════════════════════════════════

/**
 * State: health, ore, has_fire_resist, gear_value
 * Risk: death budget (10% max failure probability)
 * Goal: ore >= 8 AND health >= 1
 */

export const LAVA_MINING_INITIAL_STATE: P10RiskAwareStateV1 = {
  worldState: {
    health: 20,
    ore: 0,
    has_fire_resist: 0,
    gear_value: 100,
  },
  riskLedger: {
    death: 100_000, // 10% budget
  },
};

// -- Stochastic Actions (Lava Mining) ----------------------------------------

export const LAVA_MINING_ACTIONS: readonly P10StochasticActionV1[] = [
  {
    id: 'mine_near_lava',
    name: 'Mine near lava (high yield, risky)',
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
    id: 'mine_safe_area',
    name: 'Mine in safe area (low yield, safe)',
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
    id: 'drink_fire_resist',
    name: 'Drink fire resistance potion',
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
    id: 'retreat',
    name: 'Retreat to safety',
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

// -- Risk Model (Lava Mining) ------------------------------------------------

export const LAVA_MINING_RISK_MODEL: P10RiskModelV1 = {
  getOutcomeMasses: (_state, actionId) => {
    switch (actionId) {
      case 'mine_near_lava':
        return [
          { outcomeId: 'success', massPpm: 700_000 },
          { outcomeId: 'lava_splash', massPpm: 250_000 },
          { outcomeId: 'lava_fall', massPpm: 50_000 },
        ];
      case 'mine_safe_area':
        return [
          { outcomeId: 'success', massPpm: 950_000 },
          { outcomeId: 'cave_in', massPpm: 50_000 },
        ];
      case 'drink_fire_resist':
        return [{ outcomeId: 'success', massPpm: 1_000_000 }];
      case 'retreat':
        return [{ outcomeId: 'success', massPpm: 1_000_000 }];
      default:
        return [];
    }
  },
};

// -- Safety Invariants (Lava Mining) -----------------------------------------

export const LAVA_MINING_SAFETY_INVARIANTS: readonly P10SafetyInvariantV1[] = [
  {
    id: 'stay_alive',
    name: 'Health must remain above 0',
    minimums: { health: 1 },
    riskKind: 'death',
  },
];

// -- Goal Predicate (Lava Mining) --------------------------------------------

export function lavaMiningGoalPredicate(state: P10RiskAwareStateV1): boolean {
  return (state.worldState.ore ?? 0) >= 8 && (state.worldState.health ?? 0) >= 1;
}

// -- Planning Config (Lava Mining) -------------------------------------------

export const LAVA_MINING_CONFIG: P10PlanningConfigV1 = {
  riskMeasure: { kind: 'chance_constraint', epsilonPpm: 100_000 },
  riskAggregation: 'union_bound',
  horizonDepth: 20,
};

/** Tight epsilon for preference-flip tests (1%). */
export const LAVA_MINING_TIGHT_CONFIG: P10PlanningConfigV1 = {
  riskMeasure: { kind: 'chance_constraint', epsilonPpm: 10_000 },
  riskAggregation: 'union_bound',
  horizonDepth: 20,
};

/** Loose epsilon for preference-flip tests (20%). */
export const LAVA_MINING_LOOSE_CONFIG: P10PlanningConfigV1 = {
  riskMeasure: { kind: 'chance_constraint', epsilonPpm: 200_000 },
  riskAggregation: 'union_bound',
  horizonDepth: 20,
};

// ═══════════════════════════════════════════════════════════════════════
// Domain 2: Security Patch Deployment
// ═══════════════════════════════════════════════════════════════════════

/**
 * State: vulnerability_count, system_uptime_pct, patches_deployed, canary_coverage
 * Risk: outage budget (5% max outage probability)
 * Goal: vulnerability_count <= 0 AND system_uptime_pct >= 90
 */

export const SECURITY_INITIAL_STATE: P10RiskAwareStateV1 = {
  worldState: {
    vulnerability_count: 4,
    system_uptime_pct: 99,
    patches_deployed: 0,
    canary_coverage: 0,
  },
  riskLedger: {
    outage: 50_000, // 5% budget
  },
};

// -- Stochastic Actions (Security) -------------------------------------------

export const SECURITY_ACTIONS: readonly P10StochasticActionV1[] = [
  {
    id: 'deploy_hotfix',
    name: 'Deploy hotfix (fast but risky)',
    cost: 5,
    preconditions: { vulnerability_count: 1 },
    outcomes: [
      {
        outcomeId: 'success',
        effects: [{ property: 'vulnerability_count', op: 'add', value: -2 }],
        lossPpm: 0,
        durationTicks: 15,
      },
      {
        outcomeId: 'partial_outage',
        effects: [
          { property: 'vulnerability_count', op: 'add', value: -1 },
          { property: 'system_uptime_pct', op: 'add', value: -30 },
        ],
        lossPpm: 200,
        durationTicks: 15,
      },
      {
        outcomeId: 'full_outage',
        effects: [{ property: 'system_uptime_pct', op: 'add', value: -60 }],
        lossPpm: 1000,
        durationTicks: 15,
      },
    ],
  },
  {
    id: 'canary_deploy',
    name: 'Canary deploy (slow but safe)',
    cost: 3,
    preconditions: { vulnerability_count: 1 },
    outcomes: [
      {
        outcomeId: 'success',
        effects: [
          { property: 'vulnerability_count', op: 'add', value: -1 },
          { property: 'canary_coverage', op: 'add', value: 20 },
        ],
        lossPpm: 0,
        durationTicks: 20,
      },
      {
        outcomeId: 'canary_failure',
        effects: [],
        lossPpm: 10,
        durationTicks: 20,
      },
    ],
  },
  {
    id: 'wait_for_telemetry',
    name: 'Wait for telemetry (gather info)',
    cost: 1,
    preconditions: {},
    outcomes: [
      {
        outcomeId: 'success',
        effects: [{ property: 'canary_coverage', op: 'add', value: 10 }],
        lossPpm: 0,
        durationTicks: 10,
      },
    ],
  },
];

// -- Risk Model (Security) ---------------------------------------------------

export const SECURITY_RISK_MODEL: P10RiskModelV1 = {
  getOutcomeMasses: (_state, actionId) => {
    switch (actionId) {
      case 'deploy_hotfix':
        return [
          { outcomeId: 'success', massPpm: 800_000 },
          { outcomeId: 'partial_outage', massPpm: 150_000 },
          { outcomeId: 'full_outage', massPpm: 50_000 },
        ];
      case 'canary_deploy':
        return [
          { outcomeId: 'success', massPpm: 950_000 },
          { outcomeId: 'canary_failure', massPpm: 50_000 },
        ];
      case 'wait_for_telemetry':
        return [{ outcomeId: 'success', massPpm: 1_000_000 }];
      default:
        return [];
    }
  },
};

// -- Safety Invariants (Security) --------------------------------------------

export const SECURITY_SAFETY_INVARIANTS: readonly P10SafetyInvariantV1[] = [
  {
    id: 'sla_compliance',
    name: 'System uptime must remain above SLA minimum',
    minimums: { system_uptime_pct: 50 },
    riskKind: 'outage',
  },
];

// -- Goal Predicate (Security) -----------------------------------------------

export function securityGoalPredicate(state: P10RiskAwareStateV1): boolean {
  return (
    (state.worldState.vulnerability_count ?? 4) <= 0 &&
    (state.worldState.system_uptime_pct ?? 0) >= 90
  );
}

// -- Planning Config (Security) ----------------------------------------------

export const SECURITY_CONFIG: P10PlanningConfigV1 = {
  riskMeasure: { kind: 'chance_constraint', epsilonPpm: 50_000 },
  riskAggregation: 'union_bound',
  horizonDepth: 15,
};

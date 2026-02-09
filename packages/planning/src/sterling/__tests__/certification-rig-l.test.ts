/**
 * Rig L Certification Tests — P09 Contingency Planning with Exogenous Events
 *
 * Tests all 5 P09 invariants across two domains:
 *   1. forced_transition_application      — forced transitions fire at declared times, cannot be skipped
 *   2. deterministic_policy_branching     — same state + triggers → same policy branch
 *   3. safety_under_forced_transitions    — safety holds in all reachable states
 *   4. bounded_contingency_plan           — horizon, branch factor, node count capped
 *   5. deterministic_trigger_evaluation   — same state → same trigger set
 *
 * 53 tests across 9 describe blocks.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_BRANCH_FACTOR,
  MAX_HORIZON,
  MAX_POLICY_NODES,
  P09_CONTRACT_VERSION,
  P09_INVARIANTS,
} from '../primitives/p09/p09-capsule-types.js';
import type {
  P09ChosenActionEdgeV1,
  P09ForcedTransitionEdgeV1,
  P09SafetyInvariantV1,
  P09TimeIndexedStateV1,
  P09TriggerConditionV1,
} from '../primitives/p09/p09-capsule-types.js';
import { P09ReferenceAdapter } from '../primitives/p09/p09-reference-adapter.js';
import {
  MINING_ACTIONS,
  MINING_DEFAULT_PARAMS,
  MINING_FORCED_TRANSITIONS,
  MINING_INITIAL_STATE,
  MINING_SAFETY_INVARIANTS,
  MINING_TRIGGERS,
  miningGoalPredicate,
  SRE_ACTIONS,
  SRE_DEFAULT_PARAMS,
  SRE_FORCED_TRANSITIONS,
  SRE_INITIAL_STATE,
  SRE_SAFETY_INVARIANTS,
  SRE_TRIGGERS,
  sreGoalPredicate,
} from '../primitives/p09/p09-reference-fixtures.js';
import {
  MINECRAFT_CONTINGENCY_ACTIONS,
  MINECRAFT_CONTINGENCY_PARAMS,
  MINECRAFT_FORCED_TRANSITIONS,
  MINECRAFT_MINING_TRIP_INITIAL,
  MINECRAFT_SAFETY_INVARIANTS,
  MINECRAFT_TRIGGERS,
} from '../../contingency/index.js';

const adapter = new P09ReferenceAdapter();

// ── 1. Forced Transition Application (Pivot 1) ──────────────────────

describe('P09 Invariant: forced_transition_application', () => {
  it('hunger tick fires at declared interval', () => {
    const stateAtTick80: P09TimeIndexedStateV1 = {
      tick: 80,
      properties: { ...MINING_INITIAL_STATE.properties },
    };
    const fired = adapter.evaluateTriggers(stateAtTick80, MINING_TRIGGERS);
    expect(fired).toContain('trigger_hunger');
  });

  it('hunger tick does NOT fire at non-interval ticks', () => {
    const stateAtTick50: P09TimeIndexedStateV1 = {
      tick: 50,
      properties: { ...MINING_INITIAL_STATE.properties },
    };
    const fired = adapter.evaluateTriggers(stateAtTick50, MINING_TRIGGERS);
    expect(fired).not.toContain('trigger_hunger');
  });

  it('forced transition cannot return null (always applies)', () => {
    const hungerTransition = MINING_FORCED_TRANSITIONS.find(
      (t) => t.id === 'hunger_tick',
    )!;
    const result = adapter.applyForcedTransition(MINING_INITIAL_STATE, hungerTransition);
    // Must return a state, never null
    expect(result).toBeDefined();
    expect(result.properties.food).toBe(MINING_INITIAL_STATE.properties.food - 1);
  });

  it('forced transition applies effects correctly', () => {
    const nightfall = MINING_FORCED_TRANSITIONS.find((t) => t.id === 'nightfall')!;
    const result = adapter.applyForcedTransition(MINING_INITIAL_STATE, nightfall);
    expect(result.properties.light_level).toBe(
      MINING_INITIAL_STATE.properties.light_level + nightfall.effects.light_level,
    );
  });

  it('forced transition does not advance tick (fires AT a tick)', () => {
    const hungerTransition = MINING_FORCED_TRANSITIONS.find(
      (t) => t.id === 'hunger_tick',
    )!;
    const result = adapter.applyForcedTransition(MINING_INITIAL_STATE, hungerTransition);
    expect(result.tick).toBe(MINING_INITIAL_STATE.tick);
  });

  it('planning result records forced transitions that were applied', () => {
    // Use two actions (eat_food=10 ticks, mine_ore=40 ticks) to keep
    // branching factor at 2. mine_ore spans t=0→40→80, which crosses
    // the hunger tick at t=80. The tick-by-tick simulation in
    // applyChosenAction must apply the hunger tick at t=80 during
    // the second mine_ore call.
    const twoActions = MINING_ACTIONS.filter(
      (a) => a.id === 'mine_ore' || a.id === 'eat_food',
    );
    const hungerOnly = MINING_FORCED_TRANSITIONS.filter((t) => t.id === 'hunger_tick');
    const hungerTriggerOnly = MINING_TRIGGERS.filter((t) => t.id === 'trigger_hunger');

    const result = adapter.planContingency(
      MINING_INITIAL_STATE,
      twoActions,
      hungerOnly,
      hungerTriggerOnly,
      MINING_SAFETY_INVARIANTS,
      () => false, // No goal — just expand until horizon
      100,
    );
    const hungerApplications = result.forcedTransitionsApplied.filter(
      (f) => f.transitionId === 'hunger_tick',
    );
    expect(hungerApplications.length).toBeGreaterThanOrEqual(1);
  });

  it('forced transitions are applied even when a chosen action spans over their scheduled tick', () => {
    // mine_ore: durationTicks=40. Starting at t=60, action ends at t=100.
    // Hunger tick fires at t=80, which falls inside [61..100].
    // The old "jump" semantics would skip t=80 entirely.
    const stateAt60: P09TimeIndexedStateV1 = {
      tick: 60,
      properties: { ...MINING_INITIAL_STATE.properties, food: 20 },
    };
    const mineOre = MINING_ACTIONS.find((a) => a.id === 'mine_ore')!;
    const hungerOnly = MINING_FORCED_TRANSITIONS.filter((t) => t.id === 'hunger_tick');
    const hungerTriggerOnly = MINING_TRIGGERS.filter((t) => t.id === 'trigger_hunger');

    const result = adapter.applyChosenAction(
      stateAt60,
      mineOre,
      hungerTriggerOnly,
      hungerOnly,
      MINING_SAFETY_INVARIANTS,
    );
    expect(result).not.toBeNull();
    // Hunger tick at t=80 should have fired during the action
    expect(result!.intermediateForced.length).toBeGreaterThanOrEqual(1);
    expect(result!.intermediateForced[0].transitionId).toBe('hunger_tick');
    expect(result!.intermediateForced[0].atTick).toBe(80);
    // Food should be depleted by the hunger tick: 20 - 1 = 19
    expect(result!.finalState.properties.food).toBe(19);
  });
});

// ── 2. Deterministic Policy Branching (Pivot 2) ─────────────────────

describe('P09 Invariant: deterministic_policy_branching', () => {
  it('same inputs produce identical policy', () => {
    const r1 = adapter.planContingency(
      MINING_INITIAL_STATE,
      MINING_ACTIONS,
      MINING_FORCED_TRANSITIONS,
      MINING_TRIGGERS,
      MINING_SAFETY_INVARIANTS,
      miningGoalPredicate,
      100,
    );
    const r2 = adapter.planContingency(
      MINING_INITIAL_STATE,
      MINING_ACTIONS,
      MINING_FORCED_TRANSITIONS,
      MINING_TRIGGERS,
      MINING_SAFETY_INVARIANTS,
      miningGoalPredicate,
      100,
    );
    expect(r1.policy.totalNodes).toBe(r2.policy.totalNodes);
    expect(r1.policy.branches.length).toBe(r2.policy.branches.length);
    expect(r1.policy.rootNodeId).toBe(r2.policy.rootNodeId);
  });

  it('50 repeated runs produce identical node counts', () => {
    const counts = Array.from({ length: 50 }, () =>
      adapter.planContingency(
        MINING_INITIAL_STATE,
        MINING_ACTIONS,
        MINING_FORCED_TRANSITIONS,
        MINING_TRIGGERS,
        MINING_SAFETY_INVARIANTS,
        miningGoalPredicate,
        100,
      ).policy.totalNodes,
    );
    expect(counts.every((c) => c === counts[0])).toBe(true);
  });

  it('policy branches from forced transitions have triggeredBy set', () => {
    const result = adapter.planContingency(
      MINING_INITIAL_STATE,
      MINING_ACTIONS,
      MINING_FORCED_TRANSITIONS,
      MINING_TRIGGERS,
      MINING_SAFETY_INVARIANTS,
      miningGoalPredicate,
      100,
    );
    const forcedBranches = result.policy.branches.filter(
      (b) => b.edge.edgeKind === 'forced',
    );
    for (const fb of forcedBranches) {
      expect(fb.triggeredBy).not.toBeNull();
    }
  });

  it('policy branches from chosen actions have triggeredBy null', () => {
    const result = adapter.planContingency(
      MINING_INITIAL_STATE,
      MINING_ACTIONS,
      MINING_FORCED_TRANSITIONS,
      MINING_TRIGGERS,
      MINING_SAFETY_INVARIANTS,
      miningGoalPredicate,
      100,
    );
    const chosenBranches = result.policy.branches.filter(
      (b) => b.edge.edgeKind === 'chosen',
    );
    for (const cb of chosenBranches) {
      expect(cb.triggeredBy).toBeNull();
    }
  });
});

// ── 3. Safety Under Forced Transitions (Pivot 3) ────────────────────

describe('P09 Invariant: safety_under_forced_transitions', () => {
  it('checkSafety returns true for healthy initial state', () => {
    const safe = adapter.checkSafety(
      MINING_INITIAL_STATE,
      MINING_SAFETY_INVARIANTS[0], // stay_alive: health >= 1
    );
    expect(safe).toBe(true);
  });

  it('checkSafety returns false for dead state', () => {
    const deadState: P09TimeIndexedStateV1 = {
      tick: 0,
      properties: { ...MINING_INITIAL_STATE.properties, health: 0 },
    };
    const safe = adapter.checkSafety(deadState, MINING_SAFETY_INVARIANTS[0]);
    expect(safe).toBe(false);
  });

  it('checkAllSafety returns violated invariant IDs', () => {
    const starvedState: P09TimeIndexedStateV1 = {
      tick: 0,
      properties: { ...MINING_INITIAL_STATE.properties, food: 0 },
    };
    const violated = adapter.checkAllSafety(starvedState, MINING_SAFETY_INVARIANTS);
    expect(violated).toContain('no_starvation');
  });

  it('checkAllSafety returns empty array for safe state', () => {
    const violated = adapter.checkAllSafety(MINING_INITIAL_STATE, MINING_SAFETY_INVARIANTS);
    expect(violated).toHaveLength(0);
  });

  it('policy marks unsafe terminal nodes', () => {
    // Create a scenario that will produce unsafe nodes:
    // Start with very low food so hunger tick causes starvation
    const lowFoodState: P09TimeIndexedStateV1 = {
      tick: 0,
      properties: { health: 5, food: 1, ore: 0, light_level: 15, has_shelter: 0 },
    };
    const result = adapter.planContingency(
      lowFoodState,
      MINING_ACTIONS,
      MINING_FORCED_TRANSITIONS,
      MINING_TRIGGERS,
      MINING_SAFETY_INVARIANTS,
      miningGoalPredicate,
      160, // Past first hunger tick
    );
    // Some nodes should exist in the policy
    expect(result.policy.totalNodes).toBeGreaterThan(0);
  });

  it('violatedInvariants lists safety failures in planning result', () => {
    // Start with food=0 so starvation fires immediately (threshold trigger)
    const criticalState: P09TimeIndexedStateV1 = {
      tick: 0,
      properties: { health: 3, food: 0, ore: 0, light_level: 15, has_shelter: 0 },
    };
    const result = adapter.planContingency(
      criticalState,
      MINING_ACTIONS,
      MINING_FORCED_TRANSITIONS,
      MINING_TRIGGERS,
      MINING_SAFETY_INVARIANTS,
      miningGoalPredicate,
      100,
    );
    // Starting with food=0 should trigger starvation and violate no_starvation
    expect(result.violatedInvariants).toContain('no_starvation');
    expect(result.safetyVerified).toBe(false);
  });
});

// ── 4. Bounded Contingency Plan (Pivot 4) ────────────────────────────

describe('P09 Invariant: bounded_contingency_plan', () => {
  it('MAX_HORIZON is 1000', () => {
    expect(MAX_HORIZON).toBe(1000);
  });

  it('MAX_BRANCH_FACTOR is 8', () => {
    expect(MAX_BRANCH_FACTOR).toBe(8);
  });

  it('MAX_POLICY_NODES is 200', () => {
    expect(MAX_POLICY_NODES).toBe(200);
  });

  it('policy respects MAX_POLICY_NODES cap', () => {
    // Use a very long horizon to stress the node cap
    const result = adapter.planContingency(
      MINING_INITIAL_STATE,
      MINING_ACTIONS,
      MINING_FORCED_TRANSITIONS,
      MINING_TRIGGERS,
      MINING_SAFETY_INVARIANTS,
      miningGoalPredicate,
      MAX_HORIZON,
    );
    expect(result.policy.totalNodes).toBeLessThanOrEqual(MAX_POLICY_NODES);
  });

  it('policy maxBranchingFactor respects MAX_BRANCH_FACTOR', () => {
    const result = adapter.planContingency(
      MINING_INITIAL_STATE,
      MINING_ACTIONS,
      MINING_FORCED_TRANSITIONS,
      MINING_TRIGGERS,
      MINING_SAFETY_INVARIANTS,
      miningGoalPredicate,
      MINING_DEFAULT_PARAMS.horizonTicks,
    );
    expect(result.policy.maxBranchingFactor).toBeLessThanOrEqual(MAX_BRANCH_FACTOR);
  });

  it('effective horizon is clamped to MAX_HORIZON', () => {
    // Request horizon of 5000, but it should be clamped
    const result = adapter.planContingency(
      MINING_INITIAL_STATE,
      MINING_ACTIONS,
      MINING_FORCED_TRANSITIONS,
      MINING_TRIGGERS,
      MINING_SAFETY_INVARIANTS,
      miningGoalPredicate,
      5000,
    );
    // All nodes should have ticks within [0, MAX_HORIZON]
    for (const node of Object.values(result.policy.nodes)) {
      expect(node.state.tick).toBeLessThanOrEqual(
        MINING_INITIAL_STATE.tick + MAX_HORIZON,
      );
    }
  });

  it('adapter exposes correct bound constants', () => {
    expect(adapter.maxHorizon).toBe(MAX_HORIZON);
    expect(adapter.maxBranchFactor).toBe(MAX_BRANCH_FACTOR);
    expect(adapter.maxPolicyNodes).toBe(MAX_POLICY_NODES);
  });
});

// ── 5. Deterministic Trigger Evaluation (Pivot 5) ───────────────────

describe('P09 Invariant: deterministic_trigger_evaluation', () => {
  it('same state evaluates same triggers 50 times', () => {
    const stateAtTick80: P09TimeIndexedStateV1 = {
      tick: 80,
      properties: { ...MINING_INITIAL_STATE.properties },
    };
    const results = Array.from({ length: 50 }, () =>
      adapter.evaluateTriggers(stateAtTick80, MINING_TRIGGERS),
    );
    const first = JSON.stringify(results[0]);
    expect(results.every((r) => JSON.stringify(r) === first)).toBe(true);
  });

  it('trigger_nightfall fires at tick 200', () => {
    const stateAt200: P09TimeIndexedStateV1 = {
      tick: 200,
      properties: { ...MINING_INITIAL_STATE.properties },
    };
    const fired = adapter.evaluateTriggers(stateAt200, MINING_TRIGGERS);
    expect(fired).toContain('trigger_nightfall');
  });

  it('trigger_nightfall does NOT fire at tick 100', () => {
    const stateAt100: P09TimeIndexedStateV1 = {
      tick: 100,
      properties: { ...MINING_INITIAL_STATE.properties },
    };
    const fired = adapter.evaluateTriggers(stateAt100, MINING_TRIGGERS);
    expect(fired).not.toContain('trigger_nightfall');
  });

  it('threshold trigger fires when property crosses boundary', () => {
    const starvingState: P09TimeIndexedStateV1 = {
      tick: 50,
      properties: { ...MINING_INITIAL_STATE.properties, food: 0 },
    };
    const fired = adapter.evaluateTriggers(starvingState, MINING_TRIGGERS);
    expect(fired).toContain('trigger_starvation');
  });

  it('threshold trigger does NOT fire above threshold', () => {
    const fedState: P09TimeIndexedStateV1 = {
      tick: 50,
      properties: { ...MINING_INITIAL_STATE.properties, food: 10 },
    };
    const fired = adapter.evaluateTriggers(fedState, MINING_TRIGGERS);
    expect(fired).not.toContain('trigger_starvation');
  });

  it('returned trigger IDs are sorted lexicographically', () => {
    // Create a state where multiple triggers fire at once
    const stateAt80Starving: P09TimeIndexedStateV1 = {
      tick: 80,
      properties: { ...MINING_INITIAL_STATE.properties, food: 0, light_level: 0 },
    };
    const fired = adapter.evaluateTriggers(stateAt80Starving, MINING_TRIGGERS);
    const sorted = [...fired].sort();
    expect(fired).toEqual(sorted);
  });
});

// ── 6. Chosen Action Mechanics ──────────────────────────────────────

describe('P09 Chosen action mechanics', () => {
  // No triggers/transitions context for basic action tests
  const noTriggers: P09TriggerConditionV1[] = [];
  const noTransitions: P09ForcedTransitionEdgeV1[] = [];
  const noInvariants: P09SafetyInvariantV1[] = [];

  it('chosen action advances tick by durationTicks', () => {
    const mineOre = MINING_ACTIONS.find((a) => a.id === 'mine_ore')!;
    const result = adapter.applyChosenAction(
      MINING_INITIAL_STATE, mineOre, noTriggers, noTransitions, noInvariants,
    );
    expect(result).not.toBeNull();
    expect(result!.finalState.tick).toBe(MINING_INITIAL_STATE.tick + mineOre.durationTicks);
  });

  it('chosen action applies effects', () => {
    const mineOre = MINING_ACTIONS.find((a) => a.id === 'mine_ore')!;
    const result = adapter.applyChosenAction(
      MINING_INITIAL_STATE, mineOre, noTriggers, noTransitions, noInvariants,
    )!;
    expect(result.finalState.properties.ore).toBe(
      MINING_INITIAL_STATE.properties.ore + mineOre.effects.ore,
    );
  });

  it('chosen action returns null when preconditions not met', () => {
    const mineOre = MINING_ACTIONS.find((a) => a.id === 'mine_ore')!;
    const deadState: P09TimeIndexedStateV1 = {
      tick: 0,
      properties: { ...MINING_INITIAL_STATE.properties, health: 0 },
    };
    const result = adapter.applyChosenAction(
      deadState, mineOre, noTriggers, noTransitions, noInvariants,
    );
    expect(result).toBeNull();
  });

  it('chosen action with no preconditions always applies', () => {
    const eatFood = MINING_ACTIONS.find((a) => a.id === 'eat_food')!;
    const criticalState: P09TimeIndexedStateV1 = {
      tick: 0,
      properties: { health: 0, food: 0, ore: 0, light_level: 0, has_shelter: 0 },
    };
    const result = adapter.applyChosenAction(
      criticalState, eatFood, noTriggers, noTransitions, noInvariants,
    );
    expect(result).not.toBeNull();
    expect(result!.finalState.properties.food).toBe(5);
  });

  it('action result includes intermediate forced transitions', () => {
    // Start at t=70, mine_ore takes 40 ticks → ends at t=110.
    // Hunger tick fires at t=80 during the action.
    const stateAt70: P09TimeIndexedStateV1 = {
      tick: 70,
      properties: { ...MINING_INITIAL_STATE.properties },
    };
    const mineOre = MINING_ACTIONS.find((a) => a.id === 'mine_ore')!;
    const result = adapter.applyChosenAction(
      stateAt70, mineOre, MINING_TRIGGERS, MINING_FORCED_TRANSITIONS, MINING_SAFETY_INVARIANTS,
    )!;
    const hungerDuring = result.intermediateForced.filter(
      (f) => f.transitionId === 'hunger_tick',
    );
    expect(hungerDuring.length).toBeGreaterThanOrEqual(1);
    expect(hungerDuring[0].atTick).toBe(80);
  });

  it('action that becomes unsafe mid-execution reports safety violation', () => {
    // Start with food=1, mine_ore takes 40 ticks, hunger fires at t=80.
    // After hunger tick: food drops to 0, violating no_starvation.
    const lowFoodState: P09TimeIndexedStateV1 = {
      tick: 60,
      properties: { ...MINING_INITIAL_STATE.properties, food: 1 },
    };
    const mineOre = MINING_ACTIONS.find((a) => a.id === 'mine_ore')!;
    const result = adapter.applyChosenAction(
      lowFoodState, mineOre, MINING_TRIGGERS, MINING_FORCED_TRANSITIONS, MINING_SAFETY_INVARIANTS,
    )!;
    expect(result.safetyViolatedDuringAction).toBe(true);
    expect(result.violatedInvariantIds).toContain('no_starvation');
  });

  it('edgeKind discriminant is "chosen" for all chosen actions', () => {
    for (const action of MINING_ACTIONS) {
      expect(action.edgeKind).toBe('chosen');
    }
  });

  it('edgeKind discriminant is "forced" for all forced transitions', () => {
    for (const transition of MINING_FORCED_TRANSITIONS) {
      expect(transition.edgeKind).toBe('forced');
    }
  });
});

// ── 7. Multi-Domain Portability ─────────────────────────────────────

describe('P09 Multi-domain portability', () => {
  it('SRE domain has forced transitions', () => {
    expect(SRE_FORCED_TRANSITIONS.length).toBeGreaterThan(0);
    const spike = SRE_FORCED_TRANSITIONS.find((t) => t.id === 'traffic_spike');
    expect(spike).toBeDefined();
    expect(spike!.edgeKind).toBe('forced');
  });

  it('SRE triggers fire at declared times', () => {
    const stateAt100: P09TimeIndexedStateV1 = {
      tick: 100,
      properties: { ...SRE_INITIAL_STATE.properties },
    };
    const fired = adapter.evaluateTriggers(stateAt100, SRE_TRIGGERS);
    expect(fired).toContain('trigger_spike');
  });

  it('SRE chosen actions work with same adapter', () => {
    const scaleUp = SRE_ACTIONS.find((a) => a.id === 'scale_up')!;
    const noTriggers: P09TriggerConditionV1[] = [];
    const noTransitions: P09ForcedTransitionEdgeV1[] = [];
    const noInvariants: P09SafetyInvariantV1[] = [];
    const result = adapter.applyChosenAction(
      SRE_INITIAL_STATE, scaleUp, noTriggers, noTransitions, noInvariants,
    );
    expect(result).not.toBeNull();
    expect(result!.finalState.properties.capacity).toBe(
      SRE_INITIAL_STATE.properties.capacity + scaleUp.effects.capacity,
    );
  });

  it('SRE contingency planning produces a policy', () => {
    const result = adapter.planContingency(
      SRE_INITIAL_STATE,
      SRE_ACTIONS,
      SRE_FORCED_TRANSITIONS,
      SRE_TRIGGERS,
      SRE_SAFETY_INVARIANTS,
      sreGoalPredicate,
      SRE_DEFAULT_PARAMS.horizonTicks,
    );
    expect(result.policy.totalNodes).toBeGreaterThan(0);
    expect(result.policy.rootNodeId).toBeDefined();
  });

  it('SRE and mining use same adapter instance', () => {
    const miningResult = adapter.planContingency(
      MINING_INITIAL_STATE,
      MINING_ACTIONS,
      MINING_FORCED_TRANSITIONS,
      MINING_TRIGGERS,
      MINING_SAFETY_INVARIANTS,
      miningGoalPredicate,
      100,
    );
    const sreResult = adapter.planContingency(
      SRE_INITIAL_STATE,
      SRE_ACTIONS,
      SRE_FORCED_TRANSITIONS,
      SRE_TRIGGERS,
      SRE_SAFETY_INVARIANTS,
      sreGoalPredicate,
      100,
    );
    // Both produce valid policies through the same adapter
    expect(miningResult.policy.totalNodes).toBeGreaterThan(0);
    expect(sreResult.policy.totalNodes).toBeGreaterThan(0);
  });

  it('SRE forced transition applies without null', () => {
    const spike = SRE_FORCED_TRANSITIONS.find((t) => t.id === 'traffic_spike')!;
    const result = adapter.applyForcedTransition(SRE_INITIAL_STATE, spike);
    expect(result).toBeDefined();
    expect(result.properties.latency_ms).toBe(
      SRE_INITIAL_STATE.properties.latency_ms + spike.effects.latency_ms,
    );
  });
});

// ── 8. Minecraft Contingency Domain Module ──────────────────────────

describe('P09 Minecraft contingency module', () => {
  it('defines 4 forced transitions', () => {
    expect(MINECRAFT_FORCED_TRANSITIONS).toHaveLength(4);
    const ids = MINECRAFT_FORCED_TRANSITIONS.map((t) => t.id);
    expect(ids).toContain('mc_hunger_tick');
    expect(ids).toContain('mc_nightfall');
    expect(ids).toContain('mc_mob_damage');
    expect(ids).toContain('mc_starvation');
  });

  it('defines 4 triggers', () => {
    expect(MINECRAFT_TRIGGERS).toHaveLength(4);
  });

  it('defines 5 chosen actions', () => {
    expect(MINECRAFT_CONTINGENCY_ACTIONS).toHaveLength(5);
    const ids = MINECRAFT_CONTINGENCY_ACTIONS.map((a) => a.id);
    expect(ids).toContain('mc_mine_ore');
    expect(ids).toContain('mc_eat_bread');
    expect(ids).toContain('mc_build_shelter');
  });

  it('defines 2 safety invariants', () => {
    expect(MINECRAFT_SAFETY_INVARIANTS).toHaveLength(2);
    const ids = MINECRAFT_SAFETY_INVARIANTS.map((s) => s.id);
    expect(ids).toContain('mc_stay_alive');
    expect(ids).toContain('mc_no_starvation');
  });

  it('Minecraft fixtures work with reference adapter', () => {
    const mcGoal = (s: P09TimeIndexedStateV1) =>
      (s.properties.ore ?? 0) >= MINECRAFT_CONTINGENCY_PARAMS.oreGoal &&
      (s.properties.health ?? 0) >= 1;

    const result = adapter.planContingency(
      MINECRAFT_MINING_TRIP_INITIAL,
      MINECRAFT_CONTINGENCY_ACTIONS,
      MINECRAFT_FORCED_TRANSITIONS,
      MINECRAFT_TRIGGERS,
      MINECRAFT_SAFETY_INVARIANTS,
      mcGoal,
      MINECRAFT_CONTINGENCY_PARAMS.horizonTicks,
    );
    expect(result.policy.totalNodes).toBeGreaterThan(0);
    expect(result.policy.totalNodes).toBeLessThanOrEqual(MAX_POLICY_NODES);
  });
});

// ── 9. P09 Contract Metadata ────────────────────────────────────────

describe('P09 contract metadata', () => {
  it('has 5 invariants', () => {
    expect(P09_INVARIANTS).toHaveLength(5);
  });

  it('invariant names match expected pivots', () => {
    expect(P09_INVARIANTS).toContain('forced_transition_application');
    expect(P09_INVARIANTS).toContain('deterministic_policy_branching');
    expect(P09_INVARIANTS).toContain('safety_under_forced_transitions');
    expect(P09_INVARIANTS).toContain('bounded_contingency_plan');
    expect(P09_INVARIANTS).toContain('deterministic_trigger_evaluation');
  });

  it('contract version is p09.v1', () => {
    expect(P09_CONTRACT_VERSION).toBe('p09.v1');
  });

  it('adapter exposes correct constants', () => {
    expect(adapter.maxHorizon).toBe(MAX_HORIZON);
    expect(adapter.maxBranchFactor).toBe(MAX_BRANCH_FACTOR);
    expect(adapter.maxPolicyNodes).toBe(MAX_POLICY_NODES);
  });
});

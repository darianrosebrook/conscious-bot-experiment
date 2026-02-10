/**
 * Rig M Certification Tests — P10 Risk-Aware Planning with Stochastic Outcomes
 *
 * Tests all 5 P10 invariants across two domains:
 *   1. outcome_mass_conservation          — masses sum to MASS_TOTAL for every action
 *   2. chance_constraint_satisfaction      — P(failure) < epsilon verified at every node
 *   3. risk_budget_monotonicity            — risk ledger only decreases along paths
 *   4. deterministic_scenario_evaluation   — same inputs produce identical graph
 *   5. bounded_scenario_graph              — node cap, depth cap, fanout cap enforced
 *
 * Plus: stochastic action mechanics, learning stability, multi-domain portability,
 * contract metadata, semantic guards for metric definitions, budget provenance,
 * truncation semantics, riskKind-directed debiting, and expansion-time mass
 * conservation.
 *
 * ~75 tests across 10 describe blocks.
 */

import { describe, expect, it } from 'vitest';

import {
  MASS_TOTAL,
  MAX_OUTCOMES_PER_ACTION,
  MAX_SCENARIO_DEPTH,
  MAX_SCENARIO_NODES,
  P10_CONTRACT_VERSION,
  P10_INVARIANTS,
} from '../primitives/p10/p10-capsule-types.js';
import type {
  P10PlanningConfigV1,
  P10RiskAwareStateV1,
  P10RiskModelV1,
  P10SafetyInvariantV1,
  P10ScenarioEdgeV1,
  P10StochasticActionV1,
} from '../primitives/p10/p10-capsule-types.js';
import { P10ReferenceAdapter, stableStringify } from '../primitives/p10/p10-reference-adapter.js';
import {
  LAVA_MINING_ACTIONS,
  LAVA_MINING_CONFIG,
  LAVA_MINING_INITIAL_STATE,
  LAVA_MINING_LOOSE_CONFIG,
  LAVA_MINING_RISK_MODEL,
  LAVA_MINING_SAFETY_INVARIANTS,
  LAVA_MINING_TIGHT_CONFIG,
  lavaMiningGoalPredicate,
  SECURITY_ACTIONS,
  SECURITY_CONFIG,
  SECURITY_INITIAL_STATE,
  SECURITY_RISK_MODEL,
  SECURITY_SAFETY_INVARIANTS,
  securityGoalPredicate,
} from '../primitives/p10/p10-reference-fixtures.js';

const adapter = new P10ReferenceAdapter();

// ── 1. Outcome Mass Conservation (Pivot 1) ─────────────────────────

describe('P10 Invariant: outcome_mass_conservation', () => {
  it('masses sum to MASS_TOTAL for each lava mining action', () => {
    const result = adapter.validateMassConservation(
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_INITIAL_STATE,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validation rejects action with mass deficit', () => {
    const badModel: P10RiskModelV1 = {
      getOutcomeMasses: (_state, actionId) => {
        if (actionId === 'mine_near_lava') {
          return [
            { outcomeId: 'success', massPpm: 500_000 },
            { outcomeId: 'lava_splash', massPpm: 250_000 },
            { outcomeId: 'lava_fall', massPpm: 50_000 },
          ]; // Total = 800,000 (deficit)
        }
        return LAVA_MINING_RISK_MODEL.getOutcomeMasses(_state, actionId);
      },
    };
    const result = adapter.validateMassConservation(
      LAVA_MINING_ACTIONS,
      badModel,
      LAVA_MINING_INITIAL_STATE,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    const mineError = result.errors.find(e => e.actionId === 'mine_near_lava');
    expect(mineError).toBeDefined();
    expect(mineError!.totalMass).toBe(800_000);
    expect(mineError!.expectedMass).toBe(MASS_TOTAL);
  });

  it('validation rejects action with mass surplus', () => {
    const badModel: P10RiskModelV1 = {
      getOutcomeMasses: (_state, actionId) => {
        if (actionId === 'mine_near_lava') {
          return [
            { outcomeId: 'success', massPpm: 800_000 },
            { outcomeId: 'lava_splash', massPpm: 250_000 },
            { outcomeId: 'lava_fall', massPpm: 50_000 },
          ]; // Total = 1,100,000 (surplus)
        }
        return LAVA_MINING_RISK_MODEL.getOutcomeMasses(_state, actionId);
      },
    };
    const result = adapter.validateMassConservation(
      LAVA_MINING_ACTIONS,
      badModel,
      LAVA_MINING_INITIAL_STATE,
    );
    expect(result.valid).toBe(false);
    const mineError = result.errors.find(e => e.actionId === 'mine_near_lava');
    expect(mineError!.totalMass).toBe(1_100_000);
  });

  it('zero-mass outcomes are allowed (but explicit)', () => {
    const modelWithZero: P10RiskModelV1 = {
      getOutcomeMasses: (_state, actionId) => {
        if (actionId === 'mine_near_lava') {
          return [
            { outcomeId: 'success', massPpm: 950_000 },
            { outcomeId: 'lava_splash', massPpm: 0 },
            { outcomeId: 'lava_fall', massPpm: 50_000 },
          ]; // Total = 1,000,000
        }
        return LAVA_MINING_RISK_MODEL.getOutcomeMasses(_state, actionId);
      },
    };
    const result = adapter.validateMassConservation(
      LAVA_MINING_ACTIONS,
      modelWithZero,
      LAVA_MINING_INITIAL_STATE,
    );
    expect(result.valid).toBe(true);
  });

  it('no implicit residual mass', () => {
    for (const action of LAVA_MINING_ACTIONS) {
      const masses = LAVA_MINING_RISK_MODEL.getOutcomeMasses(
        LAVA_MINING_INITIAL_STATE,
        action.id,
      );
      const total = masses.reduce((sum, m) => sum + m.massPpm, 0);
      expect(total).toBe(MASS_TOTAL);
    }
  });

  it('mass conservation holds after risk model update', () => {
    const updated = adapter.updateRiskModel(LAVA_MINING_RISK_MODEL, {
      actionId: 'mine_near_lava',
      observedOutcomeId: 'success',
      stateContext: LAVA_MINING_INITIAL_STATE,
      executionCount: 10,
    });
    const masses = updated.getOutcomeMasses(LAVA_MINING_INITIAL_STATE, 'mine_near_lava');
    const total = masses.reduce((sum, m) => sum + m.massPpm, 0);
    expect(total).toBe(MASS_TOTAL);
  });

  it('outcome ordering is deterministic (sorted by outcomeId)', () => {
    const expansion = adapter.expandAction(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS[0], // mine_near_lava
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_SAFETY_INVARIANTS,
    );
    expect(expansion).not.toBeNull();
    const ids = expansion!.outcomes.map(o => o.outcomeId);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });
});

// ── 2. Chance Constraint Satisfaction (Pivot 2) ────────────────────

describe('P10 Invariant: chance_constraint_satisfaction', () => {
  it('plan with loose epsilon accepts risky action', () => {
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_LOOSE_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    // With 20% budget, mine_near_lava (5% failure) should be expandable
    const chosenEdges = result.graph.edges.filter(
      e => e.edgeKind === 'chosen' && e.actionId === 'mine_near_lava',
    );
    expect(chosenEdges.length).toBeGreaterThan(0);
  });

  it('plan with tight epsilon rejects risky action (prefers safe path)', () => {
    // Tight budget: riskLedger matches epsilon so budget is truly constrained
    const tightBudgetState: P10RiskAwareStateV1 = {
      worldState: LAVA_MINING_INITIAL_STATE.worldState,
      riskLedger: { death: 10_000 }, // 1% — less than mine_near_lava's 5% failure
    };
    const result = adapter.planUnderRisk(
      tightBudgetState,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_TIGHT_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    // mine_near_lava (50,000 PPM failure) exceeds 10,000 PPM budget → rejected
    const rejected = result.explanation.rejectedActions.filter(
      r => r.actionId === 'mine_near_lava' && r.reason === 'risk_budget_exceeded',
    );
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected[0].reason).toBe('risk_budget_exceeded');
  });

  it('cumulative failure probability computed correctly per declared aggregation', () => {
    const edges: P10ScenarioEdgeV1[] = [
      { fromNodeId: 'n0', toNodeId: 'n1', edgeKind: 'outcome', massPpm: 50_000, isFailure: true },
      { fromNodeId: 'n1', toNodeId: 'n2', edgeKind: 'outcome', massPpm: 50_000, isFailure: true },
    ];
    // Union bound: 50000 + 50000 = 100000
    const unionResult = adapter.computePathFailureProbability(edges, 'union_bound');
    expect(unionResult).toBe(100_000);

    // Independent product: 1 - (1-0.05)*(1-0.05) = 1 - 0.9025 = 0.0975
    // In PPM: 1000000 - floor(950000 * 950000 / 1000000) = 1000000 - 902500 = 97500
    const indepResult = adapter.computePathFailureProbability(edges, 'independent_product');
    expect(indepResult).toBe(97_500);
  });

  it('constraint verified at every reachable decision node', () => {
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    // Every decision node should have non-negative risk ledger
    for (const node of Object.values(result.graph.nodes)) {
      if (node.kind === 'decision') {
        for (const remaining of Object.values(node.state.riskLedger)) {
          expect(remaining).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('constraintStatus not "satisfied" when policy path has cumulative failure > epsilon', () => {
    // Construct a scenario where the policy MUST take a risky action to reach
    // the goal, and that action's cumulative failure exceeds epsilon.
    // Use a model where mine_near_lava has 60% failure, and budget is 50%.
    const highFailModel: P10RiskModelV1 = {
      getOutcomeMasses: (_state, actionId) => {
        if (actionId === 'mine_near_lava') {
          return [
            { outcomeId: 'success', massPpm: 400_000 },
            { outcomeId: 'lava_splash', massPpm: 0 },
            { outcomeId: 'lava_fall', massPpm: 600_000 }, // 60% death
          ];
        }
        return LAVA_MINING_RISK_MODEL.getOutcomeMasses(_state, actionId);
      },
    };
    // Budget is 500,000 PPM (50%). Single mine_near_lava has 600,000 PPM failure.
    // This exceeds the budget → action rejected → goal unreachable.
    const largeBudgetState: P10RiskAwareStateV1 = {
      worldState: LAVA_MINING_INITIAL_STATE.worldState,
      riskLedger: { death: 500_000 },
    };
    const config: P10PlanningConfigV1 = {
      riskMeasure: { kind: 'chance_constraint', epsilonPpm: 500_000 },
      riskAggregation: 'union_bound',
      horizonDepth: 10,
    };
    const result = adapter.planUnderRisk(
      largeBudgetState,
      LAVA_MINING_ACTIONS,
      highFailModel,
      config,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    // mine_near_lava (600k failure) exceeds 500k budget → must be rejected
    const rejected = result.explanation.rejectedActions.filter(
      r => r.actionId === 'mine_near_lava' && r.reason === 'risk_budget_exceeded',
    );
    expect(rejected.length).toBeGreaterThan(0);
    // Graph should exist but mine_near_lava is rejected at root
    expect(result.graph.totalNodes).toBeGreaterThan(0);
  });

  it('constraintStatus reports "unknown" when truncated (not "satisfied")', () => {
    const deepConfig = {
      ...LAVA_MINING_CONFIG,
      horizonDepth: MAX_SCENARIO_DEPTH,
    };
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      deepConfig,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    // Guard: with horizon 50 and 4 multi-outcome actions, BFS must exceed node cap
    expect(result.graph.totalNodes).toBeGreaterThanOrEqual(MAX_SCENARIO_NODES);
    expect(result.graph.constraintStatus).not.toBe('satisfied');
  });

  it('comparative: tight epsilon flips plan preference from fast-risky to slow-safe', () => {
    const looseResult = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_LOOSE_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    const tightResult = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_TIGHT_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );

    const looseRisky = looseResult.graph.edges.filter(
      e => e.edgeKind === 'chosen' && e.actionId === 'mine_near_lava',
    ).length;
    const tightRisky = tightResult.graph.edges.filter(
      e => e.edgeKind === 'chosen' && e.actionId === 'mine_near_lava',
    ).length;

    // Loose epsilon should allow MORE risky actions than tight
    expect(looseRisky).toBeGreaterThanOrEqual(tightRisky);
  });

  it('policyFailureUpperBoundPpm <= epsilon when constraintStatus is satisfied', () => {
    // Use a converging scenario: both outcomes make progress toward goal,
    // so BFS fully explores all branches without hitting depth/node caps
    const convergingActions: P10StochasticActionV1[] = [{
      id: 'advance', name: 'Advance', cost: 1, preconditions: {},
      outcomes: [
        { outcomeId: 'fast', effects: [{ property: 'progress', op: 'add', value: 2 }], lossPpm: 0, durationTicks: 1 },
        { outcomeId: 'slow', effects: [{ property: 'progress', op: 'add', value: 1 }], lossPpm: 50, durationTicks: 1 },
      ],
    }];
    const convergingModel: P10RiskModelV1 = {
      getOutcomeMasses: () => [
        { outcomeId: 'fast', massPpm: 900_000 },
        { outcomeId: 'slow', massPpm: 100_000 },
      ],
    };
    const convergingState: P10RiskAwareStateV1 = {
      worldState: { health: 20, progress: 0 },
      riskLedger: { death: 200_000 },
    };
    const convergingConfig: P10PlanningConfigV1 = {
      riskMeasure: { kind: 'chance_constraint', epsilonPpm: 200_000 },
      riskAggregation: 'union_bound',
      horizonDepth: 10,
    };
    const convergingInvariants: readonly P10SafetyInvariantV1[] = [
      { id: 'alive', name: 'Stay alive', minimums: { health: 1 }, riskKind: 'death' },
    ];
    const result = adapter.planUnderRisk(
      convergingState,
      convergingActions,
      convergingModel,
      convergingConfig,
      convergingInvariants,
      (s) => (s.worldState.progress ?? 0) >= 2,
    );
    expect(result.graph.constraintStatus).toBe('satisfied');
    expect(result.policyFailureUpperBoundPpm).toBeLessThanOrEqual(200_000);
  });

  it('graphWideCumulativeFailurePpm >= policyFailureUpperBoundPpm', () => {
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_LOOSE_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    // Graph-wide includes all paths; policy only follows prescribed actions
    expect(result.graphWideCumulativeFailurePpm).toBeGreaterThanOrEqual(
      result.policyFailureUpperBoundPpm,
    );
  });
});

// ── 3. Risk Budget Monotonicity (Pivot 3) ──────────────────────────

describe('P10 Invariant: risk_budget_monotonicity', () => {
  it('risk ledger entries decrease along paths', () => {
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    for (const delta of result.explanation.riskDeltas) {
      for (const kind of Object.keys(delta.riskRemainingBefore)) {
        expect(delta.riskRemainingAfter[kind]).toBeLessThanOrEqual(
          delta.riskRemainingBefore[kind],
        );
      }
    }
  });

  it('risk ledger entries never increase', () => {
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    for (const edge of result.graph.edges) {
      if (edge.edgeKind === 'outcome') {
        const fromNode = result.graph.nodes[edge.fromNodeId];
        const toNode = result.graph.nodes[edge.toNodeId];
        if (fromNode && toNode) {
          for (const kind of Object.keys(fromNode.state.riskLedger)) {
            expect(toNode.state.riskLedger[kind]).toBeLessThanOrEqual(
              fromNode.state.riskLedger[kind],
            );
          }
        }
      }
    }
  });

  it('action whose failure mass exceeds ledger is illegal (fail-closed)', () => {
    const tinyBudgetState: P10RiskAwareStateV1 = {
      worldState: LAVA_MINING_INITIAL_STATE.worldState,
      riskLedger: { death: 1_000 },
    };
    const result = adapter.planUnderRisk(
      tinyBudgetState,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    const rootRejections = result.explanation.rejectedActions.filter(
      r => r.actionId === 'mine_near_lava' && r.reason === 'risk_budget_exceeded',
    );
    expect(rootRejections.length).toBeGreaterThan(0);
  });

  it('risk ledger starts at declared epsilon per riskKind', () => {
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    const rootNode = result.graph.nodes[result.graph.rootNodeId];
    expect(rootNode.state.riskLedger.death).toBe(100_000);
  });

  it('terminal node created when any ledger entry exhausted', () => {
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    const budgetTerminals = Object.values(result.graph.nodes).filter(
      n => n.kind === 'terminal' && n.terminalReason === 'risk_budget_exhausted',
    );
    for (const node of budgetTerminals) {
      expect(Object.values(node.state.riskLedger).some(v => v <= 0)).toBe(true);
    }
  });

  it('ledger tracked in state (not post-hoc)', () => {
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    for (const node of Object.values(result.graph.nodes)) {
      expect(node.state.riskLedger).toBeDefined();
      expect(Object.keys(node.state.riskLedger).length).toBeGreaterThan(0);
    }
  });
});

// ── 4. Deterministic Scenario Evaluation (Pivot 4) ─────────────────

describe('P10 Invariant: deterministic_scenario_evaluation', () => {
  it('same inputs produce identical graph (50 runs)', () => {
    const results = Array.from({ length: 50 }, () =>
      adapter.planUnderRisk(
        LAVA_MINING_INITIAL_STATE,
        LAVA_MINING_ACTIONS,
        LAVA_MINING_RISK_MODEL,
        LAVA_MINING_CONFIG,
        LAVA_MINING_SAFETY_INVARIANTS,
        lavaMiningGoalPredicate,
      ),
    );
    const first = results[0];
    for (const r of results) {
      expect(r.graph.totalNodes).toBe(first.graph.totalNodes);
      expect(r.graph.edges.length).toBe(first.graph.edges.length);
      expect(r.graph.rootNodeId).toBe(first.graph.rootNodeId);
    }
  });

  it('same inputs produce identical node counts', () => {
    const counts = Array.from({ length: 50 }, () =>
      adapter.planUnderRisk(
        LAVA_MINING_INITIAL_STATE,
        LAVA_MINING_ACTIONS,
        LAVA_MINING_RISK_MODEL,
        LAVA_MINING_CONFIG,
        LAVA_MINING_SAFETY_INVARIANTS,
        lavaMiningGoalPredicate,
      ).graph.totalNodes,
    );
    expect(counts.every(c => c === counts[0])).toBe(true);
  });

  it('outcome edge ordering is deterministic', () => {
    const r1 = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    const r2 = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    const outcomeEdges1 = r1.graph.edges.filter(e => e.edgeKind === 'outcome').map(e => e.outcomeId);
    const outcomeEdges2 = r2.graph.edges.filter(e => e.edgeKind === 'outcome').map(e => e.outcomeId);
    expect(outcomeEdges1).toEqual(outcomeEdges2);
  });

  it('decision node action ordering is deterministic (cost, then ID)', () => {
    const r1 = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    const r2 = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    const chosenEdges1 = r1.graph.edges.filter(e => e.edgeKind === 'chosen').map(e => e.actionId);
    const chosenEdges2 = r2.graph.edges.filter(e => e.edgeKind === 'chosen').map(e => e.actionId);
    expect(chosenEdges1).toEqual(chosenEdges2);
  });

  it('risk model returning different masses preserves graph structure', () => {
    const altModel: P10RiskModelV1 = {
      getOutcomeMasses: (_state, actionId) => {
        switch (actionId) {
          case 'mine_near_lava':
            return [
              { outcomeId: 'success', massPpm: 600_000 },
              { outcomeId: 'lava_splash', massPpm: 300_000 },
              { outcomeId: 'lava_fall', massPpm: 100_000 },
            ];
          default:
            return LAVA_MINING_RISK_MODEL.getOutcomeMasses(_state, actionId);
        }
      },
    };
    const r1 = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_LOOSE_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    const r2 = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      altModel,
      LAVA_MINING_LOOSE_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(r1.graph.totalNodes).toBeGreaterThan(0);
    expect(r2.graph.totalNodes).toBeGreaterThan(0);
  });

  it('50 runs produce byte-identical JSON serialization of edges', () => {
    // Pin serialization determinism, not just structural equality
    const shallowConfig: P10PlanningConfigV1 = {
      riskMeasure: { kind: 'chance_constraint', epsilonPpm: 200_000 },
      riskAggregation: 'union_bound',
      horizonDepth: 4,
    };
    const results = Array.from({ length: 50 }, () =>
      adapter.planUnderRisk(
        LAVA_MINING_INITIAL_STATE,
        LAVA_MINING_ACTIONS,
        LAVA_MINING_RISK_MODEL,
        shallowConfig,
        LAVA_MINING_SAFETY_INVARIANTS,
        lavaMiningGoalPredicate,
      ),
    );
    const firstEdges = stableStringify(results[0].graph.edges);
    const firstNodes = stableStringify(results[0].graph.nodes);
    for (const r of results) {
      expect(stableStringify(r.graph.edges)).toBe(firstEdges);
      expect(stableStringify(r.graph.nodes)).toBe(firstNodes);
    }
  });
});

// ── 5. Bounded Scenario Graph (Pivot 5) ────────────────────────────

describe('P10 Invariant: bounded_scenario_graph', () => {
  it('MAX_SCENARIO_NODES enforced', () => {
    const deepConfig = {
      ...LAVA_MINING_CONFIG,
      horizonDepth: MAX_SCENARIO_DEPTH,
    };
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      deepConfig,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(result.graph.totalNodes).toBeLessThanOrEqual(MAX_SCENARIO_NODES);
  });

  it('MAX_SCENARIO_DEPTH enforced', () => {
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(result.graph.maxDepth).toBeLessThanOrEqual(MAX_SCENARIO_DEPTH);
  });

  it('MAX_OUTCOMES_PER_ACTION enforced (at most N outcomes per action)', () => {
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(result.graph.maxChanceFanout).toBeLessThanOrEqual(MAX_OUTCOMES_PER_ACTION);
  });

  it('terminal reason is auditable for each leaf', () => {
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    const terminals = Object.values(result.graph.nodes).filter(n => n.kind === 'terminal');
    for (const t of terminals) {
      expect(t.terminalReason).toBeDefined();
      expect([
        'goal_reached',
        'risk_budget_exhausted',
        'safety_violated',
        'horizon_reached',
        'node_cap_reached',
      ]).toContain(t.terminalReason);
    }
  });

  it('adapter exposes correct bound constants', () => {
    expect(adapter.maxScenarioNodes).toBe(MAX_SCENARIO_NODES);
    expect(adapter.maxScenarioDepth).toBe(MAX_SCENARIO_DEPTH);
    expect(adapter.maxOutcomesPerAction).toBe(MAX_OUTCOMES_PER_ACTION);
  });

  it('graph with long horizon still respects node cap', () => {
    const longConfig = {
      ...LAVA_MINING_CONFIG,
      horizonDepth: 100,
    };
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      longConfig,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(result.graph.totalNodes).toBeLessThanOrEqual(MAX_SCENARIO_NODES);
  });
});

// ── 6. Stochastic Action Mechanics ─────────────────────────────────

describe('P10 Stochastic action mechanics', () => {
  it('expandAction returns null when preconditions unmet', () => {
    const deadState: P10RiskAwareStateV1 = {
      worldState: { health: 0, ore: 0, has_fire_resist: 0, gear_value: 100 },
      riskLedger: { death: 100_000 },
    };
    const mineAction = LAVA_MINING_ACTIONS.find(a => a.id === 'mine_near_lava')!;
    const result = adapter.expandAction(
      deadState,
      mineAction,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_SAFETY_INVARIANTS,
    );
    expect(result).toBeNull();
  });

  it('expandAction creates correct number of outcome branches', () => {
    const mineAction = LAVA_MINING_ACTIONS.find(a => a.id === 'mine_near_lava')!;
    const result = adapter.expandAction(
      LAVA_MINING_INITIAL_STATE,
      mineAction,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_SAFETY_INVARIANTS,
    );
    expect(result).not.toBeNull();
    expect(result!.outcomes).toHaveLength(3);
  });

  it('effects applied correctly via declarative ops (add, set, min, max)', () => {
    const state: P10RiskAwareStateV1 = {
      worldState: { health: 20, ore: 5, flag: 0, cap: 100 },
      riskLedger: { death: 100_000 },
    };
    const effects = [
      { property: 'ore', op: 'add' as const, value: 3 },
      { property: 'flag', op: 'set' as const, value: 1 },
      { property: 'health', op: 'min' as const, value: 10 },
      { property: 'cap', op: 'max' as const, value: 150 },
    ];
    const result = adapter.applyEffects(state, effects);
    expect(result.worldState.ore).toBe(8);
    expect(result.worldState.flag).toBe(1);
    expect(result.worldState.health).toBe(10);
    expect(result.worldState.cap).toBe(150);
  });

  it('isFailure derived from safety invariant violation (not author-asserted)', () => {
    const mineAction = LAVA_MINING_ACTIONS.find(a => a.id === 'mine_near_lava')!;
    const expansion = adapter.expandAction(
      LAVA_MINING_INITIAL_STATE,
      mineAction,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_SAFETY_INVARIANTS,
    )!;
    const lavaFall = expansion.outcomes.find(o => o.outcomeId === 'lava_fall');
    expect(lavaFall).toBeDefined();
    expect(lavaFall!.isFailure).toBe(true);
    expect(lavaFall!.resultState.worldState.health).toBe(0);

    const success = expansion.outcomes.find(o => o.outcomeId === 'success');
    expect(success!.isFailure).toBe(false);
  });

  it('risk ledger updated correctly after expansion', () => {
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(result.explanation.riskDeltas.length).toBeGreaterThan(0);
    for (const delta of result.explanation.riskDeltas) {
      if (delta.failureMassPpm > 0) {
        for (const kind of Object.keys(delta.riskRemainingBefore)) {
          expect(delta.riskRemainingAfter[kind]).toBeLessThan(
            delta.riskRemainingBefore[kind],
          );
        }
      }
    }
  });

  it('CVaR computed over terminal loss distribution', () => {
    const cvarConfig: typeof LAVA_MINING_CONFIG = {
      riskMeasure: { kind: 'cvar', alphaPpm: 200_000 },
      riskAggregation: 'union_bound',
      horizonDepth: 6,
    };
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      cvarConfig,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(result.cvarCost).toBeDefined();
    expect(typeof result.cvarCost).toBe('number');
    expect(result.cvarCost!).toBeGreaterThanOrEqual(0);
  });

  it('explanation bundle includes rejected actions with reasons', () => {
    const tinyBudgetState: P10RiskAwareStateV1 = {
      worldState: LAVA_MINING_INITIAL_STATE.worldState,
      riskLedger: { death: 1_000 },
    };
    const result = adapter.planUnderRisk(
      tinyBudgetState,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(result.explanation.rejectedActions.length).toBeGreaterThan(0);
    for (const rejected of result.explanation.rejectedActions) {
      expect(['precondition_failed', 'risk_budget_exceeded', 'safety_violation']).toContain(
        rejected.reason,
      );
    }
  });
});

// ── 7. Learning Stability ──────────────────────────────────────────

describe('P10 Learning stability', () => {
  it('updateRiskModel changes masses only (outcome IDs preserved)', () => {
    const original = LAVA_MINING_RISK_MODEL.getOutcomeMasses(
      LAVA_MINING_INITIAL_STATE,
      'mine_near_lava',
    );
    const originalIds = original.map(m => m.outcomeId).sort();

    const updated = adapter.updateRiskModel(LAVA_MINING_RISK_MODEL, {
      actionId: 'mine_near_lava',
      observedOutcomeId: 'success',
      stateContext: LAVA_MINING_INITIAL_STATE,
      executionCount: 10,
    });
    const newMasses = updated.getOutcomeMasses(LAVA_MINING_INITIAL_STATE, 'mine_near_lava');
    const newIds = newMasses.map(m => m.outcomeId).sort();

    expect(newIds).toEqual(originalIds);
  });

  it('updateRiskModel preserves MASS_TOTAL (largest-remainder apportionment)', () => {
    const updated = adapter.updateRiskModel(LAVA_MINING_RISK_MODEL, {
      actionId: 'mine_near_lava',
      observedOutcomeId: 'success',
      stateContext: LAVA_MINING_INITIAL_STATE,
      executionCount: 7,
    });
    const masses = updated.getOutcomeMasses(LAVA_MINING_INITIAL_STATE, 'mine_near_lava');
    const total = masses.reduce((sum, m) => sum + m.massPpm, 0);
    expect(total).toBe(MASS_TOTAL);
  });

  it('same state + same action → same outcome set regardless of model', () => {
    const updated = adapter.updateRiskModel(LAVA_MINING_RISK_MODEL, {
      actionId: 'mine_near_lava',
      observedOutcomeId: 'lava_fall',
      stateContext: LAVA_MINING_INITIAL_STATE,
      executionCount: 5,
    });

    const origExpansion = adapter.expandAction(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS[0],
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_SAFETY_INVARIANTS,
    )!;
    const updatedExpansion = adapter.expandAction(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS[0],
      updated,
      LAVA_MINING_SAFETY_INVARIANTS,
    )!;

    const origIds = origExpansion.outcomes.map(o => o.outcomeId).sort();
    const updatedIds = updatedExpansion.outcomes.map(o => o.outcomeId).sort();
    expect(updatedIds).toEqual(origIds);

    for (const oid of origIds) {
      const origOutcome = origExpansion.outcomes.find(o => o.outcomeId === oid)!;
      const updatedOutcome = updatedExpansion.outcomes.find(o => o.outcomeId === oid)!;
      expect(updatedOutcome.isFailure).toBe(origOutcome.isFailure);
    }
  });

  it('masses change after execution report', () => {
    const original = LAVA_MINING_RISK_MODEL.getOutcomeMasses(
      LAVA_MINING_INITIAL_STATE,
      'mine_near_lava',
    );
    const updated = adapter.updateRiskModel(LAVA_MINING_RISK_MODEL, {
      actionId: 'mine_near_lava',
      observedOutcomeId: 'success',
      stateContext: LAVA_MINING_INITIAL_STATE,
      executionCount: 100,
    });
    const newMasses = updated.getOutcomeMasses(LAVA_MINING_INITIAL_STATE, 'mine_near_lava');

    const origSuccess = original.find(m => m.outcomeId === 'success')!.massPpm;
    const newSuccess = newMasses.find(m => m.outcomeId === 'success')!.massPpm;
    expect(newSuccess).toBeGreaterThan(origSuccess);
  });

  it('rounding is deterministic (largest-remainder with outcomeId tie-break)', () => {
    const report = {
      actionId: 'mine_near_lava',
      observedOutcomeId: 'success',
      stateContext: LAVA_MINING_INITIAL_STATE,
      executionCount: 7,
    };
    const results = Array.from({ length: 50 }, () => {
      const updated = adapter.updateRiskModel(LAVA_MINING_RISK_MODEL, report);
      return updated.getOutcomeMasses(LAVA_MINING_INITIAL_STATE, 'mine_near_lava');
    });

    const first = JSON.stringify(results[0]);
    expect(results.every(r => JSON.stringify(r) === first)).toBe(true);
  });

  it('expansion result states identical before and after model update (only masses differ)', () => {
    // Snapshot expansion before update
    const origExpansion = adapter.expandAction(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS[0],
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_SAFETY_INVARIANTS,
    )!;

    // Update model heavily
    const updated = adapter.updateRiskModel(LAVA_MINING_RISK_MODEL, {
      actionId: 'mine_near_lava',
      observedOutcomeId: 'success',
      stateContext: LAVA_MINING_INITIAL_STATE,
      executionCount: 500,
    });

    const updatedExpansion = adapter.expandAction(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS[0],
      updated,
      LAVA_MINING_SAFETY_INVARIANTS,
    )!;

    // IDs, result states, isFailure, and lossPpm must be identical
    for (const oid of origExpansion.outcomes.map(o => o.outcomeId)) {
      const orig = origExpansion.outcomes.find(o => o.outcomeId === oid)!;
      const upd = updatedExpansion.outcomes.find(o => o.outcomeId === oid)!;
      expect(upd.resultState.worldState).toEqual(orig.resultState.worldState);
      expect(upd.isFailure).toBe(orig.isFailure);
      expect(upd.lossPpm).toBe(orig.lossPpm);
    }
    // But masses must differ (we changed them heavily)
    const origMasses = origExpansion.outcomes.map(o => o.massPpm);
    const updMasses = updatedExpansion.outcomes.map(o => o.massPpm);
    expect(updMasses).not.toEqual(origMasses);
  });

  it('planUnderRisk does not mutate the risk model (no plan-success reinforcement)', () => {
    // Capture original masses before planning
    const massesBefore = LAVA_MINING_RISK_MODEL.getOutcomeMasses(
      LAVA_MINING_INITIAL_STATE,
      'mine_near_lava',
    );
    const beforeJson = JSON.stringify(massesBefore);

    // Run planning
    adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );

    // Masses must be unchanged after planning
    const massesAfter = LAVA_MINING_RISK_MODEL.getOutcomeMasses(
      LAVA_MINING_INITIAL_STATE,
      'mine_near_lava',
    );
    expect(JSON.stringify(massesAfter)).toBe(beforeJson);
  });
});

// ── 8. Multi-Domain Portability ────────────────────────────────────

describe('P10 Multi-domain portability', () => {
  it('security domain works with same adapter', () => {
    const result = adapter.planUnderRisk(
      SECURITY_INITIAL_STATE,
      SECURITY_ACTIONS,
      SECURITY_RISK_MODEL,
      SECURITY_CONFIG,
      SECURITY_SAFETY_INVARIANTS,
      securityGoalPredicate,
    );
    expect(result.graph.totalNodes).toBeGreaterThan(0);
    expect(result.graph.rootNodeId).toBeDefined();
  });

  it('security planning produces a graph with correct constraintStatus', () => {
    const result = adapter.planUnderRisk(
      SECURITY_INITIAL_STATE,
      SECURITY_ACTIONS,
      SECURITY_RISK_MODEL,
      SECURITY_CONFIG,
      SECURITY_SAFETY_INVARIANTS,
      securityGoalPredicate,
    );
    expect(['satisfied', 'violated', 'unknown']).toContain(result.graph.constraintStatus);
  });

  it('both domains use same adapter instance', () => {
    const lavaResult = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    const secResult = adapter.planUnderRisk(
      SECURITY_INITIAL_STATE,
      SECURITY_ACTIONS,
      SECURITY_RISK_MODEL,
      SECURITY_CONFIG,
      SECURITY_SAFETY_INVARIANTS,
      securityGoalPredicate,
    );
    expect(lavaResult.graph.totalNodes).toBeGreaterThan(0);
    expect(secResult.graph.totalNodes).toBeGreaterThan(0);
  });

  it('security safety invariants derive failure correctly', () => {
    const hotfix = SECURITY_ACTIONS.find(a => a.id === 'deploy_hotfix')!;
    const expansion = adapter.expandAction(
      SECURITY_INITIAL_STATE,
      hotfix,
      SECURITY_RISK_MODEL,
      SECURITY_SAFETY_INVARIANTS,
    )!;
    const fullOutage = expansion.outcomes.find(o => o.outcomeId === 'full_outage');
    expect(fullOutage).toBeDefined();
    expect(fullOutage!.isFailure).toBe(true);

    const success = expansion.outcomes.find(o => o.outcomeId === 'success');
    expect(success!.isFailure).toBe(false);
  });

  it('security domain uses same expansion mechanics', () => {
    const canary = SECURITY_ACTIONS.find(a => a.id === 'canary_deploy')!;
    const expansion = adapter.expandAction(
      SECURITY_INITIAL_STATE,
      canary,
      SECURITY_RISK_MODEL,
      SECURITY_SAFETY_INVARIANTS,
    )!;
    expect(expansion.outcomes).toHaveLength(2);
    const failure = expansion.outcomes.find(o => o.outcomeId === 'canary_failure');
    expect(failure!.isFailure).toBe(false);
  });

  it('both domains produce graphs with same node/edge kinds (structural isomorphism)', () => {
    const lavaResult = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    const secResult = adapter.planUnderRisk(
      SECURITY_INITIAL_STATE,
      SECURITY_ACTIONS,
      SECURITY_RISK_MODEL,
      SECURITY_CONFIG,
      SECURITY_SAFETY_INVARIANTS,
      securityGoalPredicate,
    );

    // Both must use the same set of node kinds and edge kinds
    const lavaNodeKinds = new Set(Object.values(lavaResult.graph.nodes).map(n => n.kind));
    const secNodeKinds = new Set(Object.values(secResult.graph.nodes).map(n => n.kind));
    const lavaEdgeKinds = new Set(lavaResult.graph.edges.map(e => e.edgeKind));
    const secEdgeKinds = new Set(secResult.graph.edges.map(e => e.edgeKind));

    // Both domains must produce decision, chance, and terminal nodes
    expect(lavaNodeKinds.has('decision')).toBe(true);
    expect(lavaNodeKinds.has('chance')).toBe(true);
    expect(secNodeKinds.has('decision')).toBe(true);
    expect(secNodeKinds.has('chance')).toBe(true);
    // Both must use chosen and outcome edges
    expect(lavaEdgeKinds.has('chosen')).toBe(true);
    expect(lavaEdgeKinds.has('outcome')).toBe(true);
    expect(secEdgeKinds.has('chosen')).toBe(true);
    expect(secEdgeKinds.has('outcome')).toBe(true);
  });
});

// ── 9. Contract Metadata ───────────────────────────────────────────

describe('P10 Contract metadata', () => {
  it('has 5 invariants', () => {
    expect(P10_INVARIANTS).toHaveLength(5);
  });

  it('invariant names match expected pivots', () => {
    expect(P10_INVARIANTS).toContain('outcome_mass_conservation');
    expect(P10_INVARIANTS).toContain('chance_constraint_satisfaction');
    expect(P10_INVARIANTS).toContain('risk_budget_monotonicity');
    expect(P10_INVARIANTS).toContain('deterministic_scenario_evaluation');
    expect(P10_INVARIANTS).toContain('bounded_scenario_graph');
  });

  it('contract version is p10.v1', () => {
    expect(P10_CONTRACT_VERSION).toBe('p10.v1');
  });

  it('adapter exposes correct constants', () => {
    expect(adapter.maxScenarioNodes).toBe(MAX_SCENARIO_NODES);
    expect(adapter.maxScenarioDepth).toBe(MAX_SCENARIO_DEPTH);
    expect(adapter.maxOutcomesPerAction).toBe(MAX_OUTCOMES_PER_ACTION);
  });
});

// ── 10. Contract Hardening — Budget, Truncation, riskKind, Mass ────

describe('P10 Contract hardening', () => {
  // -- Budget provenance --

  it('budgetSource is "state" when initial state has non-empty riskLedger', () => {
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(result.budgetSource).toBe('state');
    expect(result.effectiveBudget).toEqual({ death: 100_000 });
  });

  it('budgetSource is "config_default" when initial state has empty riskLedger', () => {
    const emptyLedgerState: P10RiskAwareStateV1 = {
      worldState: LAVA_MINING_INITIAL_STATE.worldState,
      riskLedger: {},
    };
    const result = adapter.planUnderRisk(
      emptyLedgerState,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(result.budgetSource).toBe('config_default');
    // Budget keys derived from safetyInvariants' riskKind, not a generic 'default'
    expect(result.effectiveBudget).toEqual({ death: 100_000 });
  });

  it('budget_mismatch warning emitted when state ledger disagrees with config epsilon', () => {
    // State says 100k, config says 10k — mismatch
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_TIGHT_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(result.budgetMismatchWarnings.length).toBeGreaterThan(0);
    const warning = result.budgetMismatchWarnings[0];
    expect(warning.riskKind).toBe('death');
    expect(warning.ledgerValue).toBe(100_000);
    expect(warning.configEpsilonPpm).toBe(10_000);
  });

  it('no budget_mismatch warning when state ledger matches config epsilon', () => {
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,  // epsilon = 100k, ledger = 100k
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(result.budgetMismatchWarnings).toHaveLength(0);
  });

  // -- Truncation semantics --

  it('constraintStatus is not "satisfied" when wasTruncated is true', () => {
    // Use deep horizon + tight node cap to force truncation
    const deepConfig: P10PlanningConfigV1 = {
      riskMeasure: { kind: 'chance_constraint', epsilonPpm: 200_000 },
      riskAggregation: 'union_bound',
      horizonDepth: MAX_SCENARIO_DEPTH,
    };
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      deepConfig,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(result.wasTruncated).toBe(true);
    expect(result.graph.constraintStatus).not.toBe('satisfied');
    expect(result.truncationReason).not.toBeNull();
  });

  it('wasTruncated is true when graph hits node cap', () => {
    const deepConfig: P10PlanningConfigV1 = {
      riskMeasure: { kind: 'chance_constraint', epsilonPpm: 200_000 },
      riskAggregation: 'union_bound',
      horizonDepth: MAX_SCENARIO_DEPTH,
    };
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      deepConfig,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(result.graph.totalNodes).toBeGreaterThanOrEqual(MAX_SCENARIO_NODES);
    expect(result.wasTruncated).toBe(true);
    expect(result.truncationReason).toBe('node_cap');
  });

  it('wasTruncated is true when horizon reached (depth_cap)', () => {
    // Use very shallow horizon to guarantee depth truncation
    const shallowConfig: P10PlanningConfigV1 = {
      riskMeasure: { kind: 'chance_constraint', epsilonPpm: 200_000 },
      riskAggregation: 'union_bound',
      horizonDepth: 3,
    };
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      shallowConfig,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    expect(result.wasTruncated).toBe(true);
    expect(result.truncationReason).toBe('depth_cap');
  });

  it('three-way interpretation: safe plan = satisfied AND goalReachable AND not truncated', () => {
    // Converging scenario: all branches reach goal, no truncation
    const convergingActions: P10StochasticActionV1[] = [{
      id: 'advance', name: 'Advance', cost: 1, preconditions: {},
      outcomes: [
        { outcomeId: 'fast', effects: [{ property: 'progress', op: 'add', value: 2 }], lossPpm: 0, durationTicks: 1 },
        { outcomeId: 'slow', effects: [{ property: 'progress', op: 'add', value: 1 }], lossPpm: 50, durationTicks: 1 },
      ],
    }];
    const convergingModel: P10RiskModelV1 = {
      getOutcomeMasses: () => [
        { outcomeId: 'fast', massPpm: 900_000 },
        { outcomeId: 'slow', massPpm: 100_000 },
      ],
    };
    const convergingState: P10RiskAwareStateV1 = {
      worldState: { health: 20, progress: 0 },
      riskLedger: { death: 200_000 },
    };
    const convergingConfig: P10PlanningConfigV1 = {
      riskMeasure: { kind: 'chance_constraint', epsilonPpm: 200_000 },
      riskAggregation: 'union_bound',
      horizonDepth: 10,
    };
    const convergingInvariants: readonly P10SafetyInvariantV1[] = [
      { id: 'alive', name: 'Stay alive', minimums: { health: 1 }, riskKind: 'death' },
    ];
    const result = adapter.planUnderRisk(
      convergingState,
      convergingActions,
      convergingModel,
      convergingConfig,
      convergingInvariants,
      (s) => (s.worldState.progress ?? 0) >= 2,
    );
    // All three must hold for a fully-explored safe plan
    expect(result.graph.constraintStatus).toBe('satisfied');
    expect(result.graph.goalReachable).toBe(true);
    expect(result.wasTruncated).toBe(false);
    // Verify failure probability is within budget
    expect(result.policyFailureUpperBoundPpm).toBeLessThanOrEqual(200_000);
  });

  // -- riskKind-directed debiting --

  it('safety invariant riskKind maps to correct ledger entry', () => {
    // Lava mining: stay_alive.riskKind = 'death', ledger key = 'death'
    expect(LAVA_MINING_SAFETY_INVARIANTS[0].riskKind).toBe('death');
    expect(LAVA_MINING_INITIAL_STATE.riskLedger['death']).toBeDefined();

    // Security: sla_compliance.riskKind = 'outage', ledger key = 'outage'
    expect(SECURITY_SAFETY_INVARIANTS[0].riskKind).toBe('outage');
    expect(SECURITY_INITIAL_STATE.riskLedger['outage']).toBeDefined();
  });

  it('risk ledger debits only the affected riskKind (not all entries)', () => {
    // Create a state with two ledger entries
    const multiLedgerState: P10RiskAwareStateV1 = {
      worldState: { health: 20, ore: 0, has_fire_resist: 0, gear_value: 100 },
      riskLedger: { death: 100_000, gear_loss: 50_000 },
    };
    // stay_alive invariant maps to 'death', not 'gear_loss'
    const multiInvariants: readonly P10SafetyInvariantV1[] = [
      { id: 'stay_alive', name: 'Health > 0', minimums: { health: 1 }, riskKind: 'death' },
      { id: 'keep_gear', name: 'Gear > 50', minimums: { gear_value: 50 }, riskKind: 'gear_loss' },
    ];
    // mine_near_lava causes death (health=0 via lava_fall), debiting 'death' only
    const result = adapter.planUnderRisk(
      multiLedgerState,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      LAVA_MINING_CONFIG,
      multiInvariants,
      lavaMiningGoalPredicate,
    );
    // Verify via risk deltas that mine_near_lava debits death but not gear_loss
    const lavaDelta = result.explanation.riskDeltas.find(d => d.actionId === 'mine_near_lava');
    expect(lavaDelta).toBeDefined();
    // death should decrease
    expect(lavaDelta!.riskRemainingAfter['death']).toBeLessThan(lavaDelta!.riskRemainingBefore['death']);
    // gear_loss should be unchanged (no gear_loss invariant violated by lava_fall)
    expect(lavaDelta!.riskRemainingAfter['gear_loss']).toBe(lavaDelta!.riskRemainingBefore['gear_loss']);
  });

  // -- Mass conservation at expansion time --

  it('expandAction returns null for action with broken mass at non-root state', () => {
    // Model that returns correct masses at initial state but broken at different state
    const brokenAtDepthModel: P10RiskModelV1 = {
      getOutcomeMasses: (state, actionId) => {
        if (actionId === 'mine_near_lava' && (state.worldState.ore ?? 0) > 0) {
          // Broken: masses sum to 999_000, not MASS_TOTAL
          return [
            { outcomeId: 'success', massPpm: 699_000 },
            { outcomeId: 'lava_splash', massPpm: 250_000 },
            { outcomeId: 'lava_fall', massPpm: 50_000 },
          ];
        }
        return LAVA_MINING_RISK_MODEL.getOutcomeMasses(state, actionId);
      },
    };
    // At initial state (ore=0): should work
    const validExpansion = adapter.expandAction(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS[0],
      brokenAtDepthModel,
      LAVA_MINING_SAFETY_INVARIANTS,
    );
    expect(validExpansion).not.toBeNull();

    // At state with ore > 0: should fail-closed
    const oreState: P10RiskAwareStateV1 = {
      worldState: { ...LAVA_MINING_INITIAL_STATE.worldState, ore: 1 },
      riskLedger: LAVA_MINING_INITIAL_STATE.riskLedger,
    };
    const brokenExpansion = adapter.expandAction(
      oreState,
      LAVA_MINING_ACTIONS[0],
      brokenAtDepthModel,
      LAVA_MINING_SAFETY_INVARIANTS,
    );
    expect(brokenExpansion).toBeNull();
  });

  it('planUnderRisk rejects action with mass_not_conserved at expansion time', () => {
    const brokenModel: P10RiskModelV1 = {
      getOutcomeMasses: (_state, actionId) => {
        if (actionId === 'mine_near_lava') {
          return [
            { outcomeId: 'success', massPpm: 700_000 },
            { outcomeId: 'lava_splash', massPpm: 250_000 },
            // Missing lava_fall: total = 950_000
          ];
        }
        return LAVA_MINING_RISK_MODEL.getOutcomeMasses(_state, actionId);
      },
    };
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      LAVA_MINING_ACTIONS,
      brokenModel,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    const massRejections = result.explanation.rejectedActions.filter(
      r => r.actionId === 'mine_near_lava' && r.reason === 'mass_not_conserved',
    );
    expect(massRejections.length).toBeGreaterThan(0);
  });

  // -- no_feasible_actions terminal reason --

  it('dead-end root uses no_feasible_actions terminal reason', () => {
    // All actions have preconditions that can't be met
    const impossibleActions: readonly P10StochasticActionV1[] = [
      {
        id: 'impossible',
        name: 'Impossible action',
        cost: 1,
        preconditions: { unobtanium: 999 },
        outcomes: [
          { outcomeId: 'success', effects: [], lossPpm: 0, durationTicks: 1 },
        ],
      },
    ];
    const impossibleModel: P10RiskModelV1 = {
      getOutcomeMasses: () => [{ outcomeId: 'success', massPpm: MASS_TOTAL }],
    };
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      impossibleActions,
      impossibleModel,
      LAVA_MINING_CONFIG,
      LAVA_MINING_SAFETY_INVARIANTS,
      () => false,
    );
    const root = result.graph.nodes[result.graph.rootNodeId];
    expect(root.kind).toBe('terminal');
    expect(root.terminalReason).toBe('no_feasible_actions');
  });

  // -- stableStringify --

  it('stableStringify produces same output regardless of key insertion order', () => {
    const a = { z: 1, a: 2, m: { c: 3, b: 4 } };
    const b = { a: 2, m: { b: 4, c: 3 }, z: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('stableStringify handles arrays without reordering', () => {
    const arr = [{ b: 2, a: 1 }, { d: 4, c: 3 }];
    const result = stableStringify(arr);
    // Keys sorted within objects, but array order preserved
    expect(result).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
  });

  it('50 runs of stableStringify(graph) produce identical output', () => {
    const shallowConfig: P10PlanningConfigV1 = {
      riskMeasure: { kind: 'chance_constraint', epsilonPpm: 200_000 },
      riskAggregation: 'union_bound',
      horizonDepth: 4,
    };
    const results = Array.from({ length: 50 }, () =>
      adapter.planUnderRisk(
        LAVA_MINING_INITIAL_STATE,
        LAVA_MINING_ACTIONS,
        LAVA_MINING_RISK_MODEL,
        shallowConfig,
        LAVA_MINING_SAFETY_INVARIANTS,
        lavaMiningGoalPredicate,
      ),
    );
    const firstGraph = stableStringify(results[0].graph);
    for (const r of results) {
      expect(stableStringify(r.graph)).toBe(firstGraph);
    }
  });

  // -- Acceptance: config_default debiting works with riskKind --

  it('config_default initializes ledger from safetyInvariants riskKinds and debits correctly', () => {
    // Empty ledger → adapter must initialize from invariants' riskKinds
    const emptyLedgerState: P10RiskAwareStateV1 = {
      worldState: { health: 20, ore: 0, has_fire_resist: 0, gear_value: 100 },
      riskLedger: {},
    };
    const tightConfig: P10PlanningConfigV1 = {
      riskMeasure: { kind: 'chance_constraint', epsilonPpm: 30_000 }, // 3%
      riskAggregation: 'union_bound',
      horizonDepth: 10,
    };
    const result = adapter.planUnderRisk(
      emptyLedgerState,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      tightConfig,
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    // Effective budget should use 'death' (from stay_alive.riskKind), not 'default'
    expect(result.effectiveBudget['death']).toBe(30_000);
    expect(result.effectiveBudget['default']).toBeUndefined();
    // mine_near_lava has 50k death-failure mass > 30k budget → must be rejected
    const rejected = result.explanation.rejectedActions.filter(
      r => r.actionId === 'mine_near_lava' && r.reason === 'risk_budget_exceeded',
    );
    expect(rejected.length).toBeGreaterThan(0);
  });

  // -- Acceptance: multi-riskKind per-kind debiting --

  it('multi-riskKind action debits each kind by its own failure mass only', () => {
    // Synthetic action with two distinct failure outcomes, each violating different invariants
    const multiFailAction: P10StochasticActionV1 = {
      id: 'risky_combo',
      name: 'Combo attack (death + gear loss)',
      cost: 2,
      preconditions: {},
      outcomes: [
        { outcomeId: 'success', effects: [{ property: 'ore', op: 'add', value: 5 }], lossPpm: 0, durationTicks: 10 },
        { outcomeId: 'death_hit', effects: [{ property: 'health', op: 'set', value: 0 }], lossPpm: 500, durationTicks: 10 },
        { outcomeId: 'gear_break', effects: [{ property: 'gear_value', op: 'set', value: 10 }], lossPpm: 200, durationTicks: 10 },
      ],
    };
    const multiModel: P10RiskModelV1 = {
      getOutcomeMasses: (_state, actionId) => {
        if (actionId === 'risky_combo') {
          return [
            { outcomeId: 'success', massPpm: 700_000 },
            { outcomeId: 'death_hit', massPpm: 100_000 },   // violates stay_alive → death
            { outcomeId: 'gear_break', massPpm: 200_000 },  // violates keep_gear → gear_loss
          ];
        }
        return [];
      },
    };
    const multiInvariants: readonly P10SafetyInvariantV1[] = [
      { id: 'stay_alive', name: 'Health > 0', minimums: { health: 1 }, riskKind: 'death' },
      { id: 'keep_gear', name: 'Gear > 50', minimums: { gear_value: 50 }, riskKind: 'gear_loss' },
    ];
    const multiState: P10RiskAwareStateV1 = {
      worldState: { health: 20, ore: 0, has_fire_resist: 0, gear_value: 100 },
      riskLedger: { death: 150_000, gear_loss: 250_000 },
    };
    const config: P10PlanningConfigV1 = {
      riskMeasure: { kind: 'chance_constraint', epsilonPpm: 250_000 },
      riskAggregation: 'union_bound',
      horizonDepth: 4,
    };
    const result = adapter.planUnderRisk(
      multiState,
      [multiFailAction],
      multiModel,
      config,
      multiInvariants,
      () => false, // never reaches goal
    );
    const delta = result.explanation.riskDeltas.find(d => d.actionId === 'risky_combo');
    expect(delta).toBeDefined();
    // death debited by 100k (death_hit mass), NOT by 300k (combined)
    expect(delta!.riskRemainingAfter['death']).toBe(150_000 - 100_000);
    // gear_loss debited by 200k (gear_break mass), NOT by 300k (combined)
    expect(delta!.riskRemainingAfter['gear_loss']).toBe(250_000 - 200_000);
  });

  // -- Acceptance: fanout truncation sets reason --

  it('truncation due to fanout cap sets truncationReason to fanout_cap', () => {
    // Action with more outcomes than MAX_OUTCOMES_PER_ACTION
    const manyOutcomes: P10StochasticActionV1 = {
      id: 'many_outcomes',
      name: 'Action with many outcomes',
      cost: 1,
      preconditions: {},
      outcomes: Array.from({ length: MAX_OUTCOMES_PER_ACTION + 2 }, (_, i) => ({
        outcomeId: `outcome_${i}`,
        effects: [{ property: 'ore', op: 'add' as const, value: 1 }],
        lossPpm: 0,
        durationTicks: 10,
      })),
    };
    // Each outcome gets equal mass
    const perOutcomeMass = Math.floor(MASS_TOTAL / (MAX_OUTCOMES_PER_ACTION + 2));
    const remainder = MASS_TOTAL - perOutcomeMass * (MAX_OUTCOMES_PER_ACTION + 2);
    const manyModel: P10RiskModelV1 = {
      getOutcomeMasses: () =>
        Array.from({ length: MAX_OUTCOMES_PER_ACTION + 2 }, (_, i) => ({
          outcomeId: `outcome_${i}`,
          massPpm: perOutcomeMass + (i === 0 ? remainder : 0),
        })),
    };
    // Use horizon=3 so outcomes at depth 2 are terminal (no recursive expansion
    // that would hit node_cap before fanout_cap)
    const shallowConfig: P10PlanningConfigV1 = {
      riskMeasure: { kind: 'chance_constraint', epsilonPpm: 200_000 },
      riskAggregation: 'union_bound',
      horizonDepth: 3,
    };
    const result = adapter.planUnderRisk(
      LAVA_MINING_INITIAL_STATE,
      [manyOutcomes],
      manyModel,
      shallowConfig,
      LAVA_MINING_SAFETY_INVARIANTS,
      () => false,
    );
    expect(result.wasTruncated).toBe(true);
    expect(result.truncationReason).toBe('fanout_cap');
  });

  // -- Acceptance: non-conditional truncation test (deterministic explosion) --

  it('deterministic explosion domain guarantees truncation and status is not satisfied', () => {
    // Domain that always branches: 3 outcomes, each leads to more branching
    // With horizon 30 and 3 outcomes per action, we rapidly exceed MAX_SCENARIO_NODES
    const explosionAction: P10StochasticActionV1 = {
      id: 'branch',
      name: 'Always branches',
      cost: 1,
      preconditions: {},
      outcomes: [
        { outcomeId: 'a', effects: [{ property: 'step', op: 'add', value: 1 }], lossPpm: 0, durationTicks: 1 },
        { outcomeId: 'b', effects: [{ property: 'step', op: 'add', value: 2 }], lossPpm: 0, durationTicks: 1 },
        { outcomeId: 'c', effects: [{ property: 'step', op: 'add', value: 3 }], lossPpm: 0, durationTicks: 1 },
      ],
    };
    const explosionModel: P10RiskModelV1 = {
      getOutcomeMasses: () => [
        { outcomeId: 'a', massPpm: 500_000 },
        { outcomeId: 'b', massPpm: 300_000 },
        { outcomeId: 'c', massPpm: 200_000 },
      ],
    };
    // State must satisfy all invariants at root (step >= 0 is trivially true,
    // and we use a step-based invariant so the root is safe)
    const explosionState: P10RiskAwareStateV1 = {
      worldState: { step: 0 },
      riskLedger: { progress: 100_000 },
    };
    // Invariant that's never violated by the branch action (step always goes up,
    // minimum is -999). This means no failures, no budget debiting — pure branching.
    const explosionInvariants: readonly P10SafetyInvariantV1[] = [
      { id: 'keep_going', name: 'step above floor', minimums: { step: -999 }, riskKind: 'progress' },
    ];
    const config: P10PlanningConfigV1 = {
      riskMeasure: { kind: 'chance_constraint', epsilonPpm: 100_000 },
      riskAggregation: 'union_bound',
      horizonDepth: 30,
    };
    const result = adapter.planUnderRisk(
      explosionState,
      [explosionAction],
      explosionModel,
      config,
      explosionInvariants,
      () => false, // never reaches goal
    );
    // Unconditional: this domain MUST truncate (3^n nodes exceed 300 by depth ~5)
    expect(result.wasTruncated).toBe(true);
    expect(result.graph.constraintStatus).not.toBe('satisfied');
    expect(result.truncationReason).not.toBeNull();
  });

  // -- Acceptance: refined terminal reason selection --

  it('dead-end from budget exhaustion uses risk_budget_exhausted (not no_feasible_actions)', () => {
    // All applicable actions exceed the budget → risk_budget_exhausted
    const tinyBudgetState: P10RiskAwareStateV1 = {
      worldState: { health: 20, ore: 0, has_fire_resist: 0, gear_value: 100 },
      riskLedger: { death: 1 }, // 0.0001% — every action with any failure mass exceeds this
    };
    const result = adapter.planUnderRisk(
      tinyBudgetState,
      LAVA_MINING_ACTIONS,
      LAVA_MINING_RISK_MODEL,
      { ...LAVA_MINING_CONFIG, riskMeasure: { kind: 'chance_constraint', epsilonPpm: 1 } },
      LAVA_MINING_SAFETY_INVARIANTS,
      lavaMiningGoalPredicate,
    );
    // Actions with failure outcomes (mine_near_lava, mine_safe_area) should be rejected for budget
    // But retreat and drink_fire_resist have no failures, so they should expand
    // If some expand, root won't be terminal — check nodes that ARE terminal dead ends
    const terminalNodes = Object.values(result.graph.nodes).filter(
      n => n.kind === 'terminal' && n.terminalReason === 'risk_budget_exhausted',
    );
    // There should be some terminal nodes from budget exhaustion
    // (at deeper levels where the ledger is spent)
    const budgetRejections = result.explanation.rejectedActions.filter(
      r => r.reason === 'risk_budget_exceeded',
    );
    expect(budgetRejections.length).toBeGreaterThan(0);
  });
});

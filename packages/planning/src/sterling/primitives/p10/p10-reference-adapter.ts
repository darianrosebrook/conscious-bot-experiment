/**
 * P10 Reference Adapter — "Dumb but Certifiable" Risk-Aware Planner
 *
 * Satisfies all 5 P10 invariants:
 *   1. outcome_mass_conservation      — masses sum to MASS_TOTAL for every action+state
 *   2. chance_constraint_satisfaction  — P(failure) < epsilon verified at every node
 *   3. risk_budget_monotonicity        — risk ledger only decreases along paths
 *   4. deterministic_scenario_evaluation — same inputs produce identical graph
 *   5. bounded_scenario_graph          — node cap, depth cap, fanout cap enforced
 *
 * Algorithm: BFS over (worldState, riskLedger) tuples.
 *   - Decision nodes: try each applicable action (sorted by cost, then ID)
 *   - Chance nodes: enumerate outcomes from risk model
 *   - Terminal nodes: goal, budget exhausted, unsafe, horizon, node cap
 *
 * Risk aggregation:
 *   - union_bound:         ledger -= failureMass
 *   - independent_product: ledger = ledger * (MASS_TOTAL - failureMass) / MASS_TOTAL
 *
 * Learning: frequency counting + Laplace smoothing + largest-remainder apportionment.
 *
 * Zero Minecraft imports. Zero vitest imports.
 */

import type {
  P10ActionExpansionV1,
  P10BudgetMismatchWarning,
  P10BudgetSource,
  P10EffectV1,
  P10ExplanationBundleV1,
  P10ExecutionReportV1,
  P10MassValidationResultV1,
  P10PlanningConfigV1,
  P10PlanningResultV1,
  P10RejectedActionV1,
  P10RiskAggregation,
  P10RiskAwareAdapter,
  P10RiskAwareStateV1,
  P10RiskDeltaV1,
  P10RiskMeasureV1,
  P10RiskModelV1,
  P10SafetyInvariantV1,
  P10ScenarioEdgeV1,
  P10ScenarioGraphV1,
  P10ScenarioNodeV1,
  P10StochasticActionV1,
  P10ConstraintStatus,
  P10TerminalReason,
  P10TruncationReason,
  ProbMass,
} from './p10-capsule-types.js';
import {
  MASS_TOTAL,
  MAX_OUTCOMES_PER_ACTION,
  MAX_SCENARIO_DEPTH,
  MAX_SCENARIO_NODES,
} from './p10-capsule-types.js';

/**
 * Deterministic JSON serializer with sorted keys.
 * Guards against JS object insertion-order traps in nested records.
 * Use for test determinism assertions and content-addressed hashing.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

export class P10ReferenceAdapter implements P10RiskAwareAdapter {
  readonly maxScenarioNodes = MAX_SCENARIO_NODES;
  readonly maxScenarioDepth = MAX_SCENARIO_DEPTH;
  readonly maxOutcomesPerAction = MAX_OUTCOMES_PER_ACTION;

  // -- Mass Validation -------------------------------------------------------

  validateMassConservation(
    actions: readonly P10StochasticActionV1[],
    model: P10RiskModelV1,
    sampleState: P10RiskAwareStateV1,
  ): P10MassValidationResultV1 {
    const errors: { actionId: string; totalMass: number; expectedMass: number }[] = [];
    for (const action of actions) {
      const masses = model.getOutcomeMasses(sampleState, action.id);
      const total = masses.reduce((sum, m) => sum + m.massPpm, 0);
      if (total !== MASS_TOTAL) {
        errors.push({ actionId: action.id, totalMass: total, expectedMass: MASS_TOTAL });
      }
    }
    return { valid: errors.length === 0, errors };
  }

  // -- Effect Application ----------------------------------------------------

  applyEffects(
    state: P10RiskAwareStateV1,
    effects: readonly P10EffectV1[],
  ): P10RiskAwareStateV1 {
    const ws: Record<string, number> = { ...state.worldState };
    for (const eff of effects) {
      const cur = ws[eff.property] ?? 0;
      switch (eff.op) {
        case 'add': ws[eff.property] = cur + eff.value; break;
        case 'set': ws[eff.property] = eff.value; break;
        case 'min': ws[eff.property] = Math.min(cur, eff.value); break;
        case 'max': ws[eff.property] = Math.max(cur, eff.value); break;
      }
    }
    return { worldState: ws, riskLedger: { ...state.riskLedger } };
  }

  // -- Safety Checking -------------------------------------------------------

  checkSafety(
    state: P10RiskAwareStateV1,
    invariants: readonly P10SafetyInvariantV1[],
  ): readonly string[] {
    const violated: string[] = [];
    for (const inv of invariants) {
      for (const [prop, minimum] of Object.entries(inv.minimums)) {
        if ((state.worldState[prop] ?? 0) < minimum) {
          violated.push(inv.id);
          break;
        }
      }
    }
    violated.sort();
    return violated;
  }

  // -- Action Expansion ------------------------------------------------------

  expandAction(
    state: P10RiskAwareStateV1,
    action: P10StochasticActionV1,
    model: P10RiskModelV1,
    safetyInvariants: readonly P10SafetyInvariantV1[],
  ): P10ActionExpansionV1 | null {
    // Check preconditions
    for (const [prop, minVal] of Object.entries(action.preconditions)) {
      if ((state.worldState[prop] ?? 0) < minVal) {
        return null;
      }
    }

    const masses = model.getOutcomeMasses(state, action.id);

    // Fail-closed: enforce mass conservation at this (state, action) pair
    const massTotal = masses.reduce((sum, m) => sum + m.massPpm, 0);
    if (massTotal !== MASS_TOTAL) {
      return null;
    }

    const outcomeMap = new Map(action.outcomes.map(o => [o.outcomeId, o]));

    // Sort by outcomeId for determinism
    const sortedMasses = [...masses].sort((a, b) => a.outcomeId.localeCompare(b.outcomeId));

    const expanded: P10ActionExpansionV1['outcomes'][number][] = [];
    for (const mass of sortedMasses) {
      const outcome = outcomeMap.get(mass.outcomeId);
      if (!outcome) continue;

      const resultState = this.applyEffects(state, outcome.effects);
      const violations = this.checkSafety(resultState, safetyInvariants);
      expanded.push({
        outcomeId: mass.outcomeId,
        massPpm: mass.massPpm,
        resultState,
        isFailure: violations.length > 0,
        lossPpm: outcome.lossPpm,
      });
    }

    return {
      chanceNodeState: state,
      outcomes: expanded,
    };
  }

  // -- Path Failure Probability ----------------------------------------------

  computePathFailureProbability(
    path: readonly P10ScenarioEdgeV1[],
    aggregation: P10RiskAggregation,
  ): ProbMass {
    const outcomeEdges = path.filter(e => e.edgeKind === 'outcome' && e.isFailure === true);

    if (aggregation === 'union_bound') {
      let total = 0;
      for (const e of outcomeEdges) {
        total += e.massPpm ?? 0;
      }
      return Math.min(total, MASS_TOTAL);
    }

    // independent_product: P(at least one failure) = 1 - product(1 - p_i)
    let survivalPpm = MASS_TOTAL;
    for (const e of outcomeEdges) {
      const failMass = e.massPpm ?? 0;
      survivalPpm = Math.floor(survivalPpm * (MASS_TOTAL - failMass) / MASS_TOTAL);
    }
    return MASS_TOTAL - survivalPpm;
  }

  // -- Risk Model Learning ---------------------------------------------------

  updateRiskModel(
    model: P10RiskModelV1,
    report: P10ExecutionReportV1,
  ): P10RiskModelV1 {
    // Capture original masses for the reported action
    const originalMasses = model.getOutcomeMasses(report.stateContext, report.actionId);
    const outcomeIds = originalMasses.map(m => m.outcomeId).sort();
    const totalObservations = report.executionCount;

    // Frequency count with Laplace smoothing (add-1)
    const rawCounts: Record<string, number> = {};
    for (const oid of outcomeIds) {
      rawCounts[oid] = 1; // Laplace prior
    }
    rawCounts[report.observedOutcomeId] = (rawCounts[report.observedOutcomeId] ?? 1) + totalObservations;

    const totalCounts = Object.values(rawCounts).reduce((a, b) => a + b, 0);

    // Largest-remainder apportionment for integer mass conservation
    const newMasses = this.largestRemainderApportion(outcomeIds, rawCounts, totalCounts);

    // Build updated model: override only the reported action
    const reportedActionId = report.actionId;
    return {
      getOutcomeMasses: (state: P10RiskAwareStateV1, actionId: string) => {
        if (actionId === reportedActionId) {
          return outcomeIds.map(oid => ({
            outcomeId: oid,
            massPpm: newMasses[oid],
          }));
        }
        return model.getOutcomeMasses(state, actionId);
      },
    };
  }

  // -- Planning --------------------------------------------------------------

  planUnderRisk(
    initialState: P10RiskAwareStateV1,
    actions: readonly P10StochasticActionV1[],
    model: P10RiskModelV1,
    config: P10PlanningConfigV1,
    safetyInvariants: readonly P10SafetyInvariantV1[],
    goalPredicate: (state: P10RiskAwareStateV1) => boolean,
    now?: () => number,
  ): P10PlanningResultV1 {
    const startTime = now ? now() : 0;

    // Initialize risk ledger from config epsilon and track provenance
    const initState = this.initializeRiskLedger(initialState, config, safetyInvariants);
    const budgetSource: P10BudgetSource =
      Object.keys(initialState.riskLedger).length > 0 ? 'state' : 'config_default';
    const effectiveBudget = { ...initState.riskLedger };

    // Detect budget mismatches: state ledger vs config epsilon
    const budgetMismatchWarnings: P10BudgetMismatchWarning[] = [];
    if (
      budgetSource === 'state' &&
      config.riskMeasure.kind === 'chance_constraint'
    ) {
      for (const [riskKind, ledgerValue] of Object.entries(initialState.riskLedger)) {
        if (ledgerValue !== config.riskMeasure.epsilonPpm) {
          budgetMismatchWarnings.push({
            riskKind,
            ledgerValue,
            configEpsilonPpm: config.riskMeasure.epsilonPpm,
          });
        }
      }
    }

    const nodes: Record<string, P10ScenarioNodeV1> = {};
    const edges: P10ScenarioEdgeV1[] = [];
    const rejectedActions: P10RejectedActionV1[] = [];
    const riskDeltas: P10RiskDeltaV1[] = [];
    let nodeCounter = 0;
    let statesExpanded = 0;
    let maxDepthSeen = 0;
    let maxChanceFanout = 0;
    let wasTruncated = false;
    let truncationReason: P10TruncationReason = null;

    // Create root decision node
    const rootId = `n${nodeCounter++}`;
    const rootViolations = this.checkSafety(initState, safetyInvariants);
    const rootGoal = goalPredicate(initState);
    nodes[rootId] = {
      nodeId: rootId,
      kind: rootGoal ? 'terminal' : 'decision',
      state: initState,
      depth: 0,
      prescribedActionId: null,
      isGoalReached: rootGoal,
      isSafe: rootViolations.length === 0,
      terminalReason: rootGoal ? 'goal_reached' : undefined,
    };

    // BFS queue: [nodeId]
    const queue: string[] = [];
    if (!rootGoal && rootViolations.length === 0) {
      queue.push(rootId);
    }

    while (queue.length > 0 && nodeCounter < MAX_SCENARIO_NODES) {
      const currentId = queue.shift()!;
      const currentNode = nodes[currentId];

      if (currentNode.kind !== 'decision') continue;
      statesExpanded++;

      const currentState = currentNode.state;
      const currentDepth = currentNode.depth;
      maxDepthSeen = Math.max(maxDepthSeen, currentDepth);

      // Sort actions by cost then ID for determinism
      const sortedActions = [...actions].sort((a, b) =>
        a.cost !== b.cost ? a.cost - b.cost : a.id.localeCompare(b.id),
      );

      let bestActionId: string | null = null;
      let bestActionCost = Infinity;
      let anyActionExpanded = false;

      for (const action of sortedActions) {
        if (nodeCounter >= MAX_SCENARIO_NODES) {
          wasTruncated = true;
          truncationReason = 'node_cap';
          break;
        }

        // Check preconditions
        let preconditionMet = true;
        for (const [prop, minVal] of Object.entries(action.preconditions)) {
          if ((currentState.worldState[prop] ?? 0) < minVal) {
            preconditionMet = false;
            break;
          }
        }
        if (!preconditionMet) {
          rejectedActions.push({
            nodeId: currentId,
            actionId: action.id,
            reason: 'precondition_failed',
          });
          continue;
        }

        // Get outcome masses for this action at this state
        const masses = model.getOutcomeMasses(currentState, action.id);

        // Enforce mass conservation at expansion time (fail-closed)
        const massTotal = masses.reduce((sum, m) => sum + m.massPpm, 0);
        if (massTotal !== MASS_TOTAL) {
          rejectedActions.push({
            nodeId: currentId,
            actionId: action.id,
            reason: 'mass_not_conserved',
          });
          continue;
        }

        const outcomeMap = new Map(action.outcomes.map(o => [o.outcomeId, o]));
        const sortedMasses = [...masses].sort((a, b) => a.outcomeId.localeCompare(b.outcomeId));

        // Compute per-riskKind failure mass for this action
        const failureMassByRiskKind: Record<string, number> = {};
        const outcomeResults: {
          outcomeId: string;
          massPpm: ProbMass;
          resultState: P10RiskAwareStateV1;
          isFailure: boolean;
          lossPpm: ProbMass;
        }[] = [];

        for (const mass of sortedMasses) {
          const outcome = outcomeMap.get(mass.outcomeId);
          if (!outcome) continue;

          const resultState = this.applyEffects(currentState, outcome.effects);
          const violations = this.checkSafety(resultState, safetyInvariants);
          const isFailure = violations.length > 0;
          if (isFailure) {
            // Map violated invariant IDs to their riskKinds and accumulate per-kind
            const outcomeRiskKinds = new Set<string>();
            for (const violatedId of violations) {
              const inv = safetyInvariants.find(i => i.id === violatedId);
              if (inv) {
                outcomeRiskKinds.add(inv.riskKind);
              }
            }
            // Each affected riskKind is debited by THIS outcome's mass only
            for (const rk of outcomeRiskKinds) {
              failureMassByRiskKind[rk] = (failureMassByRiskKind[rk] ?? 0) + mass.massPpm;
            }
          }
          outcomeResults.push({
            outcomeId: mass.outcomeId,
            massPpm: mass.massPpm,
            resultState,
            isFailure,
            lossPpm: outcome.lossPpm,
          });
        }

        // Check if action exceeds risk budget (per-riskKind debiting)
        const riskBefore = { ...currentState.riskLedger };
        const riskAfter = this.computeRiskAfterPerKind(riskBefore, failureMassByRiskKind, config.riskAggregation);
        const budgetExceeded = Object.values(riskAfter).some(v => v < 0);

        if (budgetExceeded) {
          rejectedActions.push({
            nodeId: currentId,
            actionId: action.id,
            reason: 'risk_budget_exceeded',
          });
          continue;
        }

        // Record risk delta (total failure mass across all riskKinds)
        const totalFailureMass = Object.values(failureMassByRiskKind).reduce((a, b) => a + b, 0);
        riskDeltas.push({
          nodeId: currentId,
          actionId: action.id,
          failureMassPpm: totalFailureMass,
          riskRemainingBefore: riskBefore,
          riskRemainingAfter: riskAfter,
        });

        // Create chance node
        const chanceId = `n${nodeCounter++}`;
        nodes[chanceId] = {
          nodeId: chanceId,
          kind: 'chance',
          state: currentState,
          depth: currentDepth + 1,
          prescribedActionId: null,
          isGoalReached: false,
          isSafe: true,
        };
        maxDepthSeen = Math.max(maxDepthSeen, currentDepth + 1);

        edges.push({
          fromNodeId: currentId,
          toNodeId: chanceId,
          edgeKind: 'chosen',
          actionId: action.id,
        });

        // Create outcome nodes
        let fanout = 0;
        for (const outcomeResult of outcomeResults) {
          if (nodeCounter >= MAX_SCENARIO_NODES || fanout >= MAX_OUTCOMES_PER_ACTION) {
            wasTruncated = true;
            if (nodeCounter >= MAX_SCENARIO_NODES) {
              truncationReason = 'node_cap';
            } else if (!truncationReason) {
              truncationReason = 'fanout_cap';
            }
            break;
          }

          // Apply risk ledger update for failure outcomes
          const outcomeRiskLedger = outcomeResult.isFailure
            ? riskAfter
            : { ...currentState.riskLedger };

          const outcomeState: P10RiskAwareStateV1 = {
            worldState: outcomeResult.resultState.worldState,
            riskLedger: outcomeRiskLedger,
          };

          const outcomeDepth = currentDepth + 2;
          const outcomeGoal = goalPredicate(outcomeState);
          const outcomeSafe = !outcomeResult.isFailure;
          maxDepthSeen = Math.max(maxDepthSeen, outcomeDepth);

          let terminalReason: P10TerminalReason | undefined;
          let nodeKind: P10ScenarioNodeV1['kind'] = 'decision';

          if (outcomeGoal) {
            nodeKind = 'terminal';
            terminalReason = 'goal_reached';
          } else if (!outcomeSafe) {
            nodeKind = 'terminal';
            terminalReason = 'safety_violated';
          } else if (outcomeDepth >= config.horizonDepth) {
            nodeKind = 'terminal';
            terminalReason = 'horizon_reached';
            wasTruncated = true;
            if (!truncationReason) truncationReason = 'depth_cap';
          } else if (Object.values(outcomeRiskLedger).some(v => v <= 0)) {
            nodeKind = 'terminal';
            terminalReason = 'risk_budget_exhausted';
          }

          const outcomeNodeId = `n${nodeCounter++}`;
          nodes[outcomeNodeId] = {
            nodeId: outcomeNodeId,
            kind: nodeKind,
            state: outcomeState,
            depth: outcomeDepth,
            prescribedActionId: null,
            isGoalReached: outcomeGoal,
            isSafe: outcomeSafe,
            terminalReason,
          };

          edges.push({
            fromNodeId: chanceId,
            toNodeId: outcomeNodeId,
            edgeKind: 'outcome',
            outcomeId: outcomeResult.outcomeId,
            massPpm: outcomeResult.massPpm,
            lossPpm: outcomeResult.lossPpm,
            isFailure: outcomeResult.isFailure,
          });

          fanout++;

          if (nodeKind === 'decision') {
            queue.push(outcomeNodeId);
          }
        }

        maxChanceFanout = Math.max(maxChanceFanout, fanout);
        anyActionExpanded = true;

        if (action.cost < bestActionCost) {
          bestActionCost = action.cost;
          bestActionId = action.id;
        }
      }

      // Prescribe best action at this decision node
      if (anyActionExpanded) {
        nodes[currentId] = { ...currentNode, prescribedActionId: bestActionId };
      } else {
        // No actions expanded — terminal (dead end)
        // Determine the most specific terminal reason:
        //   - If ALL applicable actions were rejected for budget, it's budget exhaustion
        //   - Otherwise it's a general dead end (precondition failures, mass issues, etc.)
        const nodeRejections = rejectedActions.filter(r => r.nodeId === currentId);
        const applicableRejections = nodeRejections.filter(r => r.reason !== 'precondition_failed');
        const allBudgetExhausted =
          applicableRejections.length > 0 &&
          applicableRejections.every(r => r.reason === 'risk_budget_exceeded');

        nodes[currentId] = {
          ...currentNode,
          kind: 'terminal',
          terminalReason: allBudgetExhausted ? 'risk_budget_exhausted' : 'no_feasible_actions',
        };
      }
    }

    // Mark remaining queued nodes as terminal (node cap reached)
    if (queue.length > 0) {
      wasTruncated = true;
      truncationReason = 'node_cap';
      for (const queuedId of queue) {
        if (nodes[queuedId] && nodes[queuedId].kind === 'decision') {
          nodes[queuedId] = {
            ...nodes[queuedId],
            kind: 'terminal',
            terminalReason: 'node_cap_reached',
          };
        }
      }
    }

    // Compute metrics
    const totalNodes = Object.keys(nodes).length;
    const goalReachable = Object.values(nodes).some(n => n.isGoalReached);
    const graphWideCumulativeFailurePpm = this.computeWorstCaseFailure(nodes, edges, config.riskAggregation, false);
    const policyFailureUpperBoundPpm = this.computeWorstCaseFailure(nodes, edges, config.riskAggregation, true);
    const constraintStatus = this.computeConstraintStatus(nodes, edges, config, wasTruncated, policyFailureUpperBoundPpm);
    const expectedCost = this.computeExpectedCost(nodes, edges, actions);
    const cvarCost = config.riskMeasure.kind === 'cvar'
      ? this.computeCVaR(nodes, edges, config.riskMeasure.alphaPpm)
      : undefined;

    const violatedConstraints: string[] = [];
    if (constraintStatus === 'violated') {
      violatedConstraints.push('chance_constraint');
    }
    const unsafeNodes = Object.values(nodes).filter(n => !n.isSafe);
    if (unsafeNodes.length > 0) {
      violatedConstraints.push('safety');
    }

    const graph: P10ScenarioGraphV1 = {
      rootNodeId: rootId,
      nodes,
      edges,
      totalNodes,
      maxDepth: maxDepthSeen,
      maxChanceFanout,
      constraintStatus,
      goalReachable,
    };

    const explanation: P10ExplanationBundleV1 = {
      declaredObjective: config.riskMeasure,
      declaredAggregation: config.riskAggregation,
      rejectedActions,
      riskDeltas,
    };

    return {
      graph,
      config,
      graphWideCumulativeFailurePpm,
      policyFailureUpperBoundPpm,
      expectedCost,
      cvarCost,
      safetyVerified: unsafeNodes.length === 0,
      violatedConstraints,
      statesExpanded,
      durationMs: now ? now() - startTime : 0,
      explanation,
      wasTruncated,
      truncationReason,
      budgetSource,
      effectiveBudget,
      budgetMismatchWarnings,
    };
  }

  // -- Private Helpers -------------------------------------------------------

  private initializeRiskLedger(
    state: P10RiskAwareStateV1,
    config: P10PlanningConfigV1,
    safetyInvariants: readonly P10SafetyInvariantV1[],
  ): P10RiskAwareStateV1 {
    // If risk ledger already has entries, use them as-is
    if (Object.keys(state.riskLedger).length > 0) {
      return state;
    }
    // Otherwise initialize from epsilon, keyed by the actual riskKinds
    // derived from safety invariants so riskKind-targeted debiting works
    if (config.riskMeasure.kind === 'chance_constraint') {
      const riskKinds = new Set(safetyInvariants.map(inv => inv.riskKind));
      if (riskKinds.size === 0) {
        // No safety invariants — no risk to budget
        return state;
      }
      const ledger: Record<string, number> = {};
      for (const kind of [...riskKinds].sort()) {
        ledger[kind] = config.riskMeasure.epsilonPpm;
      }
      return {
        worldState: state.worldState,
        riskLedger: ledger,
      };
    }
    return state;
  }

  /**
   * Compute risk ledger after an action's failure outcomes.
   *
   * Each riskKind is debited only by the failure mass of outcomes that
   * violate invariants mapping to that riskKind. This prevents cross-coupling
   * where a death-outcome's mass inflates the gear_loss debit.
   */
  private computeRiskAfterPerKind(
    riskBefore: Record<string, number>,
    failureMassByRiskKind: Readonly<Record<string, number>>,
    aggregation: P10RiskAggregation,
  ): Record<string, number> {
    const after: Record<string, number> = {};
    for (const [kind, remaining] of Object.entries(riskBefore)) {
      const kindFailureMass = failureMassByRiskKind[kind] ?? 0;
      if (kindFailureMass > 0) {
        if (aggregation === 'union_bound') {
          after[kind] = remaining - kindFailureMass;
        } else {
          // independent_product
          after[kind] = Math.floor(remaining * (MASS_TOTAL - kindFailureMass) / MASS_TOTAL);
        }
      } else {
        after[kind] = remaining;
      }
    }
    return after;
  }

  private computeConstraintStatus(
    nodes: Record<string, P10ScenarioNodeV1>,
    _edges: readonly P10ScenarioEdgeV1[],
    config: P10PlanningConfigV1,
    wasTruncated: boolean,
    policyFailureBound: ProbMass,
  ): P10ConstraintStatus {
    // If any node is unsafe (failure derived from safety invariants)
    const hasViolation = Object.values(nodes).some(
      n => !n.isSafe && n.kind === 'terminal' && n.terminalReason === 'safety_violated',
    );

    if (config.riskMeasure.kind === 'chance_constraint') {
      // Check if policy failure bound exceeds epsilon
      if (policyFailureBound > config.riskMeasure.epsilonPpm) {
        return 'violated';
      }
    }

    // If exploration was truncated, we can't prove satisfaction
    if (wasTruncated) {
      return 'unknown';
    }

    if (hasViolation) {
      return 'violated';
    }

    return 'satisfied';
  }

  /**
   * Compute worst-case cumulative failure probability.
   *
   * @param policyOnly - If true, only follow prescribed actions at decision
   *   nodes (the "policy failure upper bound"). If false, follow ALL expanded
   *   actions (the "graph-wide cumulative failure").
   */
  private computeWorstCaseFailure(
    nodes: Record<string, P10ScenarioNodeV1>,
    edges: readonly P10ScenarioEdgeV1[],
    aggregation: P10RiskAggregation,
    policyOnly: boolean,
  ): ProbMass {
    const rootId = Object.values(nodes).find(n => n.depth === 0)?.nodeId;
    if (!rootId) return 0;

    // Build child-edge lookup
    const childEdges = new Map<string, P10ScenarioEdgeV1[]>();
    for (const edge of edges) {
      if (!childEdges.has(edge.fromNodeId)) childEdges.set(edge.fromNodeId, []);
      childEdges.get(edge.fromNodeId)!.push(edge);
    }

    let worstCase = 0;

    // DFS to find all paths (or policy paths only)
    const stack: { nodeId: string; pathEdges: P10ScenarioEdgeV1[] }[] = [
      { nodeId: rootId, pathEdges: [] },
    ];

    while (stack.length > 0) {
      const { nodeId, pathEdges } = stack.pop()!;
      let children = childEdges.get(nodeId) ?? [];

      // If policyOnly, at decision nodes only follow edges for the prescribed action
      if (policyOnly && children.length > 0) {
        const node = nodes[nodeId];
        if (node && node.kind === 'decision' && node.prescribedActionId) {
          children = children.filter(
            e => e.edgeKind === 'chosen' && e.actionId === node.prescribedActionId,
          );
        }
      }

      if (children.length === 0) {
        // Terminal — compute path failure
        const pathFailure = this.computePathFailureProbability(pathEdges, aggregation);
        worstCase = Math.max(worstCase, pathFailure);
      } else {
        for (const edge of children) {
          stack.push({
            nodeId: edge.toNodeId,
            pathEdges: [...pathEdges, edge],
          });
        }
      }
    }

    return worstCase;
  }

  private computeExpectedCost(
    nodes: Record<string, P10ScenarioNodeV1>,
    edges: readonly P10ScenarioEdgeV1[],
    actions: readonly P10StochasticActionV1[],
  ): number {
    // Simple: sum of action costs weighted by path probability
    const actionCostMap = new Map(actions.map(a => [a.id, a.cost]));
    let totalCost = 0;
    for (const edge of edges) {
      if (edge.edgeKind === 'chosen' && edge.actionId) {
        totalCost += actionCostMap.get(edge.actionId) ?? 0;
      }
    }
    return totalCost;
  }

  private computeCVaR(
    nodes: Record<string, P10ScenarioNodeV1>,
    edges: readonly P10ScenarioEdgeV1[],
    alphaPpm: ProbMass,
  ): number {
    // Collect all terminal outcome edges with their losses and masses
    const terminalLosses: { lossPpm: number; massPpm: number }[] = [];
    for (const edge of edges) {
      if (edge.edgeKind === 'outcome' && edge.lossPpm !== undefined && edge.massPpm !== undefined) {
        const toNode = nodes[edge.toNodeId];
        if (toNode && (toNode.kind === 'terminal' || edge.lossPpm > 0)) {
          terminalLosses.push({ lossPpm: edge.lossPpm, massPpm: edge.massPpm });
        }
      }
    }

    if (terminalLosses.length === 0) return 0;

    // Sort by loss descending
    terminalLosses.sort((a, b) => b.lossPpm - a.lossPpm);

    // CVaR: weighted average of losses in the worst alpha% tail
    const tailBudget = alphaPpm;
    let massAccum = 0;
    let weightedLoss = 0;

    for (const entry of terminalLosses) {
      const take = Math.min(entry.massPpm, tailBudget - massAccum);
      if (take <= 0) break;
      weightedLoss += take * entry.lossPpm;
      massAccum += take;
    }

    return massAccum > 0 ? weightedLoss / massAccum : 0;
  }

  private largestRemainderApportion(
    outcomeIds: readonly string[],
    counts: Record<string, number>,
    totalCounts: number,
  ): Record<string, number> {
    // Compute exact quotas
    const quotas = outcomeIds.map(oid => ({
      id: oid,
      quota: (counts[oid] / totalCounts) * MASS_TOTAL,
    }));

    // Floor each quota
    const floored = quotas.map(q => ({
      id: q.id,
      floor: Math.floor(q.quota),
      remainder: q.quota - Math.floor(q.quota),
    }));

    // Distribute remaining seats
    let totalFloored = floored.reduce((s, f) => s + f.floor, 0);
    const remaining = MASS_TOTAL - totalFloored;

    // Sort by remainder descending, tie-break by outcomeId lexicographically
    const sorted = [...floored].sort((a, b) =>
      a.remainder !== b.remainder
        ? b.remainder - a.remainder
        : a.id.localeCompare(b.id),
    );

    const result: Record<string, number> = {};
    for (const f of floored) {
      result[f.id] = f.floor;
    }
    for (let i = 0; i < remaining; i++) {
      result[sorted[i].id]++;
    }

    return result;
  }
}

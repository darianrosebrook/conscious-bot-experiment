/**
 * P10 Primitive Capsule — Domain-Agnostic Types
 *
 * Defines the contract for risk-aware planning with stochastic outcomes:
 * actions have probabilistic results, cost is distributional (not just
 * expected value), and the planner must satisfy chance constraints
 * (P(failure) < epsilon) while respecting a finite risk budget.
 *
 * Zero Minecraft imports. Zero vitest imports.
 *
 * Three structurally distinct node kinds (discriminated by `kind`):
 *   - decision: canonical state where the planner chooses an action
 *   - chance:   enumerates stochastic outcomes (masses sum to MASS_TOTAL)
 *   - terminal: leaf node (goal, budget exhausted, unsafe, horizon, cap)
 *
 * Core invariants encoded in this capsule:
 *   1. Outcome masses sum to MASS_TOTAL for each action at every state
 *   2. Chance constraints are verified at every reachable decision node
 *   3. Risk budget is monotonically non-increasing along any path
 *   4. Same inputs produce identical scenario graph (deterministic evaluation)
 *   5. Scenario graph respects node, depth, and fanout bounds
 */

// -- Contract Version --------------------------------------------------------

export type P10ContractVersion = 'p10.v1';

export const P10_CONTRACT_VERSION: P10ContractVersion = 'p10.v1';

// -- Probability Mass (integer arithmetic) -----------------------------------

/** Parts-per-million — exact integer arithmetic, no floating-point drift. */
export const MASS_TOTAL = 1_000_000;

/** Integer in [0, MASS_TOTAL]. Branded by convention. */
export type ProbMass = number;

// -- Plan Bounds -------------------------------------------------------------

export const MAX_SCENARIO_NODES = 300;
export const MAX_SCENARIO_DEPTH = 50;
export const MAX_OUTCOMES_PER_ACTION = 5;
export const MAX_ACTIONS = 10;

// -- Declarative Effects -----------------------------------------------------

/**
 * Effect operations for state mutation.
 *   add: property += value  (common case: ore gained, health lost)
 *   set: property  = value  (toggles: has_fire_resist = 1)
 *   min: property  = min(property, value)  (clamping downward)
 *   max: property  = max(property, value)  (clamping upward)
 */
export type P10EffectOp = 'add' | 'set' | 'min' | 'max';

export interface P10EffectV1 {
  readonly property: string;
  readonly op: P10EffectOp;
  readonly value: number;
}

// -- Risk-Aware State --------------------------------------------------------

/**
 * State with multi-dimensional risk ledger.
 *
 * worldState: domain properties (health, ore, uptime_pct, etc.)
 * riskLedger: riskKind -> remaining PPM budget (death: 100000 means 10% left)
 *
 * Risk ledger is a vector, not a scalar. This supports multiple failure
 * categories (death, gear_loss, detection) without breaking the contract.
 */
export interface P10RiskAwareStateV1 {
  readonly worldState: Readonly<Record<string, number>>;
  readonly riskLedger: Readonly<Record<string, number>>;
}

// -- Stochastic Actions and Outcomes -----------------------------------------

/**
 * A stochastic action with a finite set of possible outcomes.
 * Probability masses are NOT on the action — they come from the risk model,
 * which can condition on state.
 */
export interface P10StochasticActionV1 {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly preconditions: Readonly<Record<string, number>>;
  readonly outcomes: readonly P10OutcomeV1[];
}

/**
 * One possible outcome of a stochastic action.
 * lossPpm makes cost distributional: each outcome contributes a different
 * loss, so the terminal cost distribution is a proper random variable.
 */
export interface P10OutcomeV1 {
  readonly outcomeId: string;
  readonly effects: readonly P10EffectV1[];
  readonly lossPpm: ProbMass;
  readonly durationTicks: number;
}

// -- State-Conditioned Risk Model --------------------------------------------

/**
 * Pure function: given state + actionId -> masses for each outcome.
 * Deterministic. Fixtures ship trivial unconditional implementations.
 */
export interface P10RiskModelV1 {
  readonly getOutcomeMasses: (
    state: P10RiskAwareStateV1,
    actionId: string,
  ) => readonly P10OutcomeMassV1[];
}

export interface P10OutcomeMassV1 {
  readonly outcomeId: string;
  readonly massPpm: ProbMass;
}

// -- Safety Invariants -------------------------------------------------------

/**
 * Safety invariant — same shape as P09, plus riskKind for ledger targeting.
 * Invariant violated if ANY worldState property drops below its minimum.
 *
 * riskKind maps this invariant to a specific risk ledger entry.
 * When a failure derived from this invariant occurs, the adapter debits
 * riskLedger[riskKind]. This makes the vector ledger functional rather
 * than decorative.
 */
export interface P10SafetyInvariantV1 {
  readonly id: string;
  readonly name: string;
  readonly minimums: Readonly<Record<string, number>>;
  readonly riskKind: string;
}

// -- Risk Aggregation --------------------------------------------------------

/**
 * How failure probabilities combine along a path.
 * Frozen in config and hashed for determinism.
 *
 * union_bound:         riskRemaining -= failureMass
 * independent_product: riskRemaining = riskRemaining * (MASS_TOTAL - failureMass) / MASS_TOTAL
 */
export type P10RiskAggregation = 'union_bound' | 'independent_product';

// -- Risk Measure (discriminated union) --------------------------------------

export type P10RiskMeasureV1 =
  | { readonly kind: 'chance_constraint'; readonly epsilonPpm: ProbMass }
  | { readonly kind: 'cvar'; readonly alphaPpm: ProbMass }
  | { readonly kind: 'expected_value' };

// -- Planning Config ---------------------------------------------------------

export interface P10PlanningConfigV1 {
  readonly riskMeasure: P10RiskMeasureV1;
  readonly riskAggregation: P10RiskAggregation;
  readonly horizonDepth: number;
}

// -- Scenario Graph Types ----------------------------------------------------

export type P10NodeKind = 'decision' | 'chance' | 'terminal';

export type P10TerminalReason =
  | 'goal_reached'
  | 'risk_budget_exhausted'
  | 'safety_violated'
  | 'horizon_reached'
  | 'node_cap_reached'
  | 'no_feasible_actions';

export interface P10ScenarioNodeV1 {
  readonly nodeId: string;
  readonly kind: P10NodeKind;
  readonly state: P10RiskAwareStateV1;
  readonly depth: number;
  readonly prescribedActionId: string | null;
  readonly isGoalReached: boolean;
  readonly isSafe: boolean;
  readonly terminalReason?: P10TerminalReason;
}

export interface P10ScenarioEdgeV1 {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly edgeKind: 'chosen' | 'outcome';
  readonly actionId?: string;
  readonly outcomeId?: string;
  readonly massPpm?: ProbMass;
  readonly lossPpm?: ProbMass;
  readonly isFailure?: boolean;
}

// -- Tri-State Constraint Satisfaction ---------------------------------------

export type P10ConstraintStatus = 'satisfied' | 'violated' | 'unknown';

export interface P10ScenarioGraphV1 {
  readonly rootNodeId: string;
  readonly nodes: Readonly<Record<string, P10ScenarioNodeV1>>;
  readonly edges: readonly P10ScenarioEdgeV1[];
  readonly totalNodes: number;
  readonly maxDepth: number;
  readonly maxChanceFanout: number;
  readonly constraintStatus: P10ConstraintStatus;
  readonly goalReachable: boolean;
}

// -- Budget Provenance --------------------------------------------------------

/**
 * Where the effective risk budget came from.
 *   'state':          riskLedger was non-empty in the initial state (used as-is)
 *   'config_default': riskLedger was empty; initialized from config.riskMeasure.epsilonPpm
 */
export type P10BudgetSource = 'state' | 'config_default';

// -- Truncation Reason --------------------------------------------------------

export type P10TruncationReason = 'node_cap' | 'depth_cap' | 'fanout_cap' | null;

// -- Budget Mismatch Warning --------------------------------------------------

export interface P10BudgetMismatchWarning {
  readonly riskKind: string;
  readonly ledgerValue: number;
  readonly configEpsilonPpm: number;
}

// -- Planning Result with Explanation Bundle ----------------------------------

export interface P10PlanningResultV1 {
  readonly graph: P10ScenarioGraphV1;
  readonly config: P10PlanningConfigV1;
  /**
   * Worst-case cumulative failure probability across ALL paths in the
   * explored graph, including branches not prescribed by the policy.
   * Use for "what's the worst thing the graph contains?"
   *
   * WARNING: This is a lower bound if wasTruncated is true — unexplored
   * branches may hide additional failures.
   */
  readonly graphWideCumulativeFailurePpm: ProbMass;
  /**
   * Worst-case cumulative failure probability along paths prescribed
   * by the policy (chosen edges only at decision nodes with prescribedActionId).
   * This is the metric that must satisfy epsilon when constraintStatus === 'satisfied'.
   *
   * WARNING: This is a lower bound if wasTruncated is true.
   */
  readonly policyFailureUpperBoundPpm: ProbMass;
  readonly expectedCost: number;
  readonly cvarCost?: number;
  readonly safetyVerified: boolean;
  readonly violatedConstraints: readonly string[];
  readonly statesExpanded: number;
  readonly durationMs: number;
  readonly explanation: P10ExplanationBundleV1;
  /**
   * Whether the search was truncated before fully exploring the graph.
   * When true, constraintStatus must not be 'satisfied' (can't prove safety
   * with incomplete exploration).
   */
  readonly wasTruncated: boolean;
  readonly truncationReason: P10TruncationReason;
  /**
   * Where the effective risk budget came from.
   * Lets consumers detect when state.riskLedger overrides config.epsilonPpm.
   */
  readonly budgetSource: P10BudgetSource;
  /**
   * The effective risk budget used for planning (after initialization).
   */
  readonly effectiveBudget: Readonly<Record<string, number>>;
  /**
   * Non-empty when state.riskLedger disagrees with config.epsilonPpm.
   * Auditable — lets reviewers see budget provenance mismatches.
   */
  readonly budgetMismatchWarnings: readonly P10BudgetMismatchWarning[];
}

export interface P10ExplanationBundleV1 {
  readonly declaredObjective: P10RiskMeasureV1;
  readonly declaredAggregation: P10RiskAggregation;
  readonly rejectedActions: readonly P10RejectedActionV1[];
  readonly riskDeltas: readonly P10RiskDeltaV1[];
}

export interface P10RejectedActionV1 {
  readonly nodeId: string;
  readonly actionId: string;
  readonly reason: 'precondition_failed' | 'risk_budget_exceeded' | 'safety_violation' | 'mass_not_conserved';
}

export interface P10RiskDeltaV1 {
  readonly nodeId: string;
  readonly actionId: string;
  readonly failureMassPpm: ProbMass;
  readonly riskRemainingBefore: Readonly<Record<string, number>>;
  readonly riskRemainingAfter: Readonly<Record<string, number>>;
}

// -- Action Expansion (for adapter) ------------------------------------------

export interface P10ActionExpansionV1 {
  readonly chanceNodeState: P10RiskAwareStateV1;
  readonly outcomes: readonly {
    readonly outcomeId: string;
    readonly massPpm: ProbMass;
    readonly resultState: P10RiskAwareStateV1;
    readonly isFailure: boolean;
    readonly lossPpm: ProbMass;
  }[];
}

// -- Mass Validation ---------------------------------------------------------

export interface P10MassValidationResultV1 {
  readonly valid: boolean;
  readonly errors: readonly {
    readonly actionId: string;
    readonly totalMass: number;
    readonly expectedMass: number;
  }[];
}

// -- Learning Types ----------------------------------------------------------

export interface P10ExecutionReportV1 {
  readonly actionId: string;
  readonly observedOutcomeId: string;
  readonly stateContext: P10RiskAwareStateV1;
  readonly executionCount: number;
}

// -- Adapter Interface -------------------------------------------------------

export interface P10RiskAwareAdapter {
  validateMassConservation(
    actions: readonly P10StochasticActionV1[],
    model: P10RiskModelV1,
    sampleState: P10RiskAwareStateV1,
  ): P10MassValidationResultV1;

  expandAction(
    state: P10RiskAwareStateV1,
    action: P10StochasticActionV1,
    model: P10RiskModelV1,
    safetyInvariants: readonly P10SafetyInvariantV1[],
  ): P10ActionExpansionV1 | null;

  applyEffects(
    state: P10RiskAwareStateV1,
    effects: readonly P10EffectV1[],
  ): P10RiskAwareStateV1;

  checkSafety(
    state: P10RiskAwareStateV1,
    invariants: readonly P10SafetyInvariantV1[],
  ): readonly string[];

  computePathFailureProbability(
    path: readonly P10ScenarioEdgeV1[],
    aggregation: P10RiskAggregation,
  ): ProbMass;

  updateRiskModel(
    model: P10RiskModelV1,
    report: P10ExecutionReportV1,
  ): P10RiskModelV1;

  planUnderRisk(
    initialState: P10RiskAwareStateV1,
    actions: readonly P10StochasticActionV1[],
    model: P10RiskModelV1,
    config: P10PlanningConfigV1,
    safetyInvariants: readonly P10SafetyInvariantV1[],
    goalPredicate: (state: P10RiskAwareStateV1) => boolean,
    now?: () => number,
  ): P10PlanningResultV1;

  readonly maxScenarioNodes: number;
  readonly maxScenarioDepth: number;
  readonly maxOutcomesPerAction: number;
}

// -- Invariants --------------------------------------------------------------

export const P10_INVARIANTS = [
  'outcome_mass_conservation',
  'chance_constraint_satisfaction',
  'risk_budget_monotonicity',
  'deterministic_scenario_evaluation',
  'bounded_scenario_graph',
] as const;

export type P10Invariant = (typeof P10_INVARIANTS)[number];

// -- Capability Descriptor ---------------------------------------------------

export type P10ClaimId = 'p10';

export interface P10CapabilityDescriptor {
  readonly claim_id: P10ClaimId;
  readonly contract_version: P10ContractVersion;
  readonly invariants: readonly P10Invariant[];
  readonly maxScenarioNodes: number;
  readonly maxScenarioDepth: number;
  readonly maxOutcomesPerAction: number;
  readonly maxActions: number;
  readonly suite_hash?: string;
}

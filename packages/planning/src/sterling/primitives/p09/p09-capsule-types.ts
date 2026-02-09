/**
 * P09 Primitive Capsule — Domain-Agnostic Types
 *
 * Defines the contract for contingency planning with exogenous events:
 * planning around forced external transitions (nightfall, hunger ticks,
 * traffic spikes) that the agent cannot decline, producing policies
 * (branching plans) that remain safe under all forced-transition
 * applications within the modeled horizon.
 *
 * Zero Minecraft imports. Zero vitest imports.
 *
 * Two edge classes are structurally distinct (not just by convention):
 *   - ChosenActionEdge: what the planner selects. Can be declined.
 *   - ForcedTransitionEdge: what the world applies at trigger time.
 *     Cannot be skipped or declined. The planner must plan *around* them.
 *
 * Core invariants encoded in this capsule:
 *   1. Forced transitions fire at declared times and cannot be skipped
 *   2. Policy branching is deterministic given canonical state + trigger evaluation
 *   3. Safety (survivability invariants) holds under all forced transitions within horizon
 *   4. Plan horizon and branch factor are bounded
 *   5. Trigger evaluation is deterministic (same state + tick → same triggers)
 *
 * Field naming conventions (domain-agnostic):
 *   nightfall/hunger/spike -> forced_transition (external event)
 *   mine/eat/shelter/scale -> chosen_action     (agent decision)
 *   safe_health/no_death   -> safety_invariant  (must-hold constraint)
 *   policy/branch/node     -> contingency_plan  (branching output)
 */

// -- Contract Version --------------------------------------------------------

export type P09ContractVersion = 'p09.v1';

export const P09_CONTRACT_VERSION: P09ContractVersion = 'p09.v1';

// -- Plan Bounds -------------------------------------------------------------

/** Maximum horizon (in ticks) for contingency planning. */
export const MAX_HORIZON = 1000;

/** Maximum number of branches in a single policy tree. */
export const MAX_BRANCH_FACTOR = 8;

/** Maximum total nodes in a policy tree. */
export const MAX_POLICY_NODES = 200;

// -- Time-Indexed State ------------------------------------------------------

/**
 * A canonical state at a specific tick in time.
 *
 * Time is part of the state identity (included in hashing), not metadata.
 * Domain-agnostic: the `properties` record holds typed values like
 * health, food, light_level, etc.
 */
export interface P09TimeIndexedStateV1 {
  /** Current tick (discrete time step). Part of canonical identity. */
  readonly tick: number;
  /** Domain-specific state properties. Keys are property names, values are numbers. */
  readonly properties: Readonly<Record<string, number>>;
}

// -- Trigger Condition -------------------------------------------------------

/**
 * A condition that, when met, forces a transition.
 * Triggers are evaluated deterministically against the current state.
 *
 * Two trigger modes:
 *   - 'tick_interval': fires every N ticks (e.g., hunger every 80 ticks)
 *   - 'threshold':     fires when a property crosses a boundary (e.g., light_level <= 0)
 */
export type P09TriggerMode = 'tick_interval' | 'threshold';

export interface P09TriggerConditionV1 {
  /** Stable identifier for this trigger. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** How this trigger fires. */
  readonly mode: P09TriggerMode;
  /**
   * For 'tick_interval': the interval in ticks.
   * For 'threshold': unused (set to 0).
   */
  readonly intervalTicks: number;
  /**
   * For 'tick_interval': the first tick at which this trigger fires (offset).
   * For 'threshold': unused (set to 0).
   */
  readonly offsetTicks: number;
  /**
   * For 'threshold': which property to watch.
   * For 'tick_interval': unused (empty string).
   */
  readonly watchProperty: string;
  /**
   * For 'threshold': the boundary value.
   * Trigger fires when property <= thresholdValue.
   * For 'tick_interval': unused (set to 0).
   */
  readonly thresholdValue: number;
  /** Which forced transition this trigger activates. */
  readonly activatesTransitionId: string;
}

// -- Edge Classes (structurally distinct) ------------------------------------

/**
 * A chosen action edge: what the planner selects.
 * The agent can decline this (choose a different action or idle).
 */
export interface P09ChosenActionEdgeV1 {
  /** Discriminant: always 'chosen'. */
  readonly edgeKind: 'chosen';
  /** Stable identifier for this action. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Duration in ticks. */
  readonly durationTicks: number;
  /** Cost of performing this action. */
  readonly cost: number;
  /**
   * State mutation: how each property changes.
   * Positive = increase, negative = decrease.
   * Only listed properties change; unlisted remain the same.
   */
  readonly effects: Readonly<Record<string, number>>;
  /**
   * Precondition: minimum property values required to execute.
   * Action is inapplicable if any property is below its precondition.
   */
  readonly preconditions: Readonly<Record<string, number>>;
}

/**
 * A forced transition edge: what the world applies when a trigger fires.
 * The planner CANNOT skip or decline this. It must plan around it.
 *
 * Structurally distinguished from ChosenActionEdge by `edgeKind: 'forced'`.
 */
export interface P09ForcedTransitionEdgeV1 {
  /** Discriminant: always 'forced'. */
  readonly edgeKind: 'forced';
  /** Stable identifier for this transition. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Which trigger activates this transition. */
  readonly triggerId: string;
  /**
   * State mutation: how each property changes when this fires.
   * Forced transitions typically degrade state (negative effects).
   */
  readonly effects: Readonly<Record<string, number>>;
}

/** Union edge type for type-safe discrimination. */
export type P09EdgeV1 = P09ChosenActionEdgeV1 | P09ForcedTransitionEdgeV1;

// -- Action Result (chosen action + intermediate forced transitions) ---------

/**
 * Result of applying a chosen action over its duration.
 *
 * Because chosen actions span multiple ticks (durationTicks > 0), the world
 * may apply forced transitions at intermediate ticks during the action.
 * This result captures both the action's own effects AND all forced
 * transitions that fired during the action's execution window.
 *
 * This is the key P09 contract: forced transitions cannot be skipped
 * even when a chosen action spans over their scheduled tick.
 */
export interface P09ActionResultV1 {
  /** Final state after the action and all intermediate forced transitions. */
  readonly finalState: P09TimeIndexedStateV1;
  /**
   * Forced transitions that fired during the action's execution window.
   * Each entry records which transition fired and at which tick.
   */
  readonly intermediateForced: readonly {
    readonly transitionId: string;
    readonly triggerId: string;
    readonly atTick: number;
  }[];
  /**
   * Whether safety was violated at any intermediate tick.
   * If true, the action should not be expanded (the planner marks it unsafe).
   */
  readonly safetyViolatedDuringAction: boolean;
  /** IDs of invariants violated during intermediate ticks. */
  readonly violatedInvariantIds: readonly string[];
}

// -- Safety Invariant --------------------------------------------------------

/**
 * A safety invariant that must hold in all states reachable by the policy.
 * Deterministic predicate: satisfied iff every constrained property
 * meets its minimum bound.
 *
 * "The planner MUST NOT produce a policy that allows any reachable state
 * to violate this invariant, even after forced transitions."
 */
export interface P09SafetyInvariantV1 {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /**
   * Property → minimum acceptable value.
   * Invariant violated if ANY property drops below its minimum.
   */
  readonly minimums: Readonly<Record<string, number>>;
}

// -- Policy Tree (plan output) -----------------------------------------------

/**
 * A single node in the policy tree.
 * Represents a state + the action the policy prescribes at that state.
 */
export interface P09PolicyNodeV1 {
  /** Unique node identifier within the policy. */
  readonly nodeId: string;
  /** State at this node. */
  readonly state: P09TimeIndexedStateV1;
  /**
   * Action prescribed at this node (null at terminal/leaf nodes).
   * If non-null, must be a chosen action ID (not a forced transition).
   */
  readonly prescribedActionId: string | null;
  /** Whether this node is a terminal (leaf). */
  readonly isTerminal: boolean;
  /** Whether the goal is reached at this node. */
  readonly isGoalReached: boolean;
  /** Whether safety invariants hold at this node. */
  readonly isSafe: boolean;
  /**
   * Forced transitions that were applied at this node's tick.
   * Structural guard: a chosen edge MUST NOT be emitted from a node
   * where forced transitions fire but haven't been applied.
   * Empty array = no forced transitions fire at this tick.
   * Null = not yet evaluated (only valid during construction).
   */
  readonly forcedAppliedAtTick: readonly string[];
}

/**
 * A branch in the policy tree.
 * Connects a parent node to a child node, labeled with the edge that caused it.
 */
export interface P09PolicyBranchV1 {
  /** Parent node ID. */
  readonly fromNodeId: string;
  /** Child node ID. */
  readonly toNodeId: string;
  /** The edge (chosen or forced) that transitions between them. */
  readonly edge: P09EdgeV1;
  /**
   * If the edge is forced, which trigger caused it.
   * Null for chosen action edges.
   */
  readonly triggeredBy: string | null;
}

/**
 * A complete contingency policy: a tree of nodes and branches.
 * The policy is deterministic: given a canonical state, there is exactly
 * one prescribed action (or one set of forced transitions that must apply).
 */
export interface P09ContingencyPolicyV1 {
  /** Root node of the policy tree. */
  readonly rootNodeId: string;
  /** All nodes in the policy, keyed by nodeId. */
  readonly nodes: Readonly<Record<string, P09PolicyNodeV1>>;
  /** All branches in the policy. */
  readonly branches: readonly P09PolicyBranchV1[];
  /** Total number of nodes (for bound checking). */
  readonly totalNodes: number;
  /** Maximum depth of the tree (for horizon checking). */
  readonly maxDepth: number;
  /** Maximum branching factor observed (for bound checking). */
  readonly maxBranchingFactor: number;
  /** Whether all terminal nodes are safe. */
  readonly allTerminalsSafe: boolean;
  /** Whether at least one path reaches the goal. */
  readonly goalReachable: boolean;
}

// -- Planning Result ---------------------------------------------------------

/**
 * Result of contingency planning.
 */
export interface P09PlanningResultV1 {
  /** The computed policy. */
  readonly policy: P09ContingencyPolicyV1;
  /** Whether the policy satisfies all safety invariants. */
  readonly safetyVerified: boolean;
  /** Which safety invariants were violated (empty if all safe). */
  readonly violatedInvariants: readonly string[];
  /** Planning duration in milliseconds. */
  readonly durationMs: number;
  /** Number of states expanded during planning. */
  readonly statesExpanded: number;
  /** Forced transitions that were applied during planning. */
  readonly forcedTransitionsApplied: readonly {
    readonly transitionId: string;
    readonly atTick: number;
    readonly atNodeId: string;
  }[];
}

// -- Adapter Interface -------------------------------------------------------

/**
 * P09 Contingency Planning Adapter.
 *
 * Models planning with interleaved chosen actions and forced transitions.
 * The adapter is responsible for:
 *   - Deterministic state transitions (both chosen and forced)
 *   - Deterministic trigger evaluation
 *   - Safety verification across all reachable states
 *   - Bounded policy generation
 *
 * All methods must be pure (deterministic, no side effects).
 */
export interface P09ContingencyAdapter {
  /**
   * Apply a chosen action to a state, simulating tick-by-tick advancement.
   *
   * During the action's duration (durationTicks), the world continues to
   * evolve: triggers are evaluated at each intermediate tick and forced
   * transitions are applied. The action's own effects are applied at the
   * end of its duration, AFTER all intermediate forced transitions.
   *
   * Returns null if preconditions are not met at the start tick.
   * Returns P09ActionResultV1 which includes the final state, all
   * intermediate forced transitions, and safety status at intermediate ticks.
   *
   * Must be deterministic: same state + action + world context → same result.
   */
  applyChosenAction(
    state: P09TimeIndexedStateV1,
    action: P09ChosenActionEdgeV1,
    triggers: readonly P09TriggerConditionV1[],
    transitions: readonly P09ForcedTransitionEdgeV1[],
    safetyInvariants: readonly P09SafetyInvariantV1[],
  ): P09ActionResultV1 | null;

  /**
   * Apply a forced transition to a state.
   * Must be deterministic: same state + transition → same result.
   * Cannot return null: forced transitions always apply.
   */
  applyForcedTransition(
    state: P09TimeIndexedStateV1,
    transition: P09ForcedTransitionEdgeV1,
  ): P09TimeIndexedStateV1;

  /**
   * Evaluate which triggers fire at the given state.
   * Must be deterministic: same state → same set of triggers.
   * Returns IDs of triggers that fire, sorted lexicographically.
   */
  evaluateTriggers(
    state: P09TimeIndexedStateV1,
    triggers: readonly P09TriggerConditionV1[],
  ): readonly string[];

  /**
   * Check whether a state satisfies a safety invariant.
   * Must be deterministic.
   */
  checkSafety(
    state: P09TimeIndexedStateV1,
    invariant: P09SafetyInvariantV1,
  ): boolean;

  /**
   * Check whether a state satisfies ALL safety invariants.
   * Must be deterministic. Returns the IDs of violated invariants.
   */
  checkAllSafety(
    state: P09TimeIndexedStateV1,
    invariants: readonly P09SafetyInvariantV1[],
  ): readonly string[];

  /**
   * Generate a contingency policy for the given scenario.
   *
   * The planner must:
   *   - Apply forced transitions at their declared times (cannot skip)
   *   - Branch the policy when triggers can fire
   *   - Verify safety at every reachable node
   *   - Respect MAX_HORIZON, MAX_BRANCH_FACTOR, MAX_POLICY_NODES
   *   - Be deterministic: same inputs → same policy
   */
  planContingency(
    initialState: P09TimeIndexedStateV1,
    actions: readonly P09ChosenActionEdgeV1[],
    transitions: readonly P09ForcedTransitionEdgeV1[],
    triggers: readonly P09TriggerConditionV1[],
    safetyInvariants: readonly P09SafetyInvariantV1[],
    goalPredicate: (state: P09TimeIndexedStateV1) => boolean,
    horizonTicks: number,
    /** Optional clock for durationMs. If omitted, durationMs is 0. */
    now?: () => number,
  ): P09PlanningResultV1;

  /** Maximum horizon this adapter supports. */
  readonly maxHorizon: number;

  /** Maximum branch factor this adapter supports. */
  readonly maxBranchFactor: number;

  /** Maximum policy nodes this adapter supports. */
  readonly maxPolicyNodes: number;
}

// -- Invariants --------------------------------------------------------------

/**
 * P09 conformance invariants.
 * Each maps directly to one of the 5 Rig L certification pivots.
 */
export const P09_INVARIANTS = [
  /** Forced transitions fire at declared times and cannot be skipped. */
  'forced_transition_application',
  /** Policy branching is deterministic given canonical state + trigger evaluation. */
  'deterministic_policy_branching',
  /** Safety invariants hold in all states reachable under forced transitions. */
  'safety_under_forced_transitions',
  /** Plan horizon and branch factor are bounded. */
  'bounded_contingency_plan',
  /** Trigger evaluation is deterministic: same state + tick → same triggers. */
  'deterministic_trigger_evaluation',
] as const;

export type P09Invariant = (typeof P09_INVARIANTS)[number];

// -- Capability Descriptor ---------------------------------------------------

export type P09ClaimId = 'p09';

export interface P09CapabilityDescriptor {
  /** Explicit claim identifier. */
  readonly claim_id: P09ClaimId;
  /** Contract version. */
  readonly contract_version: P09ContractVersion;
  /** Which invariants this adapter claims to satisfy. */
  readonly invariants: readonly P09Invariant[];
  /** Maximum plan horizon in ticks. */
  readonly maxHorizon: number;
  /** Maximum branch factor in policy tree. */
  readonly maxBranchFactor: number;
  /** Maximum policy nodes. */
  readonly maxPolicyNodes: number;
  /** Content hash of conformance suite source (placeholder until CI generates). */
  readonly suite_hash?: string;
}

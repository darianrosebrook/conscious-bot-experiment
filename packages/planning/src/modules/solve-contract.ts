/**
 * Solve Contract Types
 *
 * Types-only file defining the canonical bot <-> Sterling integration contract.
 * No runtime code. Both sides honor these shapes.
 *
 * @pivot 7 — Shared solve contract between bot and Sterling
 */

import type { TaskRequirement } from './requirements';

// ---------------------------------------------------------------------------
// Bot -> Sterling: Solve Input
// ---------------------------------------------------------------------------

/**
 * Canonical request envelope the bot sends to Sterling for planning.
 *
 * Sterling is stateless: every call includes the full world snapshot.
 * The bot is the canonical source for inventory, nearby blocks, and progress.
 */
export interface SolveInput {
  /** Current inventory snapshot at solve time. */
  state: {
    inventory: Record<string, number>;
    nearbyBlocks: string[];
  };
  /** What the bot wants to achieve. */
  goal: {
    item?: string;
    structure?: string;
    targetTool?: string;
    quantity: number;
  };
  /** Set of capabilities the bot currently has available. */
  capabilitySet: string[];
  /** Bitmask tracking which progression milestones are complete. */
  progressBitmask: number;
  /** Domain constraints (e.g. crafting rules, building templates). */
  constraints?: Record<string, unknown>;
  /** Present only on repair re-solves. */
  failureContext?: FailureContext;
}

/**
 * Compact failure signature included in repair re-solves.
 *
 * @pivot 2 — Repair must include failure signature
 */
export interface FailureContext {
  /** The leaf action name that failed. */
  failedLeaf: string;
  /** Classification of why it failed (e.g. 'missing_ingredient', 'navigation_blocked'). */
  reasonClass: string;
  /** How many times this leaf has been attempted. */
  attemptCount: number;
  /** Digest of the previous plan to detect no-change loops. */
  previousStepsDigest?: string;
}

// ---------------------------------------------------------------------------
// Sterling -> Bot: Solve Output
// ---------------------------------------------------------------------------

/**
 * Response envelope Sterling returns after planning.
 */
export interface SolveOutput {
  /** Ordered list of executable steps. */
  steps: SolveStep[];
  /** Unique plan identifier. */
  planId: string;
  /** Observability bundles (Rig A). */
  solveMeta?: {
    bundles: SolveBundle[];
  };
  /** Search health metrics (optional until Python emits). */
  searchHealth?: SearchHealth;
}

export interface SolveStep {
  action: string;
  args?: Record<string, unknown>;
  order: number;
}

export interface SolveBundle {
  bundleId: string;
  input: {
    definitionHash: string;
    initialStateHash: string;
    goalHash: string;
  };
  output: {
    stepsDigest: string;
    solved: boolean;
    planId: string;
    durationMs?: number;
    solutionPathLength?: number;
    totalNodes?: number;
  };
  compatReport: {
    valid: boolean;
    ruleCount: number;
    issues?: string[];
  };
}

export interface SearchHealth {
  nodesExpanded?: number;
  frontierSize?: number;
  maxDepth?: number;
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Capability Routing
// ---------------------------------------------------------------------------

/**
 * Routing decision returned by the capability-aware router.
 *
 * @pivot 3 — Routing is fail-closed and capability-aware
 */
export interface CapabilityRoute {
  /** Which backend handles this task. */
  backend: PlanBackend;
  /** Which rig is needed (null = no rig needed, e.g. deterministic compiler). */
  requiredRig: string | null;
  /** Capabilities required to plan this task. */
  requiredCapabilities: string[];
  /** Capabilities currently available. */
  availableCapabilities: string[];
  /** Human-readable routing reason. */
  reason: string;
}

export type PlanBackend = 'sterling' | 'compiler' | 'unplannable';

// ---------------------------------------------------------------------------
// Repair Input
// ---------------------------------------------------------------------------

/**
 * Extended solve input for repair re-solves.
 *
 * @pivot 2 — Repair must include failure signature; no-change detection required
 */
export interface RepairInput extends SolveInput {
  /** The leaf action that failed. */
  failedLeaf: string;
  /** Classification of the failure. */
  reasonClass: string;
  /** Number of repair attempts so far. */
  attemptCount: number;
  /** Digest of the previous plan for no-change detection. */
  previousStepsDigest: string;
}

// ---------------------------------------------------------------------------
// Compiler Constraints
// ---------------------------------------------------------------------------

/**
 * What the deterministic lowering pass is allowed to do.
 *
 * @pivot 1 — Compiler is a lowering pass, not a planner.
 * Zero scoring, zero frontier/queue, zero backtracking, zero "try alternatives".
 */
export interface CompilerConstraints {
  /** May only expand templates, not search. */
  allowSearch: false;
  /** May not score or rank alternatives. */
  allowScoring: false;
  /** May not backtrack. */
  allowBacktracking: false;
  /** May not maintain a frontier/queue. */
  allowFrontier: false;
  /** If the compiler needs to choose between strategies, it must fail. */
  allowAlternatives: false;
}

/**
 * Sterling domain handler declaration.
 * Describes what a solver on the Sterling side provides.
 */
export interface SterlingDomainDeclaration {
  /** Which primitive operations this solver implements. */
  implementsPrimitives: string[];
  /** Which SolveInput fields this solver consumes. */
  consumesFields: string[];
  /** Unique solver identifier. */
  solverId: string;
  /** Contract version for compatibility checks. */
  contractVersion: string;
}

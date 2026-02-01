/**
 * Macro State — Foundation Types for Hierarchical Planning
 *
 * Defines abstract macro contexts (e.g., "at_base", "at_mine"), edges
 * between them, and a context registry that validates IDs upfront.
 *
 * Context IDs are members of a registry, not arbitrary strings.
 * Unknown context IDs produce explicit blocked results.
 *
 * @author @darianrosebrook
 */

import { canonicalize, contentHash } from '../sterling/solve-bundle';
import type { PlanningDecision } from '../constraints/planning-decisions';

export const MACRO_STATE_SCHEMA_VERSION = 1;

export const MAX_MACRO_DEPTH = 10;

export const DEFAULT_REPLAN_THRESHOLD = 3;

export const COST_LEARNING_RATE = 0.3;

// ============================================================================
// Context Registry
// ============================================================================

export interface ContextDefinition {
  readonly id: string;
  readonly description: string;
  /** Compile-time marker: contexts are always abstract (no coordinates) */
  readonly abstract: true;
}

/**
 * Registry of valid macro context IDs.
 *
 * Macro contexts must be registered upfront. Unknown contexts produce
 * explicit blocked results rather than silent failures.
 */
export class ContextRegistry {
  private contexts = new Map<string, ContextDefinition>();

  register(id: string, def: ContextDefinition): void {
    this.contexts.set(id, def);
  }

  has(id: string): boolean {
    return this.contexts.has(id);
  }

  get(id: string): ContextDefinition | undefined {
    return this.contexts.get(id);
  }

  getAll(): ReadonlyArray<ContextDefinition> {
    return Array.from(this.contexts.values());
  }

  get size(): number {
    return this.contexts.size;
  }

  validate(id: string): PlanningDecision<string> {
    if (!this.contexts.has(id)) {
      return {
        kind: 'blocked',
        reason: 'unknown_context',
        detail: `Context '${id}' not registered in the context registry`,
      };
    }
    return { kind: 'ok', value: id };
  }
}

// ============================================================================
// Macro Edge
// ============================================================================

export interface MacroEdge {
  /** Content-addressed ID: hash of {schemaVersion, from, to} */
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** Base cost (static, from domain knowledge) */
  readonly baseCost: number;
  /** Learned cost (updated from micro outcome feedback via EMA) */
  learnedCost: number;
  /** Consecutive failures on this edge (for replan threshold) */
  consecutiveFailures: number;
}

/**
 * Compute a content-addressed edge ID.
 */
export function computeEdgeId(from: string, to: string): string {
  return contentHash(
    canonicalize({
      schemaVersion: MACRO_STATE_SCHEMA_VERSION,
      from,
      to,
    })
  );
}

// ============================================================================
// Macro Plan
// ============================================================================

export interface MacroPlan {
  /** Content-addressed digest of the ordered edge sequence */
  readonly planDigest: string;
  /** Ordered sequence of macro edges to traverse */
  readonly edges: readonly MacroEdge[];
  /** Start context ID */
  readonly start: string;
  /** Goal context ID */
  readonly goal: string;
  /** Goal identifier (e.g., task ID) */
  readonly goalId: string;
  /** Total estimated cost */
  readonly totalCost: number;
}

/**
 * Compute a content-addressed plan digest.
 */
export function computeMacroPlanDigest(
  edgeIds: readonly string[],
  goalId: string
): string {
  return contentHash(
    canonicalize({
      schemaVersion: MACRO_STATE_SCHEMA_VERSION,
      edges: edgeIds,
      goalId,
    })
  );
}

// ============================================================================
// Macro State Graph
// ============================================================================

export interface MacroStateGraph {
  readonly registry: ContextRegistry;
  readonly edges: ReadonlyArray<MacroEdge>;
}

// ============================================================================
// Micro Outcome
// ============================================================================

export interface MicroOutcome {
  /** Which macro edge was being executed */
  readonly macroEdgeId: string;
  /** Whether the micro execution succeeded */
  readonly success: boolean;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Reason for failure (if any) */
  readonly failureReason?: string;
  /** Number of leaf steps completed */
  readonly leafStepsCompleted: number;
  /** Number of leaf steps that failed */
  readonly leafStepsFailed: number;
}

// ============================================================================
// Macro Edge Session
// ============================================================================

/**
 * Tracks the execution of a single macro edge's micro run.
 *
 * Outcome reporting is per macro-edge session, not per leaf step.
 * The session enforces that reportMicroOutcome is called exactly once.
 */
export interface MacroEdgeSession {
  readonly sessionId: string;
  readonly macroEdgeId: string;
  readonly macroEdge: MacroEdge;
  readonly startedAt: number;
  leafStepsIssued: number;
  leafStepsCompleted: number;
  leafStepsFailed: number;
  status: 'running' | 'completed' | 'failed';
  /** Whether the outcome has been reported (enforces exactly-once) */
  outcomeReported: boolean;
}

/**
 * Create a new macro edge session.
 */
export function createMacroEdgeSession(
  edge: MacroEdge,
  leafStepsIssued: number
): MacroEdgeSession {
  return {
    sessionId: contentHash(
      canonicalize({
        schemaVersion: MACRO_STATE_SCHEMA_VERSION,
        edgeId: edge.id,
        startedAt: Date.now(),
      })
    ),
    macroEdgeId: edge.id,
    macroEdge: edge,
    startedAt: Date.now(),
    leafStepsIssued,
    leafStepsCompleted: 0,
    leafStepsFailed: 0,
    status: 'running',
    outcomeReported: false,
  };
}

/**
 * Finalize a session into a MicroOutcome.
 * Returns undefined if outcome was already reported (exactly-once guard).
 */
export function finalizeSession(
  session: MacroEdgeSession
): MicroOutcome | undefined {
  if (session.outcomeReported) return undefined;
  session.outcomeReported = true;

  const success = session.status === 'completed';
  return {
    macroEdgeId: session.macroEdgeId,
    success,
    durationMs: Date.now() - session.startedAt,
    failureReason: session.status === 'failed' ? 'micro_execution_failed' : undefined,
    leafStepsCompleted: session.leafStepsCompleted,
    leafStepsFailed: session.leafStepsFailed,
  };
}

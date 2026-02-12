/**
 * Reduction Client Interface — Sterling Executable Gating
 *
 * Minimal interface for executable-output gating. Implemented at the
 * composition root using whatever Sterling client lives in cognition/planning.
 * Core stays dependency-clean: zero @conscious-bot/* imports.
 *
 * Invariant: if an output can change world state, it must carry Sterling
 * reduction provenance; otherwise it is advisory text only.
 *
 * @author @darianrosebrook
 */

/**
 * Result of attempting to reduce an LLM proposal through Sterling.
 */
export interface ReductionResult {
  isExecutable: boolean;
  blockReason?: string;
  committedIrDigest?: string;
  committedGoalPropId?: string;
}

/**
 * Interface for Sterling reduction gating.
 * Implemented at the composition root — not in core.
 */
export interface ReductionClient {
  reduceOptionProposal(serializedBtDsl: string): Promise<ReductionResult>;
}

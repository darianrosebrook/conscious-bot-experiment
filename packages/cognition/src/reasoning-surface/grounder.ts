/**
 * Goal Grounder — Sterling-Owned Semantic Boundary
 *
 * MIGRATION (PR4): Grounding is now Sterling-owned.
 *
 * TS may:
 * - Fail-closed when Sterling is unavailable
 * - Expose Sterling's grounding/advisory fields for debugging/observability
 *
 * TS must NOT:
 * - Parse action/target/amount
 * - Infer feasibility from world state
 * - Normalize or "fix up" semantic fields
 *
 * The local vocabulary matching, action feasibility checks, and semantic parsing
 * have been DELETED. Sterling is the semantic authority (I-BOUNDARY-1).
 *
 * @author @darianrosebrook
 */

import type { ReductionProvenance } from '../types';
import type { GroundingResult, GroundingViolation } from './eligibility';

// ============================================================================
// Types
// ============================================================================

/**
 * Grounding context — kept for signature compatibility but NOT used for
 * local semantic grounding (Sterling owns that).
 *
 * This may be passed to Sterling as part of WorldSnapshot in future iterations.
 */
export interface GroundingContext {
  /** Bot's current state */
  bot: {
    health: number;
    hunger: number;
    inventory: Array<{ name: string; count: number }>;
    position?: { x: number; y: number; z: number };
  };
  /** World state */
  world: {
    biome: string;
    nearbyEntities: Array<{ kind: string; count: number; distance?: number }>;
    nearbyBlocks?: Array<{ type: string; count: number }>;
  };
  /** Known item/entity vocabulary (for unknown reference detection) */
  vocabulary?: {
    knownItems: Set<string>;
    knownEntities: Set<string>;
    knownBiomes: Set<string>;
  };
}

/**
 * Configuration for grounding behavior.
 *
 * MIGRATION NOTE: Local grounding config options have been removed.
 * The only option is whether to require Sterling (fail-closed by default).
 */
export interface GroundingConfig {
  /**
   * If true, legacy goal objects are treated as non-grounded (fail-closed).
   * This prevents "Sterling-light" drift where TS starts reasoning over goal semantics again.
   */
  requireSterling: boolean;
}

const DEFAULT_CONFIG: GroundingConfig = {
  requireSterling: true,
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if value is a ReductionProvenance.
 */
function isReductionProvenance(x: unknown): x is ReductionProvenance {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.sterlingProcessed === 'boolean' && typeof o.isExecutable === 'boolean';
}

// ============================================================================
// Grounding (Sterling-Owned)
// ============================================================================

/**
 * Ground a goal against Sterling's reduction result.
 *
 * BOUNDARY RULE (I-BOUNDARY-1): Grounding is Sterling-owned.
 *
 * TS may:
 * - Fail-close when Sterling is unavailable
 * - Expose Sterling's grounding/advisory fields for debugging/observability
 *
 * TS must NOT:
 * - Parse action/target/amount
 * - Infer feasibility from world state
 * - Normalize or "fix up" semantic fields
 *
 * @param reductionOrLegacy - ReductionProvenance from Sterling, or legacy goal shape (rejected)
 * @param _context - Grounding context (unused — Sterling owns grounding)
 * @param config - Optional grounding configuration
 * @returns Grounding result based on Sterling's decision
 */
export function groundGoal(
  reductionOrLegacy: unknown,
  _context: GroundingContext,
  config: GroundingConfig = DEFAULT_CONFIG
): GroundingResult {
  // Fail-closed on legacy goal shapes to prevent "Sterling-light" drift.
  if (!isReductionProvenance(reductionOrLegacy)) {
    if (config.requireSterling) {
      return {
        pass: false,
        reason: 'sterling_required_for_grounding',
        violations: [{
          type: 'unknown_reference',
          description: 'Local grounding has been removed. Provide ReductionProvenance (Sterling-owned semantics).',
          trigger: 'legacy_goal_shape',
        }],
        referencedFacts: [],
      };
    }

    // Legacy grounding allowed (only for ablation testing)
    return { pass: true, reason: 'legacy_grounding_allowed', violations: [], referencedFacts: [] };
  }

  const reduction = reductionOrLegacy;

  // Fail-closed if Sterling didn't process
  if (!reduction.sterlingProcessed) {
    return {
      pass: false,
      reason: reduction.sterlingError ?? 'sterling_unavailable',
      violations: [{
        type: 'unknown_reference',
        description: 'Sterling reduction did not run; grounding cannot be asserted.',
        trigger: 'sterling_unavailable',
      }],
      referencedFacts: [],
    };
  }

  // Executability is authoritative. Do not "fix up" based on any local interpretation.
  if (!reduction.isExecutable) {
    return {
      pass: false,
      reason: reduction.blockReason ?? 'sterling_not_executable',
      violations: [],
      referencedFacts: [],
    };
  }

  return { pass: true, reason: 'sterling_executable', violations: [], referencedFacts: [] };
}

/**
 * Create a grounding context from a ThoughtContext.
 * This adapts the full thought context to the grounding-specific subset.
 *
 * NOTE: This context is kept for signature compatibility but is NOT used
 * for local semantic grounding (Sterling owns that). Future iterations may
 * send this to Sterling as part of WorldSnapshot.
 */
export function createGroundingContext(thoughtContext: {
  currentState?: {
    health?: number;
    food?: number;
    inventory?: Array<{ name: string; count: number }>;
    position?: { x: number; y: number; z: number };
    biome?: string;
    nearbyHostiles?: number;
    nearbyPassives?: number;
  };
}): GroundingContext {
  const state = thoughtContext.currentState ?? {};

  return {
    bot: {
      health: state.health ?? 20,
      hunger: state.food ?? 20,
      inventory: state.inventory ?? [],
      position: state.position,
    },
    world: {
      biome: state.biome ?? 'unknown',
      nearbyEntities: [], // Would need to be populated from actual entity data
    },
  };
}

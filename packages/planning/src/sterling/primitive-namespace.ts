/**
 * Primitive Namespace Resolution
 *
 * Two primitive ID namespaces coexist:
 *
 * - **CB-Pxx** (domain-level): What planning capability is proven.
 *   Defined in docs/planning/capability-primitives.md. Range: CB-P01..CB-P21.
 *
 * - **ST-Pxx** (engine-level): What the search infrastructure can do.
 *   Defined in sterling/data/primitive_specs/index.json. Range: ST-P01..ST-P05.
 *
 * These namespaces are orthogonal but related: a domain capability (CB-Pxx)
 * may DEPEND ON one or more engine primitives (ST-Pxx). The dependency is
 * "CB-P01 requires ST-P01" — meaning the domain capability is only provable
 * if the engine provides the required infrastructure.
 *
 * RULE: All primitive IDs in declarations, registries, and claim objects
 * must be fully qualified (prefixed with CB- or ST-). Bare IDs like "p01"
 * are structurally rejected by the type system.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Namespace-Qualified Primitive ID Types
// ============================================================================

/**
 * CB-prefixed primitive ID (domain-level capability).
 * Pattern: CB-P01 through CB-P21.
 */
export type CBPrimitiveId = `CB-P${string}`;

/**
 * ST-prefixed primitive ID (engine-level primitive).
 * Pattern: ST-P01 through ST-P05.
 */
export type STPrimitiveId = `ST-P${string}`;

/**
 * Any fully-qualified primitive ID. Used in declarations and registries.
 * Bare IDs (e.g., "p01", "P01") are structurally excluded.
 */
export type QualifiedPrimitiveId = CBPrimitiveId | STPrimitiveId;

// ============================================================================
// Known Primitive ID Constants
// ============================================================================

/** Domain-level capability primitives (CB-P01 through CB-P21). */
export const CB_PRIMITIVES = {
  /** Deterministic transformation planning (resource → product) */
  CB_P01: 'CB-P01' as const,
  /** Capability gating and legality */
  CB_P02: 'CB-P02' as const,
  /** Temporal planning with durations, batching, and capacity */
  CB_P03: 'CB-P03' as const,
  /** Multi-strategy acquisition */
  CB_P04: 'CB-P04' as const,
  /** Hierarchical planning (macro policy over micro solvers) */
  CB_P05: 'CB-P05' as const,
  /** Goal-conditioned valuation under scarcity */
  CB_P06: 'CB-P06' as const,
  /** Feasibility under constraints and partial-order structure */
  CB_P07: 'CB-P07' as const,
  /** Systems synthesis */
  CB_P08: 'CB-P08' as const,
  /** Contingency planning with exogenous events */
  CB_P09: 'CB-P09' as const,
  /** Risk-aware planning */
  CB_P10: 'CB-P10' as const,
  /** Epistemic planning (belief-state and active sensing) */
  CB_P11: 'CB-P11' as const,
  /** Invariant maintenance */
  CB_P12: 'CB-P12' as const,
  /** Irreversibility and commitment planning */
  CB_P13: 'CB-P13' as const,
  /** Program-level planning */
  CB_P14: 'CB-P14' as const,
  /** Fault diagnosis and repair */
  CB_P15: 'CB-P15' as const,
  /** Representation invariance and state canonicalization */
  CB_P16: 'CB-P16' as const,
  /** Credit assignment tied to execution */
  CB_P17: 'CB-P17' as const,
  /** Multi-objective optimization */
  CB_P18: 'CB-P18' as const,
  /** Audit-grade explanations */
  CB_P19: 'CB-P19' as const,
  /** Rule injection hardening */
  CB_P20: 'CB-P20' as const,
  /** Entity belief maintenance */
  CB_P21: 'CB-P21' as const,
} as const;

/** Engine-level Sterling primitives (ST-P01 through ST-P05). */
export const ST_PRIMITIVES = {
  /** Deterministic transitions */
  ST_P01: 'ST-P01' as const,
  /** Observation emission */
  ST_P02: 'ST-P02' as const,
  /** Prediction verification */
  ST_P03: 'ST-P03' as const,
  /** Discriminative K1 evaluation */
  ST_P04: 'ST-P04' as const,
  /** Macro-operator composition */
  ST_P05: 'ST-P05' as const,
} as const;

// ============================================================================
// Dependency Mapping (CB requires ST)
// ============================================================================

/**
 * Dependency mapping: which engine primitives (ST-Pxx) does each domain
 * capability (CB-Pxx) require?
 *
 * This is a "requires" relationship, not equivalence.
 * CB-P01 requires ST-P01 means: "deterministic transformation planning
 * is only provable if the engine provides deterministic transitions."
 *
 * Unmapped CB primitives have no engine dependency (they are provable
 * from domain-level structure alone, e.g., CB-P16 state canonicalization).
 */
export const CB_REQUIRES_ST: Readonly<Record<string, readonly STPrimitiveId[]>> = {
  // Rig A: Deterministic transformation planning requires deterministic transitions
  'CB-P01': ['ST-P01'],

  // Rig B: Capability gating requires deterministic transitions (legality is fail-closed)
  'CB-P02': ['ST-P01'],

  // Rig C: Temporal planning requires deterministic transitions + observation emission
  'CB-P03': ['ST-P01', 'ST-P02'],

  // Rig D: Multi-strategy acquisition requires deterministic transitions
  'CB-P04': ['ST-P01'],

  // Rig E: Hierarchical planning requires deterministic transitions + macro-operator composition
  'CB-P05': ['ST-P01', 'ST-P05'],

  // Rig G: Feasibility under constraints requires deterministic transitions
  'CB-P07': ['ST-P01'],

  // Rig H: Systems synthesis requires deterministic transitions + macro-operator composition
  'CB-P08': ['ST-P01', 'ST-P05'],

  // CB-P16: Representation invariance — no engine dependency (pure domain-level)
  // CB-P17: Credit assignment — no engine dependency (pure domain-level)
  // CB-P18: Multi-objective — no engine dependency (pure domain-level)
  // CB-P19: Audit-grade explanations — no engine dependency (pure domain-level)
  // CB-P20: Rule injection hardening — no engine dependency (pure domain-level)
  // CB-P21: Entity belief maintenance — observation emission for belief updates
  'CB-P21': ['ST-P02'],
} as const;

// ============================================================================
// Validation
// ============================================================================

/** Check if a string is a valid qualified primitive ID. */
export function isQualifiedPrimitiveId(id: string): id is QualifiedPrimitiveId {
  return /^(CB|ST)-P\d{2}$/.test(id);
}

/**
 * Assert that all primitive IDs in an array are fully qualified.
 * Throws if any bare ID (e.g., "p01", "P01") is found.
 */
export function assertQualifiedPrimitiveIds(ids: readonly string[]): asserts ids is readonly QualifiedPrimitiveId[] {
  for (const id of ids) {
    if (!isQualifiedPrimitiveId(id)) {
      throw new Error(
        `Primitive ID "${id}" is not namespace-qualified. ` +
        `Use CB-Pxx (domain capability) or ST-Pxx (engine primitive). ` +
        `Example: "CB-P01" not "p01" or "P01".`,
      );
    }
  }
}

/**
 * Get the engine dependencies for a domain capability.
 * Returns empty array if no engine dependencies exist.
 */
export function getEngineDependencies(cbPrimitive: CBPrimitiveId): readonly STPrimitiveId[] {
  return CB_REQUIRES_ST[cbPrimitive] ?? [];
}

/**
 * P08 Primitive Capsule — Domain-Agnostic Types
 *
 * Defines the contract for systems synthesis (design-space search,
 * motif reuse, behavioral specification) as a portable primitive
 * that any domain can implement.
 *
 * Zero Minecraft imports. Zero vitest imports.
 *
 * Core invariants encoded in this capsule:
 *   1. Evaluation is deterministic (same design → same spec result)
 *   2. Design size is bounded (MAX_DESIGN_NODES cap)
 *   3. Symmetry is canonicalized (equivalent designs produce same hash)
 *   4. Spec is a boolean predicate (no raw continuous metrics in state)
 *   5. Motif instantiation is bounded (node count enforced; MAX_MOTIFS reserved for future library)
 *
 * Field naming conventions (domain-agnostic):
 *   farmland/resistor/beam  -> component    (abstract design element)
 *   water_flow/signal/load  -> spec         (behavioral requirement)
 *   farm_row/NOT_gate/truss -> motif        (reusable sub-pattern)
 */

// -- Contract Version --------------------------------------------------------

export type P08ContractVersion = 'p08.v1';

export const P08_CONTRACT_VERSION: P08ContractVersion = 'p08.v1';

// -- Design Bounds -----------------------------------------------------------

/** Maximum number of nodes (cells/components) in a single design. */
export const MAX_DESIGN_NODES = 100;

/**
 * Reserved bound for a future persistent motif library.
 * Currently no library exists — motifs are stateless (extract/instantiate).
 * This constant is forward-compat: code that builds a library should
 * enforce size <= MAX_MOTIFS.
 */
export const MAX_MOTIFS = 50;

// -- Grid Cell ---------------------------------------------------------------

/**
 * A single cell in a design grid.
 * Domain-agnostic: could be a block, a component, a structural element.
 */
export interface P08GridCellV1 {
  /** X coordinate in the design grid. */
  readonly x: number;
  /** Z coordinate in the design grid (2D grid; Y used for 3D if needed). */
  readonly z: number;
  /** Type of element at this position (opaque domain string). */
  readonly cellType: string;
}

// -- Design State ------------------------------------------------------------

/**
 * A partial or complete design in the search space.
 * The state being explored by the synthesis process.
 */
export interface P08DesignStateV1 {
  /** Width of the design grid. */
  readonly width: number;
  /** Depth of the design grid. */
  readonly depth: number;
  /**
   * Cells in the design. Key is "x,z" coordinate string.
   * Using Record instead of Map for JSON-serializability and deterministic hashing.
   */
  readonly cells: Readonly<Record<string, P08GridCellV1>>;
  /** Number of placed cells (for bound checking). */
  readonly nodeCount: number;
}

// -- Design Operator ---------------------------------------------------------

/**
 * An operator that modifies a design state.
 * Domain-agnostic: place block, add component, connect wire, etc.
 */
export interface P08DesignOperatorV1 {
  /** Stable identifier for this operator. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Type of cell this operator places/modifies. */
  readonly cellType: string;
  /** Cost of applying this operator (for search ordering). */
  readonly cost: number;
}

// -- Spec Result -------------------------------------------------------------

/**
 * Result of evaluating a design against a behavioral specification.
 *
 * Pivot 4: spec is a boolean predicate — `satisfied` is the only
 * decision-relevant field. `violations` and `metrics` are for
 * explanation/debugging only, NOT used in search state.
 */
export interface P08SpecResultV1 {
  /** Whether the design satisfies the spec. THE authoritative field. */
  readonly satisfied: boolean;
  /** Human-readable violation descriptions (for explanation only). */
  readonly violations: readonly string[];
  /** Numeric metrics (for debugging/audit only; not in search state). */
  readonly metrics: Readonly<Record<string, number>>;
}

// -- Behavioral Specification ------------------------------------------------

/**
 * A behavioral specification that designs must satisfy.
 * Domain-agnostic: describes what the design must achieve.
 */
export interface P08BehavioralSpecV1 {
  /** Stable identifier for this spec. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /**
   * Domain-specific spec parameters (opaque).
   * Each domain defines what these mean (min coverage, signal path, etc.).
   */
  readonly params: Readonly<Record<string, number>>;
  /** Maximum design footprint allowed. */
  readonly maxFootprint: { readonly width: number; readonly depth: number };
}

// -- Motif -------------------------------------------------------------------

/**
 * A reusable design sub-pattern (motif).
 * Extracted from successful designs and stored in a bounded library.
 */
export interface P08MotifV1 {
  /** Content-addressed identifier (hash of pattern). */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Relative cell positions that make up this motif. */
  readonly pattern: readonly P08GridCellV1[];
  /** How many times this motif appeared in successful designs. */
  readonly successCount: number;
}

// -- Adapter Interface -------------------------------------------------------

/**
 * Minimal adapter interface that a domain must implement
 * to satisfy P08 conformance.
 *
 * All methods must be pure (deterministic, no side effects)
 * unless explicitly noted.
 */
export interface P08SynthesisAdapter {
  /**
   * Create an empty design state with the given dimensions.
   * Must be deterministic.
   */
  createEmptyDesign(width: number, depth: number): P08DesignStateV1;

  /**
   * Apply an operator to a design state at a given position.
   * Must be deterministic: same design + operator + position = same result.
   * Must enforce MAX_DESIGN_NODES (return null if at cap).
   * Must enforce footprint bounds from spec.
   */
  applyOperator(
    design: P08DesignStateV1,
    operator: P08DesignOperatorV1,
    x: number,
    z: number,
  ): P08DesignStateV1 | null;

  /**
   * Evaluate a design against a behavioral specification.
   * Must be deterministic: same design + spec = same result.
   * Must return boolean `satisfied` (Pivot 4: spec as predicate).
   */
  evaluateSpec(
    design: P08DesignStateV1,
    spec: P08BehavioralSpecV1,
  ): P08SpecResultV1;

  /**
   * Compute a content-addressed hash of a design.
   * Must be deterministic.
   * Must canonicalize for symmetry (Pivot 3): equivalent designs
   * (rotations) must produce the same hash.
   */
  hashDesign(design: P08DesignStateV1): string;

  /**
   * Extract a motif (reusable sub-pattern) from a design region.
   * Motif cells use relative coordinates (origin at 0,0).
   * Must be deterministic.
   */
  extractMotif(
    design: P08DesignStateV1,
    regionX: number,
    regionZ: number,
    regionWidth: number,
    regionDepth: number,
  ): P08MotifV1;

  /**
   * Instantiate a motif into a design at a given offset.
   * Must be deterministic: same motif + offset = same cells placed.
   * Must not exceed MAX_DESIGN_NODES.
   */
  instantiateMotif(
    design: P08DesignStateV1,
    motif: P08MotifV1,
    offsetX: number,
    offsetZ: number,
  ): P08DesignStateV1 | null;

  /** Maximum design nodes this adapter supports. */
  readonly maxDesignNodes: number;

  /** Maximum motifs this adapter supports. */
  readonly maxMotifs: number;
}

// -- Invariants --------------------------------------------------------------

/**
 * P08 conformance invariants.
 * Each maps directly to one of the 5 Rig H certification pivots.
 */
export const P08_INVARIANTS = [
  /** Same design + spec produces identical evaluation result. */
  'deterministic_evaluation',
  /** Design node count never exceeds MAX_DESIGN_NODES. */
  'bounded_design',
  /** Equivalent designs (rotations) produce the same canonical hash. */
  'symmetry_canonicalization',
  /** Spec evaluation returns boolean predicate, not raw metrics. */
  'spec_predicate',
  /** Motif instantiation respects design bounds; MAX_MOTIFS reserved for future library. */
  'bounded_motifs',
] as const;

export type P08Invariant = (typeof P08_INVARIANTS)[number];

// -- Capability Descriptor ---------------------------------------------------

export type P08ClaimId = 'p08';

export interface P08CapabilityDescriptor {
  /** Explicit claim identifier. */
  readonly claim_id: P08ClaimId;
  /** Contract version. */
  readonly contract_version: P08ContractVersion;
  /** Which invariants this adapter claims to satisfy. */
  readonly invariants: readonly P08Invariant[];
  /** Maximum design nodes. */
  readonly maxDesignNodes: number;
  /** Maximum motifs. */
  readonly maxMotifs: number;
  /** Content hash of conformance suite source (placeholder until CI generates). */
  readonly suite_hash?: string;
}

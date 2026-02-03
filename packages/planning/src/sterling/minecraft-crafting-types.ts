/**
 * Minecraft Crafting Domain Type Definitions
 *
 * Types for integrating Minecraft crafting with Sterling's graph-search solver.
 * The crafting domain models inventory states as graph nodes and crafting/mining
 * actions as edges, allowing Sterling's A* with path-algebra learning to find
 * optimal crafting sequences.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Inventory
// ============================================================================

/** A single item stack in the bot's inventory */
export interface CraftingInventoryItem {
  name: string;   // e.g. "oak_log", "stick"
  count: number;
}

/** Canonical inventory state — sorted by name for deterministic hashing */
export type CraftingInventory = CraftingInventoryItem[];

// ============================================================================
// Rules
// ============================================================================

/** A crafting rule that Sterling can expand during graph search */
export interface MinecraftCraftingRule {
  /** Unique action identifier, e.g. "craft:oak_planks", "mine:oak_log" */
  action: string;
  /** Action category for leaf mapping */
  actionType: 'craft' | 'mine' | 'smelt' | 'place';
  /** What the action produces */
  produces: CraftingInventoryItem[];
  /** What the action consumes from inventory */
  consumes: CraftingInventoryItem[];
  /** Items that must be in inventory but are NOT consumed */
  requires: CraftingInventoryItem[];
  /** Whether a crafting table must be nearby / placed */
  needsTable: boolean;
  /** Whether a furnace must be nearby */
  needsFurnace: boolean;
  /** Base cost for A* heuristic (lower = preferred) */
  baseCost: number;

  // ── Temporal annotations (Rig C, Phase 3A) ──────────────────────
  // Populated by temporal enrichment when temporalMode !== 'off'.
  // Never sent to Sterling in local_only mode.

  /** Duration in ticks for this operation (from duration model). */
  durationTicks?: number;
  /** Slot type required, if any (from duration model). */
  requiresSlotType?: string;
}

// ============================================================================
// Solve Request / Response
// ============================================================================

/** Parameters sent to Sterling's minecraft domain solver */
export interface MinecraftSolveRequest {
  inventory: Record<string, number>;   // current inventory as {name: count}
  goal: Record<string, number>;        // target items as {name: count}
  nearbyBlocks: string[];              // blocks the bot can see/reach
  rules: MinecraftCraftingRule[];      // full rule set
  maxNodes?: number;
  useLearning?: boolean;

  // ── Temporal state (Rig C, Phase 3A) ────────────────────────────
  // Only populated when temporalMode === 'sterling_temporal'.
  // When present, Sterling can use temporal fields for scheduling.

  /** Current time in integer buckets. */
  currentTickBucket?: number;
  /** Planning horizon in integer buckets. */
  horizonBucket?: number;
  /** Bucket granularity in domain ticks. */
  bucketSizeTicks?: number;
  /** Resource slot states with availability times. */
  slots?: import('./primitives/p03/p03-capsule-types').P03ResourceSlotV1[];
}

/** A single step in the Sterling solution path */
export interface MinecraftSolveStep {
  action: string;              // rule action id
  actionType: 'craft' | 'mine' | 'smelt' | 'place';
  produces: CraftingInventoryItem[];
  consumes: CraftingInventoryItem[];
  resultingInventory: Record<string, number>;
  /** True when this step could not be mapped to a known rule. */
  degraded?: boolean;
  /** Why this step is degraded: no label found, or label didn't match any rule. */
  degradedReason?: 'no_label' | 'unmatched_rule';
}

/** Full result from the crafting solver */
export interface MinecraftCraftingSolveResult {
  solved: boolean;
  steps: MinecraftSolveStep[];
  totalNodes: number;
  durationMs: number;
  error?: string;
  /** Sterling planId for episode reporting — store in task metadata, not on solver */
  planId?: string | null;
  /** Observability metadata — does not affect solve behavior */
  solveMeta?: { bundles: import('./solve-bundle-types').SolveBundle[] };
  /** True when step mapping encountered edges that could not be mapped to rules. */
  mappingDegraded?: boolean;
  /** Number of solution path edges with no action label from either source. */
  noActionLabelEdges?: number;
  /** Number of edges with a label that didn't match any known rule action. */
  unmatchedRuleEdges?: number;
  /** Number of search_edge (source,target) pairs with conflicting action names. */
  searchEdgeCollisions?: number;
  /** Solve-time join keys for deferred episode reporting */
  solveJoinKeys?: import('./solve-bundle-types').SolveJoinKeys;
}

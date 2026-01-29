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
}

/** A single step in the Sterling solution path */
export interface MinecraftSolveStep {
  action: string;              // rule action id
  actionType: 'craft' | 'mine' | 'smelt' | 'place';
  produces: CraftingInventoryItem[];
  consumes: CraftingInventoryItem[];
  resultingInventory: Record<string, number>;
}

/** Full result from the crafting solver */
export interface MinecraftCraftingSolveResult {
  solved: boolean;
  steps: MinecraftSolveStep[];
  totalNodes: number;
  durationMs: number;
  error?: string;
}

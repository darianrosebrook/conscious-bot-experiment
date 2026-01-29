/**
 * Minecraft Building Domain Type Definitions
 *
 * Types for integrating Minecraft building with Sterling's module-sequenced
 * assembly solver. The building domain models assembly state as a progress
 * bitmask over modules, and searches over module application sequences.
 *
 * Material deficits produce out-of-band 'needs_materials' results —
 * Sterling does NOT mutate inventory to represent off-graph acquisition.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Materials
// ============================================================================

/** A material requirement for a building module */
export interface BuildingMaterial {
  name: string;
  count: number;
}

// ============================================================================
// Module Types
// ============================================================================

/** Building module types — NO 'ensure_mats' (material acquisition is out-of-band) */
export type BuildingModuleType = 'prep_site' | 'apply_module' | 'place_feature';

/** A building module that the bot can apply */
export interface BuildingModule {
  moduleId: string;
  moduleType: BuildingModuleType;
  requiresModules: string[];
  materialsNeeded: BuildingMaterial[];
  /** Client-computed site feasibility */
  placementFeasible: boolean;
  baseCost: number;
}

// ============================================================================
// Site State
// ============================================================================

/** Coarse terrain categories for site characterization */
export type TerrainCategory = 'flat' | 'hilly' | 'cliff' | 'water' | 'forest';

/** Coarse site characterization — NOT fine-grained block data */
export interface BuildingSiteState {
  terrain: TerrainCategory;
  biome: string;
  hasTreesNearby: boolean;
  hasWaterNearby: boolean;
  /** Client-computed footprint capability hash (e.g. "flat_5x5_clear") */
  siteCaps: string;
}

// ============================================================================
// Solve Request / Response
// ============================================================================

/** Parameters sent to Sterling's building domain solver */
export interface BuildingSolveRequest {
  templateId: string;
  facing: string;
  /** Required module IDs that define build completion */
  goalModules: string[];
  inventory: Record<string, number>;
  siteState: BuildingSiteState;
  modules: BuildingModule[];
  maxNodes?: number;
  useLearning?: boolean;
}

/** A single step in the building solution path */
export interface BuildingSolveStep {
  moduleId: string;
  moduleType: BuildingModuleType;
  materialsNeeded: BuildingMaterial[];
  resultingProgress: number;
  resultingInventory: Record<string, number>;
}

/** Material deficit — returned out-of-band when materials are insufficient */
export interface BuildingMaterialDeficit {
  deficit: Record<string, number>;
  blockedModules: string[];
  currentProgress: number;
}

/** Full result from the building solver */
export interface BuildingSolveResult {
  solved: boolean;
  steps: BuildingSolveStep[];
  totalNodes: number;
  durationMs: number;
  error?: string;
  /** Out-of-band material deficit (present when materials insufficient) */
  needsMaterials?: BuildingMaterialDeficit;
  /** Sterling planId for episode reporting — store in task metadata, not on solver */
  planId?: string | null;
  /** Observability metadata — does not affect solve behavior */
  solveMeta?: { bundles: import('./solve-bundle-types').SolveBundle[] };
}

// ============================================================================
// Episode Reporting
// ============================================================================

/** Execution feedback sent back to Sterling for learning updates */
export interface BuildingEpisodeReport {
  planId: string;
  templateId: string;
  success: boolean;
  /** Module IDs actually executed (not just a count) */
  executedModuleIds: string[];
  /** Which module failed (if any) */
  failureAtModuleId?: string;
  /** Why it failed */
  failureReason?: string;
}

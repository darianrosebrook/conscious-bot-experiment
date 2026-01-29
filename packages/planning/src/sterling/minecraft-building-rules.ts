/**
 * Minecraft Building Rules Builder
 *
 * Helpers for constructing building module lists and site state from bot
 * world observations. The TypeScript client computes placementFeasible
 * and siteCaps locally — Sterling only sees the results.
 *
 * @author @darianrosebrook
 */

import type {
  BuildingModule,
  BuildingMaterial,
  BuildingSiteState,
  TerrainCategory,
} from './minecraft-building-types';

// ============================================================================
// Template types (internal)
// ============================================================================

/** A building template that defines module structure */
export interface BuildingTemplate {
  templateId: string;
  /** All module definitions for the template */
  modules: BuildingModuleDefinition[];
  /** Default goal modules (can be overridden at solve time) */
  defaultGoalModules: string[];
  /** Facing direction */
  facing: string;
}

/** A module definition in a template (before feasibility check) */
export interface BuildingModuleDefinition {
  moduleId: string;
  moduleType: 'prep_site' | 'apply_module' | 'place_feature';
  requiresModules: string[];
  materialsNeeded: BuildingMaterial[];
  baseCost: number;
}

// ============================================================================
// Module builder helpers
// ============================================================================

/**
 * Generate the BuildingModule list for a template by applying feasibility
 * checks against the current world state.
 *
 * Each module's placementFeasible is determined by the bot's local world
 * checks (e.g. can it physically place blocks at this location).
 *
 * @param template - The building template
 * @param feasibilityCheck - Client function that checks per-module feasibility
 */
export function buildModulesWithFeasibility(
  template: BuildingTemplate,
  feasibilityCheck: (moduleId: string) => boolean
): BuildingModule[] {
  return template.modules.map((def) => ({
    moduleId: def.moduleId,
    moduleType: def.moduleType,
    requiresModules: def.requiresModules,
    materialsNeeded: def.materialsNeeded,
    placementFeasible: feasibilityCheck(def.moduleId),
    baseCost: def.baseCost,
  }));
}

/**
 * Extract building-relevant inventory from a Mineflayer-style inventory.
 *
 * Filters to items that are used as building materials.
 */
export function inventoryForBuilding(
  items: Array<{ name: string; count: number } | null | undefined>,
  relevantItems?: Set<string>
): Record<string, number> {
  const record: Record<string, number> = {};
  for (const item of items) {
    if (!item || !item.name) continue;
    if (relevantItems && !relevantItems.has(item.name)) continue;
    record[item.name] = (record[item.name] || 0) + item.count;
  }
  return record;
}

/**
 * Collect the set of all material names needed by a template's modules.
 */
export function getRelevantMaterials(
  modules: BuildingModuleDefinition[]
): Set<string> {
  const materials = new Set<string>();
  for (const mod of modules) {
    for (const mat of mod.materialsNeeded) {
      materials.add(mat.name);
    }
  }
  return materials;
}

/**
 * Derive a BuildingSiteState from bot perception data.
 *
 * The caller provides terrain analysis results — this function
 * structures them into the format Sterling expects.
 *
 * @param terrain - Terrain category
 * @param biome - Biome name
 * @param treesNearby - Whether trees are within reach
 * @param waterNearby - Whether water is within reach
 * @param siteCaps - Client-computed footprint capability hash
 */
export function buildSiteState(
  terrain: TerrainCategory,
  biome: string,
  treesNearby: boolean,
  waterNearby: boolean,
  siteCaps: string
): BuildingSiteState {
  return {
    terrain,
    biome,
    hasTreesNearby: treesNearby,
    hasWaterNearby: waterNearby,
    siteCaps,
  };
}

/**
 * Compute a simple site capability hash from dimensions and clearance.
 *
 * This is a client-side approximation — Sterling uses it as an opaque
 * identity token, not for geometric reasoning.
 *
 * @param terrainFlat - Whether the terrain is flat enough
 * @param width - Footprint width
 * @param depth - Footprint depth
 * @param clearPercentage - Percentage of blocks that are clear (0-100)
 */
export function computeSiteCaps(
  terrainFlat: boolean,
  width: number,
  depth: number,
  clearPercentage: number
): string {
  const flatness = terrainFlat ? 'flat' : 'uneven';
  const clear = clearPercentage >= 90 ? 'clear' : clearPercentage >= 50 ? 'partial' : 'blocked';
  return `${flatness}_${width}x${depth}_${clear}`;
}

// ============================================================================
// Hardcoded Templates
// ============================================================================

/**
 * Basic 5x5 shelter template with deterministic ordering.
 *
 * All arrays are sorted for reproducible digests:
 * - modules sorted by moduleId alphabetically
 * - requiresModules sorted alphabetically
 * - materialsNeeded sorted by name
 * - goalModules sorted alphabetically
 *
 * Returns a frozen object to prevent accidental mutation.
 */
export function getBasicShelterTemplate(): BuildingTemplate {
  const modules: BuildingModuleDefinition[] = [
    {
      moduleId: 'clear_site',
      moduleType: 'prep_site',
      requiresModules: [],
      materialsNeeded: [],
      baseCost: 2.0,
    },
    {
      moduleId: 'door_south',
      moduleType: 'place_feature',
      requiresModules: ['walls_cobble_3h'],
      materialsNeeded: [{ name: 'oak_door', count: 1 }],
      baseCost: 1.0,
    },
    {
      moduleId: 'foundation_5x5',
      moduleType: 'apply_module',
      requiresModules: ['clear_site'],
      materialsNeeded: [{ name: 'cobblestone', count: 25 }],
      baseCost: 3.0,
    },
    {
      moduleId: 'lighting_pass',
      moduleType: 'place_feature',
      requiresModules: ['roof_slab'],
      materialsNeeded: [{ name: 'torch', count: 4 }],
      baseCost: 1.0,
    },
    {
      moduleId: 'place_bed',
      moduleType: 'place_feature',
      requiresModules: ['foundation_5x5'],
      materialsNeeded: [{ name: 'bed', count: 1 }],
      baseCost: 0.5,
    },
    {
      moduleId: 'roof_slab',
      moduleType: 'apply_module',
      requiresModules: ['walls_cobble_3h'],
      materialsNeeded: [{ name: 'oak_planks', count: 15 }],
      baseCost: 3.0,
    },
    {
      moduleId: 'walls_cobble_3h',
      moduleType: 'apply_module',
      requiresModules: ['foundation_5x5'],
      materialsNeeded: [{ name: 'cobblestone', count: 20 }],
      baseCost: 4.0,
    },
  ];

  return Object.freeze({
    templateId: 'basic_shelter_5x5',
    modules,
    defaultGoalModules: ['door_south', 'foundation_5x5', 'roof_slab', 'walls_cobble_3h'],
    facing: 'N',
  });
}

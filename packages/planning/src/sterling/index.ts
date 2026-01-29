/**
 * Sterling reasoning integration for planning
 */

export { SterlingReasoningService } from './sterling-reasoning-service';
export type {
  SterlingReasoningConfig,
  ReachabilityResult,
  KGTraversalResult,
} from './sterling-reasoning-service';

// Minecraft crafting domain
export { MinecraftCraftingSolver } from './minecraft-crafting-solver';
export {
  buildCraftingRules,
  inventoryToRecord,
  goalFromTaskRequirement,
} from './minecraft-crafting-rules';
export type {
  MinecraftCraftingRule,
  CraftingInventory,
  CraftingInventoryItem,
  MinecraftSolveRequest,
  MinecraftSolveStep,
  MinecraftCraftingSolveResult,
} from './minecraft-crafting-types';

// Minecraft building domain
export { MinecraftBuildingSolver } from './minecraft-building-solver';
export {
  buildModulesWithFeasibility,
  inventoryForBuilding,
  getRelevantMaterials,
  buildSiteState,
  computeSiteCaps,
} from './minecraft-building-rules';
export type {
  BuildingTemplate,
  BuildingModuleDefinition,
} from './minecraft-building-rules';
export type {
  BuildingMaterial,
  BuildingModuleType,
  BuildingModule,
  TerrainCategory,
  BuildingSiteState,
  BuildingSolveRequest,
  BuildingSolveStep,
  BuildingMaterialDeficit,
  BuildingSolveResult,
  BuildingEpisodeReport,
} from './minecraft-building-types';

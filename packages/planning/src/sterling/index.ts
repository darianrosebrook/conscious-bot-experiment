/**
 * Sterling reasoning integration for planning
 */

export { BaseDomainSolver } from './base-domain-solver';
export type { BaseSolveResult } from './base-domain-solver';

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
  getBasicShelterTemplate,
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

// Minecraft tool progression domain
export { MinecraftToolProgressionSolver } from './minecraft-tool-progression-solver';
export {
  buildToolProgressionRules,
  detectCurrentTier,
  parseToolName,
  validateInventoryInput,
  filterCapTokens,
  filterCapTokenItems,
} from './minecraft-tool-progression-rules';
export type {
  ToolTier,
  ToolType,
  ToolProgressionRule,
  ToolProgressionItem,
  ToolProgressionStep,
  ToolProgressionSolveResult,
  NeedsBlocks,
  ToolProgressionEpisodeReport,
} from './minecraft-tool-progression-types';
export {
  TOOL_TIERS,
  CAP_PREFIX,
  TIER_GATE_MATRIX,
  TIER_MATRIX_VERSION,
  ORE_DROP_MAP,
  PICKAXE_RECIPES,
  SMELT_RECIPES,
} from './minecraft-tool-progression-types';

// Evidence infrastructure
export type {
  SolveBundle,
  SolveBundleInput,
  SolveBundleOutput,
  CompatReport,
  CompatIssue,
  CompatSeverity,
  SearchHealthMetrics,
  DegeneracyReport,
  ContentHash,
  ObjectiveWeights,
  ObjectiveWeightsSource,
  SolveRationale,
} from './solve-bundle-types';
export { DEFAULT_OBJECTIVE_WEIGHTS } from './solve-bundle-types';
export type { LintableRule, LintContext } from './compat-linter';
export {
  canonicalize,
  contentHash,
  CanonicalizeError,
  hashDefinition,
  hashInventoryState,
  hashGoal,
  hashNearbyBlocks,
  hashSteps,
  computeBundleInput,
  computeBundleOutput,
  createSolveBundle,
  INVENTORY_HASH_CAP,
} from './solve-bundle';
export { lintRules, lintGoal } from './compat-linter';
export { parseSearchHealth, detectHeuristicDegeneracy } from './search-health';

// P21 Primitive Capsule (contract types + reference fixtures only)
export type {
  P21EvidenceItem,
  P21EvidenceBatch,
  P21TrackSummary,
  P21Visibility,
  P21Snapshot,
  P21SaliencyDelta,
  P21DeltaType,
  P21Envelope,
  P21RiskLevel,
  P21RiskClassifier,
  P21ImplementationAdapter,
  P21EmissionAdapter,
  P21Invariant,
  P21AInvariant,
  P21BInvariant,
  P21BeliefMode,
  P21RiskDetail,
  P21Extension,
  P21ClaimId,
  P21ACapabilityDescriptor,
  P21BCapabilityDescriptor,
  P21CapabilityDescriptor,
} from './primitives/p21';
export {
  P21_INVARIANTS,
  P21A_INVARIANTS,
  P21B_INVARIANTS,
  RISK_LEVEL_ORDER,
} from './primitives/p21';
export {
  MOB_DOMAIN_CLASSIFIER,
  SECURITY_DOMAIN_CLASSIFIER,
} from './primitives/p21';

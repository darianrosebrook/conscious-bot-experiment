/**
 * Sterling reasoning integration for planning
 */

// Solver ID constants (single source of truth)
export {
  SOLVER_IDS,
  isValidSolverId,
  getAcquisitionStrategySolverId,
} from './solver-ids';
export type { SolverId } from './solver-ids';

export { BaseDomainSolver } from './base-domain-solver';
export type { BaseSolveResult, DeclarationMode } from './base-domain-solver';

export { SterlingReasoningService } from './sterling-reasoning-service';
export type {
  SterlingReasoningConfig,
  ReachabilityResult,
  KGTraversalResult,
} from './sterling-reasoning-service';

// Minecraft crafting domain
export {
  MinecraftCraftingSolver,
  CRAFTING_DECLARATION,
} from './minecraft-crafting-solver';
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
export {
  MinecraftBuildingSolver,
  BUILDING_DECLARATION,
} from './minecraft-building-solver';
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

// Minecraft furnace scheduling domain
export { MinecraftFurnaceSolver } from './minecraft-furnace-solver';
export {
  buildFurnaceRules,
  buildFurnaceGoal,
  checkSlotPrecondition,
  SMELTABLE_ITEMS,
} from './minecraft-furnace-rules';
export type {
  FurnaceSlotState,
  FurnaceSearchState,
  FurnaceSchedulingRule,
  FurnaceOperatorFamily,
  FurnaceSolveStep,
  FurnaceSchedulingSolveResult,
  FurnaceEpisodeReport,
} from './minecraft-furnace-types';
export { FURNACE_HASH_EXCLUDED_FIELDS } from './minecraft-furnace-types';

// Minecraft tool progression domain
export {
  MinecraftToolProgressionSolver,
  TOOL_PROGRESSION_DECLARATION,
} from './minecraft-tool-progression-solver';
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

// Minecraft acquisition domain (Rig D)
export {
  MinecraftAcquisitionSolver,
  ACQUISITION_DECLARATION,
} from './minecraft-acquisition-solver';
export {
  buildTradeRules,
  buildLootRules,
  buildSalvageRules,
} from './minecraft-acquisition-solver';
export {
  buildAcquisitionContext,
  buildAcquisitionStrategies,
  buildSalvageCandidatesWithInventory,
  rankStrategies,
  distanceToBucket,
  contextKeyFromAcquisitionContext,
  MINECRAFT_TRADE_TABLE,
  MINECRAFT_LOOT_TABLE,
  MINECRAFT_SALVAGE_TABLE,
} from './minecraft-acquisition-rules';
export type { NearbyEntity } from './minecraft-acquisition-rules';
export { StrategyPriorStore } from './minecraft-acquisition-priors';
export type {
  AcquisitionStrategy,
  AcquisitionFeasibility,
  AcquisitionContextV1,
  AcquisitionCandidate,
  AcquisitionSolveResult,
  AcquisitionSolveStep,
  StrategyPrior,
  AcquisitionEpisodeReport,
} from './minecraft-acquisition-types';
export {
  hashAcquisitionContext,
  computeCandidateSetDigest,
  PRIOR_MIN,
  PRIOR_MAX,
} from './minecraft-acquisition-types';
export {
  actionToAcquisitionLeaf,
  parsePlaceAction,
  WORKSTATION_TYPES,
} from './leaf-routing';

// Minecraft navigation domain
export { MinecraftNavigationSolver } from './minecraft-navigation-solver';
export type {
  OccupancyGrid,
  NavigationHazardPolicy,
  NavigationPrimitive,
  NavigationSolveResult,
  NavigationActionType,
} from './minecraft-navigation-types';
export {
  BLOCK_TYPE,
  MOVEMENT_COSTS,
  CARDINAL_DIRECTIONS,
  DEFAULT_HAZARD_POLICY,
  gridAt,
  isPassable,
  isSolid,
  hashOccupancyGrid,
  encodeGridToBase64,
  computeHazardPolicyId,
  hasArrived,
  computeNavigationHeuristic,
  hashNavigationGoal,
  hashNavigationStart,
} from './minecraft-navigation-types';

// Rig D signals + degeneracy detection
export { computeRigDSignals } from './signals-rig-d';
export type { RigDSignals } from './signals-rig-d';
export { detectStrategyDegeneracy } from './degeneracy-detection';
export type { StrategyDegeneracyReport } from './degeneracy-detection';

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
  EpisodeLinkage,
  EpisodeOutcomeClass,
  OutcomeClassSource,
  ClassifiedOutcome,
  EpisodeAck,
  SolveJoinKeys,
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
  computeLeafRegistryDigest,
  computeLeafContractDigest,
  computeLeafContractRequiredDigest,
  INVENTORY_HASH_CAP,
} from './solve-bundle';
export { lintRules, lintGoal } from './compat-linter';
export { parseSearchHealth, detectHeuristicDegeneracy } from './search-health';

// Domain declarations (Phase 2A)
export type { DomainDeclarationV1 } from './domain-declaration';
export {
  computeDeclarationDigest,
  computeRegistrationDigest,
  validateDeclaration,
  buildRegisterMessage,
  buildGetMessage,
} from './domain-declaration';

// Episode classification (Phase 2C)
export {
  classifyOutcome,
  extractSolveJoinKeys,
  // Canonical linkage builders (use these)
  buildSterlingEpisodeLinkage,
  buildSterlingEpisodeLinkageFromResult,
  // Legacy aliases (deprecated, for backward compat)
  buildEpisodeLinkage,
  buildEpisodeLinkageFromResult,
} from './episode-classification';

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

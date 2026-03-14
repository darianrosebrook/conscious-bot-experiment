/**
 * Sterling solver orchestration: generateDynamicSteps, fetchBotContext,
 * routeActionPlan integration. Single place for Sterling-backed step generation.
 *
 * @author @darianrosebrook
 */

import { createRequire } from 'module';
import type { BaseDomainSolver } from '../sterling/base-domain-solver';
import type { MinecraftCraftingSolver } from '../sterling/minecraft-crafting-solver';
import type { MinecraftBuildingSolver } from '../sterling/minecraft-building-solver';
import type { MinecraftToolProgressionSolver } from '../sterling/minecraft-tool-progression-solver';
import type { MinecraftAcquisitionSolver } from '../sterling/minecraft-acquisition-solver';
import { SOLVER_IDS } from '../sterling/solver-ids';
import { resolveRequirement } from '../modules/requirements';
import type { TaskRequirement } from '../modules/requirements';
import { routeActionPlan, buildDecisionRecordForRig } from '../modules/action-plan-backend';
import type { DeclarationLookup } from '../modules/action-plan-backend';
import { requirementToFallbackPlan } from '../modules/leaf-arg-contracts';
import { buildCraftingRules, inventoryToRecord } from '../sterling/minecraft-crafting-rules';
import type { DomainDeclarationV1 } from '../sterling/domain-declaration';

/** Mapping from rig letter to solver ID constant. */
const RIG_TO_SOLVER_ID: Record<string, string> = {
  A: SOLVER_IDS.CRAFTING,
  B: SOLVER_IDS.TOOL_PROGRESSION,
  C: SOLVER_IDS.FURNACE,
  D: SOLVER_IDS.ACQUISITION,
  E: SOLVER_IDS.NAVIGATION,
  G: SOLVER_IDS.BUILDING,
};
import type { Task } from '../types/task';
import type { TaskStep } from '../types/task-step';
import type { PlanningDecision } from '../constraints/planning-decisions';
import type { RigGMetadata } from '../constraints/execution-advisor';
import { findCommutingPairs } from '../constraints/dag-builder';
import type { MacroPlanner } from '../hierarchical/macro-planner';
import type { MacroPlan, MacroEdge, MacroEdgeSession } from '../hierarchical/macro-state';
import { createMacroEdgeSession, finalizeSession } from '../hierarchical/macro-state';
import type { FeedbackStore } from '../hierarchical/feedback';
import type { MicroOutcome } from '../hierarchical/macro-state';

export interface StepGenerationResult {
  steps: TaskStep[];
  noStepsReason?: 'no-requirement' | 'unplannable' | 'solver-error' | 'solver-unsolved'
    | 'context-unavailable' | 'compiler-empty' | 'blocked-sentinel' | 'advisory-skip';
  route?: { backend: string; requiredRig: string | null; reason: string };
  planId?: string;
  /** M2b: Capability decision record for the route that produced these steps. */
  capabilityDecision?: import('../modules/solve-contract').CapabilityDecisionRecord;
}

/** Callback type for resolve_intent_steps — matches SterlingReasoningService.resolveIntentSteps signature. */
export type ResolveIntentStepsFn = (
  request: {
    intent_steps: Array<{ leaf: string; args: Record<string, unknown> }>;
    world_state: {
      inventory: Record<string, number>;
      nearby_blocks: string[];
      nearby_blocks_known?: boolean;
      nearby_block_counts?: Record<string, number>;
      preferred_base_items?: string[];
      scan_meta?: { radius: number; scanned_at: number; biome: string };
    };
    rules?: Array<Record<string, unknown>>;
    schema_version?: string;
    request_id?: string;
  },
  timeoutMs?: number,
) => Promise<
  | {
      status: 'ok';
      replacements: Array<{
        intent_step_index: number;
        resolved: boolean;
        steps?: Array<{ leaf: string; args: Record<string, unknown> }>;
        unresolved_reason?: string;
        blocked_info?: {
          frontier_items?: string[] | null;
          nearby_blocks_gap?: string[] | null;
          total_nodes_explored?: number | null;
        };
      }>;
      plan_bundle_digest: string;
      schema_version?: string;
    }
  | { status: 'blocked'; blocked_reason: string }
  | { status: 'error'; error: string }
>;

export interface SterlingPlannerOptions {
  /** HTTP get for Minecraft interface (path, opts) => Response */
  minecraftGet: (
    path: string,
    opts?: { timeout?: number }
  ) => Promise<Response>;
  /** Optional HTTP post for world service (path, body, opts) => Response.
   *  When wired, fetchBotContext merges perception-observed block types into
   *  nearbyBlockCounts so the solver sees what the bot has *looked at*, not
   *  just an omniscient 8-block radius cube scan. */
  worldPost?: (
    path: string,
    body: unknown,
    opts?: { timeout?: number }
  ) => Promise<Response>;
}

/** Returns the single goal item string for acquisition solver from a TaskRequirement. */
function getAcquisitionGoalItem(req: TaskRequirement): string | undefined {
  switch (req.kind) {
    case 'craft':
      return req.outputPattern;
    case 'collect':
    case 'mine':
      return req.patterns?.[0];
    case 'tool_progression':
      return req.targetTool;
    case 'build':
      return req.structure;
    case 'navigate':
      return req.destination;
    case 'explore':
    case 'find':
      return req.target;
    default:
      return undefined;
  }
}

function deriveLeafArgs(
  meta: Record<string, unknown>
): Record<string, unknown> | undefined {
  // Skip degraded steps — don't manufacture nonsense args from empty produces/consumes
  if (meta.degraded) return undefined;
  const leaf = meta.leaf as string | undefined;
  if (!leaf) return undefined;
  const produces =
    (meta.produces as Array<{ name: string; count: number }>) || [];
  const consumes =
    (meta.consumes as Array<{ name: string; count: number }>) || [];

  switch (leaf) {
    case 'dig_block': {
      const item = produces[0];
      return { blockType: item?.name || '_log' };
    }
    case 'craft_recipe': {
      const output = produces[0];
      return { recipe: output?.name || 'unknown', qty: output?.count || 1 };
    }
    case 'smelt': {
      const consumed = consumes[0];
      return { input: consumed?.name || 'unknown' };
    }
    case 'place_workstation': {
      const workstation = (meta.workstation as string) || 'crafting_table';
      return { workstation };
    }
    case 'place_block': {
      const consumed = consumes[0];
      return { item: consumed?.name || 'crafting_table' };
    }
    case 'prepare_site':
    case 'build_module':
    case 'place_feature':
    case 'building_step':
    case 'acquire_material': {
      return {
        moduleId: meta.moduleId,
        item: meta.item,
        count: meta.count,
        ...((meta as any).args || {}),
      };
    }
    case 'explore_for_resources': {
      const args = (meta as any).args;
      if (args && typeof args === 'object') return args;
      return {
        resource_tags: meta.resource_tags,
        goal_item: meta.goal_item,
        reason: meta.reason,
      };
    }
    default:
      return undefined;
  }
}

/** Ensure taskData.metadata.solver exists for storing solver outputs. */
function ensureSolverMeta(taskData: Partial<Task>): NonNullable<NonNullable<Task['metadata']>['solver']> {
  taskData.metadata ??= {} as any;
  taskData.metadata!.solver ??= {};
  return taskData.metadata!.solver!;
}

export class SterlingPlanner {
  private readonly minecraftGet: SterlingPlannerOptions['minecraftGet'];
  private readonly worldPost: SterlingPlannerOptions['worldPost'];
  private readonly solverRegistry = new Map<string, BaseDomainSolver>();
  private _mcDataCache: any = null;

  /**
   * When set, Rig A crafting uses resolve_intent_steps (the authoritative
   * planning-resolution path) instead of solveCraftingGoal → command:'solve'.
   * This eliminates the parallel authority surface per MC-INT-01 AC-2.1.
   *
   * The direct solve command remains available for workbench/benchmark use
   * via solveCraftingGoal, but production CB planning routes through here.
   */
  private _resolveIntentSteps?: ResolveIntentStepsFn;

  /** Optional macro planner for hierarchical planning (Rig E) */
  private _macroPlanner?: MacroPlanner;
  /** Optional feedback store for macro cost updates (Rig E) */
  private _feedbackStore?: FeedbackStore;
  /** Active macro edge sessions keyed by sessionId */
  private readonly _activeSessions = new Map<string, MacroEdgeSession>();

  constructor(options: SterlingPlannerOptions) {
    this.minecraftGet = options.minecraftGet;
    this.worldPost = options.worldPost;
  }

  /**
   * Wire the authoritative resolve_intent_steps path for Rig A crafting.
   * When set, generateStepsFromSterling uses this instead of solveCraftingGoal.
   */
  setResolveIntentSteps(fn: ResolveIntentStepsFn | undefined): void {
    this._resolveIntentSteps = fn;
  }

  /**
   * M2: Build a DeclarationLookup from the solver registry.
   * Maps rig IDs to solver declarations and checks registration status
   * via each solver's registeredDigest getter.
   */
  private buildDeclarationLookup(): DeclarationLookup {
    return {
      getDeclarationForRig: (rigId: string): DomainDeclarationV1 | null => {
        const solverId = RIG_TO_SOLVER_ID[rigId];
        if (!solverId) return null;
        const solver = this.solverRegistry.get(solverId);
        if (!solver) return null;
        return (solver as any).getDomainDeclaration?.() ?? null;
      },
      isRegistered: (digest: string): boolean => {
        // Check all registered solvers — if any has this digest confirmed, it's registered
        for (const solver of this.solverRegistry.values()) {
          if (solver.registeredDigest === digest) return true;
        }
        return false;
      },
    };
  }

  /**
   * Set the macro planner for hierarchical planning.
   */
  setMacroPlanner(planner: MacroPlanner): void {
    this._macroPlanner = planner;
  }

  /**
   * Set the feedback store for macro cost updates.
   */
  setFeedbackStore(store: FeedbackStore): void {
    this._feedbackStore = store;
  }

  get macroPlanner(): MacroPlanner | undefined {
    return this._macroPlanner;
  }

  get feedbackStore(): FeedbackStore | undefined {
    return this._feedbackStore;
  }

  /**
   * Check whether the hierarchical planning subsystem is fully wired.
   * Both MacroPlanner and FeedbackStore must be set.
   */
  get isHierarchicalConfigured(): boolean {
    return !!this._macroPlanner && !!this._feedbackStore;
  }

  /**
   * Generate dynamic steps with hierarchical macro planning.
   *
   * Returns PlanningDecision containing steps, macro plan, and current edge.
   * If macro planner or feedback store is not configured, returns
   * blocked:planner_unconfigured — never silently falls through to flat planning.
   */
  async generateDynamicStepsHierarchical(
    taskData: Partial<Task>
  ): Promise<
    PlanningDecision<{
      steps: TaskStep[];
      macroPlan?: MacroPlan;
      currentEdge?: MacroEdge;
    }>
  > {
    if (!this._macroPlanner || !this._feedbackStore) {
      return {
        kind: 'blocked',
        reason: 'planner_unconfigured',
        detail: `Hierarchical planning requires both MacroPlanner and FeedbackStore. Missing: ${[
          !this._macroPlanner && 'MacroPlanner',
          !this._feedbackStore && 'FeedbackStore',
        ]
          .filter(Boolean)
          .join(', ')}`,
      };
    }

    const requirement = resolveRequirement(taskData);
    if (!requirement) {
      return {
        kind: 'blocked',
        reason: 'ontology_gap',
        detail: 'No requirement resolved from task data',
      };
    }

    const contextResult = this._macroPlanner.contextFromRequirement(
      requirement.kind
    );
    if (contextResult.kind !== 'ok') {
      return contextResult;
    }

    const { start, goal } = contextResult.value;
    const goalId = taskData.id || 'unknown';
    const pathResult = this._macroPlanner.planMacroPath(start, goal, goalId);

    if (pathResult.kind !== 'ok') {
      return pathResult;
    }

    const macroPlan = pathResult.value;

    if (macroPlan.edges.length === 0) {
      // Already at goal — generate micro steps directly
      const result = await this.generateDynamicSteps(taskData);
      return { kind: 'ok', value: { steps: result.steps, macroPlan } };
    }

    // For now, generate steps for the first macro edge
    const currentEdge = macroPlan.edges[0];
    const result = await this.generateDynamicSteps(taskData);
    const steps = result.steps;

    return {
      kind: 'ok',
      value: { steps, macroPlan, currentEdge },
    };
  }

  /**
   * Create a macro edge session for tracking micro execution.
   */
  createEdgeSession(
    edge: MacroEdge,
    leafStepsIssued: number
  ): MacroEdgeSession {
    const session = createMacroEdgeSession(edge, leafStepsIssued);
    this._activeSessions.set(session.sessionId, session);
    return session;
  }

  /**
   * Get an active session by ID.
   */
  getSession(sessionId: string): MacroEdgeSession | undefined {
    return this._activeSessions.get(sessionId);
  }

  /**
   * Finalize an edge session, produce MicroOutcome, report feedback.
   * Returns the outcome if this is the first finalization (exactly-once).
   */
  finalizeEdgeSession(sessionId: string): MicroOutcome | undefined {
    const session = this._activeSessions.get(sessionId);
    if (!session) return undefined;

    const outcome = finalizeSession(session);
    if (!outcome) return undefined; // Already reported

    // Report feedback if store is available
    if (this._feedbackStore && this._macroPlanner) {
      this._feedbackStore.recordOutcome(
        this._macroPlanner.getGraph(),
        outcome
      );
    }

    // Clean up session
    this._activeSessions.delete(sessionId);

    return outcome;
  }

  private get craftingSolver(): MinecraftCraftingSolver | undefined {
    return this.solverRegistry.get(SOLVER_IDS.CRAFTING) as
      | MinecraftCraftingSolver
      | undefined;
  }

  private get buildingSolver(): MinecraftBuildingSolver | undefined {
    return this.solverRegistry.get(SOLVER_IDS.BUILDING) as
      | MinecraftBuildingSolver
      | undefined;
  }

  private get toolProgressionSolver():
    | MinecraftToolProgressionSolver
    | undefined {
    return this.solverRegistry.get(SOLVER_IDS.TOOL_PROGRESSION) as
      | MinecraftToolProgressionSolver
      | undefined;
  }

  private get acquisitionSolver():
    | MinecraftAcquisitionSolver
    | undefined {
    return this.solverRegistry.get(SOLVER_IDS.ACQUISITION) as
      | MinecraftAcquisitionSolver
      | undefined;
  }

  registerSolver(solver: BaseDomainSolver): void {
    this.solverRegistry.set(solver.solverId, solver);
  }

  getSolver<T extends BaseDomainSolver>(solverId: string): T | undefined {
    return this.solverRegistry.get(solverId) as T | undefined;
  }

  getMcData(): any {
    if (!this._mcDataCache) {
      try {
        const esmRequire = createRequire(import.meta.url);
        const mcDataLoader = esmRequire('minecraft-data');
        const requestedVersion = process.env.MINECRAFT_VERSION || '1.21.4';
        this._mcDataCache = mcDataLoader(requestedVersion);
        if (!this._mcDataCache) {
          // minecraft-data doesn't have this version — fall back to nearest known
          const fallback = '1.21.4';
          console.warn(
            `minecraft-data has no data for ${requestedVersion}, falling back to ${fallback}`
          );
          this._mcDataCache = mcDataLoader(fallback);
        }
      } catch (err) {
        console.warn(
          'minecraft-data not available for Sterling solvers:',
          err instanceof Error ? err.message : err
        );
        return null;
      }
    }
    return this._mcDataCache;
  }

  /**
   * Fetches bot inventory and nearby blocks from Minecraft interface.
   * Callers must check _unavailable: when true, inventory/nearbyBlocks must not be used.
   */
  async fetchBotContext(): Promise<{
    inventory: any[];
    nearbyBlocks: any[];
    nearbyBlockCounts: Record<string, number>;
    nearbyBlocksKnown: boolean;
    biome: string | undefined;
    _unavailable?: boolean;
  }> {
    const unavailable = { inventory: [], nearbyBlocks: [], nearbyBlockCounts: {}, nearbyBlocksKnown: false, biome: undefined, _unavailable: true as const };
    try {
      const stateRes = await this.minecraftGet('/state').catch(() => null);
      if (!stateRes?.ok) return unavailable;
      const stateData = (await stateRes.json()) as any;
      const inventory = stateData?.data?.data?.inventory?.items || [];
      const nearbyBlocks = stateData?.data?.worldState?.nearbyBlocks || [];
      const blockSummary = stateData?.data?.worldState?.nearbyBlockSummary;
      const nearbyBlockCounts: Record<string, number> = { ...(blockSummary?.counts ?? {}) };
      const nearbyBlocksKnown: boolean = blockSummary?.known ?? false;
      const biome: string | undefined = stateData?.data?.worldState?.environment?.biome
        ?? stateData?.data?.data?.biome;

      // Merge vision-observed blocks from the world perception system.
      // The cubic scan only sees 8 blocks; vision raycasts see 50+ blocks
      // in the bot's field of view (with occlusion discipline — no cheating).
      if (this.worldPost) {
        try {
          const position = stateData?.data?.position ?? stateData?.data?.data?.position;
          if (position) {
            const perceptionRes = await this.worldPost(
              '/api/perception/visual-field',
              { position, maxDistance: 50 },
              { timeout: 2000 },
            ).catch(() => null);
            if (perceptionRes?.ok) {
              const perceptionData = (await perceptionRes.json()) as any;
              const observations: any[] = perceptionData?.observations ?? [];
              for (const obs of observations) {
                const name = obs?.name;
                if (name && typeof name === 'string' && obs.type === 'block') {
                  // Vision-observed blocks contribute to nearbyBlockCounts.
                  // Use count=1 as a floor — the cubic scan may have a higher
                  // count for truly adjacent blocks, and we don't overwrite that.
                  if (!nearbyBlockCounts[name]) {
                    nearbyBlockCounts[name] = 1;
                  }
                }
              }
            }
          }
        } catch {
          // Non-critical: vision augmentation is best-effort
        }
      }

      // Test override: force empty nearbyBlocks to exercise needsBlocks -> explore_for_resources
      if (process.env.TEST_EMPTY_NEARBY_BLOCKS === '1') {
        return { inventory, nearbyBlocks: [], nearbyBlockCounts: {}, nearbyBlocksKnown: true, biome };
      }

      return { inventory, nearbyBlocks, nearbyBlockCounts, nearbyBlocksKnown, biome };
    } catch {
      return unavailable;
    }
  }

  async generateDynamicSteps(taskData: Partial<Task>): Promise<StepGenerationResult> {
    const requirement = resolveRequirement(taskData);
    const route = routeActionPlan(requirement, {
      declarations: this.buildDeclarationLookup(),
    });
    const routeInfo = { backend: route.backend, requiredRig: route.requiredRig, reason: route.reason };
    console.log('[PlanRoute]', {
      ...routeInfo,
      taskTitle: taskData.title,
      ...(route.decision ? {
        proofStatus: route.decision.proofStatus,
        solverId: route.decision.solverId,
        declarationDigest: route.decision.declarationDigest?.slice(0, 8),
        primitives: route.decision.requiredPrimitives,
      } : {}),
    });

    // M2: Emit warnings from capability decision (warning mode, not rejection)
    if (route.decision?.warnings.length) {
      for (const warning of route.decision.warnings) {
        console.warn(`[CapabilityDecision] ${warning}`);
      }
    }

    // M2b: Persist capability decision into task metadata for downstream replay/audit
    const decision = route.decision;
    if (decision) {
      const solverMeta = ensureSolverMeta(taskData);
      solverMeta.capabilityDecision = decision;
    }

    if (route.backend === 'unplannable') {
      const reason = route.reason === 'no-requirement' ? 'no-requirement' as const : 'unplannable' as const;
      return { steps: [], noStepsReason: reason, route: routeInfo, capabilityDecision: decision };
    }

    // Rig D upgrade: when acquisition solver is registered, collect/mine
    // requirements are promoted from compiler to Rig D for multi-strategy
    // reasoning. Falls through to compiler if acquisition solver fails.
    if (route.backend === 'compiler' && this.acquisitionSolver && requirement &&
        (requirement.kind === 'collect' || requirement.kind === 'mine')) {
      try {
        const steps = await this.generateAcquisitionStepsFromSterling(taskData);
        if (steps && steps.length > 0) {
          // M2b: Rig D upgrade produces its own decision record for the promoted route
          const rigDDecision = buildDecisionRecordForRig('D', this.buildDeclarationLookup());
          const rigDRoute = { ...routeInfo, requiredRig: 'D', reason: `${routeInfo.reason}→rig-d-upgrade` };
          if (rigDDecision) {
            const solverMeta = ensureSolverMeta(taskData);
            solverMeta.capabilityDecision = rigDDecision;
          }
          return { steps, route: rigDRoute, capabilityDecision: rigDDecision };
        }
      } catch (error) {
        console.warn(
          'Sterling acquisition solver failed for compiler-routed requirement, falling through to compiler:',
          error
        );
      }
      // Fall through to compiler if Rig D didn't produce steps
    }

    if (route.backend === 'compiler') {
      const steps = this.generateLeafMappedSteps(taskData);
      if (steps.length === 0) {
        return { steps: [], noStepsReason: 'compiler-empty', route: routeInfo, capabilityDecision: decision };
      }
      return { steps, route: routeInfo, capabilityDecision: decision };
    }

    if (this.toolProgressionSolver && route.requiredRig === 'B') {
      try {
        const steps =
          await this.generateToolProgressionStepsFromSterling(taskData);
        if (steps && steps.length > 0) return { steps, route: routeInfo, capabilityDecision: decision };
      } catch (error) {
        console.warn(
          'Sterling tool progression solver failed, falling through:',
          error
        );
        return { steps: [], noStepsReason: 'solver-error', route: routeInfo, capabilityDecision: decision };
      }
    }

    if (this.craftingSolver && route.requiredRig === 'A') {
      try {
        const steps = await this.generateStepsFromSterling(taskData);
        if (steps && steps.length > 0) return { steps, route: routeInfo, capabilityDecision: decision };
        return { steps: [], noStepsReason: 'solver-unsolved', route: routeInfo, capabilityDecision: decision };
      } catch (error) {
        console.warn(
          'Sterling crafting solver failed, falling through:',
          error
        );
        return { steps: [], noStepsReason: 'solver-error', route: routeInfo, capabilityDecision: decision };
      }
    }

    if (this.buildingSolver && route.requiredRig === 'G') {
      try {
        const steps = await this.generateBuildingStepsFromSterling(taskData);
        if (steps && steps.length > 0) return { steps, route: routeInfo };
        return { steps: [], noStepsReason: 'solver-unsolved', route: routeInfo };
      } catch (error) {
        console.warn(
          'Sterling building solver failed, falling through:',
          error
        );
        return { steps: [], noStepsReason: 'solver-error', route: routeInfo };
      }
    }

    // Rig D: multi-strategy acquisition solver.
    if (this.acquisitionSolver && route.requiredRig === 'D') {
      try {
        const steps = await this.generateAcquisitionStepsFromSterling(taskData);
        if (steps && steps.length > 0) return { steps, route: routeInfo };
        return { steps: [], noStepsReason: 'solver-unsolved', route: routeInfo };
      } catch (error) {
        console.warn(
          'Sterling acquisition solver failed, falling through:',
          error
        );
        return { steps: [], noStepsReason: 'solver-error', route: routeInfo };
      }
    }

    // Rig E: hierarchical macro-planner for navigate/explore/find.
    // When configured, generates steps via macro path + micro decomposition.
    // When unconfigured, returns explicit blocked sentinel.
    if (route.requiredRig === 'E') {
      let rigEBlockedReason: string | undefined;
      if (this.isHierarchicalConfigured) {
        try {
          const decision = await this.generateDynamicStepsHierarchical(taskData);
          if (decision.kind === 'ok') {
            const { steps, macroPlan, currentEdge } = decision.value;
            // Tag steps with Rig E provenance
            const taggedSteps = steps.map((s) => ({
              ...s,
              meta: {
                ...s.meta,
                source: 'rig-e-macro',
                macroEdgeId: currentEdge?.id,
                contextTarget: currentEdge?.to,
                macroPlanDigest: macroPlan?.planDigest,
              },
            }));
            if (taggedSteps.length > 0) return { steps: taggedSteps, route: routeInfo };
          }
          // Hierarchical planner returned blocked — capture reason for sentinel
          if (decision.kind === 'blocked') {
            rigEBlockedReason = decision.reason === 'ontology_gap'
              ? 'rig_e_ontology_gap'
              : 'rig_e_no_plan_found';
          }
          console.warn(
            `[PlanRoute] Rig E hierarchical planner blocked: ${decision.kind === 'blocked' ? decision.reason : 'no steps'}. Task "${taskData.title}".`
          );
        } catch (error) {
          console.warn(
            'Sterling Rig E hierarchical planner failed, falling through to sentinel:',
            error
          );
        }
      }
      // Unconfigured or planner failed/blocked: return explicit blocked sentinel
      const blockedReason = !this.isHierarchicalConfigured
        ? 'rig_e_solver_unimplemented'
        : (rigEBlockedReason ?? 'rig_e_no_plan_found');
      return {
        steps: [{
          id: `step-blocked-rig-e-${taskData.id || 'unknown'}`,
          label: `[BLOCKED] Rig E: ${blockedReason}`,
          done: false,
          order: 1,
          meta: {
            blocked: true,
            blockedReason,
            requiredRig: 'E',
          },
        }],
        noStepsReason: 'blocked-sentinel',
        route: routeInfo,
      };
    }

    return { steps: [], route: routeInfo };
  }

  private generateLeafMappedSteps(taskData: Partial<Task>): TaskStep[] {
    const requirement = resolveRequirement(taskData);
    if (!requirement) return [];

    const plan = requirementToFallbackPlan(requirement);
    if (!plan || plan.length === 0) return [];

    const taskId = taskData.id || 'unknown';
    return plan.map((step, index) => ({
      id: `step-fallback-${taskId}-${index + 1}`,
      label: step.label,
      done: false,
      order: index + 1,
      estimatedDuration:
        step.leaf === 'acquire_material'
          ? 15000
          : step.leaf === 'dig_block'
            ? 10000
            : step.leaf === 'collect_items'
              ? 5000
              : step.leaf === 'craft_recipe'
                ? 5000
                : 15000,
      meta: {
        authority: 'fallback-macro',
        leaf: step.leaf,
        executable: true,
        args: step.args,
      },
    }));
  }

  private async generateStepsFromSterling(
    taskData: Partial<Task>
  ): Promise<TaskStep[]> {
    if (!this.craftingSolver) return [];

    const requirement = resolveRequirement(taskData);
    if (!requirement) return [];

    let goalItem: string | undefined;
    if (requirement.kind === 'craft') {
      goalItem = requirement.outputPattern;
    } else if (requirement.kind === 'collect' || requirement.kind === 'mine') {
      return [];
    }
    if (!goalItem) return [];

    const mcData = (taskData.metadata as any)?.mcData || this.getMcData();
    if (!mcData) {
      console.warn(
        'Cannot invoke Sterling crafting solver — minecraft-data unavailable'
      );
      return [];
    }

    // ── Authoritative path: resolve_intent_steps (AC-2.1) ──
    // When wired, crafting uses resolve_intent_steps which provides
    // epistemic filtering (mine rule pruning, craft variant pruning,
    // frontier analysis) that the direct solve path lacks.
    if (this._resolveIntentSteps) {
      return this._generateStepsViaResolveIntent(taskData, goalItem, mcData);
    }

    // ── Legacy path: direct solveCraftingGoal (workbench/benchmark only) ──
    // This path is retained for backward compatibility with test harnesses
    // and workbench use. It is NOT the authoritative planning path for
    // production conscious-bot — see MC-INT-01 AC-2.1.
    return this._generateStepsViaDirectSolve(taskData, goalItem, mcData);
  }

  /**
   * Build the canonical resolve_intent_steps request from bot context.
   *
   * This is the SINGLE source of truth for world_state + rules assembly.
   * Both the planner's Rig A path and task-integration's expand path
   * should use this builder to avoid duplicate request shaping.
   *
   * Returns null if bot context is unavailable.
   */
  async buildResolveIntentRequest(
    goalItem: string,
    mcData: any,
    intentSteps: Array<{ leaf: string; args: Record<string, unknown> }>,
    options?: {
      requestIdPrefix?: string;
      schemaVersion?: string;
      /** Pre-built inventory index (canonicalized). When provided, skips inventoryToRecord. */
      inventoryOverride?: Record<string, number>;
    },
  ): Promise<{
    intent_steps: Array<{ leaf: string; args: Record<string, unknown> }>;
    world_state: {
      inventory: Record<string, number>;
      nearby_blocks: string[];
      nearby_blocks_known: boolean;
      nearby_block_counts: Record<string, number>;
      preferred_base_items: string[];
      scan_meta: { radius: number; scanned_at: number; biome: string };
    };
    rules: Array<Record<string, unknown>>;
    schema_version: string;
    request_id: string;
  } | null> {
    const botCtx = await this.fetchBotContext();
    if (botCtx._unavailable) return null;

    const inventory = options?.inventoryOverride ?? inventoryToRecord(botCtx.inventory);
    const blockCounts = botCtx.nearbyBlockCounts ?? {};
    const nearbyBlocks: string[] = botCtx.nearbyBlocksKnown
      ? Object.keys(blockCounts)
      : [];

    // Derive preferred_base_items: most abundant log types first
    const preferredBaseItems = Object.entries(blockCounts)
      .filter(([name]) => name.endsWith('_log'))
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .map(([name]) => name);

    const rules = buildCraftingRules(mcData, goalItem) as unknown as Array<Record<string, unknown>>;

    const prefix = options?.requestIdPrefix ?? 'resolve';
    const requestId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      intent_steps: intentSteps,
      world_state: {
        inventory,
        nearby_blocks: nearbyBlocks,
        nearby_blocks_known: botCtx.nearbyBlocksKnown,
        nearby_block_counts: botCtx.nearbyBlockCounts ?? {},
        preferred_base_items: preferredBaseItems,
        scan_meta: {
          radius: 8,
          scanned_at: Date.now(),
          biome: botCtx.biome ?? 'unknown',
        },
      },
      rules,
      schema_version: options?.schemaVersion ?? '1.1.0',
      request_id: requestId,
    };
  }

  /**
   * Authoritative crafting resolution via resolve_intent_steps.
   * Uses buildResolveIntentRequest for request assembly (single source of truth).
   */
  private async _generateStepsViaResolveIntent(
    taskData: Partial<Task>,
    goalItem: string,
    mcData: any,
  ): Promise<TaskStep[]> {
    const intentStep = {
      leaf: 'task_type_craft',
      args: {
        task_type: 'CRAFT' as const,
        goal_item: goalItem,
      },
    };

    const request = await this.buildResolveIntentRequest(
      goalItem, mcData, [intentStep],
      { requestIdPrefix: 'rig-a' },
    );
    if (!request) return [];

    const response = await this._resolveIntentSteps!(request);

    if (response.status === 'error') {
      console.warn(
        `[Sterling] resolve_intent_steps error for ${goalItem}: ${(response as any).error}`
      );
      return [];
    }

    if (response.status === 'blocked') {
      console.log(
        `[Sterling] resolve_intent_steps blocked for ${goalItem}: ${(response as any).blocked_reason}`
      );
      return [];
    }

    // status === 'ok' — extract resolved steps from replacements
    const replacements = response.replacements;
    if (!replacements || replacements.length === 0) return [];

    const r = replacements[0];
    if (!r.resolved || !r.steps || r.steps.length === 0) {
      // Persist blocked_info into solver metadata for audit/replay
      const solverMeta = ensureSolverMeta(taskData);
      solverMeta.resolvedVia = 'resolve_intent_steps';
      solverMeta.unresolvedReason = r.unresolved_reason;
      if (r.blocked_info) {
        solverMeta.blockedInfo = {
          frontier_items: r.blocked_info.frontier_items ?? null,
          nearby_blocks_gap: r.blocked_info.nearby_blocks_gap ?? null,
          total_nodes_explored: r.blocked_info.total_nodes_explored ?? null,
        };
        console.log(
          `[Sterling] CRAFT ${goalItem} unresolved: ${r.unresolved_reason}`,
          `frontier=${JSON.stringify(r.blocked_info.frontier_items)}`,
          `gap=${JSON.stringify(r.blocked_info.nearby_blocks_gap)}`,
          `nodes=${r.blocked_info.total_nodes_explored}`,
        );
      }

      // M3.5: Convert blocked_info into prerequisite subgoal steps.
      // Instead of returning empty (which stalls the task in pending_planning),
      // derive the next best action from the typed failure surface.
      const prereqSteps = this._derivePrerequisiteSteps(goalItem, r.blocked_info, taskData);
      if (prereqSteps.length > 0) {
        solverMeta.prerequisitesDerived = true;
        return prereqSteps;
      }

      return [];
    }

    // Store plan_bundle_digest and authority provenance in solver metadata
    const solverMeta = ensureSolverMeta(taskData);
    solverMeta.planBundleDigest = (response as any).plan_bundle_digest;
    solverMeta.resolvedVia = 'resolve_intent_steps';

    // Convert resolve_intent_steps steps to TaskStep[]
    const taskId = taskData.id || 'unknown';
    return r.steps.map((step, index) => ({
      id: `step-resolve-${taskId}-${index + 1}`,
      label: `${step.leaf}: ${JSON.stringify(step.args)}`,
      done: false,
      order: index + 1,
      estimatedDuration: 10000,
      meta: {
        authority: 'sterling' as const,
        source: 'resolve_intent_steps',
        leaf: step.leaf,
        executable: true,
        args: step.args,
      },
    }));
  }

  /**
   * M3.5: Derive prerequisite subgoal steps from blocked_info.
   *
   * Three outcomes:
   * - frontier_items present + nearby_blocks_gap non-empty → explore_for_resources
   * - frontier_items present + nearby_blocks_gap empty → acquire_material
   * - no frontier_items → empty (terminal block, can't determine next action)
   */
  private _derivePrerequisiteSteps(
    goalItem: string,
    blockedInfo: { frontier_items?: string[] | null; nearby_blocks_gap?: string[] | null; total_nodes_explored?: number | null } | undefined,
    taskData: Partial<Task>,
  ): TaskStep[] {
    if (!blockedInfo?.frontier_items || blockedInfo.frontier_items.length === 0) {
      return []; // Can't determine prerequisites without frontier
    }

    const taskId = taskData.id || 'unknown';
    const gap = blockedInfo.nearby_blocks_gap ?? [];

    if (gap.length > 0) {
      // Resources NOT nearby — explore for them first
      console.log(
        `[Sterling] Deriving explore_for_resources prereq for ${goalItem}: gap=${JSON.stringify(gap)}`
      );
      return [{
        id: `step-prereq-explore-${taskId}-1`,
        label: `Explore for resources: ${gap.join(', ')} (prerequisite for ${goalItem})`,
        done: false,
        order: 1,
        estimatedDuration: 15000,
        meta: {
          authority: 'sterling' as const,
          source: 'blocked_info_prereq',
          leaf: 'explore_for_resources',
          executable: true,
          args: {
            resource_tags: gap,
            goal_item: goalItem,
            reason: 'nearby_blocks_gap',
          },
        },
      }];
    }

    // Resources ARE nearby but solver still couldn't solve — acquire them
    const frontierItem = blockedInfo.frontier_items[0];
    console.log(
      `[Sterling] Deriving acquire_material prereq for ${goalItem}: frontier=${frontierItem}`
    );
    return [{
      id: `step-prereq-acquire-${taskId}-1`,
      label: `Acquire ${frontierItem} (prerequisite for ${goalItem})`,
      done: false,
      order: 1,
      estimatedDuration: 15000,
      meta: {
        authority: 'sterling' as const,
        source: 'blocked_info_prereq',
        leaf: 'acquire_material',
        executable: true,
        args: {
          item: frontierItem,
          count: 1,
          goal_item: goalItem,
          reason: 'frontier_hit_unsolved',
        },
      },
    }];
  }

  /**
   * Legacy crafting resolution via direct solveCraftingGoal → command:'solve'.
   * Retained for workbench, benchmark, and test harness use.
   * NOT the authoritative planning path for production CB (see AC-2.1).
   */
  private async _generateStepsViaDirectSolve(
    taskData: Partial<Task>,
    goalItem: string,
    mcData: any,
  ): Promise<TaskStep[]> {
    let inventoryItems = (taskData.metadata as any)?.currentState?.inventory;
    let nearbyBlocks = (taskData.metadata as any)?.currentState?.nearbyBlocks;
    if (!inventoryItems || !nearbyBlocks) {
      const botCtx = await this.fetchBotContext();
      if (botCtx._unavailable) return [];
      inventoryItems = inventoryItems || botCtx.inventory;
      nearbyBlocks = nearbyBlocks || botCtx.nearbyBlocks;
    }

    const result = await this.craftingSolver!.solveCraftingGoal(
      goalItem,
      inventoryItems,
      mcData,
      nearbyBlocks
    );

    if (result.planId) {
      ensureSolverMeta(taskData).craftingPlanId = result.planId;
    }
    if (result.solveJoinKeys) {
      ensureSolverMeta(taskData).craftingSolveJoinKeys = result.solveJoinKeys;
    }
    if (result.mappingDegraded) {
      const solverMeta = ensureSolverMeta(taskData);
      solverMeta.mappingDegraded = true;
      solverMeta.noActionLabelEdges = result.noActionLabelEdges;
      solverMeta.unmatchedRuleEdges = result.unmatchedRuleEdges;
      solverMeta.searchEdgeCollisions = result.searchEdgeCollisions;
    }

    if (!result.solved) return [];

    const steps = this.craftingSolver!.toTaskSteps(result);
    return steps.map((s) => {
      const enrichedMeta: Record<string, unknown> = {
        ...s.meta,
        source: 'sterling',
        solverId: this.craftingSolver!.solverId,
        planId: result.planId,
        bundleId: result.solveMeta?.bundles?.[0]?.bundleId,
        executable: !!s.meta?.leaf,
      };
      const args = deriveLeafArgs(enrichedMeta);
      if (args) enrichedMeta.args = args;
      return { ...s, meta: enrichedMeta };
    });
  }

  private async generateToolProgressionStepsFromSterling(
    taskData: Partial<Task>
  ): Promise<TaskStep[]> {
    if (!this.toolProgressionSolver) return [];

    const requirement = resolveRequirement(taskData);
    if (!requirement || requirement.kind !== 'tool_progression') return [];

    const targetTool = requirement.targetTool as string;
    let inventoryItems: Array<
      { name: string; count: number } | null | undefined
    > = (taskData.metadata as any)?.currentState?.inventory;
    let nearbyBlocks: string[] = (taskData.metadata as any)?.currentState
      ?.nearbyBlocks;

    if (!inventoryItems || !nearbyBlocks) {
      const botCtx = await this.fetchBotContext();
      if (botCtx._unavailable) return [];
      inventoryItems = inventoryItems || botCtx.inventory;
      nearbyBlocks = nearbyBlocks || botCtx.nearbyBlocks;
    }

    const inventory: Record<string, number> = {};
    for (const item of inventoryItems) {
      if (!item || !item.name) continue;
      inventory[item.name] = (inventory[item.name] || 0) + item.count;
    }

    const result = await this.toolProgressionSolver.solveToolProgression(
      targetTool,
      inventory,
      nearbyBlocks
    );

    if (result.planId) {
      ensureSolverMeta(taskData).toolProgressionPlanId = result.planId;
    }
    if (result.solveJoinKeys) {
      // Per-domain keys prevent cross-solver clobbering
      ensureSolverMeta(taskData).toolProgressionSolveJoinKeys = result.solveJoinKeys;
    }
    if (result.mappingDegraded) {
      const solverMeta = ensureSolverMeta(taskData);
      solverMeta.mappingDegraded = true;
      solverMeta.noActionLabelEdges = result.noActionLabelEdges;
      solverMeta.unmatchedRuleEdges = result.unmatchedRuleEdges;
      solverMeta.searchEdgeCollisions = result.searchEdgeCollisions;
    }

    if (!result.solved) {
      if (result.needsBlocks && result.needsBlocks.missingBlocks.length > 0) {
        const missingBlocks = result.needsBlocks.missingBlocks;
        const now = Date.now();
        const exploreStep: TaskStep = {
          id: `step-${now}-explore`,
          label: `Leaf: minecraft.explore_for_resources (resource_tags=[${missingBlocks.join(',')}])`,
          done: false,
          order: 1,
          estimatedDuration: 30000,
          meta: {
            domain: 'tool_progression',
            leaf: 'explore_for_resources',
            args: {
              resource_tags: missingBlocks,
              goal_item: targetTool,
              reason: 'needs_blocks',
            },
            source: 'sterling',
            solverId: SOLVER_IDS.TOOL_PROGRESSION,
            executable: true,
          },
        };
        const enrichedMeta: Record<string, unknown> = {
          ...exploreStep.meta,
          source: 'sterling',
          solverId: this.toolProgressionSolver!.solverId,
          planId: result.planId,
          bundleId: result.solveMeta?.bundles?.[0]?.bundleId,
          executable: true,
        };
        const args = deriveLeafArgs(enrichedMeta);
        if (args) enrichedMeta.args = args;
        return [{ ...exploreStep, meta: enrichedMeta }];
      }
      return [];
    }

    const steps = this.toolProgressionSolver.toTaskSteps(result);
    return steps.map((s) => {
      const enrichedMeta: Record<string, unknown> = {
        ...s.meta,
        source: 'sterling',
        solverId: this.toolProgressionSolver!.solverId,
        planId: result.planId,
        bundleId: result.solveMeta?.bundles?.[0]?.bundleId,
        executable: !!s.meta?.leaf,
      };
      const args = deriveLeafArgs(enrichedMeta);
      if (args) enrichedMeta.args = args;
      return { ...s, meta: enrichedMeta };
    });
  }

  private async generateBuildingStepsFromSterling(
    taskData: Partial<Task>
  ): Promise<TaskStep[]> {
    if (!this.buildingSolver) return [];

    const requirement = resolveRequirement(taskData);
    if (!requirement || requirement.kind !== 'build') return [];

    const { getBasicShelterTemplate, inventoryForBuilding, buildSiteState } =
      await import('../sterling/minecraft-building-rules');

    const template = getBasicShelterTemplate();
    const currentState = (taskData.metadata as any)?.currentState;
    const inventoryItems = currentState?.inventory || [];
    const inventory = inventoryForBuilding(inventoryItems);

    const position = currentState?.position;
    const siteState = buildSiteState(
      (currentState?.terrain as any) || 'flat',
      (currentState?.biome as string) || 'plains',
      !!currentState?.treesNearby,
      !!currentState?.waterNearby,
      (currentState?.siteCaps as string) || 'flat_5x5_clear'
    );

    const templateId = 'basic_shelter_5x5__p0stub';
    const replanCount =
      (taskData.metadata?.solver?.buildingReplanCount as number) || 0;
    const MAX_REPLANS = 1;

    const result = await this.buildingSolver.solveBuildingPlan(
      templateId,
      'N',
      template.defaultGoalModules,
      inventory,
      siteState,
      template.modules.map((m) => ({ ...m, placementFeasible: true })),
      'stub'
    );

    // Store solver outputs in the solver namespace
    const solverMeta = ensureSolverMeta(taskData);
    solverMeta.buildingPlanId = result.planId ?? undefined;
    solverMeta.buildingTemplateId = templateId;
    if (result.solveJoinKeys) {
      // Per-domain keys prevent cross-solver clobbering
      solverMeta.buildingSolveJoinKeys = result.solveJoinKeys;
    }

    // ────────────────────────────────────────────────────────────────────
    // Gap 3: Capture solve result substrate for deferred classification
    // Enables richer outcome taxonomy (SEARCH_EXHAUSTED, ILLEGAL_TRANSITION, etc.)
    // when executor reports episode failure.
    //
    // COHERENCE: Include planId + bundleHash so executor can verify substrate
    // belongs to the episode being reported (prevents replan misclassification).
    // ────────────────────────────────────────────────────────────────────
    const bundle = result.solveMeta?.bundles?.[0];
    const issues = bundle?.compatReport?.issues;
    const rawSearchHealth = bundle?.output?.searchHealth;

    solverMeta.buildingSolveResultSubstrate = {
      // Identity fields for coherence check
      planId: result.solveJoinKeys?.planId,
      bundleHash: result.solveJoinKeys?.bundleHash,
      // Solve outcome — cap error to 512 chars (don't store full stack traces)
      solved: result.solved,
      error: result.error?.slice(0, 512),
      totalNodes: result.totalNodes,
      // Map searchHealth to only the fields we classify on — avoids coupling to Sterling internals
      searchHealth: rawSearchHealth?.terminationReason
        ? { terminationReason: rawSearchHealth.terminationReason }
        : undefined,
      // Classification options — explicitly map to stable shape, cap at 10
      opts: issues
        ? {
            compatIssues: issues.slice(0, 10).map((i) => ({ code: i.code, severity: i.severity })),
          }
        : undefined,
      capturedAt: Date.now(),
    };

    // Store Rig G metadata for feasibility gating in startTaskStep
    if (result.rigGSignals) {
      const commutingPairs = result.partialOrderPlan
        ? findCommutingPairs(result.partialOrderPlan)
        : [];
      solverMeta.rigG = {
        version: 1,
        signals: result.rigGSignals,
        commutingPairs,
        partialOrderPlan: result.partialOrderPlan,
        computedAt: Date.now(),
      };
    }

    // M3b: If this is a replan (replanCount > 0) and the solve succeeded,
    // check for a stored deficit declaration and create the craft_for_build bridge.
    if (replanCount > 0 && result.solved && bundle) {
      const storedDeficit = solverMeta.buildingDeficitDeclaration as {
        originatingBundleHash?: string;
        templateId?: string;
        deficit?: Record<string, number>;
      } | undefined;

      if (storedDeficit?.originatingBundleHash && storedDeficit?.templateId === templateId) {
        // Coherent replan: same template, deficit source matches
        // The "upstream" is whatever acquisition happened between deficit and replan.
        // We don't have the acquisition bundle directly here, but we have the
        // replan building bundle which proves the deficit was resolved.
        const { buildCraftForBuildBridge } = await import('../sterling/bridge-artifact');
        const { computeBundleInput: _cbi, computeBundleOutput: _cbo, createSolveBundle: _csb } = await import('../sterling/solve-bundle');

        // Build a synthetic upstream ref from the deficit metadata
        // (the real acquisition bundles live in the acquisition solver's output,
        // not directly accessible here — use the deficit hash as provenance anchor)
        const bridge = buildCraftForBuildBridge(
          bundle, // Use replan bundle as upstream (it consumed the acquisition result)
          bundle, // Downstream is also this bundle (it's the replan target)
          inventory, // Produced items = current inventory at replan time
          storedDeficit.deficit ?? {},
        );

        solverMeta.craftForBuildBridge = {
          bridgeHash: bridge.bridgeHash,
          kind: bridge.kind,
          deficit: storedDeficit.deficit,
          originatingBundleHash: storedDeficit.originatingBundleHash,
          replanBundleHash: bundle.bundleHash,
          coherent: true,
        };
        console.log(
          `[Sterling] craft_for_build bridge created: hash=${bridge.bridgeHash.slice(0, 8)} ` +
          `deficit=${JSON.stringify(storedDeficit.deficit)} template=${templateId}`
        );
      } else if (storedDeficit) {
        // Incoherent: template mismatch or missing originating bundle
        solverMeta.craftForBuildBridge = {
          coherent: false,
          reason: storedDeficit.templateId !== templateId
            ? `template_mismatch: stored=${storedDeficit.templateId} current=${templateId}`
            : 'missing_originating_bundle',
        };
        console.warn(
          `[Sterling] craft_for_build bridge SKIPPED: coherence failure — ${(solverMeta.craftForBuildBridge as any).reason}`
        );
      }
    }

    if (result.needsMaterials && replanCount >= MAX_REPLANS) {
      const deficit = result.needsMaterials.deficit;
      const deficitStr = Object.entries(deficit)
        .map(([k, v]) => `${k}x${v}`)
        .join(', ');
      return [
        {
          id: `step-${Date.now()}-replan-exhausted`,
          label: `Building failed: materials still missing after acquisition (${deficitStr})`,
          done: false,
          order: 1,
          estimatedDuration: 0,
          meta: {
            domain: 'building',
            leaf: 'replan_exhausted',
            deficit,
            templateId,
          },
        },
      ];
    }

    if (result.needsMaterials) {
      const sm = ensureSolverMeta(taskData);
      sm.buildingReplanCount = replanCount + 1;

      // M3b: Persist typed deficit declaration for bridge creation on replan.
      // This is the "precondition witness" side of craft_for_build.
      sm.buildingDeficitDeclaration = {
        originatingBundleHash: bundle?.bundleHash ?? null,
        originatingPlanId: result.planId ?? null,
        templateId,
        deficit: result.needsMaterials.deficit,
        blockedModules: result.needsMaterials.blockedModules,
        currentProgress: result.needsMaterials.currentProgress,
        declaredAt: Date.now(),
      };
      console.log(
        `[Sterling] Building deficit declared: template=${templateId} ` +
        `deficit=${JSON.stringify(result.needsMaterials.deficit)} ` +
        `bundle=${bundle?.bundleHash?.slice(0, 8) ?? 'absent'}`
      );
    }

    const steps = this.buildingSolver.toTaskStepsWithReplan(result, templateId);
    return steps.map((s) => {
      const enrichedMeta: Record<string, unknown> = {
        ...s.meta,
        source: 'sterling',
        solverId: this.buildingSolver!.solverId,
        planId: result.planId,
        bundleId: result.solveMeta?.bundles?.[0]?.bundleId,
        executable: !!s.meta?.leaf,
      };
      const args = deriveLeafArgs(enrichedMeta);
      if (args) enrichedMeta.args = args;
      return { ...s, meta: enrichedMeta };
    });
  }

  private async generateAcquisitionStepsFromSterling(
    taskData: Partial<Task>
  ): Promise<TaskStep[]> {
    if (!this.acquisitionSolver) return [];

    const requirement = resolveRequirement(taskData);
    if (!requirement) return [];

    // Acquisition solver handles 'acquire' requirement kind
    // It can also be triggered for craft/mine when Rig D routing is active
    const goalItem = getAcquisitionGoalItem(requirement);
    if (!goalItem) return [];

    let inventoryItems: Array<
      { name: string; count: number } | null | undefined
    > = (taskData.metadata as any)?.currentState?.inventory;
    let nearbyBlocks: string[] = (taskData.metadata as any)?.currentState
      ?.nearbyBlocks;

    if (!inventoryItems || !nearbyBlocks) {
      const botCtx = await this.fetchBotContext();
      if (botCtx._unavailable) return [];
      inventoryItems = inventoryItems || botCtx.inventory;
      nearbyBlocks = nearbyBlocks || botCtx.nearbyBlocks;
    }

    const inventory: Record<string, number> = {};
    for (const item of inventoryItems || []) {
      if (!item || !item.name) continue;
      inventory[item.name] = (inventory[item.name] || 0) + item.count;
    }

    const nearbyEntities = (taskData.metadata as any)?.currentState?.nearbyEntities || [];

    // Load mcData once per solve — same precedence as Rig A (metadata override || planner cache).
    const mcData = (taskData.metadata as any)?.mcData || this.getMcData();

    const result = await this.acquisitionSolver.solveAcquisition(
      goalItem,
      requirement.quantity || 1,
      inventory,
      nearbyBlocks,
      nearbyEntities,
      undefined, // options
      mcData,
    );

    if (result.planId) {
      ensureSolverMeta(taskData).acquisitionPlanId = result.planId;
    }
    if (result.solveJoinKeys) {
      ensureSolverMeta(taskData).acquisitionSolveJoinKeys = result.solveJoinKeys;
    }

    if (!result.solved) return [];

    const steps = this.acquisitionSolver.toTaskSteps(result);
    return steps.map((s) => {
      const enrichedMeta: Record<string, unknown> = {
        ...s.meta,
        source: 'rig-d-acquisition',
        solverId: this.acquisitionSolver!.solverId,
        planId: result.planId,
        bundleId: result.parentBundleId,
        strategySelected: result.selectedStrategy,
        candidateSetDigest: result.candidateSetDigest,
        executable: !!s.meta?.leaf,
      };
      const args = deriveLeafArgs(enrichedMeta);
      if (args) enrichedMeta.args = args;
      return { ...s, meta: enrichedMeta };
    });
  }
}

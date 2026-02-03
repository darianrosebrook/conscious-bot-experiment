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
import { routeActionPlan } from '../modules/action-plan-backend';
import { requirementToFallbackPlan } from '../modules/leaf-arg-contracts';
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
}

export interface SterlingPlannerOptions {
  /** HTTP get for Minecraft interface (path, opts) => Response */
  minecraftGet: (
    path: string,
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
      return { blockType: item?.name || 'oak_log' };
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
  private readonly solverRegistry = new Map<string, BaseDomainSolver>();
  private _mcDataCache: any = null;

  /** Optional macro planner for hierarchical planning (Rig E) */
  private _macroPlanner?: MacroPlanner;
  /** Optional feedback store for macro cost updates (Rig E) */
  private _feedbackStore?: FeedbackStore;
  /** Active macro edge sessions keyed by sessionId */
  private readonly _activeSessions = new Map<string, MacroEdgeSession>();

  constructor(options: SterlingPlannerOptions) {
    this.minecraftGet = options.minecraftGet;
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
        this._mcDataCache = mcDataLoader(process.env.MINECRAFT_VERSION || '1.21.4');
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
    _unavailable?: boolean;
  }> {
    try {
      const stateRes = await this.minecraftGet('/state').catch(() => null);
      if (!stateRes?.ok)
        return { inventory: [], nearbyBlocks: [], _unavailable: true };
      const stateData = (await stateRes.json()) as any;
      const inventory = stateData?.data?.data?.inventory?.items || [];
      const nearbyBlocks = stateData?.data?.worldState?.nearbyBlocks || [];
      return { inventory, nearbyBlocks };
    } catch {
      return { inventory: [], nearbyBlocks: [], _unavailable: true };
    }
  }

  async generateDynamicSteps(taskData: Partial<Task>): Promise<StepGenerationResult> {
    const requirement = resolveRequirement(taskData);
    const route = routeActionPlan(requirement);
    const routeInfo = { backend: route.backend, requiredRig: route.requiredRig, reason: route.reason };
    console.log('[PlanRoute]', {
      ...routeInfo,
      taskTitle: taskData.title,
    });

    if (route.backend === 'unplannable') {
      const reason = route.reason === 'no-requirement' ? 'no-requirement' as const : 'unplannable' as const;
      return { steps: [], noStepsReason: reason, route: routeInfo };
    }

    // Rig D upgrade: when acquisition solver is registered, collect/mine
    // requirements are promoted from compiler to Rig D for multi-strategy
    // reasoning. Falls through to compiler if acquisition solver fails.
    if (route.backend === 'compiler' && this.acquisitionSolver && requirement &&
        (requirement.kind === 'collect' || requirement.kind === 'mine')) {
      try {
        const steps = await this.generateAcquisitionStepsFromSterling(taskData);
        if (steps && steps.length > 0) {
          const rigDRoute = { ...routeInfo, requiredRig: 'D', reason: `${routeInfo.reason}→rig-d-upgrade` };
          return { steps, route: rigDRoute };
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
        return { steps: [], noStepsReason: 'compiler-empty', route: routeInfo };
      }
      return { steps, route: routeInfo };
    }

    if (this.toolProgressionSolver && route.requiredRig === 'B') {
      try {
        const steps =
          await this.generateToolProgressionStepsFromSterling(taskData);
        if (steps && steps.length > 0) return { steps, route: routeInfo };
      } catch (error) {
        console.warn(
          'Sterling tool progression solver failed, falling through:',
          error
        );
        return { steps: [], noStepsReason: 'solver-error', route: routeInfo };
      }
    }

    if (this.craftingSolver && route.requiredRig === 'A') {
      try {
        const steps = await this.generateStepsFromSterling(taskData);
        if (steps && steps.length > 0) return { steps, route: routeInfo };
        return { steps: [], noStepsReason: 'solver-unsolved', route: routeInfo };
      } catch (error) {
        console.warn(
          'Sterling crafting solver failed, falling through:',
          error
        );
        return { steps: [], noStepsReason: 'solver-error', route: routeInfo };
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

    let inventoryItems = (taskData.metadata as any)?.currentState?.inventory;
    let nearbyBlocks = (taskData.metadata as any)?.currentState?.nearbyBlocks;
    if (!inventoryItems || !nearbyBlocks) {
      const botCtx = await this.fetchBotContext();
      if (botCtx._unavailable) return [];
      inventoryItems = inventoryItems || botCtx.inventory;
      nearbyBlocks = nearbyBlocks || botCtx.nearbyBlocks;
    }

    const mcData = (taskData.metadata as any)?.mcData || this.getMcData();
    if (!mcData) {
      console.warn(
        'Cannot invoke Sterling crafting solver — minecraft-data unavailable'
      );
      return [];
    }

    const result = await this.craftingSolver.solveCraftingGoal(
      goalItem,
      inventoryItems,
      mcData,
      nearbyBlocks
    );

    if (result.planId) {
      ensureSolverMeta(taskData).craftingPlanId = result.planId;
    }
    if (result.solveJoinKeys) {
      // Per-domain keys prevent cross-solver clobbering
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

    const steps = this.craftingSolver.toTaskSteps(result);
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

    if (!result.solved) return [];

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
      ensureSolverMeta(taskData).buildingReplanCount = replanCount + 1;
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

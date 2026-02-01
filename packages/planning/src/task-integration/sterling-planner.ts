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
import { resolveRequirement } from '../modules/requirements';
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

export interface SterlingPlannerOptions {
  /** HTTP get for Minecraft interface (path, opts) => Response */
  minecraftGet: (
    path: string,
    opts?: { timeout?: number }
  ) => Promise<Response>;
}

function deriveLeafArgs(
  meta: Record<string, unknown>
): Record<string, unknown> | undefined {
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
      const steps = await this.generateDynamicSteps(taskData);
      return { kind: 'ok', value: { steps, macroPlan } };
    }

    // For now, generate steps for the first macro edge
    const currentEdge = macroPlan.edges[0];
    const steps = await this.generateDynamicSteps(taskData);

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
    return this.solverRegistry.get('minecraft.crafting') as
      | MinecraftCraftingSolver
      | undefined;
  }

  private get buildingSolver(): MinecraftBuildingSolver | undefined {
    return this.solverRegistry.get('minecraft.building') as
      | MinecraftBuildingSolver
      | undefined;
  }

  private get toolProgressionSolver():
    | MinecraftToolProgressionSolver
    | undefined {
    return this.solverRegistry.get('minecraft.tool_progression') as
      | MinecraftToolProgressionSolver
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
        this._mcDataCache = mcDataLoader('1.21.9');
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

  async generateDynamicSteps(taskData: Partial<Task>): Promise<TaskStep[]> {
    const requirement = resolveRequirement(taskData);
    const route = routeActionPlan(requirement);
    console.log('[PlanRoute]', {
      backend: route.backend,
      rig: route.requiredRig,
      reason: route.reason,
      taskTitle: taskData.title,
    });

    if (route.backend === 'unplannable') {
      return [];
    }

    if (route.backend === 'compiler') {
      return this.generateLeafMappedSteps(taskData);
    }

    if (this.toolProgressionSolver && route.requiredRig === 'B') {
      try {
        const steps =
          await this.generateToolProgressionStepsFromSterling(taskData);
        if (steps && steps.length > 0) return steps;
      } catch (error) {
        console.warn(
          'Sterling tool progression solver failed, falling through:',
          error
        );
      }
    }

    if (this.craftingSolver && route.requiredRig === 'A') {
      try {
        const steps = await this.generateStepsFromSterling(taskData);
        if (steps && steps.length > 0) return steps;
      } catch (error) {
        console.warn(
          'Sterling crafting solver failed, falling through:',
          error
        );
      }
    }

    if (this.buildingSolver && route.requiredRig === 'G') {
      try {
        const steps = await this.generateBuildingStepsFromSterling(taskData);
        if (steps && steps.length > 0) return steps;
      } catch (error) {
        console.warn(
          'Sterling building solver failed, falling through:',
          error
        );
      }
    }

    // Rig E: solver not yet implemented — return explicit blocked sentinel
    // so TaskIntegration can transition to pending_planning with a reason.
    if (route.requiredRig === 'E') {
      console.warn(
        `[PlanRoute] Rig E solver not implemented. Task "${taskData.title}" will be blocked.`
      );
      return [{
        id: `step-blocked-rig-e-${taskData.id || 'unknown'}`,
        label: '[BLOCKED] Rig E solver not implemented',
        done: false,
        order: 1,
        meta: {
          blocked: true,
          blockedReason: 'rig_e_solver_unimplemented',
          requiredRig: 'E',
        },
      }];
    }

    return [];
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
        step.leaf === 'dig_block'
          ? 10000
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

    if (taskData.metadata && result.planId) {
      (taskData.metadata as any).craftingPlanId = result.planId;
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

    if (taskData.metadata && result.planId) {
      (taskData.metadata as any).toolProgressionPlanId = result.planId;
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
      ((taskData.metadata as any)?.buildingReplanCount as number) || 0;
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

    // Ensure metadata exists so solver-produced signals are never dropped
    taskData.metadata ??= {} as any;
    {
      (taskData.metadata as any).buildingPlanId = result.planId;
      (taskData.metadata as any).buildingTemplateId = templateId;

      // Store Rig G metadata for feasibility gating in startTaskStep
      if (result.rigGSignals) {
        const commutingPairs = result.partialOrderPlan
          ? findCommutingPairs(result.partialOrderPlan)
          : [];
        const rigG: RigGMetadata = {
          version: 1,
          signals: result.rigGSignals,
          commutingPairs,
          partialOrderPlan: result.partialOrderPlan,
          computedAt: Date.now(),
        };
        (taskData.metadata as any).rigG = rigG;
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

    if (result.needsMaterials && taskData.metadata) {
      (taskData.metadata as any).buildingReplanCount = replanCount + 1;
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
}

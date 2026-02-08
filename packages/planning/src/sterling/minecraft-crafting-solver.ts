/**
 * Minecraft Crafting Solver
 *
 * Orchestrates crafting solves: builds rules from mcData, sends to Sterling,
 * and maps results to TaskStep[] for the planning system.
 *
 * @author @darianrosebrook
 */

import { BaseDomainSolver } from './base-domain-solver';
import type { DomainDeclarationV1 } from './domain-declaration';
import { SOLVER_IDS } from './solver-ids';
import type {
  MinecraftCraftingRule,
  MinecraftCraftingSolveResult,
  MinecraftSolveStep,
} from './minecraft-crafting-types';
import { buildCraftingRules, inventoryToRecord } from './minecraft-crafting-rules';
import { getLeafContractEntries } from '../modules/leaf-arg-contracts';
import { lintRules } from './compat-linter';
import {
  computeBundleInput,
  computeBundleOutput,
  createSolveBundle,
  buildDefaultRationaleContext,
  parseSterlingIdentity,
  attachSterlingIdentity,
} from './solve-bundle';
import { parseSearchHealth } from './search-health';
import { extractSolveJoinKeys } from './episode-classification';

import type { TaskStep } from '../types/task-step';

// ── Leaf routing (single source of truth) ────────────────────────
import {
  actionTypeToLeaf,
  parsePlaceAction,
  derivePlaceMeta,
  estimateDuration as sharedEstimateDuration,
} from './leaf-routing';
import { extractActionName, type MappingDegradation } from './label-utils';

// ── Temporal integration (Rig C) ─────────────────────────────────
import type { TemporalMode, TemporalEnrichment } from '../temporal/temporal-enrichment';
import { computeTemporalEnrichment } from '../temporal/temporal-enrichment';
import { P03ReferenceAdapter } from './primitives/p03/p03-reference-adapter';
import { MINECRAFT_BUCKET_SIZE_TICKS, HORIZON_BUCKETS, MAX_WAIT_BUCKETS } from '../temporal/time-state';

/** Frozen singleton — returned by batchHint when mode='off'. */
const NO_BATCH: Readonly<{ useBatch: false }> = Object.freeze({ useBatch: false });

/**
 * Static inert enrichment for mode='off' — avoids any temporal code paths.
 * enrichRule returns the input rule reference (no copy); safe because the
 * solver treats rules as readonly after buildCraftingRules returns.
 * batchHint returns a frozen singleton to avoid per-call allocation.
 */
const INERT_ENRICHMENT: TemporalEnrichment = Object.freeze({
  mode: 'off' as const,
  enrichRule: (rule: Readonly<MinecraftCraftingRule>) => rule,
  batchHint: () => NO_BATCH,
});

/** Options for temporal enrichment in solveCraftingGoal. */
export interface CraftingTemporalOptions {
  /** Temporal mode. Default: 'off'. */
  mode: TemporalMode;
  /** Current time in game ticks (required when mode !== 'off'). */
  nowTicks?: number;
  /** Observed resource slots (optional; inferred from nearbyBlocks if absent). */
  slotsObserved?: import('./primitives/p03/p03-capsule-types').P03ResourceSlotV1[];
}

/** Internal result from mapSolutionToSteps with optional degradation metadata. */
interface StepMappingResult {
  steps: MinecraftSolveStep[];
  /** Present only when mapping encountered any anomaly. */
  mapping?: MappingDegradation;
}

// ============================================================================
// Domain Declaration
// ============================================================================

export const CRAFTING_DECLARATION: DomainDeclarationV1 = {
  declarationVersion: 1,
  solverId: SOLVER_IDS.CRAFTING,
  contractVersion: 1,
  implementsPrimitives: ['CB-P01'],
  consumesFields: ['inventory', 'goal', 'nearbyBlocks', 'rules', 'maxNodes'],
  producesFields: ['steps', 'planId', 'solveMeta'],
};

// ============================================================================
// Solver
// ============================================================================

export class MinecraftCraftingSolver extends BaseDomainSolver<MinecraftCraftingSolveResult> {
  readonly sterlingDomain = 'minecraft' as const;
  readonly solverId = SOLVER_IDS.CRAFTING;

  /**
   * When true, a successful solve with degraded step mapping (unknown-* steps)
   * is treated as a failure: `solved` flips to false and `steps` is emptied.
   * Default: false (best-effort + observability).
   *
   * Enablement: Not wired to configuration yet. Intended to be toggled via
   * env var (e.g. STERLING_STRICT_MAPPING=1) or solver registry config once
   * the label contract is stable in production. Enable in tests with
   * `solver.strictMapping = true`.
   */
  strictMapping = false;

  /** Shared temporal adapter — initialized once, reused across solves. */
  private readonly temporalAdapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

  override getDomainDeclaration(): DomainDeclarationV1 {
    return CRAFTING_DECLARATION;
  }

  protected makeUnavailableResult(): MinecraftCraftingSolveResult {
    return {
      solved: false,
      steps: [],
      totalNodes: 0,
      durationMs: 0,
      error: 'Sterling reasoning service unavailable',
    };
  }

  /**
   * Solve a crafting goal using Sterling's graph search.
   *
   * @param goalItem       - Target item name (e.g. "wooden_pickaxe")
   * @param currentInventory - Bot's current inventory items
   * @param mcData         - minecraft-data instance
   * @param nearbyBlocks   - Block names the bot can see/reach
   * @param temporalOptions - Temporal enrichment options (default: mode='off')
   */
  async solveCraftingGoal(
    goalItem: string,
    currentInventory: Array<{ name: string; count: number } | null | undefined>,
    mcData: any,
    nearbyBlocks: string[] = [],
    temporalOptions?: CraftingTemporalOptions,
  ): Promise<MinecraftCraftingSolveResult> {
    if (!this.isAvailable()) return this.makeUnavailableResult();
    await this.ensureDeclarationRegistered();

    // 1. Build rule set from mcData recipe tree
    const rules = buildCraftingRules(mcData, goalItem);
    if (rules.length === 0) {
      return {
        solved: false,
        steps: [],
        totalNodes: 0,
        durationMs: 0,
        error: `No crafting rules found for ${goalItem}`,
      };
    }

    // 2. Convert inventory to record format
    const inventory = inventoryToRecord(currentInventory);

    // 3. Build goal
    const goal: Record<string, number> = { [goalItem]: 1 };

    // 3a. Temporal enrichment (Rig C) — sole entrypoint
    const temporalMode = temporalOptions?.mode ?? 'off';
    const enrichment = this.computeEnrichment(temporalMode, temporalOptions, rules, nearbyBlocks);

    // 3b. Pre-solve deadlock check (when temporal mode is active)
    if (enrichment.deadlock?.isDeadlock) {
      return {
        solved: false,
        steps: [],
        totalNodes: 0,
        durationMs: 0,
        error: `Temporal deadlock: ${enrichment.deadlock.reason ?? 'capacity deadlock detected'}`,
      };
    }

    // 3c. Preflight lint + bundle input capture
    const maxNodes = 5000;
    const compatReport = lintRules(rules);
    const rationaleCtx = buildDefaultRationaleContext({ compatReport, maxNodes });
    const bundleInput = computeBundleInput({
      solverId: this.solverId,
      contractVersion: this.contractVersion,
      definitions: rules,
      inventory,
      goal,
      nearbyBlocks,
      leafContractEntries: getLeafContractEntries(),
    });
    if (compatReport.issues.length > 0) {
      console.warn(
        `[Sterling:compat] solverId=${this.solverId} issues=${compatReport.issues.length} codes=[${compatReport.issues.map((i) => i.code).join(',')}]`
      );
    }

    // 4. Build Sterling payload — temporal fields only in sterling_temporal mode
    const solvePayload: Record<string, unknown> = {
      contractVersion: this.contractVersion,
      solverId: this.solverId,
      inventory,
      goal,
      nearbyBlocks,
      rules,
      maxNodes,
      useLearning: true,
    };

    if (temporalMode === 'sterling_temporal' && enrichment.temporalState) {
      solvePayload.currentTickBucket = enrichment.temporalState.time.currentBucket;
      solvePayload.horizonBucket = enrichment.temporalState.time.horizonBucket;
      solvePayload.bucketSizeTicks = enrichment.temporalState.time.bucketSizeTicks;
      solvePayload.slots = enrichment.temporalState.slots;
    }

    const result = await this.sterlingService.solve(this.sterlingDomain, solvePayload);

    // 5. Extract planId — returned in the result for caller to store in task metadata
    const planId = this.extractPlanId(result);

    // 5a. Parse Sterling identity from solve response (absent until server emits it)
    const sterlingIdentity = parseSterlingIdentity(result.metrics);

    // 6. Map Sterling's solution path to crafting steps
    if (!result.solutionFound) {
      const bundleOutput = computeBundleOutput({
        planId,
        solved: false,
        steps: [],
        totalNodes: result.discoveredNodes.length,
        durationMs: result.durationMs,
        solutionPathLength: 0,
        searchHealth: parseSearchHealth(result.metrics),
        ...rationaleCtx,
      });
      const solveBundle = createSolveBundle(bundleInput, bundleOutput, compatReport);
      attachSterlingIdentity(solveBundle, sterlingIdentity);

      return {
        solved: false,
        steps: [],
        totalNodes: result.discoveredNodes.length,
        durationMs: result.durationMs,
        error: result.error || 'No solution found',
        planId,
        solveMeta: { bundles: [solveBundle] },
        solveJoinKeys: planId ? extractSolveJoinKeys(solveBundle, planId) : undefined,
      };
    }

    const { steps, mapping } = this.mapSolutionToSteps(result, rules);

    const bundleOutput = computeBundleOutput({
      planId,
      solved: true,
      steps,
      totalNodes: result.discoveredNodes.length,
      durationMs: result.durationMs,
      solutionPathLength: result.solutionPath.length,
      searchHealth: parseSearchHealth(result.metrics),
      ...rationaleCtx,
    });
    const solveBundle = createSolveBundle(bundleInput, bundleOutput, compatReport);
    attachSterlingIdentity(solveBundle, sterlingIdentity);

    // Phase 1 observability: log identity field status once per solverId
    this.logIdentityFieldStatus(
      !!sterlingIdentity?.traceBundleHash,
      !!sterlingIdentity?.engineCommitment,
      !!sterlingIdentity?.operatorRegistryHash,
    );

    // Strict mode: treat degraded mapping as a solve failure
    if (this.strictMapping && mapping?.degraded) {
      return {
        solved: false,
        steps: [],
        totalNodes: result.discoveredNodes.length,
        durationMs: result.durationMs,
        planId,
        solveMeta: { bundles: [solveBundle] },
        solveJoinKeys: planId ? extractSolveJoinKeys(solveBundle, planId) : undefined,
        mappingDegraded: true,
        noActionLabelEdges: mapping.noLabelEdges,
        unmatchedRuleEdges: mapping.unmatchedRuleEdges,
        searchEdgeCollisions: mapping.searchEdgeCollisions,
        error: `Step mapping degraded: ${mapping.noLabelEdges} edges without label, `
          + `${mapping.unmatchedRuleEdges} unmatched rules, `
          + `${mapping.searchEdgeCollisions} search-edge collisions`,
      };
    }

    return {
      solved: true,
      steps,
      totalNodes: result.discoveredNodes.length,
      durationMs: result.durationMs,
      planId,
      solveMeta: { bundles: [solveBundle] },
      solveJoinKeys: planId ? extractSolveJoinKeys(solveBundle, planId) : undefined,
      mappingDegraded: mapping?.degraded,
      noActionLabelEdges: mapping?.noLabelEdges,
      unmatchedRuleEdges: mapping?.unmatchedRuleEdges,
      searchEdgeCollisions: mapping?.searchEdgeCollisions,
    };
  }

  /**
   * Convert a MinecraftCraftingSolveResult into TaskStep[] for the planning system.
   */
  toTaskSteps(result: MinecraftCraftingSolveResult): TaskStep[] {
    if (!result.solved || result.steps.length === 0) {
      return [];
    }

    const now = Date.now();
    return result.steps.map((step, index) => ({
      id: `step-${now}-${index + 1}`,
      label: this.stepToLeafLabel(step),
      done: false,
      order: index + 1,
      estimatedDuration: this.estimateDuration(step.actionType),
      meta: {
        domain: 'crafting',
        leaf: this.actionTypeToLeaf(step.actionType, step.action),
        action: step.action,
        actionType: step.actionType,
        produces: step.produces,
        consumes: step.consumes,
        ...(step.actionType === 'place' ? derivePlaceMeta(step.action) : {}),
        ...(step.degraded ? { degraded: true, degradedReason: step.degradedReason } : {}),
      },
    }));
  }

  /**
   * Report episode result back to Sterling so path algebra weights update.
   *
   * @param goalItem - Target item name
   * @param success - Whether the crafting goal was achieved
   * @param stepsCompleted - Number of steps completed
   * @param planId - planId from the solve result (stored in task metadata)
   */
  async reportEpisodeResult(
    goalItem: string,
    success: boolean,
    stepsCompleted: number,
    planId?: string | null,
    linkage?: import('./solve-bundle-types').EpisodeLinkage,
  ): Promise<import('./solve-bundle-types').EpisodeAck | undefined> {
    return this.reportEpisode({
      planId,
      goal: goalItem,
      success,
      stepsCompleted,
    }, linkage);
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Compute temporal enrichment via the single entrypoint.
   * Short-circuits to static INERT_ENRICHMENT when mode is 'off' —
   * no adapter allocation, no temporal code paths executed.
   */
  private computeEnrichment(
    mode: TemporalMode,
    options: CraftingTemporalOptions | undefined,
    rules: readonly MinecraftCraftingRule[],
    nearbyBlocks: readonly string[],
  ): TemporalEnrichment {
    if (mode === 'off') return INERT_ENRICHMENT;

    return computeTemporalEnrichment({
      mode,
      adapter: this.temporalAdapter,
      stateInput: {
        nowTicks: options?.nowTicks ?? 0,
        slotsObserved: options?.slotsObserved,
        nearbyBlocks,
        bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
        horizonBuckets: HORIZON_BUCKETS,
      },
      rules,
    });
  }

  /**
   * Map Sterling's solution path edges back to MinecraftSolveStep[].
   *
   * Each edge in the solution path has source/target as inventory state hashes
   * and an action label. Sterling's Python server emits labels as strings
   * (the rule action name directly, e.g. "craft:oak_planks"). We also
   * cross-reference search_edge labels as a fallback for older servers that
   * may not emit labels on solution_path edges.
   */
  private mapSolutionToSteps(
    result: import('@conscious-bot/core').SterlingSolveResult,
    rules: MinecraftCraftingRule[]
  ): StepMappingResult {
    const rulesByAction = new Map<string, MinecraftCraftingRule>();
    for (const rule of rules) {
      rulesByAction.set(rule.action, rule);
    }

    // Build a lookup from (source, target) → action name from search edges.
    // Keep the first entry for each key; count collisions (same key, different action).
    const edgeActionMap = new Map<string, string>();
    let searchEdgeCollisions = 0;
    for (const edge of result.searchEdges) {
      const actionName = extractActionName(edge.label);
      if (actionName) {
        const key = `${edge.source}->${edge.target}`;
        const existing = edgeActionMap.get(key);
        if (existing !== undefined) {
          if (existing !== actionName) searchEdgeCollisions++;
        } else {
          edgeActionMap.set(key, actionName);
        }
      }
    }

    const steps: MinecraftSolveStep[] = [];
    let currentInventory: Record<string, number> = {};
    let noLabelEdges = 0;
    let unmatchedRuleEdges = 0;

    for (const pathEdge of result.solutionPath) {
      // Priority: solution_path label > search_edge lookup
      const fromPathLabel = extractActionName(pathEdge.label);
      const fromSearchEdge = edgeActionMap.get(`${pathEdge.source}->${pathEdge.target}`);
      const actionName = fromPathLabel || fromSearchEdge || '';

      const rule = rulesByAction.get(actionName);
      if (!rule) {
        const reason = !actionName ? 'no_label' as const : 'unmatched_rule' as const;
        if (reason === 'no_label') noLabelEdges++;
        else unmatchedRuleEdges++;
        steps.push({
          action: actionName || `unknown-${steps.length}`,
          actionType: 'craft',
          produces: [],
          consumes: [],
          resultingInventory: { ...currentInventory },
          degraded: true,
          degradedReason: reason,
        });
        continue;
      }

      // Apply the rule to current inventory
      for (const consumed of rule.consumes) {
        currentInventory[consumed.name] = Math.max(
          0,
          (currentInventory[consumed.name] || 0) - consumed.count
        );
      }
      for (const produced of rule.produces) {
        currentInventory[produced.name] =
          (currentInventory[produced.name] || 0) + produced.count;
      }

      steps.push({
        action: rule.action,
        actionType: rule.actionType,
        produces: rule.produces,
        consumes: rule.consumes,
        resultingInventory: { ...currentInventory },
      });
    }

    const degraded = noLabelEdges > 0 || unmatchedRuleEdges > 0 || searchEdgeCollisions > 0;
    return {
      steps,
      mapping: degraded
        ? { degraded: true, noLabelEdges, unmatchedRuleEdges, searchEdgeCollisions }
        : undefined,
    };
  }

  /**
   * Map action type to the corresponding BT leaf name.
   * Delegates to shared leaf-routing module (single source of truth).
   */
  private actionTypeToLeaf(actionType: string, action?: string): string {
    return actionTypeToLeaf(actionType, action);
  }

  /**
   * Convert a solve step to a leaf-annotated label for the BT executor.
   */
  private stepToLeafLabel(step: MinecraftSolveStep): string {
    switch (step.actionType) {
      case 'mine': {
        const item = step.produces[0];
        const count = item?.count ?? 1;
        return `Leaf: minecraft.acquire_material (item=${item?.name ?? 'unknown'}, count=${count})`;
      }
      case 'craft': {
        const output = step.produces[0];
        const qty = output?.count ?? 1;
        return `Leaf: minecraft.craft_recipe (recipe=${output?.name ?? 'unknown'}, qty=${qty})`;
      }
      case 'smelt': {
        const output = step.produces[0];
        return `Leaf: minecraft.smelt (item=${output?.name ?? 'unknown'})`;
      }
      case 'place': {
        const item = parsePlaceAction(step.action) ?? step.consumes[0]?.name ?? 'unknown';
        const leaf = this.actionTypeToLeaf(step.actionType, step.action);
        if (leaf === 'place_workstation') {
          return `Leaf: minecraft.place_workstation (workstation=${item})`;
        }
        return `Leaf: minecraft.place_block (blockType=${item})`;
      }
      default:
        return `Leaf: minecraft.${step.action}`;
    }
  }

  /**
   * Estimate duration in ms based on action type.
   * Delegates to shared leaf-routing module.
   */
  private estimateDuration(actionType: string): number {
    return sharedEstimateDuration(actionType);
  }
}

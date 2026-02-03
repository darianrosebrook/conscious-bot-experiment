/**
 * Minecraft Furnace Scheduling Solver
 *
 * Orchestrates furnace scheduling solves: builds furnace rules, sends to
 * Sterling, and maps results to FurnaceSolveStep[].
 *
 * solverId = 'minecraft.furnace'
 * sterlingDomain = 'minecraft'
 *
 * @author @darianrosebrook
 */

import { BaseDomainSolver } from './base-domain-solver';
import { SOLVER_IDS } from './solver-ids';
import type {
  FurnaceSchedulingSolveResult,
  FurnaceSolveStep,
} from './minecraft-furnace-types';
import { buildFurnaceRules, buildFurnaceGoal } from './minecraft-furnace-rules';
import { lintRules } from './compat-linter';
import type { LintContext } from './compat-linter';
import {
  computeBundleInput,
  computeBundleOutput,
  createSolveBundle,
  buildDefaultRationaleContext,
  parseSterlingIdentity,
  attachSterlingIdentity,
} from './solve-bundle';
import type { SolveBundle, CompatReport } from './solve-bundle-types';
import { parseSearchHealth } from './search-health';
import { extractSolveJoinKeys } from './episode-classification';
import { P03ReferenceAdapter } from './primitives/p03/p03-reference-adapter';
import { MAX_WAIT_BUCKETS } from '../temporal/time-state';

// ============================================================================
// Constants
// ============================================================================

const MAX_NODES = 5000;

// ============================================================================
// Solver
// ============================================================================

export class MinecraftFurnaceSolver extends BaseDomainSolver<FurnaceSchedulingSolveResult> {
  readonly sterlingDomain = 'minecraft' as const;
  readonly solverId = SOLVER_IDS.FURNACE;

  /** Shared temporal adapter. */
  private readonly temporalAdapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

  protected makeUnavailableResult(): FurnaceSchedulingSolveResult {
    return {
      solved: false,
      steps: [],
      totalNodes: 0,
      durationMs: 0,
      error: 'Sterling reasoning service unavailable',
    };
  }

  /**
   * Solve a furnace scheduling problem.
   *
   * @param items - Items to smelt (e.g., ['iron_ore', 'gold_ore'])
   * @param inventory - Current inventory as { item: count }
   * @param furnaceSlots - Number of available furnace slots
   * @param nowTicks - Current game time in ticks (default: 0)
   */
  async solveFurnaceSchedule(
    items: readonly string[],
    inventory: Record<string, number>,
    furnaceSlots: number,
    nowTicks: number = 0,
  ): Promise<FurnaceSchedulingSolveResult> {
    if (!this.isAvailable()) {
      return this.makeUnavailableResult();
    }

    // Build rules
    const rules = buildFurnaceRules(items, furnaceSlots);

    // Lint rules
    const lintContext: LintContext = {
      solverId: this.solverId,
    };
    const compatReport = lintRules(rules, lintContext);

    // Build goal: one of each output item from the smeltable items
    const goal = buildFurnaceGoal(
      Object.fromEntries(
        items.map((item) => [item, (inventory[item] ?? 0) > 0 ? 1 : 1]),
      ),
    );

    // Compute bundle input
    const bundleInput = computeBundleInput({
      solverId: this.solverId,
      contractVersion: this.contractVersion,
      definitions: rules,
      inventory,
      goal,
      nearbyBlocks: [],
    });

    // Build payload
    const payload: Record<string, unknown> = {
      contractVersion: this.contractVersion,
      solverId: this.solverId,
      rules,
      inventory,
      goal,
      nearbyBlocks: [],
      maxNodes: MAX_NODES,
      useLearning: true,
      furnaceSlots,
      nowTicks,
    };

    try {
      const sterlingResult = await this.sterlingService.solve(
        this.sterlingDomain,
        payload,
      );

      const planId = this.extractPlanId(sterlingResult);
      const steps = this.mapSolutionToSteps(sterlingResult);
      const solved = sterlingResult.solutionFound && steps.length > 0;

      const searchHealth = parseSearchHealth(sterlingResult.metrics);

      // Compute bundle output
      const rationaleCtx = buildDefaultRationaleContext({
        compatReport,
        maxNodes: MAX_NODES,
      });

      const bundleOutput = computeBundleOutput({
        planId,
        solved,
        steps: steps.map((s) => ({ action: s.action })),
        totalNodes: sterlingResult.discoveredNodes?.length ?? 0,
        durationMs: sterlingResult.durationMs ?? 0,
        solutionPathLength: sterlingResult.solutionPath?.length ?? 0,
        searchHealth,
        ...rationaleCtx,
      });

      const bundle = createSolveBundle(bundleInput, bundleOutput, compatReport);
      attachSterlingIdentity(bundle, parseSterlingIdentity(sterlingResult.metrics));

      return {
        solved,
        steps,
        totalNodes: sterlingResult.discoveredNodes?.length ?? 0,
        durationMs: sterlingResult.durationMs ?? 0,
        planId,
        solveMeta: { bundles: [bundle] },
        solveJoinKeys: planId ? extractSolveJoinKeys(bundle, planId) : undefined,
      };
    } catch (err) {
      // Still produce a bundle on error for observability
      const bundleOutput = computeBundleOutput({
        planId: null,
        solved: false,
        steps: [],
        totalNodes: 0,
        durationMs: 0,
        solutionPathLength: 0,
      });

      const bundle = createSolveBundle(bundleInput, bundleOutput, compatReport);

      return {
        solved: false,
        steps: [],
        totalNodes: 0,
        durationMs: 0,
        error: err instanceof Error ? err.message : String(err),
        solveMeta: { bundles: [bundle] },
        // No solveJoinKeys — planId is null in error path
      };
    }
  }

  /**
   * Map Sterling solution path to FurnaceSolveStep[].
   */
  private mapSolutionToSteps(
    sterlingResult: any,
  ): FurnaceSolveStep[] {
    if (!sterlingResult.solutionFound) return [];

    const solutionPath = sterlingResult.solutionPath ?? [];
    const searchEdges = sterlingResult.searchEdges ?? [];

    const steps: FurnaceSolveStep[] = [];

    for (let i = 0; i < solutionPath.length; i++) {
      const edge = solutionPath[i];
      const label = this.extractLabel(edge, searchEdges, i);
      if (!label) continue;

      const step = this.labelToStep(label);
      if (step) steps.push(step);
    }

    return steps;
  }

  /**
   * Extract label from edge, with fallback to search edges.
   */
  private extractLabel(
    edge: any,
    searchEdges: any[],
    index: number,
  ): string | null {
    // Direct label
    if (typeof edge.label === 'string') return edge.label;
    if (edge.label?.action) return edge.label.action;

    // Fallback to search edge
    const matchingSearchEdge = searchEdges.find(
      (se: any) => se.source === edge.source && se.target === edge.target,
    );
    if (matchingSearchEdge) {
      if (typeof matchingSearchEdge.label === 'string')
        return matchingSearchEdge.label;
      if (matchingSearchEdge.label?.action)
        return matchingSearchEdge.label.action;
    }

    return null;
  }

  /**
   * Convert an action label to a FurnaceSolveStep.
   */
  private labelToStep(label: string): FurnaceSolveStep | null {
    if (label.startsWith('furnace:load:')) {
      const item = label.replace('furnace:load:', '');
      return {
        action: label,
        actionType: 'craft',
        operatorFamily: 'load_furnace',
        produces: [],
        consumes: [{ name: item, count: 1 }],
      };
    }
    if (label.startsWith('furnace:fuel:')) {
      return {
        action: label,
        actionType: 'craft',
        operatorFamily: 'add_fuel',
        produces: [],
        consumes: [{ name: 'coal', count: 1 }],
      };
    }
    if (label.startsWith('furnace:smelt:')) {
      const item = label.replace('furnace:smelt:', '');
      return {
        action: label,
        actionType: 'smelt',
        operatorFamily: 'wait_tick',
        produces: [{ name: `smelting:${item}`, count: 1 }],
        consumes: [],
      };
    }
    if (label.startsWith('furnace:retrieve:')) {
      const item = label.replace('furnace:retrieve:', '');
      return {
        action: label,
        actionType: 'craft',
        operatorFamily: 'retrieve_output',
        produces: [{ name: item, count: 1 }],
        consumes: [{ name: `smelting:${item}`, count: 1 }],
      };
    }
    return null;
  }

  /**
   * Report execution outcome for learning.
   */
  async reportEpisodeResult(
    goalItems: Record<string, number>,
    success: boolean,
    itemsSmelted: number,
    planId?: string | null,
    failureReason?: string,
    linkage?: import('./solve-bundle-types').EpisodeLinkage,
  ): Promise<import('./solve-bundle-types').EpisodeAck | undefined> {
    return this.reportEpisode({
      planId: planId ?? undefined,
      solverId: this.solverId,
      goalItems,
      success,
      itemsSmelted,
      failureReason,
    }, linkage);
  }
}

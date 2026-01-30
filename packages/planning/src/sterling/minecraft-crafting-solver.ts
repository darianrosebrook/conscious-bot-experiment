/**
 * Minecraft Crafting Solver
 *
 * Orchestrates crafting solves: builds rules from mcData, sends to Sterling,
 * and maps results to TaskStep[] for the planning system.
 *
 * @author @darianrosebrook
 */

import { BaseDomainSolver } from './base-domain-solver';
import type {
  MinecraftCraftingRule,
  MinecraftCraftingSolveResult,
  MinecraftSolveStep,
} from './minecraft-crafting-types';
import { buildCraftingRules, inventoryToRecord } from './minecraft-crafting-rules';
import { lintRules } from './compat-linter';
import {
  computeBundleInput,
  computeBundleOutput,
  createSolveBundle,
  buildDefaultRationaleContext,
} from './solve-bundle';
import { parseSearchHealth } from './search-health';

import type { TaskStep } from '../types/task-step';

// ============================================================================
// Solver
// ============================================================================

export class MinecraftCraftingSolver extends BaseDomainSolver<MinecraftCraftingSolveResult> {
  readonly sterlingDomain = 'minecraft' as const;
  readonly solverId = 'minecraft.crafting';

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
   */
  async solveCraftingGoal(
    goalItem: string,
    currentInventory: Array<{ name: string; count: number } | null | undefined>,
    mcData: any,
    nearbyBlocks: string[] = []
  ): Promise<MinecraftCraftingSolveResult> {
    if (!this.isAvailable()) return this.makeUnavailableResult();

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

    // 3a. Preflight lint + bundle input capture
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
    });
    if (compatReport.issues.length > 0) {
      console.warn(
        `[Sterling:compat] solverId=${this.solverId} issues=${compatReport.issues.length} codes=[${compatReport.issues.map((i) => i.code).join(',')}]`
      );
    }

    // 4. Call Sterling
    const result = await this.sterlingService.solve(this.sterlingDomain, {
      contractVersion: this.contractVersion,
      solverId: this.solverId,
      inventory,
      goal,
      nearbyBlocks,
      rules,
      maxNodes,
      useLearning: true,
    });

    // 5. Extract planId — returned in the result for caller to store in task metadata
    const planId = this.extractPlanId(result);

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

      return {
        solved: false,
        steps: [],
        totalNodes: result.discoveredNodes.length,
        durationMs: result.durationMs,
        error: result.error || 'No solution found',
        planId,
        solveMeta: { bundles: [solveBundle] },
      };
    }

    const steps = this.mapSolutionToSteps(result, rules);

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

    return {
      solved: true,
      steps,
      totalNodes: result.discoveredNodes.length,
      durationMs: result.durationMs,
      planId,
      solveMeta: { bundles: [solveBundle] },
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
  reportEpisodeResult(
    goalItem: string,
    success: boolean,
    stepsCompleted: number,
    planId?: string | null
  ): void {
    this.reportEpisode({
      planId,
      goal: goalItem,
      success,
      stepsCompleted,
    });
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Map Sterling's solution path edges back to MinecraftSolveStep[].
   *
   * Each edge in the solution path has source/target as inventory state hashes
   * and an implicit action label. We match edges to rules via the search_edge
   * labels collected during solve.
   */
  private mapSolutionToSteps(
    result: import('@conscious-bot/core').SterlingSolveResult,
    rules: MinecraftCraftingRule[]
  ): MinecraftSolveStep[] {
    const rulesByAction = new Map<string, MinecraftCraftingRule>();
    for (const rule of rules) {
      rulesByAction.set(rule.action, rule);
    }

    // Build a lookup from (source, target) → edge label from search edges
    const edgeLabelMap = new Map<string, Record<string, unknown>>();
    for (const edge of result.searchEdges) {
      edgeLabelMap.set(`${edge.source}->${edge.target}`, edge.label);
    }

    const steps: MinecraftSolveStep[] = [];
    let currentInventory: Record<string, number> = {};

    for (const pathEdge of result.solutionPath) {
      const edgeKey = `${pathEdge.source}->${pathEdge.target}`;
      const label = edgeLabelMap.get(edgeKey);
      const actionName = (label?.action as string) || (label?.label as string) || '';

      const rule = rulesByAction.get(actionName);
      if (!rule) {
        // If we can't map the edge to a rule, create a generic step
        steps.push({
          action: actionName || `unknown-${steps.length}`,
          actionType: 'craft',
          produces: [],
          consumes: [],
          resultingInventory: { ...currentInventory },
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

    return steps;
  }

  /**
   * Convert a solve step to a leaf-annotated label for the BT executor.
   */
  private stepToLeafLabel(step: MinecraftSolveStep): string {
    switch (step.actionType) {
      case 'mine': {
        const item = step.produces[0];
        const count = item?.count ?? 1;
        return `Leaf: minecraft.dig_block (blockType=${item?.name ?? 'unknown'}, count=${count})`;
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
        const consumed = step.consumes[0];
        return `Leaf: minecraft.place_block (blockType=${consumed?.name ?? 'unknown'})`;
      }
      default:
        return `Leaf: minecraft.${step.action}`;
    }
  }

  /**
   * Estimate duration in ms based on action type.
   */
  private estimateDuration(actionType: string): number {
    switch (actionType) {
      case 'mine':
        return 5000;
      case 'craft':
        return 2000;
      case 'smelt':
        return 15000;
      case 'place':
        return 1000;
      default:
        return 3000;
    }
  }
}

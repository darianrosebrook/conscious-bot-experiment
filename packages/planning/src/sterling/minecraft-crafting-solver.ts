/**
 * Minecraft Crafting Solver
 *
 * Orchestrates crafting solves: builds rules from mcData, sends to Sterling,
 * and maps results to TaskStep[] for the planning system.
 *
 * @author @darianrosebrook
 */

import type { SterlingReasoningService } from './sterling-reasoning-service';
import type {
  MinecraftCraftingRule,
  MinecraftCraftingSolveResult,
  MinecraftSolveStep,
} from './minecraft-crafting-types';
import { buildCraftingRules, inventoryToRecord } from './minecraft-crafting-rules';

// Re-use TaskStep shape from task-integration (structural match, no import cycle)
interface TaskStep {
  id: string;
  label: string;
  done: boolean;
  order: number;
  estimatedDuration?: number;
}

// ============================================================================
// Solver
// ============================================================================

export class MinecraftCraftingSolver {
  private sterlingService: SterlingReasoningService;
  private lastPlanId: string | null = null;

  constructor(sterlingService: SterlingReasoningService) {
    this.sterlingService = sterlingService;
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
    if (!this.sterlingService.isAvailable()) {
      return {
        solved: false,
        steps: [],
        totalNodes: 0,
        durationMs: 0,
        error: 'Sterling reasoning service unavailable',
      };
    }

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

    // 4. Call Sterling
    const result = await this.sterlingService.solve('minecraft', {
      inventory,
      goal,
      nearbyBlocks,
      rules,
      maxNodes: 5000,
      useLearning: true,
    });

    // 5. Capture planId from Sterling's metrics for episode reporting
    this.lastPlanId = (result.metrics?.planId as string) ?? null;

    // 6. Map Sterling's solution path to crafting steps
    if (!result.solutionFound) {
      return {
        solved: false,
        steps: [],
        totalNodes: result.discoveredNodes.length,
        durationMs: result.durationMs,
        error: result.error || 'No solution found',
      };
    }

    const steps = this.mapSolutionToSteps(result, rules);

    return {
      solved: true,
      steps,
      totalNodes: result.discoveredNodes.length,
      durationMs: result.durationMs,
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
   * Includes planId from the most recent solve so Sterling can match the
   * execution feedback to the correct pending plan.
   */
  reportEpisodeResult(
    goalItem: string,
    success: boolean,
    stepsCompleted: number
  ): void {
    if (!this.sterlingService.isAvailable()) return;

    // Fire-and-forget — don't block on the result
    this.sterlingService
      .solve('minecraft', {
        command: 'report_episode',
        domain: 'minecraft',
        planId: this.lastPlanId,
        goal: goalItem,
        success,
        stepsCompleted,
      })
      .catch((err) => {
        console.warn(
          `[Sterling] Failed to report episode result: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
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

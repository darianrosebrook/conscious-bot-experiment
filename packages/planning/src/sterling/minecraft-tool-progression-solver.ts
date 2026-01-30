/**
 * Minecraft Tool Progression Solver
 *
 * Plans multi-tier tool upgrades (wood -> stone -> iron -> diamond)
 * using Sterling's graph search. Each tier gate is modeled as a
 * capability requirement: mining iron_ore requires has_stone_pickaxe.
 *
 * Transport: uses sterlingDomain='minecraft' (existing backend handler).
 * Learning isolation: action IDs prefixed 'tp:', executionMode='tool_progression'.
 * Capabilities: virtual 'cap:' tokens in search state, filtered from output.
 *
 * @author @darianrosebrook
 */

import { BaseDomainSolver } from './base-domain-solver';
import type {
  ToolProgressionSolveResult,
  ToolProgressionStep,
  ToolTier,
  ToolType,
  NeedsBlocks,
  ToolProgressionRule,
  ToolProgressionItem,
} from './minecraft-tool-progression-types';
import {
  TOOL_TIERS,
  CAP_PREFIX,
  TIER_MATRIX_VERSION,
} from './minecraft-tool-progression-types';
import {
  buildToolProgressionRules,
  detectCurrentTier,
  parseToolName,
  validateInventoryInput,
  filterCapTokens,
  filterCapTokenItems,
} from './minecraft-tool-progression-rules';
import type { SolveBundle } from './solve-bundle-types';
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

export class MinecraftToolProgressionSolver extends BaseDomainSolver<ToolProgressionSolveResult> {
  /** Shares the existing 'minecraft' backend handler — no backend changes */
  readonly sterlingDomain = 'minecraft' as const;
  readonly solverId = 'minecraft.tool_progression';

  protected makeUnavailableResult(): ToolProgressionSolveResult {
    return {
      solved: false,
      steps: [],
      totalNodes: 0,
      durationMs: 0,
      error: 'Sterling reasoning service unavailable',
    };
  }

  /**
   * Solve a tool progression plan using Sterling's graph search.
   *
   * @param targetTool    - Target tool name (e.g. 'iron_pickaxe')
   * @param inventory     - Current inventory as {name: count}
   * @param nearbyBlocks  - Blocks the bot can currently observe
   */
  async solveToolProgression(
    targetTool: string,
    inventory: Record<string, number>,
    nearbyBlocks: string[] = []
  ): Promise<ToolProgressionSolveResult> {
    if (!this.isAvailable()) return this.makeUnavailableResult();

    // Validate no cap: tokens in input
    validateInventoryInput(inventory);

    // Parse target
    const parsed = parseToolName(targetTool);
    if (!parsed) {
      return {
        solved: false,
        steps: [],
        totalNodes: 0,
        durationMs: 0,
        error: `Unknown tool: ${targetTool}`,
      };
    }

    const { tier: targetTier, toolType } = parsed;
    const currentTier = detectCurrentTier(inventory);

    // Already have the target tier or better
    if (currentTier !== null) {
      const currentIdx = TOOL_TIERS.indexOf(currentTier);
      const targetIdx = TOOL_TIERS.indexOf(targetTier);
      if (currentIdx >= targetIdx) {
        return {
          solved: true,
          steps: [],
          totalNodes: 0,
          durationMs: 0,
          targetTier,
          currentTier,
          targetTool,
        };
      }
    }

    // Decompose multi-tier progression into single-tier solves.
    // Sterling's A* heuristic (missing-item-count) doesn't guide well for
    // multi-step progressions, causing search-space blowups. Solving each
    // tier step independently keeps each sub-problem tractable.
    const startIdx = currentTier ? TOOL_TIERS.indexOf(currentTier) + 1 : 0;
    const endIdx = TOOL_TIERS.indexOf(targetTier);

    const allSteps: ToolProgressionStep[] = [];
    const tierBundles: SolveBundle[] = [];
    let totalNodes = 0;
    let totalDurationMs = 0;
    let lastPlanId: string | null = null;
    let runningTier: ToolTier | null = currentTier;

    for (let i = startIdx; i <= endIdx; i++) {
      const tierGoal = TOOL_TIERS[i];
      const tierToolName = `${tierGoal}_${toolType}`;

      // Build rules for this single tier step
      const { rules, missingBlocks } = buildToolProgressionRules(
        tierToolName, toolType, runningTier, tierGoal, nearbyBlocks
      );

      // Early-exit: needs_blocks signal for partial observability
      if (missingBlocks.length > 0) {
        return {
          solved: false,
          steps: allSteps,
          totalNodes,
          durationMs: totalDurationMs,
          targetTier,
          currentTier,
          targetTool,
          needsBlocks: {
            missingBlocks,
            blockedAtTier: tierGoal,
            currentTier: runningTier,
          },
          planId: lastPlanId,
          solveMeta: tierBundles.length > 0 ? { bundles: tierBundles } : undefined,
        };
      }

      if (rules.length === 0) {
        return {
          solved: false,
          steps: allSteps,
          totalNodes,
          durationMs: totalDurationMs,
          error: `No rules generated for ${tierToolName}`,
          targetTier,
          currentTier,
          targetTool,
          planId: lastPlanId,
          solveMeta: tierBundles.length > 0 ? { bundles: tierBundles } : undefined,
        };
      }

      // Preflight lint + bundle input capture for this tier
      const compatReport = lintRules(rules, {
        executionMode: 'tool_progression',
        solverId: this.solverId,
      });
      if (compatReport.issues.length > 0) {
        console.warn(
          `[Sterling:compat] solverId=${this.solverId} tier=${tierGoal} issues=${compatReport.issues.length} codes=[${compatReport.issues.map((i) => i.code).join(',')}]`
        );
      }

      const maxNodes = 5000;
      const rationaleCtx = buildDefaultRationaleContext({ compatReport, maxNodes });

      // Build initial state: inventory + current capabilities
      const initialState = { ...inventory };
      if (runningTier) {
        const runIdx = TOOL_TIERS.indexOf(runningTier);
        for (let j = 0; j <= runIdx; j++) {
          initialState[`${CAP_PREFIX}has_${TOOL_TIERS[j]}_pickaxe`] = 1;
        }
      }

      const tierGoalRecord = { [tierToolName]: 1 };

      const bundleInput = computeBundleInput({
        solverId: this.solverId,
        executionMode: 'tool_progression',
        contractVersion: this.contractVersion,
        definitions: rules,
        inventory: initialState,
        goal: tierGoalRecord,
        nearbyBlocks,
        tierMatrixVersion: TIER_MATRIX_VERSION,
      });

      // Solve this tier step.
      // NOTE: nearbyBlocks is NOT sent to Sterling — block availability is
      // handled at the rule-builder level (missingBlocks early-exit above).
      // Sending nearbyBlocks to the backend causes a redundant filter that
      // blocks mine actions even when rules were generated correctly.
      const result = await this.sterlingService.solve(this.sterlingDomain, {
        contractVersion: this.contractVersion,
        executionMode: 'tool_progression',
        tierMatrixVersion: TIER_MATRIX_VERSION,
        solverId: this.solverId,
        inventory: initialState,
        goal: tierGoalRecord,
        rules,
        maxNodes,
        useLearning: true,
      });

      totalNodes += result.discoveredNodes.length;
      totalDurationMs += result.durationMs;
      lastPlanId = this.extractPlanId(result) ?? lastPlanId;

      if (!result.solutionFound) {
        const bundleOutput = computeBundleOutput({
          planId: lastPlanId,
          solved: false,
          steps: [],
          totalNodes: result.discoveredNodes.length,
          durationMs: result.durationMs,
          solutionPathLength: 0,
          searchHealth: parseSearchHealth(result.metrics),
          ...rationaleCtx,
        });
        tierBundles.push(createSolveBundle(bundleInput, bundleOutput, compatReport));

        return {
          solved: false,
          steps: allSteps,
          totalNodes,
          durationMs: totalDurationMs,
          error: result.error || `No solution found for ${tierToolName}`,
          targetTier,
          currentTier,
          targetTool,
          planId: lastPlanId,
          solveMeta: { bundles: tierBundles },
        };
      }

      // Map and accumulate steps
      const tierSteps = this.mapSolutionToSteps(result, rules);
      allSteps.push(...tierSteps);

      // Capture tier bundle
      const bundleOutput = computeBundleOutput({
        planId: lastPlanId,
        solved: true,
        steps: tierSteps,
        totalNodes: result.discoveredNodes.length,
        durationMs: result.durationMs,
        solutionPathLength: result.solutionPath.length,
        searchHealth: parseSearchHealth(result.metrics),
        ...rationaleCtx,
      });
      tierBundles.push(createSolveBundle(bundleInput, bundleOutput, compatReport));

      // Update running state for next tier
      runningTier = tierGoal;
      // Merge produced inventory into running inventory for next tier
      if (tierSteps.length > 0) {
        const lastStep = tierSteps[tierSteps.length - 1];
        // Use the last step's resulting inventory as base for next tier
        for (const [key, value] of Object.entries(lastStep.resultingInventory)) {
          inventory[key] = value;
        }
      }
      inventory[tierToolName] = (inventory[tierToolName] || 0) + 1;
    }

    return {
      solved: true,
      steps: allSteps,
      totalNodes,
      durationMs: totalDurationMs,
      targetTier,
      currentTier,
      targetTool,
      planId: lastPlanId,
      solveMeta: { bundles: tierBundles },
    };
  }

  /**
   * Convert a ToolProgressionSolveResult into TaskStep[] for the planning system.
   */
  toTaskSteps(result: ToolProgressionSolveResult): TaskStep[] {
    if (!result.solved || result.steps.length === 0) {
      return [];
    }

    const now = Date.now();
    return result.steps.map((step, index) => ({
      id: `step-${now}-tp-${index + 1}`,
      label: this.stepToLeafLabel(step),
      done: false,
      order: index + 1,
      estimatedDuration: this.estimateDuration(step.actionType),
      meta: {
        domain: 'tool_progression',
        leaf: this.actionTypeToLeaf(step.actionType),
        action: step.action,
        targetTool: result.targetTool,
        targetTier: result.targetTier,
      },
    }));
  }

  /**
   * Report episode result back to Sterling for learning.
   */
  reportEpisodeResult(
    targetTool: string,
    targetTier: ToolTier,
    currentTier: ToolTier | null,
    success: boolean,
    tiersCompleted: number,
    planId?: string | null,
    failedAtTier?: ToolTier,
    failureReason?: string
  ): void {
    this.reportEpisode({
      planId,
      targetTool,
      targetTier,
      currentTier,
      success,
      tiersCompleted,
      failedAtTier,
      failureReason,
    });
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Map Sterling's solution path to ToolProgressionStep[].
   * Filters out cap: tokens from all output fields.
   */
  private mapSolutionToSteps(
    result: import('@conscious-bot/core').SterlingSolveResult,
    rules: ToolProgressionRule[]
  ): ToolProgressionStep[] {
    const rulesByAction = new Map<string, ToolProgressionRule>();
    for (const rule of rules) {
      rulesByAction.set(rule.action, rule);
    }

    // Build edge label lookup
    const edgeLabelMap = new Map<string, Record<string, unknown>>();
    for (const edge of result.searchEdges) {
      edgeLabelMap.set(`${edge.source}->${edge.target}`, edge.label);
    }

    const steps: ToolProgressionStep[] = [];
    let currentInventory: Record<string, number> = {};

    for (const pathEdge of result.solutionPath) {
      const edgeKey = `${pathEdge.source}->${pathEdge.target}`;
      const label = edgeLabelMap.get(edgeKey);
      const actionName = (label?.action as string) || (label?.label as string) || '';

      const rule = rulesByAction.get(actionName);
      if (!rule) {
        steps.push({
          action: actionName || `tp:unknown-${steps.length}`,
          actionType: 'craft',
          produces: [],
          consumes: [],
          resultingInventory: filterCapTokens({ ...currentInventory }),
        });
        continue;
      }

      // Apply rule to current inventory (including cap: tokens for search state)
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

      // Detect upgrade rules by 'tp:upgrade:' prefix — rule uses actionType='craft'
      // (Sterling only accepts craft|mine|smelt|place) but output steps use 'upgrade'
      const outputActionType = rule.action.startsWith('tp:upgrade:')
        ? 'upgrade' as const
        : rule.actionType;

      steps.push({
        action: rule.action,
        actionType: outputActionType,
        // Filter cap: tokens from output-facing fields
        produces: filterCapTokenItems(rule.produces),
        consumes: filterCapTokenItems(rule.consumes),
        resultingInventory: filterCapTokens({ ...currentInventory }),
      });
    }

    return steps;
  }

  /**
   * Convert a progression step to a leaf-annotated label for the BT executor.
   * Reuses existing leaf names: minecraft.dig_block, minecraft.craft_recipe,
   * minecraft.smelt, minecraft.place_block.
   */
  private stepToLeafLabel(step: ToolProgressionStep): string {
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
      case 'upgrade': {
        // Upgrade actions produce the tool item (first non-cap: produce)
        const toolItem = step.produces[0];
        return `Leaf: minecraft.craft_recipe (recipe=${toolItem?.name ?? 'unknown'}, qty=1)`;
      }
      default:
        return `Leaf: minecraft.${step.action.replace('tp:', '')}`;
    }
  }

  /**
   * Map action type to leaf name for structured metadata.
   */
  private actionTypeToLeaf(actionType: string): string {
    switch (actionType) {
      case 'mine': return 'dig_block';
      case 'craft': return 'craft_recipe';
      case 'smelt': return 'smelt';
      case 'place': return 'place_block';
      case 'upgrade': return 'craft_recipe';
      default: return actionType;
    }
  }

  /**
   * Estimate duration in ms based on action type.
   */
  private estimateDuration(actionType: string): number {
    switch (actionType) {
      case 'mine': return 5000;
      case 'craft': return 2000;
      case 'smelt': return 15000;
      case 'place': return 1000;
      case 'upgrade': return 2000;
      default: return 3000;
    }
  }

  /**
   * Determine which tier is blocked by missing blocks.
   */
  private findBlockedTier(missingBlocks: string[], currentTier: ToolTier | null): ToolTier {
    // Missing stone/cobblestone -> blocked at stone tier
    if (missingBlocks.includes('stone') || missingBlocks.includes('cobblestone')) {
      return 'stone';
    }
    // Missing iron_ore -> blocked at iron tier
    if (missingBlocks.includes('iron_ore')) {
      return 'iron';
    }
    // Missing diamond_ore -> blocked at diamond tier
    if (missingBlocks.includes('diamond_ore')) {
      return 'diamond';
    }
    // Default: next tier after current
    const nextIdx = currentTier ? TOOL_TIERS.indexOf(currentTier) + 1 : 0;
    return TOOL_TIERS[Math.min(nextIdx, TOOL_TIERS.length - 1)];
  }
}

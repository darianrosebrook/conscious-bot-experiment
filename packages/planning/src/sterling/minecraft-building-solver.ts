/**
 * Minecraft Building Solver
 *
 * Orchestrates building solves: sends module templates to Sterling,
 * maps results to TaskStep[] for the planning system, and reports
 * execution feedback for learning.
 *
 * When Sterling returns a 'needs_materials' result, the solver surfaces
 * it so the client can run crafting to satisfy deficits before retrying.
 *
 * @author @darianrosebrook
 */

import type { SterlingReasoningService } from './sterling-reasoning-service';
import type {
  BuildingModule,
  BuildingSiteState,
  BuildingSolveResult,
  BuildingSolveStep,
  BuildingMaterialDeficit,
} from './minecraft-building-types';

// Re-use TaskStep shape from task-integration (structural match, no import cycle)
interface TaskStep {
  id: string;
  label: string;
  done: boolean;
  order: number;
  estimatedDuration?: number;
  meta?: Record<string, unknown>;
}

// ============================================================================
// Solver
// ============================================================================

export class MinecraftBuildingSolver {
  private sterlingService: SterlingReasoningService;
  private lastPlanId: string | null = null;

  constructor(sterlingService: SterlingReasoningService) {
    this.sterlingService = sterlingService;
  }

  /**
   * Solve a building plan using Sterling's module-sequenced assembly search.
   *
   * @param templateId    - Template identifier
   * @param facing        - Facing direction (N/S/E/W)
   * @param goalModules   - Module IDs that define completion
   * @param inventory     - Current building materials
   * @param siteState     - Coarse site characterization
   * @param modules       - Module definitions with feasibility
   */
  async solveBuildingPlan(
    templateId: string,
    facing: string,
    goalModules: string[],
    inventory: Record<string, number>,
    siteState: BuildingSiteState,
    modules: BuildingModule[],
    executionMode?: string
  ): Promise<BuildingSolveResult> {
    if (!this.sterlingService.isAvailable()) {
      return {
        solved: false,
        steps: [],
        totalNodes: 0,
        durationMs: 0,
        error: 'Sterling reasoning service unavailable',
      };
    }

    if (modules.length === 0) {
      return {
        solved: false,
        steps: [],
        totalNodes: 0,
        durationMs: 0,
        error: 'No building modules provided',
      };
    }

    if (goalModules.length === 0) {
      return {
        solved: false,
        steps: [],
        totalNodes: 0,
        durationMs: 0,
        error: 'No goal modules specified',
      };
    }

    // Call Sterling building domain
    const result = await this.sterlingService.solve('building', {
      command: 'solve',
      domain: 'building',
      contractVersion: 1,
      templateId,
      facing,
      goalModules,
      inventory,
      siteState,
      modules,
      maxNodes: 2000,
      useLearning: true,
      executionMode: executionMode || undefined,
    });

    // Capture planId for episode reporting
    this.lastPlanId = (result.metrics?.planId as string) ?? null;

    // Check for needs_materials in metrics
    const needsMaterials = result.metrics?.needsMaterials as BuildingMaterialDeficit | undefined;

    if (needsMaterials) {
      return {
        solved: false,
        steps: [],
        totalNodes: result.discoveredNodes.length,
        durationMs: result.durationMs,
        needsMaterials,
      };
    }

    if (!result.solutionFound) {
      return {
        solved: false,
        steps: [],
        totalNodes: result.discoveredNodes.length,
        durationMs: result.durationMs,
        error: result.error || 'No building solution found',
      };
    }

    // Map Sterling's solution to building steps
    const steps = this.mapSolutionToSteps(result);

    return {
      solved: true,
      steps,
      totalNodes: result.discoveredNodes.length,
      durationMs: result.durationMs,
    };
  }

  /**
   * Convert a BuildingSolveResult into TaskStep[] for the planning system.
   *
   * If result.needsMaterials is present, generates crafting prerequisite
   * steps before the building steps.
   */
  toTaskSteps(result: BuildingSolveResult): TaskStep[] {
    const taskSteps: TaskStep[] = [];
    const now = Date.now();
    let order = 1;

    // If materials are needed, generate acquisition steps first
    if (result.needsMaterials) {
      for (const [itemName, count] of Object.entries(result.needsMaterials.deficit)) {
        taskSteps.push({
          id: `step-${now}-acquire-${order}`,
          label: `Leaf: minecraft.acquire_material (item=${itemName}, count=${count})`,
          done: false,
          order: order++,
          estimatedDuration: 10000,
        });
      }
    }

    // Add building steps
    for (const step of result.steps) {
      taskSteps.push({
        id: `step-${now}-build-${order}`,
        label: this.stepToLeafLabel(step),
        done: false,
        order: order++,
        estimatedDuration: this.estimateDuration(step.moduleType),
      });
    }

    return taskSteps;
  }

  /**
   * Convert a BuildingSolveResult into TaskStep[] with replan sentinel support.
   *
   * When result.needsMaterials is present, generates acquisition steps followed
   * by a replan_building sentinel step. When the executor reaches the sentinel,
   * it re-invokes the building solver with updated inventory. This avoids
   * generating stale building steps from a deficit result.
   *
   * When result.solved is true, generates concrete building steps directly.
   */
  toTaskStepsWithReplan(result: BuildingSolveResult, templateId: string): TaskStep[] {
    const taskSteps: TaskStep[] = [];
    let order = 1;
    const now = Date.now();

    if (result.needsMaterials) {
      // Acquisition steps
      for (const [itemName, count] of Object.entries(result.needsMaterials.deficit)) {
        taskSteps.push({
          id: `step-${now}-acquire-${order}`,
          label: `Leaf: minecraft.acquire_material (item=${itemName}, count=${count})`,
          done: false,
          order: order++,
          estimatedDuration: 10000,
          meta: { domain: 'building', leaf: 'acquire_material', item: itemName, count, templateId },
        });
      }
      console.log(
        `[Building] Deficit detected: inserting ${taskSteps.length} acquisition steps + replan sentinel`
      );

      // Replan sentinel — when executor reaches this, it re-invokes the solver
      taskSteps.push({
        id: `step-${now}-replan-${order}`,
        label: `Leaf: minecraft.replan_building (templateId=${templateId})`,
        done: false,
        order: order++,
        estimatedDuration: 2000,
        meta: { domain: 'building', leaf: 'replan_building', templateId },
      });

      return taskSteps;
    }

    // Normal case: building steps only
    for (const step of result.steps) {
      taskSteps.push({
        id: `step-${now}-build-${order}`,
        label: this.stepToLeafLabel(step),
        done: false,
        order: order++,
        estimatedDuration: this.estimateDuration(step.moduleType),
        meta: {
          domain: 'building',
          leaf: this.moduleTypeToLeaf(step.moduleType),
          moduleId: step.moduleId,
          moduleType: step.moduleType,
          templateId,
        },
      });
    }

    return taskSteps;
  }

  /**
   * Get the lastPlanId from the most recent solve call.
   * Prefer reading planId from task metadata instead of this getter.
   * @deprecated Use planId from task metadata instead
   */
  getLastPlanId(): string | null {
    return this.lastPlanId;
  }

  /**
   * Report episode result back to Sterling so path algebra weights update.
   *
   * Uses module IDs (not just a count) so Sterling can target the correct
   * action edges for learning. Includes optional failure identification.
   *
   * @param templateId - Template identifier (quarantined for P0 stubs)
   * @param success - Whether the build completed successfully
   * @param executedModuleIds - Module IDs that were executed
   * @param failureAtModuleId - Module where failure occurred (if any)
   * @param failureReason - Why the build failed (if any)
   * @param planId - Explicit planId from task metadata (preferred over lastPlanId)
   */
  reportEpisodeResult(
    templateId: string,
    success: boolean,
    executedModuleIds: string[],
    failureAtModuleId?: string,
    failureReason?: string,
    planId?: string | null,
    isStub?: boolean
  ): void {
    if (!this.sterlingService.isAvailable()) return;

    const effectivePlanId = planId ?? this.lastPlanId;

    // Fire-and-forget — don't block on the result
    this.sterlingService
      .solve('building', {
        command: 'report_episode',
        domain: 'building',
        contractVersion: 1,
        planId: effectivePlanId,
        templateId,
        success,
        executedModuleIds,
        failureAtModuleId,
        failureReason,
        isStub: isStub ?? false,
      })
      .catch((err) => {
        console.warn(
          `[Sterling] Failed to report building episode: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      });
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Map Sterling's complete message steps to BuildingSolveStep[].
   */
  private mapSolutionToSteps(
    result: import('@conscious-bot/core').SterlingSolveResult
  ): BuildingSolveStep[] {
    // Sterling building domain sends steps directly in the complete message
    // via result.metrics.steps (populated from solve_result)
    const rawSteps = (result.metrics?.steps as Array<Record<string, unknown>>) ?? [];

    return rawSteps.map((raw) => ({
      moduleId: String(raw.moduleId ?? ''),
      moduleType: String(raw.moduleType ?? 'apply_module') as BuildingSolveStep['moduleType'],
      materialsNeeded: (raw.materialsNeeded as Array<{ name: string; count: number }>) ?? [],
      resultingProgress: Number(raw.resultingProgress ?? 0),
      resultingInventory: (raw.resultingInventory as Record<string, number>) ?? {},
    }));
  }

  /**
   * Convert a building solve step to a leaf-annotated label for the BT executor.
   */
  private stepToLeafLabel(step: BuildingSolveStep): string {
    switch (step.moduleType) {
      case 'prep_site':
        return `Leaf: minecraft.prepare_site (module=${step.moduleId})`;
      case 'apply_module': {
        const mats = step.materialsNeeded
          .map((m) => `${m.name}x${m.count}`)
          .join(', ');
        return `Leaf: minecraft.build_module (module=${step.moduleId}${mats ? `, materials=${mats}` : ''})`;
      }
      case 'place_feature':
        return `Leaf: minecraft.place_feature (module=${step.moduleId})`;
      default:
        return `Leaf: minecraft.building_step (module=${step.moduleId})`;
    }
  }

  /**
   * Map module type to leaf name for structured metadata.
   */
  private moduleTypeToLeaf(moduleType: string): string {
    switch (moduleType) {
      case 'prep_site':
        return 'prepare_site';
      case 'apply_module':
        return 'build_module';
      case 'place_feature':
        return 'place_feature';
      default:
        return 'building_step';
    }
  }

  /**
   * Estimate duration in ms based on module type.
   */
  private estimateDuration(moduleType: string): number {
    switch (moduleType) {
      case 'prep_site':
        return 10000;
      case 'apply_module':
        return 20000;
      case 'place_feature':
        return 5000;
      default:
        return 15000;
    }
  }
}

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

import { BaseDomainSolver } from './base-domain-solver';
import type { DomainDeclarationV1 } from './domain-declaration';
import { SOLVER_IDS } from './solver-ids';
import type {
  BuildingModule,
  BuildingSiteState,
  BuildingSolveResult,
  BuildingSolveStep,
  BuildingMaterialDeficit,
} from './minecraft-building-types';
import type { CompatReport } from './solve-bundle-types';
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
import { buildDagFromModules, findCommutingPairs } from '../constraints/dag-builder';
import { linearize } from '../constraints/linearization';
import { checkFeasibility } from '../constraints/feasibility-checker';
import { extractDependencyConstraints, extractSupportConstraints } from '../constraints/constraint-model';
import { computeRigGSignals } from '../constraints/signals';
import type { PlanningDecision } from '../constraints/planning-decisions';
import type { PartialOrderPlan, RigGSignals } from '../constraints/partial-order-plan';
import type { LinearizationResult } from '../constraints/linearization';
import type { FeasibilityResult } from '../constraints/feasibility-checker';
import type { RigGMode, RigGStageDecisions } from './minecraft-building-types';

// ============================================================================
// Domain Declaration
// ============================================================================

export const BUILDING_DECLARATION: DomainDeclarationV1 = {
  declarationVersion: 1,
  solverId: SOLVER_IDS.BUILDING,
  contractVersion: 1,
  implementsPrimitives: ['CB-P07'],
  consumesFields: ['modules', 'goalModules', 'inventory', 'siteState', 'templateId', 'facing'],
  producesFields: ['steps', 'planId', 'solveMeta', 'needsMaterials'],
};

// ============================================================================
// Solver
// ============================================================================

export class MinecraftBuildingSolver extends BaseDomainSolver<BuildingSolveResult> {
  readonly sterlingDomain = 'building' as const;
  readonly solverId = SOLVER_IDS.BUILDING;

  override getDomainDeclaration(): DomainDeclarationV1 {
    return BUILDING_DECLARATION;
  }

  protected makeUnavailableResult(): BuildingSolveResult {
    return {
      solved: false,
      steps: [],
      totalNodes: 0,
      durationMs: 0,
      error: 'Sterling reasoning service unavailable',
    };
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
    if (!this.isAvailable()) return this.makeUnavailableResult();
    await this.ensureDeclarationRegistered();

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

    // Building uses modules, not action rules — no lintRules call.
    // Empty compat report for bundle computation.
    const maxNodes = 2000;
    const compatReport: CompatReport = {
      valid: true,
      issues: [],
      checkedAt: Date.now(),
      definitionCount: modules.length,
    };
    const rationaleCtx = buildDefaultRationaleContext({ compatReport, maxNodes });

    const goalRecord: Record<string, number> = {};
    for (const gm of goalModules) {
      goalRecord[gm] = 1;
    }

    const bundleInput = computeBundleInput({
      solverId: this.solverId,
      executionMode,
      contractVersion: this.contractVersion,
      definitions: modules,
      inventory,
      goal: goalRecord,
      nearbyBlocks: [],
    });

    // Call Sterling building domain
    const result = await this.sterlingService.solve(this.sterlingDomain, {
      contractVersion: this.contractVersion,
      templateId,
      facing,
      goalModules,
      inventory,
      siteState,
      modules,
      maxNodes,
      useLearning: true,
      executionMode: executionMode || undefined,
    });

    // Extract planId — returned in the result for caller to store in task metadata
    const planId = this.extractPlanId(result);

    // Parse Sterling identity from solve response
    const sterlingIdentity = parseSterlingIdentity(result.metrics);

    // Check for needs_materials in metrics
    const needsMaterials = result.metrics?.needsMaterials as BuildingMaterialDeficit | undefined;

    if (needsMaterials) {
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
        needsMaterials,
        planId,
        solveMeta: { bundles: [solveBundle] },
        solveJoinKeys: planId ? extractSolveJoinKeys(solveBundle, planId) : undefined,
      };
    }

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
        error: result.error || 'No building solution found',
        planId,
        solveMeta: { bundles: [solveBundle] },
        solveJoinKeys: planId ? extractSolveJoinKeys(solveBundle, planId) : undefined,
      };
    }

    // Map Sterling's solution to building steps
    const rawSteps = this.mapSolutionToSteps(result);

    // Rig G DAG pipeline: build → linearize → feasibility → commuting → signals
    // Supports strict (fail-closed) and permissive (fallback to raw steps) modes.
    const rigGMode: RigGMode = (executionMode === 'strict' ? 'strict' : 'permissive');
    const dagDecision = buildDagFromModules(modules, rawSteps);
    let steps = rawSteps;
    let partialOrderPlan: PartialOrderPlan<BuildingSolveStep> | undefined;
    let rigGSignals: RigGSignals | undefined;
    let degradedToRawSteps = false;

    // Per-stage decisions for operational debugging
    let linDecision: PlanningDecision<LinearizationResult<BuildingSolveStep>> | undefined;
    let feasDecision: PlanningDecision<FeasibilityResult> | undefined;
    let overallDecision: PlanningDecision<PartialOrderPlan<BuildingSolveStep>> = dagDecision;

    if (dagDecision.kind === 'ok') {
      const dag = dagDecision.value;

      // Linearize for deterministic step ordering
      linDecision = linearize(dag);
      if (linDecision.kind === 'ok') {
        // steps[] is always a projection of linearize(dag)
        steps = linDecision.value.order.map((n) => n.data);
        partialOrderPlan = dag;
        overallDecision = { kind: 'ok', value: dag };

        // Feasibility check (dependency + support constraints from modules)
        const depConstraints = extractDependencyConstraints(modules);
        const supportConstraints = extractSupportConstraints(modules);
        const constraints = [...depConstraints, ...supportConstraints];
        feasDecision = checkFeasibility(dag, constraints);
        const feasibility =
          feasDecision.kind === 'ok' ? feasDecision.value : undefined;

        // Commuting pairs
        const commutingPairs = findCommutingPairs(dag);

        // Compute signals
        rigGSignals = computeRigGSignals({
          plan: dag,
          linearization: linDecision.value,
          feasibility,
          commutingPairs,
          degradedToRawSteps: false,
        });
      } else {
        // Linearization failed (cycle)
        overallDecision = linDecision;
        if (rigGMode === 'strict') {
          // Fail-closed: propagate the error
          console.warn(
            `[Building] DAG linearization failed (strict mode): ${linDecision.detail}`
          );
        } else {
          // Permissive: fall back to raw step order
          degradedToRawSteps = true;
          console.warn(
            `[Building] DAG linearization failed, degrading to raw steps: ${linDecision.detail}`
          );
        }
      }
    } else {
      // DAG construction blocked
      overallDecision = dagDecision;
      if (rigGMode === 'strict') {
        console.warn(
          `[Building] DAG construction ${dagDecision.kind} (strict mode): ${dagDecision.detail}`
        );
      } else {
        degradedToRawSteps = true;
        console.warn(
          `[Building] DAG construction ${dagDecision.kind}, degrading to raw steps: ${dagDecision.detail}`
        );
      }
    }

    const rigGStageDecisions: RigGStageDecisions = {
      dagDecision,
      linearizeDecision: linDecision,
      feasibilityDecision: feasDecision,
      overallDecision,
    };

    const bundleOutput = computeBundleOutput({
      planId,
      solved: true,
      steps: steps.map((s) => ({ action: s.moduleId })),
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

    return {
      solved: true,
      steps,
      totalNodes: result.discoveredNodes.length,
      durationMs: result.durationMs,
      planId,
      solveMeta: { bundles: [solveBundle] },
      solveJoinKeys: planId ? extractSolveJoinKeys(solveBundle, planId) : undefined,
      partialOrderPlan,
      rigGSignals,
      rigGStageDecisions,
      degradedToRawSteps,
      planDecision: dagDecision,
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
   * @param planId - planId from the solve result (stored in task metadata)
   * @param isStub - Whether this is a P0 stub episode
   */
  async reportEpisodeResult(
    templateId: string,
    success: boolean,
    executedModuleIds: string[],
    failureAtModuleId?: string,
    failureReason?: string,
    planId?: string | null,
    isStub?: boolean,
    linkage?: import('./solve-bundle-types').EpisodeLinkage,
  ): Promise<import('./solve-bundle-types').EpisodeAck | undefined> {
    return this.reportEpisode({
      planId,
      templateId,
      success,
      executedModuleIds,
      failureAtModuleId,
      failureReason,
      isStub: isStub ?? false,
    }, linkage);
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
      case 'scaffold':
        return `Leaf: minecraft.place_scaffold (module=${step.moduleId})`;
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
      case 'scaffold':
        return 'place_scaffold';
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
      case 'scaffold':
        return 8000;
      default:
        return 15000;
    }
  }
}

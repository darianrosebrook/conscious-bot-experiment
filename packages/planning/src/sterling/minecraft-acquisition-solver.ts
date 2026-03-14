/**
 * Minecraft Acquisition Solver (Rig D)
 *
 * Coordinator solver that delegates to sub-solvers per strategy.
 * Strategies: mine/craft → MinecraftCraftingSolver, trade/loot/salvage → Sterling.
 *
 * Uses sterlingDomain='minecraft', solverId='minecraft.acquisition'.
 * Does NOT introduce a new Sterling backend domain.
 *
 * @author @darianrosebrook
 */

import { BaseDomainSolver } from './base-domain-solver';
import type { DomainDeclarationV1 } from './domain-declaration';
import { SOLVER_IDS } from './solver-ids';
import type { MinecraftCraftingSolver } from './minecraft-crafting-solver';
import type {
  AcquisitionSolveResult,
  AcquisitionSolveStep,
  AcquisitionCandidate,
  AcquisitionContextV1,
} from './minecraft-acquisition-types';
import {
  hashAcquisitionContext,
  computeCandidateSetDigest,
} from './minecraft-acquisition-types';
import {
  buildAcquisitionContext,
  buildAcquisitionStrategies,
  buildSalvageCandidatesWithInventory,
  rankStrategies,
  rankStrategiesWithEvidence,
  contextKeyFromAcquisitionContext,
  MINECRAFT_TRADE_TABLE,
  MINECRAFT_SALVAGE_TABLE,
  type NearbyEntity,
} from './minecraft-acquisition-rules';
import { isValidMcData, type McData } from './minecraft-crafting-rules';
import { getLeafContractEntries } from '../modules/leaf-arg-contracts';
import { StrategyPriorStore } from './minecraft-acquisition-priors';
import { lintRules, type LintableRule } from './compat-linter';
import {
  computeBundleInput,
  computeBundleOutput,
  createSolveBundle,
  hashDefinition,
  hashGoal,
  hashNearbyBlocks,
  buildDefaultRationaleContext,
  parseSterlingIdentity,
  attachSterlingIdentity,
  attachOrchestrationProvenance,
} from './solve-bundle';
import { buildAcquireForCraftBridge } from './bridge-artifact';
import type { BridgeEdgeV1 } from './bridge-artifact-types';
import type { SolveBundle, ObjectiveWeights, ObjectiveWeightsSource } from './solve-bundle-types';
import { parseSearchHealth } from './search-health';
import { extractSolveJoinKeys } from './episode-classification';
import type { TaskStep } from '../types/task-step';
import {
  actionTypeToLeaf,
  estimateDuration as sharedEstimateDuration,
} from './leaf-routing';

// ============================================================================
// Acquisition Rule Builders
// ============================================================================

/**
 * Build trade rules for Sterling. Uses acq:trade:<item> prefix.
 * actionType remains 'craft' (zero Sterling backend changes).
 */
export function buildTradeRules(
  item: string,
): LintableRule[] {
  const trade = MINECRAFT_TRADE_TABLE[item];
  if (!trade) return [];

  return [{
    action: `acq:trade:${item}`,
    actionType: 'craft',
    produces: [{ name: item, count: 1 }],
    consumes: trade.cost.map(c => ({ name: c.item, count: c.count })),
    requires: [{ name: 'proximity:villager', count: 1 }],
  }];
}

/**
 * Build loot rules for Sterling. Uses acq:loot:<item> prefix.
 * Container interaction modeled as craft consuming proximity:container:<kind> token.
 */
export function buildLootRules(
  item: string,
  containerKind = 'chest',
): LintableRule[] {
  return [{
    action: `acq:loot:${item}`,
    actionType: 'craft',
    produces: [{ name: item, count: 1 }],
    consumes: [],
    requires: [{ name: `proximity:container:${containerKind}`, count: 1 }],
  }];
}

/**
 * Build salvage rules for Sterling. Uses acq:salvage:<item> prefix.
 * Reverse-crafting: consumes source item, produces components.
 */
export function buildSalvageRules(
  item: string,
): LintableRule[] {
  const entries = MINECRAFT_SALVAGE_TABLE[item];
  if (!entries) return [];

  return entries.map(entry => ({
    action: `acq:salvage:${item}:from:${entry.sourceItem}`,
    actionType: 'craft' as const,
    produces: entry.produces.map(p => ({ name: p.item, count: p.count })),
    consumes: [{ name: entry.sourceItem, count: 1 }],
    requires: [],
  }));
}

// ============================================================================
// Solver Options
// ============================================================================

export interface AcquisitionSolveOptions {
  objectiveWeights?: ObjectiveWeights;
  maxNodes?: number;
  /**
   * M4: Explicit learning toggle. When false, priors are not consulted
   * during ranking (all strategies ranked by static cost only).
   * Default: true (production behavior).
   */
  useLearning?: boolean;
}

// ============================================================================
// Domain Declaration
// ============================================================================

export const ACQUISITION_DECLARATION: DomainDeclarationV1 = {
  declarationVersion: 1,
  solverId: SOLVER_IDS.ACQUISITION,
  contractVersion: 1,
  implementsPrimitives: ['CB-P01', 'CB-P04'],
  consumesFields: ['inventory', 'goal', 'nearbyBlocks', 'nearbyEntities', 'rules', 'maxNodes'],
  producesFields: ['steps', 'planId', 'solveMeta', 'strategyRanking'],
};

// ============================================================================
// Solver
// ============================================================================

export class MinecraftAcquisitionSolver extends BaseDomainSolver<AcquisitionSolveResult> {
  readonly sterlingDomain = 'minecraft' as const;
  readonly solverId = SOLVER_IDS.ACQUISITION;

  /** Sub-solver for mine/craft strategy delegation */
  private _craftingSolver?: MinecraftCraftingSolver;

  /** Prior store for learning */
  readonly priorStore = new StrategyPriorStore();

  setCraftingSolver(solver: MinecraftCraftingSolver): void {
    this._craftingSolver = solver;
  }

  get craftingSolver(): MinecraftCraftingSolver | undefined {
    return this._craftingSolver;
  }

  override getDomainDeclaration(): DomainDeclarationV1 {
    return ACQUISITION_DECLARATION;
  }

  protected makeUnavailableResult(): AcquisitionSolveResult {
    return {
      solved: false,
      steps: [],
      totalNodes: 0,
      durationMs: 0,
      error: 'Sterling reasoning service unavailable',
      selectedStrategy: null,
      alternativeStrategies: [],
      strategyRanking: [],
      candidateSetDigest: '',
    };
  }

  /**
   * Solve an acquisition goal using multi-strategy coordination.
   */
  async solveAcquisition(
    item: string,
    quantity: number,
    inventory: Record<string, number>,
    nearbyBlocks: string[],
    nearbyEntities: NearbyEntity[] = [],
    options?: AcquisitionSolveOptions,
    mcData?: McData | null,
  ): Promise<AcquisitionSolveResult> {
    if (!this.isAvailable()) return this.makeUnavailableResult();
    await this.ensureDeclarationRegistered();

    const startTime = Date.now();

    // 1. Build context
    const ctx = buildAcquisitionContext(item, inventory, nearbyBlocks, nearbyEntities);
    const contextKey = contextKeyFromAcquisitionContext(ctx);

    // 2. Enumerate strategies
    let candidates = buildAcquisitionStrategies(ctx);

    // Add inventory-aware salvage candidates
    const salvageCandidates = buildSalvageCandidatesWithInventory(item, ctx, inventory);
    // Replace default salvage candidates with inventory-aware ones
    candidates = candidates.filter(c => c.strategy !== 'salvage');
    candidates.push(...salvageCandidates);

    // Gate: mine strategy requires structurally valid mcData for crafting rules.
    // Filter before digest so candidateSetDigest reflects the actual viable set.
    // Uses isValidMcData (not truthiness) so {} from malformed metadata is rejected.
    if (!isValidMcData(mcData)) {
      candidates = candidates.filter(c => c.strategy !== 'mine');
    }

    // 3. Compute candidate set digest (M1 semantic boundary)
    const candidateSetDigest = computeCandidateSetDigest(candidates);

    // 4. Check for zero candidates
    if (candidates.length === 0) {
      return {
        solved: false,
        steps: [],
        totalNodes: 0,
        durationMs: Date.now() - startTime,
        error: 'No viable acquisition strategies found',
        selectedStrategy: null,
        alternativeStrategies: [],
        strategyRanking: [],
        candidateSetDigest,
      };
    }

    // 5. Get priors and rank
    const useLearning = options?.useLearning ?? true;
    const priors = useLearning
      ? this.priorStore.getPriorsForContext(item, contextKey)
      : []; // Empty priors → all strategies ranked by static cost only
    const { ranked, evidence: scoringEvidence } = rankStrategiesWithEvidence(
      candidates, priors, options?.objectiveWeights,
    );

    // 6. Select top strategy
    const selected = ranked[0];
    const alternatives = ranked.slice(1).map(c => c.strategy);

    // 7. Dispatch to sub-solver
    const maxNodes = options?.maxNodes ?? 5000;
    const objectiveWeightsSource: ObjectiveWeightsSource = options?.objectiveWeights ? 'provided' : 'default';

    const dispatchResult = await this.dispatchStrategy(
      selected,
      item,
      quantity,
      inventory,
      nearbyBlocks,
      nearbyEntities,
      maxNodes,
      options?.objectiveWeights,
      mcData,
    );

    // 8. Build parent bundle
    const parentBundleInput = computeBundleInput({
      solverId: this.solverId,
      contractVersion: this.contractVersion,
      definitions: dispatchResult.rules,
      inventory,
      goal: { [item]: quantity },
      nearbyBlocks,
      objectiveWeights: options?.objectiveWeights,
      leafContractEntries: getLeafContractEntries(),
    });

    // candidateCount = structurally enumerated strategies with a known domain path.
    // This is NOT a feasibility filter: 'unknown' candidates are still dispatchable.
    // Distinction: candidateCount=0 means "no strategy path exists" (structural);
    // candidateCount>0 with rules=[] means "delegation-driven" (mine/craft).
    const compatReport = lintRules(dispatchResult.rules as LintableRule[], {
      solverId: this.solverId,
      candidateCount: candidates.length,
    });
    const rationaleCtx = buildDefaultRationaleContext({
      compatReport,
      maxNodes,
      objectiveWeights: options?.objectiveWeights,
    });

    const parentBundleOutput = computeBundleOutput({
      planId: dispatchResult.planId,
      solved: dispatchResult.solved,
      steps: dispatchResult.steps,
      totalNodes: dispatchResult.totalNodes,
      durationMs: dispatchResult.durationMs,
      solutionPathLength: dispatchResult.steps.length,
      ...rationaleCtx,
    });

    const parentBundle = createSolveBundle(parentBundleInput, parentBundleOutput, compatReport);

    // Attach orchestration provenance: links parent strategy decision to
    // child solve identities, making the orchestration layer auditable (G1).
    attachOrchestrationProvenance(
      parentBundle,
      dispatchResult.childBundles,
      selected.strategy,
      candidateSetDigest,
    );

    // Aggregate bundles: parent first, then child bundles
    const allBundles: SolveBundle[] = [parentBundle, ...dispatchResult.childBundles];

    // M3: Create bridge artifacts for mine/craft delegation.
    // When the selected strategy is mine or craft, the parent bundle is
    // the upstream (acquisition orchestration) and each child bundle is
    // the downstream (crafting solve). The bridge links the two with
    // typed pre/postcondition witnesses.
    const bridgeEdges: BridgeEdgeV1[] = [];
    if (selected.strategy === 'mine' &&
        dispatchResult.solved && dispatchResult.childBundles.length > 0) {
      // Compute items produced from solved steps
      const producedItems: Record<string, number> = {};
      for (const step of dispatchResult.steps) {
        for (const p of step.produces ?? []) {
          producedItems[p.name] = (producedItems[p.name] ?? 0) + p.count;
        }
      }
      // Required items = the goal
      const requiredItems: Record<string, number> = { [item]: quantity };

      for (const childBundle of dispatchResult.childBundles) {
        bridgeEdges.push(buildAcquireForCraftBridge(
          parentBundle,
          childBundle,
          producedItems,
          requiredItems,
        ));
      }
    }

    const totalDuration = Date.now() - startTime;

    return {
      solved: dispatchResult.solved,
      steps: dispatchResult.steps,
      totalNodes: dispatchResult.totalNodes,
      durationMs: totalDuration,
      error: dispatchResult.error,
      planId: dispatchResult.planId,
      solveMeta: { bundles: allBundles },
      parentBundleId: parentBundle.bundleId,
      selectedStrategy: selected.strategy,
      alternativeStrategies: alternatives,
      strategyRanking: ranked,
      candidateSetDigest,
      solveJoinKeys: dispatchResult.planId
        ? extractSolveJoinKeys(parentBundle, dispatchResult.planId)
        : undefined,
      bridgeEdges: bridgeEdges.length > 0 ? bridgeEdges : undefined,
      // M4: Learning decision record — explains how priors affected ranking
      learningDecision: {
        learningEnabled: useLearning,
        contextKey,
        candidateSetDigest,
        selectedStrategy: selected.strategy,
        scoringEvidence,
        parentBundleHash: parentBundle.bundleHash,
        planId: dispatchResult.planId ?? undefined,
      },
    };
  }

  /**
   * Report episode result for learning.
   */
  async reportEpisodeResult(
    item: string,
    strategy: string,
    contextKey: string,
    success: boolean,
    planId: string,
    candidateSetDigest: string,
    linkage?: import('./solve-bundle-types').EpisodeLinkage,
  ): Promise<import('./solve-bundle-types').EpisodeAck | undefined> {
    this.priorStore.updatePrior(
      item,
      strategy as any,
      contextKey,
      success,
      planId,
    );

    return this.reportEpisode({
      planId,
      item,
      strategy,
      contextKey,
      success,
      candidateSetDigest,
    }, linkage);
  }

  /**
   * Convert result to TaskStep[] for the planning system.
   */
  toTaskSteps(result: AcquisitionSolveResult): TaskStep[] {
    if (!result.solved || result.steps.length === 0) return [];

    const now = Date.now();
    return result.steps.map((step, index) => ({
      id: `step-${now}-${index + 1}`,
      label: `Acquire: ${step.action}`,
      done: false,
      order: index + 1,
      estimatedDuration: sharedEstimateDuration(step.actionType),
      meta: {
        domain: 'acquisition',
        leaf: actionTypeToLeaf(step.actionType, step.action),
        args: this.buildExplicitArgs(step),
        action: step.action,
        actionType: step.actionType,
        produces: step.produces,
        consumes: step.consumes,
      },
    }));
  }

  /**
   * Derive explicit args for the leaf contract from the acquisition step.
   * Mirrors MinecraftCraftingSolver.buildExplicitArgs but handles acq:* prefixes.
   */
  private buildExplicitArgs(step: AcquisitionSolveStep): Record<string, unknown> {
    const action = step.action;

    // Trade strategy → interact_with_entity (resolver-style: entityType only)
    if (action.startsWith('acq:trade:')) return { entityType: 'villager' };

    // Loot strategy → open_container (resolver-style: containerType only)
    if (action.startsWith('acq:loot:')) return { containerType: 'chest' };

    // Mine/craft delegation — match crafting solver's pattern
    const output = step.produces[0];
    switch (step.actionType) {
      case 'craft': return { recipe: output?.name ?? 'unknown', qty: 1 };
      case 'mine': return { item: output?.name ?? 'unknown', count: output?.count ?? 1 };
      default: return {};
    }
  }

  // --------------------------------------------------------------------------
  // Private dispatch
  // --------------------------------------------------------------------------

  private async dispatchStrategy(
    candidate: AcquisitionCandidate,
    item: string,
    quantity: number,
    inventory: Record<string, number>,
    nearbyBlocks: string[],
    nearbyEntities: NearbyEntity[],
    maxNodes: number,
    objectiveWeights?: ObjectiveWeights,
    mcData?: McData | null,
  ): Promise<{
    solved: boolean;
    steps: AcquisitionSolveStep[];
    totalNodes: number;
    durationMs: number;
    planId: string | null;
    error?: string;
    rules: unknown[];
    childBundles: SolveBundle[];
  }> {
    switch (candidate.strategy) {
      case 'mine':
        return this.dispatchMineCraft(item, quantity, inventory, nearbyBlocks, maxNodes, mcData);

      case 'trade':
        return this.dispatchSterlingRules(
          buildTradeRules(item),
          item,
          quantity,
          inventory,
          nearbyBlocks,
          nearbyEntities,
          maxNodes,
          'trade',
          objectiveWeights,
        );

      case 'loot':
        return this.dispatchSterlingRules(
          buildLootRules(item),
          item,
          quantity,
          inventory,
          nearbyBlocks,
          nearbyEntities,
          maxNodes,
          'loot',
          objectiveWeights,
        );

      case 'salvage':
        return this.dispatchSterlingRules(
          buildSalvageRules(item),
          item,
          quantity,
          inventory,
          nearbyBlocks,
          nearbyEntities,
          maxNodes,
          'salvage',
          objectiveWeights,
        );

      default:
        return {
          solved: false,
          steps: [],
          totalNodes: 0,
          durationMs: 0,
          planId: null,
          error: `Unknown strategy: ${candidate.strategy}`,
          rules: [],
          childBundles: [],
        };
    }
  }

  private async dispatchMineCraft(
    item: string,
    _quantity: number,
    inventory: Record<string, number>,
    nearbyBlocks: string[],
    _maxNodes: number,
    mcData?: McData | null,
  ): Promise<{
    solved: boolean;
    steps: AcquisitionSolveStep[];
    totalNodes: number;
    durationMs: number;
    planId: string | null;
    error?: string;
    rules: unknown[];
    childBundles: SolveBundle[];
  }> {
    if (!this._craftingSolver) {
      return {
        solved: false,
        steps: [],
        totalNodes: 0,
        durationMs: 0,
        planId: null,
        error: 'Crafting solver not configured for mine/craft delegation',
        rules: [],
        childBundles: [],
      };
    }

    // Convert inventory to array format expected by crafting solver
    const inventoryArray = Object.entries(inventory).map(([name, count]) => ({ name, count }));

    try {
      const result = await this._craftingSolver.solveCraftingGoal(
        item,
        inventoryArray,
        mcData,
        nearbyBlocks,
      );

      // Map crafting steps to acquisition steps
      const steps: AcquisitionSolveStep[] = result.steps.map(s => ({
        action: s.action,
        actionType: s.actionType,
        produces: s.produces,
        consumes: s.consumes,
        resultingInventory: s.resultingInventory,
      }));

      return {
        solved: result.solved,
        steps,
        totalNodes: result.totalNodes,
        durationMs: result.durationMs,
        planId: result.planId ?? null,
        error: result.error,
        rules: [], // Rules handled by inner solver
        childBundles: result.solveMeta?.bundles ?? [],
      };
    } catch (err) {
      return {
        solved: false,
        steps: [],
        totalNodes: 0,
        durationMs: 0,
        planId: null,
        error: `Mine/craft delegation failed: ${err instanceof Error ? err.message : String(err)}`,
        rules: [],
        childBundles: [],
      };
    }
  }

  private async dispatchSterlingRules(
    rules: LintableRule[],
    item: string,
    quantity: number,
    inventory: Record<string, number>,
    nearbyBlocks: string[],
    nearbyEntities: NearbyEntity[],
    maxNodes: number,
    strategy: string,
    objectiveWeights?: ObjectiveWeights,
  ): Promise<{
    solved: boolean;
    steps: AcquisitionSolveStep[];
    totalNodes: number;
    durationMs: number;
    planId: string | null;
    error?: string;
    rules: unknown[];
    childBundles: SolveBundle[];
  }> {
    const goal = { [item]: quantity };
    // Strategy-specific solverId for child bundle provenance.
    // Parent uses 'minecraft.acquisition'; child uses 'minecraft.acquisition.<strategy>'
    // so audits can distinguish which strategy produced which rule family.
    const childSolverId = `${this.solverId}.${strategy}`;

    // Derive observed context tokens from the real world inputs.
    // Only tokens we can justify from actual observations get injected.
    // This preserves fail-closed behavior: unknown-feasibility strategies
    // are dispatchable, but Python correctly fails them unless the
    // context token is actually present.
    const observedTokens: Record<string, number> = {};
    for (const entity of nearbyEntities) {
      const t = entity.type?.toLowerCase();
      if (t === 'villager') {
        observedTokens['proximity:villager'] = 1;
      } else if (t === 'chest' || t === 'trapped_chest' || t === 'barrel') {
        observedTokens[`proximity:container:${t}`] = 1;
      }
    }

    // Build augmented inventory: only inject tokens that are BOTH
    // required by the dispatched rules AND observed in the world.
    const augmentedInventory = { ...inventory };
    const contextTokensInjected: string[] = [];
    for (const rule of rules) {
      for (const req of rule.requires ?? []) {
        if (!req.name.startsWith('proximity:')) continue;
        const observed = observedTokens[req.name];
        if (!observed) continue; // do not fabricate context
        const existing = augmentedInventory[req.name] ?? 0;
        augmentedInventory[req.name] = Math.max(existing, req.count, observed);
        if (!contextTokensInjected.includes(req.name)) {
          contextTokensInjected.push(req.name);
        }
      }
    }
    contextTokensInjected.sort();

    const solvePayload: Record<string, unknown> = {
      contractVersion: this.contractVersion,
      solverId: this.solverId,
      inventory: augmentedInventory,
      goal,
      nearbyBlocks,
      rules,
      maxNodes,
      useLearning: true,
    };

    try {
      const result = await this.sterlingService.solve(this.sterlingDomain, solvePayload);
      const planId = this.extractPlanId(result);
      const solved = result.solutionFound;

      // Build child bundle for this sub-solve.
      // Compat report computed once here and reused for the child bundle.
      // Linter context solverId matches the child bundle solverId for audit consistency.
      const compatReport = lintRules(rules, {
        solverId: childSolverId,
        enableAcqHardening: true,
      });
      const bundleInput = {
        ...computeBundleInput({
          solverId: childSolverId,
          contractVersion: this.contractVersion,
          definitions: rules,
          inventory: augmentedInventory,
          goal,
          nearbyBlocks,
          objectiveWeights,
          leafContractEntries: getLeafContractEntries(),
        }),
        contextTokensInjected: contextTokensInjected.length > 0 ? contextTokensInjected : undefined,
      };
      const rationaleCtx = buildDefaultRationaleContext({
        compatReport,
        maxNodes,
        objectiveWeights,
      });

      const steps: AcquisitionSolveStep[] = [];
      if (solved && result.solutionPath) {
        for (const edge of result.solutionPath) {
          const label = typeof edge.label === 'string' ? edge.label : `acq-step-${steps.length}`;
          steps.push({
            action: label || `acq-step-${steps.length}`,
            actionType: 'craft',
            produces: [{ name: item, count: quantity }],
            consumes: [],
            resultingInventory: {},
          });
        }
      }

      const bundleOutput = computeBundleOutput({
        planId,
        solved,
        steps,
        totalNodes: result.discoveredNodes?.length ?? 0,
        durationMs: result.durationMs ?? 0,
        solutionPathLength: result.solutionPath?.length ?? 0,
        searchHealth: parseSearchHealth(result.metrics),
        ...rationaleCtx,
      });
      const childBundle = createSolveBundle(bundleInput, bundleOutput, compatReport);
      attachSterlingIdentity(childBundle, parseSterlingIdentity(result.metrics));

      return {
        solved,
        steps,
        totalNodes: result.discoveredNodes?.length ?? 0,
        durationMs: result.durationMs ?? 0,
        planId,
        error: result.error,
        rules,
        childBundles: [childBundle],
      };
    } catch (err) {
      return {
        solved: false,
        steps: [],
        totalNodes: 0,
        durationMs: 0,
        planId: null,
        error: `Sterling solve failed: ${err instanceof Error ? err.message : String(err)}`,
        rules,
        childBundles: [],
      };
    }
  }
}

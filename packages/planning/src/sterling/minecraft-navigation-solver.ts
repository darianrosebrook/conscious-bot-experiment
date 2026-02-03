/**
 * Minecraft Navigation Solver
 *
 * Orchestrates navigation solves: builds occupancy grid payload, sends to
 * Sterling, and maps results to NavigationPrimitive[] for the leaf.
 *
 * Pattern follows MinecraftCraftingSolver: validate → build payload →
 * send to Sterling → extract planId → create SolveBundle → return.
 *
 * Key difference from crafting: no pre-built rules. The occupancy grid
 * is sent directly to Python, which generates neighbors on-demand
 * (escape game pattern, not crafting pattern).
 *
 * @author @darianrosebrook
 */

import { BaseDomainSolver } from './base-domain-solver';
import { SOLVER_IDS } from './solver-ids';
import type { SterlingDomain } from '@conscious-bot/core';
import type {
  OccupancyGrid,
  NavigationHazardPolicy,
  NavigationPrimitive,
  NavigationSolveResult,
  NavigationActionType,
} from './minecraft-navigation-types';
import {
  DEFAULT_HAZARD_POLICY,
  computeHazardPolicyId,
  hashOccupancyGrid,
  hashNavigationGoal,
  hashNavigationStart,
  encodeGridToBase64,
} from './minecraft-navigation-types';
import {
  computeBundleOutput,
  createSolveBundle,
  contentHash,
  canonicalize,
  buildDefaultRationaleContext,
  parseSterlingIdentity,
  attachSterlingIdentity,
} from './solve-bundle';
import { parseSearchHealth } from './search-health';
import { extractSolveJoinKeys } from './episode-classification';
import type {
  SolveBundleInput,
  CompatReport,
  ContentHash,
} from './solve-bundle-types';
import { DEFAULT_OBJECTIVE_WEIGHTS } from './solve-bundle-types';

// ============================================================================
// Solver
// ============================================================================

export class MinecraftNavigationSolver extends BaseDomainSolver<NavigationSolveResult> {
  readonly sterlingDomain = 'navigation' as SterlingDomain;
  readonly solverId = SOLVER_IDS.NAVIGATION;

  protected makeUnavailableResult(): NavigationSolveResult {
    return {
      solved: false,
      steps: [],
      primitives: [],
      pathPositions: [],
      totalNodes: 0,
      durationMs: 0,
      replansUsed: 0,
      error: 'Sterling reasoning service unavailable',
    };
  }

  /**
   * Solve a navigation goal using Sterling's A* search with occupancy grid.
   *
   * @param start        - Bot's current block position (floored integers)
   * @param goal         - Target block position (floored integers)
   * @param occupancyGrid - 3D block type grid for the navigation area
   * @param toleranceXZ  - L∞ goal tolerance in XZ plane (default 1)
   * @param toleranceY   - |dy| goal tolerance (default 0)
   * @param hazardPolicy - Optional hazard policy override
   * @param options      - maxNodes, useLearning
   */
  async solveNavigation(
    start: { x: number; y: number; z: number },
    goal: { x: number; y: number; z: number },
    occupancyGrid: OccupancyGrid,
    toleranceXZ = 1,
    toleranceY = 0,
    hazardPolicy?: NavigationHazardPolicy,
    options?: { maxNodes?: number; useLearning?: boolean },
  ): Promise<NavigationSolveResult> {
    if (!this.isAvailable()) return this.makeUnavailableResult();

    // 1. Validate inputs
    const validation = this.validateInputs(start, goal, occupancyGrid);
    if (validation) {
      return {
        ...this.makeUnavailableResult(),
        error: validation,
      };
    }

    // 2. Build hazard policy
    const policy = hazardPolicy ?? { ...DEFAULT_HAZARD_POLICY };
    if (!policy.hazardPolicyId) {
      policy.hazardPolicyId = computeHazardPolicyId(policy);
    }

    // 3. Compute hashes for SolveBundle
    const maxNodes = options?.maxNodes ?? 10000;
    const gridHash = hashOccupancyGrid(occupancyGrid);
    const startHash = hashNavigationStart(start);
    const goalHash = hashNavigationGoal(goal, toleranceXZ, toleranceY);

    // 4. Create compat report (navigation has no rule-level linting)
    const compatReport: CompatReport = {
      valid: true,
      issues: [],
      checkedAt: Date.now(),
      definitionCount: 0, // no rules — grid-based domain
    };

    // 5. Build bundle input
    const bundleInput: SolveBundleInput = {
      solverId: this.solverId,
      executionMode: undefined,
      contractVersion: this.contractVersion,
      definitionHash: gridHash,
      initialStateHash: startHash,
      goalHash,
      nearbyBlocksHash: contentHash(''), // N/A for navigation
      codeVersion: '0.1.0',
      definitionCount: 0,
      objectiveWeightsEffective: DEFAULT_OBJECTIVE_WEIGHTS,
      objectiveWeightsSource: 'default',
    };

    // 6. Build Sterling payload
    const solvePayload: Record<string, unknown> = {
      command: 'solve',
      domain: 'navigation',
      contractVersion: this.contractVersion,
      solverId: this.solverId,
      occupancyGrid: {
        origin: occupancyGrid.origin,
        size: occupancyGrid.size,
        blocks: encodeGridToBase64(occupancyGrid),
      },
      start,
      goal,
      toleranceXZ,
      toleranceY,
      hazardPolicy: {
        hazardPolicyId: policy.hazardPolicyId,
        version: policy.version,
        riskMode: policy.riskMode,
        penalties: policy.penalties,
      },
      maxNodes,
      useLearning: options?.useLearning ?? true,
    };

    // 7. Send to Sterling
    const result = await this.sterlingService.solve(this.sterlingDomain, solvePayload);

    // 8. Extract planId
    const planId = this.extractPlanId(result);

    // 8a. Parse Sterling identity from solve response
    const sterlingIdentity = parseSterlingIdentity(result.metrics);

    // 9. Build rationale context
    const rationaleCtx = buildDefaultRationaleContext({ compatReport, maxNodes });

    // 10. Handle no solution
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
        primitives: [],
        pathPositions: [],
        totalNodes: result.discoveredNodes.length,
        durationMs: result.durationMs,
        replansUsed: 0,
        error: result.error || 'No path found',
        planId,
        solveMeta: { bundles: [solveBundle] },
        solveJoinKeys: planId ? extractSolveJoinKeys(solveBundle, planId) : undefined,
      };
    }

    // 11. Map solution path to navigation primitives
    const primitives = this.mapSolutionToPrimitives(result);
    const pathPositions = primitives.map((p) => p.to);

    // 12. Build bundle output
    const bundleSteps = primitives.map((p) => ({ action: p.action }));
    const bundleOutput = computeBundleOutput({
      planId,
      solved: true,
      steps: bundleSteps,
      totalNodes: result.discoveredNodes.length,
      durationMs: result.durationMs,
      solutionPathLength: result.solutionPath.length,
      searchHealth: parseSearchHealth(result.metrics),
      ...rationaleCtx,
    });
    const solveBundle = createSolveBundle(bundleInput, bundleOutput, compatReport);
    attachSterlingIdentity(solveBundle, sterlingIdentity);

    return {
      solved: true,
      steps: bundleSteps,
      primitives,
      pathPositions,
      totalNodes: result.discoveredNodes.length,
      durationMs: result.durationMs,
      replansUsed: 0,
      planId,
      solveMeta: { bundles: [solveBundle] },
      solveJoinKeys: planId ? extractSolveJoinKeys(solveBundle, planId) : undefined,
    };
  }

  /**
   * Report navigation episode result back to Sterling for learning.
   */
  async reportEpisodeResult(
    start: { x: number; y: number; z: number },
    goal: { x: number; y: number; z: number },
    success: boolean,
    primitivesCompleted: number,
    planId?: string | null,
    linkage?: import('./solve-bundle-types').EpisodeLinkage,
  ): Promise<import('./solve-bundle-types').EpisodeAck | undefined> {
    return this.reportEpisode({
      planId,
      start,
      goal,
      success,
      primitivesCompleted,
    }, linkage);
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Validate solver inputs. Returns error string or null if valid.
   */
  private validateInputs(
    start: { x: number; y: number; z: number },
    goal: { x: number; y: number; z: number },
    grid: OccupancyGrid,
  ): string | null {
    const { dx, dy, dz } = grid.size;
    if (dx <= 0 || dy <= 0 || dz <= 0) {
      return 'Occupancy grid has zero or negative dimensions';
    }
    if (grid.blocks.length !== dx * dy * dz) {
      return `Grid block count mismatch: expected ${dx * dy * dz}, got ${grid.blocks.length}`;
    }

    // Start must be within grid bounds
    const slx = start.x - grid.origin.x;
    const sly = start.y - grid.origin.y;
    const slz = start.z - grid.origin.z;
    if (slx < 0 || slx >= dx || sly < 0 || sly >= dy || slz < 0 || slz >= dz) {
      return `Start position (${start.x},${start.y},${start.z}) is outside grid bounds`;
    }

    return null; // goal may be outside grid (solver will return no path)
  }

  /**
   * Map Sterling's solution path edges to NavigationPrimitive[].
   *
   * Sterling returns edges with labels like "walk_north", "jump_up_east".
   * Each edge encodes source → target as state hashes. We parse the label
   * to determine actionType and extract coordinates from the node data.
   */
  private mapSolutionToPrimitives(
    result: import('@conscious-bot/core').SterlingSolveResult,
  ): NavigationPrimitive[] {
    const primitives: NavigationPrimitive[] = [];

    // Build node lookup from discovered nodes
    const nodeMap = new Map<string, { x: number; y: number; z: number }>();
    for (const node of result.discoveredNodes) {
      const coords = this.parseNavNodeId(node.id);
      if (coords) {
        nodeMap.set(node.id, coords);
      }
    }

    for (const edge of result.solutionPath) {
      const label = typeof edge.label === 'string' ? edge.label : '';
      const actionType = this.parseActionType(label);
      const edgeCost = (edge as any).cost ?? 1.0;
      const from = nodeMap.get(edge.source);
      const to = nodeMap.get(edge.target);

      if (!from || !to) {
        // Fallback: try parsing from node IDs directly
        const fromParsed = this.parseNavNodeId(edge.source);
        const toParsed = this.parseNavNodeId(edge.target);
        if (fromParsed && toParsed) {
          primitives.push({
            action: label || `unknown-${primitives.length}`,
            actionType,
            from: fromParsed,
            to: toParsed,
            cost: edgeCost,
          });
        }
        continue;
      }

      primitives.push({
        action: label,
        actionType,
        from,
        to,
        cost: edgeCost,
      });
    }

    return primitives;
  }

  /**
   * Parse a navigation node ID "nav:{x},{y},{z}" into coordinates.
   */
  private parseNavNodeId(nodeId: string): { x: number; y: number; z: number } | null {
    const match = nodeId.match(/^nav:(-?\d+),(-?\d+),(-?\d+)$/);
    if (!match) return null;
    return {
      x: parseInt(match[1], 10),
      y: parseInt(match[2], 10),
      z: parseInt(match[3], 10),
    };
  }

  /**
   * Parse action label to determine action type.
   * Labels: "walk_north", "jump_up_east", "descend_south", etc.
   */
  private parseActionType(label: string): NavigationActionType {
    if (label.startsWith('walk_')) return 'walk';
    if (label.startsWith('jump_up_')) return 'jump_up';
    if (label.startsWith('descend_')) return 'descend';
    return 'walk'; // default fallback
  }
}

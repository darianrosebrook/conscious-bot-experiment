/**
 * Macro Planner — Dijkstra-based Path Planning over Abstract Contexts
 *
 * Plans macro-level paths through a graph of abstract contexts
 * (e.g., "at_base" → "at_mine" → "has_iron"). Uses learned costs
 * from micro execution feedback for cost-aware routing.
 *
 * Fixed topology: all edges and contexts registered at construction.
 * No dynamic edge registration during learning/feedback.
 *
 * @author @darianrosebrook
 */

import type { PlanningDecision } from '../constraints/planning-decisions';
import {
  ContextRegistry,
  MAX_MACRO_DEPTH,
  computeEdgeId,
  computeMacroPlanDigest,
} from './macro-state';
import type {
  MacroEdge,
  MacroPlan,
  MacroStateGraph,
  ContextDefinition,
} from './macro-state';

// ============================================================================
// Requirement Mapping
// ============================================================================

interface RequirementMapping {
  readonly kind: string;
  readonly start: string;
  readonly goal: string;
}

// ============================================================================
// Macro Planner
// ============================================================================

export class MacroPlanner {
  readonly registry: ContextRegistry;
  private readonly edges: MacroEdge[] = [];
  private readonly adjacency = new Map<string, MacroEdge[]>();
  private readonly requirementMappings: RequirementMapping[] = [];
  private frozen = false;

  constructor() {
    this.registry = new ContextRegistry();
  }

  /**
   * Register a context in the registry.
   */
  registerContext(def: ContextDefinition): void {
    if (this.frozen) {
      throw new Error('Cannot register contexts after graph is frozen');
    }
    this.registry.register(def.id, def);
  }

  /**
   * Register a macro edge. Idempotent: duplicate edges (same from/to) are ignored.
   * Validates both endpoints against the registry.
   */
  registerEdge(
    from: string,
    to: string,
    baseCost: number
  ): PlanningDecision<MacroEdge> {
    if (this.frozen) {
      return {
        kind: 'error',
        reason: 'invariant_violation',
        detail: 'Cannot register edges after graph is frozen',
      };
    }

    const fromCheck = this.registry.validate(from);
    if (fromCheck.kind !== 'ok') return fromCheck;

    const toCheck = this.registry.validate(to);
    if (toCheck.kind !== 'ok') return toCheck;

    const id = computeEdgeId(from, to);

    // Idempotent: if edge already exists, return it
    const existing = this.edges.find((e) => e.id === id);
    if (existing) return { kind: 'ok', value: existing };

    const edge: MacroEdge = {
      id,
      from,
      to,
      baseCost,
      learnedCost: baseCost,
      consecutiveFailures: 0,
    };

    this.edges.push(edge);
    if (!this.adjacency.has(from)) this.adjacency.set(from, []);
    this.adjacency.get(from)!.push(edge);

    return { kind: 'ok', value: edge };
  }

  /**
   * Register a requirement-to-context mapping.
   */
  registerRequirementMapping(kind: string, start: string, goal: string): void {
    this.requirementMappings.push({ kind, start, goal });
  }

  /**
   * Freeze the graph topology. After this, no new edges or contexts
   * can be added, but learned costs can still be updated.
   */
  freeze(): MacroStateGraph {
    this.frozen = true;
    return {
      registry: this.registry,
      edges: Object.freeze([...this.edges]),
    };
  }

  /**
   * Get the full graph (frozen or not).
   */
  getGraph(): MacroStateGraph {
    return {
      registry: this.registry,
      edges: [...this.edges],
    };
  }

  /**
   * Find the edge object by ID.
   */
  getEdge(edgeId: string): MacroEdge | undefined {
    return this.edges.find((e) => e.id === edgeId);
  }

  /**
   * Map a requirement kind to start/goal contexts.
   */
  contextFromRequirement(
    requirementKind: string
  ): PlanningDecision<{ start: string; goal: string }> {
    const mapping = this.requirementMappings.find(
      (m) => m.kind === requirementKind
    );
    if (!mapping) {
      return {
        kind: 'blocked',
        reason: 'ontology_gap',
        detail: `No context mapping registered for requirement kind '${requirementKind}'`,
      };
    }

    // Validate both endpoints
    const startCheck = this.registry.validate(mapping.start);
    if (startCheck.kind !== 'ok') return startCheck;

    const goalCheck = this.registry.validate(mapping.goal);
    if (goalCheck.kind !== 'ok') return goalCheck;

    return { kind: 'ok', value: { start: mapping.start, goal: mapping.goal } };
  }

  /**
   * Plan the shortest macro path from start to goal using Dijkstra.
   *
   * Uses learnedCost for edge weights. Adjacency sorted by edge.id
   * for deterministic tie-breaking.
   */
  planMacroPath(
    start: string,
    goal: string,
    goalId: string
  ): PlanningDecision<MacroPlan> {
    // Validate endpoints
    const startCheck = this.registry.validate(start);
    if (startCheck.kind !== 'ok') return startCheck;

    const goalCheck = this.registry.validate(goal);
    if (goalCheck.kind !== 'ok') return goalCheck;

    if (start === goal) {
      return {
        kind: 'ok',
        value: {
          planDigest: computeMacroPlanDigest([], goalId),
          edges: [],
          start,
          goal,
          goalId,
          totalCost: 0,
        },
      };
    }

    // Dijkstra with deterministic tie-breaking by node ID
    const dist = new Map<string, number>();
    const prev = new Map<string, { node: string; edge: MacroEdge }>();
    const visited = new Set<string>();

    dist.set(start, 0);

    // Simple priority queue (array, re-sort on each iteration)
    // Adequate for small graphs (~10 contexts)
    const queue = [start];

    let depth = 0;

    while (queue.length > 0) {
      // Sort by distance, then by node ID for determinism
      queue.sort((a, b) => {
        const da = dist.get(a) ?? Infinity;
        const db = dist.get(b) ?? Infinity;
        if (da !== db) return da - db;
        return a.localeCompare(b);
      });

      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      if (current === goal) break;

      depth++;
      if (depth > MAX_MACRO_DEPTH) {
        return {
          kind: 'blocked',
          reason: 'bound_exceeded',
          detail: `Macro planning depth exceeded MAX_MACRO_DEPTH (${MAX_MACRO_DEPTH})`,
        };
      }

      // Get neighbors, sorted by edge.id for determinism
      const neighbors = [...(this.adjacency.get(current) ?? [])].sort(
        (a, b) => a.id.localeCompare(b.id)
      );

      for (const edge of neighbors) {
        if (visited.has(edge.to)) continue;

        const newDist = (dist.get(current) ?? Infinity) + edge.learnedCost;
        const currentDist = dist.get(edge.to) ?? Infinity;

        if (newDist < currentDist) {
          dist.set(edge.to, newDist);
          prev.set(edge.to, { node: current, edge });
          if (!queue.includes(edge.to)) {
            queue.push(edge.to);
          }
        }
      }
    }

    // Reconstruct path
    if (!prev.has(goal) && start !== goal) {
      return {
        kind: 'blocked',
        reason: 'no_macro_path',
        detail: `No macro path found from '${start}' to '${goal}'`,
      };
    }

    const pathEdges: MacroEdge[] = [];
    let current = goal;
    while (current !== start) {
      const entry = prev.get(current);
      if (!entry) break;
      pathEdges.unshift(entry.edge);
      current = entry.node;
    }

    const totalCost = dist.get(goal) ?? 0;
    const planDigest = computeMacroPlanDigest(
      pathEdges.map((e) => e.id),
      goalId
    );

    return {
      kind: 'ok',
      value: {
        planDigest,
        edges: pathEdges,
        start,
        goal,
        goalId,
        totalCost,
      },
    };
  }
}

// ============================================================================
// Default Minecraft Graph
// ============================================================================

/**
 * Build the default Minecraft macro state graph with common contexts
 * and transitions. Fixed topology — no dynamic edge registration.
 */
export function buildDefaultMinecraftGraph(): MacroPlanner {
  const planner = new MacroPlanner();

  // Register contexts
  const contexts: ContextDefinition[] = [
    { id: 'idle', description: 'Bot is idle at spawn or last position', abstract: true },
    { id: 'at_base', description: 'Bot is at or near its home base', abstract: true },
    { id: 'at_mine', description: 'Bot is at a mining location', abstract: true },
    { id: 'at_forest', description: 'Bot is at a tree-harvesting location', abstract: true },
    { id: 'at_water', description: 'Bot is near a water source', abstract: true },
    { id: 'at_build_site', description: 'Bot is at the construction site', abstract: true },
    { id: 'has_wood', description: 'Bot has sufficient wood resources', abstract: true },
    { id: 'has_stone', description: 'Bot has sufficient stone resources', abstract: true },
    { id: 'has_iron', description: 'Bot has iron ingots', abstract: true },
    { id: 'has_tools', description: 'Bot has appropriate tools for current task', abstract: true },
    { id: 'shelter_built', description: 'A basic shelter has been constructed', abstract: true },
  ];

  for (const ctx of contexts) {
    planner.registerContext(ctx);
  }

  // Register edges (transitions between contexts)
  const edges: Array<[string, string, number]> = [
    // Navigation
    ['idle', 'at_base', 1.0],
    ['at_base', 'at_mine', 3.0],
    ['at_base', 'at_forest', 2.0],
    ['at_base', 'at_water', 2.0],
    ['at_base', 'at_build_site', 1.5],
    ['at_mine', 'at_base', 3.0],
    ['at_forest', 'at_base', 2.0],
    ['at_water', 'at_base', 2.0],
    ['at_build_site', 'at_base', 1.5],

    // Resource acquisition
    ['at_forest', 'has_wood', 2.0],
    ['at_mine', 'has_stone', 4.0],
    ['at_mine', 'has_iron', 8.0],

    // Tool crafting
    ['has_wood', 'has_tools', 1.5],
    ['has_stone', 'has_tools', 2.0],
    ['has_iron', 'has_tools', 3.0],

    // Building
    ['at_build_site', 'shelter_built', 10.0],
  ];

  for (const [from, to, cost] of edges) {
    planner.registerEdge(from, to, cost);
  }

  // Register requirement mappings
  planner.registerRequirementMapping('craft', 'at_base', 'has_tools');
  planner.registerRequirementMapping('mine', 'at_base', 'has_stone');
  planner.registerRequirementMapping('collect', 'at_base', 'has_wood');
  planner.registerRequirementMapping('build', 'at_base', 'shelter_built');
  planner.registerRequirementMapping('tool_progression', 'at_base', 'has_tools');

  return planner;
}

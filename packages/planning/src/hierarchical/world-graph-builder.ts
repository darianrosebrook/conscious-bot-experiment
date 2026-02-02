/**
 * World Graph Builder (E.1)
 *
 * Pure function from explicit world input → MacroPlanner.
 * Creates contexts from biome regions, edges from adjacency,
 * and requirement mappings from resource types.
 *
 * Deterministically snapshotable; easily transferred to other domains.
 *
 * @author @darianrosebrook
 */

import { MacroPlanner } from './macro-planner';
import type { ContextDefinition } from './macro-state';

// ============================================================================
// Input Types
// ============================================================================

/** A biome region in the Minecraft world graph. */
export interface BiomeRegion {
  /** Abstract context ID (e.g., 'forest_biome'). No coordinates. */
  readonly id: string;
  /** Human-readable description. */
  readonly description: string;
  /** Adjacent region IDs with traversal costs. */
  readonly adjacency: ReadonlyArray<{ targetId: string; cost: number }>;
}

/** A known structure location in the world. */
export interface StructureLocation {
  /** Abstract context ID (e.g., 'village_plains'). No coordinates. */
  readonly id: string;
  readonly description: string;
  /** Adjacent region IDs. */
  readonly adjacency: ReadonlyArray<{ targetId: string; cost: number }>;
}

/** A resource zone where specific resources can be acquired. */
export interface ResourceZone {
  /** Zone ID (also a context ID). */
  readonly id: string;
  readonly description: string;
  /** Requirement kinds that this zone satisfies (e.g., 'mine', 'collect'). */
  readonly requirementKinds: readonly string[];
  /** Starting context for requirement mapping. */
  readonly requirementStart: string;
}

/** Complete input for building a world graph. */
export interface MinecraftWorldGraphInput {
  readonly biomeRegions: readonly BiomeRegion[];
  readonly structureLocations: readonly StructureLocation[];
  readonly resourceZones: readonly ResourceZone[];
}

// ============================================================================
// Builder
// ============================================================================

/**
 * Build a MacroPlanner from explicit world topology input.
 *
 * Pure function: same input → same graph (deterministic).
 * Freezes the graph after construction.
 *
 * @param input - World topology declaration
 * @returns Frozen MacroPlanner ready for path planning
 */
export function buildWorldGraph(input: MinecraftWorldGraphInput): MacroPlanner {
  const planner = new MacroPlanner();

  // Register all contexts from biome regions
  for (const region of input.biomeRegions) {
    planner.registerContext({
      id: region.id,
      description: region.description,
      abstract: true,
    });
  }

  // Register all contexts from structure locations
  for (const structure of input.structureLocations) {
    planner.registerContext({
      id: structure.id,
      description: structure.description,
      abstract: true,
    });
  }

  // Register all contexts from resource zones
  for (const zone of input.resourceZones) {
    planner.registerContext({
      id: zone.id,
      description: zone.description,
      abstract: true,
    });
  }

  // Register edges from biome adjacency declarations
  for (const region of input.biomeRegions) {
    for (const adj of region.adjacency) {
      planner.registerEdge(region.id, adj.targetId, adj.cost);
    }
  }

  // Register edges from structure adjacency
  for (const structure of input.structureLocations) {
    for (const adj of structure.adjacency) {
      planner.registerEdge(structure.id, adj.targetId, adj.cost);
    }
  }

  // Register requirement mappings from resource zones
  for (const zone of input.resourceZones) {
    for (const kind of zone.requirementKinds) {
      planner.registerRequirementMapping(kind, zone.requirementStart, zone.id);
    }
  }

  // Freeze graph — no further topology changes
  planner.freeze();

  return planner;
}

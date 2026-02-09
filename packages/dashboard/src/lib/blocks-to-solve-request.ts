/**
 * blocks-to-solve-request — Converts placed blocks into a Sterling BuildingSolveRequest
 *
 * Groups blocks by Y-level into sequential modules with vertical dependency
 * chains: layer_0 (prep_site) → layer_1 (apply_module) → layer_2 → …
 *
 * Each module's `materialsNeeded` is the block count per block type for that layer.
 * `inventory` is provided by the caller (either auto-calculated or manual).
 * `goalModules` is the list of all module IDs.
 */

import type { PlacedBlock } from '@/types/building';

// ─── Types (dashboard-local mirror of planning types) ────────────────────────

export interface BuildingMaterial {
  name: string;
  count: number;
}

export type BuildingModuleType = 'prep_site' | 'apply_module';

export interface BuildingModule {
  moduleId: string;
  moduleType: BuildingModuleType;
  requiresModules: string[];
  materialsNeeded: BuildingMaterial[];
  placementFeasible: boolean;
  baseCost: number;
}

export interface BuildingSiteState {
  terrain: 'flat' | 'hilly' | 'cliff' | 'water' | 'forest';
  biome: string;
  hasTreesNearby: boolean;
  hasWaterNearby: boolean;
  siteCaps: string;
}

export interface BuildingSolveRequest {
  templateId: string;
  facing: string;
  goalModules: string[];
  inventory: Record<string, number>;
  siteState: BuildingSiteState;
  modules: BuildingModule[];
  maxNodes?: number;
  useLearning?: boolean;
}

// ─── Converter ───────────────────────────────────────────────────────────────

/**
 * Convert a set of placed blocks into a BuildingSolveRequest.
 *
 * Strategy: group blocks by Y coordinate into layers. Each layer becomes a
 * `BuildingModule`. Layer 0 is `prep_site`, all subsequent layers are
 * `apply_module`. Each layer depends on the one below it (vertical stacking).
 *
 * @param blocks The placed blocks to convert
 * @param inventory Block type → count mapping (auto-calculated or manual)
 * @param templateId Optional template identifier
 */
export function blocksToSolveRequest(
  blocks: PlacedBlock[],
  inventory: Record<string, number>,
  templateId = 'dashboard_build',
): BuildingSolveRequest {
  // Group blocks by Y level
  const layers = new Map<number, PlacedBlock[]>();

  for (const block of blocks) {
    const y = block.position.y;
    const arr = layers.get(y) || [];
    arr.push(block);
    layers.set(y, arr);
  }

  // Sort layer keys ascending (bottom to top)
  const sortedYLevels = Array.from(layers.keys()).sort((a, b) => a - b);

  // Build modules
  const modules: BuildingModule[] = sortedYLevels.map((y, index) => {
    const layerBlocks = layers.get(y)!;

    // Count materials for this layer
    const matCounts: Record<string, number> = {};
    for (const b of layerBlocks) {
      matCounts[b.blockType] = (matCounts[b.blockType] || 0) + 1;
    }

    const materialsNeeded: BuildingMaterial[] = Object.entries(matCounts).map(
      ([name, count]) => ({ name, count }),
    );

    const moduleId = `layer_${y}`;
    const requiresModules = index > 0 ? [`layer_${sortedYLevels[index - 1]}`] : [];

    return {
      moduleId,
      moduleType: index === 0 ? ('prep_site' as const) : ('apply_module' as const),
      requiresModules,
      materialsNeeded,
      placementFeasible: true,
      baseCost: layerBlocks.length,
    };
  });

  const goalModules = modules.map((m) => m.moduleId);

  return {
    templateId,
    facing: 'N',
    goalModules,
    inventory,
    siteState: {
      terrain: 'flat',
      biome: 'plains',
      hasTreesNearby: false,
      hasWaterNearby: false,
      siteCaps: 'flat_16x16_clear',
    },
    modules,
    maxNodes: 2000,
    useLearning: true,
  };
}

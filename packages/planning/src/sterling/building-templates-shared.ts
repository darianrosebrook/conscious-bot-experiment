/**
 * M5: Shared Building Template Definitions
 *
 * Single source of truth for building templates used by both the
 * decomposer and the planner. Each template carries:
 * - Module structure (from planning-side BuildingTemplate)
 * - Block geometry (from dashboard PlacedBlock[])
 * - Module-to-geometry mapping (which blocks belong to which module)
 *
 * This prevents the template source drift described in the M5 design:
 * the decomposer, the planner, and the solver all reference the same
 * canonical template artifact.
 *
 * @author @darianrosebrook
 */

import type { PlacedBlock } from './building-decomposer';

// ============================================================================
// Shared Template Types
// ============================================================================

/**
 * A building module with both structural metadata and block geometry.
 */
export interface CheckpointableModule {
  moduleId: string;
  moduleType: 'prep_site' | 'apply_module' | 'place_feature';
  requiresModules: string[];
  materialsNeeded: Array<{ name: string; count: number }>;
  /** The actual blocks this module places in the world (relative coordinates) */
  placements: PlacedBlock[];
}

/**
 * A building template that unifies module structure with block geometry.
 * This is the canonical source for template identity, decomposition,
 * and checkpoint verification.
 */
export interface CheckpointableTemplate {
  templateId: string;
  facing: 'N' | 'S' | 'E' | 'W';
  modules: CheckpointableModule[];
  /** Module IDs in construction order (dependency-resolved) */
  constructionOrder: string[];
}

// ============================================================================
// Helpers
// ============================================================================

function b(x: number, y: number, z: number, blockType: string): PlacedBlock {
  return { position: { x, y, z }, blockType };
}

function fill(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  blockType: string,
): PlacedBlock[] {
  const blocks: PlacedBlock[] = [];
  for (let x = x1; x <= x2; x++)
    for (let y = y1; y <= y2; y++)
      for (let z = z1; z <= z2; z++)
        blocks.push(b(x, y, z, blockType));
  return blocks;
}

// ============================================================================
// Simple Shelter (M5-v0 Certification Template)
// ============================================================================

/**
 * Simple Shelter — the M5-v0 certification template.
 *
 * A 5×5 wooden shelter with cobblestone foundation, oak plank walls,
 * glass windows, door opening, and oak slab roof. 121 blocks total.
 *
 * Module structure matches the planning-side getBasicShelterTemplate()
 * module definitions. Block geometry matches the dashboard's simpleShelter()
 * template. This unifies both into one canonical artifact.
 *
 * Construction order (dependency-resolved):
 * 1. foundation_5x5 — 25 cobblestone at y=0
 * 2. walls_cobble_3h — 42 oak_planks at y=1..3 (hollow, with door/window openings)
 * 3. roof_slab — 49 oak_slab at y=4 (with overhang)
 * 4. door_south — door opening (blocks already excluded from walls)
 * 5. lighting_pass — 1 torch inside
 */
export function getSimpleShelterTemplate(): CheckpointableTemplate {
  // Foundation: 5×5 cobblestone floor at y=0
  const foundationBlocks = fill(4, 0, 4, 8, 0, 8, 'cobblestone');

  // Walls: 3 high (y=1..3), hollow, with door/window modifications
  const wallBlocks: PlacedBlock[] = [];
  const doorPositions = new Set(['6,1,4', '6,2,4']);
  const windowPositions = new Set(['5,2,8', '7,2,8', '4,2,6', '8,2,6']);

  for (let y = 1; y <= 3; y++) {
    for (let x = 4; x <= 8; x++) {
      for (const z of [4, 8]) {
        const key = `${x},${y},${z}`;
        if (doorPositions.has(key)) continue; // Door opening
        const blockType = windowPositions.has(key) ? 'glass' : 'oak_planks';
        wallBlocks.push(b(x, y, z, blockType));
      }
    }
    for (let z = 5; z <= 7; z++) {
      for (const x of [4, 8]) {
        const key = `${x},${y},${z}`;
        const blockType = windowPositions.has(key) ? 'glass' : 'oak_planks';
        wallBlocks.push(b(x, y, z, blockType));
      }
    }
  }

  // Roof: flat oak slab layer at y=4 with overhang
  const roofBlocks = fill(3, 4, 3, 9, 4, 9, 'oak_slab');

  // Lighting: single torch inside
  const lightingBlocks = [b(6, 1, 6, 'torch')];

  return {
    templateId: 'basic_shelter_5x5',
    facing: 'N',
    modules: [
      {
        moduleId: 'foundation_5x5',
        moduleType: 'apply_module',
        requiresModules: [],
        materialsNeeded: [{ name: 'cobblestone', count: 25 }],
        placements: foundationBlocks,
      },
      {
        moduleId: 'walls_cobble_3h',
        moduleType: 'apply_module',
        requiresModules: ['foundation_5x5'],
        materialsNeeded: [
          { name: 'oak_planks', count: wallBlocks.filter(b => b.blockType === 'oak_planks').length },
          { name: 'glass', count: wallBlocks.filter(b => b.blockType === 'glass').length },
        ],
        placements: wallBlocks,
      },
      {
        moduleId: 'roof_slab',
        moduleType: 'apply_module',
        requiresModules: ['walls_cobble_3h'],
        materialsNeeded: [{ name: 'oak_slab', count: roofBlocks.length }],
        placements: roofBlocks,
      },
      {
        moduleId: 'lighting_pass',
        moduleType: 'place_feature',
        requiresModules: ['roof_slab'],
        materialsNeeded: [{ name: 'torch', count: 1 }],
        placements: lightingBlocks,
      },
    ],
    constructionOrder: ['foundation_5x5', 'walls_cobble_3h', 'roof_slab', 'lighting_pass'],
  };
}

// ============================================================================
// Reduced Shelter (M5-v0 Minimal Certification Slice)
// ============================================================================

/**
 * Reduced shelter — just foundation + first wall course.
 * The minimal slice for M5-v0 checkpoint proof.
 *
 * 2 modules, ~41 blocks. Small enough to test quickly, complex enough
 * to have a meaningful checkpoint boundary (foundation verified before
 * wall placement starts).
 */
export function getReducedShelterTemplate(): CheckpointableTemplate {
  const full = getSimpleShelterTemplate();
  return {
    templateId: 'reduced_shelter_v0',
    facing: 'N',
    modules: full.modules.slice(0, 2), // foundation + walls only
    constructionOrder: ['foundation_5x5', 'walls_cobble_3h'],
  };
}

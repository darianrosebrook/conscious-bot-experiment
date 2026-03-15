/**
 * M5: Building Template Decomposer
 *
 * Converts a flat PlacedBlock[] list (from dashboard templates) into
 * per-module place_block steps with ModuleWitnessV1 for checkpointing.
 *
 * For v0, module boundaries are derived from Y-layer heuristics:
 * - foundation: y=0 (floor)
 * - walls: y=1..N-1 (vertical structure)
 * - roof: y=max (top layer)
 *
 * The decomposition produces exactly the step and witness shapes that
 * the checkpoint system expects, using the real place_block leaf
 * (not building stubs).
 *
 * @author @darianrosebrook
 */

import type { TaskStep } from '../types/task-step';
import type { ModuleWitnessV1 } from '../types/build-checkpoint';
import { buildModuleWitness } from './build-checkpoint';

// ============================================================================
// Types
// ============================================================================

/** A placed block from a dashboard template */
export interface PlacedBlock {
  position: { x: number; y: number; z: number };
  blockType: string;
}

/** A decomposed module with steps and witness */
export interface DecomposedModule {
  moduleId: string;
  blocks: PlacedBlock[];
  steps: TaskStep[];
  witness: ModuleWitnessV1;
}

/** Result of decomposing a full template */
export interface DecompositionResult {
  modules: DecomposedModule[];
  totalBlocks: number;
  totalSteps: number;
  templateDigest: string;
}

// ============================================================================
// Module Classification
// ============================================================================

/**
 * Classify blocks into modules by Y-layer heuristic.
 * Returns blocks grouped by module ID in construction order.
 */
function classifyModules(
  blocks: PlacedBlock[],
): Map<string, PlacedBlock[]> {
  if (blocks.length === 0) return new Map();

  const yMin = Math.min(...blocks.map(b => b.position.y));
  const yMax = Math.max(...blocks.map(b => b.position.y));

  const modules = new Map<string, PlacedBlock[]>();

  for (const block of blocks) {
    let moduleId: string;
    if (block.position.y === yMin) {
      moduleId = 'foundation';
    } else if (block.position.y === yMax && yMax > yMin) {
      moduleId = 'roof';
    } else {
      moduleId = `walls_y${block.position.y}`;
    }
    if (!modules.has(moduleId)) modules.set(moduleId, []);
    modules.get(moduleId)!.push(block);
  }

  // Sort modules in construction order: foundation → walls (ascending y) → roof
  const ordered = new Map<string, PlacedBlock[]>();
  const sortedKeys = [...modules.keys()].sort((a, b) => {
    if (a === 'foundation') return -1;
    if (b === 'foundation') return 1;
    if (a === 'roof') return 1;
    if (b === 'roof') return -1;
    // walls_yN sorted by N
    const yA = parseInt(a.replace('walls_y', ''), 10);
    const yB = parseInt(b.replace('walls_y', ''), 10);
    return yA - yB;
  });
  for (const key of sortedKeys) {
    ordered.set(key, modules.get(key)!);
  }

  return ordered;
}

// ============================================================================
// Decomposition
// ============================================================================

/**
 * Decompose a template's PlacedBlock[] into per-module steps and witnesses.
 *
 * @param templateId - Template identifier
 * @param blocks - Flat block list from dashboard template
 * @param siteOrigin - World position where the build starts (refCorner)
 * @param facing - Build facing direction
 */
export function decomposeTemplate(
  templateId: string,
  blocks: PlacedBlock[],
  siteOrigin: { x: number; y: number; z: number },
  facing: 'N' | 'S' | 'E' | 'W' = 'N',
): DecompositionResult {
  const modules = classifyModules(blocks);
  const result: DecomposedModule[] = [];
  let globalOrder = 1;
  const now = Date.now();

  for (const [moduleId, moduleBlocks] of modules) {
    // Sort blocks within module for deterministic placement order:
    // bottom-to-top, then back-to-front, then left-to-right
    const sorted = [...moduleBlocks].sort((a, b) => {
      if (a.position.y !== b.position.y) return a.position.y - b.position.y;
      if (a.position.z !== b.position.z) return a.position.z - b.position.z;
      return a.position.x - b.position.x;
    });

    // Generate place_block steps with absolute world coordinates
    const steps: TaskStep[] = sorted.map((block) => ({
      id: `step-${now}-place-${globalOrder}`,
      label: `Place ${block.blockType} at (${siteOrigin.x + block.position.x},${siteOrigin.y + block.position.y},${siteOrigin.z + block.position.z})`,
      done: false,
      order: globalOrder++,
      estimatedDuration: 3000,
      meta: {
        domain: 'building',
        leaf: 'place_block',
        executable: true,
        moduleId,
        templateId,
        args: {
          item: block.blockType,
          pos: {
            x: siteOrigin.x + block.position.x,
            y: siteOrigin.y + block.position.y,
            z: siteOrigin.z + block.position.z,
          },
        },
      },
    }));

    // Generate witness from the same placements
    const witness = buildModuleWitness(
      moduleId,
      siteOrigin,
      facing,
      sorted.map(block => ({
        dx: block.position.x,
        dy: block.position.y,
        dz: block.position.z,
        blockId: block.blockType,
      })),
    );

    result.push({ moduleId, blocks: sorted, steps, witness });
  }

  // Compute template digest from all block positions + types
  const { createHash } = require('node:crypto');
  const canonical = JSON.stringify(
    blocks.map(b => `${b.position.x},${b.position.y},${b.position.z}:${b.blockType}`).sort(),
  );
  const templateDigest = createHash('sha256').update(canonical).digest('hex').slice(0, 16);

  return {
    modules: result,
    totalBlocks: blocks.length,
    totalSteps: globalOrder - 1,
    templateDigest,
  };
}

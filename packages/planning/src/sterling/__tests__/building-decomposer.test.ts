/**
 * M5: Building template decomposer tests.
 *
 * Proves:
 * 1. Template decomposition produces correct module boundaries
 * 2. Placement order respects gravity (bottom-to-top within and across modules)
 * 3. Each block has a valid placement reference (not mid-air)
 * 4. ModuleWitnessV1 is generated for each module
 * 5. Steps use the real place_block leaf with absolute world coordinates
 */

import { describe, it, expect } from 'vitest';
import { decomposeTemplate, decomposeCheckpointableTemplate, type PlacedBlock } from '../building-decomposer';
import { getReducedShelterTemplate } from '../building-templates-shared';

// ── Simple Shelter fixture (reduced from dashboard template) ──

function simpleFloor(): PlacedBlock[] {
  const blocks: PlacedBlock[] = [];
  // 5×5 cobblestone floor at y=0
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      blocks.push({ position: { x, y: 0, z }, blockType: 'cobblestone' });
    }
  }
  return blocks;
}

function simpleWalls(): PlacedBlock[] {
  const blocks: PlacedBlock[] = [];
  // 1-course hollow walls at y=1
  for (let x = 0; x < 5; x++) {
    blocks.push({ position: { x, y: 1, z: 0 }, blockType: 'oak_planks' });
    blocks.push({ position: { x, y: 1, z: 4 }, blockType: 'oak_planks' });
  }
  for (let z = 1; z < 4; z++) {
    blocks.push({ position: { x: 0, y: 1, z }, blockType: 'oak_planks' });
    blocks.push({ position: { x: 4, y: 1, z }, blockType: 'oak_planks' });
  }
  return blocks;
}

function simpleRoof(): PlacedBlock[] {
  const blocks: PlacedBlock[] = [];
  // Flat roof at y=2
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      blocks.push({ position: { x, y: 2, z }, blockType: 'oak_slab' });
    }
  }
  return blocks;
}

function simpleShelter(): PlacedBlock[] {
  return [...simpleFloor(), ...simpleWalls(), ...simpleRoof()];
}

const SITE_ORIGIN = { x: 100, y: 64, z: 200 };

// ── Tests ──

describe('M5: Building Decomposer', () => {
  describe('module classification', () => {
    it('separates floor, walls, and roof into distinct modules', () => {
      const result = decomposeTemplate('shelter_v0', simpleShelter(), SITE_ORIGIN);

      const moduleIds = result.modules.map(m => m.moduleId);
      expect(moduleIds).toContain('foundation');
      expect(moduleIds).toContain('walls_y1');
      expect(moduleIds).toContain('roof');
    });

    it('foundation module contains all y=0 blocks', () => {
      const result = decomposeTemplate('shelter_v0', simpleShelter(), SITE_ORIGIN);
      const foundation = result.modules.find(m => m.moduleId === 'foundation')!;

      expect(foundation.blocks).toHaveLength(25); // 5×5 floor
      expect(foundation.blocks.every(b => b.position.y === 0)).toBe(true);
    });

    it('modules are ordered bottom-to-top', () => {
      const result = decomposeTemplate('shelter_v0', simpleShelter(), SITE_ORIGIN);

      // Foundation first, walls middle, roof last
      expect(result.modules[0].moduleId).toBe('foundation');
      expect(result.modules[result.modules.length - 1].moduleId).toBe('roof');

      // Steps are globally ordered bottom-to-top
      const yValues = result.modules.flatMap(m =>
        m.blocks.map(b => b.position.y),
      );
      for (let i = 1; i < yValues.length; i++) {
        expect(yValues[i]).toBeGreaterThanOrEqual(yValues[i - 1]);
      }
    });
  });

  describe('placement order respects gravity', () => {
    it('no block is placed before the block below it', () => {
      const result = decomposeTemplate('shelter_v0', simpleShelter(), SITE_ORIGIN);

      // Flatten all steps in order
      const allSteps = result.modules.flatMap(m => m.steps);

      // Track which positions have been "placed"
      const placed = new Set<string>();
      // Ground is always solid (y < siteOrigin.y is ground)
      // Add ground positions as pre-placed
      for (let x = -5; x <= 20; x++) {
        for (let z = -5; z <= 20; z++) {
          placed.add(`${SITE_ORIGIN.x + x},${SITE_ORIGIN.y - 1},${SITE_ORIGIN.z + z}`);
        }
      }

      for (const step of allSteps) {
        const pos = (step.meta as any)?.args?.pos;
        if (!pos) continue;

        // Check: at least one adjacent position (below, or cardinal neighbor) is already placed
        const adjacentKeys = [
          `${pos.x},${pos.y - 1},${pos.z}`, // below
          `${pos.x + 1},${pos.y},${pos.z}`, // east
          `${pos.x - 1},${pos.y},${pos.z}`, // west
          `${pos.x},${pos.y},${pos.z + 1}`, // south
          `${pos.x},${pos.y},${pos.z - 1}`, // north
        ];

        const hasSupport = adjacentKeys.some(k => placed.has(k));
        expect(hasSupport, `Block at (${pos.x},${pos.y},${pos.z}) has no support — would be mid-air`).toBe(true);

        placed.add(`${pos.x},${pos.y},${pos.z}`);
      }
    });
  });

  describe('steps use real place_block leaf', () => {
    it('all steps have leaf=place_block with absolute coordinates', () => {
      const result = decomposeTemplate('shelter_v0', simpleFloor(), SITE_ORIGIN);

      for (const module of result.modules) {
        for (const step of module.steps) {
          expect((step.meta as any)?.leaf).toBe('place_block');
          expect((step.meta as any)?.args?.item).toBeTruthy();
          expect((step.meta as any)?.args?.pos).toBeDefined();

          const pos = (step.meta as any).args.pos;
          // Absolute coordinates = site origin + relative position
          expect(pos.x).toBeGreaterThanOrEqual(SITE_ORIGIN.x);
          expect(pos.y).toBeGreaterThanOrEqual(SITE_ORIGIN.y);
          expect(pos.z).toBeGreaterThanOrEqual(SITE_ORIGIN.z);
        }
      }
    });

    it('foundation steps place cobblestone at y=siteOrigin.y', () => {
      const result = decomposeTemplate('shelter_v0', simpleFloor(), SITE_ORIGIN);
      const foundation = result.modules[0];

      for (const step of foundation.steps) {
        expect((step.meta as any).args.item).toBe('cobblestone');
        expect((step.meta as any).args.pos.y).toBe(SITE_ORIGIN.y);
      }
    });
  });

  describe('witness generation', () => {
    it('each module produces a ModuleWitnessV1', () => {
      const result = decomposeTemplate('shelter_v0', simpleShelter(), SITE_ORIGIN);

      for (const module of result.modules) {
        expect(module.witness).toBeDefined();
        expect(module.witness.moduleId).toBe(module.moduleId);
        expect(module.witness.refCorner).toEqual(SITE_ORIGIN);
        expect(module.witness.expectedPlacements.length).toBe(module.blocks.length);
        expect(module.witness.witnessDigest).toBeTruthy();
      }
    });

    it('witness placements match step positions', () => {
      const result = decomposeTemplate('shelter_v0', simpleFloor(), SITE_ORIGIN);
      const foundation = result.modules[0];

      // Witness has relative positions (dx, dy, dz)
      // Steps have absolute positions (siteOrigin + relative)
      for (const wp of foundation.witness.expectedPlacements) {
        const absX = SITE_ORIGIN.x + wp.dx;
        const absY = SITE_ORIGIN.y + wp.dy;
        const absZ = SITE_ORIGIN.z + wp.dz;

        const matchingStep = foundation.steps.find(s => {
          const pos = (s.meta as any).args.pos;
          return pos.x === absX && pos.y === absY && pos.z === absZ;
        });

        expect(matchingStep, `Witness placement (${wp.dx},${wp.dy},${wp.dz}) has no matching step`).toBeDefined();
      }
    });
  });

  describe('template digest', () => {
    it('same blocks produce same digest', () => {
      const r1 = decomposeTemplate('shelter_v0', simpleFloor(), SITE_ORIGIN);
      const r2 = decomposeTemplate('shelter_v0', simpleFloor(), SITE_ORIGIN);
      expect(r1.templateDigest).toBe(r2.templateDigest);
    });

    it('different blocks produce different digest', () => {
      const floor = simpleFloor();
      const modified = [...floor, { position: { x: 10, y: 0, z: 10 }, blockType: 'stone' }];
      const r1 = decomposeTemplate('shelter_v0', floor, SITE_ORIGIN);
      const r2 = decomposeTemplate('shelter_v0', modified, SITE_ORIGIN);
      expect(r1.templateDigest).not.toBe(r2.templateDigest);
    });
  });
});

// ── Template-aware decomposition tests ──

describe('M5: Checkpointable Template Decomposition', () => {
  it('uses canonical module boundaries from the template', () => {
    const template = getReducedShelterTemplate();
    const result = decomposeCheckpointableTemplate(template, SITE_ORIGIN);

    // Module IDs come from the template, not Y-layer heuristics
    const moduleIds = result.modules.map(m => m.moduleId);
    expect(moduleIds).toEqual(['foundation_5x5', 'walls_cobble_3h']);
  });

  it('inserts verify_module checkpoint steps between modules', () => {
    const template = getReducedShelterTemplate();
    const result = decomposeCheckpointableTemplate(template, SITE_ORIGIN);

    for (const module of result.modules) {
      const lastStep = module.steps[module.steps.length - 1];
      expect((lastStep.meta as any).leaf).toBe('verify_module');
      expect((lastStep.meta as any).isCheckpoint).toBe(true);
      expect((lastStep.meta as any).moduleId).toBe(module.moduleId);
    }
  });

  it('placement steps precede checkpoint step within each module', () => {
    const template = getReducedShelterTemplate();
    const result = decomposeCheckpointableTemplate(template, SITE_ORIGIN);

    for (const module of result.modules) {
      const placeSteps = module.steps.filter(s => (s.meta as any).leaf === 'place_block');
      const verifySteps = module.steps.filter(s => (s.meta as any).leaf === 'verify_module');

      expect(placeSteps.length).toBeGreaterThan(0);
      expect(verifySteps.length).toBe(1);

      // All place_block orders < verify_module order
      const maxPlaceOrder = Math.max(...placeSteps.map(s => s.order));
      expect(verifySteps[0].order).toBeGreaterThan(maxPlaceOrder);
    }
  });

  it('foundation witness has 25 cobblestone placements', () => {
    const template = getReducedShelterTemplate();
    const result = decomposeCheckpointableTemplate(template, SITE_ORIGIN);

    const foundation = result.modules.find(m => m.moduleId === 'foundation_5x5')!;
    expect(foundation.witness.expectedPlacements.length).toBe(25);
    expect(foundation.witness.expectedPlacements.every(p => p.blockId === 'cobblestone')).toBe(true);
  });

  it('template digest is deterministic from canonical source', () => {
    const template = getReducedShelterTemplate();
    const r1 = decomposeCheckpointableTemplate(template, SITE_ORIGIN);
    const r2 = decomposeCheckpointableTemplate(template, SITE_ORIGIN);
    expect(r1.templateDigest).toBe(r2.templateDigest);
  });

  it('gravity compliance: all blocks have support from prior placements', () => {
    const template = getReducedShelterTemplate();
    const result = decomposeCheckpointableTemplate(template, SITE_ORIGIN);

    const placed = new Set<string>();
    // Ground is solid
    for (let x = -5; x <= 20; x++) {
      for (let z = -5; z <= 20; z++) {
        placed.add(`${SITE_ORIGIN.x + x},${SITE_ORIGIN.y - 1},${SITE_ORIGIN.z + z}`);
      }
    }

    const allSteps = result.modules.flatMap(m => m.steps);
    for (const step of allSteps) {
      const pos = (step.meta as any)?.args?.pos;
      if (!pos) continue; // verify_module steps have no pos

      const adjacentKeys = [
        `${pos.x},${pos.y - 1},${pos.z}`,
        `${pos.x + 1},${pos.y},${pos.z}`,
        `${pos.x - 1},${pos.y},${pos.z}`,
        `${pos.x},${pos.y},${pos.z + 1}`,
        `${pos.x},${pos.y},${pos.z - 1}`,
      ];

      const hasSupport = adjacentKeys.some(k => placed.has(k));
      expect(hasSupport, `Block at (${pos.x},${pos.y},${pos.z}) has no support`).toBe(true);

      placed.add(`${pos.x},${pos.y},${pos.z}`);
    }
  });
});

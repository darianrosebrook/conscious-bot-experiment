/**
 * Rig G Certification Tests — Partial Order Plan
 *
 * Cert 1: DAG has nodes + edges (not flat list)
 * Cert 4: 300 modules → blocked with bound_exceeded
 * Cert 5: Commuting pairs identified, conflict keys prevent false independence
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  computeNodeId,
  computePlanDigest,
  PARTIAL_ORDER_SCHEMA_VERSION,
  MAX_DAG_NODES,
} from '../partial-order-plan';
import type { PlanNode, PlanEdge } from '../partial-order-plan';
import { buildDagFromModules, findCommutingPairs } from '../dag-builder';
import type { BuildingModule, BuildingSolveStep } from '../../sterling/minecraft-building-types';

// ============================================================================
// Fixtures
// ============================================================================

function makeShelterModules(): BuildingModule[] {
  return [
    { moduleId: 'clear_site', moduleType: 'prep_site', requiresModules: [], materialsNeeded: [], placementFeasible: true, baseCost: 2.0 },
    { moduleId: 'foundation_5x5', moduleType: 'apply_module', requiresModules: ['clear_site'], materialsNeeded: [{ name: 'cobblestone', count: 25 }], placementFeasible: true, baseCost: 3.0 },
    { moduleId: 'walls_cobble_3h', moduleType: 'apply_module', requiresModules: ['foundation_5x5'], materialsNeeded: [{ name: 'cobblestone', count: 20 }], placementFeasible: true, baseCost: 4.0 },
    { moduleId: 'place_bed', moduleType: 'place_feature', requiresModules: ['foundation_5x5'], materialsNeeded: [{ name: 'bed', count: 1 }], placementFeasible: true, baseCost: 0.5 },
    { moduleId: 'roof_slab', moduleType: 'apply_module', requiresModules: ['walls_cobble_3h'], materialsNeeded: [{ name: 'oak_planks', count: 15 }], placementFeasible: true, baseCost: 3.0 },
    { moduleId: 'door_south', moduleType: 'place_feature', requiresModules: ['walls_cobble_3h'], materialsNeeded: [{ name: 'oak_door', count: 1 }], placementFeasible: true, baseCost: 1.0 },
    { moduleId: 'lighting_pass', moduleType: 'place_feature', requiresModules: ['roof_slab'], materialsNeeded: [{ name: 'torch', count: 4 }], placementFeasible: true, baseCost: 1.0 },
  ];
}

function makeShelterSteps(): BuildingSolveStep[] {
  return [
    { moduleId: 'clear_site', moduleType: 'prep_site', materialsNeeded: [], resultingProgress: 1, resultingInventory: {} },
    { moduleId: 'foundation_5x5', moduleType: 'apply_module', materialsNeeded: [{ name: 'cobblestone', count: 25 }], resultingProgress: 2, resultingInventory: {} },
    { moduleId: 'walls_cobble_3h', moduleType: 'apply_module', materialsNeeded: [{ name: 'cobblestone', count: 20 }], resultingProgress: 3, resultingInventory: {} },
    { moduleId: 'place_bed', moduleType: 'place_feature', materialsNeeded: [{ name: 'bed', count: 1 }], resultingProgress: 4, resultingInventory: {} },
    { moduleId: 'roof_slab', moduleType: 'apply_module', materialsNeeded: [{ name: 'oak_planks', count: 15 }], resultingProgress: 5, resultingInventory: {} },
    { moduleId: 'door_south', moduleType: 'place_feature', materialsNeeded: [{ name: 'oak_door', count: 1 }], resultingProgress: 6, resultingInventory: {} },
    { moduleId: 'lighting_pass', moduleType: 'place_feature', materialsNeeded: [{ name: 'torch', count: 4 }], resultingProgress: 7, resultingInventory: {} },
  ];
}

// ============================================================================
// Tests
// ============================================================================

describe('Partial Order Plan — Rig G Certification', () => {
  describe('Cert 1: DAG has nodes and edges', () => {
    it('builds a DAG with nodes and edges from shelter template', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const result = buildDagFromModules(modules, steps);

      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      const dag = result.value;
      expect(dag.nodes.length).toBe(7);
      expect(dag.edges.length).toBeGreaterThan(0);
      expect(dag.schemaVersion).toBe(PARTIAL_ORDER_SCHEMA_VERSION);
      expect(dag.planDigest).toBeTruthy();
    });

    it('DAG edges reflect module dependency declarations', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const result = buildDagFromModules(modules, steps);

      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      const dag = result.value;
      // foundation_5x5 depends on clear_site
      const foundationNodeId = computeNodeId('foundation_5x5', 'apply_module');
      const clearSiteNodeId = computeNodeId('clear_site', 'prep_site');
      const depEdge = dag.edges.find(
        (e) => e.from === clearSiteNodeId && e.to === foundationNodeId
      );
      expect(depEdge).toBeDefined();
      expect(depEdge!.constraint).toBe('dependency');
    });
  });

  describe('Cert 4: Bound exceeded', () => {
    it('returns blocked with bound_exceeded for 300 modules', () => {
      const modules: BuildingModule[] = [];
      const steps: BuildingSolveStep[] = [];

      for (let i = 0; i < 300; i++) {
        modules.push({
          moduleId: `mod_${i}`,
          moduleType: 'apply_module',
          requiresModules: i > 0 ? [`mod_${i - 1}`] : [],
          materialsNeeded: [],
          placementFeasible: true,
          baseCost: 1.0,
        });
        steps.push({
          moduleId: `mod_${i}`,
          moduleType: 'apply_module',
          materialsNeeded: [],
          resultingProgress: i + 1,
          resultingInventory: {},
        });
      }

      const result = buildDagFromModules(modules, steps);
      expect(result.kind).toBe('blocked');
      if (result.kind === 'blocked') {
        expect(result.reason).toBe('bound_exceeded');
        expect(result.detail).toContain('300');
        expect(result.detail).toContain(`${MAX_DAG_NODES}`);
      }
    });

    it('accepts exactly MAX_DAG_NODES steps', () => {
      const modules: BuildingModule[] = [];
      const steps: BuildingSolveStep[] = [];

      for (let i = 0; i < MAX_DAG_NODES; i++) {
        modules.push({
          moduleId: `mod_${i}`,
          moduleType: 'apply_module',
          requiresModules: i > 0 ? [`mod_${i - 1}`] : [],
          materialsNeeded: [],
          placementFeasible: true,
          baseCost: 1.0,
        });
        steps.push({
          moduleId: `mod_${i}`,
          moduleType: 'apply_module',
          materialsNeeded: [],
          resultingProgress: i + 1,
          resultingInventory: {},
        });
      }

      const result = buildDagFromModules(modules, steps);
      expect(result.kind).toBe('ok');
    });
  });

  describe('Cert 5: Commuting pairs and conflict keys', () => {
    it('identifies commuting pairs in shelter template', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      const pairs = findCommutingPairs(dagResult.value);
      // place_bed and walls_cobble_3h: both depend on foundation_5x5
      // but walls requires foundation and place_bed requires foundation
      // They share NO edge between them, but place_bed has conflict key
      // type:place_feature. walls_cobble_3h has no conflict key.
      // So they should commute if no conflict key overlap.
      expect(pairs.length).toBeGreaterThan(0);
    });

    it('conflict keys prevent false independence for same-type place_feature', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      const dag = dagResult.value;
      // door_south and lighting_pass are both place_feature
      // They share conflict key 'type:place_feature'
      // door_south depends on walls, lighting_pass depends on roof
      // So they have no DAG edge between them
      // But conflict keys should prevent them from being commuting
      const doorNodeId = computeNodeId('door_south', 'place_feature');
      const lightingNodeId = computeNodeId('lighting_pass', 'place_feature');

      const pairs = findCommutingPairs(dag);
      const falseCommute = pairs.find(
        (p) =>
          (p.nodeA === doorNodeId && p.nodeB === lightingNodeId) ||
          (p.nodeA === lightingNodeId && p.nodeB === doorNodeId)
      );
      // door_south and lighting_pass both have type:place_feature conflict key
      // so they should NOT appear as commuting
      expect(falseCommute).toBeUndefined();
    });
  });

  describe('Content-addressed node IDs', () => {
    it('produces stable node IDs for same inputs', () => {
      const id1 = computeNodeId('foundation_5x5', 'apply_module');
      const id2 = computeNodeId('foundation_5x5', 'apply_module');
      expect(id1).toBe(id2);
    });

    it('produces different node IDs for different inputs', () => {
      const id1 = computeNodeId('foundation_5x5', 'apply_module');
      const id2 = computeNodeId('walls_cobble_3h', 'apply_module');
      expect(id1).not.toBe(id2);
    });

    it('plan digest is deterministic', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const r1 = buildDagFromModules(modules, steps);
      const r2 = buildDagFromModules(modules, steps);

      expect(r1.kind).toBe('ok');
      expect(r2.kind).toBe('ok');
      if (r1.kind !== 'ok' || r2.kind !== 'ok') return;

      expect(r1.value.planDigest).toBe(r2.value.planDigest);
    });
  });
});

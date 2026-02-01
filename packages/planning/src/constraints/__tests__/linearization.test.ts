/**
 * Rig G Certification Tests — Linearization
 *
 * Cert 2: same DAG → same linearization digest (deterministic)
 * Content-addressed node IDs are stable
 * Cycle → error decision (not throw)
 * steps[] === linearize(dag) projection
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { linearize } from '../linearization';
import { buildDagFromModules } from '../dag-builder';
import {
  computeNodeId,
  PARTIAL_ORDER_SCHEMA_VERSION,
} from '../partial-order-plan';
import type { PartialOrderPlan, PlanNode, PlanEdge } from '../partial-order-plan';
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

describe('Linearization — Rig G Certification', () => {
  describe('Cert 2: Deterministic linearization', () => {
    it('same DAG produces same linearization digest', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      const lin1 = linearize(dagResult.value);
      const lin2 = linearize(dagResult.value);

      expect(lin1.kind).toBe('ok');
      expect(lin2.kind).toBe('ok');
      if (lin1.kind !== 'ok' || lin2.kind !== 'ok') return;

      expect(lin1.value.linearizationDigest).toBe(
        lin2.value.linearizationDigest
      );
    });

    it('linearized order is consistent across runs', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      const lin1 = linearize(dagResult.value);
      const lin2 = linearize(dagResult.value);

      expect(lin1.kind).toBe('ok');
      expect(lin2.kind).toBe('ok');
      if (lin1.kind !== 'ok' || lin2.kind !== 'ok') return;

      const ids1 = lin1.value.order.map((n) => n.id);
      const ids2 = lin2.value.order.map((n) => n.id);
      expect(ids1).toEqual(ids2);
    });
  });

  describe('Cycle detection', () => {
    it('returns error decision (not throw) on cycle', () => {
      const nodeA: PlanNode<string> = {
        id: computeNodeId('A', 'apply_module'),
        data: 'A',
        conflictKeys: [],
      };
      const nodeB: PlanNode<string> = {
        id: computeNodeId('B', 'apply_module'),
        data: 'B',
        conflictKeys: [],
      };

      const plan: PartialOrderPlan<string> = {
        schemaVersion: PARTIAL_ORDER_SCHEMA_VERSION,
        nodes: [nodeA, nodeB],
        edges: [
          { from: nodeA.id, to: nodeB.id, constraint: 'dependency' },
          { from: nodeB.id, to: nodeA.id, constraint: 'dependency' },
        ],
        planDigest: 'test-digest',
      };

      const result = linearize(plan);
      expect(result.kind).toBe('error');
      if (result.kind !== 'error') return;
      expect(result.reason).toBe('cycle_detected');
      expect(result.detail).toContain('Cycle detected');
    });
  });

  describe('steps[] === linearize(dag) projection', () => {
    it('linearized order matches step data projection', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      const linResult = linearize(dagResult.value);
      expect(linResult.kind).toBe('ok');
      if (linResult.kind !== 'ok') return;

      // The linearized order's data should give us the steps in order
      const linearizedSteps = linResult.value.order.map((n) => n.data);
      // Each step should have a valid moduleId
      for (const step of linearizedSteps) {
        expect(step.moduleId).toBeTruthy();
      }
      // All original moduleIds should be present
      const originalIds = steps.map((s) => s.moduleId).sort();
      const linearizedIds = linearizedSteps.map((s) => s.moduleId).sort();
      expect(linearizedIds).toEqual(originalIds);
    });
  });

  describe('Ready-set sizes', () => {
    it('tracks ready-set sizes for each linearization step', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      const linResult = linearize(dagResult.value);
      expect(linResult.kind).toBe('ok');
      if (linResult.kind !== 'ok') return;

      // Ready-set sizes should be logged for every step
      expect(linResult.value.readySetSizes.length).toBe(steps.length);
      // First step: only clear_site has no deps → ready set size 1
      expect(linResult.value.readySetSizes[0]).toBe(1);
    });

    it('ready-set sizes > 1 exist for shelter template (commuting exists)', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      const linResult = linearize(dagResult.value);
      expect(linResult.kind).toBe('ok');
      if (linResult.kind !== 'ok') return;

      // After foundation_5x5 is done, both walls_cobble_3h and place_bed
      // become ready → ready set size > 1
      const hasParallelism = linResult.value.readySetSizes.some((s) => s > 1);
      expect(hasParallelism).toBe(true);
    });
  });

  describe('Respects topological ordering', () => {
    it('clear_site appears before foundation_5x5 in linearized order', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      const linResult = linearize(dagResult.value);
      expect(linResult.kind).toBe('ok');
      if (linResult.kind !== 'ok') return;

      const order = linResult.value.order.map((n) => (n.data as BuildingSolveStep).moduleId);
      const clearIdx = order.indexOf('clear_site');
      const foundIdx = order.indexOf('foundation_5x5');
      expect(clearIdx).toBeLessThan(foundIdx);
    });

    it('foundation_5x5 appears before walls_cobble_3h', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      const linResult = linearize(dagResult.value);
      expect(linResult.kind).toBe('ok');
      if (linResult.kind !== 'ok') return;

      const order = linResult.value.order.map((n) => (n.data as BuildingSolveStep).moduleId);
      expect(order.indexOf('foundation_5x5')).toBeLessThan(order.indexOf('walls_cobble_3h'));
    });
  });
});

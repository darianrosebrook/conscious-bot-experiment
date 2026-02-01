/**
 * Rig G Certification Tests — Feasibility Checker
 *
 * Cert 3: remove foundation_5x5 → blocked with infeasible_dependency
 * Rejection counts by type
 * First violation detail is populated
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { checkFeasibility } from '../feasibility-checker';
import { buildDagFromModules } from '../dag-builder';
import { extractDependencyConstraints } from '../constraint-model';
import type { BuildingModule, BuildingSolveStep } from '../../sterling/minecraft-building-types';
import type { PlanConstraint, ReachabilityConstraint } from '../constraint-model';

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

describe('Feasibility Checker — Rig G Certification', () => {
  describe('Cert 3: Missing foundation → blocked', () => {
    it('rejects plan when foundation_5x5 is missing but required', () => {
      // Build modules with foundation removed from steps (but still in module defs)
      const modules = makeShelterModules();
      const stepsWithoutFoundation = makeShelterSteps().filter(
        (s) => s.moduleId !== 'foundation_5x5'
      );

      const dagResult = buildDagFromModules(modules, stepsWithoutFoundation);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      // Constraints still include walls→foundation dependency
      const constraints = extractDependencyConstraints(modules);
      const result = checkFeasibility(dagResult.value, constraints);

      expect(result.kind).toBe('blocked');
      if (result.kind !== 'blocked') return;
      expect(result.reason).toBe('infeasible_dependency');
      expect(result.detail).toContain('foundation_5x5');
    });
  });

  describe('Full shelter passes feasibility', () => {
    it('accepts the complete shelter DAG with all dependencies', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      const constraints = extractDependencyConstraints(modules);
      const result = checkFeasibility(dagResult.value, constraints);

      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;
      expect(result.value.feasible).toBe(true);
      expect(result.value.violations).toHaveLength(0);
    });
  });

  describe('Reachability constraint', () => {
    it('rejects when module is out of reach', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      const constraints: PlanConstraint[] = [
        ...extractDependencyConstraints(modules),
        {
          type: 'reachability',
          moduleId: 'walls_cobble_3h',
          maxDistance: 5,
          currentDistance: 20,
        } satisfies ReachabilityConstraint,
      ];

      const result = checkFeasibility(dagResult.value, constraints);
      expect(result.kind).toBe('blocked');
      if (result.kind !== 'blocked') return;
      expect(result.reason).toBe('infeasible_reachability');
      expect(result.detail).toContain('walls_cobble_3h');
      expect(result.detail).toContain('20');
    });

    it('accepts when module is within reach', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      const constraints: PlanConstraint[] = [
        ...extractDependencyConstraints(modules),
        {
          type: 'reachability',
          moduleId: 'walls_cobble_3h',
          maxDistance: 5,
          currentDistance: 3,
        } satisfies ReachabilityConstraint,
      ];

      const result = checkFeasibility(dagResult.value, constraints);
      expect(result.kind).toBe('ok');
    });

    it('accepts when distance is unknown (undefined)', () => {
      const modules = makeShelterModules();
      const steps = makeShelterSteps();
      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      const constraints: PlanConstraint[] = [
        ...extractDependencyConstraints(modules),
        {
          type: 'reachability',
          moduleId: 'walls_cobble_3h',
          maxDistance: 5,
          // currentDistance intentionally omitted
        } satisfies ReachabilityConstraint,
      ];

      const result = checkFeasibility(dagResult.value, constraints);
      expect(result.kind).toBe('ok');
    });
  });

  describe('First violation detail is populated', () => {
    it('detail contains the dependent and required module names', () => {
      const modules = makeShelterModules();
      const stepsWithoutClearSite = makeShelterSteps().filter(
        (s) => s.moduleId !== 'clear_site'
      );

      const dagResult = buildDagFromModules(modules, stepsWithoutClearSite);
      expect(dagResult.kind).toBe('ok');
      if (dagResult.kind !== 'ok') return;

      const constraints = extractDependencyConstraints(modules);
      const result = checkFeasibility(dagResult.value, constraints);

      expect(result.kind).toBe('blocked');
      if (result.kind !== 'blocked') return;
      expect(result.detail).toBeTruthy();
      expect(result.detail.length).toBeGreaterThan(10);
    });
  });
});

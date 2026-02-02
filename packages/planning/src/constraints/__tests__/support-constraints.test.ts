/**
 * Support Constraints Tests (G.1)
 *
 * Acceptance:
 * - Wall without foundation → rejected (support violation)
 * - Wall with foundation → accepted
 * - Support edge in DAG and linearized order
 */

import { describe, it, expect } from 'vitest';
import {
  extractSupportConstraints,
  extractDependencyConstraints,
} from '../constraint-model';
import type { SupportConstraint } from '../constraint-model';
import { buildDagFromModules, findCommutingPairs } from '../dag-builder';
import { checkFeasibility } from '../feasibility-checker';
import { linearize } from '../linearization';
import type { BuildingModule, BuildingSolveStep } from '../../sterling/minecraft-building-types';

// ============================================================================
// Fixtures
// ============================================================================

function makeModule(
  id: string,
  type: BuildingModule['moduleType'],
  requires: string[] = [],
  supportReqs?: Array<{ supportModuleId: string }>,
): BuildingModule {
  return {
    moduleId: id,
    moduleType: type,
    requiresModules: requires,
    materialsNeeded: [],
    placementFeasible: true,
    baseCost: 1,
    supportRequirements: supportReqs,
  };
}

function makeStep(
  id: string,
  type: BuildingSolveStep['moduleType'],
): BuildingSolveStep {
  return {
    moduleId: id,
    moduleType: type,
    materialsNeeded: [],
    resultingProgress: 0,
    resultingInventory: {},
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('support constraints (G.1)', () => {
  describe('extractSupportConstraints', () => {
    it('extracts support constraints from modules', () => {
      const modules = [
        makeModule('wall_north', 'apply_module', [], [
          { supportModuleId: 'foundation' },
        ]),
        makeModule('foundation', 'prep_site'),
      ];

      const constraints = extractSupportConstraints(modules);
      expect(constraints).toHaveLength(1);
      expect(constraints[0].type).toBe('support');
      expect(constraints[0].dependentModuleId).toBe('wall_north');
      expect(constraints[0].supportModuleId).toBe('foundation');
    });

    it('returns empty for modules without support requirements', () => {
      const modules = [
        makeModule('floor', 'prep_site'),
        makeModule('door', 'place_feature'),
      ];
      expect(extractSupportConstraints(modules)).toHaveLength(0);
    });
  });

  describe('wall without foundation → rejected', () => {
    it('support violation when foundation is missing from plan', () => {
      const modules = [
        makeModule('wall_north', 'apply_module', [], [
          { supportModuleId: 'foundation' },
        ]),
      ];

      const steps = [makeStep('wall_north', 'apply_module')];
      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');

      if (dagResult.kind === 'ok') {
        const supportConstraints = extractSupportConstraints(modules);
        const result = checkFeasibility(dagResult.value, supportConstraints);

        // Should be blocked: foundation is not in the plan
        expect(result.kind).toBe('blocked');
        if (result.kind === 'blocked') {
          expect(result.reason).toBe('infeasible_dependency');
          expect(result.detail).toContain('foundation');
        }
      }
    });
  });

  describe('wall with foundation → accepted', () => {
    it('passes feasibility when foundation is present and ordered', () => {
      const modules = [
        makeModule('foundation', 'prep_site'),
        makeModule('wall_north', 'apply_module', ['foundation'], [
          { supportModuleId: 'foundation' },
        ]),
      ];

      const steps = [
        makeStep('foundation', 'prep_site'),
        makeStep('wall_north', 'apply_module'),
      ];

      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');

      if (dagResult.kind === 'ok') {
        const depConstraints = extractDependencyConstraints(modules);
        const supportConstraints = extractSupportConstraints(modules);
        const allConstraints = [...depConstraints, ...supportConstraints];

        const result = checkFeasibility(dagResult.value, allConstraints);
        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') {
          expect(result.value.feasible).toBe(true);
        }
      }
    });
  });

  describe('support edge in DAG and linearized order', () => {
    it('foundation precedes wall in linearized order', () => {
      const modules = [
        makeModule('foundation', 'prep_site'),
        makeModule('wall_north', 'apply_module', ['foundation'], [
          { supportModuleId: 'foundation' },
        ]),
      ];

      const steps = [
        makeStep('foundation', 'prep_site'),
        makeStep('wall_north', 'apply_module'),
      ];

      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');

      if (dagResult.kind === 'ok') {
        // DAG has a dependency edge
        expect(dagResult.value.edges.length).toBeGreaterThan(0);

        // Linearize
        const linResult = linearize(dagResult.value);
        expect(linResult.kind).toBe('ok');

        if (linResult.kind === 'ok') {
          const order = linResult.value.order.map(
            (n) => (n.data as BuildingSolveStep).moduleId,
          );
          const foundationIdx = order.indexOf('foundation');
          const wallIdx = order.indexOf('wall_north');

          expect(foundationIdx).toBeLessThan(wallIdx);
        }
      }
    });
  });

  describe('multi-level support chain', () => {
    it('foundation → wall → roof ordered correctly', () => {
      const modules = [
        makeModule('foundation', 'prep_site'),
        makeModule('wall', 'apply_module', ['foundation'], [
          { supportModuleId: 'foundation' },
        ]),
        makeModule('roof', 'apply_module', ['wall'], [
          { supportModuleId: 'wall' },
        ]),
      ];

      const steps = [
        makeStep('foundation', 'prep_site'),
        makeStep('wall', 'apply_module'),
        makeStep('roof', 'apply_module'),
      ];

      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');

      if (dagResult.kind === 'ok') {
        const depConstraints = extractDependencyConstraints(modules);
        const supportConstraints = extractSupportConstraints(modules);
        const allConstraints = [...depConstraints, ...supportConstraints];

        const feasibility = checkFeasibility(dagResult.value, allConstraints);
        expect(feasibility.kind).toBe('ok');

        const linResult = linearize(dagResult.value);
        expect(linResult.kind).toBe('ok');

        if (linResult.kind === 'ok') {
          const order = linResult.value.order.map(
            (n) => (n.data as BuildingSolveStep).moduleId,
          );
          expect(order).toEqual(['foundation', 'wall', 'roof']);
        }
      }
    });
  });
});

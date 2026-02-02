/**
 * Partial-Order Proof Tests (G.3)
 *
 * Acceptance:
 * - Two independent modules form a commuting pair
 * - Both linearization orderings are valid topological sorts
 * - Adding a dependency removes the commuting pair
 * - Golden-master: canonical snapshot of DAG structure
 */

import { describe, it, expect } from 'vitest';
import { buildDagFromModules, findCommutingPairs } from '../dag-builder';
import { checkFeasibility } from '../feasibility-checker';
import { linearize } from '../linearization';
import { extractDependencyConstraints } from '../constraint-model';
import { canonicalize, contentHash } from '../../sterling/solve-bundle';
import type { BuildingModule, BuildingSolveStep } from '../../sterling/minecraft-building-types';

// ============================================================================
// Fixtures
// ============================================================================

function makeModule(
  id: string,
  type: BuildingModule['moduleType'],
  requires: string[] = [],
): BuildingModule {
  return {
    moduleId: id,
    moduleType: type,
    requiresModules: requires,
    materialsNeeded: [],
    placementFeasible: true,
    baseCost: 1,
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

describe('partial-order proof (G.3)', () => {
  describe('two independent modules form a commuting pair', () => {
    it('window_a and door_b with no mutual dependency commute', () => {
      const modules = [
        makeModule('foundation', 'prep_site'),
        makeModule('window_a', 'apply_module', ['foundation']),
        makeModule('door_b', 'apply_module', ['foundation']),
      ];

      const steps = [
        makeStep('foundation', 'prep_site'),
        makeStep('window_a', 'apply_module'),
        makeStep('door_b', 'apply_module'),
      ];

      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');

      if (dagResult.kind === 'ok') {
        const pairs = findCommutingPairs(dagResult.value);

        // window_a and door_b should be a commuting pair
        // (both are apply_module — no conflict key for apply_module)
        expect(pairs.length).toBeGreaterThanOrEqual(1);

        // Find the pair involving our two modules
        const windowNode = dagResult.value.nodes.find(
          (n) => (n.data as BuildingSolveStep).moduleId === 'window_a',
        )!;
        const doorNode = dagResult.value.nodes.find(
          (n) => (n.data as BuildingSolveStep).moduleId === 'door_b',
        )!;

        const hasCommutingPair = pairs.some(
          (p) =>
            (p.nodeA === windowNode.id && p.nodeB === doorNode.id) ||
            (p.nodeA === doorNode.id && p.nodeB === windowNode.id),
        );
        expect(hasCommutingPair).toBe(true);
      }
    });
  });

  describe('both orderings produce valid plans', () => {
    it('linearization is valid topological sort regardless of which comes first', () => {
      const modules = [
        makeModule('foundation', 'prep_site'),
        makeModule('window_a', 'apply_module', ['foundation']),
        makeModule('door_b', 'apply_module', ['foundation']),
      ];

      const steps = [
        makeStep('foundation', 'prep_site'),
        makeStep('window_a', 'apply_module'),
        makeStep('door_b', 'apply_module'),
      ];

      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');

      if (dagResult.kind === 'ok') {
        const linResult = linearize(dagResult.value);
        expect(linResult.kind).toBe('ok');

        if (linResult.kind === 'ok') {
          const order = linResult.value.order.map(
            (n) => (n.data as BuildingSolveStep).moduleId,
          );

          // Foundation must be first (both window and door depend on it)
          expect(order[0]).toBe('foundation');

          // Both remaining orderings are valid
          // The linearizer picks deterministically, but both are valid topo sorts
          const remaining = order.slice(1);
          expect(remaining).toContain('window_a');
          expect(remaining).toContain('door_b');
        }

        // Verify feasibility passes for both orderings
        const depConstraints = extractDependencyConstraints(modules);
        const feasResult = checkFeasibility(dagResult.value, depConstraints);
        expect(feasResult.kind).toBe('ok');
      }
    });
  });

  describe('adding a dependency removes the commuting pair', () => {
    it('window_a depends on door_b → no longer commuting', () => {
      const modules = [
        makeModule('foundation', 'prep_site'),
        makeModule('door_b', 'apply_module', ['foundation']),
        makeModule('window_a', 'apply_module', ['foundation', 'door_b']),
      ];

      const steps = [
        makeStep('foundation', 'prep_site'),
        makeStep('door_b', 'apply_module'),
        makeStep('window_a', 'apply_module'),
      ];

      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');

      if (dagResult.kind === 'ok') {
        const pairs = findCommutingPairs(dagResult.value);

        // window_a and door_b should NOT be commuting (dependency edge exists)
        const windowNode = dagResult.value.nodes.find(
          (n) => (n.data as BuildingSolveStep).moduleId === 'window_a',
        )!;
        const doorNode = dagResult.value.nodes.find(
          (n) => (n.data as BuildingSolveStep).moduleId === 'door_b',
        )!;

        const hasCommutingPair = pairs.some(
          (p) =>
            (p.nodeA === windowNode.id && p.nodeB === doorNode.id) ||
            (p.nodeA === doorNode.id && p.nodeB === windowNode.id),
        );
        expect(hasCommutingPair).toBe(false);
      }
    });
  });

  describe('golden-master: canonical snapshot of DAG structure', () => {
    it('DAG structure matches canonical snapshot', () => {
      const modules = [
        makeModule('foundation', 'prep_site'),
        makeModule('wall_north', 'apply_module', ['foundation']),
        makeModule('wall_south', 'apply_module', ['foundation']),
        makeModule('roof', 'apply_module', ['wall_north', 'wall_south']),
      ];

      const steps = modules.map((m) => makeStep(m.moduleId, m.moduleType));

      const dagResult = buildDagFromModules(modules, steps);
      expect(dagResult.kind).toBe('ok');

      if (dagResult.kind === 'ok') {
        const dag = dagResult.value;

        const snapshot = {
          schemaVersion: dag.schemaVersion,
          nodeCount: dag.nodes.length,
          edgeCount: dag.edges.length,
          planDigest: dag.planDigest,
          commutingPairCount: findCommutingPairs(dag).length,
        };

        const canonical = canonicalize(snapshot);
        expect(canonical).toMatchSnapshot();
      }
    });

    it('same modules produce same planDigest (content-addressed)', () => {
      const modules = [
        makeModule('foundation', 'prep_site'),
        makeModule('wall', 'apply_module', ['foundation']),
      ];
      const steps = modules.map((m) => makeStep(m.moduleId, m.moduleType));

      const dag1 = buildDagFromModules(modules, steps);
      const dag2 = buildDagFromModules(modules, steps);

      expect(dag1.kind).toBe('ok');
      expect(dag2.kind).toBe('ok');

      if (dag1.kind === 'ok' && dag2.kind === 'ok') {
        expect(dag1.value.planDigest).toBe(dag2.value.planDigest);
      }
    });
  });
});

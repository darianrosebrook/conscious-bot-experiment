/**
 * Rig E Certification Tests — Macro Planner
 *
 * Shortest path with learned costs
 * MAX_MACRO_DEPTH → blocked:bound_exceeded
 * Deterministic edge ordering (digest stable across calls)
 * Requirement→context: unknown mapping → blocked:ontology_gap
 * Ontology coverage metric
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  MacroPlanner,
  buildDefaultMinecraftGraph,
} from '../macro-planner';
import { MAX_MACRO_DEPTH } from '../macro-state';

// ============================================================================
// Tests
// ============================================================================

describe('Macro Planner — Rig E Certification', () => {
  describe('Shortest path with learned costs', () => {
    it('finds shortest path from idle to shelter_built', () => {
      const planner = buildDefaultMinecraftGraph();
      const result = planner.planMacroPath('idle', 'shelter_built', 'goal-1');

      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      expect(result.value.edges.length).toBeGreaterThan(0);
      expect(result.value.start).toBe('idle');
      expect(result.value.goal).toBe('shelter_built');
      expect(result.value.totalCost).toBeGreaterThan(0);
    });

    it('finds path from at_base to has_stone', () => {
      const planner = buildDefaultMinecraftGraph();
      const result = planner.planMacroPath('at_base', 'has_stone', 'goal-1');

      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      expect(result.value.edges.length).toBe(2);
      // at_base → at_mine → has_stone
      expect(result.value.edges[0].from).toBe('at_base');
      expect(result.value.edges[0].to).toBe('at_mine');
      expect(result.value.edges[1].from).toBe('at_mine');
      expect(result.value.edges[1].to).toBe('has_stone');
    });

    it('returns empty edges when start === goal', () => {
      const planner = buildDefaultMinecraftGraph();
      const result = planner.planMacroPath('at_base', 'at_base', 'goal-1');

      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      expect(result.value.edges).toHaveLength(0);
      expect(result.value.totalCost).toBe(0);
    });

    it('uses learned costs for routing', () => {
      const planner = buildDefaultMinecraftGraph();

      // Get the edge from at_base to at_mine and increase its learned cost
      const graph = planner.getGraph();
      const baseToMineEdge = graph.edges.find(
        (e) => e.from === 'at_base' && e.to === 'at_mine'
      );
      expect(baseToMineEdge).toBeDefined();

      // Increase cost significantly
      (baseToMineEdge as any).learnedCost = 100;

      // Path should still exist but use higher cost
      const result = planner.planMacroPath('at_base', 'has_stone', 'goal-1');
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      expect(result.value.totalCost).toBeGreaterThanOrEqual(100);
    });
  });

  describe('MAX_MACRO_DEPTH → blocked:bound_exceeded', () => {
    it('rejects paths that exceed MAX_MACRO_DEPTH', () => {
      const planner = new MacroPlanner();

      // Create a very long chain
      const chainLength = MAX_MACRO_DEPTH + 5;
      for (let i = 0; i <= chainLength; i++) {
        planner.registerContext({
          id: `node_${i}`,
          description: `Node ${i}`,
          abstract: true,
        });
      }
      for (let i = 0; i < chainLength; i++) {
        planner.registerEdge(`node_${i}`, `node_${i + 1}`, 1.0);
      }

      const result = planner.planMacroPath(
        'node_0',
        `node_${chainLength}`,
        'goal-1'
      );

      expect(result.kind).toBe('blocked');
      if (result.kind !== 'blocked') return;
      expect(result.reason).toBe('bound_exceeded');
      expect(result.detail).toContain('MAX_MACRO_DEPTH');
    });
  });

  describe('Deterministic edge ordering', () => {
    it('same graph → same plan digest across calls', () => {
      const planner = buildDefaultMinecraftGraph();

      const r1 = planner.planMacroPath('at_base', 'has_stone', 'goal-1');
      const r2 = planner.planMacroPath('at_base', 'has_stone', 'goal-1');

      expect(r1.kind).toBe('ok');
      expect(r2.kind).toBe('ok');
      if (r1.kind !== 'ok' || r2.kind !== 'ok') return;

      expect(r1.value.planDigest).toBe(r2.value.planDigest);
    });
  });

  describe('Requirement→context mapping', () => {
    it('maps craft requirement to known contexts', () => {
      const planner = buildDefaultMinecraftGraph();
      const result = planner.contextFromRequirement('craft');

      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;
      expect(result.value.start).toBe('at_base');
      expect(result.value.goal).toBe('has_tools');
    });

    it('unknown mapping → blocked:ontology_gap', () => {
      const planner = buildDefaultMinecraftGraph();
      const result = planner.contextFromRequirement('teleport_to_moon');

      expect(result.kind).toBe('blocked');
      if (result.kind !== 'blocked') return;
      expect(result.reason).toBe('ontology_gap');
      expect(result.detail).toContain('teleport_to_moon');
    });

    it('maps all known requirement kinds', () => {
      const planner = buildDefaultMinecraftGraph();
      const knownKinds = ['craft', 'mine', 'collect', 'build', 'tool_progression'];

      for (const kind of knownKinds) {
        const result = planner.contextFromRequirement(kind);
        expect(result.kind).toBe('ok');
      }
    });
  });

  describe('No path → blocked:no_macro_path', () => {
    it('returns no_macro_path when goal is unreachable', () => {
      const planner = new MacroPlanner();
      planner.registerContext({ id: 'A', description: 'A', abstract: true });
      planner.registerContext({ id: 'B', description: 'B', abstract: true });
      // No edge from A to B

      const result = planner.planMacroPath('A', 'B', 'goal-1');
      expect(result.kind).toBe('blocked');
      if (result.kind !== 'blocked') return;
      expect(result.reason).toBe('no_macro_path');
    });
  });

  describe('Edge registration', () => {
    it('validates endpoints against registry', () => {
      const planner = new MacroPlanner();
      planner.registerContext({ id: 'A', description: 'A', abstract: true });

      const result = planner.registerEdge('A', 'B_not_registered', 1.0);
      expect(result.kind).toBe('blocked');
      if (result.kind === 'blocked') {
        expect(result.reason).toBe('unknown_context');
      }
    });

    it('is idempotent for duplicate edges', () => {
      const planner = new MacroPlanner();
      planner.registerContext({ id: 'A', description: 'A', abstract: true });
      planner.registerContext({ id: 'B', description: 'B', abstract: true });

      const r1 = planner.registerEdge('A', 'B', 1.0);
      const r2 = planner.registerEdge('A', 'B', 1.0);

      expect(r1.kind).toBe('ok');
      expect(r2.kind).toBe('ok');
      if (r1.kind === 'ok' && r2.kind === 'ok') {
        expect(r1.value.id).toBe(r2.value.id);
      }
    });
  });

  describe('Unknown context in planMacroPath', () => {
    it('rejects unknown start context', () => {
      const planner = buildDefaultMinecraftGraph();
      const result = planner.planMacroPath('unknown_start', 'at_base', 'g-1');

      expect(result.kind).toBe('blocked');
      if (result.kind === 'blocked') {
        expect(result.reason).toBe('unknown_context');
      }
    });

    it('rejects unknown goal context', () => {
      const planner = buildDefaultMinecraftGraph();
      const result = planner.planMacroPath('at_base', 'unknown_goal', 'g-1');

      expect(result.kind).toBe('blocked');
      if (result.kind === 'blocked') {
        expect(result.reason).toBe('unknown_context');
      }
    });
  });

  describe('Default Minecraft graph', () => {
    it('has expected number of contexts', () => {
      const planner = buildDefaultMinecraftGraph();
      expect(planner.registry.size).toBe(11);
    });

    it('has expected edges', () => {
      const planner = buildDefaultMinecraftGraph();
      const graph = planner.getGraph();
      expect(graph.edges.length).toBe(16);
    });
  });
});

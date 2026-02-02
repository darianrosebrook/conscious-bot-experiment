/**
 * World Graph Builder Tests (E.1)
 *
 * Acceptance:
 * - Builds graph from biome region input
 * - Edges from adjacency declarations
 * - Resource zones register requirement mappings
 * - Graph frozen after construction
 */

import { describe, it, expect } from 'vitest';
import { buildWorldGraph } from '../world-graph-builder';
import type { MinecraftWorldGraphInput } from '../world-graph-builder';

const TEST_INPUT: MinecraftWorldGraphInput = {
  biomeRegions: [
    {
      id: 'plains',
      description: 'Plains biome',
      adjacency: [
        { targetId: 'forest', cost: 2.0 },
        { targetId: 'cave_entrance', cost: 3.0 },
      ],
    },
    {
      id: 'forest',
      description: 'Forest biome',
      adjacency: [
        { targetId: 'plains', cost: 2.0 },
      ],
    },
  ],
  structureLocations: [
    {
      id: 'village',
      description: 'Plains village',
      adjacency: [
        { targetId: 'plains', cost: 1.0 },
      ],
    },
  ],
  resourceZones: [
    {
      id: 'cave_entrance',
      description: 'Cave entrance for mining',
      requirementKinds: ['mine'],
      requirementStart: 'plains',
    },
    {
      id: 'forest',
      description: 'Forest for wood collection',
      requirementKinds: ['collect'],
      requirementStart: 'plains',
    },
  ],
};

describe('buildWorldGraph (E.1)', () => {
  it('builds graph from biome region input', () => {
    const planner = buildWorldGraph(TEST_INPUT);
    const graph = planner.getGraph();

    // All contexts registered
    expect(graph.registry.has('plains')).toBe(true);
    expect(graph.registry.has('forest')).toBe(true);
    expect(graph.registry.has('cave_entrance')).toBe(true);
    expect(graph.registry.has('village')).toBe(true);
  });

  it('edges from adjacency declarations', () => {
    const planner = buildWorldGraph(TEST_INPUT);
    const graph = planner.getGraph();

    // Biome edges
    expect(graph.edges.length).toBeGreaterThanOrEqual(3);
    // plains → forest, plains → cave_entrance, forest → plains, village → plains
    const edgePairs = graph.edges.map((e) => `${e.from}→${e.to}`);
    expect(edgePairs).toContain('plains→forest');
    expect(edgePairs).toContain('plains→cave_entrance');
    expect(edgePairs).toContain('forest→plains');
    expect(edgePairs).toContain('village→plains');
  });

  it('resource zones register requirement mappings', () => {
    const planner = buildWorldGraph(TEST_INPUT);

    // Mine requirement maps to plains → cave_entrance
    const mineMapping = planner.contextFromRequirement('mine');
    expect(mineMapping.kind).toBe('ok');
    if (mineMapping.kind === 'ok') {
      expect(mineMapping.value.start).toBe('plains');
      expect(mineMapping.value.goal).toBe('cave_entrance');
    }

    // Collect requirement maps to plains → forest
    const collectMapping = planner.contextFromRequirement('collect');
    expect(collectMapping.kind).toBe('ok');
    if (collectMapping.kind === 'ok') {
      expect(collectMapping.value.start).toBe('plains');
      expect(collectMapping.value.goal).toBe('forest');
    }
  });

  it('graph frozen after construction', () => {
    const planner = buildWorldGraph(TEST_INPUT);

    // Attempting to register a new context after freeze should throw
    expect(() => {
      planner.registerContext({
        id: 'new_context',
        description: 'Should fail',
        abstract: true,
      });
    }).toThrow('frozen');
  });

  it('can plan paths through the built graph', () => {
    const planner = buildWorldGraph(TEST_INPUT);

    const planResult = planner.planMacroPath('plains', 'forest', 'goal-1');
    expect(planResult.kind).toBe('ok');
    if (planResult.kind === 'ok') {
      expect(planResult.value.edges.length).toBeGreaterThan(0);
      expect(planResult.value.start).toBe('plains');
      expect(planResult.value.goal).toBe('forest');
    }
  });

  it('same input produces deterministic graph', () => {
    const planner1 = buildWorldGraph(TEST_INPUT);
    const planner2 = buildWorldGraph(TEST_INPUT);

    const plan1 = planner1.planMacroPath('plains', 'cave_entrance', 'test');
    const plan2 = planner2.planMacroPath('plains', 'cave_entrance', 'test');

    expect(plan1.kind).toBe('ok');
    expect(plan2.kind).toBe('ok');
    if (plan1.kind === 'ok' && plan2.kind === 'ok') {
      expect(plan1.value.planDigest).toBe(plan2.value.planDigest);
    }
  });
});

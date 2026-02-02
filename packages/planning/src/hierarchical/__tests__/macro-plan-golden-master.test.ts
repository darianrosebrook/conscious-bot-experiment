/**
 * Macro Plan Golden-Master (E.4)
 *
 * R3: Macro plan for fixed graph + goal matches canonical snapshot.
 * R3: Identical inputs → byte-equivalent plans.
 * R4: Plan digest content-addressed and deterministic.
 * Decomposed steps match canonical snapshot.
 */

import { describe, it, expect } from 'vitest';
import { buildWorldGraph } from '../world-graph-builder';
import type { MinecraftWorldGraphInput } from '../world-graph-builder';
import { decomposeEdge } from '../edge-decomposer';
import type { BotState } from '../edge-decomposer';
import { canonicalize } from '../../sterling/solve-bundle';

// Fixed input for deterministic testing
const FIXED_INPUT: MinecraftWorldGraphInput = {
  biomeRegions: [
    {
      id: 'spawn_area',
      description: 'Spawn area',
      adjacency: [
        { targetId: 'nearby_forest', cost: 2.0 },
        { targetId: 'mountain_pass', cost: 4.0 },
      ],
    },
    {
      id: 'nearby_forest',
      description: 'Nearby forest',
      adjacency: [
        { targetId: 'spawn_area', cost: 2.0 },
      ],
    },
    {
      id: 'mountain_pass',
      description: 'Mountain pass',
      adjacency: [
        { targetId: 'spawn_area', cost: 4.0 },
        { targetId: 'deep_cave', cost: 3.0 },
      ],
    },
  ],
  structureLocations: [],
  resourceZones: [
    {
      id: 'deep_cave',
      description: 'Deep cave for iron mining',
      requirementKinds: ['mine'],
      requirementStart: 'spawn_area',
    },
  ],
};

const BOT_STATE: BotState = {
  currentContext: 'spawn_area',
  inventory: {},
  tools: [],
};

describe('macro plan golden-master (E.4)', () => {
  it('macro plan for fixed graph + goal matches canonical snapshot', () => {
    const planner = buildWorldGraph(FIXED_INPUT);
    const result = planner.planMacroPath('spawn_area', 'deep_cave', 'golden-goal');

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const planSnapshot = {
        start: result.value.start,
        goal: result.value.goal,
        goalId: result.value.goalId,
        edgeSequence: result.value.edges.map((e) => ({
          from: e.from,
          to: e.to,
          baseCost: e.baseCost,
        })),
        totalCost: result.value.totalCost,
        planDigest: result.value.planDigest,
      };

      const canonical = canonicalize(planSnapshot);
      expect(canonical).toMatchSnapshot();
    }
  });

  it('identical inputs → byte-equivalent plans', () => {
    const planner1 = buildWorldGraph(FIXED_INPUT);
    const planner2 = buildWorldGraph(FIXED_INPUT);

    const plan1 = planner1.planMacroPath('spawn_area', 'deep_cave', 'equiv-1');
    const plan2 = planner2.planMacroPath('spawn_area', 'deep_cave', 'equiv-1');

    expect(plan1.kind).toBe('ok');
    expect(plan2.kind).toBe('ok');

    if (plan1.kind === 'ok' && plan2.kind === 'ok') {
      expect(plan1.value.planDigest).toBe(plan2.value.planDigest);
      expect(plan1.value.totalCost).toBe(plan2.value.totalCost);
      expect(plan1.value.edges.length).toBe(plan2.value.edges.length);
    }
  });

  it('plan digest is content-addressed and deterministic', () => {
    const planner = buildWorldGraph(FIXED_INPUT);

    const plan1 = planner.planMacroPath('spawn_area', 'deep_cave', 'det-1');
    const plan2 = planner.planMacroPath('spawn_area', 'deep_cave', 'det-1');

    expect(plan1.kind).toBe('ok');
    expect(plan2.kind).toBe('ok');

    if (plan1.kind === 'ok' && plan2.kind === 'ok') {
      expect(plan1.value.planDigest).toBe(plan2.value.planDigest);
      expect(plan1.value.planDigest).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('different goalId → different planDigest', () => {
    const planner = buildWorldGraph(FIXED_INPUT);

    const plan1 = planner.planMacroPath('spawn_area', 'deep_cave', 'goal-a');
    const plan2 = planner.planMacroPath('spawn_area', 'deep_cave', 'goal-b');

    expect(plan1.kind).toBe('ok');
    expect(plan2.kind).toBe('ok');

    if (plan1.kind === 'ok' && plan2.kind === 'ok') {
      expect(plan1.value.planDigest).not.toBe(plan2.value.planDigest);
    }
  });

  it('decomposed steps match canonical snapshot', () => {
    const planner = buildWorldGraph(FIXED_INPUT);
    const result = planner.planMacroPath(
      'spawn_area',
      'mountain_pass',
      'decompose-goal',
    );

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const allSteps = [];
      for (const edge of result.value.edges) {
        const decomposition = decomposeEdge(edge, BOT_STATE);
        if (decomposition.kind === 'ok') {
          allSteps.push(
            ...decomposition.value.map((s) => ({
              action: s.action,
              leaf: s.leaf,
            })),
          );
        }
      }

      const stepsSnapshot = canonicalize(allSteps);
      expect(stepsSnapshot).toMatchSnapshot();
    }
  });
});

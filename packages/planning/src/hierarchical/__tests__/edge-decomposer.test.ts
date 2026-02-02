/**
 * Edge Decomposer Tests (E.2)
 *
 * Acceptance:
 * - at_base→at_mine → navigate + arrive steps
 * - at_mine→has_stone → equip + dig + collect steps
 * - Unknown edge → blocked with decomposition_gap
 * - Decomposed steps have valid leaf labels
 */

import { describe, it, expect } from 'vitest';
import { decomposeEdge } from '../edge-decomposer';
import type { BotState } from '../edge-decomposer';
import type { MacroEdge } from '../macro-state';
import { computeEdgeId } from '../macro-state';

function makeEdge(from: string, to: string, baseCost: number = 1.0): MacroEdge {
  return {
    id: computeEdgeId(from, to),
    from,
    to,
    baseCost,
    learnedCost: baseCost,
    consecutiveFailures: 0,
  };
}

const defaultBotState: BotState = {
  currentContext: 'at_base',
  inventory: {},
  tools: [],
};

describe('decomposeEdge (E.2)', () => {
  it('at_base→at_mine decomposes to navigate + arrive steps', () => {
    const edge = makeEdge('at_base', 'at_mine', 3.0);
    const result = decomposeEdge(edge, defaultBotState);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.length).toBe(2);
      expect(result.value[0].action).toBe('navigate');
      expect(result.value[0].leaf).toBe('navigate_to');
      expect(result.value[1].action).toBe('arrive');
      expect(result.value[1].leaf).toBe('arrive_at');
    }
  });

  it('at_mine→has_stone decomposes to equip + dig + collect steps', () => {
    const edge = makeEdge('at_mine', 'has_stone', 4.0);
    const result = decomposeEdge(edge, defaultBotState);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.length).toBe(3);
      expect(result.value[0].action).toBe('equip_tool');
      expect(result.value[0].leaf).toBe('equip');
      expect(result.value[1].action).toBe('dig_stone');
      expect(result.value[1].leaf).toBe('dig_block');
      expect(result.value[2].action).toBe('collect_drops');
      expect(result.value[2].leaf).toBe('collect_items');
    }
  });

  it('at_forest→has_wood decomposes to chop + collect', () => {
    const edge = makeEdge('at_forest', 'has_wood', 2.0);
    const result = decomposeEdge(edge, defaultBotState);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.length).toBe(2);
      expect(result.value[0].leaf).toBe('dig_block');
      expect(result.value[1].leaf).toBe('collect_items');
    }
  });

  it('unknown edge → blocked with decomposition_gap', () => {
    const edge = makeEdge('unknown_place', 'another_unknown', 1.0);
    const result = decomposeEdge(edge, defaultBotState);

    expect(result.kind).toBe('blocked');
    if (result.kind === 'blocked') {
      expect(result.detail).toContain('decomposition_gap');
    }
  });

  it('decomposed steps have valid leaf labels (non-empty strings)', () => {
    const edges = [
      makeEdge('at_base', 'at_mine'),
      makeEdge('at_mine', 'has_stone'),
      makeEdge('at_forest', 'has_wood'),
      makeEdge('idle', 'at_base'),
    ];

    for (const edge of edges) {
      const result = decomposeEdge(edge, defaultBotState);
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        for (const step of result.value) {
          expect(typeof step.leaf).toBe('string');
          expect(step.leaf.length).toBeGreaterThan(0);
          expect(typeof step.action).toBe('string');
          expect(step.action.length).toBeGreaterThan(0);
          expect(step.estimatedDurationMs).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('navigation edges use learnedCost for duration estimation', () => {
    const edge = makeEdge('at_base', 'at_mine', 3.0);
    edge.learnedCost = 5.0; // Updated by feedback

    const result = decomposeEdge(edge, defaultBotState);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      // Navigate step uses learnedCost * 1000
      expect(result.value[0].estimatedDurationMs).toBe(5000);
    }
  });
});

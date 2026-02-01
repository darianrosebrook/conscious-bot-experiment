/**
 * Duration Model Tests — Action-to-Duration Mapping
 */

import { describe, it, expect } from 'vitest';
import {
  OPERATOR_DURATIONS,
  findDuration,
  computeDurationTicks,
  annotateRuleWithDuration,
} from '../duration-model';

describe('OPERATOR_DURATIONS', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(OPERATOR_DURATIONS)).toBe(true);
  });

  it('contains expected action types', () => {
    const types = OPERATOR_DURATIONS.map((d) => d.actionType);
    expect(types).toContain('smelt');
    expect(types).toContain('cook');
    expect(types).toContain('craft');
    expect(types).toContain('mine');
    expect(types).toContain('place');
  });
});

describe('findDuration', () => {
  it('matches by action prefix', () => {
    const dur = findDuration('smelt:iron_ore');
    expect(dur).toBeDefined();
    expect(dur!.baseDurationTicks).toBe(200);
    expect(dur!.requiresSlotType).toBe('furnace');
  });

  it('matches by actionType fallback', () => {
    const dur = findDuration('custom_action', 'smelt');
    expect(dur).toBeDefined();
    expect(dur!.baseDurationTicks).toBe(200);
  });

  it('returns undefined for unknown actions', () => {
    expect(findDuration('teleport:home')).toBeUndefined();
  });
});

describe('computeDurationTicks', () => {
  it('returns base duration for single item', () => {
    expect(computeDurationTicks('smelt:iron_ore', 1)).toBe(200);
  });

  it('computes batch duration correctly', () => {
    // base + perItem * (count - 1) = 200 + 200 * 3 = 800
    expect(computeDurationTicks('smelt:iron_ore', 4)).toBe(800);
  });

  it('returns 0 for instant actions', () => {
    expect(computeDurationTicks('craft:oak_planks', 1)).toBe(0);
    expect(computeDurationTicks('craft:oak_planks', 64)).toBe(0);
  });

  it('returns 0 for unknown actions', () => {
    expect(computeDurationTicks('unknown:thing', 1)).toBe(0);
  });

  it('mine duration does not scale with count', () => {
    expect(computeDurationTicks('mine:stone', 1)).toBe(40);
    expect(computeDurationTicks('mine:stone', 10)).toBe(40); // perItem = 0
  });
});

describe('annotateRuleWithDuration', () => {
  it('annotates smelt with duration and slot type', () => {
    const result = annotateRuleWithDuration('smelt:iron_ore', 'smelt');
    expect(result.durationTicks).toBe(200);
    expect(result.requiresSlotType).toBe('furnace');
  });

  it('annotates craft as instant with no slot', () => {
    const result = annotateRuleWithDuration('craft:oak_planks', 'craft');
    expect(result.durationTicks).toBe(0);
    expect(result.requiresSlotType).toBeUndefined();
  });

  it('pure: same inputs always produce same output', () => {
    const results = Array.from({ length: 20 }, () =>
      annotateRuleWithDuration('smelt:gold_ore', 'smelt', 8),
    );
    const first = JSON.stringify(results[0]);
    expect(results.every((r) => JSON.stringify(r) === first)).toBe(true);
  });
});

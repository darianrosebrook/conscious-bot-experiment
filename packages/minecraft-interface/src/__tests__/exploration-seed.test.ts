/**
 * Tests for seeded exploration target selection.
 *
 * Proves that exploration fallback decisions are:
 * (a) deterministic given the same immutable trace facts
 * (b) uniformly distributed across directions
 * (c) sensitive to each seed input component
 */

import { describe, it, expect } from 'vitest';
import { explorationSeedHash } from '../action-translator';

describe('explorationSeedHash', () => {
  it('returns a value in [0, 1)', () => {
    const result = explorationSeedHash('test-input');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(1);
  });

  it('is deterministic: same input produces same output', () => {
    const input = 'task-123:exploration_target:-808:-295:10';
    const a = explorationSeedHash(input);
    const b = explorationSeedHash(input);
    expect(a).toBe(b);
  });

  it('is sensitive to task scope (different tasks → different angles)', () => {
    const a = explorationSeedHash('task-AAA:exploration_target:-808:-295:10');
    const b = explorationSeedHash('task-BBB:exploration_target:-808:-295:10');
    expect(a).not.toBe(b);
  });

  it('is sensitive to bot position (different positions → different angles)', () => {
    const a = explorationSeedHash('task-123:exploration_target:-808:-295:10');
    const b = explorationSeedHash('task-123:exploration_target:-900:-400:10');
    expect(a).not.toBe(b);
  });

  it('is sensitive to distance', () => {
    const a = explorationSeedHash('task-123:exploration_target:-808:-295:10');
    const b = explorationSeedHash('task-123:exploration_target:-808:-295:20');
    expect(a).not.toBe(b);
  });

  it('produces uniform distribution across many inputs', () => {
    // Generate 1000 seeds and check they span [0, 1) reasonably
    const N = 1000;
    const values: number[] = [];
    for (let i = 0; i < N; i++) {
      values.push(explorationSeedHash(`task-${i}:exploration_target:0:0:10`));
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / N;
    // Should span most of [0, 1)
    expect(min).toBeLessThan(0.05);
    expect(max).toBeGreaterThan(0.95);
    // Mean should be near 0.5
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
  });

  it('given fixed seed and position, computed exploration pos is stable', () => {
    const seedInput = 'task-explore-001:exploration_target:-808:-295:10';
    const seed = explorationSeedHash(seedInput);
    const angle = seed * 2 * Math.PI;
    const distance = 10;
    const botX = -808.5;
    const botZ = -295.5;

    const targetX = Math.round(botX + Math.cos(angle) * distance);
    const targetZ = Math.round(botZ + Math.sin(angle) * distance);

    // Recompute: must be identical
    const seed2 = explorationSeedHash(seedInput);
    const angle2 = seed2 * 2 * Math.PI;
    const targetX2 = Math.round(botX + Math.cos(angle2) * distance);
    const targetZ2 = Math.round(botZ + Math.sin(angle2) * distance);

    expect(targetX).toBe(targetX2);
    expect(targetZ).toBe(targetZ2);

    // Snapshot: lock the exact values so refactors don't silently change behavior
    expect(seed).toMatchInlineSnapshot(`0.23415827425196767`);
    const expectedAngle = 0.23415827425196767 * 2 * Math.PI;
    const expectedX = Math.round(-808.5 + Math.cos(expectedAngle) * 10);
    const expectedZ = Math.round(-295.5 + Math.sin(expectedAngle) * 10);
    expect(targetX).toBe(expectedX);
    expect(targetZ).toBe(expectedZ);
  });
});

describe('exploration loop-avoidance (retry rotation)', () => {
  it('retry suffix produces a different seed than the base', () => {
    const base = explorationSeedHash('scope:exploration_target:0:0:10');
    const retry1 = explorationSeedHash('scope:exploration_target:0:0:10:retry:1');
    const retry2 = explorationSeedHash('scope:exploration_target:0:0:10:retry:2');
    expect(base).not.toBe(retry1);
    expect(base).not.toBe(retry2);
    expect(retry1).not.toBe(retry2);
  });

  it('retry seeds produce different target positions', () => {
    const distance = 10;
    const botX = 0;
    const botZ = 0;
    const positions: Array<{ x: number; z: number }> = [];
    for (let i = 0; i <= 4; i++) {
      const suffix = i === 0 ? '' : `:retry:${i}`;
      const seed = explorationSeedHash(`scope:exploration_target:0:0:10${suffix}`);
      const angle = seed * 2 * Math.PI;
      positions.push({
        x: Math.round(botX + Math.cos(angle) * distance),
        z: Math.round(botZ + Math.sin(angle) * distance),
      });
    }
    // At least 3 of 5 positions should be distinct (very likely all 5)
    const unique = new Set(positions.map((p) => `${p.x},${p.z}`));
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });

  it('retry rotation is still deterministic', () => {
    const seed1a = explorationSeedHash('task:target:100:200:10:retry:1');
    const seed1b = explorationSeedHash('task:target:100:200:10:retry:1');
    expect(seed1a).toBe(seed1b);
  });
});

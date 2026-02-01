/**
 * Tests for requirement resolution and equivalence (deduplication).
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  resolveRequirement,
  requirementsEquivalent,
  type TaskRequirement,
} from '../requirements';

describe('requirementsEquivalent', () => {
  it('returns true for same collect requirement (same patterns, order-independent)', () => {
    const a: TaskRequirement = {
      kind: 'collect',
      patterns: ['oak_log', 'birch_log'],
      quantity: 8,
    };
    const b: TaskRequirement = {
      kind: 'collect',
      patterns: ['birch_log', 'oak_log'],
      quantity: 10,
    };
    expect(requirementsEquivalent(a, b)).toBe(true);
  });

  it('returns false for collect with different patterns', () => {
    const a: TaskRequirement = {
      kind: 'collect',
      patterns: ['oak_log'],
      quantity: 8,
    };
    const b: TaskRequirement = {
      kind: 'collect',
      patterns: ['iron_ore'],
      quantity: 8,
    };
    expect(requirementsEquivalent(a, b)).toBe(false);
  });

  it('returns true for same craft requirement', () => {
    const a: TaskRequirement = {
      kind: 'craft',
      outputPattern: 'crafting_table',
      quantity: 1,
    };
    const b: TaskRequirement = {
      kind: 'craft',
      outputPattern: 'crafting_table',
      quantity: 2,
    };
    expect(requirementsEquivalent(a, b)).toBe(true);
  });

  it('returns false for craft with different outputPattern', () => {
    const a: TaskRequirement = {
      kind: 'craft',
      outputPattern: 'stick',
      quantity: 1,
    };
    const b: TaskRequirement = {
      kind: 'craft',
      outputPattern: 'oak_planks',
      quantity: 1,
    };
    expect(requirementsEquivalent(a, b)).toBe(false);
  });

  it('returns false when kinds differ', () => {
    const a: TaskRequirement = {
      kind: 'collect',
      patterns: ['oak_log'],
      quantity: 8,
    };
    const b: TaskRequirement = {
      kind: 'mine',
      patterns: ['iron_ore'],
      quantity: 3,
    };
    expect(requirementsEquivalent(a, b)).toBe(false);
  });

  it('returns false for null/undefined', () => {
    const a: TaskRequirement = {
      kind: 'collect',
      patterns: ['oak_log'],
      quantity: 8,
    };
    expect(requirementsEquivalent(a, null)).toBe(false);
    expect(requirementsEquivalent(null, a)).toBe(false);
    expect(requirementsEquivalent(undefined, a)).toBe(false);
  });
});

describe('resolveRequirement + requirementsEquivalent (deduplication scenario)', () => {
  it('resolves wood/gathering tasks to same collect requirement (permissive mode)', () => {
    // Regex fallback is only active in non-strict mode (Pivot 8).
    const task1 = {
      title: 'Find some wood for a crafting table (seq)',
      type: 'gathering',
    };
    const task2 = {
      title: 'i need to secure a shelter and gather basic resources',
      type: 'gathering',
    };
    const req1 = resolveRequirement(task1, { strict: false });
    const req2 = resolveRequirement(task2, { strict: false });
    expect(req1).not.toBeNull();
    expect(req2).not.toBeNull();
    expect(requirementsEquivalent(req1, req2)).toBe(true);
  });

  it('returns null in strict mode when no structured candidate present', () => {
    const task = {
      title: 'Find some wood for a crafting table',
      type: 'gathering',
    };
    const req = resolveRequirement(task, { strict: true });
    expect(req).toBeNull();
  });

  it('resolves structured candidate in strict mode', () => {
    const task = {
      title: 'Collect oak logs',
      type: 'gathering',
      parameters: {
        requirementCandidate: {
          kind: 'collect',
          outputPattern: 'oak_log',
          quantity: 8,
        },
      },
    };
    const req = resolveRequirement(task, { strict: true });
    expect(req).not.toBeNull();
    expect(req?.kind).toBe('collect');
  });
});

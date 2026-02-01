import { describe, it, expect } from 'vitest';
import type { InventoryItem } from '../modules/inventory-helpers';
import {
  resolveRequirement,
  computeProgressFromInventory,
  computeRequirementSnapshot,
} from '../modules/requirements';

// These tests exercise the regex fallback path, so they use strict: false.
// In production (strict: true), tasks must have a structured requirementCandidate.
const permissive = { strict: false as const };

describe('Iteration Seven - Requirement and Progress Logic', () => {
  const inv = (...names: Array<[string, number]>) =>
    names.map<InventoryItem>(([name, count], idx) => ({
      name,
      count,
      slot: idx,
    }));

  it('resolves gathering requirement with quantity from title', () => {
    const req = resolveRequirement({ type: 'gathering', title: 'Gather 5 wood logs' }, permissive);
    expect(req).toBeTruthy();
    expect(req && req.kind).toBe('collect');
    expect(req && (req as any).quantity).toBe(5);
  });

  it('progress for collect is proportional to items matching patterns', () => {
    const req = resolveRequirement({ type: 'gathering', title: 'Gather 4 wood logs' }, permissive);
    const invSnap = inv(['oak_log', 1], ['birch_log', 1]);
    const p = req ? computeProgressFromInventory(invSnap, req) : 0;
    expect(p).toBeCloseTo(0.5, 5);
  });

  it('crafting requirement returns complete when output present', () => {
    const req = resolveRequirement({ type: 'crafting', title: 'Craft Wooden Pickaxe' }, permissive);
    const invSnap = inv(['wooden_pickaxe', 1]);
    const p = req ? computeProgressFromInventory(invSnap, req) : 0;
    expect(p).toBe(1);
  });

  it('crafting requirement estimates progress via proxy materials', () => {
    const req = resolveRequirement({ type: 'crafting', title: 'Craft Wooden Pickaxe' }, permissive);
    const invSnap = inv(['oak_log', 2]);
    const p = req ? computeProgressFromInventory(invSnap, req) : 0;
    // Heuristic: 2 logs ~ 2/3 progress toward 3 logs baseline
    expect(p).toBeGreaterThan(0.6);
    expect(p).toBeLessThan(0.8);
  });

  it('requirement snapshot reflects have/needed', () => {
    const req = resolveRequirement({ type: 'gathering', title: 'Gather 3 wood logs' }, permissive);
    const snap = req ? computeRequirementSnapshot(inv(['oak_log', 2]), req) : null;
    expect(snap).toBeTruthy();
    expect(snap && (snap as any).have).toBe(2);
    expect(snap && (snap as any).needed).toBe(1);
  });
});

/**
 * Deadlock Prevention Tests — Slot Needs Derivation & Pre-Solve Check
 */

import { describe, it, expect } from 'vitest';
import { deriveSlotNeeds, checkDeadlockForRules, checkDeadlock } from '../deadlock-prevention';
import { P03ReferenceAdapter } from '../../sterling/primitives/p03/p03-reference-adapter';
import type { MinecraftCraftingRule } from '../../sterling/minecraft-crafting-types';
import type { P03TemporalStateV1 } from '../../sterling/primitives/p03/p03-capsule-types';

const adapter = new P03ReferenceAdapter(100, 8);

// ── Helpers ────────────────────────────────────────────────────────

function makeRule(overrides: Partial<MinecraftCraftingRule>): MinecraftCraftingRule {
  return {
    action: 'craft:test',
    actionType: 'craft',
    produces: [],
    consumes: [],
    requires: [],
    needsTable: false,
    needsFurnace: false,
    baseCost: 1,
    ...overrides,
  };
}

const idleState: P03TemporalStateV1 = {
  time: { currentBucket: 0, horizonBucket: 100, bucketSizeTicks: 100 },
  slots: [
    { id: 'furnace_0', type: 'furnace', readyAtBucket: 0 },
    { id: 'furnace_1', type: 'furnace', readyAtBucket: 0 },
  ],
};

const deadlockedState: P03TemporalStateV1 = {
  time: { currentBucket: 10, horizonBucket: 110, bucketSizeTicks: 100 },
  slots: [
    { id: 'furnace_0', type: 'furnace', readyAtBucket: 200 },
    { id: 'furnace_1', type: 'furnace', readyAtBucket: 250 },
  ],
};

// ── deriveSlotNeeds ────────────────────────────────────────────────

describe('deriveSlotNeeds', () => {
  it('derives furnace need from smelt rules', () => {
    const rules = [makeRule({ action: 'smelt:iron_ore', actionType: 'smelt' })];
    const needs = deriveSlotNeeds(rules);
    expect(needs).toEqual([{ type: 'furnace', count: 1 }]);
  });

  it('derives furnace need from needsFurnace flag (fail-closed)', () => {
    const rules = [makeRule({ action: 'custom:thing', actionType: 'craft', needsFurnace: true })];
    const needs = deriveSlotNeeds(rules);
    expect(needs).toEqual([{ type: 'furnace', count: 1 }]);
  });

  it('deduplicates slot types', () => {
    const rules = [
      makeRule({ action: 'smelt:iron_ore', actionType: 'smelt' }),
      makeRule({ action: 'smelt:gold_ore', actionType: 'smelt' }),
      makeRule({ action: 'cook:raw_beef', actionType: 'smelt', needsFurnace: true }),
    ];
    const needs = deriveSlotNeeds(rules);
    expect(needs).toEqual([{ type: 'furnace', count: 1 }]);
  });

  it('returns empty for craft-only rules', () => {
    const rules = [
      makeRule({ action: 'craft:oak_planks', actionType: 'craft' }),
      makeRule({ action: 'craft:stick', actionType: 'craft' }),
    ];
    const needs = deriveSlotNeeds(rules);
    expect(needs).toHaveLength(0);
  });

  it('returns deterministic sorted order', () => {
    const rules = [
      makeRule({ action: 'smoke:raw_beef', actionType: 'smoke' as any }),
      makeRule({ action: 'blast_smelt:raw_iron', actionType: 'blast_smelt' as any }),
      makeRule({ action: 'smelt:iron_ore', actionType: 'smelt' }),
    ];
    const needs = deriveSlotNeeds(rules);
    const types = needs.map((n) => n.type);
    // Sorted alphabetically
    expect(types).toEqual([...types].sort());
  });
});

// ── checkDeadlockForRules ──────────────────────────────────────────

describe('checkDeadlockForRules', () => {
  it('detects deadlock when furnace slots busy beyond horizon', () => {
    const rules = [makeRule({ action: 'smelt:iron_ore', actionType: 'smelt' })];
    const result = checkDeadlockForRules(adapter, rules, deadlockedState);
    expect(result.isDeadlock).toBe(true);
    expect(result.blockedSlotTypes).toContain('furnace');
  });

  it('no deadlock when furnace slots available', () => {
    const rules = [makeRule({ action: 'smelt:iron_ore', actionType: 'smelt' })];
    const result = checkDeadlockForRules(adapter, rules, idleState);
    expect(result.isDeadlock).toBe(false);
  });

  it('no deadlock for craft-only rules (no slot needs)', () => {
    const rules = [makeRule({ action: 'craft:oak_planks', actionType: 'craft' })];
    const result = checkDeadlockForRules(adapter, rules, deadlockedState);
    expect(result.isDeadlock).toBe(false);
  });
});

// ── checkDeadlock (direct) ─────────────────────────────────────────

describe('checkDeadlock', () => {
  it('delegates to adapter and returns result', () => {
    const result = checkDeadlock(
      adapter,
      [{ type: 'furnace', count: 1 }],
      deadlockedState,
    );
    expect(result.isDeadlock).toBe(true);
  });

  it('empty needs never deadlock', () => {
    const result = checkDeadlock(adapter, [], deadlockedState);
    expect(result.isDeadlock).toBe(false);
  });
});

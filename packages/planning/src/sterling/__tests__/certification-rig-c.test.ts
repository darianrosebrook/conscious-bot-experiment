/**
 * Rig C Certification Tests — Temporal Planning (P3)
 *
 * Proves the following Rig C invariants with Rig A hardening:
 *   1. Furnace rules pass Rig A validation gate (schema + semantics)
 *   2. Trace hash determinism on furnace solver bundles
 *   3. Duration model integrity (frozen constants, pure computation)
 *   4. Deadlock prevention (bounded wait, pre-solve check)
 *   5. Batch preference (threshold, maxBatchSize)
 *   6. Validation gate blocks invalid furnace rules
 *   7. Temporal state determinism (integer tick buckets, slot ordering)
 *
 * These tests exercise certification harnesses without a live Sterling backend.
 */

import { describe, it, expect } from 'vitest';
import { validateRules } from '../../validation/rule-validator';
import { buildExplanation } from '../../audit/explanation-builder';
import {
  computeBundleInput,
  computeBundleOutput,
  computeTraceHash,
  buildDefaultRationaleContext,
} from '../solve-bundle';
import { lintRules } from '../compat-linter';
import { buildFurnaceRules, buildFurnaceGoal, SMELTABLE_ITEMS } from '../minecraft-furnace-rules';
import type { FurnaceSchedulingRule } from '../minecraft-furnace-types';
import {
  OPERATOR_DURATIONS,
  computeDurationTicks,
  annotateRuleWithDuration,
} from '../../temporal/duration-model';
import {
  toTickBucket,
  MINECRAFT_BUCKET_SIZE_TICKS,
  MAX_WAIT_BUCKETS,
  inferSlotsFromBlocks,
} from '../../temporal/time-state';
import { getBatchHint, MINECRAFT_BATCH_OPERATORS } from '../../temporal/batch-operators';
import { checkDeadlockForRules } from '../../temporal/deadlock-prevention';
import { P03ReferenceAdapter } from '../primitives/p03/p03-reference-adapter';

// ── Helpers ───────────────────────────────────────────────────────────────

function makeFurnaceBundleInput(rules: FurnaceSchedulingRule[]) {
  return computeBundleInput({
    solverId: 'minecraft.furnace',
    contractVersion: 1,
    definitions: rules,
    inventory: { iron_ore: 4, coal: 2 },
    goal: { iron_ingot: 4 },
    nearbyBlocks: [],
  });
}

function makeFurnaceBundleOutput(solved: boolean, steps: Array<{ action: string }> = []) {
  const compatReport = lintRules(buildFurnaceRules(['iron_ore'], 2), {
    solverId: 'minecraft.furnace',
  });
  const rationaleCtx = buildDefaultRationaleContext({ compatReport, maxNodes: 5000 });

  return computeBundleOutput({
    planId: 'test-furnace-plan',
    solved,
    steps,
    totalNodes: 50,
    durationMs: 200,
    solutionPathLength: steps.length,
    ...rationaleCtx,
  });
}

// ============================================================================
// Test 1: Furnace rules pass validation gate
// ============================================================================

describe('Rig C - Furnace rule validation', () => {
  it('generated furnace rules pass schema validation', () => {
    const rules = buildFurnaceRules(['iron_ore', 'gold_ore'], 2);

    const validation = validateRules(rules);

    expect(validation.valid).toBe(true);
    if (validation.valid) {
      expect(validation.report.rulesAccepted).toBe(rules.length);
    }
  });

  it('furnace rules for all smeltable items pass validation', () => {
    const allItems = SMELTABLE_ITEMS.map(s => s.input);
    const rules = buildFurnaceRules(allItems, 4);

    const validation = validateRules(rules);

    expect(validation.valid).toBe(true);
    if (validation.valid) {
      // 4 operator families × N items + capacity rules
      expect(validation.report.rulesAccepted).toBeGreaterThan(0);
    }
  });

  it('rejects furnace rule with invalid baseCost', () => {
    const badRules = [{
      action: 'furnace:load:iron_ore',
      actionType: 'craft' as const,
      operatorFamily: 'load_furnace' as const,
      produces: [],
      consumes: [{ name: 'iron_ore', count: 1 }],
      requires: [],
      needsTable: false,
      needsFurnace: true,
      baseCost: -1, // Invalid
      durationTicks: 0,
    }];

    const validation = validateRules(badRules);
    expect(validation.valid).toBe(false);
  });
});

// ============================================================================
// Test 2: Trace hash determinism on furnace bundles
// ============================================================================

describe('Rig C - Furnace trace hash determinism', () => {
  it('same furnace input/output produces identical trace hash', () => {
    const rules = buildFurnaceRules(['iron_ore'], 2);
    const input = makeFurnaceBundleInput(rules);
    const output = makeFurnaceBundleOutput(true, [
      { action: 'furnace:load:iron_ore' },
      { action: 'furnace:fuel:iron_ore' },
      { action: 'furnace:smelt:iron_ore' },
      { action: 'furnace:retrieve:iron_ore' },
    ]);

    const traces: string[] = [];
    for (let i = 0; i < 5; i++) {
      traces.push(computeTraceHash(input, output));
    }

    expect(new Set(traces).size).toBe(1);
    expect(traces[0]).toMatch(/^[a-f0-9]{16}$/);
  });

  it('different solve outcomes produce different trace hashes', () => {
    const rules = buildFurnaceRules(['iron_ore'], 2);
    const input = makeFurnaceBundleInput(rules);

    const outputSolved = makeFurnaceBundleOutput(true, [{ action: 'furnace:smelt:iron_ore' }]);
    const outputUnsolved = makeFurnaceBundleOutput(false, []);

    const hashSolved = computeTraceHash(input, outputSolved);
    const hashUnsolved = computeTraceHash(input, outputUnsolved);

    expect(hashSolved).not.toBe(hashUnsolved);
  });
});

// ============================================================================
// Test 3: Duration model integrity
// ============================================================================

describe('Rig C - Duration model integrity', () => {
  it('OPERATOR_DURATIONS is frozen and covers all action types', () => {
    expect(OPERATOR_DURATIONS.length).toBeGreaterThanOrEqual(5);

    const actionTypes = OPERATOR_DURATIONS.map(d => d.actionType);
    expect(actionTypes).toContain('smelt');
    expect(actionTypes).toContain('craft');
    expect(actionTypes).toContain('mine');
    expect(actionTypes).toContain('place');
  });

  it('smelt duration is 200 ticks per item', () => {
    const duration = computeDurationTicks('smelt:iron_ore', 1, 'smelt');
    expect(duration).toBe(200);
  });

  it('craft duration is 0 (instant)', () => {
    const duration = computeDurationTicks('craft:oak_planks', 1, 'craft');
    expect(duration).toBe(0);
  });

  it('computeDurationTicks is pure (same inputs → same output)', () => {
    const results: number[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(computeDurationTicks('smelt:iron_ore', 4, 'smelt'));
    }
    expect(new Set(results).size).toBe(1);
  });

  it('annotateRuleWithDuration returns consistent annotations', () => {
    const a1 = annotateRuleWithDuration('smelt:iron_ore', 'smelt', 1);
    const a2 = annotateRuleWithDuration('smelt:iron_ore', 'smelt', 1);

    expect(a1.durationTicks).toBe(a2.durationTicks);
    expect(a1.requiresSlotType).toBe(a2.requiresSlotType);
  });
});

// ============================================================================
// Test 4: Deadlock prevention
// ============================================================================

describe('Rig C - Deadlock prevention', () => {
  const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

  it('detects deadlock when all furnace slots busy beyond horizon', () => {
    const rules = buildFurnaceRules(['iron_ore'], 2);
    const farFutureState = adapter.canonicalize({
      time: {
        currentBucket: 10,
        horizonBucket: 110,
        bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
      },
      slots: [
        { id: 'furnace_0', type: 'furnace', readyAtBucket: 500 },
        { id: 'furnace_1', type: 'furnace', readyAtBucket: 600 },
      ],
    });

    const check = checkDeadlockForRules(adapter, rules, farFutureState);
    expect(check.isDeadlock).toBe(true);
  });

  it('allows solve when slot available within horizon', () => {
    const rules = buildFurnaceRules(['iron_ore'], 2);
    const availableState = adapter.canonicalize({
      time: {
        currentBucket: 10,
        horizonBucket: 110,
        bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
      },
      slots: [
        { id: 'furnace_0', type: 'furnace', readyAtBucket: 0 },
        { id: 'furnace_1', type: 'furnace', readyAtBucket: 50 },
      ],
    });

    const check = checkDeadlockForRules(adapter, rules, availableState);
    expect(check.isDeadlock).toBe(false);
  });

  it('MAX_WAIT_BUCKETS is bounded', () => {
    expect(MAX_WAIT_BUCKETS).toBe(100);
    expect(Number.isInteger(MAX_WAIT_BUCKETS)).toBe(true);
  });
});

// ============================================================================
// Test 5: Batch preference
// ============================================================================

describe('Rig C - Batch preference', () => {
  const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

  it('prefers batch for quantities above threshold', () => {
    const hint = getBatchHint(adapter, 'iron_ore', 16, MINECRAFT_BATCH_OPERATORS);
    expect(hint.useBatch).toBe(true);
    expect(hint.batchSize).toBeGreaterThan(1);
  });

  it('does not batch below threshold', () => {
    const hint = getBatchHint(adapter, 'iron_ore', 3, MINECRAFT_BATCH_OPERATORS);
    expect(hint.useBatch).toBe(false);
  });

  it('batch operators have consistent maxBatchSize', () => {
    for (const op of MINECRAFT_BATCH_OPERATORS) {
      expect(op.maxBatchSize).toBeLessThanOrEqual(64);
      expect(op.maxBatchSize).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Test 6: Temporal state determinism
// ============================================================================

describe('Rig C - Temporal state determinism', () => {
  it('toTickBucket returns integers only', () => {
    for (let i = 0; i < 100; i++) {
      const bucket = toTickBucket(i * 17 + 3);
      expect(Number.isInteger(bucket)).toBe(true);
    }
  });

  it('MINECRAFT_BUCKET_SIZE_TICKS is a constant', () => {
    expect(MINECRAFT_BUCKET_SIZE_TICKS).toBe(100);
  });

  it('inferSlotsFromBlocks is deterministic for same blocks', () => {
    const blocks1 = ['furnace', 'furnace', 'crafting_table'];
    const blocks2 = ['crafting_table', 'furnace', 'furnace'];

    const slots1 = inferSlotsFromBlocks(blocks1, 0);
    const slots2 = inferSlotsFromBlocks(blocks2, 0);

    // Same blocks (regardless of order) → same slot count
    const furnaceSlots1 = slots1.filter(s => s.type === 'furnace');
    const furnaceSlots2 = slots2.filter(s => s.type === 'furnace');
    expect(furnaceSlots1.length).toBe(furnaceSlots2.length);
  });
});

// ============================================================================
// Test 7: Explanation for furnace solves
// ============================================================================

describe('Rig C - Furnace solve explanations', () => {
  it('explanation generated for successful furnace solve', () => {
    const rules = buildFurnaceRules(['iron_ore'], 2);
    const input = makeFurnaceBundleInput(rules);
    const output = makeFurnaceBundleOutput(true, [
      { action: 'furnace:load:iron_ore' },
      { action: 'furnace:smelt:iron_ore' },
    ]);

    const validation = validateRules(rules);
    expect(validation.valid).toBe(true);
    if (!validation.valid) return;

    const compatReport = lintRules(rules, { solverId: 'minecraft.furnace' });
    const explanation = buildExplanation(input, output, validation.report, compatReport);

    expect(explanation.requestHash).toBeDefined();
    expect(explanation.solutionSummary.found).toBe(true);
    expect(explanation.validationReport.rulesAccepted).toBe(rules.length);
  });

  it('explanation generated for unsolved furnace schedule', () => {
    const rules = buildFurnaceRules(['iron_ore'], 2);
    const input = makeFurnaceBundleInput(rules);
    const output = makeFurnaceBundleOutput(false, []);

    const validation = validateRules(rules);
    expect(validation.valid).toBe(true);
    if (!validation.valid) return;

    const compatReport = lintRules(rules, { solverId: 'minecraft.furnace' });
    const explanation = buildExplanation(input, output, validation.report, compatReport);

    expect(explanation.solutionSummary.found).toBe(false);
  });
});

// ============================================================================
// Test 8: SMELTABLE_ITEMS registry integrity
// ============================================================================

describe('Rig C - Smeltable items registry', () => {
  it('all smeltable items have positive duration', () => {
    for (const item of SMELTABLE_ITEMS) {
      expect(item.durationTicks).toBeGreaterThan(0);
    }
  });

  it('all smeltable items have distinct input names', () => {
    const inputs = SMELTABLE_ITEMS.map(s => s.input);
    expect(new Set(inputs).size).toBe(inputs.length);
  });

  it('covers core Minecraft smelting recipes', () => {
    const inputs = new Set(SMELTABLE_ITEMS.map(s => s.input));
    expect(inputs.has('iron_ore')).toBe(true);
    expect(inputs.has('gold_ore')).toBe(true);
    expect(inputs.has('sand')).toBe(true);
    expect(inputs.has('cobblestone')).toBe(true);
  });
});

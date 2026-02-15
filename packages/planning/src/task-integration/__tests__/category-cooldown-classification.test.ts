/**
 * Category Cooldown Classification Tests (P0-C)
 *
 * Validates the tiered cooldown TTLs based on failure classification:
 *   - transient: 5s (world state may change)
 *   - durable: 30s (contract broken, needs code/config change)
 *   - nonsensical: 120s (goal is likely impossible)
 *
 * Also includes a tripwire test ensuring the converter's classification map
 * covers all keys in BLOCKED_REASON_REGISTRY.
 *
 * Run with: npx vitest run packages/planning/src/task-integration/__tests__/category-cooldown-classification.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyTaskFailure,
  registerFailedTaskCategory,
  getCooldownMetrics,
  __resetDedupStateForTests,
  __BLOCKED_REASON_CLASSIFICATION_FOR_TESTS,
  type FailureClassification,
} from '../thought-to-task-converter';
import { BLOCKED_REASON_REGISTRY } from '../../task-lifecycle/task-block-evaluator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(meta: Record<string, unknown> = {}) {
  return {
    title: 'I should craft a wooden pickaxe to mine stone',
    metadata: {
      category: 'sterling_ir',
      sterling: { dedupeNamespace: 'v1' },
      ...meta,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests: classifyTaskFailure
// ---------------------------------------------------------------------------

describe('classifyTaskFailure', () => {
  describe('toolDiagnostics.reason_code precedence (highest priority)', () => {
    it('classifies no_mcdata as transient', () => {
      expect(classifyTaskFailure(makeTask({ lastDiagReasonCode: 'no_mcdata' }))).toBe('transient');
    });

    it('classifies no_recipe_available as transient (default without detail)', () => {
      expect(classifyTaskFailure(makeTask({ lastDiagReasonCode: 'no_recipe_available' }))).toBe('transient');
    });

    it('classifies no_recipe_available with missing workstation as transient', () => {
      expect(classifyTaskFailure(makeTask({
        lastDiagReasonCode: 'no_recipe_available',
        lastDiagDetail: { requires_workstation: true, crafting_table_nearby: false },
      }))).toBe('transient');
    });

    it('classifies no_recipe_available with missing inputs as transient', () => {
      expect(classifyTaskFailure(makeTask({
        lastDiagReasonCode: 'no_recipe_available',
        lastDiagDetail: { missing_inputs_count: 2 },
      }))).toBe('transient');
    });

    it('classifies craft_timeout as transient', () => {
      expect(classifyTaskFailure(makeTask({ lastDiagReasonCode: 'craft_timeout' }))).toBe('transient');
    });

    it('classifies invalid_recipe_id as durable', () => {
      expect(classifyTaskFailure(makeTask({ lastDiagReasonCode: 'invalid_recipe_id' }))).toBe('durable');
    });

    it('classifies unknown_item as durable', () => {
      expect(classifyTaskFailure(makeTask({ lastDiagReasonCode: 'unknown_item' }))).toBe('durable');
    });
  });

  describe('blockedReason precedence (second priority)', () => {
    it('classifies blocked_resource_context_unavailable as transient', () => {
      expect(classifyTaskFailure(makeTask({ blockedReason: 'blocked_resource_context_unavailable' }))).toBe('transient');
    });

    it('classifies blocked_crafting_context_unavailable as transient', () => {
      expect(classifyTaskFailure(makeTask({ blockedReason: 'blocked_crafting_context_unavailable' }))).toBe('transient');
    });

    it('classifies blocked_invalid_ir_bundle as durable', () => {
      expect(classifyTaskFailure(makeTask({ blockedReason: 'blocked_invalid_ir_bundle' }))).toBe('durable');
    });

    it('classifies blocked_missing_digest as durable', () => {
      expect(classifyTaskFailure(makeTask({ blockedReason: 'blocked_missing_digest' }))).toBe('durable');
    });

    it('classifies expansion_retries_exhausted as nonsensical', () => {
      expect(classifyTaskFailure(makeTask({ blockedReason: 'expansion_retries_exhausted' }))).toBe('nonsensical');
    });

    it('classifies max_retries_exceeded as nonsensical', () => {
      expect(classifyTaskFailure(makeTask({ blockedReason: 'max_retries_exceeded' }))).toBe('nonsensical');
    });

    it('classifies parametric deterministic-failure:* as durable', () => {
      expect(classifyTaskFailure(makeTask({ blockedReason: 'deterministic-failure:unknown_recipe' }))).toBe('durable');
    });

    it('classifies parametric budget-exhausted:* as nonsensical', () => {
      expect(classifyTaskFailure(makeTask({ blockedReason: 'budget-exhausted:time:130000>120000' }))).toBe('nonsensical');
    });
  });

  describe('noStepsReason precedence (third priority)', () => {
    it('classifies solver-unsolved as transient', () => {
      expect(classifyTaskFailure(makeTask({ solver: { noStepsReason: 'solver-unsolved' } }))).toBe('transient');
    });

    it('classifies solver-error as transient', () => {
      expect(classifyTaskFailure(makeTask({ solver: { noStepsReason: 'solver-error' } }))).toBe('transient');
    });

    it('classifies unplannable as durable', () => {
      expect(classifyTaskFailure(makeTask({ solver: { noStepsReason: 'unplannable' } }))).toBe('durable');
    });

    it('classifies no-requirement as durable', () => {
      expect(classifyTaskFailure(makeTask({ solver: { noStepsReason: 'no-requirement' } }))).toBe('durable');
    });

    it('classifies advisory-skip as nonsensical', () => {
      expect(classifyTaskFailure(makeTask({ solver: { noStepsReason: 'advisory-skip' } }))).toBe('nonsensical');
    });
  });

  describe('defaults', () => {
    it('defaults to durable when no metadata', () => {
      expect(classifyTaskFailure({ title: 'test', metadata: {} })).toBe('durable');
    });

    it('defaults to durable when metadata is null', () => {
      expect(classifyTaskFailure({ title: 'test' })).toBe('durable');
    });
  });

  describe('precedence ordering', () => {
    it('toolDiagnostics wins over blockedReason', () => {
      // no_mcdata (transient via diag) vs blocked_invalid_ir_bundle (durable via blocked)
      const task = makeTask({
        lastDiagReasonCode: 'no_mcdata',
        blockedReason: 'blocked_invalid_ir_bundle',
      });
      expect(classifyTaskFailure(task)).toBe('transient');
    });

    it('blockedReason wins over noStepsReason', () => {
      // durable via blocked vs transient via solver
      const task = makeTask({
        blockedReason: 'blocked_invalid_ir_bundle',
        solver: { noStepsReason: 'solver-unsolved' },
      });
      expect(classifyTaskFailure(task)).toBe('durable');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: registerFailedTaskCategory + getCooldownMetrics
// ---------------------------------------------------------------------------

describe('registerFailedTaskCategory + getCooldownMetrics', () => {
  beforeEach(() => {
    __resetDedupStateForTests();
  });

  it('registers a transient failure and shows in metrics', () => {
    registerFailedTaskCategory(makeTask({ lastDiagReasonCode: 'no_mcdata' }));
    const metrics = getCooldownMetrics();
    expect(metrics.size).toBe(1);
    expect(metrics.hitsByClassification.transient).toBe(1);
    expect(metrics.hitsByClassification.durable).toBe(0);
  });

  it('registers a durable failure and shows in metrics', () => {
    registerFailedTaskCategory(makeTask({ blockedReason: 'blocked_invalid_ir_bundle' }));
    const metrics = getCooldownMetrics();
    expect(metrics.hitsByClassification.durable).toBe(1);
  });

  it('registers a nonsensical failure and shows in metrics', () => {
    registerFailedTaskCategory(makeTask({ blockedReason: 'expansion_retries_exhausted' }));
    const metrics = getCooldownMetrics();
    expect(metrics.hitsByClassification.nonsensical).toBe(1);
  });

  it('reset clears all state', () => {
    registerFailedTaskCategory(makeTask({ blockedReason: 'blocked_invalid_ir_bundle' }));
    __resetDedupStateForTests();
    const metrics = getCooldownMetrics();
    expect(metrics.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tripwire: BLOCKED_REASON_CLASSIFICATION covers BLOCKED_REASON_REGISTRY
// ---------------------------------------------------------------------------

describe('BLOCKED_REASON_CLASSIFICATION tripwire', () => {
  it('covers every key in BLOCKED_REASON_REGISTRY', () => {
    const registryKeys = Object.keys(BLOCKED_REASON_REGISTRY);
    const classificationKeys = Object.keys(__BLOCKED_REASON_CLASSIFICATION_FOR_TESTS);

    const missing = registryKeys.filter(k => !classificationKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it('all classification values are valid FailureClassification', () => {
    const validValues = new Set<FailureClassification>(['transient', 'durable', 'nonsensical']);
    for (const [key, value] of Object.entries(__BLOCKED_REASON_CLASSIFICATION_FOR_TESTS)) {
      expect(validValues.has(value as FailureClassification), `${key} has invalid classification: ${value}`).toBe(true);
    }
  });

  it('transient reasons in registry match transient classification', () => {
    // Cross-check: every 'transient' entry in BLOCKED_REASON_REGISTRY should be
    // 'transient' in our classification map (not accidentally mapped to durable)
    for (const [key, entry] of Object.entries(BLOCKED_REASON_REGISTRY)) {
      if (entry.classification === 'transient') {
        const mapped = __BLOCKED_REASON_CLASSIFICATION_FOR_TESTS[key];
        expect(mapped, `${key} is transient in registry but ${mapped} in classification`).toBe('transient');
      }
    }
  });

  it('contract_broken reasons in registry match durable classification', () => {
    for (const [key, entry] of Object.entries(BLOCKED_REASON_REGISTRY)) {
      if (entry.classification === 'contract_broken') {
        const mapped = __BLOCKED_REASON_CLASSIFICATION_FOR_TESTS[key];
        expect(mapped, `${key} is contract_broken in registry but ${mapped} in classification`).toBe('durable');
      }
    }
  });

  it('terminal reasons in registry map to nonsensical classification', () => {
    for (const [key, entry] of Object.entries(BLOCKED_REASON_REGISTRY)) {
      if (entry.classification === 'terminal') {
        const mapped = __BLOCKED_REASON_CLASSIFICATION_FOR_TESTS[key];
        expect(mapped, `${key} is terminal in registry but ${mapped} in classification`).toBe('nonsensical');
      }
    }
  });
});

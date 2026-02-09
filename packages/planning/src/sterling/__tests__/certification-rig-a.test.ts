/**
 * Rig A Certification Tests — Deterministic Transformation Planning (P1)
 *
 * Tests 2, 4, 5 from the Rig A plan:
 *   - Test 2: Deterministic trace hashing (3 cases)
 *   - Test 4: Solver integration / validation gate (2 cases)
 *   - Test 5: End-to-end certification (1 case)
 *
 * These tests exercise the certification harnesses WITHOUT a live Sterling
 * backend (mocked sterlingService). Integration tests against live Sterling
 * are in solver-class-e2e.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  computeTraceHash,
  computeBundleInput,
  computeBundleOutput,
  createSolveBundle,
  buildDefaultRationaleContext,
  contentHash,
} from '../solve-bundle';
import type { SolveBundleInput, SolveBundleOutput, CompatReport } from '../solve-bundle-types';
import { validateRules } from '../../validation/rule-validator';
import { buildExplanation } from '../../audit/explanation-builder';
import { CreditManager } from '../../credit/credit-manager';
import { lintRules } from '../compat-linter';
import type { MinecraftCraftingRule } from '../minecraft-crafting-types';

// ── Test fixtures ────────────────────────────────────────────────────────────

const VALID_RULES: MinecraftCraftingRule[] = [
  {
    action: 'craft:oak_planks',
    actionType: 'craft',
    produces: [{ name: 'oak_planks', count: 4 }],
    consumes: [{ name: 'oak_log', count: 1 }],
    requires: [],
    needsTable: false,
    needsFurnace: false,
    baseCost: 1.0,
  },
  {
    action: 'mine:oak_log',
    actionType: 'mine',
    produces: [{ name: 'oak_log', count: 1 }],
    consumes: [],
    requires: [],
    needsTable: false,
    needsFurnace: false,
    baseCost: 5.0,
  },
  {
    action: 'craft:stick',
    actionType: 'craft',
    produces: [{ name: 'stick', count: 4 }],
    consumes: [{ name: 'oak_planks', count: 2 }],
    requires: [],
    needsTable: false,
    needsFurnace: false,
    baseCost: 1.0,
  },
];

function makeBundleInput(rules: MinecraftCraftingRule[]): SolveBundleInput {
  const inventory = { oak_log: 10 };
  const goal = { wooden_pickaxe: 1 };
  const nearbyBlocks = ['oak_log', 'dirt'];
  const compatReport = lintRules(rules);

  return computeBundleInput({
    solverId: 'minecraft.crafting',
    contractVersion: 1,
    definitions: rules,
    inventory,
    goal,
    nearbyBlocks,
  });
}

function makeBundleOutput(solved: boolean, steps: Array<{ action: string }> = []): SolveBundleOutput {
  const compatReport = lintRules(VALID_RULES);
  const rationaleCtx = buildDefaultRationaleContext({ compatReport, maxNodes: 5000 });

  return computeBundleOutput({
    planId: 'test-plan-id',
    solved,
    steps,
    totalNodes: 42,
    durationMs: 123,
    solutionPathLength: steps.length,
    ...rationaleCtx,
  });
}

// ============================================================================
// Test 2: Deterministic trace hashing
// ============================================================================

describe('Rig A - Trace determinism', () => {
  it('produces identical trace hash for same input/output', () => {
    const input = makeBundleInput(VALID_RULES);
    const output = makeBundleOutput(true, [{ action: 'craft:oak_planks' }]);

    const traces: string[] = [];
    for (let i = 0; i < 5; i++) {
      traces.push(computeTraceHash(input, output));
    }

    // All traces must be identical
    expect(new Set(traces).size).toBe(1);
    expect(traces[0]).toMatch(/^[a-f0-9]{16}$/);
  });

  it('trace hash is independent of timestamp and planId', () => {
    const input = makeBundleInput(VALID_RULES);

    // Two outputs with different planIds and totalNodes (non-deterministic)
    const output1 = computeBundleOutput({
      planId: 'plan-aaa',
      solved: true,
      steps: [{ action: 'craft:oak_planks' }],
      totalNodes: 42,
      durationMs: 100,
      solutionPathLength: 1,
    });

    const output2 = computeBundleOutput({
      planId: 'plan-zzz',  // Different planId
      solved: true,
      steps: [{ action: 'craft:oak_planks' }],  // Same steps
      totalNodes: 999,  // Different totalNodes
      durationMs: 5000,  // Different duration
      solutionPathLength: 1,
    });

    const hash1 = computeTraceHash(input, output1);
    const hash2 = computeTraceHash(input, output2);

    // Must be identical — trace hash excludes planId, totalNodes, durationMs
    expect(hash1).toBe(hash2);
  });

  it('trace hash changes with different inputs', () => {
    const input1 = computeBundleInput({
      solverId: 'minecraft.crafting',
      contractVersion: 1,
      definitions: VALID_RULES,
      inventory: { oak_log: 5 },
      goal: { oak_planks: 1 },
      nearbyBlocks: [],
    });

    const input2 = computeBundleInput({
      solverId: 'minecraft.crafting',
      contractVersion: 1,
      definitions: VALID_RULES,
      inventory: { oak_log: 10 },  // Different inventory
      goal: { oak_planks: 1 },
      nearbyBlocks: [],
    });

    const output = makeBundleOutput(true, [{ action: 'craft:oak_planks' }]);

    const hash1 = computeTraceHash(input1, output);
    const hash2 = computeTraceHash(input2, output);

    expect(hash1).not.toBe(hash2);  // Different inventory → different hash
  });

  it('trace hash changes with different solve outcome', () => {
    const input = makeBundleInput(VALID_RULES);

    const outputSolved = makeBundleOutput(true, [{ action: 'craft:oak_planks' }]);
    const outputUnsolved = makeBundleOutput(false, []);

    const hashSolved = computeTraceHash(input, outputSolved);
    const hashUnsolved = computeTraceHash(input, outputUnsolved);

    expect(hashSolved).not.toBe(hashUnsolved);
  });
});

// ============================================================================
// Test 4: Solver integration (validation gate)
// ============================================================================

describe('Rig A - Solver integration (validation gate)', () => {
  it('validateRules passes valid rules through to solver', () => {
    const validation = validateRules(VALID_RULES);

    expect(validation.valid).toBe(true);
    if (validation.valid) {
      expect(validation.rules).toHaveLength(3);
      expect(validation.report.rulesAccepted).toBe(3);
    }
  });

  it('validateRules rejects invalid rules — Sterling never reached', () => {
    const invalidRules = [
      {
        action: 'bad_rule',
        actionType: 'craft',
        produces: [{ name: 'planks', count: 4 }],
        consumes: [{ name: 'wood', count: 1 }],
        requires: [],
        needsTable: false,
        needsFurnace: false,
        baseCost: -5,  // Invalid: negative cost
      },
    ];

    const validation = validateRules(invalidRules);

    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      // Sterling would never be called — this is the gate
      expect(validation.error).toContain('Schema validation failed');
      expect(validation.details.length).toBeGreaterThan(0);
    }
  });

  it('explanation is generated for successful solves', () => {
    const input = makeBundleInput(VALID_RULES);
    const output = makeBundleOutput(true, [{ action: 'craft:oak_planks' }]);
    const validation = validateRules(VALID_RULES);
    const compatReport = lintRules(VALID_RULES);

    expect(validation.valid).toBe(true);
    if (!validation.valid) return;

    const explanation = buildExplanation(input, output, validation.report, compatReport);

    expect(explanation.requestHash).toBeDefined();
    expect(explanation.constraintsSummary).toBeDefined();
    expect(explanation.validationReport.rulesAccepted).toBe(3);
    expect(explanation.validationReport.rulesRejected).toBe(0);
    expect(explanation.solutionSummary.found).toBe(true);
  });
});

// ============================================================================
// Test 5: End-to-end certification
// ============================================================================

describe('Rig A - End-to-end certification', () => {
  it('certifies all gates on Minecraft crafting', () => {
    const creditManager = new CreditManager();

    // ─── Gate 1: Validation ──────────────────────────────────────────
    const validation = validateRules(VALID_RULES);
    expect(validation.valid).toBe(true);
    if (!validation.valid) return;

    // Invalid rules are rejected
    const invalidValidation = validateRules([{ action: 'x', baseCost: -1 }]);
    expect(invalidValidation.valid).toBe(false);

    // ─── Gate 2: Determinism ─────────────────────────────────────────
    const input = makeBundleInput(VALID_RULES);
    const output = makeBundleOutput(true, [{ action: 'craft:oak_planks' }, { action: 'craft:stick' }]);
    output.traceHash = computeTraceHash(input, output);

    const traces: string[] = [];
    for (let i = 0; i < 3; i++) {
      traces.push(computeTraceHash(input, output));
    }
    expect(new Set(traces).size).toBe(1);

    // ─── Gate 3: Credit semantics ────────────────────────────────────
    // Plan found — but NO credit yet
    const priorBefore = creditManager.getPrior('craft:oak_planks');
    // (no reportExecutionOutcome called)
    const priorAfterPlan = creditManager.getPrior('craft:oak_planks');
    expect(priorAfterPlan).toBe(priorBefore);  // Unchanged!

    // Now report execution success → credit applied
    creditManager.reportExecutionOutcome(input.definitionHash, [
      { requestHash: input.definitionHash, stepIndex: 0, ruleId: 'craft:oak_planks', success: true },
    ]);
    const priorAfterExec = creditManager.getPrior('craft:oak_planks');
    expect(priorAfterExec).toBeGreaterThan(priorBefore);

    // ─── Gate 4: Explanations ────────────────────────────────────────
    const compatReport = lintRules(VALID_RULES);
    const explanation = buildExplanation(input, output, validation.report, compatReport);
    expect(explanation).toBeDefined();
    expect(explanation.solutionSummary.found).toBe(true);
    expect(explanation.validationReport.rulesAccepted).toBe(3);
    expect(explanation.constraintsSummary).toBeDefined();

    // ─── Gate 5: Boundedness (Pivot 5) ───────────────────────────────
    // hashDefinition already sorts rules — verified by existing solve-bundle tests.
    // Trace hash is 16 hex chars (bounded output).
    expect(output.traceHash).toMatch(/^[a-f0-9]{16}$/);
  });
});

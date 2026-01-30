/**
 * Transfer test: BOM (Bill of Materials) Assembly
 *
 * Proves the evidence infrastructure is domain-independent by exercising
 * it against a non-Minecraft BOM domain: gadget_assembled, widget_refined,
 * widget_raw. Each rule uses the standard {action, actionType, produces,
 * consumes} schema.
 *
 * This avoids brittleness from depending on the mcData shape, which is
 * a Minecraft-specific concern.
 */

import { describe, it, expect } from 'vitest';
import { lintRules } from '../compat-linter';
import type { LintableRule, LintContext } from '../compat-linter';
import {
  hashDefinition,
  computeBundleInput,
  canonicalize,
  createSolveBundle,
  computeBundleOutput,
} from '../solve-bundle';

// ============================================================================
// Non-Minecraft BOM domain rules
// ============================================================================

const bomRules: LintableRule[] = [
  {
    action: 'craft:widget_raw',
    actionType: 'craft',
    produces: [{ name: 'widget_raw', count: 2 }],
    consumes: [{ name: 'raw_material_a', count: 1 }],
    requires: [],
  },
  {
    action: 'craft:widget_refined',
    actionType: 'craft',
    produces: [{ name: 'widget_refined', count: 1 }],
    consumes: [{ name: 'widget_raw', count: 2 }],
    requires: [],
  },
  {
    action: 'craft:gadget_assembled',
    actionType: 'craft',
    produces: [{ name: 'gadget_assembled', count: 1 }],
    consumes: [
      { name: 'widget_refined', count: 1 },
      { name: 'component_b', count: 3 },
    ],
    requires: [],
  },
];

const bomContext: LintContext = {
  executionMode: 'bom_assembly',
  solverId: 'manufacturing.bom',
};

// ============================================================================
// Tests
// ============================================================================

describe('Transfer: BOM assembly (non-Minecraft domain)', () => {
  it('compat linter runs cleanly on non-Minecraft rules', () => {
    const report = lintRules(bomRules, bomContext);
    const errors = report.issues.filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(report.valid).toBe(true);
    expect(report.definitionCount).toBe(3);
  });

  it('hashDefinition works with non-Minecraft rule arrays', () => {
    const hash = hashDefinition(bomRules);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);

    // Deterministic: same rules produce same hash
    expect(hashDefinition(bomRules)).toBe(hash);

    // Order-independent (sorted by action key)
    const reversed = [...bomRules].reverse();
    expect(hashDefinition(reversed)).toBe(hash);
  });

  it('computeBundleInput captures non-Minecraft solverId + executionMode', () => {
    const input = computeBundleInput({
      solverId: 'manufacturing.bom',
      executionMode: 'bom_assembly',
      contractVersion: 1,
      definitions: bomRules,
      inventory: { raw_material_a: 10, component_b: 15 },
      goal: { gadget_assembled: 5 },
      nearbyBlocks: [],
    });

    expect(input.solverId).toBe('manufacturing.bom');
    expect(input.executionMode).toBe('bom_assembly');
    expect(input.definitionHash).toMatch(/^[0-9a-f]{16}$/);
    expect(input.goalHash).toMatch(/^[0-9a-f]{16}$/);
    expect(input.definitionCount).toBe(3);
  });

  it('wire payload is canonicalizable', () => {
    const payload = {
      contractVersion: 1,
      solverId: 'manufacturing.bom',
      executionMode: 'bom_assembly',
      inventory: { raw_material_a: 10, component_b: 15 },
      goal: { gadget_assembled: 5 },
      rules: bomRules,
      maxNodes: 3000,
    };

    const canonical = canonicalize(payload);
    expect(typeof canonical).toBe('string');
    expect(canonical.length).toBeGreaterThan(0);

    // Deterministic
    expect(canonicalize(payload)).toBe(canonical);
  });

  it('SolveBundle captures non-Minecraft domain data correctly', () => {
    const input = computeBundleInput({
      solverId: 'manufacturing.bom',
      executionMode: 'bom_assembly',
      contractVersion: 1,
      definitions: bomRules,
      inventory: { raw_material_a: 10, component_b: 15 },
      goal: { gadget_assembled: 5 },
      nearbyBlocks: [],
    });

    const output = computeBundleOutput({
      planId: 'bom-plan-001',
      solved: true,
      steps: [
        { action: 'craft:widget_raw' },
        { action: 'craft:widget_refined' },
        { action: 'craft:gadget_assembled' },
      ],
      totalNodes: 10,
      durationMs: 50,
      solutionPathLength: 3,
    });

    const compatReport = lintRules(bomRules, bomContext);
    const bundle = createSolveBundle(input, output, compatReport);

    expect(bundle.bundleId).toMatch(/^manufacturing\.bom:[0-9a-f]{16}$/);
    expect(bundle.input.solverId).toBe('manufacturing.bom');
    expect(bundle.input.goalHash).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.input.definitionHash).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.output.solved).toBe(true);
    expect(bundle.output.stepsDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.compatReport.valid).toBe(true);
  });
});

/**
 * Transfer test: Approval Ladder (non-Minecraft clearance levels)
 *
 * Proves the evidence infrastructure works for non-Minecraft hierarchical
 * capability domains. Models a clearance-level progression:
 *   training_manual → intern_badge (+ cap:has_intern_clearance)
 *   → project_report (gated by intern clearance)
 *   → associate_badge (+ cap:has_associate_clearance)
 *
 * Uses the same consume+reproduce invariant pattern as Minecraft mine rules
 * to enforce capability gates, proving the pattern is domain-independent.
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
// Non-Minecraft "clearance level" rules
// ============================================================================

const clearanceRules: LintableRule[] = [
  {
    action: 'craft:training_manual',
    actionType: 'craft',
    produces: [{ name: 'training_manual', count: 1 }],
    consumes: [{ name: 'raw_documentation', count: 3 }],
    requires: [],
  },
  {
    action: 'craft:intern_badge',
    actionType: 'craft',
    produces: [
      { name: 'intern_badge', count: 1 },
      { name: 'cap:has_intern_clearance', count: 1 },
    ],
    consumes: [{ name: 'training_manual', count: 1 }],
    requires: [],
  },
  {
    // project_report is gated by intern clearance.
    // Uses consume+reproduce invariant pattern (same as mine rules).
    // actionType is 'craft' since the linter only validates
    // craft/mine/smelt/place and this is a generic production rule.
    action: 'craft:project_report',
    actionType: 'craft',
    produces: [
      { name: 'project_report', count: 1 },
      { name: 'cap:has_intern_clearance', count: 1 }, // reproduce invariant
    ],
    consumes: [
      { name: 'raw_research', count: 2 },
      { name: 'cap:has_intern_clearance', count: 1 }, // consume invariant
    ],
    requires: [
      { name: 'cap:has_intern_clearance', count: 1 }, // documentation
    ],
  },
  {
    action: 'craft:associate_badge',
    actionType: 'craft',
    produces: [
      { name: 'associate_badge', count: 1 },
      { name: 'cap:has_associate_clearance', count: 1 },
    ],
    consumes: [
      { name: 'project_report', count: 2 },
      { name: 'intern_badge', count: 1 },
    ],
    requires: [],
  },
];

const clearanceContext: LintContext = {
  executionMode: 'approval_ladder',
  solverId: 'hr.approval',
};

// ============================================================================
// Tests
// ============================================================================

describe('Transfer: approval ladder (non-Minecraft clearance levels)', () => {
  it('clearance rules pass compat linter with zero errors', () => {
    const report = lintRules(clearanceRules, clearanceContext);
    const errors = report.issues.filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(report.valid).toBe(true);
    expect(report.definitionCount).toBe(4);
  });

  it('hashDefinition works for non-Minecraft definitions', () => {
    const hash = hashDefinition(clearanceRules);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);

    // Deterministic
    expect(hashDefinition(clearanceRules)).toBe(hash);

    // Order-independent
    const reversed = [...clearanceRules].reverse();
    expect(hashDefinition(reversed)).toBe(hash);
  });

  it('computeBundleInput captures non-Minecraft solverId + executionMode', () => {
    const input = computeBundleInput({
      solverId: 'hr.approval',
      executionMode: 'approval_ladder',
      contractVersion: 1,
      definitions: clearanceRules,
      inventory: { raw_documentation: 5, raw_research: 10 },
      goal: { associate_badge: 1 },
      nearbyBlocks: [],
    });

    expect(input.solverId).toBe('hr.approval');
    expect(input.executionMode).toBe('approval_ladder');
    expect(input.definitionHash).toMatch(/^[0-9a-f]{16}$/);
    expect(input.goalHash).toMatch(/^[0-9a-f]{16}$/);
    expect(input.definitionCount).toBe(4);
  });

  it('wire payload is canonicalizable', () => {
    const payload = {
      contractVersion: 1,
      solverId: 'hr.approval',
      executionMode: 'approval_ladder',
      inventory: { raw_documentation: 5, raw_research: 10 },
      goal: { associate_badge: 1 },
      rules: clearanceRules,
      maxNodes: 2000,
    };

    const canonical = canonicalize(payload);
    expect(typeof canonical).toBe('string');
    expect(canonical.length).toBeGreaterThan(0);
    // Deterministic
    expect(canonicalize(payload)).toBe(canonical);
  });

  it('SolveBundle captures non-Minecraft clearance domain data', () => {
    const input = computeBundleInput({
      solverId: 'hr.approval',
      executionMode: 'approval_ladder',
      contractVersion: 1,
      definitions: clearanceRules,
      inventory: { raw_documentation: 5, raw_research: 10 },
      goal: { associate_badge: 1 },
      nearbyBlocks: [],
    });

    const output = computeBundleOutput({
      planId: 'hr-plan-001',
      solved: true,
      steps: [
        { action: 'craft:training_manual' },
        { action: 'craft:intern_badge' },
        { action: 'craft:project_report' },
        { action: 'craft:project_report' },
        { action: 'craft:associate_badge' },
      ],
      totalNodes: 8,
      durationMs: 30,
      solutionPathLength: 5,
    });

    const compatReport = lintRules(clearanceRules, clearanceContext);
    const bundle = createSolveBundle(input, output, compatReport);

    expect(bundle.bundleId).toMatch(/^hr\.approval:[0-9a-f]{16}$/);
    expect(bundle.input.solverId).toBe('hr.approval');
    expect(bundle.output.solved).toBe(true);
    expect(bundle.output.stepsDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.compatReport.valid).toBe(true);
  });
});

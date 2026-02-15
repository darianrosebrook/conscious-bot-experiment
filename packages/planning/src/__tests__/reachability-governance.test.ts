/**
 * Reachability Governance Tests
 *
 * Negative-space guards that prevent silent capability creep. These tests
 * lock the reachability matrix as a **contract** using three orthogonal
 * booleans per leaf:
 *
 *   Contracted — has a LeafArgContract + action-mapping entry (derived from KNOWN_LEAVES)
 *   Produced   — some autonomous producer (solver/driveshaft/bootstrap) emits it
 *   Proven     — at least one machine-checkable proof anchor exists (ProofSpec)
 *
 * Invariants enforced:
 *   A) Produced ⊆ Contracted (can't emit an uncontracted leaf)
 *   B) Proven ⊆ Produced (can't claim proof for something no producer emits)
 *   C) Produced ∩ ¬Proven requires a waiver (explicit gap tracking)
 *   D) Every waiver has owner + reason + targetFix + reviewBy (no silent acceptance)
 *
 * Machine-checkable proof anchors:
 *   Each proof spec references a test file + dispatch string. The governance test
 *   validates the file exists and contains the string — no test execution needed.
 *
 * If a test fails after a code change, it means a leaf gained or lost
 * reachability. Update the classification intentionally.
 *
 * Run with: npx vitest run packages/planning/src/__tests__/reachability-governance.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { KNOWN_LEAVES, INTENT_LEAVES } from '../modules/leaf-arg-contracts';
import { mapBTActionToMinecraft } from '../modules/action-mapping';
import { buildLeafAllowlist } from '../modular-server';
import { executeSterlingStep } from '../executor/sterling-step-executor';
import type { SterlingStepExecutorContext } from '../executor/sterling-step-executor.types';
import bootstrapFixture from '../server/__tests__/fixtures/bootstrap-lowering-v1.json';

// ============================================================================
// Type definitions: ProofKind, ProofSpec, EntryPointId, ProducedBySpec
// ============================================================================

/**
 * ProofKind: categorizes how a leaf's dispatch is proven.
 * Keep this taxonomy small — add kinds only when a concrete leaf needs one.
 */
type ProofKind = 'executor_executeTool' | 'safety_executeAction' | 'programmatic_call';

/**
 * ProofSpec: machine-checkable proof anchor.
 * Points to a specific test file and a dispatch string the governance test can
 * verify exists via file IO + string matching (no test execution).
 */
interface ProofSpec {
  kind: ProofKind;
  testFile: string;         // relative to repo root
  expectedDispatch: string; // string that must appear in testFile content
}

/**
 * EntryPointId: which pipeline path produces this leaf.
 * Maps to the entry point numbers in leaf-reachability-runbook.md.
 */
type EntryPointId =
  | 'EP-1'  // Sterling Bootstrap Lowering
  | 'EP-2'  // Sterling Solver
  | 'EP-3'  // Fallback Planner
  | 'EP-4'  // Dynamic Prereq Injection
  | 'EP-5'  // Hunger Driveshaft
  | 'EP-6'  // Exploration Driveshaft
  | 'EP-7'  // Reactive Safety Pipeline
  | 'EP-8'  // Acquisition Solver
  | 'EP-9'; // Sleep Driveshaft

/**
 * ProducedBySpec: provenance metadata for a produced leaf.
 * Every produced leaf must declare which entry points emit it.
 */
interface ProducedBySpec {
  entryPoints: EntryPointId[];
}

// ============================================================================
// Taxonomy: Produced / Proven / Waivers
// ============================================================================

/**
 * PRODUCED_LEAVES: provenance-tracked producer registry.
 * Each entry maps a leaf to the pipeline entry points that emit it.
 *
 * To add a leaf here:
 *   1. Identify the producer (solver, driveshaft, bootstrap, prereq injection)
 *   2. Add the leaf with its entryPoints
 *   3. Either add proof specs to PROOFS (with E2E test) or add a ProofWaiver
 */
const PRODUCED_LEAVES: Readonly<Record<string, ProducedBySpec>> = {
  // EP-1: Sterling Bootstrap Lowering (expand_by_digest)
  move_to:              { entryPoints: ['EP-1', 'EP-6'] },
  step_forward_safely:  { entryPoints: ['EP-1'] },
  // EP-1 + EP-2 + EP-3 + EP-4: multiple producers
  acquire_material:     { entryPoints: ['EP-1', 'EP-2', 'EP-3', 'EP-4'] },
  // EP-1 + EP-5: bootstrap (food) + hunger driveshaft
  consume_food:         { entryPoints: ['EP-1', 'EP-5'] },
  // EP-2: Sterling Solver (crafting, tool progression, building)
  craft_recipe:         { entryPoints: ['EP-2', 'EP-3', 'EP-4'] },
  smelt:                { entryPoints: ['EP-2'] },
  place_workstation:    { entryPoints: ['EP-2', 'EP-4'] },
  place_block:          { entryPoints: ['EP-2'] },
  explore_for_resources: { entryPoints: ['EP-2'] },
  prepare_site:         { entryPoints: ['EP-2'] },
  build_module:         { entryPoints: ['EP-2', 'EP-3'] },
  place_feature:        { entryPoints: ['EP-2'] },
  building_step:        { entryPoints: ['EP-2'] },
  replan_building:      { entryPoints: ['EP-2'] },
  replan_exhausted:     { entryPoints: ['EP-2'] },
  // EP-2: executor prereq injection (programmatic, not task step)
  introspect_recipe:    { entryPoints: ['EP-2'] },
  // EP-7: Reactive Safety Pipeline (bypasses executor)
  attack_entity:        { entryPoints: ['EP-7'] },
  equip_weapon:         { entryPoints: ['EP-7'] },
  // EP-8: Acquisition Solver (trade/loot strategies)
  interact_with_entity: { entryPoints: ['EP-8'] },
  open_container:       { entryPoints: ['EP-8'] },
  // EP-9: Sleep Driveshaft (Stage 1)
  sleep:                { entryPoints: ['EP-9'] },
};

/**
 * PROOFS: machine-checkable proof registry.
 * Each leaf maps to an array of ProofSpec entries. A leaf is "proven" if it
 * has at least one proof spec whose anchor is valid.
 *
 * Proof patterns per kind:
 *   executor_executeTool:  expectedDispatch = 'minecraft.<leaf>'
 *   safety_executeAction:  expectedDispatch = action type string
 *   programmatic_call:     expectedDispatch = call site marker string
 */
const PROOFS: Readonly<Record<string, readonly ProofSpec[]>> = {
  // gather-food-dispatch-chain-e2e.test.ts
  acquire_material: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/gather-food-dispatch-chain-e2e.test.ts',
    expectedDispatch: 'minecraft.acquire_material',
  }],
  consume_food: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/gather-food-dispatch-chain-e2e.test.ts',
    expectedDispatch: 'minecraft.consume_food',
  }],
  // building-solver-dispatch-chain-e2e.test.ts
  prepare_site: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/building-solver-dispatch-chain-e2e.test.ts',
    expectedDispatch: 'minecraft.prepare_site',
  }],
  build_module: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/building-solver-dispatch-chain-e2e.test.ts',
    expectedDispatch: 'minecraft.build_module',
  }],
  place_feature: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/building-solver-dispatch-chain-e2e.test.ts',
    expectedDispatch: 'minecraft.place_feature',
  }],
  building_step: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/building-solver-dispatch-chain-e2e.test.ts',
    expectedDispatch: 'minecraft.building_step',
  }],
  replan_building: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/building-solver-dispatch-chain-e2e.test.ts',
    expectedDispatch: 'minecraft.replan_building',
  }],
  replan_exhausted: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/building-solver-dispatch-chain-e2e.test.ts',
    expectedDispatch: 'minecraft.replan_exhausted',
  }],
  // explore-replan-dispatch-e2e.test.ts
  explore_for_resources: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/explore-replan-dispatch-e2e.test.ts',
    expectedDispatch: 'minecraft.explore_for_resources',
  }],
  craft_recipe: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/explore-replan-dispatch-e2e.test.ts',
    expectedDispatch: 'minecraft.craft_recipe',
  }],
  // executor-task-loop-e2e.test.ts
  smelt: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/executor-task-loop-e2e.test.ts',
    expectedDispatch: 'minecraft.smelt',
  }],
  place_workstation: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/executor-task-loop-e2e.test.ts',
    expectedDispatch: 'minecraft.place_workstation',
  }],
  place_block: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/executor-task-loop-e2e.test.ts',
    expectedDispatch: 'minecraft.place_block',
  }],
  step_forward_safely: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/executor-task-loop-e2e.test.ts',
    expectedDispatch: 'minecraft.step_forward_safely',
  }],
  // exploration-driveshaft-e2e.test.ts
  move_to: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/goal-formulation/__tests__/exploration-driveshaft-e2e.test.ts',
    expectedDispatch: 'minecraft.move_to',
  }],
  // sleep-driveshaft-e2e.test.ts
  sleep: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/goal-formulation/__tests__/sleep-driveshaft-e2e.test.ts',
    expectedDispatch: 'minecraft.sleep',
  }],
  // safety-monitor-dispatch-e2e.test.ts (executeAction path, not executeTool)
  attack_entity: [{
    kind: 'safety_executeAction',
    testFile: 'packages/minecraft-interface/src/__tests__/safety-monitor-dispatch-e2e.test.ts',
    expectedDispatch: 'attack_entity',
  }],
  equip_weapon: [{
    kind: 'safety_executeAction',
    testFile: 'packages/minecraft-interface/src/__tests__/safety-monitor-dispatch-e2e.test.ts',
    expectedDispatch: 'equip_weapon',
  }],
  // executor-task-loop-e2e.test.ts — programmatic-only: ctx.introspectRecipe()
  // invoked by executor during craft_recipe pre-check, not via executeTool
  introspect_recipe: [{
    kind: 'programmatic_call',
    testFile: 'packages/planning/src/__tests__/executor-task-loop-e2e.test.ts',
    expectedDispatch: 'introspectRecipe',
  }],
  // acquisition-dispatch-chain-e2e.test.ts (trade/loot strategies, EP-8)
  interact_with_entity: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/acquisition-dispatch-chain-e2e.test.ts',
    expectedDispatch: 'minecraft.interact_with_entity',
  }],
  open_container: [{
    kind: 'executor_executeTool',
    testFile: 'packages/planning/src/__tests__/acquisition-dispatch-chain-e2e.test.ts',
    expectedDispatch: 'minecraft.open_container',
  }],
};

/**
 * Computed: set of proven leaf names (derived from PROOFS).
 */
function computeProvenLeaves(): ReadonlySet<string> {
  return new Set(Object.keys(PROOFS).filter((k) => PROOFS[k].length > 0));
}

/**
 * Computed: set of produced leaf names (derived from PRODUCED_LEAVES).
 */
function computeProducedLeaves(): ReadonlySet<string> {
  return new Set(Object.keys(PRODUCED_LEAVES));
}

/**
 * PROOF_WAIVERS: Produced leaves that lack E2E dispatch-chain proof.
 * Each waiver must have owner, reason, targetFix, and reviewBy.
 * Governance test fails if reviewBy is in the past.
 * Resolve by adding proof specs to PROOFS and removing the waiver.
 */
interface ProofWaiver {
  leaf: string;
  owner: string;
  reason: string;
  targetFix: string;
  createdAt: string;
  reviewBy: string;   // YYYY-MM-DD — governance test fails if this date is past
}

const PROOF_WAIVERS: readonly ProofWaiver[] = [
  // All waivers resolved — interact_with_entity and open_container now proven
  // via acquisition-dispatch-chain-e2e.test.ts (G-3 gap closed).
];

/**
 * Leaves that are Contracted but NOT Produced (passthrough/manual only).
 * Derived as: KNOWN_LEAVES - PRODUCED_LEAVES
 * These are dispatchable via REST/MCP but no autonomous producer emits them.
 */
function computeContractedOnly(): ReadonlySet<string> {
  const produced = computeProducedLeaves();
  return new Set([...KNOWN_LEAVES].filter((l) => !produced.has(l)));
}

// ============================================================================
// Executor context factory (minimal — only needs allowlist + gating behavior)
// ============================================================================

function createMockExecutorContext(
  overrides: Partial<SterlingStepExecutorContext> = {},
): SterlingStepExecutorContext {
  return {
    config: {
      buildExecBudgetDisabled: true,
      buildExecMaxAttempts: 5,
      buildExecMinIntervalMs: 5000,
      buildExecMaxElapsedMs: 120000,
      buildingLeaves: new Set(),
      taskTypeBridgeLeafNames: new Set(),
      enableTaskTypeBridge: false,
      legacyLeafRewriteEnabled: false,
    },
    leafAllowlist: buildLeafAllowlist(KNOWN_LEAVES, INTENT_LEAVES, false),
    mode: 'live',
    updateTaskMetadata: vi.fn(),
    startTaskStep: vi.fn().mockResolvedValue(true),
    completeTaskStep: vi.fn().mockResolvedValue(true),
    emit: vi.fn(),
    executeTool: vi.fn().mockResolvedValue({ ok: true }),
    canExecuteStep: vi.fn().mockReturnValue(true),
    recordStepExecuted: vi.fn(),
    getAbortSignal: () => undefined,
    getGoldenRunRecorder: () => ({
      recordExecutorBlocked: vi.fn(),
      recordShadowDispatch: vi.fn(),
      recordVerification: vi.fn(),
      recordDispatch: vi.fn(),
      recordRegenerationAttempt: vi.fn(),
      recordLeafRewriteUsed: vi.fn(),
      recordLoopDetected: vi.fn(),
      markLoopBreakerEvaluated: vi.fn(),
    }),
    toDispatchResult: (r) =>
      r?.ok ? { status: 'ok' } : { status: 'error', error: (r as any)?.error },
    introspectRecipe: vi.fn().mockResolvedValue(null),
    fetchInventorySnapshot: vi.fn().mockResolvedValue([]),
    getCount: vi.fn().mockReturnValue(10),
    injectDynamicPrereqForCraft: vi.fn().mockResolvedValue(false),
    emitExecutorBudgetEvent: vi.fn(),
    getStepBudgetState: vi.fn().mockReturnValue({
      meta: {},
      budgets: {},
      state: { attempts: 0, firstAt: Date.now(), lastAt: 0 },
      created: false,
    }),
    persistStepBudget: vi.fn(),
    updateTaskProgress: vi.fn(),
    recomputeProgressAndMaybeComplete: vi.fn().mockResolvedValue(undefined),
    regenerateSteps: vi.fn().mockResolvedValue({ success: false }),
    getThreatSnapshot: vi.fn().mockResolvedValue({ overallThreatLevel: 'low', threats: [] }),
    ...overrides,
  };
}

function makeStepForLeaf(leaf: string, args: Record<string, unknown> = {}) {
  return {
    id: `step-gov-${leaf}`,
    label: `Leaf: minecraft.${leaf}`,
    done: false,
    order: 1,
    meta: {
      leaf,
      args,
      executable: true,
    },
  };
}

function makeTask(steps: any[]) {
  return {
    id: 'task-governance-test',
    title: 'Governance test task',
    steps,
    metadata: { createdAt: Date.now(), updatedAt: Date.now() },
  };
}

// ============================================================================
// Invariant A: Produced ⊆ Contracted
// ============================================================================

describe('Invariant A: Produced ⊆ Contracted', () => {
  const produced = computeProducedLeaves();

  it('every produced leaf has a LeafArgContract', () => {
    const uncontracted = [...produced].filter((l) => !KNOWN_LEAVES.has(l));
    expect(
      uncontracted,
      `Producer(s) emit leaves without a LeafArgContract. These steps will ALWAYS fail ` +
      `at the executor (no contract → no allowlist entry → blocked). Either add a ` +
      `LeafArgContract in leaf-arg-contracts.ts, or stop emitting the leaf. ` +
      `Uncontracted: ${uncontracted.join(', ')}`,
    ).toEqual([]);
  });

  it('every produced leaf has an action mapping', () => {
    const unmapped: string[] = [];
    for (const leaf of produced) {
      const action = mapBTActionToMinecraft(leaf, {});
      if (!action) {
        unmapped.push(leaf);
      }
    }
    expect(
      unmapped,
      `Producer(s) emit leaves without an action mapping. These steps will fail at ` +
      `the executor's action-mapping gate even if they pass the allowlist. Either add ` +
      `a case in action-mapping.ts, or stop emitting the leaf. Unmapped: ${unmapped.join(', ')}`,
    ).toEqual([]);
  });

  it('no produced leaf has disappeared from KNOWN_LEAVES', () => {
    const missing = [...produced].filter((l) => !KNOWN_LEAVES.has(l));
    expect(missing).toEqual([]);
  });
});

// ============================================================================
// Invariant B: Proven ⊆ Produced
// ============================================================================

describe('Invariant B: Proven ⊆ Produced', () => {
  const produced = computeProducedLeaves();
  const proven = computeProvenLeaves();

  it('every proven leaf is also in the produced set', () => {
    const orphanedProof = [...proven].filter((l) => !produced.has(l));
    expect(
      orphanedProof,
      `Leaves claimed as proven but not in PRODUCED_LEAVES. If no producer emits ` +
      `this leaf autonomously, the proof is only covering manual/passthrough dispatch, ` +
      `which is misleading. Remove from PROOFS or add a producer. ` +
      `Orphaned proof: ${orphanedProof.join(', ')}`,
    ).toEqual([]);
  });
});

// ============================================================================
// Invariant C: Produced ∩ ¬Proven requires a waiver
// ============================================================================

describe('Invariant C: Produced-not-Proven requires waivers', () => {
  const produced = computeProducedLeaves();
  const proven = computeProvenLeaves();
  const producedNotProven = [...produced].filter((l) => !proven.has(l));
  const waivedLeaves = new Set(PROOF_WAIVERS.map((w) => w.leaf));

  it('every produced-not-proven leaf has a waiver', () => {
    const unwaived = producedNotProven.filter((l) => !waivedLeaves.has(l));
    expect(
      unwaived,
      `Produced leaves without proof AND without a waiver. Either add proof specs ` +
      `to PROOFS, or add a ProofWaiver with owner/reason/targetFix/reviewBy. ` +
      `Unwaived: ${unwaived.join(', ')}`,
    ).toEqual([]);
  });

  it('no waiver exists for a leaf that is already proven', () => {
    const staleWaivers = PROOF_WAIVERS.filter((w) => proven.has(w.leaf));
    expect(
      staleWaivers.map((w) => w.leaf),
      `Waivers exist for already-proven leaves — remove them. ` +
      `Stale: ${staleWaivers.map((w) => w.leaf).join(', ')}`,
    ).toEqual([]);
  });

  it('no waiver exists for a leaf that is not produced', () => {
    const orphanedWaivers = PROOF_WAIVERS.filter((w) => !produced.has(w.leaf));
    expect(
      orphanedWaivers.map((w) => w.leaf),
      `Waivers exist for non-produced leaves — remove them. ` +
      `Orphaned: ${orphanedWaivers.map((w) => w.leaf).join(', ')}`,
    ).toEqual([]);
  });
});

// ============================================================================
// Invariant D: Waiver quality + lifecycle
// ============================================================================

describe('Invariant D: Waiver quality and lifecycle', () => {

  it('every waiver has non-empty owner, reason, targetFix, and reviewBy', () => {
    const invalid = PROOF_WAIVERS.filter(
      (w) => !w.owner?.trim() || !w.reason?.trim() || !w.targetFix?.trim() || !w.reviewBy?.trim(),
    );
    expect(
      invalid.map((w) => w.leaf),
      `Waivers with missing fields: ${invalid.map((w) => `${w.leaf} (owner=${w.owner}, reason=${w.reason}, targetFix=${w.targetFix}, reviewBy=${w.reviewBy})`).join('; ')}`,
    ).toEqual([]);
  });

  it('every waiver has a valid createdAt date', () => {
    const invalid = PROOF_WAIVERS.filter(
      (w) => !w.createdAt || isNaN(Date.parse(w.createdAt)),
    );
    expect(
      invalid.map((w) => w.leaf),
      `Waivers with invalid createdAt: ${invalid.map((w) => `${w.leaf}=${w.createdAt}`).join(', ')}`,
    ).toEqual([]);
  });

  it('every waiver has a valid reviewBy date', () => {
    const invalid = PROOF_WAIVERS.filter(
      (w) => !w.reviewBy || isNaN(Date.parse(w.reviewBy)),
    );
    expect(
      invalid.map((w) => w.leaf),
      `Waivers with invalid reviewBy: ${invalid.map((w) => `${w.leaf}=${w.reviewBy}`).join(', ')}`,
    ).toEqual([]);
  });

  it('no waiver has expired (reviewBy in the past)', () => {
    const now = new Date();
    const expired = PROOF_WAIVERS.filter((w) => new Date(w.reviewBy) < now);
    expect(
      expired.map((w) => `${w.leaf} (reviewBy: ${w.reviewBy})`),
      `Expired waivers must be reviewed and either renewed (extend reviewBy) or resolved ` +
      `(add proof to PROOFS and remove waiver):\n` +
      expired.map((w) =>
        `  ${w.leaf}: created ${w.createdAt}, review by ${w.reviewBy}\n` +
        `    Reason: ${w.reason}\n` +
        `    Fix: ${w.targetFix}`
      ).join('\n'),
    ).toEqual([]);
  });

  it('waiver leaves are unique (no duplicates)', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const w of PROOF_WAIVERS) {
      if (seen.has(w.leaf)) dupes.push(w.leaf);
      seen.add(w.leaf);
    }
    expect(dupes).toEqual([]);
  });
});

// ============================================================================
// Machine-checkable proof anchors
// ============================================================================

describe('Machine-checkable proof anchors', () => {
  const thisDir =
    typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(thisDir, '../../../..');

  it('every proof spec points to an existing test file', () => {
    const missing: string[] = [];

    for (const [leaf, proofs] of Object.entries(PROOFS)) {
      for (const proof of proofs) {
        const fullPath = resolve(repoRoot, proof.testFile);
        if (!existsSync(fullPath)) {
          missing.push(`${leaf} → ${proof.testFile} (file not found)`);
        }
      }
    }

    expect(
      missing,
      `Proof anchors point to non-existent test files:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('every proof spec expectedDispatch string exists in the test file', () => {
    const missing: string[] = [];

    for (const [leaf, proofs] of Object.entries(PROOFS)) {
      for (const proof of proofs) {
        const fullPath = resolve(repoRoot, proof.testFile);
        if (!existsSync(fullPath)) continue; // caught by previous test

        const content = readFileSync(fullPath, 'utf-8');
        if (!content.includes(proof.expectedDispatch)) {
          missing.push(
            `${leaf} → ${proof.testFile}: expected "${proof.expectedDispatch}" not found in file`,
          );
        }
      }
    }

    expect(
      missing,
      `Proof anchors claim dispatches that don't exist in test files:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('every proven leaf has at least one proof spec', () => {
    const emptyProofs = Object.entries(PROOFS).filter(([, specs]) => specs.length === 0);
    expect(
      emptyProofs.map(([leaf]) => leaf),
      `PROOFS entries with empty spec arrays: ${emptyProofs.map(([l]) => l).join(', ')}`,
    ).toEqual([]);
  });
});

// ============================================================================
// ProducedBy provenance
// ============================================================================

describe('ProducedBy provenance', () => {
  const validEPs: ReadonlySet<EntryPointId> = new Set([
    'EP-1', 'EP-2', 'EP-3', 'EP-4', 'EP-5', 'EP-6', 'EP-7', 'EP-8', 'EP-9',
  ]);

  it('every produced leaf has at least one entry point', () => {
    const missing: string[] = [];
    for (const [leaf, spec] of Object.entries(PRODUCED_LEAVES)) {
      if (!spec.entryPoints || spec.entryPoints.length === 0) {
        missing.push(leaf);
      }
    }
    expect(
      missing,
      `Produced leaves without entry point provenance: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every entry point ID is from the valid set', () => {
    const invalid: string[] = [];
    for (const [leaf, spec] of Object.entries(PRODUCED_LEAVES)) {
      for (const ep of spec.entryPoints) {
        if (!validEPs.has(ep)) {
          invalid.push(`${leaf}: invalid EP "${ep}"`);
        }
      }
    }
    expect(invalid).toEqual([]);
  });
});

// ============================================================================
// Contracted-only leaves (passthrough/manual)
// ============================================================================

describe('Contracted-only leaves (passthrough/manual)', () => {
  const contractedOnly = computeContractedOnly();
  const produced = computeProducedLeaves();

  it('contracted-only leaves are not in any producer set', () => {
    const leaks = [...contractedOnly].filter((l) => produced.has(l));
    expect(leaks).toEqual([]);
  });

  it('each contracted-only leaf has a valid action mapping', () => {
    const failures: string[] = [];
    for (const leaf of contractedOnly) {
      const action = mapBTActionToMinecraft(leaf, {});
      if (!action) {
        failures.push(`${leaf}: no action mapping`);
      }
    }
    expect(
      failures,
      `Contracted-only leaves without action mappings:\n${failures.join('\n')}`,
    ).toEqual([]);
  });

  it('contracted-only leaves ARE in the executor allowlist', () => {
    const allowlist = buildLeafAllowlist(KNOWN_LEAVES, INTENT_LEAVES, false);
    const blocked: string[] = [];
    for (const leaf of contractedOnly) {
      if (!allowlist.has(`minecraft.${leaf}`)) {
        blocked.push(leaf);
      }
    }
    expect(blocked).toEqual([]);
  });

  it('no known producer emits any contracted-only leaf', () => {
    const leaks = [...contractedOnly].filter((l) => produced.has(l));
    expect(
      leaks,
      `Contracted-only leaves found in producer output — reclassify to PRODUCED_LEAVES: ${leaks.join(', ')}`,
    ).toEqual([]);
  });

  it('bootstrap lowering fixture does not emit contracted-only leaves', () => {
    const cases = (bootstrapFixture as any).cases;
    const bootstrapLeaves: string[] = [];
    for (const caseName of Object.keys(cases)) {
      for (const step of cases[caseName].steps) {
        bootstrapLeaves.push(step.leaf);
      }
    }
    const leaks = bootstrapLeaves.filter((l) => contractedOnly.has(l));
    expect(
      leaks,
      `Bootstrap fixture emits contracted-only leaves: ${leaks.join(', ')}`,
    ).toEqual([]);
  });
});

// ============================================================================
// Intent leaf dispatch guard
// ============================================================================

describe('Intent leaf dispatch guard', () => {

  it('intent leaves (task_type_*) are not in KNOWN_LEAVES', () => {
    const overlap = [...INTENT_LEAVES].filter((l) => KNOWN_LEAVES.has(l));
    expect(overlap).toEqual([]);
  });

  it('intent leaves are blocked by executor allowlist when bridge disabled', () => {
    const allowlist = buildLeafAllowlist(KNOWN_LEAVES, INTENT_LEAVES, false);
    const leaked: string[] = [];
    for (const leaf of INTENT_LEAVES) {
      if (allowlist.has(`minecraft.${leaf}`)) {
        leaked.push(leaf);
      }
    }
    expect(leaked).toEqual([]);
  });

  it('intent leaves ARE in executor allowlist when bridge enabled (dev only)', () => {
    const allowlist = buildLeafAllowlist(KNOWN_LEAVES, INTENT_LEAVES, true);
    const missing: string[] = [];
    for (const leaf of INTENT_LEAVES) {
      if (!allowlist.has(`minecraft.${leaf}`)) {
        missing.push(leaf);
      }
    }
    expect(missing).toEqual([]);
  });

  it('no known producer emits intent leaves', () => {
    const produced = computeProducedLeaves();
    const leaks = [...INTENT_LEAVES].filter((l) => produced.has(l));
    expect(leaks).toEqual([]);
  });

  it('executor blocks a leaf not in the allowlist', async () => {
    const ctx = createMockExecutorContext({
      leafAllowlist: new Set(['minecraft.acquire_material']),
    });
    const step = makeStepForLeaf('till_soil', {});
    const task = makeTask([step]);

    await executeSterlingStep(task, step, ctx);
    expect(ctx.executeTool).not.toHaveBeenCalled();
    expect(ctx.updateTaskMetadata).toHaveBeenCalled();
  });

  it('executor blocks intent leaf even when bridge is disabled', async () => {
    const ctx = createMockExecutorContext();
    const step = makeStepForLeaf('task_type_craft', { recipe: 'wooden_pickaxe' });
    const task = makeTask([step]);

    await executeSterlingStep(task, step, ctx);
    expect(ctx.executeTool).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Safety monitor bypass-path governance lock
// ============================================================================

/**
 * The AutomaticSafetyMonitor dispatches actions via actionTranslator.executeAction()
 * which BYPASSES the executor's allowlist gate. This is by design (emergency responses
 * can't wait for planning pipeline validation), but creates a shadow dispatch surface.
 *
 * This section pins the exact set of action types the safety monitor is permitted to
 * emit. If a developer adds a new executeAction() call, the source-scanning test fails
 * and forces an explicit update here.
 *
 * Extraction uses the TypeScript AST (not string scanning) to avoid paren-counting and
 * nested type: field collisions. Every executeAction() call must pass an object literal
 * with exactly one top-level type property that is a string literal.
 */

type ExtractResult = {
  actionTypes: string[];
  violations: string[];
};

function extractExecuteActionTypesFromFile(filePath: string): ExtractResult {
  const sourceText = readFileSync(filePath, 'utf-8');
  const sf = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const actionTypes: string[] = [];
  const violations: string[] = [];

  const isTypePropName = (name: ts.PropertyName): boolean => {
    if (ts.isIdentifier(name)) return name.text === 'type';
    if (ts.isStringLiteral(name)) return name.text === 'type';
    return false;
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;

      if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'executeAction') {
        const arg0 = node.arguments[0];
        if (!arg0) {
          violations.push('executeAction() call missing first argument');
        } else if (!ts.isObjectLiteralExpression(arg0)) {
          violations.push('executeAction() arg0 must be an object literal (fail-closed)');
        } else {
          const hasSpread = arg0.properties.some((p) => ts.isSpreadAssignment(p));
          if (hasSpread) {
            violations.push('executeAction() arg object contains spread assignment (fail-closed)');
          }

          const typeProps = arg0.properties.filter((p) => {
            return ts.isPropertyAssignment(p) && isTypePropName(p.name);
          }) as ts.PropertyAssignment[];

          if (typeProps.length !== 1) {
            violations.push(
              `executeAction() must contain exactly one top-level type property (found ${typeProps.length})`,
            );
          } else {
            const init = typeProps[0].initializer;
            if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
              actionTypes.push(init.text);
            } else {
              violations.push('executeAction() type must be a string literal (fail-closed)');
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);

  return { actionTypes, violations };
}

const SAFETY_MONITOR_ALLOWED_ACTIONS: ReadonlySet<string> = new Set([
  'navigate',       // Flee: move to computed flee target (emergency lease)
  'move_forward',   // Flee fallback: move forward when no flee target computed
  'find_shelter',   // Shelter response: find and navigate to shelter
  'equip_weapon',   // Combat prep: equip best available weapon
  'attack_entity',  // Combat: attack nearest hostile entity
]);

describe('Safety monitor bypass-path governance', () => {

  it('safety monitor source only contains allowed executeAction types (fail-closed)', () => {
    const thisDir =
      typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
    const monitorPath = resolve(
      thisDir,
      '../../../minecraft-interface/src/automatic-safety-monitor.ts',
    );

    const { actionTypes, violations } = extractExecuteActionTypesFromFile(monitorPath);

    expect(
      violations,
      `Bypass governance violations:\n${violations.join('\n')}`,
    ).toEqual([]);

    expect(
      actionTypes.length,
      'Expected to find at least one executeAction type in safety monitor source',
    ).toBeGreaterThan(0);

    const actual = [...new Set(actionTypes)].sort();
    const expected = [...SAFETY_MONITOR_ALLOWED_ACTIONS].sort();
    expect(
      actual,
      `Safety monitor executeAction types must exactly match SAFETY_MONITOR_ALLOWED_ACTIONS. ` +
        `Actual: [${actual.join(', ')}]. Expected: [${expected.join(', ')}]`,
    ).toEqual(expected);
  });

  it('all safety-monitor bypass actions have an action mapping', () => {
    const unmapped: string[] = [];
    for (const actionType of SAFETY_MONITOR_ALLOWED_ACTIONS) {
      const action = mapBTActionToMinecraft(actionType, {});
      if (!action) {
        unmapped.push(actionType);
      }
    }
    expect(
      unmapped,
      `Safety monitor dispatches action types without an action mapping. ` +
      `These will fail at actionTranslator.executeAction(). Unmapped: ${unmapped.join(', ')}`,
    ).toEqual([]);
  });
});

// ============================================================================
// Classification drift detection
// ============================================================================

describe('Classification drift detection', () => {
  const produced = computeProducedLeaves();
  const contractedOnly = computeContractedOnly();

  it('KNOWN_LEAVES count matches Produced + Contracted-only', () => {
    expect(
      KNOWN_LEAVES.size,
      `KNOWN_LEAVES size changed — a leaf was added or removed. ` +
      `Current: ${[...KNOWN_LEAVES].sort().join(', ')}`,
    ).toBe(produced.size + contractedOnly.size);
  });

  it('INTENT_LEAVES count matches expected', () => {
    expect(INTENT_LEAVES.size).toBe(10);
  });

  it('no leaf appears in both KNOWN_LEAVES and INTENT_LEAVES', () => {
    const overlap = [...KNOWN_LEAVES].filter((l) => INTENT_LEAVES.has(l));
    expect(overlap).toEqual([]);
  });
});

// ============================================================================
// Deterministic scoreboard (diff-friendly, explains "what changed")
// ============================================================================

describe('Reachability scoreboard (deterministic)', () => {
  interface ScoreboardRow {
    leaf: string;
    contracted: boolean;
    produced: boolean;
    proven: boolean;
    proofKinds: ProofKind[];
    waiver: string | null;
    entryPoints: EntryPointId[];
  }

  function buildScoreboardRows(): ScoreboardRow[] {
    const produced = computeProducedLeaves();
    const proven = computeProvenLeaves();
    const waiverByLeaf = new Map(PROOF_WAIVERS.map((w) => [w.leaf, w.owner]));

    const rows: ScoreboardRow[] = [];
    for (const leaf of [...KNOWN_LEAVES].sort()) {
      rows.push({
        leaf,
        contracted: true,
        produced: produced.has(leaf),
        proven: proven.has(leaf),
        proofKinds: (PROOFS[leaf] ?? []).map((p) => p.kind),
        waiver: waiverByLeaf.get(leaf) ?? null,
        entryPoints: PRODUCED_LEAVES[leaf]?.entryPoints ?? [],
      });
    }
    return rows;
  }

  it('prints current reachability scoreboard (deterministic, sorted)', () => {
    const produced = computeProducedLeaves();
    const proven = computeProvenLeaves();
    const contractedOnly = computeContractedOnly();
    const producedNotProven = [...produced].filter((l) => !proven.has(l));
    const rows = buildScoreboardRows();

    const summary = [
      `Contracted (KNOWN_LEAVES):     ${KNOWN_LEAVES.size}`,
      `  Produced + Proven (strong):   ${proven.size}`,
      `  Produced, not Proven (gap):   ${producedNotProven.length} [${producedNotProven.sort().join(', ')}]`,
      `  Contracted-only (manual):     ${contractedOnly.size}`,
      `Intent leaves:                  ${INTENT_LEAVES.size}`,
      `Waivers active:                 ${PROOF_WAIVERS.length}`,
    ].join('\n');

    const header = 'Leaf | C | P | V | ProofKinds | Waiver | EntryPoints';
    const sep =    '---- | - | - | - | ---------- | ------ | -----------';
    const table = rows.map((r) => [
      r.leaf,
      r.contracted ? 'Y' : 'N',
      r.produced ? 'Y' : 'N',
      r.proven ? 'Y' : 'N',
      r.proofKinds.join(',') || '-',
      r.waiver ?? '-',
      r.entryPoints.join(',') || '-',
    ].join(' | ')).join('\n');

    console.log(`\n─── Reachability Scoreboard ───\n${summary}\n\n${header}\n${sep}\n${table}\n──────────────────────────────\n`);
    expect(true).toBe(true);
  });

  it('detects missing proofs (produced-but-unproven without waiver)', () => {
    const produced = computeProducedLeaves();
    const proven = computeProvenLeaves();
    const waivedLeaves = new Set(PROOF_WAIVERS.map((w) => w.leaf));

    const missing = [...produced].filter((l) => !proven.has(l) && !waivedLeaves.has(l));
    expect(
      missing,
      `Produced leaves without proofs AND without waivers:\n` +
      `  ${missing.join(', ')}\n` +
      `Add proof specs to PROOFS, or add a ProofWaiver.`,
    ).toEqual([]);
  });

  it('detects unexpected proofs (proven-but-not-produced)', () => {
    const produced = computeProducedLeaves();
    const proven = computeProvenLeaves();

    const unexpected = [...proven].filter((l) => !produced.has(l));
    expect(
      unexpected,
      `Leaves with proofs but no autonomous producer:\n` +
      `  ${unexpected.join(', ')}\n` +
      `Either add to PRODUCED_LEAVES or remove from PROOFS.`,
    ).toEqual([]);
  });

  it('detects stale waivers (waiver for proven or non-produced leaf)', () => {
    const produced = computeProducedLeaves();
    const proven = computeProvenLeaves();

    const stale = PROOF_WAIVERS.filter(
      (w) => proven.has(w.leaf) || !produced.has(w.leaf),
    );
    expect(
      stale.map((w) => w.leaf),
      `Stale waivers:\n` +
      stale.map((w) =>
        `  ${w.leaf}: ${proven.has(w.leaf) ? 'now proven' : 'no longer produced'} — ${w.reason}`
      ).join('\n') +
      `\nRemove these waivers.`,
    ).toEqual([]);
  });
});

// ============================================================================
// Runbook sync (doc-drift detection)
// ============================================================================

describe('Runbook sync (doc-drift detection)', () => {
  const thisDir =
    typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
  const runbookPath = resolve(thisDir, '../../../../docs/runbooks/leaf-reachability-runbook.md');

  function extractRunbookCounts(): {
    producedAndProven: number;
    producedNotProven: number;
    contractedOnly: number;
    orphaned: number;
  } | null {
    if (!existsSync(runbookPath)) return null;
    const content = readFileSync(runbookPath, 'utf-8');

    const ppMatch = content.match(/\|\s*\*\*Produced \+ Proven\*\*\s*\|[^|]*\|\s*(\d+)\s*\|/);
    const pnpMatch = content.match(/\|\s*\*\*Produced, not Proven\*\*\s*\|[^|]*\|\s*(\d+)\s*\|/);
    const coMatch = content.match(/\|\s*\*\*Contracted-only\*\*\s*\|[^|]*\|\s*(\d+)\s*\|/);
    const oMatch = content.match(/\|\s*\*\*Orphaned\*\*\s*\|[^|]*\|\s*(\d+)\s*\|/);

    if (!ppMatch || !pnpMatch || !coMatch || !oMatch) return null;

    return {
      producedAndProven: parseInt(ppMatch[1], 10),
      producedNotProven: parseInt(pnpMatch[1], 10),
      contractedOnly: parseInt(coMatch[1], 10),
      orphaned: parseInt(oMatch[1], 10),
    };
  }

  it('runbook file exists', () => {
    expect(
      existsSync(runbookPath),
      `Runbook not found: ${runbookPath}`,
    ).toBe(true);
  });

  it('runbook counts match governance data structures', () => {
    const counts = extractRunbookCounts();
    if (!counts) {
      throw new Error(
        'Failed to extract counts from runbook. Check docs/runbooks/leaf-reachability-runbook.md ' +
        '"These derive four leaf states" table pattern.',
      );
    }

    const produced = computeProducedLeaves();
    const proven = computeProvenLeaves();
    const contractedOnly = computeContractedOnly();
    const producedNotProven = [...produced].filter((l) => !proven.has(l)).length;

    const mismatches: string[] = [];
    if (proven.size !== counts.producedAndProven) {
      mismatches.push(
        `Produced + Proven: governance=${proven.size}, runbook=${counts.producedAndProven}`,
      );
    }
    if (producedNotProven !== counts.producedNotProven) {
      mismatches.push(
        `Produced, not Proven: governance=${producedNotProven}, runbook=${counts.producedNotProven}`,
      );
    }
    if (contractedOnly.size !== counts.contractedOnly) {
      mismatches.push(
        `Contracted-only: governance=${contractedOnly.size}, runbook=${counts.contractedOnly}`,
      );
    }

    expect(
      mismatches,
      `Runbook counts don't match governance data:\n` +
      mismatches.map((m) => `  ${m}`).join('\n') +
      `\nUpdate docs/runbooks/leaf-reachability-runbook.md "Four states" table.`,
    ).toEqual([]);
  });
});

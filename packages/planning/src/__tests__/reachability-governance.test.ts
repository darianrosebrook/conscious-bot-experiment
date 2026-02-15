/**
 * Reachability Governance Tests
 *
 * Negative-space guards that prevent silent capability creep. These tests
 * lock the reachability matrix as a **contract** using three orthogonal
 * booleans per leaf:
 *
 *   Contracted — has a LeafArgContract + action-mapping entry (derived from KNOWN_LEAVES)
 *   Produced   — some autonomous producer (solver/driveshaft/bootstrap) emits it
 *   Proven     — an E2E dispatch-chain test asserts executeTool dispatch for it
 *
 * Invariants enforced:
 *   A) Produced ⊆ Contracted (can't emit an uncontracted leaf)
 *   B) Proven ⊆ Produced (can't claim E2E proof for something no producer emits)
 *   C) Produced ∩ ¬Proven requires a waiver (explicit gap tracking)
 *   D) Every waiver has owner + reason + targetFix (no silent acceptance)
 *
 * If a test fails after a code change, it means a leaf gained or lost
 * reachability. Update the classification intentionally.
 *
 * Run with: npx vitest run packages/planning/src/__tests__/reachability-governance.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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
// Taxonomy: Produced / Proven / Waivers
// ============================================================================

/**
 * PRODUCED_LEAVES: leaves emitted by at least one autonomous producer.
 * Each entry is tagged with its producer(s) for traceability.
 *
 * To add a leaf here:
 *   1. Identify the producer (solver, driveshaft, bootstrap, prereq injection)
 *   2. Add the leaf to this set with a comment naming the producer
 *   3. Either add it to PROVEN_LEAVES (with E2E test) or PROOF_WAIVERS
 */
const PRODUCED_LEAVES: ReadonlySet<string> = new Set([
  // Rig A: crafting solver (generateStepsFromSterling)
  'acquire_material',
  'craft_recipe',
  'smelt',
  'place_workstation',
  'place_block',
  // Rig B: tool progression solver (explore path)
  'explore_for_resources',
  // Rig G: building solver (toTaskStepsWithReplan)
  'prepare_site',
  'build_module',
  'place_feature',
  'building_step',
  'replan_building',
  'replan_exhausted',
  // Rig D: acquisition solver (trade/loot strategies)
  'interact_with_entity',
  'open_container',
  // Bootstrap lowering (expand_by_digest)
  'move_to',
  'step_forward_safely',
  // Hunger driveshaft
  'consume_food',
  // Executor prereq injection (programmatic, not task step)
  'introspect_recipe',
  // Reactive safety (EP-7) — bypasses executor, dispatches via actionTranslator
  'attack_entity',
  'equip_weapon',
  // Sleep driveshaft (Stage 1)
  'sleep',
]);

/**
 * PROVEN_LEAVES: leaves with E2E dispatch-chain proof.
 * Each leaf here has at least one test that asserts `executeTool('minecraft.<leaf>', ...)`
 * was called with the correct arguments after running through the full pipeline
 * (producer → step → mapping → executor).
 *
 * Safety-monitor bypass actions (attack_entity, equip_weapon) are proven via
 * `executeAction` assertions in safety-monitor-dispatch-e2e.test.ts — they bypass
 * the executor by design, so executeTool proof is structurally impossible.
 */
const PROVEN_LEAVES: ReadonlySet<string> = new Set([
  // gather-food-dispatch-chain-e2e.test.ts
  'acquire_material',
  'consume_food',
  // building-solver-dispatch-chain-e2e.test.ts
  'prepare_site',
  'build_module',
  'place_feature',
  'building_step',      // scaffold→building_step dispatch proof
  'replan_building',    // deficit path dispatch proof
  'replan_exhausted',   // sterling-planner sentinel dispatch proof
  // explore-replan-dispatch-e2e.test.ts, executor-task-loop-e2e.test.ts
  'explore_for_resources',
  'craft_recipe',
  // executor-task-loop-e2e.test.ts (tool-progression leaf dispatch proof)
  'smelt',
  'place_workstation',
  'place_block',
  'step_forward_safely', // bootstrap leaf dispatch proof
  // exploration-driveshaft-e2e.test.ts
  'move_to',
  // sleep-driveshaft-e2e.test.ts
  'sleep',
  // safety-monitor-dispatch-e2e.test.ts (executeAction path, not executeTool)
  'attack_entity',
  'equip_weapon',
  // executor-task-loop-e2e.test.ts — programmatic-only: ctx.introspectRecipe()
  // invoked by executor during craft_recipe pre-check, not via executeTool
  'introspect_recipe',
]);

/**
 * PROOF_WAIVERS: Produced leaves that lack E2E dispatch-chain proof.
 * Each waiver must have owner, reason, and targetFix to prevent silent acceptance.
 * Resolve by adding E2E proof and moving the leaf to PROVEN_LEAVES.
 */
interface ProofWaiver {
  leaf: string;
  owner: string;
  reason: string;
  targetFix: string;
  createdAt: string;
}

const PROOF_WAIVERS: readonly ProofWaiver[] = [
  {
    leaf: 'interact_with_entity',
    owner: 'planning-team',
    reason: 'Acquisition solver trade strategy exists but no E2E test (G-3 gap)',
    targetFix: 'Write acquisition solver E2E covering trade strategy',
    createdAt: '2026-02-14',
  },
  {
    leaf: 'open_container',
    owner: 'planning-team',
    reason: 'Acquisition solver loot strategy exists but no E2E test (G-3 gap)',
    targetFix: 'Write acquisition solver E2E covering loot strategy',
    createdAt: '2026-02-14',
  },
];

/**
 * Leaves that are Contracted but NOT Produced (passthrough/manual only).
 * Derived as: KNOWN_LEAVES - PRODUCED_LEAVES
 * These are dispatchable via REST/MCP but no autonomous producer emits them.
 */
function computeContractedOnly(): ReadonlySet<string> {
  return new Set([...KNOWN_LEAVES].filter((l) => !PRODUCED_LEAVES.has(l)));
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

  it('every produced leaf has a LeafArgContract', () => {
    const uncontracted = [...PRODUCED_LEAVES].filter((l) => !KNOWN_LEAVES.has(l));
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
    for (const leaf of PRODUCED_LEAVES) {
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
    // Catches accidental removal of a contract that a producer still needs
    const missing = [...PRODUCED_LEAVES].filter((l) => !KNOWN_LEAVES.has(l));
    expect(missing).toEqual([]);
  });
});

// ============================================================================
// Invariant B: Proven ⊆ Produced
// ============================================================================

describe('Invariant B: Proven ⊆ Produced', () => {

  it('every proven leaf is also in the produced set', () => {
    const orphanedProof = [...PROVEN_LEAVES].filter((l) => !PRODUCED_LEAVES.has(l));
    expect(
      orphanedProof,
      `Leaves claimed as E2E-proven but not in PRODUCED_LEAVES. If no producer emits ` +
      `this leaf autonomously, the E2E test is only covering manual/passthrough dispatch, ` +
      `which is misleading. Remove from PROVEN_LEAVES or add a producer. ` +
      `Orphaned proof: ${orphanedProof.join(', ')}`,
    ).toEqual([]);
  });
});

// ============================================================================
// Invariant C: Produced ∩ ¬Proven requires a waiver
// ============================================================================

describe('Invariant C: Produced-not-Proven requires waivers', () => {

  const producedNotProven = [...PRODUCED_LEAVES].filter((l) => !PROVEN_LEAVES.has(l));
  const waivedLeaves = new Set(PROOF_WAIVERS.map((w) => w.leaf));

  it('every produced-not-proven leaf has a waiver', () => {
    const unwaived = producedNotProven.filter((l) => !waivedLeaves.has(l));
    expect(
      unwaived,
      `Produced leaves without E2E proof AND without a waiver. Either add an E2E ` +
      `dispatch-chain test and move to PROVEN_LEAVES, or add a ProofWaiver with ` +
      `owner/reason/targetFix. Unwaived: ${unwaived.join(', ')}`,
    ).toEqual([]);
  });

  it('no waiver exists for a leaf that is already proven', () => {
    const staleWaivers = PROOF_WAIVERS.filter((w) => PROVEN_LEAVES.has(w.leaf));
    expect(
      staleWaivers.map((w) => w.leaf),
      `Waivers exist for already-proven leaves — remove them. ` +
      `Stale: ${staleWaivers.map((w) => w.leaf).join(', ')}`,
    ).toEqual([]);
  });

  it('no waiver exists for a leaf that is not produced', () => {
    const orphanedWaivers = PROOF_WAIVERS.filter((w) => !PRODUCED_LEAVES.has(w.leaf));
    expect(
      orphanedWaivers.map((w) => w.leaf),
      `Waivers exist for non-produced leaves — remove them. ` +
      `Orphaned: ${orphanedWaivers.map((w) => w.leaf).join(', ')}`,
    ).toEqual([]);
  });
});

// ============================================================================
// Invariant D: Waiver quality
// ============================================================================

describe('Invariant D: Waiver quality', () => {

  it('every waiver has non-empty owner, reason, and targetFix', () => {
    const invalid = PROOF_WAIVERS.filter(
      (w) => !w.owner?.trim() || !w.reason?.trim() || !w.targetFix?.trim(),
    );
    expect(
      invalid.map((w) => w.leaf),
      `Waivers with missing fields: ${invalid.map((w) => `${w.leaf} (owner=${w.owner}, reason=${w.reason}, targetFix=${w.targetFix})`).join('; ')}`,
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
// Contracted-only leaves (passthrough/manual)
// ============================================================================

describe('Contracted-only leaves (passthrough/manual)', () => {
  const contractedOnly = computeContractedOnly();

  it('contracted-only leaves are not in any producer set', () => {
    const leaks = [...contractedOnly].filter((l) => PRODUCED_LEAVES.has(l));
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
    const leaks = [...contractedOnly].filter((l) => PRODUCED_LEAVES.has(l));
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
    const leaks = [...INTENT_LEAVES].filter((l) => PRODUCED_LEAVES.has(l));
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

  it('KNOWN_LEAVES count matches Produced + Contracted-only', () => {
    const contractedOnly = computeContractedOnly();
    expect(
      KNOWN_LEAVES.size,
      `KNOWN_LEAVES size changed — a leaf was added or removed. ` +
      `Current: ${[...KNOWN_LEAVES].sort().join(', ')}`,
    ).toBe(PRODUCED_LEAVES.size + contractedOnly.size);
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
// Scoreboard (informational — prints on run for quick visibility)
// ============================================================================

describe('Reachability scoreboard', () => {
  it('prints current reachability summary', () => {
    const contractedOnly = computeContractedOnly();
    const producedNotProven = [...PRODUCED_LEAVES].filter((l) => !PROVEN_LEAVES.has(l));

    const summary = [
      `Contracted (KNOWN_LEAVES):     ${KNOWN_LEAVES.size}`,
      `  Produced + Proven (strong):   ${PROVEN_LEAVES.size}`,
      `  Produced, not Proven (gap):   ${producedNotProven.length} [${producedNotProven.sort().join(', ')}]`,
      `  Contracted-only (manual):     ${contractedOnly.size}`,
      `Intent leaves:                  ${INTENT_LEAVES.size}`,
      `Waivers active:                 ${PROOF_WAIVERS.length}`,
    ].join('\n');

    // This test always passes — it's here for visibility in test output
    console.log(`\n─── Reachability Scoreboard ───\n${summary}\n──────────────────────────────\n`);
    expect(true).toBe(true);
  });
});

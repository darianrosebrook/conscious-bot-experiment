/**
 * Reachability Governance Tests
 *
 * Negative-space guards that prevent silent capability creep. These tests
 * lock the reachability matrix as a **contract**: passthrough-only leaves
 * cannot gain autonomous producers, and orphaned leaves cannot be dispatched,
 * without an explicit opt-in via test updates.
 *
 * Two test sections:
 * - 2a: Passthrough-only reachability guard — no known producer emits these leaves
 * - 2b: Orphaned leaf dispatch guard — executor blocks these, no producer routes to them
 *
 * If a test fails after a code change, it means a leaf gained or lost reachability.
 * Update the classification intentionally — do not silently expand the reachable set.
 *
 * Run with: npx vitest run packages/planning/src/__tests__/reachability-governance.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOWN_LEAVES, INTENT_LEAVES } from '../modules/leaf-arg-contracts';
import { mapBTActionToMinecraft } from '../modules/action-mapping';
import { buildLeafAllowlist } from '../modular-server';
import { executeSterlingStep } from '../executor/sterling-step-executor';
import type { SterlingStepExecutorContext } from '../executor/sterling-step-executor.types';
import bootstrapFixture from '../server/__tests__/fixtures/bootstrap-lowering-v1.json';

// ============================================================================
// Classification sets — update these when reachability intentionally changes
// ============================================================================

/**
 * PASSTHROUGH_ONLY leaves: have a LeafArgContract and an action mapping,
 * but NO known autonomous producer (solver, driveshaft, bootstrap) emits them.
 * They are only reachable via manual API dispatch (passthrough from external callers).
 *
 * To move a leaf OUT of this set, you must:
 *   1. Create a producer (solver step, driveshaft controller, bootstrap case)
 *   2. Write an E2E test proving the dispatch chain
 *   3. Remove the leaf from this set
 */
const PASSTHROUGH_ONLY: ReadonlySet<string> = new Set([
  'place_torch_if_needed',
  'place_torch',
  'equip_tool',
  'retreat_from_threat',
  'retreat_and_block',
  'use_item',
  'manage_inventory',
  'till_soil',
  'harvest_crop',
  'manage_farm',
  'interact_with_block',
  'sense_hostiles',
  'get_light_level',
  'get_block_at',
  'find_resource',
  'dig_block',
  'collect_items',
  'chat',
  'wait',
]);

/**
 * AUTONOMOUSLY_REACHABLE leaves: have at least one known producer path.
 * Each of these should have E2E test coverage (or a tracked gap).
 */
const AUTONOMOUSLY_REACHABLE: ReadonlySet<string> = new Set([
  // Rig A / Rig B (crafting + tool progression solvers)
  'acquire_material',
  'craft_recipe',
  'smelt',
  'place_workstation',
  'place_block',
  // Rig B (tool progression) — explore path
  'explore_for_resources',
  // Rig G (building solver)
  'prepare_site',
  'build_module',
  'place_feature',
  'building_step',
  'replan_building',
  'replan_exhausted',
  // Rig D (acquisition solver) — routes through interact/open
  'interact_with_entity',
  'open_container',
  // Bootstrap lowering
  'move_to',
  'step_forward_safely',
  // Hunger driveshaft
  'consume_food',
  // Introspect recipe — used by executor prereq injection
  'introspect_recipe',
  // Reactive safety (EP-7) — safety monitor dispatches these
  'attack_entity',
  'equip_weapon',
  // Sleep driveshaft (Stage 1)
  'sleep',
]);

/**
 * Leaves from known producers, collected by scanning each producer's output space.
 * This is the "all known producers" union — used to verify no passthrough-only leaf
 * accidentally appears in any producer.
 */
const ALL_KNOWN_PRODUCER_LEAVES: ReadonlySet<string> = new Set([
  // Rig A: crafting solver (sterling-planner.ts generateStepsFromSterling)
  'acquire_material', 'craft_recipe', 'smelt', 'place_workstation', 'place_block',
  // Rig B: tool progression solver (generateToolProgressionStepsFromSterling)
  // Same as Rig A + explore_for_resources
  'explore_for_resources',
  // Rig G: building solver (toTaskStepsWithReplan)
  'prepare_site', 'build_module', 'place_feature', 'building_step',
  'replan_building', 'replan_exhausted',
  // Rig D: acquisition solver (generateAcquisitionStepsFromSterling)
  'interact_with_entity', 'open_container',
  // Compiler fallback (requirementToFallbackPlan)
  // Emits: acquire_material, craft_recipe, build_module (already listed)
  // Hunger driveshaft
  'consume_food',
  // Exploration driveshaft
  'move_to',
  // Bootstrap lowering
  'step_forward_safely',
  // Executor prereq injection (introspect before craft)
  'introspect_recipe',
  // Reactive safety (EP-7) — safety monitor dispatches these
  'attack_entity', 'equip_weapon',
  // Sleep driveshaft (Stage 1)
  'sleep',
]);

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
// 2a: Passthrough-Only Reachability Guard
// ============================================================================

describe('Passthrough-Only Reachability Guard', () => {

  // ── Classification completeness ──

  it('PASSTHROUGH_ONLY + AUTONOMOUSLY_REACHABLE covers all KNOWN_LEAVES', () => {
    const allClassified = new Set([...PASSTHROUGH_ONLY, ...AUTONOMOUSLY_REACHABLE]);
    const unclassified = [...KNOWN_LEAVES].filter((l) => !allClassified.has(l));

    expect(
      unclassified,
      `Unclassified leaves found — add them to PASSTHROUGH_ONLY or AUTONOMOUSLY_REACHABLE: ${unclassified.join(', ')}`,
    ).toEqual([]);
  });

  it('PASSTHROUGH_ONLY and AUTONOMOUSLY_REACHABLE are disjoint', () => {
    const overlap = [...PASSTHROUGH_ONLY].filter((l) => AUTONOMOUSLY_REACHABLE.has(l));
    expect(
      overlap,
      `Leaves in both sets — classify as one or the other: ${overlap.join(', ')}`,
    ).toEqual([]);
  });

  it('all PASSTHROUGH_ONLY leaves are in KNOWN_LEAVES (have contracts)', () => {
    const missing = [...PASSTHROUGH_ONLY].filter((l) => !KNOWN_LEAVES.has(l));
    expect(
      missing,
      `Passthrough-only leaves missing from KNOWN_LEAVES: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  // ── Action mapping exists for passthrough-only ──

  it('each passthrough-only leaf has a valid action mapping', () => {
    const failures: string[] = [];
    for (const leaf of PASSTHROUGH_ONLY) {
      const action = mapBTActionToMinecraft(leaf, {});
      if (!action) {
        failures.push(`${leaf}: no action mapping`);
      }
    }
    expect(
      failures,
      `Passthrough-only leaves without action mappings:\n${failures.join('\n')}`,
    ).toEqual([]);
  });

  // ── No known producer emits passthrough-only leaves ──

  it('no known producer emits any passthrough-only leaf', () => {
    const leaks = [...PASSTHROUGH_ONLY].filter((l) => ALL_KNOWN_PRODUCER_LEAVES.has(l));
    expect(
      leaks,
      `Passthrough-only leaves found in producer output set — reclassify to AUTONOMOUSLY_REACHABLE or remove from producer: ${leaks.join(', ')}`,
    ).toEqual([]);
  });

  it('bootstrap lowering fixture does not emit passthrough-only leaves', () => {
    const cases = (bootstrapFixture as any).cases;
    const bootstrapLeaves: string[] = [];
    for (const caseName of Object.keys(cases)) {
      for (const step of cases[caseName].steps) {
        bootstrapLeaves.push(step.leaf);
      }
    }

    const leaks = bootstrapLeaves.filter((l) => PASSTHROUGH_ONLY.has(l));
    expect(
      leaks,
      `Bootstrap fixture emits passthrough-only leaves: ${leaks.join(', ')}`,
    ).toEqual([]);
  });

  // ── Executor behavior for passthrough-only (they ARE in the allowlist) ──

  it('passthrough-only leaves ARE in the executor allowlist (they are dispatchable via API)', () => {
    const allowlist = buildLeafAllowlist(KNOWN_LEAVES, INTENT_LEAVES, false);
    const blocked: string[] = [];
    for (const leaf of PASSTHROUGH_ONLY) {
      if (!allowlist.has(`minecraft.${leaf}`)) {
        blocked.push(leaf);
      }
    }
    expect(
      blocked,
      `Passthrough-only leaves unexpectedly missing from allowlist: ${blocked.join(', ')}`,
    ).toEqual([]);
  });
});

// ============================================================================
// 2b: Orphaned / Intent Leaf Dispatch Guard
// ============================================================================

describe('Orphaned / Intent Leaf Dispatch Guard', () => {

  // ── Intent leaves are NOT in KNOWN_LEAVES ──

  it('intent leaves (task_type_*) are not in KNOWN_LEAVES', () => {
    const overlap = [...INTENT_LEAVES].filter((l) => KNOWN_LEAVES.has(l));
    expect(
      overlap,
      `Intent leaves found in KNOWN_LEAVES — they should be structurally separate: ${overlap.join(', ')}`,
    ).toEqual([]);
  });

  // ── Intent leaves are NOT in executor allowlist (when bridge disabled) ──

  it('intent leaves are blocked by executor allowlist when bridge disabled', () => {
    const allowlist = buildLeafAllowlist(KNOWN_LEAVES, INTENT_LEAVES, false);
    const leaked: string[] = [];
    for (const leaf of INTENT_LEAVES) {
      if (allowlist.has(`minecraft.${leaf}`)) {
        leaked.push(leaf);
      }
    }
    expect(
      leaked,
      `Intent leaves in allowlist without bridge enabled: ${leaked.join(', ')}`,
    ).toEqual([]);
  });

  it('intent leaves ARE in executor allowlist when bridge enabled (dev only)', () => {
    const allowlist = buildLeafAllowlist(KNOWN_LEAVES, INTENT_LEAVES, true);
    const missing: string[] = [];
    for (const leaf of INTENT_LEAVES) {
      if (!allowlist.has(`minecraft.${leaf}`)) {
        missing.push(leaf);
      }
    }
    expect(
      missing,
      `Intent leaves missing from allowlist with bridge enabled: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  // ── No known producer emits intent leaves ──

  it('no known producer emits intent leaves', () => {
    const leaks = [...INTENT_LEAVES].filter((l) => ALL_KNOWN_PRODUCER_LEAVES.has(l));
    expect(
      leaks,
      `Intent leaves found in producer output — they should only come from Sterling expand-by-digest: ${leaks.join(', ')}`,
    ).toEqual([]);
  });

  // ── Executor rejects leaves NOT in allowlist ──

  it('executor blocks a leaf not in the allowlist', async () => {
    const ctx = createMockExecutorContext({
      // Use a restricted allowlist that omits the test leaf
      leafAllowlist: new Set(['minecraft.acquire_material']),
    });

    const step = makeStepForLeaf('till_soil', {});
    const task = makeTask([step]);

    await executeSterlingStep(task, step, ctx);

    // executeTool should NOT have been called
    expect(ctx.executeTool).not.toHaveBeenCalled();

    // updateTaskMetadata should have been called with a block reason
    expect(ctx.updateTaskMetadata).toHaveBeenCalled();
  });

  it('executor blocks intent leaf even when bridge is disabled', async () => {
    const ctx = createMockExecutorContext();
    // Intent leaf step — should be rejected at the intent-leaf gate
    const step = makeStepForLeaf('task_type_craft', { recipe: 'wooden_pickaxe' });
    const task = makeTask([step]);

    await executeSterlingStep(task, step, ctx);

    expect(ctx.executeTool).not.toHaveBeenCalled();
  });

  // ── Autonomously reachable leaves have producer coverage ──

  it('every autonomously reachable leaf appears in the known producer set', () => {
    const missing = [...AUTONOMOUSLY_REACHABLE].filter(
      (l) => !ALL_KNOWN_PRODUCER_LEAVES.has(l),
    );
    expect(
      missing,
      `Leaves classified as AUTONOMOUSLY_REACHABLE but missing from ALL_KNOWN_PRODUCER_LEAVES: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every leaf in the known producer set is classified as autonomously reachable', () => {
    const misclassified = [...ALL_KNOWN_PRODUCER_LEAVES].filter(
      (l) => !AUTONOMOUSLY_REACHABLE.has(l),
    );
    expect(
      misclassified,
      `Leaves in producer set but not classified as AUTONOMOUSLY_REACHABLE: ${misclassified.join(', ')}`,
    ).toEqual([]);
  });
});

// ============================================================================
// Producer contract safety — no producer emits uncontracted leaves
// ============================================================================

describe('Producer contract safety', () => {

  it('every leaf in ALL_KNOWN_PRODUCER_LEAVES has a LeafArgContract', () => {
    const uncontracted = [...ALL_KNOWN_PRODUCER_LEAVES].filter(
      (l) => !KNOWN_LEAVES.has(l),
    );
    expect(
      uncontracted,
      `Producer(s) emit leaves without a LeafArgContract. These steps will ALWAYS fail ` +
      `at the executor (no contract → no allowlist entry → blocked). Either add a ` +
      `LeafArgContract in leaf-arg-contracts.ts, or stop emitting the leaf from the ` +
      `producer. Uncontracted leaves: ${uncontracted.join(', ')}`,
    ).toEqual([]);
  });

  it('every leaf in ALL_KNOWN_PRODUCER_LEAVES has an action mapping', () => {
    const unmapped: string[] = [];
    for (const leaf of ALL_KNOWN_PRODUCER_LEAVES) {
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
});

// ============================================================================
// Classification drift detection
// ============================================================================

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
 */

const SAFETY_MONITOR_ALLOWED_ACTIONS: ReadonlySet<string> = new Set([
  'navigate',       // Flee: move to computed flee target (emergency lease)
  'move_forward',   // Flee fallback: move forward when no flee target computed
  'find_shelter',   // Shelter response: find and navigate to shelter
  'equip_weapon',   // Combat prep: equip best available weapon
  'attack_entity',  // Combat: attack nearest hostile entity
]);

describe('Safety monitor bypass-path governance', () => {

  it('safety monitor source only contains allowed executeAction types (fail-closed)', () => {
    // Read the actual source to extract all executeAction type values.
    // This is a source-level contract — if someone adds a new executeAction call,
    // this test forces them to explicitly add it to SAFETY_MONITOR_ALLOWED_ACTIONS.
    //
    // FAIL-CLOSED: if we find an executeAction( block but cannot extract a literal
    // type string, that is treated as a governance violation — not silently ignored.
    // This prevents bypassing the lock via computed types or spread patterns.
    const thisDir = typeof __dirname !== 'undefined'
      ? __dirname
      : dirname(fileURLToPath(import.meta.url));
    const monitorPath = resolve(
      thisDir,
      '../../../minecraft-interface/src/automatic-safety-monitor.ts',
    );
    const source = readFileSync(monitorPath, 'utf-8');

    // Split on executeAction( — each chunk after the first is a call site.
    // For each call site, extract the argument block up to the matching closing
    // paren (handles nested parens/objects correctly).
    const chunks = source.split('executeAction(');
    const actionTypes: string[] = [];
    const unresolvable: string[] = [];

    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Find the argument block: count parens to find the matching close.
      // Start at depth=1 since we've already consumed the opening paren.
      let depth = 1;
      let end = 0;
      for (let j = 0; j < chunk.length && depth > 0; j++) {
        if (chunk[j] === '(') depth++;
        else if (chunk[j] === ')') depth--;
        end = j;
      }
      const argBlock = chunk.slice(0, end);

      // Extract the type field from the full argument block
      const typeMatch = argBlock.match(/type:\s*['"]([^'"]+)['"]/);
      if (typeMatch) {
        actionTypes.push(typeMatch[1]);
      } else {
        // FAIL-CLOSED: could not extract a literal type string.
        // This means someone used a variable, spread, or other non-literal pattern.
        const preview = argBlock.slice(0, 80).replace(/\n/g, ' ').trim();
        unresolvable.push(`call #${i}: ${preview}...`);
      }
    }

    expect(
      actionTypes.length,
      'Expected to find at least one executeAction type in safety monitor source',
    ).toBeGreaterThan(0);

    // Fail-closed: non-literal types are governance violations
    expect(
      unresolvable,
      `Found executeAction() calls without literal type strings. This bypass ` +
      `governance lock requires all action types to be string literals so they ` +
      `can be statically verified. Refactor to use literal types, or add an ` +
      `explicit exemption. Unresolvable calls:\n${unresolvable.join('\n')}`,
    ).toEqual([]);

    const unauthorized = actionTypes.filter((t) => !SAFETY_MONITOR_ALLOWED_ACTIONS.has(t));
    expect(
      unauthorized,
      `Safety monitor dispatches unauthorized action types via executeAction(). ` +
      `These bypass the executor allowlist entirely. Either add them to ` +
      `SAFETY_MONITOR_ALLOWED_ACTIONS (with E2E test coverage), or remove the ` +
      `dispatch call. Unauthorized: ${unauthorized.join(', ')}`,
    ).toEqual([]);
  });

  it('SAFETY_MONITOR_ALLOWED_ACTIONS count is pinned', () => {
    // If this fails, an action was added or removed. Update the set AND add E2E coverage.
    expect(
      SAFETY_MONITOR_ALLOWED_ACTIONS.size,
      `Safety monitor allowed actions count changed. Current: ${[...SAFETY_MONITOR_ALLOWED_ACTIONS].sort().join(', ')}`,
    ).toBe(5);
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

describe('Classification drift detection', () => {

  it('KNOWN_LEAVES count matches expected (detect new leaves)', () => {
    // If this fails, a new leaf was added to leaf-arg-contracts.ts.
    // Classify it in PASSTHROUGH_ONLY or AUTONOMOUSLY_REACHABLE above.
    expect(
      KNOWN_LEAVES.size,
      `KNOWN_LEAVES size changed — a leaf was added or removed. Update the classification sets above. Current leaves: ${[...KNOWN_LEAVES].sort().join(', ')}`,
    ).toBe(PASSTHROUGH_ONLY.size + AUTONOMOUSLY_REACHABLE.size);
  });

  it('INTENT_LEAVES count matches expected (detect new intent leaves)', () => {
    expect(INTENT_LEAVES.size).toBe(10);
  });

  it('no leaf appears in both KNOWN_LEAVES and INTENT_LEAVES', () => {
    const overlap = [...KNOWN_LEAVES].filter((l) => INTENT_LEAVES.has(l));
    expect(overlap).toEqual([]);
  });
});

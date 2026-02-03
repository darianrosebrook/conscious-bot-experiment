# Execution Path Hardening Tracker (Phase 2 → 2.5 → P1-1)

**Date:** 2026-02-03
**Scope:** Hardening the TS executor + reactive executor so failures are visible, classified, and non-self-masking.

**Companion docs:**
- `docs/testing/live-execution-evaluation-phase2.md` (live validation findings)
- `docs/planning/leaf_execution_pipeline.md` (leaf inventory + known E2E state)

---

## Framing (the "why")

We treat the executor like a compiler pipeline:
- **Infra failures** are global scheduling faults (circuit breaker)
- **Shadow mode** is intentional non-execution (blocked, no retries burned)
- **Deterministic defects** are "type errors" (fail-fast; no backoff)
- **Retryable variance** is a runtime/environment error (backoff allowed)

This prevents defect-masking and makes "what is broken" queryable by `failureCode` + `blockedReason`.

---

## Executive Summary

This document summarizes the execution path hardening work completed across Phase 2, Phase 2.5, and P1-1. The goal was to fix three conflated failure modes:

1. **Infra failures** (bot disconnected, network timeout) — should not burn per-task retries
2. **Shadow mode** — intentional non-execution, should block without consuming retries
3. **Domain failures** — split into:
   - **Deterministic defects** (bad mapping, invalid args) — fail fast, no retry
   - **Retryable variance** (no resource nearby, path blocked) — retry/backoff appropriate

---

## Phase 2: Execution Path Hardening

### 2.1 Pure Task Selection + TTL Policy

**File:** `packages/planning/src/server/task-block-evaluator.ts`

- `shouldAutoUnblockTask(task, mode)` — determines if a blocked task should auto-unblock
- `evaluateTaskBlockState(task, nowMs)` — evaluates TTL and blocking conditions
- `isTaskEligible(task, nowMs)` — **allowlist-based** eligibility check (only `active`/`in_progress` are runnable)

**Tests:** `packages/planning/src/server/__tests__/task-block-evaluator.test.ts`

### 2.2 Executor Circuit Breaker

**File:** `packages/planning/src/server/executor-circuit-breaker.ts`

- `tripCircuitBreaker(reason)` — trips breaker on infra error
- `isCircuitBreakerOpen(nowMs)` — checks if scheduling should pause
- `recordSuccess()` — records success, may reset breaker
- Exponential backoff: 5s → 10s → 20s → 40s → 60s (max)
- Reset after 3 consecutive successes

**Tests:** `packages/planning/src/server/__tests__/executor-circuit-breaker.test.ts`

### 2.3 Strip `__nav` at Leaf Dispatch

**File:** `packages/minecraft-interface/src/action-translator.ts`

- `stripReservedMeta(params)` — removes `__nav` before leaf execution
- Applied in `_runLeaf`, `executeCraftItem`, `executeSmeltItem`, `executeDigBlock`

**Tests:** `packages/minecraft-interface/src/__tests__/navigation-lease.test.ts`

### 2.4 Typed Gateway Wrappers

**File:** `packages/planning/src/server/gateway-wrappers.ts`

- `executeTaskViaGateway(taskId, action, signal?)` — for autonomous executor
- `executeReactiveViaGateway(taskId, action, signal?)` — for reactive executor
- `executeSafetyViaGateway(action, signal?)` — for safety monitor
- `executeCognitionViaGateway(action, taskId?, signal?)` — for cognition-triggered

**Tests:** `packages/planning/src/server/__tests__/execution-drift-guard.test.ts`

---

## Phase 2.5: Semantic Adapter Layer

### 2.5.1 Centralized Task → Action Resolver

**File:** `packages/planning/src/server/task-action-resolver.ts`

**Purpose:** Single source of truth for converting tasks to gateway-ready actions.

**Resolution Precedence (deterministic):**
1. Legacy fields: `task.parameters.item`, `.block`, `.recipe`
2. Requirement candidate: `task.parameters.requirementCandidate.outputPattern`
3. Step meta.args: `task.steps[0].meta.args.recipe`, `.block`
4. Title inference (last resort heuristic)

**Contract:**
```typescript
type ResolveResult =
  | { ok: true; action: GatewayAction; resolvedFrom: string; evidence: ResolveEvidence }
  | { ok: false; category: ResolveCategory; retryable: false; failureCode: string; evidence: ResolveEvidence }
```

**Key Functions:**
- `resolveActionFromTask(task)` — main entry point
- `isMappingFailure(result)` — checks if failure is mapping-related
- `isDeterministicFailure(failureCode)` — checks if failure should skip retry/backoff
- `createDeterministicFailure(err)` — creates structured failure response

**Tests:** `packages/planning/src/server/__tests__/task-action-resolver.test.ts`

### 2.5.2 Resolver Integration in Reactive Executor

**File:** `packages/planning/src/reactive-executor/reactive-executor.ts`

**Modified Methods:**
- `executeCraftTask` — uses resolver instead of `task.parameters?.item || 'item'`
- `executeMineTask` — uses resolver instead of `task.parameters?.block || 'stone'`
- `executeGatherTask` — uses resolver for consistent extraction
- `executeExploreTask` — uses resolver (permissive, always succeeds)
- `executeMoveTask` — uses resolver (permissive, always succeeds)

### 2.5.3 Activation at Dispatch Boundary

**File:** `packages/planning/src/task-integration.ts`

**Added:** `ensureActivated(taskId): Promise<boolean>`
- If status is `pending`, transitions to `active`
- If already `active`/`completed`/`failed`, no-op
- Returns true if activation occurred

**Interface Update:** `packages/planning/src/interfaces/task-integration.ts`

**Integration:** `packages/planning/src/modular-server.ts`
- Called before `reactiveExecutor.executeTask(task)` in both `executeGoal` and `executeTask`

**Invariant:** "If a task is dispatched to the gateway, it cannot remain 'pending' after the cycle"

**Tests:** `packages/planning/src/server/__tests__/activation-invariant.test.ts`

---

## P1-1: Deterministic Failures Fail Fast

### Failure Classification

**Deterministic (non-retryable):**
- `mapping_*` — resolver couldn't find valid args
- `contract_*` — leaf contract/schema violation
- `postcondition_*` — action ran but state didn't change as expected
- Terminal codes: `invalid_input`, `unknown_recipe`, `inventory_full`, etc.

**Retryable:**
- `timeout`, `stuck`, `busy`
- `acquire.noneCollected` — resource might spawn
- `navigate.unreachable` — path might clear

### Early Exit in Executor

**File:** `packages/planning/src/modular-server.ts`

When a step fails, before retry/backoff:
```typescript
if (isDeterministicFailure(failureCode)) {
  // Fail immediately without retry/backoff
  taskIntegration.updateTaskMetadata(currentTask.id, {
    blockedReason: `deterministic-failure:${failureCode}`,
    failureCode,
    failureError: actionResult?.error,
  });
  taskIntegration.updateTaskProgress(currentTask.id, progress, 'failed');
  return; // Exit without retry/backoff
}
```

---

## Test Summary

| Test File | Tests | Purpose |
|-----------|-------|---------|
| `task-block-evaluator.test.ts` | 30 | TTL policy, eligibility allowlist |
| `executor-circuit-breaker.test.ts` | 22 | Infra error handling |
| `execution-drift-guard.test.ts` | 11 | Gateway wrapper usage enforcement |
| `task-action-resolver.test.ts` | 64 | Resolver logic, deterministic failure classification |
| `activation-invariant.test.ts` | 23 | Activation contracts |
| `equip-tool-postcondition.test.ts` | 10 | P1-2 postcondition verification |

**Total: 160 tests**

---

## Completed: P1-2 Leaf Postcondition Verification

### equip_tool Postcondition Verification (DONE)

**File:** `packages/minecraft-interface/src/leaves/combat-leaves.ts`

After `bot.equip()` returns, the leaf now verifies `bot.heldItem` matches the expected tool:

```typescript
await bot.equip(bestItem, 'hand');

const heldItem = bot.heldItem;
if (!heldItem || heldItem.name !== bestItem.name) {
  return {
    status: 'failure',
    error: {
      code: 'postcondition_failed:equip_tool',
      retryable: false, // Deterministic failure
      detail: `Equip call succeeded but held item is '${heldItem?.name ?? 'nothing'}', expected '${bestItem.name}'`,
    },
    metrics: { durationMs: ctx.now() - t0, retries: 0, timeouts: 0 },
  };
}
```

**Type Updates:** `packages/core/src/mcp-capabilities/leaf-contracts.ts`
- Added `postcondition_failed:equip_tool` to `ExecErrorCode` union

**Tests:** `packages/minecraft-interface/src/leaves/__tests__/equip-tool-postcondition.test.ts`
- 10 tests covering success, postcondition failures, and retryability contracts

### place_workstation Postcondition Verification (Already Implemented)

The `place_workstation` leaf already had postcondition verification checking `bot.blockAt()`.

---

## Known Remaining Gaps

### P1-3: Failure Taxonomy Coverage

Audit top N failure codes in live runs and explicitly classify each as deterministic vs retryable.

### P1-4: Resolver Modularization

The resolver is ~900 LOC. Consider splitting into:
- `resolver/core.ts` — types, result envelope
- `resolver/sources/*.ts` — each source returns `Candidate | null`
- `resolver/actions/*.ts` — per-action-type resolvers

### P1-5: End-of-Cycle Census Logging

Emit structured log at end of each executor cycle:
- Tasks by status
- Tasks by blockedReason
- Tasks in backoff
- Deterministic failures by failureCode

### P1-6: Title Inference Gating

Title inference should require confidence threshold or feature flag to prevent "plausible but wrong" mappings.

### P1-7: Atomic `ensureActivated`

Current implementation is idempotent but not atomic. May need CAS-like store operation for concurrent dispatchers.

---

## Files Changed Summary

### Created
- `packages/planning/src/server/task-block-evaluator.ts`
- `packages/planning/src/server/executor-circuit-breaker.ts`
- `packages/planning/src/server/gateway-wrappers.ts`
- `packages/planning/src/server/task-action-resolver.ts`
- `packages/planning/src/server/__tests__/task-block-evaluator.test.ts`
- `packages/planning/src/server/__tests__/executor-circuit-breaker.test.ts`
- `packages/planning/src/server/__tests__/execution-drift-guard.test.ts`
- `packages/planning/src/server/__tests__/task-action-resolver.test.ts`
- `packages/planning/src/server/__tests__/activation-invariant.test.ts`
- `packages/minecraft-interface/src/leaves/__tests__/equip-tool-postcondition.test.ts` — P1-2 postcondition tests

### Modified
- `packages/planning/src/modular-server.ts` — circuit breaker integration, deterministic failure early-exit, ensureActivated calls
- `packages/planning/src/task-integration.ts` — added `ensureActivated()` method
- `packages/planning/src/interfaces/task-integration.ts` — added `ensureActivated` to interface
- `packages/planning/src/reactive-executor/reactive-executor.ts` — integrated resolver
- `packages/minecraft-interface/src/action-translator.ts` — `__nav` stripping
- `packages/minecraft-interface/src/leaves/combat-leaves.ts` — P1-2 postcondition verification for equip_tool
- `packages/core/src/mcp-capabilities/leaf-contracts.ts` — added postcondition error codes to ExecErrorCode

---

## Verification Commands

```bash
# Run all Phase 2.5 tests
npx vitest run packages/planning/src/server/__tests__/task-block-evaluator.test.ts
npx vitest run packages/planning/src/server/__tests__/executor-circuit-breaker.test.ts
npx vitest run packages/planning/src/server/__tests__/execution-drift-guard.test.ts
npx vitest run packages/planning/src/server/__tests__/task-action-resolver.test.ts
npx vitest run packages/planning/src/server/__tests__/activation-invariant.test.ts
npx vitest run packages/minecraft-interface/src/leaves/__tests__/equip-tool-postcondition.test.ts

# Type check
npx tsc --noEmit -p packages/planning/tsconfig.json

# Live validation soak test (requires full bot running)
./scripts/soak-test-agency.sh 12

# Combined soak test (agency + memory reflection in parallel)
./scripts/soak-test-combined.sh 5
```

---

## Live Validation: Soak Test Enhancements

The soak test (`scripts/soak-test-agency.sh`) now includes execution hardening observability:

### New Metrics Captured

1. **Failure Code Taxonomy**
   - Counts by `failureCode` (e.g., `mapping_no_resolution`, `postcondition_failed:equip_tool`)
   - Deterministic vs retryable classification

2. **Blocked Reason Breakdown**
   - `deterministic-failure:*` — fail-fast without retry
   - `backoff:*` — transient failure with exponential backoff
   - `prereq-injection` — prerequisite step injected

3. **Postcondition Failures**
   - Tracks `postcondition_failed:equip_tool` and `postcondition_failed:place_workstation`
   - Indicates leaf verification caught a false-positive success

### New Acceptance Criteria

```
[PASS] Failed tasks have failureCode
[PASS] Deterministic failures marked (no backoff)
[PASS] No pending tasks with retry attempts (activation invariant)
```

### Sample Output

```
--- Execution hardening analysis (Phase 2.5) ---
  Failure codes: {'mapping_no_resolution': 2, 'postcondition_failed:equip_tool': 1}
  Blocked reasons: {'deterministic-failure': 3, 'backoff': 1}
  Deterministic failures: 3
    [task-1] mapping_no_resolution | Craft wooden_pickaxe
  Postcondition failures: 1
    [task-2] postcondition_failed:equip_tool | Equip iron_pickaxe
  Retryable failures: 1
    [task-3] timeout | Navigate to tree
```

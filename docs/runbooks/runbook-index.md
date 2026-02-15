# Operational Runbook Index

## Purpose
Quick-reference index of operational runbooks for conscious-bot development and debugging. Each runbook is task-oriented and includes copy-paste commands, prerequisites, and success criteria.

## Available Runbooks

### Testing & Verification

#### [Leaf Reachability & Coverage](./leaf-reachability-runbook.md)
**Purpose**: Full inventory of every leaf, its pipeline reachability, which tests cover it, and commands to verify each path
**Use when**: Auditing leaf coverage, checking "bot never does X", verifying all E2E paths after refactoring, adding new leaves/producers
**Key sections**: Reachability classification (REACHABLE/REACTIVE-ONLY/PASSTHROUGH-ONLY/ORPHANED), 8 pipeline entry points (EP-1..EP-8), test suite map, coverage gaps (G-1..G-8)
**Source**: Reachability audit of `leaf-arg-contracts.ts`, `action-mapping.ts`, `step-to-leaf-execution.ts`, all solver files, all driveshaft controllers

#### [Sterling Smoke Test](./sterling-smoke-runbook.md)
**Purpose**: Prove end-to-end Sterling → leaf execution pipeline
**Use when**: Quick sanity check, testing executor changes, diagnosing Sterling integration issues
**Key variants**: `ok` (happy path), `ok_fresh` (never dedupes), `unknown_digest` (F2 test), `slow_wait` (F6 test)
**Source**: `docs/leaf-execution-pipeline.md` → Sterling→Leaf Correlation Proof section

#### [Golden Run Test](./golden-run-runbook.md)
**Purpose**: Prove end-to-end routing and execution for `sterling_ir` tasks with durable artifacts
**Use when**: Full pipeline proof including idle episodes and reduce→digest selection
**Key stages**: Stage 1 (manual injection), Stage 2 (idle → Sterling → task)
**Source**: STIR-510

### Implementation & Integration

#### [Leaf Creation](./leaf-creation-runbook.md)
**Purpose**: Step-by-step guide to implementing a new leaf with full pipeline integration
**Use when**: Extending bot capabilities with new actions
**Key phases**: Design & Contracts → Implementation → Testing → Integration → Verification Strategy
**Source**: `docs/leaf-execution-pipeline.md` (Leaf Inventory, Action Contract Registry, Solver → Leaf Routing)

### Debugging & Diagnostics

#### [Debugging Leaf Dispatch Failures](./debugging-leaf-dispatch-runbook.md)
**Purpose**: Systematic diagnosis of dispatch failures at each pipeline stage
**Use when**: Steps fail to execute, dispatch timeouts, navigation lease preemption
**Key sections**: 8-stage pipeline trace, failure mode reference (F1-F6 + NAV), navigation lease debugging, Rig G debugging
**Source**: `docs/leaf-execution-pipeline.md` (Pipeline Overview, Failure Modes), `docs/bot-sterling-task-execution-pipeline.md` (Guard Pipeline)

#### [Receipt-Anchored Verification](./receipt-anchored-verification-runbook.md)
**Purpose**: Using and debugging receipt-anchored verification for placement leaves
**Use when**: Implementing placement leaves, debugging "5 cobblestones" type bugs, diagnosing verification failures
**Key sections**: Tri-state model, receipt flow diagram, per-leaf verification table, adding receipt verification to new leaves
**Source**: `docs/leaf-execution-pipeline.md` → Receipt-Anchored Verification section; `packages/planning/src/task-integration.ts`

---

## Planned Runbooks

#### Leaf Contract Alignment Check
**Purpose**: Verify planning ↔ MC normalization agreement for action parameters
**Use when**: Adding new action types, debugging parameter mismatch errors, CI contract tests
**Will cover**: Running contract-alignment tests, fixing alias mismatches, requiredKeys enforcement, idempotency
**Source**: `packages/planning/src/modules/__tests__/contract-alignment.test.ts`, `packages/minecraft-interface/src/action-contract-registry.ts`

#### Composability Gap Workarounds
**Purpose**: Known gaps and their mitigations until proper fixes land
**Use when**: Hitting known issues like workstation sprawl, auto-equip missing, block→drop name mismatch
**Will cover**: P0/P1/P2 gaps, planner-side workarounds, manual workarounds for testing
**Source**: `docs/leaf-execution-pipeline.md` → Known Composability Gaps section; `docs/runbooks/leaf-reachability-runbook.md` → Coverage Gaps G-1..G-8

---

## Runbook Template

When creating a new runbook, follow this structure (see `sterling-smoke-runbook.md` as reference):

```markdown
# <Runbook Title>

## Purpose
[Single sentence: what this proves/achieves]

## Required Env
[Env vars and prerequisites]

## Step-by-Step Procedure
[Numbered steps with copy-paste commands]

## Success Criteria
[What "passing" looks like]

## Failure Modes
[Table of failures, signals, and fixes]

## Debugging Tips
[Common issues and how to diagnose]

## Copy-Paste Commands
[One-liners for common operations]

## Related Runbooks
[Links to related docs]

---

*Last updated: YYYY-MM-DD*
*Source: <reference to source doc/section>*
```

---

## Contributing

To add a new runbook:

1. Create `docs/planning/<runbook-name>-runbook.md`
2. Follow the runbook template above
3. Add entry to this index under "Available Runbooks" with the appropriate category
4. Link to source sections in pipeline docs (use section names, not line numbers)

---

*Last updated: 2026-02-13*

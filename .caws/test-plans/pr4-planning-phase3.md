# Test Plan: PR4 Phase 3 Planning Migration

## Scope
- Planning task conversion based on `ReductionProvenance` only.
- Fail-closed behavior for missing/invalid reduction.
- Dedupe via `committed_ir_digest`.
- Boundary ratchet for legacy semantics in planning.

## Unit Tests
- T1: fail-closed when `reduction` missing. [A1]
- T2: fail-closed when `sterlingProcessed=false`. [A1, A7]
- T3: fail-closed when `isExecutable=false`. [A2]
- T4: fail-closed when `committed_ir_digest` missing. [A1]
- T5: create task when reduction ok and digest present. [A3]
- T6: dedupe by `committed_ir_digest`. [A4]
- T7: legacy `extractedGoal` ignored even if present. [A6]
- T8: boundary ratchet fails on `GoalTagV1` or `[GOAL:]` parsing. [A5]

## Property Tests
- P1: any invalid reduction implies no task created. [A1]

## Integration Tests
- I1: cognition stream thought (reduction ok) -> conversion -> task store. [A3, A4]

## Contract Tests
- C1: cognition observation contract includes `metadata.reduction`. [A1, A3]

## Mutation Tests
- M1: mutate fail-closed guards to allow null reduction, tests must fail. [A1]

## E2E Smoke
- E1: Sterling-processed thought creates a task with digest metadata. [A3]

## Fixtures
- thought_reduction_ok: `sterlingProcessed=true`, `isExecutable=true`, digest present.
- thought_reduction_missing
- thought_reduction_not_executable

## Flake Controls
- Avoid random timers; inject stable timestamps for task metadata.
- Use deterministic mock thoughts and digests.

# Test Plan: STIR Routing & Sterling Executor Contract

## Scope
- Digest-based routing for `sterling_ir` tasks (Pattern A).
- Bypass requirementCandidate routing and any NL inference paths.
- Fail-closed when digest or Sterling executor unavailable.
- Contract conformance for digest expansion endpoint.
- Dedupe behavior for `sterling_ir` tasks.

## Unit Tests
- T1: `sterling_ir` with digest routes to Sterling executor path (no resolveRequirement/routeActionPlan). [A1, A5]
- T2: `sterling_ir` missing digest -> blocked_missing_digest; no executor call. [A2]
- T3: `sterling_ir` never yields `unplannable/no-requirement`. [A2, A5]
- T4: `sterling_ir` never passes through `resolveActionFromTask`; explicit failureCode when attempted. [A6]
- T5: `sterling_ir` bypasses similarity dedupe; only digest dedupe applies. [R-DEDUPE-STERLINGIR-1]
- T6: non-`sterling_ir` routing unchanged (requirementCandidate -> routeActionPlan). [A4]

## Property Tests
- P1: any `sterling_ir` task without `committed_ir_digest` is blocked (never routed). [A2]

## Integration Tests
- I1: thought -> task (sterling_ir + digest) -> routing -> Sterling executor invocation (mocked boundary). [A1, A3]
- I2: Sterling executor returns blocked -> task blocked with reason; no fallback execution. [A3]

## Contract Tests
- C1: `contracts/sterling-executor.yaml` request/response shapes validate (expandByDigest). [R-CONTRACT-1, R-CONTRACT-2]

## Mutation Tests
- M1: mutate routing guard to allow `sterling_ir` without digest; tests fail. [A2]
- M2: mutate bypass guard to call resolveRequirement for `sterling_ir`; tests fail. [A5]

## E2E Smoke
- E1: live local run with digest-backed thought -> task routed -> Sterling executor called (may return blocked). [A1, A3]

## Fixtures
- task_sterling_ir_ok: `sterling_ir` task with committed_ir_digest + envelope_id.
- task_sterling_ir_missing_digest.
- task_non_sterling_ir_requirement_candidate.

## Flake Controls
- Inject deterministic timestamps and IDs.
- Use deterministic mock digests and envelope IDs.

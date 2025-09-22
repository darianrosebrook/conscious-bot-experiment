# Test Plan: CBOT-4821

## Unit Tests
1. `arbiter integrates enhanced needs` – mock enhanced needs array with priority > threshold; assert `processCognitiveTask` invoked and metric/log mocked.
2. `arbiter ignores low priority enhanced needs` – ensure no tasks scheduled when below threshold.
3. Property-style fuzz: vary priority/urgency arrays to confirm dedup + cap behave.

## Integration Tests
- Harness arbiter with stubbed `PriorityRanker.rankTasks` returning deterministic ordering; ensure resulting `processCognitiveTask` gets called with mapped cognitive type.

## Contract Tests
- Validate structures emitted align with `EnhancedNeedTask` schema via schema assertion in unit test.

## E2E Smoke
- Not required (no UI). Ensure control loop still processes tasks when integration disabled (regression check via existing e2e).

## Mutation / Coverage Targets
- Mutation ≥50% (Tier 2) on new integration function by running Stryker subset for arbiter module.
- Branch coverage of new gating logic ≥80% via unit tests.

## Flake Controls
- Tests use fixed timestamps/UUID injection; no timers beyond fake ones.

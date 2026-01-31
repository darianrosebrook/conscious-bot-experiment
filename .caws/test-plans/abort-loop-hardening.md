# PLN-418 Test Plan

## Unit Tests
- WorldStateManager skips overlapping polls while a previous poll is in flight (A1).
- checkBotConnectionDetailed returns failureKind=timeout on AbortError and does not open breaker (A2).
- mcFetch clears timeout on AbortError and skips retries for timeout failures (A3).

## Contract Tests
- Validate `contracts/minecraft-interface-health.yaml` responses for `/health` and `/state` via schema-driven fixtures.

## Integration Tests
- Planning executor uses checkBotConnectionDetailed; timeout failure does not flip breaker and does not block subsequent successful health checks (A2).

## E2E Smoke
- Run planning + minecraft-interface with induced `/state` latency > polling interval; verify no abort loop spam and system continues (A1).

## Data Setup / Teardown
- Mock fetch with controllable promise resolution and AbortError injection.
- Use fake timers for timeout-driven tests; restore after each test.

## Flake Controls
- Ensure all timing-based tests use fake timers and deterministic resolution order.

## Coverage & Mutation Targets
- Focus mutation on in-flight guard logic and failure-kind branching.

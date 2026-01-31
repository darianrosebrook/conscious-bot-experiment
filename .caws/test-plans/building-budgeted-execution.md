# Test Plan: Building Budgeted Execution (EXEC-2403)

## Unit
- Budget blocks after max attempts for building leaves [A1]
- Rate limit defers building leaves and sets nextEligibleAt [A2]
- Budget events enqueued to dashboard stream [A3]

## Integration
- Execute a mocked building step repeatedly; verify block reason and no execution beyond budget

## E2E (optional)
- Run autonomous building task for 2–3 minutes; confirm budget enforcement in logs

## Data/Fixtures
- Mock task with building leaf steps and deterministic timestamps

## Flake Controls
- Use fixed time in tests to avoid timing variability

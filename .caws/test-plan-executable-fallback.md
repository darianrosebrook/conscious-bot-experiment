# Test Plan: Executable Dispatch + Fallback Planning

## Unit
- requirementToFallbackPlan: collect/mine emits multi-step dig_block
- requirementToLeafMeta: dig_block args without count
- executor selection: meta.executable true dispatches even with authority unset

## Integration
- planning executor dispatches fallback steps using minecraft leaf executor

## E2E
- Sterling available → Sterling steps execute
- Sterling unavailable → fallback-macro steps execute

## Flake Controls
- No time-based asserts
- Use deterministic task inputs and mock inventory snapshots

# Feature Plan: CBOT-4821 Integrate enhanced needs into decision flow

## Design Sketch
```
[Signal] -> [AdvancedSignalProcessor] -> [AdvancedNeedGenerator]
    -> {Enhanced Needs}
    -> [Need Integration] -> [PriorityRanker] -> [Decision Router]
                                 \-> emits CognitiveTask(s)
```
- New helper wires enhanced needs into existing priority ranking and routing.
- Threshold guards avoid flooding queue; reuse contextual mappers already in Arbiter.

## Test Matrix
- **Unit**: simulate processed signals returning enhanced needs -> assert integration schedules tasks (A1).
- **Unit (negative)**: ensure low-priority needs do not enqueue tasks (A2).
- **Integration**: stub AdvancedNeedGenerator output and verify PriorityRanker invoked, tasks routed (A3).
- **Mutation targets**: gating threshold comparisons, task creation mapping.

## Data Plan
- Use synthetic enhanced need fixtures with varying priority/urgency.
- Fixtures seeded directly in tests (no external IO).
- Ensure deterministic UUIDs via injection so assertions stable.

## Observability Plan
- Emit log `arbiter.enhanced_need.integration` with summary counts.
- Increment metric `arbiter_enhanced_need_task_count` for accepted tasks.
- Wrap integration path with trace span `arbiter.integrate_enhanced_needs` (no-op tracer in tests).

## Risk & Tier
- Tier 2 per CAWS policy: core flow change with moderate complexity.
- Mitigations: threshold gating, bounded task fan-out, targeted tests.

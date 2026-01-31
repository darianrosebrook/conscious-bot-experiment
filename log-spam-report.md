# Log Spam Report

## Summary
- Source: `run.log` (11448 lines)
- Time span: 2026-01-31T02:50:23.254000+00:00 → 2026-01-31T02:53:31.607000+00:00 (188.353s)
- Records parsed: 11412
- Timestamped lines: 72
- Unscoped lines (no [Component]): 10380

## Key Spam Cluster: Navigation Loop
- Using D* Lite navigation to target: 735 occurrences
  - Window: 2026-01-31T02:51:24.141000+00:00 → 2026-01-31T02:51:27.769000+00:00 (3.628s)
  - Rate: 12155.5/min
- executeNavigate called with target: 736 occurrences
  - Window: 2026-01-31T02:51:24.141000+00:00 → 2026-01-31T02:51:27.769000+00:00 (3.628s)
  - Rate: 12172.0/min
- D* Lite navigation failed: Already navigating: 734 occurrences
  - Window: 2026-01-31T02:51:27.769000+00:00 → 2026-01-31T02:51:27.769000+00:00 (0.000s)

## Top Messages (normalized numbers)
- 🧭 executeNavigate called with target: <n>, <n>, <n> — 736x
  - Window: 2026-01-31T02:51:24.141000+00:00 → 2026-01-31T02:51:27.769000+00:00 (3.628s)
  - Rate: 12172.0/min
  - Components: UNSCOPED(723), Minecraft Interface(13)
- 🔍 ActionTranslator state: { — 735x
  - Window: 2026-01-31T02:51:24.141000+00:00 → 2026-01-31T02:51:27.769000+00:00 (3.628s)
  - Rate: 12155.5/min
  - Components: UNSCOPED(720), Minecraft Interface(15)
- 🧭 Using D* Lite navigation to target: <n>, <n>, <n> — 735x
  - Window: 2026-01-31T02:51:24.141000+00:00 → 2026-01-31T02:51:27.769000+00:00 (3.628s)
  - Rate: 12155.5/min
  - Components: UNSCOPED(730), Minecraft Interface(5)
- ❌ D* Lite navigation failed: Already navigating — 734x
  - Window: 2026-01-31T02:51:27.769000+00:00 → 2026-01-31T02:51:27.769000+00:00 (0.000s)
  - Components: UNSCOPED(725), Minecraft Interface(9)
- 🚫 No line-of-sight to creeper at distance <n> - ignoring — 57x
  - Window: 2026-01-31T02:51:10.774000+00:00 → 2026-01-31T02:51:27.769000+00:00 (16.995s)
  - Rate: 201.2/min
  - Components: UNSCOPED(29), Minecraft Interface(28)
- 🔍 [MINECRAFT INTERFACE] Got connected bot, mapping state... — 38x
  - Window: 2026-01-31T02:51:06.768000+00:00 → 2026-01-31T02:51:27.769000+00:00 (21.001s)
  - Rate: 108.6/min
  - Components: Minecraft Interface(38)
- ```json — 38x
  - Window: 2026-01-31T02:51:10.774000+00:00 → 2026-01-31T02:51:27.769000+00:00 (16.995s)
  - Rate: 134.2/min
  - Components: UNSCOPED(38)
- <n>.<n> - - [<n>/Jan/<n> <n>:<n>:<n>] "POST /api/generate HTTP/<n>" <n> - — 33x
  - Window: 2026-01-31T02:51:10.774000+00:00 → 2026-01-31T02:51:27.769000+00:00 (16.995s)
  - Rate: 116.5/min
  - Components: MLX-LM Sidecar(33)
- WorldStateManager poll failed (stale snapshot preserved): This operation was aborted — 33x
  - Window: 2026-01-31T02:51:27.769000+00:00 → 2026-01-31T02:51:27.769000+00:00 (0.000s)
  - Components: Planning(33)
- POST /api/ws/cognitive-stream received: { — 32x
  - Window: 2026-01-31T02:51:14.635000+00:00 → 2026-01-31T02:51:27.769000+00:00 (13.134s)
  - Rate: 146.2/min
  - Components: Dashboard(32)
- 🧠 Entity thought: "I notice a iron_golem <n> blocks away" — 31x
  - Window: 2026-01-31T02:51:10.774000+00:00 → 2026-01-31T02:51:27.769000+00:00 (16.995s)
  - Rate: 109.4/min
  - Components: Minecraft Interface(19), UNSCOPED(12)
- Processing environmental_awareness request: { — 31x
  - Window: 2026-01-31T02:51:10.774000+00:00 → 2026-01-31T02:51:27.769000+00:00 (16.995s)
  - Rate: 109.4/min
  - Components: Cognition(31)
- Processing environmental awareness: { — 31x
  - Window: 2026-01-31T02:51:10.774000+00:00 → 2026-01-31T02:51:27.769000+00:00 (16.995s)
  - Rate: 109.4/min
  - Components: Cognition(25), UNSCOPED(6)
- Details: { — 31x
  - Window: 2026-01-31T02:51:10.774000+00:00 → 2026-01-31T02:51:27.769000+00:00 (16.995s)
  - Rate: 109.4/min
  - Components: UNSCOPED(31)
- POST /api/ws/cognitive-stream <n> in <n>ms — 31x
  - Window: 2026-01-31T02:51:14.635000+00:00 → 2026-01-31T02:51:27.769000+00:00 (13.134s)
  - Rate: 141.6/min
  - Components: Dashboard(31)

## Findings
- A tight loop repeatedly calls navigation and logs full state while already navigating, producing hundreds of lines in ~3.6s.
- Several sensory/awareness messages (entity sight/LOS checks, observation reasoning) repeat at ~1–3 per second, likely a polling loop without rate limiting.
- Many lines are unscoped (missing `[Component]`), which makes root-cause attribution harder.

## Recommendations
- Add a guard to skip navigation requests while already navigating, and only log state on transitions (e.g., from idle→navigating).
- Introduce rate limits/debouncing for high-frequency observation logs (LOS checks, environmental awareness, ActionTranslator state).
- Reduce verbosity of per-tick logs by moving them to debug level and sampling (e.g., log 1 in N or every X seconds).
- Ensure all logs include component tags to make attribution reliable.
- Consider aggregating repeated LOS checks into periodic summaries rather than per-entity spam.

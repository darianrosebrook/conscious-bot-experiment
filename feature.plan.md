# Feature Plan: CBOT-4972 Bootstrap tasks from memory and context

## Design Sketch
```
[Memory /state] --unfinished--> [Task Bootstrapper]
                          |
                          v (empty)
[Env Snapshot + Inventory] --prompt--> [LLM Synthesizer]
                          |
                          v (empty)
[Exploration Fallback Builder]
                          |
                          v
[IntegratedPlanningCoordinator] -> Goals -> Routing
```
- Bootstrapper dedupes memory tasks per planning cycle and tags origin.
- LLM synthesis runs behind timeout/circuit breaker; fallback builds exploration sweep tasks logging observations.

## Test Matrix
- **Unit**: memory stub returns unfinished tasks → bootstrapper outputs goals (A1).
- **Unit**: memory empty, LLM stub returns JSON → bootstrapper parses/queues tasks (A2).
- **Unit**: memory + LLM fail → fallback exploration goals emitted with logging flag (A3).
- **Integration**: coordinator with mocked fetch ensures bootstrap goals precede existing need pipeline.
- **Contract**: serialize bootstrap payloads and validate against `BootstrapTask` schema.
- **Mutation targets**: branch on source selection, JSON parsing guards, fallback gating.

## Data Plan
- Memory fixtures: unfinished task objects with varied statuses/timestamps.
- LLM fixtures: deterministic JSON payloads for inventory context; include malformed variant for negative path.
- Exploration fixtures: synthetic environment snapshots for coverage (inventory empty vs resource rich).

## Observability Plan
- Log `planning.bootstrap.tasks` with source counts and latency.
- Metric `planning_bootstrap_source_count{source=memory|llm|exploration}` increment per cycle.
- Trace span `planning.bootstrap.pipeline` encloses bootstrap decision path; attach error tags on fallback.

## Risk & Tier
- Tier 2: affects core planning order with external dependencies (memory, optional LLM).
- Mitigations: graceful degradation, configurable timeouts, comprehensive unit coverage of each branch.

# Feature Plan: MCP-217 Stabilize MCP integration with core leaf factory

## Design Sketch
```
[Planning Server] --registerLeaf--> [LeafFactory (core)]
       |                                  |
       |  deps                             | exposes listLeaves()
       v                                  v
[MCPIntegration] --hydrate--> [ConsciousBotMCPServer]
       |                                 |
   runOption/registerOption ------> tool.execute()
       |
   updateBotInstance ----> deps.bot assignment
```
- Planning owns `MCPIntegration`, which now instantiates the real core `LeafFactory` and passes it to the MCP server.
- `ConsciousBotMCPServer` exposes `getTools()`/`executeTool()`; integration refreshes toolset via public map instead of fallback stubs.
- Option registration flows through the MCP server, which communicates back to planning registry.

## Test Matrix
- **Unit (mcp-server)**: instantiate `ConsciousBotMCPServer` with stub leaf; expect hydration adds `minecraft.<name>@<version>` tool (A1).
- **Unit (planning)**: `MCPIntegration.registerLeaf` returns success and errors when server missing; `updateBotInstance` assigns deps.bot (A1, A3).
- **Contract**: Pact fixture ensures `register_option` returns `success` with normalized id (A2).
- **Integration**: `MCPIntegration` end-to-end with real server to register leaf, list tools, register option (A1, A2, A3).
- **Mutation targets**: guard `mcpServer` presence, LeafFactory registration result branch, option error propagation.

## Data Plan
- Stub leaf with deterministic `spec` (name/version) and synchronous `run` implementation.
- Mock registry that records registrations for assertions; reset per test.
- Mock bot object providing required shape when updating instance.
- Pact fixtures stored in `contracts/mcp-integration.pact.json` with generated timestamps stripped for determinism.

## Observability Plan
- Ensure existing `[MCP] MCP server created successfully` log emitted only once per init.
- Add structured log on option registration failures with leaf/option id context.
- Track metric counter increments inside tests using spyable metric client (if available); otherwise validate logger invocation.

## Risk & Tier
- Tier 2: change spans cross-package dependency graph and planning runtime behavior; contract + integration tests mitigate.

# Feature Plan: LOS-241 Centralize line-of-sight sensing via raycast engine

## Design Sketch
```
[Bot Pose + FoV] -> [RaycastEngine]
       |                |
       |                +--> sweepOccluders (FoV cone)
       |                +--> hasLineOfSight (occlusion + FoV)
       v
[Navigation Bridge] / [Threat Perception] / [Env Scan]
```
- Replace omniscient radius scans with FoV-bounded raycast sweeps.
- Centralize LOS decisions in `RaycastEngine` with Mineflayer raycast + DDA fallback.

## Test Matrix
- **Unit**: `hasLineOfSight` denies targets outside FoV (A4).
- **Unit**: `hasLineOfSight` denies occluded targets via Mineflayer hit (A4).
- **Unit**: `sweepOccluders` dedupes hits (perf sanity).
- **Integration**: navigation obstacle detection uses raycast sweep, not radius scan (A1/A4).
- **Integration**: threat perception ignores occluded entities (A4).

## Data Plan
- Mock raycast hits with deterministic positions.
- Synthetic block names (no PII).

## Observability Plan
- Log raycast sweep summary (rays, hit rate) in navigation/threat paths when enabled.
- Metric counters for LOS checks and raycast hits (if metrics client available).

## Risk & Tier
- Tier 2: affects perception pipeline used by navigation and threat detection.
- Mitigations: unit tests for LOS/FoV, conservative error handling.

---

# Feature Plan: NAV-2001 Navigation/Perception Log Throttling

## Design Sketch
```
PlanExecutor -> ActionTranslator.executeNavigate -> NavigationBridge.navigateTo
   |                                   |                   |
   | (gated/debounced)                 | (throttled logs)   | (single-nav lock)
   v                                   v                   v
Backoff on "Already navigating"   Scoped logs         D* Lite pathfinding

ThreatPerceptionManager.assessThreats
   |
   v
LOS checks (throttled + summary logs)
```

## Test Matrix
- **Unit**: ActionTranslator debounce blocks duplicate target within window (A2)
- **Unit**: ActionTranslator gates when navigation active (A1)
- **Unit**: ThreatPerceptionManager LOS logs throttled and summarized (A3)
- **Integration**: PlanExecutor backoff on Already navigating (A4)

## Data Plan
- Use synthetic targets and mock bot/pathfinder state; no PII.

## Observability Plan
- Log keys: `[ActionTranslator] navigate gated`, `[ActionTranslator] navigate debounced`, `[ThreatPerception] suppressed ...`

---

# Feature Plan: SAFE-2002 Safety + Water Log Throttling

## Design Sketch
```
AutomaticSafetyMonitor
  |-- assess threats -> triggerEmergencyResponse (cooldown + throttled logs)
  |-- flee actions (throttled logs)
  |-- water handling (throttled logs)
```

## Test Matrix
- **Unit**: emergency threat logs throttled (A1)
- **Unit**: water navigation logs throttled (A2)
- **Integration**: repeated threat loop does not spam logs

## Data Plan
- Mock hostile entity near bot; shallow water environment.

## Observability Plan
- Logs include [SafetyMonitor] prefix and throttle indicators.

---

# Feature Plan: SYS-2401 Startup Readiness Barrier

## Design Sketch
```
start.js
  -> wait for all /health OK
  -> POST /system/ready to readiness-enabled services

Service (Planning/World/Minecraft Interface)
  -> start server
  -> wait for readiness signal
  -> start periodic loops
```

## Test Matrix
- **Unit**: readiness endpoint toggles state (A1)
- **Unit**: planning executor does not start before readiness (A2)
- **Unit**: world polling skipped until readiness (A3)
- **Integration**: start.js broadcasts readiness after health checks (A1)

## Data Plan
- Local-only startup; no external dependencies.

## Observability Plan
- Logs: "[Startup] readiness broadcast" and per-service "waiting for readiness".

---

# Feature Plan: OBS-2402 Observation Log Tightening

## Design Sketch
```
ThreatPerceptionManager
  -> LOS checks (per-entity throttled)
WaterNavigationManager
  -> strategy summary (rate-limited)
Cognition entity logging
  -> debug-gated dumps
```

## Test Matrix
- **Unit**: LOS log throttling per entity/window (A1)
- **Unit**: Water nav summary rate limited (A2)
- **Unit**: Entity dump gated by OBSERVATION_LOG_DEBUG (A3)

## Data Plan
- Mock bot state and repeat LOS checks; water nav with stable strategy.

## Observability Plan
- Logs include summary counts and suppression notices.

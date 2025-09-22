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

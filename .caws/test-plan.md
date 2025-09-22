# MCP-217 Test Plan

## Unit Tests
- `packages/mcp-server`: add spec for dependency wiring that instantiates `ConsciousBotMCPServer` with a stub leaf factory and verifies `getTools()` output after registering a mock leaf (covers A1, mutation target: missing dependency).
- `packages/planning`: add targeted unit tests around `MCPIntegration.registerLeaf`, `registerOption`, and `updateBotInstance` using spies to ensure correct API usage and error propagation (covers A1–A3).

## Contract Tests
- Use Pact-like fixture to assert `register_option` interaction returns `{ status: 'success', optionId }` when server dependencies accept registration (A2).
- Verify `list_tools` interaction surfaces tool entries with `minecraft.<spec.name>@<version>` after hydration (A1).

## Integration Tests
- Spin up `MCPIntegration` with a real `ConsciousBotMCPServer` and a stub registry/bot to validate full flow: leaf registration → tool hydration → option registration, ensuring no fallback path triggers (A1, A2).

## E2E Smoke
- Trigger `/mcp/options` HTTP endpoint in planning modular server to ensure 200 response and underlying MCP call succeeds with seeded option (A2). (Optional manual validation during review.)

## Data Setup / Teardown
- Use deterministic stub leaves with explicit `spec` metadata.
- Reset `LeafFactory` and `MCPIntegration` instances between tests to avoid shared state.
- Provide mock bot object with minimal methods (`chat`, `entity`) required by leaf context.

## Flake Controls
- Tests rely on pure in-memory objects; no network I/O.
- Use fake timers for rate-limit guards if necessary.
- If asynchronous retries introduced, cap with deterministic delays and assert via resolved promises.

## Coverage & Mutation Targets
- Mutation focus: dependency injection guard (throws when missing), registration branch, error handling branches in `registerOption` and `updateBotInstance`.
- Ensure new tests exercise both success and failure paths to meet Tier 2 thresholds (branch ≥80%, mutation ≥50%).

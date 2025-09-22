# MCB-482 Test Plan

## Unit Tests
- `packages/minecraft-interface`: cover observation payload builder + throttled response flow; mock fetch to ensure cognition endpoint receives structured body (A1).
- `packages/cognition`: exercise observation reasoner with mocked `LLMInterface` returning JSON, malformed text, and timeout to drive fallback path (A1, A3).
- Validate task forwarding helper maps LLM `tasks` into planning service requests including observation ids (A2).

## Contract Tests
- JSON-schema validate `contracts/cognition-observation.yaml` against mocked responses from cognition server and ensure required fields (thought.text, actions.shouldRespond) are present (A1).
- Pact-style consumer test for minecraft-interface ensuring POST `/process` accepts structured observation payload with entity + bot context (A1).

## Integration Tests
- Spin up cognition observation reasoner with stub LLM returning deterministic JSON; invoke `process` handler end-to-end and assert thought/feed + planning call (A2).
- Minecraft-interface integration harness: simulate entity detection, intercept planning service fetch to confirm new payload and throttling logic (A2).

## E2E Smoke
- Manual/automated smoke: run `mc-sim` scenario with hostile mob spawn; verify bot emits LLM-authored thought in dashboard stream and throttled chat (A1).

## Data Setup / Teardown
- Use deterministic Vec3 positions and entity fixtures; sanitize coordinates for logging assertions.
- Stub planning service with in-memory fetch mock; reset between tests.
- Provide fake LLM outputs via fixture JSON to avoid real Ollama dependency.

## Flake Controls
- Use fake timers for cooldown tests; ensure timers restored after each suite.
- Keep observation reasoner tests pure async with capped timeouts and explicit AbortController to avoid hanging.

## Coverage & Mutation Targets
- Mutation focus: observation payload validation, LLM response guard, fallback branch for invalid JSON, planning task gating.
- Ensure branch coverage ≥ 80% on observation reasoner module and new bot-adapter helpers.

# Change Impact Map: MCB-482

## Modules
- `packages/minecraft-interface/src/bot-adapter.ts`: replace entity/event thought generation with LLM-backed observation flow.
- `packages/minecraft-interface/src/observation-reasoner.ts` (new helper) or companion utilities for structured payloads and parsing.
- `packages/cognition/src/server.ts`: update `/process` environmental_awareness branch to call LLM reasoner.
- `packages/cognition/src/environmental/observation-reasoner.ts` (new): encapsulate LLM prompt/parse logic.
- `packages/minecraft-interface/src/__tests__/observation-reasoner.test.ts` (new) and cognition tests for fallback logic.

## Dependencies
- Consumes `@conscious-bot/cognition` LLM interface; ensure Ollama endpoint reachable or use mock in tests.
- Planning service `/goal` endpoint via existing PLANNING_SERVICE_URL; payload now includes observation metadata but remains backwards compatible.
- Cognition service `/process` endpoint contract expanded to accept structured observations; existing clients continue to function.

## Roll-forward Strategy
- Deploy behind env flags `COGNITION_LLM_OBSERVATION_DISABLED=false` and `USE_LEGACY_ENTITY_THOUGHTS=false` (defaults) with monitoring on `cognition_observation_llm_latency_ms`.
- Gradually increase observation sampling via config if latency acceptable.

## Rollback Strategy
- Toggle env flags above to revert to legacy string-based flow without redeploy.
- If contract issues occur, restore previous `bot-adapter.ts` and `server.ts` versions; new helper modules can remain unused.

## Operational Notes
- Monitor cognition logs for `cognition.observation.fallback` spikes (>5% per 15 min) indicating LLM instability.
- Ensure planning task queue does not receive duplicate observation ids; clean up if flagged by metrics.
- Document new contract for dashboard consumers to display `thought.source=llm` metadata.

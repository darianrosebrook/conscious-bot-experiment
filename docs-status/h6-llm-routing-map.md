# H6 Investigation: LLM Routing Map

> Generated: 2026-02-11
> Scope: All LLM invocation surfaces across `packages/cognition`, `packages/core`, `packages/planning`
> Goal: Answer "Which LLM path produced this action, with what model/config, and did Sterling reduction succeed?"

---

## Inventory of LLM Invocation Surfaces

### Surface 1: `LLMInterface` (Cognition — Primary Production Surface)

**Location:** `packages/cognition/src/cognitive-core/llm-interface.ts:51`
**Role:** Canonical LLM authority for all cognitive reasoning. Singleton per cognition server.

| Property | Value |
|----------|-------|
| Endpoint | `http://${COGNITION_LLM_HOST}:${COGNITION_LLM_PORT}/api/generate` (default `localhost:5002`) |
| Primary model | `gemma3n:e2b` (env: `COGNITION_LLM_MODEL`) |
| Fallback model | `qwen3:4b` (hardcoded) |
| Token budget | Source-based via `getLLMConfig(source)` — see token budget table below |
| Temperature | Source-based (0.3–0.8) |
| Timeout | `COGNITION_LLM_TIMEOUT_MS` (default: 45s) |
| Retries | 2 with exponential backoff (1s, 2s, 4s) |
| Quality gate | Retries with +0.1 temperature if output fails TTS usability check |
| Sterling reduction | Yes — `attemptSterlingReduction()` pipes all output through `SterlingLanguageIOClient.reduce()` |
| Provenance | Model name, latency, token counts, finish reason, retry metadata, `ReductionProvenance` (envelopeId, sterlingProcessed, isExecutable, blockReason, durationMs) |

**Call sites (20+):** `ReActArbiter`, `ThoughtGenerator`, `ConversationManager`, `AdvancedReflectionEngine`, `InternalDialogue`, `CreativeSolver`, `ContextOptimizer`, `TaxonomyClassifier`, `IntrusionParser`, `IntrusionInterface`, `AgentModeler`, `SocialLearner`, `NarrativeIntelligence`, `AdvancedIdentityAnalyzer`, `ContractSystem`, reflection routes, process routes.

**Subclasses:**
- `MemoryAwareLLMInterface` (`cognitive-core/memory-aware-llm.ts`) — adds memory retrieval pre/post LLM call. Inherits endpoint/model/provenance.
- `EmotionalMemoryLLMAdapter` (`cognitive-core/emotional-memory-llm-adapter.ts`) — adds emotional context and identity reinforcement. Inherits endpoint/model/provenance.

### Surface 2: `HRMLLMInterface` (Core — Dynamic Capability Proposal)

**Location:** `packages/core/src/mcp-capabilities/llm-integration.ts:323`
**Role:** Dual-system hierarchical reasoning for generating new behavior tree options when the bot hits an impasse.

| Property | Value |
|----------|-------|
| Endpoint | `http://localhost:5002/api/generate` (via `OllamaClient`) |
| Model | `qwen3:4b` (both abstract planner and detailed executor) |
| Token budget | Abstract: 1024 / Detailed: 1024 / Refinement: 1024 / BT-DSL: 2048 |
| Temperature | Abstract: 0.1 / Detailed: 0.3 / Refinement: 0.2 / BT-DSL: 0.1 |
| Timeout | Abstract: 40s / Others: 5s |
| Retries | None — throws on timeout |
| Sterling reduction | **No** — output parsed as JSON directly |
| Provenance | Option name, confidence, iteration count, duration. **No model name in output.** |

**Call sites:** `DynamicCreationFlow.requestOptionProposal()`, `DynamicCreationFlow.proposeNewCapability()`

### Surface 3: `ProductionLLMInterface` (Core — DEAD CODE)

**Location:** `packages/core/src/mcp-capabilities/llm-interface.ts:63`
**Role:** Template-matching heuristic fallback. **Does not call any LLM.**

| Property | Value |
|----------|-------|
| Endpoint | None |
| Model | N/A |
| Sterling reduction | N/A |

**Call sites:** Zero. `new ProductionLLMInterface` appears zero times in the codebase. The `LLMInterface` interface it implements is only used for typing in tests.

**Verdict: DELETE CANDIDATE.** Superseded by `HRMLLMInterface`.

### Surface 4: `SidecarLLMClient` (Core — Low-Level Transport)

**Location:** `packages/core/src/llm/sidecar-client.ts` (renamed from `ollama-client.ts`)
**Role:** HTTP transport layer for MLX-LM sidecar. Not a decision-making surface — just the wire.

| Property | Value |
|----------|-------|
| Endpoint | `http://localhost:5002` (env: `LLM_SIDECAR_URL` → `OLLAMA_HOST`) or `/v1/chat/completions` (env: `LLM_SIDECAR_OPENAI`) |
| Default model | `llama3.1` (env: `OLLAMA_MODEL`) |
| Timeout | 20s (configurable) |

**Call sites:** `HRMLLMInterface` uses this internally. Not directly called by cognition (which has its own fetch-based client).

---

## Token Budget Registry (Cognition Surface Only)

Source: `packages/cognition/src/config/llm-token-config.ts`

| Source | maxTokens | Temperature | Used by |
|--------|-----------|-------------|---------|
| `observation` | 128 | 0.35 | Process routes (entity observation) |
| `internal_thought` | 512 | 0.8 | ThoughtGenerator, InternalDialogue |
| `social_response` | 256 | 0.8 | ConversationManager |
| `ethical_reasoning` | 1024 | 0.6 | ConstitutionalFilter (indirectly) |
| `react_operational` | 500 | 0.3 | ReActArbiter (operational mode) |
| `react_reflection` | 300 | 0.7 | ReActArbiter (reflection mode) |
| `intrusive_thought` | 512 | 0.8 | IntrusionInterface |
| `conversation_turn` | 256 | 0.4 | Conversation reply generation |
| `creative_solver` | 1024 | 0.8 | CreativeSolver |
| `theory_of_mind` | 512 | 0.4 | AgentModeler, SocialLearner |
| `default` | 512 | 0.7 | Fallback |

---

## Provenance Taxonomy

### What each surface stamps (or fails to)

| Surface | Model recorded? | Latency? | Token counts? | Sterling reduction? | Retry metadata? | Source/task class? |
|---------|:-:|:-:|:-:|:-:|:-:|:-:|
| Cognition `LLMInterface` | Yes | Yes | Yes | Yes (ReductionProvenance) | Yes | Yes (via LLMSource) |
| `HRMLLMInterface` | **No** | Partial (duration only) | **No** | **No** | N/A (no retries) | **No** |
| `ProductionLLMInterface` | N/A (dead code) | — | — | — | — | — |

**Gap:** `HRMLLMInterface` produces behavior trees that get executed by the bot, but there is no way to trace from the executed action back to which model/config/temperature produced it. The option's `reasoning` field is a free-text string with no structured provenance.

---

## Call-Graph Summary: `proposeOption()` Flow

```
Bot hits impasse (3 failures in 60s)
  → DynamicCreationFlow.detectImpasse()
    → DynamicCreationFlow.requestOptionProposal()
      → HRMLLMInterface.proposeOption()
        → HRMLLMInterface.generateAbstractPlan()     [qwen3:4b, temp=0.1, 1024 tok]
          → OllamaClient.generate()                   [http://localhost:5002/api/generate]
        → HRMLLMInterface.generateDetailedPlan()      [qwen3:4b, temp=0.3, 1024 tok]
          → OllamaClient.generate()
        → HRMLLMInterface.iterativeRefinement()       [up to 2 iterations, temp=0.2]
          → OllamaClient.generate()
        → HRMLLMInterface.generateBTDSL()             [qwen3:4b, temp=0.1, 2048 tok]
          → OllamaClient.generate()
      ← { name, version, btDsl, confidence, reasoning }
    → BTDSLParser.parse(btDsl)
    → registry.register(parsedOption)
```

**Key observation:** This flow makes 4 LLM calls per proposal but produces no structured provenance about which calls succeeded/failed or what models were used. The `reasoning` field is the only breadcrumb.

---

## Key Findings

### 1. `ProductionLLMInterface` is confirmed dead code
- Zero instantiations (`new ProductionLLMInterface` → 0 matches)
- The `LLMInterface` **interface** it implements (in `llm-interface.ts`) is only used for typing — `DynamicCreationFlow` types its field as `HRMLLMInterface`, not the interface
- **Recommendation: Delete `ProductionLLMInterface` class.** Keep the `LLMInterface` interface if needed for test typing.

### 2. Two live LLM authority surfaces, not three
After removing dead code, the architecture has:

| Surface | Authority domain | Model governance | Sterling? |
|---------|-----------------|------------------|-----------|
| Cognition `LLMInterface` | All cognitive reasoning (observation, thought, social, ethical, creative, reflection) | Source-based token budget registry | Yes |
| `HRMLLMInterface` | Impasse recovery (dynamic BT option generation) | Hardcoded per-step config | No |

### 3. Name collision: `LLMInterface` means different things in different packages
- `packages/cognition/src/cognitive-core/llm-interface.ts` → **class** `LLMInterface` (the real one)
- `packages/core/src/mcp-capabilities/llm-interface.ts` → **interface** `LLMInterface` + dead `ProductionLLMInterface` class

This is confusing but not a runtime problem (they're in different packages). Cleaning up core's `LLMInterface` naming would reduce confusion.

### 4. HRM does not go through Sterling reduction
The impasse-recovery path generates behavior trees directly from raw LLM output (JSON parsing). There's no Sterling semantic validation on these outputs. This means:
- **Good:** Faster path, appropriate for BT generation which is structured differently from natural language
- **Risk:** No semantic safety net — malformed BT structures rely on the `BTDSLParser` catch-all, not Sterling's semantic authority

### 5. HRM provenance gap is the real H6 issue
You cannot currently answer "Which LLM path produced this action?" for dynamically-generated options. The option gets registered in the `EnhancedRegistry` with a name like `opt.gather_wood` but no provenance about:
- Which model generated it
- What temperature/token config was used
- How many refinement iterations occurred
- How long the LLM calls took individually

---

## Recommendation: Federate, Don't Unify

**Do not** merge `HRMLLMInterface` into cognition's `LLMInterface`. They solve different problems:

| Cognition `LLMInterface` | `HRMLLMInterface` |
|---------------------------|-------------------|
| Single-shot prompt → response | Multi-step pipeline (4 LLM calls) |
| Natural language output | Structured JSON (BT-DSL) output |
| Sterling reduction required | Sterling reduction inappropriate |
| Source-based token budgets | Step-based token budgets |
| Shared singleton | Per-flow instance |

**Instead:**

1. **Delete `ProductionLLMInterface`** — dead code, creates confusion.

2. **Add provenance to `HRMLLMInterface`** — return a structured `HRMProvenance` alongside the option proposal:
   ```typescript
   interface HRMProvenance {
     model: string;
     steps: Array<{
       step: 'abstract' | 'detailed' | 'refinement' | 'bt_dsl';
       durationMs: number;
       tokensUsed?: number;
       temperature: number;
       maxTokens: number;
     }>;
     totalDurationMs: number;
     iterations: number;
     confidence: number;
   }
   ```

3. **Route HRM through `OllamaClient` with telemetry** — `OllamaClient` should return token counts and model name from the Ollama API response (it already receives them in `OllamaResponse` but discards them, returning only the text string).

4. **Establish a single "routing authority" contract**: Cognition `LLMInterface` is the routing authority for model/temperature/token decisions on all cognitive tasks. `HRMLLMInterface` is the routing authority for impasse-recovery BT generation. Both must stamp provenance. The registry entry for a dynamically-generated option should include an `origin: 'hrm'` tag with `HRMProvenance` so downstream systems can distinguish HRM-generated options from manually-registered leaves.

5. **Optional follow-up:** Have `HRMLLMInterface` use cognition `LLMInterface`'s `creative_solver` config for its abstract planning step, so model selection is governed by one place. This is a "nice to have" — the current hardcoded `qwen3:4b` is functional.

---

## ADR Candidate

### ADR-006 — LLM Routing Authority and Provenance Contract

**Status:** Proposed (2026-02-11).

**Context:** The codebase has two live LLM invocation surfaces plus one dead code surface. The two live surfaces make independent model/temperature/token decisions with no shared governance. Only the cognition surface stamps provenance (model, tokens, latency, Sterling reduction). The impasse-recovery surface (`HRMLLMInterface`) generates executable behavior trees with no provenance, making "why did the bot do that?" debugging impossible for dynamically-generated options.

**Decision:**
- **Delete** `ProductionLLMInterface` (dead code).
- **Federate** (not unify) the two live surfaces. They solve different problems and should remain separate classes.
- **Cognition `LLMInterface`** is the routing authority for all cognitive reasoning (observation, thought, social, ethical, creative, reflection).
- **`HRMLLMInterface`** is the routing authority for impasse-recovery BT generation.
- **Both must stamp structured provenance** that can answer: "Which model, what config, did Sterling succeed, how long did it take?"
- **`OllamaClient.generate()`** must return structured metadata (model, tokens, duration) not just raw text.
- **Registry entries** for dynamically-generated options must include an `origin` tag with provenance.

**Invariants:**
- **I-LLM-ROUTE-1:** Every LLM call must produce a structured provenance record (model, tokens, latency, source/step).
- **I-LLM-ROUTE-2:** Every registered option must be traceable to its origin (static leaf vs HRM-generated vs legacy).
- **I-LLM-ROUTE-3:** Model/temperature/token decisions for a given task class are governed by exactly one authority surface.
- **I-LLM-ROUTE-4:** Sterling reduction is applied to all natural-language LLM outputs (cognition surface). BT-DSL outputs (HRM surface) are exempt.

**Migration path:**
1. Delete `ProductionLLMInterface` and clean up core's `LLMInterface` naming.
2. Add `HRMProvenance` to `HRMLLMInterface` return type.
3. Enrich `OllamaClient.generate()` return to include model/token metadata.
4. Tag registry entries with `origin` provenance.
5. (Optional) Route HRM's abstract planning through cognition's `creative_solver` budget.

**Allowed exceptions:**
- Test mocks and DI seams may bypass provenance requirements.
- Offline/degraded mode (model unavailable) may produce provenance with `model: 'unavailable'`.

---

## Implementation Status (2026-02-11)

All items from the recommendation have been implemented. See ADR-006 in `architecture-decisions.md`.

### Changes made:

1. **Dead code deleted:** `ProductionLLMInterface` file removed.
2. **Naming unified:** `OllamaClient` → `SidecarClient`, `OllamaResponse` → `SidecarResponse`, `callOllama` → `callSidecar`. `OllamaClient`/`OllamaClientConfig` preserved as deprecated aliases in `core/llm/sidecar-client.ts`.
3. **Env var unified:** `LLM_SIDECAR_URL` is canonical across all packages. Legacy `OLLAMA_HOST`, `COGNITION_LLM_HOST` + `COGNITION_LLM_PORT` accepted as deprecated fallbacks. `OLLAMA_BASE_URL` is no longer accepted (rename to `OLLAMA_HOST`).
4. **DI seam fixed:** `DynamicCreationFlow` depends on `OptionProposalLLM` interface (narrow: just `proposeOption()`), not concrete `HRMLLMInterface`.
5. **Provenance added:** `SidecarClient.generate()` returns `SidecarCallProvenance` (model, requestHash via canonical SHA-256, outputHash, latencyMs). HRM pipeline collects per-stage provenance array.
6. **Embedding provenance:** `SidecarEmbeddingBackend.embed()` returns `model`, `dim`, `latencyMs`.
7. **Sterling reduction gate:** `ReductionClient` interface in core (pure types). `DynamicCreationFlow` gates proposals through it (fail-closed). Without client, proposals are advisory-only.

### Updated call graph:

```
Bot hits impasse (3 failures in 60s)
  → DynamicCreationFlow.detectImpasse()
    → DynamicCreationFlow.requestOptionProposal()
      → OptionProposalLLM.proposeOption()            [interface — HRMLLMInterface or future Sterling-native]
        → SidecarClient.generate()                    [returns {response, provenance}]
        → SidecarClient.generate()                    [provenance collected per stage]
        → SidecarClient.generate()
        → SidecarClient.generate()
      ← { name, version, btDsl, confidence, reasoning, provenance: { origin, stages[], totalLatencyMs } }
      → ReductionClient.reduceOptionProposal()        [if client set — fail-closed gate]
      ← { isExecutable, committedIrDigest, committedGoalPropId }
    → BTDSLParser.parse(btDsl)
    → registry.register(parsedOption)
```

## Acceptance Criteria (from Working Spec)

| Criterion | Status |
|-----------|--------|
| Can answer "Which LLM path produced this action?" from logs/artifacts alone | **Yes** — `SidecarCallProvenance` stamps model, requestHash, outputHash, latencyMs per stage |
| Can point to exactly one routing authority per task class | **Yes** — cognition for cognitive tasks, `OptionProposalLLM` for impasse recovery |
| Inventory of LLM surfaces by package | **Complete** — see table above |
| Config sources (env vars) documented | **Complete** — unified under `LLM_SIDECAR_URL` |
| Retry logic documented | **Complete** |
| Output contracts documented | **Complete** |
| Provenance taxonomy documented | **Complete** — `SidecarCallProvenance` + HRM pipeline provenance |
| Call-graph for `proposeOption()` | **Updated** — see above |
| Recommendation with migration path | **IMPLEMENTED** — ADR-006 |

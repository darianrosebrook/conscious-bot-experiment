# Prioritized TODO / Mock / Placeholder Queue

> Generated: 2026-02-10  |  Last updated: 2026-02-11
> Source: Automated scan of 1,773 files, 2,145 raw findings, triaged to ~40 actionable items.
> Methodology: Filtered test mocks, DI seams, CSS placeholders, and type-level enum values. Remaining items categorized by runtime impact. Deep exploration corrected several initial severity ratings.

---

## RESOLVED — Completed in hardening pass (2026-02-10/11)

| # | Item | Resolution |
|---|------|------------|
| ~~C2~~ | Placeholder death/sleep reflections | **RESOLVED.** `reflection-routes.ts` created, wired to cognition server. Death and sleep handlers now call `POST /generate-reflection` with 10s timeout, falling back to improved static text. `[PLACEHOLDER]` strings removed. Tests: 8 passing. |
| ~~C3~~ | Screenshot API returns via.placeholder.com URLs | **RESOLVED.** Endpoints now return `{ screenshots: [], available: false, reason: '...' }` instead of fake URLs. |
| ~~C6~~ | Reactive executor uses mock world state | **RESOLVED.** `world-state-adapter.ts` bridges `WorldStateManager` snapshot → GOAP `WorldState` interface. Wired through `planning-bootstrap.ts` → `modular-server.ts`. PBI execution now uses real bot data. Tests: 14 passing. |
| ~~H5~~ | Memory system export returns empty | **RESOLVED.** `exportMemories()` wired to real DB queries with structured `MemoryExportFilter` (distinguishes `metadata->>'type'` from `metadata->>'memorySubtype'`). Newest-first DB selection + canonical ASC sort for hash stability. Map-based backup queue dedup. Discriminated `ok/error` result shape. ADR-002 timestamp-preserving restore path (`batchRestoreChunks`). ADR-004 versioned bundle envelope (`MemoryBackupBundleV1`, `schemaVersion=1`) + fail-closed import. Tests: 13 passing contract tests. |
| ~~H10~~ | Deprecated aliases due 2026-03-01 | **RESOLVED.** Deprecated aliases (`buildEpisodeLinkage`, `buildEpisodeLinkageFromResult`) were removed in 2026-02-03 commit. Only Sterling-prefixed versions exist. Barrel export (`sterling/index.ts`) only exports Sterling-prefixed names. Single remaining reference is a historical comment in `task-integration.ts:545`. |
| ~~H4~~ | Memory signal generator returns empty | **RESOLVED.** `findSalientMemories()` in `memory-signal-generator.ts` now calls `this.memorySystem.searchMemories()` with context-derived queries, type filtering, salience thresholds, and context boosts (world, recency, emotional). No longer returns `[]`. Wired in commit `365ba6b`. |
| ~~H9~~ | Thought processor has no task history | **RESOLVED.** `getRecentTaskHistory()` now uses `TaskHistoryProvider` (DI seam) with `DirectTaskHistoryProvider` wired via `modular-server.ts`. Combines active + completed + failed tasks, sorted `updatedAt DESC, id DESC`, capped at 50, prompt-safe mapping. `GET /tasks/recent` endpoint added. Provenance recorded (source, latency, cache hit). DR-H9 documented. |
| ~~H6~~ | LLM routing and provenance | **RESOLVED.** Dead code deleted. `Ollama*` → `Sidecar*` naming. `LLM_SIDECAR_URL` canonical env var. DI seam fixed (`OptionProposalLLM` interface). Per-call `SidecarCallProvenance`. HRM pipeline stage provenance. Embedding provenance. Sterling reduction gate (`ReductionClient`, fail-closed). ADR-006 documented. |

---

## CRITICAL — Production code returns fake/static data at runtime

### C1. MockNavigationSystem used as production pathfinder
- **File**: `packages/minecraft-interface/src/navigation-bridge.ts:65-114,158,249`
- **What**: `MockNavigationSystem` generates straight-line paths with `reason: 'mock_path'`. Instantiated as the *actual* navigation system (line 249).
- **Revised assessment**: **Medium priority.** Bot navigates via mineflayer-pathfinder directly — this mock is a facade for the unfinished D* Lite execution layer. Not on the hot path.
- **Fix**: Wire real D* Lite core (`packages/world/src/navigation/dstar-lite-core.ts`) through the bridge. This is an architecture change, not a quick fix.
- **Verdict**: Defer to navigation overhaul sprint.

---

## HIGH — Significant degradation, tracked work items

### H1. Entity observation throttling (rig-I-primitive-21)
- **File**: `packages/minecraft-interface/src/bot-adapter.ts:1102,1111,1161,1480`
- **What**: 4 TODOs for replacing per-entity `/process` throttling with batch observation. Tracked as `rig-I-primitive-21`.
- **Status**: PARTIALLY STALE. The legacy per-entity `/process` path is gated behind `LEGACY_ENTITY_PROCESS=true` and is off by default. The Belief Bus (`emitBeliefDeltas()` every 1s via `/process-belief-envelope`) already implements batch observation for the production path.
- **Revised assessment**: The H1 TODO is partially satisfied. The legacy entity scan path should be converted from "throttle-and-drop" to "collect-and-report" (diagnostic telemetry only, no cognition calls) to prevent semantic divergence if someone enables it for debugging.
- **Impact**: Low (production path uses Belief Bus). Risk is accidental re-enablement of legacy path.
- **Verdict**: Convert legacy path to dev-only diagnostic mode. Keep Belief Bus as canonical observation pipe.

### H2. Sterling solver not wired in plan-executor (rig-planning)
- **File**: `packages/minecraft-interface/src/plan-executor.ts:218`
- **What**: `TODO(rig-planning)` — returns structured failure ("Legacy planning retired") instead of calling Sterling solver.
- **Status**: STILL OPEN. Sterling infrastructure exists (`SterlingReasoningService`, domain-specific solvers, E2E tests) but plan-executor doesn't call it.
- **Architectural decision needed**: Where does the semantic authority boundary live? PlanExecutor should stay "dumb" (execute plans); PlanningCoordinator should own Sterling calls and pass executable plans down. This preserves the "Sterling is semantic authority" posture from CLAUDE.md.
- **Verdict**: Wire Sterling in PlanningCoordinator layer, not PlanExecutor. Requires goal→solver mapping logic (which solver for which goal type). Design session before implementation.

### H3. Reactive executor stub methods (partially addressed)
- **File**: `packages/planning/src/reactive-executor/reactive-executor.ts:1652,1765,1857,1864,1875`
- **What**: MCP connection returns 0, mineflayer ops return failure, opportunities/threats/optimization return `[]`.
- **Status**: PARTIALLY ADDRESSED. `worldStateAdapter` now wired — real health/position/inventory flow through `getWorldState()`. Remaining stubs: `createDefaultMCPBus()` (line 1765), `adaptToOpportunities()` (line 1875), and mineflayer ops still return failure.
- **Verdict**: MCP bus wiring is the next high-value target. WorldState gap is closed.

### ~~H4. Memory signal generator returns empty~~ → RESOLVED (see above)

### ~~H5. Memory system export returns empty~~ → RESOLVED (see above)

### ~~H6. Core LLM interface falls back to heuristic generator~~ → RESOLVED (2026-02-11)
- **Status**: RESOLVED. See ADR-006 in `docs-status/architecture-decisions.md` and updated `docs-status/h6-llm-routing-map.md`.
- **What was done**:
  1. Deleted dead code (`ProductionLLMInterface`, `llm-interface.ts`)
  2. Unified sidecar config: `LLM_SIDECAR_URL` canonical across all packages, `Ollama*` → `Sidecar*` naming
  3. Fixed DI seam: `DynamicCreationFlow` depends on `OptionProposalLLM` interface, not concrete `HRMLLMInterface`
  4. Added per-call provenance: `SidecarCallProvenance` (model, canonical requestHash, outputHash, latencyMs)
  5. HRM pipeline collects per-stage provenance array
  6. Embedding provenance: `model`, `dim`, `latencyMs` on `embed()` return
  7. Sterling reduction gate: `ReductionClient` interface (fail-closed), advisory-only without client
  8. ADR-006 documented

### H7. BT execution and crafting are simulated
- **File**: `packages/minecraft-interface/src/action-translator.ts:3223-3224,3272-3273`
- **What**: `executeBehaviorTree()` only handles `opt.craft_wooden_axe`; `executeCraftWoodenAxe()` simulates crafting with item-existence checks instead of real mineflayer crafting.
- **Status**: STILL OPEN.
- **Verdict**: Wire to real mineflayer crafting API.

### H8. Sterling integration contract has ~12 unwritten tests
- **File**: `packages/cognition/src/cognitive-core/__tests__/llm-interface-golden-fixtures.test.ts`
- **What**: 12 `it.todo()`/`xit`/skip patterns covering: goal extraction, degenerate output, code output, malformed markers, TTS gating, Sterling `is_executable`, `committed_goal_prop_id`, and fallback mode.
- **Status**: PARTIALLY ADDRESSED. File is maintained with some active tests, but 12 deferred tests remain.
- **Verdict**: Implement tests per CLAUDE.md evidence requirements.

### ~~H9. Thought processor has no task history~~ → RESOLVED (see above)

### ~~H10. Deprecated aliases due 2026-03-01~~ → RESOLVED (see above)

---

## DOWNGRADED — Originally rated Critical, now Low/Dead

| # | Item | Revised severity | Reason |
|---|------|-----------------|--------|
| C4 | LLM Skill Composer mock LLM calls | **Dead code** | `new LLMSkillComposer` appears zero times in codebase. Class is never instantiated. Candidate for deletion. |
| C5 | Capability registry simulates actions | **Low** | Test fixtures / DI stubs. 47+ real leaves override at runtime. Working as designed. |
| C7 | Reasoning surface `fakeReduction` | **Low** | Exists only in legacy `processLLMOutput()` sync path with comment "kept ONLY for backwards compatibility during migration." Production uses real Sterling path. |

---

## MEDIUM — Degraded quality, acceptable short-term

| # | File | Line(s) | Issue |
|---|------|---------|-------|
| M1 | `minecraft-interface/src/neural-terrain-predictor.ts` | 397, 749 | Returns mock terrain features |
| M2 | `minecraft-interface/src/water-navigation-manager.ts` | 672-712 | Simulates movement strategies |
| M3 | `memory/src/memory-system.ts` | 1085, 1107 | `storageSize: '0MB'`, `memoryIngestionCount: 0` |
| M4 | `memory/src/neuroscience-consolidation-manager.ts` | 476 | Returns empty array placeholder |
| M5 | `cognition/src/server-utils/cognitive-load-calculators.ts` | 63-64 | Returns simulated cognitive load |
| M6 | `core/src/arbiter.ts` | 1315-1355 | 10+ methods return hardcoded defaults |
| M7 | `safety/src/monitoring/safety-monitoring-system.ts` | 579-581 | CPU usage hardcoded to 10% |
| M8 | `core/src/leaves/interaction-leaves.ts` | 254-255 | Torch distance returns random value |
| M9 | `planning/src/skill-integration/mcp-integration.ts` | 859, 964 | Mock capability execution |
| M10 | `world/src/perception/object-recognition.ts` | 594 | Placeholder classification |
| M11 | `planning/src/sterling/sterling-reasoning-service.ts` | 472 | Declaration shape not validated at boundary |
| M12 | `minecraft-interface/src/navigation-bridge.ts` | 1586 | Terrain analysis always returns UNKNOWN |

---

## LOW / ACCEPTABLE — Not actionable

These were flagged by the scanner but are **correct as-is**:

- **Test mocks** in `__tests__/` directories — proper vitest/jest usage
- **DI seams** (`MockLanguageIOTransport`, `createMockReductionResult`) — intentional test infrastructure
- **Type-level enums** (`'simple' | 'moderate' | 'complex'`) — working domain model
- **Dashboard CSS** `::placeholder`, missing-texture magenta — visual polish
- **Simplified algorithms** (FNV-1a hash, simple clustering) — known tradeoffs, functioning
- **Sterling capsule `Content hash... placeholder until CI generates`** — tracked in CI pipeline
- **`constitutional-filter/types.ts` "TODO: enums defined for future use"** — forward declarations, harmless

---

## Recommended Attack Order (revised 2026-02-11, post-H5 hardening)

Priority is ordered by **irreversibility** and **semantic coupling** — things that define contracts other systems depend on come first, plumbing comes later.

| Phase | Items | Theme | Effort | Rationale |
|-------|-------|-------|--------|-----------|
| ~~Phase 1~~ | ~~H4~~ | ~~"Memory signal wiring"~~ | ~~Medium~~ | **RESOLVED** — `findSalientMemories()` wired to `searchMemories()` in commit `365ba6b` |
| ~~Phase 2~~ | ~~H10~~ | ~~"Deadline cleanup"~~ | ~~Small~~ | **RESOLVED** — Deprecated aliases already removed in 2026-02-03 commit |
| ~~Phase 3~~ | ~~H6 (investigate)~~ | ~~"LLM routing audit"~~ | ~~Small~~ | **COMPLETE** — See `docs-status/h6-llm-routing-map.md`. `ProductionLLMInterface` confirmed dead. Two live surfaces: federate, don't unify. ADR-006 proposed. |
| ~~Phase 4~~ | ~~H9~~ | ~~"Task context"~~ | ~~Medium~~ | **RESOLVED** — `TaskHistoryProvider` wired with `DirectTaskHistoryProvider`, `GET /tasks/recent` endpoint, prompt-safe contract |
| ~~Phase 5~~ | ~~H6 (implement)~~ | ~~"LLM provenance + dead code cleanup"~~ | ~~Medium~~ | **RESOLVED** — See ADR-006. Dead code deleted, Sidecar naming, provenance, reduction gate. |
| **Phase 6** | H1 | "Legacy entity path cleanup" — convert to diagnostic mode, keep Belief Bus as canonical | Small (cleanup) | Low risk, prevents semantic divergence |
| **Phase 7** | H2 | "Sterling solver in PlanningCoordinator" — goal→solver mapping, wiring | Large (architecture) | Requires design session first (where does semantic authority live?) |
| **Phase 8** | H3, H8 | "Executor & contract hygiene" — MCP bus stubs, Sterling tests | Large (multi-day) | Follow-on from H6/H2 semantic pivots |
| **Phase 9** | H7 | "Real crafting" — wire mineflayer crafting API for BT execution | Medium (new feature) | Benefits from governance surfaces being solid first |
| **Phase 10** | C1, M1-M12 | "Navigation + polish" — D* Lite wiring, terrain, perception | Large (deferred) | Plumbing, not contract-defining |

### Architectural follow-ups (tracked via ADRs, see `docs-status/architecture-decisions.md`)

| ADR | Item | Status | Urgency |
|-----|------|--------|---------|
| ADR-001 | Canonical store vs derived indexes | Decided (non-blocking) | Low — already implicitly true |
| ADR-002 | Restore timestamp preservation | **IMPLEMENTED** | Done |
| ADR-003 | Export selection policy (anchor vs recency buckets) | Decided (deferred) | Medium — needs tagging mechanism first |
| ADR-004 | Versioned backup bundle envelope | **IMPLEMENTED** | Done |
| ADR-005 | Embedding dimension evolvability | Decided (deferred) | Low — not blocking until model change |
| ADR-006 | Sidecar-first transport, provenance, Sterling reduction gate | **IMPLEMENTED** | Done |

### Underlying issues discovered during H5 hardening

| Issue | File | Description | Status |
|-------|------|-------------|--------|
| `batchUpsertChunks` transaction bug | `vector-database.ts` (~line 1087) | Transaction wrapper holds client A, but `upsertChunk()` acquires client B — BEGIN/COMMIT don't bracket actual writes. Mid-batch failure doesn't rollback. | OPEN — fix opportunistically using client-scoped helper pattern (same as `batchRestoreChunks`) |
| Backup queue cap cliff | `memory-system.ts` (~line 2330) | 1000-row cap on `backupQueue` means oldest entries fall off. Cursor-based incremental backup needed for true identity preservation. | OPEN — TODO documented in code |
| djb2 hash weakness | `memory-system.ts` (~line 2364) | 32-bit hash for backup integrity. Collision-prone but functional for fingerprinting. | OPEN — acceptable, upgrade is separate concern |

---

## Stale / Delete Candidates (verified)

| File | Verdict | Reason |
|------|---------|--------|
| `packages/core/src/mock-bot-service.ts` | **DELETE** | Unused mock server, no production imports, superseded by minecraft-interface |
| `packages/minecraft-interface/src/simulation-stub.ts` | **KEEP** | Active production code — part of public API, used by `mc-sim` CLI and `/test-simulation` endpoint |
| `packages/memory/src/integration-examples.ts` | **DELETE** | Disabled in index.ts, no imports, contains placeholder classes with missing deps |
| `packages/core/src/test-cognitive-pipeline.ts` | **DELETE** | Dead stub, explicitly disabled, misplaced in `src/` instead of `__tests__/` |
| `packages/planning/src/skill-integration/llm-skill-composer.ts` | **DELETE candidate** | Never instantiated (`new LLMSkillComposer` appears zero times). Dead code. |

---

## Changelog

| Date | Changes |
|------|---------|
| 2026-02-10 | Initial generation from scan of 2,145 findings |
| 2026-02-11 | Deep exploration corrected C1→Medium, C4→Dead, C5→Low, C7→Low. Resolved C2, C3, C6. Verified H1-H10 status. Updated stale candidates with import analysis. Revised attack order for remaining work. |
| 2026-02-11 | **H5 RESOLVED.** Wired `exportMemories()` with structured type/subtype filters, newest-first selection, canonical ordering, Map-based queue dedup. Implemented ADR-002 (timestamp-preserving restore) and ADR-004 (versioned bundle envelope). 13 contract tests. Revised H1 assessment (partially stale — Belief Bus is production path). Revised H2 assessment (architectural decision needed: PlanningCoordinator owns Sterling, not PlanExecutor). Deep assessment of H6 (three independent LLM surfaces). Re-prioritized attack order by irreversibility/semantic coupling. Documented underlying issues (batchUpsertChunks transaction bug, backup queue cap cliff, djb2 hash weakness). Created `docs-status/architecture-decisions.md`. |
| 2026-02-11 | **H10 RESOLVED** (already done). Deprecated aliases `buildEpisodeLinkage`/`buildEpisodeLinkageFromResult` removed in 2026-02-03 commit. Only Sterling-prefixed versions exist. **H4 RESOLVED** (already done). `findSalientMemories()` wired to `searchMemories()` with context-derived queries, type filtering, salience thresholds, and context boosts (commit `365ba6b`). Attack order updated — next up: H6 investigate, H9. |
| 2026-02-11 | **H6 INVESTIGATION COMPLETE.** Full LLM routing map produced (`docs-status/h6-llm-routing-map.md`). Key findings: `ProductionLLMInterface` confirmed dead code (zero instantiations). Two live surfaces — Cognition `LLMInterface` (cognitive authority, Sterling reduction, source-based budgets) and `HRMLLMInterface` (impasse recovery, dual-system BT generation). Recommendation: federate, don't unify. Real gap: HRM provenance — no structured traceability for dynamically-generated options. ADR-006 proposed (LLM Routing Authority and Provenance Contract). DR-TRACK-001, DR-H10, DR-H4 appended to architecture-decisions.md. |
| 2026-02-11 | **H9 RESOLVED.** `getRecentTaskHistory()` wired via `TaskHistoryProvider` DI seam. `DirectTaskHistoryProvider` reads active + completed + failed tasks from `TaskIntegration`, sorts `updatedAt DESC, id DESC`, maps to prompt-safe `RecentTaskItem` (title capped 120 chars, summaries 200 chars, max 50 tasks). `GET /tasks/recent` HTTP endpoint added for cross-service consumers. `NullTaskHistoryProvider` + `HttpTaskHistoryProvider` (Zod-validated, 1.5s TTL cache) for other use cases. Provenance recorded on every call (TASK-HIST-1). DR-H9 appended to architecture-decisions.md. |
| 2026-02-11 | **H6 RESOLVED (full implementation).** Phase A: Unified `LLM_SIDECAR_URL` env var across all packages, `Ollama*` → `Sidecar*` naming (~15 files), `ProductionLLMInterface` dead code deleted, `LLMInterface` → `OptionProposalLLM` naming collision fix, DI seam on `DynamicCreationFlow`. Phase B: `SidecarCallProvenance` (SHA-256 canonical request/output hashing), HRM pipeline stage provenance. Phase C: `EmbeddingBackendResult` with `model`/`dim`/`latencyMs`. Phase D: `ReductionClient` interface in core (pure types, zero cross-package deps), fail-closed gate on `requestOptionProposal()` and `proposeNewCapability()`, advisory-only degradation without Sterling. Phase E: ADR-006 documented, routing map updated, TODOs updated. TypeScript clean across core, cognition, memory. |

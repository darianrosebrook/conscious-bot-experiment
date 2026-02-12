# Architecture Decision Records — Memory & Identity Subsystem

> Created: 2026-02-11
> Scope: `packages/memory/src/**`, identity preservation backup/restore, LLM routing governance
> Related: `docs-status/prioritized-todos.md` (H5 resolution, underlying issues)

---

## ADR-001 — Canonical store vs derived indexes

**Status:** Decided (non-blocking). Already implicitly true in code.

**Context:** `packages/memory/src/vector-database.ts` persists full memory records (content + embedding + metadata + provenance + decay + graph links) in a single PostgreSQL table (`enhanced_memory_chunks`). The knowledge graph tables (`knowledge_graph_entities`, `knowledge_graph_relationships`) in `knowledge-graph-core.ts` are derived projections built on top of chunk data.

**Decision:** Treat the vector table row as the **canonical record** for a memory chunk. Treat knowledge graph tables and any extracted entity/relationship views as **derived, rebuildable projections**.

**Consequences:**
- Export/backup operates on the canonical chunk table, not on graph projections.
- Restore must rehydrate the canonical table; graph projections can be rebuilt from it.
- If the graph is corrupted, it can be regenerated from canonical records without data loss.

**Risk if violated:** "Restore" silently rehydrates only part of identity (e.g., graph but not original provenance), producing un-debuggable drift.

**Verification:** Export/import round-trip preserves record equality on canonical field set (id, content, metadata, provenance, timestamps).

---

## ADR-002 — Restore semantics must preserve timestamps

**Status:** IMPLEMENTED (2026-02-11).

**Context:** `upsertChunk()` omits `created_at` from the INSERT column list (relies on `DEFAULT NOW()`) and forces `updated_at = NOW()` on both insert and conflict paths. The disaster recovery path (`restoreFromBackup()` → `storeChunk()` → `upsertChunk()`) therefore collapsed all `created_at` timestamps to "now" on restore into an empty DB, destroying chronological ordering and making backup hashes unstable across restore cycles.

**Decision:** A "restore" operation must preserve `created_at` and `updated_at` from the exported bundle. It must not default to `NOW()`. Normal ingestion via `upsertChunk()` is unchanged.

**Implementation:**
- `restoreChunkWithClient(client, chunk)` (ADR-002, rig-I-memory-restore-1) — private helper:
  - Writes explicit `created_at`/`updated_at` from chunk timestamps on INSERT.
  - Monotonic guard: `WHERE EXCLUDED.updated_at >= table.updated_at` — stale bundles are non-destructive no-ops per-row, preventing "time travel" when restoring against a live DB.
  - Fail-closed rules: non-finite embedding values (`embedding.every(Number.isFinite)`), invalid timestamps (non-finite or <= 0), Zod schema validation, dimension mismatch.
  - Parameterized vector: `$N::vector` instead of inline string composition.
  - Dimension-aware model ID: `legacy_${dim}` instead of hardcoded `legacy_768`.
- `restoreChunk(chunk)` — public single-chunk restore.
- `batchRestoreChunks(chunks)` — public batch restore, properly transactional (single client for BEGIN/COMMIT). Logs elapsed time. Warns if batch > 2000 chunks.
- `restoreFromBackup()` now routes through `batchRestoreChunks()`, not `storeChunk()`.
- `importMemoryBackupBundle(bundle)` also routes through `batchRestoreChunks()`.

**Non-goals:** This does not change normal ingest/upsert semantics. `upsertChunk()` continues to use `NOW()` for timestamps.

**Core principle:** Restore is defined as a monotonic replay. It may not regress `updated_at`; stale bundles are non-destructive no-ops.

**Invariants:**
- **I-MEM-RESTORE-1:** Restore must not rewrite `createdAt`/`updatedAt`.
- **I-MEM-RESTORE-2:** Restore must preserve record ids exactly (id is the identity key).
- **I-MEM-RESTORE-3:** Restore failures must be observable (fail-closed on invalid timestamps, non-finite embeddings).
- **I-MEM-RESTORE-4:** Stale bundles must not regress live DB chronology (monotonic guard).

**Verification:**
- Contract test: `restoreFromBackup` routes through `batchRestoreChunks`, never `storeChunk` (13 tests in `export-memories-contract.test.ts`).
- Manual: export → wipe DB → restore → query known chunk → `created_at` matches original.
- Manual: re-export immediately after restore → canonical ordering identical, backup hash stable.
- Manual: restore stale bundle against live DB → rows with newer `updated_at` are untouched.

**Operational note:** Disaster restore must use `batchRestoreChunks` (timestamp-preserving). Do not use store/upsert APIs for restore. See `batchUpsertChunks` docstring for why its transaction wrapper is ineffective (ADR-002 pattern is the reference).

**Follow-up (not yet implemented):**
- Restore observability: emit counts of `rows_inserted`, `rows_updated`, `rows_skipped_stale` via `RETURNING` or pre-read.
- Refactor `batchUpsertChunks` to use the same single-client + private-helper pattern (or enforce the non-atomic reality via test).

---

## ADR-003 — Export selection policy is a policy layer, not a storage layer

**Status:** Decided (deferred). Current "newest 500 per bucket" is functional.

**Context:** The export path selects rows by `metadata->>'type'` and `metadata->>'memorySubtype'` with a per-category limit. This is "bounded snapshot," not "identity preservation" — there's no distinction between identity anchors (rare, long-lived: name, commitments, preferences) and recency window (many, low-to-mid value: recent reflections).

**Decision:** Separate "which rows are selected into the export window" from "canonical ordering for hashing." Define export selection as a multi-bucket policy with explicit intent once tagging exists.

**Proposed buckets (baseline, for future implementation):**
- **Anchors:** memories explicitly tagged as identity anchors (rare, long-lived).
- **Narrative checkpoints:** `memorySubtype = narrative_checkpoint`.
- **Reflections/lessons:** bounded newest K (recency-weighted).
- **Knowledge:** bounded newest K, optionally filtered by importance/salience.

**Why deferred:** The tagging mechanism for identity anchors doesn't exist yet. Building bucket semantics before you can tag memories as anchors would be premature.

**Invariants (for future implementation):**
- **I-MEM-BACKUP-1:** Export policy is explicit and versioned.
- **I-MEM-BACKUP-2:** Anchors are never dropped due to recency limits.
- **I-MEM-BACKUP-3:** Hash stability depends on canonical ordering, not DB return order (already implemented).
- **I-MEM-BACKUP-4:** Bucket membership is observable (counts + reason codes).

---

## ADR-004 — Versioned backup bundle envelope + fail-closed import

**Status:** IMPLEMENTED (2026-02-11).

**Context:** Exports previously returned raw `EnhancedMemoryChunk[]` with no metadata envelope. Without a version marker, future schema changes would be silently applied on import, producing un-debuggable data corruption.

**Decision:** Exports are wrapped in a versioned envelope (`MemoryBackupBundleV1`). Imports reject unknown versions (fail-closed).

**Implementation:**
- `MEMORY_BACKUP_SCHEMA_VERSION = 1` constant.
- `MemoryBackupBundleV1` type: `{ schemaVersion, exportedAtMs, selection, counts, chunks }`.
- `exportMemories()` returns `bundle` field on `ok: true` results.
- `importMemoryBackupBundle(bundle)` rejects `schemaVersion !== 1` with a structured error. Routes through `batchRestoreChunks()` (ADR-002).

**Invariants:**
- **I-MEM-VERS-1:** Import rejects unknown major versions unless explicitly allowed.
- **I-MEM-VERS-2:** Restore does not partially apply without reporting.
- **I-MEM-VERS-3:** Bundle selection policy is recorded in the envelope for auditability.

**Verification:**
- Contract test: `importMemoryBackupBundle` rejects `schemaVersion=999` (test in `export-memories-contract.test.ts`).
- Contract test: valid bundle routes through `batchRestoreChunks`.
- Contract test: empty-filter export still produces a bundle with `schemaVersion=1`.

---

## ADR-005 — Embedding dimensionality must be evolvable

**Status:** Decided (deferred). Not blocking until embedding model change.

**Context:** `vector-database.ts` creates `VECTOR(768)` column with `CHECK (embedding_dim = 768)`. This hard-locks embedding dimensionality — any future model change requires `ALTER TABLE DROP CONSTRAINT` + schema migration.

**Decision:** Support multiple embedding dims via separate embeddings table keyed by `(memory_id, embedding_model_id, embedding_dim)`. Embeddings are derived/rebuildable, not identity-critical.

**Why deferred:** The codebase is standardized on 768-dim `embeddinggemma`. No model change is imminent. The constraint is a one-way door but not a current blocker.

**Minimal diff plan (when needed):**
1. Introduce `memory_embeddings` table and backfill from current embeddings.
2. Update search path to query embeddings table.
3. Deprecate/stop writing embedding column in the canonical table.
4. Drop the `CHECK (embedding_dim = 768)` constraint.

**Acceptance criteria (when implemented):**
- Can add an embedding model with dimension != 768 without schema rewrite.
- Can run mixed dims concurrently; model selection is explicit per query.
- Export bundles exclude embeddings by default (or include them in a `derived_artifacts` section).

---

## ADR-006 — Sidecar-First Transport, Provenance, and Sterling Reduction Gate

**Status:** IMPLEMENTED (2026-02-11). Hardened (2026-02-11).

**Context:** The codebase had three LLM invocation surfaces (one dead, two live), all pointing at the same MLX-LM sidecar but with inconsistent naming (`Ollama*`, `callOllama`, three different env var conventions), no structured provenance on the impasse-recovery path, and no gating to prevent un-reduced LLM outputs from being registered as executable behavior trees.

### What is the HRM and what goes through Sterling

**HRM (Hierarchical Reasoning Module):** A four-stage LLM pipeline that generates behavior tree proposals when the bot hits an impasse (repeated task failures). The stages are:

1. `generateAbstractPlan` — high-level goal decomposition (System 2)
2. `generateDetailedPlan` — tactical execution planning (System 1)
3. `refinePlan` — iterative refinement loop
4. `generateBTDSL` — concrete BT-DSL generation from refined plan

HRM is **transitional**. It produces candidate behavior trees, but those candidates are not trusted for execution without Sterling validation. HRM is behind the `OptionProposalLLM` interface and is slated for replacement by a Sterling-native option generator.

**What must go through Sterling:**
- Any BT-DSL that will be registered as an executable capability (world-state-modifying)
- Sterling validates semantic correctness via `ReductionClient.reduceOptionProposal()`
- If Sterling blocks it, the proposal is recorded but never registered or executed

**What does NOT go through Sterling:**
- Chat/social responses (text only, no world-state mutation)
- Embedding generation (read-only, retrieval)
- Memory search and retrieval (read-only)
- Advisory-only proposals in development mode (stored for debugging, not registered)

### Decision

1. **Single transport identity:** MLX-LM sidecar is the only inference transport. All references renamed from `Ollama*` to `Sidecar*`. Canonical env var: `LLM_SIDECAR_URL`.

2. **Dead code deletion:** `ProductionLLMInterface` (`core/mcp-capabilities/llm-interface.ts`) deleted — zero imports, not in barrel.

3. **DI seam fix:** `DynamicCreationFlow` depends on `OptionProposalLLM` interface (not concrete `HRMLLMInterface`). This enables swapping HRM for a Sterling-native option generator without changing the flow.

4. **Provenance on every sidecar call:** `SidecarClient.generate()` returns `SidecarGenerateResult` with `SidecarCallProvenance` (model, canonical request envelope hash, output hash, latency, timestamp). HRM pipeline collects per-stage provenance. Output hash uses tagged payloads (`text:...` vs `missing:true`) to distinguish null/empty responses.

5. **Embedding provenance alignment:** `SidecarEmbeddingBackend.embed()` returns `model`, `dim`, `latencyMs` alongside the embedding vector.

6. **Sterling reduction gate (fail-closed):** `ReductionClient` interface in core (pure types, zero cross-package deps). `DynamicCreationFlow` accepts optional `ReductionClient` via `setReductionClient()`. Without it and without the `DYNAMIC_CREATION_ADVISORY_MODE` flag, proposal generation is skipped entirely (no sidecar budget spent). With it, proposals failing reduction return `null` (fail-closed).

### Env var reference

#### Sidecar URL (all packages)

All packages resolve the sidecar URL with the same top-two precedence levels:

| Precedence | Env var | Notes |
|------------|---------|-------|
| 1 (canonical) | `LLM_SIDECAR_URL` | Full URL, e.g. `http://localhost:5002` |
| 2 (deprecated) | `OLLAMA_HOST` | Shared legacy fallback across all packages |
| 3 (cognition only) | `COGNITION_LLM_HOST` + `COGNITION_LLM_PORT` | Legacy host/port split; two separate env vars, assembled as `http://{host}:{port}` |
| 4 (default) | — | `http://localhost:5002` |

**Breaking (2026-02-11):** `OLLAMA_BASE_URL` is no longer accepted anywhere. If your `.env` or scripts use it, rename it to `OLLAMA_HOST`.

#### Other env vars

| Env var | Package | Default | Purpose |
|---------|---------|---------|---------|
| `OLLAMA_MODEL` | core/llm | `llama3.1` | Default model for `SidecarLLMClient` |
| `LLM_SIDECAR_OPENAI` | core/llm | off | `'1'`/`'true'` to use `/v1/chat/completions` |
| `OLLAMA_API_KEY` | core/llm | — | Bearer token for proxy auth |
| `COGNITION_LLM_TIMEOUT_MS` | cognition | `45000` | Timeout for cognition sidecar calls |
| `DYNAMIC_CREATION_ADVISORY_MODE` | core/mcp | off | `'1'` to allow LLM proposals without a bound `ReductionClient` (dev/debug only). Without this flag and without a reduction client, proposal generation is skipped entirely to prevent sidecar budget burn during Sterling outages. |

### Invariants

- **I-LLM-ROUTE-1:** Every sidecar call produces a `SidecarCallProvenance` (model, requestHash, outputHash, latencyMs).
- **I-LLM-ROUTE-2:** Same request envelope → same `requestHash` (deterministic, SHA-256 of stable-literal-order JSON, not general canonicalization).
- **I-LLM-ROUTE-3:** If an output can change world state, it must carry Sterling reduction provenance; otherwise it is advisory text only.
- **I-LLM-ROUTE-4:** Core has zero `@conscious-bot/*` dependencies — `ReductionClient` is pure types, implemented at composition root.
- **I-LLM-ROUTE-5:** HRM is transitional — behind the `OptionProposalLLM` interface, replaceable by Sterling-native generator.
- **I-LLM-ROUTE-6:** Proposal history is bounded (50 entries per task ring buffer + 30-minute TTL eviction of stale tasks) to prevent memory leaks during sustained runs.
- **I-LLM-ROUTE-7:** Without a bound `ReductionClient` and without `DYNAMIC_CREATION_ADVISORY_MODE=1`, no sidecar calls are made for proposal generation. Skip entries use the distinct `skipped_no_reduction_client` outcome (not `advisory_only`).
- **I-LLM-ROUTE-8:** Skip entries update `lastProposalTime` so the impasse debounce logic rate-limits them, preventing history spam during sustained Sterling outages.

### Implementation files

- `core/mcp-capabilities/llm-integration.ts`: `SidecarClient`, `SidecarResponse`, `SidecarCallProvenance`, `SidecarGenerateResult`, `HRMLLMInterface` (provenance collection), `hashRequestEnvelope()`, `hashOutput()`
- `core/mcp-capabilities/dynamic-creation-flow.ts`: `OptionProposalLLM` interface, `ReductionClient` gate, pre-LLM gate, advisory-only degradation, ring buffer history, `ProposalHistoryEntry`
- `core/mcp-capabilities/reduction-client.ts`: `ReductionResult`, `ReductionClient` interfaces
- `core/llm/sidecar-client.ts`: renamed from `ollama-client.ts`, `SidecarLLMClient` class
- `cognition/cognitive-core/llm-interface.ts`: `callSidecar()`, sidecar URL resolution with host/port split fallback
- `memory/embedding-service.ts`: `EmbeddingBackendResult` with `model`, `dim`, `latencyMs`
- `memory/config/memory-runtime-config.ts`: `sidecarUrl` field, canonical env var chain

### Wiring reality (2026-02-11)

- Reduction gate enforcement is implemented in `DynamicCreationFlow`.
- Binding a real `ReductionClient` at the composition root is **required for runtime execution**. Without it, all proposals are advisory-only and not registered as executable capabilities.
- The composition root (e.g., `server.ts`, `cognitive-stream-integration.ts`) must call `dynamicFlow.setReductionClient(...)` when the Sterling client is available. If Sterling is unreachable at boot, the flow degrades safely — proposal generation is skipped entirely (no sidecar budget spent), and skip events are recorded in history.
- `isReductionClientBound()` getter is available for health checks and boot diagnostics.
- `getProposalHistorySize()` returns `{ totalEntries, taskCount }` for memory monitoring.
- Evidence preservation: all gate paths (`skipped_no_reduction_client`, `advisory_only`, `blocked`, `reduction_error`, `allowed`, `llm_returned_null`) store full `ProposalHistoryEntry`. Contract tests cover all paths.
- Proposal history is bounded at 50 entries per task (ring buffer) with 30-minute TTL eviction of stale task histories. Eviction is tested.
- Skip entries update `lastProposalTime` to rate-limit via existing debounce logic, preventing history spam during sustained Sterling outages.

### Verification

- `grep -rn 'OllamaClient\|OllamaResponse\|callOllama' packages/ --include='*.ts'` → 0 matches (deprecated aliases excluded)
- `grep -rn 'ProductionLLMInterface' packages/` → 0 matches
- `grep -rn 'import.*@conscious-bot/' packages/core/src/` → 0 matches
- TypeScript: `npx tsc --noEmit` clean on core, cognition, memory
- Contract tests: `vitest run packages/core/src/__tests__/reduction-gate-contract.test.ts` — 16 passing

---

## Underlying Issues (not ADR-level, but tracked)

### `batchUpsertChunks` transaction bug

**File:** `packages/memory/src/vector-database.ts` (`batchUpsertChunks`, ~line 1087)
**Issue:** Transaction wrapper acquires client A (`BEGIN/COMMIT`), but calls `upsertChunk()` which acquires its own client B from the pool. The transaction doesn't actually bracket the writes. A mid-batch failure won't rollback earlier inserts.
**Status:** OPEN. Fix opportunistically using client-scoped helper pattern (same as `batchRestoreChunks` already does correctly).
**Risk:** Low (current usage is `importMemories` legacy path). Will bite on any new batch ingestion code that assumes transactionality.

### Backup queue cap cliff

**File:** `packages/memory/src/memory-system.ts` (`performAutoBackup`, ~line 2330)
**Issue:** `backupQueue` capped at 1000 rows via `slice(-1000)`. Once the queue is full, oldest entries fall off. With the current "newest 500 per category" export, the queue will eventually reach steady state, but identity-critical old memories (anchors) can be evicted.
**Status:** OPEN. TODO documented in code. Cursor-based incremental backup is the proper fix (ADR-003 follow-up).

### djb2 hash weakness

**File:** `packages/memory/src/memory-system.ts` (`generateBackupHash`, ~line 2364)
**Issue:** 32-bit djb2 hash for backup integrity fingerprinting. Collision-prone (~0.01% at 10k entries), but functional for "did anything change?" checks.
**Status:** OPEN. Acceptable for current use case. Upgrading to a proper hash (SHA-256, FNV-1a 64-bit) is a separate concern.

---

## DR-TRACK-001 — Tracker Hygiene as a Gate

**Status:** Adopted (2026-02-11).

**Context:** TODO tracker drifted from actual code state (H10, H4 already implemented). Investigation time was spent on items that had been resolved in earlier commits but never marked in the tracker.

**Decision:** Any "next priority" TODO must be validated by (a) grep/ripgrep for call sites and (b) confirming the referenced implementation is not still a stub. Updates to the tracker must include: the grep patterns used, the file(s) checked, and the commit hash if available.

**Consequences:** Slightly higher upfront verification cost; materially reduces wasted work and prevents "phantom priority" items.

---

## DR-H10 — Deprecated Alias Removal Verified

**Status:** Verified resolved (aliases removed in 2026-02-03; tracker updated 2026-02-11).

**Context:** H10 tracked removal of deprecated episode linkage aliases (`buildEpisodeLinkage`, `buildEpisodeLinkageFromResult`) before 2026-03-01.

**Decision:** Mark RESOLVED. No call sites remain. Only a historical comment reference persists (`task-integration.ts:545`).

**Verification:**
- Grep pattern: `\bbuildEpisodeLinkage\b` across `packages/`
- Files checked: `packages/planning/src/sterling/episode-classification.ts`, `packages/planning/src/sterling/index.ts`, `packages/planning/src/task-integration.ts`
- Result: Single match — historical comment only (`// NOTE: Local buildEpisodeLinkage was removed in 2026-02-03 commit.`)

**Follow-up (optional):** Either (a) leave the comment as archaeology, or (b) rewrite it to explicitly say "historical; aliases removed in 2026-02-03" to prevent re-escalation.

---

## DR-H4 — Memory Signal Generator Wiring Verified

**Status:** Verified resolved (commit `365ba6b`; tracker updated 2026-02-11).

**Context:** H4 tracked `findSalientMemories()` in `memory-signal-generator.ts:313-314` returning `[]` with `console.log('placeholder implementation')`, starving cognition of memory context.

**Decision:** Mark RESOLVED. `findSalientMemories()` now routes through `this.memorySystem.searchMemories()` with context-derived query construction (recent events, goals, emotional state), type filtering, salience thresholds, and context boosts (world, recency, sentiment).

**Verification:**
- Grep pattern: `placeholder implementation` across `packages/memory/src/`
- Files checked: `packages/memory/src/memory-signal-generator.ts`
- Result: No matches. Method now calls `this.memorySystem.searchMemories(...)` at line 330.
- Commit: `365ba6b` ("Updating both outstanding todos and build errors")

**Follow-up (recommended):** Add a lightweight runtime sanity check (not a unit test) that logs distribution of: input query terms, result counts pre/post filtering, and "why excluded" counters for a short run. Goal is to catch "wired but effectively empty" behavior caused by thresholds/recency windows.

---

## DR-H9 — Task History as a First-Class Prompt Input

**Status:** IMPLEMENTED (2026-02-11).

**Context:** `CognitiveThoughtProcessor.getRecentTaskHistory()` at `packages/planning/src/cognitive-thought-processor.ts:1269` was marked as a PLACEHOLDER — it only returned cached active tasks from the last `shouldCreateNewTasks()` poll (which could be empty during startup or between polls), with no provenance, no completed/failed task visibility, and no stable sorting.

**Decision:** Treat task history as a canonical planning-owned read model consumed by the thought processor via a narrow, prompt-safe contract. Cognition/planning must not infer task history from chat logs or memory chunks.

**Implementation:**
- `TaskHistoryStatus`, `RecentTaskItem`, `TaskHistorySnapshot`, `TaskHistoryProvenance` types at `packages/planning/src/types/task-history.ts`.
- `TaskHistoryProvider` interface with three implementations at `packages/planning/src/task-history-provider.ts`:
  - `DirectTaskHistoryProvider`: In-process access to `TaskIntegration` (active + completed + failed tasks, sorted `updatedAt DESC, id DESC`, capped at 50, prompt-safe mapping with truncated titles/summaries).
  - `HttpTaskHistoryProvider`: Cross-service HTTP access to `GET /tasks/recent` with Zod validation, 3s timeout, and 1.5s TTL cache.
  - `NullTaskHistoryProvider`: Safe default when no planning source is configured.
- `GET /tasks/recent` endpoint added to `packages/planning/src/modules/planning-endpoints.ts` (same prompt-safe shape, stable sorting, bounded output).
- `CognitiveThoughtProcessor.setTaskHistoryProvider()` setter for late-binding (DI seam).
- `getRecentTaskHistory()` now async, calls `this.taskHistoryProvider.getRecent(limit)`, stores provenance on `this.lastTaskHistoryProvenance` for diagnostics (not included in prompt).
- Wired in `modular-server.ts`: `cognitiveThoughtProcessor.setTaskHistoryProvider(new DirectTaskHistoryProvider(taskIntegration))`.

**Invariants:**
- **TASK-HIST-1:** Task history provenance is always recorded (source, fetchedAt, latency, cacheHit).
- **TASK-HIST-2:** No full logs/traces in prompt; only summary fields. Titles capped at 120 chars, summaries at 200.
- **TASK-HIST-3:** Stable sorting on the producing side (`updatedAt DESC, id DESC`).

**Consequences:**
- Pros: Single authority (planning), debuggable provenance, stable prompt inputs, avoids semantic drift.
- Cons: Introduces service dependency (thought processor → task integration) requiring cache + failure handling.

**Verification:**
- TypeScript: `npx tsc --noEmit` passes (only pre-existing `TS6307` persistence errors remain).
- Existing tests: `vitest run packages/planning/src/sterling/__tests__/episode-classification.test.ts` — 45 passing.
- Memory contract tests: `vitest run packages/memory/src/__tests__/export-memories-contract.test.ts` — 13 passing.

**Follow-up (recommended):**
- Add contract tests for `DirectTaskHistoryProvider` (correct mapping, sorting, dedup, cache TTL).
- Add runtime sanity log: on each `getRecentTaskHistory()` call, log task count + source + latency + cache hit at debug level.
- Verify thought generation quality improvement with task context vs without (A/B comparison during a session).

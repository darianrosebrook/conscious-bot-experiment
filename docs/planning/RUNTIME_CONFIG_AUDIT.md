# Runtime Config Audit: Hidden Variable Costs Across Packages

**Purpose:** Identify packages that still rely on scattered `process.env` (or equivalent) reads and would benefit from the same centralized, typed, validated config pattern used in planning (`PlanningRuntimeConfig`). Reduces "mystical" behavior, combinatorics, and accidental production leakage.

**Scope:** All packages under `packages/` except planning (already has a config module). Dashboard uses Vite `import.meta.env` and has a central `config.ts`; included for completeness.

---

## 1. Classification of Env Usage

| Category | Description | Centralize? |
|----------|-------------|-------------|
| **Control-plane** | Mode toggles, feature flags, bypasses (e.g. skip readiness, enable mocks). Affects behavior in non-obvious combinations. | Yes. Single validated config; fail closed on invalid combos. |
| **Deployment** | URLs, ports, DB credentials, timeouts. Vary by environment; no combinatorial logic. | Optional. Single "service config" object improves consistency and documentation. |
| **Debug / logging** | Debug flags, log levels, verbose output. Low risk of production leakage if gated by run mode. | Prefer reading from central config (e.g. `config.debug`) so one place documents them. |
| **Test-only** | Env set in tests (e.g. PROOF_ARTIFACT_STRICT, OLLAMA_AVAILABLE). | No change; keep in test setup. |

---

## 2. Package-by-Package Summary

### 2.1 planning (reference)

- **Done:** `planning-runtime-config.ts` with `PLANNING_RUN_MODE`, capabilities (`skipReadiness`, `taskTypeBridge`), startup validation, planning banner + config digest in golden artifact.
- **Tripwire and migration:** The env-scatter tripwire (`packages/planning/src/__tests__/env-scatter-tripwire.test.ts`) is the guard against new env scatter. Only allowlisted paths may contain `process.env`; any other file fails CI. **Policy:** migrate allowlisted modules to config over time. When a module’s env reads are moved into `planning-runtime-config` (or a sibling config module), remove that path from the allowlist. Do not add new allowlist entries without a migration plan.
- **Remaining direct reads:**
  - **modular-server.ts:** Executor tuning (EXECUTOR_POLL_MS, BOT_BREAKER_OPEN_MS, etc.), service URLs (PLANNING_ENDPOINT, COGNITION_ENDPOINT, …), ENABLE_RIG_E, ENABLE_GOAL_BINDING, keepalive/Sterling idle env, ENABLE_TASK_TYPE_BRIDGE (module load), EXECUTOR_SKIP_READINESS (executor callback). **Recommendation:** Extend PlanningRuntimeConfig or a sibling `PlanningServiceConfig` for URLs and tuning; keep ENABLE_TASK_TYPE_BRIDGE aligned with config.capabilities.taskTypeBridge at module load (e.g. config loaded at startup and passed into allowlist builder).
  - **planning-endpoints.ts:** ENABLE_DEV_ENDPOINTS, NODE_ENV, DEBUG_STERLING_BANNER, ENABLE_PLANNING_EXECUTOR / EXECUTOR_LIVE_CONFIRM (for artifact only; already using config for behavior). **Recommendation:** Derive dev-endpoint gate from config.runMode or a capability.
  - **task-integration.ts:** PLANNING_INGEST_DEBUG_400, NODE_ENV, JOIN_KEYS_DEPRECATED_COMPAT, DEBUG_JOIN_KEYS_MIGRATION, PLANNING_STRICT_FINALIZE. **Recommendation:** Add optional `planningConfig` or a small `PlanningFeatureFlags` read from central config so these are documented and testable in one place.

---

### 2.2 cognition

- **Control-plane / behavior:** SYSTEM_READY_ON_BOOT, TTS_ENABLED, ENABLE_CONSIDERATION_STEP, ALLOW_CONSIDERATION_MOCKS, COGNITION_LLM_OBSERVATION_DISABLED, DISABLE_DRIVE_TICKS, STERLING_ENABLED. PLANNING_INGEST_DEBUG_400 (cross-package).
- **Deployment:** PORT, DASHBOARD_ENDPOINT, PLANNING_ENDPOINT, MINECRAFT_ENDPOINT, PLANNING_SERVICE_URL, COGNITION_LLM_*, STERLING_WS_URL, timeouts, INTERO_HISTORY_LOG_PATH, STRESS_BOUNDARY_LOG_PATH, PG_* (memory-aware-llm).
- **Debug:** COGNITION_LOG_LEVEL, NO_COLOR, OBSERVATION_LOG_DEBUG, COGNITION_OBSERVATION_TIMEOUT_MS, COGNITION_DEBUG, EVAL_VERBOSE.
- **Hidden cost:** Service URLs (DASHBOARD_ENDPOINT, MINECRAFT_ENDPOINT, etc.) repeated in server.ts, process-routes.ts, cognitive-stream-logger.ts. ALLOW_CONSIDERATION_MOCKS and ENABLE_CONSIDERATION_STEP can combine with NODE_ENV in undocumented ways.
- **Recommendation:** Introduce **CognitionRuntimeConfig** (single module): run mode (production | dev | eval), capabilities (considerationStep, allowMocks, sterlingEnabled, ttsEnabled, etc.), service URLs (dashboard, planning, minecraft, sterling), and debug flags. Validate at startup (e.g. allowMocks only when run mode is dev). Use one object in server.ts and pass into routes and Sterling client so no direct process.env in feature logic.

---

### 2.3 core

- **Control-plane:** SYSTEM_READY_ON_BOOT, TRUSTED_SIGNER_API_KEY (auth). DEBUG_STERLING_BANNER, STERLING_ENABLED (behavior).
- **Deployment:** PORT, STERLING_WS_URL, STERLING_SOLVE_TIMEOUT, TTS_*, MINECRAFT_* (demos), PG_* (memory-aware-llm).
- **Debug / NODE_ENV:** NODE_ENV, VERBOSE_ERRORS, SESSION_ID in leaf-contracts.
- **Hidden cost:** Low. Core is a mix of server entrypoint, Sterling client, TTS client, and demos. No large combinatorics. **Recommendation:** Optional **CoreRuntimeConfig** for server (run mode, systemReadyOnBoot, trustedSignerKey) and for Sterling client (url, enabled, timeout, debugBanner); keeps auth and "enabled" logic in one place.

---

### 2.4 memory

- **Control-plane:** SYSTEM_READY_ON_BOOT, WORLD_SEED. Dozens of MEMORY_* feature toggles (enableDecay, enableConsolidation, enableQueryExpansion, etc.) and thresholds.
- **Deployment:** PORT, PG_*, OLLAMA_HOST, MLX_SIDECAR_*, UMAP_SERVICE_*, MEMORY_* (embedding model, dimensions, timeouts, etc.).
- **Hidden cost:** **High.** memory-system.ts builds a large config-like object from 50+ process.env reads at call site. No single validation of "allowed combinations" (e.g. enableDecay with decayInterval). Reproducibility and "which flags were on?" are hard without a manifest.
- **Recommendation:** Introduce **MemoryRuntimeConfig**: single module that reads all MEMORY_*, PG_*, WORLD_SEED, SYSTEM_READY_ON_BOOT once at startup, validates numeric ranges and forbidden combos if any, and exports `getMemoryRuntimeConfig()`. memory-system.ts and server.ts consume this instead of process.env. Optionally emit a memory banner (or config digest) for artifacts that depend on memory.

---

### 2.5 minecraft-interface

- **Control-plane:** SYSTEM_READY_ON_BOOT, LEGACY_ENTITY_PROCESS, TTS_SPEAK_CHAT, DEBUG_HUD, OBSERVATION_LOG_DEBUG.
- **Deployment:** PORT, VIEWER_PORT, WORLD_SEED, WORLD_NAME, MINECRAFT_* (host, port, username, version, auth), COGNITION_SERVICE_URL, MEMORY_ENDPOINT, PLANNING_SERVICE_URL, DASHBOARD_URL, WORLD_SERVICE_URL.
- **Debug:** NODE_ENV (development guards), NAV_DEBUG_STACK.
- **Hidden cost:** **Medium.** Service URLs (COGNITION_SERVICE_URL, PLANNING_SERVICE_URL) repeated in server.ts, bot-adapter.ts, movement-leaves.ts, plan-executor.ts. TTS_SPEAK_CHAT and LEGACY_ENTITY_PROCESS are behavior toggles with no shared validation.
- **Recommendation:** Introduce **MinecraftInterfaceRuntimeConfig**: run mode, capabilities (legacyEntityProcess, ttsSpeakChat, debugHud, observationLogDebug), service URLs (cognition, planning, memory, world, dashboard). Validate at startup; use in server and inject into bot-adapter and leaves so no scattered URL reads.

---

### 2.6 world

- **Deployment:** PORT. **Control-plane:** SYSTEM_READY_ON_BOOT.
- **Hidden cost:** Low. Two env vars. **Recommendation:** Optional small config object (port, systemReadyOnBoot) for consistency; not urgent.

---

### 2.7 dashboard

- **Mechanism:** Vite `import.meta.env` (build-time). Central **config.ts** already aggregates service URLs, feature flags (evaluation, advancedMetrics, systemHealth, realTimeUpdates), and debug (VITE_DEBUG_DASHBOARD).
- **Remaining direct reads:** Several files still read `import.meta.env.VITE_DEBUG_DASHBOARD` directly (dashboard-store, use-initial-data-fetch, use-task-stream, utils). context and config.ts duplicate URL logic.
- **Recommendation:** Prefer importing app config from `config.ts` everywhere and add a `debug` (or `debugDashboard`) flag there so VITE_DEBUG_DASHBOARD is read in one place. Low priority; dashboard is already in better shape than backend packages.

---

### 2.8 evaluation, safety, testkits

- **evaluation / safety:** No process.env found in the grep (or minimal). No action unless future code adds env-driven behavior.
- **testkits:** PROOF_ARTIFACT_DIR, PROOF_ARTIFACT_STRICT in p21 tests only. Test-only; no runtime config needed.

---

## 3. Cross-Cutting Issues

### 3.1 Shared env names, different packages

- **SYSTEM_READY_ON_BOOT:** planning (indirect via readiness), cognition (cognition-state), core (server), memory (server), minecraft-interface (startup-barrier), world (server). Same name, same intent; no single owner. Document in a shared glossary or root README; consider a single "system ready" contract so all services interpret it the same.
- **DASHBOARD_ENDPOINT / URL:** planning, cognition, minecraft-interface use for dashboard URL. Naming inconsistency (ENDPOINT vs URL) and repeated defaults (localhost:3000). A shared "service discovery" or "default base URLs" doc would reduce drift.

### 3.2 Cross-package flags

- **PLANNING_INGEST_DEBUG_400:** Used in planning (planning-endpoints, task-integration) and cognition (intrusive-thought-processor). Belongs to planning; cognition should receive it via config or API contract, not env, if we want a single source of truth.
- **OBSERVATION_LOG_DEBUG:** cognition (server), minecraft-interface (automatic-safety-monitor). Same name; ensure both packages document it and consider aligning default.

### 3.3 Service URL duplication

- **PLANNING_ENDPOINT / PLANNING_SERVICE_URL:** planning (modular-server), cognition (server, process-routes), minecraft-interface (bot-adapter, server, movement-leaves, plan-executor). Multiple names for the same thing. Standardize on one name per service (e.g. PLANNING_SERVICE_URL) and one default (e.g. http://localhost:3002) in docs.

---

## 4. Recommended Priority

| Priority | Package | Action | Rationale |
|----------|---------|--------|-----------|
| 1 | **memory** | Add MemoryRuntimeConfig | Largest number of env reads and feature toggles; single file already "config-shaped" but inline. High reproducibility and audit benefit. |
| 2 | **cognition** | Add CognitionRuntimeConfig | Multiple control-plane flags and repeated URLs; ALLOW_CONSIDERATION_MOCKS and consideration step need explicit run-mode gating. |
| 3 | **minecraft-interface** | Add MinecraftInterfaceRuntimeConfig | Repeated service URLs and behavior toggles (LEGACY_ENTITY_PROCESS, TTS_SPEAK_CHAT); clear boundary for "which system produced this." |
| 4 | **planning** | Extend PlanningRuntimeConfig | Migrate remaining control-plane and URL reads in modular-server and task-integration to config or a sibling service-config module. |
| 5 | **core** | Optional CoreRuntimeConfig | Small surface; useful for auth (TRUSTED_SIGNER_API_KEY) and Sterling client defaults. |
| 6 | **dashboard** | Centralize VITE_DEBUG_DASHBOARD | Already has config.ts; route all debug and URLs through it. |
| 7 | **world** | Optional small config | Two vars; low cost. |

---

## 5. Pattern to Reuse (from planning)

1. **Single module per package** (e.g. `cognition-runtime-config.ts`): reads env once, derives run mode and capabilities, validates forbidden combinations (throw at startup).
2. **Run mode** (e.g. production | dev | eval): default from NODE_ENV or explicit env (e.g. COGNITION_RUN_MODE). Capabilities derived from run mode + explicit flags.
3. **No direct process.env in feature code:** inject config (or getter) where behavior depends on flags; tests can override config.
4. **Evidence capture:** For packages that produce artifacts (e.g. golden runs, proof bundles), record a one-line banner or config digest so the artifact is self-describing.
5. **Document env in one place:** Config module docblock or README section listing every env var the package respects and its default.

---

## 6. Acceptance Criteria for "Config Done" per Package

- [ ] One typed config object (or small set) is the only source for run mode and capability flags.
- [ ] Startup validation runs once; invalid combinations (e.g. production + mock allowed) throw or exit.
- [ ] No direct process.env reads in feature/control paths (deployment URLs and ports may stay env-based if documented).
- [ ] Optional: banner or config_digest in any artifact the package produces.
- [ ] Env vars documented in config module or package README.

---

*Audit generated from codebase grep of process.env and import.meta.env across packages. Update when adding new env-driven behavior or new packages.*

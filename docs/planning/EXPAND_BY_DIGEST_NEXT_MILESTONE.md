# Expand-by-Digest (Pattern A) — Status and Next Milestone

**Purpose:** Record verified state of the bridge and the single next milestone for a cert-grade golden run. Complements Sterling’s `docs/working/implementation/expand_by_digest_pattern_a_overview.md`.

For anchored state (artifact/contract), shortest path to close the executor gap, and the leaf/args fork, see `docs/planning/PATTERN_A_GOLDEN_RUN_SESSION_OVERVIEW.md`.

---

## Verified State (Current Artifacts)

1. **Server evidence-identifiable:** Unified server prints one line: `STERLING_SERVER_BANNER file=<path> git=<short_sha> supports_expand_by_digest_v1_versioned_key=true`.
2. **Versioned lookup key:** `(schema_version, committed_ir_digest)` is the canonical key; expand does not proceed without `schema_version`.
3. **Reduce-time registration:** Committed IR (when present), goal_prop_id, and envelope_id are stored under that key for on-demand materialization.
4. **Expand-by-digest referential integrity:** When an entry has `envelope_id`, the request must supply and match it or the server blocks with explicit reasons.
5. **Expansion structurally fail-closed:** Server validates `steps` as list of `{ leaf: str, args: dict }` and returns `blocked_invalid_steps_bundle` if malformed.
6. **Materializer policy:** Strict mode requires explicit goal proposition id and lemma in mapping table; dev mode can fall back.
7. **Integration tests:** Sterling repo locks lifecycle (register → materialize → validate) and catches regressions.
8. **Contract alignment:** `blocked_reason` enum in `contracts/sterling-executor.yaml` matches server-emitted reasons.

---

## Not Yet E2E Proven

- **A)** “Expansion ok” is necessary but not sufficient. Materializer emits steps with `leaf` like `task_type_craft` and args as proposition metadata; these may not be executable if the TS executor allowlist/arg contracts expect different leaf IDs and richer args.
- **B)** One cert-grade golden run is missing: reduce registers → expand returns ok with validated steps → executor dispatches at least one step (live or trace-only) → trace captured.

---

## Single Next Milestone (Priority)

**One golden run where:** the banner identifies the server, expansion returns `ok` with structurally valid steps, and the TS executor dispatches at least one step without a translation layer.

### Actions

1. **Banner in artifact (protocol-based, mechanically unavoidable)**
   - Sterling exposes WS command `server_info_v1`; response `server_info.result` includes `banner_line`.
   - Planning calls `getServerBanner()` on connect path (inject) and before expansion when runId is set; validates banner contains `supports_expand_by_digest_v1_versioned_key=true`; records via `recordServerBanner(runId, banner_line)`.
   - Missing or invalid banner is a hard failure (inject returns 503; expansion returns error). Every golden artifact has `server_banner` populated.

2. **Reduce then expand**
   - Use the same `(schema_version, committed_ir_digest)` the server registered at reduce time.
   - If the registry entry has `envelope_id`, include matching `envelope_id` in the expand request (otherwise deterministic block).

3. **Acceptance (golden artifact)**
   - `server_banner` present (or documented as “captured by harness”).
   - `expansion.status === "ok"`.
   - `expansion.steps.length >= 1`.
   - No `blocked_invalid_steps_bundle` (enforced server-side).

### Common Blocked Reasons (Attribution)

| Reason | Meaning |
|--------|--------|
| `blocked_digest_unknown` | Reduce did not register this server epoch, schema_version mismatch, or server restarted without stub/persistence. |
| `blocked_missing_envelope_id` / `blocked_envelope_id_mismatch` | TS did not plumb the envelope_id it had at reduce time. |
| `blocked_invalid_ir_bundle` | Strict mode blocked, goal prop missing, or lemma not in mapping table. |

---

## Follow-On: Leaf Vocabulary and Executor

After expansion returns ok, steps must be executable by the TS executor.

- **Option A (recommended):** Sterling emits executor-native leaf IDs and args that satisfy `validateLeafArgs` / `KNOWN_LEAVES` in `packages/planning/src/modules/leaf-arg-contracts.ts`. TS remains a dispatcher; semantics stay in Sterling.
- **Option B:** Add executor support for `task_type_*` as first-class leaves (deterministic modules). Requires governance so TS does not become a second semantic authority.

**Acceptance (either option):** After `expansion.status === "ok"`, executor accepts leaf/args without heuristic translation and `execution.dispatched_steps.length >= 1`.

---

## Expansion ok: no-escape-hatches mode

For the milestone run, use fail-closed configuration:

- `STERLING_STRICT_EXPANSION=1` (no first-proposition fallback, no generic lemma).
- `STERLING_ALLOW_DEFAULT_EXPANSION_STEPS=0` (no default steps).
- TS always sends `schema_version`, `committed_ir_digest`, and when present in the registry entry, `envelope_id` (otherwise deterministic block, which is correct).

Treat `blocked_invalid_steps_bundle` as a **Sterling bug** class (structural validation lives in Sterling); keep executor attribution clean.

---

## References

- Sterling: `docs/working/implementation/expand_by_digest_pattern_a_overview.md`
- Contract: `contracts/sterling-executor.yaml` (expand-by-digest, blocked_reason enum, LeafPlanStepV1)
- Golden run: `packages/planning/src/golden-run-recorder.ts`, `docs/planning/golden-run-runbook.md`
- TS executor leaf contracts: `packages/planning/src/modules/leaf-arg-contracts.ts`

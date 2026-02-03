# Keep-Alive + Rolling Scenario Eval — Acceptance Criteria

Status: Draft (review-ready)
Date: 2026-02-03
Scope: Define objective, observable acceptance criteria for (A) a keep-alive observation loop that respects autonomy and invariants, and (B) a rolling scenario eval harness that produces reproducible, hot-swappable telemetry.

Non-goals:
- Reintroducing “drive ticks” or hardcoded goal selection.
- Keyword-based task injection.
- Any conversion pathway that bypasses explicit model intent ([GOAL:] or structured equivalent).

Definitions (terms used below)
- Thought: a cognitive stream entry `{id, type, content, processed, convertEligible, metadata...}`.
- Actionable thought: `processed=false` AND `convertEligible=true` AND (goal extraction succeeded).
- Percept / awareness thought: informational; must be `convertEligible=false`.
- Ack: planning’s explicit processing acknowledgement via POST `/api/cognitive-stream/ack`.
- Situation frame: factual context presented to the model (sensors + deltas + bounded memory slice); MUST NOT contain suggested goals.
- Prompt profile: a named context-budget template (e.g. minimal/balanced/rich) that changes only frame composition, not policies.

Hard invariants (must remain true)
- I-1 No goal injection: the system may present facts, but never propose candidate tasks/goals.
- I-2 Autonomy is optional: “no action” is a valid steady state.
- I-3 Action only via explicit intent: tasks can only originate from explicit model intent that passes extraction + grounding + routing.
- I-4 Planning owns `processed=true`: cognition does not pre-ack planning work.

──────────────────────────────────────────────────────────────────────────────
A. KEEP-ALIVE OBSERVATION LOOP (KA-*)
──────────────────────────────────────────────────────────────────────────────

KA-A1 (No goal injection in keep-alive framing)
Requirement:
- Keep-alive must not introduce action proposals, candidate lists, or “you should …” language.
Observable signals:
- Grep-based (repo): no keep-alive code contains hardcoded verbs suggesting actions (e.g. “explore”, “gather”, “craft”) in the situation-frame construction path.
- Runtime log line emitted on each keep-alive introspection includes `frame_kind=factual_only`.
Expected log line (exact):
- `[KeepAlive] introspection frame_kind=factual_only profile=<PROFILE> facts=<N> memories=<M> deltas=<D>`

KA-A2 (Keep-alive outputs are non-actionable by default)
Requirement:
- Keep-alive must publish thoughts with `convertEligible=false` unless and until the model emits an explicit goal tag that passes extraction + grounding.
Observable signals:
- Cognitive stream shows keep-alive thoughts include `convertEligible: false`.
Expected log line (exact):
- `[Cognition] keepalive_thought published id=<ID> convertEligible=false processed=false`

KA-A3 (Autonomy is optional; extended observation is a pass)
Requirement:
- In a safe and stable scenario (no threats, stable vitals), keep-alive may run for ≥10 minutes with zero actionable thoughts without triggering fallback task injection.
Observable signals:
- `/api/cognitive-stream/actionable` returns `count=0` for the duration.
- Planning creates 0 tasks from keep-alive alone.
Expected log lines (exact):
- `[CognitiveStream] /actionable: returned=0 queue_size=<Q> filtered_out=<F>`
- `[Planning] [AUTONOMOUS EXECUTOR] Idle detected: no_tasks (active=0, eligible=0)`

KA-A4 (Rate limiting: no compulsive narration)
Requirement:
- Keep-alive must not emit introspection thoughts more frequently than `KEEPALIVE_MIN_INTERVAL_MS` unless a *stimulus event* occurs (see KA-A5).
- Default: ≤ 1 keep-alive introspection thought per 120 seconds.
Observable signals:
- Log timestamps show keep-alive introspection emits respect interval.
Expected log line (exact):
- `[KeepAlive] skip reason=cooldown remaining_ms=<MS>`

KA-A5 (Stimulus-gated acceleration)
Requirement:
- Only the following may bypass cooldown: threat delta, damage taken, hunger drop > threshold, health drop > threshold, novel entity, or explicit external “poke” event for eval.
Observable signals:
- When bypass happens, a stimulus reason is logged.
Expected log line (exact):
- `[KeepAlive] bypass cooldown reason=<threat_delta|damage|hunger_drop|health_drop|novel_entity|eval_poke>`

KA-A6 (Perception refresh is explicit and uses existing pathways)
Requirement:
- Keep-alive may request perception refresh but must not fabricate awareness thoughts.
Observable signals:
- The only keep-alive “refresh” behavior is emitting an event to the existing perception pipeline.
Expected event (exact):
- Cognition receives: `type=environmental_awareness` (or the canonical internal event type used by your system), with a metadata field:
  - `metadata.source="keepalive"`
Expected log line (exact):
- `[KeepAlive] request_perception_refresh type=environmental_awareness source=keepalive`

KA-A7 (No duplicate percept spam caused by keep-alive)
Requirement:
- Keep-alive must not increase the rate of identical awareness messages; saliency dedup remains effective.
Observable signals:
- In a stable “N neutrals nearby” environment, awareness messages coalesce to ≤ 1 per 30 seconds (content-identical).
Expected log line (exact; emitted on suppression):
- `[Saliency] awareness_suppressed reason=dedup window_ms=30000 content_hash=<HASH>`

KA-A8 (No alternate conversion pathways)
Requirement:
- Keep-alive must not call planning task creation directly and must not set `convertEligible=true` directly.
Observable signals:
- Code review: keep-alive module has no dependency on task creation APIs.
- Runtime: any thought with `convertEligible=true` must also include `metadata.extractedGoal` and `metadata.grounding.pass=true`.
Expected log line (exact):
- `[Cognition] convertEligible=true requires extractedGoal+grounding_pass id=<ID>`

──────────────────────────────────────────────────────────────────────────────
B. ACTIONABILITY / STREAM CONTRACT (SC-*)  (guards that keep things correct)
──────────────────────────────────────────────────────────────────────────────

SC-B1 (Actionable feed is opt-in and starvation-safe)
Requirement:
- `/api/cognitive-stream/actionable` MUST return only thoughts with `convertEligible === true`.
- Percepts must not appear in actionable feed, even if unprocessed.
Observable signals:
- Calling `/actionable` on a stream containing only percepts returns `count=0`.
Expected log line (exact):
- `[CognitiveStream] /actionable: returned=<N> opt_in_only=true`

SC-B2 (Ack semantics: planning acks every evaluated thought)
Requirement:
- Planning MUST ack each actionable thought it evaluates (converted OR skipped OR errored).
Observable signals:
- For each planning poll cycle, number of thoughts fetched equals number acked.
Expected log line (exact):
- `[Thought-to-task] ack batch size=<N> fetched=<N> converted=<C> skipped=<S> errors=<E>`
- `[CognitiveStream] Acked <N>/<N> thoughts`

SC-B3 (Processed ownership)
Requirement:
- Thoughts created in cognition must start `processed=false`.
- Only `/ack` transitions them to processed.
Observable signals:
- No cognition creation path sets `processed=true`.
Expected log line (exact):
- `[Cognition] thought_published processed=false`

SC-B4 (Retention/queue boundedness)
Requirement:
- Thought queue remains bounded under high percept volume:
  - hard cap enforced, and old non-actionable pruned.
Observable signals:
- `/recent` and `/actionable` logs show queue size does not grow unbounded during a 10-minute percept flood.
Expected log line (exact):
- `[CognitiveStream] prune before=<A> after=<B> dropped=<D>`

──────────────────────────────────────────────────────────────────────────────
C. ROLLING SCENARIO EVAL HARNESS (EV-*)
──────────────────────────────────────────────────────────────────────────────

EV-C1 (Hot-swappable suites)
Requirement:
- Eval harness reads scenarios from JSONL on each run; changing the JSONL requires no rebuild.
Observable signals:
- A changed suite file (scenario added/edited) appears in the next run’s “loaded suite” log with updated `line_count` and `suite_sha256`.
Expected log line (exact):
- `[Eval] suite_loaded path=<PATH> line_count=<N> suite_sha256=<SHA>`

EV-C2 (Schema validation with actionable errors)
Requirement:
- Invalid scenario lines fail fast with: file path, line number, and validation error list.
Observable signals:
- Non-zero exit code; logs include line-level diagnostics.
Expected log line (exact):
- `[Eval] suite_invalid path=<PATH> line=<L> errors=<JSON>`

EV-C3 (Profiled framing; policies unchanged)
Requirement:
- Prompt profiles may change only: fact budget, delta inclusion, memory slice size, and formatting; they must not add goals.
Observable signals:
- Each scenario run logs the selected profile and the exact frame counts (facts/memories/deltas).
Expected log line (exact):
- `[Eval] scenario_run id=<ID> profile=<PROFILE> facts=<N> memories=<M> deltas=<D> seed=<SEED>`

EV-C4 (Reproducible result bundles)
Requirement:
- Each scenario run writes a result artifact containing:
  - scenario id/version/hash
  - exact input frame (as rendered)
  - model identifiers and config
  - output thought text
  - extractedGoal (if any)
  - grounding decision + reason
  - convertEligible decision + reason
  - timestamps + latency
Observable signals:
- For a run output directory, each scenario produces `result.json` and a rollup `summary.json`.
Expected files (exact):
- `artifacts/evals/<SUITE>/<PROFILE>/<RUN_ID>/summary.json`
- `artifacts/evals/<SUITE>/<PROFILE>/<RUN_ID>/scenarios/<SCENARIO_ID>.json`

EV-C5 (Metric set answers the “too much vs too little” question)
Requirement:
- The harness computes at minimum:
  - action_rate (goal emitted + passed extraction)
  - grounding_pass_rate
  - repetition_rate (content-identical within window)
  - compulsion_proxy (actions in low-stimulus scenarios)
  - hallucination_count (grounding failures categorized)
  - latency_p50/p95
Observable signals:
- Summary artifact includes these metrics; logs print a compact line.
Expected log line (exact):
- `[Eval] summary action_rate=<AR> grounding_pass_rate=<GR> repetition_rate=<RR> compulsion_proxy=<CP> latency_p95_ms=<L95>`

EV-C6 (Two modes: thought-only and end-to-end)
Requirement:
- Harness supports:
  - thought-only mode (no planning)
  - end-to-end mode (planning consumes actionable feed and acks)
Observable signals:
- Mode displayed in logs; end-to-end mode includes ack statistics.
Expected log lines (exact):
- `[Eval] mode=thought_only`
- `[Eval] mode=end_to_end planning_ack=true`

EV-C7 (No “success requires action” anti-pattern)
Requirement:
- The harness must not fail just because the model did not act. It evaluates properties, not action presence.
Observable signals:
- Stable low-stimulus suite can produce `action_rate=0` with PASS if other properties hold.
Expected log line (exact):
- `[Eval] PASS properties_satisfied=true action_rate_may_be_zero=true`

──────────────────────────────────────────────────────────────────────────────
D. PROPERTY-BASED ASSERTIONS (PA-*)  (scenario-level invariants)
──────────────────────────────────────────────────────────────────────────────

PA-D1 (No fabricated state)
Requirement:
- Output must not claim inventory/items/entities not present in the scenario frame.
Observable signals:
- Grounding checker flags fabricated references; harness records hallucination categories.
Expected log line (exact):
- `[Grounding] fail scenario=<ID> reason=<missing_entity|missing_item|missing_location>`

PA-D2 (Goal correctness if goal exists)
Requirement:
- If a goal is emitted:
  - must be routable
  - must ground to available facts
  - must set `convertEligible=true` only after passing extraction+grounding
Observable signals:
- Scenario result includes `extractedGoal` + `grounding.pass=true` + `convertEligible=true`.
Expected log line (exact):
- `[Eval] goal_emitted scenario=<ID> action=<A> target=<T> grounding=pass routable=true`

PA-D3 (Non-goal thoughts remain non-actionable)
Requirement:
- If no goal is emitted, `convertEligible` must be false and planning must not create a task.
Observable signals:
- In end-to-end mode, created tasks count remains 0 for those scenarios.
Expected log line (exact):
- `[Eval] no_goal scenario=<ID> convertEligible=false`

──────────────────────────────────────────────────────────────────────────────
E. MANUAL VERIFICATION COMMANDS (MV-*)
──────────────────────────────────────────────────────────────────────────────

MV-E1 (Actionable feed sanity)
- Command:
  - `curl -s "http://localhost:3003/api/cognitive-stream/actionable?limit=10" | jq '.count'`
- Pass:
  - returns 0 in a percept-only environment; returns >0 only when explicit goals are emitted.

MV-E2 (Recent feed sanity)
- Command:
  - `curl -s "http://localhost:3003/api/cognitive-stream/recent?limit=5" | jq '.thoughts[].processed'`
- Pass:
  - all returned thoughts default to `false` unless explicitly acked.

MV-E3 (Ack correctness)
- Command:
  - fetch actionable → ack ids → fetch actionable
- Pass:
  - acked thoughts do not reappear.

──────────────────────────────────────────────────────────────────────────────
Exit / status criteria (for CI)
- CI PASS requires:
  - SC-* satisfied (stream contract)
  - EV-* satisfied (harness outputs + schema validation)
  - PA-* satisfied for the provided suite
- CI must NOT require `action_rate > 0`.
# QUARANTINE: `keep-alive/`

**Status**: Scheduled for rename/scrub review.
**Grep marker**: `QUARANTINE: keep-alive-rename` (every file marked for
this review uses this exact string — `grep -rn "QUARANTINE: keep-alive-rename"`
from the repo root will find them all).
**Gating lever**: `STERLING_IDLE_EPISODES_ENABLED` environment variable.

---

## What this document is for

This directory contains a subsystem that is **misnamed**. The English word
"keepalive" usually means one of several well-known protocol or infrastructure
mechanisms (see *What this module is NOT* below). This module is none of them.
It is a **bot idle-episode goal-emission loop** — a pipeline that, when the
bot has nothing to do, calls the LLM and asks it whether it would like to
generate an autonomous goal.

That mismatch between name and function has caused at least one prior LLM
agent to confabulate code on top of the wrong mental model, and this document
exists so the next reader — LLM or human — does not repeat that mistake
before the scrub/rename happens.

If you are about to add code to this directory, modify any file whose name
contains `keep-alive`, or change anything related to `KeepAliveController`,
**read this document first**.

---

## What this module actually does

The subsystem spans two packages:

- **`packages/cognition/src/keep-alive/`** — this directory. Contains
  `KeepAliveController` (the controller class), `idle-detector.ts` (the
  LF-9 idle-eligibility gate), `intention-check-prompt.ts` (the LLM prompt
  template), `event-types.ts` (observability event shapes), and a test
  suite under `__tests__/`.

- **`packages/planning/src/modules/keep-alive-integration.ts`** — the
  planning-side bridge. Dynamically imports `KeepAliveController` from
  `@conscious-bot/cognition` at runtime and drives it from the planning
  executor's idle-detection pipeline.

### The runtime flow (happy path)

1. The planning executor's idle detector decides the bot has no work to do.
   It sets `executorState.idleReason` to one of:
   - `'no_tasks'` — no active plan tasks and no queued candidates
   - `'blocked_on_prereq'` — all tasks are blocked waiting on prerequisites
     (e.g. a crafting task waiting on materials)
   Other idle reasons (`backoff`, `circuit_breaker`, `manual_pause`) are
   transient executor states and do **not** trigger this pipeline.

2. `KeepAliveIntegration.onIdle(executorState, botState)` is called with
   the current state snapshot.

3. If `STERLING_IDLE_EPISODES_ENABLED` is false, the integration short-
   circuits here and returns `null`. **This is the off-switch.**

4. Otherwise, the integration builds a `KeepAliveContext` from the bot
   state and calls `KeepAliveController.tick(context)`.

5. `KeepAliveController.tick()` runs its **own** idle gate (stricter than
   the executor's), checking:
   - No active plan steps currently executing
   - No recent task conversions (in the last 30s)
   - No critical threat (high/critical threat level)
   - No recent user command (in the last 10s)
   If any of those conditions fail, the tick is skipped with a
   `skip_not_idle` event.

6. Otherwise, the tick proceeds to rate-limit and circuit-breaker checks.
   If either fails, the tick is skipped.

7. If all gates pass, the controller builds a factual situation frame
   using the production reasoning surface (LF-4) and calls the LLM with
   the `intention-check-prompt.ts` template. The prompt says, in effect:

   > *"Here are the facts. If you have no current intention, simply
   > acknowledge the situation — this is the expected default. If you
   > genuinely have an intention given these facts (not suggested by this
   > prompt), express it using `[GOAL: <action> <target> <amount>]`."*

8. If the LLM emits a `[GOAL: ...]` tag, the controller runs the output
   through the Sterling reasoning surface for eligibility checking. If
   ineligible, the goal is dropped and the tick is recorded with
   `goal_present=true, convert_eligible=false`.

9. If eligible, the goal is emitted as a `thought` event, which the
   planning integration translates into a new task and feeds back into
   the planning executor.

### The invariants (as documented in source)

The controller's design uses labels `LF-1` through `LF-9` and `I-1`
through `I-4` for what the author calls "non-injective" properties:

- **I-1**: No goal injection — the system presents facts, never proposes
  candidate actions or goals.
- **I-2**: Autonomy is optional — "no action" is a valid steady state.
- **I-3**: Action only via explicit intent — goals come from the model,
  not from the system.
- **I-4**: Planning owns `processed=true` — cognition doesn't pre-ack
  planning work.

The invariants are genuine design constraints, and the tests in
`keep-alive/__tests__/` and `planning/src/modules/__tests__/` do enforce
some of them. Whatever decision is made about the rename, these
invariants are worth preserving in whatever replaces this subsystem.

---

## What this module is **NOT**

The word "keepalive" collides with at least **four** unrelated meanings
in this codebase. This module is **none** of them:

### 1. SSE protocol keepalive
Location: `packages/cognition/src/routes/cognitive-stream-routes.ts`
(see `startSseKeepalive` and commit `08ca127`).

A `setInterval` that writes `: keepalive\n\n` (an SSE comment frame per
the HTML5 EventSource spec) to every connected `/api/cognitive-stream`
client every 30 seconds. Its sole purpose is to prevent HTTP intermediaries
(proxies, browsers, load balancers) from timing out an otherwise-idle event
stream. SSE clients ignore comment frames. It does not call any LLM, emit
any goal, or touch any bot state.

This is **standard SSE plumbing**, identical to every other real-time
dashboard in the world.

### 2. HTTP/1.1 `Connection: keep-alive`
Location: The same SSE route handler sets
`res.setHeader('Connection', 'keep-alive')` as part of its SSE headers.

This is the HTTP/1.1 persistent-connection directive — it tells the client
to keep the underlying TCP connection open for reuse across requests.
Pure HTTP plumbing. It is stock SSE boilerplate and has nothing to do with
this module.

### 3. "Server-hot" keepalive
Location: **Does not exist.** Not implemented anywhere in this codebase.

A hypothetical periodic heartbeat mechanism to prevent LLM model unload
or service idle-shutdown — e.g., pinging the LLM backend every N seconds
to keep a model loaded in memory, or pinging a downstream service to
prevent container scale-down. The current codebase has `llmInterface
.preloadModel()` (a one-shot call at startup in `server.ts`) but no
periodic equivalent.

**This is the meaning the user originally intended when the word
"keepalive" first entered the project vocabulary.** The prior LLM agent's
confabulation built this directory under the "keepalive" label but
implemented something entirely different, leaving the original intent
unimplemented.

### 4. Generic "keep the process running" / liveness
Not used in this sense in the codebase, but worth naming because it's what
the phrase suggests out of context. Kubernetes liveness probes, systemd
`Restart=on-failure`, and similar process-supervision mechanisms are
elsewhere (deployment configs) and not touched by this module either.

---

## Naming history

This is a best-guess reconstruction, based on the code as it stands and
the user's in-session warning. It is not fully sourced from commit
archaeology — if you care about the exact history, run `git log --follow`
on `packages/cognition/src/keep-alive/`.

1. **Original intent**: The user wanted a server-hot keepalive — a
   periodic mechanism to keep the LLM service hot and/or prevent
   downstream idle-shutdown. The word "keepalive" entered the project
   vocabulary with that meaning.

2. **Prior agent confabulation**: A prior LLM coding agent was asked to
   work on "keepalive." It interpreted the term as "keep the bot doing
   things" — i.e., bot autonomy during idle periods — and built this
   directory plus the planning-side integration under that mental model.
   The code is well-structured and internally consistent (it has tests,
   invariants, and observability hooks), but the name does not match
   the function.

3. **Integration into planning**: The confabulated subsystem was wired
   into `packages/planning/src/modules/keep-alive-integration.ts` and
   became a load-bearing part of the planning executor's idle-episode
   pipeline. As of the most recent gating commit (`9da9a0c fix: gate
   ALL autonomous task creation on STERLING_IDLE_EPISODES_ENABLED`),
   the autonomy pathway is behind an environment variable and can be
   turned off — but by default the dev startup script
   (`scripts/start.js`) sets `STERLING_IDLE_EPISODES_ENABLED=true`.

4. **Original intent still unimplemented**: The server-hot keepalive
   mechanism the user originally wanted was never built. If you are
   reading this document because you are looking for that mechanism,
   it does not exist yet and would need to be designed and implemented
   separately.

5. **Current session (this commit)**: The name collision was identified
   during a code-review audit of error handling in the cognition package
   (see commit `08ca127` for the SSE keepalive refactor, which added the
   disambiguation banner to `cognitive-stream-routes.ts`). The user
   flagged that the prior confabulation had interfered with other code
   and asked for this directory to be marked for scrubbing. This
   document is the result.

---

## Current gating

The autonomous goal-emission pathway is gated behind
`STERLING_IDLE_EPISODES_ENABLED`. Specifically, at
`packages/planning/src/modules/keep-alive-integration.ts` around line 241:

```ts
if (this.config.enableSterlingIdleEpisodes) {
  // ... idle-episode emission logic ...
}
```

Where `enableSterlingIdleEpisodes` is set from:
```ts
enableSterlingIdleEpisodes:
  process.env.STERLING_IDLE_EPISODES_ENABLED === 'true',
```

**Default behavior**:
- `scripts/start.js` (the dev startup script) sets
  `STERLING_IDLE_EPISODES_ENABLED=true` if not already set in the
  environment. See lines ~1032 and ~1542 of that file.
- Production deployment behavior depends on how the environment is
  configured. The `.caws/working-spec.yaml` lists
  `"Disable STERLING_IDLE_EPISODES_ENABLED"` as a mitigation option,
  and `.caws/change-impact-map.md` describes the roll-forward as
  enabling it.

**To turn off the autonomy pathway**: set
`STERLING_IDLE_EPISODES_ENABLED=false` in the environment, or remove
the dev-script defaulting.

**What is NOT gated**: the `KeepAliveController` class itself, its
tests, and its exports from `@conscious-bot/cognition` are unconditional.
The gate lives in the planning-side integration. This means:

- The cognition package builds and exports the controller regardless
  of the env var.
- The cognition-side tests (`keep-alive/__tests__/idle-detector.test.ts`,
  `sterling-runtime-integration.test.ts`) run regardless.
- The planning-side tests (`idle-episode-eligibility.test.ts`,
  `keep-alive-vitals-goal-binding.test.ts`) explicitly set
  `enableSterlingIdleEpisodes` to both `true` and `false` to verify
  both paths.

---

## Scrub plan (pending user decision)

No action has been taken on the scrub yet. This document and the
accompanying banner comments are the quarantine marker. The user needs
to decide between several options, in roughly increasing order of
invasiveness:

### Option 0 — Leave it alone
The simplest choice. The gating lever exists, the tests pass, and the
invariants are documented. The only cost is the ongoing risk that a
future reader (LLM or human) conflates the three "keepalive" meanings
again. This document and the banner comments mitigate that risk.

### Option 1 — Add clarifying comments only (what this commit does)
Add banner comments to the top of the key files and a `QUARANTINE.md`
(this document) describing the situation. No code change. This is the
minimum safe step and is what the quarantine-marking commit does. It does
not resolve the naming collision but it makes it visible to the next reader.

### Option 2 — Rename in place
Rename the directory, class, and integration module to something that
describes what the code actually does. Candidate names:

- `idle-goal-emission/` + `IdleGoalEmissionController`
- `idle-intention-check/` + `IdleIntentionCheckController`
- `sterling-idle-episodes/` + `SterlingIdleEpisodeController`

Cost: a cross-package import rename touching both `packages/cognition/`
and `packages/planning/`, probably 15–25 files. Tests would need their
imports updated. The env var (`STERLING_IDLE_EPISODES_ENABLED`) could
either be renamed in the same pass or kept for backward compatibility.
This is mechanical but non-trivial; the user should budget a focused
~1 hour with a scoped test run.

### Option 3 — Deprecate and build the server-hot keepalive instead
If the original user intent (a server-hot heartbeat to keep the LLM
service warm) is the actually-desired mechanism and the autonomy
pathway is NOT wanted, the right move is:

1. Flip `STERLING_IDLE_EPISODES_ENABLED` to default `false` in
   `scripts/start.js`.
2. Monitor whether anything in active research depends on the autonomy
   pathway. If nothing does, delete the directory and the planning-side
   integration.
3. Design and implement a separate server-hot keepalive mechanism in
   its own scope, with a name that does not collide with any of the
   four meanings above.

Cost: significant, because it involves both deletion work and net-new
design for the server-hot mechanism. But it resolves the confusion
permanently and implements what was originally wanted.

### Option 4 — Split the difference
Rename *and* build the server-hot mechanism. This is the most work but
the clearest end state: the autonomy pathway keeps working under a
correct name, the server-hot pathway exists under its own name, and
the four "keepalive" meanings each have one unambiguous home.

---

## Files in scope for the scrub

Grep for `QUARANTINE: keep-alive-rename` to find every file currently
marked. As of the planning-side banner commit the set is:

- `packages/cognition/src/keep-alive/index.ts` (this directory's
  public export barrel, carries a short quarantine pointer)
- `packages/cognition/src/keep-alive/keep-alive-controller.ts` (the
  controller class definition, carries a short quarantine pointer)
- `packages/cognition/src/index.ts` (the cognition package's top-level
  barrel re-exporting `KeepAliveController`, carries a one-line
  quarantine pointer)
- `packages/cognition/src/keep-alive/QUARANTINE.md` (this document)
- `packages/planning/src/modules/keep-alive-integration.ts` (the
  planning-side bridge that dynamically imports KeepAliveController
  and drives it from the idle-detection pipeline — carries a full
  banner pointing at this QUARANTINE.md via relative path)

Not currently marked but in scope for the scrub if/when it happens:

- `packages/cognition/src/keep-alive/idle-detector.ts`
- `packages/cognition/src/keep-alive/intention-check-prompt.ts`
- `packages/cognition/src/keep-alive/event-types.ts`
- `packages/cognition/src/keep-alive/__tests__/idle-detector.test.ts`
- `packages/cognition/src/keep-alive/__tests__/intention-check-prompt.test.ts`
- `packages/cognition/src/keep-alive/__tests__/sterling-runtime-integration.test.ts`
- `packages/planning/src/modules/__tests__/idle-episode-eligibility.test.ts`
- `packages/planning/src/modules/__tests__/keep-alive-vitals-goal-binding.test.ts`
- `scripts/start.js` (the `STERLING_IDLE_EPISODES_ENABLED` default)
- `.caws/working-spec.yaml`, `.caws/change-impact-map.md` (spec
  references)
- `docs/MOC/CORE_MAP_OF_CONTENT.{csv,md,json}` (MOC entries)

---

## Author

Initial quarantine documentation: `@darianrosebrook` via session
audit, 2026-04-10.

When a rename or deletion actually happens, update this document with
the resolution and the commit hash, or remove it entirely if the
directory no longer exists.

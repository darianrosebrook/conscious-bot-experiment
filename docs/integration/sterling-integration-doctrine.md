---
doc_id: INTEG-001
authority: reference
status: active
title: "Sterling Integration Doctrine — Current State"
owner: darian
created: 2026-03-14
updated: 2026-03-14
supersedes: docs/planning/STERLING_INTEGRATION_REVIEW.md (partially — that doc's Phase 1-4 proposals remain valid for non-CRAFT domains)
---

# Sterling Integration Doctrine — Current State

**Date**: 2026-03-14
**Status**: Active — reflects post-Phase-2 authority consolidation

This document describes the actual authority seam between conscious-bot and
Sterling as of today. It supersedes the mental model in
`STERLING_INTEGRATION_REVIEW.md` (2026-02-02) which described dual-path
orchestration for crafting. That model is no longer accurate for CRAFT intents.

## 1. The Production Seam for CRAFT Intents

The current production path for CRAFT intents is:

```
language_io.reduce → expand_by_digest_v1 → resolve_intent_steps → executor-native leaves
```

This is the **sole authoritative planning-resolution path** for CRAFT intents
in production CB planning. `resolve_intent_steps` provides epistemic filtering
(mine rule pruning, craft variant pruning, frontier analysis, structured
`blocked_info`) that the direct `solve` path lacks.

### What each command does

| Command | Authority | Who calls it |
|---------|-----------|-------------|
| `language_io.reduce` | Sterling is sole semantic authority (I-BOUNDARY-1) | Cognition layer via `SterlingLanguageIOClient` |
| `expand_by_digest_v1` | Sterling materializes committed IR digest → leaf-step bundle | Task integration (`materializeSterlingIrSteps`) |
| `resolve_intent_steps` | Sterling resolves abstract intent steps → executor-native steps | Task integration + SterlingPlanner (via `ResolveIntentStepsFn`) |

### What is NOT the production path

| Surface | Command | Purpose | Status |
|---------|---------|---------|--------|
| `handle_minecraft_solve()` | `solve` (domain=minecraft) | Workbench UI, benchmarks, test rigs | **Non-authoritative rig surface** |
| `_generateStepsViaDirectSolve()` | `solve` via `solveCraftingGoal()` | Fallback when executor service not wired | **Legacy fallback** — inactive in production |
| `MinecraftAcquisitionSolver._craftingSolver.solveCraftingGoal()` | `solve` | Rig D acquisition sub-solver | **Rig D scope** — different intent class |
| Workbench `use-sterling-solve.ts` | `solve` | Dashboard UI | **Frontend only** |

## 2. Rigs That Still Use Direct Solve

For Rig B (tool progression), Rig D (acquisition), and Rig G (building),
the production path is still:

```
routeActionPlan() → solver.solve[Domain]Goal() → command:'solve' → Sterling
```

These domains have NOT been consolidated to `resolve_intent_steps`. Their
authority model is: Sterling owns the search, CB owns the step mapping and
orchestration. This is acceptable for now because:

- These domains don't have the same variant-pruning / frontier-analysis
  requirements as crafting
- `resolve_intent_steps` currently only handles task_type=CRAFT on the
  Sterling server side
- Consolidation should follow the same template as CRAFT when it happens

## 3. Evidence Identity Chain

### Solve-time identity (Sterling → CB)

Sterling's `complete` message includes:

| Field | Purpose | Present for |
|-------|---------|-------------|
| `trace_bundle_hash` | Content hash of search trace | All 4 solvers |
| `engine_commitment` | Engine version commitment | All 4 solvers |
| `operator_registry_hash` | Hash of operator/rule set | All 4 solvers |
| `completeness_declaration` | Structural completeness witness | All 4 solvers |

CB parses these via `parseSterlingIdentity(result.metrics)` and attaches
them to `SolveBundle` via `attachSterlingIdentity()`.

### Report-time identity (CB → Sterling)

CB sends on `report_episode`:

| Field | Purpose | Condition |
|-------|---------|-----------|
| `bundle_hash` | CB's SolveBundle content hash | Always |
| `trace_bundle_hash` | Cross-reference to solve identity | Always |
| `outcome_class` | Structured outcome classification | Always |
| `engine_commitment` | Forward of solve-time commitment | Only when `STERLING_REPORT_IDENTITY_FIELDS=1` |
| `operator_registry_hash` | Forward of solve-time registry hash | Only when `STERLING_REPORT_IDENTITY_FIELDS=1` |

Sterling returns `episode_hash` in the response, which CB persists as
`EpisodeAck.episodeHash`.

### Known gaps (Milestone 1 targets)

1. **Rig D parent bundle lacks identity** — acquisition solver creates parent
   bundle without `attachSterlingIdentity()`. Child sub-solver bundles carry
   identity. Strategy-level provenance is not cryptographically linked.

2. **Rig B lacks identity observability logging** — tool progression does not
   call `logIdentityFieldStatus()`. Multi-tier identity assembly is silent.

3. **Phase 1 report fields off by default** — `engine_commitment` and
   `operator_registry_hash` require explicit toggle. The identity chain is
   incomplete in default configuration for report-time.

## 4. Grounding

`language_io.reduce` accepts an optional `world_snapshot` field. When present,
Sterling uses `reduce_and_ground` instead of plain `reduce`. Grounding is an
explicit artifact boundary — it is a separate validation step, not a silent
enrichment of the reducer path.

CB's `SterlingLanguageIOClient.reduce()` accepts `worldSnapshot` in options
and forwards it through the transport chain.

## 5. Blocked/Refusal Reporting

`resolve_intent_steps` returns typed `blocked_info` on unresolved replacements:

```typescript
{
  frontier_items: string[] | null,    // mine targets the goal depends on
  nearby_blocks_gap: string[] | null, // frontier items NOT observed nearby
  total_nodes_explored: number | null // solver node count
}
```

CB persists `blocked_info` into `taskData.metadata.solver.blockedInfo` so
downstream code can act on it without reintroducing a separate preflight
solver call.

## 6. What Not to Do

- **Do not call `solve` for production CRAFT planning.** Use
  `resolve_intent_steps` via the planner's `ResolveIntentStepsFn` callback.
- **Do not build a separate preflight reachability command.** Use
  `blocked_info` from `resolve_intent_steps` failure responses.
- **Do not duplicate world_state assembly.** Use
  `SterlingPlanner.buildResolveIntentRequest()` as the single builder.
- **Do not replace SolveBundle with Sterling-native cert artifacts.** SolveBundle
  captures CB-specific behavior. The goal is linkage, not replacement.
- **Do not pull UtteranceState IR, operator taxonomy, KG, or cross-domain
  search into CB yet.** The cheapest leverage is evidence, claims, and bridge
  artifacts — not broader capability integration.

## 7. Next Milestones

| # | Milestone | Done means |
|---|-----------|-----------|
| 1 | Evidence-complete solve/report for all production solvers | Every solver can produce and persist CB bundle identity, Sterling solve identity, and Sterling episode identity cleanly |
| 2 | Declaration-backed routing | Rig A, B, D, G have explicit declarations with warning-grade proof-backed routing live |
| 3 | Bridge artifacts | `acquire_for_craft` and `craft_for_build` exist as content-addressed artifacts with replayable witnesses |
| 4 | Learning efficacy | One Rig D benchmark shows search effort improvement under Regime B without legality/cost drift |
| 5 | Checkpoint/resume formalization | Rig G and Rig B use the same witness/resume decision vocabulary |

## 8. Related Documents

| Document | Status | Notes |
|----------|--------|-------|
| `contracts/sterling-executor.yaml` | Current | OpenAPI schema for resolve_intent_steps, expand_by_digest |
| `docs/planning/sterling-boundary-contract.md` | Current | Governance: rigs as certification surfaces |
| `docs/planning/STERLING_INTEGRATION_REVIEW.md` | Partially stale | Phase 1-4 proposals still valid for non-CRAFT domains; dual-path model no longer accurate for CRAFT |
| `docs/planning/sterling-capability-tracker.md` | Needs update | Add crafting solver's authoritative status |
| `docs-status/prioritized-todos.md` H2 | Stale | Sterling IS wired for CRAFT via resolve_intent_steps |
| Sterling: `.caws/specs/MC-INT-01.yaml` | Current | Full spec with claim catalog and non-claims |
| Sterling: `docs/audits/MC-INT-01-PHASE-2-AUTHORITY-AUDIT.md` | Current | Closure evidence for Phase 2 |

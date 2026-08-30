# Contract Layer — Single Source of Truth for Capabilities + Enforced Seams

**Status:** Phases 1–2 complete; Phase 3 next
**Author:** @darianrosebrook

## Problem

The project's capabilities ("leaves") have no single home. One capability's
declarative metadata is hand-maintained in ~5 places across 2 packages:

| Concern | Current location |
|---------|------------------|
| Arg contract + `KNOWN_LEAVES` | `planning/src/modules/leaf-arg-contracts.ts` |
| Hardcoded expected list (drift source) | `planning/src/modules/__tests__/leaf-arg-contracts.test.ts` |
| Planning action mapping | `planning/src/modules/action-mapping.ts` |
| Minecraft action contract | `minecraft-interface/src/action-contract-registry.ts` |
| Governance (producers / proofs / shadow-only) | `planning/src/__tests__/reachability-governance.test.ts` + runbook |

Evidence of the drift this causes (all surfaced in the 2026-08 hardening pass):

- `verify_module` added to `CONTRACTS` but not the test's `KNOWN_LEAVES` list → 41 vs 42.
- `hunt_animal` became produced (gather→food) but stayed misclassified as contracted-only.
- `nearbyBlocks` drifted from positioned `MinecraftBlock[]` to a string name list on
  the `/state` endpoint, and the planning consumer crashed at runtime — while the
  `contracts/*.yaml` OpenAPI specs and the `MinecraftWorldState` type both said otherwise.

The `contracts/*.yaml` specs and the type definitions exist but are not enforced at
the runtime seams, so they decay silently.

## Design

Two reinforcing mechanisms:

1. **A single leaf manifest** — every capability's *declarative* metadata lives in one
   file, and the registries (`KNOWN_LEAVES`, intent leaves, shadow-only, action
   mappings, governance classifications) are *derived* from it rather than hand-synced.

2. **Enforced seams** — every service-to-service boundary validates its payloads
   against a schema (runtime validation + a contract test), so producer/consumer
   drift fails at the seam instead of at some unrelated consumer.

The manifest holds only *declarative* facts (name, args fields, action type,
intent/executable, shadow-only, producers, proof anchors). Execution logic (the
leaf implementations in `minecraft-interface`) stays code.

## Phases

### Phase 1 — Manifest + derived leaf identity (this increment)
- Add `leaf-manifest` to `@conscious-bot/executor-contracts` (dependency-free, shared).
- Derive `KNOWN_LEAVES` / `INTENT_LEAVES` / shadow-only set from the manifest.
- Point `leaf-arg-contracts.ts` at the manifest and remove the hardcoded test list.
- **Outcome:** "add a leaf" for *identity/classification* is a one-place edit, and the
  test can't drift from the source.

### Phase 2 — Derive args contracts + action mappings (complete)
- The manifest carries each leaf's `fields` descriptor, planning-side `action`
  mapping (action type + poll timeout), and minecraft-interface `contract`
  (aliases, defaults, required keys, dispatch mode, legacy aliases).
- `shadowOnly` is derived, not declared: an executable leaf is shadow-only iff
  it has no `action` entry.
- `leaf-arg-contracts.ts` keeps only the args validators (behavioral code);
  `getLeafContractEntries()` reads the manifest, so the Sterling contract
  digests are manifest-fed. `validateArgContractCoverage()` fails when the
  validator registry and the manifest disagree.
- `action-mapping.ts` keeps legacy BT-action remaps and per-leaf arg
  transforms as registered code; *which* leaves map, to what type, and with
  what timeout derive from the manifest.
- `action-contract-registry.ts` builds `ACTION_CONTRACTS` from
  `deriveActionContracts()`; only non-leaf entries (mine_block,
  gather_resources, scan_environment) and data-divergent raw-endpoint
  synonyms (craft, craft_item, collect_items_enhanced) remain hand-written,
  with a load-time collision guard.

### Phase 3 — Enforce service seams
- Revive `contracts/*.yaml` (or replace with Zod schemas) as the source of truth for
  `/state`, `/action`, perception, and memory boundaries.
- Add runtime validation at each seam + a contract test that validates a captured
  fixture against the schema (catches the `nearbyBlocks` class of drift).

### Phase 4 — Replace governance ratchets with derived checks
- Collapse `reachability-governance` / `drift-guard` / runbook counts into checks
  derived from the manifest + seam schemas, deleting the hand-maintained parallel lists.

## Non-goals (for now)

- Re-splitting packages by vertical slice (defer until Phases 1–4 either relieve the
  friction or prove insufficient).
- Changing the runtime behavior of the planner/executor.

# P21 Closeout Packet — Tranche 2

**Capability**: P21 (Entity Belief Maintenance and Saliency)
**Date**: 2026-02-01
**Contract version**: 1.0.0
**Template**: [capability-closeout-template.md](./templates/capability-closeout-template.md)

---

## A. Summary

### What changed

This tranche hardens the P21 capsule pivot work:

- **Extension negotiation** is now declaration-gated, not method-existence-gated. A `declaredExtensions` config field replaces the boolean `enableIdRobustness` flag.
- **Sub-primitive capability claims** use `p21.a` / `p21.b` identifiers — never bare `p21`.
- **P21-B conformance** is certified on Minecraft (`BeliefBus` adapter).
- **Second proving surface** for P21-A (Reference Security Domain TrackSet) demonstrates portability.
- **Anti-footgun tripwires**: import guard prevents testkits in production; type equivalence assertion catches rig/capsule drift.
- **Proof manifest infrastructure** (primitive-agnostic `CapabilityProofManifest` type) enables structured closeout for future primitives.
- **Predictive accountability** (INV-4b): predictive mode now requires an explainability extension.

### Breaking changes

- `P21AConformanceConfig.enableIdRobustness` → `declaredExtensions: P21Extension[]`
- `P21_INVARIANTS` constant marked `@deprecated` (prefer `P21A_INVARIANTS` / `P21B_INVARIANTS`)

### Claim statement

P21 sub-primitive claims are certified as follows:
- `p21.a`: certified on 2 surfaces under conservative mode with no extensions
- `p21.b`: certified on 1 surface (Minecraft BeliefBus)
- Extensions (`risk_components_v1`, `id_robustness`, `predictive_model`): defined but not certified on any surface

---

## B. Capability Claims + Boundary Audit

### Claims table

| Sub-primitive | contract_version | declared_extensions | budgets | mode | proving surfaces |
|---------------|-----------------|--------------------|---------|----|------------------|
| `p21.a` | 1.0.0 | `[]` | trackCap=64, sparsityBudget=0, hysteresisBudget=4, uncertaintyThreshold=0.5 | conservative | Minecraft TrackSet, Reference Security |
| `p21.b` | 1.0.0 | — | deltaCap=32, snapshotIntervalTicks=25 | — | Minecraft BeliefBus |

### Boundary audit

**Domain vocabulary check** — Minecraft concepts must not appear in capsule/contract code (comments are acceptable for documentation context). Enforced by vitest guard in `no-production-import.test.ts` which is comment-aware. Manual grep (includes comments) is informational:

```bash
grep -r "minecraft\|zombie\|skeleton\|creeper" \
  packages/planning/src/sterling/primitives/p21/p21-capsule-types.ts \
  packages/planning/src/sterling/primitives/p21/index.ts \
  packages/testkits/src/p21/p21a-conformance-suite.ts \
  packages/testkits/src/p21/p21b-conformance-suite.ts \
  packages/testkits/src/capability-proof-manifest.ts
# Expected: comment-only matches (JSDoc examples). No matches in executable code.
# Automated enforcement: vitest run src/__tests__/no-production-import.test.ts (comment-aware)
```

**Domain import check** — contract/capsule files must not import from domain packages:

```bash
grep -r "from.*@conscious-bot/minecraft\|require.*@conscious-bot/minecraft" \
  packages/planning/src/sterling/primitives/ --include="*.ts" \
  packages/testkits/src/p21/p21a-conformance-suite.ts \
  packages/testkits/src/p21/p21b-conformance-suite.ts \
  packages/testkits/src/capability-proof-manifest.ts
# Expected: 0 matches
```

**Import guard check** — testkits must not appear in production code:

```bash
grep -r "@conscious-bot/testkits" packages/ --include="*.ts" -l
# Expected: only packages/testkits/*, __tests__/*, vitest.config*
```

---

## C. Invariants Catalog

### P21-A: Track Maintenance (9 base + 1 opt-in + 1 mode-gated)

| ID | Name | Description | Surfaces | Extension |
|----|------|-------------|----------|-----------|
| P21A-INV-01 | determinism | Same inputs → identical snapshots and deltas | Minecraft, Reference | — |
| P21A-INV-02 | boundedness | Track count ≤ trackCap | Minecraft, Reference | — |
| P21A-INV-03 | event_sparsity | Steady state ≤ sparsityBudget deltas | Minecraft, Reference | — |
| P21A-INV-04 | uncertainty_monotonicity | pUnknown non-decreasing; risk non-increasing in conservative | Minecraft, Reference | — |
| P21A-INV-04b | predictive_accountability | Predictive mode requires explainability extension | — | mode-gated |
| P21A-INV-05 | uncertainty_suppression | pUnknown > threshold suppresses classification-derived risk (base: overall riskLevel ≤ low; extension: classificationRisk suppressed, presenceRisk intentionally unconstrained) | Minecraft, Reference | risk_components_v1 (detailed path) |
| P21A-INV-06 | hysteresis | Oscillation bounded to hysteresisBudget reclassified deltas | Minecraft, Reference | — |
| P21A-INV-07 | identity_persistence | Occlusion gap + reappearance → same trackId | Minecraft, Reference | — |
| P21A-INV-08 | new_threat_completeness | new_threat deltas include .track payload | Minecraft, Reference | — |
| P21A-INV-09 | features_not_required | Features don't affect trackId | Minecraft, Reference | — |
| P21A-INV-10 | id_robustness | New entityId + same class/pos → same trackId | — | id_robustness |

### P21-B: Emission Protocol (4 invariants)

| ID | Name | Description | Surfaces |
|----|------|-------------|----------|
| P21B-INV-01 | delta_budget | Events per envelope ≤ deltaCap | Minecraft BeliefBus |
| P21B-INV-02 | envelope_determinism | Identical inputs → byte-identical envelope JSON (single-runtime; Node `JSON.stringify` with stable construction order; cross-runtime canonical encoding not claimed) | Minecraft BeliefBus |
| P21B-INV-03 | producer_validation | new_threat in envelope includes .track | Minecraft BeliefBus |
| P21B-INV-04 | snapshot_cadence | Snapshot within snapshotIntervalTicks | Minecraft BeliefBus |

### Extensions

| Extension | Activates | Fail-closed rule |
|-----------|-----------|------------------|
| `risk_components_v1` | INV-05 detailed path | If declared but `classifyRiskDetailed` undefined → `expect().toBeDefined()` fails. Presence risk is intentionally allowed to keep `riskLevel` elevated even when classification risk is suppressed. |
| `id_robustness` | INV-10 | If declared but association fails → assertion fails |
| `predictive_model` | INV-04b | If predictive mode used without `risk_components_v1` or `predictive_model` → INV-4b fails |

---

## D. Proof Artifact Bundle

### Manifest types

| File | Purpose |
|------|---------|
| `packages/testkits/src/capability-proof-manifest.ts` | Primitive-agnostic `CapabilityProofManifest` type |
| `packages/testkits/src/p21/proof-manifest.ts` | `generateP21AManifest()`, `generateP21BManifest()` |

### Convention

Proof manifests are TypeScript types that can be instantiated at test time and serialized to JSON. Key fields:

- `suite.source_ref`: git-relative path for stable cross-environment references
- `suite.hash`: content hash of suite source (placeholder until CI generates)
- `proving_surfaces`: list of surface IDs that contributed to the manifest
- `results.runtime`: runtime environment descriptor (e.g., `node@22.x / darwin-arm64`; placeholder until CI populates)

CI content-addressing (computing `suite.hash`, fixture `hash`, and `results.runtime`) is deferred until CI integration.

---

## E. Acceptance Checks

### Typecheck

```bash
pnpm --filter @conscious-bot/planning exec tsc --noEmit
# Expected: 0 errors

pnpm --filter @conscious-bot/testkits exec tsc --noEmit
# Expected: 0 errors
```

### P21-A Minecraft (existing, 9 invariants)

```bash
pnpm --filter @conscious-bot/minecraft-interface exec vitest run src/entity-belief/__tests__/p21-conformance-minecraft.test.ts
# Expected: 9 tests passed
```

### P21-B Minecraft (new, 4 invariants)

```bash
pnpm --filter @conscious-bot/minecraft-interface exec vitest run src/entity-belief/__tests__/p21b-conformance-minecraft.test.ts
# Expected: 4 tests passed
```

### P21-A Reference Security (new, 9 invariants)

```bash
pnpm --filter @conscious-bot/testkits exec vitest run src/p21/__tests__/p21a-reference-security.test.ts
# Expected: 9 tests passed
```

### Type equivalence

```bash
pnpm --filter @conscious-bot/minecraft-interface exec vitest run src/entity-belief/__tests__/p21-type-equivalence.test.ts
# Expected: 2 tests passed
```

### Anti-footgun guards

```bash
pnpm --filter @conscious-bot/testkits exec vitest run src/__tests__/no-production-import.test.ts
# Expected: 4 tests passed (import guard, bare-p21 guard, domain vocabulary, domain imports)
```

### Domain boundary checks

Domain vocabulary and domain import checks are enforced by the anti-footgun guards test suite (see above). Manual verification:

```bash
# Domain imports (must be 0 matches)
grep -r "from.*@conscious-bot/minecraft\|require.*@conscious-bot/minecraft" \
  packages/planning/src/sterling/primitives/ --include="*.ts" \
  packages/testkits/src/p21/p21a-conformance-suite.ts \
  packages/testkits/src/p21/p21b-conformance-suite.ts \
  packages/testkits/src/capability-proof-manifest.ts
# Expected: 0 matches
```

### What failure means

- **Typecheck failure**: Type definitions drifted between capsule and barrel exports
- **P21-A failure**: Track maintenance invariant broken by implementation change
- **P21-B failure**: Emission protocol invariant broken
- **Type equivalence failure**: Rig types drifted from capsule types — adapter mapping needs update
- **Import guard failure**: Production code imported testkits — move import to test file
- **Domain vocabulary leak**: Minecraft-specific concepts leaked into capsule/contract definitions
- **Domain import violation**: Contract or suite file imported from a domain package

---

## F. Changeset Recap

### New files

| File | Purpose |
|------|---------|
| `packages/minecraft-interface/.../p21b-conformance-minecraft.test.ts` | P21-B Minecraft proving surface |
| `packages/testkits/src/p21/__tests__/p21a-reference-security.test.ts` | P21-A second proving surface |
| `packages/testkits/src/__tests__/no-production-import.test.ts` | Import guard tripwire |
| `packages/minecraft-interface/.../p21-type-equivalence.test.ts` | Type drift tripwire |
| `packages/testkits/src/capability-proof-manifest.ts` | Primitive-agnostic proof manifest |
| `packages/testkits/src/p21/proof-manifest.ts` | P21 proof manifest generators |
| `docs/planning/p21-closeout-packet.md` | This file |
| `docs/planning/templates/capability-closeout-template.md` | Reusable A–H template |

### Modified files

| File | Change |
|------|--------|
| `packages/planning/.../p21-capsule-types.ts` | Added P21Extension, P21CapabilityDescriptor types; @deprecated on P21_INVARIANTS |
| `packages/planning/.../p21/index.ts` | Export new types |
| `packages/planning/.../sterling/index.ts` | Re-export new types |
| `packages/testkits/src/p21/p21a-conformance-suite.ts` | declaredExtensions, INV-4b, INV-5 hardening |
| `packages/testkits/src/p21/index.ts` | Export proof manifest generators |
| `packages/testkits/src/index.ts` | Export CapabilityProofManifest + generators |
| `packages/minecraft-interface/.../p21-conformance-minecraft.test.ts` | `declaredExtensions: []` |
| `docs/planning/sterling-capability-tracker.md` | Reference closeout packet, update claim |

### Deprecations

- `P21_INVARIANTS` constant — use `P21A_INVARIANTS` or `P21B_INVARIANTS` with `P21CapabilityDescriptor`
- `enableIdRobustness` config field — use `declaredExtensions: ['id_robustness']`

---

## G. Open Items / Deferred Risks

1. **Extensions specified but uncertified**: `risk_components_v1`, `id_robustness`, `predictive_model` are defined in the type system and gated in the suite, but no surface declares them yet. First certification requires a domain with `classifyRiskDetailed` or predictive mode.

2. **Portability type: contract semantics, not implementation independence**. The Reference Security TrackSet proves that the P21-A invariants are satisfiable by a second, separately-written implementation in a different domain. This is *contract semantics portability* — the invariants are not coupled to Minecraft concepts. It is **not** implementation independence: both surfaces use the same algorithmic strategy (content-addressed trackId, Manhattan-distance association, linear-decay confidence). A correlated algorithmic bug (e.g., in the eviction heuristic) would pass both surfaces. Mitigation: (a) the two implementations share no source code and live in separate packages; (b) a future tranche should add at least one proving surface with a materially different association/eviction strategy (e.g., Kalman-filter-based tracking, or a graph-based association) to decorrelate failure modes across surfaces.

3. **Runtime handshake not enforcing invariants online**: `P21CapabilityDescriptor` is a type-level contract. Runtime enforcement (checking invariants during live operation) is future work.

4. **Proof manifests not content-addressed in CI**: `suite_hash` and fixture `hash` fields are placeholders. CI integration to compute content hashes and attach them to manifests is deferred.

5. **INV-4b predictive_accountability not exercised**: No surface runs in predictive mode yet. The invariant is defined and will activate when a predictive-mode surface is added.

6. **Decorrelated proving surface planned**: To strengthen the portability claim from contract-semantics to implementation-independence, a future tranche must add a proving surface that uses a fundamentally different tracking strategy. Acceptance criterion: the new surface's association logic must not share the Manhattan-distance + linear-decay pattern used by both current surfaces. This is tracked as a prerequisite for any claim of implementation-decorrelated certification.

### Extension evolution rules

Extensions are the mechanism for optional capability enrichment. To prevent extension proliferation and semantic drift, the following rules apply to all P21 extensions:

1. **Additive only.** An extension may add new invariants or strengthen existing ones. It must not weaken, remove, or redefine any base invariant. A surface passing base invariants without any extensions must continue to pass after an extension is added to the contract.

2. **Independently certifiable.** Each extension must be certifiable in isolation. A surface may declare `['risk_components_v1']` without declaring `['id_robustness']`, and vice versa. No extension may require another extension as a prerequisite (mode-gating, such as INV-4b requiring predictive mode, is a mode constraint, not an extension dependency).

3. **Declaration-gated, not method-gated.** Extension-specific invariants activate only when the extension is listed in `declaredExtensions`. The presence of a method (e.g., `classifyRiskDetailed`) is an implementation detail that must match the declaration, but method presence alone does not activate invariants.

4. **Fail-closed.** If an extension is declared but the required implementation is missing, the conformance suite must fail (not skip). Each extension documents its fail-closed rule in section C.

5. **No base semantics mutation.** An extension may provide a more detailed view of a base concept (e.g., `risk_components_v1` decomposes `riskLevel` into `classificationRisk` + `presenceRisk`) but must not change the base contract's observable behavior for surfaces that do not declare the extension.

6. **Surface-scoped claims.** A surface may not claim extension support unless it passes all extension-gated invariants for that extension under the conformance suite. Partial extension support is not a valid claim.

---

## G2. Known Constraints

### Workspace alias resolution

Tests must run via per-package vitest configs. Running vitest from the repo root with `--filter` depends on cwd for config selection, which can cause workspace alias resolution failures (e.g., `@conscious-bot/testkits` not resolving correctly when vitest is invoked from the wrong cwd).

### Canonical test invocation

The canonical one-command invocation for all P21 suites from repo root is:

```bash
pnpm test:p21
```

This delegates to package-local scripts:
- `pnpm --filter @conscious-bot/testkits test:p21` — runs testkits P21 suite (reference security, truthfulness tripwire, needle-breaks, determinism canary)
- `pnpm --filter @conscious-bot/minecraft-interface test:p21` — runs Minecraft P21-A and P21-B proving surfaces

For the full workspace test (includes testkits via turbo):
```bash
pnpm test
```

### Manifest truthfulness

Proof manifest artifacts reflect actual test outcomes through a two-phase pipeline:

1. **`generateP21*Manifest({ surfaceResults })`** produces **certification truth**: which invariants are proven across surfaces (`invariants_passed`, `fully_proven`). The generator has no access to execution failures — it only sees which invariants appeared in `surfaceResults` (the set of passes).

2. **`patchExecutionResults(handle, manifest)`** overwrites **execution truth** fields from the run-handle: `run_passed`, `invariants_failed`, `invariants_not_started`. The run-handle is the sole authority on which invariants were exercised and whether they passed or failed. This step is required — without it, failures are invisible to the manifest (they appear as `not_started` rather than `fail`).

3. **`assertManifestTruthfulness(handle, manifest)`** is a tripwire that validates handle↔manifest consistency:
   - **Certification consistency**: every handle `pass` must appear in `invariants_passed`; no handle `fail` may appear in `invariants_passed`
   - **Execution consistency**: if the handle has failures, `run_passed` must be false and `invariants_failed` must contain exactly those IDs; if no failures, `run_passed` must be true and `invariants_failed` must be empty. This catches omitted `patchExecutionResults()` calls.

4. **Truthfulness test** (`proof-artifact-truthfulness.test.ts`) validates the full pipeline, including:
   - All-pass runs (P21A with conditional invariants, P21B)
   - Blank template regression (surfaceResults omitted)
   - Failing run propagation (handle failures → `run_passed=false`, `invariants_failed` populated)
   - Missing `patchExecutionResults` detection (tripwire throws)

#### Manifest results semantics

The manifest `results` object separates execution truth from certification truth:

**Execution truth** (sourced from run-handle via `patchExecutionResults`):

- **`run_passed`**: true when no exercised invariant failed. Conditional invariants left as `not_started` (e.g., INV-4b in non-predictive mode, INV-10 without `id_robustness` extension) do not cause this to be false. This answers: "did this conformance run pass?"
- **`invariants_failed`**: IDs of invariants that were executed and failed (handle status `fail`). Empty when the run passes. In a single-surface run, this is the definitive list of failures.
- **`invariants_not_started`**: IDs of invariants not exercised in this run (handle status `not_started`). Includes conditional invariants not activated by the current mode/extension configuration.

**Certification truth** (sourced from `surfaceResults` in the generator):

- **`fully_proven`**: true when every catalog invariant has status `proven`. This is a strict completeness signal — it goes false when any invariant, including conditional ones not exercised, is not proven. This answers: "does this artifact prove the entire invariant catalog?"
- **`invariants_passed`**: IDs of invariants proven across all declaring surfaces.

`fully_proven` may remain false even when `run_passed` is true, when the catalog includes conditional invariants that were not activated by the current surface's mode/extension configuration.

---

## H. Final Claim Statement

This tranche certifies `p21.a` on surfaces {Minecraft TrackSet, Reference Security} under {conservative, trackCap=64, hysteresisBudget=4} with no extensions; certifies `p21.b` on surface {Minecraft BeliefBus} with {deltaCap=32, snapshotIntervalTicks=25}. Extensions `risk_components_v1`, `id_robustness`, `predictive_model` are defined but not certified on any surface.

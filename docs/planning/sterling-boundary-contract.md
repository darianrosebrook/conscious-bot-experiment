# Sterling ↔ Conscious-Bot Boundary Contract

**Last updated**: 2026-02-01
**Status**: Active — governs all new capability work
**Companion docs**: [capability-primitives.md](./capability-primitives.md), [sterling-capability-tracker.md](./sterling-capability-tracker.md), [sterling-minecraft-domains.md](./sterling-minecraft-domains.md)
**Sterling-side companion**: `sterling/docs/planning/capability_primitives_bundle/philosophy.md` — the same philosophy formalized with Sterling-internal type anchors. This document is the conscious-bot perspective on the same architecture.

---

## Why this document exists

We are building a general reasoning substrate, not a Minecraft planner. The risk is that domain-specific operational policy silently becomes permanent Sterling semantics — "uncertainty means risk=none," "hysteresis budget is 4," "delta budget lives in the adapter." The P21 capsule-pivots work already caught several of these. This document codifies the boundary, the absorption pipeline, and what each rule means concretely for conscious-bot development, so we stop discovering these problems ad-hoc.

This is the document you check before adding a type to `p21-capsule-types.ts`, before wiring a new domain stream, before writing an invariant. If your change doesn't fit the rules below, redesign it until it does.

---

## 1. The boundary: three separations

### A. Data plane vs control plane

| Plane | What crosses it | Examples | Owner |
|-------|----------------|----------|-------|
| **Data** | Evidence batches, saliency deltas, snapshots, KG fragments, operator signatures, solve payloads, envelopes | `P21EvidenceBatch`, `P21Envelope`, `SolveBundle`, crafting/building/tool-progression wire payloads | Sterling defines schema; conscious-bot projects to TS types |
| **Control** | Capability claims, schema versions, budgets, epochs, feature flags, mode declarations | `P21BeliefMode`, `hysteresisBudget`, `trackCap`, `deltaCap`, `contractVersion`, `solverId`, `executionMode` | Sterling defines; domain declares |

Sterling owns the canonical data-plane schemas (Python-side: `ObservationIR`, `SemanticDeltaIRv0`, `TraceBundleV1`). Conscious-bot's capsule types (`P21EvidenceBatch`, `P21Envelope`, etc.) are the TypeScript projection of those schemas. Changes originate on the Sterling side; conscious-bot must track them via versioning and the contract drift detector.

**Rule**: Data-plane schemas must be boring and stable. Changing a field name is a breaking change, not a refactor. Control-plane negotiations must be explicit — no behavior changes hidden in data-plane field presence.

**What this means for conscious-bot**: Every new field on `P21EvidenceItem`, `P21SaliencyDelta`, or any wire payload type must go through schema versioning. If Sterling starts depending on a field that the domain started sending informally, that's a contract violation. The `contractVersion` wire field exists for this reason.

### B. Structural contract vs semantic contract

| Layer | What it governs | Where we enforce it |
|-------|----------------|---------------------|
| **Structural** | Types, required fields, enums, versioning, serialization determinism | `p21-contract-equivalence.test.ts` (YAML ↔ capsule shape), `compat-linter.ts`, `canonicalize()` |
| **Semantic** | Invariants, monotonicity, boundedness, uncertainty behavior, fail-closed rules | Conformance suites (`p21a-conformance-suite.ts`, `p21b-conformance-suite.ts`), `solver-golden-master.test.ts` |

**Rule**: Structural correctness is necessary but not sufficient. Two domains can have identical JSON shapes but different semantics. The conformance suites are the semantic contract — they are not optional nice-to-haves.

**What this means for conscious-bot**: When adding a new primitive or extending an existing one, always ask: "does a structural test catch this, or do I need a semantic invariant?" If the answer is semantic, it goes in a conformance suite in `@conscious-bot/testkits`, not in an ad-hoc test file.

### C. Domain ontology vs Sterling core ontology

| Concept | Domain-owned | Sterling-owned |
|---------|-------------|----------------|
| Class labels | `zombie`, `skeleton`, `creeper`, `intruder`, `tailgater` | Opaque `classLabel: string` |
| Risk thresholds | "proximity ≤ 1 means critical" | `classifyRisk` is an injected function |
| Feature vocabularies | `fuse_state`, `health`, `weapon`, `badge` | Opaque `features?: Record<string, number \| string>` |
| Belief mode | "we use conservative" | `P21BeliefMode` type; conformance suite tests the declared mode |

**Rule**: Sterling contracts never mention domain object models. If you find yourself writing `HOSTILE_KINDS` or `MOB_RISK_CLASSES` inside a capsule type file, you are leaking domain ontology. Those belong in reference fixtures or domain adapters.

**What this means for conscious-bot**: The `p21-reference-fixtures.ts` file with `MOB_DOMAIN_CLASSIFIER` and `SECURITY_DOMAIN_CLASSIFIER` is correct — classifiers are injected, not hard-coded. New domains add new fixture files, not new constants in capsule types.

---

## 2. Rigs: certification surfaces, not dependencies

A rig exists to do three jobs:

1. **Produce representative evidence streams** — including adversarial edge cases — in a repeatable format.
2. **Provide adapters** that connect a domain implementation to a Sterling-owned contract (the capsule).
3. **Produce proof artifacts** — passing conformance suites, determinism harnesses, drift detectors, resource-bound guarantees.

**The rig does not define the primitive. The capsule does.**

The Minecraft TrackSet is an implementation. The P21 capsule types + conformance suites are the definition. If we deleted every Minecraft file tomorrow, the capsule contract and its meaning would still be fully specified.

### What this means for conscious-bot

| Concern | Lives in | NOT in |
|---------|----------|--------|
| Capsule types | `packages/planning/src/sterling/primitives/p21/` | `packages/minecraft-interface/` |
| Conformance suites | `packages/testkits/src/p21/` | `packages/planning/` or `packages/minecraft-interface/` |
| Domain adapter + field mapping | `packages/minecraft-interface/src/entity-belief/` | `packages/planning/` |
| Reference fixtures | `packages/planning/src/sterling/primitives/p21/p21-reference-fixtures.ts` | Domain-specific packages |
| Solver implementations | `packages/planning/src/sterling/minecraft-*-solver.ts` | — |
| Solver contracts | `packages/planning/src/sterling/solve-bundle-types.ts` | Solver implementation files |

---

## 3. The capability absorption pipeline

How a rig's learnings become Sterling capability — as artifacts, not code reuse.

### Step 0: Identify the primitive boundary

Select a capability Sterling should claim. Write down what Sterling needs from the domain, and what Sterling guarantees if it receives it.

**Evidence of completion**: A section in [capability-primitives.md](./capability-primitives.md) with formal signature, prove-in-rig, and transfer envelope.

### Step 1: Define the capsule (Sterling-owned)

A capsule contains:
- Contract types (domain-agnostic, stable naming)
- Version identifiers and compatibility rules
- Invariants (semantic properties)
- Conformance suite(s) + determinism harnesses
- Optional extensions, each with their own sub-claim

No domain imports. No domain constants. No domain taxonomies. If you find yourself writing a class label or a domain-specific distance metric, you are already sliding.

**Conscious-bot location**: `packages/planning/src/sterling/primitives/<id>/`
**Test kit location**: `packages/testkits/src/<id>/`

### Step 2: Define negotiation and capability claims (control plane)

A domain doesn't just "send data." It declares what it supports:
- Which sub-primitives (e.g., P21-A track maintenance vs P21-B emission protocol)
- Which modes (e.g., conservative vs predictive uncertainty)
- Which extensions (e.g., `classifyRiskDetailed`, `id_robustness`)
- Budget parameters (track cap, delta cap, emission hz)
- Schema versions

**Conscious-bot implementation**: Currently in conformance config objects (`P21AConformanceConfig`, `P21BConformanceConfig`). Future: a `CapabilityDescriptor` type that can be hashed and stored.

**Sterling-side types to align with** (as of 2026-02-01):

| Sterling type | Location | Purpose |
|---------------|----------|---------|
| `CapabilityDescriptorV1` | `core/domains/capability_descriptor.py` | Per-primitive capability claim with contract version, determinism class, budget, conformance suite hash |
| `CapabilityClaimRegistry` | `core/domains/capability_claim_registry.py` | Registry with `(domain_id, primitive_id, contract_version)` versioned keys; hash from VERIFIED entries only |
| `PrimitiveSpecV1` | `core/domains/primitive_spec.py` | Data-driven obligation document; required structural flags, evidence kinds, certification gates |
| `PrimitiveRegistry` | `core/domains/primitive_registry.py` | Singleton lookup; loads from `data/primitive_specs/index.json`; P01–P05 built in |
| `DomainDeclarationV1` | `core/domains/domain_handshake.py` | Long-lived capability commitment (content-addressed); binds primitive claims to a domain |
| `DomainSessionV1` | `core/domains/domain_handshake.py` | Ephemeral session attachment (NOT content-addressed); KG ref, operator pack |
| `WorldCapabilities` | `core/worlds/base.py` | Structural capability flags; eligibility checks now use `PrimitiveRegistry` |

When conscious-bot's `CapabilityDescriptor` is built, it should map to `CapabilityDescriptorV1` and create `DomainDeclarationV1` instances that can be validated against the `CapabilityClaimRegistry`.

### Step 3: Build fixtures and prove portability

Minimum two fixture sets per primitive. Fixtures are not examples — they are executable meaning. When a second domain passes the same conformance suite, that is evidence the semantics are domain-agnostic.

**Current state**: P21 has `MOB_DOMAIN_STREAM` (Minecraft-shaped) and `SECURITY_DOMAIN_STREAM` (camera-shaped). No second domain has passed the conformance suite yet — that's a known gap.

### Step 4: Domain implements adapter + passes certification

The adapter is the only domain-specific glue Sterling needs. The certification run produces proof that the domain satisfies the contract.

**Current state**: Minecraft TrackSet adapter in `p21-conformance-minecraft.test.ts` passes all 9 P21-A invariants. No P21-B certification yet (BeliefBus wrapping is a follow-up).

### Step 5: Register the capability claim with evidence

Sterling should be able to answer "Does this domain implement P21-A?" without reading code. That implies a registry entry:

| Field | Example |
|-------|---------|
| `capability_id` | `p21.a` |
| `contract_version` | `p21@1.0` |
| `conformance_suite_hash` | Content hash of `p21a-conformance-suite.ts` |
| `fixtures_hashes` | Which fixture streams were used |
| `results_hash` | Proof artifact or deterministic summary |
| `budget_declaration` | `{ trackCap: 64, hysteresisBudget: 4, mode: 'conservative' }` |

**Current state**: Sterling-side infrastructure is now built. The `CapabilityClaimRegistry` supports primitive-level claims with versioned keys `(domain_id, primitive_id, contract_version)`. The `DomainDeclarationV1` type provides long-lived capability commitment that can be validated against the registry. The remaining integration work is wiring `SterlingDomainDeclaration.implementsPrimitives` in conscious-bot to create `DomainDeclarationV1` instances.

**Sterling-side types (implemented 2026-02-01)**:

| Concept | Sterling type | Location |
|---------|--------------|----------|
| Primitive-level claims | `CapabilityClaimRegistry` | `core/domains/capability_claim_registry.py` |
| Conformance suite identity | `ConformanceSuiteV1` (content-addressed, includes `suite_impl_ref`) | `core/domains/conformance_suite.py` |
| Domain declaration | `DomainDeclarationV1` (binds primitive claims to domain) | `core/domains/domain_handshake.py` |
| Fixture governance | `GoldenFixtureDescriptor` (content-addressed) | `core/induction/golden_fixture_descriptor.py` |
| Proof artifact hashing | `EvidenceSchemaV0.payload_hash` | `core/proofs/evidence_schema_registry.py` |
| Certified capabilities index | `data/certified_capabilities/index.json` | `data/certified_capabilities/` |

### Step 6: Runtime handshake + enforcement + fail-closed

When the system runs:
1. Domain announces capabilities, schema versions, budgets, epoch on connect.
2. Sterling enforces schema version and runtime-enforceable invariants (sequence monotonicity, boundedness, required fields).
3. Anything not enforceable online remains enforceable via CI certification + post-hoc audit.

**Current state**: Wire protocol has `contractVersion` and `solverId`. Fail-closed enforcement exists for unknown domains (`STERLING_ALLOW_DOMAIN_FALLBACK`). Sterling now has proof-backed runtime routing: `SterlingEngine._check_primitive_eligibility()` checks both structural flags (via `PrimitiveRegistry`) and VERIFIED claims (via `CapabilityClaimRegistry` + `DomainDeclarationV1`) by default. The `structural_only=True` option on `SterlingOptions` opts into Level 1 (structural) checks only, skipping claim verification.

---

## 4. Rules that keep us honest

These are the concrete rules. Violating them means the change needs redesign.

### Rule 1: Sterling contracts never mention domain object models

No "Minecraft entity," no "camera frame," no "Kubernetes pod." Only "evidence item," "track summary," "operator signature," "KG claim."

**Test**: `grep -r 'minecraft\|zombie\|skeleton\|creeper' packages/planning/src/sterling/primitives/` should match only reference fixtures and test files, never capsule type definitions.

### Rule 2: Domain semantics enter only through declared, injectable components

If risk classification differs by domain, it is an injected classifier, not a hardcoded mapping.

**Test**: `P21RiskClassifier` is an interface with `classifyRisk` as a method. `MOB_DOMAIN_CLASSIFIER` is a fixture, not a constant in capsule types.

### Rule 3: Feature vocabularies are opaque by default

If evidence items carry `features`, Sterling treats them as opaque payload unless an explicit extension says otherwise. Any feature used for semantics must be declared by schema + invariant tests.

**Test**: INV-9 `features_not_required` proves that different features produce the same trackId.

### Rule 4: Semantic strengthening is an extension, not a mutation

Base primitive stays minimal. Richer semantics become optional extensions with their own invariants and sub-claims.

**Examples already applied**:
- `classifyRiskDetailed` is optional on `P21RiskClassifier`
- `id_robustness` is opt-in in `P21AConformanceConfig`
- P21-B is a separate conformance suite, not bolted onto P21-A

### Rule 5: Contract drift is caught structurally AND semantically

Structural: `p21-contract-equivalence.test.ts` (YAML ↔ capsule).
Semantic: conformance suites + `solver-golden-master.test.ts` payload snapshots.

### Rule 6: Online enforcement is fail-closed; offline enforcement is cert-based

Runtime-enforceable invariants (required fields, sequence order, boundedness): enforce and drop on violation.
Offline-only invariants (determinism across runs, full conformance): certify in CI and store proof.

---

## 5. Dynamic, long-standing contracts

"Dynamic" means "versioned streams of artifacts," not ad-hoc runtime coupling. Three subsystems matter for conscious-bot.

### 5.1 Schema ingestion

Every message crossing the boundary references a schema version. Schema evolution rules: additive fields are okay, semantic changes require a major version bump, removal requires a deprecation window.

**Conscious-bot anchors**: `contractVersion` on solve wire payloads, `request_version` on P21 envelopes, `p21-contract-equivalence.test.ts` for YAML ↔ capsule drift detection.

**Sterling anchors**: `CanonicalSchemaEntry` (148+ schemas in `core/contracts/schema_registry.py`), `EvidenceSchemaV0` (schema_id, schema_version, payload_hash).

### 5.2 Operator ingestion

Operators are declared by signature (input types, output types, preconditions, effects, cost model, determinism class). They are not trusted because they exist — they are trusted because they pass an operator conformance harness.

**Conscious-bot anchors**: `compat-linter.ts` (10 checks validate operator/rule shape), `solver-golden-master.test.ts` (payload snapshots prove operator set stability), `buildCraftingRules()` / `buildToolProgressionRules()` (rule builders from domain data).

**Sterling anchors**: `OperatorSignature` in `core/operators/registry_types.py`, Stage K certification pipeline, `data/certified_operators/index.json` (content-addressed entries).

### 5.3 KG ingestion

KG transport format is Sterling-owned (nodes/edges/claims with provenance, confidence, timestamps, namespaced identifiers). Ontology alignment is domain-owned but Sterling-governed.

**Conscious-bot status**: Not yet active. Future work when rigs I (epistemic) or N (fault diagnosis) require knowledge graph integration. When it arrives, the pattern must follow Sterling's `KGRef` (logical_id, schema_id, content_hash) model with namespace isolation.

---

## 6. Reusable contract shape template

Every new primitive contract — whether in conscious-bot capsule types or Sterling-side specs — should follow this shape:

```
Contract types       → stable, minimal, domain-agnostic
Message envelope     → {request_version, capability_id, domain_id, stream_id,
                        epoch, seq, tick_id, payload}
Capability descriptor → {capability_id, contract_version, supported_extensions,
                         budgets, determinism_class}
Schema descriptor    → {schema_id, schema_version, schema_hash}
Conformance suites   → base + extension suites (content-addressed)
Proof artifacts      → result hashes, fixture hashes, suite hash
```

P21 already implements most of this shape:
- Contract types: `p21-capsule-types.ts`
- Message envelope: `P21Envelope`
- Capability descriptor: `P21AConformanceConfig` (partial — not yet a hashable first-class object)
- Schema descriptor: `request_version: 'saliency_delta'` (minimal)
- Conformance suites: `p21a-conformance-suite.ts`, `p21b-conformance-suite.ts`
- Proof artifacts: conformance test results (not yet content-addressed)

New primitives should start from this template rather than inventing ad-hoc shapes.

---

## 7. Where conscious-bot stands today

### Sterling infrastructure status (as of 2026-02-01)

Sterling's capability absorption pipeline infrastructure is now built:

| Sterling component | Status | Notes |
|-------------------|--------|-------|
| `PrimitiveSpecV1` + `PrimitiveRegistry` | Implemented | P01–P05 factories; data-file-backed (`data/primitive_specs/index.json`) |
| `CapabilityDescriptorV1` | Implemented | Per-primitive, content-addressed |
| `CapabilityClaimRegistry` (versioned keys) | Implemented | `(domain_id, primitive_id, contract_version)` triple; hash from VERIFIED only |
| `ConformanceSuiteV1` | Implemented | Content-addressed with `suite_impl_ref` code identity binding |
| `DomainDeclarationV1` + `DomainSessionV1` | Implemented | Split handshake: long-lived declaration + ephemeral session |
| Runtime proof-backed routing | Implemented | `_check_primitive_eligibility()` in engine; structural + claim checks |
| Anti-leak CI enforcement | Implemented | AST-based import boundary, structural flag alignment, no-isinstance routing |
| Schema registry entries | Implemented | 4 new schemas registered |

This means Steps 1–6 of the absorption pipeline now have Sterling-side type support. The remaining integration work is on the conscious-bot side: creating `DomainDeclarationV1` instances from `SterlingDomainDeclaration.implementsPrimitives` and registering claims in `CapabilityClaimRegistry`.

### Certified (conscious-bot rigs)

| Capability | Sub-primitive | Domain | Evidence |
|-----------|---------------|--------|----------|
| P1 (Transformation planning) | Full | Minecraft crafting | Rig A: all certification items |
| P2 (Capability gating) | Full | Minecraft tool progression | Rig B: all certification items |
| P21-A (Track maintenance) | 9/9 invariants | Minecraft entity-belief | `p21-conformance-minecraft.test.ts` |

### Defined but not yet certified on a second surface

| Capability | What's missing |
|-----------|----------------|
| P21-A | Non-Minecraft adapter passing the conformance suite |
| P21-B (Emission protocol) | Minecraft adapter wrapping BeliefBus |
| P21 `id_robustness` | Any surface opting in |

### Not yet capsule-defined (conscious-bot side)

All remaining primitives (P3–P15). Sterling-side primitive specs exist (`sterling/docs/planning/capability_primitives_bundle/primitives/P01–P21`) and `PrimitiveSpecV1` code objects exist for P01–P05. Conscious-bot has rig approach docs, but TypeScript capsule types and conformance suites in `@conscious-bot/testkits` do not yet exist for P3–P15. Next priority: Rig C (P03 temporal planning) requires defining the P3 capsule before implementing `FurnaceSchedulingSolver`.

---

## 8. The meta-principle

> **When you feel the urge to "absorb" code from a rig into Sterling, translate that urge into: "What is the invariant we learned, and how do we encode it as a contract + test + proof?"**

Code can remain in the domain as long as the meaning is standardized and certifiable. Sterling accumulates capability claims backed by proof artifacts, not domain-specific implementations. Conscious-bot accumulates adapters and proving surfaces, not Sterling semantics.

---

## 9. Immediate implications for new capability work

Before starting any new primitive or extending an existing one:

1. **Check this document's rules** — does your change introduce domain vocabulary into a capsule type? Does it hard-code a constant that should be configurable? Does it add semantic behavior without a conformance invariant?

2. **Follow the pipeline** — Step 0 (boundary), Step 1 (capsule), Step 2 (claims), Step 3 (fixtures), Step 4 (adapter), Step 5 (registry), Step 6 (runtime). Don't skip to Step 4.

3. **Put conformance suites in `@conscious-bot/testkits`** — not in the primitive package, not in the domain package. Test kits are shared infrastructure with their own lifecycle.

4. **Two fixture sets minimum** — if you can't write a second domain's fixture set, the primitive is probably domain-coupled. Fix the abstraction before writing tests.

5. **Invariants are the product** — code is the implementation. When absorbing a rig's learnings, translate "what code did we write" into "what invariant did we learn, and how do we encode it as a contract + test + proof?"

6. **Check the Sterling-side spec** — for primitives P01–P21, Sterling already has formal specs in `capability_primitives_bundle/primitives/`. Conscious-bot capsule types should project from those specs, not invent independently.

---

## 10. File reference

| Artifact | Location |
|----------|----------|
| Capsule types (P21) | `packages/planning/src/sterling/primitives/p21/p21-capsule-types.ts` |
| Reference fixtures (P21) | `packages/planning/src/sterling/primitives/p21/p21-reference-fixtures.ts` |
| P21 barrel | `packages/planning/src/sterling/primitives/p21/index.ts` |
| Contract drift detector | `packages/planning/src/sterling/primitives/p21/p21-contract-equivalence.test.ts` |
| P21-A conformance suite | `packages/testkits/src/p21/p21a-conformance-suite.ts` |
| P21-B conformance suite | `packages/testkits/src/p21/p21b-conformance-suite.ts` |
| Conformance helpers | `packages/testkits/src/p21/helpers.ts` |
| Minecraft P21-A adapter test | `packages/minecraft-interface/src/entity-belief/__tests__/p21-conformance-minecraft.test.ts` |
| Solve bundle types | `packages/planning/src/sterling/solve-bundle-types.ts` |
| Compat linter | `packages/planning/src/sterling/compat-linter.ts` |
| Capability primitives catalog | `docs/planning/capability-primitives.md` |
| Rig tracker | `docs/planning/sterling-capability-tracker.md` |
| This document | `docs/planning/sterling-boundary-contract.md` |
| Sterling-side philosophy (companion) | `sterling/docs/planning/capability_primitives_bundle/philosophy.md` |
| Sterling primitive specs (P01–P21) | `sterling/docs/planning/capability_primitives_bundle/primitives/` |

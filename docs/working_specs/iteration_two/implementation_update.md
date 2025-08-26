Excellent foundation. Below are **targeted changes** that tighten safety, reduce surface area, and make the plan easier to land. I’ve grouped edits by stage plus a few cross-cutting governance items. Wherever useful, I’ve included concrete “Working Spec” edits (file+region), minimal interfaces, and acceptance checks.

---

# Cross-cutting (apply before Stage 1)

## C0. Versioning, provenance, and rollback (must-have)

**Problem:** Dynamic registration without immutable versioning = hard-to-debug runs.

**Change**

* Require `{id, version}` **immutable** at registration; disallow overwrites.
* Add **provenance** & **signing** fields now; don’t bolt on later.

**Working Spec — `enhanced-capability-registry.ts`**

```ts
type CapabilityId = `${string}@${string}`; // name@semver

interface Provenance {
  authoredBy: 'human'|'llm';
  parent?: CapabilityId;         // fork lineage
  codeHash?: string;             // for leaves, build artifact hash
  testsHash?: string;
  signedBy?: string;             // key id (humans/leaves only)
  createdAt: string;
}

interface RegistryRecord<T> {
  id: CapabilityId;
  spec: T;
  provenance: Provenance;
  status: 'shadow'|'active'|'retired'|'revoked';
}
```

**Acceptance**

* New registrations start in **`shadow`**; promotion to `active` requires CI gates (see C2).

---

## C1. Permission model: *least privilege* from day one

**Problem:** Compositions could accidentally escalate capability (e.g., chest access while mining).

**Change**

* **LeafSpec.permissions** is authoritative; **Options** inherit **intersection** of their leaves.
* Registry linter rejects BT-DSL referencing a leaf not permitted by policy for the registering module.

**Working Spec — `bt-dsl-linter.ts`**

```ts
if (!subset(option.requestedPermissions, intersect(allLeafPermissions))) {
  fail('option-permission-escalation');
}
```

**Acceptance**

* Any option that tries to use a leaf with a permission outside the option’s declared set is rejected.

---

## C2. Shadow runs & automatic rollback (safety net)

**Problem:** First run of a new option in production can regress behavior.

**Change**

* **Shadow mode** (A/B): run new option alongside a known-good option; compare postconditions and key metrics; auto-promote on success, auto-retire on failure.

**Working Spec — `registration-pipeline.ts`**

```ts
// After sandbox tests:
record.status = 'shadow'; // needs runtime trials
// Promotion condition (configurable):
// ≥ N successful shadow episodes, Δsuccess ≥ X pp, no safety violations.
```

**Acceptance**

* No LLM-authored option can be `active` without passing **sandbox tests + shadow threshold**.

---

## C3. Error taxonomy (normalize Mineflayer/world failures)

**Problem:** Without a common taxonomy, planners can’t repair reliably.

**Change**

* Centralize an **error code enum** used by all leaves; bind specific Mineflayer exceptions/timeouts to deterministic codes.

**Working Spec — `resource-guards.ts`**

```ts
export type ExecErrorCode =
  | 'path.stuck'|'path.unreachable'|'path.unloaded'
  | 'dig.blockChanged'|'dig.toolInvalid'|'dig.timeout'
  | 'place.invalidFace'|'place.fallRisk'|'place.timeout'
  | 'craft.missingInput'|'craft.uiTimeout'|'craft.containerBusy'
  | 'sense.apiError'|'unknown';

export interface ExecError { code: ExecErrorCode; detail?: string; retryable: boolean; }
```

**Acceptance**

* All leaf failures map to an `ExecErrorCode`; planner repair rules key off codes.

---

# Stage 1 — Leaf Contract System (Foundation)

## S1.1 Tighten the leaf contract

**Problem:** The current contract lacks bounded resource & determinism guarantees.

**Change**

* Add **hard concurrency cap**, **rate limit**, and **idempotency key**; make **postconditions** first-class and machine-checked.

**Working Spec — `leaf-contracts.ts`**

```ts
export interface LeafSpec {
  name: string;
  version: string;
  inputSchema: JSONSchema7;
  postconditions?: JSONSchema7;         // inventory/world delta contract
  timeoutMs: number;
  retries: number;
  permissions: ('movement'|'dig'|'place'|'craft'|'container'|'chat')[];
  rateLimitPerMin?: number;             // default 60
  maxConcurrent?: number;               // default 1
}

export interface LeafRunOptions {
  idempotencyKey?: string;              // dedupe accidental repeats
}
```

**Acceptance**

* Postconditions actually checked (inventory diff / world probe) before returning `success`.

## S1.2 Movement leaves: pathfinder invariants

**Change**

* Movement leaves must **stop()** pathfinder on cancel; expose **replan\_count** metric; fail on `unloaded chunk` after N attempts.

**Working Spec — `movement-leaves.ts` (excerpt)**

```ts
run(ctx, {pos}) {
  return withTimeout(this.spec.timeoutMs, async (signal) => {
    const res = await pathTo(ctx.bot, pos, { signal });
    if (!res.ok && res.reason === 'unloaded') return fail('path.unloaded');
    if (!res.ok && res.reason === 'stuck') return fail('path.stuck');
    return ok();
  });
}
```

**Acceptance**

* Cancellation always leaves bot in a **non-moving** state.

## S1.3 Crafting leaves: transactional wrapper

**Change**

* Wrap mineflayer crafting with **pre-check → perform → verify**; classify UI stalls as `craft.uiTimeout`.

**Acceptance**

* Craft succeeds iff inventory increased by expected amounts; otherwise returns a typed error.

---

# Stage 2 — BT-DSL Parser and Compiler

## S2.1 Keep the DSL deliberately small (Phase 1)

**Problem:** Rich DSLs explode surface area.

**Change**

* Allow only: `Sequence`, `Selector`, `Repeat.Until`, `Decorator.Timeout`, `Decorator.FailOnTrue`, `Leaf`.
* Ban user-defined conditionals/functions; predicates must be **named sensors** the runner knows (`distance_to`, `hostiles_present`, etc.).

**Working Spec — `bt-dsl-schema.ts`**

```ts
type NodeType = 'Sequence'|'Selector'|'Repeat.Until'|'Decorator.Timeout'|'Decorator.FailOnTrue'|'Leaf';
```

**Acceptance**

* Linter rejects any other node types or inline JS.

## S2.2 Deterministic compilation

**Change**

* Compilation outcome must be **pure** for the same input; seed any randomized policies explicitly.

**Acceptance**

* Compiler function is referentially transparent: same JSON ⇒ same bytecode/tree hash.

---

# Stage 3 — Enhanced Capability Registry

## S3.1 Separate **leaf** vs **option** registration paths

**Change**

* **Leaves** require signed human builds; **Options** can be LLM-authored but must pass sandbox + shadow.

**Working Spec — `server.ts` (routes)**

```
POST /capabilities/leaf/register      // requires signer
POST /capabilities/option/register    // LLM allowed; enforced pipeline
POST /capabilities/:id/promote        // shadow → active (policy gate)
POST /capabilities/:id/retire
```

## S3.2 Health checks & quotas

**Change**

* Per-id rate limits; max active versions per option; global cap on shadow options.

**Acceptance**

* Registry rejects registration if **quota** exceeded; emits `resource.quotaExceeded`.

---

# Stage 4 — Dynamic Creation Flow

## S4.1 Impasse detector: specify the bar

**Change**

* Treat an **impasse** as: `(k failures with same ExecErrorCode) OR (⟨utility/step⟩ below threshold for N minutes)`. Don’t over-trigger proposals.

**Working Spec — `impasse-detector.ts`**

```ts
if (rollingWindow('opt.ore_ladder_iron').error('zombie_swarm') >= 3) triggerProposal();
if (emaUtilityPerStep(activity) < θ && elapsed > τ) triggerProposal();
```

**Acceptance**

* Detector rate-limited to 1 proposal per goal per 15 minutes; debounced by success.

## S4.2 Auto-retirement: define the kill switch

**Change**

* Retire option if **win-rate** < θ after M shadow+active runs, or if safety violation occurs.

**Acceptance**

* Registry flips to `retired` automatically; planner disallows selection immediately.

---

# Stage 5 — Task Timeframe Management

## S5.1 Budget is not just timeout—also *checkpoint cadence* and *pause trailer*

**Change**

* Every bucket maps to `{maxMs, checkpointEveryMs, trailer}` where **trailer** enforces a safe pause (e.g., `retreat_and_block`).

**Working Spec — `bucket-policy.ts`**

```ts
type Bucket = 'Tactical'|'Short'|'Standard'|'Long'|'Expedition';
interface BucketCfg { maxMs:number; checkpointEveryMs:number; trailerOptionId: string; }
```

**Acceptance**

* On timeout: trailer always runs; a **resume ticket** is emitted with a safe waypoint.

## S5.2 Explainable selection

**Change**

* Record `defaultBucket → rules → finalBucket` for each step; surface on dashboard.

**Acceptance**

* 100% of planned steps show a bucket decision trace.

---

# Testing/CI (tighten gates)

## T0. Fixture realism

**Change**

* Add **record/replay** harness to capture real Mineflayer sessions; use as fixtures in sandbox.

**Acceptance**

* At least one fixture per leaf family (movement/dig/place/craft/sense).

## T1. CI gates

**Change**

* **Promotion gate** requires: sandbox pass + shadow pass (N runs) + no safety violations + p95 latency within budget.

**Acceptance**

* A failing gate auto-reverts `active` → `shadow` and alerts planner to avoid the regressed id.

---

# Concrete edits to your roadmap (diff-style)

1. **Executive Summary → Key Benefits**
   Add: “Shadow promotion + automatic rollback guard new options; immutable versioning & provenance ensure debuggability.”

2. **Architecture Overview**
   Under *MCP-Style Registry*, add sub-box: **Provenance/Signing** and **Shadow Promotion**.

3. **Leaf Contract System (Deliverables)**

   * Add: `Leaf error taxonomy`, `Rate limits & maxConcurrent`, `Idempotency keys`, `Postcondition verifiers`.

4. **BT-DSL Parser (Deliverables)**

   * Add: “Small-surface DSL, no inline logic; sensor predicate whitelist; deterministic compilation.”

5. **Enhanced Capability Registry (Deliverables)**

   * Split: `leaf-registration (signed)` vs `option-registration (LLM)`
   * Add: `shadow-run controller`, `quota management`, `promotion API`, `retire API`.

6. **Dynamic Creation Flow (Deliverables)**

   * Add: `impasse-detector thresholds & debouncing`, `auto-retirement policy`, `win-rate dashboard panel`.

7. **Time Management System (Deliverables)**

   * Add: `bucket trailers`, `bucket decision trace`, `resume-ticket schema`.

8. **Safety and Trust (Deliverables)**

   * Add: `permission escalation linter`, `provenance record`, `capability rate limits`.

9. **Success Metrics**

   * Functional: add “**Shadow promotion pass rate** ≥ 80% for LLM options.”
   * Performance: add “**Executor p95 leaf latency** within bucket budgets.”
   * Safety: add “**Zero permission escalations** verified by linter; **Auto-rollback MTTR** < 1 min.”

---

# Minimal schemas (to drop in)

**Resume ticket**

```ts
export interface ResumeTicket {
  id: string; originOption: CapabilityId; args: any;
  waypoint: { name:string; pos:[number,number,number]; safe:boolean };
  progress: Record<string,unknown>;
  required: Record<string,unknown>;
  suggestedBucket: Bucket;
  createdAt: string;
}
```

**Bucket decision trace**

```ts
export interface BucketTrace {
  activity: string;
  default: Bucket;
  appliedRules: string[]; // e.g., ['nightShrinks','lowFoodShrinks']
  final: Bucket;
}
```

---

## Why these changes matter

* **Safety/Trust**: signing + shadow mode + permission linting prevent subtle regressions and privilege creep.
* **Operability**: immutable ids + rollback + error taxonomy make on-call sane.
* **Performance**: small DSL & deterministic compiler reduce tail latencies and simplify caching.
* **Learning loop**: impasse thresholds + win-rate policies ensure LLM creativity stays net-positive.

If you’d like, I can translate the above into **PR-ready skeletons** for:

* `leaf-contracts.ts` (with error taxonomy & postcondition helper),
* `bt-dsl-schema.ts` (JSON Schema v7, small surface),
* `registration-pipeline.ts` (shadow lifecycle),
* `bucket-policy.ts` + `timeout/checkpoint` decorators,
* and a tiny `record/replay` harness for Mineflayer fixtures.

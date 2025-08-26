Short answer: yes—with guardrails. Let the bot *propose* new leaves (skills/tools) and even whole BT subtrees, but only **register** them through a tight MCP-style contract: declarative spec → static checks → sandboxed tests → run-time health → versioned registry. The execution edge stays boring (restricted primitives), while creativity happens in the “compiler” that turns specs into safe, composable behaviors.

Below is a concrete architecture you can drop in.

# 1) Mental model

* **Leaves** = the only code that touches Mineflayer (dig/place/craft/path). Leaves are **small, audited primitives** with timeouts, retries, and postconditions.
* **Options/Skills** = *compositions* of leaves expressed in a constrained BT-DSL (JSON). These can be **generated dynamically** by the bot and registered if they pass checks.
* **MCP-style capability bus** = a registry where capabilities (leaves, options) are declared with schemas and contracts, health-checked, and invoked by name.

Result: the bot can create new *compositions* freely; it can *propose* new primitives, but those require a stricter path (human review or elevated policy).

# 2) Contracts (schemas you enforce)

## 2.1 Leaf (primitive) contract (TypeScript)

```ts
export type LeafStatus = 'success'|'failure'|'running';

export interface LeafContext {
  bot: Mineflayer.Bot;
  abortSignal: AbortSignal;
  now(): number;
  snapshot(): Promise<WorldSnapshot>;
  inventory(): Promise<InventoryState>;
  emitMetric(name: string, value: number, tags?: Record<string,string>): void;
}

export interface LeafSpec {
  name: string;                 // unique
  version: string;              // semver
  description?: string;
  inputSchema: JSONSchema7;     // args contract
  outputSchema?: JSONSchema7;   // optional result
  timeoutMs: number;            // hard cap
  retries: number;              // bounded retries
  postconditions?: JSONSchema7; // inventory/world delta promises
  permissions: ('movement'|'dig'|'place'|'craft'|'container'|'chat')[];
}

export interface LeafImpl {
  spec: LeafSpec;
  run(ctx: LeafContext, args: unknown): Promise<{status:LeafStatus, result?:unknown, error?:string}>;
  cancel?(): void;
}
```

## 2.2 Option/Skill (composed) contract (JSON BT-DSL)

```json
{
  "id": "opt.torch_corridor",
  "version": "1.0.0",
  "argsSchema": {
    "type": "object",
    "properties": {"interval": {"type": "integer","minimum": 2,"default": 6}},
    "required": []
  },
  "pre": ["has(item:torch)>=1", "light>=5"],
  "post": ["corridor.light>=8"],
  "tree": {
    "type": "Sequence",
    "children": [
      {"type": "Decorator.Timeout", "ms": 60000,
        "child": {"type":"Repeat.Until", "predicate":"distance_to_end<=0",
          "child": {"type":"Sequence","children":[
            {"type":"Leaf","name":"sense_hostiles","args":{"radius":10}},
            {"type":"Decorator.FailOnTrue","cond":"hostiles_present",
              "child":{"type":"Leaf","name":"retreat_and_block"} },
            {"type":"Leaf","name":"place_torch_if_needed","args":{"interval":"$interval"}}
          ]}
        }
      }
    ]
  }
}
```

**Important:** the DSL only permits a **whitelist** of node types (Sequence, Selector, Parallel, Decorators) and **only named leaves** that exist in the registry. No arbitrary code can be injected.

# 3) MCP-style Registry

## 3.1 CapabilityRegistry interface

```ts
export interface CapabilityRegistry {
  // Leaves (primitives)
  registerLeaf(impl: LeafImpl): RegistrationResult;
  getLeaf(name: string, version?: string): LeafImpl|undefined;

  // Options (compositions)
  registerOption(def: OptionDefJson): RegistrationResult;
  getOption(id: string, version?: string): OptionDefJson|undefined;

  // Health & provenance
  list(): CapabilitySummary[];
  health(nameOrId: string): CapabilityHealth;
}
```

## 3.2 Registration pipeline (server APIs)

* `POST /capabilities/leaf/register` → accepts `LeafSpec + wasm/impl-id` **only from trusted signers** (e.g., your own build).
* `POST /capabilities/option/register` → accepts BT-DSL JSON; **open** to LLM proposals.

**Validation stages**

1. **Static checks**

   * JSON Schema validation (args/pre/post).
   * DSL linter: only allowed nodes; leaves must exist; timeouts present.
   * Permissions: composed trees cannot escalate beyond leaves’ permissions.
2. **Dry-run compilation**

   * Instantiate BT; ensure all nodes bind; no cycles; expansion under max depth.
3. **Sandboxed tests**

   * Run in a simulated world or “shadow” Mineflayer with mocked APIs.
   * Verify postconditions with inventory/world diffs.
   * Timeout budget honored; cancel cooperates.
4. **Policy**

   * **Compositions** can auto-approve if tests pass.
   * **New primitives** require a human or separate secure build signer.

If all pass: write to the registry with a **capability id**, `semver`, and **provenance** (who authored—LLM vs human, code hash, tests hash). Expose via `GET /capabilities/:id`.

# 4) Dynamic creation flow (what the bot does)

1. Planner hits an impasse repeatedly.
2. Arbiter asks LLM “propose an option” given: pre/post, available leaves, and constraints.
3. LLM returns BT-DSL JSON (+ minimal tests).
4. `POST /capabilities/option/register` → pipeline runs.
5. On success, planner can immediately use `opt.*` by id+version.
6. Telemetry tracks **reuse** and **win-rate** of new options; low performers are auto-retired.

# 5) Safety & trust model

* **Trust tiers**

  * Tier 0: Existing **leaves** (human-authored, signed).
  * Tier 1: **Compositions** (LLM-authored) using only Tier 0 leaves.
  * Tier 2: New leaves (LLM-proposed) → never auto-enabled; open a PR with diff, tests, and require human merge.
* **Determinism**

  * Leaves must be side-effect confined to Mineflayer calls and their contracts.
  * No global mutable state beyond provided `LeafContext`.
* **Resource guards**

  * Rate-limit registrations; cap active option versions per id; GC old versions.
* **Observability**

  * Every run emits: leaf durations, retries, error taxonomy, postcondition check results.

# 6) Concrete glue: implementable skeletons

## 6.1 LeafFactory & registration

```ts
import Ajv from 'ajv';

export class LeafFactory {
  private ajv = new Ajv({allErrors:true, useDefaults:true});
  private registry: Map<string, LeafImpl> = new Map();

  register(leaf: LeafImpl): RegistrationResult {
    // compile schemas once
    this.ajv.compile(leaf.spec.inputSchema);
    if (leaf.spec.outputSchema) this.ajv.compile(leaf.spec.outputSchema);
    // name@version key
    const key = `${leaf.spec.name}@${leaf.spec.version}`;
    if (this.registry.has(key)) return {ok:false, error:'version_exists'};
    this.registry.set(key, leaf);
    return {ok:true, id:key};
  }

  get(name: string, version?: string): LeafImpl|undefined {
    if (version) return this.registry.get(`${name}@${version}`);
    // return latest semver—left as exercise
    return [...this.registry.entries()].reverse().find(([k])=>k.startsWith(`${name}@`))?.[1];
  }
}
```

## 6.2 Option (BT-DSL) loader

```ts
type Node = Sequence|Selector|LeafNode|Decorator; // narrow union

export function compileOption(def: OptionDefJson, leafFactory: LeafFactory): CompiledOption {
  // 1) validate JSON with schema
  // 2) walk tree; for every Leaf node ensure leafFactory.get(name)
  // 3) cap depth/width; attach timeouts
  // 4) return an executable node tree
  return buildTree(def.tree, leafFactory);
}
```

## 6.3 Example: register a new composition at runtime

```ts
// LLM proposes JSON for opt.torch_corridor (from earlier)
const proposed = await getLLMOptionProposal();
const res = await fetch('http://localhost:300X/capabilities/option/register',{
  method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(proposed)
});
const { ok, id, error } = await res.json();
if (ok) planner.installOption(id);  // immediately usable
```

# 7) What is allowed to be “dynamic”?

* **Allowed dynamic**: new **options/skills** composed *only* from existing leaves; new **HTN methods/GOAP rules** that reference those options; new **prompt templates**.
* **Must be reviewed**: new **leaves** (any code that touches Mineflayer or the filesystem/network); expanded permissions (e.g., container interactions); high-risk decorators (arbitrary loops with no timeouts).

# 8) Minimal initial leaf set (sane base to compose from)

* `move_to(GoalBlock|GoalNear|GoalFollow)`
* `dig_block({pos, expect})`
* `place_block({item, against|pos})`
* `craft_recipe({recipe, qty})` / `smelt({input,fuel,qty})`
* `sense_hostiles({radius})`
* `chat({message})` (expressive channel only)
* `wait({ms})` (decorator-safe; enforces abortable sleep)

Each leaf: timeout, retries, postcondition check, error taxonomy.

# 9) Governance & DX

* **Versioning**: `id@semver`, immutable once registered. Planner can pin or accept caret ranges (`^1.2`).
* **Shadow runs**: initially execute a new option in “shadow mode” alongside a known-good plan and compare outcomes; promote on success.
* **PR flow for primitives**: LLM proposal → codegen branch → unit/e2e tests auto-generated → human review merges → signed build registers leaf.

# 10) Why this will work for you

* You keep the **execution edge** testable and deterministic.
* You unlock **self-extension** where it’s safe: compositions and planners.
* You get **observability** (ids, versions, metrics) that makes debugging sane.
* You can gradually accept **stronger leaves** as your safety net (tests, shadow runs, policy) matures.

If you want, I can produce:

* the **JSON Schemas** for leaves and options,
* a **validator + linter** for the BT-DSL,
* and one end-to-end example where the bot identifies repeated “night mining” failures, proposes `opt.torch_corridor`, passes registration, and your planner immediately starts using it.

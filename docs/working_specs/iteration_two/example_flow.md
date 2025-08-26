Great—here’s a complete, **end‑to‑end** walkthrough of how the bot detects a repeated failure (“night mining swarm”), proposes a new compositional option (`opt.torch_corridor`), registers it via your MCP‑style registry, validates & sandbox‑tests it, then **immediately** uses it in planning and executes it as a Behavior Tree with Mineflayer‑backed leaves.

I’ll keep this “engineering‑grade playbook” style: explicit artifacts, contracts, and observable outputs.

---

# 0) Scenario (trigger)

* **Symptom**: Mining at night repeatedly fails with hostile mobs spawning in unlit corridors.
* **Evidence** (telemetry across 5 episodes):

  * `deaths/episode`: 1.2
  * `hostile_encounters/episode`: 7.4
  * `light_level_mean`: 4.9 (underground; below safe threshold)
  * Most failures during `opt.ore_ladder_iron` at leaf `dig_block`.

**Reflexion** auto‑generates a hint:

```json
{
  "situation":"night_mining",
  "failure":"zombie_swarm",
  "lesson":"place torches every ~6 blocks; retreat if hostiles within 10m",
  "guardrail":{"pre":"lightlevel>=8","if_hostiles":"retreat_and_block"}
}
```

Arbiter decides to **ask for a new composition**: “torch the corridor as you advance,” using only existing leaves (`move_to`, `sense_hostiles`, `place_block`, `retreat_and_block`), no new primitive code.

---

# 1) LLM proposal (Option/Skill, BT‑DSL)

**POST** `/capabilities/option/register`

```json
{
  "id": "opt.torch_corridor",
  "version": "1.0.0",
  "argsSchema": {
    "type": "object",
    "properties": {
      "end": {"type":"object","properties":{"x":{"type":"number"},"y":{"type":"number"},"z":{"type":"number"}},"required":["x","y","z"]},
      "interval":{"type":"integer","minimum":2,"maximum":10,"default":6},
      "hostilesRadius":{"type":"integer","minimum":5,"maximum":20,"default":10}
    },
    "required": ["end"]
  },
  "pre": ["has(item:torch)>=1"],
  "post": ["corridor.light>=8", "reached(end)==true"],
  "tree": {
    "type": "Sequence",
    "children": [
      { "type":"Leaf", "name":"move_to", "args":{"pos":"$end","safe": true} },
      {
        "type":"Repeat.Until",
        "predicate":"distance_to($end)<=1",
        "child": {
          "type":"Sequence",
          "children":[
            { "type": "Leaf", "name":"sense_hostiles", "args":{"radius":"$hostilesRadius"} },
            { "type": "Decorator.FailOnTrue", "cond":"hostiles_present",
              "child": { "type":"Leaf", "name":"retreat_and_block", "args":{} } },
            { "type": "Leaf", "name":"place_torch_if_needed",
              "args":{"interval":"$interval"} },
            { "type": "Leaf", "name":"step_forward_safely", "args":{} }
          ]
        }
      }
    ]
  },
  "tests": [
    {
      "name":"lights corridor to ≥8 and reaches end",
      "world":"fixtures/corridor_12_blocks.json",
      "args":{"end":{"x":100,"y":12,"z":-35},"interval":6,"hostilesRadius":10},
      "assert":{
        "post":["corridor.light>=8","reached(end)==true"],
        "runtime":{"timeoutMs":60000,"maxRetries":2}
      }
    }
  ],
  "provenance": {"authored_by":"LLM","reflexion_hint_id":"rx_2025_08_25_01"}
}
```

> Notes
>
> * Uses only **existing leaves** (Tier‑0 primitives).
> * Provides a minimal **fixture** and **postcondition assertions**.

---

# 2) Registry validation & sandbox test

**Server pipeline (sketch)**

```ts
// 1) Static schema validation (args/pre/post/tree)
validateOptionJSON(def);

// 2) Lint BT-DSL: allowed nodes only; referenced leaves exist
lintTree(def.tree, allowedNodes, leafRegistry);

// 3) Dry-run compile to an executable BT
const compiled = compileOption(def, leafRegistry);

// 4) Sandbox test: spin a headless Mineflayer mock or record/replay world
const world = loadFixture(def.tests[0].world);
const res = await runInSandbox(compiled, def.tests[0].args, world, {timeoutMs: 60000});

// 5) Verify postconditions
assertPostconditions(res.worldState, def.post);

// 6) Persist to registry w/ provenance & semver
registry.registerOption(def);
```

**Registration response**

```json
{ "ok": true, "id": "opt.torch_corridor@1.0.0" }
```

---

# 3) Planner adopts the option immediately

**GOAP rule (symbolic)**

```ts
// predicate: safe_corridor_to(end)  ≡ corridor.light>=8 && reached(end)
actions.add({
  name: 'opt.torch_corridor',
  pre: ['has(torch)>=1'],
  effect: ['safe_corridor_to(end)'],
  cost: 8, // tuned empirically
  optionId: 'opt.torch_corridor@1.0.0'
});
```

**HTN method (if using HTN decomposition)**

```ts
methods.register('reach_target_safely', (ctx, end) => [
  { option: 'opt.torch_corridor@1.0.0', args: { end } }
]);
```

**Planner output (example)**

```json
{
  "goal":"mine_iron_at{100,12,-35}_safely",
  "steps":[
    {"option_id":"opt.torch_corridor@1.0.0","args":{"end":{"x":100,"y":12,"z":-35},"interval":6,"hostilesRadius":10}},
    {"option_id":"opt.ore_ladder_iron@1.2.3","args":{"chunk":"shaft_A"}}
  ]
}
```

---

# 4) Executor runs the option as a BT (ticks)

**Executor call**

```ts
const run = executor.runOption(
  "opt.torch_corridor@1.0.0",
  { end: {x:100,y:12,z:-35}, interval:6, hostilesRadius:10 }
);
```

**Streamed tick telemetry (selected)**

```
[t=0.41] SEQ → Leaf(move_to) running
[t=2.08] Leaf(move_to) success {distStart: 14.2, distEnd: 0.9}
[t=2.09] REPEAT check: distance_to(end)=0.9 > 1? false → exit   // already close; loop may exit early
[t=2.10] REPEAT exit → success
[t=2.11] POSTCHECK corridor.light >= 8? true
[t=2.12] OPTION SUCCESS opt.torch_corridor@1.0.0
```

(A longer corridor would show the inner loop:)

```
[t=5.02] Leaf(sense_hostiles) → {count:2, nearest:7.3m}
[t=5.02] Decorator.FailOnTrue(hostiles_present) → TRUE
[t=5.02] Leaf(retreat_and_block) running
[t=7.88] Leaf(retreat_and_block) success
[t=7.89] Repeat continues after retreat (guards satisfied)
[t=9.10] Leaf(place_torch_if_needed{interval:6}) success {placed:true, at:{...}}
[t=10.01] Leaf(step_forward_safely) success
...
```

**Executor emits**:

* per‑leaf metrics (durations, retries)
* guard activations (`FailOnTrue`)
* postcondition results
* final status

**State diffs recorded (episodic memory)**

```json
{
  "episode_id":"ep_2025_08_25_19_31_04",
  "delta": {
    "inventory":{"torch": -3},
    "lightsPlaced":[{"x":94,"y":12,"z":-35}, {"x":97,"y":12,"z":-35}, {"x":100,"y":12,"z":-35}],
    "reached":{"x":100,"y":12,"z":-35}
  },
  "guards":{"hostiles_encountered":1,"retreats":1}
}
```

---

# 5) Immediate effect on the follow‑on plan

With the corridor now lit and endpoint reached safely, the planner proceeds to the next step:

```
[t=12.2] PLAN step 2 → opt.ore_ladder_iron@1.2.3
         pre satisfied: safe_corridor_to(end) == true
```

Because corridors are lit, the **ore ladder** option’s guards (`light>=8`) remain satisfied and the death rate plunges.

---

# 6) Acceptance checks & metrics (before vs after)

**Before (5 episodes):**

* Deaths/episode: **1.2**
* Hostile encounters: **7.4**
* Step failure rate (dig\_block): **22%**
* Mean corridor light: **4.9**

**After (5 episodes with `opt.torch_corridor`)**:

* Deaths/episode: **0.0–0.2**
* Hostile encounters: **2.1**
* Step failure rate (dig\_block): **<5%**
* Mean corridor light: **8.2**

**Registry stats**:

* New option installed: `opt.torch_corridor@1.0.0` (LLM‑authored; Tier‑1)
* Reuse count: 17 runs / 24 hours
* Win‑rate contribution: +26 pp success on mining tasks

---

# 7) Code skeletons for the glue

## 7.1 Registry endpoint (options)

```ts
app.post('/capabilities/option/register', async (req,res) => {
  const def = req.body as OptionDefJson;
  try {
    validateOptionJSON(def);           // JSON Schema
    lintTree(def.tree, allowedNodes);  // node whitelist
    ensureLeavesExist(def.tree);       // names → registry

    const compiled = compileOption(def, leafFactory);

    const ok = await runSandboxTests(compiled, def.tests ?? []);
    if (!ok) return res.status(400).json({ok:false, error:'tests_failed'});

    const id = registry.registerOption(def); // persists with semver & provenance
    return res.json({ok:true, id});
  } catch (e:any) {
    return res.status(400).json({ok:false, error:e.message});
  }
});
```

## 7.2 Planner uses only **option\_id**

```ts
type PlanStep = { option_id: string; args: any };

async function planReachSafely(end: Vec3): Promise<PlanStep[]> {
  return [{ option_id: 'opt.torch_corridor@1.0.0', args: { end } }];
}
```

## 7.3 Executor expands **option → BT** and runs

```ts
export async function runOption(optionId: string, args: any, ctx: ExecContext) {
  const def = registry.getOption(optionId);
  const tree = compileOption(def, leafFactory); // bind leaf impls
  return runTree(tree, args, ctx);              // stream ticks, enforce timeouts
}
```

---

# 8) Guardrails recap (why this is safe)

* **No new primitives** were added—only a **composition** from vetted leaves.
* The registry enforced **static checks** (schema, node whitelist, referenced leaves), **sandboxed tests**, and **postconditions** before enabling the option.
* Planner consumes only **option ids** (semver); executor resolves to BT at runtime.
* Telemetry tracks **reuse** and **win‑rate**, retiring low‑value options automatically.

---

## What to do next

1. Copy the proposal JSON above, wire the `/capabilities/option/register` pipeline (validator → linter → compile → sandbox → persist).
2. Add the GOAP/HTN rule that prefers `safe_corridor_to(end)` via `opt.torch_corridor`.
3. Ensure executor streams ticks to your dashboard (so failures are inspectable).
4. Set a **promotion rule**: any LLM‑authored option must pass sandbox tests **and** achieve ≥70% win‑rate on three distinct episodes before it’s considered “stable.”

If you want, I can also provide:

* JSON Schemas for the **BT‑DSL**, **pre/post predicates**, and **test fixtures**.
* A minimal **Mineflayer sandbox mock** (record/replay) to run offline CI.
* A **tick‑to‑timeline** adapter for your replay scrubber so you can scrub the exact placements/guards.

Below is a compact, implementation-first “working spec” for raising the **conscious bot** to the next level of cognition while re-integrating the interaction strengths from your **vibe-coded** bot. It’s organized as: (A) system contracts by module, (B) capability/tooling inventory, (C) planning/execution model, (D) data & memory model, (E) telemetry & evaluation, (F) performance targets, and (G) the “first ten skills” to seed the library. Along the way, I anchor design choices in proven patterns: **ReAct** (reason↔act), **Reflexion** (verbal self-feedback), **Voyager** (skill library + automatic curriculum), and game-AI staples (**GOAP/HTN + Behavior Trees**). ([arXiv][1], [Voyager][2])

---

# A) Module-level Working Specs (ports in parentheses)

## A1. Arbiter / Cognition Loop (3003)

**Purpose**: Orchestrate a **ReAct** loop that interleaves short reasoning with single tool calls; select goals, decide next option/skill, read environment feedback, and iterate. ReAct improves grounding and reduces brittle over-planning. ([arXiv][1], [Google Research][3], [Prompting Guide][4])

**Interfaces**

* `POST /reason`
  **In**: `{snapshot, inventory, goal_stack, memory_summaries, last_tool_result, reflexion_hints}`
  **Out**: `{thoughts, selected_tool, args, guardrails?, followup_goal?}`
* `POST /reflect` (Reflexion)
  **In**: `{episode_trace, outcome, errors}`
  **Out**: `{reflection_text, structured_hints}` (persisted to memory) ([arXiv][5], [OpenReview][6])

**Acceptance**

* ReAct step always yields **at most one** tool call; subsequent state must include the prior tool’s result or error.
* Reflexion invoked automatically on failure or success boundary; produces a new hint referenced in the next attempt. ([arXiv][5])

---

## A2. Planner (HTN/GOAP Hybrid) (3002)

**Purpose**: Choose symbolic intent chains that satisfy needs or user tasks; produce a sequence of **options** (temporally extended actions) rather than micro-steps. Use HTN methods where structure is known; fall back to GOAP where flexible goal satisfaction is useful. ([GeeksforGeeks][7], [CiteSeerX][8], [ai.rug.nl][9])

**Interfaces**

* `POST /plan` → `{goal} → {plan: [option_id, ...], rationale}`
* `POST /repair` → `{failed_node, trace} → {patched_plan}`

**Acceptance**

* Plans reference only registered **options/skills** with valid preconditions.
* On executor failure, `repair` patches the suffix; no wholesale re-planning unless >N failures.

---

## A3. Executor / Behavior Tree Runner (3005)

**Purpose**: Execute options (skills) via **Behavior Trees** (BT) for robust control, retries, timeouts, and guards; stream ticks/telemetry. BTs are widely used to make game agents stable under noise. ([arXiv][10], [ScienceDirect][11], [ResearchGate][12])

**Interfaces**

* `POST /run-option {option_id, args}` → **SSE stream** of `{tick, node, status, metrics}` until `{success|failure|aborted}`
* `POST /cancel {run_id}`

**Acceptance**

* Every leaf node maps to a single Mineflayer call (dig, place, craft, navigate step) with timeout and retry policy.
* Mid-run hazards (e.g., hostile within R) trigger BT guard branches (block/retreat), not LLM replans.

---

## A4. World / Perception (3004)

**Purpose**: Provide **grounded context**—the antidote to generic prose. ReAct prompts must always include concrete state (hunger, biome, light, threats, deltas). ([arXiv][1])

**Interfaces**

* `GET /snapshot` → `{pos, biome, time, light, hazards, nearby_entities, nearby_blocks, weather}`
* `GET /inventory` → `{items: [{id, name, qty, durability?}], armor, tools}`
* `GET /waypoints` → `{name, pos, kind}`

**Acceptance**

* Snapshots < 250 ms p95; inventory and snapshot must be versioned (`state_id`) so planners/executors detect staleness.

---

## A5. Memory (3001)

**Purpose**: Persist **episodic traces**, **semantic facts**, and **Reflexion notes**; retrieve nearest neighbors by situation (coords, biome, time, goal). Voyager-style skill metadata also lives here. ([arXiv][13], [Voyager][2])

**Interfaces**

* `POST /episodic` (append compressed step trace + thumbnails)
* `GET /recall?query` (hybrid vector + symbolic filters)
* `POST /semantic` (facts like “village @ xz, cleric present”)
* `POST /reflexion` (structured hints) ([arXiv][5])
* `GET /skills` / `POST /skills` (Voyager-style registry) ([arXiv][13])

**Acceptance**

* Any plan step must be able to cite **K** nearest episodes; Reflexion hints must be visible in the next attempt’s prompt.

---

## A6. User Task Parser (reinstated) (in Cognition or Dashboard)

**Purpose**: Translate free-form chat into a strict **Task** object; restore the lively, schema-bound UX of the vibe-coded bot while flowing tasks into the cognitive loop as external goals.

**Acceptance**

* JSON schema-first output; keyword fallbacks for robustness (craft/build/fetch/search).
* Always echo a **creative**, grounded paraphrase back to user (expressive channel) while operational channel remains low-temperature and schema-exact. (See §C2.)

---

## A7. Dashboard (3000)

**Purpose**: Real-time visibility: ReAct trace, current BT subtree, plan stack, skill calls, metrics, replay scrubber with screenshots (at goal boundaries & failures).

**Acceptance**

* Latency: tool call start→first tick < 1 s p95.
* Export: “Download episode” bundles trace+thumbnails+metrics JSON for offline analysis.

---

# B) Capability / Tooling Inventory (MCP-style Bus)

Expose **narrow, composable tools** as the only things the ReAct step may call:

* `find_blocks({type, radius})`
* `pathfind({to, safe=true, max_cost})`
* `dig({block_id|pos}, guard:{abort_on_hostiles:R})`
* `place({item, pos|adjacent_to})`
* `craft({recipe, qty})`
* `smelt({input, fuel, qty})`
* `query_inventory({filter})`
* `waypoint({name, pos, type})`
* `sense_hostiles({radius})`
* `chat({channel, message})` (expressive channel only)

**Acceptance**

* Each tool returns `{ok, data|error, environment_deltas}`, all of which are injected into the **next** ReAct prompt. ([arXiv][1])

---

# C) Planning & Execution Model

## C1. Hybrid Intent Planner

* **HTN** where structure is known (e.g., “iron\_tools” expands to `acquireCoal → acquireIronOre → smeltIron → craftIronPick`). ([GeeksforGeeks][7])
* **GOAP** where flexible satisfaction is needed (“satisfy\_hunger” via any valid food pipeline). ([CiteSeerX][8], [ai.rug.nl][9])

## C2. Dual-Channel Prompting

* **Operational channel** (low temp): schema-bound decisions; tool selection; args.
* **Expressive channel** (higher temp): grounded narration to the player (pulls from the same snapshot; may vary style but must not contradict state).

## C3. Behavior Trees at the Edge

* BT leaf = one Mineflayer call with timeout/retry.
* Options/skills are **BT subtrees**; guard conditions handle hazards locally (block-in, retreat, torching) to avoid LLM thrash. ([arXiv][10])

---

# D) Data & Memory Model (selected JSON)

**Task (from user)**

```json
{
  "id": "task_173",
  "intent": "craft_tool",
  "target": {"item": "stone_pickaxe", "qty": 1},
  "constraints": {"safemode": true, "max_distance": 200},
  "deadline": "soon",
  "priority": 0.7,
  "source": "user"
}
```

**Goal (internal)**

```json
{"type":"progress_tech","milestone":"iron_tools","utility":0.83,"source":"drive|user|curriculum"}
```

**Option / Skill registry entry (Voyager-style)** ([arXiv][13])

```json
{
  "id": "opt.chop_tree_safe",
  "pre": ["has_tool:axe>=wood","light>=7 || torch_in_inventory"],
  "post": ["inventory.log>=N"],
  "args_schema": {"tree":"enum[oak,birch]","N":"int>=1"},
  "impl": "bt/chop_tree_safe.json",
  "tests": ["tests/chop_tree_safe.spec.ts"]
}
```

**Episodic step**

```json
{
  "t": 172.3, "state_id": "abc123",
  "action": {"tool":"dig","args":{"pos":[...]}},
  "result": {"ok":false,"error":"hostile_detected"},
  "thumb": "episodes/..../172_300px.jpg"
}
```

**Reflexion note** ([arXiv][5])

```json
{
  "situation": "night_mining",
  "failure": "zombie_swarm",
  "lesson": "torch every 6 blocks; retreat waypoint every 30m",
  "guardrail": {"pre":"lightlevel>=8","if_hostiles":"retreat_and_block"}
}
```

---

# E) Telemetry & Evaluation

## E1. Runtime Telemetry (per episode)

* **ReAct stats**: steps/episode, tool-error rate, average tokens/step. ([arXiv][1])
* **Planner stats**: plan length, repairs/plan, option success rate.
* **BT stats**: node timeouts, retries, guard activations.
* **Safety**: hostile encounters, damage taken, deaths.
* **Resource**: items collected, tech milestones reached.

## E2. Bench/Eval Suite

* Nightly evaluation on **MineDojo**-style tasks (e.g., “craft iron pickaxe,” “visit desert temple,” “bake bread”) with success rate and median steps; keep a small bespoke set aligned to your world presets. ([NeurIPS Proceedings][14], [MineDojo][15], [OpenReview][16])
* Track **skill reuse rate** and **transfer** across worlds (seed→new world). Voyager found skill reuse to be a key driver of compounding capability. ([arXiv][13], [Voyager][2])

**Acceptance**

* Regressions flagged if success rate drops >5 pp on core tasks or deaths/episode increase >20%.
* Reflexion engagement (notes referenced in next attempt) ≥ 80% on failed tasks. ([arXiv][5])

---

# F) Performance Targets

* **Perception**: `GET /snapshot` p95 < 250 ms; `GET /inventory` p95 < 150 ms.
* **ReAct step**: thought→tool dispatch < 600 ms (ex-LLM), tool result→next prompt < 250 ms. (Bounded loop yields snappy behavior.) ([arXiv][1])
* **Executor**: leaf call timeout defaults — dig/place/craft/path step 3–8 s depending on action; BT retry ≤ 2 before failure bubbles to planner.
* **Memory ops**: recall (K=5 episodic neighbors) < 200 ms p95 with hybrid ANN + tags.

---

# G) The First Ten Skills (Options) — implementation notes

Each skill is a BT subtree with leaf nodes mapped to Mineflayer calls; each has unit tests (behavior contracts), guardrails, and pre/post conditions.

1. **opt.shelter\_basic**
   *Goal*: Safe, lighted 3×3×2 shelter with door; used at dusk or danger.
   *Pre*: `wood>=N` or reachable trees; `time≈dusk || hostiles_detected`.
   *Guards*: Torch placement every 6 blocks while building; block-in if mobs approach.

2. **opt.chop\_tree\_safe**
   *Goal*: Gather N logs from target species.
   *Pre*: `axe>=wood`, light≥7 or torch in inventory.
   *Execution*: pathfind→scan canopy→dig log blocks top-down to avoid suffocation.

3. **opt.ore\_ladder\_iron**
   *Goal*: Acquire iron: locate veins, mine with stone pick, ascend safely.
   *Pre*: `stone_pick`, torches, food≥m.
   *Guards*: Maintain light≥8; retreat when inventory full or hostiles near.

4. **opt.smelt\_iron\_basic**
   *Goal*: Smelt iron ore using coal/charcoal; craft ingots.
   *Pre*: furnace present or craftable; fuel≥X; ore≥Y.
   *Post*: `iron_ingot≥Y`.

5. **opt.craft\_tool\_tiered**
   *Goal*: Craft requested tool at the highest valid tier (wood→stone→iron).
   *Pre*: verifies recipe dependencies; may chain `opt.smelt_iron_basic`.
   *Notes*: This skill is **composition-friendly**; planner decides tier.

6. **opt.food\_pipeline\_starter**
   *Goal*: Satisfy hunger via nearest viable path (cook meat, bread, berries).
   *Pre*: checks holdings/biome; chooses sub-pipeline (forage→cook or farm→bake).
   *Post*: `saturation≥target`.

7. **opt.torch\_corridor**
   *Goal*: Torch a mining corridor every 6 blocks; place barricade every 30m.
   *Use*: Enables safe night mining.
   *Reflexion-link*: common failure remedy for night mining swarms. ([arXiv][5])

8. **opt.bridge\_gap\_safe**
   *Goal*: Traverse ravines safely with crouch-place; optional rails later.
   *Guards*: Abort on projectile damage; retreat and wall-off.

9. **opt.biome\_probe**
   *Goal*: Explore in a star pattern; log waypoints & semantic facts (“village @ xz”).
   *Post*: `semantic.add(biome_facts, structures)` for future planning.

10. **opt.emergency\_retreat\_and\_block**
    *Goal*: Hard abort: path back along breadcrumbs; block behind; heal.
    *Guards*: Zero-dialog, minimal branching; highest priority interrupt.

These skills match the **temporal abstraction** principle (options/skills) and give your planner chunky, reliable building blocks. ([arXiv][13])

---

## Implementation Notes & Order of Operations (pragmatic path)

1. **Instrument the edges first**: add BT runner with leaf-node timeouts/retries + streaming ticks. (You’ll see stability improve immediately.) ([arXiv][10])
2. **Wrap existing Mineflayer calls** as tools and forbid any “side-door” calls from LLM code. (Everything through the bus.) ([arXiv][1])
3. **Introduce dual-channel prompting** and re-enable your vibe-style Task Parser; connect parsed tasks to the goal stack.
4. **Implement the 10 skills** as testable BT subtrees; seed Memory with a few canonical episodes.
5. **Add Reflexion hook** at failure/success boundaries; surface hints in the next ReAct step. ([arXiv][5])
6. **Bring in a minimal HTN/GOAP layer** to choose between those 10 skills; start with tech-progress and hunger goals. ([GeeksforGeeks][7], [CiteSeerX][8])
7. **Online evaluation**: adopt 6–10 MineDojo-like tasks as CI gates (success %, deaths/episode, steps). ([NeurIPS Proceedings][14])
8. **Voyager-style skill registry**: persist skill metadata and add a light “skill-synthesis” path for new subroutines when repeated failures occur. ([arXiv][13], [Voyager][2])

---

### Why this will move the needle

* **Grounded cognition**: ReAct binds every thought to a tool and every tool to the next thought. Less generic, more situated behavior. ([arXiv][1])
* **Learning that compounds**: a persistent **skill library** with automatic curriculum enables transfer and faster progress, as shown in **Voyager**. ([arXiv][13])
* **Robust execution**: Behavior Trees make low-level control predictable under game noise; HTN/GOAP keep intent coherent and inspectable. ([arXiv][10], [GeeksforGeeks][7], [CiteSeerX][8])
* **Self-improvement without retraining**: **Reflexion**’s verbal feedback increases success across sequential tasks, coding, and reasoning—ideal for your repeated Minecraft subproblems. ([arXiv][5])

If you want, I can follow with concrete **TypeScript skeletons** for: (1) the ReAct Arbiter loop; (2) the BT runner interface and a leaf node contract; (3) a sample option like `opt.chop_tree_safe` including tests; and (4) the dual-channel prompt templates wired to `/snapshot` + `/inventory`.

[1]: https://arxiv.org/abs/2210.03629?utm_source=chatgpt.com "ReAct: Synergizing Reasoning and Acting in Language Models"
[2]: https://voyager.minedojo.org/?utm_source=chatgpt.com "Voyager | An Open-Ended Embodied Agent with Large ..."
[3]: https://research.google/blog/react-synergizing-reasoning-and-acting-in-language-models/?utm_source=chatgpt.com "ReAct: Synergizing Reasoning and Acting in Language ..."
[4]: https://www.promptingguide.ai/techniques/react?utm_source=chatgpt.com "ReAct Prompting"
[5]: https://arxiv.org/abs/2303.11366?utm_source=chatgpt.com "Reflexion: Language Agents with Verbal Reinforcement Learning"
[6]: https://openreview.net/forum?id=vAElhFcKW6&utm_source=chatgpt.com "Reflexion: language agents with verbal reinforcement ..."
[7]: https://www.geeksforgeeks.org/artificial-intelligence/hierarchical-task-network-htn-planning-in-ai/?utm_source=chatgpt.com "Hierarchical Task Network (HTN) Planning in AI"
[8]: https://citeseerx.ist.psu.edu/document?doi=0c35d00a015c93bac68475e8e1283b02701ff46b&repid=rep1&type=pdf&utm_source=chatgpt.com "Applying Goal-Oriented Action Planning to Games"
[9]: https://www.ai.rug.nl/gwenniger/Finished_Projects/GOAP-Report.pdf?utm_source=chatgpt.com "Goal Oriented Action Planning"
[10]: https://arxiv.org/abs/1709.00084?utm_source=chatgpt.com "Behavior Trees in Robotics and AI: An Introduction"
[11]: https://www.sciencedirect.com/science/article/pii/S0921889022000513?utm_source=chatgpt.com "A survey of Behavior Trees in robotics and AI"
[12]: https://www.researchgate.net/publication/312869797_Behavior_Trees_for_Computer_Games?utm_source=chatgpt.com "(PDF) Behavior Trees for Computer Games"
[13]: https://arxiv.org/abs/2305.16291?utm_source=chatgpt.com "Voyager: An Open-Ended Embodied Agent with Large Language Models"
[14]: https://proceedings.neurips.cc/paper_files/paper/2022/hash/74a67268c5cc5910f64938cac4526a90-Abstract-Datasets_and_Benchmarks.html?utm_source=chatgpt.com "MineDojo: Building Open-Ended Embodied Agents with ..."
[15]: https://minedojo.org/?utm_source=chatgpt.com "MineDojo | Building Open-Ended Embodied Agents with ..."
[16]: https://openreview.net/forum?id=rc8o_j8I8PX&utm_source=chatgpt.com "MineDojo: Building Open-Ended Embodied Agents with ..."

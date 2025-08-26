Below is a concrete, “change-set” plan to raise the **conscious bot** from “autonomous but generic” to **cohesive, higher-cognition**—while preserving the vivid, in-world realism and user-parsing strengths of the earlier **vibe-coded** bot. I’ve anchored key recommendations in state-of-the-art agent work in Minecraft (Voyager/MineDojo/VPT) and agentic LLM patterns (ReAct/Reflexion), plus game-AI planners (GOAP/BT/HTN) so we’re not reinventing wheels. Citations mark the design rationale.

---

# 1) Unify the cognition loop: ReAct-style “reason ↔ act” over a capability bus

**Problem:** Your modules (Perception, Memory, Goal, Planning, Action) exist, but they aren’t “clicking”—so the LLM produces generic plans (“crafting pickaxe”) and the executor lacks grounded context.

**Change**

* Replace the current “think → plan → maybe act” loop with a **ReAct** loop that interleaves short reasoning traces with concrete tool calls (your “capabilities”) every step:

  * `observe → reason(step) → choose_tool(args) → execute → read feedback/errors → reason(next) → …` ([arXiv][1], [Google Research][2])
* Treat each Minecraft action (query inventory, find nearest oak log, pathfind, craft) as a **tool/capability** on your MCP-style bus; keep tools narrow and composable.
* Make the **Arbiter** the sequencer for this loop; it pulls **Perception** (world state) and **Memory** (episodic + skills) into each LLM step.

**Why:** ReAct consistently improves grounded decision-making by coupling reasoning to real actions and reading results/errors immediately, instead of producing brittle, overlong plans. ([arXiv][1])

---

# 2) Add a *skill library* and automatic curriculum (Voyager pattern)

**Problem:** The conscious bot “knows” goals but doesn’t *accumulate* reusable competence; it forgets how to do things robustly.

**Change**

* Introduce a **Skill Registry**: small, typed programs (“chop\_tree”, “smelt\_iron”, “safe\_bridge”) with signatures and pre/post-conditions. Persist them to disk.
* Add an **automatic curriculum** that proposes frontier goals (progress along tech tree, biomes, structures) and induces new skills from successful trajectories (LLM writes/refactors code using run feedback). ([arXiv][3], [voyager.minedojo.org][4], [GitHub][5])
* During planning, prefer composing **existing skills**; when failing repeatedly, invoke a “skill-synthesis” routine that drafts a new one (with tests) using recent traces.

**Why:** Voyager’s trio—automatic curriculum, growing skill library, and iterative prompt-repair—produced large jumps in capability and transfer. Reusing skills also reduces token budgets for the LLM. ([arXiv][3], [OpenReview][6])

---

# 3) Re-introduce strict **Task Parsing** for user asks (from vibe-coded), but route through goals

**Problem:** The new bot lost the original’s delightful command parsing and creative replies.

**Change**

* Reinstate a **User→Task Parser** (schema-first, with keyword fallbacks) to translate chat into a structured **Task** object, then:

  * Bind it to the cognitive loop as an **externally suggested goal** with a priority and deadline.
  * Feed world context (inventory, position, threats) into the LLM prompt for *creative, situated language* responses (not “generic crafting”).
* Keep the “intrusive thought” input as a separate source of **soft constraints** on planning, distinct from hard tasks.

**Why:** You retain the high-touch UX of the original while harmonizing with autonomy.

---

# 4) Make actions *temporally extended*: “Options/Skills” rather than single ticks

**Problem:** The LLM keeps choosing micro-actions that create thrash.

**Change**

* Adopt **temporal abstraction**: define *options* (initiation set, policy, termination) and use them as your planning atoms; map each option to a skill or BT subtree. ([www-anw.cs.umass.edu][7], [ScienceDirect][8], [msl.cs.uiuc.edu][9])
* In code: `Option { canStart(state): bool, run(context): Async<Result>, shouldStop(state): bool }`.
* Expose options to the LLM as callable tools with clear contracts (preconditions/success).

**Why:** Options (a.k.a. macro-actions) stabilize long-horizon control; planners search fewer, higher-quality branches. ([www-anw.cs.umass.edu][7])

---

# 5) Hybrid planner: GOAP/HTN for intent; Behavior Trees for execution

**Problem:** Pure LLM planning drifts; pure BT/GOAP can feel mechanical.

**Change**

* **Top level:** a small **GOAP/HTN** to pick chains of options that satisfy needs (hunger, safety, tech progress). Goals are symbolic; LLM can propose/repair subplans when the symbolic planner fails. ([gamedevs.org][10], [Game Developer][11], [GDC Vault][12])
* **Low level:** **Behavior Trees** (BTs) to orchestrate robust execution with selectors, retries, timeouts, and condition checks; BT nodes call the concrete Mineflayer actions. ([ScienceDirect][13], [ResearchGate][14])

**Why:** This is the dominant pattern in shipped games: symbolic intent with reactive, testable executors. F.E.A.R./Halo leveraged GOAP/BT-style hybrids for believable behaviors. ([gamedevs.org][10], [Game Developer][15])

---

# 6) Memory that actually helps: episodic + semantic + *reflective buffer*

**Problem:** You have memory modules, but they don’t clearly alter behavior or boost creativity.

**Change**

* **Episodic**: store (state, intent, actions, outcome, errors, screenshots) as short JSON traces; index by world coords/time.
* **Semantic**: compress durable facts (“Village at x,z”, “zombie spawns dense in ravine”) with decay schedules.
* **Reflective buffer (Reflexion)**: after failures/successes, have the LLM write “what to change next time” in plain text + structured hints (guardrails, early checks). Reference these in the next attempt. ([arXiv][16], [OpenReview][17])

**Why:** Reflexion shows large gains by *verbal self-feedback* without model fine-tuning; Minecraft is full of repeatable subproblems that benefit from this. ([arXiv][16])

---

# 7) World-model grounding in prompts (stop the generic prose)

**Problem:** LLM outputs generic because prompts lack concrete, real-time state.

**Change**

* Always inject **grounded context** into the LLM’s system/context section: hunger, health/armor, light level, current biome/time, inventory deltas, nearby entities/blocks, goal stack, open risks.
* Adopt the Voyager iterative prompting: include **execution errors and environment feedback** verbatim in follow-up turns so the model can self-correct quickly. ([arXiv][3])

---

# 8) Bootstrap competence with demonstrations (optional but powerful)

**Problem:** Early-game flailing costs time and makes the bot look “dumb.”

**Change**

* Provide a small library of **behavioral templates** or few-shot traces derived from VPT/MineDojo resources (e.g., wood→stone→iron ladder; safe night shelter). Use them as exemplars in prompts or as initial skills. ([arXiv][18], [OpenAI][19], [OpenAI][20])

**Why:** VPT/MineDojo demonstrate large benefits from human priors for Minecraft action structure. ([arXiv][18])

---

# 9) Module contracts (align with your ports 3000-3005)

**Cognition (3003)**

* **API:** `POST /reason` → {observations, memory\_summaries, goal\_stack} → {thoughts, selected\_tool, args, guardrails}
* **Reads:** Perception(3004), Memory(3001) summaries.
* **Writes:** Reflexion buffer entries; curriculum proposals.

**Planning (3002)**

* **API:** `POST /plan` → {goal} → {HTN/GOAP plan: \[option\_ids]}`; `POST /repair` → {failed_node, trace} → {patched_plan}`
* **Reads:** Skill Registry; Options metadata; World facts.

**World/Perception (3004)**

* **API:** `GET /snapshot` → {pos, biome, time, light, entities, blocks, hazards}`; `GET /inventory` → {...}`

**Bot/Executor (3005)**

* **API:** `POST /run-option` (option\_id, args) → streamed BT ticks with telemetry; supports cancel/retry/timeouts.

**Memory (3001)**

* **API:** `POST /episodic`, `GET /recall?query=...`, `POST /semantic`, `GET /mapfacts`
* Store **episodes**, **semantic facts**, **reflective notes**; retrieve nearest neighbors to the current state.

**Dashboard (3000)**

* Real-time ReAct trace, BT tick tree, goal/plan stack, skill calls, and replay scrubber with screenshots (you proposed this already).

---

# 10) Data schemas (make the system composable & testable)

**Task (user-facing)**

```json
{
  "id": "task_173",
  "intent": "craft_tool",
  "target": {"item": "stone_pickaxe", "qty": 1},
  "constraints": {"safemode": true, "max_distance": 200},
  "deadline": "soon",
  "priority": 0.7,
  "notes": "user-initiated"
}
```

**Goal (internal)**

```json
{"type":"progress_tech","milestone":"iron_tools","source":"task|drive|curriculum","utility":0.83}
```

**Option/Skill (temporal action)**

```json
{
  "id":"opt.chop_tree_safe",
  "pre": ["has_tool:axe>=wood","daylight_or_torch"],
  "post": ["inventory.log>=N"],
  "run_args": {"tree":"oak","N":8},
  "safety": {"abort_on:hostiles_within":10}
}
```

**Reflective note**

```json
{"situation":"night_mining","failure":"zombie swarm",
 "lesson":"prioritize_torching corridor; set retreat waypoint every 30m",
 "guardrail":{"pre":"lightlevel>=8","if_hostiles":"retreat_and_block"}}
```

---

# 11) Execution discipline: Behavior Tree nodes at the edges

* Implement BT **leaf** nodes that do singular Mineflayer calls (dig, place, craft, pathfind step) with timeouts and retry policies.
* Wrap them into **subtrees** that correspond to options/skills. This isolates flaky world calls from the cognitive center and gives you replayable traces for debugging. ([ScienceDirect][13])

---

# 12) Creativity without chaos

* Two-channel prompts:

  * **“Operational”** channel (low temp, schema-bound) for choosing tools/args.
  * **“Expressive”** channel (higher temp, style exemplars) for in-chat narration to the player, always grounded by the shared world snapshot.
* Keep the vibe-coded **style exemplars** (humor, self-talk) but *condition them* on world state so “color” never contradicts reality.

---

# 13) Evaluation harness (so we can prove it’s smarter)

* Borrow **MineDojo tasks** (e.g., “craft iron pickaxe”, “visit desert temple”) as a nightly eval battery. Log success rate, steps, damage taken, deaths, items collected. ([MineDojo][21], [NeurIPS Papers][22])
* Track **ReAct loop** stats: average steps per tool call, fraction of repaired attempts (Reflexion), and **skill reuse rate** (from the library).
* Add **UX realism** metrics: % of messages that reference current context (inventory/biome/time), lexical variety (type-token ratio), and contradiction checks (no impossible claims).

---

# 14) Optional accelerants

* Seed starting competence with a handful of curated **VPT-style demonstrations** to reduce early flailing (as static few-shot traces or as skills). ([arXiv][18], [OpenAI][19])
* If you later want learning beyond language reflection, explore **hierarchical RL** over options (MAXQ/options frameworks) to auto-tune option policies, but keep it offline initially. ([www-anw.cs.umass.edu][7])

---

## What you’ll get after these changes

* **Cohesion:** ReAct loop + hybrid GOAP/HTN intent + BT execution means every thought can become an action and every action informs the next thought. ([arXiv][1], [Game Developer][11], [ScienceDirect][13])
* **Competence that compounds:** Voyager-style skill library and curriculum let you *keep* what you learn and transfer it to new worlds. ([arXiv][3])
* **Better vibes, grounded:** Restored task parsing and rich world-state prompts reintroduce the original’s lively, place-aware chat—but without losing autonomy.
* **Provable progress:** A MineDojo-style eval harness gives hard signals your team and stakeholders can trust. ([MineDojo][21])

These are translated from this into a set of **working specs** (by module), including acceptance checks (telemetry, a11y of the dashboard, perf targets), plus a handful of “first ten skills” to seed the library (e.g., safe shelter, food pipeline, ore ladder, nether prep).

[1]: https://arxiv.org/abs/2210.03629?utm_source=chatgpt.com "ReAct: Synergizing Reasoning and Acting in Language Models"
[2]: https://research.google/blog/react-synergizing-reasoning-and-acting-in-language-models/?utm_source=chatgpt.com "ReAct: Synergizing Reasoning and Acting in Language ..."
[3]: https://arxiv.org/abs/2305.16291?utm_source=chatgpt.com "Voyager: An Open-Ended Embodied Agent with Large Language Models"
[4]: https://voyager.minedojo.org/?utm_source=chatgpt.com "Voyager | An Open-Ended Embodied Agent with Large ..."
[5]: https://github.com/MineDojo/Voyager?utm_source=chatgpt.com "MineDojo/Voyager: An Open-Ended Embodied Agent with ..."
[6]: https://openreview.net/forum?id=ehfRiF0R3a&utm_source=chatgpt.com "Voyager: An Open-Ended Embodied Agent with Large ..."
[7]: https://www-anw.cs.umass.edu/~barto/courses/cs687/Sutton-Precup-Singh-AIJ99.pdf?utm_source=chatgpt.com "A framework for temporal abstraction in reinforcement ..."
[8]: https://www.sciencedirect.com/science/article/pii/S0004370299000521?utm_source=chatgpt.com "A framework for temporal abstraction in reinforcement ..."
[9]: https://msl.cs.uiuc.edu/~lavalle/cs497/papers/sutton.pdf?utm_source=chatgpt.com "A Framework for Temporal Abstraction in Reinforcement ..."
[10]: https://www.gamedevs.org/uploads/three-states-plan-ai-of-fear.pdf?utm_source=chatgpt.com "Three States and a Plan: The A.I. of F.E.A.R."
[11]: https://www.gamedeveloper.com/design/building-the-ai-of-f-e-a-r-with-goal-oriented-action-planning?utm_source=chatgpt.com "Building the AI of F.E.A.R. with Goal Oriented Action Planning"
[12]: https://gdcvault.com/play/1022019/Goal-Oriented-Action-Planning-Ten?utm_source=chatgpt.com "Goal-Oriented Action Planning: Ten Years Old and No Fear!"
[13]: https://www.sciencedirect.com/science/article/pii/S0921889022000513?utm_source=chatgpt.com "A survey of Behavior Trees in robotics and AI"
[14]: https://www.researchgate.net/publication/312869797_Behavior_Trees_for_Computer_Games?utm_source=chatgpt.com "(PDF) Behavior Trees for Computer Games"
[15]: https://www.gamedeveloper.com/programming/gdc-2005-proceeding-handling-complexity-in-the-i-halo-2-i-ai?utm_source=chatgpt.com "GDC 2005 Proceeding: Handling Complexity in the Halo 2 AI"
[16]: https://arxiv.org/abs/2303.11366?utm_source=chatgpt.com "Reflexion: Language Agents with Verbal Reinforcement Learning"
[17]: https://openreview.net/forum?id=vAElhFcKW6&utm_source=chatgpt.com "Reflexion: language agents with verbal reinforcement ..."
[18]: https://arxiv.org/abs/2206.11795?utm_source=chatgpt.com "Video PreTraining (VPT): Learning to Act by Watching Unlabeled Online Videos"
[19]: https://cdn.openai.com/vpt/Paper.pdf?utm_source=chatgpt.com "Video PreTraining (VPT): Learning to Act by Watching Unlabeled Online Videos"
[20]: https://openai.com/index/vpt/?utm_source=chatgpt.com "Learning to play Minecraft with Video PreTraining"
[21]: https://minedojo.org/?utm_source=chatgpt.com "MineDojo | Building Open-Ended Embodied Agents with ..."
[22]: https://papers.nips.cc/paper_files/paper/2022/file/74a67268c5cc5910f64938cac4526a90-Paper-Datasets_and_Benchmarks.pdf?utm_source=chatgpt.com "MINEDOJO: Building Open-Ended Embodied Agents with ..."

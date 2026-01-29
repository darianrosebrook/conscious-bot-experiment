# Sterling Minecraft Domains

## Overview

Sterling is an external Python service that provides A* graph search with path-algebra learning. The bot connects via WebSocket (`ws://localhost:8766`) and delegates discrete planning problems as domain solves. Sterling is optional — all planning paths degrade gracefully when it's unavailable.

This document catalogs the Minecraft problem domains that benefit from Sterling's graph search, their integration points with the planning system, and the implementation status of each.

## Architecture

```
EnhancedTaskIntegration                Sterling (Python, external)
  generateDynamicSteps()               +---------------------------+
        |                              | ws://localhost:8766       |
        v                              |                           |
  MinecraftCraftingSolver              | Domain handler receives:  |
   .solveCraftingGoal()  --- WS -----> |   rules[], state, goal   |
        |                              | Returns:                  |
        v                              |   discover, search_edge,  |
  TaskStep[] with leaf annotations     |   solution_path, complete |
        |                              +---------------------------+
        v
  BT / Leaf execution
```

**Key design principle:** Sterling does not contain Minecraft knowledge. The bot builds domain-specific rules at solve time from Mineflayer's `mcData` and world state, sends them to Sterling, and maps the solution path back to executable `TaskStep[]`. This means any Minecraft version or modded recipe set works without Sterling changes.

## Integration Points

Each domain connects to the planning system at these points:

| Component | Role |
|-----------|------|
| `SterlingClient` (`packages/core`) | WebSocket connection, circuit breaker, reconnection |
| `SterlingReasoningService` (`packages/planning/src/sterling/`) | Planning-level wrapper, `solve()` method |
| `MinecraftCraftingSolver` (`packages/planning/src/sterling/`) | Domain-specific solver, rule builder, TaskStep mapper |
| `EnhancedTaskIntegration` (`packages/planning/src/task-integration.ts`) | Injects Sterling before cognitive fallback in `generateDynamicSteps()` |
| `HybridSkillPlanner` (`packages/planning/src/skill-integration/`) | Optional `'sterling-verified'` planning approach |
| `modular-server.ts` | Startup wiring, health endpoint, direct solve endpoint |

## Domain Catalog

### Tier 1: Direct Graph Search (Discrete States, Deterministic Transitions)

These have small-to-medium state spaces with clear goal conditions. Sterling's A* finds optimal solutions and path algebra learns shortcuts over episodes.

---

### 1. Crafting (Implemented)

**Status:** Implemented in Phase 4.

**Problem:** Given current inventory, find the action sequence that produces a target item.

**Graph:**
- **Node:** Inventory state hash (sorted `"item:count"` pairs, e.g. `"oak_log:2|oak_planks:4"`)
- **Edge:** Crafting rule application (craft, mine, smelt, place)
- **Start:** Current inventory
- **Goal:** Target item present in inventory
- **Cost:** `baseCost` per rule — mine=5.0, craft=1.0, smelt=3.0, place=1.5

**Rule Source:** `buildCraftingRules(mcData, goalItem)` traces the recipe tree from `mcData.recipes` recursively, adding mine rules for raw materials with no recipe.

**Files:**
- `packages/planning/src/sterling/minecraft-crafting-types.ts` — type definitions
- `packages/planning/src/sterling/minecraft-crafting-rules.ts` — rule builder from mcData
- `packages/planning/src/sterling/minecraft-crafting-solver.ts` — solver orchestration + TaskStep mapping

**Example solve:** Wooden pickaxe from empty inventory:
```
{} -> mine:oak_log x3 -> craft:oak_planks x2 -> craft:stick -> craft:crafting_table
   -> place:crafting_table -> craft:wooden_pickaxe
```

**Learning benefit:** Over episodes, Sterling learns that the oak_log -> planks -> sticks -> table -> pickaxe chain is optimal and stops exploring alternatives like birch_log paths when oak is available.

---

### 2. Tool Progression

**Status:** Not yet implemented.

**Problem:** Advance through material tiers (wood -> stone -> iron -> diamond). Each tier gates mining of harder blocks.

**Graph:**
- **Node:** Capability set — which tools/tiers are unlocked. Hash of `"has_wooden_pickaxe|can_mine_stone|has_stone_pickaxe"`
- **Edge:** Upgrade action — craft a higher-tier tool, mine a new material
- **Start:** Current capabilities (derived from inventory scan)
- **Goal:** Target capability present (e.g. `"has_iron_pickaxe"`)
- **Cost:** Composite of crafting cost + gathering cost for prerequisites

**Rule Source:** Static tier definitions + crafting rules from mcData. The tier gates are:
- `wooden_pickaxe` -> mine stone, coal_ore
- `stone_pickaxe` -> mine iron_ore, lapis_ore, gold_ore
- `iron_pickaxe` -> mine diamond_ore, redstone_ore, emerald_ore
- `diamond_pickaxe` -> mine obsidian

**Integration point:** `generateDynamicSteps()` for tasks with type `crafting` whose title contains tier keywords (pickaxe, upgrade, tools). The solver would chain into the crafting solver for sub-goals (e.g., "to get stone_pickaxe, first craft wooden_pickaxe").

**Learning benefit:** Learns the fastest upgrade path given the world's resource distribution. If stone is always 2 blocks underground, skipping extra wood gathering and rushing to stone pickaxe is optimal.

---

### 3. Smelting Chains

**Status:** Not yet implemented.

**Problem:** Produce smelted outputs (iron ingots, cooked food, glass, bricks) from raw materials + fuel + furnace.

**Graph:**
- **Node:** Inventory state (same encoding as crafting)
- **Edge:** Acquire fuel, place furnace, load input + fuel, retrieve output
- **Start:** Current inventory
- **Goal:** Target smelted item in inventory
- **Cost:** Time-weighted — smelting takes 10s per item, fuel acquisition varies

**Rule Source:** mcData smelting recipes + fuel burn-time data. Rules include fuel options (coal=8 items, charcoal=8, wood_planks=1.5, blaze_rod=12) with cost proportional to acquisition difficulty.

**Key difference from crafting:** Smelting is time-dependent. The solver needs to account for furnace loading (input + fuel) as a compound action, and the output retrieval as a separate step.

**Learning benefit:** Learns optimal fuel choice per world. If coal is abundant near the bot's base, it's preferred. If the bot is in a forest biome with no caves, charcoal (log -> planks -> charcoal) is learned as the best fuel path.

---

### 4. Resource Acquisition

**Status:** Not yet implemented.

**Problem:** Acquire N units of a resource using the cheapest available method.

**Graph:**
- **Node:** Resource count state — `"iron_ingot:3|coal:5"`
- **Edge:** Acquisition method (mine directly, trade, loot chest, craft from alternatives, smelt)
- **Start:** Current resource counts
- **Goal:** Target counts met
- **Cost:** Estimated time + risk per method

**Rule Source:** Dynamic at solve time — combines mining availability (from nearby blocks), known villager trades (from world state), known chest locations, and crafting alternatives.

**Integration point:** `resolveRequirement()` in task-integration.ts already resolves tasks to `{kind: 'collect'|'mine', patterns, quantity}`. The solver would handle these when Sterling is available, trying multiple acquisition strategies.

**Learning benefit:** Learns which acquisition strategies succeed most often in the bot's specific world. Discovers alternatives (e.g., looting a mineshaft chest for iron instead of mining) after repeated mining failures.

---

### 5. Macro Navigation

**Status:** Not yet implemented.

**Problem:** Choose a high-level route from current location to a distant target. Block-level pathfinding is handled by Mineflayer's A*; this is for strategic route selection (which biome to cross, which valley to follow).

**Graph:**
- **Node:** Waypoint/landmark — `"wp_{x}_{z}"` or `"biome_{name}_{x}_{z}"`
- **Edge:** Travel between adjacent known waypoints
- **Start:** Nearest waypoint to bot position
- **Goal:** Nearest waypoint to target
- **Cost:** Travel time (distance) + terrain penalty + danger penalty

**Rule Source:** Bot's explored world knowledge. `WorldKnowledgeIntegrator` already tracks known locations and terrain. Rules are generated from the known waypoint graph at solve time.

**Learning benefit:** Learns that certain routes are reliably safe. A path through a ravine is short but the bot dies often; Sterling penalizes that edge. A longer path along a river is safer; Sterling promotes it via `w_usage` reinforcement.

---

### Tier 2: Larger State Spaces (Good Fit, More Computation)

These have larger branching factors but still benefit from Sterling's adaptive search.

---

### 6. Farm Layout

**Problem:** Design an efficient crop farm layout given available space.

**Graph:**
- **Node:** Partial farm layout (placed blocks hash)
- **Edge:** Place water / till soil / plant crop at position
- **Goal:** All target positions planted and irrigated
- **Cost:** Action count + water coverage efficiency

**Key constraint:** Water hydrates farmland within 4 blocks (Manhattan distance). One water source irrigates a 9x9 area. Rules encode this spatial constraint.

**Learning benefit:** The standard 9x9 farm with center water emerges as optimal. Sterling discovers this layout is better than alternatives (edge farms, scattered water).

---

### 7. Inventory Management

**Problem:** When inventory is full and a valuable item is found, decide what to swap/store/discard.

**Graph:**
- **Node:** Inventory slot assignments
- **Edge:** Swap item, store in nearby chest, discard
- **Goal:** Target item in inventory with minimum value lost
- **Cost:** Value of discarded/stored items (context-dependent based on active goals)

**Learning benefit:** Learns item valuation. Logs are always useful (keep), gravel is low-value (discard), tools are high-value (keep). The valuation adapts to the bot's current goals.

---

### 8. Shelter Construction

**Problem:** Build a shelter by placing blocks in a valid, efficient order.

**Graph:**
- **Node:** Partial structure (set of placed blocks)
- **Edge:** Place block at (x, y, z) with type
- **Goal:** All target blocks placed
- **Cost:** Repositioning time + physical constraints

**Key constraint:** Blocks need support. Roof blocks need wall blocks below them. Rules encode physics as preconditions on each placement action.

**Learning benefit:** Learns that foundation-first build orders minimize bot repositioning. Avoids sequences that require temporary scaffolding.

---

### 9. Redstone Circuit Design

**Problem:** Place redstone components to achieve target behavior (automatic door, item sorter, mob trap).

**Graph:**
- **Node:** Partial circuit (placed components + signal propagation state)
- **Edge:** Place component (wire, torch, repeater, comparator, piston, observer)
- **Goal:** Target input/output behavior
- **Cost:** Component count + complexity

**Learning benefit:** Learns working circuit patterns. Redstone behavior is deterministic but non-obvious (signal strength decay, tick delays, quasi-connectivity). Sterling remembers which configurations work.

---

### Tier 3: Sequential Decision Problems (Planning Phase Benefits)

Sterling helps with pre-computing plans; execution adapts at runtime.

---

### 10. Combat Encounter

**Problem:** Choose optimal tactical response when hostiles are detected.

**Graph:**
- **Node:** Combat state — health, weapon, mob types, terrain
- **Edge:** Tactical action (attack, retreat, block entrance, eat, equip, use bow)
- **Goal:** All threats resolved or bot at safe position
- **Cost:** Health risk + time

**Rule source:** Generated from `SenseHostilesLeaf` output. Rules encode mob-specific tactics (skeletons need cover, creepers need distance, zombies can be funneled into 1-wide corridor).

**Learning benefit:** Discovers that retreating to a narrow space neutralizes groups. Learns to eat before fighting (health buffer).

---

### 11. Exploration Strategy

**Problem:** Choose which direction to explore next for maximum discovery.

**Graph:**
- **Node:** Map region (chunk-level)
- **Edge:** Explore toward adjacent unexplored region
- **Goal:** Discovery target (biome, structure, N new chunks)
- **Cost:** Travel time + expected danger

**Learning benefit:** `w_novelty` naturally drives toward unexplored regions. Learns that following rivers finds biome boundaries faster than random walking.

---

### 12. Task Scheduling

**Problem:** Given multiple pending tasks with dependencies, choose the optimal work order.

**Graph:**
- **Node:** Task portfolio state (which tasks completed/pending)
- **Edge:** Work on task X
- **Goal:** All tasks completed
- **Cost:** Estimated time + dependency wait

**Integration point:** This connects to `EnhancedTaskIntegration.getActiveTasks()` and the goal manager. Sterling solves the scheduling problem, and the result becomes the task execution order.

**Learning benefit:** Learns that gathering wood first unblocks the most downstream tasks. Learns to batch resource collection rather than context-switching.

---

### 13. Emergency Response

**Problem:** When multiple emergencies coincide, sequence responses optimally.

**Graph:**
- **Node:** Emergency state (active threats + available resources)
- **Edge:** Emergency action (eat, retreat, place torch, surface, equip armor)
- **Goal:** All threats resolved
- **Cost:** Health risk during action + time

**Integration point:** Connects to the emergency actions in `goap-planner.ts` (emergency_eat, emergency_retreat, emergency_light, emergency_surface) and the homeostasis signals.

**Learning benefit:** Learns that eating THEN retreating is better than the reverse (health buffer reduces damage during retreat). Pre-computes response plans for common emergency combinations.

---

## Extended Representational Patterns

Tiers 1-3 above all assume known-state, goal-directed planning: the world is a mostly deterministic transition system, and Sterling does cheapest-path search with learning shaping edge ordering. To get broader Minecraft coverage, the state-graph framing can be widened to encode richer kinds of "A becomes B" — belief/unknowns, stochastic hazards, ongoing maintenance, multi-agent economics, and abstraction jumps. Each pattern below still reduces to: a node is a typed, hash-stable snapshot; an edge is a typed operator; learning prioritizes which edges to try first but does not invent transitions.

---

### Pattern 1: Epistemic Planning (Belief-State Graphs)

**Problem:** Locate a structure or resource when the bot doesn't know where it is. Nodes encode what the bot *believes*, not what *is*. Edges are information-gathering probes.

**Graph:**
- **Node:** Belief state — explored regions, sighting evidence (blaze particles, nether brick counts), structure likelihood per chunk, time since last probe
- **Edge:** Probe action — move to vantage point, scan horizon, sample mob mix in biome, follow terrain features
- **Start:** Prior belief (uniform uncertainty or seeded from world knowledge)
- **Goal:** Confidence above threshold (`P(target_located) > 0.9`)
- **Cost:** Probe time + risk

**Integration point:** Connects to `SenseHostilesLeaf` (mob sampling), `WorldKnowledgeIntegrator` (explored regions), and exploration BTs (biome probing). The solver builds rules from the bot's current belief state and available probe actions.

**Goal condition difference:** Not a subset check — it's a threshold on the belief state's confidence field. The domain handler evaluates `max(confidence[target]) >= threshold`.

**Learning benefit:** Which probes produce the most information per unit risk/time, conditioned on biome and gear. Sterling learns that sampling mob mix in basalt deltas is high-information for fortress location, while random nether wandering is low-information.

---

### Pattern 2: Risk-Aware Planning (Cost Distributions)

**Problem:** Accomplish a goal under a risk budget. Each action carries not just a time cost but a probability of death or gear loss.

**Graph:**
- **Node:** State + risk budget remaining — gear loadout, food/potion supply, known danger zones, time-of-day
- **Edge:** Action with outcome distribution — `{ expected_time, p_death, p_gear_loss }`
- **Start:** Current state
- **Goal:** Resource target met AND cumulative `P(death) < ε`
- **Cost:** `expected_time + λ * risk_penalty` where λ scales with gear value at stake

**Integration point:** The risk model is populated from the bot's death history (stored in memory system) and the homeostasis monitor's threat signals. The λ parameter comes from the bot's current gear value (diamond tools = high λ, expendable loadout = low λ).

**Concrete example:** Obsidian acquisition. Mine at lava pool X (fast but 8% death risk) vs. barter for fire resistance first (slower but 1% death risk) vs. build temporary shelter around pool (slowest but 0% death risk). Sterling's path algebra learns which option to prefer based on gear value and episode outcomes.

**Learning benefit:** Route and tactic priors that reduce tail risk, not only mean time. After dying at a particular lava pool, Sterling heavily penalizes that edge via dead-end detection.

---

### Pattern 3: Invariant Maintenance (Non-Terminal Goals)

**Problem:** Keep a set of constraints true over time rather than reaching a goal once. Base defense, food buffer, tool durability, light coverage — all drift and need periodic restoration.

**Graph:**
- **Node:** Invariant health vector — which invariants are satisfied, which are drifting. Plus available materials and current time
- **Edge:** Maintenance action — place torches in unlit areas, repair wall gaps, craft replacement tools, cook food
- **Start:** Current snapshot with some invariants violated
- **Goal:** All invariants restored (light_coverage >= 0.95, wall_gaps == 0, food_buffer >= 6, etc.)
- **Cost:** Materials + time + priority weight

**Integration point:** Connects to homeostasis monitor signals (safety, hunger, energy) and the `WorldStateManager` for base state tracking. The solver re-runs periodically as invariants drift, producing a repair schedule rather than a one-time plan.

**Learning benefit:** Which repairs prevent repeat incidents. Sterling learns causal structure — that lighting the north wall prevents zombie spawns near the bed, while the south wall gap is low-priority because it faces a cliff. This is genuinely hard to pre-program but emerges naturally from episode-level learning.

---

### Pattern 4: Network Design (Infrastructure Optimization)

**Problem:** Design or optimize item transport, rail networks, or storage systems for throughput and reliability.

**Graph:**
- **Node:** Infrastructure topology — farm positions, transport edges (hopper lines, water streams), storage nodes, chunk boundaries
- **Edge:** Infrastructure modification — add buffer chest, reroute hopper line, add water elevator, split streams
- **Start:** Current layout
- **Goal:** Throughput target met with reliability constraint (no jams, no item loss)
- **Cost:** Build cost (materials + time) + ongoing maintenance

**Integration point:** Connects to container leaves (`OpenContainerLeaf`, `TransferItemsLeaf`) and block placement leaves. The infrastructure state is tracked in world knowledge.

**Learning benefit:** Patterns that avoid jams and minimize build cost under chunk-loading realities. Sterling learns that hopper chains crossing chunk boundaries need buffering, and water streams are cheaper for long distances.

---

### Pattern 5: Economy / Negotiation (Multi-Agent State)

**Problem:** Interact with villagers (or in multiplayer, other players) to secure trades, enchantments, or resources. Actions are social/economic; state includes reputations, trade tiers, and irreversible constraints.

**Graph:**
- **Node:** Villager roster — `(profession, level, locked_trades, curing_status, workstation_pos)` per villager + economy state (iron supply, emeralds, hero-of-village status)
- **Edge:** Economic action — assign workstation, break workstation (reroll), cure zombie villager, trade to level up, breed villagers
- **Start:** Current village state
- **Goal:** Target trade available (e.g. Mending enchantment at acceptable price)
- **Cost:** Resources + time + risk of losing existing good trades

**Critical constraint:** Trade locking is irreversible — once a villager levels up, current trades are permanent. Rules must encode this as a precondition guard. This makes the search non-trivially ordered: reroll before leveling, cure before trading.

**Integration point:** Connects to world knowledge (villager tracking) and interaction leaves. The rule set encodes current villager state and all possible actions at solve time.

**Learning benefit:** Which sequences reliably produce the target trade with minimal collateral damage. Sterling learns that curing zombie villagers before leveling is cheaper than brute-force rerolling. Learns to confirm the desired enchantment at level 1 before trading to level 2.

---

### Pattern 6: Capability Composition (Typed Capability Algebra)

**Problem:** Assemble a capability loadout sufficient for a complex task (ocean monument raid, nether fortress clearing, end dragon fight). Capabilities compose non-linearly — water breathing alone is insufficient for a monument; you need depth strider + respiration + damage output + food buffer.

**Graph:**
- **Node:** Capability set — enchantments, potions, infrastructure (conduit), gear status, food/health buffers
- **Edge:** Capability acquisition — brew potion, enchant item, build conduit, acquire trident, craft specialized gear
- **Start:** Current capabilities
- **Goal:** Capability conjunction met (e.g. `{water_breathing, depth_strider, respiration, min_damage >= 7, food >= 20}`)
- **Cost:** Acquisition time + prerequisites

**Integration point:** Extends tool progression. Connects to crafting solver (gear crafting), smelting (ingots for armor), and the enchanting/brewing systems. The capability set is derived from inventory analysis at solve time.

**Learning benefit:** Discovers minimal viable loadouts — the smallest capability set that works consistently. These become reusable macro-operators: "monument prep" compiles to a specific acquire-and-equip sequence that Sterling has learned is reliable.

---

### Pattern 7: Program Synthesis for Building (Plan-Level Search)

**Problem:** For large builds (farms, shelters, redstone), searching over individual block placements explodes. Instead, search over parameterized templates and compile to blocks post-solve.

**Graph:**
- **Node:** Partially specified build program — list of modules (foundation, walls, roof, lighting pass) + parameter bindings (dimensions, materials, door orientation) + terrain constraints
- **Edge:** Program refinement — add module, set parameter, add safety pass, substitute material, compile
- **Start:** Empty program + site constraints
- **Goal:** Program compiles to valid block list satisfying requirements (enclosed, lit, has bed, has door)
- **Cost:** Material cost + build time + complexity penalty

**Integration point:** Connects to `BuildStructureLeaf`, `PlaceBlockLeaf`, and shelter construction BTs. The template library is defined in the planning system; Sterling searches over template combinations.

**Learning benefit:** Template selection and parameter priors. Sterling learns "5x5 cobble box with slab roof" is the cheapest viable shelter, and that "9x9 with interior lighting" is worth the extra cost for long-term bases. Orders of magnitude smaller search space than block-level.

---

### Pattern 8: Fault Diagnosis (Hypothesis Graphs)

**Problem:** Debug a failing redstone circuit or farm. State is "hypothesis about why it fails + test evidence." Edges are diagnostic actions.

**Graph:**
- **Node:** Diagnosis state — circuit schematic, observed symptoms, candidate fault set, test results so far
- **Edge:** Diagnostic action — run test input, instrument with observers, isolate module, swap component, re-test
- **Start:** Symptom observation + full candidate fault set
- **Goal:** Single fault confirmed + repair applied + re-test passes
- **Cost:** Test time + materials + risk of making it worse

**Integration point:** Connects to `ControlRedstoneLeaf`, `InteractWithBlockLeaf`, and the world state for circuit observation. Rules encode the diagnostic decision tree at solve time.

**Learning benefit:** Which tests disambiguate fastest. Sterling learns that isolating modules is more informative than re-running inputs, and that comparator mode faults have a distinctive symptom pattern.

---

### Pattern 9: Exogenous Event Response (Contingent Policies)

**Problem:** Plan around world events the bot doesn't choose — nightfall, rain, creeper spawn, hunger tick, raid trigger. Model these as forced transition edges and plan contingently.

**Graph:**
- **Node:** Situation context — current task + time-to-event + exposure level + gear/food + threat potential
- **Edge (chosen):** Bot action — shelter-up, return-to-base, switch-to-underground, continue task
- **Edge (exogenous):** World event — nightfall (time >= 13000), rain_start, hostile_spawn, hunger_tick. Forced transitions with known trigger conditions
- **Start:** Current situation
- **Goal:** Safe continuation through the event with minimal task disruption
- **Cost:** Task disruption + safety risk

**Integration point:** Connects to the homeostasis monitor (time-of-day, threat signals), emergency actions in `goap-planner.ts`, and the task scheduler. The event timeline is estimated from current game tick.

**Learning benefit:** Robust contingency structures that minimize disruption. Sterling learns the time threshold at which returning to base is worth the lost mining time, conditioned on gear quality and distance. After deaths from staying out too late, the "early return" edge gets reinforced.

---

## Summary Table

### Tier 1-3: Known-State, Goal-Directed Planning

| Domain | Nodes | Edges | Goal | Learning Target | Status |
|--------|-------|-------|------|-----------------|--------|
| Crafting | Inventory hash | Craft/mine/smelt/place | Target item | Optimal craft chains | **Implemented** |
| Tool Progression | Capability set | Upgrade actions | Target tier | Fastest upgrade paths | Planned |
| Smelting Chains | Inventory hash | Acquire/smelt/retrieve | Smelted output | Optimal fuel choice | Planned |
| Macro Navigation | Waypoints | Travel between | Destination | Safe/fast routes | Planned |
| Resource Acquisition | Resource counts | Acquire methods | Target counts | Best strategy | Planned |
| Farm Layout | Partial layout | Place water/till/plant | Farm complete | High-yield patterns | Planned |
| Inventory Mgmt | Slot assignments | Swap/store/discard | Min value lost | Item valuation | Planned |
| Shelter Construction | Partial structure | Place block | Structure done | Efficient build orders | Planned |
| Redstone Circuits | Partial circuit | Place component | Target behavior | Working patterns | Planned |
| Combat Encounter | Combat state | Tactical actions | Threats resolved | Per-mob tactics | Planned |
| Exploration | Map regions | Explore direction | Discovery met | High-yield directions | Planned |
| Task Scheduling | Task portfolio | Work on task | All done | Optimal ordering | Planned |
| Emergency Response | Emergency state | Emergency actions | Threats resolved | Fast responses | Planned |

### Extended Patterns: Wider Representational Vocabulary

| # | Pattern | Node Type | Edge Type | Goal Type | Learning Target | Status |
|---|---------|-----------|-----------|-----------|-----------------|--------|
| 1 | Epistemic Planning | Belief map + evidence | Info-gathering probes | Confidence threshold | Best probe per biome/gear | Planned |
| 2 | Risk-Aware Planning | State + risk budget | Actions with outcome distributions | Resource target + P(death) < ε | Tail-risk reduction | Planned |
| 3 | Invariant Maintenance | Invariant health vector | Repair/maintenance actions | All invariants restored | Causal safety structure | Planned |
| 4 | Network Design | Infrastructure topology | Add/reroute components | Throughput target | Jam-free patterns | Planned |
| 5 | Economy / Negotiation | Villager roster + economy | Social/economic actions | Target trade secured | Reliable trade sequences | Planned |
| 6 | Capability Composition | Typed capability set | Acquire-capability actions | Capability conjunction | Minimal viable loadouts | Planned |
| 7 | Program Synthesis | Partial build program | Add module / set params | Valid compiled block list | Template + param priors | Planned |
| 8 | Fault Diagnosis | Hypothesis set + evidence | Diagnostic tests | Fault confirmed + repaired | Fast test sequences | Planned |
| 9 | Exogenous Events | Situation + timeline | Chosen + forced edges | Safe continuation | Disruption-min contingencies | Planned |

## Implementation Priority

The original priority list focused on Tier 1-3 domains that extend the crafting solver incrementally. The extended patterns stress different representational muscles and address qualitatively different planning challenges. Both tracks can proceed in parallel.

### Track A: Deterministic planning extensions (incremental from crafting)

1. **Tool Progression** — extends crafting solver with tier gates; high impact since tool upgrades are the primary early-game bottleneck
2. **Smelting Chains** — similar graph structure; the bot already has `SmeltLeaf`; adds iron/gold/food processing
3. **Resource Acquisition** — generalizes crafting + smelting into a unified "get me X" solver; connects to `resolveRequirement()`

### Track B: Representational widening (new planning capabilities)

1. **Epistemic Planning (Pattern 1)** — the bot already explores and senses mobs; adding belief-state search lets it *plan* what to sense next rather than wandering. High leverage for nether exploration and structure finding.
2. **Villager Economy (Pattern 5)** — multi-agent + long-horizon + irreversible constraints. Qualitatively different from all existing planners. High payoff (Mending, discounted trades) and the bot already has interaction leaves.
3. **Invariant Maintenance (Pattern 3)** — non-terminal goals connect directly to the homeostasis monitor. The bot already tracks safety/hunger/energy signals; Sterling adds principled repair scheduling instead of reactive emergency responses.

### Why these three for Track B

- **Epistemic planning** teaches Sterling to reason about *what it doesn't know* — a capability none of the Tier 1-3 domains exercise. It uses exploration infrastructure the bot already has.
- **Villager economy** teaches Sterling to handle *irreversible actions* and *distributed state* (multiple villagers with independent trade locks). The constraint structure is genuinely novel.
- **Invariant maintenance** teaches Sterling to solve *recurring* problems, not one-shot goals. It connects the homeostasis signal loop to principled planning for the first time.

## Graceful Degradation

When Sterling is unavailable, every domain falls through to existing behavior. Sterling is always additive, never required.

**Tier 1-3 domains:**
- **Crafting:** `generateDynamicSteps()` falls through to cognitive LLM or intelligent fallback steps
- **All other goal-directed domains:** Existing GOAP / HTN / BT planning paths handle the task without Sterling optimization

**Extended patterns:**
- **Epistemic planning:** Falls back to the existing exploration BTs (biome_probe, random walk). Less efficient but functional.
- **Risk-aware planning:** Falls back to GOAP with fixed costs (no risk modeling). The emergency response system catches failures reactively.
- **Invariant maintenance:** Falls back to homeostasis signal-driven emergency actions. Repairs happen reactively rather than proactively.
- **Economy / negotiation:** Falls back to manual task steps generated by the cognitive system. No optimization of trade sequences.
- **Capability composition:** Falls back to sequential crafting tasks generated by the LLM or intelligent step fallback.
- **Program synthesis:** Falls back to BT shelter definitions (predefined templates without parameterized search).
- **Fault diagnosis:** Falls back to manual debugging (no systematic test ordering).
- **Exogenous events:** Falls back to GOAP emergency actions triggered by homeostasis signals. Reactive rather than anticipatory.

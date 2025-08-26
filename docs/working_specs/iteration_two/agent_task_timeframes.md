Great idea. Time-capping forces the agent to avoid “thrash,” surface partial-completion checkpoints, and naturally schedule returns when conditions are better (daylight, food, inventory, safety). Below is a practical scheme you can drop in: clear bucket definitions, selection heuristics, how buckets bind to your planner/BT, and defaults by activity type (mining vs building, etc.). I’ll keep it operational—something you can encode today.

---

# 1) Bucket taxonomy (agent-agnostic, game-aware)

Think in **task granularity** rather than wall-clock alone. Each bucket names the *intended cognitive scope* and maps to a duration band with variance allowed by risk/utility.

| Bucket         | Duration band (cap) | Cognitive scope         | Typical deliverable                                       | When to use                                     |
| -------------- | ------------------- | ----------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| **Tactical**   | **30–90 s**         | One atomic action/loop  | “Reach this block”; “Place 1 torch”; “Open furnace”       | Tight feedback, high risk, precise manipulation |
| **Short**      | **3–5 min**         | One micro-objective     | “Collect 8 logs”; “Smelt 4 iron”; “Scout 100m”            | Low risk, near base, small inventory impact     |
| **Standard**   | **8–12 min**        | One subgoal with checks | “Light a 40m corridor”; “Excavate an ore pocket”          | Medium risk; needs guards (light, food)         |
| **Long**       | **20–30 min**       | Compound subgoal        | “Mine iron → smelt → craft shield”; “Perimeter wall pass” | Chained options; safe to pause mid-flow         |
| **Expedition** | **45–60 min**       | Multi-stage, off-base   | “Locate village & map returns”; “Nether prep route”       | Far from base; strong pause/resume & caches     |

Notes:

* Bands are **caps**; the executor should finish earlier if postconditions hit.
* Buckets are **policy**, not destiny—planner can split a high-utility effort across repeated Standard buckets rather than a single Long.

---

# 2) Default buckets per activity (sane starting points)

Treat these as *upper bounds*; the selector below will shrink/expand per context.

| Activity                                 | Default bucket   | Rationale                                                    |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------ |
| **Combat/emergency**                     | Tactical         | Always fine-grained; abort quickly; no long loops.           |
| **Torching corridor / clearing hazards** | Short → Standard | Needs frequent checkpoints and light checks; easy to resume. |
| **Targeted mining (vein or branch)**     | Standard         | Natural checkpoints at branch boundaries & inventory fill.   |
| **Bulk mining / quarrying**              | Long (if safe)   | Monotone work; bound by tool durability & inventory.         |
| **Smelting batches**                     | Short            | Transactional; checkpoint on each batch completion.          |
| **Crafting milestone chain**             | Standard         | Bounded by recipe dependencies; checkpoint by item.          |
| **Building (structure pass)**            | Short            | Encourage layered passes; snapshot per pass; resume later.   |
| **Base logistics (sort/store)**          | Short            | Avoid “cleaning rabbit hole”; return often.                  |
| **Exploration near base (<300m)**        | Standard         | Enough time to form map facts; re-anchor before night.       |
| **Expedition (>300m / Nether)**          | Expedition       | Requires waypoints, caches, retreat plan.                    |
| **Farming loop (plant/harvest)**         | Short            | Rhythm tasks; never block long horizons.                     |

---

# 3) How the agent chooses a bucket (selector heuristic)

Use a **utility-aware selector** that clamps duration based on risk, readiness, and payoff.

**Inputs (from snapshot & planner):**

* `risk`: hostiles nearby, light level, time of day, exposure (underground/open), armor/HP
* `readiness`: tools (tier/durability), food/saturation, torches/fuel, inventory headroom
* `distance`: from safe shelter/bed, from target, chunk load stability
* `payoff`: proximity to milestone (e.g., shield ready after smelt), task deadline/priority

**Rule of thumb (pseudocode):**

```ts
function chooseBucket(activity: Activity, ctx: Context): Bucket {
  let bucket = defaults[activity];        // table above

  // Risk shrinks bucket
  if (ctx.risk.hostiles || ctx.light < 8 || ctx.time.isNight) bucket = shrink(bucket);
  if (ctx.readiness.food < 0.4 || ctx.durability.low) bucket = shrink(bucket);

  // Distance shrinks (harder to recover if things go wrong)
  if (ctx.distance.base > 300 || ctx.distance.target > 200) bucket = shrink(bucket);

  // Payoff can expand one step if safe
  if (ctx.payoff.milestoneNear && riskLow(ctx)) bucket = grow(bucket);

  // Clamp to policy limits
  return clamp(bucket, policy.minBucket, policy.maxBucket);
}
```

`shrink/grow` step one bucket at a time (Expedition ↔ Long ↔ Standard ↔ Short ↔ Tactical). Keep it monotonic and explainable.

---

# 4) Planner & executor wiring (what actually changes)

## 4.1 Plan step gets a time budget

Planner emits:

```json
{
  "option_id":"opt.ore_ladder_iron@1.2.3",
  "args": {"shaft":"A"},
  "budget": {"bucket":"Standard", "maxMs": 10 * 60_000},
  "checkpointEveryMs": 60_000
}
```

## 4.2 Behavior Tree enforces it via decorators

Decorate the option’s root with:

* **Timeout** (hard cap)
* **Periodic checkpoint** (emit episodic trace, inventory diff, waypoint)
* **Graceful pause** (close open containers, cancel pathfinder)

BT sketch:

```
Sequence
  ├─ Decorator.Timeout( maxMs )
  │    └─ Decorator.Checkpoint( every=checkpointEveryMs )
  │         └─ <original option subtree…>
  └─ Leaf.EmitPauseTicket   // see §5
```

The executor returns `PAUSED_BY_BUDGET` when the timeout kicks in and writes a **pause ticket** (below).

---

# 5) “Return ticket” (how it comes back later)

A pause should **create work**, not lose it. Emit a small, resumable goal:

```json
{
  "id": "resume.opt.ore_ladder_iron#shaft_A#2025-08-25T22:01:00Z",
  "kind": "resume",
  "originOption": "opt.ore_ladder_iron@1.2.3",
  "args": {"shaft":"A"},
  "resumeContext": {
    "waypoint": {"name":"shaft_A_checkpoint_03","pos":[...],"safe":true},
    "progress": {"depth": 34, "lightsPlaced": 7},
    "requirements": {"torchesMin": 12, "pickTierMin": "stone"}
  },
  "suggestedBucket": "Standard",
  "deadline": "soon",
  "priority": 0.62
}
```

Planner drops this into the goal queue. It can schedule it later (e.g., after sleep or restock), often with the same bucket.

---

# 6) Policy file (configurable governance)

Make buckets **data-driven** so you can tune per org/world without code changes.

```json
{
  "buckets": {
    "Tactical": {"minMs": 30000, "maxMs": 90000},
    "Short":    {"minMs": 180000, "maxMs": 300000},
    "Standard": {"minMs": 480000, "maxMs": 720000},
    "Long":     {"minMs": 1200000, "maxMs": 1800000},
    "Expedition":{"minMs": 2700000, "maxMs": 3600000}
  },
  "defaults": {
    "miningTargeted": "Standard",
    "miningBulk": "Long",
    "buildingPass": "Short",
    "smeltingBatch": "Short",
    "craftingMilestone": "Standard",
    "combat": "Tactical",
    "exploreNear": "Standard",
    "expedition": "Expedition",
    "logistics": "Short",
    "farming": "Short"
  },
  "riskRules": {
    "nightShrinks": true,
    "lowFoodShrinks": 0.4,
    "lowDurabilityShrinks": 0.2,
    "hostilesRadius": 12,
    "farFromBaseMeters": 300
  },
  "limits": { "minBucket": "Tactical", "maxBucket": "Expedition" }
}
```

---

# 7) Acceptance invariants (what “good” looks like)

* **No step runs past its cap.** Every option run is bounded by its bucket `maxMs`.
* **Every paused step emits a valid return ticket** with a safe waypoint, progress markers, and pre-flight requirements (e.g., “bring ≥12 torches”).
* **Checkpoints at least every 60–120 s** for Standard+ buckets (episode segments, screenshots, inventory deltas).
* **Bucket selection is explainable**: the dashboard shows `default → rules applied → final bucket`.
* **Preemption is safe**: on timeout, executor cancels pathfinder, closes containers, and saves state before emitting `PAUSED_BY_BUDGET`.

---

# 8) Failure-mode guards

* **Starvation by short buckets**: if a task pauses >N times with no net progress, planner escalates to a higher bucket *or* decomposes the option into smaller sub-options.
* **Unsafe pause point**: if budget expires in unsafe state, the BT runs a **mandatory safety trailer** (retreat/block-in) before pausing.
* **Ticket pile-up**: a scheduler compacts/folds duplicate tickets (same originOption + args) and raises priority if user-requested.

---

# 9) Minimal implementation hooks (TypeScript sketched)

**Bucket chooser**

```ts
export function selectBucket(activity: Activity, snap: Snapshot, inv: Inventory, planCtx: PlanCtx): Bucket {
  let b = POLICY.defaults[activity];
  const risk = computeRisk(snap, inv);
  if (risk.high) b = shrink(b);
  if (isNight(snap) && POLICY.riskRules.nightShrinks) b = shrink(b);
  if (inv.foodSaturation < POLICY.riskRules.lowFoodShrinks) b = shrink(b);
  if (toolDurabilityLow(inv)) b = shrink(b);
  if (distanceFromBase(snap) > POLICY.riskRules.farFromBaseMeters) b = shrink(b);
  if (planCtx.milestoneNear && risk.low) b = grow(b);
  return clamp(b, POLICY.limits.minBucket, POLICY.limits.maxBucket);
}
```

**BT decorators**

```ts
const withBudget = (subtree: BTNode, budget: BucketBudget) =>
  Timeout(budget.maxMs, Checkpoint(subtree, budget.checkpointEveryMs || 60000));

const optionRoot = Sequence(
  withBudget(originalSubtree, budget),
  EmitPauseTicket() // only runs if Timeout fired
);
```

---

## Recommended default caps (to start)

* Tactical: 60 s
* Short: 4 min
* Standard: 10 min
* Long: 25 min
* Expedition: 50 min

These are intentionally asymmetric: Short/Standard map well to “one pass” work; Long covers chained flows; Expedition covers “go far, mark waypoints, cache, return.”

---

### Why this works

* **Bounded cognition**: caps prevent the agent from sinking time into low-yield loops; checkpoints crystallize partial progress.
* **Explainability**: a visible bucket rationale lets you (and the bot) critique the choice—tuning the policy is easier than tuning code.
* **Resumability**: return tickets convert “pause” into “scheduled work,” making long horizons tractable.
* **Safety-first**: shrinking under risk, growing under readiness/payoff keeps the agent aligned with survival and milestones.

If you want, I can turn this into: (1) a JSON schema for the policy file, (2) a tiny bucket-aware scheduler for your planner, and (3) the BT decorators (Timeout, Checkpoint, PauseTicket) as drop-in TypeScript modules.

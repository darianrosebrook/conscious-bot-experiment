# Arbiter & Signal-Driven Control

Author: @darianrosebrook

Bridges sensing to acting with a concrete pipeline: Signals → Needs → Candidate Goals → Feasibility → Plan (HRM) → Actions (GOAP), with constitution gating and human-in-the-loop controls.

## 0) Mental Model

Signals → Needs → Candidate Goals → Feasibility → Plan → Actions

- Signals (body/environment/social/intrusions/memory) are normalized and fused.
- Needs are latent drives (safety, nutrition, social, progress, curiosity, integrity).
- Candidate Goals are generated per need.
- Feasibility checks inventory, craft graph, time, and risk.
- HRM synthesizes/repairs short multi-step plans.
- GOAP executes reactively; repairs locally under change.

## 1) Signals: Taxonomy & Normalization

### 1.1 Channels

- Body: `health (0–1)`, `hunger (0–1)`, `fatigue (0–1)`, `armorTier (0–1)`, `statusEffects`.
- Environment: `lightLevel (0–1)`, `timeOfDay`, `weather`, `threatProximity (0–1)`, `terrainHazard`.
- Social: `playerNearby (0–1)`, `villagerAvailable (0/1)`, `recentTradeOpportunity (0–1)`, `hostilityFromEntity (0–1)`.
- Intrusions: `{source, text, intent, riskRating?, novelty?}`.
- Memory/Promises: intent contracts with `timeSinceCommit`, `dueBy`, `importance`.

### 1.2 Normalized Signal

```ts
type Signal = {
  name: string;                 // "hunger"
  value: number;                // 0..1 (higher = more urgent unless inverted)
  trend: number;                // d/dt over recent window
  confidence: number;           // 0..1
  ttlMs?: number;               // decay horizon
  provenance: 'body'|'env'|'social'|'intrusion'|'memory';
}
```

Map “good” readings to low urgency (e.g., `healthRisk = 1 - health`). Keep trend to emphasize rising needs.

## 2) From Signals to Needs

Latent needs computed from weighted signals, clamped to [0,1] with context gates:

```
Safety:        w1*threatProximity + w2*(1-lightLevel) + w3*terrainHazard + w4*(1-health)
Nutrition:     v1*hunger + v2*fatigue
Progress:      p1*toolDeficit + p2*questBacklog + p3*(1-armorTier)
Social:        s1*isolationTime + s2*villagerAvailable + s3*playerNearby
Curiosity:     c1*novelty + c2*unexploredFrontier
Integrity:     i1*promiseDueSoon + i2*identityDrift
```

At night, gate boosts Safety; in villages, boost Social.

```ts
type NeedScore = { name: 'Safety'|'Nutrition'|'Progress'|'Social'|'Curiosity'|'Integrity'; score: number; dScore: number };
```

## 3) Candidate Goals (per Need)

Goal templates provide preconditions, feasibility, utility, and optional plan hints:

- Safety: `ReachSafeLight`, `ReturnToBase`, `SleepIfNightAndBedNearby`, `FleeThreat`.
- Nutrition: `EatFromInventory`, `CookFoodAtFurnace(place)`, `ForageNearestEdible`.
- Progress: `UpgradePickaxe(tier)`, `AcquireArmor(tier)`, `StockFood(stacks=2)`, `MineResource(kind, qty)`.
- Social: `Trade(want,give,place)`, `VisitVillage(name)`, `MeetPlayer(name)`.
- Curiosity: `Scout(direction,radius)`, `SurveyCaveEntrance(place)`.
- Integrity: `ActAsProtector(zone)`, `AuditProgressAgainstContract`.

```ts
type GoalTemplate = {
  name: string;
  preconditions(state): boolean;
  feasibility(state): { ok: boolean; deficits?: ResourceDeficit[] };
  utility(state): number;               // based on need
  planSketch?(state): PlanHint;         // bias for HRM
  cooldownMs?: number;                  // thrash protection
}
```

## 4) Priority Ranking (Utility + Commitment + Risk)

For candidate goal g:

```
priority(g) = baseNeed(g) * contextGate(g) * (1 - risk(g))
            + commitmentBoost(g)
            + noveltyBoost(g)
            - opportunityCost(g)
```

- risk(g): constitution and hazard forecast penalties.
- commitmentBoost: alignment with intent contracts (30/100-day loop).
- Break ties by rising urgency (dScore), then cheapest feasible.

## 5) Inventory & Feasibility

Check inventory; compute craft-graph deficits; propose subgoals if needed.

```ts
type ResourceDeficit = { item: string; qty: number };
interface Feasibility { ok: boolean; deficits: ResourceDeficit[]; alt?: GoalTemplate[] }
```

Generate subgoals such as `Gather(wood)`, `Craft(sticks)`, `Smelt(iron)` and pass as plan hints to HRM.

## 6) HRM Planning (Structured Refinement)

Inputs: current state, top-N goals, optional plan hints.  
Outputs: best plan with steps + confidence, or a refusal with reasons.

- High-level module orders subgoals.
- Low-level module simulates fine steps with local constraints.
- Iterate until halt or no improvement; if refused, try next goal.

## 7) GOAP Execution (Reactive)

Execute plan steps, re-check preconditions per tick, repair locally on failure.

Preemptive reflexes override all:

- If `threatProximity > τ` → `FleeToLight`
- If `hunger < τ` and safe → `EatFromInventory`

## 8) Intrusions: Evaluation & Routing

Parse intrusion → proposed goal; score risk, alignment, utility:

- Reject if risk beyond threshold; log rationale; add negative prior.
- Harmless low-utility intrusions can be scheduled as background if curiosity is high.

## 9) Data Contracts

```ts
// Goals
type Goal = {
  id: string;
  template: GoalTemplate;
  binds?: Record<string, any>;
  priority: number;
  feasibility: Feasibility;
  createdAt: number;
};

// Plans & actions
type Plan = { goalId: string; steps: Action[]; confidence: number };
type Action = {
  name: string;
  pre: Predicate[];
  eff: Effect[];
  cost: number | ((state: any)=>number);
  exec: () => Promise<void>;     // MCP → Mineflayer
};
```

## 10) Arbiter Loop (Pseudocode)

```ts
function arbiterTick(state) {
  // 1) Signals → needs
  const needs = computeNeeds(state.signals, state.context);

  // 2) Enumerate + score goals
  let candidates = enumerateGoals(needs, state)
    .map(g => ({ ...g, priority: scorePriority(g, needs, state) }))
    .filter(g => cooldownOk(g) && constitutionOk(g));

  // 3) Feasibility + subgoals
  for (const g of candidates) {
    g.feasibility = checkFeasibility(g, state.world, state.inventory);
  }
  candidates = rankFeasibleFirst(candidates);

  // 4) Plan with HRM
  for (const g of topN(candidates, N)) {
    const hint = g.template.planSketch?.(state) ?? craftGraphHint(g, state);
    const plan = HRM.plan(state, g, hint);
    if (plan?.ok) return GOAP.execute(plan);
  }

  // 5) Fallback (reflex/idle)
  return GOAP.execute(reflexOrIdle(state));
}
```

## 11) Mini-Scenarios

- Nightfall, rising hunger, skeleton nearby → Safety goals outrank Nutrition; `FleeToLight` then `EatFromInventory`.
- Intrusion “burn the village” → rejected by constitution; negative prior recorded.
- Protector contract due → `PatrolVillage` boosted; HRM plans waypoints; GOAP adapts to mobs.

## 12) Metrics & Verification

Priority/selection

- Goal selection latency p50/p95
- Top-1 alignment rate vs oracle
- Preemption correctness under threats

Planning

- HRM refinement steps; plan acceptance rate
- Plan feasibility error rate (live precondition failures)

Execution

- Success rate per goal type; time-to-goal; repair:replan ratio
- Safety incidents/hour; constitution violations

Intrusions

- Accept/Reject rate by risk band; regret rate

Ablations

- Disable HRM, disable GOAP, disable Integrity boosts; compare success and safety.

Tests

- Golden goal selection states → known top-1 goals
- Feasibility harness: inventory permutations → expected subgoals
- Threat preemption: inject danger mid-plan → assert preempt + safe exit
- Intrusion suite: benign vs malicious → gating correctness

## 13) Implementation Slices

- Signal registry + normalization
- Need computation + goal enumerators
- Priority scorer + constitution gating
- Feasibility check with craft-graph deficits → subgoals
- HRM planner integration with plan hints and iterative refinement
- GOAP reflex set (flee, eat, heal) and local repair
- Intrusion mapping/evaluator + explanations
- Telemetry for selection/plan/act; dashboards
- Context gates (night/weather/biome); integrity/commitment boosts
- Safety forecasting (path and light risks); ablations and scenario tests

## Integration Points

- Uses `modules/core/real_time` budgets and preemption.
- Executes via `modules/core/mcp_capabilities`.
- Consults `modules/world/perception` (signals), `modules/world/place_graph` and `modules/world/navigation`.
- Reads/writes `modules/memory/{working,episodic,semantic}`.
- Respects `modules/interfaces/constitution` and `modules/interfaces/human_controls`.

# Rig J: Invariant Maintenance Implementation Plan

**Primitive**: P12 — Invariant maintenance (non-terminal goals; control-by-receding-horizon)

**Status**: ENRICHED (2025-01-31)

---

## 1. Target invariant (critical boundary)

**"Maintenance actions are proactive, not purely reactive."**

The system must:
- Model drift dynamics explicitly (resources deplete, conditions degrade)
- Schedule upkeep actions before violations occur
- Balance maintenance costs against goal disruption
- Explain why a maintenance action preempted a goal task

**What this rig proves**: Sterling can move from reactive triggers to proactive scheduling via receding-horizon control.

---

## 2. Formal signature

- **State includes invariant metrics**: light_coverage, food_buffer, tool_health, perimeter_integrity, time_to_night
- **Drift dynamics**: resources deplete over time; conditions degrade without intervention
- **Restore actions**: maintenance operators that restore metrics within bounds
- **Objective**: keep invariants within bounds over time (solved repeatedly as MPC/receding horizon)
- **Cost model**: disruption to current tasks + resource burn + risk of violation

---

## 3. What to investigate before implementing

| Step | Location | What to verify |
|------|----------|----------------|
| Bot state extraction | `packages/minecraft-interface/src/bot-adapter.ts` | `bot.food`, `bot.health`, tool inventory |
| World state builder | `packages/minecraft-interface/src/world-state-builder.ts` | World state for planning; metric extraction |
| Cognition goal handling | `packages/cognition/src/server.ts` | Goal request flow; maintenance goal injection |
| Task integration | `packages/planning/src/task-integration.ts` | Planning with cognition; goal arbitration |
| I-ext hazard | P21 companion | Hazard summary shape; threat_exposure derivation |

**Investigation outcome (verified 2025-01-31):** No InvariantVector, DriftModel, or MaintenanceOperator exist today. Metric sources: `bot-adapter.ts:631-632` (health, food in state); `observation-mapper.ts:149-150, 434-435, 491-530` (toHomeostasisState); `homeostasis-monitor.ts:46-81` (HomeostasisState); `world-state-manager.ts:16-27` (WorldStateSnapshot: agentHealth). Threat/threat_exposure: `threat-perception-manager.ts:97-98, 163-175` (botHealth, low_health threat). Maintenance goals would emit from GoalManager when homeostasis drift predicts violation; HomeostasisMonitor uses defaults, no drift model. I-ext hazard summary (when implemented) feeds invariant metrics (threat_exposure).

### 3a. Current code anchors (verified 2025-01-31)

| File | Line(s) | What |
|------|---------|------|
| `packages/minecraft-interface/src/bot-adapter.ts` | 631-632, 649-650 | `bot.health`, `bot.food` in state emission. |
| `packages/minecraft-interface/src/observation-mapper.ts` | 149-150, 434-435, 491-530 | `health: bot.health`, `food: bot.food`; `toHomeostasisState()` maps player to health/hunger/safety/energy. |
| `packages/planning/src/goal-formulation/homeostasis-monitor.ts` | 46-81 | `sample(partial?)`: HomeostasisState (health, hunger, shelterStability, etc.). No drift; no horizon projection. |
| `packages/planning/src/goal-formulation/goal-manager.ts` | 93-98 | `homeostasisMonitor.sample()` fed to signalProcessor.processSignals. No proactive maintenance emission. |
| `packages/minecraft-interface/src/threat-perception-manager.ts` | 97-98, 163-175 | `botHealth`; emits `low_health_self` threat when health <= 6. Hazard-like; not invariant vector. |
| `packages/planning/src/world-state/world-state-manager.ts` | 16-27 | `WorldStateSnapshot`: agentPosition, agentHealth, inventory, nearbyEntities, timeOfDay. No light_coverage, food_buffer, tool_health. |

**Gap:** No InvariantVector, DriftModel, MaintenanceOperator, or HorizonSolver. Maintenance is reactive (homeostasis triggers needs) not proactive (horizon projection before violation). I-ext hazard summary (TrackSet/hazard) will feed threat_exposure when I-ext is implemented.

---

## 4. conscious-bot vs Sterling split

| Responsibility | Owner | Location |
|----------------|-------|----------|
| InvariantVector, metric buckets, thresholds | conscious-bot | `packages/minecraft-interface/src/invariant/invariant-vector.ts` (new) |
| DriftModel, per-metric decay functions | conscious-bot | `packages/minecraft-interface/src/invariant/drift-model.ts` (new) |
| HorizonSolver, projection + maintenance scheduling | conscious-bot | `packages/minecraft-interface/src/invariant/maintenance-scheduler.ts` (new) |
| MaintenanceOperator definitions (eat, repair, place torch) | conscious-bot | `packages/minecraft-interface/src/invariant/maintenance-operators.ts` (new) |
| Extract invariant metrics from bot state | conscious-bot | Extend `packages/minecraft-interface/src/observation-mapper.ts` |
| Emit maintenance goals to GoalManager | conscious-bot | Extend `packages/planning/src/goal-formulation/goal-manager.ts` |
| Invariant-maintenance domain (optional) | Sterling | Sterling Python domain (optional) |

**Contract:** conscious-bot extracts metrics, projects drift, emits maintenance goals before violations. Sterling (if used) solves maintenance subproblems. I-ext hazard summary feeds threat_exposure into InvariantVector when I-ext is implemented.

---

## 5. What to implement / change

### 5.1 Invariant layer (new module)

**Location**: `packages/minecraft-interface/src/invariant/` (or `packages/world/src/invariant/`)

- `InvariantVector`: bounded set of metric slots with thresholds
- `DriftModel`: per-metric decay/depletion functions
- `MaintenanceOperator`: restore actions with costs and effects
- `HorizonSolver`: receding-horizon planner that schedules proactive maintenance

### 5.2 Minecraft-side integration

- Extract invariant metrics from bot state (light level, food, tool durability, etc.)
- Model drift sources (night cycle, hunger, tool wear, mob damage)
- Emit maintenance goals to planning when horizon projection shows violation

### 5.3 Coupling with Rig I-ext

- Hazard summary from entity tracking feeds into invariant metrics (threat_exposure)
- Maintenance can include "retreat to safe zone" as a restore action
- Invariant layer consumes TrackSet/hazard summary, not raw detections

### 5.4 Sterling integration

- Define `invariant-maintenance` domain in Sterling
- State includes invariant vector + current goal context
- Operators: maintenance actions that restore metrics
- Objective: minimize violation risk + disruption cost over horizon

---

## 6. Where (summary)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| InvariantVector | `minecraft-interface/src/invariant/` | Bounded metric state |
| DriftModel | `minecraft-interface/src/invariant/` | Per-metric decay functions |
| MaintenanceScheduler | `minecraft-interface/src/invariant/` | Horizon projection + scheduling |
| Cognition integration | `cognition/src/` | Maintenance goal arbitration |
| Sterling domain | `sterling/domains/` | Solve maintenance subproblems |

---

## 7. Implementation pivots

### Pivot 1: Metric buckets only — no raw values

**Problem:** Raw food_level (0-20), health (0-20) cause state explosion and float jitter.

**Pivot:** `InvariantVector` uses integer buckets (e.g., 5 buckets for food: 0-4, 5-8, 9-12, 13-16, 17-20). `toBucket(raw)` at boundary only.

**Acceptance check:** Metric state has only bucket values. Same raw value always maps to same bucket.

### Pivot 2: Drift projection deterministic — no randomness

**Problem:** Non-deterministic drift causes test flakiness; replay fails.

**Pivot:** `projectDrift(vector, ticks)` uses fixed `DRIFT_RATES`; no randomness, no `Date.now()` in core.

**Acceptance check:** Same vector + ticks yields identical projection. 100 runs produce same result.

### Pivot 3: Hazard summary not in canonical planning state

**Problem:** Hazard in planning state causes search explosion (P21 Pivot 8).

**Pivot:** `threat_exposure` derived from I-ext hazard summary; used for maintenance scheduling only. InvariantVector excludes raw hazard; threat_exposure is derived input.

**Acceptance check:** Invariant state excludes hazard. threat_exposure is derived at boundary, not stored in planning state.

### Pivot 4: Horizon bounded — no infinite projection

**Problem:** Unbounded horizon; projection never ends.

**Pivot:** `MAX_HORIZON_TICKS = 600` (~30s); projection stops at bound. No maintenance scheduled beyond horizon.

**Acceptance check:** No projection beyond MAX_HORIZON_TICKS. Horizon violation returns "unschedulable" not infinite loop.

### Pivot 5: Proactive emission — maintenance before violation

**Problem:** Reactive maintenance (trigger after violation) is out of scope for Rig J.

**Pivot:** Maintenance goals emit when `projectDrift(vector, horizon)` predicts violation within horizon. Never emit after violation (that is reactive).

**Acceptance check:** Maintenance goal timestamp < predicted violation timestamp. No "violation occurred, now maintain" semantics.

---

## 8. Transfer surfaces (domain-agnosticism proof)

### 8.1 Vehicle maintenance (oil, tires, fuel)

**Surface:** Resource depletion (oil level, tire wear, fuel), restore actions (change oil, replace tires, refuel), horizon projection.

- **State:** InvariantVector (oil_level, tire_wear, fuel_level)
- **Drift:** Per-mile depletion rates
- **Restore:** Change oil (resets oil_level), replace tires (resets tire_wear), refuel (resets fuel_level)
- **Horizon:** Next 1000 miles
- **Goal:** Schedule maintenance before any metric violates threshold

**Prove:** Same bucket quantization, same deterministic drift, same horizon bound.

**Certification gates:**
- Maintenance scheduled before oil/tire/fuel violation
- Same state + drift yields same schedule (deterministic)
- No maintenance beyond MAX_HORIZON

### 8.2 Building HVAC (temperature, humidity)

**Surface:** Environmental drift (temp rises, humidity fluctuates), restore actions (cool, dehumidify), horizon projection.

- **State:** InvariantVector (temp_bucket, humidity_bucket)
- **Drift:** Time-of-day + external temp models
- **Restore:** Cool (lowers temp), dehumidify (lowers humidity)
- **Horizon:** Next 24 hours
- **Goal:** Schedule HVAC before comfort bounds violated

**Prove:** Same metric buckets, same drift semantics, same proactive emission.

**Certification gates:**
- HVAC scheduled before temp/humidity violation
- Deterministic projection
- Proactive (not reactive) emission

### 8.3 Minecraft survival (food, health, light, tool durability)

**Surface:** Hunger depletion, health drift (mob damage), night cycle (light), tool wear.

- **State:** InvariantVector (food_buffer, health_buffer, light_coverage, tool_health)
- **Drift:** Hunger per tick, health (damage events), time_to_night, tool wear per use
- **Restore:** Eat, heal, place torch, repair/craft tool
- **Horizon:** 600 ticks (~30s)
- **Goal:** Schedule eat/torch/repair before violation

**Prove:** Direct mapping to Minecraft metrics. I-ext threat_exposure feeds light_coverage / safety.

**Certification gates:**
- Eat scheduled before hunger violation
- Torch placed before night / mob spawn
- Repair scheduled before tool breaks

---

## 9. Concrete certification tests

### Test 1: Drift projection deterministic

```ts
describe('Invariant maintenance - drift projection', () => {
  it('same vector + ticks yields identical projection', () => {
    const vector = createInvariantVector({ food: 15, health: 18 });
    const results = Array.from({ length: 100 }, () => projectDrift(vector, 100));
    const first = JSON.stringify(results[0]);
    expect(results.every(r => JSON.stringify(r) === first)).toBe(true);
  });

  it('never projects beyond MAX_HORIZON_TICKS', () => {
    const vector = createInvariantVector({ food: 20, health: 20 });
    const projected = projectDrift(vector, MAX_HORIZON_TICKS + 100);
    expect(projected.ticksProjected).toBeLessThanOrEqual(MAX_HORIZON_TICKS);
  });
});
```

### Test 2: Proactive maintenance emission

```ts
describe('Invariant maintenance - proactive emission', () => {
  it('emits maintenance goal before predicted violation', () => {
    const vector = createInvariantVector({ food: 5 }); // Low food
    const drift = createDriftModel({ hungerPerTick: 0.01 });
    const schedule = computeMaintenanceSchedule(vector, drift, 600);
    const eatAction = schedule.find(a => a.type === 'eat');
    expect(eatAction).toBeDefined();
    expect(eatAction!.scheduledAt).toBeLessThan(eatAction!.predictedViolationAt);
  });

  it('does not emit when no violation predicted within horizon', () => {
    const vector = createInvariantVector({ food: 20, health: 20 });
    const drift = createDriftModel({ hungerPerTick: 0.001 });
    const schedule = computeMaintenanceSchedule(vector, drift, 100);
    expect(schedule.length).toBe(0);
  });
});
```

### Test 3: Metric bucket quantization

```ts
describe('Invariant maintenance - metric buckets', () => {
  it('same raw value maps to same bucket', () => {
    expect(toFoodBucket(10)).toBe(toFoodBucket(10));
    expect(toFoodBucket(10.1)).toBe(toFoodBucket(10.9)); // Same bucket
  });

  it('invariant vector uses only bucket values', () => {
    const vector = createInvariantVector({ food: 12 });
    expect(Number.isInteger(vector.foodBucket)).toBe(true);
    expect(vector.foodBucket).toBeGreaterThanOrEqual(0);
    expect(vector.foodBucket).toBeLessThanOrEqual(FOOD_BUCKET_COUNT - 1);
  });
});
```

### Test 4: Hazard excluded from planning state

```ts
describe('Invariant maintenance - hazard exclusion', () => {
  it('threat_exposure is derived input, not stored in InvariantVector', () => {
    const vector = createInvariantVector({ food: 15, health: 18 });
    expect('rawHazard' in vector).toBe(false);
    expect('threatMap' in vector).toBe(false);
  });

  it('threat_exposure feeds invariant when provided at boundary', () => {
    const hazardSummary = { threat_exposure: 0.3 };
    const vector = buildInvariantVectorFromBotState(botState, hazardSummary);
    expect(vector.safetyBucket).toBeDefined();
    // safetyBucket incorporates threat_exposure, but raw hazard not stored
  });
});
```

---

## 10. Order of work (suggested)

1. **Define InvariantVector types** with metric slots, thresholds, and bucket quantization.
2. **Implement DriftModel** for Minecraft metrics (food, durability, light, time).
3. **Build horizon projection** that predicts when each metric will violate threshold.
4. **Add MaintenanceOperator** definitions with costs and restore effects.
5. **Wire to cognition** with maintenance goal emission and arbitration logic.
6. **Sterling integration** for maintenance subproblem solving (optional; can use local heuristics first).
7. **Add certification tests** for proactivity, disruption minimization, and explanation.

---

## 11. Dependencies and risks

- **Rig A certification**: Invariant maintenance assumes deterministic operator semantics from Rig A.
- **Rig I-ext coupling**: Hazard summary feeds invariant metrics; implement I-ext boundary milestone first.
- **Horizon complexity**: Receding horizon can explode if metrics are continuous; use bucket quantization.
- **Disruption cost**: Balancing maintenance vs. goal progress requires explicit multi-objective handling (P18).

---

## 12. Definition of "done"

- **Proactive scheduling**: Maintenance actions fire before violations, not after.
- **Disruption minimization**: Maintenance is batched/scheduled to minimize goal interruption.
- **Explanation**: Every maintenance action includes rationale (which metric, projected violation time, cost tradeoff).
- **Determinism**: Same invariant state + drift model yields same maintenance schedule.
- **Bounded**: Invariant vector is capped; horizon window is finite.

---

## 13. Cross-references

- **Companion approach**: `RIG_J_INVARIANT_MAINTENANCE_APPROACH.md` (implementation details, signatures, DO/DO NOT)
- **Rig I-ext**: `P21_RIG_I_EXT_IMPLEMENTATION_PLAN.md` (hazard summary feeds invariant metrics)
- **Capability primitives**: `capability-primitives.md` (P12 definition)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig J section)

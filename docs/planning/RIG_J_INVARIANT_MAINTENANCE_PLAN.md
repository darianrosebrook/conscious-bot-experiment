# Rig J: Invariant Maintenance Implementation Plan

**Primitive**: P12 — Invariant maintenance (non-terminal goals; control-by-receding-horizon)

**Status**: Planned (depends on Rig A certification; foundation for Rig I-ext hazard semantics)

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

**Outcome:** Confirm metric extraction points; where maintenance goals are emitted; I-ext hazard coupling.

---

## 4. What to implement / change

### 4.1 Invariant layer (new module)

**Location**: `packages/minecraft-interface/src/invariant/` (or `packages/world/src/invariant/`)

- `InvariantVector`: bounded set of metric slots with thresholds
- `DriftModel`: per-metric decay/depletion functions
- `MaintenanceOperator`: restore actions with costs and effects
- `HorizonSolver`: receding-horizon planner that schedules proactive maintenance

### 4.2 Minecraft-side integration

- Extract invariant metrics from bot state (light level, food, tool durability, etc.)
- Model drift sources (night cycle, hunger, tool wear, mob damage)
- Emit maintenance goals to planning when horizon projection shows violation

### 4.3 Coupling with Rig I-ext

- Hazard summary from entity tracking feeds into invariant metrics (threat_exposure)
- Maintenance can include "retreat to safe zone" as a restore action
- Invariant layer consumes TrackSet/hazard summary, not raw detections

### 4.4 Sterling integration

- Define `invariant-maintenance` domain in Sterling
- State includes invariant vector + current goal context
- Operators: maintenance actions that restore metrics
- Objective: minimize violation risk + disruption cost over horizon

---

## 5. Where (summary)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| InvariantVector | `minecraft-interface/src/invariant/` | Bounded metric state |
| DriftModel | `minecraft-interface/src/invariant/` | Per-metric decay functions |
| MaintenanceScheduler | `minecraft-interface/src/invariant/` | Horizon projection + scheduling |
| Cognition integration | `cognition/src/` | Maintenance goal arbitration |
| Sterling domain | `sterling/domains/` | Solve maintenance subproblems |

---

## 6. Order of work (suggested)

1. **Define InvariantVector types** with metric slots, thresholds, and bucket quantization.
2. **Implement DriftModel** for Minecraft metrics (food, durability, light, time).
3. **Build horizon projection** that predicts when each metric will violate threshold.
4. **Add MaintenanceOperator** definitions with costs and restore effects.
5. **Wire to cognition** with maintenance goal emission and arbitration logic.
6. **Sterling integration** for maintenance subproblem solving (optional; can use local heuristics first).
7. **Add certification tests** for proactivity, disruption minimization, and explanation.

---

## 7. Dependencies and risks

- **Rig A certification**: Invariant maintenance assumes deterministic operator semantics from Rig A.
- **Rig I-ext coupling**: Hazard summary feeds invariant metrics; implement I-ext boundary milestone first.
- **Horizon complexity**: Receding horizon can explode if metrics are continuous; use bucket quantization.
- **Disruption cost**: Balancing maintenance vs. goal progress requires explicit multi-objective handling (P18).

---

## 8. Definition of "done"

- **Proactive scheduling**: Maintenance actions fire before violations, not after.
- **Disruption minimization**: Maintenance is batched/scheduled to minimize goal interruption.
- **Explanation**: Every maintenance action includes rationale (which metric, projected violation time, cost tradeoff).
- **Determinism**: Same invariant state + drift model yields same maintenance schedule.
- **Bounded**: Invariant vector is capped; horizon window is finite.

---

## 9. Cross-references

- **Companion approach**: `RIG_J_INVARIANT_MAINTENANCE_APPROACH.md` (implementation details, signatures, DO/DO NOT)
- **Rig I-ext**: `P21_RIG_I_EXT_IMPLEMENTATION_PLAN.md` (hazard summary feeds invariant metrics)
- **Capability primitives**: `capability-primitives.md` (P12 definition)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig J section)

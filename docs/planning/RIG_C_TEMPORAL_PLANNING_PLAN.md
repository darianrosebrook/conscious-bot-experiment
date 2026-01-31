# Rig C: Temporal Planning with Capacity and Batching Implementation Plan

**Primitive**: P3 — Temporal planning with durations, batching, and capacity

**Status**: Planned (after Rig B)

---

## 1. Target invariant (critical boundary)

**"Time is modeled explicitly; no schedule deadlocks; batching is preferred over naive iteration."**

The system must:
- Model action durations and resource occupancy
- Avoid dead schedules (unreachable states due to time/capacity)
- Prefer batch-efficient sequences over repeated individual actions
- Handle parallel capacity (multiple furnaces, slots)

**What this rig proves**: Sterling can reason about time, durations, and capacity constraints.

---

## 2. Formal signature

- **Actions with duration**: Smelting takes 10s; cooking takes 10s
- **Resource occupancy**: Furnace slot is occupied while smelting
- **Objective includes time**: Minimize makespan, not just action count
- **State includes clocks/remaining-time**: Track when resources become available
- **Optional parallel slots**: Multiple furnaces can run concurrently

---

## 3. Problem being solved

### 3.1 Current state (no temporal modeling)

Without temporal modeling:
- Planner treats smelting as instant (but it takes 10s per item)
- No distinction between "smelt 64 items sequentially" vs "smelt across 4 furnaces"
- "Wait for smelting" is implicit, causing execution timing bugs

### 3.2 With temporal modeling

With proper temporal modeling:
- Planner knows smelting 64 iron ore takes ~640s with 1 furnace, ~160s with 4 furnaces
- Batching is explicit: load furnace with 64 items is better than 64x load-1-item
- Wait actions are explicit in the plan, not implicit gaps

---

## 4. What to investigate before implementing

| Step | Location | What to verify |
|------|----------|----------------|
| Solve request | `packages/planning/src/sterling/minecraft-crafting-types.ts` | `MinecraftSolveRequest` shape; where to add currentTickBucket, slots |
| Rule shape | Same, `MinecraftCraftingRule` | No durationTicks today; where to add |
| Solver call | `packages/planning/src/sterling/minecraft-crafting-solver.ts` | Where solve() is invoked; where to pass temporal params |
| World/placement state | `packages/planning/src/task-integration.ts` | Where placed furnaces/stations are known; slot state source |
| Sterling (Python) | Sterling solve handler | Accepts temporal state; slot reservation in search |

**Outcome:** Confirm solve request extensibility; identify slot/placement data source; confirm Sterling changes required.

---

## 5. What to implement / change

### 5.1 Time representation

**Location**: Sterling domain state or `packages/planning/src/temporal/`

- Add `current_tick` or `current_time_bucket` to state
- Add `ready_at_tick` per resource slot (furnace, crafting table)
- Quantize time into buckets to prevent state explosion

### 5.2 Duration model

- Each operator specifies `duration_ticks` (or derives from item count)
- Effects include advancing resource `ready_at_tick`
- Waiting is modeled as explicit "advance_clock" operator or implicit via `ready_at_tick`

### 5.3 Capacity model

- State includes slot availability: `furnace_slots: [{ ready_at: 0 }, { ready_at: 50 }, ...]`
- Operators check slot availability and reserve slots
- No over-capacity: cannot load a slot that's occupied

### 5.4 Batching semantics

- Define batch operators: "load_furnace_batch(item, count)" vs "load_furnace(item)"
- Batch is more efficient (fewer state transitions) for same outcome
- Cost model prefers batching over iteration

---

## 6. Where (summary)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Time state | Sterling domain state | Track current tick, ready_at per slot |
| Duration model | Operator definitions | Specify duration per operator |
| Capacity model | Sterling domain state | Track slot availability |
| Batch operators | Domain rules | Efficient multi-item operations |

---

## 7. Order of work (suggested)

1. **Add time fields** to domain state (current_tick, ready_at per slot).
2. **Add duration** to smelting/cooking operators.
3. **Implement capacity checking** (slot availability).
4. **Add explicit wait operator** or implicit ready_at semantics.
5. **Add batch operators** for efficient multi-item loading.
6. **Certification tests**: no deadlocks; batching preferred; makespan minimized.

---

## 8. Dependencies and risks

- **Rig A, B**: Builds on deterministic operators and capability gating.
- **Time quantization**: Too fine = state explosion; too coarse = scheduling inaccuracy.
- **Concurrency model**: Must choose either explicit parallel actions or sequential with slot encoding.
- **Wait explosion**: "Wait" can create infinite state space if not bounded.

---

## 9. Definition of "done"

- **No deadlocks**: Search never enters unreachable states due to time/capacity.
- **Batching efficiency**: Plans prefer batch operations over iteration.
- **Makespan awareness**: Objective includes time; faster schedules are preferred.
- **Determinism**: Same state + time → same schedule.
- **Tests**: Multi-furnace parallelism works; batching reduces plan length.

---

## 10. Cross-references

- **Companion approach**: `RIG_C_TEMPORAL_PLANNING_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P3)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig C section)
- **Rig A, B**: Foundation for operators and legality

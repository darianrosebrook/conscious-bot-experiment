# Rig J: Invariant Maintenance — Companion Approach

This companion document distills the implementation plan with design decisions, boundaries, and implementation construction constraints. Read alongside `RIG_J_INVARIANT_MAINTENANCE_PLAN.md`.

---

## 1. Executive summary

Rig J proves **Primitive 12** (Invariant maintenance / receding-horizon control) by implementing a proactive maintenance scheduler that:

1. Models **drift dynamics** explicitly (resources deplete, conditions degrade)
2. Projects **horizon violations** before they occur
3. Schedules **maintenance actions** that restore metrics within bounds
4. Balances **disruption cost** against **violation risk**

**Critical boundary**: Maintenance is proactive (scheduled before violations), not purely reactive (triggered after violations).

---

## 2. Implementation construction constraints (pivots)

### Pivot 1: Metric buckets, not raw values

**Problem:** Raw food_level (0-20) causes state explosion; float jitter.

**Pivot:** `InvariantVector` uses integer buckets (e.g., 5 buckets for food). `toBucket(raw)` for conversion.

**Acceptance check:** Metric state has only bucket values.

---

### Pivot 2: Drift projection deterministic

**Problem:** Non-deterministic drift; tests flake.

**Pivot:** `projectDrift(vector, ticks)` uses fixed `DRIFT_RATES`; no randomness.

**Acceptance check:** Same vector + ticks → identical projection.

---

### Pivot 3: Hazard summary not in canonical planning state

**Problem:** Hazard in planning state causes search explosion (P21 Pivot 8).

**Pivot:** `threat_exposure` derived from hazard summary; used for maintenance scheduling only. Not in Sterling planning state unless hazard-aware domain.

**Acceptance check:** Invariant state excludes hazard; threat_exposure is derived input.

---

### Pivot 4: Horizon bounded

**Problem:** Unbounded horizon; projection never ends.

**Pivot:** `MAX_HORIZON_TICKS` (e.g., 600); projection stops at bound.

**Acceptance check:** No projection beyond MAX_HORIZON_TICKS.

---

### Summary: Acceptance check table

| Pivot | Acceptance check |
|-------|------------------|
| 1 | Metrics in buckets only. |
| 2 | Drift projection deterministic. |
| 3 | Hazard excluded from planning state. |
| 4 | Horizon bounded. |

---

## 3. Primary design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Metric quantization | Integer buckets (e.g., food_level: 0-20 → 5 buckets) | Prevents state explosion; ensures determinism |
| Horizon window | Fixed tick count (e.g., 600 ticks = ~30s) | Bounded planning complexity |
| Drift model | Per-metric decay functions with explicit rates | Predictable, testable |
| Disruption cost | Explicit field in maintenance operators | Multi-objective handling (P18) |
| Coupling with I-ext | Consume hazard summary as threat_exposure metric | No raw detections in invariant layer |

---

## 4. Current code anchors

### 4.1 Relevant existing code

**Bot state extraction** (tool durability, food, etc.):
- `packages/minecraft-interface/src/bot-adapter.ts` — has access to `bot.food`, `bot.health`, tool inventory
- `packages/minecraft-interface/src/world-state-builder.ts` — builds world state for planning

**Cognition goal handling**:
- `packages/cognition/src/server.ts` — handles goal requests
- `packages/planning/src/task-integration.ts` — integrates planning with cognition

### 4.2 New modules to create

| Module | Path | Purpose |
|--------|------|---------|
| `invariant-vector.ts` | `minecraft-interface/src/invariant/` | Metric state representation |
| `drift-model.ts` | `minecraft-interface/src/invariant/` | Per-metric decay functions |
| `maintenance-scheduler.ts` | `minecraft-interface/src/invariant/` | Horizon projection + scheduling |
| `maintenance-operators.ts` | `minecraft-interface/src/invariant/` | Restore action definitions |

---

## 5. Staged delivery

### Stage 1: Invariant vector + drift model (foundation)
- Define `InvariantVector` with metric buckets and thresholds
- Implement `DriftModel` for food, durability, time-to-night
- Unit tests for deterministic drift projection

**Outcome**: Can project when metrics will violate thresholds.

### Stage 2: Maintenance operators + horizon scheduling
- Define maintenance operators (eat, repair, craft torch, place torch)
- Implement horizon projection that identifies violation windows
- Schedule proactive maintenance before violations

**Outcome**: Maintenance actions fire before violations, not after.

### Stage 3: Cognition integration + disruption balancing
- Wire maintenance goals to cognition
- Implement disruption cost model
- Add arbitration between maintenance and current goals

**Outcome**: Maintenance is balanced against goal progress with explicit tradeoffs.

### Stage 4: Coupling with Rig I-ext (hazard → invariant)
- Add `threat_exposure` metric derived from hazard summary
- Maintenance includes "retreat to safe zone" as restore action
- Invariant layer consumes TrackSet/hazard summary, not raw detections

**Outcome**: Entity tracking hazards feed into maintenance scheduling.

---

## 6. Invariant vector design

### 5.1 Metric slots

```ts
// packages/minecraft-interface/src/invariant/invariant-vector.ts

export const METRIC_SLOTS = [
  'food_level',       // 0-20, buckets of 4 → 5 buckets
  'health_level',     // 0-20, buckets of 4 → 5 buckets
  'tool_durability',  // 0-1 normalized, buckets of 0.2 → 5 buckets
  'light_coverage',   // 0-1 normalized, buckets of 0.2 → 5 buckets
  'threat_exposure',  // 0-1 normalized from hazard summary, buckets of 0.2 → 5 buckets
  'time_to_night',    // 0-12000 ticks, buckets of 2400 → 5 buckets
] as const;

export type MetricSlot = typeof METRIC_SLOTS[number];

export interface InvariantVector {
  metrics: Record<MetricSlot, number>;  // Bucketed values
  thresholds: Record<MetricSlot, { warn: number; critical: number }>;
  lastUpdatedTick: number;
}

export const DEFAULT_THRESHOLDS: Record<MetricSlot, { warn: number; critical: number }> = {
  food_level: { warn: 2, critical: 1 },       // Buckets 0-4
  health_level: { warn: 2, critical: 1 },
  tool_durability: { warn: 1, critical: 0 },
  light_coverage: { warn: 2, critical: 1 },
  threat_exposure: { warn: 3, critical: 4 },  // Higher = more threat
  time_to_night: { warn: 1, critical: 0 },    // Lower = closer to night
};
```

### 5.2 Bucket conversion

```ts
const BUCKET_CONFIGS: Record<MetricSlot, { min: number; max: number; buckets: number }> = {
  food_level: { min: 0, max: 20, buckets: 5 },
  health_level: { min: 0, max: 20, buckets: 5 },
  tool_durability: { min: 0, max: 1, buckets: 5 },
  light_coverage: { min: 0, max: 1, buckets: 5 },
  threat_exposure: { min: 0, max: 1, buckets: 5 },
  time_to_night: { min: 0, max: 12000, buckets: 5 },
};

export function toBucket(slot: MetricSlot, rawValue: number): number {
  const cfg = BUCKET_CONFIGS[slot];
  const normalized = Math.max(0, Math.min(1, (rawValue - cfg.min) / (cfg.max - cfg.min)));
  return Math.floor(normalized * (cfg.buckets - 1));
}
```

---

## 7. Drift model design

### 6.1 Per-metric decay functions

```ts
// packages/minecraft-interface/src/invariant/drift-model.ts

export interface DriftRate {
  slot: MetricSlot;
  decayPerTick: number;  // Bucket units per tick (can be fractional)
  condition?: (state: InvariantVector) => boolean;  // Optional conditional drift
}

export const DRIFT_RATES: DriftRate[] = [
  { slot: 'food_level', decayPerTick: 0.001 },      // ~1 bucket per 1000 ticks
  { slot: 'tool_durability', decayPerTick: 0.0005 }, // Slower decay
  { slot: 'time_to_night', decayPerTick: 1 / 2400 }, // Linear time progression
  {
    slot: 'threat_exposure',
    decayPerTick: 0,  // Threat doesn't decay; it's set by hazard summary
  },
];

export function projectDrift(
  current: InvariantVector,
  horizonTicks: number
): InvariantVector {
  const projected = { ...current, metrics: { ...current.metrics } };
  for (const rate of DRIFT_RATES) {
    if (!rate.condition || rate.condition(current)) {
      projected.metrics[rate.slot] = Math.max(
        0,
        current.metrics[rate.slot] - rate.decayPerTick * horizonTicks
      );
    }
  }
  return projected;
}
```

### 6.2 Violation projection

```ts
export interface ViolationProjection {
  slot: MetricSlot;
  currentBucket: number;
  projectedBucket: number;
  ticksToWarn: number | null;
  ticksToCritical: number | null;
}

export function projectViolations(
  current: InvariantVector,
  horizonTicks: number
): ViolationProjection[] {
  const projections: ViolationProjection[] = [];
  
  for (const slot of METRIC_SLOTS) {
    const currentBucket = current.metrics[slot];
    const threshold = current.thresholds[slot];
    const rate = DRIFT_RATES.find(r => r.slot === slot);
    
    if (!rate || rate.decayPerTick === 0) {
      projections.push({
        slot,
        currentBucket,
        projectedBucket: currentBucket,
        ticksToWarn: null,
        ticksToCritical: null,
      });
      continue;
    }
    
    const ticksToWarn = currentBucket > threshold.warn
      ? (currentBucket - threshold.warn) / rate.decayPerTick
      : null;
    const ticksToCritical = currentBucket > threshold.critical
      ? (currentBucket - threshold.critical) / rate.decayPerTick
      : null;
    
    projections.push({
      slot,
      currentBucket,
      projectedBucket: Math.max(0, currentBucket - rate.decayPerTick * horizonTicks),
      ticksToWarn: ticksToWarn && ticksToWarn < horizonTicks ? ticksToWarn : null,
      ticksToCritical: ticksToCritical && ticksToCritical < horizonTicks ? ticksToCritical : null,
    });
  }
  
  return projections;
}
```

---

## 8. Maintenance operators

### 7.1 Operator definitions

```ts
// packages/minecraft-interface/src/invariant/maintenance-operators.ts

export interface MaintenanceOperator {
  id: string;
  name: string;
  targetSlot: MetricSlot;
  restoreAmount: number;  // Bucket units restored
  cost: {
    resource: number;     // Resource cost (normalized)
    disruption: number;   // Disruption to current goal (0-1)
    risk: number;         // Risk exposure during action (0-1)
  };
  precondition: (state: InvariantVector, inventory: unknown) => boolean;
}

export const MAINTENANCE_OPERATORS: MaintenanceOperator[] = [
  {
    id: 'eat_food',
    name: 'Eat food',
    targetSlot: 'food_level',
    restoreAmount: 2,  // Restore 2 buckets
    cost: { resource: 0.1, disruption: 0.1, risk: 0 },
    precondition: (_, inv) => hasFood(inv),
  },
  {
    id: 'repair_tool',
    name: 'Repair/replace tool',
    targetSlot: 'tool_durability',
    restoreAmount: 4,  // Restore to near-full
    cost: { resource: 0.3, disruption: 0.3, risk: 0 },
    precondition: (_, inv) => hasToolMaterials(inv),
  },
  {
    id: 'place_torches',
    name: 'Place torches for light',
    targetSlot: 'light_coverage',
    restoreAmount: 2,
    cost: { resource: 0.2, disruption: 0.2, risk: 0.1 },
    precondition: (_, inv) => hasTorches(inv),
  },
  {
    id: 'retreat_to_safety',
    name: 'Retreat to safe zone',
    targetSlot: 'threat_exposure',
    restoreAmount: 4,  // Reduce threat to near-zero
    cost: { resource: 0, disruption: 0.5, risk: 0.1 },
    precondition: () => true,  // Always available
  },
  {
    id: 'seek_shelter',
    name: 'Seek shelter before night',
    targetSlot: 'time_to_night',
    restoreAmount: 0,  // Doesn't restore time, but prevents violation effect
    cost: { resource: 0, disruption: 0.4, risk: 0.2 },
    precondition: () => true,
  },
];
```

---

## 9. Horizon scheduler

### 8.1 Scheduler interface

```ts
// packages/minecraft-interface/src/invariant/maintenance-scheduler.ts

export interface ScheduledMaintenance {
  operator: MaintenanceOperator;
  scheduledAtTick: number;
  reason: string;
  projectedViolation: ViolationProjection;
  totalCost: number;
}

export interface MaintenanceSchedule {
  currentTick: number;
  horizonTicks: number;
  scheduled: ScheduledMaintenance[];
  explanation: string;
}

export function scheduleMaintenace(
  currentVector: InvariantVector,
  currentTick: number,
  horizonTicks: number,
  inventory: unknown
): MaintenanceSchedule {
  const violations = projectViolations(currentVector, horizonTicks);
  const scheduled: ScheduledMaintenance[] = [];
  
  for (const violation of violations) {
    if (violation.ticksToCritical === null && violation.ticksToWarn === null) {
      continue;  // No violation projected
    }
    
    // Find applicable operators for this slot
    const operators = MAINTENANCE_OPERATORS.filter(
      op => op.targetSlot === violation.slot && op.precondition(currentVector, inventory)
    );
    
    if (operators.length === 0) continue;
    
    // Choose lowest total cost operator
    const best = operators.reduce((a, b) =>
      totalCost(a.cost) < totalCost(b.cost) ? a : b
    );
    
    // Schedule before warn threshold
    const scheduleAt = violation.ticksToWarn
      ? currentTick + Math.floor(violation.ticksToWarn * 0.8)  // 80% of time to warn
      : currentTick;
    
    scheduled.push({
      operator: best,
      scheduledAtTick: scheduleAt,
      reason: `${violation.slot} projected to hit warn threshold in ${violation.ticksToWarn?.toFixed(0)} ticks`,
      projectedViolation: violation,
      totalCost: totalCost(best.cost),
    });
  }
  
  // Sort by schedule time
  scheduled.sort((a, b) => a.scheduledAtTick - b.scheduledAtTick);
  
  return {
    currentTick,
    horizonTicks,
    scheduled,
    explanation: generateExplanation(scheduled),
  };
}

function totalCost(cost: MaintenanceOperator['cost']): number {
  return cost.resource + cost.disruption + cost.risk;
}

function generateExplanation(scheduled: ScheduledMaintenance[]): string {
  if (scheduled.length === 0) return 'No maintenance needed within horizon.';
  return scheduled.map(s => `${s.operator.name}: ${s.reason}`).join('; ');
}
```

---

## 10. Coupling with Rig I-ext

### 9.1 Hazard summary → threat_exposure metric

```ts
// When hazard summary is received from Belief Bus
function updateThreatExposure(
  vector: InvariantVector,
  hazardSummary: HazardSummary
): InvariantVector {
  // Compute threat exposure from hazard regions
  const maxThreat = hazardSummary.regions.reduce((max, r) => {
    const threatValue = r.threatLevel === 'critical' ? 1.0
      : r.threatLevel === 'high' ? 0.75
      : r.threatLevel === 'medium' ? 0.5
      : 0.25;
    return Math.max(max, threatValue);
  }, 0);
  
  return {
    ...vector,
    metrics: {
      ...vector.metrics,
      threat_exposure: toBucket('threat_exposure', maxThreat),
    },
  };
}
```

### 9.2 DO and DO NOT

**DO:**
- **DO** consume hazard summary from Belief Bus, not raw entity detections.
- **DO** bucket threat exposure using the same quantization as other metrics.
- **DO** treat threat_exposure as non-drifting (set externally, not decayed).
- **DO** include "retreat to safety" as a maintenance operator for threat_exposure.

**DO NOT:**
- **DO NOT** read raw entity positions or TrackSet directly in invariant layer.
- **DO NOT** model threat drift internally; threat comes from hazard summary only.
- **DO NOT** allow threat_exposure to directly trigger reflex actions (that's I-ext's job).

---

## 11. Certification gates

### 10.1 Proactivity test

```ts
describe('Maintenance proactivity', () => {
  it('schedules maintenance before violations occur', () => {
    const vector = createInvariantVector({ food_level: 3 });  // Bucket 3 of 5
    const schedule = scheduleMaintenance(vector, 0, 1000, mockInventory);
    
    // Should schedule eat_food before food_level hits warn threshold (bucket 2)
    expect(schedule.scheduled.length).toBeGreaterThan(0);
    const foodMaint = schedule.scheduled.find(s => s.operator.id === 'eat_food');
    expect(foodMaint).toBeDefined();
    expect(foodMaint!.scheduledAtTick).toBeLessThan(ticksToWarn(vector, 'food_level'));
  });
});
```

### 10.2 Disruption minimization test

```ts
describe('Disruption minimization', () => {
  it('batches maintenance to minimize goal interruption', () => {
    // Multiple metrics nearing violation
    const vector = createInvariantVector({
      food_level: 2,
      tool_durability: 1,
    });
    const schedule = scheduleMaintenance(vector, 0, 1000, mockInventory);
    
    // Should batch actions close together if possible
    const times = schedule.scheduled.map(s => s.scheduledAtTick);
    const spread = Math.max(...times) - Math.min(...times);
    expect(spread).toBeLessThan(200);  // Within ~10s at 20 ticks/s
  });
});
```

### 10.3 Explanation test

```ts
describe('Maintenance explanations', () => {
  it('provides rationale for each scheduled action', () => {
    const vector = createInvariantVector({ food_level: 2 });
    const schedule = scheduleMaintenance(vector, 0, 1000, mockInventory);
    
    expect(schedule.explanation).toContain('food_level');
    expect(schedule.explanation).toContain('warn threshold');
    
    for (const action of schedule.scheduled) {
      expect(action.reason).toBeTruthy();
      expect(action.projectedViolation).toBeDefined();
    }
  });
});
```

---

## 12. Definition of "done" for boundary milestone

### Core boundary criteria

- **Proactive scheduling:** Maintenance fires before violations.
- **Determinism:** Same state + drift → same schedule.
- **Bounded:** Metric buckets, finite horizon.
- **I-ext coupling:** Threat exposure from hazard summary; not in planning state.

### Acceptance checks (4 pivots)

All 4 pivot acceptance checks must pass.

---

## 13. Cross-references

- **Implementation plan**: `RIG_J_INVARIANT_MAINTENANCE_PLAN.md`
- **Rig I-ext**: `P21_RIG_I_EXT_IMPLEMENTATION_PLAN.md`, `P21_RIG_I_EXT_COMPANION_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P12)
- **Sterling domains**: `sterling-minecraft-domains.md` (Rig J section)

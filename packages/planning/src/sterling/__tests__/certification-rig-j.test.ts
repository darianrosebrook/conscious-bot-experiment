/**
 * Rig J Certification Tests — P12 Invariant Maintenance
 *
 * Tests all 5 P12 invariants across two domains:
 *   1. metric_buckets      — metrics are integer buckets
 *   2. deterministic_drift  — same state + ticks = same projection
 *   3. hazard_exclusion     — external metrics excluded from drift
 *   4. bounded_horizon      — no projection beyond MAX_HORIZON_TICKS
 *   5. proactive_emission   — maintenance before violations
 *
 * 36 tests across 9 describe blocks.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_HORIZON_TICKS,
  NUM_BUCKETS,
  P12_CONTRACT_VERSION,
  P12_INVARIANTS,
  toMetricBucket,
} from '../primitives/p12/p12-capsule-types.js';
import type {
  MetricBucket,
  P12InvariantVectorV1,
} from '../primitives/p12/p12-capsule-types.js';
import { P12ReferenceAdapter } from '../primitives/p12/p12-reference-adapter.js';
import {
  SURVIVAL_DRIFT_RATES,
  SURVIVAL_OPERATORS,
  SURVIVAL_SLOTS,
  VEHICLE_DRIFT_RATES,
  VEHICLE_OPERATORS,
  VEHICLE_SLOTS,
} from '../primitives/p12/p12-reference-fixtures.js';
import {
  MINECRAFT_DRIFT_RATES,
  MINECRAFT_MAINTENANCE_OPERATORS,
  MINECRAFT_METRIC_SLOTS,
} from '../../invariant/index.js';

const adapter = new P12ReferenceAdapter();

// ── Helpers ──────────────────────────────────────────────────────────

function makeVector(
  overrides: Record<string, MetricBucket>,
  tick = 0,
): P12InvariantVectorV1 {
  const metrics: Record<string, MetricBucket> = {};
  for (const slot of SURVIVAL_SLOTS) {
    metrics[slot.id] = overrides[slot.id] ?? (4 as MetricBucket); // default: full
  }
  return { metrics, lastUpdatedTick: tick };
}

function makeVehicleVector(
  overrides: Record<string, MetricBucket>,
  tick = 0,
): P12InvariantVectorV1 {
  const metrics: Record<string, MetricBucket> = {};
  for (const slot of VEHICLE_SLOTS) {
    metrics[slot.id] = overrides[slot.id] ?? (4 as MetricBucket);
  }
  return { metrics, lastUpdatedTick: tick };
}

// ── 1. Metric Buckets (Pivot 1) ──────────────────────────────────────

describe('P12 Invariant: metric_buckets', () => {
  it('toMetricBucket snaps to integer bucket', () => {
    // Food 10/20 → bucket 2 (middle)
    expect(toMetricBucket(10, 0, 20)).toBe(2);
  });

  it('toMetricBucket clamps below min', () => {
    expect(toMetricBucket(-5, 0, 20)).toBe(0);
  });

  it('toMetricBucket clamps above max', () => {
    expect(toMetricBucket(25, 0, 20)).toBe(4);
  });

  it('toMetricBucket returns integer for all survival ranges', () => {
    for (const slot of SURVIVAL_SLOTS) {
      const mid = (slot.range.min + slot.range.max) / 2;
      const bucket = toMetricBucket(mid, slot.range.min, slot.range.max);
      expect(Number.isInteger(bucket)).toBe(true);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(NUM_BUCKETS);
    }
  });

  it('initialized vector has only bucket values', () => {
    const vec = adapter.initializeVector(SURVIVAL_SLOTS, 0);
    for (const val of Object.values(vec.metrics)) {
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(NUM_BUCKETS);
    }
  });
});

// ── 2. Deterministic Drift (Pivot 2) ─────────────────────────────────

describe('P12 Invariant: deterministic_drift', () => {
  it('same vector + ticks yields identical projection', () => {
    const vec = makeVector({ food_level: 4 as MetricBucket });
    const results = Array.from({ length: 50 }, () =>
      adapter.projectDrift(vec, SURVIVAL_DRIFT_RATES, 500),
    );
    const first = JSON.stringify(results[0]);
    expect(results.every((r) => JSON.stringify(r) === first)).toBe(true);
  });

  it('food_level decays over time', () => {
    const vec = makeVector({ food_level: 4 as MetricBucket });
    const projected = adapter.projectDrift(vec, SURVIVAL_DRIFT_RATES, 600);
    expect(projected.metrics.food_level).toBeLessThan(4);
  });

  it('drift produces integer bucket values', () => {
    const vec = makeVector({ food_level: 4 as MetricBucket });
    const projected = adapter.projectDrift(vec, SURVIVAL_DRIFT_RATES, 300);
    for (const val of Object.values(projected.metrics)) {
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('drift never goes below 0', () => {
    const vec = makeVector({ food_level: 0 as MetricBucket });
    const projected = adapter.projectDrift(vec, SURVIVAL_DRIFT_RATES, MAX_HORIZON_TICKS);
    expect(projected.metrics.food_level).toBeGreaterThanOrEqual(0);
  });
});

// ── 3. Hazard Exclusion (Pivot 3) ────────────────────────────────────

describe('P12 Invariant: hazard_exclusion', () => {
  it('threat_exposure does not drift', () => {
    const vec = makeVector({ threat_exposure: 3 as MetricBucket });
    const projected = adapter.projectDrift(vec, SURVIVAL_DRIFT_RATES, 600);
    expect(projected.metrics.threat_exposure).toBe(3);
  });

  it('engine_temp (vehicle domain) does not drift', () => {
    const vec = makeVehicleVector({ engine_temp: 3 as MetricBucket });
    const projected = adapter.projectDrift(vec, VEHICLE_DRIFT_RATES, 600);
    expect(projected.metrics.engine_temp).toBe(3);
  });

  it('non-drifting metrics have no violation projection', () => {
    const vec = makeVector({ threat_exposure: 3 as MetricBucket });
    const violations = adapter.projectViolations(
      vec,
      SURVIVAL_SLOTS,
      SURVIVAL_DRIFT_RATES,
      600,
    );
    const threat = violations.find((v) => v.slotId === 'threat_exposure');
    expect(threat).toBeDefined();
    expect(threat!.ticksToWarn).toBeNull();
    expect(threat!.ticksToCritical).toBeNull();
  });

  it('drifting metrics DO have violation projections when near threshold', () => {
    // Use faster decay so violation falls within MAX_HORIZON_TICKS
    const fastDrift = SURVIVAL_DRIFT_RATES.map((r) =>
      r.slotId === 'food_level' ? { ...r, decayPerTick: 0.005 } : r,
    );
    const vec = makeVector({ food_level: 3 as MetricBucket });
    const violations = adapter.projectViolations(
      vec,
      SURVIVAL_SLOTS,
      fastDrift,
      MAX_HORIZON_TICKS,
    );
    const food = violations.find((v) => v.slotId === 'food_level');
    expect(food).toBeDefined();
    // food at bucket 3, warn at 2, decay 0.005: ticksToWarn = (3-2)/0.005 = 200 < 600
    expect(food!.ticksToWarn).not.toBeNull();
    expect(food!.ticksToWarn).toBeCloseTo(200, 0);
  });
});

// ── 4. Bounded Horizon (Pivot 4) ─────────────────────────────────────

describe('P12 Invariant: bounded_horizon', () => {
  it('projectDrift clamps to MAX_HORIZON_TICKS', () => {
    const vec = makeVector({ food_level: 4 as MetricBucket });
    const projected600 = adapter.projectDrift(vec, SURVIVAL_DRIFT_RATES, MAX_HORIZON_TICKS);
    const projected9999 = adapter.projectDrift(vec, SURVIVAL_DRIFT_RATES, 9999);
    // Both should produce the same result since 9999 is clamped to 600
    expect(JSON.stringify(projected9999)).toBe(JSON.stringify(projected600));
  });

  it('projectViolations clamps horizon', () => {
    const vec = makeVector({ food_level: 4 as MetricBucket });
    const v600 = adapter.projectViolations(vec, SURVIVAL_SLOTS, SURVIVAL_DRIFT_RATES, MAX_HORIZON_TICKS);
    const v9999 = adapter.projectViolations(vec, SURVIVAL_SLOTS, SURVIVAL_DRIFT_RATES, 9999);
    expect(JSON.stringify(v9999)).toBe(JSON.stringify(v600));
  });

  it('schedule respects MAX_HORIZON_TICKS', () => {
    const vec = makeVector({ food_level: 4 as MetricBucket });
    const schedule = adapter.scheduleMaintenance(
      vec,
      SURVIVAL_SLOTS,
      SURVIVAL_DRIFT_RATES,
      SURVIVAL_OPERATORS,
      9999,
    );
    expect(schedule.horizonTicks).toBe(MAX_HORIZON_TICKS);
  });

  it('MAX_HORIZON_TICKS is 600', () => {
    expect(MAX_HORIZON_TICKS).toBe(600);
  });
});

// ── 5. Proactive Emission (Pivot 5) ──────────────────────────────────

describe('P12 Invariant: proactive_emission', () => {
  it('schedules maintenance before warn threshold is reached', () => {
    // Use faster decay so violation falls within MAX_HORIZON_TICKS
    const fastDrift = SURVIVAL_DRIFT_RATES.map((r) =>
      r.slotId === 'food_level' ? { ...r, decayPerTick: 0.005 } : r,
    );
    // food at bucket 3, warn at 2, decay 0.005: ticksToWarn = (3-2)/0.005 = 200
    const vec = makeVector({ food_level: 3 as MetricBucket }, 100);
    const schedule = adapter.scheduleMaintenance(
      vec,
      SURVIVAL_SLOTS,
      fastDrift,
      SURVIVAL_OPERATORS,
      MAX_HORIZON_TICKS,
    );
    const foodMaint = schedule.scheduled.find((s) => s.operatorId === 'eat_food');
    expect(foodMaint).toBeDefined();

    // Schedule at 80% of ticksToWarn: 100 + floor(200 * 0.8) = 100 + 160 = 260
    // Must be before warn time (100 + 200 = 300)
    expect(foodMaint!.scheduledAtTick).toBe(260);
    expect(foodMaint!.scheduledAtTick).toBeLessThan(300);
  });

  it('does not schedule when no violation is projected', () => {
    const vec = makeVector({}); // All at bucket 4 (full)
    const schedule = adapter.scheduleMaintenance(
      vec,
      SURVIVAL_SLOTS,
      SURVIVAL_DRIFT_RATES,
      SURVIVAL_OPERATORS,
      100, // Short horizon — no violations within 100 ticks
    );
    // With food at 4, warn at 2, decay 0.001: ticksToWarn = 2000 > 100
    // No food maintenance should be scheduled
    const foodMaint = schedule.scheduled.find((s) => s.operatorId === 'eat_food');
    expect(foodMaint).toBeUndefined();
  });

  it('schedules immediately when already at warn level', () => {
    // Use faster decay so critical violation is within horizon
    const fastDrift = SURVIVAL_DRIFT_RATES.map((r) =>
      r.slotId === 'food_level' ? { ...r, decayPerTick: 0.005 } : r,
    );
    // food at bucket 2 (== warn), critical at 1, decay 0.005:
    // ticksToWarn = null (already at warn), ticksToCritical = (2-1)/0.005 = 200
    const vec = makeVector({ food_level: 2 as MetricBucket }, 50);
    const schedule = adapter.scheduleMaintenance(
      vec,
      SURVIVAL_SLOTS,
      fastDrift,
      SURVIVAL_OPERATORS,
      MAX_HORIZON_TICKS,
    );
    const foodMaint = schedule.scheduled.find((s) => s.operatorId === 'eat_food');
    expect(foodMaint).toBeDefined();
    // ticksToWarn is null → schedule immediately at currentTick
    expect(foodMaint!.scheduledAtTick).toBe(50);
  });

  it('provides explanation for scheduled actions', () => {
    // Use faster decay so violation falls within horizon
    const fastDrift = SURVIVAL_DRIFT_RATES.map((r) =>
      r.slotId === 'food_level' ? { ...r, decayPerTick: 0.005 } : r,
    );
    const vec = makeVector({ food_level: 3 as MetricBucket });
    const schedule = adapter.scheduleMaintenance(
      vec,
      SURVIVAL_SLOTS,
      fastDrift,
      SURVIVAL_OPERATORS,
      MAX_HORIZON_TICKS,
    );
    expect(schedule.explanation).toContain('food_level');
  });
});

// ── 6. Operator Application ──────────────────────────────────────────

describe('P12 Operator application', () => {
  it('restores metric by restoreAmount', () => {
    const vec = makeVector({ food_level: 1 as MetricBucket });
    const eatOp = SURVIVAL_OPERATORS.find((o) => o.id === 'eat_food')!;
    const restored = adapter.applyOperator(vec, eatOp, 100);
    expect(restored.metrics.food_level).toBe(3); // 1 + 2 = 3
  });

  it('clamps restore to NUM_BUCKETS - 1', () => {
    const vec = makeVector({ tool_durability: 2 as MetricBucket });
    const repairOp = SURVIVAL_OPERATORS.find((o) => o.id === 'repair_tool')!;
    const restored = adapter.applyOperator(vec, repairOp, 100);
    expect(restored.metrics.tool_durability).toBe(4); // 2 + 4 = 6 → clamped to 4
  });

  it('updates lastUpdatedTick', () => {
    const vec = makeVector({ food_level: 1 as MetricBucket }, 50);
    const eatOp = SURVIVAL_OPERATORS.find((o) => o.id === 'eat_food')!;
    const restored = adapter.applyOperator(vec, eatOp, 200);
    expect(restored.lastUpdatedTick).toBe(200);
  });

  it('operator application is deterministic', () => {
    const vec = makeVector({ food_level: 1 as MetricBucket });
    const eatOp = SURVIVAL_OPERATORS.find((o) => o.id === 'eat_food')!;
    const results = Array.from({ length: 50 }, () =>
      adapter.applyOperator(vec, eatOp, 100),
    );
    const first = JSON.stringify(results[0]);
    expect(results.every((r) => JSON.stringify(r) === first)).toBe(true);
  });
});

// ── 7. Multi-Domain Portability ──────────────────────────────────────

describe('P12 Multi-domain portability', () => {
  it('vehicle domain initializes correctly', () => {
    const vec = adapter.initializeVector(VEHICLE_SLOTS, 0);
    expect(Object.keys(vec.metrics)).toHaveLength(4);
    for (const val of Object.values(vec.metrics)) {
      expect(val).toBe(4); // All start at full
    }
  });

  it('vehicle fuel drifts down', () => {
    const vec = makeVehicleVector({ fuel_level: 4 as MetricBucket });
    const projected = adapter.projectDrift(vec, VEHICLE_DRIFT_RATES, 600);
    expect(projected.metrics.fuel_level).toBeLessThan(4);
  });

  it('vehicle refuel restores fuel', () => {
    const vec = makeVehicleVector({ fuel_level: 0 as MetricBucket });
    const refuelOp = VEHICLE_OPERATORS.find((o) => o.id === 'refuel')!;
    const restored = adapter.applyOperator(vec, refuelOp, 100);
    expect(restored.metrics.fuel_level).toBe(4); // 0 + 4 = 4
  });

  it('vehicle domain schedules maintenance', () => {
    const vec = makeVehicleVector({ fuel_level: 2 as MetricBucket });
    const schedule = adapter.scheduleMaintenance(
      vec,
      VEHICLE_SLOTS,
      VEHICLE_DRIFT_RATES,
      VEHICLE_OPERATORS,
      MAX_HORIZON_TICKS,
    );
    const fuelMaint = schedule.scheduled.find((s) => s.operatorId === 'refuel');
    expect(fuelMaint).toBeDefined();
  });

  it('survival and vehicle use same adapter', () => {
    // Both domains work with the same P12ReferenceAdapter instance
    const survivalVec = adapter.initializeVector(SURVIVAL_SLOTS, 0);
    const vehicleVec = adapter.initializeVector(VEHICLE_SLOTS, 0);
    expect(Object.keys(survivalVec.metrics).length).toBe(6);
    expect(Object.keys(vehicleVec.metrics).length).toBe(4);
  });
});

// ── 8. Minecraft Invariant Module ────────────────────────────────────

describe('P12 Minecraft invariant module', () => {
  it('defines 6 metric slots', () => {
    expect(MINECRAFT_METRIC_SLOTS).toHaveLength(6);
    const ids = MINECRAFT_METRIC_SLOTS.map((s) => s.id);
    expect(ids).toContain('food_level');
    expect(ids).toContain('health_level');
    expect(ids).toContain('tool_durability');
    expect(ids).toContain('light_coverage');
    expect(ids).toContain('threat_exposure');
    expect(ids).toContain('time_to_night');
  });

  it('defines 6 drift rates', () => {
    expect(MINECRAFT_DRIFT_RATES).toHaveLength(6);
    const threatRate = MINECRAFT_DRIFT_RATES.find((r) => r.slotId === 'threat_exposure');
    expect(threatRate?.decayPerTick).toBe(0); // External metric
  });

  it('defines 6 maintenance operators', () => {
    expect(MINECRAFT_MAINTENANCE_OPERATORS).toHaveLength(6);
  });

  it('Minecraft metrics work with reference adapter', () => {
    const vec = adapter.initializeVector(MINECRAFT_METRIC_SLOTS, 0);
    expect(Object.keys(vec.metrics)).toHaveLength(6);
    const projected = adapter.projectDrift(vec, MINECRAFT_DRIFT_RATES, 500);
    expect(projected.metrics.threat_exposure).toBe(4); // No drift
    expect(projected.metrics.food_level).toBeLessThan(4); // Drifts
  });
});

// ── 9. P12 Contract Metadata ─────────────────────────────────────────

describe('P12 contract metadata', () => {
  it('has 5 invariants', () => {
    expect(P12_INVARIANTS).toHaveLength(5);
  });

  it('invariant names match expected pivots', () => {
    expect(P12_INVARIANTS).toContain('metric_buckets');
    expect(P12_INVARIANTS).toContain('deterministic_drift');
    expect(P12_INVARIANTS).toContain('hazard_exclusion');
    expect(P12_INVARIANTS).toContain('bounded_horizon');
    expect(P12_INVARIANTS).toContain('proactive_emission');
  });

  it('contract version is p12.v1', () => {
    expect(P12_CONTRACT_VERSION).toBe('p12.v1');
  });

  it('NUM_BUCKETS is 5', () => {
    expect(NUM_BUCKETS).toBe(5);
  });

  it('adapter exposes correct constants', () => {
    expect(adapter.maxHorizonTicks).toBe(MAX_HORIZON_TICKS);
    expect(adapter.numBuckets).toBe(NUM_BUCKETS);
  });
});

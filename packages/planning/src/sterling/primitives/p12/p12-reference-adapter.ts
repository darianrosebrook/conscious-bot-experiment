/**
 * P12 Reference Adapter — Portable Invariant Maintenance Implementation
 *
 * Satisfies all 5 P12 invariants:
 *   1. metric_buckets      — all values are MetricBucket integers
 *   2. deterministic_drift  — same state + ticks = same projection
 *   3. hazard_exclusion     — external metrics excluded from drift
 *   4. bounded_horizon      — no projection beyond MAX_HORIZON_TICKS
 *   5. proactive_emission   — scheduled before violations, not after
 *
 * Zero Minecraft imports. Zero vitest imports.
 */

import {
  type MetricBucket,
  type P12DriftRateV1,
  type P12InvariantAdapter,
  type P12InvariantVectorV1,
  type P12MaintenanceOperatorV1,
  type P12MaintenanceScheduleV1,
  type P12MetricSlotV1,
  type P12ScheduledMaintenanceV1,
  type P12ViolationProjectionV1,
  MAX_HORIZON_TICKS,
  NUM_BUCKETS,
  toMetricBucket,
} from './p12-capsule-types.js';

export class P12ReferenceAdapter implements P12InvariantAdapter {
  readonly maxHorizonTicks = MAX_HORIZON_TICKS;
  readonly numBuckets = NUM_BUCKETS;

  initializeVector(
    slots: readonly P12MetricSlotV1[],
    tick: number,
  ): P12InvariantVectorV1 {
    const metrics: Record<string, MetricBucket> = {};
    for (const slot of slots) {
      // Start at full (best state)
      metrics[slot.id] = (NUM_BUCKETS - 1) as MetricBucket;
    }
    return { metrics, lastUpdatedTick: tick };
  }

  toBucket(slot: P12MetricSlotV1, rawValue: number): MetricBucket {
    return toMetricBucket(rawValue, slot.range.min, slot.range.max);
  }

  projectDrift(
    vector: P12InvariantVectorV1,
    driftRates: readonly P12DriftRateV1[],
    ticks: number,
  ): P12InvariantVectorV1 {
    // Pivot 4: bound horizon
    const clampedTicks = Math.min(ticks, MAX_HORIZON_TICKS);
    const projected: Record<string, MetricBucket> = { ...vector.metrics };

    for (const rate of driftRates) {
      if (rate.decayPerTick <= 0) continue; // Pivot 3: skip non-drifting
      if (!(rate.slotId in vector.metrics)) continue;

      const current = vector.metrics[rate.slotId];
      const rawProjected = current - rate.decayPerTick * clampedTicks;
      // Clamp to [0, NUM_BUCKETS - 1] and floor to integer bucket
      projected[rate.slotId] = Math.max(
        0,
        Math.min(NUM_BUCKETS - 1, Math.floor(rawProjected)),
      ) as MetricBucket;
    }

    return {
      metrics: projected,
      lastUpdatedTick: vector.lastUpdatedTick + clampedTicks,
    };
  }

  projectViolations(
    vector: P12InvariantVectorV1,
    slots: readonly P12MetricSlotV1[],
    driftRates: readonly P12DriftRateV1[],
    horizonTicks: number,
  ): readonly P12ViolationProjectionV1[] {
    const clampedHorizon = Math.min(horizonTicks, MAX_HORIZON_TICKS);
    const projections: P12ViolationProjectionV1[] = [];

    for (const slot of slots) {
      const currentBucket = vector.metrics[slot.id];
      if (currentBucket === undefined) continue;

      const rate = driftRates.find((r) => r.slotId === slot.id);

      // Non-drifting or no rate: no violation projected
      if (!slot.drifts || !rate || rate.decayPerTick <= 0) {
        projections.push({
          slotId: slot.id,
          currentBucket,
          projectedBucket: currentBucket,
          ticksToWarn: null,
          ticksToCritical: null,
        });
        continue;
      }

      // Compute ticks to reach each threshold
      // Thresholds use "at or below" semantics: violation when metric <= threshold
      const ticksToWarn =
        currentBucket > slot.warnThreshold
          ? (currentBucket - slot.warnThreshold) / rate.decayPerTick
          : null;

      const ticksToCritical =
        currentBucket > slot.criticalThreshold
          ? (currentBucket - slot.criticalThreshold) / rate.decayPerTick
          : null;

      const rawProjectedAtHorizon =
        currentBucket - rate.decayPerTick * clampedHorizon;
      const projectedBucket = Math.max(
        0,
        Math.min(NUM_BUCKETS - 1, Math.floor(rawProjectedAtHorizon)),
      ) as MetricBucket;

      projections.push({
        slotId: slot.id,
        currentBucket,
        projectedBucket,
        ticksToWarn:
          ticksToWarn !== null && ticksToWarn <= clampedHorizon
            ? ticksToWarn
            : null,
        ticksToCritical:
          ticksToCritical !== null && ticksToCritical <= clampedHorizon
            ? ticksToCritical
            : null,
      });
    }

    return projections;
  }

  applyOperator(
    vector: P12InvariantVectorV1,
    operator: P12MaintenanceOperatorV1,
    tick: number,
  ): P12InvariantVectorV1 {
    const current = vector.metrics[operator.targetSlotId] ?? 0;
    const restored = Math.min(
      NUM_BUCKETS - 1,
      current + operator.restoreAmount,
    ) as MetricBucket;

    return {
      metrics: { ...vector.metrics, [operator.targetSlotId]: restored },
      lastUpdatedTick: tick,
    };
  }

  scheduleMaintenance(
    vector: P12InvariantVectorV1,
    slots: readonly P12MetricSlotV1[],
    driftRates: readonly P12DriftRateV1[],
    operators: readonly P12MaintenanceOperatorV1[],
    horizonTicks: number,
  ): P12MaintenanceScheduleV1 {
    const clampedHorizon = Math.min(horizonTicks, MAX_HORIZON_TICKS);
    const violations = this.projectViolations(
      vector,
      slots,
      driftRates,
      clampedHorizon,
    );
    const scheduled: P12ScheduledMaintenanceV1[] = [];

    for (const v of violations) {
      // Only schedule if a violation is projected within the horizon
      if (v.ticksToCritical === null && v.ticksToWarn === null) continue;

      // Find applicable operators for this slot
      const applicable = operators.filter(
        (op) => op.targetSlotId === v.slotId,
      );
      if (applicable.length === 0) continue;

      // Deterministic selection: lowest total cost, then lexicographic by ID
      const sorted = [...applicable].sort((a, b) => {
        const costA = totalCost(a.cost);
        const costB = totalCost(b.cost);
        if (costA !== costB) return costA - costB;
        return a.id.localeCompare(b.id);
      });
      const best = sorted[0];

      // Pivot 5: schedule BEFORE warn threshold (80% of time to warn)
      const scheduleAt =
        v.ticksToWarn !== null
          ? vector.lastUpdatedTick + Math.floor(v.ticksToWarn * 0.8)
          : vector.lastUpdatedTick; // Already at/past warn → schedule immediately

      scheduled.push({
        operatorId: best.id,
        scheduledAtTick: scheduleAt,
        reason: `${v.slotId} projected to reach warn threshold in ${v.ticksToWarn?.toFixed(0) ?? '0'} ticks`,
        projectedViolation: v,
        totalCost: totalCost(best.cost),
      });
    }

    // Sort by schedule time, then by operator ID for determinism
    scheduled.sort((a, b) => {
      if (a.scheduledAtTick !== b.scheduledAtTick)
        return a.scheduledAtTick - b.scheduledAtTick;
      return a.operatorId.localeCompare(b.operatorId);
    });

    return {
      currentTick: vector.lastUpdatedTick,
      horizonTicks: clampedHorizon,
      scheduled,
      explanation: generateExplanation(scheduled),
    };
  }
}

function totalCost(cost: P12MaintenanceOperatorV1['cost']): number {
  return cost.resource + cost.disruption + cost.risk;
}

function generateExplanation(
  scheduled: readonly P12ScheduledMaintenanceV1[],
): string {
  if (scheduled.length === 0) return 'No maintenance needed within horizon.';
  return scheduled.map((s) => `${s.operatorId}: ${s.reason}`).join('; ');
}

/**
 * P21 Reference Fixtures — Two Domain Fixture Sets
 *
 * Runtime-safe (no vitest). Classifiers use closures, not `this`.
 *
 * Each domain provides:
 * - A P21RiskClassifier (closure-based, safe for destructuring)
 * - A canonical evidence stream (~30 ticks) exercising every lifecycle phase:
 *   appearance, warmup, approach, risk escalation, occlusion gap,
 *   reappearance (identity persistence), stable quiescence,
 *   disappearance, pUnknown drift
 */

import type { P21EvidenceBatch, P21RiskClassifier } from './p21-capsule-types';

// ── Domain A: Hostile-mob-like (Minecraft-shaped) ───────────────────

const MOB_RISK_CLASSES = new Set(['zombie', 'skeleton', 'creeper']);

export const MOB_DOMAIN_CLASSIFIER: P21RiskClassifier = {
  riskClasses: MOB_RISK_CLASSES,
  classifyRisk(classLabel, proximityBucket, pUnknown) {
    if (pUnknown > 0.5) return 'none';
    if (!MOB_RISK_CLASSES.has(classLabel)) return 'none';
    if (proximityBucket <= 1) return 'critical';
    if (proximityBucket <= 3) return 'high';
    if (proximityBucket <= 5) return 'medium';
    return 'low';
  },
};

// ── Domain B: Security monitoring (actor tracking) ──────────────────

const SECURITY_RISK_CLASSES = new Set(['intruder', 'tailgater']);

export const SECURITY_DOMAIN_CLASSIFIER: P21RiskClassifier = {
  riskClasses: SECURITY_RISK_CLASSES,
  classifyRisk(classLabel, proximityBucket, pUnknown) {
    if (pUnknown > 0.5) return 'none';
    if (!SECURITY_RISK_CLASSES.has(classLabel)) return 'none';
    if (proximityBucket <= 1) return 'critical';
    if (proximityBucket <= 2) return 'high';
    return 'medium';
  },
};

// ── Helper: build an evidence item with defaults ────────────────────

function item(
  entityId: number,
  classLabel: string,
  classEnum: number,
  proximityBucket: number,
  pos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  los: 'visible' | 'occluded' | 'unknown' = 'visible',
  features?: Record<string, number | string>,
) {
  return {
    entityId,
    classLabel,
    classEnum,
    posBucketX: pos.x,
    posBucketY: pos.y,
    posBucketZ: pos.z,
    proximityBucket,
    los,
    ...(features !== undefined ? { features } : {}),
  };
}

// ── Mob Domain Stream (30 ticks) ────────────────────────────────────
//
// Timeline:
//   t1-2:   zombie #100 appears at dist 6 (low risk), warmup
//   t3-4:   zombie approaches dist 4 (high risk)
//   t5-6:   skeleton #200 appears at dist 7, warmup
//   t7-8:   zombie reaches dist 2 (critical)
//   t9-13:  zombie occluded for 5 ticks (identity persistence gap)
//   t14-15: zombie reappears at dist 3 (should associate to same trackId)
//   t16-20: stable scene, no deltas (quiescence)
//   t21:    zombie disappears (track_lost after decay)
//   t22-26: only skeleton, pUnknown drifts on zombie
//   t27-28: creeper #300 with features field
//   t29-30: all entities gone, decay phase

export const MOB_DOMAIN_STREAM: P21EvidenceBatch[] = [
  // t1: zombie appears far away
  { tickId: 1, items: [item(100, 'zombie', 1, 6, { x: 10, y: 64, z: 0 })] },
  // t2: zombie warmup confirmation
  { tickId: 2, items: [item(100, 'zombie', 1, 6, { x: 10, y: 64, z: 0 })] },
  // t3: zombie approaches
  { tickId: 3, items: [item(100, 'zombie', 1, 4, { x: 7, y: 64, z: 0 })] },
  // t4: zombie still approaching
  { tickId: 4, items: [item(100, 'zombie', 1, 3, { x: 5, y: 64, z: 0 })] },
  // t5: skeleton appears + zombie still present
  {
    tickId: 5,
    items: [
      item(100, 'zombie', 1, 3, { x: 5, y: 64, z: 0 }),
      item(200, 'skeleton', 2, 7, { x: -15, y: 64, z: 5 }),
    ],
  },
  // t6: skeleton warmup
  {
    tickId: 6,
    items: [
      item(100, 'zombie', 1, 2, { x: 3, y: 64, z: 0 }),
      item(200, 'skeleton', 2, 7, { x: -15, y: 64, z: 5 }),
    ],
  },
  // t7: zombie close, skeleton stable
  {
    tickId: 7,
    items: [
      item(100, 'zombie', 1, 2, { x: 3, y: 64, z: 0 }),
      item(200, 'skeleton', 2, 6, { x: -13, y: 64, z: 4 }),
    ],
  },
  // t8: zombie very close (critical)
  {
    tickId: 8,
    items: [
      item(100, 'zombie', 1, 1, { x: 1, y: 64, z: 0 }),
      item(200, 'skeleton', 2, 6, { x: -13, y: 64, z: 4 }),
    ],
  },
  // t9-13: zombie occluded (identity persistence gap)
  { tickId: 9, items: [item(200, 'skeleton', 2, 6, { x: -13, y: 64, z: 4 })] },
  { tickId: 10, items: [item(200, 'skeleton', 2, 6, { x: -13, y: 64, z: 4 })] },
  { tickId: 11, items: [item(200, 'skeleton', 2, 5, { x: -11, y: 64, z: 3 })] },
  { tickId: 12, items: [item(200, 'skeleton', 2, 5, { x: -11, y: 64, z: 3 })] },
  { tickId: 13, items: [item(200, 'skeleton', 2, 5, { x: -11, y: 64, z: 3 })] },
  // t14: zombie reappears nearby (should associate to same track)
  {
    tickId: 14,
    items: [
      item(100, 'zombie', 1, 3, { x: 4, y: 64, z: 1 }),
      item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 }),
    ],
  },
  // t15: stable
  {
    tickId: 15,
    items: [
      item(100, 'zombie', 1, 3, { x: 4, y: 64, z: 1 }),
      item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 }),
    ],
  },
  // t16-20: quiescent (same observations, no change)
  {
    tickId: 16,
    items: [
      item(100, 'zombie', 1, 3, { x: 4, y: 64, z: 1 }),
      item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 }),
    ],
  },
  {
    tickId: 17,
    items: [
      item(100, 'zombie', 1, 3, { x: 4, y: 64, z: 1 }),
      item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 }),
    ],
  },
  {
    tickId: 18,
    items: [
      item(100, 'zombie', 1, 3, { x: 4, y: 64, z: 1 }),
      item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 }),
    ],
  },
  {
    tickId: 19,
    items: [
      item(100, 'zombie', 1, 3, { x: 4, y: 64, z: 1 }),
      item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 }),
    ],
  },
  {
    tickId: 20,
    items: [
      item(100, 'zombie', 1, 3, { x: 4, y: 64, z: 1 }),
      item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 }),
    ],
  },
  // t21: zombie disappears, skeleton still there
  { tickId: 21, items: [item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 })] },
  // t22-26: skeleton only, zombie pUnknown drifts
  { tickId: 22, items: [item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 })] },
  { tickId: 23, items: [item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 })] },
  { tickId: 24, items: [item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 })] },
  { tickId: 25, items: [item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 })] },
  { tickId: 26, items: [item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 })] },
  // t27: creeper appears with features field
  {
    tickId: 27,
    items: [
      item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 }),
      item(300, 'creeper', 3, 4, { x: 8, y: 64, z: -2 }, 'visible', { fuse_state: 'idle' }),
    ],
  },
  // t28: creeper warmup with different features (should not affect trackId)
  {
    tickId: 28,
    items: [
      item(200, 'skeleton', 2, 5, { x: -10, y: 64, z: 3 }),
      item(300, 'creeper', 3, 4, { x: 8, y: 64, z: -2 }, 'visible', { fuse_state: 'hissing' }),
    ],
  },
  // t29-30: all entities gone, decay phase
  { tickId: 29, items: [] },
  { tickId: 30, items: [] },
];

// ── Security Domain Stream (30 ticks) ───────────────────────────────
//
// Timeline:
//   t1-2:   employee #10 appears at dist 3 (no risk), warmup
//   t3-4:   intruder #20 appears at dist 5 (medium risk), warmup
//   t5-7:   intruder approaches dist 2 (high)
//   t8-9:   intruder reaches dist 1 (critical)
//   t10-14: intruder occluded (identity persistence gap)
//   t15-16: intruder reappears
//   t17-20: stable quiescence
//   t21-22: tailgater #30 appears with features
//   t23-25: intruder leaves (disappears)
//   t26-28: tailgater approaches (risk escalation)
//   t29-30: all gone, decay

export const SECURITY_DOMAIN_STREAM: P21EvidenceBatch[] = [
  // t1: employee appears (no risk)
  { tickId: 1, items: [item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 })] },
  // t2: employee warmup
  { tickId: 2, items: [item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 })] },
  // t3: intruder appears
  {
    tickId: 3,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 5, { x: -10, y: 0, z: -3 }),
    ],
  },
  // t4: intruder warmup
  {
    tickId: 4,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 5, { x: -10, y: 0, z: -3 }),
    ],
  },
  // t5: intruder approaches
  {
    tickId: 5,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 3, { x: -6, y: 0, z: -2 }),
    ],
  },
  // t6: intruder closer
  {
    tickId: 6,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 2, { x: -4, y: 0, z: -1 }),
    ],
  },
  // t7: intruder at high risk
  {
    tickId: 7,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 2, { x: -4, y: 0, z: -1 }),
    ],
  },
  // t8: intruder at critical
  {
    tickId: 8,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 1, { x: -2, y: 0, z: 0 }),
    ],
  },
  // t9: intruder still critical
  {
    tickId: 9,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 1, { x: -2, y: 0, z: 0 }),
    ],
  },
  // t10-14: intruder occluded (identity persistence gap)
  { tickId: 10, items: [item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 })] },
  { tickId: 11, items: [item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 })] },
  { tickId: 12, items: [item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 })] },
  { tickId: 13, items: [item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 })] },
  { tickId: 14, items: [item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 })] },
  // t15: intruder reappears
  {
    tickId: 15,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 2, { x: -3, y: 0, z: 0 }),
    ],
  },
  // t16: stable
  {
    tickId: 16,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 2, { x: -3, y: 0, z: 0 }),
    ],
  },
  // t17-20: quiescence
  {
    tickId: 17,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 2, { x: -3, y: 0, z: 0 }),
    ],
  },
  {
    tickId: 18,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 2, { x: -3, y: 0, z: 0 }),
    ],
  },
  {
    tickId: 19,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 2, { x: -3, y: 0, z: 0 }),
    ],
  },
  {
    tickId: 20,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 2, { x: -3, y: 0, z: 0 }),
    ],
  },
  // t21: tailgater appears with features
  {
    tickId: 21,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 2, { x: -3, y: 0, z: 0 }),
      item(30, 'tailgater', 201, 4, { x: 8, y: 0, z: 5 }, 'visible', { badge: 'none' }),
    ],
  },
  // t22: tailgater warmup
  {
    tickId: 22,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(20, 'intruder', 200, 2, { x: -3, y: 0, z: 0 }),
      item(30, 'tailgater', 201, 4, { x: 8, y: 0, z: 5 }, 'visible', { badge: 'forged' }),
    ],
  },
  // t23: intruder leaves
  {
    tickId: 23,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(30, 'tailgater', 201, 3, { x: 6, y: 0, z: 3 }),
    ],
  },
  // t24: intruder still gone
  {
    tickId: 24,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(30, 'tailgater', 201, 3, { x: 6, y: 0, z: 3 }),
    ],
  },
  // t25: intruder still gone
  {
    tickId: 25,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(30, 'tailgater', 201, 3, { x: 6, y: 0, z: 3 }),
    ],
  },
  // t26: tailgater approaches
  {
    tickId: 26,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(30, 'tailgater', 201, 2, { x: 4, y: 0, z: 2 }),
    ],
  },
  // t27: tailgater closer
  {
    tickId: 27,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(30, 'tailgater', 201, 1, { x: 2, y: 0, z: 1 }),
    ],
  },
  // t28: tailgater critical
  {
    tickId: 28,
    items: [
      item(10, 'employee', 100, 3, { x: 5, y: 0, z: 2 }),
      item(30, 'tailgater', 201, 1, { x: 2, y: 0, z: 1 }),
    ],
  },
  // t29-30: all gone, decay
  { tickId: 29, items: [] },
  { tickId: 30, items: [] },
];

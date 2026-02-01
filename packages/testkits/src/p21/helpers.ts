/**
 * P21 Conformance Suite — Shared Helpers
 *
 * Extracted from the original conformance suite to be reused
 * by both P21-A and P21-B conformance factories.
 */

import type {
  P21EvidenceItem,
  P21EvidenceBatch,
  P21RiskLevel,
  P21RiskClassifier,
} from '../../../planning/src/sterling/primitives/p21/p21-capsule-types';
import { RISK_LEVEL_ORDER } from '../../../planning/src/sterling/primitives/p21/p21-capsule-types';

/** Create a P21EvidenceItem with sensible defaults. */
export function makeItem(overrides: Partial<P21EvidenceItem> = {}): P21EvidenceItem {
  return {
    entityId: 0,
    classLabel: 'zombie',
    classEnum: 1,
    posBucketX: 5,
    posBucketY: 64,
    posBucketZ: 0,
    proximityBucket: 3,
    los: 'visible',
    ...overrides,
  };
}

/** Wrap items into a P21EvidenceBatch. */
export function batch(tickId: number, items: P21EvidenceItem[]): P21EvidenceBatch {
  return { tickId, items };
}

/** Get the ordinal rank of a risk level. */
export function riskOrd(level: P21RiskLevel): number {
  return RISK_LEVEL_ORDER[level];
}

/** Get the first risk class label from a classifier. */
export function firstRiskClass(classifier: P21RiskClassifier): string {
  return [...classifier.riskClasses][0];
}

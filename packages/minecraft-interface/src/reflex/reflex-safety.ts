/**
 * Reflex Safety Consumer
 *
 * Reads TrackSet snapshots and produces immediate threat assessments
 * for the reflex layer. Does NOT call cognition or LLM.
 *
 * Maps TrackSummary → threat assessment compatible with safety-reflexes.ts.
 */

import type { Snapshot, TrackSummary, ThreatLevel } from '../entity-belief/types';

export interface ReflexThreatAssessment {
  hasCriticalThreat: boolean;
  threats: ReflexThreat[];
  recommendedAction: 'none' | 'evade' | 'shield' | 'flee';
}

export interface ReflexThreat {
  trackId: string;
  classLabel: string;
  threatLevel: ThreatLevel;
  distBucket: number;
  visibility: string;
}

/**
 * Assess immediate reflex threats from a belief snapshot.
 * Runs on every tick (200ms) — must be fast, no async, no LLM.
 */
export function assessReflexThreats(snapshot: Snapshot): ReflexThreatAssessment {
  const threats: ReflexThreat[] = [];
  let hasCritical = false;
  let hasHigh = false;

  for (const track of snapshot.tracks) {
    if (track.visibility === 'lost') continue;
    if (track.threatLevel === 'none') continue;

    threats.push({
      trackId: track.trackId,
      classLabel: track.classLabel,
      threatLevel: track.threatLevel,
      distBucket: track.distBucket,
      visibility: track.visibility,
    });

    if (track.threatLevel === 'critical') hasCritical = true;
    if (track.threatLevel === 'high') hasHigh = true;
  }

  let recommendedAction: ReflexThreatAssessment['recommendedAction'] = 'none';
  if (hasCritical) {
    recommendedAction = 'flee';
  } else if (hasHigh) {
    recommendedAction = 'evade';
  } else if (threats.length > 0) {
    recommendedAction = 'shield';
  }

  return {
    hasCriticalThreat: hasCritical,
    threats,
    recommendedAction,
  };
}

/**
 * Map a snapshot to ExecutionSnapshot format for compatibility with
 * the existing safety-reflexes.ts interface.
 */
export function toExecutionSnapshot(
  snapshot: Snapshot
): { nearbyEntities: Array<{ type: string; distance: number; threatLevel: string }> } {
  return {
    nearbyEntities: snapshot.tracks
      .filter((t) => t.visibility !== 'lost')
      .map((t) => ({
        type: t.classLabel,
        distance: t.distBucket * 2, // Approximate distance from bucket
        threatLevel: t.threatLevel,
      })),
  };
}

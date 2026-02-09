/**
 * Minecraft Evidence Extraction — Domain-Specific P11 Content
 *
 * Maps Minecraft observations to P11 evidence payloads.
 * This is the boundary where game-specific data becomes
 * domain-agnostic evidence for belief updates.
 *
 * Uses P11 capsule types only — no Sterling or solver imports.
 */

import type { P11ObservedEvidenceV1 } from '../sterling/primitives/p11/p11-capsule-types';

// -- Evidence Extraction Helpers ---------------------------------------------

/**
 * Create biome evidence from observed block/vegetation data.
 */
export function makeBiomeEvidence(
  observedBiome: string,
  confidence: number,
  tick: number,
): P11ObservedEvidenceV1 {
  return {
    probeId: 'biome_sample',
    payload: {
      type: 'biome',
      value: observedBiome,
      confidence,
    },
    observedAtTick: tick,
  };
}

/**
 * Create mob mix evidence from observed entity types.
 */
export function makeMobMixEvidence(
  dominantMobType: string,
  confidence: number,
  tick: number,
): P11ObservedEvidenceV1 {
  return {
    probeId: 'mob_mix_sample',
    payload: {
      type: 'expected_mobs',
      value: dominantMobType,
      confidence,
    },
    observedAtTick: tick,
  };
}

/**
 * Create vantage point evidence from visual scan.
 */
export function makeVantageEvidence(
  observedRegion: string,
  confidence: number,
  tick: number,
): P11ObservedEvidenceV1 {
  return {
    probeId: 'travel_to_vantage',
    payload: {
      type: 'region',
      value: observedRegion,
      confidence,
    },
    observedAtTick: tick,
  };
}

/**
 * Create terrain follow evidence.
 */
export function makeTerrainFollowEvidence(
  observedRegion: string,
  confidence: number,
  tick: number,
): P11ObservedEvidenceV1 {
  return {
    probeId: 'terrain_follow',
    payload: {
      type: 'region',
      value: observedRegion,
      confidence,
    },
    observedAtTick: tick,
  };
}

/**
 * Create depth check evidence for mining probes.
 */
export function makeDepthCheckEvidence(
  depthRange: string,
  confidence: number,
  tick: number,
): P11ObservedEvidenceV1 {
  return {
    probeId: 'check_y_level',
    payload: {
      type: 'depth_range',
      value: depthRange,
      confidence,
    },
    observedAtTick: tick,
  };
}

/**
 * Create ore sample evidence from branch mining.
 */
export function makeOreSampleEvidence(
  oreType: string,
  confidence: number,
  tick: number,
): P11ObservedEvidenceV1 {
  return {
    probeId: 'branch_sample',
    payload: {
      type: 'ore_type',
      value: oreType,
      confidence,
    },
    observedAtTick: tick,
  };
}

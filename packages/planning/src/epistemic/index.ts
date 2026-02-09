/**
 * Epistemic Planning — Minecraft Domain Module
 *
 * Domain-specific wrappers around the P11 primitive capsule for
 * Minecraft epistemic planning tasks (structure search, resource localization).
 */

export {
  VILLAGE_HYPOTHESES,
  TEMPLE_HYPOTHESES,
  DIAMOND_DEPTH_HYPOTHESES,
  DIRECTIONS,
} from './minecraft-hypotheses';

export type { Direction } from './minecraft-hypotheses';

export {
  MINECRAFT_STRUCTURE_PROBES,
  MINECRAFT_MINING_PROBES,
  ALL_MINECRAFT_PROBES,
} from './minecraft-probes';

export {
  makeBiomeEvidence,
  makeMobMixEvidence,
  makeVantageEvidence,
  makeTerrainFollowEvidence,
  makeDepthCheckEvidence,
  makeOreSampleEvidence,
} from './minecraft-evidence';

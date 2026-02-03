/**
 * Frame Profiles for Eval Harness
 *
 * Frame profiles control how much information is included in situation frames.
 * These are ORTHOGONAL to sampler profiles (FG-1 fix).
 *
 * Frame profiles affect:
 * - Number of facts included
 * - Amount of memory context
 * - Whether deltas are included
 *
 * Frame profiles do NOT affect:
 * - LLM temperature
 * - Token limits
 * - Sampling parameters
 *
 * @author @darianrosebrook
 */

import { FRAME_PROFILES, type FrameProfile } from '../../reasoning-surface';

// Re-export the production frame profiles
export { FRAME_PROFILES, type FrameProfile };

/**
 * Frame profile names for eval configuration.
 */
export type FrameProfileName = 'minimal' | 'balanced' | 'rich';

/**
 * Get a frame profile by name.
 *
 * @param name - Profile name
 * @returns The frame profile configuration
 * @throws Error if profile name is unknown
 */
export function getFrameProfile(name: FrameProfileName): FrameProfile {
  const profile = FRAME_PROFILES[name];
  if (!profile) {
    throw new Error(`Unknown frame profile: ${name}. Valid profiles: ${Object.keys(FRAME_PROFILES).join(', ')}`);
  }
  return profile;
}

/**
 * Validate that a frame profile name is valid.
 */
export function isValidFrameProfile(name: string): name is FrameProfileName {
  return name in FRAME_PROFILES;
}

/**
 * Get all available frame profile names.
 */
export function getFrameProfileNames(): FrameProfileName[] {
  return Object.keys(FRAME_PROFILES) as FrameProfileName[];
}

/**
 * Frame profile summary for logging.
 */
export interface FrameProfileSummary {
  name: FrameProfileName;
  facts_budget: number;
  memory_budget: number;
  include_deltas: boolean;
}

/**
 * Get a summary of a frame profile for structured logging.
 */
export function getFrameProfileSummary(profile: FrameProfile): FrameProfileSummary {
  return {
    name: profile.name,
    facts_budget: profile.factsBudget,
    memory_budget: profile.memoryBudget,
    include_deltas: profile.includeDeltas,
  };
}

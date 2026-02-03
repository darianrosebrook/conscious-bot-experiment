/**
 * Sampler Profiles for Eval Harness
 *
 * Sampler profiles control LLM generation parameters.
 * These are ORTHOGONAL to frame profiles (FG-1 fix).
 *
 * Sampler profiles affect:
 * - Temperature
 * - Top-P
 * - Max tokens
 *
 * Sampler profiles do NOT affect:
 * - Facts budget
 * - Memory budget
 * - Delta inclusion
 *
 * NOTE (LF-7): The "low-variance" profile is NOT truly deterministic because
 * we don't implement seed locking. It's named "low-variance" to be accurate.
 * True determinism would require LLM-level seed support.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Sampler profile configuration.
 */
export interface SamplerProfile {
  /** Profile identifier */
  name: SamplerProfileName;
  /** LLM temperature (0.0-1.0) */
  temperature: number;
  /** Top-P nucleus sampling parameter */
  topP: number;
  /** Maximum tokens to generate */
  maxTokens: number;
  /** Description of when to use this profile */
  description: string;
}

/**
 * Available sampler profile names.
 */
export type SamplerProfileName = 'low-variance' | 'standard' | 'creative';

// ============================================================================
// Profile Definitions
// ============================================================================

/**
 * Predefined sampler profiles.
 *
 * Default run: `sampler: 'standard'` (fixed), vary only frame profile.
 */
export const SAMPLER_PROFILES: Record<SamplerProfileName, SamplerProfile> = {
  /**
   * Low-variance profile for more consistent outputs.
   *
   * Note (LF-7): This is NOT truly deterministic because we don't lock the seed.
   * It reduces variance but doesn't eliminate it. Use for baseline comparisons
   * where you want less output variation.
   */
  'low-variance': {
    name: 'low-variance',
    temperature: 0.3,
    topP: 0.9,
    maxTokens: 512,
    description: 'Reduced variance for baseline runs. Not truly deterministic.',
  },

  /**
   * Standard profile for typical eval runs.
   *
   * This is the DEFAULT for eval runs. When running grid experiments,
   * keep sampler fixed at 'standard' and vary only frame profile.
   */
  'standard': {
    name: 'standard',
    temperature: 0.7,
    topP: 0.95,
    maxTokens: 512,
    description: 'Default for baseline runs. Balanced creativity and consistency.',
  },

  /**
   * Creative profile for exploration.
   *
   * Higher variance outputs. Use when testing edge cases or exploring
   * the space of possible model behaviors.
   */
  'creative': {
    name: 'creative',
    temperature: 0.9,
    topP: 1.0,
    maxTokens: 768,
    description: 'Higher variance for exploration. More diverse outputs.',
  },
};

// ============================================================================
// Functions
// ============================================================================

/**
 * Get a sampler profile by name.
 *
 * @param name - Profile name
 * @returns The sampler profile configuration
 * @throws Error if profile name is unknown
 */
export function getSamplerProfile(name: SamplerProfileName): SamplerProfile {
  const profile = SAMPLER_PROFILES[name];
  if (!profile) {
    throw new Error(`Unknown sampler profile: ${name}. Valid profiles: ${Object.keys(SAMPLER_PROFILES).join(', ')}`);
  }
  return profile;
}

/**
 * Validate that a sampler profile name is valid.
 */
export function isValidSamplerProfile(name: string): name is SamplerProfileName {
  return name in SAMPLER_PROFILES;
}

/**
 * Get all available sampler profile names.
 */
export function getSamplerProfileNames(): SamplerProfileName[] {
  return Object.keys(SAMPLER_PROFILES) as SamplerProfileName[];
}

/**
 * Sampler profile summary for structured logging.
 */
export interface SamplerProfileSummary {
  name: SamplerProfileName;
  temperature: number;
  top_p: number;
  max_tokens: number;
}

/**
 * Get a summary of a sampler profile for structured logging.
 */
export function getSamplerProfileSummary(profile: SamplerProfile): SamplerProfileSummary {
  return {
    name: profile.name,
    temperature: profile.temperature,
    top_p: profile.topP,
    max_tokens: profile.maxTokens,
  };
}

/**
 * Get the default sampler profile for eval runs.
 *
 * Per the design: default run uses `sampler: 'standard'` (fixed),
 * varying only frame profile.
 */
export function getDefaultSamplerProfile(): SamplerProfile {
  return SAMPLER_PROFILES['standard'];
}

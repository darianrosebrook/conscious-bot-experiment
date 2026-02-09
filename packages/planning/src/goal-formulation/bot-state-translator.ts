/**
 * Bot State → Homeostasis Translator
 *
 * Pure function that maps raw Minecraft bot state (health, food, inventory,
 * time, hostiles) to the normalized 0-1 HomeostasisState signals that the
 * goal-formulation pipeline expects.
 *
 * Design principles:
 *   - Conservative: signals that can't be computed from bot state stay at safe
 *     defaults (from getDefaultHomeostasis). We never invent signal where there
 *     is no observable evidence.
 *   - Lossy: we intentionally discard information. The translator is a mapping
 *     function, not a world model.
 *   - Pure: no side effects, no state, no I/O. Same input → same output.
 *
 * Signals derived from bot state:
 *   health  → 1 - (botHealth / 20)     — high health = low health-need
 *   hunger  → 1 - (food / 20)          — full food = low hunger
 *   safety  → f(nearbyHostiles, timeOfDay) — hostiles + night = low safety
 *   energy  → f(health, food)           — proxy: low vitals = low energy
 *
 * Signals left at defaults (no direct Minecraft observable):
 *   curiosity, social, achievement, creativity,
 *   resourceManagement, shelterStability, farmHealth,
 *   inventoryOrganization, worldKnowledge, redstoneProficiency,
 *   constructionSkill, environmentalComfort, mechanicalAptitude,
 *   agriculturalKnowledge, defensiveReadiness
 *
 * @author @darianrosebrook
 */

import type { HomeostasisState } from '../types';

// ============================================================================
// Input Type (matches getBotState() return shape from modular-server.ts)
// ============================================================================

export interface BotStateSnapshot {
  health?: number;
  food?: number;
  inventory?: Array<{ name: string; count: number }>;
  timeOfDay?: number;
  biome?: string;
  nearbyHostiles?: number;
  nearbyPassives?: number;
  position?: { x: number; y: number; z: number };
}

// ============================================================================
// Translator
// ============================================================================

/**
 * Translate raw Minecraft bot state into a partial HomeostasisState.
 *
 * Returns only the fields that can be meaningfully derived from bot state.
 * Callers should merge with HomeostasisMonitor.sample() which fills defaults.
 *
 * All outputs are clamped to [0, 1] and rounded to 2 decimal places.
 */
export function translateBotState(
  state: BotStateSnapshot,
): Partial<HomeostasisState> {
  const r2 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;

  // --- Health (SATISFACTION polarity: 1 = good) ---
  // Minecraft health: 0 (dead) to 20 (full hearts)
  // Need generator uses (1 - health) as urgency → health=1 means no health need.
  const health = state.health != null ? r2(state.health / 20) : undefined;

  // --- Hunger (DEFICIT polarity: 1 = urgent) ---
  // Minecraft food: 0 (starving) to 20 (full)
  // Need generator uses hunger directly as urgency → hunger=0.75 means urgency=0.75.
  const hunger = state.food != null ? r2(1 - state.food / 20) : undefined;

  // --- Safety (SATISFACTION polarity: 1 = good) ---
  // Derived from nearby hostiles + time of day (night is more dangerous).
  // Need generator uses (1 - safety) as urgency → safety=0.35 means urgency=0.65.
  const safety = computeSafety(state);

  // --- Energy (SATISFACTION polarity: 1 = good) ---
  // No direct Minecraft equivalent. Proxy: average of health and food normalized.
  // When both health and food are high, energy is high.
  const energy = (health != null && hunger != null)
    ? r2((health + (1 - hunger)) / 2)
    : undefined;

  // --- Defensive readiness (SATISFACTION polarity: 1 = good) ---
  // Derived from nearby hostiles. If hostiles are nearby, readiness drops.
  const defensiveReadiness = state.nearbyHostiles != null
    ? r2(1 - Math.min(state.nearbyHostiles / 5, 1))
    : undefined;

  // Build partial, omitting undefined fields
  const partial: Partial<HomeostasisState> = {};
  if (health != null) partial.health = health;
  if (hunger != null) partial.hunger = hunger;
  if (safety != null) partial.safety = safety;
  if (energy != null) partial.energy = energy;
  if (defensiveReadiness != null) partial.defensiveReadiness = defensiveReadiness;

  return partial;
}

// ============================================================================
// Safety Computation
// ============================================================================

/**
 * Compute safety signal from nearby hostiles and time of day.
 *
 * Safety = 1.0 when no threats and daytime.
 * Hostiles are the primary factor; night is a secondary modifier.
 *
 * hostile_penalty: each hostile reduces safety by 0.15 (capped at 1.0)
 * night_penalty: 0.1 reduction during night hours
 *
 * Example outputs:
 *   0 hostiles, day → 0.9 (default safe)
 *   0 hostiles, night → 0.8
 *   1 hostile, day → 0.75
 *   3 hostiles, night → 0.35
 *   5+ hostiles, any → 0.0
 */
function computeSafety(state: BotStateSnapshot): number | undefined {
  if (state.nearbyHostiles == null && state.timeOfDay == null) {
    return undefined;
  }

  const r2 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;

  let safety = 0.9; // Base safety when no threats

  // Hostile penalty
  const hostiles = state.nearbyHostiles ?? 0;
  safety -= hostiles * 0.15;

  // Night penalty
  if (state.timeOfDay != null) {
    const isNight = state.timeOfDay >= 12542 && state.timeOfDay <= 23460;
    if (isNight) {
      safety -= 0.1;
    }
  }

  return r2(safety);
}

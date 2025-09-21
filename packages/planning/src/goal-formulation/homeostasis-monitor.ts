/**
 * Homeostasis monitoring utilities.
 *
 * Provides a minimal monitor to sample the agent's internal state and
 * return a normalized HomeostasisState with safe defaults and guard rails.
 *
 * Author: @darianrosebrook
 */

import { HomeostasisState } from '../types';

/**
 * Return a safe default homeostasis snapshot.
 */
export function getDefaultHomeostasis(): HomeostasisState {
  const now = Date.now();
  return {
    health: 1,
    hunger: 0.2,
    energy: 0.8,
    safety: 0.9,
    curiosity: 0.5,
    social: 0.3,
    achievement: 0.4,
    creativity: 0.6,
    // New homeostasis states for primitive operations
    resourceManagement: 0.5,
    shelterStability: 0.7,
    farmHealth: 0.6,
    inventoryOrganization: 0.4,
    worldKnowledge: 0.5,
    redstoneProficiency: 0.3,
    constructionSkill: 0.4,
    environmentalComfort: 0.6,
    mechanicalAptitude: 0.4,
    agriculturalKnowledge: 0.5,
    defensiveReadiness: 0.5,
    timestamp: now,
  };
}

/**
 * Monitors internal signals and synthesizes a HomeostasisState.
 */
export class HomeostasisMonitor {
  /**
   * Sample current homeostasis; returns safe defaults if inputs are missing.
   */
  sample(partial?: Partial<HomeostasisState>): HomeostasisState {
    const base = getDefaultHomeostasis();
    return {
      health: partial?.health ?? base.health,
      hunger: partial?.hunger ?? base.hunger,
      energy: partial?.energy ?? base.energy,
      safety: partial?.safety ?? base.safety,
      curiosity: partial?.curiosity ?? base.curiosity,
      social: partial?.social ?? base.social,
      achievement: partial?.achievement ?? base.achievement,
      creativity: partial?.creativity ?? base.creativity,
      // New homeostasis states for primitive operations
      resourceManagement:
        partial?.resourceManagement ?? base.resourceManagement,
      shelterStability: partial?.shelterStability ?? base.shelterStability,
      farmHealth: partial?.farmHealth ?? base.farmHealth,
      inventoryOrganization:
        partial?.inventoryOrganization ?? base.inventoryOrganization,
      worldKnowledge: partial?.worldKnowledge ?? base.worldKnowledge,
      redstoneProficiency:
        partial?.redstoneProficiency ?? base.redstoneProficiency,
      constructionSkill: partial?.constructionSkill ?? base.constructionSkill,
      environmentalComfort:
        partial?.environmentalComfort ?? base.environmentalComfort,
      mechanicalAptitude:
        partial?.mechanicalAptitude ?? base.mechanicalAptitude,
      agriculturalKnowledge:
        partial?.agriculturalKnowledge ?? base.agriculturalKnowledge,
      defensiveReadiness:
        partial?.defensiveReadiness ?? base.defensiveReadiness,
      timestamp: Date.now(),
    };
  }
}

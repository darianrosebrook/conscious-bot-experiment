/**
 * Minecraft Acquisition Strategy Priors (Rig D)
 *
 * In-memory prior store for acquisition strategy learning.
 * Prior updates are execution-grounded: planId is required.
 *
 * @author @darianrosebrook
 */

import type { AcquisitionStrategy, StrategyPrior } from './minecraft-acquisition-types';
import { PRIOR_MIN, PRIOR_MAX } from './minecraft-acquisition-types';

// ============================================================================
// EMA Configuration
// ============================================================================

/** Exponential moving average smoothing factor (0..1). Higher = more weight on recent. */
const EMA_ALPHA = 0.2;

// ============================================================================
// Strategy Prior Store
// ============================================================================

/**
 * In-memory store for strategy priors keyed by (item, strategy, contextKey).
 *
 * Priors represent historical success rates for a given strategy in a
 * particular context. Updated via EMA after each episode.
 */
export class StrategyPriorStore {
  private readonly priors = new Map<string, StrategyPrior>();

  /** Build a composite key from (item, strategy, contextKey) */
  private key(item: string, strategy: AcquisitionStrategy, contextKey: string): string {
    return `${item}:${strategy}:${contextKey}`;
  }

  /**
   * Get the prior for a given (item, strategy, contextKey).
   * Returns a default prior with successRate=0.5 if no data.
   */
  getPrior(
    item: string,
    strategy: AcquisitionStrategy,
    contextKey: string,
  ): StrategyPrior {
    const k = this.key(item, strategy, contextKey);
    const existing = this.priors.get(k);
    if (existing) return { ...existing };
    return {
      strategy,
      contextKey,
      successRate: 0.5,
      sampleCount: 0,
    };
  }

  /**
   * Update the prior after an episode result.
   *
   * Uses EMA update, clamped to [PRIOR_MIN, PRIOR_MAX].
   * planId is REQUIRED — execution-grounded credit assignment (invariant 5).
   * Throws if planId is missing.
   *
   * @param item       Target item
   * @param strategy   Strategy that was executed
   * @param contextKey Context key for the world state
   * @param success    Whether the episode succeeded
   * @param planId     planId from the executed solve (required)
   */
  updatePrior(
    item: string,
    strategy: AcquisitionStrategy,
    contextKey: string,
    success: boolean,
    planId: string,
  ): StrategyPrior {
    if (!planId) {
      throw new Error(
        `updatePrior requires planId for execution-grounded credit assignment (item=${item}, strategy=${strategy})`
      );
    }

    const k = this.key(item, strategy, contextKey);
    const existing = this.priors.get(k);
    const currentRate = existing?.successRate ?? 0.5;
    const currentCount = existing?.sampleCount ?? 0;

    // EMA update
    const observation = success ? 1.0 : 0.0;
    const newRate = currentRate * (1 - EMA_ALPHA) + observation * EMA_ALPHA;

    // Clamp to bounds
    const clampedRate = Math.max(PRIOR_MIN, Math.min(PRIOR_MAX, newRate));

    const updated: StrategyPrior = {
      strategy,
      contextKey,
      successRate: clampedRate,
      sampleCount: currentCount + 1,
    };

    this.priors.set(k, updated);
    return { ...updated };
  }

  /**
   * Get all priors matching a given item and context key.
   * Returns priors for all strategies that have been observed.
   */
  getPriorsForContext(item: string, contextKey: string): StrategyPrior[] {
    const result: StrategyPrior[] = [];
    const strategies: AcquisitionStrategy[] = ['mine', 'trade', 'loot', 'salvage'];
    for (const strategy of strategies) {
      const k = this.key(item, strategy, contextKey);
      const existing = this.priors.get(k);
      if (existing) result.push({ ...existing });
    }
    return result;
  }

  /** Get the number of stored priors (for diagnostics) */
  get size(): number {
    return this.priors.size;
  }

  /** Clear all priors (for testing) */
  clear(): void {
    this.priors.clear();
  }
}

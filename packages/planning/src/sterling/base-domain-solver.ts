/**
 * Base Domain Solver
 *
 * Abstract protocol layer shared by all Sterling domain solvers.
 * Owns availability gating, planId extraction, and episode reporting.
 *
 * Subclasses own ALL domain logic: solve parameters, solution mapping,
 * TaskStep generation, deficit/replan handling, and duration estimation.
 *
 * @author @darianrosebrook
 */

import type { SterlingReasoningService } from './sterling-reasoning-service';
import type { SterlingSolveResult, SterlingDomain } from '@conscious-bot/core';
import type { SolveBundle } from './solve-bundle-types';

// ============================================================================
// Shared result constraint
// ============================================================================

export interface BaseSolveResult {
  solved: boolean;
  steps: unknown[];
  totalNodes: number;
  durationMs: number;
  error?: string;
  /** Observability metadata — does not affect solve behavior */
  solveMeta?: { bundles: SolveBundle[] };
}

// ============================================================================
// Abstract Base
// ============================================================================

export abstract class BaseDomainSolver<
  TResult extends BaseSolveResult = BaseSolveResult,
> {
  protected readonly sterlingService: SterlingReasoningService;

  /** Sterling WS domain for transport routing */
  abstract readonly sterlingDomain: SterlingDomain;

  /** Unique solver identifier for planner registry (e.g. 'minecraft.crafting') */
  abstract readonly solverId: string;

  /** Contract version for protocol evolution */
  readonly contractVersion: number = 1;

  constructor(sterlingService: SterlingReasoningService) {
    this.sterlingService = sterlingService;
  }

  // --------------------------------------------------------------------------
  // Availability guard
  // --------------------------------------------------------------------------

  protected isAvailable(): boolean {
    return this.sterlingService.isAvailable();
  }

  /** Each solver defines its own correctly-typed unavailable result */
  protected abstract makeUnavailableResult(): TResult;

  // --------------------------------------------------------------------------
  // planId extraction
  // --------------------------------------------------------------------------

  /**
   * Extract planId from Sterling solve result metrics.
   * Caller should store this in task metadata — NOT on the solver instance.
   */
  protected extractPlanId(result: SterlingSolveResult): string | null {
    return (result.metrics?.planId as string) ?? null;
  }

  // --------------------------------------------------------------------------
  // Episode reporting
  // --------------------------------------------------------------------------

  /**
   * Fire-and-forget episode report to Sterling.
   * planId is REQUIRED — if missing, logs warning and skips.
   */
  protected reportEpisode(payload: Record<string, unknown>): void {
    if (!this.isAvailable()) return;

    if (!payload.planId) {
      console.warn(
        `[Sterling] Skipping ${this.sterlingDomain} episode report: missing planId`
      );
      return;
    }

    this.sterlingService
      .solve(this.sterlingDomain, {
        command: 'report_episode',
        domain: this.sterlingDomain,
        contractVersion: this.contractVersion,
        ...payload,
      })
      .catch((err) => {
        console.warn(
          `[Sterling] Failed to report ${this.sterlingDomain} episode: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      });
  }
}

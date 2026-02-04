/**
 * Valuation Decision Emitter (Rig F Observability Layer)
 *
 * Interface-based emitter with backpressure counters.
 * SSE is one transport implementation; the interface (ValuationEventSink)
 * allows swapping to Redis pubsub, DB append, or any other transport
 * without changing solver/record layer code.
 *
 * Key design:
 * - computeAndEmit is the main entry point: runs solver, creates record, emits event
 * - Emission is fire-and-forget (non-blocking); errors are tracked, not thrown
 * - Backpressure counters exposed via getStats() for monitoring
 * - SSE sink is single-node dev transport (not safe for multi-instance)
 *
 * @author @darianrosebrook
 */

import { computeValuationPlan } from './minecraft-valuation';
import type {
  ValuationInput,
  ValuationPlanV1,
  ValuationRulesetV1,
} from './minecraft-valuation-types';
import { buildDefaultRuleset, computeRulesetDigest } from './minecraft-valuation-rules';
import {
  createDecisionRecord,
  createValuationEvent,
  type ValuationCorrelation,
  type ValuationEventV1,
  type ValuationUpdateEvent,
} from './minecraft-valuation-record-types';

// ============================================================================
// Transport Interface
// ============================================================================

/** Transport interface — SSE is one implementation, swappable later */
export interface ValuationEventSink {
  emit(event: ValuationUpdateEvent): Promise<void>;
}

// ============================================================================
// Emitter Stats
// ============================================================================

/** Emitter stats for monitoring transport health */
export interface EmitterStats {
  emitAttempts: number;
  emitFailures: number;
  lastEmitError?: string;
  lastEmitAt?: number;
}

// ============================================================================
// SSE Sink (single-node dev transport)
// ============================================================================

/**
 * SSE sink using internal broadcast.
 * Pushes events to connected SSE clients via broadcastValuationUpdate.
 * This is the preferred transport for single-node dev setups.
 */
export function createBroadcastValuationSink(): ValuationEventSink {
  // Lazy import to avoid circular dependencies
  let broadcast: ((event: any) => void) | null = null;
  return {
    async emit(event: ValuationUpdateEvent): Promise<void> {
      if (!broadcast) {
        const { broadcastValuationUpdate } = await import('../modules/planning-endpoints');
        broadcast = broadcastValuationUpdate;
      }
      broadcast(event);
    },
  };
}

/**
 * SSE sink: POST to dashboard endpoint.
 * Legacy transport — the Vite dev server can't receive POSTs.
 * Prefer createBroadcastValuationSink() for local dev.
 * @deprecated Use createBroadcastValuationSink instead
 */
export function createSSEValuationSink(dashboardEndpoint: string): ValuationEventSink {
  return {
    async emit(event: ValuationUpdateEvent): Promise<void> {
      await fetch(`${dashboardEndpoint}/api/valuation-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}

// ============================================================================
// Emitter Factory
// ============================================================================

/**
 * Create a valuation emitter that runs the solver, creates records, and emits events.
 *
 * Usage:
 *   const emitter = createValuationEmitter(sink);
 *   const { plan, event } = await emitter.computeAndEmit(input, correlation);
 *   // plan is the ValuationPlanV1 result
 *   // event is the emitted ValuationEventV1
 *   // emission failures are tracked via getStats(), not thrown
 */
export function createValuationEmitter(sink: ValuationEventSink) {
  let emitAttempts = 0;
  let emitFailures = 0;
  let lastEmitError: string | undefined;
  let lastEmitAt: number | undefined;

  return {
    async computeAndEmit(
      input: ValuationInput,
      correlation: ValuationCorrelation,
      ruleset?: ValuationRulesetV1,
    ): Promise<{ plan: ValuationPlanV1; event: ValuationEventV1 }> {
      const effectiveRuleset = ruleset ?? buildDefaultRuleset();
      const rulesetDigest = computeRulesetDigest(effectiveRuleset);

      // Pure solver call
      const plan = computeValuationPlan(input, effectiveRuleset);

      // Create content-addressed record
      const decision = createDecisionRecord(input, effectiveRuleset, rulesetDigest, plan);

      // Create unique event
      const event = createValuationEvent(decision, correlation);

      // Fire-and-forget emit (non-blocking, catches errors)
      emitAttempts++;
      const updateEvent: ValuationUpdateEvent = {
        event: 'valuationDecisionRecorded',
        data: event,
        timestamp: Date.now(),
      };

      sink.emit(updateEvent).then(() => {
        lastEmitAt = Date.now();
      }).catch((err: unknown) => {
        emitFailures++;
        lastEmitError = err instanceof Error ? err.message : String(err);
      });

      return { plan, event };
    },

    getStats(): EmitterStats {
      return {
        emitAttempts,
        emitFailures,
        lastEmitError,
        lastEmitAt,
      };
    },
  };
}

/**
 * Reflex Arbitrator
 *
 * Manages N-tick priority override when a reflex fires.
 * During override, the planner is paused and the reflex layer
 * has exclusive control.
 *
 * Events are emitted as typed objects for cognition to interpret.
 */

export interface ReflexEvent {
  type: 'reflex_enter' | 'reflex_exit' | 'reflex_tick';
  reason: string;
  tick: number;
  remainingTicks: number;
}

export type ReflexEventHandler = (event: ReflexEvent) => void;

const OVERRIDE_DURATION_TICKS = 10; // ~2s at 5Hz

export class ReflexArbitrator {
  private overrideReason: string | null = null;
  private overrideStartTick = 0;
  private overrideEndTick = 0;
  private handlers: ReflexEventHandler[] = [];

  /**
   * Enter reflex override mode. The planner should be paused
   * until the override expires or is manually exited.
   */
  enterReflexMode(reason: string, currentTick: number): void {
    const wasActive = this.isReflexActive(currentTick);

    this.overrideReason = reason;
    this.overrideStartTick = currentTick;
    this.overrideEndTick = currentTick + OVERRIDE_DURATION_TICKS;

    if (!wasActive) {
      this.emitEvent({
        type: 'reflex_enter',
        reason,
        tick: currentTick,
        remainingTicks: OVERRIDE_DURATION_TICKS,
      });
    }
  }

  /**
   * Call every tick to update reflex state.
   * Emits reflex_exit when the override expires.
   */
  tickUpdate(currentTick: number): void {
    if (!this.overrideReason) return;

    if (currentTick >= this.overrideEndTick) {
      this.emitEvent({
        type: 'reflex_exit',
        reason: this.overrideReason,
        tick: currentTick,
        remainingTicks: 0,
      });
      this.overrideReason = null;
      return;
    }

    this.emitEvent({
      type: 'reflex_tick',
      reason: this.overrideReason,
      tick: currentTick,
      remainingTicks: this.overrideEndTick - currentTick,
    });
  }

  /**
   * Check if the planner should be blocked due to active reflex override.
   */
  isPlannerBlocked(currentTick?: number): boolean {
    if (!this.overrideReason) return false;
    if (currentTick !== undefined && currentTick >= this.overrideEndTick) return false;
    return true;
  }

  /**
   * Check if reflex mode is currently active.
   */
  isReflexActive(currentTick: number): boolean {
    return this.overrideReason !== null && currentTick < this.overrideEndTick;
  }

  /**
   * Register an event handler for reflex events.
   */
  onEvent(handler: ReflexEventHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Remove an event handler.
   */
  offEvent(handler: ReflexEventHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  private emitEvent(event: ReflexEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('[ReflexArbitrator] Event handler error:', error);
      }
    }
  }
}

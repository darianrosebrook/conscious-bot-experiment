/**
 * BeliefBus — Accumulates saliency deltas and manages emission cadence
 *
 * - Feeds EvidenceBatches into TrackSet
 * - Accumulates deltas in pending buffer
 * - Flushes at 1Hz emission cadence (capped at MAX_SALIENCY_EVENTS_PER_EMISSION)
 * - Provides snapshot for reflex layer (reads every tick)
 * - Forces snapshot on connect/reconnect
 */

import { TrackSet } from './track-set';
import {
  EvidenceBatch,
  SaliencyDelta,
  Snapshot,
  BeliefStreamEnvelope,
  MAX_SALIENCY_EVENTS_PER_EMISSION,
  SNAPSHOT_INTERVAL_TICKS,
} from './types';

export class BeliefBus {
  private trackSet: TrackSet;
  private pendingDeltas: SaliencyDelta[] = [];
  private lastSnapshotTick = -1;
  private forceNextSnapshot = true;
  private currentTickId = 0;
  private botId: string;
  private streamId: string;
  /** Counter: new_threat deltas dropped due to missing track payload (should always be 0) */
  private _droppedNewThreatCount = 0;

  constructor(botId: string, streamId: string) {
    this.trackSet = new TrackSet();
    this.botId = botId;
    this.streamId = streamId;
  }

  /**
   * Ingest an evidence batch: run TrackSet.ingest + TrackSet.tick,
   * accumulate resulting deltas.
   */
  ingest(batch: EvidenceBatch): void {
    this.currentTickId = batch.tickId;

    // Ingest evidence → get deltas from new/updated tracks
    const ingestDeltas = this.trackSet.ingest(batch);

    // Tick decay → get deltas from visibility transitions
    const tickDeltas = this.trackSet.tick(batch.tickId);

    // Accumulate
    this.pendingDeltas.push(...ingestDeltas, ...tickDeltas);
  }

  /**
   * Flush pending deltas (capped at MAX_SALIENCY_EVENTS_PER_EMISSION).
   * Returns the flushed deltas and clears the pending buffer.
   */
  flushPendingDeltas(): SaliencyDelta[] {
    const toEmit = this.pendingDeltas.slice(0, MAX_SALIENCY_EVENTS_PER_EMISSION);
    this.pendingDeltas = this.pendingDeltas.slice(MAX_SALIENCY_EVENTS_PER_EMISSION);
    return toEmit;
  }

  /**
   * Check if a snapshot should be included in the next emission.
   */
  shouldEmitSnapshot(): boolean {
    if (this.forceNextSnapshot) return true;
    const ticksSinceSnapshot = this.currentTickId - this.lastSnapshotTick;
    return ticksSinceSnapshot >= SNAPSHOT_INTERVAL_TICKS;
  }

  /**
   * Get the current snapshot (reads TrackSet state).
   * Used by reflex layer every tick and by emission cycle.
   */
  getCurrentSnapshot(): Snapshot {
    return this.trackSet.getSnapshot(this.currentTickId);
  }

  /**
   * Force a snapshot on the next emission (called on connect/reconnect).
   */
  forceSnapshot(): void {
    this.forceNextSnapshot = true;
  }

  /**
   * Build the emission envelope for cognition.
   * Includes snapshot if due, plus pending deltas.
   */
  buildEnvelope(seq: number): BeliefStreamEnvelope {
    const rawDeltas = this.flushPendingDeltas();
    let snapshot: Snapshot | undefined;

    if (this.shouldEmitSnapshot()) {
      snapshot = this.getCurrentSnapshot();
      this.lastSnapshotTick = this.currentTickId;
      this.forceNextSnapshot = false;
    }

    // Producer-side enforcement: new_threat MUST have delta.track
    const deltas = rawDeltas.filter((d) => {
      if (d.type === 'new_threat' && !d.track) {
        this._droppedNewThreatCount++;
        console.error(
          `[BeliefBus] INVARIANT VIOLATION: new_threat for ${d.trackId} missing track payload — dropped at producer boundary`
        );
        return false;
      }
      return true;
    });

    return {
      request_version: 'saliency_delta',
      type: 'environmental_awareness',
      bot_id: this.botId,
      stream_id: this.streamId,
      seq,
      tick_id: this.currentTickId,
      snapshot,
      saliency_events: deltas,
    };
  }

  /**
   * Check if there is anything worth emitting (deltas or pending snapshot).
   */
  hasContent(): boolean {
    return this.pendingDeltas.length > 0 || this.shouldEmitSnapshot();
  }

  /** Expose track count for monitoring */
  get trackCount(): number {
    return this.trackSet.size;
  }

  /** Counter: new_threat deltas dropped at producer boundary (should always be 0) */
  get droppedNewThreatCount(): number {
    return this._droppedNewThreatCount;
  }
}

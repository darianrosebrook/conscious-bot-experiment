/**
 * Non-blocking outbox for cognition side-effect dispatches.
 *
 * All cognition POST calls (thought acks, lifecycle events) are enqueued
 * synchronously and flushed on a 500ms interval.  This decouples the
 * executor hot-path from cognition service latency and prevents AbortError
 * stack traces from propagating into task execution.
 */

import { SIDE_EFFECT_TIMEOUT_MS } from './timeout-policy';

interface OutboxEntry {
  endpoint: string;
  payload: unknown;
  enqueuedAt: number;
}

const MAX_QUEUE_SIZE = 50;
const FLUSH_INTERVAL_MS = 500;

export class CognitionOutbox {
  private queue: OutboxEntry[] = [];
  private flushInFlight = false;
  private intervalHandle?: NodeJS.Timeout;

  /** Number of entries waiting to be flushed. */
  get pendingCount(): number {
    return this.queue.length;
  }

  /**
   * Synchronously enqueue a payload for the given cognition endpoint.
   * O(1), never blocks, never throws.
   */
  enqueue(endpoint: string, payload: unknown): void {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      // Drop oldest to make room
      this.queue.shift();
    }
    this.queue.push({ endpoint, payload, enqueuedAt: Date.now() });
  }

  /** Start the flush timer. Idempotent. */
  start(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      this.flush().catch(() => {});
    }, FLUSH_INTERVAL_MS);
  }

  /** Stop the flush timer and discard pending entries. */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
    this.queue = [];
  }

  /**
   * Flush pending entries.  Non-reentrant — concurrent calls are no-ops.
   *
   * Thought-ack entries (endpoint ends with `/ack`) with `thoughtIds`
   * arrays are batched into a single POST.
   */
  async flush(): Promise<void> {
    if (this.flushInFlight || this.queue.length === 0) return;
    this.flushInFlight = true;

    // Snapshot and clear the queue atomically
    const batch = this.queue.splice(0);

    try {
      // Separate ack entries for batching
      const ackEntries: OutboxEntry[] = [];
      const otherEntries: OutboxEntry[] = [];

      for (const entry of batch) {
        if (
          entry.endpoint.endsWith('/ack') &&
          (entry.payload as any)?.thoughtIds
        ) {
          ackEntries.push(entry);
        } else {
          otherEntries.push(entry);
        }
      }

      // Batch thought acks into a single POST
      if (ackEntries.length > 0) {
        const mergedIds: string[] = [];
        for (const entry of ackEntries) {
          const ids = (entry.payload as any).thoughtIds;
          if (Array.isArray(ids)) mergedIds.push(...ids);
        }
        if (mergedIds.length > 0) {
          await this.send(ackEntries[0].endpoint, {
            thoughtIds: mergedIds,
          });
        }
      }

      // Send other entries individually
      await Promise.allSettled(
        otherEntries.map((entry) => this.send(entry.endpoint, entry.payload))
      );
    } catch {
      // Swallow — outbox is best-effort
    } finally {
      this.flushInFlight = false;
    }
  }

  private async send(endpoint: string, payload: unknown): Promise<void> {
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SIDE_EFFECT_TIMEOUT_MS),
      });
    } catch {
      // Best-effort — cognition side effects are non-critical
    }
  }
}

/**
 * LoopBreaker — signature-based failure pattern detection and suppression.
 *
 * Ships in shadow mode (Phase A): computes signatures, records would-suppress
 * decisions, logs `[LoopBreaker:shadow]`, but never actually suppresses.
 *
 * Occurrence unit: per (signatureId, taskId) — a single task failing 3 retries
 * counts as 1 occurrence, not 3.
 *
 * Per-process best-effort: state does not persist across restarts.
 * Acceptable for dev; upgrade to shared storage if multi-process becomes real.
 *
 * @author @darianrosebrook
 */

import type { FailureSignatureV1 } from './failure-signature';
import { getPlanningRuntimeConfig } from '../planning-runtime-config';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface LoopBreakerConfig {
  /** Occurrences (unique tasks) before loop detected. Default: 3. */
  threshold: number;
  /** Sliding window for counting occurrences. Default: 5 min. */
  windowMs: number;
  /** How long a detected loop suppresses new attempts. Default: 10 min. */
  suppressionTtlMs: number;
  /** LRU cap on tracked signatures. Default: 500. */
  maxSignatures: number;
  /** When true: log + record but never suppress. Default: true. */
  shadowMode: boolean;
}

const DEFAULT_CONFIG: LoopBreakerConfig = {
  threshold: 3,
  windowMs: 5 * 60 * 1000,
  suppressionTtlMs: 10 * 60 * 1000,
  maxSignatures: 500,
  shadowMode: true,
};

// ---------------------------------------------------------------------------
// Episode schema
// ---------------------------------------------------------------------------

export interface LoopDetectedEpisodeV1 {
  _schema: 'loop_detected_episode_v1';
  signatureId: string;
  signature: FailureSignatureV1;
  occurrences: number;
  windowMs: number;
  suppressedUntil: number;
  contributingTaskIds: string[];
  contributingRunIds: string[];
  detectedAt: number;
  shadowMode: boolean;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface WindowEntry {
  events: Array<{ at: number; taskId: string; runId?: string }>;
  seenTaskIds: Set<string>;
  /** The most recent signature object (for episode construction). */
  latestSignature: FailureSignatureV1;
}

// ---------------------------------------------------------------------------
// LoopBreaker
// ---------------------------------------------------------------------------

export class LoopBreaker {
  private readonly config: LoopBreakerConfig;
  private readonly windows: Map<string, WindowEntry> = new Map();
  private readonly suppressions: Map<string, number> = new Map();

  constructor(config?: Partial<LoopBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record a failure occurrence. Returns a LoopDetectedEpisodeV1 if
   * the threshold was just crossed, otherwise null.
   *
   * Dedupes by (signatureId, taskId): the same task failing multiple
   * retries counts as one occurrence.
   */
  recordFailure(
    sig: FailureSignatureV1,
    ctx: { taskId: string; runId?: string },
  ): LoopDetectedEpisodeV1 | null {
    const { signatureId } = sig;
    const now = Date.now();

    // Get or create window entry
    let entry = this.windows.get(signatureId);
    if (!entry) {
      this.evictIfNeeded();
      entry = { events: [], seenTaskIds: new Set(), latestSignature: sig };
      this.windows.set(signatureId, entry);
    }
    entry.latestSignature = sig;

    // Dedupe: only count one occurrence per task
    if (entry.seenTaskIds.has(ctx.taskId)) {
      return null;
    }
    entry.seenTaskIds.add(ctx.taskId);
    entry.events.push({ at: now, taskId: ctx.taskId, runId: ctx.runId });

    // Prune events outside the window
    const windowStart = now - this.config.windowMs;
    entry.events = entry.events.filter((e) => e.at >= windowStart);

    // Count unique tasks in window
    const tasksInWindow = new Set(entry.events.map((e) => e.taskId));
    const occurrences = tasksInWindow.size;

    if (occurrences >= this.config.threshold) {
      const suppressedUntil = now + this.config.suppressionTtlMs;
      this.suppressions.set(signatureId, suppressedUntil);

      const episode: LoopDetectedEpisodeV1 = {
        _schema: 'loop_detected_episode_v1',
        signatureId,
        signature: sig,
        occurrences,
        windowMs: this.config.windowMs,
        suppressedUntil,
        contributingTaskIds: [...tasksInWindow],
        contributingRunIds: [
          ...new Set(entry.events.map((e) => e.runId).filter(Boolean) as string[]),
        ],
        detectedAt: now,
        shadowMode: this.config.shadowMode,
      };

      const mode = this.config.shadowMode ? 'shadow' : 'active';
      console.log(
        `[LoopBreaker:${mode}] Loop detected: signatureId=${signatureId} occurrences=${occurrences} tasks=[${episode.contributingTaskIds.join(',')}]`,
      );

      // Reset window after detection to avoid re-firing every subsequent event
      entry.events = [];
      entry.seenTaskIds.clear();

      return episode;
    }

    return null;
  }

  /**
   * Check if a signature is currently suppressed.
   * In shadow mode, always returns false (no actual suppression).
   */
  isSuppressed(signatureId: string, nowMs?: number): boolean {
    if (this.config.shadowMode) return false;

    const until = this.suppressions.get(signatureId);
    if (until == null) return false;

    const now = nowMs ?? Date.now();
    if (now >= until) {
      this.suppressions.delete(signatureId);
      return false;
    }
    return true;
  }

  /** Manually clear a suppression (e.g. when Sterling provides a new strategy). */
  clearSuppression(signatureId: string): void {
    this.suppressions.delete(signatureId);
  }

  /** Diagnostic snapshot for golden-run artifacts and dashboards. */
  getState(): {
    activeSignatures: number;
    activeSuppressions: number;
    shadowMode: boolean;
    config: LoopBreakerConfig;
  } {
    // Clean expired suppressions
    const now = Date.now();
    for (const [id, until] of this.suppressions) {
      if (now >= until) this.suppressions.delete(id);
    }

    return {
      activeSignatures: this.windows.size,
      activeSuppressions: this.suppressions.size,
      shadowMode: this.config.shadowMode,
      config: this.config,
    };
  }

  /** Evict oldest signatures when at capacity (LRU by insertion order). */
  private evictIfNeeded(): void {
    while (this.windows.size >= this.config.maxSignatures) {
      const oldest = this.windows.keys().next().value;
      if (oldest != null) {
        this.windows.delete(oldest);
        this.suppressions.delete(oldest);
      } else {
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Process singleton (same pattern as GoldenRunRecorder)
// ---------------------------------------------------------------------------

let defaultLoopBreaker: LoopBreaker | null = null;

/**
 * Get or create the process-level LoopBreaker singleton.
 * Phase A: shadow mode (default). Phase B: set LOOP_BREAKER_ENABLED=1 to activate suppression.
 */
export function getLoopBreaker(): LoopBreaker {
  if (!defaultLoopBreaker) {
    const config = getPlanningRuntimeConfig();
    const shadowMode = !config.loopBreakerEnabled;
    defaultLoopBreaker = new LoopBreaker({ shadowMode });
  }
  return defaultLoopBreaker;
}

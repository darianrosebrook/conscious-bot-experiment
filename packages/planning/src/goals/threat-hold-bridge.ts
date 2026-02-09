/**
 * Threat→Hold Bridge (A1)
 *
 * Wires the ThreatPerceptionManager (mc-interface, GET /safety) to the
 * GoalHoldManager (planning) so that active goal-bound tasks are paused
 * when the bot is under threat and resumed when the threat subsides.
 *
 * Design invariants:
 * - A1.2  shouldHold is a pure, deterministic predicate (fail-closed)
 * - A1.5  evaluateThreatHolds is the sole write path for threat holds
 * - A1.7  Only holds with reason === 'unsafe' are released by the bridge
 * - A1.12 Tasks sorted by id; shouldHold is pure → replay-deterministic
 * - A1.13 Non-interference: existing holds (any reason) are never overridden
 * - A1.14 Deterministic ordering: tasks sorted by id before processing
 * - A1.16 Bridge failure isolation: fetchSignal never throws; outer catch in caller
 *
 * @see docs/planning/threat-hold-bridge.md (future)
 */

import type { Task } from '../types/task';
import type { GoalBinding, GoalHoldReason } from './goal-binding-types';
import { requestHold, requestClearHold } from './goal-hold-manager';

// ---------------------------------------------------------------------------
// Types (A1.1)
// ---------------------------------------------------------------------------

export type ThreatLevel = 'low' | 'medium' | 'high' | 'critical';

/** Structured threat signal from mc-interface /safety endpoint */
export interface ThreatSignal {
  overallThreatLevel: ThreatLevel;
  threats: Array<{ type: string; distance: number; threatLevel: number }>;
  fetchedAt: number;
}

/** Per-cycle evaluation result (emitted on 'threatBridgeEvent' channel) */
export interface ThreatBridgeEvaluatedEvent {
  type: 'threat_bridge_evaluated';
  timestamp: string;
  signal: ThreatSignal;
  holdDecision: boolean;
  tasksHeld: string[];     // sorted by id
  tasksReleased: string[]; // sorted by id
  threshold: ThreatLevel;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_LEVELS: ReadonlySet<string> = new Set(['low', 'medium', 'high', 'critical']);

const LEVEL_ORDER: Record<ThreatLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Fail-closed signal template: returned on fetch error, HTTP error, or malformed payload.
 *
 * `fetchedAt` is 0 — callers must clone and set `fetchedAt: Date.now()` before use.
 * Do not emit this constant directly into event logs; the fetcher always clones it.
 * Exported for test assertions (e.g., verifying shouldHold returns true on fail-closed).
 */
export const FAIL_CLOSED_SIGNAL: Readonly<ThreatSignal> = Object.freeze({
  overallThreatLevel: 'critical' as const,
  threats: [{ type: 'fetch_failure', distance: 0, threatLevel: 100 }],
  fetchedAt: 0,
});

// ---------------------------------------------------------------------------
// Pure predicate (A1.2, A1.12)
// ---------------------------------------------------------------------------

/**
 * Deterministic hold predicate.
 * Returns true if signal.overallThreatLevel >= threshold in severity ordering.
 * Fail-closed: unknown levels are treated as if they don't match, but the
 * fetcher already maps unknown levels to FAIL_CLOSED_SIGNAL ('critical').
 */
export function shouldHold(
  signal: ThreatSignal,
  threshold: ThreatLevel = 'high',
): boolean {
  return LEVEL_ORDER[signal.overallThreatLevel] >= LEVEL_ORDER[threshold];
}

// ---------------------------------------------------------------------------
// Fetcher (A1.16 — never throws, fail-closed on any error)
// ---------------------------------------------------------------------------

/**
 * Fetch the current threat signal from mc-interface's /safety endpoint.
 * Never throws — returns FAIL_CLOSED_SIGNAL on any error (network, timeout,
 * HTTP error, malformed payload).
 */
export async function fetchThreatSignal(
  endpoint: string = 'http://localhost:3005/safety',
  timeoutMs: number = 3000,
): Promise<ThreatSignal> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok) {
      return { ...FAIL_CLOSED_SIGNAL, fetchedAt: Date.now() };
    }
    const data: any = await res.json();
    const safety = data.safety ?? data;

    // Validate overallThreatLevel — fail-closed on malformed payload
    const level = safety.overallThreatLevel;
    if (!level || !VALID_LEVELS.has(level)) {
      return { ...FAIL_CLOSED_SIGNAL, fetchedAt: Date.now() };
    }

    return {
      overallThreatLevel: level as ThreatLevel,
      threats: Array.isArray(safety.threats)
        ? safety.threats.map((t: any) => ({
            type: String(t.type ?? 'unknown'),
            distance: Number(t.distance ?? 0),
            threatLevel: Number(t.threatLevel ?? 0),
          }))
        : [],
      fetchedAt: Date.now(),
    };
  } catch {
    return { ...FAIL_CLOSED_SIGNAL, fetchedAt: Date.now() };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Bridge evaluator (A1.5 — sole write path for threat holds)
// ---------------------------------------------------------------------------

/** Dependencies injected by the caller (modular-server.ts) */
export interface ThreatHoldBridgeDeps {
  fetchSignal: () => Promise<ThreatSignal>;
  getTasksToEvaluate: () => Task[];
  updateTaskStatus: (taskId: string, status: string) => Promise<void>;
  updateTaskMetadata: (taskId: string, patch: Record<string, any>) => void;
  emitLifecycleEvent?: (event: any) => void;
  emitBridgeEvent?: (event: ThreatBridgeEvaluatedEvent) => void;
}

/**
 * Evaluate current threat level and apply/release holds on goal-bound tasks.
 *
 * Called once per executor cycle, before task selection. This is the single
 * choke point (A1.11) for all threat-related hold mutations.
 */
export async function evaluateThreatHolds(
  deps: ThreatHoldBridgeDeps,
  threshold: ThreatLevel = 'high',
): Promise<ThreatBridgeEvaluatedEvent> {
  const signal = await deps.fetchSignal();
  const hold = shouldHold(signal, threshold);

  // Sort tasks by id for deterministic ordering (A1.14)
  const tasks = [...deps.getTasksToEvaluate()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  const tasksHeld: string[] = [];
  const tasksReleased: string[] = [];
  const now = new Date().toISOString();

  if (hold) {
    for (const task of tasks) {
      // Skip terminal and already-paused tasks
      if (
        task.status === 'completed' ||
        task.status === 'failed' ||
        task.status === 'paused'
      ) {
        continue;
      }

      const binding = task.metadata?.goalBinding as GoalBinding | undefined;
      if (!binding) continue; // non-goal tasks out of scope

      // Combat-exempt goals exist *because* of the threat — don't pause them
      if (binding.combatExempt === true) continue;

      // A1.13: Non-interference — skip if already held for any reason
      if (binding.hold) continue;

      // Capture previous status for restoration on release (A1.9)
      deps.updateTaskMetadata(task.id, {
        threatHoldPrevStatus: task.status,
      });

      const outcome = requestHold(task, 'unsafe', {
        resumeHints: signal.threats.map(
          (t) => `${t.type} at ${t.distance}m`,
        ),
      });

      if (outcome.action === 'applied') {
        await deps.updateTaskStatus(task.id, 'paused');
        tasksHeld.push(task.id);

        // Emit per-task lifecycle event (A1.10)
        deps.emitLifecycleEvent?.({
          type: 'goal_hold_applied',
          timestamp: now,
          taskId: task.id,
          holdReason: 'unsafe',
          nextReviewAt: (binding.hold as any)?.nextReviewAt ?? 0,
        });
      }
    }
  } else {
    for (const task of tasks) {
      const binding = task.metadata?.goalBinding as GoalBinding | undefined;
      if (!binding?.hold) continue;
      if (binding.hold.reason !== 'unsafe') continue; // A1.7 + A1.13

      const outcome = requestClearHold(task);

      if (outcome.action === 'cleared') {
        // Restore previous status (A1.9)
        const prevStatus =
          (task.metadata as any)?.threatHoldPrevStatus ?? 'active';
        await deps.updateTaskStatus(task.id, prevStatus);

        // Clear the captured status
        deps.updateTaskMetadata(task.id, {
          threatHoldPrevStatus: undefined,
        });

        tasksReleased.push(task.id);

        // Emit per-task lifecycle event (A1.10)
        deps.emitLifecycleEvent?.({
          type: 'goal_hold_cleared',
          timestamp: now,
          taskId: task.id,
          previousReason: 'unsafe',
          wasManual: false,
        });
      }
    }
  }

  const event: ThreatBridgeEvaluatedEvent = {
    type: 'threat_bridge_evaluated',
    timestamp: now,
    signal,
    holdDecision: hold,
    tasksHeld,      // already sorted (processed in id order)
    tasksReleased,  // already sorted
    threshold,
  };
  deps.emitBridgeEvent?.(event);
  return event;
}

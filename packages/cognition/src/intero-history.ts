/**
 * Interoception History
 *
 * Ring buffer storing timestamped intero snapshots, persisted as JSONL.
 * On startup, loads previous session data from disk. During each thought
 * cycle, records the current intero state. Provides query functions for
 * the dashboard evaluation tab.
 *
 * @author @darianrosebrook
 */

import * as fs from 'fs';
import type { InteroState, StressAxes } from './interoception-store';
import { createServerLogger } from './server-utils/server-logger';

export interface InteroSnapshot {
  ts: number;
  stress: number;
  focus: number;
  curiosity: number;
  stressAxes: StressAxes;
  emotionalState: string;
}

export interface InteroHistorySummary {
  count: number;
  oldestTs: number;
  newestTs: number;
}

const MAX_ENTRIES = 1800; // ~30 hours at 60s intervals
const MAX_FILE_BYTES = 500 * 1024; // 500KB before rotation
const LOG_PREFIX = '[INTERO_HISTORY]';
const interoLogger = createServerLogger({ subsystem: 'intero-history' });
const PERSIST_PATH =
  process.env.INTERO_HISTORY_LOG_PATH || 'intero-history.jsonl';

const history: InteroSnapshot[] = [];

function appendLine(snapshot: InteroSnapshot): void {
  const line = `${JSON.stringify(snapshot)}\n`;
  try {
    // Rotate file if too large
    try {
      const stat = fs.statSync(PERSIST_PATH);
      if (stat.size > MAX_FILE_BYTES) {
        // Keep only the last half of entries in the file
        const keep = Math.floor(MAX_ENTRIES / 2);
        const recent = history.slice(-keep);
        fs.writeFileSync(
          PERSIST_PATH,
          recent.map((s) => `${JSON.stringify(s)}\n`).join('')
        );
        return; // The current snapshot is already in history array; it was
        // added before appendLine is called, so it's in `recent`.
      }
    } catch {
      // File doesn't exist yet, that's fine
    }
    fs.appendFileSync(PERSIST_PATH, line);
  } catch {
    interoLogger.warn('Failed to append intero history line', {
      event: 'intero_history_append_failed',
      tags: ['intero-history', 'warn'],
      fields: { line: line.trim() },
    });
  }
}

/**
 * Record a snapshot from the current thought cycle.
 */
export function recordInteroSnapshot(
  state: InteroState,
  emotionalState: string
): void {
  const snapshot: InteroSnapshot = {
    ts: Date.now(),
    stress: state.stress,
    focus: state.focus,
    curiosity: state.curiosity,
    stressAxes: { ...state.stressAxes },
    emotionalState,
  };
  history.push(snapshot);

  // Evict oldest entries if over capacity
  if (history.length > MAX_ENTRIES) {
    history.splice(0, history.length - MAX_ENTRIES);
  }

  appendLine(snapshot);
}

/**
 * Query snapshots with optional time filter and limit.
 */
export function getInteroHistory(since = 0, limit = 300): InteroSnapshot[] {
  const filtered = since > 0
    ? history.filter((s) => s.ts > since)
    : history;
  return filtered.slice(-limit);
}

/**
 * Load persisted JSONL history from disk on startup.
 */
export function loadInteroHistory(): void {
  try {
    if (!fs.existsSync(PERSIST_PATH)) return;
    const raw = fs.readFileSync(PERSIST_PATH, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim());
    let loaded = 0;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as InteroSnapshot;
        if (typeof parsed.ts === 'number' && typeof parsed.stress === 'number') {
          history.push(parsed);
          loaded++;
        }
      } catch {
        // Skip malformed lines
      }
    }
    // Trim to max capacity
    if (history.length > MAX_ENTRIES) {
      history.splice(0, history.length - MAX_ENTRIES);
    }
    interoLogger.info('Loaded intero history snapshots', {
      event: 'intero_history_loaded',
      tags: ['intero-history', 'loaded'],
      fields: { loaded, path: PERSIST_PATH },
    });
  } catch (err) {
    interoLogger.warn('Failed to load intero history', {
      event: 'intero_history_load_failed',
      tags: ['intero-history', 'warn'],
      fields: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}

/**
 * Summary stats for the history buffer.
 */
export function getInteroHistorySummary(): InteroHistorySummary {
  if (history.length === 0) {
    return { count: 0, oldestTs: 0, newestTs: 0 };
  }
  return {
    count: history.length,
    oldestTs: history[0].ts,
    newestTs: history[history.length - 1].ts,
  };
}

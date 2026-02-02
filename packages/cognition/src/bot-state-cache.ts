/**
 * Bot State Cache — Cognition-Side Versioned State Singleton
 *
 * The periodic thought loop already fetches GET /state from minecraft-interface
 * every 60s and constructs ThoughtContext.currentState. This module promotes that
 * to a module-level versioned cache so all cognition surfaces (social chat, etc.)
 * can read grounded state without additional HTTP calls.
 *
 * Contract: stores the exact ThoughtContext['currentState'] shape plus tasks and
 * emotional state. No new competing schema.
 *
 * @author @darianrosebrook
 */

import type { ThoughtContext } from './thought-generator';

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface BotStateCacheEnvelope {
  /** Schema version — bump on breaking changes. */
  v: 1;
  /** Monotonic sequence number, incremented on every write. Enables dedupe/ordering. */
  seq: number;
  /** Timestamp (Date.now()) of the observation that produced this state. */
  observedAtMs: number;
  /** Random per-session seed, generated once at module load. */
  seed: string;
  /** Bot world state — same shape as ThoughtContext['currentState']. */
  state: NonNullable<ThoughtContext['currentState']>;
  /** Full inventory name→count map (never truncated). */
  inventoryMap: Record<string, number>;
  /** Current tasks from planning service. */
  tasks: NonNullable<ThoughtContext['currentTasks']>;
  /** Computed emotional state string. */
  emotionalState: string;
}

// ---------------------------------------------------------------------------
// Module-level singleton state
// ---------------------------------------------------------------------------

const SESSION_SEED =
  Math.random().toString(36).slice(2, 10) +
  Math.random().toString(36).slice(2, 10);

let _cache: BotStateCacheEnvelope | null = null;
let _seq = 0;

/**
 * Staleness threshold for triggering a full /state refresh.
 * Set to 2× the periodic thought loop interval (60s) so chat never triggers
 * inline HTTP fetches under normal operation. Metadata-based patching covers
 * health/food/position between cycles.
 */
export const STALE_THRESHOLD_MS = 120_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a full inventory map from the inventory array.
 * Pure function: array → Record<string, number>, no truncation.
 */
export function buildInventoryMap(
  inventory: Array<{ name: string; count: number; displayName?: string }> | undefined
): Record<string, number> {
  const map: Record<string, number> = {};
  if (!inventory) return map;
  for (const item of inventory) {
    const key = item.name || item.displayName || 'unknown';
    map[key] = (map[key] ?? 0) + item.count;
  }
  return map;
}

/**
 * Write a new snapshot to the cache.
 * Sets observedAtMs = Date.now() and increments the monotonic seq.
 */
export function updateBotStateCache(
  state: NonNullable<ThoughtContext['currentState']>,
  tasks?: ThoughtContext['currentTasks'],
  emotionalState?: string
): void {
  _seq++;
  _cache = {
    v: 1,
    seq: _seq,
    observedAtMs: Date.now(),
    seed: SESSION_SEED,
    state,
    inventoryMap: buildInventoryMap(state.inventory),
    tasks: tasks ?? [],
    emotionalState: emotionalState ?? 'neutral',
  };
}

/**
 * Read the current cache envelope.
 * Returns null if never written.
 */
export function getBotStateCache(): BotStateCacheEnvelope | null {
  return _cache;
}

/**
 * Returns true only when the position has all three numeric-finite coordinates.
 * Guards against partial objects (`{}`, `{ x: NaN }`) that can arrive from
 * JSON round-tripping when the bot is disconnected.
 */
export function isCompletePosition(
  pos: unknown
): pos is { x: number; y: number; z: number } {
  if (!pos || typeof pos !== 'object') return false;
  const p = pos as Record<string, unknown>;
  return (
    Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
  );
}

/**
 * Opportunistically patch the existing cache with fresh values from metadata.
 * Does NOT increment seq or reset observedAtMs — this is a partial update,
 * not a full observation. Only patches fields that are defined and non-null.
 * Position is only patched when all three coordinates are finite numbers —
 * a partial or NaN position is worse than no update.
 * No-ops if the cache has never been written.
 */
export function patchBotStateCache(patch: {
  health?: number;
  food?: number;
  position?: { x: number; y: number; z: number };
}): void {
  if (!_cache) return;
  const s = { ..._cache.state };
  if (patch.health !== undefined && patch.health !== null) s.health = patch.health;
  if (patch.food !== undefined && patch.food !== null) s.food = patch.food;
  if (isCompletePosition(patch.position)) s.position = patch.position;
  _cache = { ..._cache, state: s };
}

/**
 * Age in ms since the last cache write.
 * Returns Infinity if the cache has never been written.
 */
export function botStateCacheAgeMs(): number {
  if (!_cache) return Infinity;
  return Date.now() - _cache.observedAtMs;
}

// ---------------------------------------------------------------------------
// Test-only reset (not exported from package index)
// ---------------------------------------------------------------------------

/** @internal — reset cache state for tests. */
export function _resetCacheForTest(): void {
  _cache = null;
  _seq = 0;
}

/**
 * Autonomous executor scheduling and circuit-breaker wrapper.
 * Runs a single runCycle callback on a fixed interval with exponential backoff
 * on errors and optional circuit breaker when the bot is unavailable.
 *
 * @author @darianrosebrook
 */

declare global {
  // eslint-disable-next-line no-var
  var __planningExecutorState:
    | {
        running: boolean;
        failures: number;
        lastAttempt: number;
        breaker: 'closed' | 'open' | 'half-open';
      }
    | undefined;
  // eslint-disable-next-line no-var
  var __planningInterval: ReturnType<typeof setInterval> | undefined;
}

export interface AutonomousExecutorOptions {
  pollMs: number;
  maxBackoffMs: number;
  breakerOpenMs: number;
}

// ---------------------------------------------------------------------------
// Executor configuration + feature gates
// ---------------------------------------------------------------------------

export interface ExecutorConfig {
  enabled: boolean;
  mode: 'shadow' | 'live';
  maxStepsPerMinute: number;
  failureCooldownMs: number;
  leafAllowlist: Set<string>; // canonical tool names (e.g. 'minecraft.dig_block')
}

// ---------------------------------------------------------------------------
// Geofence configuration + guard
// ---------------------------------------------------------------------------

export interface GeofenceConfig {
  enabled: boolean;
  center: { x: number; z: number }; // horizontal only (Y unconstrained by default)
  radius: number;                    // Chebyshev distance (square, not circle)
  yRange?: { min: number; max: number }; // optional vertical constraint
}

export function parseGeofenceConfig(): GeofenceConfig {
  const raw = process.env.EXECUTOR_GEOFENCE_CENTER; // format: "x,z" or "x,y,z"
  if (!raw) return { enabled: false, center: { x: 0, z: 0 }, radius: 100 };
  const parts = raw.split(',').map(Number);
  const radius = Number(process.env.EXECUTOR_GEOFENCE_RADIUS || 100);

  if (parts.length === 2) {
    const [x, z] = parts;
    return { enabled: !isNaN(x) && !isNaN(z) && radius > 0, center: { x, z }, radius };
  }
  if (parts.length === 3) {
    const [x, , z] = parts; // x, _y, z — y is ignored for center
    const yRangeRaw = process.env.EXECUTOR_GEOFENCE_Y_RANGE;
    const parsedYRange = yRangeRaw ? (() => {
      const [min, max] = yRangeRaw.split(',').map(Number);
      return !isNaN(min) && !isNaN(max) ? { min, max } : undefined;
    })() : undefined;
    return {
      enabled: !isNaN(x) && !isNaN(z) && radius > 0,
      center: { x, z },
      radius,
      yRange: parsedYRange,
    };
  }
  return { enabled: false, center: { x: 0, z: 0 }, radius: 100 };
}

export function isInsideGeofence(
  position: { x: number; y?: number; z: number },
  config: GeofenceConfig,
): boolean {
  if (!config.enabled) return true;
  const insideXZ = Math.abs(position.x - config.center.x) <= config.radius
    && Math.abs(position.z - config.center.z) <= config.radius;
  if (!insideXZ) return false;
  if (config.yRange && position.y !== undefined) {
    return position.y >= config.yRange.min && position.y <= config.yRange.max;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Executor guard decision pipeline
// ---------------------------------------------------------------------------
//
// The guard ordering is a **contract**. Both execution paths (primary plan
// and MCP fallback) in modular-server.ts must follow this exact sequence:
//
//   0. geofence — fail-closed: block if position unknown OR outside fence
//   1. allowlist — terminally block unknown leaves (free, no budget)
//   2. shadow   — observe without mutating (never throttled)
//   3. rate     — live-only throttle (canExecute check, no record)
//   4. rigG     — feasibility gate via startTaskStep (may block + schedule replan)
//   5. commit   — record() + execute (budget consumed only here)
//
// Invariants:
//   - Shadow mode MUST NOT be gated by the rate limiter.
//   - record() MUST NOT burn budget unless execution is committed.
//
// If you refactor the guard logic, update evaluateGuards and its tests.
// ---------------------------------------------------------------------------

/**
 * Result of the guard decision pipeline.
 * Tells the caller what to do without performing side effects.
 */
export type GuardDecision =
  | { action: 'block_unknown_position' }  // geofence enabled but position unknown
  | { action: 'block_outside_geofence' }
  | { action: 'block_unknown_leaf' }
  | { action: 'shadow_observe' }
  | { action: 'rate_limited' }
  | { action: 'await_rig_g' }
  | { action: 'execute' };

/**
 * Pure decision function that evaluates the executor guard pipeline.
 * Does not perform side effects — the caller acts on the returned decision.
 *
 * @param toolName      Canonical tool name (e.g. 'minecraft.dig_block')
 * @param config        Executor configuration
 * @param rateLimiter   Rate limiter instance (canExecute is checked, record is NOT called)
 * @param geofence      Optional geofence context (position + config)
 */
export function evaluateGuards(
  toolName: string,
  config: ExecutorConfig,
  rateLimiter: StepRateLimiter,
  geofence?: {
    position: { x: number; y?: number; z: number } | undefined | null;
    config: GeofenceConfig;
  },
): GuardDecision {
  // 0. Geofence (fail-closed)
  if (geofence?.config.enabled) {
    if (!geofence.position) {
      return { action: 'block_unknown_position' };
    }
    if (!isInsideGeofence(geofence.position, geofence.config)) {
      return { action: 'block_outside_geofence' };
    }
  }

  // 1. Leaf allowlist (terminally block unknown leaves)
  if (!config.leafAllowlist.has(toolName)) {
    return { action: 'block_unknown_leaf' };
  }

  // 2. Shadow mode: always observe, never throttled
  if (config.mode === 'shadow') {
    return { action: 'shadow_observe' };
  }

  // 3. Rate limiter (live only)
  if (!rateLimiter.canExecute()) {
    return { action: 'rate_limited' };
  }

  // 4. Rig G gate (caller must invoke startTaskStep and check result)
  // We return 'await_rig_g' to signal the caller should run the gate.
  // If the gate passes, caller proceeds to 'execute' (calls record() + toolExecutor).
  // This stage is not evaluated here because it requires async I/O.
  return { action: 'await_rig_g' };
}

export function parseExecutorConfig(): ExecutorConfig {
  const rawMode = (process.env.EXECUTOR_MODE || 'shadow').toLowerCase();
  const wantsLive = rawMode === 'live';

  // Safety: require explicit confirmation for live mode.
  // Note: live mode also requires Phase 0 (action-translator dispatch fixes) to be
  // merged, otherwise solver-generated step types (craft, smelt, building) will fail
  // at the minecraft-interface executeAction boundary. Shadow mode is safe regardless.
  if (wantsLive && process.env.EXECUTOR_LIVE_CONFIRM !== 'YES') {
    console.warn(
      '[Executor] EXECUTOR_MODE=live but EXECUTOR_LIVE_CONFIRM is not YES. ' +
      'Forcing shadow mode. Set EXECUTOR_LIVE_CONFIRM=YES to enable live execution.'
    );
  }

  const isLive = wantsLive && process.env.EXECUTOR_LIVE_CONFIRM === 'YES';

  return {
    enabled: process.env.ENABLE_PLANNING_EXECUTOR === '1',
    mode: isLive ? 'live' : 'shadow',
    maxStepsPerMinute: Number(process.env.EXECUTOR_MAX_STEPS_PER_MINUTE || 6),
    failureCooldownMs: Number(process.env.EXECUTOR_FAILURE_COOLDOWN_MS || 10000),
    leafAllowlist: new Set(), // populated by caller with KNOWN_LEAF_NAMES
  };
}

/**
 * Sliding-window rate limiter for step execution.
 *
 * - canExecute() checks budget without consuming it
 * - record() consumes budget (call ONLY in live mode after committing to execute)
 * - Shadow mode and gate-blocks do NOT call record()
 */
export class StepRateLimiter {
  private timestamps: number[] = [];
  constructor(private maxPerMinute: number) {}

  canExecute(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => t > now - 60_000);
    return this.timestamps.length < this.maxPerMinute;
  }

  record(): void {
    this.timestamps.push(Date.now());
  }
}

const DEFAULT_OPTIONS: AutonomousExecutorOptions = {
  pollMs: Number(process.env.EXECUTOR_POLL_MS || 10_000),
  maxBackoffMs: Number(process.env.EXECUTOR_MAX_BACKOFF_MS || 60_000),
  breakerOpenMs: Number(process.env.BOT_BREAKER_OPEN_MS || 15_000),
};

/**
 * Start the autonomous executor loop. Calls runCycle on every poll interval.
 * Applies circuit breaker (skip cycle while breaker open, then half-open)
 * and exponential backoff on runCycle errors.
 * Idempotent: clears any existing interval before starting a new one.
 */
export function startAutonomousExecutor(
  runCycle: () => Promise<void>,
  options: Partial<AutonomousExecutorOptions> = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (global.__planningInterval) {
    clearInterval(global.__planningInterval);
    global.__planningInterval = undefined;
  }

  global.__planningInterval = setInterval(async () => {
    try {
      // Kill switch: checked every tick before runCycle().
      //
      // Semantics and limitations:
      //   - This is a soft stop for the scheduling loop, NOT a real control plane.
      //   - It prevents new ticks from calling runCycle(). It will NOT interrupt
      //     an in-flight action that is already executing inside runCycle().
      //   - In many deployment setups (Docker, systemd), changing an env var
      //     requires a process restart anyway, so this primarily serves as:
      //     (a) a test convenience (flip env mid-test without restarting),
      //     (b) an emergency soft stop if the process is long-lived.
      //   - For immediate halt of in-flight actions, use the circuit breaker
      //     (set global.__planningExecutorState.breaker = 'open') or stop the
      //     process entirely.
      if (process.env.ENABLE_PLANNING_EXECUTOR !== '1') {
        return;
      }

      const st = global.__planningExecutorState;
      if (st?.breaker === 'open') {
        const elapsed = Date.now() - (st.lastAttempt || 0);
        if (elapsed < opts.breakerOpenMs) return;
        st.breaker = 'half-open';
      }

      try {
        await runCycle();
      } catch (error) {
        const s = global.__planningExecutorState;
        if (s) {
          s.failures = Math.min(s.failures + 1, 100);
          const backoff = Math.min(2 ** s.failures * 250, opts.maxBackoffMs);
          console.warn(
            `Autonomous executor error (${s.failures}); backoff ${backoff}ms`
          );
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    } catch (error) {
      console.error('[planning] Autonomous executor tick failed:', error);
    }
  }, opts.pollMs);
}

/**
 * Stop the autonomous executor loop. No-op if not running.
 */
export function stopAutonomousExecutor(): void {
  if (global.__planningInterval) {
    clearInterval(global.__planningInterval);
    global.__planningInterval = undefined;
  }
}

// ---------------------------------------------------------------------------
// Emergency stop
// ---------------------------------------------------------------------------

let _executorAbortController: AbortController | null = null;

export function initExecutorAbortController(): AbortController {
  _executorAbortController = new AbortController();
  return _executorAbortController;
}

export function getExecutorAbortSignal(): AbortSignal | undefined {
  return _executorAbortController?.signal;
}

/**
 * Emergency stop: aborts in-flight HTTP requests and stops the executor loop.
 *
 * Note: abort only cancels outbound HTTP requests. If a leaf action has already
 * been dispatched to the MC bot, the bot-side effect may continue. This is a
 * "stop issuing new actions" primitive, not "undo last action."
 */
export function emergencyStopExecutor(): void {
  _executorAbortController?.abort();
  stopAutonomousExecutor();
  console.warn('[executor] EMERGENCY STOP — new actions halted, in-flight HTTP aborted');
}

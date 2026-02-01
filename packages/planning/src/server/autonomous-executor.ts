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
  leafAllowlist: Set<string>; // raw leaf names (e.g. 'dig_block', not 'minecraft.dig_block')
}

export function parseExecutorConfig(): ExecutorConfig {
  const rawMode = (process.env.EXECUTOR_MODE || 'shadow').toLowerCase();
  const wantsLive = rawMode === 'live';

  // Safety: require explicit confirmation for live mode
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
      // Kill switch: checked every tick (test convenience; not a production control plane)
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

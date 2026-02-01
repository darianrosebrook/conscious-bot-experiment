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
          const backoff = Math.min(
            2 ** s.failures * 250,
            opts.maxBackoffMs
          );
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

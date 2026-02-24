/**
 * Logging utility — throttle-only (no suppression).
 * Repeated messages are rate-limited to one per THROTTLE_INTERVAL
 * but never permanently silenced, so runtime captures retain full signal.
 */
class LoggingOptimizer {
  private lastLogTimes: Map<string, number> = new Map();
  private readonly THROTTLE_INTERVAL = 30000; // 30 seconds

  log(message: string, throttleKey?: string, maxInterval = this.THROTTLE_INTERVAL): void {
    const key = throttleKey || message;
    const now = Date.now();
    const lastTime = this.lastLogTimes.get(key) || 0;

    if (now - lastTime >= maxInterval) {
      console.log(message);
      this.lastLogTimes.set(key, now);
    }
  }

  warn(message: string, throttleKey?: string): void {
    const key = throttleKey || message;
    const now = Date.now();
    const lastTime = this.lastLogTimes.get(key) || 0;

    if (now - lastTime >= this.THROTTLE_INTERVAL) {
      console.warn(message);
      this.lastLogTimes.set(key, now);
    }
  }
}

export const logOptimizer = new LoggingOptimizer();

export { LoggingOptimizer };

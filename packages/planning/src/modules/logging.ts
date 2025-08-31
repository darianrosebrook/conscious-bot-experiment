/**
 * Logging optimization to reduce verbosity and repetitive messages
 */
class LoggingOptimizer {
  private lastLogTimes: Map<string, number> = new Map();
  private logCounts: Map<string, number> = new Map();
  private suppressedMessages: Set<string> = new Set();
  private readonly THROTTLE_INTERVAL = 30000; // 30 seconds
  private readonly MAX_REPEATS = 3; // Max times to show same message

  log(message: string, throttleKey?: string, maxInterval = this.THROTTLE_INTERVAL): void {
    const key = throttleKey || message;
    const now = Date.now();
    const lastTime = this.lastLogTimes.get(key) || 0;
    const count = this.logCounts.get(key) || 0;

    if (count >= this.MAX_REPEATS && !this.suppressedMessages.has(key)) {
      this.suppressedMessages.add(key);
      console.log(`🔇 Suppressing repeated message: "${message}" (shown ${count} times)`);
      return;
    }

    if (now - lastTime >= maxInterval) {
      console.log(message);
      this.lastLogTimes.set(key, now);
      this.logCounts.set(key, count + 1);
    }
  }

  warn(message: string, throttleKey?: string): void {
    const key = throttleKey || message;
    const now = Date.now();
    const lastTime = this.lastLogTimes.get(key) || 0;
    const count = this.logCounts.get(key) || 0;

    if (count >= this.MAX_REPEATS && !this.suppressedMessages.has(key)) {
      this.suppressedMessages.add(key);
      console.warn(`🔇 Suppressing repeated warning: "${message}" (shown ${count} times)`);
      return;
    }

    if (now - lastTime >= this.THROTTLE_INTERVAL) {
      console.warn(message);
      this.lastLogTimes.set(key, now);
      this.logCounts.set(key, count + 1);
    }
  }

  resetSuppression(key: string): void {
    this.suppressedMessages.delete(key);
    this.logCounts.set(key, 0);
  }

  getStatus(): { suppressed: number; throttled: number } {
    return { suppressed: this.suppressedMessages.size, throttled: this.logCounts.size };
  }
}

export const logOptimizer = new LoggingOptimizer();

export { LoggingOptimizer };


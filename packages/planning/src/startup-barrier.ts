import type { ReadinessMonitor } from './server/execution-readiness';

let systemReady = process.env.SYSTEM_READY_ON_BOOT === '1';
let readyAt: string | null = systemReady ? new Date().toISOString() : null;
let readySource: string | null = systemReady ? 'env' : null;
const waiters: Array<() => void> = [];

// ---------------------------------------------------------------------------
// ReadinessMonitor singleton
// ---------------------------------------------------------------------------

let _readinessMonitor: ReadinessMonitor | null = null;

export function setReadinessMonitor(monitor: ReadinessMonitor): void {
  _readinessMonitor = monitor;
}

export function getReadinessMonitor(): ReadinessMonitor | null {
  return _readinessMonitor;
}

export function isServiceReachable(name: string): boolean {
  return _readinessMonitor?.isUp(name) ?? false;
}

export function isSystemReady(): boolean {
  return systemReady;
}

export function getSystemReadyState(): {
  ready: boolean;
  readyAt: string | null;
  source: string | null;
} {
  return { ready: systemReady, readyAt, source: readySource };
}

export function markSystemReady(source?: string): void {
  const wasReady = systemReady;
  if (!wasReady) {
    systemReady = true;
    readyAt = new Date().toISOString();
    readySource = source || 'unknown';
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      if (waiter) waiter();
    }
  }
  // Idempotent: always trigger a reprobe so the executor can recover
  // from startup-ordering issues (e.g. MC interface started after planning).
  if (_readinessMonitor) {
    _readinessMonitor.reprobeNow().catch(() => {});
  }
}

export function waitForSystemReady(timeoutMs = 0): Promise<boolean> {
  if (systemReady) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timeout: NodeJS.Timeout | null = null;
    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        timeout = null;
        resolve(false);
      }, timeoutMs);
    }

    waiters.push(() => {
      if (timeout) clearTimeout(timeout);
      resolve(true);
    });
  });
}

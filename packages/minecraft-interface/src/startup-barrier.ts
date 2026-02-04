/**
 * Startup Barrier for Minecraft Interface
 *
 * Gates processing (BeliefBus, cognition emission, observation broadcast)
 * until the system is fully ready. Tracks which services have reported ready
 * and supports an escape hatch for development/debugging.
 *
 * Similar to packages/planning/src/startup-barrier.ts but with service tracking.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let systemReady = process.env.SYSTEM_READY_ON_BOOT === '1';
let readyAt: string | null = systemReady ? new Date().toISOString() : null;
let readySource: string | null = systemReady ? 'env' : null;

// Track which services have reported ready
const readyServices = new Set<string>();
let expectedServiceCount = 0;
let temporaryProceed = false;
let temporaryProceedReason: string | null = null;

// Waiters that will be resolved when system becomes ready
const waiters: Array<() => void> = [];

// Callbacks for state changes
const onReadyCallbacks: Array<(source: string) => void> = [];

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

export function isSystemReady(): boolean {
  return systemReady || temporaryProceed;
}

export function isFullyReady(): boolean {
  return systemReady && !temporaryProceed;
}

export function getSystemReadyState(): {
  ready: boolean;
  fullyReady: boolean;
  readyAt: string | null;
  source: string | null;
  readyServices: string[];
  expectedServiceCount: number;
  temporaryProceed: boolean;
  temporaryProceedReason: string | null;
} {
  return {
    ready: isSystemReady(),
    fullyReady: isFullyReady(),
    readyAt,
    source: readySource,
    readyServices: Array.from(readyServices),
    expectedServiceCount,
    temporaryProceed,
    temporaryProceedReason,
  };
}

export function getReadyServiceCount(): number {
  return readyServices.size;
}

export function getExpectedServiceCount(): number {
  return expectedServiceCount;
}

export function isServiceReady(serviceName: string): boolean {
  return readyServices.has(serviceName);
}

// ---------------------------------------------------------------------------
// Mutation functions
// ---------------------------------------------------------------------------

/**
 * Mark the system as ready. Called when start.js broadcasts readiness.
 */
export function markSystemReady(source?: string, payload?: {
  services?: string[];
  expectedCount?: number;
  timestamp?: number;
}): void {
  if (systemReady) return;

  systemReady = true;
  readyAt = new Date().toISOString();
  readySource = source || 'unknown';

  if (payload?.services) {
    for (const service of payload.services) {
      readyServices.add(service);
    }
  }

  if (payload?.expectedCount) {
    expectedServiceCount = payload.expectedCount;
  }

  // Clear temporary proceed if we're now fully ready
  if (temporaryProceed) {
    console.log('[StartupBarrier] Clearing temporary proceed - system now fully ready');
    temporaryProceed = false;
    temporaryProceedReason = null;
  }

  // Notify callbacks
  for (const callback of onReadyCallbacks) {
    try {
      callback(readySource);
    } catch (error) {
      console.error('[StartupBarrier] onReady callback error:', error);
    }
  }

  // Resolve all waiters
  while (waiters.length > 0) {
    const waiter = waiters.shift();
    if (waiter) waiter();
  }

  console.log(`[StartupBarrier] System ready (source: ${readySource}, services: ${readyServices.size}/${expectedServiceCount})`);
}

/**
 * Track a service as ready. Used to know when all services are up.
 */
export function markServiceReady(serviceName: string): void {
  if (!readyServices.has(serviceName)) {
    readyServices.add(serviceName);
    console.log(`[StartupBarrier] Service ready: ${serviceName} (${readyServices.size}/${expectedServiceCount || '?'})`);
  }
}

/**
 * Set the expected number of services.
 */
export function setExpectedServiceCount(count: number): void {
  expectedServiceCount = count;
}

/**
 * Escape hatch: proceed temporarily even if not all services are ready.
 * Use this for development/debugging when working on a specific service.
 */
export function proceedTemporarily(reason: string): void {
  if (systemReady) {
    console.log('[StartupBarrier] Already fully ready, ignoring proceedTemporarily');
    return;
  }

  temporaryProceed = true;
  temporaryProceedReason = reason;

  console.log(`[StartupBarrier] Proceeding temporarily: ${reason}`);

  // Notify callbacks with temporary source
  for (const callback of onReadyCallbacks) {
    try {
      callback(`temporary:${reason}`);
    } catch (error) {
      console.error('[StartupBarrier] onReady callback error:', error);
    }
  }

  // Resolve waiters (they can check isFullyReady() if they need to distinguish)
  while (waiters.length > 0) {
    const waiter = waiters.shift();
    if (waiter) waiter();
  }
}

/**
 * Reset the barrier (for testing or reconnection scenarios).
 */
export function resetBarrier(): void {
  systemReady = false;
  readyAt = null;
  readySource = null;
  readyServices.clear();
  expectedServiceCount = 0;
  temporaryProceed = false;
  temporaryProceedReason = null;
  waiters.length = 0;
}

// ---------------------------------------------------------------------------
// Async helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the system to become ready (or temporarily proceed).
 * Returns true if ready, false if timed out.
 */
export function waitForSystemReady(timeoutMs = 0): Promise<boolean> {
  if (isSystemReady()) return Promise.resolve(true);

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

/**
 * Register a callback to be called when system becomes ready.
 */
export function onSystemReady(callback: (source: string) => void): void {
  onReadyCallbacks.push(callback);

  // If already ready, call immediately
  if (isSystemReady()) {
    try {
      callback(readySource || 'already-ready');
    } catch (error) {
      console.error('[StartupBarrier] onReady callback error:', error);
    }
  }
}

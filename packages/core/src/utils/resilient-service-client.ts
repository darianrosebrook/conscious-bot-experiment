/**
 * Resilient HTTP client for external service calls.
 *
 * Retries on connection failures (ECONNREFUSED, ETIMEDOUT, etc.) with
 * exponential backoff. Enables hot-reloading: when cognition, planning,
 * or memory services restart, outbound calls retry until they succeed.
 *
 * @author @darianrosebrook
 */

/** Error codes that indicate transient connection failure */
const TRANSIENT_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);

function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const err = error as NodeJS.ErrnoException;
    const cause = (error as { cause?: unknown }).cause as
      | NodeJS.ErrnoException
      | undefined;
    const code = err.code ?? cause?.code;
    if (code && TRANSIENT_CODES.has(code)) return true;
    if (error.message?.includes('fetch failed')) return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ResilientFetchOptions extends RequestInit {
  /** Max retries on transient failures. Default: 5 */
  maxRetries?: number;
  /** Initial backoff in ms. Default: 500 */
  initialBackoffMs?: number;
  /** Max backoff in ms. Default: 8000 */
  maxBackoffMs?: number;
  /** Request timeout in ms. Default: 10000 */
  timeoutMs?: number;
  /** If true, throw on final failure instead of returning null. Default: false */
  throwOnFinalFailure?: boolean;
  /** Optional label for logging. Default: url */
  label?: string;
  /** Suppress all failure logging. For discovery probes. Default: false */
  silent?: boolean;
}

// ---------------------------------------------------------------------------
// Bounded dedup map with error-class keying
// ---------------------------------------------------------------------------

/**
 * Max entries in the dedup map. Entries evicted LRU when full.
 * Override with RESILIENT_FETCH_DEDUP_MAX env var.
 */
const _rawDedupMax = Number(
  (typeof process !== 'undefined' && process.env?.RESILIENT_FETCH_DEDUP_MAX) || 64
);
const DEDUP_MAX_ENTRIES = Number.isFinite(_rawDedupMax) && _rawDedupMax > 0
  ? Math.floor(_rawDedupMax)
  : 64;
/**
 * Minimum ms between duplicate warns for the same label+errorKind.
 * Override with RESILIENT_FETCH_DEDUP_COOLDOWN_MS env var.
 */
const _rawDedupCooldown = Number(
  (typeof process !== 'undefined' && process.env?.RESILIENT_FETCH_DEDUP_COOLDOWN_MS) || 60_000
);
const DEDUP_COOLDOWN_MS = Number.isFinite(_rawDedupCooldown) && _rawDedupCooldown > 0
  ? Math.floor(_rawDedupCooldown)
  : 60_000;

const _dedupMap = new Map<string, number>(); // key → last-log-timestamp

function _classifyError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: any }).cause;
    const code = (error as any).code ?? cause?.code;
    if (code && typeof code === 'string') return code; // ECONNREFUSED, ETIMEDOUT, etc.
    if (error.name === 'AbortError') return 'timeout';
    if (error.message?.includes('fetch failed')) return 'fetch_failed';
  }
  return 'unknown';
}

function _shouldLog(label: string, errorKind: string): boolean {
  const key = `${label}:${errorKind}`;
  const now = Date.now();
  const last = _dedupMap.get(key);
  if (last !== undefined && now - last < DEDUP_COOLDOWN_MS) {
    // Within cooldown — suppress logging but refresh LRU position so
    // hot-but-suppressed keys are not evicted by cold keys.
    _dedupMap.delete(key);
    _dedupMap.set(key, last); // preserve original timestamp, refresh insertion order
    return false;
  }

  // LRU: delete existing key so re-insertion moves it to the end
  if (_dedupMap.has(key)) {
    _dedupMap.delete(key);
  } else if (_dedupMap.size >= DEDUP_MAX_ENTRIES) {
    // Evict least-recently-used (oldest insertion order)
    const oldest = _dedupMap.keys().next().value;
    if (oldest) _dedupMap.delete(oldest);
  }

  _dedupMap.set(key, now);
  return true;
}

/** Test-only: reset dedup state between tests. */
export function _resetLogDedup(): void {
  _dedupMap.clear();
}

/**
 * Fetch with retry on transient connection failures.
 * Returns null on final failure unless throwOnFinalFailure is true.
 */
export async function resilientFetch(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<Response | null> {
  const {
    maxRetries = 5,
    initialBackoffMs = 500,
    maxBackoffMs = 8000,
    timeoutMs = 10000,
    throwOnFinalFailure = false,
    label = url,
    silent = false,
    ...init
  } = options;

  let lastError: unknown;
  let backoff = initialBackoffMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      if (init.signal) {
        init.signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          controller.abort();
        });
      }
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt === maxRetries) {
        break;
      }
      const delay = Math.min(backoff, maxBackoffMs);
      if (attempt < maxRetries) {
        if (!silent) {
          const kind = _classifyError(error);
          if (_shouldLog(label, kind)) {
            console.warn(
              `[resilient-fetch] ${label} unavailable (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms [${kind}]`
            );
          }
        }
        await sleep(delay);
        backoff *= 2;
      }
    }
  }

  if (!throwOnFinalFailure) {
    if (!silent) {
      const kind = _classifyError(lastError);
      if (_shouldLog(label, kind)) {
        console.warn(
          `[resilient-fetch] ${label} unavailable after ${maxRetries + 1} attempts [${kind}]:`,
          lastError instanceof Error ? lastError.message : lastError
        );
      }
    }
    return null;
  }
  throw lastError;
}

export interface WaitForServiceOptions {
  /** Poll interval in ms. Default: 2000 */
  intervalMs?: number;
  /** Max wait time in ms. Default: 60000 */
  timeoutMs?: number;
  /** Path to check. Default: / (or base path from url) */
  path?: string;
}

/**
 * Poll until a service responds with 2xx or timeout.
 * For startup orchestration when services must be ready before proceeding.
 */
export async function waitForService(
  baseUrl: string,
  options: WaitForServiceOptions = {}
): Promise<boolean> {
  const { intervalMs = 2000, timeoutMs = 60000 } = options;
  const url = options.path
    ? `${baseUrl.replace(/\/$/, '')}${options.path}`
    : baseUrl;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // Transient, will retry
    }
    await sleep(intervalMs);
  }
  return false;
}

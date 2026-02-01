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
        console.warn(
          `[resilient-fetch] ${label} unavailable (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`
        );
        await sleep(delay);
        backoff *= 2;
      }
    }
  }

  if (!throwOnFinalFailure) {
    console.warn(
      `[resilient-fetch] ${label} unavailable after ${maxRetries + 1} attempts:`,
      lastError instanceof Error ? lastError.message : lastError
    );
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

/**
 * Resilient HTTP client for external service calls.
 *
 * Retries on connection failures (ECONNREFUSED, ETIMEDOUT, etc.) with
 * exponential backoff. Enables hot-reloading when services restart.
 *
 * Minimal copy for dashboard to avoid pulling in @conscious-bot/core (mineflayer, etc).
 *
 * @author @darianrosebrook
 */

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
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  timeoutMs?: number;
  label?: string;
}

export async function resilientFetch(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<Response | null> {
  const {
    maxRetries = 5,
    initialBackoffMs = 500,
    maxBackoffMs = 8000,
    timeoutMs = 10000,
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
      if (!isTransientError(error) || attempt === maxRetries) break;
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

  console.warn(
    `[resilient-fetch] ${label} unavailable after ${maxRetries + 1} attempts:`,
    lastError instanceof Error ? lastError.message : lastError
  );
  return null;
}

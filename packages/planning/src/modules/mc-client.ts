// Centralized Minecraft endpoint and resilient HTTP utilities

import {
  classifyFailure,
  HEALTH_CHECK_TIMEOUT_MS,
  FailureKind,
} from './timeout-policy';
import { resilientFetch } from '@conscious-bot/core';

export const MC_ENDPOINT =
  process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005';

let mcFailureCount = 0;
let mcCircuitOpenUntil = 0; // epoch ms

export function mcCircuitOpen(): boolean {
  return Date.now() < mcCircuitOpenUntil;
}

function mcRecordFailure(): void {
  mcFailureCount += 1;
  if (mcFailureCount >= 3) {
    mcCircuitOpenUntil = Date.now() + 30_000; // open for 30s
  }
}

function mcRecordSuccess(): void {
  mcFailureCount = 0;
  mcCircuitOpenUntil = 0;
}

export async function mcFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number; externalSignal?: AbortSignal } = {}
): Promise<Response> {
  if (mcCircuitOpen()) {
    throw new Error('Minecraft endpoint circuit open');
  }
  const url = `${MC_ENDPOINT}${path.startsWith('/') ? '' : '/'}${path}`;
  const retries = 2;
  const baseDelay = 300;
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    // Named handler for external abort signal — removed in finally to prevent leak
    const onExternalAbort = init.externalSignal
      ? () => { clearTimeout(timeoutId!); controller.abort(); }
      : undefined;
    const controller = new AbortController();
    try {
      timeoutId = setTimeout(
        () => controller.abort(),
        init.timeoutMs ?? 10_000
      );
      // Honor external abort signal (e.g. emergency stop)
      if (init.externalSignal && onExternalAbort) {
        if (init.externalSignal.aborted) {
          clearTimeout(timeoutId);
          controller.abort();
        } else {
          init.externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        }
      }
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        mcRecordSuccess();
        return res;
      }
      if (res.status >= 500 && res.status < 600 && attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      // Only trip circuit breaker on server errors, not 4xx (caller bugs)
      if (res.status >= 500) mcRecordFailure();
      return res;
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      lastErr = err;
      const kind = classifyFailure(err);
      if (kind === 'timeout') {
        // AbortError = system busy / timeout — do NOT retry or trip breaker
        throw err;
      }
      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      // AbortError = system busy / timeout — already thrown above; record failure for other kinds
      mcRecordFailure();
      throw err;
    } finally {
      // Remove external abort listener to prevent accumulation over executor lifetime
      if (init.externalSignal && onExternalAbort) {
        init.externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }
  mcRecordFailure();
  throw lastErr || new Error('Unknown mcFetch error');
}

export async function mcPostJson<T = any>(
  path: string,
  body: any,
  timeoutMs?: number,
  externalSignal?: AbortSignal,
): Promise<{ ok: boolean; data?: T; error?: string; raw?: Response }> {
  try {
    const res = await mcFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs,
      externalSignal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text}`, raw: res };
    }
    const json = (await res.json()) as T;
    return { ok: true, data: json, raw: res };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export async function waitForBotConnection(
  timeoutMs: number
): Promise<boolean> {
  const start = Date.now();
  const poll = async (): Promise<boolean> => {
    const ok = await checkBotConnection();
    if (ok) return true;
    if (Date.now() - start >= timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 500));
    return poll();
  };
  return poll();
}

export async function checkBotConnection(): Promise<boolean> {
  const detailed = await checkBotConnectionDetailed();
  return detailed.ok;
}

const HEALTH_CHECK_RETRY_DELAY_MS = 800;

export async function checkBotConnectionDetailed(): Promise<{
  ok: boolean;
  failureKind?: FailureKind;
}> {
  const attempt = async (): Promise<{
    ok: boolean;
    failureKind?: FailureKind;
  }> => {
    if (mcCircuitOpen()) return { ok: false, failureKind: 'unknown' };
    const response = await mcFetch('/health', {
      method: 'GET',
      timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
    });
    if (response.ok) {
      const status = (await response.json()) as {
        // Newer /health shape
        status?: string;
        botStatus?: { connected?: boolean };
        // Legacy /health shape still used by some callers
        executionStatus?: { bot?: { connected?: boolean } };
      };
      const connected =
        status.status === 'connected' ||
        status.botStatus?.connected === true ||
        status.executionStatus?.bot?.connected === true;
      return { ok: connected };
    }
    return {
      ok: false,
      failureKind: classifyFailure(undefined, response.status),
    };
  };

  try {
    return await attempt();
  } catch (error) {
    const failureKind = classifyFailure(error);
    if (failureKind === 'timeout') {
      await new Promise((r) => setTimeout(r, HEALTH_CHECK_RETRY_DELAY_MS));
      try {
        return await attempt();
      } catch (retryError) {
        const retryKind = classifyFailure(retryError);
        console.warn('Bot connection check failed after retry:', {
          error: retryError,
          failureKind: retryKind,
        });
        return { ok: false, failureKind: retryKind };
      }
    }
    console.warn('Bot connection check failed:', {
      error,
      failureKind,
    });
    return { ok: false, failureKind };
  }
}

export async function getBotPosition(): Promise<{
  x: number;
  y: number;
  z: number;
} | null> {
  try {
    if (mcCircuitOpen()) return null;
    const res = await mcFetch('/health', { method: 'GET', timeoutMs: 2000 });
    if (!res.ok) return null;
    const status = (await res.json()) as any;
    const p =
      status?.botStatus?.position || status?.executionStatus?.bot?.position;
    if (
      p &&
      typeof p.x === 'number' &&
      typeof p.y === 'number' &&
      typeof p.z === 'number'
    ) {
      return { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
    }
  } catch (e) {
    console.warn('getBotPosition failed:', e);
  }
  return null;
}

export interface TaskExecutionResult {
  success: boolean;
  error?: string;
  taskId?: string;
  completedSteps?: number;
}

export interface TaskVerification {
  verified: boolean;
  error?: string;
  actualResult?: any;
}

/**
 * Verify that a task was actually accomplished based on its requirements.
 *
 * Uses structured requirement metadata (requirement.item, requirement.quantity)
 * rather than parsing task titles. Falls back to requirement.outputPattern
 * when structured fields are absent.
 */
async function verifyTaskCompletion(
  task: any,
  result: any
): Promise<TaskVerification> {
  try {
    if (!task.metadata?.requirement) {
      return { verified: true };
    }

    const requirement = task.metadata.requirement;

    // Prefer structured requirement fields over task-type routing
    const expectedItem: string | undefined =
      requirement.item ?? requirement.outputPattern;
    const expectedQty: number = requirement.quantity ?? 1;

    if (!expectedItem) {
      // No structured expectation — trust step-level verification
      return { verified: true };
    }

    // Fetch inventory once for all verification
    const response = await resilientFetch(`${MC_ENDPOINT}/inventory`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeoutMs: 5000,
      label: 'mc/inventory',
    });

    if (!response?.ok) {
      return {
        verified: false,
        error: 'Failed to fetch inventory for task verification',
      };
    }

    const data = (await response.json()) as any;
    const inventory: any[] = data.data || [];

    const target = expectedItem.toLowerCase();
    const matchingItems = inventory.filter((it: any) => {
      const name = (it.type ?? it.name ?? '').toString().toLowerCase();
      return name.includes(target);
    });
    const totalQty = matchingItems.reduce(
      (sum: number, it: any) => sum + (it.count || 1),
      0
    );

    if (totalQty < expectedQty) {
      return {
        verified: false,
        error: `Task requires ${expectedQty}x ${expectedItem} but found ${totalQty}`,
        actualResult: { required: expectedQty, found: totalQty },
      };
    }

    return { verified: true };
  } catch (error) {
    return {
      verified: false,
      error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      actualResult: result,
    };
  }
}

/**
 * @deprecated The /execute-scenario endpoint is retired (returns 410 Gone).
 * Planning execution flows through the planning service (port 3002).
 * Kept as a stub so existing imports don't break during transition.
 */
export async function executeTask(_task: any): Promise<TaskExecutionResult> {
  return {
    success: false,
    error: 'executeTask is retired — /execute-scenario endpoint no longer exists. Use the planning service executor.',
  };
}

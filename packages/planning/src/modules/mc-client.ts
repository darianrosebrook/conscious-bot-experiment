// Centralized Minecraft endpoint and resilient HTTP utilities

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
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  if (mcCircuitOpen()) {
    throw new Error('Minecraft endpoint circuit open');
  }
  const url = `${MC_ENDPOINT}${path.startsWith('/') ? '' : '/'}${path}`;
  const retries = 2;
  const baseDelay = 300;
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        init.timeoutMs ?? 10_000
      );
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        mcRecordSuccess();
        return res;
      }
      if (res.status >= 500 && res.status < 600 && attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      mcRecordFailure();
      return res;
    } catch (err: any) {
      lastErr = err;
      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      mcRecordFailure();
      throw err;
    }
  }
  mcRecordFailure();
  throw lastErr || new Error('Unknown mcFetch error');
}

export async function mcPostJson<T = any>(
  path: string,
  body: any,
  timeoutMs?: number
): Promise<{ ok: boolean; data?: T; error?: string; raw?: Response }> {
  try {
    const res = await mcFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs,
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
  try {
    if (mcCircuitOpen()) return false;
    const response = await mcFetch('/health', {
      method: 'GET',
      timeoutMs: 2000,
    });
    if (response.ok) {
      const status = (await response.json()) as {
        status?: string;
        botStatus?: { connected?: boolean };
      };
      return (
        status.status === 'connected' || status.botStatus?.connected === true
      );
    }
    return false;
  } catch (error) {
    console.warn('Bot connection check failed:', error);
    return false;
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

export async function executeTask(task: any): Promise<TaskExecutionResult> {
  try {
    if (mcCircuitOpen()) {
      return { success: false, error: 'Bot circuit is open' };
    }

    const response = await mcFetch('/execute-scenario', {
      method: 'POST',
      timeoutMs: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: task.title || 'Autonomous Task',
        signals: [
          {
            type: 'task_execution',
            value: 80,
            urgency: 'high',
            taskId: task.id,
            taskType: task.type,
          },
        ],
        timeout: 60000, // 1 minute timeout
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = (await response.json()) as any;
    return {
      success: result.success || false,
      error: result.error,
      taskId: task.id,
      completedSteps: result.executedSteps || 0,
    };
  } catch (error) {
    console.error('Task execution failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

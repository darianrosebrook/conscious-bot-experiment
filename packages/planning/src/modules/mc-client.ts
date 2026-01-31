// Centralized Minecraft endpoint and resilient HTTP utilities

import {
  classifyFailure,
  HEALTH_CHECK_TIMEOUT_MS,
  FailureKind,
} from './timeout-policy';

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
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(
        () => controller.abort(),
        init.timeoutMs ?? 10_000
      );
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
        status?: string;
        botStatus?: { connected?: boolean };
      };
      const connected =
        status.status === 'connected' || status.botStatus?.connected === true;
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
      await new Promise((r) =>
        setTimeout(r, HEALTH_CHECK_RETRY_DELAY_MS)
      );
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
 * Verify that a task was actually accomplished based on its requirements
 */
async function verifyTaskCompletion(
  task: any,
  result: any
): Promise<TaskVerification> {
  try {
    // If task has no requirements, consider it verified
    if (!task.metadata?.requirement) {
      return { verified: true };
    }

    const requirement = task.metadata.requirement;

    // Verify based on task type
    switch (task.type) {
      case 'crafting':
        return await verifyCraftingTask(task, requirement);
      case 'gathering':
        return await verifyGatheringTask(task, requirement);
      case 'exploration':
        return await verifyExplorationTask(task, requirement);
      default:
        return { verified: true }; // Other task types don't need verification yet
    }
  } catch (error) {
    return {
      verified: false,
      error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      actualResult: result,
    };
  }
}

/**
 * Verify crafting task completion by checking inventory
 */
async function verifyCraftingTask(
  task: any,
  requirement: any
): Promise<TaskVerification> {
  try {
    const response = await fetch('http://localhost:3005/inventory', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        verified: false,
        error: 'Failed to fetch inventory for verification',
      };
    }

    const data = (await response.json()) as any;
    const inventory = data.data || [];

    // Extract expected item from task title/description
    const taskText = `${task.title} ${task.description}`.toLowerCase();
    let expectedItem = '';

    if (taskText.includes('pickaxe')) {
      if (taskText.includes('wooden')) expectedItem = 'wooden_pickaxe';
      else if (taskText.includes('stone')) expectedItem = 'stone_pickaxe';
      else if (taskText.includes('iron')) expectedItem = 'iron_pickaxe';
      else if (taskText.includes('diamond')) expectedItem = 'diamond_pickaxe';
      else if (taskText.includes('gold')) expectedItem = 'golden_pickaxe';
      else expectedItem = 'pickaxe';
    } else if (taskText.includes('crafting table')) {
      expectedItem = 'crafting_table';
    } else if (taskText.includes('axe')) {
      if (taskText.includes('wooden')) expectedItem = 'wooden_axe';
      else if (taskText.includes('stone')) expectedItem = 'stone_axe';
      else expectedItem = 'axe';
    } else if (taskText.includes('shovel')) {
      if (taskText.includes('wooden')) expectedItem = 'wooden_shovel';
      else if (taskText.includes('stone')) expectedItem = 'stone_shovel';
      else expectedItem = 'shovel';
    } else if (taskText.includes('sword')) {
      if (taskText.includes('wooden')) expectedItem = 'wooden_sword';
      else if (taskText.includes('stone')) expectedItem = 'stone_sword';
      else expectedItem = 'sword';
    }

    // Check if the expected item is in inventory
    const hasItem = inventory.some((item: any) =>
      item.type?.toLowerCase().includes(expectedItem.replace('_', ''))
    );

    if (!hasItem) {
      return {
        verified: false,
        error: `Crafting task completed but item not found in inventory: ${expectedItem}`,
        actualResult: inventory,
      };
    }

    return { verified: true };
  } catch (error) {
    return {
      verified: false,
      error: `Crafting verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify gathering task completion by checking inventory
 */
async function verifyGatheringTask(
  task: any,
  requirement: any
): Promise<TaskVerification> {
  try {
    const response = await fetch('http://localhost:3005/inventory', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        verified: false,
        error: 'Failed to fetch inventory for verification',
      };
    }

    const data = (await response.json()) as any;
    const inventory = data.data || [];

    // Extract expected item from task title/description
    const taskText = `${task.title} ${task.description}`.toLowerCase();
    let expectedItem = 'wood'; // Default

    if (taskText.includes('wood') || taskText.includes('log')) {
      expectedItem = 'log';
    } else if (taskText.includes('stone') || taskText.includes('cobblestone')) {
      expectedItem = 'cobblestone';
    } else if (taskText.includes('iron') || taskText.includes('ore')) {
      expectedItem = 'iron_ore';
    } else if (taskText.includes('coal')) {
      expectedItem = 'coal';
    }

    // Check if the expected items are in inventory
    const matchingItems = inventory.filter((item: any) =>
      item.type?.toLowerCase().includes(expectedItem)
    );
    const totalQuantity = matchingItems.reduce(
      (sum: number, item: any) => sum + (item.count || 1),
      0
    );

    const requiredQuantity = requirement.quantity || 1;
    if (totalQuantity < requiredQuantity) {
      return {
        verified: false,
        error: `Gathering task completed but insufficient items: ${requiredQuantity} ${expectedItem} needed, ${totalQuantity} found`,
        actualResult: {
          required: requiredQuantity,
          found: totalQuantity,
          items: matchingItems,
        },
      };
    }

    return { verified: true };
  } catch (error) {
    return {
      verified: false,
      error: `Gathering verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify exploration task completion
 */
async function verifyExplorationTask(
  task: any,
  requirement: any
): Promise<TaskVerification> {
  // Exploration tasks are harder to verify automatically
  // For now, we'll consider them verified if they completed without errors
  return { verified: true };
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
        scenario: task.title || 'Autonomous Task',
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

    // Before declaring success, verify the task was actually accomplished
    const verification = await verifyTaskCompletion(task, result);
    if (!verification.verified) {
      return {
        success: false,
        error: verification.error || 'Task verification failed',
        taskId: task.id,
        completedSteps: result.executedSteps || 0,
      };
    }

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

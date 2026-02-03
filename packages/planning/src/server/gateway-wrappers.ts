/**
 * Typed gateway wrappers for context alignment.
 *
 * These wrappers enforce that taskId is always provided when executing
 * actions from the executor or reactive paths. This prevents context drift
 * where a caller forgets to include taskId in the context.
 *
 * Benefits over raw executeViaGateway:
 * 1. Compile-time enforcement of required context
 * 2. Clearer call sites (no inline object construction)
 * 3. Easier to grep for execution patterns
 * 4. Drift guards can verify these are used instead of raw calls
 */

import {
  executeViaGateway,
  type GatewayAction,
  type GatewayResponse,
} from './execution-gateway';

/**
 * Execute action from the autonomous executor.
 * Enforces that taskId is always provided for correlation and lease scoping.
 *
 * @param taskId - The task ID (required for audit and lease correlation)
 * @param action - The Minecraft action to execute
 * @param signal - Optional abort signal
 */
export async function executeTaskViaGateway(
  taskId: string,
  action: GatewayAction,
  signal?: AbortSignal
): Promise<GatewayResponse> {
  return executeViaGateway(
    {
      origin: 'executor',
      priority: 'normal',
      action,
      context: { taskId },
    },
    signal
  );
}

/**
 * Execute action from the reactive executor.
 * Enforces that taskId is always provided for correlation and lease scoping.
 *
 * @param taskId - The task ID (required for audit and lease correlation)
 * @param action - The Minecraft action to execute
 * @param signal - Optional abort signal
 */
export async function executeReactiveViaGateway(
  taskId: string,
  action: GatewayAction,
  signal?: AbortSignal
): Promise<GatewayResponse> {
  return executeViaGateway(
    {
      origin: 'reactive',
      priority: 'normal',
      action,
      context: { taskId },
    },
    signal
  );
}

/**
 * Execute action from safety monitor (emergency preemption).
 * No task context required — safety is not task-scoped.
 *
 * Safety actions bypass normal task correlation because they represent
 * emergency interventions that may interrupt or preempt any task.
 *
 * @param action - The Minecraft action to execute
 * @param signal - Optional abort signal
 */
export async function executeSafetyViaGateway(
  action: GatewayAction,
  signal?: AbortSignal
): Promise<GatewayResponse> {
  return executeViaGateway(
    {
      origin: 'safety',
      priority: 'high',
      action,
    },
    signal
  );
}

/**
 * Execute action from cognition-triggered path.
 * taskId is optional for cognition since some thoughts may not be task-bound.
 *
 * @param action - The Minecraft action to execute
 * @param taskId - Optional task ID for correlation
 * @param signal - Optional abort signal
 */
export async function executeCognitionViaGateway(
  action: GatewayAction,
  taskId?: string,
  signal?: AbortSignal
): Promise<GatewayResponse> {
  return executeViaGateway(
    {
      origin: 'cognition',
      priority: 'normal',
      action,
      context: taskId ? { taskId } : undefined,
    },
    signal
  );
}
